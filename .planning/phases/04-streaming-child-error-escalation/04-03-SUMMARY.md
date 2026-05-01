---
phase: 04-streaming-child-error-escalation
plan: 03
subsystem: runtime
tags: [coordinator-prompt, child-failures, config-validation, public-surface]

requires:
  - phase: 04-streaming-child-error-escalation
    provides: stream-only child bubbling and synthetic cancel-drain failure vocabulary
  - phase: 03-provider-locality-bounded-concurrency
    provides: bounded delegate dispatch and sibling-failed synthetic event semantics
provides:
  - enriched coordinator child-failure prompt text with error code and spent cost
  - structured `## Sub-run failures since last decision` JSON roster
  - public `onChildFailure?: "continue" | "abort"` config on engine, high-level, and per-run surfaces
  - abort-mode triggering failure snapshot for 04-04 throw handling
affects: [04-streaming-child-error-escalation, 05-documentation-changelog]

tech-stack:
  added: []
  patterns:
    - prompt-only DispatchWaveFailure roster excluding synthetic failure reasons
    - config resolution helper with per-run > engine > default precedence

key-files:
  created:
    - .planning/phases/04-streaming-child-error-escalation/04-03-SUMMARY.md
  modified:
    - src/runtime/coordinator.ts
    - src/runtime/engine.ts
    - src/runtime/validation.ts
    - src/runtime/defaults.ts
    - src/types.ts
    - src/runtime/coordinator.test.ts
    - src/tests/config-validation.test.ts

key-decisions:
  - "Failure prompt cost uses `.toFixed(3)` in the enriched line."
  - "Structured failure roster shape is `{ childRunId, intent, error: { code, message, detail?: { reason } }, partialCost: { usd } }` with no partialTrace."
  - "Synthetic failure exclusion uses `error.detail.reason === sibling-failed | parent-aborted`."
  - "Abort-mode handoff field is `triggeringFailureForAbortMode`."

patterns-established:
  - "Prompt context for child failures is rendered only for the most recent dispatch wave and omitted entirely when empty."
  - "`onChildFailure` resolves as per-run option > engine option > default `continue`."

requirements-completed: [ERROR-01]

duration: 8min
completed: 2026-05-01
---

# Phase 04 Plan 03: Coordinator Failure Context Summary

**Coordinator child failures now reach the next plan turn as enriched text plus a prompt-safe structured JSON roster, with fail-fast `onChildFailure` support**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-01T14:15:10Z
- **Completed:** 2026-05-01T14:22:46Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Enriched child failure prompt text to `[sub-run <id> failed | code=<code> | spent=$<usd.toFixed(3)>]: <message>`.
- Added `buildFailuresSection()` under `## Sub-run failures since last decision`, rendering JSON with only `childRunId`, `intent`, `error.code`, `error.message`, optional `error.detail.reason`, and `partialCost.usd`.
- Excluded synthetic `sibling-failed` and `parent-aborted` failures from the structured roster.
- Added public `onChildFailure?: "continue" | "abort"` config on `DogpileOptions`, `EngineOptions`, and `RunCallOptions`, with validation and resolver coverage.
- Added abort-mode short-circuiting that skips the follow-up plan turn after a real child failure and snapshots `triggeringFailureForAbortMode`.

## Task Commits

1. **RED: failure context and onChildFailure tests** - `143fdbb` (test)
2. **GREEN: coordinator failure context and config plumbing** - `c63b7d5` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `src/runtime/coordinator.ts` - Builds prompt-safe failure rosters, enriches failure tagged text, filters synthetic failures, and stores abort-mode trigger snapshots.
- `src/runtime/engine.ts` - Resolves and threads `onChildFailure` through run, stream, and recursive child protocol calls.
- `src/runtime/validation.ts` - Validates `onChildFailure` literals with `invalid-configuration` and `reason: "invalid-on-child-failure"`.
- `src/runtime/defaults.ts` - Adds `resolveOnChildFailure(runOption, engineOption)`.
- `src/types.ts` - Adds `OnChildFailureMode`, option fields, and the abort-mode snapshot handoff shape.
- `src/runtime/coordinator.test.ts` - Locks enriched text, JSON roster shape, empty omission, synthetic exclusion, continue mode, and abort mode.
- `src/tests/config-validation.test.ts` - Locks validation and public option typing.
- `.planning/phases/04-streaming-child-error-escalation/04-03-SUMMARY.md` - Records execution outcome.

## Decisions Made

- Used `.toFixed(3)` for the enriched failure-line spend token.
- Stored the abort-mode trigger as `triggeringFailureForAbortMode` on the trace handoff shape so 04-04 has a concrete field to wire into throw behavior.
- Used `error.detail.reason` as the synthetic-vs-real distinguisher: `sibling-failed` and `parent-aborted` are excluded; all other child failures are eligible.
- Kept `partialTrace` out of the structured prompt path entirely; it remains only on `sub-run-failed` events.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The RED tests initially assumed a failed child had `$0.003` partial spend. Existing runtime semantics only count cost-bearing events emitted before the child throws, so these failure fixtures correctly produce `$0.000`. The tests were aligned to the actual `partialCost.usd` contract during GREEN.

## Known Stubs

None.

## Threat Flags

None - no new network endpoints, auth paths, file access patterns, or trust-boundary schema changes were introduced.

## Verification

- `pnpm vitest run src/runtime/coordinator.test.ts -t "transcript enrichment"`
- `pnpm vitest run src/runtime/coordinator.test.ts -t "structured failures section"`
- `pnpm vitest run src/runtime/coordinator.test.ts -t "empty.*failures"`
- `pnpm vitest run src/runtime/coordinator.test.ts -t "synthetic exclusion"`
- `pnpm vitest run src/tests/config-validation.test.ts -t "onChildFailure"`
- `pnpm vitest run src/runtime/coordinator.test.ts -t "abort.*short-circuit"`
- `pnpm vitest run src/runtime/coordinator.test.ts -t "continue.*unaffected"`
- `pnpm run typecheck`
- `pnpm vitest run src/runtime/coordinator.test.ts src/tests/config-validation.test.ts`
- `pnpm run verify`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 04-04 throw and timeout discrimination. The coordinator now records `triggeringFailureForAbortMode`, and real child failures are distinguishable from synthetic bookkeeping failures for ERROR-02 throw selection.

## Self-Check: PASSED

- Summary file exists.
- Task commits exist: `143fdbb`, `c63b7d5`.
- Plan verification passed: `pnpm run verify`.

---
*Phase: 04-streaming-child-error-escalation*
*Completed: 2026-05-01*
