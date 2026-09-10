# RoofRoom Data Collector — Project Handoff

**Checkpoint date:** 2026-09-10

**Current milestone:** Release 1.0 multi-source foundation and source-adapter rollout

**Current stage:** Workspace identity and Run ownership Core slice implemented, deterministically verified, and technically committed

**Current goal:** Preserve the verified schema-v6 ownership checkpoint and require explicit approval before the next bounded implementation slice

---

## 1. Live repository state

Authoritative repository:

```text
/Users/furkan/Projects/roofroom-data-collector
```

Current branch:

```text
main
```

Technical HEAD recorded before this separate handoff documentation commit:

```text
26278fe09a1a609264e17c42165c94b16834cf4f
26278fe feat: add workspace run ownership
```

The technical checkpoint contains the approved plan, implementation, deterministic tests, gate wiring, and stable contract documentation. This handoff edit is intentionally separate.

## 2. Working tree and protected historical files

Immediately after technical commit `26278fe`, the tracked working tree was clean and only these pre-existing historical files remained untracked:

```text
?? CODEX_HANDOFF_CURRENT.md
?? PROJECT_HANDOFF.pre-20260820.md
```

Neither file was moved, deleted, staged, or rewritten during this slice.

Relevant closed checkpoints:

```text
9eb4595 feat: add source-neutral core job lifecycle
4384912 docs: close source-neutral core checkpoint
be081b6 feat: support multi-source jobs within one run
5a8edf0 docs: close multi-source run checkpoint
26278fe feat: add workspace run ownership
```

## 3. Product and scope boundary

RoofRoom Data Collector remains a local-first modular desktop collector:

```text
Collect → Preserve → Validate → Document → Export
```

Workspace is now a first-class Core identity for brand/business isolation. Every Run belongs to exactly one Workspace, while one Run may still contain independently source-keyed Jobs from multiple sources.

This checkpoint does not add Workspace UI or lifecycle screens, Presets, Last Run Settings, credential management, provider changes, multi-source application composition, generalized export, source-specific timeout work, or a new Cancel/Stop/Resume workflow.

Google Trends remains the only implemented production source. GSC, Google Ads Search Terms, Keyword Planner, İkas, Bitkimark XML, and SERP retain approved feasibility paths but no source implementation. Semrush is not active Release 1.0 scope.

## 4. Implemented Workspace and Run contract

Status labels describe committed code at `26278fe`, not intended future architecture.

| Area | State | Verified contract |
|---|---|---|
| SQLite schema | COMPLETE | schema version 6 |
| Workspace identity | COMPLETE for Core persistence | `workspace_id`, non-empty `workspace_name`, and `created_at` |
| Run ownership | COMPLETE | every new and migrated Run has required `runs.workspace_id` with restricted Workspace FK |
| One-active-Run rule | COMPLETE | database partial unique index covers exactly `PENDING`, `RUNNING`, and `MANUAL_ACTION_REQUIRED` |
| Repository conflict mapping | COMPLETE | conflicts surface as `WorkspaceActiveRunError` / `WORKSPACE_ACTIVE_RUN_EXISTS` with Workspace and active Run identity |
| Retry-required state | COMPLETE | failed-but-retryable idle Runs aggregate to non-terminal, inactive `RETRY_REQUIRED` |
| Atomic retry | COMPLETE | Workspace reacquisition, Run transition, Job transition, and Attempt creation share one `BEGIN IMMEDIATE` transaction |
| Retry conflict rollback | COMPLETE | ownership conflict leaves Run, Job, attempt count, and history unchanged |
| Restart/reconciliation scope | COMPLETE | incomplete discovery and `planRun` require Workspace identity and cross-Workspace lookup fails closed |
| Multi-source Core compatibility | COMPLETE | source-keyed collection/validation, snapshots, sibling independence, and failed-only retry remain verified |
| Google Trends compatibility | COMPLETE | current Core/batch/controller/export and deterministic provider-boundary suites pass |
| Workspace product UI | NOT IMPLEMENTED | no selector, manager, settings, or renderer contract was added |
| Presets / Last Run Settings | NOT IMPLEMENTED | no persistence or UI was added |
| Credential/freshness lifecycle | NOT IMPLEMENTED | no credential, connection, freshness, or scheduler tables/workflows were added |

Current persisted contract facts:

```text
SQLite schema version: 6
tables: schema_migrations, workspaces, runs, jobs, attempts, artifacts, validations
runs.workspace_id: required FK to workspaces.workspace_id
active Run statuses: PENDING, RUNNING, MANUAL_ACTION_REQUIRED
inactive non-terminal retry status: RETRY_REQUIRED
active-slot index: ux_runs_one_active_per_workspace
job uniqueness: run_id + source_id + job_key
jobs.query_group_id: nullable; Google-Trends/legacy-specific
errors table: not implemented
credential/freshness tables: not implemented
```

## 5. Schema-v6 migration and compatibility

Schema v6 preserves schema-v5 multi-source data and adds Workspace ownership without changing legacy snapshot shapes.

Migration behavior proven by deterministic fixtures:

- creates strict `workspaces` storage;
- creates one deterministic `ws_development_migration` row;
- attaches every pre-v6 Run to that technical Workspace;
- preserves existing Run, Job, Attempt, Artifact, Validation, source, context, and snapshot evidence;
- maps an idle schema-v5 `RUNNING` Run with retry-eligible failed work to `RETRY_REQUIRED`;
- leaves genuinely pending, active, or manual work active;
- rejects multiple migrated active Runs before installing the unique index;
- rolls the entire migration back to schema v5 on that conflict;
- re-enables and verifies foreign-key integrity.

`ws_development_migration` is migration/runtime technical compatibility only. It is not a customer-facing default, a legacy mode, a nullable ownership exception, or a permanent product concept. New repository Run APIs require an explicit `workspace_id`.

Legacy Google Trends snapshots, generic single-source snapshots, and the schema-v5 multi-source `sources` snapshot remain readable unchanged.

## 6. Retry ownership and recovery behavior

The implemented lifecycle is:

```text
active Run completes all immediately executable work
→ retry-eligible failed Job remains
→ Run becomes RETRY_REQUIRED and releases the Workspace active slot
→ explicit retry begins one repository transaction
→ verify Run/Job eligibility and attempt limit
→ verify no other active Run owns the Workspace
→ Run becomes RUNNING
→ Job moves through RETRY_PENDING to RUNNING
→ next immutable Attempt is inserted
→ commit all changes together
```

If another Run owns the Workspace, the transaction rolls back without changing retry evidence. If the attempt limit is exhausted, no Attempt is created and the Run remains `RETRY_REQUIRED`.

Restart discovery is no longer global. `listIncompleteRuns(workspace_id)`, `discoverIncompleteRuns(workspace_id)`, and `planRun(workspace_id, run_id)` enforce the same ownership boundary. The Google Trends resume adapter loads the persisted Run first and scopes planning with its recorded Workspace.

## 7. Verification status

Focused RED evidence was observed before implementation, including:

```text
schema-v6 migration: expected schema 6, observed schema 5
Workspace persistence: shared Workspace contract missing
one-active-Run mapping: raw SQLite unique-constraint error instead of typed ownership error
Run lifecycle: retryable idle Run remained RUNNING instead of RETRY_REQUIRED
atomic retry: retry incorrectly started while another Run owned the Workspace
Workspace recovery: global discovery returned another Workspace's Run
```

Focused closure verification passed:

```text
npx tsc --noEmit
npm run lint
git diff --check
npm run test:m2:schema-v6
npm run test:m2:workspace-ownership
npm run test:m2:runs
npm run test:m2:reconcile
npm run test:m2:resume
npm run test:m2:multi-source-run
npm run test:m2:gate
```

Observed focused evidence includes:

```text
PASS DB-MIGRATION-006
PASS WORKSPACE-RUN-001
PASS RETRY-006: Workspace reacquisition, Job transition, and Attempt creation are atomic
PASS WORKSPACE-003: cross-Workspace resume planning fails closed
PASS MULTI-SOURCE-RUN-001
PASS M2-GATE-001..008 plus schema-v6, ownership, source-neutral, validator-registry, and multi-source checks
```

Full deterministic release gate:

```text
npm run test:release:gate
PASS RELEASE-GATE-001: deterministic Core, Google Trends, desktop file access, configuration, validation, and export gates completed
```

The first sandboxed release-gate attempt reached its deterministic localhost-server test and was denied with `listen EPERM 127.0.0.1`. The identical gate was rerun with local-loopback permission; it exited 0 and emitted the required final PASS line. This was an execution-environment permission boundary, not a product assertion failure.

No live-provider command ran and no provider quota was consumed. Live-provider verification is not claimed.

Not run or claimed:

```text
npm run package
npm run make
any confirmed m3:live-* command
any GSC/Google Ads/Keyword Planner/SerpApi/provider request
```

## 8. Remaining application/source boundaries

The following remain intentionally outside this checkpoint:

1. Workspace creation/selection/management in the desktop UI.
2. Saved Presets and Last Run Settings.
3. Connection profiles, credentials, OAuth/API-key lifecycle, and freshness.
4. Production composition of sources beyond Google Trends.
5. Generalized multi-source Run Setup, Review, Results, and export/package behavior.
6. Source-specific timeout policy, scheduling, and retention.
7. New user-facing Cancel/Stop/Resume behavior.
8. New provider adapters or live acceptance.

The current Google Trends desktop/runtime composition receives the technical compatibility Workspace internally. That wiring exposes no Workspace product behavior and must not be treated as the final Workspace selection model.

## 9. Completed areas that remain closed

Unless new failing evidence or explicit scope approval appears, do not reopen or rewrite:

- schema-v6 Workspace/Run ownership and the exact active status set;
- the partial unique active-Run index and typed repository conflict;
- `RETRY_REQUIRED` as non-terminal and inactive;
- atomic retry reacquisition and immutable Attempt history;
- Workspace-scoped restart discovery and reconciliation;
- source-keyed collection and fail-closed validator dispatch;
- generic `job_key`, nullable GT-specific `query_group_id`, and persisted `source_context`;
- raw-evidence immutability, missing-not-zero, and execution/validation separation;
- schema-v1/v2 metadata and legacy snapshot compatibility;
- Google Trends relative-interest and comparison-group semantics;
- current provider selector, wait, refresh/retry, navigation, browser-profile, and security behavior.

## 10. Exact recommended next action

No next implementation slice is approved by this checkpoint.

First review technical commit `26278fe` and this handoff commit. Then choose one bounded Release 1.0 application or source-adapter slice and perform a fresh read-only audit against `PROJECT_SPEC.md` and current repository evidence. Require explicit scope approval and a RED-first plan before changing code.

Do not infer authorization for Workspace UI, Presets, Last Run Settings, credentials, provider work, export generalization, or additional hardening from this checkpoint.

## 11. Epistemic checkpoint

### PROVEN FACT

- Technical commit `26278fe` implements schema-v6 first-class Workspace ownership.
- Every Run has a required Workspace FK.
- SQLite and repository transactions enforce one active Run per Workspace.
- `RETRY_REQUIRED` releases the active slot without becoming terminal.
- Explicit retry atomically reacquires ownership, transitions the Job, and creates the next Attempt.
- Retry conflicts roll back without partial state changes.
- Restart discovery and resume planning are Workspace-scoped and cross-Workspace lookup fails closed.
- Existing source-neutral, multi-source, Google Trends, desktop, and export deterministic contracts pass.
- TypeScript, lint, diff checks, focused gates, the integrated M2 gate, and the full deterministic release gate passed.
- No live-provider command ran.
- The two historical untracked files remain untouched.

### INFERENCE

- A future user-facing Workspace flow can build on this ownership contract without weakening the database invariant. This is architectural direction, not an implemented or approved slice.

### UNTESTED HYPOTHESIS

- The current technical compatibility Workspace can be retired cleanly when an explicitly designed Workspace selection/lifecycle flow exists.
- Future source adapters and generalized multi-source desktop/export composition will require no changes to the schema-v6 ownership contract.
- Unimplemented sources and live Google Trends configurations work against providers; no live acceptance was performed here.

## 12. Handoff discipline

Keep implementation, targeted deterministic verification, full release-gate verification, live-provider verification, and committed state as separate claims. This handoff authorizes no additional implementation or live call.

## 13. Schema-v7 Saved Presets / Last Run Settings checkpoint — 2026-09-10

Technical implementation commit:

`f954f57 feat: add workspace collection presets`

Implemented and verified:

- SQLite schema v7.
- Workspace-owned Saved Collection Presets.
- One Last Run Settings record per Workspace.
- Workspace-isolated preset/settings persistence.
- Temporary TypeScript-only RunDraft contract.
- Run-only overrides do not mutate Saved Presets.
- Effective reusable configuration is persisted as Last Run Settings.
- Immutable resolved Run Snapshot remains separate and supports reference_date.
- Run, Jobs, and Last Run Settings use the atomic reservation boundary with rollback on failed reservation.
- Google Trends remains compatible with reusable relative-period settings and resolved absolute Run dates.
- Repository reopen preserves the new relationships.
- Existing Workspace ownership, source-neutral Core, multi-source behavior, and Google Trends deterministic contracts remain compatible.

Verification passed:

- npm run lint
- focused M2/Core/Google Trends deterministic tests
- npm run test:m2:gate
- npm run test:release:gate
- git diff --check
- PASS RELEASE-GATE-001

No live-provider calls ran.

Next major MVP checkpoint: Workspace-owned Connection / Credential / Readiness boundary.

After that, implementation priority is driven by the locked BLOG-WEEK-2026-09-10 collection scope.

The two historical untracked files remain intentionally untouched.
