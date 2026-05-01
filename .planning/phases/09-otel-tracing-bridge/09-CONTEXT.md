# Phase 9: OTEL Tracing Bridge - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a duck-typed OTEL tracing bridge: callers inject an optional `tracer` field on `EngineOptions` and `DogpileOptions`; the SDK emits spans for run start/end, sub-run start/end, agent-turn start/end, and model-call start/end with correct parent-child ancestry and rich attributes; runs with no tracer complete with zero overhead and no behavior change.

No `@opentelemetry/*` imports appear in `src/runtime/`. The duck-typed `DogpileTracer` interface and `DogpileSpan` interface are exported from a new `/runtime/tracing` subpath. `replay()` / `replayStream()` are explicitly tracing-free.

</domain>

<decisions>
## Implementation Decisions

### DogpileTracer Interface (Q-01, Q-02, Q-03)

- **D-01: `DogpileTracer` exposes `startSpan(name: string, options?: DogpileSpanOptions): DogpileSpan`.** Explicit context threading — no callback wrapping, no ambient context required. The SDK passes the parent run's span object through its internal options when dispatching sub-runs. Callers get a simple interface; context plumbing is inside the SDK.
- **D-02: Parent-child linking via `parent?: DogpileSpan` in `DogpileSpanOptions`.** `startSpan(name, { parent: parentSpan })` — the SDK passes the parent run's active span by reference. The caller's tracer implementation extracts `parentSpan.spanContext()` and bridges it to OTEL's native context (e.g., `trace.setSpan(context.active(), parentSpan)`). No opaque context type required; no `contextFor()` method on the interface.
- **D-03: `DogpileSpan` is minimal — `end() + setAttribute() + setStatus()`.** No `spanContext()` on the exported interface (the caller's concrete span object returns by `startSpan` provides it natively for parent linking). No `recordException()` in Phase 9 — error details captured via `setStatus('error', message)` and attributes. Full interface:
  ```ts
  interface DogpileSpan {
    end(): void;
    setAttribute(key: string, value: string | number | boolean): void;
    setStatus(code: 'ok' | 'error', message?: string): void;
  }

  interface DogpileSpanOptions {
    readonly parent?: DogpileSpan;
    readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  }

  interface DogpileTracer {
    startSpan(name: string, options?: DogpileSpanOptions): DogpileSpan;
  }
  ```
  The concrete span object returned by a real OTEL tracer satisfies `DogpileSpan` structurally — no shared import needed.

### Integration Architecture (Q-04, Q-05, Q-06)

- **D-04: Integration point is `runNonStreamingProtocol` (and the parallel streaming path for full parity).** The engine opens a `dogpile.run` span before calling `runProtocol`, closes it on result or error. Agent-turn and model-call spans are opened/closed by intercepting specific event types in the `emit` callback within the same closure. Protocols (`sequential.ts`, `broadcast.ts`, etc.) remain unmodified — tracing lives entirely in `engine.ts`.
- **D-05: `tracer` is added to both `EngineOptions` and `DogpileOptions`.** `DogpileOptions` already mirrors most `EngineOptions` fields (`budget`, `signal`, `evaluate`, `seed`). Adding `tracer?: DogpileTracer` to both is consistent with the mirrored-surface pattern and lets high-level API callers (`Dogpile.pile`, `run`, `stream`) access tracing without dropping to `createEngine`. This is a public-surface change — update `package.json` exports, `CHANGELOG.md`, and `CLAUDE.md` accordingly.
- **D-06: Sub-run parent span threaded through internal `RunProtocolOptions`.** Add `parentSpan?: DogpileSpan` to the internal (non-exported) `RunProtocolOptions` type. When coordinator dispatches a child run via `runProtocol(childInput)`, it passes the active parent run span. Clean and synchronous — parent span is known at dispatch time without event-stream coordination. `RunProtocolOptions` is internal, not a public-surface change.

### Span Scope and Granularity (Q-07, Q-08, Q-09)

- **D-07: Four span types — `dogpile.run`, `dogpile.sub-run`, `dogpile.agent-turn`, `dogpile.model-call`.** Phase 9 goes one step beyond the success criteria minimum by adding `dogpile.model-call` spans derived from `ModelRequestEvent` (with `startedAt` from Phase 6 provenance) and `ModelResponseEvent` (with `completedAt`). Model-call spans are children of their agent-turn span. Tool-call spans are deferred. Span hierarchy: `dogpile.run → dogpile.sub-run → dogpile.agent-turn → dogpile.model-call`.
- **D-08: `dogpile.agent-turn` span timing — from `ModelRequestEvent.startedAt` to `TurnEvent.at`.** Uses Phase 6 provenance timestamps for accurate wall-clock coverage (provider call latency + decision processing). Start time is extracted from the `model-request` event that precedes each agent turn (correlated by agentId and turn sequence). `dogpile.model-call` span similarly uses `ModelRequestEvent.startedAt` → `ModelResponseEvent.completedAt`.
- **D-09: `sub-run-failed` gets a `dogpile.sub-run` span with ERROR status.** Span is opened on `sub-run-started` and closed with `setStatus('error', event.error.message)` on `sub-run-failed`. Consistent with "every sub-run gets a span" semantics; gives OTEL backends full visibility into failed fan-out coordinator patterns.

### Span Attributes (Q-10, Q-11)

- **D-10: `dogpile.run` span carries rich attributes.** Full attribute set:
  - Pre-run (set at span start): `dogpile.run.id`, `dogpile.run.protocol`, `dogpile.run.tier`
  - End-time (set before `span.end()`): `dogpile.run.agent_count`, `dogpile.run.outcome` (`"completed"` / `"budget-stopped"` / `"aborted"`), `dogpile.run.cost_usd`, `dogpile.run.turn_count`, `dogpile.run.input_tokens`, `dogpile.run.output_tokens`
  - Intent: `dogpile.run.intent` truncated to first 200 characters (callers who consider intent sensitive should use a span processor/filter on their exporter — the SDK does not redact)
- **D-11: `dogpile.agent-turn` span carries rich attributes.** Full attribute set:
  - At span open: `dogpile.agent.id`, `dogpile.turn.number`, `dogpile.agent.role`
  - At span close (from TurnEvent and provenance): `dogpile.model.id`, `dogpile.turn.cost_usd`, `dogpile.turn.input_tokens`, `dogpile.turn.output_tokens`
  - Token counts require correlating with the `ModelResponseEvent` that precedes the TurnEvent for that turn (same agentId, same turn number).

### Error Handling and Edge Cases (Q-12, Q-13, Q-14)

- **D-12: Span status — `ERROR` for abort and provider errors; `OK` for budget-stop with `termination_reason` attribute.** Budget-stop is intentional termination, not an error. Spans for budget-stopped runs: `setStatus('ok')` + `setAttribute('dogpile.run.termination_reason', event.reason)` (e.g., `'usd-cap'`, `'turn-cap'`). Abort and thrown `DogpileError`: `setStatus('error', error.message)`. Callers who want budget-stop to appear as error can check the `termination_reason` attribute in their backend.
- **D-13: `stream()` has full tracing parity with `run()`.** All four span types apply to the streaming path. `dogpile.run` span opens at stream start and closes when the final event is emitted (or on cancel/abort). Sub-run, agent-turn, and model-call spans behave identically. Requires wiring into the streaming code path in `engine.ts`.
- **D-14: `replay()` and `replayStream()` are tracing-free.** If a `tracer` is on the engine, it is explicitly ignored for replay calls. Document this in the `/runtime/tracing` JSDoc and in `docs/developer-usage.md`. Emitting historical spans would confuse OTEL backends with past-timestamped spans; the correct pattern is to run the original live run against a tracing engine, not to replay with spans.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/ROADMAP.md` — Phase 9 goal, success criteria, OTEL-01/OTEL-02/OTEL-03 requirement refs
- `.planning/REQUIREMENTS.md` — Full OTEL-01, OTEL-02, OTEL-03 requirement text and traceability
- `.planning/PROJECT.md` — Milestone goal, constraints, public-surface invariants, core value statement
- `.planning/STATE.md` — Accumulated milestone decisions ("No `@opentelemetry/*` imports in `src/runtime/`", public-surface invariants must move together)

### Prior Phase Context (MUST read — decisions carry forward)
- `.planning/phases/06-provenance-annotations/06-CONTEXT.md` — `ModelRequestEvent.startedAt` / `ModelResponseEvent.completedAt` provenance timestamps; `/runtime/provenance` subpath pattern (template for `/runtime/tracing`)
- `.planning/phases/07-structured-event-introspection-health-diagnostics/07-CONTEXT.md` — `/runtime/introspection` and `/runtime/health` subpath wiring steps (D-05 follows identical steps for `/runtime/tracing`)
- `.planning/phases/08-audit-event-schema/08-CONTEXT.md` — `/runtime/audit` subpath wiring pattern (same pattern, 3rd repetition)

### Critical Type Definitions (MUST read before implementing)
- `src/types.ts:1880–1960` — `EngineOptions` interface (D-05: add `tracer?: DogpileTracer`)
- `src/types.ts:1783–1858` — `DogpileOptions` interface (D-05: mirror `tracer` field here too)
- `src/types/events.ts:503–535` — `SubRunStartedEvent` (`childRunId`, `parentRunId`, `depth` — context for D-09)
- `src/types/events.ts:36–220` — `ModelRequestEvent`, `ModelResponseEvent` — `startedAt`/`completedAt` provenance fields used in D-08
- `src/types/events.ts:318–345` — `TurnEvent` (`agentId`, `turnNumber`, `cost`) — used for D-11 attribute derivation

### Engine Integration Points (MUST read before implementing)
- `src/runtime/engine.ts:690–755` — `runNonStreamingProtocol` — D-04 integration point for the run span
- `src/runtime/engine.ts:785–870` — `runProtocol` and `RunProtocolOptions` — D-06: add `parentSpan?` to this internal type
- `src/runtime/engine.ts:268–270` — existing `parentRunIds` extraction pattern in the streaming path
- `src/runtime/sequential.ts:62–90` — `emit` callback pattern used by all protocols — D-04 intercepts events here

### Public Surface Gates (MUST update in lockstep)
- `src/tests/package-exports.test.ts` — `/runtime/tracing` subpath must be added
- `package.json` `exports` and `files` — `/runtime/tracing` subpath wiring
- `CHANGELOG.md` — new `DogpileTracer` type, `DogpileSpan` type, `DogpileSpanOptions` type, `tracer` field on `EngineOptions` and `DogpileOptions`, `/runtime/tracing` subpath, four new span names
- `CLAUDE.md` — public-surface invariant chain must include Phase 9 additions
- `src/tests/event-schema.test.ts` — no new event types, but span names should be documented as constants
- `docs/developer-usage.md` — add OTEL tracing section; document that `replay()` is tracing-free (D-14)

### Phase 6 Subpath Pattern (follow exactly for /runtime/tracing)
- `src/runtime/provenance.ts` — reference implementation: pure TS, no Node-only deps, no filesystem, no side effects. `src/runtime/tracing.ts` must satisfy same constraints (same code runs in Node, Bun, browser ESM).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/runtime/provenance.ts` — structural template for `src/runtime/tracing.ts`. Pure TS export-only module. `DogpileTracer`, `DogpileSpan`, `DogpileSpanOptions` follow this module shape.
- `src/runtime/engine.ts:runNonStreamingProtocol` — D-04 integration point. The `emit` callback closure at line ~706 is where event interception for agent-turn and model-call spans lives.
- `src/runtime/defaults.ts` — convention for exported constants; span name constants (`SPAN_NAMES`) should follow this pattern if exported.

### Established Patterns
- **Standalone subpath module pattern** (`/runtime/provenance`, `/runtime/introspection`, `/runtime/health`, `/runtime/audit`) — pure TS, no Node-only deps. `src/runtime/tracing.ts` is the 5th entry in this family.
- **`exactOptionalPropertyTypes`** — `tracer?` on `EngineOptions`/`DogpileOptions` must be absent (not `undefined`) when not provided. Pattern: use conditional spread `...(options.tracer ? { tracer: options.tracer } : {})`.
- **Internal type threading** — `RunProtocolOptions` is the existing internal type that threads options through `runProtocol`. Adding `parentSpan?: DogpileSpan` follows the same pattern as `emit`, `signal`, `parentDeadlineMs`.
- **`readonly` everywhere** — `DogpileTracer`, `DogpileSpan`, `DogpileSpanOptions` use `readonly` on all fields, consistent with all other SDK types.

### Integration Points
- **`runNonStreamingProtocol` — the seam.** Opens `dogpile.run` span before `runProtocol`, intercepts `emit` to open/close agent-turn and model-call spans, closes `dogpile.run` span in the `finally` block or after result. For sub-run spans, the span is opened when `sub-run-started` fires in `emit` and closed when `sub-run-completed` or `sub-run-failed` fires.
- **`runProtocol(childInput)` — coordinator delegation.** `RunProtocolOptions` gets `parentSpan?: DogpileSpan`. The coordinator passes the currently open sub-run span (or run span for depth-1 sub-runs) as the parent. The child run opens its own `dogpile.run` span with `{ parent: parentSpan }`.
- **Streaming path — needs parallel wiring.** The streaming code path in `engine.ts` (around `runStreamingProtocol`) needs the same tracing wrapper as `runNonStreamingProtocol`. The event stream is already emitted progressively; span open/close follows the same event-based logic.
- **Replay guard.** At the top of the replay path, check `if (options.tracer)` and do nothing — tracer is silently ignored. Add a dev-time log (matching existing logger pattern) warning that tracer is ignored in replay mode.
- **Model-call span correlation.** `ModelRequestEvent` precedes `TurnEvent` for the same agent turn. To open a model-call span with accurate `startedAt`, buffer the most recent `model-request` event per agentId in the `emit` closure and use its `startedAt` timestamp when a `model-response` event arrives.

</code_context>

<specifics>
## Specific Ideas

- **DogpileTracer full type sketch** (from D-01–D-03):
  ```ts
  export interface DogpileSpan {
    end(): void;
    setAttribute(key: string, value: string | number | boolean): void;
    setStatus(code: 'ok' | 'error', message?: string): void;
  }

  export interface DogpileSpanOptions {
    readonly parent?: DogpileSpan;
    readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  }

  export interface DogpileTracer {
    startSpan(name: string, options?: DogpileSpanOptions): DogpileSpan;
  }
  ```
  Callers using real OTEL: `const tracer = otelApi.trace.getTracer('dogpile')` — the returned OTEL `Tracer` structurally satisfies `DogpileTracer` if the caller wraps it to accept `parent?: DogpileSpan` in options (bridge function in their code, not ours).

- **Span name constants** — export from `/runtime/tracing`:
  ```ts
  export const DOGPILE_SPAN_NAMES = {
    RUN: 'dogpile.run',
    SUB_RUN: 'dogpile.sub-run',
    AGENT_TURN: 'dogpile.agent-turn',
    MODEL_CALL: 'dogpile.model-call',
  } as const;
  ```

- **`dogpile.run.intent` truncation** — `intent.slice(0, 200)` — no ellipsis needed; callers who need the full intent have it on their `RunResult`. Truncation prevents oversized span metadata in OTEL exporters.

- **Token correlation for `dogpile.agent-turn` attributes (D-11)** — In the `emit` closure, maintain a `Map<agentId, { inputTokens: number; outputTokens: number }>` updated on each `model-response` event. When `agent-turn` fires, read the accumulated tokens for that agentId and set them as end-time attributes before closing the span.

- **`dogpile.model-call` span attributes** — `dogpile.model.id`, `dogpile.call.id` (from `callId` in `ModelRequestEvent`), `dogpile.model.input_tokens`, `dogpile.model.output_tokens`, `dogpile.model.cost_usd`. Start time from `ModelRequestEvent.startedAt`, end time from `ModelResponseEvent.completedAt`.

- **Replay guard implementation** — In `engine.ts` replay path, detect replay by checking if the input is a `Trace` (vs. a live `runProtocol` call). The tracing adapter simply does not call `tracer.startSpan` for replay. A `// tracer is not applied to replay — see docs/developer-usage.md` comment at the guard site.

</specifics>

<deferred>
## Deferred Ideas

- **`dogpile.tool-call` spans** — deferred from Phase 9 (Q-07 option c). Tool call events are in the stream but wiring them into the span hierarchy adds significant complexity. Deferred to Phase 10 or a follow-up slice.
- **`recordException()` on `DogpileSpan`** — deferred from Q-03. Error details captured via `setStatus + setAttribute` in Phase 9. A `recordException()` method (matching OTEL's Span API) could be added if callers need structured exception events.
- **`tracer` on `RunCallOptions` (per-call override)** — not added. The tracer is set once at the engine level. Per-call tracer overrides would require passing it through `Engine.run(intent, options)` and `Engine.stream(intent, options)`, which is an additional surface expansion. Deferred unless requested.
- **Built-in OTLP HTTP exporter** — explicitly out of scope per REQUIREMENTS.md Future Requirements. Caller owns exporters; SDK only provides the duck-typed interface.
- **Replay-with-historical-spans** — explicitly not shipped (D-14). The option exists in OTEL (explicit span start/end time), but it's confusing and fragile. Deferred indefinitely.
- **Span processor / filter hook on DogpileTracer** — not added. Callers who want to filter `dogpile.run.intent` or other sensitive attributes should use their OTEL exporter's span processor. The SDK does not provide a separate filtering layer.

</deferred>

---

*Phase: 9-OTEL Tracing Bridge*
*Context gathered: 2026-05-01*
