import { describe, expect, it } from "vitest";
import { queryEvents, type EventQueryFilter } from "./introspection.js";
import type {
  BroadcastEvent,
  BudgetStopEvent,
  CostSummary,
  FinalEvent,
  RunEvent,
  TurnEvent
} from "../types.js";

const runId = "run-introspection-test";
const at = "2026-05-01T00:00:00.000Z";

const turn1 = turnEvent("agent-1", 1, 0.005);
const turn2 = turnEvent("agent-2", 2, 0.02);
const turn3 = turnEvent("agent-1", 3, 1.5);
const broadcast1 = broadcastEvent(1, 0.03);
const budgetStop = budgetStopEvent();
const final = finalEvent();

const mixedEvents = [
  budgetStop,
  turn1,
  final,
  turn2,
  broadcast1,
  turn3
] satisfies readonly RunEvent[];

describe("queryEvents", () => {
  it("returns all events as a new array for an empty filter", () => {
    const result = queryEvents(mixedEvents, {});

    expect(result).toEqual(mixedEvents);
    expect(result).not.toBe(mixedEvents);
  });

  it("narrows type filters to TurnEvent[] without caller casts", () => {
    const result = queryEvents(mixedEvents, { type: "agent-turn" });

    expect(result.map((event) => event.type)).toEqual(["agent-turn", "agent-turn", "agent-turn"]);
    expect(result.map((event) => event.input)).toEqual(["input-1", "input-2", "input-3"]);
    expect(result.map((event) => event.output)).toEqual(["output-1", "output-2", "output-3"]);
  });

  it("narrows type filters to BudgetStopEvent[] without caller casts", () => {
    const result = queryEvents(mixedEvents, { type: "budget-stop" });

    expect(result.map((event) => event.reason)).toEqual(["iterations"]);
  });

  it("excludes non-agent events when filtering by agentId", () => {
    const filter: EventQueryFilter = { agentId: "agent-1" };
    const result = queryEvents(mixedEvents, filter);

    expect(result).toEqual([turn1, turn3]);
    expect(result.every((event) => "agentId" in event && event.agentId === "agent-1")).toBe(true);
  });

  it("excludes BudgetStopEvent and FinalEvent when filtering by agentId", () => {
    const result = queryEvents([budgetStop, final], { agentId: "agent-1" });

    expect(result).toEqual([]);
  });

  it("filters turnRange by global 1-based TurnEvent positions", () => {
    const result = queryEvents(mixedEvents, { turnRange: { min: 2, max: 3 } });

    expect(result).toEqual([turn2, turn3]);
  });

  it("returns all TurnEvents when turnRange min is 1", () => {
    const result = queryEvents(mixedEvents, { turnRange: { min: 1 } });

    expect(result).toEqual([turn1, turn2, turn3]);
  });

  it("returns the first two global TurnEvents when turnRange max is 2", () => {
    const result = queryEvents(mixedEvents, { turnRange: { max: 2 } });

    expect(result).toEqual([turn1, turn2]);
  });

  it("excludes non-TurnEvents when turnRange is set without a type filter", () => {
    const result = queryEvents([turn1, budgetStop, final, turn2], { turnRange: { min: 1 } });

    expect(result).toEqual([turn1, turn2]);
    expect(result.every((event) => event.type === "agent-turn")).toBe(true);
  });

  it("filters costRange by TurnEvent and BroadcastEvent cost.usd", () => {
    const result = queryEvents(mixedEvents, { costRange: { min: 0.01 } });

    expect(result).toEqual([turn2, broadcast1, turn3]);
  });

  it("excludes non-TurnEvent and non-BroadcastEvent values when costRange is set", () => {
    const result = queryEvents(mixedEvents, { costRange: { min: 0, max: 1 } });

    expect(result).toEqual([turn1, turn2, broadcast1]);
    expect(result).not.toContain(budgetStop);
    expect(result).not.toContain(final);
  });

  it("combines type and agentId filters with AND semantics", () => {
    const result = queryEvents(mixedEvents, { type: "agent-turn", agentId: "agent-1" });

    expect(result).toEqual([turn1, turn3]);
    expect(result.map((event) => event.output)).toEqual(["output-1", "output-3"]);
  });

  it("combines type and turnRange filters with AND semantics", () => {
    const result = queryEvents(mixedEvents, { type: "agent-turn", turnRange: { min: 2 } });

    expect(result).toEqual([turn2, turn3]);
  });

  it("returns an empty array when no events match", () => {
    const result = queryEvents(mixedEvents, { type: "agent-turn", agentId: "missing-agent" });

    expect(result).toEqual([]);
  });

  it("returns an empty array for an empty event array", () => {
    const result = queryEvents([], { agentId: "agent-1" });

    expect(result).toEqual([]);
  });

  it("narrows final filters at compile time", () => {
    const result = queryEvents(mixedEvents, { type: "final" });

    expect(result[0]?.output).toBe("final output");
    // @ts-expect-error FinalEvent intentionally has no agentId.
    result[0]?.agentId;
  });
});

function turnEvent(agentId: string, index: number, usd: number): TurnEvent {
  return {
    type: "agent-turn",
    runId,
    at,
    agentId,
    role: `role-${agentId}`,
    input: `input-${index}`,
    output: `output-${index}`,
    cost: costSummary(usd)
  };
}

function broadcastEvent(round: number, usd: number): BroadcastEvent {
  return {
    type: "broadcast",
    runId,
    at,
    round,
    contributions: [
      {
        agentId: "agent-3",
        role: "synthesizer",
        output: "broadcast output"
      }
    ],
    cost: costSummary(usd)
  };
}

function budgetStopEvent(): BudgetStopEvent {
  return {
    type: "budget-stop",
    runId,
    at,
    reason: "iterations",
    cost: costSummary(0.5),
    iteration: 3,
    elapsedMs: 250,
    detail: { observed: 3, limit: 2 }
  };
}

function finalEvent(): FinalEvent {
  return {
    type: "final",
    runId,
    at,
    output: "final output",
    cost: costSummary(0.5),
    transcript: {
      kind: "trace-transcript",
      entryCount: 0,
      lastEntryIndex: null
    }
  };
}

function costSummary(usd: number): CostSummary {
  return {
    usd,
    inputTokens: Math.round(usd * 1000),
    outputTokens: Math.round(usd * 2000),
    totalTokens: Math.round(usd * 3000)
  };
}
