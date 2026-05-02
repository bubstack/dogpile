---
phase: 06-provenance-annotations
verified: 2026-05-01T19:07:48Z
status: passed
score: "16/16 must-haves verified"
overrides_applied: 0
---

# Phase 6: Provenance Annotations Verification Report

**Phase Goal:** Every model request and response event in a completed trace carries structured provenance metadata (model id, provider id, call id, ISO-8601 timestamps), and that metadata is JSON-serializable and replay-stable.
**Verified:** 2026-05-01T19:07:48Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

Phase 6 is achieved. The implementation now has concrete type contracts, live event emission around every provider call through the shared model boundary, replay/replayStream parity, a public provenance helper, package export wiring, frozen shape coverage, and release-facing documentation.

Roadmap success criterion 1 is interpreted through the phase's locked D-07/D-08 shape: `model-request` carries the request-side timestamp (`startedAt`), while the paired `model-response` carries both `startedAt` and `completedAt`; the pair is joined by `callId`, and `trace.providerCalls` carries the complete start/end pair.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `ModelRequestEvent` has request-side provenance fields and no legacy `at` field. | VERIFIED | `src/types/events.ts:67-87` defines `startedAt`, `callId`, `providerId`, `modelId`, `agentId`, `role`, and `request`; no `at` exists on this interface. |
| 2 | `ModelResponseEvent` has response-side provenance fields and no legacy `at` field. | VERIFIED | `src/types/events.ts:99-121` defines `startedAt`, `completedAt`, `callId`, `providerId`, `modelId`, `agentId`, `role`, and `response`; no `at` exists on this interface. |
| 3 | `ReplayTraceProviderCall` records model id and start/end timestamps. | VERIFIED | `src/types/replay.ts:177-197` includes non-optional `modelId`, `startedAt`, and `completedAt`. |
| 4 | `ConfiguredModelProvider` can expose a concrete model id and otherwise falls back safely. | VERIFIED | `src/types.ts:884-890` adds optional `modelId`; `src/runtime/model.ts:26-28` resolves `options.model.modelId ?? options.model.id`. |
| 5 | Runtime emits `model-request` immediately before provider execution. | VERIFIED | `src/runtime/model.ts:25-48` captures `startedAt`, snapshots the request, emits `model-request`, then calls `generate()`. |
| 6 | Runtime emits `model-response` immediately after provider completion and records matching providerCalls. | VERIFIED | `src/runtime/model.ts:107-140` captures one `completedAt`, emits `model-response`, then writes a `ReplayTraceProviderCall` with the same `modelId`, `startedAt`, and `completedAt`. |
| 7 | All four first-party protocols route model calls through the shared provenance-emitting boundary. | VERIFIED | `sequential`, `broadcast`, `shared`, and both coordinator turn paths call `generateModelTurn()` and pass their `emit` + provider-call sinks. |
| 8 | Completed traces contain one request/response provenance pair per provider call. | VERIFIED | Custom spot-check passed for `sequential`, `shared`, `broadcast`, and `coordinator`: each trace had exactly two provenance events per provider call. |
| 9 | Provenance fields are real data, not hardcoded placeholders. | VERIFIED | `modelId` comes from provider configuration or provider id fallback; `callId` comes from protocol provider-call id generation; timestamps come from `new Date().toISOString()`. |
| 10 | Provenance request snapshots are stable against provider mutation. | VERIFIED | `src/runtime/model.ts:143-148` clones messages and JSON-round-trips metadata; `src/runtime/sequential.test.ts:115-146` verifies a mutating provider cannot rewrite request provenance. |
| 11 | `replay()` preserves current live provenance event order and fields. | VERIFIED | `src/runtime/engine.ts:921-939` builds replay event logs with `synthesizeProviderEvents`; `src/runtime/engine.ts:970-975` returns stored live provenance events unchanged when present. |
| 12 | `replay()` and `replayStream()` synthesize legacy provenance from `trace.providerCalls`. | VERIFIED | `src/runtime/engine.ts:977-1017` synthesizes request/response events from provider calls; `src/runtime/engine.ts:1169-1177` uses the same sequence for replay streams. |
| 13 | JSON round-trip stability is covered for traces, results, providerCalls, provenance helper output, and live/replayed provenance events. | VERIFIED | `src/tests/result-contract.test.ts` and `src/runtime/provenance.test.ts` assert `JSON.stringify -> JSON.parse` equality for the relevant shapes. |
| 14 | Caller-facing provenance helper is implemented and exported. | VERIFIED | `src/runtime/provenance.ts:1-43` exports `getProvenance`, `ProvenanceRecord`, and `PartialProvenanceRecord`; `package.json:73-76` exposes `./runtime/provenance`. |
| 15 | Frozen fixture protects the public provenance event shape. | VERIFIED | `src/tests/provenance-shape.test.ts` reads `src/tests/fixtures/provenance-event-v1.json`, compares keys and value types, and no longer self-heals by writing missing fixtures. |
| 16 | Public-surface lockstep documentation is present. | VERIFIED | `CHANGELOG.md:3-27` documents v0.5.0 provenance changes; `CLAUDE.md` names the new model event shape and frozen fixture gate. |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/types/events.ts` | Updated `ModelRequestEvent` and `ModelResponseEvent` shapes | VERIFIED | Request has `startedAt`/`modelId`; response has `startedAt`/`completedAt`/`modelId`; no `at` on either. |
| `src/types/replay.ts` | `ReplayTraceProviderCall.modelId` plus timestamps | VERIFIED | Non-optional model id and start/end timestamps are part of replay call records. |
| `src/types.ts` | Optional provider `modelId?` | VERIFIED | Public provider contract supports model id while preserving fallback behavior. |
| `src/runtime/model.ts` | Live event emission and provider-call recording | VERIFIED | Single shared path emits and records provenance for streaming and non-streaming providers. |
| `src/runtime/engine.ts` | Replay and replayStream provenance handling | VERIFIED | Current traces preserve event order; legacy traces synthesize from providerCalls. |
| `src/runtime/provenance.ts` | Public helper and types | VERIFIED | Pure TypeScript module with type-only imports and overload-safe return shapes. |
| `package.json` | `/runtime/provenance` export and source allowlist | VERIFIED | Export, dist paths, and `src/runtime/provenance.ts` files entry are present. |
| `src/tests/package-exports.test.ts` | Public export contract updated | VERIFIED | Test includes `./runtime/provenance` and source allowlist expectations. |
| `src/tests/event-schema.test.ts` | Event shape and live event contract | VERIFIED | Asserts model provenance event shapes, JSON stability, and event ordering. |
| `src/tests/result-contract.test.ts` | Result/replay/providerCall contract | VERIFIED | Asserts providerCall model ids, replay provenance field equality, and replayStream parity. |
| `src/tests/provenance-shape.test.ts` | Frozen shape contract | VERIFIED | Fails on missing/changed fixture shape rather than regenerating it silently. |
| `src/tests/fixtures/provenance-event-v1.json` | Frozen provenance event example | VERIFIED | JSON array contains one `model-request` and one `model-response` with required fields. |
| `CHANGELOG.md` and `CLAUDE.md` | Public-surface documentation | VERIFIED | Changelog and invariant docs describe event shape, migration notes, and fixture gate. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Protocols | `src/runtime/model.ts` | Calls to `generateModelTurn()` | WIRED | `sequential`, `broadcast`, `shared`, and coordinator paths all call the same model boundary and pass `emit`. |
| `src/runtime/model.ts` | Completed trace events | Protocol `emit` functions push to local `events` arrays | WIRED | Each protocol returns `eventLog` and `trace.events` from the same event array. |
| Provider adapters | Runtime provenance | `ConfiguredModelProvider.modelId` | WIRED | OpenAI-compatible uses `options.model`; Vercel AI uses string model or `LanguageModel.modelId`; custom providers fall back to provider id. |
| Provider calls | Replay event log | `synthesizeProviderEvents(trace, trace.providerCalls)` | WIRED | Replay uses providerCalls as the canonical anchor for legacy traces and preserves live traces with provenance already present. |
| Public helper | Package consumers | `package.json` export + package export test | WIRED | `@dogpile/sdk/runtime/provenance` resolves to built JS and declaration artifacts. |
| Fixture | Shape contract | `provenance-shape.test.ts` read/compare | WIRED | Test compares live provenance event keys/types to the committed fixture. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `src/runtime/model.ts` | `modelId` | `options.model.modelId ?? options.model.id` | Yes | FLOWING |
| `src/runtime/model.ts` | `startedAt` | `new Date().toISOString()` before provider call | Yes | FLOWING |
| `src/runtime/model.ts` | `completedAt` | One `new Date().toISOString()` after provider call | Yes | FLOWING |
| `src/runtime/model.ts` | `callId` | Protocol provider-call id generation | Yes | FLOWING |
| `src/runtime/model.ts` | request snapshot | Cloned `ModelRequest` before provider call | Yes | FLOWING |
| `src/runtime/engine.ts` | replay provenance events | `trace.providerCalls` or stored live `trace.events` | Yes | FLOWING |
| `src/runtime/provenance.ts` | normalized records | Event fields from `ModelRequestEvent` / `ModelResponseEvent` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Type system accepts provenance contracts | `pnpm run typecheck` | Exit 0 | PASS |
| Focused provenance/runtime/contract suites | `pnpm vitest run src/runtime/sequential.test.ts src/runtime/provenance.test.ts src/tests/event-schema.test.ts src/tests/result-contract.test.ts src/tests/provenance-shape.test.ts` | 5 files passed, 57 tests passed | PASS |
| All four protocols preserve provenance through JSON and replay | `npx --yes tsx --eval '...'` spot-check | `provenance spot-check passed for all four protocols` | PASS |
| Full suite | `pnpm run test` | 47 files passed, 660 tests passed, 1 skipped | PASS |
| Publishable package surface | `pnpm run pack:check` | Artifact check, consumer smoke, sourcemap check, and npm dry-run passed; tarball includes `dist/runtime/provenance.*` and `src/runtime/provenance.ts` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PROV-01 | 06-01 through 06-06 | Caller can read provenance metadata on model request/response events in a completed trace. | SATISFIED | Event types, runtime emission, adapter model ids, `getProvenance()`, and all-protocol spot-check verify readable `modelId`, `providerId`, `callId`, and timestamps. |
| PROV-02 | 06-01, 06-02, 06-05, 06-06 | Provenance fields are JSON-serializable and survive `replay()`. | SATISFIED | Result contract tests and spot-check serialize traces through JSON, replay them, and compare provenance fields against originals/providerCalls. |

No orphaned Phase 6 requirements were found in `.planning/REQUIREMENTS.md`; only PROV-01 and PROV-02 map to Phase 6.

### Review Fix Regression Checks

| Review Item | Status | Evidence |
|---|---|---|
| CR-01 replay rewrote current provenance order | VERIFIED FIXED | `synthesizeProviderEvents()` returns `trace.events` unchanged when live provenance exists. |
| CR-02 response timestamps used `startedAt` instead of `completedAt` | VERIFIED FIXED | `eventTimestamp()` in runtime/defaults and related display helpers returns `completedAt` for `model-response`. |
| WR-01 replayStream omitted legacy provenance | VERIFIED FIXED | `replayStreamEvents()` iterates over `synthesizeProviderEvents()`. |
| WR-02 request snapshots were mutable | VERIFIED FIXED | `requestForTrace()` clones messages and metadata; sequential test covers provider mutation. |
| WR-03 fixture test self-healed missing fixture | VERIFIED FIXED | `provenance-shape.test.ts` imports only `readFile`; no write path remains. |
| WR-04 changelog/package version mismatch | NON-BLOCKING | Package identity remains 0.4.0 and `pack:check` passes; Phase 6 explicitly required a v0.5.0 changelog entry, while release identity bumps are handled by the release workflow. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| None blocking | - | Stub/TODO/placeholder scan produced only legitimate helper returns and example/test `console.log` strings. | None | No phase-goal impact. |

### Human Verification Required

None. This phase is type/runtime/test/package-contract work with no visual or external-service behavior requiring human UAT.

### Gaps Summary

No gaps found. All roadmap success criteria and merged plan must-haves are verified against the codebase, tests, and package artifacts.

---

_Verified: 2026-05-01T19:07:48Z_
_Verifier: the agent (gsd-verifier)_
