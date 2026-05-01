---
phase: 04-streaming-child-error-escalation
reviewed: 2026-05-01T14:43:24Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - src/types/events.ts
  - src/types.ts
  - src/index.ts
  - src/runtime/coordinator.ts
  - src/runtime/engine.ts
  - src/runtime/cancellation.ts
  - src/runtime/validation.ts
  - src/runtime/defaults.ts
  - src/providers/openai-compatible.ts
  - src/tests/event-schema.test.ts
  - src/tests/result-contract.test.ts
  - src/tests/streaming-api.test.ts
  - src/tests/cancellation-contract.test.ts
  - src/tests/budget-first-stop.test.ts
  - src/tests/run-bad-input.test.ts
  - src/runtime/coordinator.test.ts
  - src/tests/config-validation.test.ts
  - src/tests/public-error-api.test.ts
  - CHANGELOG.md
findings:
  critical: 5
  warning: 0
  info: 0
  total: 5
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-05-01T14:43:24Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 04 has multiple blocking behavioral regressions in the exact areas under review: child-failure continuation, live stream event bubbling, cancellation error shape, terminal throw precedence, and provider timeout classification. Several tests currently lock the wrong behavior or only cover the multi-child happy variant, so the defects can pass the focused suite.

## Critical Issues

### CR-01: `onChildFailure: "continue"` still throws on a single child failure

**File:** `src/runtime/coordinator.ts:576`

**Issue:** The dispatch task rethrows any single-delegate child failure before the coordinator can build `currentWaveFailures`, render the structured failure roster, or ask the coordinator for a retry/redirect decision. This violates ERROR-01 and D-09: default `"continue"` should re-issue the plan turn after every real child failure. The existing continue-mode tests only use two delegates, so they miss the common single-child retry case.

**Fix:**
```typescript
// Only fail fast for explicit abort mode. Default continue should collect
// the failed child result and proceed to the next plan turn.
if (delegates.length === 1 && options.onChildFailure === "abort") {
  throw error;
}
```

Also remove or gate the later single-delegate `firstRejected` throw the same way, and add a test where one delegated child fails, `onChildFailure` is omitted, and the second plan request contains `## Sub-run failures since last decision`.

### CR-02: Child `final` events are silently dropped from parent streams

**File:** `src/runtime/engine.ts:266`

**Issue:** The stream callback treats every `event.type === "final"` as the parent final and withholds it. Bubbled child final events also use `type: "final"` and arrive through this callback with a different `runId` and `parentRunIds`, so they are stored in `pendingFinalEvent` instead of being published. This breaks STREAM-01's "every child lifecycle/output event" bubbling contract and makes replayStream/live-stream parity diverge.

**Fix:**
```typescript
lastRunId = event.runId;
if (event.type === "final" && event.runId === baseResult.trace.runId) {
  pendingFinalEvent = event;
  return;
}
publish(event);
```

Because `baseResult` is not available inside the callback before `runProtocol` resolves, capture the top-level run id from the first root event or pass the root run id through the stream execution context. Add a streaming test that a delegated child's `final` event is emitted with `parentRunIds`.

### CR-03: `StreamHandle.cancel()` rejects with an aborted error that lacks `detail.reason`

**File:** `src/runtime/engine.ts:1132`

**Issue:** `createStreamCancellationError()` sets `detail: { status: "cancelled" }`, but the Phase 2/4 public cancellation vocabulary requires `code: "aborted"` errors caused by explicit parent cancellation to carry `detail.reason: "parent-aborted"`. `src/tests/public-error-api.test.ts:330` currently asserts the status-only shape, locking the wrong public contract. Consumers switching on `detail.reason` cannot distinguish explicit parent aborts from other aborts on `handle.result`.

**Fix:**
```typescript
detail: {
  status: "cancelled",
  reason: "parent-aborted"
}
```

Update the cancel-wins test to require `detail.reason === "parent-aborted"` while still confirming the cancel error wins over child failures.

### CR-04: Handled child failures can be re-thrown after successful final synthesis if a termination record is present

**File:** `src/runtime/engine.ts:963`

**Issue:** `resolveRuntimeTerminalThrow()` rethrows the last real child failure whenever the last event is `final` with any `termination`. That is broader than D-12: a coordinator that emits a successful final synthesis should not re-throw handled child failures. If a failure was handled in a follow-up plan and final synthesis runs, but `stopIfNeeded()` attaches budget/max-iteration termination metadata after synthesis, this code still throws the old child failure.

**Fix:**
```typescript
const finalEvent = trace.events.at(-1);
if (finalEvent?.type !== "final") return null;
if (finalEvent.termination === undefined) return null;
if (finalEvent.transcript.entryCount > lastRealFailureTranscriptIndex) return null;
return findLastRealFailure(trace.events, failureInstancesByChildRunId);
```

The exact guard can use an explicit runtime flag instead, but it must distinguish fallback terminal finals from genuine final-synthesis success. Add a regression test with a handled child failure, successful final synthesis, and a budget/maxIterations termination record.

### CR-05: HTTP 408/504 with non-JSON bodies are misclassified before timeout mapping

**File:** `src/providers/openai-compatible.ts:109`

**Issue:** The adapter parses JSON before checking `response.ok`. A 408/504 response with an empty or HTML body throws `provider-invalid-response` from `readJson()` instead of the required `provider-timeout` with `detail.source: "provider"`. Gateways commonly return non-JSON 504 pages, so ERROR-03's HTTP timeout discriminator is not reliable.

**Fix:**
```typescript
const payload = await readJsonLenient(response, providerId);
if (!response.ok) {
  throw createProviderError(response, payload, providerId);
}
```

For non-OK responses, tolerate JSON parse failure and pass `undefined`/text metadata into `createProviderError`; keep strict JSON parsing for successful responses. Add a 504 non-JSON response test that expects `code: "provider-timeout"` and `detail.source: "provider"`.

---

_Reviewed: 2026-05-01T14:43:24Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
