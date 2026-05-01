---
phase: 03-provider-locality-bounded-concurrency
verified: 2026-05-01T02:09:24Z
status: passed
score: 31/31 must-haves verified
overrides_applied: 0
---

# Phase 3: Provider Locality & Bounded Concurrency Verification Report

**Phase Goal:** Providers can declare local vs remote; coordinator runs delegated decisions in parallel up to a bound, auto-clamping to 1 when any local provider is in the active tree.
**Verified:** 2026-05-01T02:09:24Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `ConfiguredModelProvider` accepts optional provider locality; absent value is treated as remote for clamping; invalid value throws `DogpileError({ code: "invalid-configuration" })`. | VERIFIED | `src/types.ts` defines `metadata?.locality?: "local" \| "remote"` on `ConfiguredModelProvider`. `src/runtime/validation.ts` exports `validateProviderLocality`, and `src/runtime/engine.ts` calls it at reusable engine `run` and `stream` start. `config-validation.test.ts` covers invalid user providers. Clamp code only treats `metadata?.locality === "local"` as local, so absent metadata is not clamped. |
| 2 | `createOpenAICompatibleProvider` auto-sets local locality for local hosts and lets caller locality participate in resolution. | VERIFIED | `src/providers/openai-compatible.ts` exports pure `classifyHostLocality`, computes `detectedLocality`, and returns `metadata: { locality: resolvedLocality }`. Tests cover localhost, RFC1918, link-local, IPv6 loopback/ULA/link-local, `.local`, public hosts, explicit local, explicit remote public, and remote-on-local rejection with `detail.reason: "remote-override-on-local-host"`. |
| 3 | Coordinator fan-out executes at most `maxConcurrentChildren` in parallel and queues excess delegates. | VERIFIED | `src/runtime/decisions.ts` parses delegate arrays and decision-level `maxConcurrentChildren`. `src/runtime/coordinator.ts` normalizes decisions to an array, computes `effectiveForTurn`, uses `createSemaphore`, emits `sub-run-queued` only when `semaphore.inFlight >= effectiveForTurn`, and sorts child results by completion time before the next plan turn. `coordinator.test.ts` verifies bounded fan-out, queue counts, default 4, and completion ordering. |
| 4 | Any local provider in the active tree clamps child concurrency to 1 and emits one warning event with `reason: "local-provider-detected"`. | VERIFIED | `src/runtime/coordinator.ts` has closure-local `concurrencyClampEmitted`, `findFirstLocalProvider(options)`, pre-semaphore local-provider walk, `effectiveForTurn = 1`, and `sub-run-concurrency-clamped` event emission with `requestedMax`, `effectiveMax: 1`, `reason`, and `providerId`. Tests verify clamp max-in-flight is 1, event emits once per run, remote-only runs emit none, explicit high max is silently clamped, and parallel runs isolate the flag. |

**Score:** 31/31 truths verified

### Plan-Level Must-Haves

| Plan | Must-Haves | Status | Evidence |
|------|------------|--------|----------|
| 03-01 | 6/6 provider-locality truths | VERIFIED | Public provider metadata, auto-detection helper, asymmetric remote-on-local guard, invalid locality validation at construct time and engine run start, absent locality treated as remote, and pure exported classifier are present in code and covered by `openai-compatible.test.ts` plus `config-validation.test.ts`. |
| 03-02 | 13/13 bounded-dispatch truths | VERIFIED | Additive `parentDecisionArrayIndex`, three-level max concurrency, positive integer validation, delegate array parsing, cumulative dispatch cap, pressure-only queued events, semaphore implementation, sibling-failed synthetic failures, completion-order transcript assembly, replay determinism event identity, `streamHandle?: never` placeholder, colocated concurrency tests, and key public event contracts are present. |
| 03-03 | 8/8 local-clamp truths | VERIFIED | Per-dispatch active-provider walk, exactly-once per-run clamp emission, closure-local flag, `SubRunConcurrencyClampedEvent` payload, silent explicit override clamp, CHANGELOG inventory, replay decision literal, and local fan-out queued behavior are present and tested. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types.ts` | `ConfiguredModelProvider.metadata.locality`; config fields; public type exports | VERIFIED | `metadata?.locality` exists; `DogpileOptions`, `EngineOptions`, and `RunCallOptions` include `maxConcurrentChildren`; replay decision types are re-exported through public types. |
| `src/providers/openai-compatible.ts` | Host classifier, locality option validation, auto metadata assignment | VERIFIED | `classifyHostLocality` is exported and side-effect-free; `validateOptions` rejects invalid locality and remote-on-local; provider return object includes `metadata.locality`. |
| `src/runtime/validation.ts` | Runtime locality and max concurrency validation | VERIFIED | `validateProviderLocality` is exported; engine/run max concurrency validation uses positive integer checks. |
| `src/runtime/engine.ts` | Entry wiring for locality and effective max concurrency | VERIFIED | `validateProviderLocality` is called at run/stream start; `effectiveMaxConcurrentChildren` is resolved and passed into protocol execution. |
| `src/runtime/decisions.ts` | Delegate array parser and decision-level max concurrency | VERIFIED | `Array.isArray(parsed)` branch maps each delegate through validation; empty arrays and invalid decision max values throw typed invalid-configuration errors. |
| `src/runtime/coordinator.ts` | Semaphore fan-out, queue events, completion ordering, local clamp | VERIFIED | `createSemaphore`, `sub-run-queued`, sibling-failed synthetic failures, completion-time result sorting, `findFirstLocalProvider`, and `sub-run-concurrency-clamped` are wired into `runCoordinator`. |
| `src/runtime/defaults.ts`, `src/types/replay.ts` | Replay/default exhaustive coverage | VERIFIED | New event cases return replay budget no-ops, protocol decision payloads, `queue-sub-run`, and `mark-sub-run-concurrency-clamped`. |
| `src/types/events.ts` | Public event variants and additive sub-run identity | VERIFIED | `SubRunQueuedEvent`, `SubRunConcurrencyClampedEvent`, and `parentDecisionArrayIndex` on sub-run start/complete/fail events are in the `RunEvent` union. |
| Tests listed in phase prompt | Contract and scenario coverage | VERIFIED | Focused Vitest command passed: 6 files, 231 tests. Full orchestration evidence also reports `pnpm run verify` passed after review fixes. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `createOpenAICompatibleProvider` | `classifyHostLocality` | Direct call on parsed `baseURL.hostname` | WIRED | Used for both validation and returned `metadata.locality`. |
| `createEngine().run/stream` | `validateProviderLocality` | Import + run-start calls | WIRED | Invalid user-implemented provider locality fails before protocol execution. |
| `parseAgentDecision` | coordinator fan-out loop | Array return normalized in `runCoordinator` | WIRED | `runCoordinator` handles `DelegateAgentDecision[]` and computes fan-out dispatch. |
| `runCoordinator` | `createSemaphore` | Per-turn acquire/release around `dispatchDelegate` | WIRED | Queue event emission and semaphore slots bound actual child starts. |
| `runCoordinator` | `SubRunQueuedEvent` and `SubRunConcurrencyClampedEvent` | Parent trace emit + replay protocol decision record | WIRED | Both events are emitted through `emit` and `recordProtocolDecision`. |
| `defaults.ts` | replay protocol decision types | Exhaustive event switches | WIRED | New event variants are accepted by replay/default machinery. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/providers/openai-compatible.ts` | `resolvedLocality` | `options.locality` plus `classifyHostLocality(baseURL.hostname)` | Yes | FLOWING |
| `src/runtime/engine.ts` | `effectiveMaxConcurrentChildren` | Engine option default 4 lowered by run option | Yes | FLOWING |
| `src/runtime/decisions.ts` | `delegate.maxConcurrentChildren` | Parsed fenced JSON delegate object/array | Yes | FLOWING |
| `src/runtime/coordinator.ts` | `effectiveForTurn` | Engine/run effective value lowered by decision max and local-provider clamp | Yes | FLOWING |
| `src/runtime/coordinator.ts` | `concurrencyClampEmitted` | Per-run closure-local boolean | Yes | FLOWING |
| `src/runtime/defaults.ts` | Replay protocol decision | `RunEvent.type` exhaustive switch | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Focused Phase 3 provider, coordinator, event, result, config, and cancellation contracts | `pnpm exec vitest run src/providers/openai-compatible.test.ts src/runtime/coordinator.test.ts src/tests/event-schema.test.ts src/tests/result-contract.test.ts src/tests/config-validation.test.ts src/tests/cancellation-contract.test.ts` | 6 files passed; 231 tests passed | PASS |
| Release-quality gate | Orchestration evidence: `pnpm run verify` | Passed package identity, build, artifacts, packed consumer smoke, typecheck, and full Vitest suite | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROVIDER-01 | 03-01 | Provider accepts optional local/remote locality; absent treated remote for clamping. | SATISFIED | `ConfiguredModelProvider.metadata.locality` exists; coordinator only clamps on exact `"local"`. |
| PROVIDER-02 | 03-01 | OpenAI-compatible provider auto-sets local for local hosts; caller override supported. | SATISFIED | Classifier and adapter metadata assignment exist; tests cover local, remote, explicit local, explicit remote public, and safety rejection for remote-on-local. |
| PROVIDER-03 | 03-01 | Invalid locality throws invalid-configuration. | SATISFIED | Adapter `validateOptions` and runtime `validateProviderLocality` throw `DogpileError` with invalid-configuration; config tests cover both paths. |
| CONCURRENCY-01 | 03-02 | `maxConcurrentChildren` default 4 bounds parallel delegate execution and queues the rest. | SATISFIED | Engine/run/decision max values are validated and lowered; coordinator semaphore limits starts; tests verify queueing and default 4 behavior. |
| CONCURRENCY-02 | 03-03 | Any local provider clamps concurrency to 1 and emits clamp warning event. | SATISFIED | Active-provider walk, closure-local single emit, event type, replay handling, and tests for local/remote/parallel isolation are present. |

No Phase 3 orphaned requirements found in `.planning/REQUIREMENTS.md`; the five requested IDs are mapped to Phase 3 and claimed by plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/runtime/engine.ts`, `src/runtime/defaults.ts`, tests | various | Empty cleanup callbacks, replay `return []`, fixture no-op callbacks | INFO | Not stubs. These are cleanup defaults, replay no-op cases for non-budget events, or test fixtures. |
| `src/types/events.ts` | docs example | `console.log` in JSDoc | INFO | Documentation example only; not runtime behavior. |

### Human Verification Required

None. This phase is SDK/runtime behavior with automated unit and contract coverage; no visual or external-service behavior remains for manual verification.

### Gaps Summary

No blocking gaps found. The phase goal is achieved in the codebase: provider locality is represented and validated, OpenAI-compatible providers detect local hosts, delegate fan-out is bounded and queued, and local providers clamp child concurrency to 1 with a replayable warning event.

---

_Verified: 2026-05-01T02:09:24Z_
_Verifier: the agent (gsd-verifier)_
