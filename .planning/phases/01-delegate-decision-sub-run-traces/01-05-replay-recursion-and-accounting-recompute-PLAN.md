---
phase: 01-delegate-decision-sub-run-traces
plan: 05
type: execute
wave: 4
depends_on: ["01-02", "01-03", "01-04"]
files_modified:
  - src/runtime/defaults.ts
  - src/runtime/engine.ts
  - src/tests/result-contract.test.ts
  - src/tests/replay-recursion.test.ts
  - CHANGELOG.md
autonomous: true
requirements: [TRACE-03, TRACE-04, DELEGATE-04]
status: ready
must_haves:
  truths:
    - "`Dogpile.replay(parentTrace)` produces identical `output`, `accounting`, and event sequence as the original run, without invoking any provider."
    - "Replay recurses on `sub-run-completed` to verify embedded child accounting; mismatch throws `DogpileError({ code: 'invalid-configuration', detail: { reason: 'trace-accounting-mismatch' } })`."
    - "Replay's parent event sequence is emitted verbatim from `trace.events` (D-09 — no child-event bubbling in Phase 1)."
    - "v0.4.0 CHANGELOG entry documents every public-surface change shipped across Plans 01-04 + this plan."
  artifacts:
    - path: "src/runtime/defaults.ts"
      provides: "recomputeAccountingFromTrace recursive walker"
      contains: "sub-run-completed"
    - path: "src/runtime/engine.ts"
      provides: "replay() calls recomputeAccountingFromTrace and validates against recorded accounting"
    - path: "src/tests/replay-recursion.test.ts"
      provides: "End-to-end replay-without-re-execute for nested traces; tampered-trace detection"
    - path: "CHANGELOG.md"
      provides: "v0.4.0 [Unreleased] entry covering AgentDecision union, sub-run-* events, maxDepth, transcript role, parser fenced-JSON convention"
  key_links:
    - from: "src/runtime/engine.ts replay"
      to: "src/runtime/defaults.ts recomputeAccountingFromTrace"
      via: "function call after rehydrating Trace"
      pattern: "recomputeAccountingFromTrace"
---

<objective>
Implement recursive accounting recomputation on replay (D-08, D-10) and lock the replay-without-re-execute contract for nested traces. Write the v0.4.0 CHANGELOG entry documenting the full public-surface inventory shipped by Phase 1.

Purpose: D-09 is met by construction (RESEARCH §4 — `replay()` already pulls events/transcript/output verbatim from the trace). The real new code is the recursive accounting walker (D-10) and a tamper-detection throw. Plan 04's `effectiveMaxDepth` is irrelevant to replay (no dispatch), so replay passes `Infinity`.
Output: New `recomputeAccountingFromTrace` helper, `replay()` validation hook, dedicated `replay-recursion.test.ts`, extended `result-contract.test.ts`, and CHANGELOG.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-CONTEXT.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-RESEARCH.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-02-SUMMARY.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-03-SUMMARY.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-04-SUMMARY.md
@CLAUDE.md
@src/runtime/defaults.ts
@src/runtime/engine.ts
@src/tests/result-contract.test.ts
@src/tests/replay-version-skew.test.ts
@CHANGELOG.md

<interfaces>
<!-- Existing helper (verified in src/runtime/defaults.ts:160-186) -->
```ts
function createRunAccounting(args: {
  readonly tier: Tier;
  readonly budget?: Omit<Budget, "tier">;
  readonly termination?: ReplayTraceBudget["termination"];
  readonly cost: CostSummary;
  readonly events: readonly RunEvent[];
}): RunAccounting;
```

`RunAccounting` (per `createRunAccounting`) carries:
- `kind: "run-accounting"` (literal — not summed)
- `tier: Tier` (literal — not summed; parent's tier wins)
- `budget?: Omit<Budget, "tier">` (literal — not summed; parent's budget wins)
- `termination?: ...` (literal — not summed; parent's termination wins)
- `usage: RunUsage` — `{ usd, inputTokens, outputTokens, totalTokens }` (ALL FOUR ARE NUMERIC AND SUMMABLE)
- `cost: CostSummary` — `{ usd, inputTokens, outputTokens, totalTokens }` (ALL FOUR ARE NUMERIC AND SUMMABLE)
- `budgetStateChanges: readonly ReplayTraceBudgetStateChange[]` (per-event provenance — not summed; parent's array wins)
- `usdCapUtilization?: number` (RATIO derived from `cost.usd / budget.maxUsd`; per-run ratio — NOT summable; recompute from summed `cost.usd` instead if budget is set)
- `totalTokenCapUtilization?: number` (RATIO; same — recompute, do not sum)

<!-- New helper (this plan): -->
```ts
export function recomputeAccountingFromTrace(trace: Trace): RunAccounting;
```
Walks `trace.events`. For each `sub-run-completed`, recursively calls itself on `event.subResult.trace`. Sums child `RunAccounting` numeric fields into the parent total. Compares the recomputed `subResult.accounting` against the recorded one; mismatch throws:

```ts
throw new DogpileError({
  code: "invalid-configuration",
  message: `Trace accounting mismatch at sub-run ${childRunId}: field "${field}" recorded ${recorded}, recomputed ${recomputed}.`,
  retryable: false,
  detail: {
    kind: "trace-validation",
    reason: "trace-accounting-mismatch",
    eventIndex: <index in trace.events>,
    childRunId,
    field: <string>,        // the specific field that differed (e.g. "cost.usd" or "usage.inputTokens")
    recorded: <number>,
    recomputed: <number>
  }
});
```

<!-- replay() entry (engine.ts:726-762): -->
After rehydrating `RunResult`, call `recomputeAccountingFromTrace(trace)` and assert the recomputed parent accounting equals `trace.accounting` (or whatever the recorded parent accounting field is). Top-level mismatch throws the same error with `eventIndex: -1` and `childRunId: trace.runId`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement recomputeAccountingFromTrace helper in defaults.ts</name>
  <files>src/runtime/defaults.ts</files>
  <behavior>
    - Exports `recomputeAccountingFromTrace(trace: Trace): RunAccounting`.
    - Walks `trace.events` once. For each event:
      - `model-request` / `model-response` (or whichever events `createRunAccounting` already aggregates) → contribute to local accounting using the same logic `createRunAccounting` uses today (extract or call into the existing helper if practical).
      - `sub-run-completed` → recursively compute child accounting from `event.subResult.trace`; compare to `event.subResult.accounting`; mismatch throws (see `<interfaces>`); sum verified child accounting into the parent total.
      - All other events: ignore.
    - Returns the parent's recomputed `RunAccounting` (suitable for comparison in `replay()`).
    - Pure function: no I/O, no `Date.now()`, no provider calls.
    - **Sums exactly these eight numeric fields across parent + every embedded child trace (recursive on `sub-run-completed.subResult.trace`):**
      - `cost.usd`
      - `cost.inputTokens`
      - `cost.outputTokens`
      - `cost.totalTokens`
      - `usage.usd`
      - `usage.inputTokens`
      - `usage.outputTokens`
      - `usage.totalTokens`
    - **Non-summed fields** (parent's value wins; never aggregated): `kind`, `tier`, `budget`, `termination`, `budgetStateChanges`.
    - **Derived ratio fields** (`usdCapUtilization`, `totalTokenCapUtilization`): NOT summed. After computing the summed `cost.usd` / `cost.totalTokens`, re-derive these from `parent.budget.maxUsd` / `parent.budget.maxTokens` if present (mirror the formula in `createRunAccounting` L176-184).
    - **Field-level mismatch reporting:** if the recorded parent accounting differs from the recomputed sum on ANY listed numeric field, throw with `detail.field` set to the exact field path (e.g. `"cost.usd"`, `"usage.inputTokens"`), `detail.recorded`, and `detail.recomputed`. Compare in this fixed order so the first-differing field is reported deterministically: `cost.usd`, `cost.inputTokens`, `cost.outputTokens`, `cost.totalTokens`, `usage.usd`, `usage.inputTokens`, `usage.outputTokens`, `usage.totalTokens`.
  </behavior>
  <action>
    1. Read `src/runtime/defaults.ts` to confirm the field set in `createRunAccounting` (L160-186) — the eight fields above are the exact summable numerics. The `usdCapUtilization` / `totalTokenCapUtilization` fields are ratios derived from `cost` and `budget`, NOT independent numerics — re-derive them, do not sum them.
    2. Add `recomputeAccountingFromTrace`:
       - If `createRunAccounting(events)` cleanly returns the local-events portion, call it for the parent's own contribution and add the recursively-computed child totals on top.
       - Otherwise, write a small local aggregator that mirrors `createRunAccounting`'s field math.
       - Recursion: collect `subRunCompletedEvents = trace.events.filter(e => e.type === "sub-run-completed")`. For each, `const childAccounting = recomputeAccountingFromTrace(event.subResult.trace);` then compare against `event.subResult.accounting` field-by-field across the eight numeric fields listed in `<behavior>`. Use strict equality for integer fields (`cost.inputTokens`, `cost.outputTokens`, `cost.totalTokens`, `usage.inputTokens`, `usage.outputTokens`, `usage.totalTokens`) and an epsilon comparison (`Math.abs(a - b) < 1e-9`) for the two `usd` fields (`cost.usd`, `usage.usd`).
       - On any field-level mismatch, throw the documented `DogpileError` with:
         - `detail.eventIndex` = index of the offending `sub-run-completed` event in `trace.events`
         - `detail.field` = the first differing field path (e.g. `"cost.usd"`)
         - `detail.recorded` and `detail.recomputed` set to the offending numeric values
       - **Sum logic:** the parent's returned accounting is `parentLocal + Σ childRecomputed` across the eight summable fields; ratio fields are re-derived from the summed `cost`+`budget`; non-numeric fields are taken from the parent (`kind`, `tier`, `budget`, `termination`, `budgetStateChanges`).
    3. Add unit-style tests inline in this task's verification (defer the integration tests to Task 2).
  </action>
  <verify>
    <automated>pnpm run typecheck</automated>
  </verify>
  <done>`recomputeAccountingFromTrace` exported from `src/runtime/defaults.ts`; pure; no external dependency; sums exactly the eight enumerated numeric fields; ratio fields re-derived (not summed); field-level mismatch throws with `detail.field` populated.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire replay() to recompute accounting; new replay-recursion.test.ts; extend result-contract.test.ts</name>
  <files>src/runtime/engine.ts, src/tests/replay-recursion.test.ts, src/tests/result-contract.test.ts</files>
  <behavior>
    - `replay(trace)` (engine.ts:726-762) calls `recomputeAccountingFromTrace(trace)` and compares against `trace.accounting` (or the recorded parent accounting field name — verify).
    - Top-level mismatch throws the documented error with `eventIndex: -1` and `detail.field` set to the first differing field.
    - Embedded child mismatch is thrown by the helper itself with `detail.field` set.
    - `replayStream(trace)` (L773-811) does NOT need the validation in Phase 1 (it's a thin event iterator); the contract surfaces only on `replay()`. Document this in the SUMMARY.
    - **`src/tests/replay-recursion.test.ts` (new file):**
      - Build a parent trace by running a real `Dogpile.run` against the deterministic provider, where the coordinator delegates twice in sequence (one to `sequential`, one to `coordinator` → which delegates once more to `broadcast`). Capture the parent `RunResult`.
      - Replay it: assert `replay(result.trace).output === result.output`, `replay(...).accounting` deep-equals `result.accounting`, `replay(...).trace.events` deep-equals `result.trace.events` (verbatim — D-09), provider mock asserts ZERO additional invocations during replay.
      - **Per-field tamper tests** (one test per summable numeric field; eight tests total — one for each field in the enumerated list):
        - For each field in `["cost.usd", "cost.inputTokens", "cost.outputTokens", "cost.totalTokens", "usage.usd", "usage.inputTokens", "usage.outputTokens", "usage.totalTokens"]`: clone the trace, mutate that exact field on a `sub-run-completed.subResult.accounting` (child mismatch) OR on the top-level `trace.accounting` (parent mismatch — at least one of the parent-level tamper tests should also be included), call `replay(tamperedTrace)`, and assert the throw fires with `detail.reason === "trace-accounting-mismatch"`, `detail.field === <that exact field>`, and `detail.recorded` / `detail.recomputed` populated.
      - Round-trip via JSON: `JSON.parse(JSON.stringify(trace))` → `replay(...)` succeeds.
    - **`src/tests/result-contract.test.ts`:** Add a test "replay round-trip preserves event sequence verbatim" that builds a smaller fixture parent-trace-with-one-child and asserts `replay(t).trace.events.map(e => e.type)` equals the original.
  </behavior>
  <action>
    1. **`src/runtime/engine.ts`**: In `replay()` (L726), after the existing rehydration, call `const recomputedParent = recomputeAccountingFromTrace(trace);`. Compare `recomputedParent` against `trace.accounting` (or whatever the recorded parent field is — verify by reading the function) field-by-field across the eight enumerated fields. On mismatch throw with `eventIndex: -1`, `childRunId: trace.runId`, and `detail.field` set to the first differing field. Pass the recomputed-and-verified accounting through to the returned `RunResult` (i.e. trust the recomputed value if equal; this defeats silent corruption).
    2. **`src/tests/replay-recursion.test.ts`** (new): Implement the live-run-then-replay scenario plus per-field tamper tests (one test per enumerated field). At least one tamper test must target a parent-level `trace.accounting` field (asserts `eventIndex: -1`); the others target child `subResult.accounting` fields (assert `eventIndex >= 0` and `childRunId` populated). Reuse the deterministic provider helper from `coordinator.test.ts`. If extracting the helper into a shared `src/internal.ts` file is needed for cross-test reuse, do so — but verify it's not part of the published surface (CLAUDE.md `files` allowlist).
    3. **`src/tests/result-contract.test.ts`**: Add the verbatim-event-sequence test described above.
    4. Run `pnpm vitest run src/tests/replay-recursion.test.ts src/tests/result-contract.test.ts` and `pnpm run typecheck`.
  </action>
  <verify>
    <automated>pnpm vitest run src/tests/replay-recursion.test.ts src/tests/result-contract.test.ts &amp;&amp; pnpm run typecheck</automated>
  </verify>
  <done>Replay reproduces output/accounting/events without provider invocation for nested traces; per-field tamper tests prove the throw fires for each of the eight enumerated numeric fields with `detail.field` correctly populated; provider mock confirms zero re-invocations.</done>
</task>

<task type="auto">
  <name>Task 3: Write CHANGELOG.md v0.4.0 [Unreleased] entry</name>
  <files>CHANGELOG.md</files>
  <action>
    Open `CHANGELOG.md`. Add an `## [Unreleased] — v0.4.0` section at the top (or extend if one exists). Include sub-headings:

    ```md
    ### Breaking
    - `AgentDecision` is now a discriminated union with required `type: "participate" | "delegate"`. Existing paper-style fields (`selectedRole`, `participation`, `rationale`, `contribution`) are preserved under the `participate` branch. Consumers must narrow on `decision.type === "participate"` before reading paper-style fields.

    ### Added
    - Coordinator agents may emit `{ type: "delegate", protocol, intent, model?, budget? }` to dispatch a sub-mission as part of the plan turn. Phase 1 of v0.4.0 enables delegation from the coordinator's plan turn only; worker delegation is rejected with `invalid-configuration`.
    - New `RunEvent` variants: `sub-run-started`, `sub-run-completed`, `sub-run-failed`. `sub-run-completed` carries the full child `RunResult` (including embedded `Trace`); `sub-run-failed` carries `error` and `partialTrace`.
    - Synthetic transcript entries record sub-run results with `agentId: "sub-run:<childRunId>"` and `role: "delegate-result"`.
    - `maxDepth` option on `DogpileOptions` and `EngineOptions` (default 4); per-run can only lower the engine ceiling.
    - Fenced-JSON delegate parsing convention added to `parseAgentDecision` (no new tool surface — delegate is a parser-level concern).
    - `Dogpile.replay()` rehydrates embedded sub-run traces without provider invocation; recursive accounting is recomputed and verified against the recorded value (mismatch throws `invalid-configuration` with `detail.reason: "trace-accounting-mismatch"` and `detail.field` identifying the offending numeric field).

    ### Notes
    - No package `exports`/`files` change. All new public types ship through the existing `@dogpile/sdk` root entry.
    - Phase 1 does not propagate cost caps, parent timeouts to children with no caller-set timeout, child-event bubbling, or worker delegation — those land in v0.4.0 Phases 2-4.
    ```

    Match the style of any existing CHANGELOG entries (Conventional-style or paragraph-form — read the file first). Keep it factual; no marketing.
  </action>
  <verify>
    <automated>git diff --stat CHANGELOG.md | grep -q CHANGELOG.md</automated>
  </verify>
  <done>CHANGELOG documents every Phase 1 public-surface change; matches existing style.</done>
</task>

</tasks>

<public_surface_impact>
- `src/runtime/defaults.ts`: new export `recomputeAccountingFromTrace`. NOTE: if this is meant to stay internal, do NOT add it to `src/index.ts`/`src/types.ts` re-exports; if callers need it, add to the public surface and update `package-exports.test.ts`. **Default: keep internal** (it's an SDK invariant helper). Verify `package-exports.test.ts` still passes.
- `src/runtime/engine.ts`: `replay` now validates accounting (additive, non-breaking — but corrupted traces that previously rehydrated will now throw; this is the intended D-10 behavior and is documented in CHANGELOG).
- `src/tests/replay-recursion.test.ts`: new test file in `src/tests/` (part of the contract gate per CLAUDE.md).
- `src/tests/result-contract.test.ts`: extended.
- `CHANGELOG.md`: full v0.4.0 entry.
- `package.json` `exports`/`files`: no change.
</public_surface_impact>

<verification>
- `pnpm vitest run src/tests/replay-recursion.test.ts src/tests/result-contract.test.ts src/tests/event-schema.test.ts src/tests/package-exports.test.ts`
- `pnpm run typecheck`
- `pnpm run test` (full suite — replay touches a contract gate)
- `pnpm run pack:check` (no exports change but confirms tarball clean)
- `pnpm run verify` recommended as a phase-gate before declaring Phase 1 done.
</verification>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| persisted/transmitted trace JSON → `replay()` | Untrusted `Trace` from disk/network is the input to replay; tampering must be detectable. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-01 | Tampering | Modified `subResult.accounting` numbers in a child sub-run | mitigate | D-10 recursive recompute throws `trace-accounting-mismatch` on the offending `eventIndex` with `detail.field` identifying which of the eight enumerated fields differs. |
| T-05-02 | Tampering | Modified parent `trace.accounting` | mitigate | Top-level recompute compares against recorded; throws with `eventIndex: -1` and `detail.field`. |
| T-05-03 | DoS | Adversarial deeply-nested trace forcing stack overflow on recursion | accept | `maxDepth` default 4 bounded recursion at run time; replay accepts whatever depth was recorded. Iterative rewrite is straightforward if a real attack surfaces — accept for Phase 1. |
| T-05-04 | Spoofing | Forged `sub-run-completed.subResult` with no events but non-zero accounting | mitigate | Recomputed child accounting from empty events would be zero; mismatch throws. |
| T-05-05 | Information Disclosure | Tamper-error message echoes recorded vs recomputed accounting | accept | Numbers only; no secrets. Match existing `invalidConfiguration` error verbosity. |
</threat_model>

<replayability_notes>
- D-09: parent event sequence emitted verbatim from `trace.events`. No code change to the existing replay walker.
- D-08: recursion happens by calling `recomputeAccountingFromTrace` on each `sub-run-completed.subResult.trace` — single recursion path inside the accounting walker. Replay does NOT call `runProtocol` or invoke any provider.
- Recursive recompute is the ONLY new replay code per RESEARCH §4.
- Phase 4 will add child-event bubbling onto the parent stream — when it does, both live and replay paths must update together. Phase 1 leaves event ordering schema-stable for that addition.
</replayability_notes>

<success_criteria>
- `Dogpile.replay(parentTrace)` produces identical output/accounting/event sequence as the live run, no provider invocations, for at least one nested-coordinator-with-children fixture.
- Tampered child accounting → throw with `eventIndex`, `childRunId`, and `detail.field` populated.
- Tampered parent accounting → throw with `eventIndex: -1` and `detail.field` populated.
- Per-field tamper tests cover all eight enumerated numeric fields.
- CHANGELOG v0.4.0 entry documents the full Phase 1 public-surface inventory.
- `pnpm run verify` passes.
</success_criteria>

<output>
After completion, create `.planning/phases/01-delegate-decision-sub-run-traces/01-05-SUMMARY.md` documenting: where `recomputeAccountingFromTrace` lives, exact comparison strategy used (epsilon vs strict per field), the eight enumerated summable fields, whether the helper was kept internal or made public, and the final list of test files added/extended in Phase 1. Then mark Phase 1 success criteria 1-5 (from ROADMAP) as TRUE in `.planning/STATE.md`.
</output>
