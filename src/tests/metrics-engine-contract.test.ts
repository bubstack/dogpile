import { describe, expect, it } from "vitest";
import { run, stream } from "../runtime/engine.js";
import type { Logger } from "../runtime/logger.js";
import type { RunMetricsSnapshot } from "../runtime/metrics.js";
import {
  createDelegatingDeterministicProvider,
  createDeterministicModelProvider
} from "../testing/deterministic-provider.js";
import type { ConfiguredModelProvider, ModelRequest, ModelResponse } from "../types.js";

describe("MetricsHook engine lifecycle", () => {
  it("fires onRunComplete with completed counters for a successful root run", async () => {
    const snapshots: RunMetricsSnapshot[] = [];

    const result = await run({
      intent: "Collect successful root metrics.",
      model: createDeterministicModelProvider("metrics-completed-model"),
      protocol: { kind: "sequential", maxTurns: 1 },
      tier: "fast",
      agents: [{ id: "planner", role: "planner" }],
      metricsHook: {
        onRunComplete(snapshot): void {
          snapshots.push(snapshot);
        }
      }
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      outcome: "completed",
      inputTokens: result.cost.inputTokens,
      outputTokens: result.cost.outputTokens,
      costUsd: result.cost.usd,
      totalInputTokens: result.cost.inputTokens,
      totalOutputTokens: result.cost.outputTokens,
      totalCostUsd: result.cost.usd,
      turns: result.trace.events.filter((event) => event.type === "agent-turn").length
    });
    expect(snapshots[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("fires onRunComplete with budget-stopped when budget terminates before model spend", async () => {
    const snapshots: RunMetricsSnapshot[] = [];

    await run({
      intent: "Stop before spending model budget.",
      model: createDeterministicModelProvider("metrics-budget-model"),
      protocol: { kind: "sequential", maxTurns: 1 },
      tier: "fast",
      budget: { maxIterations: 0 },
      metricsHook: {
        onRunComplete(snapshot): void {
          snapshots.push(snapshot);
        }
      }
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      outcome: "budget-stopped",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      turns: 0
    });
  });

  it("fires onRunComplete with aborted when non-streaming execution throws", async () => {
    const snapshots: RunMetricsSnapshot[] = [];
    const model: ConfiguredModelProvider = {
      id: "metrics-aborted-model",
      async generate(): Promise<ModelResponse> {
        throw new Error("provider unavailable");
      }
    };

    await expect(
      run({
        intent: "Abort metrics on provider failure.",
        model,
        protocol: { kind: "sequential", maxTurns: 1 },
        tier: "fast",
        agents: [{ id: "planner", role: "planner" }],
        metricsHook: {
          onRunComplete(snapshot): void {
            snapshots.push(snapshot);
          }
        }
      })
    ).rejects.toThrow("provider unavailable");

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      outcome: "aborted",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      turns: 0
    });
  });

  it("fires onRunComplete with aborted when a streaming run is cancelled", async () => {
    const snapshots: RunMetricsSnapshot[] = [];
    const requestReceived = createDeferred<ModelRequest>();
    const providerFinished = createDeferred<void>();
    const model: ConfiguredModelProvider = {
      id: "metrics-stream-cancel-model",
      async generate(request: ModelRequest): Promise<ModelResponse> {
        requestReceived.resolve(request);
        await waitForAbort(request.signal);
        providerFinished.resolve();
        throw new Error("provider observed cancellation");
      }
    };

    const handle = stream({
      intent: "Cancel stream metrics.",
      model,
      protocol: { kind: "sequential", maxTurns: 1 },
      tier: "fast",
      agents: [{ id: "planner", role: "planner" }],
      metricsHook: {
        onRunComplete(snapshot): void {
          snapshots.push(snapshot);
        }
      }
    });

    await requestReceived.promise;
    handle.cancel();
    await expect(handle.result).rejects.toMatchObject({ code: "aborted" });
    await providerFinished.promise;
    await waitForCondition(() => snapshots.length === 1);

    expect(snapshots[0]).toMatchObject({
      outcome: "aborted",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      turns: 0
    });
  });

  it("fires onSubRunComplete once per coordinator-dispatched child without root double-fire", async () => {
    const runSnapshots: RunMetricsSnapshot[] = [];
    const subRunSnapshots: RunMetricsSnapshot[] = [];

    const result = await run({
      intent: "Collect child run metrics.",
      model: createDelegatingDeterministicProvider({ id: "metrics-sub-run-model" }),
      protocol: { kind: "coordinator", maxTurns: 2 },
      tier: "fast",
      metricsHook: {
        onRunComplete(snapshot): void {
          runSnapshots.push(snapshot);
        },
        onSubRunComplete(snapshot): void {
          subRunSnapshots.push(snapshot);
        }
      }
    });

    const completed = result.trace.events.find((event) => event.type === "sub-run-completed");
    expect(completed?.type).toBe("sub-run-completed");
    if (completed?.type !== "sub-run-completed") {
      throw new Error("expected sub-run-completed");
    }

    expect(runSnapshots).toHaveLength(1);
    expect(subRunSnapshots).toHaveLength(1);
    expect(subRunSnapshots[0]).toMatchObject({
      outcome: "completed",
      totalInputTokens: completed.subResult.cost.inputTokens,
      totalOutputTokens: completed.subResult.cost.outputTokens,
      totalCostUsd: completed.subResult.cost.usd,
      turns: completed.subResult.trace.events.filter((event) => event.type === "agent-turn").length
    });
  });

  it("routes synchronous and async hook failures to logger.error without changing the run result", async () => {
    const calls: Array<{ readonly message: string; readonly fields: unknown }> = [];
    const logger: Logger = {
      debug(): void {},
      info(): void {},
      warn(): void {},
      error(message, fields): void {
        calls.push({ message, fields });
      }
    };

    const syncResult = await run({
      intent: "Swallow sync hook errors.",
      model: createDeterministicModelProvider("metrics-sync-hook-model"),
      protocol: { kind: "sequential", maxTurns: 1 },
      tier: "fast",
      logger,
      metricsHook: {
        onRunComplete(): void {
          throw new Error("sync hook failed");
        }
      }
    });

    expect(syncResult.trace.runId).toBeTypeOf("string");
    expect(calls).toContainEqual({
      message: "dogpile:metricsHook threw",
      fields: { error: "sync hook failed" }
    });

    await run({
      intent: "Swallow async hook errors.",
      model: createDeterministicModelProvider("metrics-async-hook-model"),
      protocol: { kind: "sequential", maxTurns: 1 },
      tier: "fast",
      logger,
      metricsHook: {
        async onRunComplete(): Promise<void> {
          throw new Error("async hook failed");
        }
      }
    });
    await waitForCondition(() =>
      calls.some(
        (call) =>
          call.message === "dogpile:metricsHook threw" &&
          JSON.stringify(call.fields) === JSON.stringify({ error: "async hook failed" })
      )
    );
  });
});

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    signal?.addEventListener("abort", () => resolve(), { once: true });
  });
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
}
