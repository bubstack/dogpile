---
phase: 01-delegate-decision-sub-run-traces
plan: 03
type: execute
wave: 3
depends_on: ["01-01", "01-02"]
files_modified:
  - src/runtime/coordinator.ts
  - src/runtime/engine.ts
  - src/runtime/coordinator.test.ts
autonomous: true
requirements: [DELEGATE-02, TRACE-01, TRACE-02]
status: ready
must_haves:
  truths:
    - "When the coordinator agent's plan turn returns a delegate decision, runtime invokes `runProtocol` recursively as a sub-run with the same provider object."
    - "Parent emits `sub-run-started` BEFORE child engine spins up and `sub-run-completed` (or `sub-run-failed`) AFTER child finishes."
    - "Child output is injected into the next coordinator prompt as both a synthetic transcript entry (`agentId: 'sub-run:<id>'`, `role: 'delegate-result'`) AND tagged text matching D-17 (`[sub-run <id>]: <output>` + stats line)."
    - "Child inherits parent provider object verbatim (D-11); child timeoutMs default = parent.deadline - now (or undefined if parent uncapped, per planner-resolved Q3); cost-cap not propagated."
    - "`recursive: true` flag is set on `sub-run-started` when both parent and child protocol are `coordinator` (D-16)."
    - "Phase 1 limits delegation to the coordinator's PLAN turn only (planner-resolved Q1)."
  artifacts:
    - path: "src/runtime/coordinator.ts"
      provides: "Delegate dispatch loop in plan turn; sub-run event emission; transcript+prompt injection"
      contains: "sub-run-started"
    - path: "src/runtime/engine.ts"
      provides: "runProtocol accepts and threads currentDepth (default 0)"
      contains: "currentDepth"
    - path: "src/runtime/coordinator.test.ts"
      provides: "Delegate happy-path, sub-run-failed, recursive flag, provider inheritance, model-id mismatch"
  key_links:
    - from: "src/runtime/coordinator.ts plan turn"
      to: "src/runtime/engine.ts runProtocol"
      via: "recursive call with currentDepth+1"
      pattern: "runProtocol\\("
    - from: "src/runtime/coordinator.ts dispatch"
      to: "transcript + next-prompt construction"
      via: "synthetic TranscriptEntry + tagged prompt text"
      pattern: "sub-run:"
---

<objective>
Build the coordinator dispatch loop. When the coordinator's plan turn returns a `delegate` decision, validate at dispatch time, emit `sub-run-started`, recursively invoke `runProtocol` with the parent's provider, capture the child `RunResult`, emit `sub-run-completed` (or `sub-run-failed` on throw), inject the result as a synthetic transcript entry + tagged prompt text, and re-issue a coordinator turn until a `participate` decision (or worker phase) is reached.

Purpose: This is the largest control-flow change in Phase 1 (RESEARCH §1: coordinator is a rigid 3-phase pipeline today). Plan 04 owns `maxDepth`/`EngineOptions` plumbing; this plan threads `currentDepth` through the runProtocol signature so Plan 04 has a clean target.
Output: Working delegate dispatch on the plan turn; full integration tests in `coordinator.test.ts` covering happy-path, failure, recursive flag, provider inheritance, model-id mismatch, and one-decision-per-turn rejection.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-CONTEXT.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-RESEARCH.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-01-SUMMARY.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-02-SUMMARY.md
@CLAUDE.md
@src/runtime/coordinator.ts
@src/runtime/engine.ts
@src/runtime/decisions.ts
@src/runtime/ids.ts
@src/runtime/coordinator.test.ts

<interfaces>
<!-- From Plan 01: -->
```ts
type AgentDecision = ParticipateAgentDecision | DelegateAgentDecision;
function parseAgentDecision(output: string, context?: { parentProviderId?: string }): AgentDecision | undefined;
```

<!-- From Plan 02: -->
```ts
interface SubRunStartedEvent { type: "sub-run-started"; runId; at; childRunId; parentRunId; parentDecisionId; protocol; intent; depth; recursive?: boolean }
interface SubRunCompletedEvent { type: "sub-run-completed"; ...; subResult: RunResult }
interface SubRunFailedEvent { type: "sub-run-failed"; ...; error; partialTrace: Trace }
```

<!-- engine.ts:608 runProtocol switch — current signature (verify exact) -->
```ts
function runProtocol(input: { protocol; intent; model; engineOptions; runOptions; emit?; signal?; ... }): Promise<RunResult>;
```
Will gain optional `currentDepth?: number` (default 0) and `effectiveMaxDepth?: number` (Plan 04 wires up).

<!-- coordinator.ts existing helpers (preserve): -->
- `recordProtocolDecision(event)` (L90-97) — call after every emit so protocolDecisions[] stays aligned with events[].
- `parseAgentDecision` (called at L433, L556) — call site for the plan turn.
- The plan turn lives at L127-148.

<!-- D-17 prompt format (locked): -->
```
[sub-run <childRunId>]: <subResult.output>
[sub-run <childRunId> stats]: turns=<N> costUsd=<X> durationMs=<Y>
```

<!-- D-18 transcript entry shape: -->
```ts
{
  agentId: `sub-run:${childRunId}`,
  role: "delegate-result",
  input: JSON.stringify(delegateDecision),  // protocol, intent, model?, budget?
  output: <D-17 projected text>,
  // decision: omitted (no model turn produced this entry)
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Thread currentDepth through runProtocol; add delegate dispatch in coordinator plan turn</name>
  <files>src/runtime/engine.ts, src/runtime/coordinator.ts</files>
  <behavior>
    - `runProtocol` accepts optional `currentDepth?: number` (default 0). Passes it to each protocol entry (`runCoordinator`, `runSequential`, `runBroadcast`, `runShared`); only `runCoordinator` reads it in Phase 1; the others accept-and-ignore for type symmetry.
    - `runCoordinator` accepts `currentDepth` and a (Plan 04) `effectiveMaxDepth` (this plan: define the param, default `Infinity`, dispatcher does NOT throw on overflow yet — Plan 04 owns the validation).
    - In the plan turn (coordinator.ts L127-148), after `parseAgentDecision`, branch on `decision.type`:
      - `"participate"` → existing flow (no change).
      - `"delegate"` → run the dispatch loop described below.
      - `undefined` → existing flow (no change).
    - **Dispatch loop** (occurs only on the plan turn; workers cannot delegate in Phase 1):
      1. Generate `childRunId = createRunId()` from `runtime/ids.ts`.
      2. Compute `recursive = decision.protocol === "coordinator"` (parent is always `coordinator` here).
      3. Compute child timeout default: if `options.budget?.timeoutMs` is set, derive `remainingMs = parent.deadline - Date.now()`; else `undefined`. Per-decision `decision.budget?.timeoutMs` honored if present and ≤ remainingMs (clamp to remaining; if exceeds, throw `invalid-configuration` `detail.path: "decision.budget.timeoutMs"`).
      4. **Set up buffered child events for partialTrace capture (pinned approach for sub-run-failed):**
         - Before invoking the child engine, allocate `const childEvents: RunEvent[] = []` and capture `const childStartedAt = Date.now()`.
         - Wrap the child engine's `emit` callback so every event the child emits is ALSO pushed into `childEvents` in addition to its normal propagation. (The wrapper is the same `emit` callback the parent already passes down; just tee it: `(event) => { childEvents.push(event); originalEmit(event); }`.)
         - This buffering is contained entirely to the coordinator dispatcher — `runProtocol`'s error contract is NOT changed; no builder is threaded through `runProtocol`.
      5. `emit({ type: "sub-run-started", runId: parent.runId, at: now(), childRunId, parentRunId: parent.runId, parentDecisionId, protocol: decision.protocol, intent: decision.intent, depth: currentDepth + 1, ...(recursive ? { recursive: true } : {}) })` and call `recordProtocolDecision`.
      6. Try: `subResult = await runProtocol({ protocol: decision.protocol, intent: decision.intent, model: parent.model /* D-11 verbatim */, engineOptions: parent.engineOptions, runOptions: { ...(remainingMs !== undefined ? { budget: { timeoutMs: remainingMs } } : {}), ...(options.signal !== undefined ? { signal: options.signal } : {}) }, currentDepth: currentDepth + 1, emit: teedEmit })`.
      7. On success: `emit({ type: "sub-run-completed", ..., subResult })`. Push synthetic `TranscriptEntry` (D-18) to parent transcript. Build the next coordinator prompt with the D-17 tagged text appended. Re-issue the coordinator plan turn (loop) with the augmented prompt. Decisions on subsequent iterations: if delegate again, dispatch again; if participate, exit dispatch loop and proceed to worker phase as today.
      8. **On thrown error from `runProtocol` — pinned partialTrace construction:**
         Build a `partialTrace` value entirely from the locally buffered `childEvents` array (no surgery into `runProtocol`'s error contract):
         ```ts
         const partialTrace: Trace = {
           runId: childRunId,
           events: childEvents,
           transcript: [],
           finalOutput: "",
           accounting: createRunAccounting(),  // zeroed; imported from src/runtime/defaults.ts
           startedAt: childStartedAt,
           endedAt: Date.now()
           // any other Trace fields default-filled per the Trace type — see src/types.ts
         };
         ```
         Then emit `sub-run-failed`:
         ```ts
         emit({
           type: "sub-run-failed",
           runId: parent.runId,
           at: now(),
           childRunId,
           parentRunId: parent.runId,
           parentDecisionId,
           error: {
             code: err.code,
             message: err.message,
             ...(err.providerId !== undefined ? { providerId: err.providerId } : {}),
             detail: { ...(err.detail ?? {}), failedDecision: <delegate payload> }
           },
           partialTrace
         });
         ```
         Then re-throw a `DogpileError` to surface to the parent (Phase 4 will refine — for Phase 1, propagate the failure and end the parent run).
         **Verify the exact `Trace` field set against `src/types.ts` `Trace` interface; fill any additional required fields with their natural zero/empty defaults. Do NOT thread a `partialTrace` builder through `runProtocol`'s error contract — keep the change contained to the coordinator dispatcher.**
    - **Loop guard:** If the coordinator plan turn delegates more than `maxDispatchPerTurn = 8` times in a row without converging on a `participate` decision, throw `DogpileError({ code: "invalid-configuration", message: "Coordinator plan turn delegated more than 8 times without participating", detail: { kind: "delegate-validation", path: "decision" } })`. Hard-coded constant in this file; not a public option.
    - **Worker turns and final-synthesis turns do NOT dispatch.** If `parseAgentDecision` returns a delegate from a worker (L556 area), throw `invalid-configuration` with message "Workers cannot emit delegate decisions in Phase 1" and `detail.path: "decision"`.
    - **Cancellation:** the parent's `options.signal` reference is passed unchanged into the child (RESEARCH §6 — one line). No new AbortController.
  </behavior>
  <action>
    1. **`src/runtime/engine.ts`**: Update `runProtocol` (L608) to accept `currentDepth?: number` (default 0) in its input and forward it to the protocol functions. `effectiveMaxDepth?` parameter is added too (default `Infinity`) — this plan does not enforce it, but Plan 04 will. Adjust the type signature where `runProtocol` is called recursively in `Dogpile.run` / `withHighLevelDefaults` so external entry passes `currentDepth: 0`.
    2. **`src/runtime/coordinator.ts`**:
       - Update `runCoordinator` signature to accept `currentDepth: number = 0`, `effectiveMaxDepth: number = Infinity`.
       - At the plan turn (L127-148), after `parseAgentDecision(...)`:
         - If decision is `undefined` or `participate`, fall through to the existing worker-phase dispatch.
         - If `delegate`, execute the dispatch loop (steps 1-8 above) inside a `while` that re-issues the plan turn until a participate or undefined decision is returned, or `maxDispatchPerTurn` is exceeded.
       - For each dispatch iteration, allocate a fresh `childEvents: RunEvent[] = []` buffer and a teed emit callback BEFORE step 5 (sub-run-started emit). On thrown error, build `partialTrace` from `childEvents` per step 8 — no thread of partialTrace through `runProtocol`.
       - After each dispatch: append the synthetic transcript entry; rebuild the next coordinator prompt by appending the D-17 tagged block to whatever prompt construction helper coordinator.ts uses (find the existing helper around L100-127 — typically it stitches together intent + transcript + role prompt). The cleanest hook is to add a single string segment that ends with the D-17 lines, fed in alongside the transcript.
       - Guard the worker-turn parser call (L556) with a check that returned decisions are not `delegate` — throw if so.
       - Use `createRunId()` from `runtime/ids.ts` for `childRunId` (RESEARCH "Don't Hand-Roll").
       - Use `recordProtocolDecision` after every sub-run event emit so `protocolDecisions[]` stays aligned with `events[]` (Pattern 4).
       - Pass `parentProviderId: parent.model.id` into `parseAgentDecision` context so Plan 01's D-11 model-id check fires at parse time too.
       - Import `createRunAccounting` from `src/runtime/defaults.ts` for the partialTrace zero-accounting fallback.
    3. Add an inline narrative comment at the top of the dispatch loop summarizing D-11/D-17/D-18/D-16 references for future readers, and call out that `partialTrace` is captured via tee'd emit (no `runProtocol` contract change).
  </action>
  <verify>
    <automated>pnpm run typecheck &amp;&amp; pnpm vitest run src/runtime/coordinator.test.ts -t "delegate"</automated>
  </verify>
  <done>Coordinator plan turn dispatches sub-runs end-to-end against a deterministic provider; sub-run-started → sub-run-completed events appear in parent trace; transcript carries the synthetic entry; child uses parent's provider object reference verbatim; on child throw, `sub-run-failed.partialTrace.events` contains every event the child emitted before the throw (built from the buffered tee).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Coordinator delegate test scenarios (happy-path, failure, recursive, model mismatch, worker rejection)</name>
  <files>src/runtime/coordinator.test.ts</files>
  <behavior>
    Seven new test scenarios using the existing deterministic provider helper (or extending it minimally if needed):
    - **Happy-path delegate to sequential**: coordinator plan turn returns `delegate` to `sequential`, child completes, parent's next plan turn sees the projected D-17 text and the synthetic transcript entry, parent emits `sub-run-started` then `sub-run-completed` in order, parent's final `RunResult.trace.events` round-trips through JSON.
    - **Sub-run-failed with non-empty partialTrace**: configure the deterministic child to emit at least one event (e.g., a `model-request` or `agent-turn`) and THEN throw `DogpileError({ code: "provider-timeout" })` mid-run. Parent emits `sub-run-failed` with `error.code === "provider-timeout"`, `error.detail.failedDecision` matches the delegate payload, and assert `partialTrace.events.length > 0` AND `partialTrace.events` deep-equals the events emitted by the child before the throw (proves the buffered-tee approach captured them).
    - **Recursive coordinator → coordinator**: `delegate.protocol === "coordinator"`; assert `sub-run-started.recursive === true`. Non-recursive case (delegate to sequential) MUST NOT have `recursive` field present (or set to `false`/omitted — pick omitted for cleanliness; assert `"recursive" in event === false`).
    - **Provider inheritance (D-11)**: deterministic provider has `id: "deterministic"`; delegate omits `model` → child request reaches the same provider instance (assert via spy that the same object reference was used; deterministic provider can record received provider id and assert equality).
    - **Model id mismatch**: delegate emits `model: "different-id"` → throws `invalid-configuration` with `detail.path === "decision.model"` BEFORE any `sub-run-started` event is emitted.
    - **Worker delegation rejected**: a worker's parsed decision is delegate → throws `invalid-configuration`, message mentions Phase 1 worker restriction.
    - **Loop guard**: a coordinator that delegates 9 times in a row → throws on the 9th with the documented message; events array contains 8 successful sub-run-started/completed pairs.
  </behavior>
  <action>
    1. Read `src/runtime/coordinator.test.ts` to find the existing deterministic-provider helper and fixture pattern. Reuse it.
    2. Write the seven scenarios above using `expect(events.map(e => e.type))` array-shape assertions and individual field assertions for the key event payloads.
    3. For sub-run-failed, model the child failure by configuring the deterministic provider to emit at least one event before throwing on the second (or Nth) invocation. The test must assert both `partialTrace.events.length > 0` and that those events equal the events the child emitted before the throw — this is the behavioral guarantee of the buffered-tee approach.
    4. For provider inheritance, assert object reference equality (`Object.is(parentProvider, childProviderSeenByMock)`).
    5. For loop guard, configure the deterministic provider to always return a valid delegate output and confirm the 9th call throws.
    6. Each test ends with a `JSON.parse(JSON.stringify(result.trace))` deep-equal round-trip to lock JSON serializability.
  </action>
  <verify>
    <automated>pnpm vitest run src/runtime/coordinator.test.ts</automated>
  </verify>
  <done>All seven new scenarios pass alongside existing coordinator tests; partialTrace assertion proves the buffered-tee approach behaviorally; `pnpm run typecheck` clean.</done>
</task>

</tasks>

<public_surface_impact>
- `src/runtime/coordinator.ts`: new dispatch loop (internal — no exported API change).
- `src/runtime/engine.ts`: `runProtocol` gains optional `currentDepth` and `effectiveMaxDepth` params (internal helper — verify it's not re-exported through `index.ts`/`types.ts`; if it is, this is a non-breaking widening).
- `src/runtime/coordinator.test.ts`: extended.
- No event-schema or result-contract test changes here (Plan 02 already locked them).
- `package.json` `exports`/`files`: no change.
- `CHANGELOG.md`: deferred to Plan 05.
</public_surface_impact>

<verification>
- `pnpm vitest run src/runtime/coordinator.test.ts`
- `pnpm vitest run src/tests/event-schema.test.ts` (regression — sub-run events from Plan 02 still pass)
- `pnpm run typecheck`
- `pnpm run test` (full suite, since coordinator changes can affect adjacent tests)
</verification>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| coordinator agent output → dispatcher | Untrusted decision drives sub-run protocol, intent, model, budget. |
| parent provider object → child run | Same instance reused across recursion; lifecycle is intentionally coupled. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Denial of Service | Infinite delegate loop in plan turn | mitigate | Hard-coded `maxDispatchPerTurn = 8` guard throws `invalid-configuration` after 8 consecutive delegates. Plan 04's `maxDepth` provides the recursive-depth bound. |
| T-03-02 | Elevation of Privilege | Delegate `model` field swapping providers | mitigate | D-11: dispatch-time check rejects mismatched model id with `detail.path: "decision.model"` before `sub-run-started` is emitted. (Plan 01 enforces at parse time too.) |
| T-03-03 | Tampering / Information Disclosure | Failed-decision payload echoed in `sub-run-failed.error.detail.failedDecision` | accept | The failed decision came from the parent agent; echoing it back to the parent's trace is intentional provenance per planner-resolved Q2. No new disclosure surface. |
| T-03-04 | Denial of Service | Worker emitting delegate, exhausting context with bogus dispatch | mitigate | Phase 1 explicitly rejects worker delegation with `invalid-configuration`. |
| T-03-05 | Tampering | Mutating shared provider object across child/parent | accept | D-11 explicitly couples lifecycle. Provider is treated as opaque object the caller owns; no defensive copy. |
</threat_model>

<replayability_notes>
- Sub-run events are emitted via the same `emit` callback as all other events; they land in `events[]` in execution order. Replay (Plan 05) walks them in order.
- `recordProtocolDecision` is called after each sub-run event so `protocolDecisions[n]` stays aligned with `events[n]` per `types.ts:1503-1505`.
- Synthetic `TranscriptEntry` is appended to `transcript` before the next coordinator turn, so a replayed transcript contains it deterministically.
- Plan 04 wires `effectiveMaxDepth` enforcement at dispatch time; the param is plumbed here but not yet checked.
- Plan 05 will re-walk this event sequence; the contract is "parent event sequence is verbatim, child trace lives in `subResult.trace`".
</replayability_notes>

<success_criteria>
- Coordinator plan turn dispatches a delegate end-to-end against the deterministic provider.
- Parent trace contains `sub-run-started` → `sub-run-completed` (or `sub-run-failed`) in execution order.
- Child receives the same provider object reference as parent.
- D-17 + D-18 transcript+prompt injection observable in tests.
- Recursive flag set correctly.
- Worker-turn delegate rejected; loop guard fires at 9th dispatch.
- On child throw, `sub-run-failed.partialTrace.events` is populated from the buffered child emits and asserted by test.
</success_criteria>

<output>
After completion, create `.planning/phases/01-delegate-decision-sub-run-traces/01-03-SUMMARY.md` documenting: dispatch-loop structure, exact `runProtocol` signature change, location of the D-17 prompt-injection helper (so Plan 04/05 can reuse), the buffered-tee partialTrace approach, and any helper utilities added to `runtime/coordinator.ts` worth knowing about.
</output>
