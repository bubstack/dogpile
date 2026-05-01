---
phase: 03-provider-locality-bounded-concurrency
plan: 01
subsystem: provider
tags: [provider, locality, validation, openai-compatible, tdd]

requires:
  - phase: 03-provider-locality-bounded-concurrency
    provides: Phase 3 D-01..D-04 decisions and host classifier fixture list
provides:
  - ConfiguredModelProvider metadata.locality public type surface
  - OpenAI-compatible baseURL locality auto-detection
  - Construct-time and run-start locality validation
  - Asymmetric remote override guard for detected-local hosts
affects: [03-02-bounded-dispatch, 03-03-local-provider-clamping]

tech-stack:
  added: []
  patterns:
    - readonly provider metadata hints
    - pure hostname classification helper
    - defense-in-depth runtime validation

key-files:
  created:
    - .planning/phases/03-provider-locality-bounded-concurrency/03-01-SUMMARY.md
  modified:
    - src/types.ts
    - src/providers/openai-compatible.ts
    - src/providers/openai-compatible.test.ts
    - src/runtime/validation.ts
    - src/runtime/engine.ts
    - src/tests/config-validation.test.ts

key-decisions:
  - "D-01 landed as ConfiguredModelProvider.metadata.locality, with omitted metadata treated as remote by consumers."
  - "D-02 landed as exported pure classifyHostLocality with loopback, RFC1918, link-local, IPv6 ULA/link-local, and .local mDNS coverage."
  - "D-03 landed as adapter construct-time validation plus engine run-start validateProviderLocality."
  - "D-04 landed as remote-override-on-local-host invalid-configuration guard."

patterns-established:
  - "Provider hints live under metadata so future hints can extend without flattening the provider boundary."
  - "Local host detection is string-only and side-effect-free; no DNS or network resolution is introduced."

requirements-completed: [PROVIDER-01, PROVIDER-02, PROVIDER-03]

duration: 4min
completed: 2026-05-01
---

# Phase 03 Plan 01: Provider Locality Summary

**Provider locality metadata with OpenAI-compatible host auto-detection and dual validation gates**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-01T01:27:09Z
- **Completed:** 2026-05-01T01:31:05Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `ConfiguredModelProvider.metadata?.locality` as the public provider hint for later concurrency clamping.
- Added `classifyHostLocality` and wired OpenAI-compatible providers to auto-set `metadata.locality`.
- Added construct-time invalid-locality validation and the asymmetric `remote-override-on-local-host` guard.
- Added engine run-start validation for user-implemented providers that bypass adapter construction.
- Locked the behavior with provider adapter tests and config validation tests.

## Task Commits

1. **Task 2 RED: locality coverage** - `4f4ae93` (test)
2. **Task 1 GREEN: provider locality implementation** - `eef00ff` (feat)

_Note: The plan's two TDD tasks were executed as a RED test commit followed by the GREEN implementation commit._

## Files Created/Modified

- `src/types.ts` - Adds optional readonly `metadata.locality` to `ConfiguredModelProvider`.
- `src/providers/openai-compatible.ts` - Adds `locality` option, `classifyHostLocality`, metadata assignment, invalid-value validation, and remote-on-local override rejection.
- `src/providers/openai-compatible.test.ts` - Adds classifier fixture table and adapter metadata/override tests.
- `src/runtime/validation.ts` - Adds exported `validateProviderLocality`.
- `src/runtime/engine.ts` - Calls `validateProviderLocality` from reusable engine run and stream starts.
- `src/tests/config-validation.test.ts` - Adds invalid user-provider locality coverage for high-level and reusable engine paths.
- `.planning/phases/03-provider-locality-bounded-concurrency/03-01-SUMMARY.md` - Captures execution results.

## Decisions Made

- Tightened IPv4 local-range checks to full dotted IPv4-shaped hosts so `127.0.0.1.example.com` remains remote.
- Kept locality validation separate from provider registration and wired it at run start, preserving the plan's defense-in-depth boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Anchored IPv4 classifier against hostname spoofing**
- **Found during:** Task 1 GREEN verification
- **Issue:** Broad prefix regexes classified `127.0.0.1.example.com` as local.
- **Fix:** Required full dotted IPv4-shaped hostnames for local IPv4 ranges.
- **Files modified:** `src/providers/openai-compatible.ts`
- **Verification:** `pnpm vitest run src/providers/openai-compatible.test.ts src/tests/config-validation.test.ts`
- **Committed in:** `eef00ff`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Improved correctness for the explicit spoofing case in the threat register; no scope expansion.

## Issues Encountered

- Standalone `pnpm exec tsx -e ...` smoke could not run because `tsx` is not installed. The same `192.168.*` and localhost locality behavior is covered by the focused Vitest provider tests.

## Verification

- `pnpm vitest run src/providers/openai-compatible.test.ts` - passed, 33 tests.
- `pnpm vitest run src/tests/config-validation.test.ts` - passed, 101 tests.
- `pnpm vitest run src/providers/openai-compatible.test.ts src/tests/config-validation.test.ts` - passed, 134 tests.
- `pnpm run typecheck` - passed.
- Acceptance greps passed for `metadata`, `classifyHostLocality`, `remote-override-on-local-host`, `validateProviderLocality`, engine call sites, and `model.metadata.locality`.
- Stub scan found no blocking placeholders in created/modified behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 03-02 can read `provider.metadata?.locality` immediately. Plan 03-03 can build the local-provider clamp on top of the same field and the `provider.metadata?.locality === "local"` consumer pattern.

## Self-Check: PASSED

- Summary file exists.
- Task commits exist: `4f4ae93`, `eef00ff`.
- Key modified files exist.

---
*Phase: 03-provider-locality-bounded-concurrency*
*Completed: 2026-05-01*
