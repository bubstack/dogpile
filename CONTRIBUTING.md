<!-- generated-by: gsd-doc-writer -->
# Contributing

## Development Setup

See `docs/GETTING-STARTED.md` for prerequisites and first-run instructions, and
`docs/DEVELOPMENT.md` for local development setup, scripts, style, and pull
request expectations.

## Coding Standards

- Use strict ESM TypeScript with explicit `.js` extensions in relative imports.
- Run `pnpm run lint` or `pnpm run typecheck` before submitting TypeScript
  changes.
- Run `pnpm run test` for normal behavior changes and `pnpm run verify` before
  release-facing or packaging changes.
- Follow the style in `AGENTS.md`: two-space indentation, double quotes,
  semicolons, and strict exported type names.

## PR Guidelines

- Use a concise Conventional Commit-style subject such as `fix:`, `feat:`,
  `chore:`, `docs:`, or `ci:`.
- Describe what changed, why it changed, and which public SDK surfaces are
  affected.
- List the verification commands you ran.
- Add or update tests for behavior changes, public API changes, package export
  changes, browser bundle behavior, termination semantics, and trace semantics.
- Update documentation when changes affect public APIs, packaging, recursive
  coordination, runtime events, or examples.
- Do not commit secrets, generated tarballs, local cache contents, or unrelated
  generated files.

## Issue Reporting

Use GitHub Issues at `https://github.com/bubstack/dogpile/issues` for bugs,
feature requests, and documentation gaps.

For bug reports, include:

- The Dogpile version or commit you are using.
- Your runtime and package manager versions.
- A minimal reproduction or failing test.
- Expected behavior and actual behavior.
- Any relevant trace, event, or error output with credentials removed.

For feature requests, describe the SDK workflow you are trying to support, the
current workaround, and which public API or runtime contract you expect would
need to change.
