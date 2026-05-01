import { describe, expect, it } from "vitest";
import { createDeterministicModelProvider } from "../internal.js";
import { Dogpile, run, runtimeToolManifest, stream } from "../index.js";
import type { ConfiguredModelProvider, JsonObject, ModelRequest, RunEvent, RuntimeTool } from "../index.js";

describe("sequential protocol", () => {
  it("uses the ergonomic default flow when protocol and tier are omitted", async () => {
    const result = await Dogpile.pile({
      intent: "Draft a release note for a portable multi-agent SDK.",
      model: createDeterministicModelProvider("default-flow-model")
    });

    expect(result.output).toContain("synthesizer:agent-3");
    expect(result.transcript).toHaveLength(3);
    expect(result.trace.protocol).toBe("sequential");
    expect(result.trace.tier).toBe("balanced");
    expect(result.trace.modelProviderId).toBe("default-flow-model");
  });

  it("runs end-to-end against a configured model provider", async () => {
    const result = await run({
      intent: "Draft a release note for a portable multi-agent SDK.",
      protocol: "sequential",
      tier: "fast",
      model: createDeterministicModelProvider()
    });

    expect(result.output).toContain("synthesizer:agent-3");
    expect(result.transcript).toHaveLength(3);
    expect(result.trace.protocol).toBe("sequential");
    expect(result.trace.modelProviderId).toBe("deterministic-test-model");
    expect(result.trace.events.map((event) => event.type)).toEqual([
      "role-assignment",
      "role-assignment",
      "role-assignment",
      "model-request",
      "model-response",
      "agent-turn",
      "model-request",
      "model-response",
      "agent-turn",
      "model-request",
      "model-response",
      "agent-turn",
      "final"
    ]);
    expect(JSON.parse(JSON.stringify(result.trace))).toEqual(result.trace);
    expect(result.cost.totalTokens).toBeGreaterThan(0);
  });

  it("emits model provenance events around non-streaming provider calls", async () => {
    const model: ConfiguredModelProvider = {
      id: "non-streaming-provider",
      modelId: "non-streaming-model",
      async generate() {
        return { text: "planner output" };
      }
    };

    const result = await run({
      intent: "Verify model provenance around a non-streaming call.",
      protocol: { kind: "sequential", maxTurns: 1 },
      tier: "fast",
      model,
      agents: [{ id: "planner-seat", role: "planner" }]
    });

    expect(result.trace.events.map((event) => event.type)).toEqual([
      "role-assignment",
      "model-request",
      "model-response",
      "agent-turn",
      "final"
    ]);

    const requestEvent = result.trace.events[1];
    const responseEvent = result.trace.events[2];
    const turnEvent = result.trace.events[3];
    if (
      requestEvent?.type !== "model-request" ||
      responseEvent?.type !== "model-response" ||
      turnEvent?.type !== "agent-turn"
    ) {
      throw new Error("expected request, response, and turn events");
    }

    expect(requestEvent).toMatchObject({
      runId: result.trace.runId,
      callId: `${result.trace.runId}:provider-call:1`,
      providerId: "non-streaming-provider",
      modelId: "non-streaming-model",
      agentId: "planner-seat",
      role: "planner"
    });
    expect(responseEvent).toMatchObject({
      runId: result.trace.runId,
      callId: requestEvent.callId,
      providerId: requestEvent.providerId,
      modelId: requestEvent.modelId,
      startedAt: requestEvent.startedAt,
      agentId: requestEvent.agentId,
      role: requestEvent.role,
      response: { text: "planner output" }
    });
    expect(result.trace.providerCalls[0]).toMatchObject({
      callId: requestEvent.callId,
      providerId: requestEvent.providerId,
      modelId: requestEvent.modelId,
      startedAt: requestEvent.startedAt,
      completedAt: responseEvent.completedAt
    });
    expect(Date.parse(requestEvent.startedAt)).toBeLessThanOrEqual(Date.parse(responseEvent.completedAt));
    expect(Date.parse(responseEvent.completedAt)).toBeLessThanOrEqual(Date.parse(turnEvent.at));
  });

  it("freezes model request snapshots before handing requests to providers", async () => {
    const model: ConfiguredModelProvider = {
      id: "mutating-provider",
      async generate(request) {
        (request.messages as { role: "system" | "user" | "assistant"; content: string }[]).push({
          role: "assistant",
          content: "mutated after provenance emission"
        });
        (request.metadata as Record<string, unknown>)["mutated"] = true;
        return { text: "planner output" };
      }
    };

    const result = await run({
      intent: "Verify provider mutation cannot rewrite provenance request snapshots.",
      protocol: { kind: "sequential", maxTurns: 1 },
      tier: "fast",
      model,
      agents: [{ id: "planner-seat", role: "planner" }]
    });

    const requestEvent = result.trace.events.find((event) => event.type === "model-request");
    const providerCall = result.trace.providerCalls[0];
    if (requestEvent?.type !== "model-request" || providerCall === undefined) {
      throw new Error("expected request provenance and provider call");
    }

    expect(requestEvent.request.messages).toHaveLength(2);
    expect(providerCall.request.messages).toHaveLength(2);
    expect(requestEvent.request.metadata).not.toHaveProperty("mutated");
    expect(providerCall.request.metadata).not.toHaveProperty("mutated");
  });

  it("emits model provenance events around streaming provider calls", async () => {
    const model: ConfiguredModelProvider = {
      id: "streaming-provider",
      modelId: "streaming-model",
      async generate() {
        throw new Error("expected streaming path");
      },
      async *stream() {
        yield { text: "hel" };
        yield { text: "lo" };
      }
    };

    const result = await run({
      intent: "Verify model provenance around a streaming call.",
      protocol: { kind: "sequential", maxTurns: 1 },
      tier: "fast",
      model,
      agents: [{ id: "writer-seat", role: "writer" }]
    });

    expect(result.trace.events.map((event) => event.type)).toEqual([
      "role-assignment",
      "model-request",
      "model-output-chunk",
      "model-output-chunk",
      "model-response",
      "agent-turn",
      "final"
    ]);

    const requestEvent = result.trace.events[1];
    const firstChunk = result.trace.events[2];
    const secondChunk = result.trace.events[3];
    const responseEvent = result.trace.events[4];
    if (
      requestEvent?.type !== "model-request" ||
      firstChunk?.type !== "model-output-chunk" ||
      secondChunk?.type !== "model-output-chunk" ||
      responseEvent?.type !== "model-response"
    ) {
      throw new Error("expected streaming provenance event sequence");
    }

    expect(requestEvent.modelId).toBe("streaming-model");
    expect(firstChunk.output).toBe("hel");
    expect(secondChunk.output).toBe("hello");
    expect(responseEvent).toMatchObject({
      callId: requestEvent.callId,
      providerId: requestEvent.providerId,
      modelId: requestEvent.modelId,
      startedAt: requestEvent.startedAt,
      response: { text: "hello" }
    });
    expect(result.trace.providerCalls[0]).toMatchObject({
      callId: requestEvent.callId,
      modelId: requestEvent.modelId,
      completedAt: responseEvent.completedAt,
      response: { text: "hello" }
    });
  });

  it("passes a caller AbortSignal through every sequential model request", async () => {
    const abortController = new AbortController();
    const requests: ModelRequest[] = [];
    const model: ConfiguredModelProvider = {
      id: "abort-signal-model",
      async generate(request) {
        requests.push(request);
        return { text: `turn-${requests.length}` };
      }
    };

    const result = await run({
      intent: "Verify cancellation plumbing reaches the provider adapter.",
      protocol: { kind: "sequential", maxTurns: 2 },
      tier: "fast",
      model,
      signal: abortController.signal
    });

    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.signal)).toEqual([
      abortController.signal,
      abortController.signal
    ]);
    expect(result.trace.providerCalls.map((call) => call.request.signal)).toEqual([
      undefined,
      undefined
    ]);
    expect(JSON.parse(JSON.stringify(result.trace))).toEqual(result.trace);
  });

  it("records autonomous decisions and skips abstentions when choosing the final output", async () => {
    const responses = [
      [
        "role_selected: upload workflow analyst",
        "participation: contribute",
        "rationale: This starts the plan with the user journey.",
        "contribution:",
        "Contribution from the first agent."
      ].join("\n"),
      [
        "role_selected: duplicate reviewer",
        "participation: abstain",
        "rationale: The prior output already covers this slice.",
        "contribution:",
        "No additional contribution is needed."
      ].join("\n")
    ];
    const model: ConfiguredModelProvider = {
      id: "sequential-decision-model",
      async generate() {
        return { text: responses.shift() ?? "unused" };
      }
    };

    const result = await run({
      intent: "Plan a Hugging Face upload GUI.",
      protocol: { kind: "sequential", maxTurns: 2 },
      tier: "fast",
      model,
      agents: [
        { id: "agent-0", role: "autonomous-agent" },
        { id: "agent-1", role: "autonomous-agent" }
      ]
    });

    expect(result.output).toContain("Contribution from the first agent.");
    expect(result.output).not.toContain("No additional contribution is needed.");
    expect(result.transcript[0]?.decision).toMatchObject({
      selectedRole: "upload workflow analyst",
      participation: "contribute"
    });
    expect(result.transcript[1]?.decision).toMatchObject({
      selectedRole: "duplicate reviewer",
      participation: "abstain"
    });
    const turnEvents = result.trace.events.filter((event) => event.type === "agent-turn");
    expect(turnEvents[1]?.type).toBe("agent-turn");
    if (turnEvents[1]?.type !== "agent-turn") {
      throw new Error("expected second turn event");
    }
    const secondDecision = turnEvents[1].decision;
    const singleDecision = (
      Array.isArray(secondDecision) ? undefined : secondDecision
    ) as Exclude<typeof secondDecision, readonly unknown[]> | undefined;
    expect(singleDecision?.type).toBe("participate");
    if (singleDecision?.type === "participate") {
      expect(singleDecision.participation).toBe("abstain");
    }
  });

  it("streams the same coordination moments before resolving the final result", async () => {
    const handle = stream({
      intent: "Summarize the value of sequential agent collaboration.",
      protocol: { kind: "sequential", maxTurns: 2 },
      tier: "balanced",
      model: createDeterministicModelProvider("configured-stream-model")
    });

    const events = [];
    for await (const event of handle) {
      events.push(event.type);
    }
    const result = await handle.result;

    expect(events).toEqual([
      "role-assignment",
      "role-assignment",
      "model-request",
      "model-response",
      "agent-turn",
      "model-request",
      "model-response",
      "agent-turn",
      "final"
    ]);
    expect(result.output).toContain("critic:agent-2");
    expect(result.trace.modelProviderId).toBe("configured-stream-model");
  });

  it("streams role-assignment events with agent ids and roles before agent work events", async () => {
    const handle = Dogpile.stream({
      intent: "Verify role assignment streaming before work starts.",
      protocol: { kind: "sequential", maxTurns: 2 },
      tier: "balanced",
      model: createDeterministicModelProvider("role-stream-model"),
      agents: [
        { id: "planner-seat", role: "planner" },
        { id: "reviewer-seat", role: "reviewer" }
      ]
    });

    const streamedEvents: RunEvent[] = [];
    for await (const event of handle) {
      if (event.type !== "error") {
        streamedEvents.push(event as RunEvent);
      }
    }
    const result = await handle.result;

    expect(streamedEvents.map((event) => event.type)).toEqual([
      "role-assignment",
      "role-assignment",
      "model-request",
      "model-response",
      "agent-turn",
      "model-request",
      "model-response",
      "agent-turn",
      "final"
    ]);
    expect(streamedEvents.slice(0, 2)).toEqual([
      expect.objectContaining({
        type: "role-assignment",
        runId: result.trace.runId,
        agentId: "planner-seat",
        role: "planner"
      }),
      expect.objectContaining({
        type: "role-assignment",
        runId: result.trace.runId,
        agentId: "reviewer-seat",
        role: "reviewer"
      })
    ]);
    expect(result.trace.events).toEqual(streamedEvents);
  });

  it("threads runtime tool availability through every sequential model turn", async () => {
    interface LookupInput extends JsonObject {
      readonly query: string;
    }

    interface LookupOutput extends JsonObject {
      readonly answer: string;
    }

    const requests: ModelRequest[] = [];
    const lookupTool: RuntimeTool<LookupInput, LookupOutput> = {
      identity: {
        id: "fixture.lookup",
        name: "lookup",
        description: "Lookup contextual facts for the active mission."
      },
      inputSchema: {
        kind: "json-schema",
        schema: {
          type: "object",
          properties: {
            query: { type: "string" }
          },
          required: ["query"],
          additionalProperties: false
        }
      },
      execute(input, context) {
        return {
          type: "success",
          toolCallId: context.toolCallId,
          tool: this.identity,
          output: {
            answer: `found:${input.query}`
          }
        };
      }
    };
    const model: ConfiguredModelProvider = {
      id: "sequential-tool-availability-model",
      async generate(request) {
        requests.push(request);
        return { text: `turn-${requests.length}` };
      }
    };

    await run({
      intent: "Use available tools while composing a release note.",
      protocol: { kind: "sequential", maxTurns: 2 },
      tier: "fast",
      model,
      agents: [
        { id: "researcher-seat", role: "researcher" },
        { id: "writer-seat", role: "writer" }
      ],
      tools: [lookupTool]
    });

    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.metadata.tools)).toEqual([
      runtimeToolManifest([lookupTool]),
      runtimeToolManifest([lookupTool])
    ]);
  });
});
