# Phase 10: Metrics / Counters - Research

**Researched:** 2026-05-01
**Domain:** TypeScript SDK internal wiring — callback hook integration, cost/token aggregation
**Confidence:** HIGH (all findings from direct code inspection)

## Summary

This research answers Q-A through Q-G from the phase brief by reading the actual source code. All
findings are VERIFIED from file inspection with line citations — no ASSUMED claims.

The core pattern is already well-established by Phase 9 (OTEL tracing). Every question has a clear
answer rooted in that prior implementation. The metrics hook wiring is structurally identical to how
`DogpileTracer` was added: import from a new `src/runtime/metrics.ts` module, add to
`RunProtocolOptions` and both option interfaces, fire from the same try/catch/finally seams that
Phase 9 already uses for `closeRunTracing`.

**Primary recommendation:** Mirror the Phase 9 tracer pattern exactly. `runNonStreamingProtocol` is
the non-streaming integration seam; `execute()` is the streaming seam. Both already have
try/catch/finally blocks that correctly handle all terminal states — BUT the streaming seam has
a THIRD terminal path (`cancelRun()`) that bypasses the catch block and requires special handling.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: `MetricsHook` is a callback object with `onRunComplete?` and `onSubRunComplete?`
- D-02: `RunMetricsSnapshot` with 9 fields: outcome, inputTokens, outputTokens, costUsd,
  totalInputTokens, totalOutputTokens, totalCostUsd, turns, durationMs
- D-03: Fire-and-forget async hook — attach `.catch` but do NOT await
- D-04: `logger?: Logger` added to both `EngineOptions` and `DogpileOptions`; fallback to
  `console.error` when absent
- D-05: `turns` = count of `agent-turn` events in `trace.events`, own-only
- D-06: `durationMs` from `Date.now()` wall-clock
- D-07: Own/total split — `ownCostUsd = totalCostUsd - sum(nestedChildCostUsd)`
- D-08: Integration via `runProtocol` emit closure (sub-runs) + end of run seam (top-level)
- D-09: `metricsHook` and `logger` mirrored on both `EngineOptions` AND `DogpileOptions`
- D-10: Hook fires for ALL terminal states — completed, budget-stopped, aborted
- D-11: `/runtime/metrics` subpath — `src/runtime/metrics.ts` exports both types
- D-12: No root exports — types available only from `@dogpile/sdk/runtime/metrics`
- D-13: Frozen `metrics-snapshot-v1.json` fixture + `metrics-snapshot-v1.type-check.ts`

### Claude's Discretion
- Q-11 (sub-run-failed hook): Default recommendation is NO — skip for failed sub-runs
- Double-fire concern (Q-E): Planner resolves whether `onRunComplete` fires at all depths or only root

### Deferred Ideas (OUT OF SCOPE)
- `runId`, `depth`, `parentRunId` on snapshot
- Replay hook behavior (explicitly ignored, same as tracer)
- Per-turn hook
- `metricsHook` on `RunCallOptions`
- Built-in metric exporters

---

## Q-A: Logger Import Resolution

**Finding:** The `DogpileTracer` pattern is the exact precedent.

In `src/types.ts` line 1: `import type { DogpileTracer } from "./runtime/tracing.js";`

`DogpileTracer` is declared in `src/runtime/tracing.ts` and imported into `src/types.ts` via a
`type`-only import from `"./runtime/tracing.js"`. The same pattern applies to `Logger`:

```ts
// Top of src/types.ts — add alongside the existing DogpileTracer import:
import type { Logger } from "./runtime/logger.js";
```

`Logger` is currently only in `src/runtime/logger.ts` (lines 15-20). There is no conflict with
`exactOptionalPropertyTypes` — `import type` does not create a runtime value dependency.

**Confirmed pattern:** `import type { Logger } from "./runtime/logger.js"` at the top of
`src/types.ts`, alongside the existing `import type { DogpileTracer } from "./runtime/tracing.js"`.

Do NOT duplicate the interface or move it. The existing `@dogpile/sdk/runtime/logger` subpath already
exports `Logger` for callers who need an explicit type annotation.

[VERIFIED: src/types.ts line 1, src/runtime/logger.ts lines 15-20, src/runtime/tracing.ts]

---

## Q-B: Sub-run Start Time Tracking

**Finding:** ISO timestamps ARE available on both events and on `subResult.metadata`. The choice
between them is a semantic one: they measure different intervals.

`SubRunStartedEvent.at` (line 512) is an ISO-8601 timestamp.
`SubRunCompletedEvent.at` (line 555) is an ISO-8601 timestamp.
`subResult.metadata.startedAt` / `subResult.metadata.completedAt` are ISO-8601 strings on
`RunMetadata` (`src/types.ts` lines 1649-1653).

### Two valid approaches

**Approach A: D-06 wall-clock Map** — `Date.now()` at `sub-run-started`, `Date.now()` at
`sub-run-completed`. Measures the parent's observed dispatch interval, including any async overhead
between the parent receiving the `sub-run-started` event and the child actually starting. D-06
mandates this.

**Approach B: `subResult.metadata` timestamps** — `Date.parse(subResult.metadata.completedAt) - Date.parse(subResult.metadata.startedAt)`. Measures the sub-run's own execution boundary — set inside the child
run at its own entry/exit points. More precise for the child's self-reported duration. Eliminates
the in-flight Map that could leak if a sub-run starts but the parent aborts before completion.

**Semantic difference:** These are not equivalent — they answer different questions:
- Map approach = "how long did the parent wait for this child?" (parent-observed)
- metadata approach = "how long did the child run?" (child self-reported)

**Recommendation:** The Map approach is D-06 as locked. If the planner prefers the metadata approach
to eliminate Map leak risk, that is a trade-off decision to make before implementation. Both are
correct. If `completedAt` is an empty string (eventless run), fall back to 0.

[VERIFIED: src/types/events.ts lines 503-571, src/types.ts lines 1638-1653]

---

## Q-C: Own vs. Total Cost Derivation

**Finding:** `subResult.cost` is the rolled-up total (Phase 2 semantics). Own-cost derivation
requires inspecting nested `sub-run-completed` events inside `subResult.trace.events`.

### What `subResult.cost` contains

`SubRunCompletedEvent.subResult` is a full `RunResult`. `RunResult.cost` is a `CostSummary`
(`src/types.ts` lines 1691-1692) — this is the TOTAL cost of the child run including all of its own
nested sub-runs. This is directly `totalCostUsd` / `totalInputTokens` / `totalOutputTokens`.

### How to derive own costs

`subResult.trace.events` is `readonly RunEvent[]`. To compute own-only cost:

```ts
const nestedSubRunCosts = subResult.trace.events
  .filter((e): e is SubRunCompletedEvent => e.type === "sub-run-completed")
  .map(e => e.subResult.cost);

const ownCostUsd = subResult.cost.usd - nestedSubRunCosts.reduce((sum, c) => sum + c.usd, 0);
const ownInputTokens = subResult.cost.inputTokens - nestedSubRunCosts.reduce((sum, c) => sum + c.inputTokens, 0);
const ownOutputTokens = subResult.cost.outputTokens - nestedSubRunCosts.reduce((sum, c) => sum + c.outputTokens, 0);
```

This is the same arithmetic pattern described in D-07. `subResult.trace.events` contains only
direct-depth events for the child run (not its children's children) because each `sub-run-completed`
event nests the full child `RunResult` inside `subResult`, not flattened sibling events.

**Edge case:** If `subResult.trace.events` contains no `sub-run-completed` events, the child ran no
sub-runs — own cost equals total cost. The arithmetic is safe (subtracting 0).

**IMPORTANT:** For the TOP-LEVEL run's `onRunComplete`, own-cost must be derived from
`result.trace.events` (the full trace), not from `result.cost` directly. Same filter:
`result.trace.events.filter(e => e.type === "sub-run-completed")`.

[VERIFIED: src/types.ts lines 1670-1705, src/types/events.ts lines 547-571, src/runtime/coordinator.ts line 1544]

---

## Q-D: All-Terminals Hook Firing

**Finding:** `runNonStreamingProtocol` has a clean try/catch/finally structure. The correct
integration point for `onRunComplete` is inside the `try` block (for completed/budget-stopped) AND
inside the `catch` block (for aborted). The `finally` block is not the right place because it does
not have a `RunResult` available.

### Structure of `runNonStreamingProtocol` (lines 914-970)

```ts
async function runNonStreamingProtocol(options): Promise<RunResult> {
  const failureInstancesByChildRunId = new Map<string, DogpileError>();
  const abortLifecycle = createNonStreamingAbortLifecycle({ ... });

  try {
    // ... run protocol, assemble runResult ...
    return canonicalizeRunResult(await abortLifecycle.run(applyRunEvaluation(runResult, ...)));
    // ← HOOK FIRE POINT for completed/budget-stopped (before the return)
  } catch (error: unknown) {
    throw abortLifecycle.translateError(error);
    // ← HOOK FIRE POINT for aborted (after translateError, before re-throw)
  } finally {
    failureInstancesByChildRunId.clear();
    abortLifecycle.cleanup();
    // NOTE: No RunResult available here — wrong place for metrics
  }
}
```

### Available data at each terminal path

**Happy path (completed/budget-stopped):**
- Full `RunResult` available via `runResult` local variable
- `outcome` derived from `runResult.trace.events.find(e => e.type === "budget-stop")`:
  - If found: `"budget-stopped"`
  - If not: `"completed"`
- All counters available from `runResult.cost` and `runResult.trace.events`

**Error path (aborted/timeout):**
- No `RunResult` assembled
- The error is a `DogpileError` with `code: "aborted"` or `code: "timeout"`
- `durationMs` computable from `startedAtMs` captured at entry
- All token/cost counters are 0 or unavailable

**PLANNER DECISION POINT — partial costs for aborted runs:**
The `emittedEvents` array (line 929) is assembled inside the `try` block of `runNonStreamingProtocol`
(declared as `const emittedEvents: RunEvent[] = []`). It is NOT accessible in the `catch` block.
D-10 says "counters reflect partial work accumulated up to abort point."

If the planner wants partial token/cost data in the aborted snapshot, the implementation must hoist
`emittedEvents` declaration above the `try` block (before line 914's try opening) so it is in scope
at the catch site. This would allow summing `agent-turn` event costs from events that had already
been emitted before the abort. Without hoisting, the aborted snapshot must use zero counters.

The choice is:
- **Zero counters (simple):** No hoist needed. `outcome: "aborted"` with all numeric fields = 0.
- **Partial counters (D-10 intent):** Hoist `emittedEvents` above `try`. Derives token/cost from
  events emitted before abort. More complex; requires verifying that emittedEvents is populated
  before the throw point.

[VERIFIED: src/runtime/engine.ts lines 914-970, 1034-1046, 929]

---

## Q-E: Double-Fire Concern Resolution

**Finding:** The coordinator's `runProtocol` callback (lines 1113-1122) calls `runProtocol()`
directly for child runs WITHOUT passing `metricsHook`. This means the child's `runProtocol` call
does NOT fire `onRunComplete` unless `metricsHook` is explicitly threaded into the child's
`RunProtocolOptions`.

### How the coordinator dispatches child runs (lines 1113-1122)

```ts
runProtocol: (childInput) => {
  const { runId: childRunId, ...childProtocolInput } = childInput;
  const childParent = options.subRunSpansByChildId?.get(childRunId) ?? options.parentSpan;
  return runProtocol({
    ...childProtocolInput,
    protocol: normalizeProtocol(childProtocolInput.protocol),
    ...(options.tracer ? { tracer: options.tracer } : {}),  // ← tracer is threaded
    ...(childParent ? { parentSpan: childParent } : {})
  });
}
```

For the tracer, this threads `tracer` from parent into child — every `runProtocol` call opens its
own `runSpan` via `openRunTracing`. The tracer spans form a hierarchy.

**For metrics, the choice is:**

**Option A: Thread `metricsHook` into child `runProtocol` calls.**
- `onRunComplete` fires at every depth (child runs fire when they complete, same as OTEL spans)
- `onSubRunComplete` fires additionally in the parent's emit closure when `sub-run-completed` arrives
- Result: For each sub-run completion, the parent receives TWO callbacks: `onRunComplete` (child depth)
  and `onSubRunComplete` (parent perspective)
- Callers using only `onRunComplete` get metrics for every run in the tree
- Callers using only `onSubRunComplete` get parent-scoped sub-run metrics

**Option B: Do NOT thread `metricsHook` into child `runProtocol` calls.**
- `onRunComplete` fires only at root (depth 0) — no child run fires it
- `onSubRunComplete` fires in the parent emit closure for every child
- No double-fire; cleaner separation of concerns

**The double-fire issue:** If a caller provides BOTH `onRunComplete` and `onSubRunComplete`, Option A
means the caller gets:
1. `onRunComplete(childSnapshot)` — from the child's own `runProtocol` completion
2. `onSubRunComplete(childSnapshot)` — from the parent's emit closure

These snapshots represent the same sub-run but from slightly different construction paths. This
could cause double-counting if the caller sums both.

**Disagreement with CONTEXT.md `<specifics>` note:** The CONTEXT.md `<specifics>` section ends with
"likely `onRunComplete` fires for all depths" — this is Option A. This research recommends Option B
to avoid the double-fire surprise for callers who provide both `onRunComplete` and `onSubRunComplete`.
The OTEL tracer analogy (threaded at all depths) favors Option A, but the tracer does NOT have a
`onSubRunComplete` equivalent — spans are hierarchical without a separate parent-scoped callback.
The planner must make the final decision. If choosing Option A, add a JSDoc note warning callers
not to sum both callbacks.

[VERIFIED: src/runtime/engine.ts lines 1113-1122, 1010-1046]

---

## Q-F: `turns` Counter (Own-Only)

**Finding:** `trace.events` for a given `RunResult` contains only direct-depth events for that run.
Sub-run events are nested inside `SubRunCompletedEvent.subResult.trace.events`, not in the parent's
`trace.events`. Therefore filtering `trace.events` for `agent-turn` events already gives own-only
turns.

### TurnEvent shape (events.ts lines 318-339)

```ts
interface TurnEvent {
  readonly type: "agent-turn";
  readonly runId: string;
  readonly parentRunIds?: readonly string[];  // ← populated when bubbled through parent stream
  readonly at: string;
  readonly agentId: string;
  // ...
  readonly cost: CostSummary;
}
```

`parentRunIds` is set only when events are bubbled through a parent stream. In a completed
`RunResult.trace.events`, the events array contains only the events from that specific run execution.
Sub-run `agent-turn` events are in `SubRunCompletedEvent.subResult.trace.events`, not mixed into
the parent's event log.

### Counting turns

```ts
const turns = result.trace.events.filter(e => e.type === "agent-turn").length;
```

This is own-only by construction. No parentRunIds filter needed for non-streaming traces.

**Confirmed by Phase 9 precedent:** `closeRunTracing` at line 886 uses the identical pattern:
```ts
result.trace.events.filter((event) => event.type === "agent-turn").length
```

[VERIFIED: src/types/events.ts lines 318-339, src/runtime/engine.ts line 886]

---

## Q-G: Streaming Path Parity

**Finding:** The streaming `execute()` function (lines 238-346) has THREE terminal paths, not two.
The non-streaming path has two (try / catch). The streaming path adds a third: `cancelRun()`.

### Streaming terminal paths

**Path 1: try block (completed)**
- `resolveResult(finalizedResult)` is called at line 315
- Hook fires after `resolveResult` with `outcome: "completed"` snapshot
- `status` is `"completed"` at this point

**Path 2: catch block (error/timeout)**
- Entered when `runProtocol` or `applyRunEvaluation` throws
- But: `if (isStreamHandleStatus(status, "cancelled")) return;` at line 317 — if `cancelRun()` has
  already run, the catch block exits immediately WITHOUT calling `rejectResult` or any hook
- When `status` is NOT cancelled: `rejectResult(runtimeError)` is called at line 329
- Hook fires after `rejectResult` with `outcome: "aborted"` snapshot

**Path 3: `cancelRun()` (user cancel) — THE THIRD TERMINAL**
`cancelRun()` (lines 333-346) is called by `handle.cancel()`:
```ts
function cancelRun(cause?: unknown): void {
  if (status !== "running") { return; }
  const error = createStreamCancellationError(options.model.id, cause);
  abortController.abort(error);
  activeAbortDrain?.(error);
  publish(createStreamAbortedEvent(error, lastRunId));
  publish(createStreamErrorEvent(error, lastRunId));
  status = "cancelled";
  closeStream();
  rejectResult(error);
  // ← hook fire must happen HERE, or it never fires for cancelled runs
}
```

After `cancelRun()` sets `status = "cancelled"` and calls `rejectResult(error)`, the `try` block's
subsequent `.catch` fires but returns immediately at `if (isStreamHandleStatus(status, "cancelled")) return;`.
No hook call in the catch block runs.

**CRITICAL:** Unless the hook is fired INSIDE `cancelRun()`, `onRunComplete` NEVER fires for
cancelled streaming runs. D-10 requires the hook to fire for ALL terminal states.

### Recommended implementation for streaming

Option A: Fire directly in `cancelRun()`:
```ts
function cancelRun(cause?: unknown): void {
  // ... existing lines ...
  rejectResult(error);
  // FIRE cancelled hook
  if (options.metricsHook?.onRunComplete) {
    const snapshot = buildAbortedSnapshot(streamStartedAtMs);
    fireMetricsHook(options.metricsHook.onRunComplete, snapshot, routeMetricsError);
  }
}
```

Option B: Extract a `finalizeStream(outcome, result?, error?)` helper called from all three paths.

Option A is simpler and does not require restructuring existing code. Option B is cleaner but
involves refactoring `execute()` internals.

**For non-streaming path:** `cancelRun()` does not exist — the non-streaming path correctly covers
all terminals via try/catch. No additional work needed there.

### Phase 9 streaming path

For OTEL tracing, the streaming path threads `tracer` into `runProtocol(...)` (line 267). The
`runProtocol` function itself calls `closeRunTracing` in its own try/catch. This means spans are
closed within `runProtocol`, not in `execute()`. This means Phase 9 did NOT have the cancel-path
gap for spans — spans close at the `runProtocol` level regardless of how `execute()` terminates.

For `metricsHook`, `onRunComplete` is explicitly a run-level callback (not a span). It must fire
from `execute()` scope where `streamStartedAtMs` is available and the final outcome is known.

**Note on where `streamStartedAtMs` should be captured:** Line 244 defines `streamStartedAtMs = Date.now()`.
This is the correct start time to capture for `durationMs` in the streaming path. It is already
accessible inside `cancelRun()` because `cancelRun` is a closure over `execute()`'s scope.

[VERIFIED: src/runtime/engine.ts lines 238-346, 244, 267, 315-329, 333-346]

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MetricsHook/RunMetricsSnapshot types | `src/runtime/metrics.ts` | — | Pure types module, no Node deps |
| Logger import into types.ts | `src/types.ts` | — | Import type only, mirrors tracer pattern |
| Hook fire for top-level run (non-streaming) | `runNonStreamingProtocol` try/catch | — | Phase 9 seam |
| Hook fire for top-level run (streaming) | `execute()` try + catch + `cancelRun()` | — | Three terminal paths |
| Hook fire for sub-runs | emit closure in `runProtocol` | — | Intercept sub-run-completed |
| Sub-run start time tracking | Map or `subResult.metadata` | — | Map = parent-observed; metadata = child self-reported |
| Own cost derivation | inline in snapshot builder | `src/runtime/metrics.ts` helper | Pure arithmetic on trace.events |

---

## Confirmed Type Shapes

Based on code inspection, the D-02 type sketch is correct with one clarification about `turns`:

```ts
// src/runtime/metrics.ts

export interface RunMetricsSnapshot {
  readonly outcome: "completed" | "budget-stopped" | "aborted";
  readonly inputTokens: number;       // own: result.cost.inputTokens - sum(childSubRun.inputTokens)
  readonly outputTokens: number;      // own: result.cost.outputTokens - sum(childSubRun.outputTokens)
  readonly costUsd: number;           // own: result.cost.usd - sum(childSubRun.usd)
  readonly totalInputTokens: number;  // result.cost.inputTokens (already rolled-up)
  readonly totalOutputTokens: number; // result.cost.outputTokens
  readonly totalCostUsd: number;      // result.cost.usd
  readonly turns: number;             // trace.events.filter(e => e.type === "agent-turn").length
  readonly durationMs: number;        // Date.now() - startedAtMs
}

export interface MetricsHook {
  readonly onRunComplete?: (snapshot: RunMetricsSnapshot) => void | Promise<void>;
  readonly onSubRunComplete?: (snapshot: RunMetricsSnapshot) => void | Promise<void>;
}
```

**Corrections/clarifications to CONTEXT.md D-02 sketch:**
- `inputTokens`/`outputTokens`/`costUsd` = own (after child subtraction) — matches D-02
- `totalInputTokens`/`totalOutputTokens`/`totalCostUsd` = rolled-up total — matches D-02
- `turns` = own-only, confirmed safe by structure of `trace.events`

**For aborted runs** (no RunResult available):
```ts
// Minimal aborted snapshot when no RunResult is assembled
{
  outcome: "aborted",
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUsd: 0,
  turns: 0,
  durationMs: Date.now() - startedAtMs
}
```

See Q-D planner decision point: zero vs. partial counters for aborted runs.

---

## Integration Recipe (parallel to Phase 9 tracer)

### Step 1: Create `src/runtime/metrics.ts`

Export `MetricsHook` and `RunMetricsSnapshot` interfaces. Export helper functions:

```ts
// Pure helper — builds snapshot from a RunResult
export function buildRunSnapshot(result: RunResult, startedAtMs: number): RunMetricsSnapshot

// Pure helper — builds snapshot from a SubRunCompletedEvent's subResult
export function buildSubRunSnapshot(subResult: RunResult, durationMs: number): RunMetricsSnapshot

// Pure helper — builds minimal aborted snapshot
export function buildAbortedSnapshot(startedAtMs: number): RunMetricsSnapshot

// Helper — fires hook callback safely (fire-and-forget with error routing)
export function fireMetricsHook(
  callback: ((snapshot: RunMetricsSnapshot) => void | Promise<void>) | undefined,
  snapshot: RunMetricsSnapshot,
  onError: (err: unknown) => void
): void
```

Model `src/runtime/metrics.ts` structure after `src/runtime/provenance.ts` (pure TS, no Node deps,
no side effects).

### Step 2: Add types to `src/types.ts`

```ts
// Add at top alongside DogpileTracer import:
import type { Logger } from "./runtime/logger.js";
import type { MetricsHook } from "./runtime/metrics.js";

// Add to EngineOptions (after tracer field):
readonly metricsHook?: MetricsHook;
readonly logger?: Logger;

// Add to DogpileOptions (after tracer field):
readonly metricsHook?: MetricsHook;
readonly logger?: Logger;
```

### Step 3: Add to `RunProtocolOptions` in `engine.ts`

```ts
interface RunProtocolOptions {
  // ... existing fields ...
  readonly tracer?: EngineOptions["tracer"];    // already present
  readonly metricsHook?: MetricsHook;           // ADD
  readonly logger?: Logger;                     // ADD (for error routing)
  // ...
}
```

### Step 4: Wire in `runProtocol` emit closure

In `runProtocol()` (line 1018), inside the `emitForProtocol` function, add sub-run interception:

```ts
const subRunStartMsMap = new Map<string, number>();  // track start times

const emitForProtocol = (event: RunEvent): void => {
  if (tracing) handleTracingEvent(tracing, event);

  // Sub-run start time tracking
  if (event.type === "sub-run-started" && !event.parentRunIds) {
    subRunStartMsMap.set(event.childRunId, Date.now());
  }

  // Sub-run completed hook
  if (event.type === "sub-run-completed" && !event.parentRunIds && options.metricsHook) {
    const startMs = subRunStartMsMap.get(event.childRunId);
    const durationMs = startMs !== undefined
      ? Date.now() - startMs
      : Math.max(0,
          Date.parse(event.subResult.metadata.completedAt) -
          Date.parse(event.subResult.metadata.startedAt)
        );
    subRunStartMsMap.delete(event.childRunId);
    const snapshot = buildSubRunSnapshot(event.subResult, durationMs);
    fireMetricsHook(options.metricsHook.onSubRunComplete, snapshot, routeMetricsError);
  }

  options.emit?.(event);
};
```

### Step 5: Thread `metricsHook` (and `logger`) into coordinator's child `runProtocol` calls

Decision required (see Q-E for full tradeoff). Code for Option A (thread at all depths):

```ts
runProtocol: (childInput) => {
  const { runId: childRunId, ...childProtocolInput } = childInput;
  const childParent = options.subRunSpansByChildId?.get(childRunId) ?? options.parentSpan;
  return runProtocol({
    ...childProtocolInput,
    protocol: normalizeProtocol(childProtocolInput.protocol),
    ...(options.tracer ? { tracer: options.tracer } : {}),
    ...(childParent ? { parentSpan: childParent } : {}),
    // Option A (thread — fires onRunComplete at every depth):
    ...(options.metricsHook ? { metricsHook: options.metricsHook } : {}),
    ...(options.logger ? { logger: options.logger } : {}),
    // Option B (don't thread — onRunComplete fires only at root):
    // omit metricsHook here; onSubRunComplete still fires via emit closure
  });
}
```

### Step 6: Fire `onRunComplete` in `runNonStreamingProtocol`

```ts
async function runNonStreamingProtocol(options): Promise<RunResult> {
  const startedAtMs = Date.now();  // ADD — capture start time at top of function
  // ...
  try {
    // ... existing result assembly ...
    const finalResult = canonicalizeRunResult(await abortLifecycle.run(applyRunEvaluation(runResult, ...)));

    // FIRE completed/budget-stopped hook
    if (options.metricsHook?.onRunComplete) {
      const snapshot = buildRunSnapshot(finalResult, startedAtMs);
      fireMetricsHook(options.metricsHook.onRunComplete, snapshot, routeMetricsError);
    }

    return finalResult;
  } catch (error: unknown) {
    const translatedError = abortLifecycle.translateError(error);

    // FIRE aborted hook
    if (options.metricsHook?.onRunComplete) {
      const snapshot = buildAbortedSnapshot(startedAtMs);
      fireMetricsHook(options.metricsHook.onRunComplete, snapshot, routeMetricsError);
    }

    throw translatedError;
  } finally {
    failureInstancesByChildRunId.clear();
    abortLifecycle.cleanup();
  }
}
```

### Step 7: Fire `onRunComplete` in streaming `execute()` — ALL THREE PATHS

```ts
async function execute(): Promise<void> {
  // streamStartedAtMs already defined at line 244
  try {
    // ... existing logic ...
    resolveResult(finalizedResult);

    // PATH 1: completed
    if (options.metricsHook?.onRunComplete) {
      const snapshot = buildRunSnapshot(finalizedResult, streamStartedAtMs);
      fireMetricsHook(options.metricsHook.onRunComplete, snapshot, routeMetricsError);
    }
  } catch (error: unknown) {
    if (isStreamHandleStatus(status, "cancelled")) {
      return;  // PATH 3 already handled in cancelRun() — do NOT fire again
    }
    // ...
    rejectResult(runtimeError);

    // PATH 2: error/timeout
    if (options.metricsHook?.onRunComplete) {
      const snapshot = buildAbortedSnapshot(streamStartedAtMs);
      fireMetricsHook(options.metricsHook.onRunComplete, snapshot, routeMetricsError);
    }
  }

  function cancelRun(cause?: unknown): void {
    if (status !== "running") { return; }
    const error = createStreamCancellationError(options.model.id, cause);
    abortController.abort(error);
    activeAbortDrain?.(error);
    publish(createStreamAbortedEvent(error, lastRunId));
    publish(createStreamErrorEvent(error, lastRunId));
    status = "cancelled";
    closeStream();
    rejectResult(error);

    // PATH 3: user cancel — MUST fire here; catch block returns early after this
    if (options.metricsHook?.onRunComplete) {
      const snapshot = buildAbortedSnapshot(streamStartedAtMs);
      fireMetricsHook(options.metricsHook.onRunComplete, snapshot, routeMetricsError);
    }
  }
}
```

### Step 8: Thread from `createEngine` into `runNonStreamingProtocol` and `execute()`

In `createEngine.run()` (line 124), add to the options spread:

```ts
...(options.metricsHook ? { metricsHook: options.metricsHook } : {}),
...(options.logger ? { logger: options.logger } : {}),
```

Same in `createEngine.stream()` execute path (line 248).

### Step 9: `DogpileOptions` → `EngineOptions` passthrough

`withHighLevelDefaults` (line 1526) uses spread `...options`, so `metricsHook` and `logger` pass
through automatically to `createEngine(engineOptions)`. No changes needed here.

### Step 10: Replay guard

Add a comment at `replay()` and `replayStream()` call sites noting that `metricsHook` is intentionally
not used (parallel to the existing tracer comment at line 1197). No code change needed since
replay does not accept `EngineOptions`.

---

## `routeMetricsError` helper

In `runNonStreamingProtocol` and `execute()` scope, define:

```ts
function routeMetricsError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (options.logger) {
    try { options.logger.error("dogpile:metricsHook threw", { error: message }); } catch { /* swallow */ }
  } else {
    try { console.error("dogpile:metricsHook threw", { error: message }); } catch { /* swallow */ }
  }
}
```

---

## Common Pitfalls

### Pitfall 1: Missing the streaming cancel path

**What goes wrong:** Hook fires in `execute()`'s try and catch blocks only. `cancelRun()` sets
`status = "cancelled"` and calls `rejectResult`, then the catch block returns early at
`if (isStreamHandleStatus(status, "cancelled")) return;`. Result: cancelled streaming runs never
fire `onRunComplete`, violating D-10.

**How to avoid:** Fire the aborted snapshot inside `cancelRun()` before the function returns.
Verify with a test that explicitly calls `handle.cancel()` and asserts the hook was called.

**Warning signs:** Test with `handle.cancel()` shows zero hook invocations.

### Pitfall 2: Threading `metricsHook` into child `runProtocol` causes double-fire

**What goes wrong:** `onRunComplete` fires for sub-runs AND `onSubRunComplete` fires in the parent's
emit closure. Callers summing both callbacks double-count.

**How to avoid:** Choose Option B — do NOT thread `metricsHook` into the child `runProtocol` closure.
Only the root run fires `onRunComplete`; parent emit closure fires `onSubRunComplete`.

**Warning signs:** Integration test showing two hook calls per sub-run completion.

### Pitfall 3: `exactOptionalPropertyTypes` spread failures

**What goes wrong:** `{ ...options, metricsHook: options.metricsHook }` assigns `undefined` when
the field is absent, which fails under `exactOptionalPropertyTypes`.

**How to avoid:** Use conditional spread: `...(options.metricsHook ? { metricsHook: options.metricsHook } : {})`.
Every existing Phase 9 tracer spread uses this pattern (engine.ts lines 138, 267, 1119).

### Pitfall 4: Awaiting the async hook in the catch block delays error propagation

**What goes wrong:** Using `await metricsHook.onRunComplete?.(snapshot)` in the catch block before
re-throwing delays the error being visible to callers.

**How to avoid:** D-03: fire-and-forget. Call the hook synchronously, attach `.catch`, never await.
The `fireMetricsHook` helper enforces this.

### Pitfall 5: `startedAtMs` not captured before the abort lifecycle setup

**What goes wrong:** If `startedAtMs` is captured inside the `try` block after `abortLifecycle`
setup, the duration includes lifecycle overhead.

**How to avoid:** Capture `startedAtMs = Date.now()` at the TOP of `runNonStreamingProtocol`, before
the `try` block. This matches the `createEngine.run()` pattern (line 120).

---

## Validation Architecture

**Test framework:** Vitest (existing).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| METR-01 | `onRunComplete` fires on completed run with correct counters | unit | `pnpm vitest run src/tests/metrics-hook.test.ts -x` | New file |
| METR-01 | `onRunComplete` fires on budget-stopped run with `outcome: "budget-stopped"` | unit | same | |
| METR-01 | `onRunComplete` fires on aborted run with `outcome: "aborted"` | unit | same | |
| METR-01 | `onRunComplete` fires on cancelled streaming run with `outcome: "aborted"` | unit | same | Cancel path — NEW |
| METR-01 | `onSubRunComplete` fires once per child sub-run completion | unit | same | |
| METR-01 | No hook call overhead when `metricsHook` absent | unit | same | |
| METR-02 | `logger.error` called when hook throws synchronously | unit | same | |
| METR-02 | Async hook error does not propagate; run result unaffected | unit | same | |
| — | `metrics-snapshot-v1.json` fixture round-trips through type check | snapshot | `pnpm vitest run src/tests/metrics-snapshot-shape.test.ts -x` | New file |
| — | `/runtime/metrics` subpath present in package exports | contract | `pnpm vitest run src/tests/package-exports.test.ts -x` | Update existing |

### Wave 0 Gaps

- [ ] `src/tests/metrics-hook.test.ts` — covers METR-01, METR-02; must include cancel-path test
- [ ] `src/tests/metrics-snapshot-shape.test.ts` — covers D-13 fixture
- [ ] `src/tests/fixtures/metrics-snapshot-v1.json` — frozen fixture
- [ ] `src/tests/fixtures/metrics-snapshot-v1.type-check.ts` — compile-time assertion
- [ ] `src/runtime/metrics.ts` — the new module

---

## Open Questions

1. **Double-fire resolution (Q-E)**
   - What we know: Not threading `metricsHook` into child `runProtocol` avoids double-fire
   - What's unclear: Whether callers might want per-depth `onRunComplete` calls for tree-level metrics
   - CONTEXT.md leans toward Option A ("uniform" intent matching tracer behavior)
   - This research recommends Option B to prevent double-counting for callers using both callbacks
   - Planner makes the final call; if Option A, add JSDoc warning

2. **Aborted run counter strategy (Q-D)**
   - What we know: `emittedEvents` is local to the `try` block — zero counters at catch site
   - D-10 says "counters reflect partial work"
   - Planner must decide: hoist `emittedEvents` for partial data, or use zero counters
   - Hoisting is straightforward; deriving partial tokens requires verifying populated state

3. **`sub-run-failed` hook (Q-11)**
   - What we know: `SubRunFailedEvent` has `partialCost: CostSummary` and `partialTrace: Trace`
   - Recommendation: Skip for Phase 10 (as noted in CONTEXT.md deferred)

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — code-only changes)

---

## Sources

### Primary (HIGH confidence — verified from source files)
- `src/types.ts` — `EngineOptions`, `DogpileOptions`, `RunProtocolOptions`, `SubRunCompletedEvent`,
  `RunResult`, `CostSummary`, `RunMetadata` interfaces; DogpileTracer import pattern
- `src/types/events.ts` — `TurnEvent`, `SubRunStartedEvent`, `SubRunCompletedEvent`,
  `SubRunFailedEvent`, `BudgetStopEvent` shapes
- `src/runtime/engine.ts` — `RunProtocolOptions`, `runNonStreamingProtocol`, `runProtocol`,
  `execute()`, `cancelRun()`, coordinator child dispatch, `closeRunTracing` pattern
- `src/runtime/logger.ts` — `Logger` interface, `noopLogger`
- `src/runtime/tracing.ts` — `DogpileTracer`, `DogpileSpan` shapes (reference for metrics.ts)
- `src/runtime/coordinator.ts` — `subResult.cost` rollup semantics, `sub-run-completed` emission

---

## Metadata

**Confidence breakdown:**
- Type shapes: HIGH — all interfaces read directly from source
- Integration recipe: HIGH — directly parallels Phase 9 tracer pattern
- Cancel-path finding: HIGH — verified from engine.ts lines 317, 333-346 (catch early-return + cancelRun structure)
- Double-fire recommendation: HIGH — based on actual code path analysis
- Own-cost derivation: HIGH — confirmed from coordinator sub-run-completed emission pattern

**Research date:** 2026-05-01
**Valid until:** Changes to engine.ts try/catch structure, RunProtocolOptions, `cancelRun()`, or coordinator dispatch would invalidate wiring steps
