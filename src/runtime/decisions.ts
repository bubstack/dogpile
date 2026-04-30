import {
  DogpileError,
  type AgentDecision,
  type AgentParticipation,
  type BudgetCaps,
  type DelegateAgentDecision,
  type ParticipateAgentDecision,
  type ProtocolName
} from "../types.js";

const PROTOCOL_NAMES: readonly ProtocolName[] = ["coordinator", "sequential", "broadcast", "shared"];

/**
 * Optional context for {@link parseAgentDecision}. Phase 1 uses this to enforce
 * D-11 (delegate `model` must match the parent provider). Future phases will
 * extend this with depth/maxDepth fields.
 */
export interface ParseAgentDecisionContext {
  readonly currentDepth?: number;
  readonly maxDepth?: number;
  readonly parentProviderId?: string;
}

export function parseAgentDecision(
  output: string,
  context: ParseAgentDecisionContext = {}
): AgentDecision | undefined {
  const delegateBlock = matchDelegateBlock(output);
  if (delegateBlock !== undefined) {
    return parseDelegateDecision(delegateBlock, context);
  }

  return parseParticipateDecision(output);
}

export function isParticipatingDecision(decision: AgentDecision | undefined): boolean {
  if (decision?.type !== "participate") {
    return false;
  }
  return decision.participation !== "abstain";
}

function parseParticipateDecision(output: string): ParticipateAgentDecision | undefined {
  const selectedRole = matchLine(output, /^role_selected:\s*(.+)$/imu);
  const participation = matchLine(output, /^participation:\s*(contribute|abstain)$/imu);
  const rationale = matchLine(output, /^rationale:\s*(.+)$/imu);
  const contribution = matchContribution(output);

  if (!selectedRole || !participation || !isAgentParticipation(participation) || !rationale || !contribution) {
    return undefined;
  }

  return {
    type: "participate",
    selectedRole,
    participation,
    rationale,
    contribution
  };
}

/**
 * Locate a `delegate:` line followed by a fenced JSON block in the agent's
 * output. Returns the raw JSON text inside the fence, or `undefined` when no
 * delegate block is present. Tolerates ```` ```json ```` and bare ```` ``` ````.
 */
function matchDelegateBlock(output: string): string | undefined {
  // Match `delegate:` on its own line, optional whitespace, then a fenced block.
  // Use [\s\S] to match across newlines and a non-greedy capture so we stop at
  // the first closing fence. The `m` flag scopes ^/$ per-line; `i` allows
  // `Delegate:` casing.
  const pattern = /^delegate:\s*\r?\n\s*```(?:json)?\s*\r?\n([\s\S]*?)\r?\n\s*```/imu;
  const match = output.match(pattern);
  return match?.[1];
}

function parseDelegateDecision(
  jsonText: string,
  context: ParseAgentDecisionContext
): DelegateAgentDecision {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throwInvalidDelegate({
      path: "decision",
      message: `delegate JSON did not parse: ${reason}`,
      expected: "valid JSON object",
      received: truncate(jsonText)
    });
  }

  if (Array.isArray(parsed)) {
    throwInvalidDelegate({
      path: "decision",
      message:
        "delegate decision must be a single delegate object (array support reserved for Phase 3).",
      expected: "single delegate object (array support reserved for Phase 3)",
      received: "array"
    });
  }

  if (parsed === null || typeof parsed !== "object") {
    throwInvalidDelegate({
      path: "decision",
      message: "delegate decision must be a JSON object.",
      expected: "object",
      received: describe(parsed)
    });
  }

  const record = parsed as Record<string, unknown>;

  const protocol = record["protocol"];
  if (typeof protocol !== "string" || !PROTOCOL_NAMES.includes(protocol as ProtocolName)) {
    throwInvalidDelegate({
      path: "decision.protocol",
      message: `protocol "${describe(protocol)}" is not a known coordination protocol.`,
      expected: PROTOCOL_NAMES.join(" | "),
      received: describe(protocol)
    });
  }

  const intentRaw = record["intent"];
  const intent = typeof intentRaw === "string" ? intentRaw.trim() : "";
  if (intent.length === 0) {
    throwInvalidDelegate({
      path: "decision.intent",
      message: "delegate decision must include a non-empty intent string.",
      expected: "non-empty string",
      received: describe(intentRaw)
    });
  }

  const result: {
    type: "delegate";
    protocol: ProtocolName;
    intent: string;
    model?: string;
    budget?: BudgetCaps;
  } = {
    type: "delegate",
    protocol: protocol as ProtocolName,
    intent
  };

  if (record["model"] !== undefined) {
    const model = record["model"];
    if (typeof model !== "string" || model.length === 0) {
      throwInvalidDelegate({
        path: "decision.model",
        message: "delegate decision model must be a non-empty string when present.",
        expected: "non-empty string",
        received: describe(model)
      });
    }
    if (context.parentProviderId !== undefined && model !== context.parentProviderId) {
      throwInvalidDelegate({
        path: "decision.model",
        message: `delegate decision model "${model}" does not match parent provider id "${context.parentProviderId}".`,
        expected: context.parentProviderId,
        received: model
      });
    }
    result.model = model;
  }

  if (record["budget"] !== undefined) {
    result.budget = parseDelegateBudget(record["budget"]);
  }

  // Parse-time depth-overflow check (D-14). The dispatcher re-checks at
  // dispatch time as a TOCTOU defense — see assertDepthWithinLimit.
  if (context.currentDepth !== undefined && context.maxDepth !== undefined) {
    if (context.currentDepth + 1 > context.maxDepth) {
      throw depthOverflowError(context.currentDepth, context.maxDepth);
    }
  }

  return result;
}

/**
 * Build the canonical depth-overflow `DogpileError`. Used by the parser (this
 * file) and the coordinator dispatcher; kept here so both call sites produce
 * the exact same error shape (D-14, D-15).
 */
export function depthOverflowError(currentDepth: number, maxDepth: number): DogpileError {
  return new DogpileError({
    code: "invalid-configuration",
    message: `Depth overflow: cannot dispatch sub-run at depth ${currentDepth + 1} (maxDepth = ${maxDepth}).`,
    retryable: false,
    detail: {
      kind: "delegate-validation",
      path: "decision.protocol",
      reason: "depth-overflow",
      currentDepth,
      maxDepth
    }
  });
}

/**
 * Dispatcher-time depth gate. Throws the same error shape the parser uses; the
 * dual gate (parser + dispatcher) defends against any TOCTOU window between
 * decision parsing and child-run spin-up (D-14).
 */
export function assertDepthWithinLimit(currentDepth: number, maxDepth: number): void {
  if (currentDepth + 1 > maxDepth) {
    throw depthOverflowError(currentDepth, maxDepth);
  }
}

function parseDelegateBudget(raw: unknown): BudgetCaps {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throwInvalidDelegate({
      path: "decision.budget",
      message: "delegate decision budget must be an object.",
      expected: "object",
      received: describe(raw)
    });
  }
  const record = raw as Record<string, unknown>;
  const budget: { -readonly [K in keyof BudgetCaps]: BudgetCaps[K] } = {};
  if (record["timeoutMs"] !== undefined) {
    const value = record["timeoutMs"];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throwInvalidDelegate({
        path: "decision.budget.timeoutMs",
        message: "delegate decision budget.timeoutMs must be a non-negative integer.",
        expected: "integer >= 0",
        received: describe(value)
      });
    }
    budget.timeoutMs = value;
  }
  if (record["maxTokens"] !== undefined) {
    const value = record["maxTokens"];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throwInvalidDelegate({
        path: "decision.budget.maxTokens",
        message: "delegate decision budget.maxTokens must be a non-negative integer.",
        expected: "integer >= 0",
        received: describe(value)
      });
    }
    budget.maxTokens = value;
  }
  if (record["maxIterations"] !== undefined) {
    const value = record["maxIterations"];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throwInvalidDelegate({
        path: "decision.budget.maxIterations",
        message: "delegate decision budget.maxIterations must be a non-negative integer.",
        expected: "integer >= 0",
        received: describe(value)
      });
    }
    budget.maxIterations = value;
  }
  return budget as BudgetCaps;
}

interface DelegateValidationFailure {
  readonly path: string;
  readonly message: string;
  readonly expected: string;
  readonly received: string;
}

function throwInvalidDelegate(failure: DelegateValidationFailure): never {
  throw new DogpileError({
    code: "invalid-configuration",
    message: `Invalid Dogpile configuration at ${failure.path}: ${failure.message}`,
    retryable: false,
    detail: {
      kind: "delegate-validation",
      path: failure.path,
      expected: failure.expected,
      received: failure.received
    }
  });
}

function matchLine(output: string, pattern: RegExp): string | undefined {
  const match = output.match(pattern);
  return match?.[1]?.trim();
}

function matchContribution(output: string): string | undefined {
  const match = output.match(/^contribution:\s*\n([\s\S]*)$/imu);
  const contribution = match?.[1]?.trim();
  return contribution && contribution.length > 0 ? contribution : undefined;
}

export function isAgentParticipation(value: string): value is AgentParticipation {
  return value === "contribute" || value === "abstain";
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return JSON.stringify(value).slice(0, 200);
  return typeof value;
}

function truncate(value: string): string {
  return value.length > 200 ? `${value.slice(0, 200)}…` : value;
}
