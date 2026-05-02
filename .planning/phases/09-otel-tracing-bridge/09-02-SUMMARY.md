---
phase: 09-otel-tracing-bridge
plan: 02
subsystem: runtime
tags: [otel, tracing, engine, coordinator, streaming]

requires:
  - phase: 09-otel-tracing-bridge
    provides: DogpileTracer/DogpileSpan/DOGPILE_SPAN_NAMES contract surface
  - phase: 09-otel-tracing-bridge
    provides: Live delegating deterministic provider fixture
provides:
  - Engine-level Dogpile tracing span lifecycle
  - Child run parentSpan threading through coordinator dispatch
  - Streaming and non-streaming tracing parity
  - Replay tracing-free documentation comments
affects: [otel, runtime, coordinator, streaming, recursive-coordination]

tech-stack:
  added: []
  patterns:
    - Internal tracing helpers around runProtocol
    - Per-child sub-run span map keyed by planned childRunId
    - Agent-turn spans open on model-request and close on agent-turn

key-files:
  modified:
    - src/runtime/engine.ts
    - src/runtime/coordinator.ts

key-decisions:
  - "Allowed a narrow internal coordinator callback-shape change after checkpoint approval so the planned childRunId reaches engine.ts for deterministic Option A span lookup."
  - "Factored tracing into openRunTracing/handleTracingEvent/closeRunTracing and invoked it from runProtocol so delegated child runs get their own dogpile.run spans."
  - "Streaming parent tracing ignores events already carrying parentRunIds; child runProtocol invocations own child spans, preventing duplicate child spans in stream mode."

patterns-established:
  - "Tracing belongs in engine.ts helpers and uses protocol events as the lifecycle source; protocol runners stay free of OTEL imports."
  - "Child run span parentage is proven by passing the planned childRunId through coordinator callback input and looking up subRunSpansByChildId."

requirements-completed: [OTEL-01, OTEL-02, OTEL-03]

duration: 14 min
completed: 2026-05-02
---

# Phase 09 Plan 02: Engine Span Lifecycle Summary

**Engine tracing bridge for run, sub-run, agent-turn, and model-call spans across run() and stream() paths**

## Performance

- **Duration:** 14 min
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added internal `parentSpan?`, `subRunSpansByChildId?`, and `tracer?` plumbing to engine protocol options.
- Added a narrow coordinator callback input `runId` field so the planned child run id is available before recursive dispatch.
- Added `openRunTracing`, `handleTracingEvent`, and `closeRunTracing` helpers in `src/runtime/engine.ts`.
- Opened `dogpile.run` spans for top-level and delegated child protocol invocations.
- Opened `dogpile.sub-run` spans on `sub-run-started` and closed them on `sub-run-completed` / `sub-run-failed`.
- Opened `dogpile.agent-turn` spans on the first `model-request` for an agent and closed them on `agent-turn`, satisfying D-08 timing.
- Opened `dogpile.model-call` spans under the active agent-turn span, satisfying D-07 hierarchy.
- Threaded the same tracing path through streaming and non-streaming execution by wrapping `runProtocol`.
- Added replay/replayStream comments documenting that replay remains tracing-free.

## Task Commits

1. **Task 1: Thread child span parent lookup** - `6e59198` (feat)
2. **Tasks 2-3: Add engine tracing span lifecycle** - `63a8959` (feat)

## Files Modified

- `src/runtime/engine.ts` - Adds tracing helpers, tracer propagation, runProtocol wrapping, span lifecycle handling, and replay comments.
- `src/runtime/coordinator.ts` - Adds a narrow internal `runId` field to the coordinator callback input and passes the planned `childRunId`.

## Decisions Made

- **Checkpoint decision:** The original plan required Option A per-child lookup but assumed `childInput.runId` already existed. It did not. User approved a narrow `src/runtime/coordinator.ts` internal callback-shape change to pass the planned child id through.
- **Helper extraction:** Implemented shared helpers rather than duplicating the switch in both `runNonStreamingProtocol` and streaming `execute()`. This keeps stream/run parity enforced at one call site: `runProtocol`.
- **Child span ownership:** Child run spans are owned by child `runProtocol` tracing state. Parent tracing handles direct sub-run lifecycle events, while wrapped stream events with `parentRunIds` are ignored for span creation to prevent duplicates.

## Deviations from Plan

### Approved Checkpoint Deviation

**1. [Decision] Narrow coordinator callback-shape change**
- **Why:** `engine.ts` could not perform the planned `subRunSpansByChildId?.get(childRunId)` lookup because coordinator callback input did not expose the planned child id.
- **Resolution:** User selected Option 1. `src/runtime/coordinator.ts` now passes the planned `childRunId` as internal callback `runId`.
- **Impact:** Public API unchanged. Protocol behavior unchanged. The internal callback shape changed to enable deterministic parentSpan threading.

### Implementation Shape Deviation

**2. [Design] Tracing wrapper moved to runProtocol helper layer**
- **Why:** Plan 03's contract requires a child `dogpile.run` span parented under the `dogpile.sub-run` span. Child dispatch calls internal `runProtocol` directly, not `runNonStreamingProtocol`.
- **Resolution:** The tracing wrapper lives around `runProtocol`, so both top-level runs and delegated child runs open `dogpile.run` spans.
- **Impact:** Streaming and non-streaming paths share identical lifecycle code; tests without tracer remain unchanged.

## Issues Encountered

- Typecheck showed `trace.budget.termination` is a `TerminationCondition`, not a stop record with `reason`. The implementation now derives budget-stopped outcome from the actual `BudgetStopEvent.reason`.
- Subagent execution repeatedly produced out-of-phase Phase 10 planning commits. The orchestrator cleaned those in separate docs commits and completed Tasks 2-3 inline to keep 09-02 scoped.

## Verification

- `pnpm run typecheck` - passed.
- `pnpm run test` - passed: 54 files passed, 1 skipped; 730 tests passed, 1 skipped.
- Acceptance spot checks:
  - `DOGPILE_SPAN_NAMES` referenced in `src/runtime/engine.ts`.
  - `openRunTracing` and `handleTracingEvent` are invoked from `runProtocol`.
  - `@opentelemetry` does not appear in `src/runtime/engine.ts`.
  - replay and replayStream have tracing-free comments immediately before their exports.

## Known Stubs

None.

## Next Phase Readiness

Ready for 09-03. The engine now emits the span hierarchy that the public-surface and integration contract tests will lock down.

## Self-Check: PASSED

- Found `src/runtime/engine.ts`.
- Found `src/runtime/coordinator.ts`.
- Found `.planning/phases/09-otel-tracing-bridge/09-02-SUMMARY.md`.
- Found Task 1 commit `6e59198`.
- Found Tasks 2-3 commit `63a8959`.
- `pnpm run typecheck` and `pnpm run test` passed.

---
*Phase: 09-otel-tracing-bridge*
*Completed: 2026-05-02*
