# Phase 7: Structured Event Introspection + Health Diagnostics - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship two independent observability capabilities on top of the Phase 6 provenance foundation:

1. **Event introspection** — a standalone `queryEvents(events, filter)` function exported from a new `/runtime/introspection` subpath. Callers pass a typed `EventQueryFilter` object and receive a narrowed `RunEvent[]` subtype with no cast required. The function is pure (no side effects, no coupling to RunResult/RunEventLog).

2. **Health diagnostics** — `result.health` auto-computed on every `RunResult` using built-in defaults. A standalone `computeHealth(trace, thresholds?)` function exported from a new `/runtime/health` subpath allows custom thresholds. Both paths produce a rich `RunHealthSummary` with an `anomalies[]` array and derived `stats`.

This phase does NOT add OTEL spans (Phase 9), metrics hooks (Phase 10), or audit records (Phase 8).

</domain>

<decisions>
## Implementation Decisions

### Introspection Query API (Q-01, Q-02)

- **D-01: `queryEvents` is a standalone function, not a method.** Exported from `/runtime/introspection` as `queryEvents(events: readonly RunEvent[], filter: EventQueryFilter): RunEvent[]` (with overloads per D-02). No coupling to `RunEventLog` or `RunResult` interfaces — pure function. Consistent with the Phase 6 `/runtime/provenance` pattern.
- **D-02: Filter shape is a single `EventQueryFilter` object with all optional fields.** `{ type?: RunEvent["type"], agentId?: string, turnRange?: { min?: number, max?: number }, costRange?: { min?: number, max?: number } }`. AND semantics across fields (all present fields must match). Empty filter returns all events. Unmatched filter returns `[]`. Simple object literal at call site — no builder or predicate function.

### Return Type Narrowing (Q-03)

- **D-03: Overloaded signatures per event type.** One overload per `RunEvent` member type so `queryEvents(events, { type: "agent-turn" })` returns `TurnEvent[]` with no caller cast. The generic/fallback overload returns `RunEvent[]` when `type` is absent or the filter is multi-criteria. Satisfies INTR-02 ("no type assertions required at the call site"). ~14 overloads — heavy but reliable and IDE-friendly.

### Cost Range Filter (Q-04)

- **D-04: `costRange` matches against turn-level cumulative cost (`TurnEvent.cost.usd`, `BroadcastEvent.cost.usd` only).** Events without a `cost.usd` field (model-request, role-assignment, budget-stop, etc.) are excluded from results when `costRange` is set. This is the most useful semantic for "which agent turns cost the most." Documented explicitly so callers understand the exclusion.

### Health Summary Shape (Q-05)

- **D-05: `RunHealthSummary` is the rich shape:** `{ anomalies: HealthAnomaly[], stats: { totalTurns: number, agentCount: number, budgetUtilizationPct: number | null } }`. All fields are deterministically computable from trace events — satisfies HLTH-02. `budgetUtilizationPct` is `null` when no budget cap was configured. `anomalies.length === 0` combined with the stats block gives callers a complete picture without re-parsing the trace.

### Threshold Configuration (Q-06)

- **D-06: Dual path — auto-compute with defaults AND standalone `computeHealth()` for custom thresholds.**
  - `result.health` is always present on `RunResult`, computed from the trace using built-in default thresholds.
  - `computeHealth(trace: Trace, thresholds?: HealthThresholds): RunHealthSummary` is exported from `/runtime/health` for callers who need custom thresholds or want to re-compute health on a stored trace.
  - Default thresholds are defined in `src/runtime/health.ts` as exported constants (e.g., `DEFAULT_HEALTH_THRESHOLDS`) so downstream tools can read them.
  - `EngineOptions` does NOT get a `healthThresholds` field — callers who need custom thresholds use `computeHealth()` explicitly.

### HealthAnomaly Record Shape (Q-07)

- **D-07: Full anomaly shape with agent attribution:** `{ code: AnomalyCode, severity: "warning" | "error", value: number, threshold: number, agentId?: string }`.
  - `code`: one of `"runaway-turns" | "budget-near-miss" | "empty-contribution" | "provider-error-recovered"`
  - `severity`: `"warning"` for near-miss/recovered patterns; `"error"` for runaway turns and empty contribution
  - `value`: the actual measured value that triggered the anomaly (turn count, utilization %, etc.)
  - `threshold`: the threshold that was exceeded (for comparison in UIs)
  - `agentId?`: present for per-agent anomalies (`empty-contribution`, `provider-error-recovered`)

### Anomaly Thresholds (Q-08, Q-09)

- **D-08: No default `runaway-turns` threshold.** The anomaly is suppressed unless the caller explicitly sets a threshold via `computeHealth(trace, { runawyTurns: N })`. No assumption about what "runaway" means for the caller's domain. `result.health` (auto-computed) will never emit `runaway-turns` unless a threshold is provided.
- **D-09: No default `budget-near-miss` threshold.** Same rationale — suppressed unless caller sets `budgetNearMissPct`. `result.health` auto-path will never emit `budget-near-miss` without explicit configuration. The auto-path emits `empty-contribution` (threshold-free). `provider-error-recovered` is **deferred to a future phase**: `withRetry` retries are invisible to the event log, and detecting them requires an event-shape change which the v0.5.0 milestone reserves for Phase 6 only. The anomaly code ships in the type union and `anomaly-record-v1.json` fixture but is never emitted by `computeHealth()` in Phase 7.

### Subpath Exports (Q-10)

- **D-10: Two separate new subpaths: `/runtime/introspection` + `/runtime/health`.** Clean separation of concerns — introspection is event-query, health is diagnostics/anomaly detection. Consistent with the "one module per observability concept" pattern Phase 6 established. Both must be added to `package.json` `exports` and `files`, `src/tests/package-exports.test.ts`, and `CHANGELOG.md`.

### Frozen Fixture (Q-11)

- **D-11: Partial freeze — `HealthAnomaly` record shape only.** `src/tests/fixtures/anomaly-record-v1.json` is added with a sample record for each anomaly code. Tests reject any per-anomaly shape change without explicit fixture update. The top-level `RunHealthSummary` shape (anomalies + stats) is protected by `result-contract.test.ts` and `event-schema.test.ts` — no separate summary fixture needed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/ROADMAP.md` — Phase 7 goal, success criteria, INTR-01/02/HLTH-01/02 requirement refs
- `.planning/REQUIREMENTS.md` — Full INTR-01, INTR-02, HLTH-01, HLTH-02 requirement text, traceability table
- `.planning/PROJECT.md` — Milestone goal, constraints, key decisions table, public-surface invariants
- `.planning/STATE.md` — Accumulated milestone decisions (event-shape change window, public-surface invariants)

### Prior Phase Context (MUST read — decisions carry forward)
- `.planning/phases/06-provenance-annotations/06-CONTEXT.md` — Event shape decisions (D-04 through D-14 including `startedAt`/`completedAt` on ModelRequestEvent/ModelResponseEvent); provenance subpath pattern used as the template for Phase 7 subpaths

### Existing Type Definitions (MUST read before modifying)
- `src/types.ts` lines 1611–1624 — `RunEventLog` interface (no changes required in Phase 7 per D-01)
- `src/types.ts` lines 1665–1691 — `RunResult` interface (gains `health: RunHealthSummary` field)
- `src/types/events.ts` lines 312–335 — `TurnEvent` definition (the primary cost-bearing event for D-04)
- `src/types/events.ts` lines 341–395 — `BroadcastEvent` definition (secondary cost-bearing event for D-04)
- `src/types/events.ts` lines 759–797 — `RunEvent` union (all ~14 member types; overload targets for D-03)

### Runtime Context
- `src/runtime/engine.ts` — `run()` / `replay()` return paths (where `result.health` is computed and attached)
- `src/runtime/defaults.ts` — pattern for default configs; `DEFAULT_HEALTH_THRESHOLDS` should follow same convention
- `src/runtime/model.ts` — `generateModelTurn()`: source of `provider-error-recovered` signals (error paths)

### Public Surface Gates (MUST update in lockstep)
- `src/tests/event-schema.test.ts` — no new event types, but RunResult shape change may need assertions
- `src/tests/result-contract.test.ts` — `RunResult.health` field must be added to assertions
- `src/tests/package-exports.test.ts` — `/runtime/introspection` + `/runtime/health` subpaths must be added
- `src/tests/fixtures/` — new `anomaly-record-v1.json` frozen fixture (D-11)
- `CHANGELOG.md` — new `result.health` on RunResult, two new subpaths, `queryEvents` API
- `CLAUDE.md` — public-surface invariant chain must include Phase 7 changes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/runtime/provenance.ts` (new in Phase 6) — the pattern for a standalone pure-TS runtime module exported via a new subpath. `/runtime/introspection` and `/runtime/health` follow this exact pattern.
- `src/types/events.ts: TurnEvent.cost.usd` — the cost field D-04 filters against. `BroadcastEvent.cost.usd` is the broadcast counterpart.
- `src/runtime/engine.ts: replay()` — must compute `result.health` from `trace.events` during replay, identical to the original run path (HLTH-02). The existing pattern for computing derived result fields from trace data should be followed.
- `src/runtime/defaults.ts` — convention for exported default/constant values; `DEFAULT_HEALTH_THRESHOLDS` exports should follow the same pattern as existing defaults.

### Established Patterns
- **Standalone subpath module pattern** (`/runtime/provenance`) — pure TS, no Node-only deps, no filesystem. Same constraint applies to `/runtime/introspection` and `/runtime/health`.
- **RunEvent union discriminant dispatch** — all event narrowing uses `event.type` as the discriminant. The overloads in D-03 follow this established discriminant pattern.
- **Optional result fields** — `result.quality` and `result.evaluation` are optional. `result.health` follows a different precedent: it is always present (not optional) since health is always computable from trace events.
- **Frozen fixture pattern** — `src/tests/fixtures/provenance-event-v1.json` (Phase 6) and `src/tests/fixtures/replay-trace-v0_3.json` (prior milestone). `anomaly-record-v1.json` follows the same "freeze the published shape, update explicitly" pattern.

### Integration Points
- **`result.health` attach point** — `engine.ts` constructs `RunResult` at the end of `run()` and `replay()`. Both paths need `health: computeHealth(trace, DEFAULT_HEALTH_THRESHOLDS)` (or equivalent) added to the result object.
- **`queryEvents` integration** — purely caller-side; no changes to the coordination protocols or engine. The function operates on `result.eventLog.events` or `result.trace.events` — same data.
- **`provider-error-recovered` detection** — requires identifying provider errors that were retried/recovered during the run. The `withRetry` wrapper in `/runtime/retry` is the source of recovery signals; health computation needs a way to detect recovered errors from the event log.

</code_context>

<specifics>
## Specific Ideas

- **`EventQueryFilter` type sketch:** `{ type?: RunEvent["type"]; agentId?: string; turnRange?: { min?: number; max?: number }; costRange?: { min?: number; max?: number } }`. All fields optional. `turnRange` matches against turn index (the N-th turn for the agent or globally — researcher should determine which).
- **Overload count:** The RunEvent union has these discriminant types: `role-assignment`, `model-request`, `model-response`, `model-output-chunk`, `agent-turn`, `broadcast-round`, `budget-stop`, `final`, `sub-run-start`, `sub-run-complete`, `sub-run-failed`, `sub-run-budget-clamped`, `sub-run-queued`, `tool-call`, `tool-result`. ~15 types. Each gets one overload with a typed return. The final fallback overload handles `{ type?: undefined } | { type: RunEvent["type"] }` → `RunEvent[]`.
- **`RunHealthSummary` type sketch:** `{ readonly anomalies: readonly HealthAnomaly[]; readonly stats: { readonly totalTurns: number; readonly agentCount: number; readonly budgetUtilizationPct: number | null } }`.
- **`HealthAnomaly` type sketch:** `{ readonly code: "runaway-turns" | "budget-near-miss" | "empty-contribution" | "provider-error-recovered"; readonly severity: "warning" | "error"; readonly value: number; readonly threshold: number; readonly agentId?: string }`.
- **`HealthThresholds` type sketch:** `{ readonly runawyTurns?: number; readonly budgetNearMissPct?: number }`. Both optional — when absent, the corresponding anomaly is suppressed.
- **`DEFAULT_HEALTH_THRESHOLDS`**: `{}` (empty — no defaults, both threshold-dependent anomalies are suppressed by default; `empty-contribution` and `provider-error-recovered` are threshold-free).
- **`anomaly-record-v1.json`** should include one example of each of the four anomaly codes with all fields present (including `agentId` on the per-agent ones, absent on the numeric ones).

</specifics>

<deferred>
## Deferred Ideas

- **Per-turn health streaming** — health diagnostics emitted as streaming events during a run (not only at completion). Deferred to v0.6.0+ per REQUIREMENTS.md.
- **`EngineOptions.healthThresholds`** — not added in Phase 7; callers use `computeHealth()` for custom thresholds. Could be added in a future phase if callers want threshold storage in `trace.inputs` for automatic replay parity.
- **`turnRange` semantics** — researcher should determine whether `turnRange` matches the global turn index across all agents, or per-agent turn index. This is an implementation detail for the planner.
- **`provider-error-recovered` detection mechanism** — the exact signal source (whether from `withRetry` events, a new internal event, or post-hoc event pattern matching) is an implementation detail for the researcher.

</deferred>

---

*Phase: 7-Structured Event Introspection + Health Diagnostics*
*Context gathered: 2026-05-01*
