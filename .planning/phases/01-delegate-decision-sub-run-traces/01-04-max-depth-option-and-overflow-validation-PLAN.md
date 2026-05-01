---
phase: 01-delegate-decision-sub-run-traces
plan: 04
type: execute
wave: 3
depends_on: ["01-01", "01-02"]
files_modified:
  - src/types.ts
  - src/runtime/validation.ts
  - src/runtime/engine.ts
  - src/runtime/decisions.ts
  - src/runtime/coordinator.ts
  - src/tests/config-validation.test.ts
autonomous: true
requirements: [DELEGATE-04]
status: ready
must_haves:
  truths:
    - "`DogpileOptions.maxDepth?: number` and `EngineOptions.maxDepth?: number` accepted; default is 4."
    - "`effectiveMaxDepth = Math.min(engine.maxDepth ?? 4, run.maxDepth ?? Infinity)` computed once at run start."
    - "Per-run `maxDepth` can only LOWER the engine's value (D-13)."
    - "Depth-overflow throws `DogpileError({ code: 'invalid-configuration', detail: { kind: 'delegate-validation', path: 'decision.protocol', reason: 'depth-overflow', currentDepth, maxDepth } })` at BOTH parse time AND dispatcher time (D-14)."
    - "`maxDepth` validated as optional non-negative integer at option-validation time."
  artifacts:
    - path: "src/runtime/validation.ts"
      provides: "validateOptional maxDepth in validateDogpileOptions + validateEngineOptions"
    - path: "src/runtime/engine.ts"
      provides: "Engine carries effectiveMaxDepth; runProtocol passes it through"
    - path: "src/tests/config-validation.test.ts"
      provides: "maxDepth ceiling/lower-only/overflow tests"
  key_links:
    - from: "src/runtime/decisions.ts parseAgentDecision"
      to: "depth-overflow throw"
      via: "context.currentDepth + 1 > context.maxDepth"
      pattern: "depth-overflow"
    - from: "src/runtime/coordinator.ts dispatch"
      to: "depth-overflow throw"
      via: "currentDepth + 1 > effectiveMaxDepth"
      pattern: "depth-overflow"
---

<objective>
Plumb `maxDepth` through `DogpileOptions` / `EngineOptions` / engine state / `runProtocol` / `runCoordinator`, and enforce overflow at BOTH the parser (Plan 01's `parseAgentDecision`) and the dispatcher (Plan 03's coordinator dispatch).

Purpose: Greenfield option (no existing infra per RESEARCH §5). D-13 + D-14 require dual enforcement and per-run-can-only-lower semantics. Runs in parallel with Plan 03 — both depend on Plans 01+02 and don't conflict on file ownership at the function-level (engine.ts and coordinator.ts changes are scoped to distinct functions and can be merged sequentially: Plan 03 lands first, then this plan adds the validation hook in the same dispatcher).

NOTE on file overlap with Plan 03: This plan touches `src/runtime/engine.ts` and `src/runtime/coordinator.ts`, which Plan 03 also touches. To preserve same-wave parallel safety, this plan executes in **wave 3 sequentially after Plan 03 completes** OR splits its engine.ts/coordinator.ts edits to ride on top of Plan 03's diff. Implementer choice; the safe default is sequential. Wave is marked 3 because Plan 03's coordinator dispatch must exist before depth enforcement has somewhere to land.
Output: `maxDepth` accepted on every entry point, validated, threaded, enforced twice, locked in `config-validation.test.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-CONTEXT.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-RESEARCH.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-01-SUMMARY.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-03-SUMMARY.md
@CLAUDE.md
@src/types.ts
@src/runtime/validation.ts
@src/runtime/engine.ts
@src/runtime/decisions.ts
@src/runtime/coordinator.ts
@src/tests/config-validation.test.ts

<interfaces>
<!-- DogpileOptions (src/types.ts:1734) and EngineOptions (src/types.ts:1791) gain: -->
```ts
readonly maxDepth?: number;
```

<!-- Validation helper (src/runtime/validation.ts:26): -->
```ts
function validateOptionalNonNegativeInteger(value: unknown, path: string): void;
```
Reuse for `maxDepth`.

<!-- Engine state (src/runtime/engine.ts:62 createEngine closure): -->
```ts
const engineMaxDepth = options.maxDepth ?? 4;
// per run:
const effectiveMaxDepth = Math.min(engineMaxDepth, runOptions.maxDepth ?? Infinity);
// per-run can only LOWER (D-13): no need to throw — Math.min naturally enforces this.
// Pass effectiveMaxDepth into runProtocol → runCoordinator.
```

<!-- Plan 01's parseAgentDecision context: -->
```ts
function parseAgentDecision(output: string, context?: { parentProviderId?: string; currentDepth?: number; maxDepth?: number }): AgentDecision | undefined;
```
Plan 01 added `parentProviderId` to context; this plan extends it with `currentDepth` and `maxDepth`.

<!-- Overflow error shape (D-14, D-15): -->
```ts
throw new DogpileError({
  code: "invalid-configuration",
  message: `Depth overflow: cannot dispatch sub-run at depth ${currentDepth + 1} (maxDepth = ${maxDepth}).`,
  retryable: false,
  detail: { kind: "delegate-validation", path: "decision.protocol", reason: "depth-overflow", currentDepth, maxDepth }
});
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add maxDepth option, validation, and engine threading</name>
  <files>src/types.ts, src/runtime/validation.ts, src/runtime/engine.ts</files>
  <behavior>
    - `DogpileOptions` (src/types.ts:1734) and `EngineOptions` (src/types.ts:1791) gain `readonly maxDepth?: number`.
    - `validateDogpileOptions` (validation.ts:51-72) and `validateEngineOptions` (validation.ts:81-95) call `validateOptionalNonNegativeInteger(options.maxDepth, "maxDepth")`.
    - `createEngine` reads `options.maxDepth ?? 4` once; stores `engineMaxDepth` in the engine closure.
    - On every entry point (`Dogpile.pile`, `run`, `stream`, `replay`, `replayStream`), per-run `runOptions.maxDepth` is honored via `effectiveMaxDepth = Math.min(engineMaxDepth, runOptions.maxDepth ?? Infinity)`. (Replay paths receive `effectiveMaxDepth = Infinity` since no dispatch occurs in replay — Plan 05 owns this; this plan's responsibility is only the live-run threading.)
    - `runProtocol` (engine.ts:608) accepts `effectiveMaxDepth: number` (already plumbed by Plan 03 with default `Infinity`). Default flips to required for live runs from `Dogpile.run` / `stream`; replay continues to pass `Infinity`.
    - `runCoordinator` receives both `currentDepth` (from Plan 03) and `effectiveMaxDepth`. No enforcement yet — Task 2 adds it.
    - `withHighLevelDefaults` (engine.ts:860) plumbs `maxDepth` from `DogpileOptions` to the underlying engine call.
  </behavior>
  <action>
    1. **`src/types.ts`**: Add `readonly maxDepth?: number;` to `DogpileOptions` (around L1734) and `EngineOptions` (around L1791). Match the JSDoc style of adjacent fields. Document default = 4 and "per-run can only lower the engine's value".
    2. **`src/runtime/validation.ts`**: In `validateDogpileOptions` (L51-72) and `validateEngineOptions` (L81-95), add `validateOptionalNonNegativeInteger(options.maxDepth, "maxDepth")` calls.
    3. **`src/runtime/engine.ts`**:
       - In `createEngine` (L62), capture `const engineMaxDepth = options.maxDepth ?? 4;` in the closure.
       - At each run-start point, compute `const effectiveMaxDepth = Math.min(engineMaxDepth, runOptions.maxDepth ?? Number.POSITIVE_INFINITY);` once and pass it to `runProtocol`.
       - `runProtocol` propagates `effectiveMaxDepth` to `runCoordinator` (and accepts it for the other protocols even if they ignore it — keeps signature uniform).
       - In `withHighLevelDefaults` (L860), pass `maxDepth` through from `DogpileOptions`.
       - For `replay` / `replayStream` (L726-811), pass `effectiveMaxDepth: Number.POSITIVE_INFINITY` (replay doesn't dispatch).
  </action>
  <verify>
    <automated>pnpm run typecheck</automated>
  </verify>
  <done>`maxDepth` is a typed, validated, plumbed option; engine threads `effectiveMaxDepth` through `runProtocol` to `runCoordinator`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Enforce depth overflow at parse time AND dispatch time; lock in config-validation.test.ts</name>
  <files>src/runtime/decisions.ts, src/runtime/coordinator.ts, src/tests/config-validation.test.ts</files>
  <behavior>
    - **Parse-time check (decisions.ts):** When `parseAgentDecision` returns a delegate decision and `context.currentDepth !== undefined && context.maxDepth !== undefined`, check `context.currentDepth + 1 > context.maxDepth` and throw the depth-overflow error from `<interfaces>` BEFORE returning the decision.
    - **Dispatch-time check (coordinator.ts):** In Plan 03's dispatch loop, immediately before the `sub-run-started` emit, check `currentDepth + 1 > effectiveMaxDepth` and throw the same error. (This catches any TOCTOU window per D-14.)
    - **Per-run lower-only (D-13):** No explicit check needed — `Math.min(engineMax, runMax ?? ∞)` naturally enforces it. Tests assert that `maxDepth: engineMax + 1` per run does NOT raise the ceiling.
    - **`config-validation.test.ts` lock:**
      - `maxDepth: -1` → throws on engine creation with `invalid-configuration` `path: "maxDepth"`.
      - `maxDepth: 1.5` → throws (non-integer).
      - `maxDepth: "4"` → throws (non-number).
      - Engine `maxDepth: 4`, run `maxDepth: 2` → effective 2.
      - Engine `maxDepth: 2`, run `maxDepth: 5` → effective 2 (per-run cannot raise).
      - End-to-end: engine `maxDepth: 1`, coordinator delegates to coordinator → second dispatch throws depth-overflow with `detail.path: "decision.protocol"` and `detail.reason: "depth-overflow"`.
      - Default behavior: no `maxDepth` set anywhere → effective 4; 4 nested coordinator delegates succeed; 5th throws.
    - **Behavioral dispatcher-time test (D-14 dual-throw TOCTOU defense):** A test that exercises the dispatcher-time check independently of the parse-time check, proving both gates exist and fire as designed (NOT via static grep).
  </behavior>
  <action>
    1. **`src/runtime/decisions.ts`**: In `parseDelegateDecision` (added in Plan 01), after all field validation, accept the optional `currentDepth` and `maxDepth` from context and perform the overflow check. Use the error shape from `<interfaces>`.
    2. **`src/runtime/coordinator.ts`**: In Plan 03's dispatch loop, immediately before emitting `sub-run-started`, perform the same overflow check using the same error shape. Pass `currentDepth` and `effectiveMaxDepth` from the function args. Update Plan 03's `parseAgentDecision` call site to forward `currentDepth: currentDepth, maxDepth: effectiveMaxDepth` in the parser context (so parse-time check fires too).
    3. **`src/tests/config-validation.test.ts`**: Add the seven cases above. For the end-to-end and default-behavior cases, reuse the deterministic provider helper from `coordinator.test.ts` (extract a fixture into `src/internal.ts` or a `__fixtures__` dir if duplication becomes ugly — but small inline duplication is OK for Phase 1).
    4. **Behavioral dispatcher-time check (replaces the prior grep fallback):** Confirm BOTH the parse-time and dispatcher-time gates fire by writing a behavioral test that drives the dispatcher with a forged delegate decision while the parse-time check is intentionally bypassed:

       ```
       Test seam: parse a delegate decision with parse-time `effectiveMaxDepth: Infinity`
       (or maxDepth set high enough to clear parse), then invoke the dispatcher entry
       with `effectiveMaxDepth: 0` (or `currentDepth >= effectiveMaxDepth`).

       Assert: dispatcher throws DogpileError({
         code: "invalid-configuration",
         detail: { reason: "depth-overflow", currentDepth, maxDepth }
       }).

       This proves D-14's dual-throw TOCTOU defense behaviorally rather than via static
       grep. If the dispatcher entry isn't directly callable from a unit test today,
       add a test-only export (e.g. `__dispatchDelegateForTest`) gated to internal use,
       OR expose the depth check as a small named function (e.g. `assertDepthWithinLimit(currentDepth, effectiveMaxDepth)`)
       that is testable in isolation. The named-function approach is preferred — it keeps
       the public surface clean and lets the test simply call the function directly.
       ```

       Acceptance: the test calls the dispatcher (or the extracted depth-check function)
       with parse-time-clearing context but dispatcher-time-failing args, and asserts the
       documented `DogpileError` is thrown with `detail.reason === "depth-overflow"`,
       `detail.path === "decision.protocol"`, and `detail.currentDepth` / `detail.maxDepth`
       populated.

       DO NOT rely on `grep` to assert the check exists at both call sites — the test
       must execute the dispatcher-time check and observe the throw.
  </action>
  <verify>
    <automated>pnpm vitest run src/tests/config-validation.test.ts src/runtime/decisions.test.ts src/runtime/coordinator.test.ts</automated>
  </verify>
  <done>All seven config-validation cases pass; depth overflow enforced at parser AND dispatcher and BOTH gates are exercised by behavioral tests; per-run can only lower; default of 4 confirmed; `pnpm run typecheck` clean.</done>
</task>

</tasks>

<public_surface_impact>
- `src/types.ts`: `DogpileOptions.maxDepth` and `EngineOptions.maxDepth` added (additive, non-breaking).
- `src/runtime/validation.ts`, `src/runtime/engine.ts`, `src/runtime/decisions.ts`, `src/runtime/coordinator.ts`: internal threading + enforcement.
- `src/tests/config-validation.test.ts`: locks ceiling, lower-only, default-4, overflow.
- `src/tests/event-schema.test.ts`: NOT touched (events unchanged).
- `src/tests/result-contract.test.ts`: NOT touched.
- `package.json` `exports`/`files`: no change.
- `CHANGELOG.md`: deferred to Plan 05 (the v0.4.0 entry will note `maxDepth`).
- If a test-only export or extracted `assertDepthWithinLimit` helper is added to `src/runtime/coordinator.ts` (or a sibling internal module), confirm it is NOT re-exported from `src/index.ts` / `src/types.ts` / any subpath listed in `package.json` `exports`. Verify via `pnpm run pack:check` and `src/tests/package-exports.test.ts`.
</public_surface_impact>

<verification>
- `pnpm vitest run src/tests/config-validation.test.ts`
- `pnpm vitest run src/runtime/decisions.test.ts src/runtime/coordinator.test.ts` (regression: Plans 01+03 still pass)
- `pnpm run typecheck`
</verification>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| caller config → engine state | `maxDepth` from caller bounds runtime recursion. |
| coordinator agent decision → dispatcher | Adversarial agent could try to recurse without bound. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-01 | Denial of Service | Unbounded recursion via repeated delegate-to-coordinator | mitigate | Default `maxDepth = 4` enforced at both parser and dispatcher; per-run can only lower. |
| T-04-02 | Tampering | Per-run config trying to RAISE engine ceiling | mitigate | `Math.min` naturally caps at engine value; test asserts. |
| T-04-03 | Time-of-check-time-of-use | State mutation between parse and dispatch | mitigate | D-14 dual enforcement: dispatcher re-checks even if parser passed. Behavioral test exercises the dispatcher-time path independently. |
| T-04-04 | Spoofing | Caller passes `maxDepth: NaN` or non-integer | mitigate | `validateOptionalNonNegativeInteger` rejects. |
</threat_model>

<replayability_notes>
- Replay does not dispatch sub-runs; it walks recorded events. Therefore `effectiveMaxDepth` for replay is `Infinity` (Plan 05 confirms).
- Recorded depth on `sub-run-started.depth` is provenance only — replay does not re-validate against `maxDepth` since the run already succeeded.
</replayability_notes>

<success_criteria>
- `maxDepth` typed, validated, threaded.
- Default = 4 confirmed end-to-end.
- Both enforcement sites (parser + dispatcher) demonstrably throw — dispatcher-time path proven by a behavioral test, not by grep.
- Per-run cannot raise the engine ceiling.
- `pnpm run typecheck` clean.
</success_criteria>

<output>
After completion, create `.planning/phases/01-delegate-decision-sub-run-traces/01-04-SUMMARY.md` documenting the exact `effectiveMaxDepth` derivation path through `Dogpile.pile` / `run` / `stream`, where the two enforcement throws live (file:line), and how the dispatcher-time gate is reached by tests (test-only export, extracted helper, or both).
</output>
