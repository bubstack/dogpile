import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Dogpile, replay } from "../index.js";
import type { Trace } from "../index.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixturePath = join(repoRoot, "src/tests/fixtures/replay-trace-v0_3.json");

describe("replay version-skew contract", () => {
  it("frozen v0.3 trace fixture round-trips through current replay()", async () => {
    const raw = await readFile(fixturePath, "utf8");
    const savedTrace = JSON.parse(raw) as Trace;

    const replayed = replay(savedTrace);
    const namespaced = Dogpile.replay(savedTrace);

    expect(replayed.output).toBe(savedTrace.finalOutput.output);
    expect(replayed.transcript).toBe(savedTrace.transcript);
    expect(replayed.eventLog.events).not.toBe(savedTrace.events);
    expect(replayed.eventLog.events.map((event) => event.type)).toEqual([
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
    expect(
      replayed.eventLog.events
        .filter((event) => event.type === "model-request" || event.type === "model-response")
        .every((event) => event.modelId === "v0_3-replay-fixture")
    ).toBe(true);
    expect(replayed.trace).toBe(savedTrace);
    expect(namespaced).toEqual(replayed);
    // JSON round-trip determinism — guards against non-JSON values sneaking into trace.
    expect(JSON.parse(JSON.stringify(replayed))).toEqual(replayed);
  });
});
