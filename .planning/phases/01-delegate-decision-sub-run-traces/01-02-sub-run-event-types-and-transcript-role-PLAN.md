---
phase: 01-delegate-decision-sub-run-traces
plan: 02
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - src/types/events.ts
  - src/types.ts
  - src/index.ts
  - src/tests/event-schema.test.ts
  - src/tests/result-contract.test.ts
  - src/tests/package-exports.test.ts
autonomous: true
requirements: [TRACE-01, TRACE-02, TRACE-04]
status: ready
must_haves:
  truths:
    - "`RunEvent` union includes `sub-run-started`, `sub-run-completed`, `sub-run-failed`."
    - "`sub-run-started` payload matches D-05 (with optional `recursive: true` flag)."
    - "`sub-run-completed` carries the full `RunResult` as `subResult`; `sub-run-failed` carries a `partialTrace` and structured `error`."
    - "Transcript vocabulary documents the `sub-run:<id>` agentId prefix and `delegate-result` role (no type-system change required — both fields are `string`)."
    - "Public-surface tests (event-schema.test.ts, result-contract.test.ts) lock the new shapes; round-trip JSON serialization passes."
  artifacts:
    - path: "src/types/events.ts"
      provides: "SubRunStartedEvent, SubRunCompletedEvent, SubRunFailedEvent + RunEvent union extension"
      contains: "sub-run-started"
    - path: "src/tests/event-schema.test.ts"
      provides: "Lock entries in expectedEventTypes + per-variant shape tests"
      contains: "sub-run-completed"
    - path: "src/tests/result-contract.test.ts"
      provides: "subResult round-trip assertion (full RunResult embedded)"
      contains: "subResult"
  key_links:
    - from: "src/types/events.ts RunEvent union"
      to: "src/tests/event-schema.test.ts expectedEventTypes"
      via: "exact array equality assertion"
      pattern: "sub-run-(started|completed|failed)"
---

<objective>
Add three `sub-run-*` event variants to the `RunEvent` discriminated union and lock the new shapes in the public-surface tests. Document the synthetic-transcript convention (`agentId: "sub-run:<id>"`, `role: "delegate-result"`) — no type change needed since both fields are plain `string`.

Purpose: Defines the trace-level contract that the coordinator dispatcher (Plan 03) and replay path (Plan 05) emit/consume. No coordinator changes here — pure type + lock-test work.
Output: Three new event interfaces, extended union, updated public-surface tests, and updated re-exports.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-CONTEXT.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-RESEARCH.md
@CLAUDE.md
@src/types/events.ts
@src/types.ts
@src/index.ts
@src/tests/event-schema.test.ts
@src/tests/result-contract.test.ts
@src/tests/package-exports.test.ts

<interfaces>
<!-- Locked event shapes (D-04..D-07, D-16) -->
```ts
export interface SubRunStartedEvent {
  readonly type: "sub-run-started";
  readonly runId: string;            // PARENT runId, per existing event convention
  readonly at: string;
  readonly childRunId: string;
  readonly parentRunId: string;      // duplicates runId for explicit cross-reference (D-05; A3 in RESEARCH)
  readonly parentDecisionId: string;
  readonly protocol: ProtocolName;
  readonly intent: string;
  readonly depth: number;
  readonly recursive?: boolean;      // D-16: only when child protocol === parent protocol === "coordinator"
}

export interface SubRunCompletedEvent {
  readonly type: "sub-run-completed";
  readonly runId: string;
  readonly at: string;
  readonly childRunId: string;
  readonly parentRunId: string;
  readonly parentDecisionId: string;
  readonly subResult: RunResult;     // full public RunResult; .trace embedded
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
    readonly detail?: JsonObject;    // includes failedDecision payload per planner note
  };
  readonly partialTrace: Trace;
}
```
RunResult and Trace are existing public types in `src/types.ts`; import from there.

<!-- expectedEventTypes lock at src/tests/event-schema.test.ts:30-41 — must add three new entries and matching expect(...).toEqual([...]) assertion at L47-58 -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add three sub-run event interfaces + extend RunEvent union; re-export</name>
  <files>src/types/events.ts, src/types.ts, src/index.ts</files>
  <behavior>
    - Three new interfaces exported from `src/types/events.ts`: `SubRunStartedEvent`, `SubRunCompletedEvent`, `SubRunFailedEvent`.
    - `RunEvent` union (currently L458) extended with the three new variants. Insert in the union between `BroadcastEvent` and `BudgetStopEvent` (per RESEARCH A2 — convention only; alphabetic-by-prefix is fine if cleaner).
    - `src/types.ts` re-exports the three new event types so callers using the bundled `@dogpile/sdk` import path see them.
    - `src/index.ts` re-exports the three new types alongside the existing `RunEvent` exports.
    - `partialTrace: Trace` and `subResult: RunResult` import from existing `src/types.ts` exports — no new types added there.
    - `JsonObject` for `error.detail` is the existing helper type used elsewhere in events.ts (verify import path).
  </behavior>
  <action>
    1. **`src/types/events.ts`**:
       - Add the three interfaces from `<interfaces>` above. Use `readonly` fields throughout. Place them after the existing `final` event interface and before `RunEvent` union.
       - Extend the `RunEvent` discriminated union (L458) by adding `| SubRunStartedEvent | SubRunCompletedEvent | SubRunFailedEvent`.
       - Verify `RunResult`, `Trace`, `ProtocolName`, `JsonObject` are importable in this module (add imports if needed — `RunResult` and `Trace` come from `src/types.ts`, may require a type-only re-export or import).
    1a. **Lock import direction for `partialTrace` / `subResult` (no circular type resolution):**
       - In `src/types/events.ts`, use `import type { Trace, RunResult } from "../types.js"` for the new sub-run event interface fields. Type-only imports do not introduce a runtime cycle and TS resolves them after both modules' top-level declarations are in scope.
       - Verify `src/types.ts` does NOT re-export the new sub-run event interfaces in a way that creates circular type resolution. Sub-run event types live in `events.ts`; if `types.ts` re-exports them, it MUST do so as a one-way re-export (`export type { SubRunStartedEvent, SubRunCompletedEvent, SubRunFailedEvent } from "./types/events.js"`) without importing back. The existing re-export block at `src/types.ts:1309` already follows this pattern (`} from "./types/events.js"`); extend that same block — do NOT add a separate `import type` from `events.ts` into `types.ts`.
       - Acceptance check: `pnpm run typecheck` passes; output contains no `Type alias 'X' circularly references itself` error and no `Cannot find name 'Trace' / 'RunResult'` error inside `src/types/events.ts`.
    2. **`src/types.ts`**: Re-export `SubRunStartedEvent`, `SubRunCompletedEvent`, `SubRunFailedEvent` from `./types/events.js` next to existing event re-exports (around L1287-1333 area; extend the existing `} from "./types/events.js"` block at L1309 — single one-way re-export).
    3. **`src/index.ts`**: Re-export the three types from the root surface (L79 area, alongside existing event exports).
    4. Run `pnpm run typecheck` — must be clean. Any consumer still narrowing on `event.type` against the old union should now require handling the three new variants (or a default branch); fix any in-tree consumers (engine.ts, coordinator.ts, replay) by adding pass-through branches that simply emit/copy the event (no logic — full dispatch lands in Plan 03 / Plan 05).
  </action>
  <verify>
    <automated>pnpm run typecheck</automated>
  </verify>
  <done>Three new event types exported through `src/index.ts` and `src/types.ts`; typecheck clean; no in-tree exhaustive switch is silently broken; no circular-type-alias errors and no missing-name errors for `Trace`/`RunResult` inside `src/types/events.ts`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Lock new event shapes in event-schema, result-contract, and package-exports tests</name>
  <files>src/tests/event-schema.test.ts, src/tests/result-contract.test.ts, src/tests/package-exports.test.ts</files>
  <behavior>
    - `expectedEventTypes` array (event-schema.test.ts:30-41) gains three entries (`"sub-run-started"`, `"sub-run-completed"`, `"sub-run-failed"`) with `as const satisfies readonly RunEvent["type"][]` still passing.
    - The `expect(eventTypes).toEqual([...])` assertion (L47-58) updated to match new array exactly.
    - New test cases assert per-variant payload shape (every required field present and typed correctly via `satisfies`-style fixtures), and JSON round-trip (`JSON.parse(JSON.stringify(event))` deep-equals original) for each of the three events.
    - `result-contract.test.ts` gains coverage that a `RunResult` containing a parent trace whose `events` includes a `sub-run-completed` with an embedded child `RunResult` round-trips through JSON without loss (this is the contract Plan 05 replay relies on).
    - `package-exports.test.ts` either gains assertions for the three new type names or, if it asserts via type-only inspection, confirms compilation. (If it uses runtime exports only, types may not need a new line — verify and add only if needed.)
  </behavior>
  <action>
    1. **`src/tests/event-schema.test.ts`**:
       - Add `"sub-run-started"`, `"sub-run-completed"`, `"sub-run-failed"` to `expectedEventTypes` (L30-41) AND to the `expect(eventTypes).toEqual([...])` literal (L47-58). Match the union ordering chosen in Task 1.
       - Add three new `describe`/`it` blocks covering shape and round-trip:
         - `sub-run-started`: build a fixture with all required fields + `recursive: true`, assert `JSON.parse(JSON.stringify(fixture))` equals fixture; assert variant satisfies `RunEvent`.
         - `sub-run-completed`: build a fixture whose `subResult` is a minimal valid `RunResult` (re-use existing test helpers if available; otherwise hand-build with empty events/transcript and zeroed accounting). Round-trip + variant satisfies.
         - `sub-run-failed`: fixture with `error: { code: "aborted", message: "..." }` and a `partialTrace` (re-use whatever minimal `Trace` fixture exists). Round-trip + variant satisfies.
    2. **`src/tests/result-contract.test.ts`**:
       - Add a test "embedded sub-run-completed round-trips through JSON" that builds a parent `RunResult` whose `trace.events` contains one `SubRunCompletedEvent` with an embedded child `RunResult`, JSON-stringify+parse, and asserts deep equality on `subResult.trace.events`, `subResult.accounting`, and `subResult.output`.
       - Add a test that the new event variants appear in the parent `trace.events[]` typing (compile-time check via `satisfies`).
    3. **`src/tests/package-exports.test.ts`**: Read the file. If it lists exported type names by string, add `"SubRunStartedEvent"`, `"SubRunCompletedEvent"`, `"SubRunFailedEvent"`. If it only checks runtime exports (functions/classes), no change needed — but verify by running the test.
    4. Run `pnpm vitest run src/tests/event-schema.test.ts src/tests/result-contract.test.ts src/tests/package-exports.test.ts`.
  </action>
  <verify>
    <automated>pnpm vitest run src/tests/event-schema.test.ts src/tests/result-contract.test.ts src/tests/package-exports.test.ts &amp;&amp; pnpm run typecheck</automated>
  </verify>
  <done>All three lock-step test files pass; new event variants verified round-trippable; package-exports check unchanged or extended cleanly.</done>
</task>

</tasks>

<public_surface_impact>
- `src/types/events.ts`: extended `RunEvent` union + three new public interfaces.
- `src/types.ts`: re-exports for the three event types.
- `src/index.ts`: re-exports for the three event types.
- `src/tests/event-schema.test.ts`: locked.
- `src/tests/result-contract.test.ts`: locked.
- `src/tests/package-exports.test.ts`: verified / extended if it inspects type names.
- `package.json` `exports`/`files`: no change (no new subpath).
- `CHANGELOG.md`: deferred to Plan 05 (final v0.4.0 entry).
</public_surface_impact>

<verification>
- `pnpm vitest run src/tests/event-schema.test.ts src/tests/result-contract.test.ts src/tests/package-exports.test.ts`
- `pnpm run typecheck`
- `pnpm run pack:check` (smoke — no exports change expected, but confirms the published shape is unchanged).
</verification>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| trace JSON ↔ disk/network | Embedded `subResult.trace` and `partialTrace` cross the same boundary as parent traces; deserialization happens on replay. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Tampering | Embedded child trace inside `sub-run-completed.subResult` | mitigate (Plan 05) | This plan adds the typed shape; Plan 05 implements `recomputeAccountingFromTrace` to detect tampered numbers (D-10). Locking the type here is a precondition for that defense. |
| T-02-02 | Information Disclosure | `partialTrace` on `sub-run-failed` may carry partial provider responses | accept | Same disclosure surface as a normal `Trace`; no new info leak vector — accept. Documented as a `Trace` subtype. |
| T-02-03 | Repudiation | Missing parent-decision linkage | mitigate | All three events carry `parentDecisionId`; tests assert presence. Replay can attribute every sub-run to its dispatching decision. |
</threat_model>

<success_criteria>
- Three event variants compile and re-export cleanly from `src/index.ts`.
- `event-schema.test.ts` `expectedEventTypes` literal matches union exhaustively.
- `result-contract.test.ts` proves embedded `RunResult` round-trips through JSON.
- `pnpm run typecheck` clean.
</success_criteria>

<output>
After completion, create `.planning/phases/01-delegate-decision-sub-run-traces/01-02-SUMMARY.md` documenting union ordering chosen, the exact list of new exports, and any test-helper fixtures introduced for downstream plans to reuse.
</output>
