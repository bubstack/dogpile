---
phase: 09-otel-tracing-bridge
plan: 03
subsystem: package-surface
tags: [otel, tracing, package-exports, tests, public-api]

requires:
  - phase: 09-otel-tracing-bridge
    provides: Engine tracing lifecycle
provides:
  - /runtime/tracing package subpath
  - Package exports assertions for tracing public surface
  - No-OTEL-import guard for runtime/browser/providers
  - Live OTEL tracing integration contract test
affects: [otel, package, tests, public-api]

tech-stack:
  added: []
  patterns:
    - Package export lockstep for new runtime subpath
    - WeakMap bridge from DogpileSpan wrappers to real OTEL spans
    - Live coordinator dispatch contract test for child span parentage

key-files:
  created:
    - src/tests/no-otel-imports.test.ts
    - src/tests/otel-tracing-contract.test.ts
  modified:
    - package.json
    - src/tests/package-exports.test.ts

key-decisions:
  - "The /runtime/tracing subpath is package-exported and included in source files."
  - "The OTEL contract test uses BasicTracerProvider({ spanProcessors: [...] }) to match the installed @opentelemetry/sdk-trace-base 2.7.1 API."
  - "The OTEL-02 test uses createDelegatingDeterministicProvider for live coordinator dispatch; no synthetic sub-run events are injected."

patterns-established:
  - "Real OTEL tests bridge DogpileSpan to OTEL Span via WeakMap so parent DogpileSpan objects can map to native OTEL parent context."
  - "Public tracing imports are checked from @dogpile/sdk/runtime/tracing, not only root exports."

requirements-completed: [OTEL-01, OTEL-02, OTEL-03]

duration: 8 min
completed: 2026-05-02
---

# Phase 09 Plan 03: Public Surface Lockstep Summary

**Package subpath, import guard, and live OTEL integration contract tests for the tracing bridge**

## Performance

- **Duration:** 8 min
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added `./runtime/tracing` to `package.json` exports with `types`, `import`, and `default` entries.
- Added `src/runtime/tracing.ts` to the package `files` array.
- Updated `src/tests/package-exports.test.ts` to assert the new subpath and type/value importability.
- Added `src/tests/no-otel-imports.test.ts` guarding `src/runtime`, `src/browser`, and `src/providers` against `@opentelemetry/*` imports.
- Added `src/tests/otel-tracing-contract.test.ts` using `InMemorySpanExporter` and a WeakMap bridge.
- Verified OTEL-01 span names/attributes, OTEL-02 live coordinator sub-run and child run parentage, and OTEL-03 no-tracer result shape.

## Task Commits

1. **Tasks 1-3: Lock tracing public surface and contracts** - `45e5478` (test)

## Files Created/Modified

- `package.json` - Adds `./runtime/tracing` export and source file inclusion.
- `src/tests/package-exports.test.ts` - Adds tracing subpath manifest expectations and type compatibility checks.
- `src/tests/no-otel-imports.test.ts` - Adds grep-style pure-runtime invariant for OTEL imports.
- `src/tests/otel-tracing-contract.test.ts` - Adds live OTEL span contract tests.

## Decisions Made

- Used the installed OpenTelemetry 2.7.1 constructor form: `new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })`.
- Used `ReadableSpan.parentSpanContext?.spanId` through a local `parentSpanId` helper, since this SDK version does not expose a `parentSpanId` property.
- Reused `createDelegatingDeterministicProvider` from Plan 09-00 for the live coordinator dispatch test.

## Deviations from Plan

None in behavior. Two API-shape adjustments were required to match installed OTEL types:

- `BasicTracerProvider` receives `spanProcessors` in its constructor.
- Parent span id assertions use `parentSpanContext?.spanId`.

## Verification

- `pnpm run build` - passed.
- `pnpm run typecheck` - passed after build emitted the new `dist/runtime/tracing.*` subpath artifacts.
- `pnpm vitest run src/tests/package-exports.test.ts src/tests/no-otel-imports.test.ts src/tests/otel-tracing-contract.test.ts` - passed, 42 tests.
- `pnpm run test` - passed: 56 files passed, 1 skipped; 737 tests passed, 1 skipped.

## Known Stubs

None.

## Next Phase Readiness

Ready for 09-04. The tracing public surface is wired and protected; docs lockstep can now describe the final contract.

## Self-Check: PASSED

- Found `./runtime/tracing` in `package.json`.
- Found `src/runtime/tracing.ts` in package files.
- Found `src/tests/no-otel-imports.test.ts`.
- Found `src/tests/otel-tracing-contract.test.ts`.
- Found commit `45e5478`.
- Build, typecheck, focused tests, and full tests passed.

---
*Phase: 09-otel-tracing-bridge*
*Completed: 2026-05-02*
