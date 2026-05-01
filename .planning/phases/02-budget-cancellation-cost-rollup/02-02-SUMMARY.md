---
phase: 02-budget-cancellation-cost-rollup
plan: 02
subsystem: runtime
tags: [budget, deadline, sub-runs, replay-trace, public-surface]

requires:
  - phase: 02-budget-cancellation-cost-rollup
    plan: 01
    provides: detail.reason vocabulary lock, classifyAbortReason, enrichAbortErrorWithParentReason, public-surface delta pattern
provides:
  - Deadline-based remainingMs math in dispatchDelegate (parentDeadlineMs threaded from run start through every recursive coordinator dispatch)
  - Zero-remaining gate that throws code:aborted with detail.reason='timeout' BEFORE sub-run-started
  - SubRunBudgetClampedEvent public TS type + RunEvent + StreamLifecycleEvent variant ("sub-run-budget-clamped")
  - Clamp emission (no longer throw) when decision.budget.timeoutMs > parent's remaining
  - defaultSubRunTimeoutMs engine option on EngineOptions and DogpileOptions (precedence: decision > parent-remaining > engine-default > undefined)
  - mark-sub-run-budget-clamped ReplayTraceProtocolDecisionType literal
  - detail.reason='timeout' lock on code:aborted errors (pairs with BUDGET-01's parent-aborted)
affects: [BUDGET-03 cost rollup (partialCost reuses partialTrace path; no ordering changes), STREAM-03 per-child cancel hook (unchanged)]

tech-stack:
  added: []
  patterns:
    - "Root-deadline snapshot at run start (engine.ts createEngine.run / .stream): parentDeadlineMs = startedAtMs + budget.timeoutMs; threaded through RunProtocolFn so depth-N grandchildren inherit ROOT deadline, not per-level snapshots"
    - "Clamp-and-emit seam in dispatchDelegate: clampedFrom local captures requested timeout; clamp event emitted BEFORE sub-run-started"

key-files:
  created: []
  modified:
    - src/types/events.ts
    - src/types.ts
    - src/index.ts
    - src/types/replay.ts
    - src/runtime/coordinator.ts
    - src/runtime/engine.ts
    - src/runtime/validation.ts
    - src/runtime/defaults.ts
    - src/demo.ts
    - src/tests/fixtures/consumer-type-resolution-smoke.ts
    - scripts/consumer-import-smoke.mjs
    - src/tests/cancellation-contract.test.ts
    - src/tests/event-schema.test.ts
    - src/tests/result-contract.test.ts
    - src/tests/public-error-api.test.ts
    - src/tests/config-validation.test.ts
    - src/runtime/coordinator.test.ts
    - CHANGELOG.md

key-decisions:
  - "Parent budget.timeoutMs is now a TREE-WIDE deadline, not a per-level window. Children inherit `parentDeadlineMs - now()`, computed at dispatch time against the root run's startedAtMs + budget.timeoutMs. Root deadline is threaded through RunProtocolFn and CoordinatorRunOptions so depth-N grandchildren see the same deadline as immediate children."
  - "Decision-level timeouts that exceed parent's remaining are CLAMPED (not thrown). The old `invalid-configuration` throw is fully removed; a new sub-run-budget-clamped event records the requested-vs-clamped pair on the parent trace BEFORE sub-run-started for replay/provenance. Happy path emits no event (zero-overhead)."
  - "defaultSubRunTimeoutMs is a fallback ceiling — applied only when neither parent nor decision specifies. When parent has budget.timeoutMs, parent's remaining wins (engine default is ignored). Validated at construction time as positive finite number."
  - "Validator `kind` discriminator stays as `configuration-validation` (existing helper convention) rather than the plan's proposed `engine-options` — preserves consistency with every other engine-options validation in validation.ts. Test G locks via `path: 'defaultSubRunTimeoutMs'` only. Documented as inline correction."

requirements-completed: [BUDGET-02]

duration: ~30 min
completed: 2026-04-30
---

# Phase 2 Plan 02: BUDGET-02 timeout/deadline propagation Summary

**Deadline-based sub-run timeout cascade with clamp-event observability and engine-default fallback — replaces the static parent-timeoutMs math at dispatchDelegate with a tree-wide deadline and replaces the throw-on-overrun behavior with a clamp + new public event variant.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 4 (executed as 2 atomic commits — source + tests; matches the plan's plan_size_note guidance to bundle Tasks 1-3 in one read pass through coordinator.ts)
- **Commits:** 2 (1 source, 1 test+changelog)
- **Files modified:** 17 source/test files + 1 changelog

## Must-haves verification

| Truth | Status | Evidence |
| --- | --- | --- |
| Children inherit `parentDeadline − now` as their default timeout, not a static `parent.budget.timeoutMs` | PASS | `coordinator.ts:835-846` — `remainingMs = parentDeadlineMs - Date.now()`. Engine snapshots `parentDeadlineMs = startedAtMs + budget.timeoutMs` at run start (engine.ts createEngine.run + .stream) and threads through RunProtocolFn (coordinator.ts:62-72) so depth-N grandchildren see ROOT deadline. |
| Per-decision `budget.timeoutMs` exceeding parent's remaining is CLAMPED (not thrown) and a `sub-run-budget-clamped` event is emitted | PASS | `coordinator.ts:854-865` — clamp branch sets `clampedFrom = decisionTimeoutMs; childTimeoutMs = remainingMs`. `coordinator.ts:891-910` emits `sub-run-budget-clamped` event BEFORE `sub-run-started`. Old throw at coordinator.ts:810-822 fully removed. |
| If parent's deadline has already elapsed, child throws `code: 'aborted'` with `detail.reason: 'timeout'` BEFORE `sub-run-started` | PASS | `coordinator.ts:843-851` — zero-remaining gate fires before runProtocol invocation and before `parentEmit(startEvent)`. coordinator.test.ts test "zero-remaining gate throws code: aborted with detail.reason 'timeout' BEFORE sub-run-started" exercises directly via `runCoordinator({ parentDeadlineMs: Date.now() - 10_000 })` and asserts `observedEvents.some(e => e.type === 'sub-run-started') === false`. |
| Engine option `defaultSubRunTimeoutMs` provides a fallback ceiling | PASS | `coordinator.ts:870-872` — precedence chain ends with `else if (options.defaultSubRunTimeoutMs !== undefined) { childTimeoutMs = options.defaultSubRunTimeoutMs; }`. coordinator.test.ts tests "applies when neither parent nor decision specifies" and "is IGNORED when parent has a budget" lock the precedence. |
| Parent timeout firing produces `code: 'aborted'` with `detail.reason: 'timeout'` on the child error | PASS | `cancellation.ts:classifyAbortReason` returns "timeout" for DogpileError code "timeout" (locked in cancellation.test.ts). `enrichAbortErrorWithParentReason` (BUDGET-01) attaches detail.reason. cancellation-contract.test.ts "parent budget timeout enriches detail.reason='timeout'" exercises end-to-end. public-error-api.test.ts locks the surface shape. |
| SubRunBudgetClampedEvent exported from src/index.ts as a public TS type | PASS | `src/index.ts:188` (alphabetical position before `SubRunCompletedEvent`). `src/types.ts` re-exports both blocks. event-schema.test.ts typed-import lock + sortedKeys + JSON round-trip. |
| defaultSubRunTimeoutMs unambiguously locked on the public engine-options type union | PASS | `src/types.ts:1872-1882` adds the field to `EngineOptions`. Test "locks defaultSubRunTimeoutMs as a public field on the engine-options type union" in config-validation.test.ts uses a typed-import const assertion (`_engineOptionsLock: EngineOptions = { ... defaultSubRunTimeoutMs: 1000 }`); typecheck fails compile if the field is removed from the exported type. |

## Public-surface delta

| Surface | Change | Locked by |
| --- | --- | --- |
| `RunEvent` union | + `SubRunBudgetClampedEvent` variant (kebab event-type `sub-run-budget-clamped`) | event-schema.test.ts expectedEventTypes |
| `StreamLifecycleEvent` union | + `SubRunBudgetClampedEvent` | event-schema.test.ts typed import |
| `@dogpile/sdk` root types | + `SubRunBudgetClampedEvent` | event-schema.test.ts typed import; result-contract.test.ts round-trip |
| `EngineOptions` | + `defaultSubRunTimeoutMs?: number` | config-validation.test.ts typed-field lock (_engineOptionsLock) |
| `DogpileOptions` | + `defaultSubRunTimeoutMs?: number` | config-validation.test.ts run() validator tests |
| `ReplayTraceProtocolDecisionType` | + `mark-sub-run-budget-clamped` literal | TS type union (compile-time) |
| `DogpileError({code:"aborted"}).detail.reason` | + `"timeout"` documented-convention literal (joins BUDGET-01's `"parent-aborted"`) | public-error-api.test.ts |
| `defaultProtocolDecision` exhaustive switch | + sub-run-budget-clamped case | typecheck (exhaustive) |
| `createReplayTraceProtocolDecision` exhaustive switch | + sub-run-budget-clamped case | typecheck (exhaustive) |
| `createReplayTraceBudgetStateChanges` exhaustive switch | + sub-run-budget-clamped case | typecheck (exhaustive) |
| Demo metadata union + 4 exhaustive switches | + sub-run-budget-clamped case + DemoSubRunBudgetClampedEventMetadata | typecheck (exhaustive) |
| consumer-type-resolution-smoke fixture switch | + sub-run-budget-clamped case | quickstart smoke (verify gate) |
| consumer-import-smoke generator switch | + sub-run-budget-clamped case | quickstart smoke (verify gate) |

## Precedence chart for child timeout resolution

```
decision.budget.timeoutMs  (delegate decision-level)
  > parent's remaining     (parentDeadlineMs - now, when parent has budget.timeoutMs)
    > defaultSubRunTimeoutMs  (engine option fallback)
      > undefined          (no timeout)
```

When both `decision.budget.timeoutMs` AND parent's remaining are present, the smaller wins via clamp:
- If `decisionTimeoutMs <= remainingMs`: child uses `decisionTimeoutMs` (no clamp event).
- If `decisionTimeoutMs > remainingMs`: child uses `remainingMs`, `sub-run-budget-clamped` event records both.

## Plan-size note

4 tasks / 13 files declared in the plan. Executed as **2 atomic commits** matching the plan's plan_size_note guidance ("do Tasks 1+2 in one read pass through coordinator.ts; do Task 3 separately"). Realistically Tasks 1-3 share enough cascading work (RunEvent variant → all switch sites; engine option → coordinator → engine wiring) that splitting them into 3 commits would have produced 3 typecheck-failure-and-fix cycles (the same trap 02-01 hit with the 02-01 SUMMARY's "ReplayTraceProtocolDecisionType + exhaustive switches" deviation). Bundled them into one feat commit + a separate test commit.

## Tests added

| File | Test name | Purpose |
| --- | --- | --- |
| src/runtime/coordinator.test.ts | clamps decision.budget.timeoutMs that exceeds parent's remaining and emits sub-run-budget-clamped before sub-run-started | end-to-end clamp event + ordering |
| src/runtime/coordinator.test.ts | does NOT emit sub-run-budget-clamped on the happy path (decision within parent remaining) | zero-overhead happy path |
| src/runtime/coordinator.test.ts | zero-remaining gate throws code: aborted with detail.reason 'timeout' BEFORE sub-run-started | direct runCoordinator with elapsed parentDeadlineMs |
| src/runtime/coordinator.test.ts | defaultSubRunTimeoutMs precedence: applies when neither parent nor decision specifies a timeout | engine default applied |
| src/runtime/coordinator.test.ts | defaultSubRunTimeoutMs is IGNORED when parent has a budget.timeoutMs (parent's remaining wins) | precedence enforcement |
| src/tests/event-schema.test.ts | locks the sub-run-budget-clamped event payload shape and JSON round-trip | typed-import lock + sortedKeys + JSON round-trip |
| src/tests/result-contract.test.ts | round-trips a sub-run-budget-clamped RunEvent variant through JSON serialization | result-contract round-trip |
| src/tests/public-error-api.test.ts | locks the BUDGET-02 detail.reason vocabulary on code: aborted errors (timeout) | DogpileError surface lock for "timeout" |
| src/tests/cancellation-contract.test.ts | parent budget timeout enriches detail.reason='timeout' on the child surfaced error (BUDGET-02 vocabulary) | end-to-end timeout cascade |
| src/tests/config-validation.test.ts | createEngine rejects defaultSubRunTimeoutMs (5 invalid value parametrizations: -1, 0, NaN, Infinity, "1000") | engine validator |
| src/tests/config-validation.test.ts | run() rejects defaultSubRunTimeoutMs (3 invalid value parametrizations: -1, 0, NaN) | run validator |
| src/tests/config-validation.test.ts | createEngine accepts a valid positive finite defaultSubRunTimeoutMs | happy path |
| src/tests/config-validation.test.ts | locks defaultSubRunTimeoutMs as a public field on the engine-options type union | typed-field compile-time lock (Test I) |

**Test totals added:** 19 new tests (5 + 1 + 1 + 1 + 1 + 5+3+1+1 = wait, recount: 5 coordinator + 1 event-schema + 1 result-contract + 1 public-error-api + 1 cancellation-contract + 5 createEngine + 3 run + 1 happy-path + 1 typed-field-lock = 19). Existing 505 tests still pass. Full release gate `pnpm run verify` exits 0 → 524 passed | 1 skipped.

## Verification output

```
$ pnpm run verify
✓ package:identity   passed
✓ build              tsc + vite (browser bundle 181.71 kB)
✓ package:artifacts  25 runtime + 25 dts artifacts
✓ quickstart:smoke   consumer pack install + typecheck + run
✓ typecheck          tsc --noEmit (strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess)
✓ test               Test Files  45 passed | 1 skipped (46)
                     Tests       524 passed | 1 skipped (525)
EXIT=0
```

## Deviations from Plan

### [Inline correction] Validator detail.kind: existing helper convention wins

- **Found during:** Task 3 implementation
- **Issue:** Plan asked for `detail: { kind: "engine-options", path: "defaultSubRunTimeoutMs" }` on the validation error. The codebase's `invalidConfiguration` helper (validation.ts:768) ALWAYS produces `kind: "configuration-validation"` for engine-options errors — every other engine-options validator (`maxDepth`, `temperature`, `tier`, etc.) uses this convention.
- **Fix:** Added a new `validateOptionalPositiveFiniteNumber` helper that delegates to the existing `invalidConfiguration` and added `"positive-finite-number"` to the `ValidationRule` union. The error carries `detail: { kind: "configuration-validation", path: "defaultSubRunTimeoutMs", rule: "positive-finite-number", expected: "finite number > 0", received: <describeValue> }`. Test G asserts only `path: "defaultSubRunTimeoutMs"` (which is what the existing `expectInvalidConfiguration` helper checks) — full consistency with every other engine-options validator.
- **Rationale:** Codebase convention > plan example (advisor flagged this pre-flight). No behavior loss — `path` is still grep-able as the locked discriminator.

### [Inline correction] Test I example dropped `intent` field

- **Found during:** Task 4 implementation (advisor flagged pre-flight)
- **Issue:** Plan's Test I example included `intent: "lock"` on the `EngineOptions` const. `intent` lives on `DogpileOptions` (the high-level surface), not `EngineOptions` (the low-level engine surface). The example would not have compiled.
- **Fix:** Dropped `intent` from `_engineOptionsLock` in config-validation.test.ts. Documented as inline comment in the test.

### [Plan note] Plan said "src/types.ts" for the new event interface

- **Found during:** Task 2 implementation (continuation of the same pattern from 02-01)
- **Issue:** Plan's `files_modified` listed `src/types.ts` for the new `SubRunBudgetClampedEvent` interface; actual location of sub-run event interfaces is `src/types/events.ts` (re-exported through `src/types.ts` in two blocks).
- **Fix:** Added the interface to `src/types/events.ts` and re-exported through both `src/types.ts` blocks. Same correction noted in 02-01 SUMMARY.

**Total deviations:** 3 inline corrections (zero behavioral deviations from plan must_haves). **Impact:** None — every plan must_have lands as specified; corrections only affect how the implementation aligns with codebase conventions and pre-existing type locations.

## Follow-ups

- BUDGET-03 (cost rollup) reuses `partialTrace` infrastructure — no ordering changes needed; will add `partialCost` to `SubRunFailedEvent` from the same `childEvents` tee buffer.
- STREAM-03 per-child cancel hook unaffected — the per-child `AbortController` from BUDGET-01 still attaches at coordinator.ts:`childController = new AbortController()`.
- The streaming-subscriber visibility caveat from BUDGET-01 (cancelRun preempting publish) applies equally to BUDGET-02's timeout path: `sub-run-failed` events with `detail.reason: "timeout"` may not reach subscribers when the engine-level setTimeout fires. Documented inline in cancellation-contract.test.ts. The CONTRACT (`handle.result` rejects with typed error) is fully observable.

## Self-Check: PASSED

- [x] `src/types/events.ts` defines `SubRunBudgetClampedEvent` and includes it in `RunEvent` + `StreamLifecycleEvent`
- [x] `src/index.ts` re-exports `SubRunBudgetClampedEvent`
- [x] `src/runtime/coordinator.ts` computes `remainingMs = parentDeadlineMs - Date.now()` and emits `sub-run-budget-clamped` before `sub-run-started`
- [x] `src/runtime/engine.ts` snapshots `parentDeadlineMs` at run start and threads through `runProtocol`
- [x] `src/runtime/validation.ts` validates `defaultSubRunTimeoutMs` as positive finite number on both DogpileOptions and EngineOptions
- [x] `src/types.ts` adds `defaultSubRunTimeoutMs` to both `DogpileOptions` and `EngineOptions`
- [x] `CHANGELOG.md` `[Unreleased]` block has the BUDGET-02 entries (clamp event + defaultSubRunTimeoutMs)
- [x] All 2 commits present: 6075776 (feat source), f53c4f2 (test+changelog)
- [x] `pnpm run verify` exits 0 (release gate green; 524 passed | 1 skipped)
- [x] All acceptance criteria grep counts ≥ required minimums
- [x] Old throw `decisionTimeoutMs.*exceeds parent` fully removed (grep returns 0)
