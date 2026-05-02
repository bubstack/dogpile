# Retrospective

## Milestone: v0.4.0 — Recursive Coordination

**Shipped:** 2026-05-01
**Phases:** 5 | **Plans:** 22 | **Requirements:** 27/27

### What Was Built

Dogpile now supports recursive coordination through a `delegate` decision on the existing `coordinator` protocol. Child runs are real Dogpile runs with embedded traces, replay support, budget/cancel/cost propagation, bounded child concurrency, local-provider clamping, stream ancestry, child failure context, docs, examples, and published release artifacts.

### What Worked

- Dependency ordering held: decision shape and trace events landed first, propagation and concurrency built on that, streaming/error semantics followed, and documentation shipped last.
- Contract tests protected public event/result/package surfaces as recursive coordination widened the SDK API.
- Release closure captured npm/GitHub artifacts in the final phase summary, making archive reconstruction straightforward.

### What Was Inefficient

- The milestone archive workflow expected `gsd-sdk query` commands that are not available in the installed CLI, so completion required manual file analysis and archive creation.
- No separate `.planning/v0.4.0-MILESTONE-AUDIT.md` was present at archive time, leaving the archive to rely on requirements traceability, phase summaries, release verification, and published artifacts.
- The active `PROJECT.md` lagged the Phase 5 release until milestone completion.

### Patterns Established

- Recursive public-surface changes must update event schema tests, result contracts, package exports, changelog, docs, and examples together.
- Stream ancestry uses `parentRunIds` rather than a flat parent id.
- Local-provider safety is automatic via locality clamp rather than caller discipline.
- Runnable examples can default to deterministic providers while offering env-gated OpenAI-compatible live mode.

### Key Lessons

- Keep milestone-level archives as a final release step, separate from release tagging and npm publication.
- Ensure GSD workflow docs and installed CLI capabilities stay in sync before relying on `gsd-sdk query` automation.
- For public SDK work, archive requirements immediately after release so the next milestone starts from a clean requirements file.

### Cost Observations

- Model mix and session cost were not recorded in planning artifacts.
- Verification evidence came from phase summaries, `pnpm run verify`, release validation, GitHub Actions, and npm package checks.

## Milestone: v0.5.0 — Observability and Auditability

**Shipped:** 2026-05-02
**Phases:** 5 | **Plans:** 23 | **Requirements:** 13/13

### What Was Built

Six new observability capabilities added without new required dependencies or breaking the pure-TS runtime contract: provenance metadata on model events, typed event introspection via `queryEvents()`, required `RunResult.health` with anomaly codes, an independent versioned audit record via `createAuditRecord()`, a duck-typed OTEL tracing bridge with parent-span ancestry, and a named-counter `metricsHook` with fire-and-forget isolation.

### What Worked

- Dependency ordering: Phase 6 (event-shape change) landed first; all other phases built on stable provenance fields with no further shape mutations.
- Contract-first approach: frozen JSON fixtures (`provenance-event-v1.json`, `audit-record-v1.json`, `metrics-snapshot-v1.json`) protected public shapes before behavior was written.
- Post-audit regression tests: WARNING-1 (queryEvents model-request/response) and WARNING-2 (replay zero-spans/zero-hooks) were addressed with targeted test commits immediately after the milestone audit, keeping the audit actionable.
- Code review pass before verification caught real bugs (per-turn span accounting, partial abort metrics, Promise-like hook rejections) that would have shipped as silent contract violations.

### What Was Inefficient

- Phase 9 OTEL bridge required a coordinator callback shape change to thread `childRunId` through for `subRunSpansByChildId` WeakMap lookup — this cross-cutting change was unplanned and added debugging time.
- The WeakMap bridge design for OTEL parent-context passing was not obvious upfront; `DogpileTracer` structural compatibility with real OTEL `Tracer` was aspirational but proved unachievable without accepting parent-context API differences.

### Patterns Established

- **Observer hook isolation:** Metrics and logger throws always route to `logger.error`; never propagate into run result. This pattern should apply to any future hook surface.
- **Required-not-optional result fields:** Making `health` required on all result construction paths (run, replay, stream, delegate child) was straightforward once the pattern was established. New required fields should follow the same approach.
- **Duck-typed bridge pattern:** Caller-side WeakMap bridge (real OTEL tracer → `DogpileTracer`) avoids shared type imports while enabling full integration. Documented in `docs/developer-usage.md`.
- **Frozen fixture guard:** JSON fixture + type-check.ts + shape test is now the standard for any versioned schema surface in the SDK.

### Key Lessons

- Milestone audit before completion is valuable: surfacing tech debt and integration gaps in a structured report made prioritization explicit and led to two targeted bug-fixing commits.
- OTEL integration is structurally harder than metrics: parent-context propagation across async boundaries requires WeakMap state; metrics are stateless counters that compose trivially.
- `replay()` / `replayStream()` exclusions from new hooks (tracing, metrics) should be the default — state them explicitly in docs and test them in contract suites.

### Cost Observations

- Model mix and session cost were not recorded in planning artifacts.
- Verification evidence came from phase summaries, `pnpm run verify`, post-audit targeted commits, and `pnpm vitest run` for individual test files.

## Cross-Milestone Trends

| Trend | Observation |
|-------|-------------|
| Public-surface discipline | Event/result/export changes consistently require tests, docs, changelog, and package allowlist updates. |
| Provider neutrality | New features continue to avoid SDK-owned credentials, pricing, persistence, queues, UI, or tool side effects. |
| Release readiness | Release identity checks and packed/import smoke tests remain core gates for package confidence. |
| Contract-first fixtures | Frozen JSON fixtures are now the standard protection for versioned schema surfaces. |
| Observer isolation | Hook throws (metrics, logger) route to the logger error channel, never the run result — establishes the observer-never-pollutes-host pattern. |
