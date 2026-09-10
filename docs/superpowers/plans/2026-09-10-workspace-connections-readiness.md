# Workspace Connections and Readiness Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Workspace-owned safe source-connection metadata, an injected credential availability port, and truthful source-keyed readiness lookup without implementing provider adapters or UI.

**Architecture:** Schema v8 stores one logical connection per `(workspace_id, source_id)` with opaque safe metadata and a credential reference only. A repository exposes Workspace-scoped CRUD; a small readiness registry combines that record with an injected credential store and source-owned evaluator. Existing SourceRegistry and provider behavior remain compatible.

**Tech Stack:** TypeScript, built-in `node:sqlite`, deterministic shell/CJS integration tests.

**Spec:** User-approved Workspace-owned Connection / Credential / Readiness boundary brief dated 2026-09-10.

## Global Constraints

- Never persist credential secret values in SQLite, snapshots, presets, Last Run Settings, source context, logs, provenance, or exports.
- Keep source-specific metadata and readiness semantics source-owned; Core only coordinates.
- Use schema v8 only; preserve v7 migration history.
- No provider adapters, OAuth flow, UI, export redesign, scheduler, or speculative account platform.
- Tests use an in-memory fake credential store and no live providers.

### Task 1: Schema v8 migration RED→GREEN

**Files:** `tests/integration/sqlite/schema-v8-migration.integration.cjs`, runner, `src/main/storage/database.ts`.

- [ ] Add a v7 fixture migration test asserting schema v8, one-per-Workspace logical connection uniqueness, Workspace FK, and no secret column/value.
- [ ] Run it and observe the expected v7-versus-v8 failure.
- [ ] Add `workspace_source_connections` with `(workspace_id, source_id)` uniqueness, `credential_ref`, safe metadata JSON object, timestamps, and restricted Workspace FK.
- [ ] Run the migration test green.

### Task 2: Connection persistence and credential port

**Files:** `src/shared/workspace-connection.ts`, `src/main/storage/state-repository.ts`, focused repository/readiness test.

- [ ] Define connection record/input and `CredentialStore` plus deterministic `InMemoryCredentialStore`.
- [ ] Add Workspace-scoped upsert/read/list methods; reject secret-like metadata keys and never accept secret values as fields.
- [ ] Add migration/persistence assertions for isolation and reopen persistence.

### Task 3: Source-keyed readiness vertical slice

**Files:** `src/shared/readiness.ts`, `src/main/core/readiness-registry.ts`, focused integration test.

- [ ] Define `READY`, `CONFIGURATION_REQUIRED`, `CONNECTION_REQUIRED`, and `MANUAL_ACTION_REQUIRED` result states.
- [ ] Register source-owned evaluators by source ID; unknown IDs fail closed.
- [ ] Resolve Workspace-scoped connection metadata and credential availability through the injected store.
- [ ] Verify configured/available, missing configuration, missing credential, unsupported source, cross-Workspace isolation, and no secret propagation into existing Run/Preset/Last Run serialization.

### Task 4: Compatibility, verification, and commits

- [ ] Update current schema assertions and relevant gate wiring to v8.
- [ ] Run focused tests, typecheck, lint, relevant Core/Google Trends gates, `git diff --check`, and the full release gate once.
- [ ] Commit technical changes, update `PROJECT_HANDOFF.md` with verified evidence, and create a separate handoff commit.
