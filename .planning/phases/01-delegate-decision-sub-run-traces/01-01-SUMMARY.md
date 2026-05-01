---
phase: 01-delegate-decision-sub-run-traces
plan: 01
subsystem: runtime/decisions, types/events
tags: [discriminated-union, parser, validation, public-api-breaking]
requires:
  - "AgentDecision flat interface (existing)"
  - "DogpileError invalid-configuration code (existing)"
provides:
  - "AgentDecision discriminated union (ParticipateAgentDecision | DelegateAgentDecision)"
  - "ParticipateAgentDecision public type"
  - "DelegateAgentDecision public type"
  - "parseAgentDecision delegate branch with fenced-JSON parser"
  - "ParseAgentDecisionContext interface (parentProviderId, currentDepth, maxDepth)"
affects:
  - "src/runtime/sequential.ts output-selection fallback"
  - "src/tests/public-api-type-inference.test.ts (lock-step)"
  - "src/tests/fixtures/consumer-type-resolution-smoke.ts (lock-step)"
tech-stack:
  added: []
  patterns:
    - "discriminated union with `type` discriminant (matches TerminationDecision)"
    - "delegate-validation invalidConfiguration error shape (detail.kind: 'delegate-validation', detail.path: 'decision.*')"
key-files:
  created:
    - "src/runtime/decisions.test.ts"
  modified:
    - "src/types/events.ts"
    - "src/types.ts"
    - "src/runtime/decisions.ts"
    - "src/runtime/sequential.ts"
    - "src/runtime/sequential.test.ts"
    - "src/tests/public-api-type-inference.test.ts"
    - "src/tests/fixtures/consumer-type-resolution-smoke.ts"
decisions:
  - "delegate-validation errors use detail.kind 'delegate-validation' (distinct from existing configuration-validation), with detail.path rooted at decision.* per D-15"
  - "isParticipatingDecision narrows on type === 'participate' first; undefined and delegate decisions both return false"
  - "Sequential output selection falls back to the most recent entry without a parsed decision when no participating decision exists, preserving pre-union behavior for non-paper-style providers"
  - "parseAgentDecision accepts an optional ParseAgentDecisionContext (currentDepth/maxDepth/parentProviderId) so Plan 03 and Plan 04 can plumb dispatcher- and depth-checks without re-architecting the signature"
  - "Top-level JSON array inside the delegate block is rejected with detail.path 'decision' and a 'reserved for Phase 3' message; array support intentionally deferred"
metrics:
  duration: "~25 min"
  completed: "2026-04-30"
---

# Phase 01 Plan 01: AgentDecision Discriminated Union & Delegate Parsing Summary

Replaces `AgentDecision` with a discriminated union (`participate` | `delegate`) and extends the paper-style parser with a fenced-JSON `delegate:` branch + rooted validation errors.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace AgentDecision with discriminated union; update consumers + lock fixtures | `9eb01c5` | `src/types/events.ts`, `src/types.ts`, `src/runtime/decisions.ts`, `src/runtime/sequential.ts`, `src/runtime/sequential.test.ts`, `src/tests/public-api-type-inference.test.ts`, `src/tests/fixtures/consumer-type-resolution-smoke.ts` |
| 2 (RED) | Add failing tests for delegate decision parsing | `6f6d036` | `src/runtime/decisions.test.ts` (new, 220 lines) |
| 2 (GREEN) | Implement fenced-JSON delegate parser + validation | `cbe509f` | `src/runtime/decisions.ts` |

## Key Type Signatures Introduced

```ts
export type AgentDecision = ParticipateAgentDecision | DelegateAgentDecision;

export interface ParticipateAgentDecision {
  readonly type: "participate";
  readonly selectedRole: string;
  readonly participation: AgentParticipation;
  readonly rationale: string;
  readonly contribution: string;
}

export interface DelegateAgentDecision {
  readonly type: "delegate";
  readonly protocol: ProtocolName;
  readonly intent: string;
  readonly model?: string;
  readonly budget?: BudgetCaps;
}

export interface ParseAgentDecisionContext {
  readonly currentDepth?: number;
  readonly maxDepth?: number;
  readonly parentProviderId?: string;
}

export function parseAgentDecision(
  output: string,
  context?: ParseAgentDecisionContext
): AgentDecision | undefined;
```

## Validation Error Shape (delegate branch)

All delegate parse errors throw:

```ts
new DogpileError({
  code: "invalid-configuration",
  message: `Invalid Dogpile configuration at ${path}: ${humanMessage}`,
  retryable: false,
  detail: { kind: "delegate-validation", path, expected, received }
});
```

`detail.path` is rooted at the decision per D-15:
- `"decision"` — JSON parse failure, non-object payload, top-level array
- `"decision.protocol"` — unknown protocol
- `"decision.intent"` — missing/empty intent
- `"decision.model"` — non-string, empty, or mismatched parent provider id
- `"decision.budget"` — non-object budget
- `"decision.budget.timeoutMs"` / `"decision.budget.maxTokens"` / `"decision.budget.maxIterations"` — non-negative-integer violations

## Verification

- `pnpm vitest run src/runtime/decisions.test.ts src/runtime/sequential.test.ts src/runtime/broadcast.test.ts src/tests/public-api-type-inference.test.ts` — 28 passed
- `pnpm run typecheck` — clean
- `pnpm vitest run` — 451 passed, 1 pre-existing failure (`src/tests/consumer-type-resolution-smoke.test.ts`, see Deferred Issues)

## Deviations from Plan

### Rule 1 — Bug fix (auto-applied)

**1. Sequential output selection regressed for providers that emit non-paper-style text**

- **Found during:** Task 1, after running the existing sequential test suite.
- **Issue:** With the old `decision?.participation !== "abstain"` semantics, `isParticipatingDecision(undefined)` returned `true`, so `runSequential` happily picked the last transcript entry when no decision parsed. Under the new strict union, `isParticipatingDecision(undefined)` returns `false` (per the plan's spec), which made three existing tests fail (`runs end-to-end against a configured model provider`, `streams the same coordination moments before resolving the final result`, plus the browser-bundle smoke) because the deterministic provider does not emit paper-style fields.
- **Fix:** In `src/runtime/sequential.ts` the `output` selection now prefers the most recent entry with a parsed participating decision and falls back to the most recent entry whose `decision` is `undefined`. Delegate decisions remain explicitly non-participating. This preserves pre-union behavior for non-paper-style providers without re-introducing the buggy treatment of `undefined` as participating in `isParticipatingDecision` itself.
- **Files modified:** `src/runtime/sequential.ts`
- **Commit:** `9eb01c5` (rolled into Task 1)

### Rule 2 — Missing critical functionality (auto-applied)

**2. Delegate budget validation extended beyond `timeoutMs`**

- **Found during:** Task 2 implementation.
- **Issue:** The plan only spelled out `decision.budget.timeoutMs` validation, but `BudgetCaps = Omit<Budget, "tier">` also includes `maxTokens` and `maxIterations`. Leaving them unchecked would let an agent shove arbitrary strings/negatives into a child run's budget shape and only fail downstream at child-run start.
- **Fix:** `parseDelegateBudget` validates all three numeric caps with the same non-negative-integer rule and rooted error paths (`decision.budget.maxTokens`, `decision.budget.maxIterations`).
- **Files modified:** `src/runtime/decisions.ts`
- **Commit:** `cbe509f`

### Out-of-scope (deferred)

- Re-exporting `AgentParticipation`/`AgentDecision` from `src/index.ts` — already in place (verified).
- `consumer-type-resolution-smoke.test.ts` failure is pre-existing on `main` (verified by stashing local changes); it is unrelated to this plan and is logged below.

## Authentication Gates

None.

## Public Surface Touched

| File | Status | Change |
|------|--------|--------|
| `src/types/events.ts` | modified | Replace `AgentDecision` interface with `ParticipateAgentDecision | DelegateAgentDecision` discriminated union; import `BudgetCaps`, `ProtocolName` |
| `src/types.ts` | modified | Re-export `ParticipateAgentDecision` and `DelegateAgentDecision` alongside `AgentDecision` |
| `src/runtime/decisions.ts` | modified | New delegate branch + validation; `parseAgentDecision` signature accepts optional context |
| `src/tests/public-api-type-inference.test.ts` | modified | Discriminated-union assertions for both branches |
| `src/tests/fixtures/consumer-type-resolution-smoke.ts` | modified | Literal includes `type: "participate" as const` |

`CHANGELOG.md` is intentionally untouched per the plan; Plan 05 owns the v0.4.0 entry.

## Deferred Issues

- **`src/tests/consumer-type-resolution-smoke.test.ts`** fails on `main` regardless of this plan: the test invokes `pnpm exec tsc` from `cwd: src/` (a non-package directory) and `pnpm` errors with `ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE`. The fixture itself typechecks cleanly when invoked directly. Out of scope for this plan; logged for a future infra fix.

## Threat Flags

None — this plan only added type/parser surface inside the existing model-output → parser trust boundary, which is already covered by the plan's STRIDE register (T-01-01..04). No new endpoints, no new file/network access, no schema changes outside the documented decision shape.

## Self-Check: PASSED

- `src/runtime/decisions.test.ts` — FOUND
- `src/runtime/decisions.ts` (delegate branch) — FOUND
- `src/types/events.ts` (discriminated union) — FOUND
- Commit `9eb01c5` — FOUND
- Commit `6f6d036` — FOUND
- Commit `cbe509f` — FOUND
