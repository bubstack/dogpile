/**
 * Duck-typed OTEL tracing bridge surface (Phase 9 / OTEL-01..OTEL-03).
 *
 * The SDK does not import `@opentelemetry/*` anywhere in `src/runtime/`,
 * `src/browser/`, or `src/providers/`. Callers wire a real OTEL Tracer to
 * the SDK by providing an object that structurally matches `DogpileTracer`.
 * See `docs/developer-usage.md` for the WeakMap-based bridge pattern.
 *
 * `replay()` and `replayStream()` ignore any tracer on engine options —
 * historical timestamps would confuse OTEL backends.
 */

export interface DogpileSpan {
  end(): void;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(code: "ok" | "error", message?: string): void;
}

export interface DogpileSpanOptions {
  readonly parent?: DogpileSpan;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface DogpileTracer {
  startSpan(name: string, options?: DogpileSpanOptions): DogpileSpan;
}

export const DOGPILE_SPAN_NAMES = {
  RUN: "dogpile.run",
  SUB_RUN: "dogpile.sub-run",
  AGENT_TURN: "dogpile.agent-turn",
  MODEL_CALL: "dogpile.model-call"
} as const;

export type DogpileSpanName = (typeof DOGPILE_SPAN_NAMES)[keyof typeof DOGPILE_SPAN_NAMES];
