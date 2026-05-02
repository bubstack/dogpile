import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../index.js";
import { createDeterministicModelProvider } from "../internal.js";
import type { RunEvent } from "../index.js";

type ProvenanceEvent = Extract<RunEvent, { readonly type: "model-request" | "model-response" }>;

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixturePath = join(repoRoot, "src/tests/fixtures/provenance-event-v1.json");

async function captureProvenanceEvents(): Promise<readonly ProvenanceEvent[]> {
  const result = await run({
    intent: "Test provenance shape",
    model: createDeterministicModelProvider("provenance-shape-fixture-model"),
    protocol: { kind: "sequential", maxTurns: 1 }
  });

  return result.eventLog.events.filter(isProvenanceEvent);
}

function isProvenanceEvent(event: RunEvent): event is ProvenanceEvent {
  return event.type === "model-request" || event.type === "model-response";
}

function typeShape(value: object | undefined): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, Array.isArray(entry) ? "array" : typeof entry])
  );
}

describe("provenance event shape contract", () => {
  it("verifies the frozen provenance event shape fixture", async () => {
    const raw = await readFile(fixturePath, "utf8");
    const saved = JSON.parse(raw) as unknown;
    const live = await captureProvenanceEvents();

    expect(Array.isArray(saved)).toBe(true);
    const savedArray = saved as Record<string, unknown>[];

    expect(savedArray).toHaveLength(2);
    expect(savedArray[0]?.type).toBe("model-request");
    expect(savedArray[1]?.type).toBe("model-response");
    expect(live).toHaveLength(2);
    expect(live[0]?.type).toBe("model-request");
    expect(live[1]?.type).toBe("model-response");

    expect(Object.keys(live[0] ?? {})).toEqual(Object.keys(savedArray[0] ?? {}));
    expect(Object.keys(live[1] ?? {})).toEqual(Object.keys(savedArray[1] ?? {}));
    expect(typeShape(live[0])).toEqual(typeShape(savedArray[0]));
    expect(typeShape(live[1])).toEqual(typeShape(savedArray[1]));

    expect(savedArray[0]).toEqual(
      expect.objectContaining({
        type: "model-request",
        startedAt: expect.any(String),
        callId: expect.any(String),
        providerId: expect.any(String),
        modelId: expect.any(String)
      })
    );
    expect(savedArray[1]).toEqual(
      expect.objectContaining({
        type: "model-response",
        startedAt: expect.any(String),
        completedAt: expect.any(String),
        callId: expect.any(String),
        providerId: expect.any(String),
        modelId: expect.any(String)
      })
    );
  });
});
