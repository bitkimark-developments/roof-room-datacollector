# Source-Neutral Freshness Lifecycle Implementation Plan

**Goal:** Add a deterministic Core-compatible freshness boundary that derives last success only from accepted completed Jobs and exposes freshness independently from readiness, execution, and validation.

**Existing verified foundation:** Schema v8 already persists Workspace-owned Runs, source-keyed Jobs, terminal validation state, accepted artifact identity, and completion timestamps. The desktop already evaluates readiness separately. SerpApi is explicitly on-demand, and İkas/Keyword Planner CSV are explicit manual imports. No approved default cadence exists for the other sources.

**Architecture:** A pure freshness calculator evaluates a policy plus the latest accepted source completion at an injected clock. A repository query derives that completion without duplicating acceptance state. A registry resolves Workspace/source/config into a safe result. Default production policies are `ON_DEMAND` for SerpApi, `MANUAL_IMPORT` for the two FILE_IMPORT sources, and `UNKNOWN` elsewhere unless an explicit interval policy is present in safe source configuration. Desktop source cards display readiness and freshness as separate fields; freshness never starts work automatically.

**Spec:** `PROJECT_SPEC.md` sections 6, 9, and 10; `ARCHITECTURE.md` sections 4 and 11; `DATA_CONTRACTS.md` section 15; `TEST_STRATEGY.md` section 8; decision 33; Work Group 11 in `ROOFROOM_CODEX_DO_LIST.md`.

## Task 1: Lock the pure policy/state contract

- Define safe freshness states: `FRESH`, `DUE`, `STALE`, `IMPORT_NEEDED`, `ON_DEMAND`, and `UNKNOWN`.
- Define `UNKNOWN`, `ON_DEMAND`, `MANUAL_IMPORT`, and explicit bounded `INTERVAL` policies.
- Calculate interval `next_due_at` with an injected fixed clock; reject invalid/non-UTC timestamps and invalid policy bounds.
- Prove all required states and boundary instants with deterministic tests.

## Task 2: Derive acceptance history from existing Core state

- Add a Workspace/source repository query for the latest Job completed with an accepted artifact and accepted validation status.
- Do not add a duplicate freshness-success table or update freshness on download, collection, candidate persistence, rejected validation, failed Job, or cancelled Run.
- Prove rejected/no-artifact Jobs cannot advance last success and repository reopen returns the same result.

## Task 3: Compose policy and history in a registry

- Register one source policy evaluator per supported source and fail closed on unknown source IDs.
- Resolve safe optional interval policy from source configuration without provider-specific logic in the renderer.
- Use approved defaults only: SerpApi on-demand, manual CSV/XLSX import-needed until first accepted import, and unknown for sources without approved cadence.
- Prove GSC can be due while readiness is ready, an API source can be due while authentication is required, and SerpApi never becomes automatically scheduled.

## Task 4: Expose freshness separately in desktop source cards

- Extend safe desktop source-card IPC data with freshness status, latest accepted timestamp, and nullable next-due timestamp.
- Keep readiness as the only start prerequisite; freshness is informative and must not overwrite readiness or execution state.
- Display separate readiness and freshness labels on Home/Tasks and Task Detail.
- Add deterministic UI coverage for `IMPORT_NEEDED`, `ON_DEMAND`, `DUE`, and independent readiness.

## Task 5: Verify and checkpoint

- Run focused calculator/repository/registry/controller/UI tests, schema regressions, TypeScript, lint, diff checks, and the full release gate.
- Review for invented cadences, auto-scheduling, premature success updates, readiness coupling, secret exposure, and schema drift.
- Commit the technical checkpoint, update stable contracts where the now-implemented boundary changes prior “future/not implemented” statements, update `PROJECT_HANDOFF.md`, commit documentation separately, fast-forward local `main`, and rerun the release gate.
