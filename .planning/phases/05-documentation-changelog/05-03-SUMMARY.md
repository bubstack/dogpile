---
phase: 05-documentation-changelog
plan: 03
subsystem: examples
tags: [examples, runnable, openai-compatible, deterministic-provider, recursive-coordination]

requires:
  - phase: 01-delegate-decision-sub-run-traces
    provides: delegate decision parsing and embedded sub-run traces
  - phase: 03-provider-locality-bounded-concurrency
    provides: local provider clamp and sub-run-concurrency-clamped event
  - phase: 04-streaming-child-error-escalation
    provides: parentRunIds stream demux and structured child failure prompts
provides:
  - Runnable recursive coordination example under examples/recursive-coordination/
  - Deterministic default provider plus live OpenAI-compatible provider wiring
  - Example README mirroring the Hugging Face upload GUI example format
affects: [DOCS-02, examples, recursive-coordination]

tech-stack:
  added: []
  patterns: [consumer-style @dogpile/sdk example, deterministic provider fixture, env-gated live provider]

key-files:
  created:
    - examples/recursive-coordination/run.mjs
    - examples/recursive-coordination/README.md
    - examples/recursive-coordination/results/.gitkeep
  modified: []

key-decisions:
  - "Kept the deterministic provider inline instead of extracting examples/_lib/ because this is the first recursive-coordination example and sharing was not yet forced."
  - "The live-mode code path constructs createOpenAICompatibleProvider from env vars while keeping SDK runtime code env-free."
  - "Generated latest.json/latest.md during verification, then removed them from the worktree so only source/docs artifacts are committed."

patterns-established:
  - "Example runners may use deterministic local providers by default and env-gated OpenAI-compatible providers for live mode."
  - "Recursive coordination demos should show stream parentRunIds live and pile embedded child traces separately."

requirements-completed: [DOCS-02]

duration: 5min
completed: 2026-05-01
---

# Phase 5 Plan 03: Recursive Coordination Example Summary

**Runnable recursive-coordination example using the Hugging Face upload GUI mission with deterministic delegation, live OpenAI-compatible mode, failure surfacing, and local-provider clamp output**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-01T15:57:36Z
- **Completed:** 2026-05-01T16:02:55Z
- **Tasks:** 2
- **Files modified:** 4 including this summary

## Accomplishments

- Added `examples/recursive-coordination/run.mjs` as a single consumer-style `.mjs` script importing from `@dogpile/sdk`.
- Added deterministic default execution with no network or keys, plus live mode wired through `createOpenAICompatibleProvider`.
- Demonstrated `Dogpile.stream()` parentRunIds demux, `Dogpile.pile()` embedded child traces, an intentionally failing delegated child with structured failure prompt capture, and local provider concurrency clamping.
- Added `examples/recursive-coordination/README.md` with Run, Output, live env vars, artifact paths, and links to docs and the sibling Hugging Face example.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author recursive coordination runner** - `0293a4a` (feat)
2. **Task 2: Author example README** - `85b3ec7` (docs)

**Plan metadata:** pending final summary commit

## Files Created/Modified

- `examples/recursive-coordination/run.mjs` - 433-line runnable example with deterministic and OpenAI-compatible provider modes.
- `examples/recursive-coordination/README.md` - 62-line README mirroring the Hugging Face example structure.
- `examples/recursive-coordination/results/.gitkeep` - Tracks the empty results directory for runtime artifacts.
- `.planning/phases/05-documentation-changelog/05-03-SUMMARY.md` - Plan execution record.

## Decisions Made

- Kept deterministic helper logic inline; `examples/_lib/` extraction remains deferred until duplication grows.
- Used an explicit deterministic `provider-timeout` throw for the risk-audit child after a tiny-delay path, so the example reliably produces `sub-run-failed` and a structured failures block without network timing flakiness.
- Removed generated `results/latest.json` and `results/latest.md` after verification to keep the committed write set limited to plan-owned source/docs files.

## Deviations from Plan

None - plan executed within the declared scope.

## Issues Encountered

- Initial stream consumption used `handle.events`; the actual SDK stream handle is itself async iterable. Fixed the example to `for await (const event of handle)`.
- Reusing one stateful deterministic provider made the second demo pass skip delegation. Fixed by constructing an independent provider for each deterministic pass.
- A pure tiny-budget delay did not reliably fail the child in the deterministic harness, so the risk-audit child now throws a typed `DogpileError` after the delay while still including the tiny `budget.timeoutMs` delegate field.

## Verification

- `pnpm run build` - passed.
- `node examples/recursive-coordination/run.mjs` - passed; wrote `results/latest.json` and `results/latest.md`.
- Runtime artifact spot-check - passed: `failed=1`, `structuredPrompts=1`, `clamp=1`.
- `pnpm run typecheck` - passed.
- `pnpm run test` - passed: 45 passed, 1 skipped; 651 passed, 1 skipped.
- `package.json` files allowlist check - passed; no `examples/` entries.

## Known Stubs

None. Stub scan only found intentional empty defaults (`streamEvents = []`, `options = {}`, `liveEvents = []`) used as local initializers, not UI/data placeholders.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: live-provider-key-boundary | examples/recursive-coordination/run.mjs | Example reads `OPENAI_API_KEY` in live mode and passes it only to `createOpenAICompatibleProvider`; the provider object is not serialized into results. |

## User Setup Required

None for deterministic mode. Live mode requires `DOGPILE_EXAMPLE_PROVIDER=openai-compatible`, `DOGPILE_EXAMPLE_MODEL`, and `OPENAI_API_KEY`.

## Next Phase Readiness

DOCS-02 is satisfied for the example surface. Follow-on Phase 5 plans can link `examples/recursive-coordination/` from README and examples index without changing package allowlists.

## Self-Check: PASSED

- Created files exist: `run.mjs`, `README.md`, and `results/.gitkeep`.
- Task commits exist: `0293a4a`, `85b3ec7`.
- Shared tracking files intentionally not updated per orchestrator instruction.

---
*Phase: 05-documentation-changelog*
*Completed: 2026-05-01*
