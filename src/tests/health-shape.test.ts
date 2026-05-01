import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AnomalyCode, HealthAnomaly } from "../types.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixturePath = join(repoRoot, "src/tests/fixtures/anomaly-record-v1.json");

async function loadFixture(): Promise<readonly HealthAnomaly[]> {
  const raw = await readFile(fixturePath, "utf8");
  return JSON.parse(raw) as readonly HealthAnomaly[];
}

function expectExactKeys(record: HealthAnomaly, keys: readonly string[]): void {
  expect(Object.keys(record).sort()).toEqual([...keys].sort());
}

describe("anomaly-record-v1.json frozen fixture", () => {
  it("has exactly four records (one per AnomalyCode)", async () => {
    const records = await loadFixture();
    expect(records).toHaveLength(4);
  });

  it("each record has the exact published HealthAnomaly field set", async () => {
    const records = await loadFixture();
    const perAgentCodes: ReadonlySet<AnomalyCode> = new Set([
      "empty-contribution",
      "provider-error-recovered",
      "runaway-turns"
    ]);

    for (const record of records) {
      expectExactKeys(
        record,
        perAgentCodes.has(record.code)
          ? ["agentId", "code", "severity", "threshold", "value"]
          : ["code", "severity", "threshold", "value"]
      );
    }
  });

  it("budget-near-miss record has no agentId (global anomaly)", async () => {
    const records = await loadFixture();
    const nearMiss = records.find((record) => record.code === "budget-near-miss");
    expect(nearMiss).toBeDefined();
    if (nearMiss === undefined) {
      throw new Error("missing budget-near-miss fixture");
    }
    expect(nearMiss).not.toHaveProperty("agentId");
  });

  it("per-agent records have agentId", async () => {
    const records = await loadFixture();
    const perAgentCodes: readonly AnomalyCode[] = [
      "empty-contribution",
      "provider-error-recovered",
      "runaway-turns"
    ];

    for (const code of perAgentCodes) {
      const record = records.find((entry) => entry.code === code);
      expect(record, `record for ${code}`).toBeDefined();
      if (record === undefined) {
        throw new Error(`missing ${code} fixture`);
      }
      expect(record, `agentId on ${code}`).toHaveProperty("agentId");
    }
  });

  it("severity values match expected pattern", async () => {
    const records = await loadFixture();
    const severityMap: Record<AnomalyCode, "warning" | "error"> = {
      "budget-near-miss": "warning",
      "empty-contribution": "error",
      "provider-error-recovered": "warning",
      "runaway-turns": "error"
    };

    for (const record of records) {
      expect(record.severity).toBe(severityMap[record.code]);
    }
  });
});
