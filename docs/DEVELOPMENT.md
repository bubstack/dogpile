<!-- generated-by: gsd-doc-writer -->
# Development

## Local Setup

1. Fork or clone the repository from `https://github.com/bubstack/dogpile.git`.
2. Use Node.js `>=22` and pnpm `10.33.0`.
3. Install dependencies with `pnpm install`.
4. Build the package with `pnpm run build`.
5. Run `pnpm run test` for the normal local test loop or `pnpm run verify`
   before release-facing changes.

No `.env.example` file is present. The SDK runtime does not read environment
variables; example scripts and live tests construct provider objects from their
own optional variables. See `docs/CONFIGURATION.md` for the full list.

## Build Commands

| Command | Description |
| --- | --- |
| `pnpm run build` | Compiles TypeScript with `tsconfig.build.json` and builds the browser bundle with `vite.browser.config.ts`. |
| `pnpm run browser:smoke` | Runs `pnpm run build`, then executes `src/tests/browser-bundle-smoke.test.ts`. |
| `pnpm run package:artifacts` | Runs `scripts/check-package-artifacts.mjs` to validate emitted package artifacts. |
| `pnpm run consumer:smoke` | Runs `scripts/consumer-import-smoke.mjs`. |
| `pnpm run quickstart:smoke` | Runs `scripts/consumer-import-smoke.mjs` for the packed quickstart path. |
| `pnpm run package:identity` | Runs `scripts/check-package-identity.mjs`. |
| `pnpm run package:sourcemaps` | Runs `scripts/check-pack-sourcemaps.mjs`. |
| `pnpm run benchmark:baseline` | Builds the package and runs `scripts/benchmark-baseline.mjs`. |
| `pnpm run pack:check` | Runs package identity, build, artifact, quickstart, source map, and npm pack dry-run checks. |
| `pnpm run publish:check` | Runs `pnpm run verify`, artifact checks, and npm publish dry run. |
| `pnpm run test` | Runs `vitest run`. |
| `pnpm run typecheck` | Runs `tsc -p tsconfig.json --noEmit`. |
| `pnpm run lint` | Runs the same strict TypeScript no-emit check as `pnpm run typecheck`. |
| `pnpm run verify` | Runs the release-quality local gate: identity, build, artifacts, quickstart smoke, typecheck, and tests. |

## Code Style

The repository uses TypeScript as the enforced style and correctness gate:

- `tsconfig.json` enables strict mode, exact optional property types,
  unchecked indexed access checking, declaration output settings, source maps,
  and `verbatimModuleSyntax`.
- `pnpm run lint` and `pnpm run typecheck` both execute
  `tsc -p tsconfig.json --noEmit`.
- No ESLint, Prettier, Biome, or `.editorconfig` configuration file is present.
- Relative TypeScript imports use explicit `.js` extensions, matching the
  package's ESM output contract.

Follow the repository conventions in `AGENTS.md`: two-space indentation,
double quotes, semicolons, strict types, immutable inputs where existing APIs do
that already, `camelCase` values, `PascalCase` exported types and classes, and
kebab-case file names.

## Branch Conventions

No branch naming convention is documented in repository files. Recent commit
subjects and `AGENTS.md` use Conventional Commit-style prefixes such as `fix:`,
`feat:`, `chore:`, `docs:`, and `ci:`.

## PR Process

No GitHub pull request template file is present. Use this repository's documented
expectations when opening a pull request:

- Describe the change and the user-facing or API-facing behavior it affects.
- List verification commands run, especially `pnpm run test` or
  `pnpm run verify` for release-facing work.
- Call out public API, package export, browser bundle, trace, event, or
  recursive coordination impacts.
- Update docs and tests when public surfaces change.
- Keep generated `dist/` artifacts, local npm cache files, secrets, and tarballs
  out of commits unless a release process explicitly requires them.
