# Hugging Face Upload GUI Protocol Comparison

This example asks Dogpile to create plans for:

> Create a set of plans for a multi-platform Hugging Face GUI that wraps the large folder upload CLI in a GUI manager.

The goal is not to implement the GUI. The goal is to compare how the same mission flows through Dogpile's four protocol modes while checking paper-faithfulness against arXiv `2603.28990v1`.

The harness uses:

- anonymous agents, not pre-assigned product/platform/QA specialists
- autonomous selected-role output per turn
- visible contribute/abstain decisions
- two-round Broadcast configuration
- protocol-specific pass/fail checks for the information flow described by the paper

## Run

From the repository root:

```sh
pnpm run build
node examples/huggingface-upload-gui/run-all-protocols.mjs
```

The default provider is local and deterministic. It is deliberately shaped like a paper-faithfulness fixture so protocol differences and runner mismatches are easy to inspect without spending API tokens.

To run with a live OpenAI-compatible provider:

```sh
DOGPILE_EXAMPLE_PROVIDER=openai-compatible \
DOGPILE_EXAMPLE_MODEL=gpt-4.1-mini \
OPENAI_API_KEY=... \
node examples/huggingface-upload-gui/run-all-protocols.mjs
```

## Output

The script writes:

- `results/latest.json`: full run comparison data.
- `results/latest.md`: human-readable protocol comparison.

Each run captures:

- final protocol output
- transcript entries
- event counts and event types
- token and cost accounting
- paper-faithfulness checks and a smoke score
