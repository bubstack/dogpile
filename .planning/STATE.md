---
gsd_state_version: 1.0
milestone: v0.4.0
milestone_name: milestone
status: Phase 1 shipped; ready for Phase 2 plan-phase
last_updated: "2026-05-01T01:08:43.046Z"
last_activity: 2026-05-01
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 10
  completed_plans: 9
  percent: 90
---

# State

## Project Reference

**Core value:** Coordinated, observable, replayable multi-agent runs with a strict boundary — Dogpile owns the coordination loop; the application owns credentials, pricing, storage, queues, UI, and tool side effects.

**Current focus:** v0.4.0 Recursive Coordination — agent-driven nesting via a `delegate` decision on the `coordinator` protocol, with embedded child traces, propagated budgets/cancel/cost, bounded concurrency with locality clamp, child event bubbling, and child error escalation.

## Current Position

Phase: 03
Plan: Not started
Status: Phase 1 shipped; ready for Phase 2 plan-phase
Last activity: 2026-05-01

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 1 / 5 |
| Requirements complete | 8 / 27 |
| Plans complete | 5 / 5 |

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

### Todos

(empty — Phase 2 not yet planned)

### Blockers

(none)

## Session Continuity

**Next action:** Run `/gsd-plan-phase 2` to decompose Phase 2 (Budget, Cancellation, Cost Roll-Up) into executable plans.

---

*Last updated: 2026-04-30 — Phase 1 complete; 8/27 requirements shipped; verify green.*
