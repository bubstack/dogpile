# Phase 9: OTEL Tracing Bridge - Research

**Researched:** 2026-05-01
**Domain:** Duck-typed OTEL tracer injection, span lifecycle management, engine.ts integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**DogpileTracer Interface (D-01 – D-03)**

- **D-01:** `DogpileTracer` exposes `startSpan(name: string, options?: DogpileSpanOptions): DogpileSpan`. Explicit context threading — no callback wrapping, no ambient context required.
- **D-02:** Parent-child linking via `parent?: DogpileSpan` in `DogpileSpanOptions`. The SDK passes the parent run's active span by reference. The caller's tracer implementation bridges it to OTEL's native context. No opaque context type, no `contextFor()` method.
- **D-03:** `DogpileSpan` is minimal: `end()`, `setAttribute(key, value)`, `setStatus(code, message?)`. No `spanContext()`. No `recordException()`. Full interface:

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

**Integration Architecture (D-04 – D-06)**

- **D-04:** Integration point is `runNonStreamingProtocol` (and the parallel streaming path). The engine opens a `dogpile.run` span before calling `runProtocol`, closes it in `finally`. Agent-turn and model-call spans intercept event types in the `emit` callback. Protocols remain unmodified — tracing lives entirely in `engine.ts`.
- **D-05:** `tracer` added to both `EngineOptions` and `DogpileOptions` as `tracer?: DogpileTracer`. Public-surface change — update `package.json` exports, `CHANGELOG.md`, and `CLAUDE.md`.
- **D-06:** `parentSpan?: DogpileSpan` added to internal `RunProtocolOptions`. Coordinator passes the active parent run span when dispatching child runs. Not a public-surface change.

**Span Scope and Granularity (D-07 – D-09)**

- **D-07:** Four span types: `dogpile.run`, `dogpile.sub-run`, `dogpile.agent-turn`, `dogpile.model-call`. Hierarchy: `dogpile.run → dogpile.sub-run → dogpile.agent-turn → dogpile.model-call`.
- **D-08:** `dogpile.agent-turn` timing from `ModelRequestEvent.startedAt` to `TurnEvent.at`. `dogpile.model-call` timing from `ModelRequestEvent.startedAt` to `ModelResponseEvent.completedAt`. Uses Phase 6 provenance timestamps.
- **D-09:** `sub-run-failed` gets a `dogpile.sub-run` span with ERROR status: `setStatus('error', event.error.message)`.

**Span Attributes (D-10 – D-11)**

- **D-10:** `dogpile.run` attributes — pre-run: `dogpile.run.id`, `dogpile.run.protocol`, `dogpile.run.tier`; end-time: `dogpile.run.agent_count`, `dogpile.run.outcome`, `dogpile.run.cost_usd`, `dogpile.run.turn_count`, `dogpile.run.input_tokens`, `dogpile.run.output_tokens`; intent: `dogpile.run.intent` truncated to 200 chars.
- **D-11:** `dogpile.agent-turn` attributes — at open: `dogpile.agent.id`, `dogpile.turn.number`, `dogpile.agent.role`; at close: `dogpile.model.id`, `dogpile.turn.cost_usd`, `dogpile.turn.input_tokens`, `dogpile.turn.output_tokens`.

**Error Handling and Edge Cases (D-12 – D-14)**

- **D-12:** Span status — ERROR for abort and provider errors; OK for budget-stop with `dogpile.run.termination_reason` attribute.
- **D-13:** `stream()` has full tracing parity with `run()`. All four span types apply. `dogpile.run` span closes on final event or abort.
- **D-14:** `replay()` and `replayStream()` are tracing-free. Tracer is explicitly ignored; document in JSDoc and `docs/developer-usage.md`. Add `// tracer is not applied to replay` comment at guard site.

### Claude's Discretion

None — all decisions in CONTEXT.md are locked.

### Deferred Ideas (OUT OF SCOPE)

- `dogpile.tool-call` spans — deferred to Phase 10+.
- `recordException()` on `DogpileSpan` — deferred.
- `tracer` on `RunCallOptions` (per-call override) — deferred.
- Built-in OTLP HTTP exporter — explicitly out of scope per REQUIREMENTS.md.
- Replay-with-historical-spans — explicitly not shipped (D-14).
- Span processor / filter hook on DogpileTracer — deferred.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OTEL-01 | Caller injects duck-typed OTEL-compatible tracer on `EngineOptions`; receives spans for run start/end, sub-run start/end, agent turn start/end | D-01–D-11 cover interface design and emission points; integration seam in `runNonStreamingProtocol` via `emit` callback interception |
| OTEL-02 | Sub-run spans nested under parent run spans reflecting `parentRunIds` ancestry — child runs are not disconnected root traces | D-06 threads `parentSpan` through `RunProtocolOptions`; coordinator `runProtocol` delegation passes active span by reference |
| OTEL-03 | Tracer injection is optional; runs complete with zero span overhead when absent | No-op guard: all span calls are behind `if (options.tracer)` checks; no allocation or branch cost when tracer absent |

</phase_requirements>

---

## Summary

Phase 9 adds a duck-typed OTEL tracing bridge to `engine.ts`. The three locked interfaces (`DogpileTracer`, `DogpileSpan`, `DogpileSpanOptions`) are exported from a new `/runtime/tracing` subpath — the fifth entry in the established standalone subpath family (`provenance`, `introspection`, `health`, `audit`, `tracing`). No `@opentelemetry/*` imports appear anywhere in `src/runtime/`, `src/browser/`, or `src/providers/`; a new grep-based test enforces this boundary.

The integration seam is `runNonStreamingProtocol` in `engine.ts`. A `dogpile.run` span opens before `runProtocol` is called, closes in `finally`. The `emit` callback intercepts `model-request`, `model-response`, `agent-turn`, `sub-run-started`, `sub-run-completed`, and `sub-run-failed` events to open/close sub-run, agent-turn, and model-call spans. The streaming path receives identical wiring. `replay()` and `replayStream()` explicitly ignore any tracer.

**Primary recommendation:** Implement `src/runtime/tracing.ts` following the `provenance.ts` template, integrate in `engine.ts` via the locked `emit`-interception pattern, wire the `/runtime/tracing` subpath following the established `health`/`introspection` pattern, and add a no-otel-imports enforcement test mirroring `no-node-builtins.test.ts`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DogpileTracer/DogpileSpan type definitions | Runtime module (`src/runtime/tracing.ts`) | — | Follows standalone subpath pattern; pure TS, no side effects |
| Span lifecycle management | Engine (`src/runtime/engine.ts`) | — | D-04 locks integration to `runNonStreamingProtocol` + streaming path; protocols are not modified |
| Sub-run parent span threading | Engine internal (`RunProtocolOptions`) | Coordinator protocol | D-06: `parentSpan?` in internal options, passed at coordinator dispatch |
| Replay tracing guard | Engine (`src/runtime/engine.ts`) | — | D-14: explicit ignore at replay entry; no protocol involvement |
| Grep enforcement of no OTEL imports | Test (`src/tests/`) | — | New test mirroring `no-node-builtins.test.ts` |

---

## Standard Stack

### Core (devDependencies only — NOT runtime deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opentelemetry/api` | `1.9.1` | Provides `InMemorySpanExporter`-compatible types for test assertions + user-side bridge examples | Reference implementation for duck-typing compatibility verification |
| `@opentelemetry/sdk-trace-base` | `2.7.1` | `InMemorySpanExporter` for contract tests — success criterion 1 requires it | The only OTEL package that enters the repo; test/devDep only |

**Version verified:** [VERIFIED: npm registry] — `@opentelemetry/api@1.9.1` and `@opentelemetry/sdk-trace-base@2.7.1` as of 2026-05-01.

**Current devDeps:** `{}` for OTEL (none present). Both packages must be added as devDependencies.

**Installation (devDeps only):**
```bash
pnpm add -D @opentelemetry/api @opentelemetry/sdk-trace-base
```

**No runtime deps are added.** The SDK bundle and `src/runtime/` stay OTEL-free.

---

## Architecture Patterns

### System Architecture Diagram

```
caller                engine.ts              tracing.ts
  |                      |                       |
  |--tracer?------------>|                       |
  |                      |                       |
  |  run(intent)         |                       |
  |--------------------->|                       |
  |                   open dogpile.run span       |
  |                      |--startSpan('dogpile.run')-->|
  |                      |                       |
  |                   runProtocol (emit cb)       |
  |                      |                       |
  |                   model-request event        |
  |                      |--buffer startedAt     |
  |                   model-response event       |
  |                      |--open dogpile.model-call span
  |                      |--close dogpile.model-call span
  |                   agent-turn event           |
  |                      |--open/close dogpile.agent-turn span
  |                   sub-run-started event      |
  |                      |--open dogpile.sub-run span (parent=run span)
  |                      |  runProtocol(childInput, {parentSpan})
  |                      |    child: open dogpile.run span (parent=sub-run span)
  |                   sub-run-completed/failed   |
  |                      |--close dogpile.sub-run span
  |                   finally: close dogpile.run span
  |<--RunResult----------|
```

### Recommended Module Structure

```
src/
├── runtime/
│   ├── tracing.ts           # New: DogpileTracer, DogpileSpan, DogpileSpanOptions, DOGPILE_SPAN_NAMES
│   ├── engine.ts            # Modified: tracer integration in runNonStreamingProtocol + stream path
│   └── ...existing files unchanged...
├── tests/
│   ├── no-otel-imports.test.ts   # New: grep test enforcing no @opentelemetry/* in src/runtime/
│   └── ...existing tests...
└── types.ts                 # Modified: tracer? field on EngineOptions + DogpileOptions
```

### Pattern 1: `src/runtime/tracing.ts` Module Shape

Follows `src/runtime/provenance.ts` exactly — pure TS, no Node-only deps, no side effects, no imports beyond types.

```typescript
// Source: src/runtime/provenance.ts template

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

export const DOGPILE_SPAN_NAMES = {
  RUN: 'dogpile.run',
  SUB_RUN: 'dogpile.sub-run',
  AGENT_TURN: 'dogpile.agent-turn',
  MODEL_CALL: 'dogpile.model-call',
} as const;
```

### Pattern 2: `exactOptionalPropertyTypes` Compliance for `tracer?`

Per CLAUDE.md: `tracer?` must be absent (not `undefined`) when not provided.

```typescript
// Adding tracer to RunProtocolOptions spread — use conditional spread pattern
...(options.tracer ? { tracer: options.tracer } : {})
```

### Pattern 3: Zero-Overhead Guard in `runNonStreamingProtocol`

```typescript
async function runNonStreamingProtocol(options: NonStreamingProtocolOptions): Promise<RunResult> {
  const tracer = options.tracer;
  const runSpan = tracer?.startSpan(DOGPILE_SPAN_NAMES.RUN, {
    attributes: {
      'dogpile.run.id': runId,
      'dogpile.run.protocol': options.protocol.kind,
      'dogpile.run.tier': options.tier,
      'dogpile.run.intent': options.intent.slice(0, 200),
    }
  });

  // track open sub-run and agent-turn spans keyed by childRunId / agentId
  const subRunSpans = new Map<string, DogpileSpan>();
  const agentTurnSpans = new Map<string, DogpileSpan>();
  // buffer most-recent ModelRequestEvent per agentId for D-08 timing
  const pendingModelRequests = new Map<string, ModelRequestEvent>();

  try {
    const result = await abortLifecycle.run(runProtocol({
      ...options,
      ...(runSpan ? { parentSpan: runSpan } : {}),
      emit(event: RunEvent): void {
        emittedEvents.push(event);
        if (!tracer) return; // zero-overhead fast path

        // intercept span-relevant events...
      },
      ...
    }));
    // set end-time attributes on runSpan, close
    runSpan?.setStatus('ok');
    runSpan?.end();
    return result;
  } catch (error) {
    runSpan?.setStatus('error', errorMessage(error));
    runSpan?.end();
    throw error;
  }
}
```

### Pattern 4: Sub-Run Span Threading via `RunProtocolOptions`

Add to the internal `RunProtocolOptions` type (not exported, not a public-surface change):

```typescript
interface RunProtocolOptions {
  // ...existing fields...
  readonly parentSpan?: DogpileSpan;  // D-06: thread parent span for coordinator dispatch
}
```

In `runProtocol` coordinator case, pass `parentSpan` through to `runProtocol` recursive call:

```typescript
runProtocol: (childInput) =>
  runProtocol({
    ...childInput,
    protocol: normalizeProtocol(childInput.protocol),
    ...(options.parentSpan ? { parentSpan: options.parentSpan } : {})
  })
```

### Pattern 5: No-OTEL Imports Enforcement Test

Mirrors `src/tests/no-node-builtins.test.ts` — walks `src/runtime/`, `src/browser/`, `src/providers/` and asserts no import specifier starts with `@opentelemetry/`.

```typescript
// src/tests/no-otel-imports.test.ts
const OTEL_SCOPE = "@opentelemetry/";

// ... walk files ... check import specifiers
expect(offenders).toEqual([]);
```

### Pattern 6: User-Side OTEL Bridge (Code Example)

**Critical:** Real `@opentelemetry/api` `Tracer.startSpan` does NOT accept `parent` in `SpanOptions`. Parent context is passed as the third `context` argument using `trace.setSpan(context.active(), parentSpan)`. Real `Span.setStatus` takes `{ code: SpanStatusCode, message? }` object, not positional args.

**`DogpileTracer` is NOT structurally compatible with OTEL `Tracer` as-is.** Callers must write a thin bridge. [VERIFIED: Context7 / opentelemetry-js docs + opentelemetry-js-api tracing.md]

```typescript
// In CALLER'S code — not in the SDK
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import type { DogpileTracer, DogpileSpan, DogpileSpanOptions } from '@dogpile/sdk/runtime/tracing';

const otelTracer = trace.getTracer('dogpile');

function makeDogpileTracer(): DogpileTracer {
  return {
    startSpan(name: string, options?: DogpileSpanOptions): DogpileSpan {
      const parentCtx = options?.parent
        ? trace.setSpan(context.active(), options.parent as unknown as OtelSpan)
        : context.active();
      const span = otelTracer.startSpan(name, { attributes: options?.attributes }, parentCtx);
      return {
        end() { span.end(); },
        setAttribute(key, value) { span.setAttribute(key, value); },
        setStatus(code, message) {
          span.setStatus({
            code: code === 'ok' ? SpanStatusCode.OK : SpanStatusCode.ERROR,
            ...(message ? { message } : {})
          });
        }
      };
    }
  };
}
```

This bridge example belongs in `docs/developer-usage.md` and optionally in an `examples/` file.

### Anti-Patterns to Avoid

- **Allocating span objects when tracer is absent:** Even a `null` span wrapper costs allocation. The fast path must be a single `if (!tracer) return` guard — no no-op span object created.
- **Modifying protocol implementations (`sequential.ts`, `broadcast.ts`, etc.):** D-04 locks tracing to `engine.ts`. Protocol files must not be touched.
- **Assuming `DogpileSpan` structurally satisfies OTEL `Span`:** The `setStatus` signatures differ. The bridge is mandatory in caller code.
- **Emitting spans in `replay()`:** D-14 explicitly forbids this. Add an explicit guard and comment; don't rely on `tracer` being absent by default.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Trace-id generation | Custom UUID for span context | OTEL's native span context machinery (in caller's bridge) | SDK does not own span context — callers bridge through OTEL API's `spanContext()` |
| Context propagation | Ambient async-local span context | Explicit parent threading via `DogpileSpanOptions.parent` | D-02 locks this; OTEL context propagation is complex and Node-only-ish |
| Span exporters | Custom OTLP HTTP sender | `@opentelemetry/sdk-trace-base` `InMemorySpanExporter` for tests; caller owns exporters in production | REQUIREMENTS.md out-of-scope section |
| `setStatus` enum | Custom string → code mapping inside SDK | Caller's bridge wraps it | SDK uses `'ok'|'error'` strings; caller maps to `SpanStatusCode` |

---

## Common Pitfalls

### Pitfall 1: Forgetting the Streaming Path

**What goes wrong:** `run()` has tracing but `stream()` produces no spans.
**Why it happens:** D-13 requires both paths; they are separate code paths in `engine.ts`.
**How to avoid:** Treat the streaming wiring (around `runStreamingProtocol`) as a parallel requirement to the non-streaming path. Contract test must exercise both.
**Warning signs:** Success criterion 3 only tests `run()` — add `stream()` contract test explicitly.

### Pitfall 2: `exactOptionalPropertyTypes` Violations on `tracer?`

**What goes wrong:** `options.tracer = undefined` causes TypeScript error under `exactOptionalPropertyTypes`.
**Why it happens:** The SDK's strict TS config requires absent optional fields to be truly absent, not `undefined`.
**How to avoid:** Use conditional spread everywhere: `...(options.tracer ? { tracer: options.tracer } : {})`.
**Warning signs:** `pnpm run typecheck` fails with `exactOptionalPropertyTypes` error.

### Pitfall 3: Model-Call Span Timing Correlation

**What goes wrong:** Agent-turn span uses `TurnEvent.at` as start time instead of `ModelRequestEvent.startedAt` — span covers wrong interval.
**Why it happens:** D-08 requires correlating `ModelRequestEvent` (startedAt) with `TurnEvent` (at) for the same agentId. Events arrive in order but are not co-located.
**How to avoid:** In the `emit` closure, maintain a `Map<agentId, ModelRequestEvent>` buffering the most recent model-request per agent. On `agent-turn` event, read `pendingModelRequests.get(event.agentId)?.startedAt`.
**Warning signs:** Span start time equals end time or uses `TurnEvent.at` as both endpoints.

### Pitfall 4: Replay Guard Missing

**What goes wrong:** Historical spans emitted during `replay()` confuse OTEL backends with past timestamps.
**Why it happens:** If `tracer` is on `EngineOptions` and the engine is reused for both live runs and replay, the tracer field is still present when `replay()` is called.
**How to avoid:** At the top of `replay()` and `replayStream()`, explicitly ignore the tracer. Add a comment: `// tracer is not applied to replay — see docs/developer-usage.md`.
**Warning signs:** OTEL backend receives spans timestamped hours or days in the past.

### Pitfall 5: Sub-Run Span Parent Linkage in Coordinator Fan-Out

**What goes wrong:** Concurrent fan-out produces child spans without parents; they appear as root traces.
**Why it happens:** The coordinator dispatches child runs concurrently. `RunProtocolOptions.parentSpan` must be the sub-run span opened on `sub-run-started` — not the root run span.
**How to avoid:** In the `emit` handler, open the `dogpile.sub-run` span on `sub-run-started` event using `childRunId` as key. Pass that sub-run span as `parentSpan` to the child `runProtocol` call. Close it on `sub-run-completed` or `sub-run-failed`.
**Warning signs:** OTEL backend shows sub-run spans as disconnected roots; `parentRunIds` ancestry is not reflected in span hierarchy.

### Pitfall 6: Attribute Allocation on the Hot Path

**What goes wrong:** Token/cost attribute objects allocated on every event even when no tracer is present.
**Why it happens:** If the attribute calculation code runs outside the `if (!tracer) return` guard.
**How to avoid:** The `if (!tracer) return` guard at the top of the `emit` closure is the complete zero-overhead guarantee. All attribute construction is inside the guard.
**Warning signs:** OTEL-03 performance test detects span allocation overhead.

---

## Code Examples

### `dogpile.model-call` Span Timing Correlation

```typescript
// Source: CONTEXT.md specifics + D-08 decision
const pendingModelRequests = new Map<string, ModelRequestEvent>();
const modelCallSpans = new Map<string, DogpileSpan>(); // keyed by callId

emit(event: RunEvent): void {
  emittedEvents.push(event);
  if (!tracer) return;

  if (event.type === 'model-request') {
    pendingModelRequests.set(event.agentId, event);
    const span = tracer.startSpan(DOGPILE_SPAN_NAMES.MODEL_CALL, {
      parent: agentTurnSpans.get(event.agentId) ?? runSpan,
      attributes: {
        'dogpile.model.id': event.modelId,
        'dogpile.call.id': event.callId,
      }
    });
    modelCallSpans.set(event.callId, span);
  }

  if (event.type === 'model-response') {
    const span = modelCallSpans.get(event.callId);
    span?.setAttribute('dogpile.model.input_tokens', event.response.usage?.inputTokens ?? 0);
    span?.setAttribute('dogpile.model.output_tokens', event.response.usage?.outputTokens ?? 0);
    span?.setStatus('ok');
    span?.end();
    modelCallSpans.delete(event.callId);
  }

  if (event.type === 'agent-turn') {
    const modelReq = pendingModelRequests.get(event.agentId);
    const span = tracer.startSpan(DOGPILE_SPAN_NAMES.AGENT_TURN, {
      parent: subRunSpan ?? runSpan,
      attributes: {
        'dogpile.agent.id': event.agentId,
        'dogpile.turn.number': event.turnNumber ?? 0,
        'dogpile.agent.role': event.role,
      }
    });
    // set end-time attributes from TurnEvent
    span.setAttribute('dogpile.model.id', modelReq?.modelId ?? '');
    span.setAttribute('dogpile.turn.cost_usd', event.cost.usd);
    span.setStatus('ok');
    span.end();
    pendingModelRequests.delete(event.agentId);
  }
}
```

### `/runtime/tracing` Subpath Wiring in `package.json`

```json
"./runtime/tracing": {
  "types": "./dist/runtime/tracing.d.ts",
  "import": "./dist/runtime/tracing.js",
  "default": "./dist/runtime/tracing.js"
}
```

And in `files`:
```json
"src/runtime/tracing.ts"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ambient OTEL context via `context.with()` | Explicit parent threading via `DogpileSpanOptions.parent` | Phase 9 design (D-02) | Simpler SDK interface; caller bridges to native OTEL context in their code |
| Single shared OTEL `Tracer` global | Per-engine `tracer?: DogpileTracer` injection | Phase 9 design (D-05) | No module-level state; required by pure-TS runtime constraint |

**Deprecated/outdated:**
- OTEL `startActiveSpan` callback pattern: not used here — SDK uses explicit `startSpan` + `end()` matching D-01.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `DogpileSpan.setStatus(code: 'ok'\|'error', message?)` is positionally incompatible with OTEL's `span.setStatus({ code: SpanStatusCode, message? })` — a user-side bridge is mandatory | Common Pitfalls, Code Examples | If somehow compatible (unlikely), bridge example is unnecessarily complex |
| A2 | `Tracer.startSpan` third param is `context` not `options.parent` — parent cannot be injected structurally through `DogpileSpanOptions` alone | Common Pitfalls, Code Examples | If OTEL changed signature to accept parent in options, bridge is simpler; current version confirmed as `1.9.1` |

> A1 and A2 are corroborated by [CITED: https://github.com/open-telemetry/opentelemetry-js-api/blob/main/docs/tracing.md] and [VERIFIED: Context7 / open-telemetry/opentelemetry-js] — not pure assumptions. Tagged as assumptions only because the SDK does not import OTEL itself to test directly.

---

## Open Questions

1. **`TurnEvent.turnNumber` field availability**
   - What we know: D-11 references `dogpile.turn.number`; `TurnEvent` in `src/types/events.ts` shows `agentId`, `role`, `cost` but no `turnNumber` field.
   - What's unclear: Is `turnNumber` present in the actual runtime event? The context references it but the type definition at lines 318-339 doesn't show it explicitly.
   - Recommendation: Planner should verify `TurnEvent` type definition before implementing `dogpile.turn.number` attribute. May need to derive turn number from a counter in the `emit` closure keyed by `agentId`.

2. **`agentTurnSpans` key — agentId or callId?**
   - What we know: Multiple agents may have concurrent turns in broadcast protocol.
   - What's unclear: Whether `agentId` alone is a stable enough key for concurrent turns, or whether `agentId + turnIndex` is needed.
   - Recommendation: Use a composite key or a per-agentId stack. The emit-based approach in CONTEXT.md specifics uses `agentId` — follow that.

---

## Environment Availability

Step 2.6: SKIPPED — pure code/config change, no external runtime dependencies. OTEL packages are devDeps added via pnpm.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (inferred from pnpm scripts) |
| Quick run command | `pnpm vitest run src/runtime/tracing.test.ts` |
| Full suite command | `pnpm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OTEL-01 | `run()` with injected tracer records spans for run/sub-run/agent-turn/model-call | Integration | `pnpm vitest run src/tests/otel-tracing-contract.test.ts` | ❌ Wave 0 |
| OTEL-01 | `DogpileTracer`/`DogpileSpan`/`DogpileSpanOptions` types exported from `/runtime/tracing` | Package-exports | `pnpm vitest run src/tests/package-exports.test.ts` | ✅ (update needed) |
| OTEL-02 | Sub-run spans are children of parent run spans | Integration | `pnpm vitest run src/tests/otel-tracing-contract.test.ts` | ❌ Wave 0 |
| OTEL-03 | `run()` without tracer completes with identical result shape, no allocation | Unit | `pnpm vitest run src/runtime/tracing.test.ts` | ❌ Wave 0 |
| OTEL-03 | No `@opentelemetry/*` imports in `src/runtime/`, `src/browser/`, `src/providers/` | Import-graph | `pnpm vitest run src/tests/no-otel-imports.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm vitest run src/runtime/tracing.test.ts`
- **Per wave merge:** `pnpm run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/runtime/tracing.test.ts` — unit tests for `tracing.ts` module exports, type shape, DOGPILE_SPAN_NAMES constants
- [ ] `src/tests/otel-tracing-contract.test.ts` — integration test using `@opentelemetry/sdk-trace-base` `InMemorySpanExporter` via user-side bridge; covers OTEL-01, OTEL-02, OTEL-03
- [ ] `src/tests/no-otel-imports.test.ts` — grep test enforcing no `@opentelemetry/` specifiers in guarded source roots
- [ ] devDeps install: `pnpm add -D @opentelemetry/api @opentelemetry/sdk-trace-base`

---

## Security Domain

Step omitted — OTEL tracing bridge is a pure observability addition. No authentication, session management, access control, cryptography, or user-input processing is introduced. All data emitted to spans comes from the SDK's own `RunEvent` values, which are already on the caller's `RunResult`.

---

## Public Surface Lockstep

The following files MUST be updated in lockstep (established pattern from phases 6–8):

| File | Change |
|------|--------|
| `src/types.ts` | Add `tracer?: DogpileTracer` to `EngineOptions` (line ~1953) and `DogpileOptions` (line ~1856) |
| `src/runtime/tracing.ts` | New file: `DogpileSpan`, `DogpileSpanOptions`, `DogpileTracer`, `DOGPILE_SPAN_NAMES` |
| `src/runtime/engine.ts` | Integration in `runNonStreamingProtocol`, streaming path, `RunProtocolOptions.parentSpan?`, replay guard |
| `src/index.ts` | Re-export `DogpileTracer`, `DogpileSpan`, `DogpileSpanOptions` as root-level types |
| `package.json` `exports` | Add `"./runtime/tracing"` entry |
| `package.json` `files` | Add `"src/runtime/tracing.ts"` |
| `src/tests/package-exports.test.ts` | Add `/runtime/tracing` subpath assertion + type imports |
| `src/tests/no-otel-imports.test.ts` | New file: grep enforcement test |
| `CHANGELOG.md` | New types: `DogpileTracer`, `DogpileSpan`, `DogpileSpanOptions`; new field: `tracer` on `EngineOptions`/`DogpileOptions`; new subpath: `/runtime/tracing`; four span names |
| `CLAUDE.md` | Add Phase 9 public-surface invariant (tracing subpath + interface names) |
| `docs/developer-usage.md` | Add OTEL tracing section; document D-14 replay tracing-free; include user-side bridge example |

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: Context7 / open-telemetry/opentelemetry-js] — `Tracer.startSpan` signature, `Span.setStatus` object shape, context propagation pattern
- [CITED: https://github.com/open-telemetry/opentelemetry-js-api/blob/main/docs/tracing.md] — official API docs confirming parent via context (third arg), not SpanOptions
- [VERIFIED: npm registry] — `@opentelemetry/api@1.9.1`, `@opentelemetry/sdk-trace-base@2.7.1` (as of 2026-05-01)
- [VERIFIED: codebase grep] — `src/runtime/provenance.ts` (43 lines) — template for `tracing.ts`
- [VERIFIED: codebase grep] — `package.json` exports/files — established subpath wiring pattern
- [VERIFIED: codebase grep] — `src/tests/no-node-builtins.test.ts` — template for `no-otel-imports.test.ts`

### Secondary (MEDIUM confidence)

- [VERIFIED: codebase grep] — `src/runtime/engine.ts` lines 690–872 — `runNonStreamingProtocol`, `RunProtocolOptions`, `runProtocol` coordinator delegation
- [VERIFIED: codebase grep] — `src/types/events.ts` lines 67–122, 318–345, 503–536 — `ModelRequestEvent`, `ModelResponseEvent`, `TurnEvent`, `SubRunStartedEvent` field shapes

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry 2026-05-01
- Architecture: HIGH — all integration points read directly from `engine.ts` source
- Pitfalls: HIGH — derived from codebase constraints (exactOptionalPropertyTypes, pure TS, streaming parity) and verified OTEL API signatures
- Duck-typing surface gap: HIGH — confirmed via Context7 + official docs

**Research date:** 2026-05-01
**Valid until:** 2026-06-01 (stable OTEL 1.x API; 30-day estimate)
