---
phase: 08-audit-event-schema
verified: 2026-05-01T22:20:15Z
status: passed
score: 17/17 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 16/17
  gaps_closed:
    - "Frozen AuditRecord fixture guard now deep-compares the live record to the saved fixture with expect(live).toEqual(saved), so nested emitted schema drift requires an explicit fixture update."
  gaps_remaining: []
  regressions: []
---

# Phase 08: Audit Event Schema Verification Report

**Phase Goal:** Callers can produce a stable, versioned audit record from any completed trace using a pure function; the record type is independent of `RunEvent` schema and its shape is protected by a frozen fixture test.
**Verified:** 2026-05-01T22:20:15Z
**Status:** passed
**Re-verification:** Yes - after gap closure

## Goal Achievement

Phase 08 is now achieved. The prior blocker was that `src/tests/audit-record-shape.test.ts` only checked top-level key order and shallow type categories. The current test keeps those checks and adds `expect(live).toEqual(saved)` at `src/tests/audit-record-shape.test.ts:104`, which closes the nested emitted-schema drift gap for `outcome`, `cost`, `agents`, and `childRunIds`.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Calling the audit function on a completed trace returns `auditSchemaVersion: "1"` plus run-level fields. | VERIFIED | `createAuditRecord` returns version, run id, intent, timestamps, protocol, tier, provider, counts, outcome, cost, agents, and optional child ids at `src/runtime/audit.ts:48-104`; tests cover core fields at `src/runtime/audit.test.ts:10-142`. |
| 2 | `AuditRecord` is a standalone exported type importable without any `RunEvent` variant. | VERIFIED | Source type is standalone at `src/runtime/audit.ts:23-38`; emitted declaration imports only `Protocol`, `Tier`, and `Trace` at `dist/runtime/audit.d.ts:1-41`, with no event variant imports. |
| 3 | Frozen fixture test rejects any emitted `AuditRecord` schema change unless the fixture is explicitly updated. | VERIFIED | `src/tests/audit-record-shape.test.ts:102-104` asserts top-level key order, top-level type categories, and full deep equality between live output and `audit-record-v1.json`. |
| 4 | `turnCount` counts only `agent-turn`, not `broadcast`. | VERIFIED | Implementation filters `event.type === "agent-turn"` at `src/runtime/audit.ts:68`; regression coverage at `src/runtime/audit.test.ts:81-95`. |
| 5 | `agentCount` equals distinct `agentId` values from agent turns. | VERIFIED | `agentTurnMap` is keyed by `agentId` at `src/runtime/audit.ts:69-76`; coverage at `src/runtime/audit.test.ts:97-107`. |
| 6 | `agents[]` is sorted by id. | VERIFIED | Sort occurs at `src/runtime/audit.ts:79-81`; coverage at `src/runtime/audit.test.ts:109-118`. |
| 7 | `childRunIds` is absent when no `sub-run-completed` events exist. | VERIFIED | Conditional spread at `src/runtime/audit.ts:103`; coverage at `src/runtime/audit.test.ts:120-124`. |
| 8 | `childRunIds` is present from `sub-run-completed` events. | VERIFIED | Mapping at `src/runtime/audit.ts:83-85`; coverage at `src/runtime/audit.test.ts:126-130`. |
| 9 | Budget stop outcome uses normalized `BudgetStopReason` values. | VERIFIED | Budget stop reason is copied to `outcome.terminationCode` at `src/runtime/audit.ts:52-56`; tests cover `cost`, `tokens`, and `iterations` paths at `src/runtime/audit.test.ts:57-79`. |
| 10 | Budget-stop followed by final still reports budget-stopped. | VERIFIED | Outcome prioritizes `budgetStopEvent` over `finalEvent` at `src/runtime/audit.ts:52-56`; regression test at `src/runtime/audit.test.ts:63-67`. |
| 11 | `startedAt` and `completedAt` are derived from trace data, including model activity first events. | VERIFIED | `eventStartedAt` handles both `at` and `startedAt` at `src/runtime/audit.ts:107-120`; tests at `src/runtime/audit.test.ts:33-49`. |
| 12 | Cost derives from terminal event data for completed runs. | VERIFIED | Cost source selection and projection at `src/runtime/audit.ts:58-66`; completed-run test at `src/runtime/audit.test.ts:132-136`. |
| 13 | `audit-record-v1.json` exists in canonical field order. | VERIFIED | Fixture exists at `src/tests/fixtures/audit-record-v1.json:1-19`; runtime key-order assertion is at `src/tests/audit-record-shape.test.ts:102`. |
| 14 | Type-check fixture asserts the JSON shape against `AuditRecord`. | VERIFIED | `src/tests/fixtures/audit-record-v1.type-check.ts:1-24` uses `satisfies AuditRecord`; `pnpm run typecheck` passed. |
| 15 | `/runtime/audit` is wired in package `exports` and `files`. | VERIFIED | Export block is at `package.json:48-52`; files entry is at `package.json:165`; tests lock both at `src/tests/package-exports.test.ts:1153` and `src/tests/package-exports.test.ts:1283-1287`. |
| 16 | Consumer/package smoke covers `createAuditRecord` and `AuditRecord` from the audit subpath. | VERIFIED | Package export smoke imports and uses both at `src/tests/package-exports.test.ts:17` and `src/tests/package-exports.test.ts:1528-1562`; consumer smoke imports and uses both at `scripts/consumer-import-smoke.mjs:728` and `scripts/consumer-import-smoke.mjs:915`. |
| 17 | Public docs and invariants mention the audit subpath and fixture lockstep. | VERIFIED | Changelog documents the subpath, types, pure function, and explicit invocation at `CHANGELOG.md:27-35`; invariant is at `CLAUDE.md:50`. |

**Score:** 17/17 truths verified

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/runtime/audit.ts` | `createAuditRecord` plus `AuditRecord`, `AuditOutcome`, `AuditCost`, `AuditAgentRecord`, `AuditOutcomeStatus` | VERIFIED | Exports and implementation present at `src/runtime/audit.ts:4-121`; pure derivation only, no runtime I/O or storage. |
| `src/runtime/audit.test.ts` | Co-located behavior tests | VERIFIED | Covers version, pass-through fields, timestamps, outcomes, counts, sorting, child ids, cost, and determinism at `src/runtime/audit.test.ts:9-143`. |
| `src/tests/fixtures/audit-record-v1.json` | Frozen canonical fixture | VERIFIED | Exists at `src/tests/fixtures/audit-record-v1.json:1-19` with canonical order and nested objects/arrays. |
| `src/tests/fixtures/audit-record-v1.type-check.ts` | Compile-time `satisfies AuditRecord` assertion | VERIFIED | Present at `src/tests/fixtures/audit-record-v1.type-check.ts:1-24`; typecheck passed. |
| `src/tests/audit-record-shape.test.ts` | Runtime deep equality plus key-order frozen fixture test | VERIFIED | Reads the fixture, builds live output, checks key order/type shape, and deep-compares `live` to `saved` at `src/tests/audit-record-shape.test.ts:93-127`. |
| `package.json` | `./runtime/audit` export and source files entry | VERIFIED | Export block at `package.json:48-52`; files entry at `package.json:165`. |
| `src/tests/package-exports.test.ts` | Manifest and consumer subpath guard | VERIFIED | Files/exports assertions and named import/type smoke cover `/runtime/audit` at `src/tests/package-exports.test.ts:1153`, `1283-1287`, and `1528-1562`. |
| `scripts/consumer-import-smoke.mjs` | Fresh consumer type import for audit subpath | VERIFIED | Public subpath list includes `runtime/audit` at `scripts/consumer-import-smoke.mjs:106`; type smoke imports and uses `AuditRecord`/`createAuditRecord` at `scripts/consumer-import-smoke.mjs:728` and `915`. |
| `CHANGELOG.md` | Public API documentation | VERIFIED | Phase 8 release notes at `CHANGELOG.md:27-35`. |
| `CLAUDE.md` | Public-surface invariant | VERIFIED | Audit lockstep invariant at `CLAUDE.md:50`. |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/runtime/audit.ts` | `src/types.ts` | type-only import | WIRED | `Protocol`, `Tier`, and `Trace` imported at `src/runtime/audit.ts:1`; emitted declaration keeps only this public type import at `dist/runtime/audit.d.ts:1`. |
| `src/runtime/audit.ts` | `src/types/events.ts` | type-only import for implementation narrowing | WIRED | Event variant imports at `src/runtime/audit.ts:2` are used inside `createAuditRecord`; they do not leak into the `AuditRecord` declaration in `dist/runtime/audit.d.ts`. |
| `src/tests/fixtures/audit-record-v1.type-check.ts` | `src/runtime/audit.ts` | `import type { AuditRecord }` | WIRED | Present at `src/tests/fixtures/audit-record-v1.type-check.ts:1`. |
| `src/tests/audit-record-shape.test.ts` | `src/tests/fixtures/audit-record-v1.json` | `readFile` and `JSON.parse` | WIRED | Fixture path is built at `src/tests/audit-record-shape.test.ts:9-10`; file is read and parsed at `src/tests/audit-record-shape.test.ts:93-96`. |
| `src/tests/audit-record-shape.test.ts` | `createAuditRecord` output | `expect(live).toEqual(saved)` | WIRED | Deep comparison at `src/tests/audit-record-shape.test.ts:104` closes the prior nested drift gap. |
| `package.json` | `dist/runtime/audit.js` and `.d.ts` | `./runtime/audit` export | WIRED | Export map points to built audit artifacts at `package.json:48-52`; built files exist in `dist/runtime/audit.js` and `dist/runtime/audit.d.ts`. |
| `src/tests/package-exports.test.ts` | `package.json` | manifest `files` and `exports` assertions | WIRED | Assertions include audit files and exports at `src/tests/package-exports.test.ts:1153` and `src/tests/package-exports.test.ts:1283-1287`. |
| `scripts/consumer-import-smoke.mjs` | packed package audit subpath | generated consumer type smoke | WIRED | Fresh consumer type smoke imports `createAuditRecord` and `AuditRecord` from the installed package at `scripts/consumer-import-smoke.mjs:728`. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/runtime/audit.ts` | `AuditRecord` fields | Caller-supplied `Trace` (`runId`, `inputs.intent`, `events`, `finalOutput.completedAt`, terminal event cost/outcome) | Yes | VERIFIED - all fields are derived from the trace at `src/runtime/audit.ts:48-104`; no static placeholder record is returned. |
| `src/tests/audit-record-shape.test.ts` | `live` audit record | `createAuditRecord(buildFixtureTrace())` | Yes | VERIFIED - live fixture data flows through runtime derivation, then key order, type shape, and deep equality are checked against the saved fixture. |
| `scripts/consumer-import-smoke.mjs` | `auditRecord` | Installed package import and live quickstart `result.trace` | Yes | VERIFIED - consumer type smoke calls `createAuditRecord(result.trace)` and checks `auditSchemaVersion` at `scripts/consumer-import-smoke.mjs:915-950`. |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted audit/package tests pass | `pnpm vitest run src/runtime/audit.test.ts src/tests/audit-record-shape.test.ts src/tests/package-exports.test.ts` | 3 files passed, 54 tests passed | PASS |
| Type-check includes fixture companion | `pnpm run typecheck` | Exited 0 | PASS |
| Full release-quality gate passes | `pnpm run verify` | Package identity, build, package artifacts, packed consumer quickstart smoke, typecheck, and full Vitest suite passed; 722 tests passed, 1 skipped | PASS |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUDT-01 | 08-01, 08-03 | Caller can produce a versioned audit record from a completed trace using a pure function, not auto-attached to `RunResult`. | SATISFIED | `createAuditRecord` is exported from `src/runtime/audit.ts:48-104`; returns `auditSchemaVersion: "1"` at `src/runtime/audit.ts:90`; package subpath export at `package.json:48-52`; changelog notes records are explicitly produced at `CHANGELOG.md:35`. |
| AUDT-02 | 08-01, 08-02, 08-03 | `AuditRecord` type is independent of `RunEvent` schema and validated by a frozen JSON fixture test requiring explicit fixture updates on schema changes. | SATISFIED | Type declaration is standalone at `src/runtime/audit.ts:23-38` and `dist/runtime/audit.d.ts:17-32`; fixture guard checks key order/type shape and deep equality at `src/tests/audit-record-shape.test.ts:102-104`; type companion uses `satisfies AuditRecord` at `src/tests/fixtures/audit-record-v1.type-check.ts:24`. |

No orphaned Phase 8 requirements were found. `.planning/REQUIREMENTS.md` maps only AUDT-01 and AUDT-02 to Phase 8, and all three plans declare AUDT-01 and/or AUDT-02.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No blocking anti-patterns found in the Phase 8 files. |

Info-only scan results: `return {}` in `typeShape(undefined)` is a fixture-test helper fallback, not production behavior; `console.log` matches are in docs/smoke output paths and are expected for CLI smoke diagnostics.

## Review Context

CR-01 and CR-03 remain fixed: budget-stop outcome wins over final events at `src/runtime/audit.ts:52-56`, and `eventStartedAt` handles `startedAt`-based model activity events at `src/runtime/audit.ts:107-120`.

WR-01 remains fixed: `src/tests/package-exports.test.ts:17` imports the audit subpath, `src/tests/package-exports.test.ts:1528-1562` exercises `createAuditRecord`/`AuditRecord`, and `scripts/consumer-import-smoke.mjs:728` imports the audit subpath in the generated consumer type smoke.

CR-02 is non-blocking for Phase 8 as written. The plan explicitly defines `childRunIds` from `sub-run-completed` events and requires the field to be absent when no such events exist. Failed-child audit lineage may be a future schema enhancement, but it does not violate AUDT-01 or AUDT-02.

CR-04 is non-blocking for Phase 8 as written. Package identity remains `@dogpile/sdk@0.4.0` while Phase 8 adds v0.5.0 milestone changelog notes before the release phase. The local package export and consumer smoke path are wired; version bump/release identity is release-management work.

## Human Verification Required

None. Phase 8 behavior is covered by automated source, type, package, and release-gate checks.

## Gaps Summary

No blocking gaps remain. The prior frozen-fixture gap is closed by the deep equality assertion in `src/tests/audit-record-shape.test.ts`, and all Phase 8 roadmap success criteria and AUDT-01/AUDT-02 requirements are satisfied.

---

_Verified: 2026-05-01T22:20:15Z_
_Verifier: the agent (gsd-verifier)_
