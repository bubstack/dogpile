# Phase 8: Audit Event Schema - Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 10 new/modified files
**Analogs found:** 8 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/runtime/audit.ts` | utility (pure subpath module) | transform | `src/runtime/provenance.ts` (structure) + `src/runtime/health.ts` (signature) | exact (composite) |
| `src/runtime/audit.test.ts` | test | transform | `src/runtime/health.test.ts` | exact |
| `src/tests/audit-record-shape.test.ts` | test (frozen fixture) | transform | `src/tests/provenance-shape.test.ts` | role-match |
| `src/tests/fixtures/audit-record-v1.json` | fixture | — | `src/tests/fixtures/provenance-event-v1.json` | role-match |
| `src/tests/fixtures/audit-record-v1.type-check.ts` | type assertion | — | none | no-analog |
| `package.json` | config (exports + files) | — | `package.json:73–77` (`./runtime/provenance` block) | exact |
| `src/tests/package-exports.test.ts` | test (package contract) | — | same file lines 1106–1164, 1294–1298 | exact |
| `CHANGELOG.md` | docs | — | existing entries in CHANGELOG.md | style-match |
| `CLAUDE.md` | docs | — | existing invariant chain in CLAUDE.md | style-match |

**Note:** `src/types.ts` is NOT in scope for this phase. All `AuditRecord` types are declared standalone in `src/runtime/audit.ts`, not added to `src/types.ts`. Per D-02/AUDT-02, the type is independent and lives in the subpath module. Similarly `src/index.ts` needs no changes — there is no `AuditRecord` re-export from the root.

---

## Pattern Assignments

### `src/runtime/audit.ts` (utility, transform)

**Primary structural analog:** `src/runtime/provenance.ts` (lines 1–43)
**Signature analog:** `src/runtime/health.ts` (lines 55–60)

**Note on health.ts:** `health.ts` is a stub (line 59 throws `"not implemented"`). Use it only for the JSDoc + function signature shape — do not copy the body.

**Imports pattern** — from `src/runtime/provenance.ts` lines 1–1:
```typescript
import type { ModelRequestEvent, ModelResponseEvent } from "../types.js";
```
Adapt for audit.ts — type-only imports from `"../types.js"` and `"../types/events.js"`:
```typescript
import type { Protocol, Tier, Trace } from "../types.js";
import type { BudgetStopEvent, FinalEvent, SubRunCompletedEvent, TurnEvent } from "../types/events.js";
```
All imports are `import type` — no runtime imports. ESM explicit `.js` extension required.

**Exported type pattern** — from `src/runtime/provenance.ts` lines 7–24:
```typescript
export interface ProvenanceRecord {
  readonly modelId: string;
  readonly providerId: string;
  readonly callId: string;
  readonly startedAt: string;
  readonly completedAt: string;
}
```
Adapt for audit.ts — declare all four types (`AuditOutcome`, `AuditCost`, `AuditAgentRecord`, `AuditRecord`) inline in the module. No imports from `types.ts` in the type declarations. All fields `readonly`.

**Module JSDoc + function signature pattern** — from `src/runtime/health.ts` lines 47–60:
```typescript
/**
 * Compute a health summary from a completed run trace.
 *
 * Pure function - no side effects, no I/O, no storage access. Deterministic:
 * given the same trace and thresholds, always produces the same result.
 *
 * @param trace - Completed run trace (from RunResult.trace or a stored trace).
 * @param thresholds - Optional threshold overrides. Defaults to DEFAULT_HEALTH_THRESHOLDS.
 */
export function computeHealth(
  trace: Trace,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): RunHealthSummary {
  throw new Error("computeHealth: not implemented - see plan 07-03");
}
```
Adapt for `createAuditRecord(trace: Trace): AuditRecord` — same pure-function JSDoc pattern, no optional second argument.

**exactOptionalPropertyTypes conditional spread pattern** — established SDK pattern, used in `coordinator.ts` and `shared.ts`:
```typescript
// When a field must be absent (not undefined) when empty:
...(childRunIds.length > 0 ? { childRunIds } : {})
```
Apply to `childRunIds?` on the return object. Required because `exactOptionalPropertyTypes: true` in `tsconfig.json`.

**Type-narrowing pattern** — event discriminants, do NOT import event types into type declarations, only into the function body:
```typescript
const finalEvent = trace.events.find((e): e is FinalEvent => e.type === "final");
const budgetStopEvent = trace.events.find((e): e is BudgetStopEvent => e.type === "budget-stop");
const turnEvents = trace.events.filter((e): e is TurnEvent => e.type === "agent-turn");
```

**Field order constraint** — the return object must assemble fields in the exact order they appear in `audit-record-v1.json` (Pitfall 8 in RESEARCH.md). The fixture JSON defines canonical field order:
```
auditSchemaVersion → runId → intent → startedAt → completedAt → protocol → tier →
modelProviderId → agentCount → turnCount → outcome → cost → agents → childRunIds?
```

---

### `src/runtime/audit.test.ts` (test, transform)

**Analog:** `src/runtime/health.test.ts` (lines 1–255)

**Import pattern** (lines 1–4 of health.test.ts):
```typescript
import { describe, expect, it } from "vitest";
import { computeHealth, DEFAULT_HEALTH_THRESHOLDS } from "./health.js";
import type { CostSummary, RunEvent, Trace, TurnEvent } from "../types.js";
```
Adapt: import `createAuditRecord` from `"./audit.js"`. Import event types as needed for synthetic test data.

**Synthetic Trace factory pattern** (health.test.ts lines 210–232):
```typescript
function traceWith(
  events: readonly RunEvent[],
  options: { readonly finalUsd?: number; readonly budgetCaps?: Record<string, number> } = {}
): Trace {
  return {
    events,
    budget: {
      kind: "replay-trace-budget",
      tier: "balanced",
      ...(options.budgetCaps !== undefined ? { caps: options.budgetCaps } : {})
    },
    finalOutput: {
      kind: "replay-trace-final-output",
      output: "final output",
      cost: costSummary(options.finalUsd ?? 0),
      completedAt: at,
      transcript: {
        kind: "trace-transcript",
        entryCount: 0,
        lastEntryIndex: null
      }
    }
  } as unknown as Trace;
}
```
Use this pattern for `audit.test.ts` — build a `traceWith()` factory that accepts events and relevant options (`protocol`, `tier`, `modelProviderId`, `runId`, `intent`). The `as unknown as Trace` cast is correct — tests intentionally supply partial structs.

**TurnEvent factory pattern** (health.test.ts lines 235–246):
```typescript
function turnEvent(agentId: string, output: string): TurnEvent {
  return {
    type: "agent-turn",
    runId,
    at,
    agentId,
    role: `role-${agentId}`,
    input: `input-${agentId}`,
    output,
    cost: costSummary(0)
  };
}
```
Adapt for audit tests — also build `finalEvent()`, `budgetStopEvent()`, `subRunCompletedEvent()` factory helpers using the same inline-object pattern.

**Determinism test pattern** (health.test.ts lines 195–207):
```typescript
it("returns identical output for the same trace and thresholds", () => {
  const first = computeHealth(trace, thresholds);
  const second = computeHealth(trace, thresholds);
  expect(second).toEqual(first);
});
```
Include a determinism test in `audit.test.ts`.

---

### `src/tests/audit-record-shape.test.ts` (test, frozen fixture)

**Analog:** `src/tests/provenance-shape.test.ts` (lines 1–79)

**Full file structure pattern** (provenance-shape.test.ts lines 1–11):
```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../index.js";
import { createDeterministicModelProvider } from "../internal.js";
import type { RunEvent } from "../index.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixturePath = join(repoRoot, "src/tests/fixtures/audit-record-v1.json");
```
Adapt: load `audit-record-v1.json` the same way. Import `createAuditRecord` from `@dogpile/sdk/runtime/audit`.

**Key shape assertions pattern** (provenance-shape.test.ts lines 54–57):
```typescript
expect(Object.keys(live[0] ?? {})).toEqual(Object.keys(savedArray[0] ?? {}));
expect(Object.keys(live[1] ?? {})).toEqual(Object.keys(savedArray[1] ?? {}));
expect(typeShape(live[0])).toEqual(typeShape(savedArray[0]));
expect(typeShape(live[1])).toEqual(typeShape(savedArray[1]));
```
Adapt for a single object (audit fixture is one record, not an array). Use:
```typescript
expect(Object.keys(live)).toEqual(Object.keys(saved));
expect(typeShape(live)).toEqual(typeShape(saved));
```
This is the order-sensitive key check that enforces Pitfall 8.

**typeShape helper** (provenance-shape.test.ts lines 28–36):
```typescript
function typeShape(value: object | undefined): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, Array.isArray(entry) ? "array" : typeof entry])
  );
}
```
Copy this helper verbatim.

**Key difference from provenance-shape.test.ts:**
- Provenance fixture is an `array` of 2 events; audit fixture is a **single object**.
- `audit-record-shape.test.ts` generates a live `AuditRecord` by calling `createAuditRecord(result.trace)` after a coordinator run (to get `agentCount > 1` and `childRunIds`).
- Use `createDeterministicModelProvider` with `protocol: { kind: "coordinator" }` to produce a coordinator trace.

---

### `src/tests/fixtures/audit-record-v1.json` (fixture)

**Analog:** `src/tests/fixtures/provenance-event-v1.json`

**Pattern:** Frozen JSON with realistic field values. Field order in the JSON must exactly match the key order the implementation assembles (Pitfall 8). Use the fixture structure from RESEARCH.md Code Examples:

```json
{
  "auditSchemaVersion": "1",
  "runId": "audit-record-fixture-run-id",
  "intent": "Test audit record shape",
  "startedAt": "2026-05-01T00:00:00.000Z",
  "completedAt": "2026-05-01T00:00:01.000Z",
  "protocol": "coordinator",
  "tier": "balanced",
  "modelProviderId": "audit-fixture-provider",
  "agentCount": 2,
  "turnCount": 3,
  "outcome": { "status": "completed" },
  "cost": { "usd": 0.0003, "inputTokens": 21, "outputTokens": 12 },
  "agents": [
    { "id": "agent-1", "role": "planner", "turnCount": 2 },
    { "id": "agent-2", "role": "executor", "turnCount": 1 }
  ],
  "childRunIds": ["child-run-abc"]
}
```

`agents[]` is sorted by `id` (Pitfall 9). `childRunIds` is present (non-empty coordinator run per D-11).

---

### `src/tests/fixtures/audit-record-v1.type-check.ts` (type assertion)

**No analog in the repo.** This is a new pattern for Phase 8.

**Pattern** (from RESEARCH.md Pattern 5): Use an inline object with `satisfies AuditRecord`. Do NOT use a bare JSON import — `tsconfig.json` uses `moduleResolution: "Bundler"` + `verbatimModuleSyntax: true` without `resolveJsonModule`, so JSON imports are unsupported.

```typescript
import type { AuditRecord } from "@dogpile/sdk/runtime/audit";

// Inline object mirrors audit-record-v1.json exactly.
// Update this object whenever the fixture changes.
// This file is never imported at runtime — it exists only for tsc --noEmit coverage.
const _fixture = {
  auditSchemaVersion: "1",
  runId: "audit-record-fixture-run-id",
  intent: "Test audit record shape",
  startedAt: "2026-05-01T00:00:00.000Z",
  completedAt: "2026-05-01T00:00:01.000Z",
  protocol: "coordinator",
  tier: "balanced",
  modelProviderId: "audit-fixture-provider",
  agentCount: 2,
  turnCount: 3,
  outcome: { status: "completed" },
  cost: { usd: 0.0003, inputTokens: 21, outputTokens: 12 },
  agents: [
    { id: "agent-1", role: "planner", turnCount: 2 },
    { id: "agent-2", role: "executor", turnCount: 1 },
  ],
  childRunIds: ["child-run-abc"],
} satisfies AuditRecord;
```

This file is covered by `tsconfig.json`'s `"include": ["src/**/*.ts"]` — no additional config needed. No test runner; only `pnpm run typecheck` exercises it.

---

### `package.json` — exports and files (config)

**Analog:** `package.json` lines 73–77 (`./runtime/provenance` export block) and line 159 (`src/runtime/provenance.ts` files entry).

**exports block to add** (insert alphabetically between `./runtime/audit` and `./runtime/broadcast` — currently `./runtime/broadcast` is first in the runtime group at line 53):
```json
"./runtime/audit": {
  "types": "./dist/runtime/audit.d.ts",
  "import": "./dist/runtime/audit.js",
  "default": "./dist/runtime/audit.js"
}
```

**files entry to add** (insert alphabetically before `broadcast.ts` — `audit` < `broadcast` alphabetically; this means inserting before `"src/runtime/broadcast.ts"` at package.json line 150 and before `"src/runtime/broadcast.ts"` at package-exports.test.ts line 1142):
```
"src/runtime/audit.ts"
```

**Note:** The `dist/runtime/*.js` glob at line 131 already covers the compiled output. Only the `src/runtime/audit.ts` explicit source entry needs to be added to `files`.

---

### `src/tests/package-exports.test.ts` (package contract test)

**Analog:** Same file — two separate assertion blocks that must both be updated.

**Block 1 — manifest.files** (lines 1106–1164): The `toEqual` array at line 1106. Insert `"src/runtime/audit.ts"` alphabetically **before** `"src/runtime/broadcast.ts"` (line 1142) — `audit` < `broadcast`. Do NOT place it between provenance (line 1151) and retry (line 1152).

**Block 2 — manifest.exports** (lines 1252–1334): The `toEqual` object at line 1252. Insert the `"./runtime/audit"` block. The existing `"./runtime/provenance"` block is at lines 1294–1298 — insert `./runtime/audit` **before** `./runtime/broadcast` (line 1269, currently the first `./runtime/*` entry in alphabetical order). Alphabetically, `audit` precedes `broadcast`.

Existing provenance pattern (lines 1294–1298) to mirror exactly:
```typescript
"./runtime/provenance": {
  types: "./dist/runtime/provenance.d.ts",
  import: "./dist/runtime/provenance.js",
  default: "./dist/runtime/provenance.js"
},
```

---

### `CHANGELOG.md` and `CLAUDE.md` (docs)

No code excerpt pattern needed. Follow the existing entry style:

- **CHANGELOG.md:** Add a new entry under the unreleased/latest section for `createAuditRecord` API, `/runtime/audit` subpath, and `AuditRecord` type. Follow the format of existing Phase 6 entries (provenance) and Phase 7 entries.
- **CLAUDE.md:** Add Phase 8 to the public-surface invariant chain. The existing chain mentions `/runtime/provenance` (Phase 6) and `/runtime/introspection` + `/runtime/health` (Phase 7). Add: `AuditRecord`, `createAuditRecord`, `/runtime/audit` subpath, and `src/tests/fixtures/audit-record-v1.json` fixture.

---

## Shared Patterns

### Pure Subpath Module Structure
**Source:** `src/runtime/provenance.ts` (entire file, 43 lines)
**Apply to:** `src/runtime/audit.ts`

Rules enforced:
- `import type` only — no runtime imports from external packages or Node-only APIs
- All exports are types and pure functions
- No side effects, no `process.*`, no `fs.*`, no `globalThis` mutations
- Same code must run on Node 22/24, Bun latest, browser ESM

### ESM Relative Import Extension
**Source:** All `src/runtime/*.ts` files
**Apply to:** `src/runtime/audit.ts`, `src/runtime/audit.test.ts`

All relative imports use explicit `.js` extension:
```typescript
import { createAuditRecord } from "./audit.js";
import type { Trace } from "../types.js";
```

### Readonly Fields on All Exported Types
**Source:** `src/runtime/provenance.ts` lines 7–24, `src/runtime/health.ts` (HealthThresholds interface)
**Apply to:** All four types in `audit.ts` (`AuditRecord`, `AuditOutcome`, `AuditCost`, `AuditAgentRecord`)

All fields must be `readonly`.

### exactOptionalPropertyTypes Conditional Spread
**Source:** `src/runtime/coordinator.ts` and `src/runtime/shared.ts` (established SDK pattern)
**Apply to:** `childRunIds?` in `createAuditRecord` return object

```typescript
...(childRunIds.length > 0 ? { childRunIds } : {})
```

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `src/tests/fixtures/audit-record-v1.type-check.ts` | type assertion | No `satisfies T` type-check file exists in the repo. Use the inline object pattern from RESEARCH.md Pattern 5. |

---

## Critical Pitfalls for Planner

1. **`terminationReason?` top-level field** — RESEARCH.md recommends collapsing it (omit from `AuditRecord`). Flag this in the plan. CONTEXT.md D-06 included it but explicitly allowed the planner to collapse it. Default recommendation: do not implement `terminationReason?`.

2. **`BudgetStopReason` values** — Use `"cost" | "tokens" | "iterations" | "timeout"` from `src/types.ts:423`. CONTEXT.md D-05 cited wrong values (`"usd-cap"`, `"turn-cap"`).

3. **health/introspection subpaths not yet in package.json** — Phase 7 subpaths (`./runtime/health`, `./runtime/introspection`) are NOT in `package.json` or `package-exports.test.ts` yet. The only shipped `/runtime/X` subpath pattern to follow is `./runtime/provenance`.

4. **Fixture key order** — `Object.keys(live).toEqual(Object.keys(saved))` is order-sensitive. The return statement in `createAuditRecord` must assemble fields in the exact order of `audit-record-v1.json`.

5. **`agents[]` sort by id** — sort before returning to ensure deterministic output across runs regardless of TurnEvent arrival order.

---

## Metadata

**Analog search scope:** `src/runtime/`, `src/tests/`, `src/tests/fixtures/`, `package.json`
**Files scanned:** 9 (provenance.ts, health.ts, introspection.ts, provenance.test.ts, health.test.ts, provenance-shape.test.ts, provenance-event-v1.json, package.json, package-exports.test.ts)
**Pattern extraction date:** 2026-05-01
