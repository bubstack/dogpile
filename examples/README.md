# Dogpile Examples

This directory contains runnable protocol examples for the local Dogpile SDK checkout.

## Hugging Face Upload GUI Plans

`huggingface-upload-gui/run-all-protocols.mjs` runs the same planning mission across all four first-party protocols using a paper-faithfulness smoke harness:

- `sequential`
- `broadcast`
- `shared`
- `coordinator`

Run it from the repository root after building:

```sh
pnpm run build
node examples/huggingface-upload-gui/run-all-protocols.mjs
```

By default the example uses a local deterministic provider that emits paper-style autonomous role selection, contribution/abstention decisions, and protocol-alignment checks. This keeps the comparison repeatable without network access. To use a live OpenAI-compatible endpoint instead, set:

```sh
DOGPILE_EXAMPLE_PROVIDER=openai-compatible \
DOGPILE_EXAMPLE_MODEL=gpt-4.1-mini \
OPENAI_API_KEY=... \
node examples/huggingface-upload-gui/run-all-protocols.mjs
```

Optional endpoint overrides:

- `DOGPILE_EXAMPLE_BASE_URL`
- `DOGPILE_EXAMPLE_PATH`

The script writes comparison artifacts to `examples/huggingface-upload-gui/results/`.

## Recursive Coordination — Hugging Face Upload GUI Plan, with Delegation

`recursive-coordination/run.mjs` reuses the Hugging Face upload GUI planning mission and wraps it in a coordinator-with-delegate. Where the huggingface example compares the four protocols head-to-head, this example shows what changes when one of those coordinator runs *delegates* into a sub-mission of its own.

Run it from the repository root after building:

```sh
pnpm run build
node examples/recursive-coordination/run.mjs
```

The default provider is local and deterministic. It produces a repeatable mix of `delegate` decisions (including one intentionally-failing child and one local-provider clamp pass) so all of the v0.4.0 recursive-coordination surfaces (`sub-run-*` events, `parentRunIds` chain, structured failures, locality auto-clamp) are observable without spending API tokens. To use a live OpenAI-compatible endpoint instead, set:

```sh
DOGPILE_EXAMPLE_PROVIDER=openai-compatible \
DOGPILE_EXAMPLE_MODEL=gpt-4.1-mini \
OPENAI_API_KEY=... \
node examples/recursive-coordination/run.mjs
```

Optional endpoint overrides:

- `DOGPILE_EXAMPLE_BASE_URL`
- `DOGPILE_EXAMPLE_PATH`

The script writes comparison artifacts to `examples/recursive-coordination/results/`. See [`examples/recursive-coordination/README.md`](./recursive-coordination/README.md) for the full surface-by-surface walkthrough and [`docs/recursive-coordination.md`](../docs/recursive-coordination.md) for concepts.
