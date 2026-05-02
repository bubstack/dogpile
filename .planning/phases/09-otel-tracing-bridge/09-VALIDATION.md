---
phase: 9
slug: otel-tracing-bridge
status: compliant
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-01
audited: 2026-05-01
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm vitest run src/runtime/tracing.test.ts src/tests/otel-tracing-contract.test.ts src/tests/no-otel-imports.test.ts` |
| **Full suite command** | `pnpm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run src/runtime/tracing.test.ts`
- **After every plan wave:** Run `pnpm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | OTEL-01 | — | N/A | unit | `pnpm vitest run src/runtime/tracing.test.ts` | ✅ | ✅ green |
| 09-01-02 | 01 | 1 | OTEL-01 | — | N/A | unit | `pnpm run typecheck` | ✅ | ✅ green |
| 09-02-01 | 02 | 2 | OTEL-01, OTEL-02, OTEL-03 | — | N/A | unit | `pnpm vitest run src/tests/otel-tracing-contract.test.ts` | ✅ | ✅ green |
| 09-02-02 | 02 | 2 | OTEL-02 | — | N/A | unit | `pnpm vitest run src/tests/otel-tracing-contract.test.ts src/tests/no-otel-imports.test.ts src/tests/package-exports.test.ts` | ✅ | ✅ green |
| 09-03-01 | 03 | 3 | OTEL-01, OTEL-02, OTEL-03 | — | N/A | unit | `pnpm run test` | ✅ | ✅ green |
| 09-04-01 | 04 | 4 | OTEL-01 | — | N/A | unit | `pnpm run verify` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/runtime/tracing.ts` — stub with `DogpileTracer`, `DogpileSpan`, `DogpileSpanOptions`, `DOGPILE_SPAN_NAMES`
- [x] `src/runtime/tracing.test.ts` — stubs for OTEL-01, OTEL-02, OTEL-03 test cases
- [x] `devDependencies` — add `@opentelemetry/api` and `@opentelemetry/sdk-trace-base`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| InMemorySpanExporter receives spans for a real run | OTEL-01 | Integration test with real tracer bridge | Wire an `InMemorySpanExporter`, run `Dogpile.pile(...)`, inspect exported spans for `dogpile.run`, `dogpile.agent-turn`, `dogpile.model-call` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** compliant

---

## Validation Audit 2026-05-01

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

**Gap resolved:** Task 09-02-01 had a stale command pointing to `src/runtime/engine.test` (no co-located engine test file exists). Updated to `pnpm vitest run src/tests/otel-tracing-contract.test.ts` which covers OTEL-01/02/03 engine span lifecycle (44 tests passing). All Phase 9 requirements are fully covered by automated tests; `pnpm run test` runs 770 tests with 0 failures.
