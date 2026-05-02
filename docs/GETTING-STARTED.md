<!-- generated-by: gsd-doc-writer -->
# Getting Started

## Prerequisites

Install these tools before working with the repository:

| Tool | Version | Source |
| --- | --- | --- |
| Node.js | `>=22` | `package.json` `engines.node` |
| pnpm | `10.33.0` | `package.json` `packageManager` |
| Git | Any current version | Required to clone the repository |

Dogpile also supports Bun latest as a runtime target, and the release validation
workflow tests the package on Bun latest.

## Installation Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/bubstack/dogpile.git
   ```

2. Enter the project directory:

   ```bash
   cd dogpile
   ```

3. Install dependencies from the lockfile:

   ```bash
   pnpm install
   ```

4. Build the package:

   ```bash
   pnpm run build
   ```

## First Run

Run the test suite after installing dependencies:

```bash
pnpm run test
```

For a release-quality local check, run:

```bash
pnpm run verify
```

`pnpm run verify` checks package identity, builds the package and browser
bundle, validates emitted artifacts, runs the packed quickstart smoke, performs
strict type checking, and runs the Vitest suite.

## Common Setup Issues

| Issue | Fix |
| --- | --- |
| `pnpm install` fails or uses a different package manager version | Enable Corepack and use the repository package manager declared in `package.json`: `corepack enable`, then rerun `pnpm install`. |
| TypeScript or Vitest fails on an older Node.js version | Switch to Node.js `>=22`, matching the `package.json` engine and CI matrix. |
| Browser smoke fails because `dist/` is stale | Run `pnpm run build` before `pnpm run browser:smoke`. |
| Packed quickstart smoke leaves temporary files you want to inspect | Set `DOGPILE_KEEP_CONSUMER_SMOKE=1` before running the smoke script. |

## Next Steps

- Read `docs/DEVELOPMENT.md` for local development workflow, scripts, style,
  and pull request expectations.
- Read `docs/TESTING.md` for Vitest commands, test layout, and CI coverage.
- Read `docs/ARCHITECTURE.md` for the runtime modules and data flow.
- Read `docs/CONFIGURATION.md` for package, TypeScript, browser bundle, and
  example environment settings.
