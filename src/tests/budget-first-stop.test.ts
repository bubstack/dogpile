import { describe, expect, it } from "vitest";
import { run } from "../index.js";
import { createDeterministicModelProvider } from "../testing/deterministic-provider.js";
import type { ConfiguredModelProvider, ModelRequest, ModelResponse, ProtocolConfig } from "../index.js";

describe("budget-first stop behavior", () => {
  it.each([
    ["coordinator", { kind: "coordinator", maxTurns: 3 }],
    ["sequential", { kind: "sequential", maxTurns: 3 }],
    ["broadcast", { kind: "broadcast", maxRounds: 1 }],
    ["shared", { kind: "shared", maxTurns: 3 }]
  ] as const)("halts %s before spending a model turn when the budget is already exhausted", async (_name, protocol) => {
    const requests: ModelRequest[] = [];
    const model: ConfiguredModelProvider = {
      id: "budget-first-stop-model",
      async generate(request: ModelRequest): Promise<ModelResponse> {
        requests.push(request);
        return {
          text: "this response should never be generated",
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2
          },
          costUsd: 0.001
        };
      }
    };

    const result = await run({
      intent: "Do not spend model budget when the cap is already exhausted.",
      protocol: protocol as ProtocolConfig,
      tier: "fast",
      budget: { maxIterations: 0 },
      model
    });

    expect(requests).toHaveLength(0);
    expect(result.output).toBe("");
    expect(result.transcript).toHaveLength(0);
    expect(result.cost).toEqual({
      usd: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    });
    expect(result.trace.events.map((event) => event.type)).toEqual([
      "role-assignment",
      "role-assignment",
      "role-assignment",
      "budget-stop",
      "final"
    ]);

    const stopEvent = result.trace.events.find((event) => event.type === "budget-stop");
    expect(stopEvent).toMatchObject({
      type: "budget-stop",
      reason: "iterations",
      iteration: 0,
      cost: {
        usd: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      },
      detail: {
        cap: "maxIterations",
        limit: 0,
        observed: 0
      }
    });

    const finalEvent = result.trace.events.at(-1);
    expect(finalEvent?.type).toBe("final");
    if (finalEvent?.type !== "final") {
      throw new Error("expected final event");
    }
    expect(finalEvent.termination).toMatchObject({
      kind: "termination-stop",
      firedCondition: { kind: "budget", maxIterations: 0 },
      reason: "budget",
      normalizedReason: "budget:iterations",
      budgetReason: "iterations",
      detail: {
        cap: "maxIterations",
        limit: 0,
        observed: 0
      }
    });
  });

  // BUDGET-04 / D-15: parent termination policies evaluate over PARENT-LEVEL
  // events only — child events do not count toward parent iteration limits.
  //
  // Implementation note: termination evaluators read `context.iteration` /
  // `context.protocolIteration` / `context.transcript` (termination.ts:449) —
  // each protocol-instance maintains its own iteration counter, so child
  // protocol iterations physically cannot reach the parent's evaluator.
  //
  // What we DO see bubble through `result.trace.events` are child events
  // collected by the engine-level streaming subscriber (`teedEmit` pushes
  // child events to `options.emit?.()` per coordinator.ts:902-905); those
  // child events carry the CHILD's runId, not the parent's. The parent's
  // own iteration count (parent's agent-turn events filtered by parent runId)
  // is bounded only by parent's own protocol.maxTurns / terminate, NOT by
  // the bubbled child event count.
  //
  // Plan-pseudocode reframed (inline correction): the plan asked for a child
  // configured to emit 50 agent-turns via `decision.budget.maxIterations: 50`.
  // The delegate decision JSON only carries `budget` (timeoutMs / maxTokens /
  // maxIterations) — there is no channel for child `protocol.maxTurns` or
  // `minTurns`, so the child runs with default sequential `maxTurns: 3`. The
  // important invariant is locked instead via the runId discriminator below.
  it("parent termination evaluates over parent events only — child agent-turns do not count", async () => {
    // Use createDeterministicModelProvider as the cost-bearing base provider
    // so token + USD figures are non-zero and stable. Wrap it with a small
    // inline scripted provider that injects a single `delegate:` decision on
    // the parent coordinator's first plan turn, then defers to the
    // deterministic provider for every other turn (worker, child sequential,
    // final synthesis, follow-up plan).
    const baseProvider = createDeterministicModelProvider("budget-04-d15-base");
    let parentPlanCalls = 0;
    const provider: ConfiguredModelProvider = {
      id: "budget-04-d15-provider",
      async generate(request: ModelRequest): Promise<ModelResponse> {
        const phase = String(request.metadata["phase"]);
        const protocol = String(request.metadata["protocol"]);
        if (protocol === "coordinator" && phase === "plan") {
          parentPlanCalls += 1;
          if (parentPlanCalls === 1) {
            return {
              text: [
                "delegate:",
                "```json",
                JSON.stringify({
                  protocol: "sequential",
                  intent: "Run a child sequential to verify parent-events isolation."
                }),
                "```",
                ""
              ].join("\n"),
              usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
              costUsd: 0.0001
            };
          }
        }
        return baseProvider.generate(request);
      }
    };

    const result = await run({
      intent: "BUDGET-04 D-15: parent termination ignores child agent-turn events.",
      protocol: { kind: "coordinator", maxTurns: 5 } as ProtocolConfig,
      tier: "fast",
      // Generous parent iteration budget so the parent terminates by its own
      // protocol.maxTurns, not by hitting the budget cap. The discriminating
      // assertion is the runId comparison below, not iteration counting.
      budget: { maxIterations: 50 },
      model: provider,
      agents: [
        { id: "lead", role: "coordinator" },
        { id: "worker-a", role: "worker" }
      ]
    });

    // 1. Parent dispatched exactly one delegate (single sub-run-completed).
    const subRunCompleted = result.trace.events.filter(
      (event) => event.type === "sub-run-completed"
    );
    expect(subRunCompleted).toHaveLength(1);
    const completedEvent = subRunCompleted[0];
    if (completedEvent?.type !== "sub-run-completed") {
      throw new Error("expected sub-run-completed");
    }

    // 2. Child has its own runId, distinct from the parent's. Every child
    //    agent-turn (in the embedded subResult.trace.events) is tagged with
    //    the child's runId.
    const childRunId = completedEvent.subResult.trace.runId;
    expect(childRunId).not.toBe(result.trace.runId);
    const childAgentTurns = completedEvent.subResult.trace.events.filter(
      (event) => event.type === "agent-turn"
    );
    expect(childAgentTurns.length).toBeGreaterThan(0);
    for (const event of childAgentTurns) {
      expect(event.runId).toBe(childRunId);
    }

    // 3. Core D-15 invariant: the PARENT's iteration count is bounded by
    //    the parent's own protocol.maxTurns (5), NOT by the total agent-turn
    //    count across both runs. Filter parent's trace.events down to events
    //    tagged with the PARENT's runId, then count parent-tagged agent-turn
    //    events. This count must be <= parent's maxTurns. Iteration counting
    //    reads protocol-internal state (termination.ts:449 protocolProgress),
    //    not the bubbled event stream — child agent-turns physically cannot
    //    reach the parent's iteration counter.
    const parentTaggedEvents = result.trace.events.filter(
      (event) => event.runId === result.trace.runId
    );
    const parentAgentTurns = parentTaggedEvents.filter(
      (event) => event.type === "agent-turn"
    );
    expect(parentAgentTurns.length).toBeLessThanOrEqual(5);

    // 4. Bubbled child events are stream-only. The completed parent trace
    //    keeps child events inside subResult.trace.events so parent iteration
    //    accounting cannot accidentally count child turns.
    const childTaggedInParentTrace = result.trace.events.filter(
      (event) => event.runId === childRunId
    );
    expect(childTaggedInParentTrace).toHaveLength(0);

    // 5. Parent-emitted sub-run-started / sub-run-completed are tagged with
    //    the PARENT's runId (per coordinator.ts:914,929 — both events use
    //    `runId: input.parentRunId`).
    const subRunStartedEvents = result.trace.events.filter(
      (event) => event.type === "sub-run-started"
    );
    expect(subRunStartedEvents).toHaveLength(1);
    expect(subRunStartedEvents[0]?.runId).toBe(result.trace.runId);
    expect(completedEvent.runId).toBe(result.trace.runId);
  });
});
