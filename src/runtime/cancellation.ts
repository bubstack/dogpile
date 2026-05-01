import { DogpileError, type JsonObject } from "../types.js";

/**
 * Documented-convention vocabulary for `DogpileError({ code: "aborted" }).detail.reason`.
 *
 * Internal-only union (D-08): the literal strings are public-by-observation
 * through `detail.reason` and locked via tests in `event-schema.test.ts` and
 * `public-error-api.test.ts`, but we deliberately do NOT export the union
 * type from `src/index.ts` to keep public-surface delta minimal.
 */
export type AbortReason = "parent-aborted" | "timeout";
export type ChildTimeoutSource = "provider" | "engine";

/**
 * Classify an abort signal's reason into the BUDGET-01 / BUDGET-02
 * `detail.reason` discriminator.
 *
 * - `"timeout"` when the reason is a {@link DogpileError} with `code === "timeout"`
 *   (matches the parent-deadline abort path in `engine.ts:createTimeoutAbortLifecycle`).
 * - `"parent-aborted"` for every other reason — explicit caller abort, plain
 *   `Error`, `undefined`, or arbitrary primitive.
 */
export function classifyAbortReason(signalReasonOrError: unknown): AbortReason {
  if (DogpileError.isInstance(signalReasonOrError) && signalReasonOrError.code === "timeout") {
    return "timeout";
  }
  return "parent-aborted";
}

export function classifyChildTimeoutSource(
  _error: unknown,
  context: {
    readonly decisionTimeoutMs?: number;
    readonly engineDefaultTimeoutMs?: number;
    readonly isProviderError: boolean;
  }
): ChildTimeoutSource {
  if (context.isProviderError) {
    return "provider";
  }
  if (context.decisionTimeoutMs !== undefined || context.engineDefaultTimeoutMs !== undefined) {
    return "engine";
  }
  return "provider";
}

export function throwIfAborted(signal: AbortSignal | undefined, providerId: string): void {
  if (!signal?.aborted) {
    return;
  }

  throw createAbortErrorFromSignal(signal, providerId);
}

export function createAbortError(providerId: string, detail?: JsonObject, cause?: unknown): DogpileError {
  return new DogpileError({
    code: "aborted",
    message: "The operation was aborted.",
    retryable: false,
    providerId,
    ...(detail !== undefined ? { detail } : {}),
    ...(cause !== undefined ? { cause } : {})
  });
}

export function createAbortErrorFromSignal(signal: AbortSignal, providerId: string): DogpileError {
  if (DogpileError.isInstance(signal.reason)) {
    return signal.reason;
  }

  const reason = classifyAbortReason(signal.reason);
  return createAbortError(providerId, { reason }, signal.reason);
}

export function createTimeoutError(providerId: string, timeoutMs: number): DogpileError {
  return new DogpileError({
    code: "timeout",
    message: `The operation timed out after ${timeoutMs}ms.`,
    retryable: true,
    providerId,
    detail: {
      timeoutMs
    }
  });
}

export function createEngineDeadlineTimeoutError(providerId: string, timeoutMs: number): DogpileError {
  return new DogpileError({
    code: "provider-timeout",
    message: `The child engine deadline expired after ${timeoutMs}ms.`,
    retryable: true,
    providerId,
    detail: {
      timeoutMs,
      source: "engine"
    }
  });
}
