---
phase: 08-audit-event-schema
review: 08-REVIEW.md
fixed_at: 2026-05-01T22:09:00Z
status: partial
findings_in_scope: 5
fixed: 3
skipped: 2
iteration: 1
commits:
  - 9eaf606
  - bd032bd
---

# Phase 08 Code Review Fix Report

## Fixed

### CR-01: Budget-stopped runs reported as completed

**Status:** fixed  
**Commit:** `9eaf606`  
**Files:** `src/runtime/audit.ts`, `src/runtime/audit.test.ts`

`createAuditRecord` now prioritizes `budget-stop` over `final` when deriving `outcome`, matching live traces that emit `budget-stop` followed by `final`. Added regression coverage for `[budgetStopEvent("iterations"), finalEvent(...)]`.

### CR-03: startedAt blank for model activity first events

**Status:** fixed  
**Commit:** `9eaf606`  
**Files:** `src/runtime/audit.ts`, `src/runtime/audit.test.ts`

`createAuditRecord` now derives `startedAt` from either `event.at` or `event.startedAt`, covering `ModelRequestEvent` and `ModelResponseEvent` trace shapes. Added a model-request-first regression test.

### WR-01: Public package smoke lacks audit subpath assertion

**Status:** fixed  
**Commit:** `bd032bd`  
**Files:** `src/tests/package-exports.test.ts`, `scripts/consumer-import-smoke.mjs`

The package exports test now imports `createAuditRecord` and `AuditRecord` from `@dogpile/sdk/runtime/audit`, and the fresh consumer smoke now expects the `runtime/audit` subpath and type-checks an `AuditRecord`.

## Skipped

### CR-02: Failed child runs omitted from audit lineage

**Status:** skipped by scope  
**Reason:** Phase 8 locked `childRunIds` to `SubRunCompletedEvent.childRunId` only. The plan's must-have explicitly requires `childRunIds` to be absent when no `sub-run-completed` events exist. Including `sub-run-failed` or `sub-run-started` ids would change the schema semantics and should be handled by a follow-up requirement.

### CR-04: Package version and changelog release identity disagree

**Status:** skipped by scope  
**Reason:** This repository still has release identity locked to `@dogpile/sdk@0.4.0` via `scripts/release-identity.json` and package identity checks. Phase 8 adds v0.5.0 milestone notes but does not cut the v0.5.0 release. Version and release-doc updates should happen in the release/identity phase, not inside the audit event schema implementation.

## Verification

- `pnpm vitest run src/runtime/audit.test.ts src/tests/audit-record-shape.test.ts src/tests/package-exports.test.ts` - passed, 54 tests.
- `pnpm run typecheck` - passed.

## Residual Risk

The remaining skipped items are intentional scope decisions. `CR-02` is a possible future audit schema enhancement; `CR-04` is release-management work outside Phase 8.
