---
gsd_state_version: 1.0
milestone: v0.4.0
milestone_name: milestone
status: Phase 3 Plan 03-01 complete; ready for 03-02 bounded dispatch
last_updated: "2026-05-01T01:31:05Z"
last_activity: 2026-05-01
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 12
  completed_plans: 10
  percent: 83
---

# State

## Project Reference

**Core value:** Coordinated, observable, replayable multi-agent runs with a strict boundary — Dogpile owns the coordination loop; the application owns credentials, pricing, storage, queues, UI, and tool side effects.

**Current focus:** v0.4.0 Recursive Coordination — agent-driven nesting via a `delegate` decision on the `coordinator` protocol, with embedded child traces, propagated budgets/cancel/cost, bounded concurrency with locality clamp, child event bubbling, and child error escalation.

## Current Position

Phase: 03
Plan: 02
Status: Phase 3 Plan 03-01 complete; ready for bounded dispatch and array-parser unlock
Last activity: 2026-05-01

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 2 / 5 |
| Requirements complete | 11 / 27 |
| Plans complete | 10 / 12 |

## Accumulated Context

### Decisions

- **Phase numbering starts at 1.** Project pre-dates GSD phase tracking; no prior `.planning/phases/` directory exists.
- **5 phases, dependency-ordered.** DELEGATE+TRACE grouped (same surface), then BUDGET, then PROVIDER+CONCURRENCY (locality is prerequisite for clamp), then STREAM+ERROR, then DOCS last.
- **Public-surface invariants must move together.** Every event/result/exports change updates `src/tests/event-schema.test.ts`, `src/tests/result-contract.test.ts`, `src/tests/package-exports.test.ts`, `package.json` `exports`/`files`, and `CHANGELOG.md`.
- **Phase 1 — AgentDecision is a discriminated union.** `ParticipateAgentDecision | DelegateAgentDecision`, discriminated on `type`. Consumers must narrow on `decision.type === "participate"` before reading paper-style fields.
- **Phase 1 — Sub-run events.** `RunEvent` union extended with `sub-run-started`, `sub-run-completed`, `sub-run-failed`. `sub-run-completed.subResult` carries the child `RunResult` inline. `recursive: true` flag on `sub-run-started` when both parent and child protocol are `coordinator` (D-16).
- **Phase 1 — maxDepth dual gate.** Default 4; per-run can only LOWER the engine value (`effectiveMaxDepth = min(engine ?? 4, run ?? Infinity)`). Overflow throws `DogpileError({ code: "invalid-configuration", detail: { kind: "delegate-validation", reason: "depth-overflow" } })` at BOTH parse time AND dispatch time.
- **Phase 1 — Replay walks trace verbatim.** `recomputeAccountingFromTrace` recurses into `sub-run-completed.subResult`; mismatch throws with `reason: "trace-accounting-mismatch"`. No child-event bubbling in Phase 1 (deferred to Phase 4 per D-09).
- **Phase 1 — Provider inheritance.** Child sub-runs inherit the parent provider object verbatim (D-11); cost-cap not propagated; child timeoutMs default = `parent.deadline - now` (or undefined if parent uncapped, per planner-resolved Q3).
- **Phase 3 Plan 03-01 — Provider locality metadata.** `ConfiguredModelProvider.metadata?.locality` is the public provider hint; OpenAI-compatible providers auto-detect local hosts through `classifyHostLocality`; invalid locality is rejected at construct time and engine run start.
- **Phase 3 Plan 03-01 — Local spoofing guard.** `locality: "remote"` on a detected-local OpenAI-compatible `baseURL` throws `invalid-configuration` with `detail.reason: "remote-override-on-local-host"`.

### Todos

- Execute Phase 3 Plan 03-02: bounded dispatch + delegate array-parser unlock.

### Blockers

(none)

## Session Continuity

**Next action:** Execute `.planning/phases/03-provider-locality-bounded-concurrency/03-02-PLAN.md`.

---

*Last updated: 2026-05-01 — Phase 3 Plan 03-01 complete; 11/27 requirements shipped; verify green.*
