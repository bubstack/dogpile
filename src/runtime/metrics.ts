/**
 * Metrics hook interface for run-completion counters (Phase 10 / METR-01..METR-02).
 *
 * The SDK does not import any metrics backend. Callers provide an object
 * satisfying `MetricsHook` to receive named counters at run and sub-run
 * completion. When absent, zero overhead — no allocations, no branch cost.
 *
 * `replay()` and `replayStream()` ignore `metricsHook` on engine options —
 * counters for historical replays would be misleading.
 */

export interface RunMetricsSnapshot {
  readonly outcome: "completed" | "budget-stopped" | "aborted";
  /** Direct tokens for this run, excluding nested sub-runs. */
  readonly inputTokens: number;
  /** Direct tokens for this run, excluding nested sub-runs. */
  readonly outputTokens: number;
  /** Direct cost for this run, excluding nested sub-runs. */
  readonly costUsd: number;
  /** Total tokens including the full sub-run subtree (already rolled up). */
  readonly totalInputTokens: number;
  /** Total tokens including the full sub-run subtree. */
  readonly totalOutputTokens: number;
  /** Total cost including the full sub-run subtree. */
  readonly totalCostUsd: number;
  /** Count of agent-turn events directly in this run (own-only, not nested sub-runs). */
  readonly turns: number;
  /** Wall-clock duration in milliseconds from run start to terminal state. */
  readonly durationMs: number;
}

export interface MetricsHook {
  /**
   * Called once at every terminal state of the top-level run (completed,
   * budget-stopped, aborted). When the hook is async, the SDK attaches
   * `.catch` and does NOT await — hook latency never delays run completion.
   */
  readonly onRunComplete?: (snapshot: RunMetricsSnapshot) => void | Promise<void>;
  /**
   * Called once for each coordinator-dispatched child run that completes.
   * Fires from the parent run's emit closure on the `sub-run-completed` event.
   * Does NOT fire for failed sub-runs (`sub-run-failed`).
   */
  readonly onSubRunComplete?: (snapshot: RunMetricsSnapshot) => void | Promise<void>;
}
