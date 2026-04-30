---
phase: 01-delegate-decision-sub-run-traces
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types/events.ts
  - src/runtime/decisions.ts
  - src/runtime/sequential.ts
  - src/runtime/sequential.test.ts
  - src/runtime/broadcast.test.ts
  - src/tests/public-api-type-inference.test.ts
  - src/tests/fixtures/consumer-type-resolution-smoke.ts
  - src/runtime/decisions.test.ts
autonomous: true
requirements: [DELEGATE-01, DELEGATE-03]
status: ready
must_haves:
  truths:
    - "AgentDecision is a discriminated union with required `type: 'participate' | 'delegate'`."
    - "parseAgentDecision returns a delegate decision when a fenced `delegate:` JSON block is present."
    - "Invalid delegate payloads (unknown protocol, missing intent, bad JSON, model id mismatch) throw DogpileError({ code: 'invalid-configuration', detail.path })."
    - "isParticipatingDecision narrows on `decision.type === 'participate'` first; participate branch preserves all four paper-style fields verbatim."
    - "Parser/type design accepts a delegate array shape forward (Phase 3) but Phase 1 emits/handles single only."
  artifacts:
    - path: "src/types/events.ts"
      provides: "AgentDecision discriminated union (ParticipateAgentDecision | DelegateAgentDecision)"
      contains: "type: \"participate\""
    - path: "src/runtime/decisions.ts"
      provides: "parseAgentDecision with delegate branch + delegate validation"
      contains: "delegate"
    - path: "src/runtime/decisions.test.ts"
      provides: "Unit tests for participate parsing, delegate parsing, and validation errors"
  key_links:
    - from: "src/runtime/sequential.ts"
      to: "src/runtime/decisions.ts isParticipatingDecision"
      via: "narrow on decision.type === 'participate'"
      pattern: "decision.type"
---

<objective>
Replace `AgentDecision` with a discriminated union and extend the paper-style parser with a fenced-JSON `delegate:` branch. Lock the new type shape across consumer-facing test fixtures.

Purpose: Establishes the foundational parser + type contract that every other Phase 1 plan builds on. No coordinator dispatch yet — only parse, validate, and narrow.
Output: Updated types, parser, narrow helper, and lock-step test fixtures. New `decisions.test.ts` covering parser + validation.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-CONTEXT.md
@.planning/phases/01-delegate-decision-sub-run-traces/01-RESEARCH.md
@CLAUDE.md
@src/types/events.ts
@src/runtime/decisions.ts
@src/runtime/sequential.ts
@src/tests/public-api-type-inference.test.ts
@src/tests/fixtures/consumer-type-resolution-smoke.ts

<interfaces>
<!-- Current AgentDecision (src/types/events.ts:214-223) — replace with discriminated union below -->
Current shape (paper-style flat object):
```ts
export interface AgentDecision {
  readonly selectedRole: string;
  readonly participation: AgentParticipation;
  readonly rationale: string;
  readonly contribution: string;
}
```

Target shape (locked by D-01 + RESEARCH §3):
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
  readonly protocol: ProtocolName; // "sequential" | "broadcast" | "shared" | "coordinator"
  readonly intent: string;
  readonly model?: string;
  readonly budget?: BudgetCaps;
}
```

Existing helper (src/runtime/decisions.ts:21):
```ts
export function isParticipatingDecision(decision: AgentDecision | undefined): boolean;
```
Must narrow on `decision?.type === "participate"` before reading `participation`.

Existing invalidConfiguration helper (src/runtime/validation.ts:755-768):
```ts
throw new DogpileError({
  code: "invalid-configuration",
  message: `Invalid Dogpile configuration at ${path}: ${message}`,
  retryable: false,
  detail: { kind: "configuration-validation", path, rule, expected, received }
});
```
For delegate parse errors use `detail.kind: "delegate-validation"` and `detail.path: "decision.protocol" | "decision.intent" | "decision.budget.timeoutMs" | "decision.model"` per D-15.

Fenced-JSON convention (per RESEARCH §2 verdict):
```
role_selected: <role>
participation: contribute | abstain
rationale: <text>
delegate:
```json
{ "protocol": "sequential", "intent": "...", "model": "...", "budget": { "timeoutMs": 30000 } }
```
contribution:
<text>
```
If a `delegate:` fenced JSON block is present, return DelegateAgentDecision; otherwise return ParticipateAgentDecision.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Replace AgentDecision with discriminated union; update consumers + lock fixtures</name>
  <files>src/types/events.ts, src/runtime/decisions.ts, src/runtime/sequential.ts, src/runtime/sequential.test.ts, src/runtime/broadcast.test.ts, src/tests/public-api-type-inference.test.ts, src/tests/fixtures/consumer-type-resolution-smoke.ts</files>
  <behavior>
    - `AgentDecision` is exported from `src/types/events.ts` as a discriminated union (`ParticipateAgentDecision | DelegateAgentDecision`) with required `type` discriminant.
    - `ParticipateAgentDecision` preserves the four existing fields verbatim (`selectedRole`, `participation`, `rationale`, `contribution`).
    - `DelegateAgentDecision` has `protocol`, `intent`, optional `model`, optional `budget`.
    - `isParticipatingDecision(d)` returns `false` when `d?.type !== "participate"` (delegate decisions are non-participating); when `type === "participate"`, returns `d.participation !== "abstain"`.
    - `TurnEvent.decision` and `BroadcastContribution.decision` (events.ts L270, L299) accept the new union without runtime change.
    - All existing test fixtures updated to include `type: "participate"` literal.
    - `public-api-type-inference.test.ts:279-281` asserts via `Extract<AgentDecision, { type: "participate" }>["participation"]` (or equivalent narrow).
    - `consumer-type-resolution-smoke.ts:58-65` literal includes `type: "participate" as const`.
  </behavior>
  <action>
    Per D-01 + RESEARCH §3:

    1. **`src/types/events.ts`**: Replace `AgentDecision` interface (L214) with the union + the two member interfaces from `<interfaces>` above. Keep all four participate fields `readonly`. Import `ProtocolName` (already available via `src/types/events.ts` re-exports of `src/types.ts`) and `BudgetCaps` for delegate. Verify `RunEvent` payloads referencing `AgentDecision` (L270 `TurnEvent`, L299 `BroadcastContribution`) compile unchanged.
    2. **`src/runtime/decisions.ts`**: Update `isParticipatingDecision` (L21) to narrow on `decision?.type === "participate"` before reading `participation`. Delegate decisions return `false`. Update `parseAgentDecision` (L3) return-type-only to `AgentDecision | undefined` and have the existing paper-style branch construct `{ type: "participate", selectedRole, participation, rationale, contribution }`. (Delegate parse branch lands in Task 2.)
    3. **`src/runtime/sequential.ts`**: At L221, `isParticipatingDecision(entry.decision)` requires no source change — the helper already narrows. Verify no other reads of `decision.participation`/`decision.selectedRole` exist via grep; if any, narrow first.
    4. **`src/runtime/sequential.test.ts` (L113-126) and `src/runtime/broadcast.test.ts` (L114-162)**: Add `type: "participate"` to every literal `AgentDecision` fixture.
    5. **`src/tests/public-api-type-inference.test.ts` (L279-281)**: Replace direct `AgentDecision["participation"]` assertions with `Extract<AgentDecision, { type: "participate" }>["participation"]` and add an assertion that `Extract<AgentDecision, { type: "delegate" }>["protocol"]` is `ProtocolName`.
    6. **`src/tests/fixtures/consumer-type-resolution-smoke.ts` (L58-65)**: Add `type: "participate" as const` to the literal.

    Do NOT update `coordinator.ts`/`broadcast.ts`/`shared.ts` source — RESEARCH §3 confirms they store but never read decision fields. (If grep reveals otherwise, narrow at the read site.)
  </action>
  <verify>
    <automated>pnpm vitest run src/runtime/sequential.test.ts src/runtime/broadcast.test.ts src/tests/public-api-type-inference.test.ts &amp;&amp; pnpm run typecheck</automated>
  </verify>
  <done>Discriminated union compiles; existing test fixtures pass with `type: "participate"`; type-inference test asserts both union branches; `pnpm run typecheck` clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add fenced-JSON delegate branch to parseAgentDecision + validation; new decisions.test.ts</name>
  <files>src/runtime/decisions.ts, src/runtime/decisions.test.ts</files>
  <behavior>
    - When the agent output contains a `delegate:` line followed by a fenced ```json``` block, `parseAgentDecision` returns `{ type: "delegate", protocol, intent, model?, budget? }`.
    - The function signature accepts an optional context arg `{ currentDepth?: number; maxDepth?: number; parentProviderId?: string }` for use by Plan 04 (depth) and the model-id check (D-11). Phase 1 dispatcher passes context; existing call sites without context still work (defaults).
    - Validation rules (each throws `DogpileError({ code: "invalid-configuration", detail: { kind: "delegate-validation", path, expected, received } })`):
      - `protocol` not in `["sequential", "broadcast", "shared", "coordinator"]` → `path: "decision.protocol"`.
      - `intent` missing or empty → `path: "decision.intent"`.
      - JSON inside the fenced block fails to parse → `path: "decision"`, message includes the parse error.
      - `model` present and `parentProviderId` present and `model !== parentProviderId` → `path: "decision.model"` (D-11).
      - `budget.timeoutMs` present and not a non-negative integer → `path: "decision.budget.timeoutMs"`.
    - If a `delegate:` block is present, the participate branch is NOT also returned (one decision per turn — D-03). Any `contribution:` text in the same output is ignored at parse time (logged-internally is fine).
    - Parser is structured so a future array-of-delegates JSON shape can be added without re-architecting (D-03 forward-compat). Phase 1 only accepts a single object; arrays throw `path: "decision"` with `expected: "single delegate object (array support reserved for Phase 3)"`.
    - Falsy/absent delegate block → existing participate branch.
  </behavior>
  <action>
    1. Add `matchDelegateBlock(output: string): string | undefined` that locates `^delegate:\s*$` (multiline, case-insensitive) followed by a fenced ```json ... ``` block and returns the raw JSON string. Tolerate either ```json or ``` (no language tag). Use a single regex with the `m` and `i` flags; do NOT `eval`.
    2. Add `parseDelegateDecision(jsonText: string, context: { parentProviderId?: string }): DelegateAgentDecision` that:
       - `JSON.parse` (catch SyntaxError → throw `invalid-configuration` with `detail.path: "decision"`).
       - Reject arrays at top level with the reserved-for-Phase-3 message above.
       - Validate `protocol` (whitelist of four protocol names — derive from `ProtocolName` literals).
       - Validate `intent` (string, non-empty after trim).
       - Validate optional `model` (string, must equal `parentProviderId` if both set).
       - Validate optional `budget` (object with optional `timeoutMs: non-negative integer`; reuse `validation.ts:validateOptionalNonNegativeInteger` if usable, otherwise inline check matching its error shape).
       - Return the validated `DelegateAgentDecision` literal with `type: "delegate"`.
    3. Update `parseAgentDecision(output: string, context?: { parentProviderId?: string }): AgentDecision | undefined` to call `matchDelegateBlock` first; if present, return `parseDelegateDecision(...)` and skip paper-style parsing. Otherwise fall through to the existing paper-style branch returning `{ type: "participate", ... }`.
    4. Create `src/runtime/decisions.test.ts` covering:
       - happy-path participate (existing paper-style output → participate branch with all four fields).
       - happy-path delegate single (fenced JSON with all four fields → delegate branch).
       - delegate without optional fields (only `protocol` + `intent`).
       - invalid protocol → throws with `detail.path === "decision.protocol"`.
       - missing intent → throws with `detail.path === "decision.intent"`.
       - malformed JSON → throws with `detail.path === "decision"` and a useful message.
       - top-level array → throws with reserved-for-Phase-3 message.
       - `model` mismatch with `parentProviderId` → throws with `detail.path === "decision.model"`.
       - `budget.timeoutMs` negative → throws with `detail.path === "decision.budget.timeoutMs"`.
       - `isParticipatingDecision` returns `false` for a delegate decision and `false` for an undefined decision; `true` for `participation: "contribute"` participate.

    Use `expect(...).toThrowError(DogpileError)` and assert `error.code` and `error.detail.path` after the throw via try/catch + property checks.
  </action>
  <verify>
    <automated>pnpm vitest run src/runtime/decisions.test.ts</automated>
  </verify>
  <done>All 9+ test cases pass; parser handles both branches; validation errors carry rooted `decision.*` paths.</done>
</task>

</tasks>

<public_surface_impact>
- `src/tests/event-schema.test.ts`: NOT touched in this plan (events untouched). Plan 02 owns it.
- `src/tests/result-contract.test.ts`: NOT touched here (result shape untouched). Plan 02/05 own it.
- `src/tests/public-api-type-inference.test.ts`: UPDATED for the discriminated union.
- `src/tests/fixtures/consumer-type-resolution-smoke.ts`: UPDATED.
- `src/tests/package-exports.test.ts`: NOT touched (no new exports — `AgentDecision`, `ParticipateAgentDecision`, `DelegateAgentDecision` are types and flow through existing `events.ts` re-exports; verify the consumer smoke compiles).
- `package.json` `exports`/`files`: NO change (no new subpath).
- `CHANGELOG.md`: deferred to Plan 05 (single coherent v0.4.0 entry written once at the end of Phase 1). This plan adds no entry.
</public_surface_impact>

<verification>
- `pnpm vitest run src/runtime/decisions.test.ts src/runtime/sequential.test.ts src/runtime/broadcast.test.ts src/tests/public-api-type-inference.test.ts`
- `pnpm run typecheck`
- Spot grep: `grep -rn "AgentDecision\b" src/ | grep -v -E '\.test\.ts|\.md|fixtures'` should show zero unguarded reads of `selectedRole`/`participation`/`rationale`/`contribution` outside `decisions.ts`/`sequential.ts:221`/`isParticipatingDecision`.
</verification>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| model output → parser | Untrusted text/JSON enters `parseAgentDecision`; must not trigger code execution or unbounded recursion. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering / Information Disclosure | `parseAgentDecision` JSON parsing | mitigate | Use `JSON.parse` (no `eval`/`Function`). Catch `SyntaxError` and re-throw as `DogpileError(invalid-configuration)` with bounded message; never include the raw string verbatim if length > 200 chars. |
| T-01-02 | Denial of Service | Regex matching `delegate:` block on adversarial input | mitigate | Use a non-backtracking regex with explicit flags; cap input length scanned (already bounded by model output token limit upstream — accept). |
| T-01-03 | Elevation of Privilege | Delegate `model` field overriding parent provider | mitigate | D-11: reject mismatched model id with `detail.path: "decision.model"` before any dispatch can occur (Plan 03 enforces dispatch-time again). |
| T-01-04 | Spoofing | Agent forging participate fields when delegate present | mitigate | D-03 strict: if `delegate:` block present, parser returns delegate branch only — `contribution:` text is ignored, preventing dual-shape ambiguity. |
</threat_model>

<success_criteria>
- `AgentDecision` is a discriminated union; both branches type-check from a consumer perspective.
- `parseAgentDecision` returns `delegate` for valid fenced-JSON output, `participate` otherwise.
- All 9+ unit tests in `decisions.test.ts` pass.
- All updated lock-step fixtures pass.
- `pnpm run typecheck` clean across the repo.
</success_criteria>

<output>
After completion, create `.planning/phases/01-delegate-decision-sub-run-traces/01-01-SUMMARY.md` listing files modified, key type signatures introduced, and any deviations from the plan.
</output>
