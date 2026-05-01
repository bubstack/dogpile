---
phase: 05-documentation-changelog
generated: 2026-05-01
mode: power
answered: 20/20
---

# Phase 5 Context — Documentation & Changelog

Decisions captured from the power-mode questionnaire (`05-QUESTIONS.json`). These lock the gray areas for DOCS-01..DOCS-04 before research/planning. The phase ALSO ships v0.4.0 (date-stamped, tagged, published) — see D-18.

## Domain

Recursive coordination (the headline feature of v0.4.0) becomes discoverable: a dedicated docs page + reference page, a runnable example mirroring `examples/huggingface-upload-gui`, a README "Choose Your Path" row, a re-shaped CHANGELOG entry with a migration snippet, and the actual `0.4.0` release.

## Canonical refs

> Every downstream agent (researcher, planner, executor) MUST read these. Full relative paths from repo root.

- `.planning/ROADMAP.md` lines 86-96 — Phase 5 success criteria, requirements DOCS-01..DOCS-04
- `.planning/REQUIREMENTS.md` lines 57-60, 106-109 — full requirement text and tracker rows
- `.planning/PROJECT.md` — milestone goal ("agent-driven nesting only — caller-defined trees deferred"), constraints, key decisions, evolution rules
- `.planning/STATE.md` — running decision log
- `.planning/phases/01-delegate-decision-sub-run-traces/01-CONTEXT.md` — Phase 1 decisions: `delegate` decision shape, `sub-run-*` event types, `maxDepth` (default 4), embedded child traces, replay recursion, synthetic transcript entries
- `.planning/phases/02-budget-cancellation-cost-rollup/02-CONTEXT.md` — Phase 2 decisions: per-child AbortController, `parent-aborted | timeout` `detail.reason` vocabulary, `partialTrace`/`partialCost` shapes, `defaultSubRunTimeoutMs`, parent-rollup-drift replay error, `sub-run-budget-clamped` and `sub-run-parent-aborted` events
- `.planning/phases/03-provider-locality-bounded-concurrency/03-CONTEXT.md` — Phase 3 decisions: `locality: 'local' | 'remote'` provider hint, `maxConcurrentChildren` (default 4) auto-clamp to 1 for local, `sub-run-concurrency-clamped` event, sibling-failed semantics
- `.planning/phases/04-streaming-child-error-escalation/04-CONTEXT.md` — Phase 4 decisions: `parentRunIds: readonly string[]` ancestry chain on every event, parent-events isolation in persisted trace, `StreamHandle.cancel()` reuse, synthetic per-child `sub-run-failed` on parent abort, structured `failures: ReadonlyArray<{...}>` block in coordinator prompt + enriched taggedText line
- `CLAUDE.md` — public-surface invariants (event-shape changes propagate to `event-schema.test.ts`, `result-contract.test.ts`, `package-exports.test.ts`, `package.json` exports/files allowlist, CHANGELOG.md). Says AGENTS.md and CLAUDE.md MUST stay consistent.
- `AGENTS.md` — repository guidelines (currently must be updated alongside CLAUDE.md per D-20)
- `README.md` lines 67-75 — existing "Choose Your Path" table (D-13/D-14 append target)
- `CHANGELOG.md` — v0.4.0 entry (currently `[Unreleased]`, phase-grouped); D-16 restructures to thematic-with-phase-tags, D-17 adds Migration subsection, D-18 date-stamps to `[0.4.0] — 2026-05-01`
- `docs/developer-usage.md` (575 lines) — D-19 adds new "Recursive coordination" section (~50-80 lines)
- `docs/reference.md` — D-20 must be updated for new exports (`RunCallOptions`, event types, locality field, etc.)
- `docs/release.md` — release procedure (read before D-18 cut)
- `examples/README.md` — D-15 mirrors the huggingface section format
- `examples/huggingface-upload-gui/run-all-protocols.mjs` and `examples/huggingface-upload-gui/README.md` — template for D-07 (mission reuse) and D-09 (single .mjs shape)
- `package.json` — version bump target for D-18; `files` allowlist must NOT swallow examples/docs (they stay repo-only)
- `src/runtime/coordinator.ts` (esp. lines 459, 1116-1183, 1212-1262) — referenced by docs page for parentRunIds, structured failures, escalation
- `src/types/events.ts` (lines 789-830), `src/types.ts` (1311-1985) — public event/handle types referenced by docs/reference.md
- `src/tests/event-schema.test.ts`, `src/tests/result-contract.test.ts`, `src/tests/package-exports.test.ts` — public-surface gates that must pass after changelog/exports rewrite

## Locked Requirements (from ROADMAP.md Phase 5)

1. **DOCS-01** — `docs/recursive-coordination.md` documents `delegate`, propagation rules (abort/timeout/cost), concurrency, locality, and trace embedding, with at least one worked example.
2. **DOCS-02** — `examples/recursive-coordination/` is a runnable example wired against `createOpenAICompatibleProvider` exercising a real `delegate` flow end-to-end.
3. **DOCS-03** — README "Choose Your Path" table gains a row pointing at `delegate` / recursive coordination.
4. **DOCS-04** — `CHANGELOG.md` v0.4.0 entry lists every public-surface addition: `delegate` decision variant, `subRun.*` events, `locality` field, `maxConcurrentChildren` config, `maxDepth` config (and Phase 4 additions).

## Decisions

### A. docs/recursive-coordination.md + reference page (DOCS-01)

**D-01: Hybrid narrative arc — short concept blurb → API surface table → progressive worked example. (Q-01 = d)**
- Open with two paragraphs framing recursive coordination as "a coordinator agent emits `delegate` to dispatch a sub-mission; the sub-run's trace embeds in the parent's trace; budgets/aborts/costs propagate."
- Then an API surface table covering: `delegate` decision, `sub-run-*` events (started/completed/failed/parent-aborted/budget-clamped/concurrency-clamped), `parentRunIds` chain, `locality`, `maxConcurrentChildren`, `maxDepth`, `defaultSubRunTimeoutMs`, `RunCallOptions`.
- Then progressive worked example: pile → stream (showing parentRunIds demux) → failure handling.
- Page is the longest in `docs/`; navigability handled via TOC at the top.

**D-02: Both fragment-per-concept AND a canonical end-to-end example at the close. (Q-02 = c)**
- Each subsection (propagation, concurrency, locality, parentRunIds, structured failures, partial traces, replay parity) ships a focused 5-15 line fragment showing that surface in isolation.
- Page closes with one complete worked example exercising every surface in a single run, with annotated event-log output.
- This is the canonical "what does the trace look like end-to-end" reference downstream questions point at.

**D-03: Split into TWO pages — `docs/recursive-coordination.md` (concepts + worked example) and a NEW `docs/recursive-coordination-reference.md` (exhaustive event/error/option tables). (Q-03 = c)**
- `recursive-coordination.md` = concepts, narrative, worked example, fragments. The page DOCS-01 satisfies.
- `recursive-coordination-reference.md` = NEW — every `sub-run-*` event variant with full payload schema, every `detail.reason` vocabulary value, every `RunCallOptions` field, every `DogpileError` `code`/`detail.reason` combo introduced in v0.4.0, the `parentRunIds` chain semantics formalized, the replay-drift error matrix (parent-rollup-drift, trace-accounting-mismatch).
- `docs/release.md` is unchanged. `docs/reference.md` (current exports catalog) cross-links to the new reference page rather than duplicating.
- Public-surface delta: `docs/` gains one file. `files` allowlist in `package.json` does NOT include `docs/` (docs stay repo-only / GitHub-only); confirm before commit.

**D-04: parentRunIds chain demux — dedicated subsection with snippet + ASCII diagram. (Q-04 = a)**
- Show a parent → child → grandchild ASCII tree with `parentRunIds` values at each emit site (root → `[]`, child event seen at root → `[parent]`, grandchild event seen at root → `[parent, child]`).
- Show both demux idioms:
  - Immediate-parent: `event.parentRunIds?.[event.parentRunIds.length - 1] === handle.runId`
  - Ancestry: `event.parentRunIds?.includes(handle.runId)`
- Lock alignment with Phase 4 D-02 (chain prepended at every level by `teedEmit`).
- Note: persisted `RunResult.events` does NOT carry the chain (Phase 4 D-04). Doc this asymmetry explicitly so readers don't expect chain in `result.events`.

**D-05: Structured `failures` coordinator-prompt block — dedicated subsection with the prompt template excerpt. (Q-05 = a)**
- Show the exact text-block format the coordinator agent sees on its plan-turn prompt (per Phase 4 D-07): `failures: [{ childRunId, code, message, partialCost }, ...]`.
- Lock the format readers/agents can rely on. This is now part of the coordinator prompt contract — any change in shape is a public-surface change documented here.
- Cross-link to `coordinator.ts:459` (legacy taggedText line site) and the planner location where the structured block is assembled.

**D-06: Explicit "Not in v0.4.0" section listing deferrals. (Q-06 = a)**
- List, with one-sentence reason each:
  - Caller-defined trees (`Dogpile.nest`) — deferred; agent-driven nesting is the v0.4.0 surface.
  - Worker delegation — only coordinator plan-turn agents may emit `delegate`; worker turns and final-synthesis turns reject delegate decisions with `invalid-configuration`.
  - Per-child user-facing `StreamHandle` — children remain internal in v0.4.0; cancellation flows through the parent handle (Phase 4 D-05).
- Sets expectations; preempts feature-request issues.

### B. examples/recursive-coordination/ (DOCS-02)

**D-07: Mirror huggingface-upload-gui mission — same prompt, coordinator-with-delegate variant. (Q-07 = d)**
- Reuse the Hugging Face upload GUI planning mission verbatim from `examples/huggingface-upload-gui/run-all-protocols.mjs`.
- Wrap it in a coordinator that delegates each major sub-step (e.g., requirements analysis → broadcast of researchers; UX exploration → sequential pass; risk audit → broadcast).
- Continuity with the existing example lets readers diff the two scripts to see "same mission, with delegation."
- Side-by-side comparability is intentional: the existing example shows protocol-level comparison, the new one shows recursion within `coordinator`.

**D-08: Deterministic default provider + documented live-mode in README. (Q-08 = c)**
- Default invocation (`node examples/recursive-coordination/run.mjs`) uses a local deterministic provider (paper-style autonomous role selection, deterministic delegate decisions). Repeatable without network/keys.
- Example's README shows the env-var opt-in for live mode mirroring huggingface (`DOGPILE_EXAMPLE_PROVIDER=openai-compatible`, `DOGPILE_EXAMPLE_MODEL`, `OPENAI_API_KEY`, optional `DOGPILE_EXAMPLE_BASE_URL`/`PATH`).
- DOCS-02's "wired against `createOpenAICompatibleProvider`" requirement is satisfied by the live-mode code path (it constructs the adapter and runs the same mission).
- Reuse the deterministic provider helper from huggingface-upload-gui or extract to a shared `examples/_lib/` if duplication grows — researcher decides.

**D-09: Single `.mjs` script (matches huggingface). (Q-09 = a)**
- File: `examples/recursive-coordination/run.mjs`. Run from repo root via `node examples/recursive-coordination/run.mjs` after `pnpm run build`.
- Imports `@dogpile/sdk` from the built `dist/` (same pattern as huggingface). No new `package.json` in the example dir.
- Plus a sibling `examples/recursive-coordination/README.md` mirroring the huggingface one (D-15).

**D-10: Demonstrate BOTH `Dogpile.stream()` AND `Dogpile.pile()`. (Q-10 = c)**
- Primary path: `Dogpile.stream()` — surfaces the bubbled child events with `parentRunIds` chain demux live (best demo of Phase 4 work).
- Secondary path: a small `Dogpile.pile()` block at the end that runs the SAME mission and prints the embedded child trace shape from `result.trace` (best demo of Phase 1 trace-embedding).
- Acknowledge the scope-creep risk noted by Q-10's option text: keep the second block tight (~15 lines) so the example stays readable.
- Output artifacts written to `examples/recursive-coordination/results/` mirroring huggingface's `results/` pattern.

**D-11: Include an intentionally-failing child. (Q-11 = a)**
- Configure one delegated sub-run with a tiny budget (or other deterministic failure trigger) so it fails partway. Strongest demo of Phase 2/4 work.
- Surfaces in the trace: `sub-run-failed` event with `partialTrace` + `partialCost`; the structured `failures` array the coordinator prompt sees on the next turn; the coordinator's retry/abort decision.
- Comments in the script explain WHAT to look at in the output.

**D-12: Include a local provider + `sub-run-concurrency-clamped` demo. (Q-12 = a)**
- The script wires a `locality: 'local'` provider for one of the delegated children (or a `localOnly` variant run). Captures the auto-clamp event.
- Output annotates: "Notice that with locality=local, maxConcurrentChildren auto-clamps to 1; see the `sub-run-concurrency-clamped` event."
- Acceptable form: a flag (`--local`) or a sequential second run inside the script that flips locality. Researcher/planner picks the cleanest shape.

### C. README + examples/README cross-doc (DOCS-03)

**D-13: README "Choose Your Path" row wording — option (d). (Q-13 = d)**
- Left column: `Run a coordinator that fans out into other Dogpile runs`
- Right column: `` `delegate` decision; `docs/recursive-coordination.md` ``
- Most descriptive left column; mirrors how a developer would search for this feature.

**D-14: Append the row at the END of the table (after the openai-compat row). (Q-14 = a)**
- Lowest churn to the existing table. The recursive surface is the newest row; placing it at the bottom matches "most recent / advanced" ordering.

**D-15: examples/README.md — full subsection mirroring huggingface format. (Q-15 = a)**
- New section header (e.g., "Recursive coordination — Hugging Face upload GUI plan, with delegation").
- Body covers: one-paragraph description, run command, env-var table for live mode (mirroring huggingface lines 11-26), artifact directory note (`examples/recursive-coordination/results/`).
- Self-contained for readers who land on `examples/`.

### D. CHANGELOG.md (DOCS-04)

**D-16: Hybrid CHANGELOG structure — thematic top-level with `(Phase N)` annotations preserved. (Q-16 = c)**
- Restructure the v0.4.0 entry into themed top-level sections, each bullet annotated with `(Phase N)`:
  - **Breaking** — AgentDecision discriminated union (Phase 1).
  - **Migration** — see D-17.
  - **Added — `delegate` decision and sub-run traces** (Phase 1).
  - **Added — Budget, cancellation, cost roll-up** (Phase 2).
  - **Added — Provider locality and bounded concurrency** (Phase 3).
  - **Added — Streaming and child error escalation** (Phase 4).
  - **Added — Documentation and runnable example** (Phase 5).
- Preserve all existing Phase 2/3 bullet content; rewrite Phase 1 + add Phase 4/5 entries.
- Within each Added section, list every public-surface addition (DOCS-04 enumeration: `delegate` variant, `subRun.*` events, `locality`, `maxConcurrentChildren`, `maxDepth`, plus Phase 2/3/4 additions: `parent-aborted`/`timeout` `detail.reason`, `sub-run-parent-aborted`/`sub-run-budget-clamped`/`sub-run-concurrency-clamped` events, `parentRunIds` chain, `defaultSubRunTimeoutMs`, `RunCallOptions`, `recomputeAccountingFromTrace`, replay-drift error matrix, structured coordinator `failures` block).

**D-17: Dedicated "Migration" subsection with a before/after `AgentDecision` snippet. (Q-17 = a)**
- 10-20 line code block under v0.4.0:
  ```ts
  // v0.3.x
  const decision: AgentDecision = await coordinator.run(...);
  console.log(decision.selectedRole, decision.contribution);

  // v0.4.0
  const decision = await coordinator.run(...);
  if (decision.type === "participate") {
    console.log(decision.selectedRole, decision.contribution);
  } else if (decision.type === "delegate") {
    // new: handle delegated sub-mission
  }
  ```
- Cross-link to `docs/recursive-coordination.md#agentdecision-narrowing` (or whichever anchor the docs page exposes).
- Section heading: `### Migration — AgentDecision narrowing (v0.3.x → v0.4.0)`.

**D-18: Date-stamp v0.4.0 in this phase AND ship the release. (Q-18 = a)**
- Phase 5 includes the cut: change `## [Unreleased] — v0.4.0` → `## [0.4.0] — 2026-05-01` (or actual ship date), bump `package.json` version, run `pnpm run verify`, `git tag v0.4.0`, push, and `npm publish`.
- Plan must include a release sub-task with the `pnpm run verify` gate and explicit npm Trusted Publisher (`bubstack`) confirmation per PROJECT.md.
- If the release date slips beyond the phase commit date, the heading's date MUST be the actual publish date — researcher/planner schedule the date-stamp commit immediately before the publish step.
- Strongest "shipped" signal; reduces risk of `[Unreleased]` lingering.

### E. Cross-doc updates (beyond ROADMAP)

**D-19: docs/developer-usage.md — add a new "Recursive coordination" section (~50-80 lines). (Q-19 = a)**
- Section sits after the existing protocol/coordinator content.
- Summarizes: when to use `delegate`, the four-protocol list is unchanged, depth/concurrency defaults, link to `docs/recursive-coordination.md` for full surface.
- Avoid duplicating reference material (events, error codes, etc.) — those live in `docs/recursive-coordination-reference.md` (D-03).
- Maintenance: when delegate surface changes, update both pages. Note this in the section's leading comment.

**D-20: Update AGENTS.md, docs/reference.md, AND CLAUDE.md. (Q-20 = a)**
- `AGENTS.md` — sync sections that overlap with CLAUDE.md per CLAUDE.md's stated invariant. Add recursive-coordination invariants where AGENTS.md lists them.
- `docs/reference.md` — add new exports: `RunCallOptions`, all `SubRun*Event` types, `recomputeAccountingFromTrace`, `ReplayTraceProtocolDecisionType` literals (`start-sub-run`, `complete-sub-run`, `fail-sub-run`, `mark-sub-run-parent-aborted`, `mark-sub-run-budget-clamped`, `mark-sub-run-concurrency-clamped`). Cross-link to docs/recursive-coordination.md and -reference.md.
- `CLAUDE.md` — add a "Recursive coordination" line under the cross-cutting invariants summary; ensure the public-surface list (event-shape changes propagate to event-schema.test.ts, etc.) still applies. Keep AGENTS.md mirror.
- Largest surface; planner sequences these AFTER the docs pages exist (so cross-links are valid).

## Specifics (chat-more / nuance)

None captured — all 20 questions answered with option selection only.

## Code Context (reusable assets)

- `examples/huggingface-upload-gui/run-all-protocols.mjs` — template for D-07 (mission), D-08 (deterministic + live env vars), D-09 (single .mjs shape), D-15 (README format)
- `examples/huggingface-upload-gui/README.md` — section format to mirror in `examples/recursive-coordination/README.md` and in the `examples/README.md` subsection
- Existing CHANGELOG.md v0.4.0 (lines 1-94 in current state) — Phase 1/2/3 bullets to preserve through D-16's restructure (do not rewrite content; reorganize by theme + add `(Phase N)` tags)
- README.md "Choose Your Path" table (lines 67-75) — append row per D-13/D-14
- `docs/release.md` — release procedure; D-18 reads this before cutting

## Deferred Ideas

- Per-child user-facing `StreamHandle` — children stay internal in v0.4.0 (D-06 calls this out in docs).
- Caller-defined coordination trees (`Dogpile.nest`) — deferred milestone.
- Worker-turn delegation and final-synthesis-turn delegation — explicitly rejected with `invalid-configuration` in v0.4.0; revisit in a later milestone if there's demand.
- Migration helper / codemod for `AgentDecision` v0.3 → v0.4 narrowing — not in scope; Migration snippet (D-17) is the v0.4.0 deliverable.
- Sharing the deterministic provider helper between huggingface-upload-gui and recursive-coordination via `examples/_lib/` — left to researcher/planner judgment when implementing D-08; only extract if natural duplication forces it.

## Next Steps

```
/clear
/gsd-plan-phase 5
```

The plan should sequence work as: (1) docs/recursive-coordination.md + -reference.md, (2) examples/recursive-coordination/ scaffold, (3) README + examples/README updates, (4) CHANGELOG restructure + Migration subsection, (5) developer-usage.md + AGENTS.md + reference.md + CLAUDE.md sync, (6) version bump + `pnpm run verify` + tag + publish (D-18). Cross-links require pages to exist before they're linked from elsewhere.
