# Shared Core — Scoped Instructions

Applies to `src/main/core/**` in addition to root `AGENTS.md`.

Core must remain source-neutral.

Own shared lifecycle/infrastructure such as Workspace, Run/Job/Attempt, retry/resume/reconciliation, source registration, artifact/provenance coordination, validation coordination, readiness/freshness infrastructure, logging, and security abstractions.

Provider-specific resources, selectors, worksheet columns, query syntax, response fields, and semantic validation belong in source modules.

Do not add fake provider placeholders or provider-specific Core branches to satisfy an existing generic constraint.

Before changing a shared contract, inspect the live shared type/persistence boundary and only the directly affected canonical authority.

Persisted/schema changes require compatible deterministic migration/regression evidence.

Use focused deterministic Core tests; never add live provider calls to Core tests.
