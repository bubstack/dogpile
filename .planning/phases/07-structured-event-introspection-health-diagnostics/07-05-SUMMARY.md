---
phase: 07-structured-event-introspection-health-diagnostics
plan: "05"
subsystem: observability
tags: [public-surface, package-exports, health-diagnostics, event-introspection]

requires:
  - phase: 07-structured-event-introspection-health-diagnostics
    provides: 07-01 through 07-04 health/introspection contracts, implementations, and result attachment
provides:
  - Root exports for AnomalyCode, HealthAnomaly, and RunHealthSummary
  - Published runtime subpaths for @dogpile/sdk/runtime/health and @dogpile/sdk/runtime/introspection
  - Package export tests covering the new subpaths and source-map allowlist
  - Phase 7 changelog and CLAUDE.md public-surface invariant documentation
affects: [phase-8-audit-event-schema, package-exports, release-gates]

tech-stack:
  added: []
  patterns:
    - Public runtime subpaths include exports, package files, package export tests, changelog, and invariant docs in lockstep
    - Embedded RunResult contract checks assert required derived fields such as health

key-files:
  created:
    - .planning/phases/07-structured-event-introspection-health-diagnostics/07-05-SUMMARY.md
  modified:
    - src/index.ts
    - package.json
    - src/tests/package-exports.test.ts
    - src/tests/event-schema.test.ts
    - CHANGELOG.md
    - CLAUDE.md

key-decisions:
  - "The new health and introspection runtime modules are first-class package subpaths."
  - "The package files allowlist includes the new source files because published source maps reference them."
  - "Phase 7 made no new RunEvent variants; event-schema coverage only locks embedded RunResult.health."

patterns-established:
  - "New runtime subpaths must update package.json exports, package.json files, package-exports tests, changelog, and invariant documentation together."
  - "Package source-map failures are packaging correctness issues, even when the dist glob already includes emitted JavaScript."

requirements-completed:
  - INTR-01
  - INTR-02
  - HLTH-01
  - HLTH-02

duration: 8 min
completed: 2026-05-01
---

# Phase 07 Plan 05: Public-Surface Lockstep Summary

**Health diagnostics and event introspection are now published through root types, runtime subpaths, package export tests, changelog, and invariant docs**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-01T21:18:19Z
- **Completed:** 2026-05-01T21:25:23Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `AnomalyCode`, `HealthAnomaly`, and `RunHealthSummary` to the root `@dogpile/sdk` type export block.
- Added `./runtime/health` and `./runtime/introspection` to package exports, with package export tests asserting both subpaths and their types/functions.
- Updated the package source allowlist so the new runtime modules satisfy the published source-map guard.
- Added a Phase 7 changelog section for `queryEvents`, `computeHealth`, `result.health`, new subpaths, root health types, and the frozen anomaly fixture.
- Updated `CLAUDE.md` with the Phase 7 public-surface invariant chain.
- Added event-schema coverage that embedded `SubRunCompletedEvent.subResult.health` is present and JSON-stable.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add health types to root export** - `fc7655d` (feat)
2. **Task 2: Add subpath exports and package export coverage** - `b837e1e` (feat)
3. **Task 3: Update event schema, changelog, and invariant docs** - `c56129b` (docs)

## Files Created/Modified

- `src/index.ts` - Re-exports `AnomalyCode`, `HealthAnomaly`, and `RunHealthSummary` from the root public surface.
- `package.json` - Adds `./runtime/health` and `./runtime/introspection` exports and includes their source files for source-map packaging.
- `src/tests/package-exports.test.ts` - Asserts the new exports, source allowlist entries, runtime subpath imports, and root health type exports.
- `src/tests/event-schema.test.ts` - Locks embedded `RunResult.health` presence and round-trip behavior on `sub-run-completed`.
- `CHANGELOG.md` - Documents Phase 7 public-surface additions.
- `CLAUDE.md` - Adds the Phase 7 public-surface invariant mirror.

## Decisions Made

- `./runtime/health` and `./runtime/introspection` follow the existing subpath pattern with `types`, `import`, and `default` entries.
- The `files` allowlist includes `src/runtime/health.ts` and `src/runtime/introspection.ts` because the release source-map guard requires packaged source references to resolve.
- `event-schema.test.ts` did not gain new event variants; it only now asserts the required `health` field on embedded `RunResult` values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added new runtime source files to package files allowlist**
- **Found during:** Task 2 (Add subpath exports to package.json + update package-exports.test.ts)
- **Issue:** The plan expected no `files` change, but `pnpm vitest run src/tests/package-exports.test.ts` failed because published source maps referenced `src/runtime/health.ts` and `src/runtime/introspection.ts`, which were not packed.
- **Fix:** Added both source files to `package.json#files` and the exact package export test mirror.
- **Files modified:** `package.json`, `src/tests/package-exports.test.ts`
- **Verification:** `pnpm vitest run src/tests/package-exports.test.ts` passed; `pnpm run verify` passed.
- **Committed in:** `b837e1e`

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** The deviation keeps the new public subpaths publishable under the existing source-map release gate. No product scope was added.

## Issues Encountered

- The local `gsd-sdk query state.load` command returned no usable output in this runtime, matching prior Phase 7 summaries, so planning state updates were applied directly to markdown files.
- A git index lock appeared after parallel staging attempts; it cleared with no live lock file, and remaining files were staged sequentially.
- Unrelated Phase 8/9 planning changes landed during execution; they were left untouched.

## Known Stubs

None.

## Threat Flags

None. The only trust-boundary surface added was the planned npm package subpath export surface, covered by `package-exports.test.ts` and `pnpm run verify`.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm run typecheck` - passed.
- `pnpm run build` - passed.
- `pnpm vitest run src/tests/package-exports.test.ts` - passed, 35 tests.
- `pnpm run verify` - passed: package identity, build, package artifacts, packed quickstart smoke, typecheck, and full Vitest suite.
- `grep -c "AnomalyCode\|HealthAnomaly\|RunHealthSummary" src/index.ts` - returned `3`.
- `grep "runtime/introspection" package.json` - returned the subpath plus types/import/default entries.
- `grep "runtime/health" package.json` - returned the subpath plus types/import/default entries.
- `grep "queryEvents" CHANGELOG.md` - returned the Phase 7 changelog entry.
- `grep "result.health" CHANGELOG.md` - returned the Phase 7 changelog entry.

## Next Phase Readiness

Phase 7 is complete. Phase 8 audit schema work can depend on stable `queryEvents`, `computeHealth`, required `RunResult.health`, and package export lockstep patterns.

## Self-Check: PASSED

- Confirmed key files exist: `src/index.ts`, `src/tests/package-exports.test.ts`, `src/tests/event-schema.test.ts`, and this summary.
- Confirmed task commits exist: `fc7655d`, `b837e1e`, and `c56129b`.
- Confirmed plan-level verification passed: `pnpm run verify`, targeted package export tests, build, typecheck, and required greps.

---
*Phase: 07-structured-event-introspection-health-diagnostics*
*Completed: 2026-05-01*
