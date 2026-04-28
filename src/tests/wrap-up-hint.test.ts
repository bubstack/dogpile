import { describe, expect, it } from "vitest";
import type { AgentSpec, ModelRequest, ModelResponse } from "../index.js";
import { run } from "../index.js";

describe("wrap-up hint", () => {
  it("fires exactly once when the configured threshold is crossed", async () => {
    const requests: ModelRequest[] = [];

    await run({
      intent: "Inject a wrap-up hint near the iteration cap.",
      protocol: { kind: "sequential", maxTurns: 4 },
      tier: "fast",
      budget: { maxIterations: 4 },
      wrapUpHint: { atFraction: 0.5 },
      agents: makeAgents(4),
      model: recordingProvider(requests)
    });

    const wrapUpRequests = requests.filter((request) =>
      request.messages.some((message) => message.role === "system" && message.content.includes("[wrap-up]"))
    );

    expect(requests).toHaveLength(4);
    expect(wrapUpRequests).toHaveLength(1);
    expect(requests[2]?.messages.some((message) => message.content.includes("[wrap-up]"))).toBe(true);
    expect(requests[3]?.messages.some((message) => message.content.includes("[wrap-up]"))).toBe(false);
  });

  it("does not inject a hint when wrapUpHint is not configured", async () => {
    const requests: ModelRequest[] = [];

    await run({
      intent: "Do not inject a wrap-up hint.",
      protocol: { kind: "sequential", maxTurns: 3 },
      tier: "fast",
      budget: { maxIterations: 3 },
      agents: makeAgents(3),
      model: recordingProvider(requests)
    });

    expect(
      requests.some((request) => request.messages.some((message) => message.content.includes("[wrap-up]")))
    ).toBe(false);
  });

  it("passes actual remaining turn and time budget through the hint context", async () => {
    const requests: ModelRequest[] = [];

    await run({
      intent: "Expose remaining budget to the wrap-up injector.",
      protocol: { kind: "sequential", maxTurns: 3 },
      tier: "fast",
      budget: { maxIterations: 3, timeoutMs: 1_000 },
      wrapUpHint: {
        atIteration: 2,
        inject: (context) =>
          `wrap turns=${context.remainingBudget?.iterations ?? "na"} timeout=${context.remainingBudget?.timeoutMs ?? "na"} iteration=${context.iteration ?? "na"} cap=${context.budget?.maxIterations ?? "na"}`
      },
      agents: makeAgents(3),
      model: recordingProvider(requests)
    });

    const wrapUpMessage = requests[2]?.messages.find((message) => message.role === "system" && message.content.startsWith("wrap "));
    expect(wrapUpMessage?.content).toContain("turns=1");
    expect(wrapUpMessage?.content).toContain("iteration=2");
    expect(wrapUpMessage?.content).toContain("cap=3");

    const timeoutMatch = wrapUpMessage?.content.match(/timeout=(\d+(?:\.\d+)?)/);
    expect(timeoutMatch).toBeTruthy();
    const timeoutValue = Number(timeoutMatch?.[1]);
    expect(timeoutValue).toBeGreaterThan(0);
    expect(timeoutValue).toBeLessThanOrEqual(1_000);
  });
});

function makeAgents(count: number): AgentSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `agent-${index + 1}`,
    role: `role-${index + 1}`
  }));
}

function recordingProvider(requests: ModelRequest[]) {
  return {
    id: "wrap-up-provider",
    async generate(request: ModelRequest): Promise<ModelResponse> {
      requests.push(request);
      return {
        text: `response ${requests.length}`,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15
        },
        costUsd: 0.0001
      };
    }
  };
}
