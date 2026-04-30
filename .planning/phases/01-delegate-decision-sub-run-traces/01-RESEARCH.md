# Phase 1: Delegate Decision & Sub-Run Traces — Research

**Researched:** 2026-04-30
**Domain:** SDK runtime — coordinator control flow, discriminated unions, replay semantics
**Confidence:** HIGH (codebase evidence verified by file:line)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

The 18 decisions in `01-CONTEXT.md` are LOCKED. Reproduced verbatim by reference:

- **D-01** AgentDecision becomes a discriminated union `{ type: "participate", ... } | { type: "delegate", protocol, intent, model?, budget? }`. `type` required. Public-API breaking. Update events.ts, decisions.ts, coordinator.ts, sequential.ts, broadcast.ts, shared.ts.
- **D-02** Coordinator emits delegate via the built-in tool surface in `tools.ts`. Internal-only tool, no caller policy. **Fallback:** single-fenced-JSON parsing if tool surface is hostile. **(See Risk: D-02 Verdict below — research recommends FALLBACK.)**
- **D-03** One decision per turn — strict. Phase 1 single delegate; parser must accept array shape for Phase 3.
- **D-04** Three kebab-case events: `sub-run-started`, `sub-run-completed`, `sub-run-failed`.
- **D-05** `sub-run-started` payload: `{ childRunId, parentRunId, parentDecisionId, protocol, intent, depth }`. Optional `recursive: true` per D-16.
- **D-06** `sub-run-completed` carries full `RunResult` as `subResult`.
- **D-07** `sub-run-failed` includes `partialTrace` (same `Trace` type, truncated).
- **D-08** Replay walks parent events, recurses on `sub-run-completed` by calling `replay(event.subResult.trace)`.
- **D-09** Phase 1 replay emits exactly recorded parent event sequence (no child-event bubbling — Phase 4).
- **D-10** Replay recomputes child accounting; mismatch throws `DogpileError({ code: "invalid-configuration" })`.
- **D-11** Child inherits parent's `ConfiguredModelProvider` instance verbatim. Mismatched `model.id` → throw `invalid-configuration`.
- **D-12** Child budget default = `timeoutMs: parent.deadline - now`. No cost-cap inheritance.
- **D-13** `maxDepth` configurable at engine AND per-run; per-run can only lower. `effectiveMaxDepth = Math.min(engine.maxDepth, run.maxDepth ?? Infinity)`. Default 4.
- **D-14** Depth-overflow validated at parse-time AND dispatcher-time.
- **D-15** `detail.path` rooted at decision: `"decision.protocol"`, `"decision.intent"`, etc.
- **D-16** Recursive coordinator gets `recursive: true` flag on `sub-run-started`.
- **D-17** Child result rendered as `output` + stats line in coordinator's next prompt.
- **D-18** Child result lands as synthetic `TranscriptEntry` (`agentId: "sub-run:<childRunId>"`, `role: "delegate-result"`) AND tagged in next prompt.

### Claude's Discretion
None — all 18 questions answered.

### Deferred Ideas
None captured during questionnaire.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DELEGATE-01 | Coordinator agents return `{ type: "delegate", protocol, intent, model?, budget? }` | D-01 union shape; parser change in `decisions.ts`; tagged-JSON fenced parsing (see D-02 verdict) |
| DELEGATE-02 | Runtime executes delegated decision as full sub-run; result feeds back. Defaults: child model = parent, child budget = parent's remaining | Requires new dispatch loop in `coordinator.ts` (see Structural Concern 1); child invocation reuses `runProtocol` from `engine.ts:608`; transcript injection per D-18 |
| DELEGATE-03 | Invalid payload throws `DogpileError({ code: "invalid-configuration", detail.path })` | Match `validation.ts:755-768` `invalidConfiguration` shape; `detail.path` per D-15 |
| DELEGATE-04 | Nesting works to `maxDepth` (default 4); overflow throws | New `currentDepth` param on `runCoordinator`; `maxDepth` added to DogpileOptions/EngineOptions/Engine signature |
| TRACE-01 | `sub-run-started` event with childRunId, protocol, intent, parent decision id | D-05 payload; emit before child engine spins up; lock in `event-schema.test.ts` `expectedEventTypes` array (L30-41) |
| TRACE-02 | `sub-run-completed` with child trace inline OR `sub-run-failed` with error | D-06/D-07 payloads; `subResult: RunResult` carries `trace` field |
| TRACE-03 | `Dogpile.replay(parentTrace)` reproduces identical output/accounting/event sequence without re-execution | `replay()` at `engine.ts:726` already trace-canonical; D-08 recursion entrypoint hooks at sub-run-completed; D-10 accounting recompute is the real new code |
| TRACE-04 | Update `event-schema.test.ts` and `result-contract.test.ts` to lock new shapes | Both files identified; specific lock points enumerated below |
</phase_requirements>

## Summary

Phase 1 introduces the `delegate` decision shape and sub-run trace embedding for the `coordinator` protocol. The work splits into **four roughly independent change-sets** plus the lock points:

1. **Type/parser surface** — discriminated `AgentDecision` union, new `RunEvent` variants, new `subResult`/`partialTrace` payload types.
2. **Coordinator control-flow** — *this is the largest underclaimed item*. The current coordinator (`runtime/coordinator.ts`) is a rigid 3-phase pipeline (`plan → parallel workers → final-synthesis`). It calls `parseAgentDecision` at L433/L556 but **never branches on the decision** — the decision is attached to the event log only. A delegate dispatch loop does not exist and must be built.
3. **Sub-run dispatch + replay** — call `runProtocol` recursively with `currentDepth+1`, emit `sub-run-*` events, inject D-18 transcript+prompt feedback. Replay (`engine.ts:726`) is already trace-canonical; D-10 recursive accounting recompute is the only meaningful new replay code.
4. **Public-surface lock-step** — five test files, three type aliases, CHANGELOG entry, all moved together per CLAUDE.md.

**Primary recommendation:** **Use the fenced-JSON parsing fallback for D-02, not the runtime tool surface.** Evidence below shows the tool surface is built around caller-supplied tools and would require parallel plumbing to host an internal-only "delegate" tool. The fenced-JSON path mirrors the existing paper-style parser conventions (`role_selected:`, `contribution:\n`) and lives entirely inside `decisions.ts`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decision parsing (`participate` vs `delegate`) | `runtime/decisions.ts` | `types/events.ts` | Existing `parseAgentDecision` already lives there; discriminated union types live in events.ts |
| Coordinator decision dispatch (new turn loop) | `runtime/coordinator.ts` | — | Coordinator owns turn flow; sub-run dispatch is its concern |
| Child run invocation | `runtime/engine.ts` (`runProtocol`) | `runtime/coordinator.ts` | Coordinator calls into engine's `runProtocol` switch, recursively |
| Sub-run event emission | `runtime/coordinator.ts` | `types/events.ts` | Same emit channel as existing role-assignment/agent-turn events |
| Replay recursion + accounting recompute | `runtime/engine.ts` (`replay`) + `runtime/defaults.ts` (`createRunAccounting`) | — | Replay entrypoint already in engine.ts; accounting helpers in defaults.ts |
| Depth tracking & maxDepth validation | `runtime/coordinator.ts` (state) + `runtime/validation.ts` (option check) | `types.ts` (option types) | Depth is runtime state; option validation matches existing pattern |
| Public-surface lock | `tests/event-schema.test.ts`, `tests/result-contract.test.ts`, `tests/public-api-type-inference.test.ts`, `tests/fixtures/consumer-type-resolution-smoke.ts`, `runtime/sequential.test.ts`, `runtime/broadcast.test.ts` | `index.ts`, `types.ts` re-exports, CHANGELOG | Per CLAUDE.md, public-surface changes move together |

## Structural Concerns (read FIRST before planning tasks)

### 1. Coordinator control-flow gap — HIGH planning impact

**Verified:** `src/runtime/coordinator.ts:62-232` shows `runCoordinator` is hard-coded into three sequential phases:

- L127-148: coordinator plan turn (one shot)
- L150-209: parallel worker turns (one round, no loop)
- L211-231: final synthesis (one shot)

Decisions are parsed (`parseAgentDecision` at L433, L556) and recorded on transcript/event payloads (L186, L198, L452, L464). **No code branches on `decision.type` or `decision.participation` to alter control flow.** The only place participation gates output is `sequential.ts:221` (`isParticipatingDecision`).

**Implication for Phase 1:** Adding "if decision.type === 'delegate', dispatch a sub-run and re-prompt the coordinator with the result" is not a small wire-up. It requires introducing a real turn loop into the coordinator (or, minimally, a "post-plan / post-worker dispatch pass") that:

1. Inspects the just-parsed decision.
2. If `delegate`, validates depth (D-14 dispatcher-time), invokes `runProtocol` with `currentDepth+1`, emits `sub-run-started` before, `sub-run-completed`/`sub-run-failed` after.
3. Pushes the synthetic `delegate-result` `TranscriptEntry` (D-18).
4. Re-issues a coordinator turn whose prompt includes the projected result tag (D-17).
5. Repeats until the coordinator returns `participate` or worker phase begins.

The planner must allocate at least one task for this new control flow distinct from "add the type union" and "wire sub-run events." The `recordProtocolDecision` helper (L90-97) and `protocolDecisions` array can be reused — sub-run events should call it for trace-shape symmetry with existing events.

**Open Q for planner:** Does the coordinator delegate from the **plan turn**, the **worker turns**, or both? The 3-phase pipeline today only gives the coordinator agent two turns (plan + final-synthesis). If only the plan turn can delegate, scope is much smaller. If workers can also delegate, every worker becomes a potential dispatch site. CONTEXT.md does not lock this. **Recommendation:** Phase 1 — coordinator (plan turn) only; workers later. Flag for plan-checker.

### 2. D-02 Verdict — Tool surface is HOSTILE for an internal-only tool; recommend fenced-JSON fallback

**Verified evidence from `src/runtime/tools.ts`:**

- **L99** `validateRuntimeToolRegistrations(options.tools)` — the tool array comes from caller-supplied `DogpileOptions.tools` (`types.ts:1750`) / `EngineOptions.tools` (`types.ts:1812`).
- **L149-163** `runtimeToolManifest` and **L169-172** `runtimeToolAvailability` build a manifest exposed to the model provider through request metadata — i.e. the tool list is **caller-visible** and **provider-visible** by design.
- **L177-204** `executeModelResponseToolRequests` dispatches whatever appears in `response.toolRequests` through the same path. Tool calls emit public `tool-call`/`tool-result` events (L117-139).
- **L267-278** Unregistered tools return a public `RuntimeToolErrorResult { code: "unavailable" }` — there is no "internal-only" bypass.

To host `delegate` here, coordinator would need to (a) inject a synthetic delegate tool into the executor's tool list **without** putting it in `options.tools`, (b) intercept `response.toolRequests` for tool id `"delegate"` BEFORE the generic dispatcher runs, (c) suppress the `tool-call`/`tool-result` events for that tool id (since D-04 says delegate uses its own `sub-run-*` events, not tool events), and (d) keep the manifest-injection separate from caller-policy. That's parallel plumbing, not reuse.

**Recommendation: FALLBACK to fenced-JSON parsing in `decisions.ts`.** Concrete shape (mirrors existing paper-style fields):

```
role_selected: <role>
participation: contribute
rationale: <text>
delegate:
```json
{ "protocol": "sequential", "intent": "<text>", "model": "<id>?", "budget": { "timeoutMs": 30000 }? }
```
contribution:
<text or empty for delegate-only turn>
```

Parser changes:
- Add `matchDelegateBlock(output)` returning `{ protocol, intent, model?, budget? } | undefined`.
- If a `delegate:` fenced block is present, return `{ type: "delegate", ... }`.
- Otherwise return `{ type: "participate", selectedRole, participation, rationale, contribution }` (existing four fields preserved).
- Validation errors (unknown protocol, missing intent, malformed JSON) throw `DogpileError({ code: "invalid-configuration", detail.path: "decision.protocol" | "decision.intent" })` per D-15.

Confidence: HIGH that the tool surface is hostile to an internal-only tool. Confidence: HIGH that the fenced-JSON path is achievable and self-contained.

### 3. AgentDecision blast radius is SMALLER than feared

**Verified consumers of paper-style fields outside the parser:**

| Site | What it reads | Action |
|------|---------------|--------|
| `src/runtime/decisions.ts:21` `isParticipatingDecision` | `decision?.participation !== "abstain"` | Narrow on `decision.type === "participate"` first |
| `src/runtime/sequential.ts:221` | calls `isParticipatingDecision(entry.decision)` | No source change beyond fixing the helper |
| `src/runtime/sequential.test.ts:113-126` | `selectedRole`, `participation` literals | Update fixture to include `type: "participate"` |
| `src/runtime/broadcast.test.ts:114-162` | `selectedRole` literals | Update fixture |
| `src/tests/public-api-type-inference.test.ts:279-281` | type-equality assertions on `AgentDecision` and `AgentDecision["participation"]` | Replace with `Extract<AgentDecision, { type: "participate" }>["participation"]` or similar — this is a CONTRACT change, not a fix |
| `src/tests/fixtures/consumer-type-resolution-smoke.ts:58-65` | literal `AgentDecision` shape | Add `type: "participate"` |
| `src/index.ts:79` | re-export | No change (just type re-export) |
| `src/types.ts:1287/1311` | re-export | No change |
| `src/types/events.ts:214,270,299` | union definition + `decision?: AgentDecision` field on `TurnEvent` and `BroadcastContribution` | Replace interface with discriminated union |
| `src/types.ts:1375` | `decision?: AgentDecision` on `TranscriptEntry` | No change beyond import |

**Crucially:** coordinator.ts/sequential.ts/broadcast.ts/shared.ts all **store** the parsed decision but **never read its fields**. The discriminated union change is a type-level rename plus a parser-level union return; the runtime impact is confined to (1) the parser, (2) `isParticipatingDecision`, and (3) test fixtures.

**Lock the planner:** the participate branch must preserve all four existing paper-style fields under `type: "participate"`:
```ts
type AgentDecision =
  | { type: "participate"; selectedRole: string; participation: AgentParticipation; rationale: string; contribution: string }
  | { type: "delegate"; protocol: ProtocolName; intent: string; model?: string; budget?: BudgetCaps };
```

### 4. Replay path — D-09 trivially met, D-10 is the real work

**Verified at `src/runtime/engine.ts:726-762`:** `replay()` does **not** walk `trace.events` to drive logic. It pulls `trace.finalOutput`, `trace.transcript`, and `trace.events` directly into the rehydrated `RunResult`. D-09 ("emits exactly the recorded parent event sequence") is met by construction — no parent-side code change.

**`replayStream()` at L773-811** simply iterates `trace.events`. Same story.

**The actual new replay code:** D-10 recursive accounting recompute. Today, `createRunAccounting` (referenced in defaults.ts, called at engine.ts:743) takes `events` and `cost` and produces a `RunAccounting`. For sub-runs, the replay path needs to:

1. Walk parent `trace.events`.
2. For each `sub-run-completed`, recursively compute accounting from `event.subResult.trace.events`.
3. Sum child accounting into parent. Compare to recorded `event.subResult.accounting`. Throw on mismatch.

This logic lives most naturally in **`runtime/defaults.ts`** alongside `createRunAccounting`, with `replay()` calling it. New ~50 lines, modest. The throw uses `DogpileError({ code: "invalid-configuration", detail: { reason: "trace-accounting-mismatch", eventIndex, recorded, recomputed } })`.

**For D-08 (recursion on sub-run-completed):** Phase 1 only needs accounting recursion. Per D-09 the parent event stream is replayed verbatim — no need to recursively expand child events into the parent stream. The recursion is entirely inside the accounting recompute walker.

### 5. `maxDepth` plumbing — no existing infrastructure

**Verified:** zero hits for `maxDepth` or any recursion concept in `src/`. Must be added cleanly:

- `DogpileOptions` (`types.ts:1734`) — add `readonly maxDepth?: number`.
- `EngineOptions` (`types.ts:1791`) — add `readonly maxDepth?: number`.
- `validateDogpileOptions` (`validation.ts:51-72`) and `validateEngineOptions` (L81-95) — add `validateOptionalNonNegativeInteger(options.maxDepth, "maxDepth")` (helper exists per L26).
- `createEngine` (`engine.ts:62`) — read `options.maxDepth ?? 4` into the engine instance closure.
- `runProtocol` (`engine.ts:608`) — accept `currentDepth` and `effectiveMaxDepth`, thread to `runCoordinator`.
- `runCoordinator` (`coordinator.ts:62`) — accept `currentDepth` (default 0) and `effectiveMaxDepth`. Effective enforcement: `Math.min(engine.maxDepth, run.maxDepth ?? Infinity)` computed once per run.
- `Dogpile.pile` / `run` / `stream` — pass through via `withHighLevelDefaults` (`engine.ts:860`).

D-13's "per-run can only lower" is enforced at run-start (compute effective once); no per-call check needed.

### 6. Cancellation hook for sub-runs — no structural blocker for Phase 2

**Verified:** `options.signal` flows DogpileOptions → EngineOptions → `runProtocol` → each protocol → `request.signal` on `ModelRequest` (coordinator.ts L388, L511). `throwIfAborted` (cancellation.ts) is called at coordinator turn boundaries.

**Phase 1 obligation:** when coordinator dispatches a child via `runProtocol`, pass `options.signal` reference unchanged into the child. This is sufficient: parent abort propagates because all descendants share the same signal object. Phase 2 layers on top (timeout chaining, cleanup ordering) but Phase 1 needs only one line: `runProtocol({ ..., ...(options.signal !== undefined ? { signal: options.signal } : {}) })` in the dispatcher. **No painted corner.**

### 7. TranscriptEntry shape (D-18) — clean addition

**Verified `types.ts:1365-1378`:** `agentId` and `role` are plain `string` types; `decision` is optional. Adding entries with `agentId: "sub-run:<childRunId>"` and `role: "delegate-result"` requires zero type changes. The `decision` field can be omitted on these synthetic entries (no model turn produced them). Note: `input` and `output` are `string` — D-18 says `input: "<delegate request as JSON>"` and `output: "<projected D-17 text>"`, both fit.

## Standard Stack

The phase introduces no new dependencies. All work happens inside the existing pure-TS runtime.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none) | — | — | Phase 1 is internal — no external libs |

CLAUDE.md mandates: pure TypeScript runtime, no Node-only deps, ESM with explicit `.js` extensions, strict mode (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).

## Architecture Patterns

### Pattern 1: Discriminated union with `type` discriminant

The codebase already uses this pattern for protocol configs (`SequentialProtocolConfig | CoordinatorProtocolConfig | BroadcastProtocolConfig | SharedProtocolConfig`, all with `kind:`), termination decisions (`ContinueTerminationDecision | StopTerminationDecision`, `type:`), and tool results (`RuntimeToolSuccessResult | RuntimeToolErrorResult`, `type:`).

**Convention:** `AgentDecision` should use `type` (not `kind`) — matches `TerminationDecision` and `RuntimeToolValidationResult`. CONTEXT D-01 specifies `type`, which fits.

### Pattern 2: `invalidConfiguration` validation errors

All option validation errors use the helper at `validation.ts:755`:
```ts
throw new DogpileError({
  code: "invalid-configuration",
  message: `Invalid Dogpile configuration at ${path}: ${message}`,
  retryable: false,
  detail: { kind: "configuration-validation", path, rule, expected, received }
});
```

For D-15, delegate parse-time errors should use a similar shape but with `detail.kind: "delegate-validation"` (or reuse `"configuration-validation"`) and `detail.path` rooted at `"decision.*"`. Example:
```ts
throw new DogpileError({
  code: "invalid-configuration",
  message: `Invalid delegate decision: protocol "${received}" is not a known coordination protocol.`,
  retryable: false,
  detail: { kind: "delegate-validation", path: "decision.protocol", expected: "coordinator | sequential | broadcast | shared", received }
});
```

### Pattern 3: Event emission via `emit` callback

Every protocol pushes events into a local `events: RunEvent[]` array via:
```ts
const emit = (event: RunEvent): void => {
  events.push(event);
  options.emit?.(event);
};
```
(coordinator.ts:85-88). Sub-run events follow the same pattern. **For events emitted by the coordinator itself (not the child), call `recordProtocolDecision(event)` immediately after `emit(event)`** to keep `protocolDecisions[]` synchronized with `events[]` per the trace contract (`types.ts:1503-1505`).

### Pattern 4: Recording protocol decisions

`recordProtocolDecision` (coordinator.ts:90-97) creates a `ReplayTraceProtocolDecision` keyed to the most recent event's index. Sub-run events should be recorded the same way so `protocolDecisions[n]` continues to map to `events[n]`.

### Anti-Patterns to Avoid

- **Don't mutate trace.events post-hoc.** Events are appended in execution order and frozen by JSON serialization. Sub-run-completed must carry the embedded child trace; do not "splice" child events into parent.
- **Don't introduce a separate replay code path.** D-08 says recursion happens by re-calling `replay()` on the embedded trace; do not re-implement event walking inside coordinator.ts.
- **Don't bypass `validateOptionalNonNegativeInteger` for `maxDepth`.** Match the existing validation surface (`validation.ts`) so error shape is consistent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursively run a coordination protocol | Custom child-engine-spawn machinery | Call `runProtocol` from `engine.ts:608` directly | Same dispatcher used by top-level runs; identical contract |
| Generate child runId | Random string in coordinator.ts | `createRunId()` from `runtime/ids.ts` | Already used everywhere; keeps id format stable |
| Build accounting from events | Manual sum loop | `createRunAccounting()` from `runtime/defaults.ts` | Already exists; just call recursively for child traces |
| Cancellation propagation | New AbortController hierarchy | Pass parent `options.signal` reference into child | Existing model: same signal object propagates through descendants |
| Validate option shape | Inline checks | `validation.ts` helpers (`validateOptionalNonNegativeInteger`, `invalidConfiguration`) | Centralized error shape per CLAUDE.md |

## Runtime State Inventory

Phase 1 is a code/types/tests change with no rename component. **Runtime State Inventory: SKIPPED — not a rename/refactor/migration phase.**

## Common Pitfalls

### Pitfall 1: Forgetting to update `expectedEventTypes` in `event-schema.test.ts`

**What goes wrong:** Adding events to `RunEvent` union without updating the literal array at `src/tests/event-schema.test.ts:30-41` causes a satisfies-check break and the test asserts exact array equality.
**Prevention:** Add `"sub-run-started"`, `"sub-run-completed"`, `"sub-run-failed"` to both the `expectedEventTypes` array AND the `expect(eventTypes).toEqual([...])` assertion (L47-58). Decide insertion order — recommend placing them between `"broadcast"` and `"budget-stop"` so kebab-case-with-prefix events cluster.
**Warning sign:** Type assertion `as const satisfies readonly RunEvent["type"][]` failing.

### Pitfall 2: Dropping the participate branch's existing fields

**What goes wrong:** The discriminated union refactor accidentally renames or moves `selectedRole`/`participation`/`rationale`/`contribution`. Existing fixtures and `isParticipatingDecision` break.
**Prevention:** Locked above — preserve all four fields verbatim under `type: "participate"`. Update tests in lock-step.
**Warning sign:** `consumer-type-resolution-smoke.ts:58` literal compile error after type change.

### Pitfall 3: D-02 attempting tool-surface integration

**What goes wrong:** Implementer takes D-02's "via tools.ts" at face value, builds parallel manifest plumbing, leaks delegate as a caller-policy-controllable tool.
**Prevention:** Use the fallback. The Verdict above documents why; the planner should commit to fenced-JSON parsing in `decisions.ts`.
**Warning sign:** Need to add internal-only tool-id allowlist to `tools.ts`.

### Pitfall 4: Forgetting to recompute accounting recursively on replay

**What goes wrong:** Replay copies recorded `accounting` directly from trace; tampered traces silently pass through.
**Prevention:** D-10 explicitly requires recompute. Implement walker in `defaults.ts`, call from `replay()` in `engine.ts:726`.
**Warning sign:** A test that mutates `subResult.accounting.cost.usd` and replays still produces the mutated number.

### Pitfall 5: maxDepth check at parse time but not dispatch time (or vice versa)

**What goes wrong:** D-14 mandates BOTH. Skipping the dispatcher-time check leaves a TOCTOU window if any state mutates between parse and child engine spin-up.
**Prevention:** Add the check inside the parser (`decisions.ts` knows `currentDepth` via context arg) AND inside the coordinator dispatcher right before calling `runProtocol`.
**Warning sign:** Only one site throws `depth-overflow` in tests.

### Pitfall 6: Child run inheriting parent provider but using different model id

**What goes wrong:** Agent emits `delegate.model: "different-id"` but D-11 says child uses parent provider object verbatim.
**Prevention:** Validate at parse/dispatch: if `decision.model && decision.model !== parent.model.id`, throw `invalid-configuration` with `detail.path: "decision.model"` and a clear message.
**Warning sign:** Provider received an unexpected `id` mismatch in the child request metadata.

## Code Examples

### AgentDecision discriminated union (recommended shape)

```ts
// src/types/events.ts (replaces L214-223)
export type AgentDecision = ParticipateAgentDecision | DelegateAgentDecision;

export interface ParticipateAgentDecision {
  readonly type: "participate";
  readonly selectedRole: string;
  readonly participation: AgentParticipation;
  readonly rationale: string;
  readonly contribution: string;
}

export interface DelegateAgentDecision {
  readonly type: "delegate";
  readonly protocol: ProtocolName;
  readonly intent: string;
  readonly model?: string;
  readonly budget?: BudgetCaps;
}
```

### Sub-run event variants (recommended shape)

```ts
// src/types/events.ts — added to RunEvent union
export interface SubRunStartedEvent {
  readonly type: "sub-run-started";
  readonly runId: string;          // PARENT runId, per existing event convention
  readonly at: string;
  readonly childRunId: string;
  readonly parentRunId: string;    // duplicates runId for clarity per D-05
  readonly parentDecisionId: string;  // matches recordProtocolDecision id format
  readonly protocol: ProtocolName;
  readonly intent: string;
  readonly depth: number;
  readonly recursive?: boolean;    // D-16, only when child protocol === parent protocol === "coordinator"
}

export interface SubRunCompletedEvent {
  readonly type: "sub-run-completed";
  readonly runId: string;
  readonly at: string;
  readonly childRunId: string;
  readonly parentRunId: string;
  readonly parentDecisionId: string;
  readonly subResult: RunResult;   // full RunResult, embeds Trace
}

export interface SubRunFailedEvent {
  readonly type: "sub-run-failed";
  readonly runId: string;
  readonly at: string;
  readonly childRunId: string;
  readonly parentRunId: string;
  readonly parentDecisionId: string;
  readonly error: { readonly code: string; readonly message: string; readonly providerId?: string; readonly detail?: JsonObject };
  readonly partialTrace: Trace;
}
```

### Parser fenced-JSON branch (recommended for `decisions.ts`)

```ts
// pseudo-code — planner refines
export function parseAgentDecision(output: string, context: { currentDepth: number; maxDepth: number; parentProviderId: string }): AgentDecision | undefined {
  const delegateBlock = matchFencedJsonAfter(output, /^delegate:\s*$/imu);
  if (delegateBlock) {
    return parseDelegateDecision(delegateBlock, context);  // throws DogpileError on invalid
  }
  // existing paper-style parse, returns ParticipateAgentDecision
}
```

### Replay accounting recursion sketch

```ts
// src/runtime/defaults.ts — new helper
export function recomputeAccountingFromTrace(trace: Trace): RunAccounting {
  const childAccountings = trace.events.flatMap((event) =>
    event.type === "sub-run-completed"
      ? [recomputeAccountingFromTrace(event.subResult.trace)]
      : []
  );
  // sum into parent; compare to recorded; throw on mismatch
}
```

### CHANGELOG.md v0.4.0 entry sketch

```md
## [Unreleased] — v0.4.0

### Breaking
- `AgentDecision` is now a discriminated union with required `type: "participate" | "delegate"`. Existing paper-style fields (`selectedRole`, `participation`, `rationale`, `contribution`) are preserved under the `participate` branch.

### Added
- Coordinator agents may emit `{ type: "delegate", protocol, intent, model?, budget? }` to dispatch a sub-mission.
- New `RunEvent` variants: `sub-run-started`, `sub-run-completed`, `sub-run-failed`.
- Synthetic transcript entries (`agentId: "sub-run:<id>"`, `role: "delegate-result"`) record sub-run results.
- `maxDepth` option on `DogpileOptions` and `EngineOptions` (default 4).
- `Dogpile.replay()` rehydrates embedded sub-run traces without provider invocation; recursive accounting is recomputed and verified.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `AgentDecision` flat object with paper-style fields | Discriminated union (`participate` / `delegate`) | v0.4.0 (this phase) | Public-API breaking; consumers narrow on `type` |
| Coordinator runs fixed `plan → workers → final-synthesis` | Adds delegate dispatch turns when `type: "delegate"` returned | v0.4.0 | New control flow; agent-driven nesting |

**Deprecated/outdated:** None within Phase 1 scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 1 only enables delegation from the coordinator's plan turn (not workers, not final-synthesis) | Structural Concern 1 | If workers can also delegate, scope grows ~30%; planner must allocate task |
| A2 | The `sub-run-*` events should be inserted between `"broadcast"` and `"budget-stop"` in the union ordering | Pitfall 1 | Pure ordering convention; trivial to fix |
| A3 | `parentRunId` on sub-run events duplicates the parent event's `runId` field for clarity (D-05 doesn't specify) | Code Examples | If redundancy is unwanted, drop `parentRunId` and let consumers read `runId` |
| A4 | The synthetic `delegate-result` transcript entry has no `decision` field (no model turn produced it) | Concern 7 | Trivial — consumer code already treats `decision` as optional |
| A5 | `recordProtocolDecision` should be called for each sub-run event so `protocolDecisions[n]` aligns with `events[n]` | Architecture Pattern 4 | If trace contract diverges, replay tooling expecting 1:1 mapping breaks — verify with `types.ts:1503-1505` doc comment |

## Open Questions

1. **Can workers delegate, or only the coordinator's plan turn?**
   - What we know: Today's coordinator gives the coordinator agent two turns (plan + final-synthesis); workers get one parallel turn each.
   - What's unclear: CONTEXT.md does not specify which turns can emit `delegate`.
   - Recommendation: Phase 1 — coordinator (plan turn) only. Document and lock during plan-phase.

2. **Does `sub-run-failed.error.detail` include a path back to the parent decision?**
   - What we know: D-07 specifies `{ code, message, providerId?, detail? }`; `parentDecisionId` is on the event itself.
   - What's unclear: Whether failure detail should also include the failed `decision` payload for diagnosis.
   - Recommendation: Yes — include `detail.failedDecision` so downstream consumers don't need to cross-reference. Optional, additive.

3. **What does "parent's remaining time" mean exactly for D-12?**
   - What we know: D-12 says `timeoutMs = parent.deadline - now`. Parent's deadline derives from `budget.timeoutMs` set at run start.
   - What's unclear: If parent has no `timeoutMs`, is child uncapped, or does it inherit some other ceiling?
   - Recommendation: Phase 1 — if parent has no `timeoutMs`, child has no default `timeoutMs` either. Phase 2 owns the broader budget propagation.

## Environment Availability

Phase 1 introduces no new external dependencies and modifies no build/test/CI infrastructure. **Step skipped — no external dependencies identified.**

## Validation Architecture

`workflow.nyquist_validation` is not configured in `.planning/config.json` (file may not exist). Including this section per default-enabled rule.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (declared in `package.json`, `pnpm run test` → `vitest run`) |
| Config file | `vitest.config.ts` (root) — verify exists; `pnpm run test` works today |
| Quick run command | `pnpm vitest run src/tests/event-schema.test.ts src/tests/result-contract.test.ts src/runtime/coordinator.test.ts` |
| Full suite command | `pnpm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DELEGATE-01 | Parser returns discriminated `delegate` decision shape | unit | `pnpm vitest run src/runtime/decisions.test.ts` | ❌ Wave 0 (no decisions.test.ts today) |
| DELEGATE-02 | Coordinator dispatches sub-run, result returns to next decision | integration | `pnpm vitest run src/runtime/coordinator.test.ts -t "delegate"` | ✅ extend |
| DELEGATE-03 | Invalid delegate payload throws with `detail.path` | unit | `pnpm vitest run src/runtime/decisions.test.ts -t "invalid"` | ❌ Wave 0 |
| DELEGATE-04 | Depth overflow throws | unit | `pnpm vitest run src/tests/config-validation.test.ts -t "maxDepth"` | ✅ extend |
| TRACE-01 | `sub-run-started` emitted at child start | unit | `pnpm vitest run src/tests/event-schema.test.ts -t "sub-run"` | ✅ extend |
| TRACE-02 | `sub-run-completed` carries inline `RunResult` | unit | `pnpm vitest run src/tests/event-schema.test.ts -t "sub-run-completed"` | ✅ extend |
| TRACE-03 | `replay(parentTrace)` reproduces output/accounting/event sequence without provider | integration | `pnpm vitest run src/tests/replay-version-skew.test.ts -t "embedded children"` OR new `replay-recursion.test.ts` | ✅ adjacent / Wave 0 new file |
| TRACE-04 | `event-schema.test.ts` and `result-contract.test.ts` lock new shapes | contract | `pnpm vitest run src/tests/event-schema.test.ts src/tests/result-contract.test.ts` | ✅ extend both |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/tests/event-schema.test.ts src/runtime/coordinator.test.ts` (~5s)
- **Per wave merge:** `pnpm run typecheck && pnpm run test`
- **Phase gate:** `pnpm run verify` (release gate from CLAUDE.md)

### Wave 0 Gaps
- [ ] `src/runtime/decisions.test.ts` — covers DELEGATE-01 / DELEGATE-03 (parser unit tests, currently no test file for `decisions.ts`)
- [ ] `src/tests/replay-recursion.test.ts` (or extend `replay-version-skew.test.ts`) — covers TRACE-03 with embedded child traces
- [ ] Coordinator delegate fixtures in `src/runtime/coordinator.test.ts` — extend, no new file
- [ ] Deterministic provider helper for delegating coordinator scenarios (in `src/internal.ts` or `src/testing/`) — likely extend existing fixture; planner verifies

## Project Constraints (from CLAUDE.md)

The following directives are mandatory and constrain how Phase 1 lands:

- **Pure TS runtime** — no Node-only deps in `src/runtime/`, no fs, no env reads. Sub-run code stays pure.
- **ESM with explicit `.js` extensions** — all new imports use `.js` even though source is `.ts`.
- **Strict TS** — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`. Optional fields use `?:` consistently; array indexing returns `T | undefined`.
- **JSON-serializable trace round-trip** — sub-run events MUST survive `JSON.parse(JSON.stringify(trace))` and replay through `Dogpile.replay()`. Validate with the existing `event-schema.test.ts` round-trip pattern (L101, L209).
- **Public-surface change inventory moves together:** any event/result/exports change updates `src/tests/event-schema.test.ts`, `src/tests/result-contract.test.ts`, `src/tests/package-exports.test.ts`, `src/tests/public-api-type-inference.test.ts`, `src/tests/fixtures/consumer-type-resolution-smoke.ts`, `package.json` `exports`/`files`, and `CHANGELOG.md`.
- **Conventional Commits** — `feat:` for new event variants and option, `feat!:` for the breaking AgentDecision union (or note BREAKING CHANGE in body).
- **Two-space indent, double quotes, semicolons; camelCase values, PascalCase exported types, kebab-case filenames** — applies to any new files.
- **Files allowlist in `package.json`** — verify that no new internal-only file accidentally lands inside the published tarball; all new public types must round-trip through `index.ts`.

## Public-Surface Change Inventory (lock-step list for planner)

Per CLAUDE.md, these MUST move together:

| File | Change |
|------|--------|
| `src/types/events.ts` | Replace `AgentDecision` interface (L214) with discriminated union; add 3 new event interfaces; extend `RunEvent` union (L458); update `BroadcastContribution.decision`, `TurnEvent.decision` field types |
| `src/runtime/decisions.ts` | Update `parseAgentDecision` return type; add `delegate` parsing branch; update `isParticipatingDecision` to narrow on `type === "participate"` |
| `src/runtime/coordinator.ts` | Add delegate dispatch loop; emit sub-run events; depth/maxDepth state; D-18 transcript injection; D-17 prompt rendering |
| `src/runtime/engine.ts` | Thread `currentDepth` and `effectiveMaxDepth` through `runProtocol`; recompute accounting recursively in `replay()` |
| `src/runtime/defaults.ts` | Add `recomputeAccountingFromTrace` helper |
| `src/runtime/validation.ts` | Add `validateOptional` for `maxDepth`; add delegate-specific validation helpers |
| `src/types.ts` | Add `maxDepth?: number` to `DogpileOptions` (L1734) and `EngineOptions` (L1791); re-export new event types |
| `src/index.ts` | Re-export new event types and refined `AgentDecision` |
| `src/tests/event-schema.test.ts` | Update `expectedEventTypes` array (L30-41), `expect(...).toEqual(...)` assertion (L47-58); add sub-run event shape tests |
| `src/tests/result-contract.test.ts` | Add coverage for `subResult` round-trip and recursive replay |
| `src/tests/public-api-type-inference.test.ts` | Update L279-281 type assertions for the discriminated union |
| `src/tests/fixtures/consumer-type-resolution-smoke.ts` | Update L58-65 literal AgentDecision shape |
| `src/runtime/sequential.test.ts` | Update L113-126 fixtures (`type: "participate"`) |
| `src/runtime/broadcast.test.ts` | Update L114-162 fixtures |
| `src/runtime/coordinator.test.ts` | Add delegate happy-path, depth-overflow, sub-run-failed, recursive replay scenarios |
| `src/tests/config-validation.test.ts` | Add `maxDepth` ceiling/lower-only enforcement |
| `src/tests/package-exports.test.ts` | If any new export subpath is added, lock here; otherwise verify existing assertions still pass |
| `package.json` | No `exports`/`files` change expected (no new subpath) — verify |
| `CHANGELOG.md` | v0.4.0 entry: BREAKING `AgentDecision`; ADDED delegate decision, sub-run-* events, `maxDepth` option |

## Sources

### Primary (HIGH confidence — direct codebase verification)
- `src/types/events.ts:214-223` — current `AgentDecision` shape
- `src/types/events.ts:458-468` — `RunEvent` discriminated union
- `src/runtime/decisions.ts:1-39` — paper-style parser, no tagged-JSON support
- `src/runtime/coordinator.ts:62-232, 433, 556` — 3-phase pipeline, decision attached but not branched on
- `src/runtime/tools.ts:99, 149-172, 177-204, 267-278` — caller-supplied tools, manifest exposed to provider, no internal-only bypass
- `src/runtime/engine.ts:62, 608-675, 726-811` — engine factory, runProtocol switch, replay/replayStream
- `src/runtime/validation.ts:51-95, 755-768` — option validation pattern, `invalidConfiguration` error shape
- `src/types.ts:1287-1333, 1365-1378, 1511-1554, 1618-1644, 1734-1827` — re-exports, TranscriptEntry, Trace, RunResult, DogpileOptions/EngineOptions
- `src/tests/event-schema.test.ts:30-41, 47-58, 105-209, 332-409` — public event union lock points
- `src/tests/public-api-type-inference.test.ts:279-281` — AgentDecision type-inference lock
- `src/tests/fixtures/consumer-type-resolution-smoke.ts:58-65` — consumer-perspective AgentDecision literal

### Secondary (MEDIUM confidence — derived from multiple primary sources)
- `CLAUDE.md` public-surface invariant list (file read in init context)
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` — requirement IDs and phase boundaries

### Tertiary (LOW confidence — needs validation by planner)
- Assumption A1 (workers cannot delegate) — not locked in CONTEXT.md; planner must confirm

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; pattern conventions verified at file:line
- Architecture (control-flow concern): HIGH — coordinator.ts read end-to-end; absence of decision-branching verified
- D-02 verdict (fenced-JSON fallback): HIGH — tools.ts surface verified hostile to internal-only tools
- AgentDecision blast radius: HIGH — exhaustive grep performed
- Replay path: HIGH — engine.ts:726-811 read in full
- maxDepth plumbing: HIGH — zero hits in src/ confirms greenfield addition
- Test lock points: HIGH — event-schema.test.ts and adjacent tests read in full
- Pitfalls: HIGH — drawn from verified call sites

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (stable internal SDK; only invalidated if PRs land that touch coordinator.ts, decisions.ts, engine.ts, or events.ts before Phase 1 plan-phase begins)
