<!-- generated-by: gsd-doc-writer -->
# Testing

## Test Framework and Setup

Dogpile uses Vitest for unit, contract, smoke, and release-focused tests. The
framework is declared as `vitest` version `^4.1.5` in `package.json`
`devDependencies`.

Install dependencies before running tests:

```bash
pnpm install
```

No `vitest.config.*` file is present; Vitest runs from package scripts and
discovers TypeScript tests by file name.

## Running Tests

Run the full test suite:

```bash
pnpm run test
```

Run strict type checking:

```bash
pnpm run typecheck
```

Run the browser bundle smoke test:

```bash
pnpm run browser:smoke
```

Run the full release-quality local gate:

```bash
pnpm run verify
```

To run a single test file directly, use Vitest through pnpm:

```bash
pnpm exec vitest run src/runtime/sequential.test.ts
```

## Writing New Tests

Test files use the `*.test.ts` naming convention. Most unit tests are colocated
with their modules, such as `src/runtime/sequential.test.ts` and
`src/providers/openai-compatible.test.ts`. Cross-cutting contract, package,
browser, replay, and smoke tests live in `src/tests/`.

Useful existing patterns:

| Pattern | Location | Use |
| --- | --- | --- |
| Deterministic providers | `src/testing/deterministic-provider.ts` | Repeatable model output for protocol and result tests. |
| Contract fixtures | `src/tests/fixtures/` | Versioned JSON and type-check fixtures for trace, audit, metrics, and replay shapes. |
| Package export checks | `src/tests/package-exports.test.ts` | Public export map, tarball, docs, and source leak assertions. |
| Browser bundle smoke | `src/tests/browser-bundle-smoke.test.ts` | Import checks for the browser ESM bundle. |

Add tests near the behavior they cover when possible. Use `src/tests/` for
cross-module contracts, packaging rules, browser behavior, and smoke coverage.

## Coverage Requirements

No coverage threshold is configured. The repository has no `vitest.config.*`,
Jest config, `.nycrc`, or `c8` coverage settings.

| Type | Threshold |
| --- | --- |
| Lines | No coverage threshold configured |
| Branches | No coverage threshold configured |
| Functions | No coverage threshold configured |
| Statements | No coverage threshold configured |

## CI Integration

Tests run in `.github/workflows/release-validation.yml` on pull requests and on
pushes to `main` or `release/**` branches.

| Job | Runtime | Command |
| --- | --- | --- |
| `Scoped package identity` | Node.js 22 | `pnpm run package:identity` |
| `Required Node.js 22 full suite` | Node.js 22 | `pnpm run verify` |
| `Required Node.js 24 full suite` | Node.js 24 | `pnpm run verify` |
| `Required Bun latest full suite` | Bun latest | `bun run package:identity`, `bun run build`, `bun run typecheck`, `bun run test` |
| `Required browser bundle smoke` | Node.js 22 | `pnpm run browser:smoke` |
| `Required packed-tarball quickstart smoke` | Node.js 22 | `pnpm run quickstart:smoke` |
| `Required pack:check package artifact` | Node.js 22 | `pnpm run pack:check` |

The publish workflow in `.github/workflows/npm-publish.yml` runs
`pnpm run publish:check` before publishing or dry-running the npm package.
