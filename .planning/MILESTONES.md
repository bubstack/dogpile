# MILESTONES

Historical milestone log for `@dogpile/sdk`. Reconstructed from `CHANGELOG.md` on 2026-04-30 during planning bootstrap (no prior MILESTONES.md). Treat entries as authoritative for "what shipped"; treat "Phase" mapping as retrospective (this project pre-dated GSD phase tracking).

---

## v0.1.0 — Public Release / Production-Readiness

**Shipped.** Phase numbering: pre-GSD.

- Initial publish under scoped `@dogpile/sdk` (no bare `dogpile` alias).
- Closed seven production-readiness gaps:
  1. Cost accounting via caller `costEstimator` (no bundled pricing).
  2. End-to-end cancellation via `AbortSignal`, `StreamHandle.cancel()`, `budget.timeoutMs`.
  3. Runtime support proof for Node 22 / 24, Bun latest, browser ESM.
  4. Intentional public surface (root, browser, runtime, type, OpenAI-compatible adapter).
  5. Stable typed errors via `DogpileError`.
  6. Reproducible local + CI release gates (pack, install, import all subpaths, downstream type-check, reject `workspace:` / `link:` installs, source maps + original TS sources shipped).
  7. Scope discipline (dependency-free provider interface; OpenAI-compatible HTTP adapter; no bundled pricing; trusting protocol hot loops).
- Added browser ESM bundle at `@dogpile/sdk/browser` and package root `browser` condition.
- Added required CI checks: `Required browser bundle smoke`, `Required packed-tarball quickstart smoke`.
- Added front-door caller config validation (`run`, `stream`, `createEngine`, `createOpenAICompatibleProvider`) with `DogpileError({ code: "invalid-configuration" })` and `detail.path`.

## v0.1.1 — GitHub Org Transfer

**Shipped.** Pre-GSD.

- Repo moved `zakkeown/dogpile` → `bubstack/dogpile`.
- Updated package metadata, identity guards, publish docs, npm Trusted Publisher config.

## v0.1.2 — Docs / Identity Cleanup

**Shipped.** Pre-GSD.

- README release verification section reformatted for npm package page legibility.

## v0.2.0 — Snow Leopard Hardening

**Shipped.** Pre-GSD.

- Centralized release identity checks (manifest, README, changelog, package guard, export tests, pack metadata drift together).
- OpenAI-compatible fetch/network failures normalized to stable `DogpileError` provider codes.
- Tightened publishable source allowlist (test files out of tarball).
- Added deterministic `pnpm run benchmark:baseline` paper-reproduction harness.

## v0.2.1 — Security Patch

**Shipped.** Pre-GSD.

- Explicit read-only GitHub Actions workflow permissions for release validation jobs.
- Replaced ReDoS-prone install command regexes in package identity scan.
- Hardened markdown table escaping in the Hugging Face upload GUI example.

## v0.2.2 — Documentation Refresh

**Shipped.** Pre-GSD.

- README reworked around product value, quickstart, documentation map.
- Dense API / trace / release detail split into `docs/developer-usage.md`, `docs/reference.md`, `docs/release.md`.

## v0.3.0 — Termination Floors + Wrap-Up Hint

**Shipped.** Pre-GSD.

- Protocol-level `minTurns` / `minRounds` floors so convergence and judge termination cannot fire before configured minimum progress.
- One-shot `wrapUpHint` so the next model turn can package work before hard caps terminate the run.

## v0.3.1 — Logger Seam, Retry Wrapper, Internal Vercel Adapter

**Shipped (current).** Pre-GSD.

- Structured logging seam at `@dogpile/sdk/runtime/logger` (also re-exported from package root). Adds `Logger`, `noopLogger`, `consoleLogger`, `loggerFromEvents`. No new event variants. Logger throws routed to logger's own `error` channel.
- `withRetry(provider, policy)` at `@dogpile/sdk/runtime/retry`. Provider-neutral, opt-in transient-failure retry. Honors `error.detail.retryAfterMs`. Short-circuits on `AbortSignal`. Streaming forwarded unchanged. Default retries: `provider-rate-limited`, `provider-timeout`, `provider-unavailable`.
- Internalized Vercel AI adapter (`src/providers/vercel-ai.ts` → `src/internal/vercel-ai.ts`) so `ai` does not become a peer dep. Was never in `package.json#exports` or `#files`.
- `createRunId` no longer falls back to `Date.now`-based id when `globalThis.crypto.randomUUID` is missing — throws `DogpileError({ code: "invalid-configuration" })`.
- Three plain `Error` throws in `src/runtime/tools.ts` upgraded to `DogpileError` with stable codes (`invalid-configuration` / `provider-invalid-response`).

---

## Next Milestone

To be defined via `/gsd-new-milestone`.
