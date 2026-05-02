---
phase: 07-structured-event-introspection-health-diagnostics
plan: "04"
subsystem: observability
tags: [health-diagnostics, run-result, replay, contract-tests]

requires:
  - phase: 07-structured-event-introspection-health-diagnostics
    provides: 07-03 computeHealth implementation and default thresholds
provides:
  - RunResult.health required on the public result contract
  - Health computation attached to live run, protocol, stream, embedded child, and replay result construction paths
  - canonicalizeRunResult health preservation
  - Result contract coverage for health presence, replay parity, evaluation propagation, and replay early-return parity
  - Frozen anomaly-record-v1.json shape test
affects: [07-05-public-surface, phase-8-audit-event-schema, result-contracts]

tech-stack:
  added: []
  patterns:
    - Trace-derived health is computed immediately next to RunResult construction
    - Frozen fixture tests assert exact field sets for public schema records

key-files:
  created:
    - src/tests/health-shape.test.ts
  modified:
    - src/runtime/engine.ts
    - src/runtime/defaults.ts
    - src/runtime/sequential.ts
    - src/runtime/broadcast.ts
    - src/runtime/shared.ts
    - src/runtime/coordinator.ts
    - src/types.ts
    - src/tests/result-contract.test.ts
    - src/tests/event-schema.test.ts

key-decisions:
  - "RunResult.health is now required because all public and embedded RunResult construction paths compute it from trace data."
  - "Protocol-level constructors also compute health so stream results and delegated child subResults satisfy the required contract, not only top-level run() results."
  - "The anomaly fixture shape test checks exact keys so schema additions or removals require an explicit fixture/test update."

patterns-established:
  - "Required derived RunResult fields must be present before canonicalization and before embedding child RunResults."
  - "Replay parity tests should cover the non-final replay early-return branch when a field is required on every RunResult."

requirements-completed:
  - HLTH-01
  - HLTH-02

duration: 9 min
completed: 2026-05-01
---

# Phase 07 Plan 04: Engine Health Attachment Summary

**Required RunResult health summaries with replay parity, canonicalization preservation, and frozen anomaly shape coverage**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-01T21:06:38Z
- **Completed:** 2026-05-01T21:15:33Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Attached `health: computeHealth(trace, DEFAULT_HEALTH_THRESHOLDS)` to the live run result path and replay base result before the replay early-return branch.
- Added `health` to `canonicalizeRunResult` so `applyRunEvaluation`, `run()`, `stream()`, and `replay()` do not silently drop the field.
- Tightened `RunResult.health` from optional to required.
- Added result contract assertions for health shape, replay parity, evaluation propagation, and non-final replay early-return parity.
- Added `src/tests/health-shape.test.ts` to protect the frozen `HealthAnomaly` fixture field set.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add health to engine run/replay paths and canonicalizeRunResult** - `8cf73b8` (feat)
2. **Task 2: Tighten RunResult.health and add contract tests** - `a8d065e` (feat)

## Files Created/Modified

- `src/runtime/engine.ts` - Computes health on top-level run results and replay base results.
- `src/runtime/defaults.ts` - Preserves `health` during explicit RunResult canonicalization.
- `src/runtime/sequential.ts` - Computes health for sequential protocol results.
- `src/runtime/broadcast.ts` - Computes health for broadcast protocol results.
- `src/runtime/shared.ts` - Computes health for shared protocol results.
- `src/runtime/coordinator.ts` - Computes health for coordinator protocol results and embedded child result compatibility.
- `src/types.ts` - Makes `RunResult.health` required.
- `src/tests/result-contract.test.ts` - Adds health contract, replay parity, evaluation propagation, and early-return replay assertions.
- `src/tests/health-shape.test.ts` - Adds frozen anomaly fixture shape tests.
- `src/tests/event-schema.test.ts` - Updates the minimal `RunResult` fixture for the required health field.

## Decisions Made

- Protocol-level result constructors now compute health as well as engine run/replay wrappers. This keeps `stream().result` and delegated `subResult` payloads valid under the required `RunResult.health` contract.
- The health-shape test asserts exact field keys per anomaly record instead of only required fields, so additive schema drift is caught.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added protocol-level health computation**
- **Found during:** Task 2 (Tighten RunResult.health to required + add contract tests)
- **Issue:** After making `RunResult.health` required, TypeScript showed `runSequential`, `runBroadcast`, `runShared`, `runCoordinator`, and a minimal test fixture still constructed `RunResult` values without `health`.
- **Fix:** Refactored each protocol constructor to bind its trace before returning, compute health from that trace, and include health in the returned `RunResult`; updated the event-schema fixture.
- **Files modified:** `src/runtime/sequential.ts`, `src/runtime/broadcast.ts`, `src/runtime/shared.ts`, `src/runtime/coordinator.ts`, `src/tests/event-schema.test.ts`
- **Verification:** `pnpm run typecheck`, targeted Vitest, and full Vitest suite passed.
- **Committed in:** `a8d065e`

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** The change was required by the plan's public type tightening and kept the implementation aligned with the "health always present" contract. No new product surface was added.

## Issues Encountered

- The local `gsd-sdk query` command surface was unavailable in this runtime, matching prior Phase 7 summaries, so planning state updates were applied directly to markdown files.
- Task 1 intentionally produced the planned interim typecheck failure because `canonicalizeRunResult` preserved `health` before `RunResult.health` was tightened.

## Known Stubs

None.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm run typecheck` - passed.
- `pnpm vitest run src/tests/result-contract.test.ts src/tests/health-shape.test.ts` - passed, 28 tests.
- `pnpm run test` - passed, 50 files and 699 tests; 1 file/test skipped.
- `grep "health: computeHealth" src/runtime/engine.ts | wc -l` - returned 2.
- `grep "health: canonicalizeSerializable" src/runtime/defaults.ts` - returned 1 match.
- `grep "readonly health:" src/types.ts` - returned the required field.
- `rg "health\\?" src/types.ts` - returned no matches.

## Next Phase Readiness

Ready for 07-05. Runtime health attachment and contract tests are in place; the remaining work is public-surface lockstep for the `/runtime/health` and `/runtime/introspection` subpaths, package exports, changelog, and invariant documentation.

## Self-Check: PASSED

- Confirmed files exist: `src/tests/health-shape.test.ts` and this summary.
- Confirmed task commits exist: `8cf73b8` and `a8d065e`.
- Confirmed plan-level verification passed: typecheck, targeted contract/shape tests, full Vitest suite, and required greps.

---
*Phase: 07-structured-event-introspection-health-diagnostics*
*Completed: 2026-05-01*
