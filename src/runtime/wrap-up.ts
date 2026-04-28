import type {
  BudgetCaps,
  BudgetTier,
  EngineOptions,
  JsonObject,
  ModelMessage,
  Protocol,
  ProtocolConfig,
  RunEvent,
  TerminationCondition,
  TerminationEvaluationContext,
  TranscriptEntry,
  WrapUpHintConfig
} from "../types.js";

interface WrapUpControllerOptions {
  readonly protocol: ProtocolConfig;
  readonly tier: BudgetTier;
  readonly budget?: BudgetCaps;
  readonly terminate?: TerminationCondition;
  readonly wrapUpHint?: WrapUpHintConfig;
}

interface WrapUpContextOptions {
  readonly runId: string;
  readonly protocol: Protocol;
  readonly cost: TerminationEvaluationContext["cost"];
  readonly events: readonly RunEvent[];
  readonly transcript: readonly TranscriptEntry[];
  readonly iteration?: number;
  readonly elapsedMs?: number;
  readonly metadata?: JsonObject;
}

export function createWrapUpHintController(options: WrapUpControllerOptions) {
  const hint = options.wrapUpHint;
  const effectiveBudget = effectiveWrapUpBudget(options.budget, options.terminate);
  let emitted = false;

  return {
    context(context: WrapUpContextOptions): TerminationEvaluationContext {
      return wrapUpEvaluationContext({
        ...context,
        tier: options.tier,
        ...(effectiveBudget !== undefined ? { budget: effectiveBudget } : {})
      });
    },

    inject(messages: readonly ModelMessage[], context: WrapUpContextOptions): readonly ModelMessage[] {
      if (!hint || emitted) {
        return messages;
      }

      const evaluationContext = wrapUpEvaluationContext({
        ...context,
        tier: options.tier,
        ...(effectiveBudget !== undefined ? { budget: effectiveBudget } : {})
      });

      if (!shouldInjectWrapUpHint(hint, evaluationContext)) {
        return messages;
      }

      const content = (hint.inject ?? defaultWrapUpHint)(evaluationContext);
      emitted = true;

      return [
        messages[0] ?? { role: "system", content: "" },
        { role: "system", content },
        ...messages.slice(1)
      ];
    }
  };
}

function wrapUpEvaluationContext(
  options: WrapUpContextOptions & { readonly tier: BudgetTier; readonly budget?: BudgetCaps }
): TerminationEvaluationContext {
  const iteration = options.iteration ?? options.transcript.length;
  const elapsedMs = options.elapsedMs;

  return {
    runId: options.runId,
    protocol: options.protocol,
    tier: options.tier,
    cost: options.cost,
    events: options.events,
    transcript: options.transcript,
    ...(iteration !== undefined ? { iteration } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(options.budget !== undefined ? { budget: options.budget } : {}),
    ...(options.budget !== undefined
      ? {
          remainingBudget: remainingBudget(options.budget, {
            cost: options.cost,
            iteration,
            elapsedMs
          })
        }
      : {}),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {})
  };
}

function shouldInjectWrapUpHint(hint: WrapUpHintConfig, context: TerminationEvaluationContext): boolean {
  const iteration = context.iteration ?? context.transcript.length;

  if (hint.atIteration !== undefined && iteration >= hint.atIteration) {
    return true;
  }

  if (hint.atFraction === undefined || context.budget === undefined) {
    return false;
  }

  const fraction = hint.atFraction;
  return (
    capFractionReached(iteration, context.budget.maxIterations, fraction) ||
    capFractionReached(context.elapsedMs, context.budget.timeoutMs, fraction)
  );
}

function capFractionReached(current: number | undefined, limit: number | undefined, fraction: number): boolean {
  if (current === undefined || limit === undefined || limit <= 0) {
    return false;
  }

  return current / limit >= fraction;
}

function remainingBudget(
  budget: BudgetCaps,
  current: {
    readonly cost: TerminationEvaluationContext["cost"];
    readonly iteration: number | undefined;
    readonly elapsedMs: number | undefined;
  }
): NonNullable<TerminationEvaluationContext["remainingBudget"]> {
  return {
    ...(budget.maxIterations !== undefined && current.iteration !== undefined
      ? { iterations: Math.max(0, budget.maxIterations - current.iteration) }
      : {}),
    ...(budget.timeoutMs !== undefined && current.elapsedMs !== undefined
      ? { timeoutMs: Math.max(0, budget.timeoutMs - current.elapsedMs) }
      : {}),
    ...(budget.maxUsd !== undefined ? { usd: Math.max(0, budget.maxUsd - current.cost.usd) } : {}),
    ...(budget.maxTokens !== undefined ? { tokens: Math.max(0, budget.maxTokens - current.cost.totalTokens) } : {})
  };
}

function defaultWrapUpHint(context: TerminationEvaluationContext): string {
  const parts: string[] = [];
  const remaining = context.remainingBudget;

  if (remaining?.iterations !== undefined) {
    const label = remaining.iterations === 1 ? "turn" : "turns";
    parts.push(`${remaining.iterations} ${label} remaining`);
  }
  if (remaining?.timeoutMs !== undefined) {
    parts.push(`${formatRemainingTime(remaining.timeoutMs)} remaining`);
  }

  const remainingText =
    parts.length === 0 ? "You are approaching a configured hard limit." : `You are approaching a hard limit with ${parts.join(" and ")}.`;
  return `[wrap-up] ${remainingText} If you have enough context, package your work now and return a final-ready answer.`;
}

function formatRemainingTime(timeoutMs: number): string {
  if (timeoutMs >= 1_000) {
    return `${(timeoutMs / 1_000).toFixed(1)}s`;
  }

  return `${timeoutMs}ms`;
}

function effectiveWrapUpBudget(
  budget: BudgetCaps | undefined,
  terminate: EngineOptions["terminate"]
): BudgetCaps | undefined {
  const terminationBudget = budgetCapsFromTermination(terminate);
  if (!budget && !terminationBudget) {
    return undefined;
  }

  const maxUsd = minCap(budget?.maxUsd, terminationBudget?.maxUsd);
  const maxTokens = minCap(budget?.maxTokens, terminationBudget?.maxTokens);
  const maxIterations = minCap(budget?.maxIterations, terminationBudget?.maxIterations);
  const timeoutMs = minCap(budget?.timeoutMs, terminationBudget?.timeoutMs);

  return {
    ...(maxUsd !== undefined ? { maxUsd } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {})
  };
}

function budgetCapsFromTermination(condition: TerminationCondition | undefined): BudgetCaps | undefined {
  if (!condition) {
    return undefined;
  }

  switch (condition.kind) {
    case "budget":
      return {
        ...(condition.maxUsd !== undefined ? { maxUsd: condition.maxUsd } : {}),
        ...(condition.maxTokens !== undefined ? { maxTokens: condition.maxTokens } : {}),
        ...(condition.maxIterations !== undefined ? { maxIterations: condition.maxIterations } : {}),
        ...(condition.timeoutMs !== undefined ? { timeoutMs: condition.timeoutMs } : {})
      };
    case "firstOf": {
      let merged: BudgetCaps | undefined;
      for (const child of condition.conditions) {
        merged = mergeBudgetCaps(merged, budgetCapsFromTermination(child));
      }
      return merged;
    }
    case "convergence":
    case "judge":
      return undefined;
  }
}

function mergeBudgetCaps(left: BudgetCaps | undefined, right: BudgetCaps | undefined): BudgetCaps | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  const maxUsd = minCap(left.maxUsd, right.maxUsd);
  const maxTokens = minCap(left.maxTokens, right.maxTokens);
  const maxIterations = minCap(left.maxIterations, right.maxIterations);
  const timeoutMs = minCap(left.timeoutMs, right.timeoutMs);

  return {
    ...(maxUsd !== undefined ? { maxUsd } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {})
  };
}

function minCap(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return Math.min(left, right);
}
