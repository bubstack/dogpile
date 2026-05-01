# Research Summary

**Project:** @dogpile/sdk — v0.5.0 Observability and Auditability
**Researched:** 2026-05-01
**Confidence:** HIGH

## Stack Additions

Zero new runtime dependencies. All six features are pure TypeScript additions.

**Test-only devDependencies:**
- `@opentelemetry/api@^1.9.1` — structural compatibility verification in tests
- `@opentelemetry/sdk-trace-base@^2.7.1` — `InMemorySpanExporter` for span assertion tests

**New source files:** `tracing.ts`, `metrics.ts`, `introspection.ts`, `audit.ts`

**New subpath exports (4):** `/runtime/tracing`, `/runtime/metrics`, `/runtime/introspection`, `/runtime/audit` — each triggers the 3-file gate: `package.json` + `package-exports.test.ts` + `check-package-artifacts.mjs`

**OTEL duck-type interface (minimum viable):**
- `DogpileTracer.startSpan(name, options?) → DogpileSpan`
- `DogpileSpan: { setAttribute, setStatus, end, recordException, isRecording }`
- Structurally satisfies any real `@opentelemetry/api@1.9.x` Tracer — no shared import needed

**OTEL attribute conventions:** GenAI semconv keys (`gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`) — development-stage spec, validate at implementation time. Custom `dogpile.*` keys are SDK-stable.

## Feature Build Order

| Phase | Feature | Reason |
|-------|---------|--------|
| 1 | Provenance annotations | Only event-shape change; foundation for all others |
| 2 | Introspection + Health | Pure functions; `health` on `RunResult` established early |
| 3 | Audit schema | Depends on Phase 1+2; pure function; no engine risk |
| 4 | OTEL tracing bridge | Most invasive (engine.ts + coordinator.ts + model.ts); needs stable provenance |
| 5 | Metrics / counters | Fully additive; independent; follows `loggerFromEvents` pattern |

## Key Architecture Decisions

**Two complementary patterns:**

1. **Pure analysis features** (introspection, health, audit) follow `recomputeAccountingFromTrace` precedent — pure functions over `Trace` and `RunEvent[]`, no engine modification.

2. **Active instrumentation** (OTEL tracing, metrics) requires first-class options on `EngineOptions` — span lifecycle (start-before, end-after async ops) cannot be driven from a subscriber-only approach when parent context must propagate across `delegate` child run boundaries.

**Tension resolved:** `tracerFromEvents` exists for post-hoc replay/logging-style use; `tracer?: DogpileTracer` on `EngineOptions` is the primary live-instrumentation surface.

**Provenance scoping:** Optional on `ModelRequestEvent` and `ModelResponseEvent` only. Never on `model-output-chunk` (hot path).

**Audit independence:** `AuditRecord` is an independent type with its own `auditSchemaVersion: "1"` — not derived from `RunEvent` via `Pick`/`Omit`.

## Watch Out For

1. **Non-JSON trace values** — `Date` objects, `Error` instances, `SpanContext` with methods silently break `replay()`. All timestamps must be ISO-8601 strings. Add explicit `JSON.stringify → JSON.parse` round-trip assertion to `result-contract.test.ts` for every new field class.

2. **`@opentelemetry/*` imported in `src/runtime/`** — breaks browser ESM bundle. Add grep-based test asserting no OTEL import in `src/runtime/`, `src/browser/`, `src/providers/`.

3. **Hooks throwing in the protocol loop** — every `tracer.startSpan`, metrics hook, and audit call must be wrapped in `try { ... } catch (err) { logger.error?.(...) }`.

4. **Provenance on `model-output-chunk`** — per-call only; per-chunk multiplies timestamp formatting and bloats embedded child traces.

5. **Audit schema coupled to `RunEvent`** — `AuditRecord` must have its own `auditSchemaVersion` field and a frozen fixture test (`src/tests/fixtures/audit-record-v1.json`).

## Open Questions (Resolve at Phase Planning)

- **Phase 4 (OTEL):** `RunCallOptions.parentSpanContext` — should it carry a `DogpileSpan` object or a separate `DogpileSpanContext` value type? Passing `DogpileSpan` creates coupling from `RunCallOptions` → `tracing.ts` types.
- **Provenance opt-in vs. always-on:** Always-on is simpler (data already captured in `generateModelTurn`). Add a `provenance: boolean` option only if overhead is measured.
- **Anomaly threshold defaults:** Start with narrow configurable defaults; expand anomaly codes in subsequent releases.

---
*Research completed: 2026-05-01 | Ready for roadmap: yes*
