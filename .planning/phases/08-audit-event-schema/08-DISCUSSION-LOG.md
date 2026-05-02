# Phase 8: Audit Event Schema — Discussion Log

**Date:** 2026-05-01
**Mode:** Power (async JSON answering)
**Questions:** 12 / 12 answered

---

## Section 1: Audit Function API

### Q-01: Function input type
**Options presented:** RunResult | Trace | Overloads for both
**Selected:** `createAuditRecord(trace: Trace)` (Option B)
**Rationale:** Consistent with `computeHealth(trace)` from Phase 7. Enables audit from stored traces.

### Q-02: Exported function name
**Options presented:** createAuditRecord | toAuditRecord | buildAuditRecord
**Selected:** `createAuditRecord` (Option A)
**Rationale:** Constructor semantics, most explicit. Consistent with `createEngine`.

### Q-03: Subpath export location
**Options presented:** /runtime/audit | root index.ts
**Selected:** `/runtime/audit` new subpath (Option A)
**Rationale:** Consistent with Phase 6/7 one-concept-per-subpath pattern.

---

## Section 2: AuditRecord Field Set

### Q-04: Fields beyond required minimum
**Options presented:** Minimum only | + protocol + tier | + protocol + tier + turnCount + modelProviderId
**Selected:** Full set — minimum + protocol + tier + turnCount + modelProviderId (Option C)
**Rationale:** Fuller compliance picture; all derivable from Trace fields.

### Q-05: "outcome" field values
**Options presented:** string union (3 values) | string union (2 values) | structured object
**Selected:** `{ status: AuditOutcomeStatus; terminationCode?: string }` structured object (Option C)
**Rationale:** Machine-readable terminationCode alongside status for compliance tooling.

### Q-06: Cost representation
**Options presented:** { usd } only | { usd + inputTokens + outputTokens } | re-use CostSummary
**Selected:** Inline `{ usd: number; inputTokens: number; outputTokens: number }` (Option B)
**Rationale:** Full token accounting for cost-allocation use cases; inline type keeps AuditRecord independent.

### Q-07: terminationReason field
**Options presented:** Include terminationReason?: string | Omit
**Selected:** Include `terminationReason?: string` (Option A)
**Rationale:** Human-readable reason alongside machine-readable terminationCode. Planner to decide if redundant with outcome.terminationCode.

---

## Section 3: Agent and Sub-Run Handling

### Q-08: Agent-level detail
**Options presented:** agentCount only | agentCount + agentIds[] | agents array with per-agent summary
**Selected:** `agents: Array<{ id: string; role: string; turnCount: number }>` (Option C)
**Rationale:** Per-agent summary. turnCount derivable from TurnEvent grouping.

### Q-09: Sub-run representation
**Options presented:** childRunCount only | nested AuditRecord[] | childRunIds[]
**Selected:** `childRunIds: readonly string[]` (Option C)
**Rationale:** Lightweight linking. Callers call createAuditRecord(subRunEvent.trace) themselves for recursive audit.

### Q-10: agentCount semantics
**Options presented:** trace.agentsUsed.length | distinct agentIds from TurnEvent entries
**Selected:** Distinct agentIds from TurnEvent entries (Option B)
**Rationale:** Counts agents that actually contributed turns, not just configured agents.

---

## Section 4: Fixture and Testing

### Q-11: audit-record-v1.json fixture completeness
**Options presented:** Single minimal | one per outcome | single realistic multi-agent
**Selected:** Single realistic fixture from a multi-agent coordinator run (Option C)
**Rationale:** Exercises agentCount > 1, agents[], and childRunIds. Better real-world representation.

### Q-12: TypeScript type-level fixture verification
**Options presented:** JSON shape only | JSON shape + satisfies AuditRecord check
**Selected:** JSON shape + `satisfies AuditRecord` compile-time check (Option B)
**Rationale:** Catches structural type regressions at compile time. ~5 lines — light addition.

---

## Deferred Ideas

- `result.auditRecord` auto-attach — per AUDT-01 intent, not added
- Nested `childRuns: AuditRecord[]` — callers handle recursion themselves
- Per-agent cost in AuditAgentRecord — deferred, no caller demand yet
- `terminationReason` top-level field — planner may collapse with `outcome.terminationCode`
