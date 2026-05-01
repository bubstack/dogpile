# Phase 9: OTEL Tracing Bridge — Discussion Log

**Date:** 2026-05-01
**Mode:** Power (async batch answering)
**Questions:** 14 total, 14 answered, 0 remaining

---

## Section 1: DogpileTracer Interface Design

**Q-01 — Span creation style**
- Options: startSpan (explicit threading) / startActiveSpan (callback) / Custom interface
- **Selected: startSpan — explicit context threading**
- Rationale: Browser ESM constraint eliminates AsyncLocalStorage; startActiveSpan forces async callback wrapping around every runProtocol boundary which doesn't fit the existing call chain.

**Q-02 — Parent-child span linking**
- Options: Pass parent?: DogpileSpan in options / runId→span map / Opaque context carrier
- **Selected: Pass parent?: DogpileSpan through startSpan options**
- Rationale: Cleanest duck-typed contract; callers bridge parentSpan.spanContext() to OTEL context natively. No extra required methods on DogpileTracer.

**Q-03 — DogpileSpan method shape**
- Options: Minimal (end + setAttribute + setStatus) / +spanContext() / +recordException()
- **Selected: Minimal: end() + setAttribute() + setStatus()**
- Rationale: OTEL Span objects returned by real tracers already provide spanContext() natively. recordException() deferred to a future pass.

---

## Section 2: Integration Architecture

**Q-04 — Engine integration point**
- Options: Wrap runNonStreamingProtocol / Dedicated TracingAdapter class / Event-observer
- **Selected: Wrap runNonStreamingProtocol**
- Rationale: Single seam — run span wraps the full runProtocol call, emit callback intercepts turn/model-call events. Protocols stay unmodified.

**Q-05 — tracer field location**
- Options: EngineOptions only / Both EngineOptions + DogpileOptions / EngineOptions now, defer
- **Selected: Both EngineOptions and DogpileOptions (mirrored surface)**
- Rationale: Consistent with how budget, signal, evaluate, seed are already mirrored. High-level API callers shouldn't need to drop to createEngine just for tracing.

**Q-06 — Sub-run span context threading**
- Options: Thread through RunProtocolOptions (internal) / runId→span map
- **Selected: Thread through RunProtocolOptions (internal type)**
- Rationale: Clean and synchronous — parent span is known at dispatch time. No event-stream coordination needed. RunProtocolOptions is internal, not a public-surface change.

---

## Section 3: Span Scope and Granularity

**Q-07 — Which events get spans**
- Options: 3 from success criteria only / +dogpile.model-call / +dogpile.tool-call
- **Selected: Add dogpile.model-call spans from ModelRequest/ModelResponse events**
- Rationale: Phase 6 already added startedAt/completedAt to ModelRequest/ModelResponseEvents — the timing data is there. model-call spans give provider latency visibility in OTEL backends.

**Q-08 — Agent-turn span timing**
- Options: From model-request startedAt to TurnEvent.at / Simple callback clock / From role-assignment
- **Selected: From first model-request startedAt to TurnEvent at timestamp**
- Rationale: Most accurate wall-clock coverage using Phase 6 provenance timestamps. Worth the event correlation complexity.

**Q-09 — Failed sub-run span**
- Options: ERROR span for failed sub-runs / Only error on parent / Defer
- **Selected: Yes — sub-run-failed gets a dogpile.sub-run span with ERROR status**
- Rationale: Every sub-run gets a span. Fan-out coordinator failures need per-child visibility in OTEL.

---

## Section 4: Span Attributes

**Q-10 — dogpile.run span attributes**
- Options: Minimal (id, protocol, tier) / Standard (+agent_count, outcome, cost) / Rich (+intent, tokens)
- **Selected: Rich — also add intent (truncated), turn_count, input/output tokens**
- Rationale: Full observability. Intent truncated to 200 chars. Callers who need redaction use their OTEL exporter's span processor.

**Q-11 — dogpile.agent-turn span attributes**
- Options: Minimal (agent.id, turn.number) / Standard (+role, model.id, cost) / Rich (+tokens)
- **Selected: Rich — also add token counts per turn (input_tokens, output_tokens)**
- Rationale: Per-turn token breakdown enables cost attribution dashboards. All data available from TurnEvent + ModelResponseEvent correlation.

---

## Section 5: Error Handling and Edge Cases

**Q-12 — Span status on failure**
- Options: ERROR only for exceptions / ERROR for abort+errors, budget-stop=OK+attribute / ERROR for all
- **Selected: ERROR for abort and provider errors; budget-stop = OK with termination_reason attribute**
- Rationale: Budget-stop is intentional behavior. Adding termination_reason attribute lets dashboards filter without marking budget-stops as errors.

**Q-13 — Streaming parity**
- Options: Full parity (stream = same spans) / Deferred / Partial (run span only)
- **Selected: Yes — stream() emits the same span types as run()**
- Rationale: Full parity. Streaming runs are first-class; span truncation at stream boundary would be confusing.

**Q-14 — Replay behavior**
- Options: replay() is tracing-free / replay() emits historical spans / Caller's choice
- **Selected: No — replay() is tracing-free; tracer ignored for replay calls**
- Rationale: Historical spans confuse OTEL backends. Replay is re-computation, not a live run. Explicitly documented.

---

## Claude's Discretion

- **Span name constants** — Exported as `DOGPILE_SPAN_NAMES` object from `/runtime/tracing`; researcher/planner to determine exact export shape.
- **Model-call span correlation** — Implementation detail: buffer latest `model-request` event per agentId in the emit closure to extract `startedAt` for the model-call span.
- **Token accumulation for agent-turn** — Implementation detail: maintain `Map<agentId, { inputTokens, outputTokens }>` updated on `model-response` events, read at `agent-turn` emit time.

## Deferred Ideas

- `dogpile.tool-call` spans — Phase 10 or follow-up
- `recordException()` on DogpileSpan — future pass if callers need it
- Per-call `tracer` override on `RunCallOptions` — deferred, not requested
- Built-in OTLP HTTP exporter — out of scope per REQUIREMENTS.md
- Replay-with-historical-spans — deferred indefinitely
