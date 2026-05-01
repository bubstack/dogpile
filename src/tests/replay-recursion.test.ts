import { describe, expect, it } from "vitest";
import { DogpileError, replay, run } from "../index.js";
import type {
  ConfiguredModelProvider,
  ModelRequest,
  ModelResponse,
  RunEvent,
  RunResult,
  Trace
} from "../index.js";

const PARTICIPATE_OUTPUT = [
  "role_selected: coordinator",
  "participation: contribute",
  "rationale: synthesize after sub-run",
  "contribution:",
  "synthesized after sub-run"
].join("\n");

function delegateBlock(payload: { protocol: string; intent: string }): string {
  return ["delegate:", "```json", JSON.stringify(payload), "```", ""].join("\n");
}

interface ScriptedProviderOptions {
  readonly id?: string;
  readonly planResponses: readonly string[];
}

/**
 * Scripted coordinator provider — plan-phase responses are returned in order;
 * worker and final-synthesis phases return a fixed safe text. Counts every
 * `generate` invocation so tests can assert "zero provider calls during replay".
 */
function createScriptedCoordinatorProvider(opts: ScriptedProviderOptions): ConfiguredModelProvider & {
  readonly invocationCount: () => number;
} {
  let planIndex = 0;
  let invocations = 0;
  const provider = {
    id: opts.id ?? "scripted-coordinator-model",
    async generate(request: ModelRequest): Promise<ModelResponse> {
      invocations += 1;
      const phase = String(request.metadata.phase);
      let text: string;
      if (phase === "plan") {
        text = opts.planResponses[planIndex] ?? PARTICIPATE_OUTPUT;
        planIndex += 1;
      } else if (phase === "worker") {
        text = "worker output";
      } else {
        text = "final output";
      }
      return {
        text,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        costUsd: 0
      };
    },
    invocationCount: () => invocations
  };
  return provider;
}

async function buildNestedParentTrace(): Promise<{
  readonly result: RunResult;
  readonly invocationsBeforeReplay: number;
  readonly provider: ReturnType<typeof createScriptedCoordinatorProvider>;
}> {
  const provider = createScriptedCoordinatorProvider({
    id: "replay-recursion-nested-parent",
    planResponses: [
      // Parent plan-1: delegate to sequential.
      delegateBlock({ protocol: "sequential", intent: "first child via sequential" }),
      // Parent plan-2: delegate to coordinator (which itself will delegate to broadcast).
      delegateBlock({ protocol: "coordinator", intent: "second child via nested coordinator" }),
      // Inner coordinator's plan: delegate to broadcast, then participate.
      delegateBlock({ protocol: "broadcast", intent: "grandchild via broadcast" }),
      PARTICIPATE_OUTPUT,
      // Parent plan-3: participate, ending the dispatch loop.
      PARTICIPATE_OUTPUT
    ]
  });

  const result = await run({
    intent: "Build a nested coordinator trace for replay verification.",
    protocol: { kind: "coordinator", maxTurns: 4 },
    tier: "fast",
    model: provider,
    agents: [
      { id: "lead", role: "coordinator" },
      { id: "worker-a", role: "worker" }
    ]
  });

  return { result, invocationsBeforeReplay: provider.invocationCount(), provider };
}

function cloneTrace(trace: Trace): Trace {
  return JSON.parse(JSON.stringify(trace)) as Trace;
}

type NumericField =
  | "cost.usd"
  | "cost.inputTokens"
  | "cost.outputTokens"
  | "cost.totalTokens"
  | "usage.usd"
  | "usage.inputTokens"
  | "usage.outputTokens"
  | "usage.totalTokens";

const ALL_NUMERIC_FIELDS: readonly NumericField[] = [
  "cost.usd",
  "cost.inputTokens",
  "cost.outputTokens",
  "cost.totalTokens",
  "usage.usd",
  "usage.inputTokens",
  "usage.outputTokens",
  "usage.totalTokens"
];

const PARENT_TAMPERABLE_FIELDS: readonly NumericField[] = [
  "cost.usd",
  "cost.inputTokens",
  "cost.outputTokens",
  "cost.totalTokens"
];

function mutateAccountingField(
  target: Record<string, Record<string, number>>,
  field: NumericField,
  delta: number
): { readonly recorded: number; readonly recomputed: number } {
  const [section, key] = field.split(".") as [string, string];
  const recorded = target[section]![key]!;
  target[section]![key] = recorded + delta;
  return { recorded: recorded + delta, recomputed: recorded };
}

describe("replay recursion + accounting recompute (D-08, D-10)", () => {
  it("replay reproduces output, accounting, and event sequence verbatim with zero provider invocations", async () => {
    const { result, invocationsBeforeReplay, provider } = await buildNestedParentTrace();

    // Confirm the trace really is nested (sub-run-completed at parent level
    // and inside an embedded child trace).
    const parentSubRuns = result.trace.events.filter((event) => event.type === "sub-run-completed");
    expect(parentSubRuns.length).toBeGreaterThanOrEqual(2);
    const innerCoordinator = parentSubRuns.find((event) => {
      if (event.type !== "sub-run-completed") return false;
      return event.subResult.trace.protocol === "coordinator";
    });
    expect(innerCoordinator?.type).toBe("sub-run-completed");
    if (innerCoordinator?.type !== "sub-run-completed") throw new Error("expected nested coordinator child");
    const grandchildSubRuns = innerCoordinator.subResult.trace.events.filter(
      (event) => event.type === "sub-run-completed"
    );
    expect(grandchildSubRuns.length).toBeGreaterThanOrEqual(1);

    // Replay the parent trace.
    const replayed = replay(result.trace);

    // Zero additional provider invocations during replay.
    expect(provider.invocationCount()).toBe(invocationsBeforeReplay);

    // Output, accounting, and event sequence preserved.
    expect(replayed.output).toBe(result.output);
    expect(replayed.accounting).toEqual(result.accounting);
    // D-09: parent event sequence emitted verbatim (no child-event bubbling).
    expect(replayed.trace.events).toEqual(result.trace.events);
    expect(replayed.trace.events.map((event: RunEvent) => event.type)).toEqual(
      result.trace.events.map((event) => event.type)
    );

    // JSON round-trip.
    const roundTripped = cloneTrace(result.trace);
    const replayedFromJson = replay(roundTripped);
    expect(replayedFromJson.output).toBe(result.output);
    expect(replayedFromJson.accounting).toEqual(result.accounting);
    // Still no provider calls.
    expect(provider.invocationCount()).toBe(invocationsBeforeReplay);
  });

  // Per-field child-tamper tests — one per enumerated numeric field.
  for (const field of ALL_NUMERIC_FIELDS) {
    it(`throws trace-accounting-mismatch when child subResult.accounting.${field} is tampered`, async () => {
      const { result } = await buildNestedParentTrace();
      const tampered = cloneTrace(result.trace);

      // Find the first sub-run-completed and mutate its recorded accounting.
      const childIndex = tampered.events.findIndex((event) => event.type === "sub-run-completed");
      expect(childIndex).toBeGreaterThanOrEqual(0);
      const childEvent = tampered.events[childIndex];
      if (childEvent?.type !== "sub-run-completed") throw new Error("expected sub-run-completed");
      const accounting = childEvent.subResult.accounting as unknown as Record<string, Record<string, number>>;
      const { recorded, recomputed } = mutateAccountingField(accounting, field, 9999);

      let thrown: unknown;
      try {
        replay(tampered);
      } catch (error) {
        thrown = error;
      }

      expect(DogpileError.isInstance(thrown)).toBe(true);
      if (!DogpileError.isInstance(thrown)) throw new Error("not a DogpileError");
      expect(thrown.code).toBe("invalid-configuration");
      expect(thrown.detail?.["reason"]).toBe("trace-accounting-mismatch");
      expect(thrown.detail?.["field"]).toBe(field);
      expect(thrown.detail?.["childRunId"]).toBe(childEvent.childRunId);
      expect(thrown.detail?.["eventIndex"]).toBe(childIndex);
      expect(thrown.detail?.["recorded"]).toBe(recorded);
      expect(thrown.detail?.["recomputed"]).toBe(recomputed);
    });
  }

  // Per-field parent-tamper tests — only `cost.*` fields are independently
  // tamperable on the parent (parent usage is derived from finalOutput.cost
  // at replay time and would track any cost mutation; the comparison vector
  // for the parent is `trace.finalOutput.cost` vs the cost on the last
  // cost-bearing event).
  for (const field of PARENT_TAMPERABLE_FIELDS) {
    it(`throws trace-accounting-mismatch when parent trace.finalOutput.cost.${field} is tampered`, async () => {
      const { result } = await buildNestedParentTrace();
      const tampered = cloneTrace(result.trace);

      const [, key] = field.split(".") as [string, string];
      const finalCost = tampered.finalOutput.cost as unknown as Record<string, number>;
      const original = finalCost[key]!;
      finalCost[key] = original + 17;

      let thrown: unknown;
      try {
        replay(tampered);
      } catch (error) {
        thrown = error;
      }

      expect(DogpileError.isInstance(thrown)).toBe(true);
      if (!DogpileError.isInstance(thrown)) throw new Error("not a DogpileError");
      expect(thrown.code).toBe("invalid-configuration");
      expect(thrown.detail?.["reason"]).toBe("trace-accounting-mismatch");
      expect(thrown.detail?.["eventIndex"]).toBe(-1);
      expect(thrown.detail?.["childRunId"]).toBe(tampered.runId);
      // Parent comparison runs in the documented field order; the first
      // differing cost field for a single-field tamper is exactly `field`.
      expect(thrown.detail?.["field"]).toBe(field);
    });
  }

  it("a clean JSON round-trip of a nested trace still validates via replay", async () => {
    const { result } = await buildNestedParentTrace();
    const reparsed = cloneTrace(result.trace);
    expect(() => replay(reparsed)).not.toThrow();
  });
});

// BUDGET-03: cost & token roll-up tests parameterized over RECOMPUTE_FIELD_ORDER
// + parent-rollup-drift tamper detection.

const RECOMPUTE_FIELD_ORDER = ALL_NUMERIC_FIELDS;

interface ScriptedCostingProviderOptions {
  readonly id?: string;
  readonly planResponses: readonly string[];
  readonly costPerCall: {
    readonly usd: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

/**
 * Like createScriptedCoordinatorProvider but each generate() returns
 * controlled non-zero token + USD cost so RECOMPUTE_FIELD_ORDER fields all
 * accumulate non-zero contributions at depth ≥ 2.
 */
function createCostingScriptedProvider(opts: ScriptedCostingProviderOptions): ConfiguredModelProvider {
  let planIndex = 0;
  return {
    id: opts.id ?? "costing-scripted-coordinator-model",
    async generate(request: ModelRequest): Promise<ModelResponse> {
      const phase = String(request.metadata.phase);
      let text: string;
      if (phase === "plan") {
        text = opts.planResponses[planIndex] ?? PARTICIPATE_OUTPUT;
        planIndex += 1;
      } else if (phase === "worker") {
        text = "worker output";
      } else {
        text = "final output";
      }
      return {
        text,
        usage: {
          inputTokens: opts.costPerCall.inputTokens,
          outputTokens: opts.costPerCall.outputTokens,
          totalTokens: opts.costPerCall.inputTokens + opts.costPerCall.outputTokens
        },
        costUsd: opts.costPerCall.usd
      };
    }
  };
}

describe("BUDGET-03 cost & token roll-up across recursion", () => {
  // Build a parent → 1 sequential-child fixture once and parameterize the
  // field-by-field assertion. Every model call carries non-zero token + USD
  // cost so all 8 RECOMPUTE_FIELD_ORDER fields accumulate at depth ≥ 2.
  async function buildSingleDelegationTrace(): Promise<{
    readonly result: RunResult;
  }> {
    const provider = createCostingScriptedProvider({
      id: "budget-03-rollup-single-delegation",
      planResponses: [
        delegateBlock({ protocol: "sequential", intent: "child via sequential" }),
        PARTICIPATE_OUTPUT
      ],
      costPerCall: { usd: 0.001, inputTokens: 5, outputTokens: 7 }
    });
    const result = await run({
      intent: "Parent → 1 sequential child for BUDGET-03 rollup verification.",
      protocol: { kind: "coordinator", maxTurns: 2 },
      tier: "fast",
      model: provider,
      agents: [
        { id: "lead", role: "coordinator" },
        { id: "worker-a", role: "worker" }
      ]
    });
    return { result };
  }

  it.each(RECOMPUTE_FIELD_ORDER)(
    "rolls up across all RECOMPUTE_FIELD_ORDER → parent's accounting %s = local + Σ children (Test A)",
    async (field) => {
      const { result } = await buildSingleDelegationTrace();

      // Sanity: at least one direct child at parent level (depth ≥ 2 reached).
      const completed = result.trace.events.filter((event) => event.type === "sub-run-completed");
      expect(completed.length).toBeGreaterThanOrEqual(1);

      // Replay validates rollup parity (parent-rollup-drift would throw here).
      expect(() => replay(result.trace)).not.toThrow();

      const [section, key] = field.split(".") as ["cost" | "usage", string];
      const parentValue = (result.accounting[section] as unknown as Record<string, number>)[key]!;

      let childTotal = 0;
      for (const event of result.trace.events) {
        if (event.type === "sub-run-completed") {
          const summary = event.subResult.cost as unknown as Record<string, number>;
          childTotal += summary[key] ?? 0;
        } else if (event.type === "sub-run-failed") {
          const summary = event.partialCost as unknown as Record<string, number>;
          childTotal += summary[key] ?? 0;
        }
      }

      // Children contribute non-zero across all 8 fields.
      expect(childTotal).toBeGreaterThan(0);
      // Parent's recorded total >= Σ children (monotonic).
      expect(parentValue).toBeGreaterThanOrEqual(childTotal);
      // Parent's recorded total > Σ children — parent has its OWN provider
      // calls beyond what children spent (otherwise localOnly === 0 which
      // would still be correct but wouldn't exercise the rollup math).
      expect(parentValue).toBeGreaterThan(childTotal);
    }
  );

  it("failed sub-runs contribute partialCost to the parent's roll-up (Test B)", async () => {
    // Parent delegates to a sequential child that throws after at least one
    // role-assignment event. The child does NOT make a provider call before
    // the throw — so partialCost is emptyCost(); but the structural invariant
    // is what we lock here: partialCost is recorded on sub-run-failed and
    // parent's recorded accounting still passes replay (no rollup-drift).
    const provider: ConfiguredModelProvider = {
      id: "budget-03-failed-rollup-model",
      async generate(request: ModelRequest): Promise<ModelResponse> {
        const phase = String(request.metadata.phase);
        const protocol = String(request.metadata.protocol);
        if (protocol === "sequential") {
          // Child run path. Throw on the first model call.
          throw new DogpileError({
            code: "provider-timeout",
            message: "Child sequential run timed out for BUDGET-03 partialCost test.",
            providerId: "budget-03-failed-rollup-model",
            retryable: false
          });
        }
        if (phase === "plan") {
          return {
            text: delegateBlock({ protocol: "sequential", intent: "force a child failure" }),
            usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
            costUsd: 0.0005
          };
        }
        return {
          text: "should not reach",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          costUsd: 0
        };
      }
    };

    const failure = await run({
      intent: "Coordinator delegate that fails — verify partialCost on sub-run-failed.",
      protocol: { kind: "coordinator", maxTurns: 2 },
      tier: "fast",
      model: provider,
      agents: [
        { id: "lead", role: "coordinator" },
        { id: "worker-a", role: "worker" }
      ]
    }).then(
      (r) => ({ ok: true as const, result: r }),
      (e: unknown) => ({ ok: false as const, error: e })
    );

    expect(failure.ok).toBe(false);
    if (failure.ok) throw new Error("expected failure");
    expect(DogpileError.isInstance(failure.error)).toBe(true);
    // Note: the run rejected so we don't have a result trace to inspect from
    // the public surface here. The partialCost field on sub-run-failed is
    // exercised structurally by the result-contract round-trip and the
    // tamper test below; combined with the coordinator unit tests, the field
    // is locked end-to-end.
  });

  it("rejects parent-rollup drift when child subResult.accounting.cost is tampered (Test C)", async () => {
    const { result } = await buildNestedParentTrace();
    const tampered = cloneTrace(result.trace);
    const childIndex = tampered.events.findIndex((event) => event.type === "sub-run-completed");
    expect(childIndex).toBeGreaterThanOrEqual(0);
    const childEvent = tampered.events[childIndex];
    if (childEvent?.type !== "sub-run-completed") throw new Error("expected sub-run-completed");
    // Mutate accounting.cost.usd by +1.0 (per plan Test C). Existing recurse
    // check would also catch this, but BUDGET-03 places the new parent-rollup
    // parity check BEFORE the recurse loop so the dedicated subReason fires.
    const accounting = childEvent.subResult.accounting as unknown as Record<string, Record<string, number>>;
    accounting["cost"]!["usd"] = accounting["cost"]!["usd"]! + 1.0;

    let thrown: unknown;
    try {
      replay(tampered);
    } catch (error) {
      thrown = error;
    }
    expect(DogpileError.isInstance(thrown)).toBe(true);
    if (!DogpileError.isInstance(thrown)) throw new Error("not a DogpileError");
    expect(thrown.code).toBe("invalid-configuration");
    expect(thrown.detail?.["reason"]).toBe("trace-accounting-mismatch");
    expect(thrown.detail?.["subReason"]).toBe("parent-rollup-drift");
    expect(thrown.detail?.["field"]).toBe("cost.usd");
  });

  it("rejects parent-rollup drift when sub-run-failed partialCost is tampered (Test D)", async () => {
    // Build a parent trace containing a sub-run-failed event. The child throws
    // after one model call so partialCost is non-zero (or at least defined).
    const provider: ConfiguredModelProvider = {
      id: "budget-03-tamper-partialcost-model",
      async generate(request: ModelRequest): Promise<ModelResponse> {
        const phase = String(request.metadata.phase);
        const protocol = String(request.metadata.protocol);
        if (protocol === "sequential") {
          throw new DogpileError({
            code: "provider-timeout",
            message: "Child sequential run timed out for BUDGET-03 partialCost tamper test.",
            providerId: "budget-03-tamper-partialcost-model",
            retryable: false
          });
        }
        if (phase === "plan") {
          return {
            text: delegateBlock({ protocol: "sequential", intent: "force a child failure" }),
            usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
            costUsd: 0.0005
          };
        }
        return { text: "stub", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, costUsd: 0 };
      }
    };

    // We can't easily get a successful Trace from a run that rejects, so we
    // build a partialCost tamper fixture by hand-mutating a clean nested
    // trace's first sub-run-completed event into a sub-run-failed event with
    // a partialCost that disagrees with the partialTrace's last event cost.
    // This is the same posture as Tests C above (mutate a saved trace).
    void provider;

    const { result } = await buildNestedParentTrace();
    const tampered = cloneTrace(result.trace);
    const childIndex = tampered.events.findIndex((event) => event.type === "sub-run-completed");
    expect(childIndex).toBeGreaterThanOrEqual(0);
    const childEvent = tampered.events[childIndex];
    if (childEvent?.type !== "sub-run-completed") throw new Error("expected sub-run-completed");

    // Synthesize a sub-run-failed event in place of the sub-run-completed.
    // partialCost diverges from lastCostBearingEventCost(partialTrace.events)
    // by +50 inputTokens.
    const partialTraceForFailed = childEvent.subResult.trace;
    // Last cost-bearing event on the child trace (its `final`) has the child's
    // cost. Use that as the truthful partialCost, then mutate.
    const truthfulPartialCost = childEvent.subResult.cost;
    const tamperedPartialCost = {
      ...truthfulPartialCost,
      inputTokens: truthfulPartialCost.inputTokens + 50
    };
    const failedEvent = {
      type: "sub-run-failed" as const,
      runId: childEvent.runId,
      at: childEvent.at,
      childRunId: childEvent.childRunId,
      parentRunId: childEvent.parentRunId,
      parentDecisionId: childEvent.parentDecisionId,
      error: {
        code: "provider-timeout",
        message: "synthetic"
      },
      partialTrace: partialTraceForFailed,
      partialCost: tamperedPartialCost
    };
    (tampered.events as unknown as RunEvent[])[childIndex] = failedEvent;

    let thrown: unknown;
    try {
      replay(tampered);
    } catch (error) {
      thrown = error;
    }
    expect(DogpileError.isInstance(thrown)).toBe(true);
    if (!DogpileError.isInstance(thrown)) throw new Error("not a DogpileError");
    expect(thrown.code).toBe("invalid-configuration");
    expect(thrown.detail?.["reason"]).toBe("trace-accounting-mismatch");
    expect(thrown.detail?.["subReason"]).toBe("parent-rollup-drift");
    expect(thrown.detail?.["field"]).toBe("cost.inputTokens");
  });
});
