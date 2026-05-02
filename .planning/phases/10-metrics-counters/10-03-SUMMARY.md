---
phase: 10-metrics-counters
plan: 03
subsystem: packaging
tags: [metrics, counters, package-exports, fixtures, public-api, tdd]

requires:
  - phase: 10-metrics-counters
    provides: MetricsHook engine lifecycle integration from Plan 10-02
provides:
  - /runtime/metrics package subpath wiring
  - Public metrics contract tests for terminal outcomes and hook isolation
  - Frozen RunMetricsSnapshot v1 fixture and compile-time fixture mirror
affects: [runtime, public-api, package-exports, metrics, docs-lockstep]

tech-stack:
  added: []
  patterns:
    - Package subpath wiring mirrors /runtime/tracing
    - Frozen JSON fixture plus satisfies type-check companion
    - Public contract tests cover metrics behavior through run() and stream()

key-files:
  created:
    - src/tests/metrics-contract.test.ts
    - src/tests/fixtures/metrics-snapshot-v1.json
    - src/tests/fixtures/metrics-snapshot-v1.type-check.ts
  modified:
    - package.json
    - src/tests/package-exports.test.ts

key-decisions:
  - "The /runtime/metrics public subpath is package-exported without root re-exports, matching the Phase 10 subpath-only decision."
  - "metrics-contract.test.ts owns public-surface behavior coverage while metrics-engine-contract.test.ts remains the focused engine-internal lifecycle test."
  - "The frozen metrics snapshot fixture uses exactly the 9-field RunMetricsSnapshot v1 shape."

patterns-established:
  - "Runtime metrics package exports must be asserted in package.json and src/tests/package-exports.test.ts together."
  - "Metrics snapshot schema changes require updating both metrics-snapshot-v1.json and metrics-snapshot-v1.type-check.ts."

requirements-completed: [METR-01, METR-02]

duration: 7 min
completed: 2026-05-02
---

# Phase 10 Plan 03: Metrics Public Surface Summary

**Runtime metrics subpath, public metrics contract tests, and frozen RunMetricsSnapshot v1 fixture**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-02T01:14:43Z
- **Completed:** 2026-05-02T01:21:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `@dogpile/sdk/runtime/metrics` to `package.json` exports and the package source allowlist.
- Extended `src/tests/package-exports.test.ts` to assert the `/runtime/metrics` subpath and type surface.
- Added `src/tests/metrics-contract.test.ts` with 9 public contract tests covering completed, budget-stopped, sub-run, cancelled/aborted, absent-hook/result-shape, and throwing-hook behavior.
- Added the frozen `metrics-snapshot-v1.json` fixture and a `satisfies RunMetricsSnapshot` type-check mirror.
- Ran the full `pnpm run verify` gate successfully.

## TDD Record

- **RED:** `77a2267` added `src/tests/metrics-contract.test.ts`; `pnpm vitest run src/tests/metrics-contract.test.ts` failed as expected because `metrics-snapshot-v1.json` did not exist.
- **GREEN:** `0536957` added `metrics-snapshot-v1.json` and `metrics-snapshot-v1.type-check.ts`; `pnpm run typecheck` and the focused metrics contract test passed.
- **REFACTOR:** No separate refactor commit was needed.

## Task Commits

1. **Task 1: Add /runtime/metrics subpath and package export assertion** - `3e07afa` (feat)
2. **Task 2 RED: Add failing public metrics contract test** - `77a2267` (test)
3. **Task 2 GREEN: Add frozen metrics snapshot fixture** - `0536957` (test)

## Files Created/Modified

- `package.json` - Adds `./runtime/metrics` export and `src/runtime/metrics.ts` package allowlist entry.
- `src/tests/package-exports.test.ts` - Asserts the metrics subpath and imports `MetricsHook` / `RunMetricsSnapshot` from the public package path.
- `src/tests/metrics-contract.test.ts` - Public metrics behavior contract for METR-01 and METR-02.
- `src/tests/fixtures/metrics-snapshot-v1.json` - Frozen 9-field snapshot fixture.
- `src/tests/fixtures/metrics-snapshot-v1.type-check.ts` - Compile-time `satisfies RunMetricsSnapshot` mirror of the fixture.

## Decisions Made

- Kept Plan 03 coverage at the public contract layer instead of duplicating Plan 02 engine helper assertions.
- Used the repository's existing fixture-test pattern (`readFile` + JSON parse) instead of a JSON import, preserving current TypeScript configuration.
- Used a deferred provider in the cancelled streaming test so cancellation is observed deterministically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Narrowed the test logger spy helper type**
- **Found during:** Task 2 GREEN (fixture/type-check verification)
- **Issue:** `ReturnType<typeof vi.fn>` was too broad to call directly under the current Vitest types, causing `pnpm run typecheck` to fail.
- **Fix:** Narrowed the helper parameter to the callable `Logger["error"]` shape.
- **Files modified:** `src/tests/metrics-contract.test.ts`
- **Verification:** `pnpm run typecheck` passed.
- **Committed in:** `0536957`

---

**Total deviations:** 1 auto-fixed (1 blocking issue)
**Impact on plan:** The fix was limited to test helper typing and did not change runtime behavior or public API.

## Issues Encountered

- The GSD `query` interface was unavailable as noted in the prompt, so state and roadmap updates were made manually.
- A parallel `git add` attempt briefly collided on Git's index lock while staging Task 2 files; the lock cleared without cleanup, and staging continued serially.

## Verification

- `pnpm run build` - passed.
- `pnpm vitest run src/tests/package-exports.test.ts` - passed: 35 tests.
- `pnpm vitest run src/tests/metrics-contract.test.ts` - passed: 9 tests.
- `pnpm run typecheck` - passed.
- `grep -c '"./runtime/metrics"' package.json` - `1`.
- `grep -c '"src/runtime/metrics.ts"' package.json` - `1`.
- `pnpm run verify` - passed: 59 test files passed, 1 skipped; 759 tests passed, 1 skipped.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 04 can now add the documentation lockstep: `CHANGELOG.md`, `CLAUDE.md`, and `docs/developer-usage.md` metrics coverage on top of a verified public metrics subpath and contract suite.

## Self-Check: PASSED

- Found `src/tests/metrics-contract.test.ts`.
- Found `src/tests/fixtures/metrics-snapshot-v1.json`.
- Found `src/tests/fixtures/metrics-snapshot-v1.type-check.ts`.
- Found `.planning/phases/10-metrics-counters/10-03-SUMMARY.md`.
- Found commits `3e07afa`, `77a2267`, and `0536957`.
- Plan-level verification passed.

---
*Phase: 10-metrics-counters*
*Completed: 2026-05-02*
