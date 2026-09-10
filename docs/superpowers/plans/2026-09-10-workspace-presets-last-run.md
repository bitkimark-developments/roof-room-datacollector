# Workspace Saved Presets and Last Run Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Workspace-owned Saved Collection Presets and Last Run Settings and atomically reserve new Runs from an effective temporary draft while keeping the resolved Run Snapshot immutable.

**Architecture:** SQLite schema v7 stores opaque source-owned reusable JSON separately from existing immutable Run snapshots. `StateRepository` owns Workspace-scoped preset CRUD and one atomic product reservation transaction that inserts Run/Jobs and upserts Last Run Settings; existing low-level creation remains compatibility-only. The Google Trends Core runner becomes a caller of the reservation adapter without adding UI or provider behavior.

**Tech Stack:** TypeScript, `node:sqlite`, CommonJS integration fixtures, Bash 3.2-compatible runners.

**Spec:** `docs/superpowers/specs/2026-09-10-workspace-presets-last-run-design.md`

## Global Constraints

- Keep UI, credentials, provider adapters, readiness UI, export redesign, retention, scheduling/freshness, speculative generic configuration, and advanced preset history out of scope.
- Keep reusable configuration source-owned and JSON-compatible.
- Preserve schema-v1/v2 metadata, legacy snapshots, Workspace ownership, the exact active-Run set, and existing Google Trends/multi-source behavior.
- Add only the two approved new integration tests.
- Do not run confirmed live-provider commands.
- Create one technical commit, then one handoff-only commit.

---

### Task 1: Schema-v7 Migration

**Files:**
- Modify: `src/main/storage/database.ts`
- Create: `tests/integration/sqlite/schema-v7-migration.integration.cjs`
- Create: `tests/integration/sqlite/run-schema-v7-migration-test.sh`
- Modify: existing schema migration expectations that chain to the current version

**Interfaces:**
- Produces schema version `7`, `saved_collection_presets`, and `workspace_last_run_settings`.
- Preserves every schema-v6 Workspace/Run row unchanged and creates no synthetic preset/settings row.

- [ ] Write the v6 fixture migration test asserting both strict JSON-object stores, Workspace foreign keys, empty new tables, unchanged existing Run ownership/snapshot, migration history 7, and clean foreign keys.
- [ ] Run `npm run test:m2:schema-v7` and observe RED because the script/schema does not exist or initialization stops at schema 6.
- [ ] Add migration 7 and package script; update chained migration expectations from current schema 6 to 7.
- [ ] Run `npm run test:m2:schema-v7`, `npm run test:m2:schema-v6`, and `npm run test:m2:schema-v5` to GREEN.

### Task 2: Preset and Atomic Reservation Vertical Slice

**Files:**
- Create: `src/shared/collection-configuration.ts`
- Modify: `src/shared/run-job.ts`
- Modify: `src/main/storage/state-repository.ts`
- Create: `tests/integration/sqlite/saved-preset-run-reservation.integration.cjs`
- Create: `tests/integration/sqlite/run-saved-preset-run-reservation-test.sh`
- Modify: `package.json`

**Interfaces:**
- `createSavedCollectionPreset`, `getSavedCollectionPreset`, `listSavedCollectionPresets`, `updateSavedCollectionPreset`.
- `getLastRunSettings(workspaceId)`.
- `reserveRunFromJobPlans(input)` and `reserveRunFromQueryConfig(input)` require `reusable_configuration`; query-config reservation also requires `reference_date`.
- Existing `createRunFromJobPlans` and `createRunFromQueryConfig` remain compatibility-only.

- [ ] Write one real repository vertical slice: create Workspaces A/B; prove B cannot read/update A's preset; apply draft overrides; reserve A's Run; prove the preset is unchanged, Last Run Settings equals effective overrides, snapshot contains literal resolved dates/reference date, and a conflicting reservation rolls back settings; reserve B from blank settings; reopen and reassert ownership and relationships.
- [ ] Run `npm run test:m2:preset-reservation` and observe RED because the contracts/schema/repository APIs do not exist.
- [ ] Add the shared types, row mappers, identifier/JSON normalization, Workspace-scoped repository methods, and the atomic reservation transaction.
- [ ] Keep low-level creation on its existing compatibility behavior and make both new reservation adapters converge on one private transaction implementation.
- [ ] Run `npm run test:m2:preset-reservation` and `npm run test:m2:state` to GREEN.

### Task 3: Existing Product Start Compatibility

**Files:**
- Modify: `src/main/sources/google-trends/google-trends-core-runner.ts`
- Modify: `src/main/app/google-trends-desktop-controller-factory.ts`
- Modify: only directly affected deterministic GT fixtures/callers
- Modify: `tests/integration/m2-gate/run-integrated-m2-gate.sh`

**Interfaces:**
- Google Trends new Runs use `reserveRunFromQueryConfig`.
- Factory passes `{source_id, query_group_ids, period}` as source-owned reusable settings and the period reference date.
- Compatibility callers receive a deterministic credential-free fallback derived from current validated input.

- [ ] Change the GT Core runner to reserve through the atomic path and add the factory's source-owned reusable settings without changing IPC/UI.
- [ ] Wire both new integration tests into the M2 gate.
- [ ] Update only current-schema assertions and direct compile lists required by schema v7/new shared types.
- [ ] Run `npm run test:m3:gt-core-runner`, `npm run test:m3:gt-batch-core-runner`, `npm run test:m3:desktop-controller`, `npm run test:m2:multi-source-run`, and `npm run test:m2:gate`.

### Task 4: Stable Contracts and Technical Checkpoint

**Files:**
- Modify: `PROJECT_SPEC.md`
- Modify: `ARCHITECTURE.md`
- Modify: `DATA_CONTRACTS.md`
- Modify: `TEST_STRATEGY.md`
- Modify: `DECISIONS.md` with ADR-059
- Include: this design and plan

- [ ] Record schema v7, Workspace-owned Saved Presets, system-managed Last Run Settings, non-persisted Run Draft, immutable resolved Run Snapshot, atomic reservation semantics, migration behavior, secret boundary, and explicit non-goals.
- [ ] Run `npx tsc --noEmit`, `npm run lint`, `git diff --check`, both new tests, state, Workspace ownership, multi-source, GT Core/batch, desktop, export, and M2 gate.
- [ ] Run `npm run test:release:gate` once. Require final `PASS RELEASE-GATE-001`.
- [ ] Inspect status/diff for scope and preserve the two historical untracked files.
- [ ] Commit implementation, tests, gate wiring, design, plan, and stable documentation as `feat: add workspace saved presets`.

### Task 5: Separate Living Handoff

**Files:**
- Modify only: `PROJECT_HANDOFF.md`

- [ ] Record the actual technical commit hash and only observed verification evidence; state all non-goals and that no live provider ran.
- [ ] Run `git diff --check`, stage only `PROJECT_HANDOFF.md`, and commit as `docs: close saved presets checkpoint`.
- [ ] Confirm final `main` HEAD, clean tracked tree, and only the two protected historical untracked files.
