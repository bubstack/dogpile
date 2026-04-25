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
