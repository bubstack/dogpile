---
phase: 09-otel-tracing-bridge
plan: 01
subsystem: runtime
tags: [otel, tracing, public-api, vitest, typescript]

requires:
  - phase: 09-otel-tracing-bridge
    provides: Delegating deterministic provider fixture from Plan 00
provides:
  - DogpileTracer, DogpileSpan, and DogpileSpanOptions duck-typed tracing contract
  - DOGPILE_SPAN_NAMES locked span-name constants
  - tracer?: DogpileTracer on DogpileOptions and EngineOptions
  - Root exports for tracing types and DOGPILE_SPAN_NAMES
  - Test-only OTEL devDependencies and lockfile entries
affects: [otel, runtime, public-api, package-root]

tech-stack:
  added:
    - "@opentelemetry/api@1.9.1 (devDependency only)"
    - "@opentelemetry/sdk-trace-base@2.7.1 (devDependency only)"
  patterns:
    - Duck-typed runtime observability interface with no runtime OTEL import
    - Co-located runtime contract test for public type structure

key-files:
  created:
    - src/runtime/tracing.ts
    - src/runtime/tracing.test.ts
  modified:
    - src/types.ts
    - src/index.ts
    - package.json
    - pnpm-lock.yaml
    - .planning/codebase/STRUCTURE.md
    - .planning/codebase/STACK.md

key-decisions:
  - "Tracing stays duck-typed and import-free in runtime source; OTEL packages are dev/test-only."
  - "Root exports expose DogpileTracer, DogpileSpan, DogpileSpanOptions, and DOGPILE_SPAN_NAMES now; package subpath wiring remains deferred to Plan 03."

patterns-established:
  - "Tracing contract modules should define public interfaces/constants separately from engine lifecycle behavior."
  - "Broad grep checks for runtime imports should target import statements to avoid false positives from contract JSDoc."

requirements-completed: [OTEL-01, OTEL-03]

duration: 6 min
completed: 2026-05-01
---

# Phase 09 Plan 01: Tracing Module Surface Summary

**Duck-typed Dogpile tracing contract with locked span names, root exports, and test-only OTEL contract dependencies**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-01T23:00:23Z
- **Completed:** 2026-05-01T23:06:16Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added `src/runtime/tracing.ts` with the locked `DogpileSpan`, `DogpileSpanOptions`, `DogpileTracer`, `DOGPILE_SPAN_NAMES`, and `DogpileSpanName` surface.
- Added a co-located Vitest suite proving the four span names and structural assignability for span/tracer/options objects.
- Added `tracer?: DogpileTracer` to both `DogpileOptions` and `EngineOptions`.
- Root-exported the tracing types and `DOGPILE_SPAN_NAMES` from `src/index.ts`.
- Added `@opentelemetry/api@1.9.1` and `@opentelemetry/sdk-trace-base@2.7.1` as devDependencies only, with lockfile updates.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing tracing surface test** - `efdb53e` (test)
2. **Task 1 GREEN: Add tracing contract surface** - `3908540` (feat)
3. **Task 2: Expose tracer options and exports** - `87f6330` (feat)

## Files Created/Modified

- `src/runtime/tracing.ts` - Defines the import-free tracing bridge interfaces and locked span-name constants.
- `src/runtime/tracing.test.ts` - Covers span-name constants and structural type compatibility.
- `src/types.ts` - Adds a type-only `DogpileTracer` import and `tracer?: DogpileTracer` to `DogpileOptions` and `EngineOptions`.
- `src/index.ts` - Root-exports `DOGPILE_SPAN_NAMES` and the three tracing contract types.
- `package.json` - Adds OTEL packages under `devDependencies` only.
- `pnpm-lock.yaml` - Records the new devDependency graph.
- `.planning/codebase/STRUCTURE.md` - Records the new runtime tracing module.
- `.planning/codebase/STACK.md` - Records OTEL as dev/test-only dependencies.

## Decisions Made

- Kept `package.json` `exports` and `files` unchanged because Plan 03 owns `/runtime/tracing` package subpath wiring and package-export tests.
- Preserved the locked tracing JSDoc in `src/runtime/tracing.ts`; runtime import verification used import-statement greps so the required `@opentelemetry/*` documentation text is not mistaken for an import.

## TDD Gate Compliance

- **RED:** `efdb53e` added `src/runtime/tracing.test.ts`; `pnpm vitest run src/runtime/tracing.test.ts` failed because `./tracing.js` did not exist.
- **GREEN:** `3908540` added `src/runtime/tracing.ts`; the focused tracing suite passed.
- **REFACTOR:** Not needed.

## Deviations from Plan

None - implementation followed the planned surface and file boundaries.

## Issues Encountered

- The planned `grep -c '^export interface DogpileSpan'` check counts both `DogpileSpan` and `DogpileSpanOptions`; verification used `grep -c '^export interface DogpileSpan {'` to prove the intended exact interface declaration.
- The planned `grep -E "@opentelemetry|from .node:|fs/promises" src/runtime/tracing.ts` check matches the required JSDoc text. Verification used `grep -E '^import .*(@opentelemetry|node:|fs/promises)'` to prove there are no forbidden imports.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm vitest run src/runtime/tracing.test.ts` - passed, 4 tests.
- `pnpm run typecheck` - passed.
- `pnpm install --frozen-lockfile=false` - passed and updated `pnpm-lock.yaml`.
- `grep -c 'tracer?: DogpileTracer' src/types.ts` - `2`.
- `grep -c '^export interface DogpileSpan {' src/runtime/tracing.ts` - `1`.
- `grep -c '^export interface DogpileSpanOptions' src/runtime/tracing.ts` - `1`.
- `grep -c '^export interface DogpileTracer' src/runtime/tracing.ts` - `1`.
- `grep -E '^import .*(@opentelemetry|node:|fs/promises)' src/runtime/tracing.ts src/types.ts` - no matches.
- Package dependency check confirmed both OTEL packages are absent from `dependencies` and `peerDependencies`, and present only in `devDependencies`.

## Known Stubs

None.

## Next Phase Readiness

Ready for 09-02. The tracing contract and option surface now exist; Plan 02 can wire span lifecycle behavior into `engine.ts`.

## Self-Check: PASSED

- Found `src/runtime/tracing.ts`.
- Found `src/runtime/tracing.test.ts`.
- Found `.planning/phases/09-otel-tracing-bridge/09-01-SUMMARY.md`.
- Found RED commit `efdb53e`.
- Found GREEN commit `3908540`.
- Found Task 2 commit `87f6330`.

---
*Phase: 09-otel-tracing-bridge*
*Completed: 2026-05-01*
