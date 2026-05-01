/**
 * Health diagnostics computation for completed run traces.
 *
 * @module
 */
import type { HealthAnomaly, RunHealthSummary, Trace } from "../types.js";

// Re-export types so callers who import from this subpath get them directly.
export type { HealthAnomaly, RunHealthSummary } from "../types.js";

/**
 * Thresholds for health anomaly detection.
 *
 * Both fields are optional. When absent, the corresponding threshold-gated
 * anomaly is suppressed entirely. Threshold-free anomalies (`empty-contribution`)
 * always fire when qualifying events are present regardless of this config.
 *
 * Note: `provider-error-recovered` is in the AnomalyCode union but is never
 * emitted by computeHealth in Phase 7 - no trace signal exists without an
 * event-shape change. See STATE.md: "Phase 6 is the only event-shape change."
 */
export interface HealthThresholds {
  /**
   * Per-agent turn count threshold. If an agent produces more than this many
   * agent-turn events, a "runaway-turns" anomaly is emitted with severity "error".
   * The threshold value in the anomaly record equals this number.
   */
  readonly runawayTurns?: number;
  /**
   * Budget utilization percentage threshold (0-100). If budget utilization
   * (finalCost / maxUsd * 100) >= this value, a "budget-near-miss" anomaly is
   * emitted with severity "warning". Suppressed when no USD cap is configured.
   */
  readonly budgetNearMissPct?: number;
}

/**
 * Default health thresholds used for `result.health` auto-computation.
 *
 * Both threshold-gated anomalies (runaway-turns, budget-near-miss) are suppressed
 * by default. Only threshold-free anomalies (empty-contribution) can fire on the
 * auto-compute path.
 */
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = Object.freeze({});

/**
 * Compute a health summary from a completed run trace.
 *
 * Pure function - no side effects, no I/O, no storage access. Deterministic:
 * given the same trace and thresholds, always produces the same result.
 *
 * @param trace - Completed run trace (from RunResult.trace or a stored trace).
 * @param thresholds - Optional threshold overrides. Defaults to DEFAULT_HEALTH_THRESHOLDS.
 */
export function computeHealth(
  trace: Trace,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): RunHealthSummary {
  throw new Error("computeHealth: not implemented - see plan 07-03");
}
