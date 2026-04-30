---
milestone: v0.4.0
name: Recursive Coordination
status: planning
progress:
  phases_completed: 0
  phases_total: 5
  requirements_completed: 0
  requirements_total: 27
---

# State

## Project Reference

**Core value:** Coordinated, observable, replayable multi-agent runs with a strict boundary — Dogpile owns the coordination loop; the application owns credentials, pricing, storage, queues, UI, and tool side effects.

**Current focus:** v0.4.0 Recursive Coordination — agent-driven nesting via a `delegate` decision on the `coordinator` protocol, with embedded child traces, propagated budgets/cancel/cost, bounded concurrency with locality clamp, child event bubbling, and child error escalation.

## Current Position

Phase: 1 — Delegate Decision & Sub-Run Traces (not started)
Plan: —
Status: Roadmap drafted; awaiting user approval before plan-phase
Last activity: 2026-04-30 — Roadmap created (5 phases, 27 requirements mapped)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 0 / 5 |
| Requirements complete | 0 / 27 |
| Plans complete | 0 / 0 |

## Accumulated Context

### Decisions

- **Phase numbering starts at 1.** Project pre-dates GSD phase tracking; no prior `.planning/phases/` directory exists.
- **5 phases, dependency-ordered.** DELEGATE+TRACE grouped (same surface), then BUDGET, then PROVIDER+CONCURRENCY (locality is prerequisite for clamp), then STREAM+ERROR, then DOCS last.
- **Public-surface invariants must move together.** Every event/result/exports change updates `src/tests/event-schema.test.ts`, `src/tests/result-contract.test.ts`, `src/tests/package-exports.test.ts`, `package.json` `exports`/`files`, and `CHANGELOG.md`.

### Todos

(empty — to be populated by plan-phase)

### Blockers

(none)

## Session Continuity

**Next action:** User reviews `.planning/ROADMAP.md`. On approval, run `/gsd-plan-phase 1` to decompose Phase 1 (Delegate Decision & Sub-Run Traces) into executable plans.

---

*Last updated: 2026-04-30 — roadmap drafted.*
