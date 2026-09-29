# Shared Core — Codex Instructions

These instructions apply to `src/main/core/**` in addition to the repository root `AGENTS.md`.

## Boundary

Core owns source-neutral lifecycle and infrastructure behavior. It must not acquire provider-specific semantics merely because a new source needs them.

Core may own reusable concerns such as:

- Run / Job / Attempt lifecycle;
- retry, resume, reconciliation, and cancellation;
- source registration and readiness/freshness coordination;
- artifact state and storage abstractions;
- metadata/provenance infrastructure;
- validation coordination;
- credential/security abstractions;
- logging and export eligibility.

Provider-specific resources, fields, selectors, worksheet columns, query syntax, and semantic validators belong in source modules.

Do not add Core branches for concepts such as Google Ads campaign, keyword, search term, RSA, asset, Google Trends query group, GSC dimensions, SERP fields, or İkas columns unless the abstraction is demonstrably source-neutral.

## Contract safety

Before changing Core contracts, inspect:

- `DATA_CONTRACTS.md`;
- `ARCHITECTURE.md`;
- `TEST_STRATEGY.md`;
- current shared types in `src/shared/`;
- current SQLite migrations/repository behavior when persistence is affected.

Do not rename persisted IDs, statuses, enums, fields, IPC contracts, or snapshot shapes casually.

Persisted/schema changes require an explicit compatible migration path and deterministic migration/regression tests. Never use fake provider-specific placeholder values to satisfy a generic Core constraint.

## Evidence and retry

Keep execution result, validation result, and artifact eligibility distinct.

A retry creates a new Attempt and preserves previous attempts, artifacts, validations, and error evidence.

Do not recollect already completed accepted work merely to simplify orchestration.

## Testing

Test Core behavior with deterministic fake/source-neutral collaborators where practical.

Do not introduce live provider calls into Core tests.

For shared behavior changes, run focused Core tests first and the repository release gate before a checkpoint when impact is cross-source.
