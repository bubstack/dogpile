---
phase: 7
slug: structured-event-introspection-health-diagnostics
status: active
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-01
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) |
| **Config file** | Auto-discovered (no explicit vitest.config.*) |
| **Quick run command** | `pnpm vitest run src/runtime/introspection.test.ts src/runtime/health.test.ts` |
| **Full suite command** | `pnpm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm run typecheck && pnpm vitest run <affected-test-file>`
- **After every plan wave:** Run `pnpm run test`
- **Before `/gsd-verify-work`:** `pnpm run verify` must be green

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | INTR-01, INTR-02 | — | N/A | type-level | `pnpm run typecheck` | ❌ Wave 0 | ⬜ pending |
| 07-01-02 | 01 | 1 | INTR-01, INTR-02 | — | N/A | type-level | `pnpm run typecheck` | ❌ Wave 0 | ⬜ pending |
| 07-01-03 | 01 | 1 | HLTH-01, HLTH-02 | — | N/A | fixture | `pnpm run typecheck` | ❌ Wave 0 | ⬜ pending |
| 07-02-01 | 02 | 2 | INTR-01, INTR-02 | — | N/A | unit | `pnpm vitest run src/runtime/introspection.test.ts` | ❌ Wave 0 | ⬜ pending |
| 07-03-01 | 03 | 2 | HLTH-01, HLTH-02 | — | N/A | unit | `pnpm vitest run src/runtime/health.test.ts` | ❌ Wave 0 | ⬜ pending |
| 07-04-01 | 04 | 3 | HLTH-01, HLTH-02 | — | N/A | integration | `pnpm run typecheck && pnpm vitest run src/tests/result-contract.test.ts` | ✅ existing | ⬜ pending |
| 07-04-02 | 04 | 3 | HLTH-01, HLTH-02 | — | N/A | contract | `pnpm run test` | ❌ Wave 0 | ⬜ pending |
| 07-05-01 | 05 | 4 | INTR-01, INTR-02, HLTH-01, HLTH-02 | — | N/A | package | `pnpm run verify` | ✅ existing | ⬜ pending |
| 07-05-02 | 05 | 4 | INTR-01, INTR-02, HLTH-01, HLTH-02 | — | N/A | package | `pnpm run verify` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/runtime/introspection.test.ts` — unit tests: type filter, agentId filter, turnRange (global index), costRange, combined filters, empty filter, no-match filter
- [ ] `src/runtime/health.test.ts` — unit tests: all four anomaly codes (`runaway-turns`, `budget-near-miss`, `empty-contribution`, `provider-error-recovered` suppressed), budget pct non-null/null, threshold suppression for runaway/near-miss
- [ ] `src/tests/fixtures/anomaly-record-v1.json` — four records (one per anomaly code, all fields present)
- [ ] `src/tests/health-shape.test.ts` — frozen fixture comparison test

*Plans 07-02 and 07-03 create these files as part of their TDD task structure.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-01
