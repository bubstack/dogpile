---
phase: 01-delegate-decision-sub-run-traces
generated: 2026-04-30
mode: power
answered: 18/18
---

# Phase 1 Context — Delegate Decision & Sub-Run Traces

Decisions captured from the power-mode questionnaire (`01-QUESTIONS.json`). These lock the gray areas before research/planning.

## Canonical refs

- `.planning/ROADMAP.md` — Phase 1 success criteria, requirements DELEGATE-01..04, TRACE-01..04
- `.planning/REQUIREMENTS.md` lines 11–23 — full requirement text
- `.planning/PROJECT.md` — provider-neutral / replayable-trace invariants
- `CLAUDE.md` — public-surface invariants (event-shape changes propagate to event-schema.test.ts, result-contract.test.ts, package-exports.test.ts, CHANGELOG.md)
- `src/types/events.ts:214` — current `AgentDecision` interface
- `src/types/events.ts:458` — `RunEvent` discriminated union
- `src/runtime/decisions.ts:3` — `parseAgentDecision`
- `src/runtime/coordinator.ts:92, 433, 556` — coordinator decision dispatch + replay path
- `src/runtime/tools.ts` — built-in runtime tool surface (delegate piggybacks here)

## Decisions

### Decision Shape & Parsing

**D-01: AgentDecision becomes a true discriminated union.**
- Replace `AgentDecision` with `{ type: "participate", ... } | { type: "delegate", protocol, intent, model?, budget? }`. `type` is required.
- This is a public-API breaking change for v0.4.0 — every consumer reading `decision.selectedRole` directly must narrow on `type === "participate"` first.
- Update `src/types/events.ts`, `src/runtime/decisions.ts`, `src/runtime/coordinator.ts`, `src/runtime/sequential.ts`, `src/runtime/broadcast.ts`, `src/runtime/shared.ts` (anywhere `AgentDecision` is consumed). Lock in `event-schema.test.ts`, `result-contract.test.ts`. Document in CHANGELOG as breaking.

**D-02: Coordinator emits delegate via the built-in tool surface.**
- Reuses existing tool dispatch / structured-args / validation in `src/runtime/tools.ts` instead of inventing a parsing convention.
- Built-in tool name TBD by planner; suggested `delegate`. Tool runs with no caller policy (it's runtime-internal, like the existing built-ins). Tool "result" is the child `RunResult`; the coordinator's next turn sees that result.
- Note: this is conceptually NOT a user-facing tool (no caller policy hook, no external side effect) — research must confirm the tool surface can host an internal-only tool cleanly without leaking it to caller policy. If it can't, this decision flips to (a) single-fenced-JSON parsing — but only if confirmed unworkable.

**D-03: One decision per turn — strict.**
- A coordinator turn is EITHER `participate` OR `delegate(s)`, never both.
- For Phase 3's fan-out, the parser will accept an array `[delegate, delegate, ...]` from a single turn — never mixed with a participate contribution.
- Phase 1 implementation: single delegate per turn; the array shape is reserved for Phase 3 but the parser/type design must not preclude it.

### Sub-Run Event Shape

**D-04: Three kebab-case event types.** `sub-run-started`, `sub-run-completed`, `sub-run-failed` — added to the `RunEvent` discriminated union in `src/types/events.ts`. Matches existing convention (`model-request`, `agent-turn`, `broadcast`, `final`).

**D-05: `sub-run-started` payload is minimal.**
- Fields: `{ childRunId, parentRunId, parentDecisionId, protocol, intent, depth }`.
- Effective model and budget are NOT on this event — they live in the embedded child trace at completion.
- Note from D-12 (recursive coordinator hint): add an optional `recursive: true` flag when `protocol === "coordinator"` and the parent is also a coordinator. Planner: confirm field placement.

**D-06: `sub-run-completed` carries the full `RunResult`.**
- Field shape: `{ childRunId, parentRunId, parentDecisionId, subResult: RunResult }` where `RunResult` is the existing public type returned by `Dogpile.run()` (bundles output, accounting, transcript, trace).
- Single canonical projection — no duplicated top-level fields. Replay reads `subResult.trace` to recurse.

**D-07: `sub-run-failed` includes a partial trace.**
- Fields: `{ childRunId, parentRunId, parentDecisionId, error: { code, message, providerId?, detail? }, partialTrace }`.
- `partialTrace` shape: same JSON-serializable `Trace` type as completed runs, but truncated at the failure point.
- Locks in the partial-trace schema as a public concern. Phase 4's escalation field can be added later as an optional addition.

### Replay Semantics

**D-08: Replay walks parent events and recurses on `sub-run-completed`.**
- Algorithm: when replay encounters `sub-run-completed`, it calls `replay(event.subResult.trace)` recursively to rehydrate the child without provider invocation; the rehydrated `RunResult` becomes the input to the coordinator's next decision.
- Symmetric with how today's replay handles model calls — by reading the recorded event.
- Single recursion path, no separate replay-only code path inside `coordinator.ts`.

**D-09: Phase 1 replay emits exactly the recorded parent event sequence.**
- For Phase 1: `sub-run-started` → `sub-run-completed` (or `sub-run-failed`) — that's it. No child events bubbled into the parent stream.
- Phase 4 will add child-event bubbling. When it does, both live and replay paths must be updated together so the "identical event sequence" guarantee (TRACE-03) holds.

**D-10: Replay recomputes child accounting (defense in depth).**
- When walking embedded child trace, sum provider events to verify the recorded `accounting` matches.
- On mismatch: throw `DogpileError({ code: "invalid-configuration", detail: { reason: "trace-accounting-mismatch", ... } })` (or similar — planner picks the canonical code).
- Slower than trusting the recorded numbers, but catches corrupted/tampered traces. Aligns with the SDK's posture that traces are first-class artifacts.

### Defaults & Inheritance

**D-11: Child inherits parent's `ConfiguredModelProvider` instance verbatim.**
- Same object reference — same baseURL, same auth, same identity.
- No engine-level provider lookup, no allowlist machinery. Child run lifecycle is intentionally coupled to the parent provider's lifecycle.
- Implication: if the agent emits `delegate.model` with a different provider id, planner must decide — likely error (`invalid-configuration`, "model id does not match parent provider"), since callers haven't declared a provider registry.

**D-12: Child budget default is time-only (`timeoutMs = parent.deadline - now`).**
- No cost-cap inheritance in Phase 1. Cost-budget contention math is explicitly NOT solved here.
- Phase 2 owns cost roll-up; child cost stays uncapped unless agent or caller sets one.
- Per-decision `budget` overrides are honored but cannot exceed parent's remaining time.

**D-13: `maxDepth` is configurable at engine AND per-run; per-run can only lower.**
- `createEngine({ maxDepth: 4 })` sets the ceiling (default 4).
- `Dogpile.pile({ ..., maxDepth: 2 })` can lower it for one run.
- Enforcement: `effectiveMaxDepth = Math.min(engine.maxDepth, run.maxDepth ?? Infinity)` at run start.
- `Dogpile.pile`, `run`, `stream`, `createEngine` all accept the option; types updated; `config-validation.test.ts` covers ceiling enforcement.

### Validation & Limits

**D-14: Depth-overflow validated at BOTH parse time and dispatcher time.**
- Parse-time check (in `decisions.ts` or wherever delegate parsing lands): if `currentDepth + 1 > effectiveMaxDepth`, throw before any event emission.
- Dispatcher-time check (in coordinator/engine sub-run dispatcher, right before child engine spins up): same check, defends against any race or state mutation between parse and dispatch.
- Both throw `DogpileError({ code: "invalid-configuration", detail.path: "decision.protocol" or similar, detail.reason: "depth-overflow", detail.currentDepth, detail.maxDepth })`.

**D-15: `detail.path` is rooted at the decision.**
- Examples: `"decision.protocol"`, `"decision.intent"`, `"decision.budget.timeoutMs"`, `"decision.model"`.
- Self-contained, matches how callers think about the AgentDecision they just parsed.
- Does NOT include trace position (`events[42]`...). Trace location can go in `detail.eventIndex` or similar if planner finds it useful.

**D-16: Recursive coordinator delegate gets a diagnostic hint flag.**
- No special handling beyond depth counting (depth cap remains the runaway-protection mechanism).
- BUT: `sub-run-started` event includes `recursive: true` when the delegated `protocol === "coordinator"` and the dispatching protocol is also `coordinator`.
- Lockable in `event-schema.test.ts`. Helps users spot accidental recursion in traces.

### Decision Context Feedback

**D-17: Child result rendered as `output` + stats line.**
- Format injected into coordinator's next prompt: `[sub-run <childRunId>]: <subResult.output>\n[sub-run <childRunId> stats]: turns=<N> costUsd=<X> durationMs=<Y>`.
- Stats line is a soft contract — keep field names stable but don't lock as schema.
- Token-cost-aware: avoids dumping the full child transcript into every coordinator prompt.

**D-18: Child result lands BOTH as a synthetic transcript entry AND as a structured tag in the next prompt.**
- Synthetic `TranscriptEntry`: `{ agentId: "sub-run:<childRunId>", role: "delegate-result", input: "<delegate request as JSON>", output: "<projected result from D-17>" }`.
- Plus the same projected text appears tagged in the next coordinator prompt construction (so the model doesn't have to mine the transcript to find it).
- Replay-stable; visible in transcript artifact; clearest provenance.
- Lockable: `agentId` prefix `"sub-run:"` and `role: "delegate-result"` become part of the transcript vocabulary — document in CHANGELOG.

## Cross-cutting / open notes for planner

- **Public-surface change inventory** (must move together per CLAUDE.md): `AgentDecision` discriminated union, three new event types in `RunEvent`, `subResult` field carrying `RunResult`, `partialTrace` field on failure, `recursive` flag on `sub-run-started`, `maxDepth` engine + per-run option, transcript role `"delegate-result"` and agentId prefix `"sub-run:"`. Updates required: `event-schema.test.ts`, `result-contract.test.ts`, `package-exports.test.ts` (if any new export surfaces), `package.json` exports/files (if applicable), CHANGELOG v0.4.0 entry.
- **D-02 risk:** built-in-tool path needs research validation — confirm the tool surface in `src/runtime/tools.ts` can host a runtime-internal tool without leaking it through caller-controlled tool policy/registration. Fallback: single-fenced-JSON parsing if the tool surface is hostile.
- **D-10 risk:** if recomputing accounting on replay diverges from existing replay's "trust recorded provider responses" posture, the planner may want to scope it as best-effort (warn + continue) rather than throw. Decision: **throw**, but planner should weigh.
- **Phase 3 forward-compat (Q-03):** parser/type design for delegate must accept `delegate` as either single object OR array — even though Phase 1 only emits single. This is a design constraint, not Phase 1 scope.
- **Phase 4 forward-compat:** `sub-run-failed` payload deliberately leaves room for an optional escalation field. `sub-run-completed`/`sub-run-started` event ordering must support child-event bubbling later without re-numbering the schema.

## Deferred ideas

(none captured during questionnaire — all 18 questions answered with concrete options)

## Next step

```
/gsd-plan-phase 1
```
