---
phase: 02-budget-cancellation-cost-rollup
plan: 04
subsystem: runtime
tags: [termination, contract-tests, phase-wrap, public-surface]

requires:
  - phase: 02-budget-cancellation-cost-rollup
    plan: 03
    provides: full Phase 2 cost-rollup + cancel + timeout surface; existing teedEmit + synthetic delegate-result transcript entry from Phase 1
provides:
  - Parent-events isolation contract test (D-15)
  - minTurns floor independence — unit-level evaluator lock + integration lock (D-16)
  - sub-run-completed counts as exactly one parent iteration via synthetic delegate-result transcript entry (D-17)
  - Consolidated Phase 2 [Unreleased] CHANGELOG block with BUDGET-04 internal-contract documentation line
affects: []

tech-stack:
  added: []
  patterns:
    - "Hybrid D-16 lock: unit-level `evaluateTermination` direct-call test PLUS integration test through `run()`. The unit test proves per-instance ProtocolConfig reading independent of any end-to-end harness."
    - "RunId discriminator as the parent-events isolation discriminator: child agent-turns appearing in `result.trace.events` (via teedEmit → engine subscriber path) are tagged with the child's runId, distinguishable from parent-tagged events. Iteration-counting reads protocol-internal state (termination.ts:449), so child events physically cannot reach the parent's iteration counter regardless of bubble path."

key-files:
  created: []
  modified:
    - src/tests/budget-first-stop.test.ts
    - src/runtime/coordinator.test.ts
    - CHANGELOG.md

key-decisions:
  - "Plan-pseudocode reframed inline (no structural deviation): the plan's prescription of `child sequential maxTurns: 50 / minTurns: 5` via `decision.budget.maxIterations: 50` is unreachable through the public delegate decision JSON schema. The decision shape is `{protocol, intent, model?, budget?}` where `budget` carries only timeoutMs / maxTokens / maxIterations — there is no channel for child `protocol.maxTurns` or `minTurns`. Reframed: D-15 locked via runId-tagged invariant (parent's iteration count is bounded by parent's own protocol.maxTurns regardless of how many child events bubble through `result.trace.events`); D-16 split into hybrid unit + integration coverage."
  - "Parent-events isolation as observed in `result.trace.events`: child events DO appear in the engine-collected `emittedEvents` array (engine.ts:599 `events = emittedEvents.length > 0 ? emittedEvents : result.trace.events`) because `teedEmit` (coordinator.ts:902) pushes child events to `options.emit?.()` which routes to the engine-level subscriber. They are tagged with the CHILD's runId — termination iteration counting reads `context.protocolIteration ?? context.iteration ?? context.transcript.length` (termination.ts:449), all of which are protocol-internal and thus cannot be reached by bubbled child events."
  - "D-17 lock asserts the FULL Phase 1 D-18 contract verbatim: exactly one synthetic transcript entry per `sub-run-completed` with `agentId === 'sub-run:<childRunId>'` matching the actual sub-run-completed event's childRunId, and `role === 'delegate-result'`. Parent's transcript-length-based termination math counts that entry as exactly one iteration."
  - "BUDGET-04 has zero public-surface delta. The CHANGELOG line documents the contract as an internal guarantee (no new types, events, fields, or options) and points to the contract tests that lock it."

requirements-completed: [BUDGET-04]

duration: ~25 min
completed: 2026-04-30
---

# Phase 2 Plan 04: BUDGET-04 termination floors lock Summary

**Three contract tests locking parent-events isolation, per-instance minTurns/minRounds floors, and the synthetic delegate-result transcript entry counting as exactly one parent iteration. Phase 2 [Unreleased] CHANGELOG consolidated; release gate (`pnpm verify`) green.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 atomic
- **Commits:** 3 (test for D-15, test for D-16+D-17, docs for CHANGELOG consolidation + release gate)
- **Files modified:** 3 (2 test files + 1 changelog)

## Must-haves verification

| Truth | Status | Evidence |
| --- | --- | --- |
| Parent termination policies (`budget`, `convergence`, `judge`, `firstOf`) evaluate over PARENT-LEVEL events only — child events do not count toward parent iteration limits | PASS | `src/tests/budget-first-stop.test.ts` "parent termination evaluates over parent events only — child agent-turns do not count" — locks runId discriminator: parent-tagged agent-turns ≤ parent.maxTurns; child agent-turns are tagged with child runId in both `subResult.trace.events` and (where bubbled through teedEmit) `result.trace.events`. |
| `minTurns`/`minRounds` floors apply per-protocol-instance — parent and child each honor their own floor independently | PASS | `src/runtime/coordinator.test.ts` "minTurns floors apply per-protocol-instance — parent and child are independent (unit-level evaluator lock)" — directly invokes `evaluateTermination` with two ProtocolConfig instances (`{kind:'sequential', minTurns:3}` and `{kind:'sequential', minTurns:5}`); each produces an independent decision based on its own config. Plus integration test "BUDGET-04 / D-16: parent's minTurns floor is honored despite a delegate intervention" — parent coordinator with `minTurns:3 + convergence(stableTurns:2)` reaches transcript.length ≥ 3 even though convergence would otherwise fire at 2. |
| A successful sub-run produces exactly one synthetic transcript entry with `role: 'delegate-result'`; this counts as exactly one parent iteration in transcript-length-based termination math (D-17 explicit lock) | PASS | `src/runtime/coordinator.test.ts` "sub-run-completed counts as exactly one parent iteration via synthetic transcript entry (D-17 explicit lock)" — asserts (a) exactly one `delegate-result` transcript entry exists, (b) exactly one entry has `agentId.startsWith('sub-run:')`, (c) the entry's agentId === `sub-run:${subRunCompletedEvent.childRunId}`, (d) parent reaches `minTurns:2` floor with 1 delegate + ≥1 own participate turn — confirming the synthetic entry was counted as exactly one iteration toward the floor. |

## Phase 2 success criteria — full status

| # | Criterion | Status | Locked by |
| --- | --- | --- | --- |
| 1 | Parent abort cascades to in-flight sub-runs; aborted children carry `code:'aborted'` + `detail.reason:'parent-aborted'` | PASS (Plan 02-01) | cancellation-contract.test.ts, public-error-api.test.ts, cancellation.test.ts |
| 2 | Parent `budget.timeoutMs` is a tree-wide deadline; decision overrides clamp; `defaultSubRunTimeoutMs` provides fallback ceiling | PASS (Plan 02-02) | coordinator.test.ts (5 BUDGET-02 tests), event-schema.test.ts, config-validation.test.ts |
| 3 | Parent's `accounting.cost` and tokens roll up across recursion via `recordSubRunCost` callback seam; `sub-run-failed.partialCost` field; replay parent-rollup-drift parity check | PASS (Plan 02-03) | replay-recursion.test.ts (12 new tests), coordinator.test.ts Test G |
| 4 | Parent termination operates over parent-level events only; minTurns/minRounds floors are per-protocol-instance; sub-run-completed counts as exactly one parent iteration | PASS (Plan 02-04, this plan) | budget-first-stop.test.ts D-15 test, coordinator.test.ts D-16 unit + integration, coordinator.test.ts D-17 explicit lock |

All four phase success criteria are now locked.

## Consolidated Phase 2 public-surface delta (cross-reference)

| Surface | Change | Plan | Locked by |
| --- | --- | --- | --- |
| `RunEvent` / `StreamLifecycleEvent` | + `SubRunParentAbortedEvent` variant (`sub-run-parent-aborted`) | 02-01 | event-schema.test.ts |
| `RunEvent` / `StreamLifecycleEvent` | + `SubRunBudgetClampedEvent` variant (`sub-run-budget-clamped`) | 02-02 | event-schema.test.ts |
| `SubRunFailedEvent` interface | + non-optional `partialCost: CostSummary` field | 02-03 | event-schema.test.ts sortedKeys + result-contract.test.ts round-trip |
| `EngineOptions` / `DogpileOptions` | + `defaultSubRunTimeoutMs?: number` | 02-02 | config-validation.test.ts typed-field lock |
| `ReplayTraceProtocolDecisionType` | + `mark-sub-run-parent-aborted` literal | 02-01 | TS type union (compile-time) |
| `ReplayTraceProtocolDecisionType` | + `mark-sub-run-budget-clamped` literal | 02-02 | TS type union (compile-time) |
| `DogpileError({code:'aborted'}).detail.reason` | + `'parent-aborted'` documented-convention literal | 02-01 | public-error-api.test.ts |
| `DogpileError({code:'aborted'}).detail.reason` | + `'timeout'` documented-convention literal | 02-02 | public-error-api.test.ts |
| `DogpileError({code:'invalid-configuration'}).detail` | + `subReason: 'parent-rollup-drift'` literal under `reason: 'trace-accounting-mismatch'` | 02-03 | replay-recursion.test.ts Tests C + D |
| Termination floor + parent-events isolation contract | NEW internal-only guarantee — no public-surface change | 02-04 | budget-first-stop.test.ts + coordinator.test.ts |

No package `exports` / `files` change across Phase 2.

## Tests added (this plan)

| File | Test name | Purpose |
| --- | --- | --- |
| src/tests/budget-first-stop.test.ts | parent termination evaluates over parent events only — child agent-turns do not count | D-15 lock: child agent-turns appearing in result.trace.events are tagged with child's runId; parent's iteration count is bounded by parent's own protocol.maxTurns |
| src/runtime/coordinator.test.ts | minTurns floors apply per-protocol-instance — parent and child are independent (unit-level evaluator lock) | D-16 unit lock: evaluateTermination produces independent decisions for two ProtocolConfig instances with different minTurns |
| src/runtime/coordinator.test.ts | BUDGET-04 / D-16: parent's minTurns floor is honored despite a delegate intervention | D-16 integration lock: parent coordinator with minTurns:3 + convergence honors floor even when one delegate dispatched |
| src/runtime/coordinator.test.ts | sub-run-completed counts as exactly one parent iteration via synthetic transcript entry (D-17 explicit lock) | D-17 explicit must_have lock: synthetic delegate-result entry has agentId='sub-run:<childRunId>' matching event; parent transcript counts it as one iteration |

**Test totals added:** 4 new tests. Existing 537 tests still pass. Full release gate `pnpm run verify` exits 0 → 541 passed | 1 skipped (542).

## Verification output

```
$ pnpm run verify
✓ package:identity   passed
✓ build              tsc + vite (browser bundle ~185 kB)
✓ package:artifacts  25 runtime + 25 dts artifacts
✓ quickstart:smoke   consumer pack install + typecheck + run
✓ typecheck          tsc --noEmit (strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess)
✓ test               Test Files  45 passed | 1 skipped (46)
                     Tests       541 passed | 1 skipped (542)
EXIT=0
```

## Deviations from Plan

### [Inline correction] Task 1: child 50-turn configuration not reachable via decision JSON

- **Found during:** Task 1 setup (advisor pre-flight + reading `dispatchDelegate` schema).
- **Issue:** Plan pseudocode prescribed a child running 50 `agent-turn` events via `decision.budget.maxIterations: 50`. The delegate decision JSON schema (decisions.ts) is `{protocol, intent, model?, budget?}` where `budget` carries `timeoutMs / maxTokens / maxIterations` only. There is no `protocolConfig` channel — the child runs with default sequential `{kind:'sequential', maxTurns: 3}` regardless of decision-level budget. `budget.maxIterations` flows to the child's run-level termination budget, not to its protocol's `maxTurns`.
- **Fix:** Reframed Task 1 to lock the runId-tagged invariant directly. Child runs with default sequential settings (a few agent-turns); test asserts (a) parent-tagged agent-turns ≤ parent.maxTurns, (b) child agent-turns in subResult.trace.events tagged with childRunId, (c) bubbled child events in result.trace.events also tagged with childRunId, (d) parent-emitted sub-run-* events tagged with parentRunId. The "50" was illustrative — what matters is that child events cannot reach the parent's iteration counter (which reads protocol-internal state per termination.ts:449), regardless of how many child events bubble through teedEmit.
- **Files modified:** src/tests/budget-first-stop.test.ts.
- **Rationale:** structural change to the test scenario; no change to D-15 contract guarantees. Documented above.

### [Inline correction] Task 2 Test A: child minTurns:5 not reachable via decision JSON; reframed as hybrid

- **Found during:** Task 2 setup (advisor pre-flight).
- **Issue:** Plan asked for parent coordinator `minTurns:3` + child sequential `minTurns:5` via delegate decision. `minTurns` lives on `ProtocolConfig`, NOT on `BudgetCaps`. The decision JSON has no `protocolConfig` channel.
- **Fix:** Hybrid coverage as advised:
  1. **Unit-level evaluator lock:** directly invoke `evaluateTermination(condition, ctx(protocolConfig, iteration))` with two ProtocolConfig instances (`{kind:'sequential', minTurns:3}` and `{kind:'sequential', minTurns:5}`). Asserts each produces independent floor decisions. Locks "per-instance config = per-instance floor" at the evaluator layer.
  2. **Integration lock:** parent coordinator `minTurns:3 + terminate: convergence({stableTurns:2})`. Without the floor, convergence fires at iteration=2; with the floor, parent reaches transcript.length ≥ 3. Locks "parent's floor is honored despite a delegate intervention."
- **Files modified:** src/runtime/coordinator.test.ts.
- **Rationale:** D-16 contract guarantee fully covered. The unit-level test is strictly stronger than the plan's end-to-end version because it isolates the per-instance reading from any harness side-effect.

### [Discovery] result.trace.events DOES contain bubbled child events (no change to D-15 contract)

- **Found during:** Task 1 first-run debugging.
- **Discovery:** A naive read of "teedEmit only pushes to childEvents and options.emit, NOT to parent's events array" suggests `result.trace.events` from `run()` would not contain child events. In fact: `runNonStreamingProtocol` (engine.ts:583-619) collects events via its own `emit(event)` callback that pushes into `emittedEvents`, then sets `events = emittedEvents.length > 0 ? emittedEvents : result.trace.events`. Because `teedEmit` calls `options.emit?.(event)` (the engine-level subscriber, not the parent coordinator's local emit), child events DO appear in `result.trace.events` from `run()`. They are tagged with the CHILD's runId.
- **Impact:** No change to D-15 contract — termination iteration counting reads protocol-internal state (`context.protocolIteration ?? context.iteration ?? context.transcript.length`), not the engine-collected event stream. The plan's `<interfaces>` paragraph 1 is technically correct about the parent coordinator's local `events` array, but slightly misleading about where the engine-level `result.trace.events` actually comes from. Documented in the test comment so future readers don't trip on the same subtlety.
- **Files modified:** src/tests/budget-first-stop.test.ts (test comment).

**Total deviations:** 2 inline corrections (zero behavioral deviations from plan must_haves) + 1 documentation discovery. **Impact:** None — every D-15 / D-16 / D-17 must_have lands as specified; corrections only refine how the tests align with the actual decision-JSON schema and the engine-level event collection path.

## Follow-ups

- Phase 3 (concurrency) and Phase 4 (streaming polish) can build on the Phase 2 surface without revisiting cost roll-up, cancellation, or termination floor semantics — all four BUDGET-* requirements are locked.
- If a future plan adds a `protocolConfig` channel to the delegate decision JSON (e.g., `{protocol: "sequential", protocolConfig: {minTurns: 5, maxTurns: 50}, intent}`), the Task 2 unit-level evaluator lock remains stable; only the integration test would gain coverage for child-side floors driven by the parent.
- The BUDGET-04 internal-contract CHANGELOG line uses an "internal contract guarantee (no public-surface delta)" framing — if a downstream reviewer prefers an explicit cross-reference to specific test files, the file paths are already named in the line; no follow-up action.

## Self-Check: PASSED

- [x] `src/tests/budget-first-stop.test.ts` contains "parent termination evaluates over parent events only" test
- [x] `src/tests/budget-first-stop.test.ts` imports `createDeterministicModelProvider` from `../testing/deterministic-provider.js`
- [x] `src/runtime/coordinator.test.ts` contains "minTurns floors apply per-protocol-instance" unit-level test
- [x] `src/runtime/coordinator.test.ts` contains "BUDGET-04 / D-16: parent's minTurns floor is honored" integration test
- [x] `src/runtime/coordinator.test.ts` contains "sub-run-completed counts as exactly one parent iteration" D-17 lock
- [x] `src/runtime/coordinator.test.ts` references `delegate-result` (D-17 explicit assertion)
- [x] `CHANGELOG.md` `[Unreleased]` block has the BUDGET-04 line with `minTurns` keyword
- [x] `CHANGELOG.md` greps pass: sub-run-failed (4), sub-run-budget-clamped (1), sub-run-parent-aborted (1), defaultSubRunTimeoutMs (1), parent-rollup-drift (1), detail.reason timeout/parent-aborted (2), minTurns (2)
- [x] All 3 commits present: 5bb783a (test Task 1), c8ebe91 (test Task 2), f1dded7 (docs Task 3)
- [x] `pnpm run verify` exits 0 (release gate green; 541 passed | 1 skipped)
- [x] `pnpm vitest run -t "parent termination evaluates over parent events only"` exits 0
- [x] `pnpm vitest run -t "minTurns floors apply per-protocol-instance"` exits 0
- [x] `pnpm vitest run -t "sub-run-completed counts as exactly one parent iteration"` exits 0
- [x] `pnpm typecheck` exits 0
