import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAuditRecord } from "../runtime/audit.js";
import type { CostSummary, RunEvent, Trace } from "../types.js";
import type { FinalEvent, SubRunCompletedEvent, TurnEvent } from "../types/events.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixturePath = join(repoRoot, "src/tests/fixtures/audit-record-v1.json");

const runId = "audit-record-fixture-run-id";
const at = "2026-05-01T00:00:00.000Z";

function typeShape(value: object | undefined): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, Array.isArray(entry) ? "array" : typeof entry])
  );
}

function costSummary(usd: number): CostSummary {
  return {
    usd,
    inputTokens: Math.round(usd * 70000),
    outputTokens: Math.round(usd * 40000),
    totalTokens: Math.round(usd * 110000)
  };
}

function turnEvent(agentId: string, role: string): TurnEvent {
  return {
    type: "agent-turn",
    runId,
    at,
    agentId,
    role,
    input: "input",
    output: "output",
    cost: costSummary(0.0001)
  } as unknown as TurnEvent;
}

function finalEvent(): FinalEvent {
  return {
    type: "final",
    runId,
    at,
    cost: { usd: 0.0003, inputTokens: 21, outputTokens: 12, totalTokens: 33 }
  } as unknown as FinalEvent;
}

function subRunCompletedEvent(childRunId: string): SubRunCompletedEvent {
  return {
    type: "sub-run-completed",
    runId,
    at,
    childRunId
  } as unknown as SubRunCompletedEvent;
}

function traceWith(events: readonly RunEvent[]): Trace {
  return {
    runId,
    protocol: "coordinator",
    tier: "balanced",
    modelProviderId: "audit-fixture-provider",
    inputs: { intent: "Test audit record shape" },
    events,
    finalOutput: {
      kind: "replay-trace-final-output",
      completedAt: "2026-05-01T00:00:01.000Z",
      cost: costSummary(0.0003),
      output: "",
      transcript: { kind: "trace-transcript", entryCount: 0, lastEntryIndex: null }
    }
  } as unknown as Trace;
}

function buildFixtureTrace(): Trace {
  return traceWith([
    turnEvent("agent-1", "planner"),
    turnEvent("agent-1", "planner"),
    turnEvent("agent-2", "executor"),
    subRunCompletedEvent("child-run-abc"),
    finalEvent()
  ]);
}

describe("audit record shape contract", () => {
  it("verifies the frozen audit record shape fixture", async () => {
    const raw = await readFile(fixturePath, "utf8");
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const live = createAuditRecord(buildFixtureTrace());

    expect(saved["auditSchemaVersion"]).toBe("1");
    expect(live.auditSchemaVersion).toBe("1");
    expect(live.childRunIds).toEqual(["child-run-abc"]);

    expect(Object.keys(live)).toEqual(Object.keys(saved));
    expect(typeShape(live)).toEqual(typeShape(saved));

    expect(saved).toEqual(
      expect.objectContaining({
        auditSchemaVersion: "1",
        runId: expect.any(String),
        intent: expect.any(String),
        startedAt: expect.any(String),
        completedAt: expect.any(String),
        protocol: expect.any(String),
        tier: expect.any(String),
        modelProviderId: expect.any(String),
        agentCount: expect.any(Number),
        turnCount: expect.any(Number),
        outcome: expect.objectContaining({ status: expect.any(String) }),
        cost: expect.objectContaining({
          usd: expect.any(Number),
          inputTokens: expect.any(Number),
          outputTokens: expect.any(Number)
        }),
        agents: expect.any(Array),
        childRunIds: expect.any(Array)
      })
    );
  });
});
