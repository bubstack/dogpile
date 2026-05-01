---
phase: 03-provider-locality-bounded-concurrency
generated: 2026-04-30
mode: power
answered: 18/18
---

# Phase 3 Context — Provider Locality & Bounded Concurrency

Decisions captured from the power-mode questionnaire (`03-QUESTIONS.json`). These lock the gray areas before research/planning.

## Canonical refs

- `.planning/ROADMAP.md` — Phase 3 success criteria, requirements PROVIDER-01..03, CONCURRENCY-01..02
- `.planning/REQUIREMENTS.md` lines 34–41 — full requirement text
- `.planning/PROJECT.md` — provider-neutral / replayable-trace invariants
- `.planning/STATE.md` — running decision log
- `.planning/phases/01-delegate-decision-sub-run-traces/01-CONTEXT.md` — Phase 1 decisions (D-01..D-18). Notably D-03 (delegate array shape reserved for Phase 3), D-11 (child inherits parent provider verbatim), D-13 (engine + per-run config precedent for `maxDepth`).
- `.planning/phases/02-budget-cancellation-cost-rollup/02-CONTEXT.md` — Phase 2 decisions (D-01..D-20). Notably D-07 (per-child AbortController), D-12 (`subRun.budgetClamped` event pattern), D-19 (public-surface inventory discipline).
- `CLAUDE.md` — public-surface invariants (event-shape changes propagate to `event-schema.test.ts`, `result-contract.test.ts`, `package-exports.test.ts`, `package.json` exports/files, `CHANGELOG.md`)
- `src/types.ts:876` — `ConfiguredModelProvider` interface (Q-01 `metadata?` extension)
- `src/types.ts:1758, 1830` — `Agent.model` / coordinator agents (Q-11 multi-model walk)
- `src/providers/openai-compatible.ts:13` — `defaultBaseURL` constant
- `src/providers/openai-compatible.ts:66` — `createOpenAICompatibleProvider` factory + `validateOptions` (Q-03 construct-time throw)
- `src/providers/openai-compatible.ts:132` — `validateOptions` (Q-03 / Q-04 locality validation lands here)
- `src/providers/openai-compatible.ts:172` — `createURL` baseURL parsing (Q-02 host classification)
- `src/runtime/coordinator.ts:112` — `MAX_DISPATCH_PER_TURN = 8` (Q-06 array-parser interaction)
- `src/runtime/coordinator.ts:180` — coordinator delegate dispatch loop (Q-06 array fan-out lands here)
- `src/runtime/coordinator.ts:215` — current sequential dispatch counter (replaced by semaphore + queue)
- `src/runtime/coordinator.ts:788` — `dispatchDelegate` (Q-07 / Q-09 / Q-10 sibling cancellation + transcript ordering)
- `src/runtime/coordinator.ts:875` — per-child `AbortController` (Phase 2 D-07; reused for Q-09 sibling abort and Q-17 Phase-4 stream-handle hook)
- `src/runtime/decisions.ts:3` — `parseAgentDecision` (Q-06 array shape unlock)
- `src/runtime/validation.ts` — `Q-03` engine-side locality validation hook
- `src/runtime/defaults.ts` — `Q-05` `effectiveMaxConcurrentChildren` resolution; `Q-12` clamp computation
- `src/runtime/engine.ts` — engine config types (Q-05 `maxConcurrentChildren` option threading)
- `src/types/events.ts` — `RunEvent` discriminated union (Q-14 `subRun.concurrencyClamped` variant)
- `src/tests/event-schema.test.ts` — public-surface lock for the new event variant
- `src/tests/result-contract.test.ts` — public-surface lock for the new event in result fingerprint
- `src/tests/config-validation.test.ts` — `Q-03` invalid-locality + `Q-05` per-run-only-lowers
- `src/tests/package-exports.test.ts` — only updated if a new top-level export surfaces (none expected for Phase 3)
- `src/providers/openai-compatible.test.ts` — Q-02 host-classification scenarios
- `src/runtime/coordinator.test.ts` — Q-06/Q-08/Q-09/Q-10/Q-11/Q-12 concurrency scenarios; Q-15 promotion candidate
- `src/tests/concurrency-contract.test.ts` (new, Q-15 hybrid) — created at planner discretion if scenarios grow past ~150 lines

## Decisions

### Provider Locality — Type Shape & Validation

**D-01: `locality` lives in a new `metadata?` object on `ConfiguredModelProvider`.** (Q-01 = b)
- Add `readonly metadata?: { readonly locality?: "local" | "remote"; }` to the `ConfiguredModelProvider` interface (src/types.ts:876).
- Absent `metadata` or absent `metadata.locality` → treated as `remote` for clamping (per PROVIDER-01 wording: "default unknown → treated as `remote` for clamping").
- Future-proofs the surface for additional provider hints (region, sandboxed, etc.) without flattening more keys onto the public interface — Dogpile's small-public-surface invariant (CLAUDE.md) makes the namespace meaningful.
- Implication for Q-11: clamp logic reads `provider.metadata?.locality === "local"`, not `provider.locality`.
- Existing custom providers don't need to change — `metadata` is optional.

**D-02: Auto-detect classifies broadly: loopback + RFC1918 + IPv6 ULA + link-local + `*.local` mDNS.** (Q-02 = c)
- `createOpenAICompatibleProvider` parses `baseURL` (or `defaultBaseURL`) with the existing `new URL(...)` at line 173, then runs the host through a classifier:
  - Loopback hostnames: `localhost`
  - IPv4 ranges: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (link-local)
  - IPv6 addresses: `::1`, `fc00::/7` (ULA), `fe80::/10` (link-local)
  - mDNS hostnames: any host ending in `.local` (case-insensitive)
- Anything else → `remote`.
- Classifier is a small pure helper; planner should colocate next to `createURL` in `src/providers/openai-compatible.ts` and export internally for tests. Suggested name: `classifyHostLocality(host: string): "local" | "remote"`.
- Test fixtures: parameterize one Vitest case over a comprehensive host list (positives + negatives + edge cases like `127.0.0.1.example.com` should be `remote`, `LOCALHOST` should be `local`, IPv6 in brackets like `[::1]`).

**D-03: Validate locality at BOTH `createOpenAICompatibleProvider` AND engine run start (defense-in-depth).** (Q-03 = c)
- **Construct-time:** `createOpenAICompatibleProvider`'s `validateOptions` (openai-compatible.ts:132) gains a check: if `options.locality !== undefined && options.locality !== "local" && options.locality !== "remote"` → throw `DogpileError({ code: "invalid-configuration", path: "locality", expected: "\"local\" | \"remote\"" })` via the existing `throwInvalid` helper.
- **Engine-time:** `src/runtime/validation.ts` gains a `validateProviderLocality(provider: ConfiguredModelProvider)` helper, called from the engine entry path (`createEngine` / `Dogpile.pile` / `run` / `stream`) at run start. Walks `model.metadata?.locality` and every `agent.model.metadata?.locality`. Invalid value → same `invalid-configuration` error with `path: "model.metadata.locality"` or `path: "agents[N].model.metadata.locality"`.
- Mirrors Phase 1 D-14 (depth overflow at parse time AND dispatch time). Catches user-implemented providers that bypass TS, and provides early failure for the bundled adapter common path.

**D-04: Asymmetric override — explicit `"local"` always wins; explicit `"remote"` is REJECTED when baseURL auto-detects local.** (Q-04 = c)
- Inside `createOpenAICompatibleProvider`:
  ```
  const detected = classifyHostLocality(baseURL.hostname);
  if (options.locality === undefined) {
    metadata.locality = detected;
  } else if (options.locality === "local") {
    metadata.locality = "local";  // explicit local always wins
  } else if (options.locality === "remote" && detected === "local") {
    throw new DogpileError({
      code: "invalid-configuration",
      path: "locality",
      detail: { kind: "configuration-validation", reason: "remote-override-on-local-host", host: baseURL.hostname }
    });
  } else {
    metadata.locality = "remote";  // explicit remote, host not detected as local — fine
  }
  ```
- Rationale: a user pointing at `http://localhost:11434/v1` (Ollama) and tagging it `remote` would silently bypass CONCURRENCY-02's local-clamp and could DoS their local box with N concurrent children. Asymmetric guardrail prevents footguns; explicit `"local"` is always honored (e.g., proxied-but-effectively-local setups).
- The throw is part of D-03's construct-time validation surface (`createOpenAICompatibleProvider` only — user-implemented providers aren't subject to this since they don't expose a `baseURL`).
- Public-surface delta: PROVIDER-03 lists generic invalid-configuration; this adds a specific sub-reason `"remote-override-on-local-host"` documented in CHANGELOG.

### Concurrency Configuration & Dispatch Loop

**D-05: `maxConcurrentChildren` configurable at engine + per-run + per-coordinator-decision.** (Q-05 = c)
- Three-level precedence: `engine.maxConcurrentChildren` (default 4) ≥ `Dogpile.pile({ maxConcurrentChildren })` ≥ `decision.maxConcurrentChildren` (per coordinator turn).
- Resolution: `effective = min(engine, run ?? Infinity, decision ?? Infinity)`. Per-run and per-decision can only LOWER the engine ceiling, mirroring Phase 1 D-13's `maxDepth` precedent.
- Decision-level config means the LLM agent itself can declare "fan out at most 2 of these N delegates" on a single turn — useful when the coordinator knows the task partitioning is cheaper-but-serial vs expensive-but-parallel.
- Validation: any of the three values must be a positive integer ≥ 1; otherwise `invalid-configuration` error in `validation.ts`. `0` and negative values rejected.
- Public-surface additions: `engine.maxConcurrentChildren` config option, `Dogpile.pile`/`run`/`stream` accept `maxConcurrentChildren?: number`, `delegate` decision shape gains optional `maxConcurrentChildren?: number`. Update `config-validation.test.ts`, `result-contract.test.ts`, `event-schema.test.ts` (decision shape lock).

**D-06: Coordinator can emit an array of delegates; turn yields N delegates → fan out up to `maxConcurrentChildren` in parallel.** (Q-06 = a)
- Phase 1 D-03 reserved this shape; Phase 3 turns it on. `parseAgentDecision` (src/runtime/decisions.ts) accepts EITHER a single delegate object OR a fenced JSON array of delegate objects. Mixed `participate + delegate` in one turn remains forbidden (D-03 invariant preserved).
- The coordinator's plan-turn dispatch loop (coordinator.ts:180) changes shape: instead of "one delegate per turn, sequentially re-issue plan-turn after each completion", it becomes "collect N delegates from one plan-turn → dispatch via the bounded-concurrency primitive → all N results feed into the NEXT plan-turn's prompt context together (D-10 ordering applies)".
- `MAX_DISPATCH_PER_TURN = 8` (coordinator.ts:112) becomes the cap on N (the coordinator can emit at most 8 delegates per single plan-turn). Existing limit semantics preserved — exceeded → same error shape.
- Single-delegate turns still work (the parser accepts both). Phase 1 traces remain valid; replay path unchanged for single-delegate runs.

**D-07: `sub-run-started` is emitted at slot-acquisition time (when child engine actually starts).** (Q-07 = b — see chat_more / clarification below)
- *Note: questionnaire answer was Q-07=b which adds a separate `sub-run-queued` event variant. Adopt that path:*
- For each delegate in a fan-out array, emit `sub-run-queued` IMMEDIATELY when the delegate is accepted into the dispatch pool (before any concurrency gate). Payload mirrors `sub-run-started`'s minimal fields plus a `queuePosition: number` field. When a slot frees and the child engine is about to be invoked, emit the existing `sub-run-started`. Then completed/failed lands as today.
- Three-event timeline per child under concurrency pressure: `sub-run-queued` → `sub-run-started` → `sub-run-completed` (or `sub-run-failed`). Single-child or no-pressure runs emit only the latter two (no `sub-run-queued` if the child slot is immediately available — saves event noise for the common case).
- Phase 1 D-04's three event types become FOUR. Lock in `event-schema.test.ts`. Replay path: `sub-run-queued` is informational only; replay walks `sub-run-completed`/`sub-run-failed` as today, ignoring queued events for re-execution but emitting them in the same positions for the `identical event sequence` guarantee (Phase 1 TRACE-03).

**D-08: Hand-rolled semaphore-style streaming concurrency.** (Q-08 = a)
- Implement a small dependency-free pool inside `coordinator.ts` (or extracted to `src/runtime/concurrency.ts` if the helper grows):
  - Counter of in-flight children (semaphore).
  - FIFO queue for delegates beyond the limit.
  - On each `sub-run-completed`/`sub-run-failed`, decrement counter and pull next queued delegate.
- Maintains exactly `effective` in-flight at any moment. Better wall-clock throughput when child latencies vary (likely under recursive coordination).
- Dogpile is dependency-free per CLAUDE.md — hand-rolled is the only path; do NOT add `p-limit`. ~30 LOC of straightforward async code.

**D-09: Sibling failure tolerance — let in-flight finish, never start the queued, return ALL outcomes to coordinator.** (Q-09 = a)
- Cooperative cancellation: when a child throws, do NOT abort already-running siblings (their work and provider calls are real spend per Phase 2 D-02). However, immediately drain the queue: any not-yet-started delegates are abandoned with a synthetic `sub-run-failed` event with `error.code: "aborted"` and `error.detail.reason: "sibling-failed"`.
- The coordinator's next plan-turn sees the full mix: `sub-run-completed` for finished successes, `sub-run-failed` for the original failure, `sub-run-failed` (with `sibling-failed` detail) for never-started queue entries.
- New `detail.reason` value: `"sibling-failed"` joins Phase 2 D-08's vocabulary (`"parent-aborted"`, `"timeout"`). Lock in `cancellation-contract.test.ts` or the new `concurrency-contract.test.ts` (Q-15).
- Defers richer escalation to Phase 4 ERROR-02 (coordinator decides what to do). Phase 3 default: surface everything, abort nothing in flight.
- Per-child `AbortController` from Phase 2 D-07 is the cancel boundary used to abandon queued items — never started, never gets a real signal, just an internally-fabricated failed event.

**D-10: Transcript append order is COMPLETION order; replay determinism via stable per-event IDs.** (Q-10 = c)
- Wall-clock fidelity: as `sub-run-completed` events land (in completion order), append the synthetic transcript entry (Phase 1 D-18) immediately. Coordinator's next plan-turn prompt sees children in the order they finished (matches user mental model under parallel dispatch).
- Replay determinism: each delegate gets a stable `parentDecisionId` at dispatch time (the index of the delegate in the source plan-turn array). `sub-run-queued`/`-started`/`-completed` carry this id. Replay walks events in event-array order (which equals the live emission order); transcript reconstruction at replay reproduces the same completion-order append.
- Trade-off vs alternatives: dispatch-order append (Q-10=b) would buffer faster completions until earlier ones land, masking parallelism in the coordinator's prompt — rejected.
- Tested in `coordinator.test.ts` with deliberately staggered child latencies; replay-from-trace must produce identical transcript array order.

### Local-Provider Clamping (CONCURRENCY-02)

**D-11: Re-evaluate locality per dispatch (covers nested coordinator + multi-model agents + future caller-defined trees).** (Q-11 = c)
- At each `dispatchDelegate` call (coordinator.ts:788), walk the parent's *currently-active* provider set: `options.model` plus every `agent.model` in `options.agents`. If ANY has `metadata.locality === "local"`, the effective max for THIS dispatch clamps to 1.
- Re-evaluation is cheap (small N, simple field read) and handles the cases:
  - Nested coordinator at depth 2 with a different model than parent (Phase 1 D-11 inheritance is the default but agent-specific models can break the tree-wide invariant).
  - Future Phase 4+ scenarios where a coordinator dynamically swaps providers (currently disallowed by D-11 but the per-dispatch check is forward-compat insurance).
  - Caller-defined-trees (`Dogpile.nest`, deferred) where children might bring their own providers — Phase 3 stays correct without rework.
- Caching: planner may memoize "does the active tree have any local provider" by reference equality of `options.agents` + `options.model` if profiling shows the walk is a hot path. Default: don't cache; the walk is N ≤ ~4 in practice.

**D-12: `subRun.concurrencyClamped` emitted ONCE at the FIRST delegate dispatch where the clamp would have allowed more parallelism (lazy).** (Q-12 = c)
- Emission semantics:
  - First delegate dispatch in the run where the local-provider check trips → emit `subRun.concurrencyClamped` exactly once with payload `{ requestedMax: <pre-clamp effective>, effectiveMax: 1, reason: "local-provider-detected", providerId: <id of the first local provider found> }`.
  - Subsequent dispatches in the same run do NOT re-emit. The clamp is a property of the active tree; one emission per run is enough audit signal.
  - If a run has no delegates, no event (lazy). If a run has delegates but the locality check never trips (no local providers), no event.
- Public-surface: new event variant locked in `event-schema.test.ts`, `result-contract.test.ts`. Shape mirrors Phase 2 D-12's `subRun.budgetClamped` for consistency.
- The state "have we emitted this run's clamp yet" lives on the engine's per-run runtime context (alongside the existing `events`/`providerCalls` accumulators).
- *Note: D-09's "sibling-failed" event drain on local-clamped runs degenerates to "queue immediately drained at first failure" — there's at most 1 in-flight on a clamped run, so a failure aborts at most 0 in-flight siblings and N-1 queued.*

**D-13: Caller's explicit `maxConcurrentChildren: 8` against a local provider → silent clamp + the event (spec-literal).** (Q-13 = a)
- No throw, no console warning. The `subRun.concurrencyClamped` event IS the warning surface. Matches CONCURRENCY-02 verbatim ("clamps to 1 regardless of caller config and emits a `subRun.concurrencyClamped` warning event").
- Callers wanting noisy warnings subscribe to the `emit` callback already exposed by the engine.
- Dogpile remains logger-free (in line with the runtime invariants in CLAUDE.md — no console writes, no env reads).

### Tests, Public Surface, Plan Breakdown

**D-14: Public-surface inventory locks together (4 additions including the `sub-run-queued` event from D-07).** (Q-14 = b)
- (1) `ConfiguredModelProvider.metadata?: { locality?: "local" | "remote" }` (D-01).
- (2) `maxConcurrentChildren?: number` on `createEngine`, `Dogpile.pile`/`run`/`stream`, AND on the `delegate` decision shape (D-05).
- (3) `subRun.concurrencyClamped` event variant `{ requestedMax, effectiveMax, reason: "local-provider-detected", providerId }` (D-12).
- (4) `sub-run-queued` event variant `{ childRunId, parentRunId, parentDecisionId, protocol, intent, depth, queuePosition }` (D-07).
- Plus (out-of-band): the `decision.maxConcurrentChildren` field on the delegate AgentDecision variant (rolled into #2's lock; one test surface, one CHANGELOG bullet).
- Plus (no public-surface change): the `AgentDecision` parser accepts an array `[delegate, delegate, ...]` per Phase 1 D-03 — type-shape was already declared; Phase 3 just turns on the parser code path.
- All four locked in `event-schema.test.ts`, `result-contract.test.ts`, `package-exports.test.ts` (only if a new export surface — none expected; the new shapes ride existing exports), `config-validation.test.ts` (validation paths), and `CHANGELOG.md` v0.4.0 entry.
- Note vs. spec wording: CONCURRENCY-01 in REQUIREMENTS.md doesn't mention `decision.maxConcurrentChildren` — that's a Phase 3 enhancement we're locking via D-05. Document it as a design choice in CHANGELOG, not a contradiction.

**D-15: Hybrid test organization — start co-located + scenarios in coordinator.test.ts; promote to a new `concurrency-contract.test.ts` if it grows past ~150 lines (planner judgment).** (Q-15 = c)
- Default home (per Phase 2 D-18 precedent):
  - Locality classifier scenarios → `src/providers/openai-compatible.test.ts`.
  - Locality validation throws → `src/tests/config-validation.test.ts`.
  - Concurrency dispatch + array-parser + clamp scenarios → `src/runtime/coordinator.test.ts`.
  - Public-surface event/decision locks → `src/tests/event-schema.test.ts`, `src/tests/result-contract.test.ts`.
  - `sibling-failed`/`local-provider-detected` detail.reason locks → `src/tests/cancellation-contract.test.ts` (extends Phase 2's home).
- Promotion trigger: if concurrency scenarios in `coordinator.test.ts` push past ~150 LOC of additions in this phase, planner extracts a new `src/tests/concurrency-contract.test.ts` for the contract guarantees only. Scenario tests stay in `coordinator.test.ts` regardless.

**D-16: Three plans grouped by concern.** (Q-16 = a)
- **Plan 03-01 — Provider Locality (PROVIDER-01..03):** D-01 (metadata field), D-02 (host classifier), D-03 (dual-validation), D-04 (asymmetric override). Touches `src/types.ts`, `src/providers/openai-compatible.ts`, `src/runtime/validation.ts`. Tests: `openai-compatible.test.ts`, `config-validation.test.ts`. Pure additive — no dispatch-loop changes.
- **Plan 03-02 — Bounded Dispatch + Array-Parser Unlock (CONCURRENCY-01 + Phase 1 D-03 unlock):** D-05 (three-level config), D-06 (array parser), D-07 (queued event), D-08 (semaphore primitive), D-09 (sibling-failed semantics), D-10 (transcript append order). Touches `src/runtime/decisions.ts`, `src/runtime/coordinator.ts`, `src/runtime/defaults.ts`, `src/runtime/engine.ts`, `src/types/events.ts`. Tests: `coordinator.test.ts`, `event-schema.test.ts`, `result-contract.test.ts`, `config-validation.test.ts`, `cancellation-contract.test.ts`. Largest plan; surgical diffs within each file.
- **Plan 03-03 — Local-Provider Clamping + Event (CONCURRENCY-02):** D-11 (per-dispatch locality walk), D-12 (lazy single-emit clamp event), D-13 (silent clamp UX). Touches `src/runtime/coordinator.ts` (consumes Plan 03-02's effective-max plumbing), `src/types/events.ts` (event variant). Tests: `coordinator.test.ts`, `event-schema.test.ts`, `result-contract.test.ts`. Smallest plan; depends on 03-01 (locality metadata) and 03-02 (concurrency primitive).
- Three plans match the three natural concern boundaries; one-per-requirement (5) would split PROVIDER-03 into a 5-LOC plan and is overkill.

### Forward-Compat & Cross-Cutting

**D-17: Pre-allocate per-child stream-handle slot in dispatch result (commented hook).** (Q-17 = b)
- In `dispatchDelegate`, the structure that wires the per-child `AbortController` (Phase 2 D-07) gains a documented placeholder for Phase 4 STREAM-03's per-child cancel handle and stream tap. No runtime code in Phase 3 — just a typed but-undefined slot and a comment marking the hook.
- Concrete suggestion: the internal `DispatchedChild` record (or whatever the planner names the per-child runtime tuple) gains `streamHandle?: never  // STREAM-03 hook (Phase 4)` with a TODO comment naming the requirement.
- Rationale: Phase 4 will land per-child stream demultiplexing on top of the same per-child controller. Pre-marking the slot prevents Phase 4 from needing to refactor the dispatcher shape.
- Zero public-surface impact; pure internal scaffolding.

**D-18: Plan ordering — Locality (03-01) → Concurrency + array parser (03-02) → Local clamping (03-03).** (Q-18 = a)
- Hard dependency: 03-03 needs both the `metadata.locality` field (03-01) and the effective-max-children plumbing (03-02).
- Soft dependency: 03-02 doesn't strictly need 03-01's locality field, but locking 03-01 first means 03-02's clamp-aware dispatch primitive can read `provider.metadata?.locality` from day one without a placeholder.
- Each plan's diff stays surgical: 03-01 doesn't touch `coordinator.ts`; 03-02 doesn't touch `providers/`; 03-03 layers on top with minimal new files.
- Merge order matches Phase 2's pattern (01 → 02 → 03 → 04 in Phase 2).
- CHANGELOG updated once at phase wrap with the D-14 inventory (one batched entry, not per-plan), matching Phase 2 D-20's discipline.

## Cross-cutting / open notes for planner

- **Public-surface change inventory** (must move together per CLAUDE.md): `ConfiguredModelProvider.metadata` field, `maxConcurrentChildren` config (engine + per-run + per-decision), `subRun.concurrencyClamped` event variant, `sub-run-queued` event variant, `delegate` decision array-shape unlock, `detail.reason: "sibling-failed"` and `"remote-override-on-local-host"` strings. Updates required: `event-schema.test.ts`, `result-contract.test.ts`, `package-exports.test.ts` (likely no-op — no new top-level exports), `config-validation.test.ts`, `cancellation-contract.test.ts`, CHANGELOG v0.4.0 entry.

- **D-04 asymmetric throw — vs. spec wording:** PROVIDER-02 says "caller-supplied `locality` overrides auto-detection." Strict reading allows both directions; D-04 forbids `"remote"` on a detected-local host. Document the tightening in CHANGELOG with the sub-reason `"remote-override-on-local-host"` and note the safety argument (DoS prevention on the developer's own box).

- **D-06 / Phase 1 D-03 array parser:** the type union for `AgentDecision` shape was already designed in Phase 1 to accommodate arrays; Phase 3 just enables the runtime path. Planner: confirm `parseAgentDecision` can switch on `Array.isArray(parsed)` without breaking the existing single-object path. Mixed `participate + delegate[]` remains forbidden.

- **D-07 queued event — emission cost:** a 4-child fan-out under no concurrency pressure should NOT emit `sub-run-queued` events (slot is immediately available). Planner: implement the "emit only if the slot wasn't immediately free" gate to keep traces clean for the common case. Tests should cover both the no-pressure path (no queued events) and the pressure path (N-effective queued events).

- **D-09 sibling-failed semantics — partial cost accounting:** queued-but-never-started children that get the synthetic `sub-run-failed` event have ZERO real spend. Phase 2 D-02's `partialCost` field on `sub-run-failed` should be present and equal `emptyCost` for these synthetic events. Planner: confirm `accumulateSubRunCost` (Phase 2 D-06) treats them as zero contributions correctly.

- **D-10 transcript ordering vs. termination:** the parent's termination policies (Phase 2 D-15) evaluate over PARENT-level events only. Completion-order transcript append doesn't affect that — but the order in which `sub-run-completed` events hit the parent's `events` array is the same wall-clock completion order, which is what termination policies see. Confirm this is consistent.

- **D-11 per-dispatch walk performance:** every `dispatchDelegate` re-walks `options.model` + `options.agents` for locality. N is small (typically ≤ 4 agents) and the field read is O(1). Planner: don't memoize prematurely; profile if needed.

- **D-12 single-emit state — concurrency safety:** the "have we emitted the concurrencyClamped event this run?" flag is on the run-level runtime context, not module-level state. Multiple parallel runs on the same engine must each track independently. Phase 2 D-07's per-child controller pattern is the precedent — own the state on the run's accumulator.

- **D-13 silent clamp + Phase 4 escalation:** the event is a warning surface today. Phase 4's coordinator-decides-on-failure (ERROR-02) might let the agent observe the clamp event in its decision context. Plan 03-03 should not preclude that — keep the event shape addressable by `runId` + index, not stash it somewhere unobservable.

- **D-17 stream-handle hook — minimal:** the placeholder is structural, not runtime. Don't allocate a real handle, don't import a stream type — just a documented field-shape commitment so Phase 4 lands cleanly. Comment must reference STREAM-03 by requirement id for traceability.

## Deferred ideas

- **Dynamic locality:** Q-01 option (c) (provider-supplied `getLocality?()` method) was rejected — no runtime case for dynamic switching. Revisit if a provider needs to swap local↔remote between runs (e.g., circuit-breaker fallback to a remote mirror).
- **Caller-defined trees (`Dogpile.nest`):** explicitly deferred per ROADMAP.md milestone scope. D-11's per-dispatch locality walk is forward-compat for this.
- **`p-limit` dependency:** Q-08 option to use a library was rejected — Dogpile is dependency-free. Revisit only if hand-rolled semaphore turns out to have a subtle correctness bug not caught by tests.
- **Logger / console.warn for clamps:** Q-13 option (b) rejected — Dogpile is logger-free per CLAUDE.md. Callers wanting noisy warnings subscribe to `emit`.
- **Per-event coordinator escalation context for the clamp event:** out of scope — Phase 4 ERROR-02 owns "child failure / observable surfaces in the next decision context."

## Next step

```
/gsd-plan-phase 3
```
