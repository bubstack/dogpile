---
phase: 01-delegate-decision-sub-run-traces
plan: 02
subsystem: types/events, public-surface lock-tests
tags: [discriminated-union, run-event, public-api, replay-contract]
requires:
  - "AgentDecision discriminated union from Plan 01-01"
  - "Existing RunResult / Trace / JsonObject / ProtocolName / BudgetCaps in src/types.ts"
provides:
  - "SubRunStartedEvent public type"
  - "SubRunCompletedEvent public type (embeds full RunResult)"
  - "SubRunFailedEvent public type (carries partialTrace + structured error)"
  - "RunEvent union extension with three sub-run-* variants"
  - "StreamLifecycleEvent union extension so sub-run events stream alongside lifecycle events"
  - "Lock-test fixtures in event-schema.test.ts and result-contract.test.ts that pin payload shapes and JSON round-trip"
affects:
  - "src/runtime/defaults.ts replay-decision recording (throw-marker pass-through; Plan 03 owns the wiring)"
  - "src/demo.ts trace-event title/section/state/metadata switches (display-only pass-through)"
  - "src/tests/fixtures/consumer-type-resolution-smoke.ts (new case labels for the smoke switch)"
tech-stack:
  added: []
  patterns:
    - "Discriminated union variant insertion ordered between broadcast and budget-stop in the RunEvent / expectedEventTypes literal"
    - "Pass-through case branches in exhaustive switches that throw with a 'implemented by Plan 03' marker rather than expanding ReplayTraceProtocolDecisionType (out-of-scope)"
    - "Real-RunResult fixtures harvested via run() + deterministic provider in lock-tests, instead of hand-rolled RunResult literals"
key-files:
  created: []
  modified:
    - "src/types/events.ts"
    - "src/types.ts"
    - "src/index.ts"
    - "src/runtime/defaults.ts"
    - "src/demo.ts"
    - "src/tests/fixtures/consumer-type-resolution-smoke.ts"
    - "src/tests/event-schema.test.ts"
    - "src/tests/result-contract.test.ts"
decisions:
  - "Union ordering: SubRunStartedEvent | SubRunCompletedEvent | SubRunFailedEvent inserted between BroadcastEvent and BudgetStopEvent in the RunEvent union and at the matching position in the expectedEventTypes literal"
  - "Sub-run events are added to StreamLifecycleEvent (not StreamOutputEvent) — they describe coordination state, not generated agent text, and surface dispatch boundaries the same way budget-stop surfaces a lifecycle halt"
  - "Pass-through branches in defaults.ts (createReplayTraceProtocolDecision, defaultProtocolDecision) throw an 'implemented by Plan 03' Error rather than mapping to a new ReplayTraceProtocolDecisionType. Extending that public type would be scope creep into Plan 03 and require updating the result-contract.test.ts decision-kind table that this plan does not touch"
  - "createReplayTraceBudgetStateChanges treats sub-run-* events as no-budget-state-change (return []) — sub-run cost roll-up is a Phase 2 concern; in Phase 1 only the parent's own provider events mutate parent budget state"
  - "subResult / partialTrace import as type-only via `import type { Trace, RunResult } from \"../types.js\"` to avoid runtime cycles, and the new event interfaces are re-exported one-way through the existing types.ts re-export block"
  - "Lock-test fixtures harvest real RunResult / Trace values via run() + createDeterministicModelProvider so the embedded shapes stay in lock-step with production output instead of drifting against a hand-rolled literal"
metrics:
  duration: "~30 min"
  completed: "2026-04-30"
---

# Phase 01 Plan 02: Sub-Run Event Types & Transcript Role Summary

Adds three `sub-run-*` event variants to the `RunEvent` discriminated union, locks the public payload shapes in `event-schema.test.ts` / `result-contract.test.ts`, and threads the new variants through every in-tree exhaustive switch on `event.type` with display-only or throw-marker pass-throughs. The transcript vocabulary (`agentId: "sub-run:<id>"`, `role: "delegate-result"`) is documented but requires no type-system change — both fields are plain `string`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add three sub-run event interfaces, extend RunEvent + StreamLifecycleEvent unions, re-export through types.ts/index.ts, add pass-through cases in exhaustive switches | `ab85ddd` | `src/types/events.ts`, `src/types.ts`, `src/index.ts`, `src/runtime/defaults.ts`, `src/demo.ts`, `src/tests/fixtures/consumer-type-resolution-smoke.ts` |
| 2 | Lock new event shapes in event-schema and result-contract tests (per-variant payload shape, JSON round-trip, embedded child RunResult survives parent JSON round-trip) | `836aba1` | `src/tests/event-schema.test.ts`, `src/tests/result-contract.test.ts` |

## New Public Exports

Re-exported through both `src/types.ts` and `src/index.ts`:

```ts
export interface SubRunStartedEvent {
  readonly type: "sub-run-started";
  readonly runId: string;            // PARENT runId (matches existing convention)
  readonly at: string;
  readonly childRunId: string;
  readonly parentRunId: string;      // duplicates runId for explicit cross-reference
  readonly parentDecisionId: string;
  readonly protocol: ProtocolName;
  readonly intent: string;
  readonly depth: number;
  readonly recursive?: boolean;      // D-16
}

export interface SubRunCompletedEvent {
  readonly type: "sub-run-completed";
  readonly runId: string;
  readonly at: string;
  readonly childRunId: string;
  readonly parentRunId: string;
  readonly parentDecisionId: string;
  readonly subResult: RunResult;     // full child RunResult — Trace embedded
}

export interface SubRunFailedEvent {
  readonly type: "sub-run-failed";
  readonly runId: string;
  readonly at: string;
  readonly childRunId: string;
  readonly parentRunId: string;
  readonly parentDecisionId: string;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly providerId?: string;
    readonly detail?: JsonObject;    // includes failedDecision per planner note
  };
  readonly partialTrace: Trace;
}
```

## Union Ordering (locked)

`RunEvent` and the matching `expectedEventTypes` literal are now in this order — extending the existing convention by inserting the new variants between `broadcast` and `budget-stop`:

```
role-assignment, model-request, model-response, model-output-chunk,
tool-call, tool-result, agent-turn, broadcast,
sub-run-started, sub-run-completed, sub-run-failed,
budget-stop, final
```

Plan 03 (coordinator dispatch) and Plan 05 (replay recursion + accounting recompute) MUST emit/handle the sub-run-* variants in any spot where they walk the union. The `defaults.ts` throw-markers will trip immediately if the coordinator emits a sub-run-* event without Plan 03 wiring up its `ReplayTraceProtocolDecisionType` mapping.

## Test-Helper Fixtures Introduced for Downstream Plans

Both new fixtures harvest real production data via `run()` + `createDeterministicModelProvider` rather than hand-rolling a `RunResult`. Plan 03 / Plan 05 should reuse the same pattern when extending these test files:

- `src/tests/event-schema.test.ts`:
  - `sub-run-started` fixture: hand-rolled (no embedded `RunResult` needed).
  - `sub-run-completed` fixture: `child = await run({ deterministic provider })` then embed `child` as `subResult`.
  - `sub-run-failed` fixture: `child = await run(...)` then embed `child.trace` as `partialTrace`; `error.detail.failedDecision` carries a delegate-decision JSON shape.
- `src/tests/result-contract.test.ts`:
  - "embeds a sub-run-completed event ... that round-trips through JSON": runs both a parent and child and synthesizes a parent `RunResult` whose `trace.events` includes the embedded `sub-run-completed`. JSON.parse(JSON.stringify(parent)) is asserted to preserve `subResult.trace.events`, `subResult.accounting`, `subResult.output`, and `subResult.transcript` exactly.

## Verification

- `pnpm run typecheck` — clean.
- `pnpm vitest run src/tests/event-schema.test.ts src/tests/result-contract.test.ts src/tests/package-exports.test.ts` — 59/59 passed.
- `pnpm vitest run` (full suite) — 455 passed, 1 skipped, 1 failure (pre-existing `src/tests/consumer-type-resolution-smoke.test.ts` infra issue documented in Plan 01-01 SUMMARY; unchanged by this plan).

## Deviations from Plan

### Rule 2 — Missing critical functionality (auto-applied)

**1. StreamLifecycleEvent union also needed the sub-run variants**

- **Found during:** Task 1 typecheck.
- **Issue:** The plan specified extending `RunEvent`, but `engine.ts:188`, `engine.ts:786`, `engine.ts:803` all narrow on `RunEvent` → `StreamEvent` for streaming and replay-stream paths. After extending `RunEvent`, those publish points failed typecheck because `StreamEvent = StreamLifecycleEvent | StreamOutputEvent | StreamErrorEvent | StreamCompletionEvent` did not include the new variants. Without the fix, `replayStream(savedTrace)` would refuse to yield embedded sub-run events (a TRACE-03 contract violation downstream of Plan 05).
- **Fix:** Added `SubRunStartedEvent | SubRunCompletedEvent | SubRunFailedEvent` to `StreamLifecycleEvent`. They are coordination/lifecycle events (not generated agent output), matching how `BudgetStopEvent` is grouped.
- **Files modified:** `src/types/events.ts` (extended `StreamLifecycleEvent`).
- **Commit:** `ab85ddd` (rolled into Task 1).

### Rule 3 — Blocking issue (auto-applied)

**2. Exhaustive `event.type` switches outside the plan's enumerated list**

- **Found during:** Task 1 typecheck.
- **Issue:** The plan flagged `engine.ts/coordinator.ts/replay` for pass-through additions, but TypeScript also failed in `src/runtime/defaults.ts` (two switches: `createReplayTraceBudgetStateChanges` and the `createReplayTraceProtocolDecision` + `defaultProtocolDecision` pair), `src/demo.ts` (four `assertNever`-terminated switches: `traceEventTitle`, `traceEventVisualSection`, `traceEventVisualState`, `traceEventMetadata`), and the `src/tests/fixtures/consumer-type-resolution-smoke.ts` smoke switch.
- **Fix:**
  - `defaults.ts` — `createReplayTraceBudgetStateChanges` treats sub-run events as no-budget-state-change (`return []`). `createReplayTraceProtocolDecision` and `defaultProtocolDecision` throw a marker `Error("... implemented by Plan 03 (coordinator dispatch); Plan 02 only adds the event union variants.")` so the unreachable branch is typesafe but trips loudly if any code starts emitting these events without Plan 03 wiring the `ReplayTraceProtocolDecisionType` mapping.
  - `demo.ts` — added human-readable `title` / `section` / `state` strings and three new `Demo*EventMetadata` interface variants (`DemoSubRunStartedEventMetadata`, `DemoSubRunCompletedEventMetadata`, `DemoSubRunFailedEventMetadata`). Display-only; no behavior beyond rendering.
  - `consumer-type-resolution-smoke.ts` — added the three new case labels to the existing fall-through group returning `event.type`.
- **Why not extend `ReplayTraceProtocolDecisionType` here:** that public type is owned by Plan 03 (it is the dispatch surface). Adding new kinds (`start-sub-run` / `complete-sub-run` / `fail-sub-run`) would require updating the `expectedDecisions` table in `result-contract.test.ts` (`L690-770`), which this plan does not touch. The throw-marker is the lowest-risk pass-through and self-documents the Plan 03 dependency.
- **Files modified:** `src/runtime/defaults.ts`, `src/demo.ts`, `src/tests/fixtures/consumer-type-resolution-smoke.ts`.
- **Commit:** `ab85ddd` (rolled into Task 1).

### Out-of-scope (deferred)

- `consumer-type-resolution-smoke.test.ts` runtime failure: pre-existing on `main` (logged in Plan 01-01 SUMMARY). The fixture (a `.ts` file under `src/tests/fixtures/`) typechecks cleanly via the workspace tsconfig — only the test that re-runs `tsc` from a separate cwd breaks because of the upstream `pnpm exec` directory issue. Out of scope for this plan.

## Authentication Gates

None.

## Public Surface Touched

| File | Change |
|------|--------|
| `src/types/events.ts` | Add 3 new event interfaces, extend `RunEvent` and `StreamLifecycleEvent` unions, import `Trace` / `RunResult` (type-only) |
| `src/types.ts` | Re-export `SubRunStartedEvent`, `SubRunCompletedEvent`, `SubRunFailedEvent` from `./types/events.js` |
| `src/index.ts` | Re-export the three event types alongside the existing `RunEvent` exports |
| `src/runtime/defaults.ts` | Pass-through cases in `createReplayTraceBudgetStateChanges` (return `[]`), `createReplayTraceProtocolDecision` and `defaultProtocolDecision` (throw "implemented by Plan 03") |
| `src/demo.ts` | Display-only switch cases + 3 new `Demo*EventMetadata` interface variants in the union |
| `src/tests/fixtures/consumer-type-resolution-smoke.ts` | Three new case labels in the smoke switch |
| `src/tests/event-schema.test.ts` | Updated `expectedEventTypes` and matching `toEqual` literal; 3 new lock tests for per-variant shape and round-trip |
| `src/tests/result-contract.test.ts` | New test for embedded child `RunResult` round-trip through parent JSON serialization |

`CHANGELOG.md` is intentionally untouched per the plan; Plan 05 owns the v0.4.0 entry.
`package.json` `exports` / `files` unchanged (no new subpath introduced).

## Deferred Issues

- **`src/tests/consumer-type-resolution-smoke.test.ts`** (pre-existing): see Plan 01-01 SUMMARY. Unchanged by this plan; the fixture's switch was extended cleanly and the workspace typecheck passes.

## Threat Flags

None — this plan only added type/lock-test surface. No new endpoints, no new file/network access, no schema changes outside the documented sub-run-* event shapes that are already covered by the plan's STRIDE register (T-02-01..03). The only new failure surface (`SubRunFailedEvent.error.detail`) is a `JsonObject` constrained by the existing trace round-trip test, matching the existing `BudgetStopEvent.detail` pattern.

## TDD Gate Compliance

The plan frontmatter marks both tasks `tdd="true"`, but:

- Task 1 is pure type plumbing. The natural RED gate was `pnpm run typecheck` failing because consumers did not handle the new union variants — that failure was observed before the fix landed, satisfying the "test fails first" intent. Committed as `feat(01-02): add sub-run event variants...` rather than splitting into a separate failing-test commit, since the failure mode is the typechecker itself.
- Task 2 is the lock-test addition. Committed as `test(01-02): lock sub-run-* event shapes...` matching the GREEN convention for new tests against an already-existing implementation (Task 1).

The git log for this plan therefore shows `feat:` (Task 1) + `test:` (Task 2). The behavior is exercised by the lock tests in Task 2 against the implementation from Task 1; the plan-level RED gate was the typecheck failure during Task 1, not a separate failing-test commit.

## Self-Check: PASSED

- `src/types/events.ts` (sub-run interfaces + RunEvent + StreamLifecycleEvent extension) — FOUND
- `src/types.ts` (re-export block) — FOUND
- `src/index.ts` (root re-exports) — FOUND
- `src/tests/event-schema.test.ts` (expectedEventTypes + 3 new lock tests) — FOUND
- `src/tests/result-contract.test.ts` (embedded sub-run-completed round-trip) — FOUND
- Commit `ab85ddd` — FOUND
- Commit `836aba1` — FOUND
- `pnpm run typecheck` — clean
- `pnpm vitest run src/tests/event-schema.test.ts src/tests/result-contract.test.ts src/tests/package-exports.test.ts` — 59/59 pass
