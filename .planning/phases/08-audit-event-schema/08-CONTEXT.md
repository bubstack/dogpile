# Phase 8: Audit Event Schema - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a pure function `createAuditRecord(trace: Trace): AuditRecord` exported from a new `/runtime/audit` subpath. The function derives a versioned, schema-stable audit record from any completed `Trace` — including stored/replayed traces. `AuditRecord` is a standalone type fully independent of `RunEvent` schema variants. Its shape is protected by a frozen JSON fixture (`src/tests/fixtures/audit-record-v1.json`) with a companion `satisfies AuditRecord` TypeScript check.

This phase does NOT add OTEL spans (Phase 9), metrics hooks (Phase 10), or event introspection APIs (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Audit Function Signature (Q-01, Q-02, Q-03)

- **D-01: Function signature is `createAuditRecord(trace: Trace): AuditRecord`.** Input is `Trace`, not `RunResult`. Consistent with Phase 7's `computeHealth(trace)`. Enables audit generation from stored traces (e.g., fetched from a database) without requiring the full `RunResult`. Callers with a live result pass `result.trace`. This is the primary call pattern for both real-time and offline audit use cases.
- **D-02: Exported function name is `createAuditRecord`.** Constructor semantics — builds a new object, not extracting an existing one. Consistent with `createEngine` in the SDK surface. Exported from the new `/runtime/audit` subpath alongside the `AuditRecord` type.
- **D-03: Subpath is `/runtime/audit`.** One-concept-per-subpath pattern established in Phase 6 (`/runtime/provenance`) and Phase 7 (`/runtime/introspection`, `/runtime/health`). `package.json` `exports` and `files`, `src/tests/package-exports.test.ts`, and `CHANGELOG.md` must all be updated in lockstep.

### AuditRecord Field Set (Q-04, Q-05, Q-06, Q-07)

- **D-04: AuditRecord carries the full compliance field set.** Beyond the AUDT-01 minimum, the record includes `protocol`, `tier`, `turnCount`, and `modelProviderId`. All are derivable from `Trace` fields without parsing individual `RunEvent` variants (AUDT-02). Full type sketch:
  ```ts
  interface AuditRecord {
    readonly auditSchemaVersion: "1";
    readonly runId: string;
    readonly intent: string;
    readonly startedAt: string;
    readonly completedAt: string;
    readonly protocol: Protocol;
    readonly tier: Tier;
    readonly modelProviderId: string;
    readonly agentCount: number;
    readonly turnCount: number;
    readonly outcome: AuditOutcome;
    readonly cost: AuditCost;
    readonly terminationReason?: string;
    readonly agents: readonly AuditAgentRecord[];
    readonly childRunIds?: readonly string[];
  }
  ```
- **D-05: `outcome` is a structured object — `AuditOutcome = { status: "completed" | "budget-stopped" | "aborted"; terminationCode?: string }`.** `status` mirrors the three terminal conditions; `terminationCode` carries the specific `BudgetStopReason` string (e.g., `"usd-cap"`, `"turn-cap"`) when `status` is `"budget-stopped"`, or an abort reason string when `status` is `"aborted"`. `terminationCode` is absent when `status` is `"completed"`. Derivation: `status = "completed"` when `trace.events` contains a `FinalEvent`; `status = "budget-stopped"` when it contains a `BudgetStopEvent` (no `FinalEvent`); `status = "aborted"` otherwise.
- **D-06: `terminationReason?: string` is also present as a top-level field on `AuditRecord`.** This provides a human-readable string (e.g., `"usd-cap exceeded"`) alongside the machine-readable `outcome.terminationCode`. Present only when `outcome.status !== "completed"`. **Researcher/planner note:** if this is redundant with `outcome.terminationCode`, the planner may collapse them — surface the conflict and recommend the simpler shape.
- **D-07: `cost` is an inline type `AuditCost = { usd: number; inputTokens: number; outputTokens: number }`.** Full accounting — token counts and dollar total. Derivable from the `FinalEvent.cost` / `CostSummary` present in the trace. Does not re-use `CostSummary` directly to keep `AuditRecord` independent of `types.ts` runtime types; the shape is structurally equivalent but declared inline in `audit.ts`.

### Agent and Sub-Run Handling (Q-08, Q-09, Q-10)

- **D-08: `agents` is a per-agent summary array — `AuditAgentRecord = { id: string; role: string; turnCount: number }`.** Each entry represents one agent that contributed at least one turn. `id` and `role` come from `trace.agentsUsed` (matched by id). `turnCount` is computed by counting `TurnEvent` entries in `trace.events` by `agentId`. This requires inspecting `RunEvent` variants internally in `createAuditRecord` — the implementation touches event types, but the `AuditRecord` type itself does not reference them.
- **D-09: `agentCount` is derived from distinct `agentId` values in `TurnEvent` entries — not `trace.agentsUsed.length`.** Counts agents that actually contributed turns. May differ from `trace.agentsUsed.length` for coordinator runs where the coordinator only delegated and never turned. `agentCount === agents.length` (the two fields stay in sync).
- **D-10: Sub-run representation is `childRunIds?: readonly string[]`.** Flat list of child run ids from `SubRunCompletedEvent.childRunId` entries in `trace.events`. Callers who need child audit records call `createAuditRecord(subRunEvent.trace)` themselves with the embedded child trace. Field is absent (not present as `[]`) when there are no sub-runs — `exactOptionalPropertyTypes` applies.

### Fixture and Testing (Q-11, Q-12)

- **D-11: Frozen fixture is a single realistic record from a multi-agent coordinator run.** `src/tests/fixtures/audit-record-v1.json` contains one `AuditRecord` with `agentCount > 1`, at least one entry in `agents[]`, and `childRunIds` with one child run id. `outcome.status` is `"completed"`. This exercises the non-trivial fields more thoroughly than a minimal sequential-run record.
- **D-12: Fixture verification uses both JSON `deepEqual` and a TypeScript `satisfies AuditRecord` compile-time check.** A small companion file (e.g., `src/tests/fixtures/audit-record-v1.type-check.ts`) imports the fixture JSON and asserts `fixture satisfies AuditRecord`. The runtime deepEqual test lives in the audit fixture test file. Together they catch both JSON shape drift (runtime) and TypeScript structural regressions (compile time via `typecheck` / `verify`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/ROADMAP.md` — Phase 8 goal, success criteria, AUDT-01/AUDT-02 requirement refs
- `.planning/REQUIREMENTS.md` — Full AUDT-01 and AUDT-02 requirement text, traceability table, out-of-scope list
- `.planning/PROJECT.md` — Milestone goal, constraints, public-surface invariants, core value statement
- `.planning/STATE.md` — Accumulated milestone decisions (including: "AuditRecord is an independent type"; "No `@opentelemetry/*` imports in src/runtime/"; "Public-surface invariants must move together")

### Prior Phase Context (MUST read — decisions carry forward)
- `.planning/phases/06-provenance-annotations/06-CONTEXT.md` — Event shape decisions (ModelRequestEvent/ModelResponseEvent now carry `startedAt`/`completedAt`/`modelId` instead of `at`); `/runtime/provenance` subpath pattern is the template for Phase 8's `/runtime/audit`
- `.planning/phases/07-structured-event-introspection-health-diagnostics/07-CONTEXT.md` — `computeHealth(trace)` signature pattern (D-01 follows this); `/runtime/introspection` and `/runtime/health` subpath wiring (D-03 follows the same steps); `TurnEvent`/`BroadcastEvent` as cost-bearing events (D-08 uses TurnEvent for agentId grouping)

### Existing Type Definitions (MUST read before implementing)
- `src/types.ts` lines 1549–1607 — `Trace` interface (the input to `createAuditRecord`; all audit fields must be derivable from this struct)
- `src/types.ts` lines 1443–1463 — `CostSummary` and `RunUsage` (D-07 mirrors this shape inline as `AuditCost`)
- `src/types.ts` lines 1667–1697 — `RunResult` interface (NOT the input — but callers pass `result.trace`)
- `src/types.ts` lines 695–703 — `AgentSpec` (id + role come from `trace.agentsUsed`)
- `src/types/events.ts` lines 786–805 — `RunEvent` union (implementation inspects TurnEvent, BudgetStopEvent, FinalEvent, SubRunCompletedEvent internally — but `AuditRecord` type must not reference these)
- `src/types/events.ts` lines 312–335 — `TurnEvent` (agentId source for D-08/D-09)
- `src/types/events.ts` lines 408–425 — `BudgetStopEvent` (terminationCode source for D-05)
- `src/types/events.ts` lines 470–487 — `FinalEvent` (completion detection for D-05; cost source for D-07)
- `src/types/events.ts` lines 549–555 — `SubRunCompletedEvent` (childRunId source for D-10)

### Public Surface Gates (MUST update in lockstep)
- `src/tests/package-exports.test.ts` — `/runtime/audit` subpath must be added (D-03)
- `src/tests/fixtures/audit-record-v1.json` — new frozen fixture (D-11)
- `src/tests/fixtures/audit-record-v1.type-check.ts` — new `satisfies AuditRecord` assertion file (D-12)
- `package.json` `exports` and `files` — `/runtime/audit` subpath wiring (D-03)
- `CHANGELOG.md` — new `createAuditRecord` API, new `/runtime/audit` subpath, new `AuditRecord` type
- `CLAUDE.md` — public-surface invariant chain must include Phase 8 additions

### Phase 6/7 Subpath Wiring Pattern (follow exactly)
- `src/runtime/provenance.ts` — reference implementation for a standalone subpath module (pure TS, no Node-only deps, no filesystem)
- Phase 7 context D-10 — steps for wiring two new subpaths (identical steps apply to `/runtime/audit`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/runtime/provenance.ts` (Phase 6) — the template for `src/runtime/audit.ts`. Same structure: pure TS module, exported pure function(s) + exported type(s), no Node-only deps. `createAuditRecord` follows this structural pattern.
- `src/runtime/engine.ts: replay()` — shows how `Trace` is reconstituted into a result shape; useful for understanding what fields are guaranteed present on a Trace that arrives via replay.
- `src/runtime/defaults.ts` — convention for exported constants; if a default is needed (e.g., `auditSchemaVersion` constant), follow this pattern.

### Established Patterns
- **Standalone subpath module pattern** (`/runtime/provenance`, `/runtime/introspection`, `/runtime/health`) — pure TS, no Node-only deps, no filesystem, no side effects. `src/runtime/audit.ts` must satisfy the same constraint (same code runs in Node, Bun, browser).
- **`exactOptionalPropertyTypes`** — `childRunIds?` must be absent (not `undefined`) when no sub-runs exist. Pattern: `...(childRunIds.length > 0 ? { childRunIds } : {})`.
- **Frozen fixture pattern** — `src/tests/fixtures/provenance-event-v1.json` (Phase 6). The `audit-record-v1.json` fixture follows the same "freeze the published shape, update explicitly" pattern. `audit-record-v1.type-check.ts` adds a compile-time layer.
- **`readonly` everywhere** — `AuditRecord`, `AuditAgentRecord`, `AuditOutcome`, `AuditCost` should use `readonly` on all fields, consistent with all other SDK types.

### Integration Points
- **`createAuditRecord` is a pure caller-side utility.** No changes to engine.ts, protocols, or streaming. The function reads from `Trace` and produces `AuditRecord`. No RunResult modification, no `result.auditRecord` auto-attach (unlike `result.health` in Phase 7 — this is explicitly NOT auto-attached per AUDT-01: "using a pure function").
- **TurnEvent agentId grouping** — `trace.events` is `readonly RunEvent[]`; filtering for `event.type === "agent-turn"` and grouping by `agentId` is the derivation path for `agents[]` and `agentCount`. Type-narrowed inside the implementation only.
- **SubRunCompletedEvent childRunId** — `trace.events.filter(e => e.type === "sub-run-completed")` yields `SubRunCompletedEvent[]`; `.map(e => e.childRunId)` populates `childRunIds`. Type-narrowed inside the implementation only.
- **Outcome derivation order** — check for `FinalEvent` first (type = `"final"`); if absent, check for `BudgetStopEvent` (type = `"budget-stop"`); otherwise outcome is `"aborted"`. The `BudgetStopEvent.reason` field is the `terminationCode`.

</code_context>

<specifics>
## Specific Ideas

- **`AuditRecord` type sketch** (from D-04):
  ```ts
  interface AuditRecord {
    readonly auditSchemaVersion: "1";
    readonly runId: string;
    readonly intent: string;
    readonly startedAt: string;      // from RunMetadata / first event
    readonly completedAt: string;    // from RunMetadata / last event
    readonly protocol: Protocol;
    readonly tier: Tier;
    readonly modelProviderId: string;
    readonly agentCount: number;
    readonly turnCount: number;      // total across all agents
    readonly outcome: AuditOutcome;
    readonly cost: AuditCost;
    readonly terminationReason?: string;
    readonly agents: readonly AuditAgentRecord[];
    readonly childRunIds?: readonly string[];
  }

  interface AuditOutcome {
    readonly status: "completed" | "budget-stopped" | "aborted";
    readonly terminationCode?: string;
  }

  interface AuditCost {
    readonly usd: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
  }

  interface AuditAgentRecord {
    readonly id: string;
    readonly role: string;
    readonly turnCount: number;
  }
  ```
- **`terminationReason` vs `outcome.terminationCode` overlap** (D-06): The planner should decide whether to keep both or collapse to `outcome.terminationCode` only. The user selected both, but they carry similar information. Recommendation: keep `outcome.terminationCode` as the machine-readable code and omit the top-level `terminationReason` — or keep both with clear semantic distinction (code = short key, reason = human string). Flag this in the plan for a final call.
- **`startedAt`/`completedAt` on AuditRecord** — derivable from `trace.events` (first event `at` / last event `at` or `completedAt`). Phase 6 added `startedAt`/`completedAt` to `ModelRequestEvent`/`ModelResponseEvent`, and `RunMetadata.startedAt`/`completedAt` are already on the result. Researcher should confirm the most reliable source from `Trace` alone (without `RunMetadata`).
- **`turnCount` derivation** — count of all `TurnEvent` + `BroadcastEvent` entries in `trace.events`. Both are "one turn per contributing agent per round" events. Researcher should confirm whether `BroadcastEvent` is the right aggregate or whether each parallel turn within a broadcast round counts separately.
- **Fixture structure for D-11** — one realistic `AuditRecord` for a coordinator run with 2 agents, 3 total turns, `agentCount: 2`, `childRunIds: ["child-run-abc"]`, `outcome: { status: "completed" }`. Demonstrates all non-trivial fields.

</specifics>

<deferred>
## Deferred Ideas

- **`result.auditRecord` auto-attach** — not added in Phase 8. Per AUDT-01, audit is produced by a pure function call, not auto-attached to `RunResult`. If callers want auto-audit, they can wrap `run()`. Could be added in a future phase.
- **`compactAuditRecord` / deduplication mode** — deferred per REQUIREMENTS.md (Future Requirements: `compactProvenance deduplication mode`).
- **Per-agent cost in `AuditAgentRecord`** — not included in Phase 8 (agents carry `turnCount` only). Per-agent cost breakdown would require more complex event parsing and a harder type constraint. Could be added when callers request it.
- **Nested `childRuns: AuditRecord[]`** — not included; callers who want recursive audit records call `createAuditRecord` on embedded child traces themselves (D-10). Recursive approach deferred unless callers need it.
- **`terminationReason` top-level field** — may be collapsed into `outcome.terminationCode` during planning (see Specifics note). If collapsed, defer the human-readable string field to a future pass.

</deferred>

---

*Phase: 8-Audit Event Schema*
*Context gathered: 2026-05-01*
