<!-- generated-by: gsd-doc-writer -->
# Configuration

## Environment Variables

Dogpile SDK core does not read environment variables. Provider credentials,
routing, retries, pricing, and failover belong to caller-owned provider objects.
The repository does contain example and live-test environment variables:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DOGPILE_KEEP_CONSUMER_SMOKE` | Optional | unset | Keeps the temporary consumer project created by `scripts/consumer-import-smoke.mjs`. |
| `DOGPILE_EXAMPLE_PROVIDER` | Optional | `deterministic` in `examples/recursive-coordination/run.mjs` | Selects deterministic or OpenAI-compatible providers for example scripts. |
| `DOGPILE_EXAMPLE_MODEL` | Optional | example-specific | Sets the model id used by OpenAI-compatible examples. |
| `OPENAI_API_KEY` | Optional | unset | Credential consumed by example scripts when they construct an OpenAI-compatible provider. |
| `DOGPILE_EXAMPLE_API_KEY` | Optional | unset | Alternate credential name used by `examples/huggingface-upload-gui/run-all-protocols.mjs`. |
| `DOGPILE_EXAMPLE_BASE_URL` | Optional | adapter default | Overrides the OpenAI-compatible endpoint base URL in examples. |
| `DOGPILE_EXAMPLE_PATH` | Optional | adapter default | Overrides the OpenAI-compatible request path in examples. |
| `DOGPILE_VERCEL_AI_LIVE_MODEL` | Optional | `openai/gpt-4.1-mini` | Selects the model for `src/internal/vercel-ai-provider.live.test.ts`. |
| `AI_GATEWAY_API_KEY` | Optional | unset | Enables the Vercel AI live provider test when present. |
| `VERCEL` | Optional | unset | Allows the Vercel AI live provider test to run in Vercel environments. |
| `VERCEL_OIDC_TOKEN` | Optional | unset | Allows the Vercel AI live provider test to run with Vercel OIDC credentials. |

## Config File Format

The project uses package and tool configuration files rather than an application
runtime config file.

| File | Purpose |
| --- | --- |
| `package.json` | Package metadata, export map, publish files, scripts, dependency versions, and Node engine requirement. |
| `tsconfig.json` | Strict TypeScript checking for source and tests with `noEmit`. |
| `tsconfig.build.json` | Build configuration that emits JavaScript, declarations, maps, and source maps to `dist/`. |
| `vite.browser.config.ts` | Browser ESM bundle configuration for `dist/browser/index.js`. |
| `.github/workflows/release-validation.yml` | Pull request and branch validation across Node.js, Bun, browser smoke, packed quickstart smoke, and pack checks. |
| `.github/workflows/npm-publish.yml` | npm publish workflow for GitHub releases and manual dry runs. |

`package.json` is the central project configuration. Its relevant top-level
settings are:

```json
{
  "name": "@dogpile/sdk",
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "engines": {
    "node": ">=22"
  }
}
```

## Required vs Optional Settings

| Setting | Required | Evidence |
| --- | --- | --- |
| Node.js `>=22` | Required for development and package validation | `package.json` declares `engines.node`. |
| pnpm `10.33.0` | Required for lockfile-compatible repository workflows | `package.json` declares `packageManager`. |
| Provider credentials | Optional for SDK core | Credentials are passed by caller-owned provider objects, not read globally by Dogpile. |
| Example provider environment variables | Optional | Example scripts fall back to deterministic providers unless live endpoint settings are supplied. |

No `.env.example`, `.env.sample`, `.env.development`, `.env.production`, or
`.env.test` file is present in this repository.

## Defaults

| Setting | Default | Defined in |
| --- | --- | --- |
| High-level protocol | `sequential` | `src/runtime/engine.ts` |
| High-level tier | `balanced` | `src/runtime/engine.ts` |
| Engine max depth | `4` | `src/runtime/engine.ts` |
| Engine max concurrent children | `4` | `src/runtime/engine.ts` |
| OpenAI-compatible base URL | `https://api.openai.com/v1` | `src/providers/openai-compatible.ts` |
| OpenAI-compatible path | `/chat/completions` | `src/providers/openai-compatible.ts` |
| Browser bundle output | `dist/browser/index.js` | `vite.browser.config.ts` |

## Per-Environment Overrides

Dogpile is a library, so it has no deployment-time staging or production config
loader. Consumers select environment-specific provider credentials and endpoints
when constructing their own `ConfiguredModelProvider`.

Repository examples demonstrate that pattern by reading optional variables in
the example script, constructing a provider, and passing the provider object to
Dogpile. The SDK runtime receives only the provider object and does not read the
process environment.
