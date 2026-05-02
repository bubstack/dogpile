import type { RunMetricsSnapshot } from "../../runtime/metrics.js";

// Inline object mirrors metrics-snapshot-v1.json exactly.
// Update this object whenever the fixture changes.
// This file is never imported at runtime - it exists only for tsc --noEmit coverage.
const _fixture = {
  outcome: "completed",
  inputTokens: 21,
  outputTokens: 12,
  costUsd: 0.0003,
  totalInputTokens: 21,
  totalOutputTokens: 12,
  totalCostUsd: 0.0003,
  turns: 3,
  durationMs: 1500
} satisfies RunMetricsSnapshot;

void _fixture;
