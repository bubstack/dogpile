---
phase: 08-audit-event-schema
reviewed: 2026-05-01T22:02:27Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/runtime/audit.ts
  - src/runtime/audit.test.ts
  - src/tests/fixtures/audit-record-v1.json
  - src/tests/fixtures/audit-record-v1.type-check.ts
  - src/tests/audit-record-shape.test.ts
  - package.json
  - src/tests/package-exports.test.ts
  - CHANGELOG.md
  - CLAUDE.md
findings:
  critical: 4
  warning: 1
  info: 0
  total: 5
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-05-01T22:02:27Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the audit record implementation, fixture/type contract, package export surface, changelog, and repo guidance. The submitted code has correctness issues in `createAuditRecord` around real budget-stop traces, delegated child lineage, and valid event timestamp shapes. There is also a release identity mismatch and a missing public-package smoke assertion for the new audit subpath.

## Critical Issues

### CR-01: BLOCKER - Budget-stopped runs are reported as completed

**File:** `src/runtime/audit.ts:52`
**Issue:** `createAuditRecord` prioritizes any `final` event over a `budget-stop` event, so real budget-stopped traces are classified as `{ status: "completed" }`. Existing runtime behavior emits `budget-stop` followed by `final` for budget termination, so the Phase 8 contract that `terminationCode` carries the budget reason is not honored for live runs.
**Fix:**
```ts
const outcome: AuditOutcome = budgetStopEvent
  ? { status: "budget-stopped", terminationCode: budgetStopEvent.reason }
  : finalEvent
    ? { status: "completed" }
    : { status: "aborted" };
```
Also add an audit unit test using `[budgetStopEvent("iterations"), finalEvent(...)]`.

### CR-02: BLOCKER - Failed child runs are omitted from audit lineage

**File:** `src/runtime/audit.ts:83`
**Issue:** `childRunIds` is derived only from `sub-run-completed`. Completed parent traces can include `sub-run-failed` events for delegated children, but those child run ids disappear from the audit record, creating an incomplete audit chain.
**Fix:**
```ts
const childRunIds = [
  ...new Set(
    trace.events.flatMap((event) =>
      event.type === "sub-run-started" ||
      event.type === "sub-run-completed" ||
      event.type === "sub-run-failed"
        ? [event.childRunId]
        : []
    )
  )
];
```
Add coverage for failed delegated children and deduplication.

### CR-03: BLOCKER - startedAt is blank for valid model activity first events

**File:** `src/runtime/audit.ts:87`
**Issue:** The code assumes the first trace event has `at`, but `ModelRequestEvent` and `ModelResponseEvent` intentionally use `startedAt`/`completedAt` instead. A valid stored/replayed trace whose first event is model activity produces `startedAt: ""`, which violates the audit record timing contract.
**Fix:**
```ts
function eventStartedAt(event: Trace["events"][number] | undefined): string {
  if (event === undefined) return "";
  return "at" in event ? event.at : event.startedAt;
}

const startedAt = eventStartedAt(trace.events[0]);
```
Add a test where the first event is `model-request`.

### CR-04: BLOCKER - Package version and changelog release identity disagree

**File:** `package.json:3`, `CHANGELOG.md:3`
**Issue:** The changelog declares a dated `0.5.0` release heading, but the package manifest still publishes `0.4.0`. A pack or publish from this tree would ship the new v0.5.0 audit public API as `@dogpile/sdk@0.4.0`; the current package identity checks miss this because they find the older 0.4.0 changelog entry later in the file.
**Fix:** Either keep the new notes under a true unreleased heading, or bump release identity in lockstep before ship:
```json
{
  "version": "0.5.0"
}
```
Update `scripts/release-identity.json`, release docs, and package identity tests with the same version.

## Warnings

### WR-01: WARNING - Public package smoke does not assert the audit subpath contract

**File:** `src/tests/package-exports.test.ts:1377`
**Issue:** The export-map test only dynamically imports each subpath and checks it resolves. The consumer type smoke imports many runtime subpaths, but it does not import `@dogpile/sdk/runtime/audit` or assert `createAuditRecord` / `AuditRecord` resolve from the packed package. A named-export or declaration regression in the new public audit subpath would have weak coverage.
**Fix:**
```ts
import {
  createAuditRecord,
  type AuditRecord
} from "@dogpile/sdk/runtime/audit";

expect(typeof createAuditRecord).toBe("function");
```
Also update the consumer smoke subpath export list to include `runtime/audit`.

---

_Reviewed: 2026-05-01T22:02:27Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
