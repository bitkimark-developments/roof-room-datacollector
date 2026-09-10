# Workspace Identity and One-Active-Run Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add schema-v6 Workspace identity, require every Run to belong to exactly one Workspace, and enforce at most one actively collecting Run per Workspace without weakening multi-source Run, retry, or restart semantics.

**Architecture:** Persist minimal Workspace identity in a strict `workspaces` table and attach every Run through a required foreign key. Represent an idle failed-but-retryable Run as non-terminal `RETRY_REQUIRED`, enforce the active set (`PENDING`, `RUNNING`, `MANUAL_ACTION_REQUIRED`) with a partial unique SQLite index, and use `BEGIN IMMEDIATE` repository transactions for both initial Run creation and atomic retry reacquisition. Keep the deterministic development Workspace confined to pre-Workspace migration/runtime compatibility; it is a normal row, not a legacy product type or nullable exception.

**Tech Stack:** TypeScript 5.9, Node.js built-in `node:sqlite`, SQLite STRICT tables and partial indexes, Bash 3.2-compatible integration runners, Node `assert`, Electron/Vite project tooling.

**Spec:** `PROJECT_HANDOFF.md`, `/Users/furkan/.codex/attachments/f2db2eca-56f3-498a-a634-b3256a806788/pasted-text.txt`, and the approved Workspace ownership audit in the 2026-09-10 Codex task.

## Global Constraints

- Advance the SQLite schema from version `5` to exactly version `6`; do not rewrite migrations 1-5.
- Persist Workspace identity as `workspace_id`, `workspace_name`, and `created_at` only.
- Require `runs.workspace_id TEXT NOT NULL` with `ON UPDATE RESTRICT` and `ON DELETE RESTRICT` foreign-key behavior.
- Every new Run creation API requires an explicit `workspace_id`; do not infer ownership from source configuration, snapshots, or Job context.
- Add non-terminal Run status `RETRY_REQUIRED` because current `RUNNING` conflates active work with idle retry choice.
- Define the active set exactly as `PENDING`, `RUNNING`, and `MANUAL_ACTION_REQUIRED`.
- Enforce at most one active Run per Workspace with both a repository `BEGIN IMMEDIATE` transaction and a SQLite partial unique index.
- Retry ownership reacquisition, `FAILED -> RETRY_PENDING -> RUNNING` Job transition, and new Attempt insertion must commit or roll back together in one repository transaction.
- A Run in `RETRY_REQUIRED` does not block a new Run, but retrying it must fail without mutation while another Run owns the Workspace active slot.
- `MANUAL_ACTION_REQUIRED` continues to own the active slot until existing Core logic resumes, fails, or cancels it; add no user-facing workflow.
- Keep retry within the same Run and preserve all prior Attempt, artifact, validation, and metadata evidence.
- Keep one multi-source Run contract, Job identity, source-keyed collector/validator dispatch, schema-v1/v2 metadata compatibility, and GT relative-interest semantics unchanged.
- Treat `ws_development_migration` as a deterministic pre-Workspace compatibility row only. Do not add a legacy/default Workspace enum, flag, nullable path, UI label, or product rule around it.
- Make no live provider calls.
- Do not generalize Google Trends UI, export, browser runtime, provider behavior, or source composition.
- Do not implement Workspace UI, Workspace update/delete, Presets, Last Run Settings, connections, credentials, readiness UI, export retention, timeout policies, new providers, or scheduling.
- Do not add a new user-facing Cancel, Stop, Resume, or recovery workflow. Existing internal cancellation and restart/reconciliation behavior may only be adapted to required Workspace ownership.
- Preserve `CODEX_HANDOFF_CURRENT.md` and `PROJECT_HANDOFF.pre-20260820.md` untouched and untracked.
- For every behavior change: write one real failing integration test, run it and observe the expected failure, implement only enough to pass, then rerun the focused test before refactoring.

## Planned File Structure

**Create:**

- `src/shared/workspace.ts` — minimal Workspace record and creation input.
- `tests/integration/sqlite/schema-v6-migration.integration.cjs` — v5→v6 preservation, retry-state normalization, technical compatibility, index, and rollback cases.
- `tests/integration/sqlite/run-schema-v6-migration-test.sh` — isolated schema-v6 migration runner.
- `tests/integration/sqlite/workspace-run-ownership.integration.cjs` — repository ownership, same/different Workspace, direct-DB constraint, and reopen cases.
- `tests/integration/sqlite/run-workspace-run-ownership-test.sh` — focused Workspace ownership runner.

**Modify:**

- `src/shared/run-job.ts` — `workspace_id` on `RunRecord` and `RETRY_REQUIRED` in `RunStatus`.
- `src/main/storage/database.ts` — migration 6, required FK, status CHECK, deterministic compatibility row, and partial unique index.
- `src/main/storage/state-repository.ts` — Workspace CRUD-minimum reads/creation, required Run ownership, typed active conflict, scoped queries, and atomic retry operation.
- `src/main/core/run-execution-state-machine.ts` — `RETRY_REQUIRED` transitions and non-terminal classification.
- `src/main/core/run-manager.ts` — derive `RETRY_REQUIRED` only at the stable failed/retry-pending boundary.
- `src/main/core/reconciliation-coordinator.ts` — delegate explicit retry to the atomic repository operation.
- `src/main/core/resume-planner.ts` — require Workspace-scoped incomplete-Run discovery.
- `src/main/core/collection-orchestrator.ts` — preserve `RETRY_REQUIRED` as the explicit retry stopping boundary.
- `src/main/sources/google-trends/google-trends-core-runner.ts` — pass explicit Workspace ownership and use atomic retry without changing provider behavior.
- `src/main/app/google-trends-desktop-controller-factory.ts` and `src/main.ts` — inject only the migration compatibility Workspace into the current pre-Workspace runtime composition; expose no new UI behavior.
- Existing Core, SQLite, orchestration, reconciliation, resume, GT runner, export, and M2 fixtures that create Runs — supply explicit Workspace ownership and retain their original assertions.
- `package.json`, `tests/integration/m2-gate/run-integrated-m2-gate.sh`, and the existing schema migration runner/test — wire schema-v6 and Workspace ownership into deterministic gates.
- `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `DATA_CONTRACTS.md`, `TEST_STRATEGY.md`, `DECISIONS.md`, and finally `PROJECT_HANDOFF.md` — record only verified behavior.

---

### Task 1: Define and Migrate the Schema-v6 Ownership Contract

**Files:**
- Create: `tests/integration/sqlite/schema-v6-migration.integration.cjs`
- Create: `tests/integration/sqlite/run-schema-v6-migration-test.sh`
- Modify: `tests/integration/sqlite/schema-v5-migration.integration.cjs`
- Modify: `tests/integration/sqlite/run-schema-v5-migration-test.sh`
- Modify: `src/main/storage/database.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: schema-v5 `runs`, `jobs`, `attempts`, `artifacts`, and `validations`; `initializeDatabase(directories)`.
- Produces: schema version `6`, strict `workspaces`, required `runs.workspace_id`, `RETRY_REQUIRED` persistence, `ux_runs_one_active_per_workspace`, and deterministic migration failure without partial writes.

- [ ] **Step 1: Write the schema-v6 migration test**

Build a real schema-v5 fixture containing:

```text
completed Run         -> remains COMPLETED
stable retry Run      -> RUNNING with FAILED Job and no pending/active/manual Job
manual Run            -> remains MANUAL_ACTION_REQUIRED
all Runs              -> retain existing Jobs/Attempts/Artifacts/Validations
```

After `initializeDatabase`, assert these literal effects:

```js
assert.equal(bootstrap.status, 'READY');
assert.equal(bootstrap.schema_version, 6);
assert.equal(bootstrap.migrations_applied, 6);

assert.deepEqual(
  migrated.prepare(`
    SELECT workspace_id, workspace_name, created_at
    FROM workspaces
    ORDER BY workspace_id
  `).all(),
  [{
    workspace_id: 'ws_development_migration',
    workspace_name: 'Development migration workspace',
    created_at: '1970-01-01T00:00:00.000Z',
  }],
);

const retryRun = migrated.prepare(`
  SELECT workspace_id, run_status
  FROM runs
  WHERE run_id = 'rr_retry_fixture'
`).get();
assert.equal(retryRun.workspace_id, 'ws_development_migration');
assert.equal(retryRun.run_status, 'RETRY_REQUIRED');
assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(), []);
```

Assert `PRAGMA table_info('runs')` reports `workspace_id` as not-null, `PRAGMA foreign_key_list('runs')` points to `workspaces`, and `sqlite_master` contains `ux_runs_one_active_per_workspace`.

Create a second v5 fixture with two `PENDING` Runs. Assert initialization returns `ERROR`, its message names conflicting active development Runs, `PRAGMA user_version` remains `5`, and no `workspaces` table or migration-6 record survives the rollback.

- [ ] **Step 2: Run the schema-v6 runner and verify RED**

Run:

```bash
bash tests/integration/sqlite/run-schema-v6-migration-test.sh
```

Expected: FAIL because initialization still ends at schema version 5 and `workspaces` does not exist.

- [ ] **Step 3: Implement migration 6 as one fail-closed migration**

In `database.ts`, set `CURRENT_SCHEMA_VERSION = 6` and keep migrations 1-5 byte-for-byte unchanged. Add private constants:

```ts
export const MIGRATION_COMPATIBILITY_WORKSPACE_ID =
  'ws_development_migration';

const MIGRATION_COMPATIBILITY_WORKSPACE_NAME =
  'Development migration workspace';

const MIGRATION_COMPATIBILITY_WORKSPACE_CREATED_AT =
  '1970-01-01T00:00:00.000Z';
```

The ID is exported only so the pre-Workspace application composition can pass explicit ownership. Do not add an `is_legacy`, `is_default`, or Workspace-kind column.

`migrateToVersion6` must:

1. Disable foreign keys before the transaction, then `BEGIN IMMEDIATE`.
2. Create the strict `workspaces` table and insert the one deterministic technical row.
3. Create `runs_v6` with `workspace_id TEXT NOT NULL`, the Workspace FK, and the existing columns/checks plus `RETRY_REQUIRED`.
4. Copy Runs with `workspace_id = 'ws_development_migration'`.
5. Change old `RUNNING` to `RETRY_REQUIRED` only when at least one Job is `FAILED` or `RETRY_PENDING` and no Job is `PENDING`, `RUNNING`, `VALIDATING`, or `MANUAL_ACTION_REQUIRED`.
6. Replace `runs`, preserving every `run_id` referenced by child tables.
7. Preflight grouped active counts and throw if any Workspace has more than one `PENDING`, `RUNNING`, or `MANUAL_ACTION_REQUIRED` Run.
8. Create the partial unique index:

```sql
CREATE UNIQUE INDEX ux_runs_one_active_per_workspace
ON runs(workspace_id)
WHERE run_status IN (
  'PENDING',
  'RUNNING',
  'MANUAL_ACTION_REQUIRED'
);
```

9. Require an empty `PRAGMA foreign_key_check`, insert migration record `6 / workspace_run_ownership`, set `user_version = 6`, and commit.
10. Roll back on any failure and restore `PRAGMA foreign_keys = ON` in `finally`.

- [ ] **Step 4: Keep the chained v4 migration test meaningful**

Update the existing v4 fixture test to expect final schema 6, six migration records, the technical Workspace assignment, and intact schema-v5 `source_context_json`. Rename only its PASS text to:

```text
PASS DB-MIGRATION-005/006: schema-v4 GT lifecycle data survives chained schema-v5 and schema-v6 migrations
```

- [ ] **Step 5: Run both migration tests and verify GREEN**

Run:

```bash
npm run test:m2:schema-v5
npm run test:m2:schema-v6
```

Require both dedicated PASS lines and no foreign-key problems. Keep the slice uncommitted until the complete cross-layer contract passes Task 8.

### Task 2: Persist Minimal Workspaces and Require Run Ownership

**Files:**
- Create: `src/shared/workspace.ts`
- Modify: `src/shared/run-job.ts`
- Modify: `src/main/storage/state-repository.ts`
- Modify: `tests/integration/sqlite/state-repository.integration.cjs`
- Modify: `tests/integration/sqlite/run-state-repository-test.sh`

**Interfaces:**
- Consumes: schema-v6 `workspaces` and `runs.workspace_id`.
- Produces: `WorkspaceRecord`, `CreateWorkspaceInput`, `StateRepository.createWorkspace`, `getWorkspace`, `listWorkspaces`, and required `workspace_id` in both Run-creation inputs and returned `RunRecord`.

- [ ] **Step 1: Write failing Workspace and Run-ownership repository cases**

Add literal behavior assertions:

```js
const workspace = repository.createWorkspace({
  workspace_name: 'Brand A',
});

assert.match(workspace.workspace_id, /^ws_\d{8}T\d{9}Z_[0-9a-f]{6}$/);
assert.equal(workspace.workspace_name, 'Brand A');
assert.deepEqual(repository.getWorkspace(workspace.workspace_id), workspace);

const created = repository.createRunFromJobPlans({
  workspace_id: workspace.workspace_id,
  application_version: '1.0.0',
  configuration_snapshot: { schema_version: 1 },
  job_plans: [{
    source_id: 'fake-source',
    job_key: 'alpha',
    query_group_id: null,
    source_context: { fixture_id: 'alpha' },
  }],
});

assert.equal(created.run.workspace_id, workspace.workspace_id);
assert.equal(
  repository.getRun(created.run.run_id).workspace_id,
  workspace.workspace_id,
);
```

Also assert empty names fail, omitting `workspace_id` fails rather than selecting a Workspace implicitly, an unknown `workspace_id` fails without inserting a Run or Job, and both `createRunFromQueryConfig` and `createRunFromJobPlans` require ownership.

- [ ] **Step 2: Run the repository test and verify RED**

Run `npm run test:m2:state`.

Expected: TypeScript compilation or runtime failure because Workspace types/APIs and `RunRecord.workspace_id` do not exist.

- [ ] **Step 3: Add the minimal Workspace types**

Create `src/shared/workspace.ts`:

```ts
export interface WorkspaceRecord {
  workspace_id: string;
  workspace_name: string;
  created_at: string;
}

export interface CreateWorkspaceInput {
  workspace_name: string;
}
```

Add `workspace_id: string` to `RunRecord`, `CreateRunInput`, and `CreateRunFromJobPlansInput`. Normalize it with the existing non-empty-string discipline and carry it unchanged through the query-config adapter.

- [ ] **Step 4: Implement repository Workspace persistence and Run mapping**

Generate opaque Workspace IDs with the same timestamp/random-suffix discipline as Run IDs but prefix `ws_`. Implement:

```ts
createWorkspace(input: CreateWorkspaceInput): WorkspaceRecord;
getWorkspace(workspaceId: string): WorkspaceRecord | null;
listWorkspaces(): WorkspaceRecord[];
```

`createWorkspace` trims `workspace_name`, inserts in `BEGIN IMMEDIATE`, and returns the persisted row. `listWorkspaces` orders by `created_at, workspace_id`.

Add `workspace_id` to every Run INSERT, SELECT, row mapper, and returned record. Let the schema-v6 FK reject unknown IDs and roll back Run plus Jobs together.

- [ ] **Step 5: Adapt this focused fixture without weakening ownership**

Use a distinct explicit Workspace for each simultaneously incomplete Run already created by `state-repository.integration.cjs`. Do not fall back to the migration Workspace inside repository APIs.

- [ ] **Step 6: Run the repository test and verify GREEN**

Run `npm run test:m2:state` and require the existing DB PASS lines plus new Workspace ownership PASS output. Keep the slice uncommitted until the complete cross-layer contract passes Task 8.

### Task 3: Enforce One Active Run per Workspace Below the UI

**Files:**
- Create: `tests/integration/sqlite/workspace-run-ownership.integration.cjs`
- Create: `tests/integration/sqlite/run-workspace-run-ownership-test.sh`
- Modify: `src/main/storage/state-repository.ts`
- Modify: `package.json`
- Modify: `tests/integration/m2-gate/run-integrated-m2-gate.sh`

**Interfaces:**
- Consumes: `CreateRunFromJobPlansInput.workspace_id` and schema-v6 partial unique index.
- Produces: `WorkspaceActiveRunError` with code `WORKSPACE_ACTIVE_RUN_EXISTS`, same-Workspace exclusion, different-Workspace independence, and restart-safe enforcement.

- [ ] **Step 1: Write the failing ownership and double-Start test**

Use two `StateRepository` instances opened on the same database. Create Workspace A and Workspace B. Assert:

```js
const createRunInput = (workspaceId, fixtureId) => ({
  workspace_id: workspaceId,
  application_version: '1.0.0',
  configuration_snapshot: {
    schema_version: 1,
    fixture_id: fixtureId,
  },
  job_plans: [{
    source_id: 'fake-source',
    job_key: fixtureId,
    query_group_id: null,
    source_context: { fixture_id: fixtureId },
  }],
});

const runA1 = repositoryA.createRunFromJobPlans(
  createRunInput(workspaceA.workspace_id, 'a1'),
);

assert.throws(
  () => repositoryB.createRunFromJobPlans(
    createRunInput(workspaceA.workspace_id, 'a2'),
  ),
  (error) =>
    error.code === 'WORKSPACE_ACTIVE_RUN_EXISTS' &&
    error.workspace_id === workspaceA.workspace_id &&
    error.active_run_id === runA1.run.run_id,
);

const runB1 = repositoryB.createRunFromJobPlans(
  createRunInput(workspaceB.workspace_id, 'b1'),
);
assert.equal(runB1.run.workspace_id, workspaceB.workspace_id);
```

Assert the rejected call inserted neither a Run nor Jobs. Reopen the database and prove Workspace A is still blocked. Using a raw `DatabaseSync` connection, attempt a second active insert for Workspace A and assert `SQLITE_CONSTRAINT_UNIQUE`; this proves the invariant survives repository bypass.

- [ ] **Step 2: Run the ownership test and verify RED**

Run:

```bash
bash tests/integration/sqlite/run-workspace-run-ownership-test.sh
```

Expected: FAIL because raw SQLite errors are not yet mapped to the typed repository conflict and the repository does not report the owning Run.

- [ ] **Step 3: Add the typed active-Run conflict**

Implement:

```ts
export class WorkspaceActiveRunError extends Error {
  readonly code = 'WORKSPACE_ACTIVE_RUN_EXISTS' as const;

  constructor(
    public readonly workspace_id: string,
    public readonly active_run_id: string,
  ) {
    super(
      `Workspace ${workspace_id} already has active Run ${active_run_id}.`,
    );
    this.name = 'WorkspaceActiveRunError';
  }
}
```

Inside the existing `BEGIN IMMEDIATE` Run-creation transaction, query the active set for the requested Workspace before inserting. Throw `WorkspaceActiveRunError` with the persisted Run ID. Keep the partial index as the final invariant and map an unexpected matching unique-index error to the same error type after re-reading the active Run.

- [ ] **Step 4: Run the ownership test and verify GREEN**

Run `bash tests/integration/sqlite/run-workspace-run-ownership-test.sh` and require its dedicated PASS line.

- [ ] **Step 5: Wire the focused gate**

Add `test:m2:workspace-ownership` to `package.json`, compile `src/shared/workspace.ts` in the runner, and invoke the runner from `run-integrated-m2-gate.sh` after both migration tests. Keep the slice uncommitted until the complete cross-layer contract passes Task 8.

### Task 4: Separate Active Execution from Retry Choice

**Files:**
- Modify: `src/shared/run-job.ts`
- Modify: `src/main/core/run-execution-state-machine.ts`
- Modify: `src/main/core/run-manager.ts`
- Modify: `src/main/core/collection-orchestrator.ts`
- Modify: `src/main/storage/state-repository.ts`
- Modify: `tests/integration/sqlite/run-manager.integration.cjs`
- Modify: `tests/integration/orchestration/multi-source-run.integration.cjs`

**Interfaces:**
- Consumes: Job states and existing orchestration result `RETRY_REQUIRED`.
- Produces: persisted non-terminal Run status `RETRY_REQUIRED`, stable active-slot release, and unchanged failed-only retry history.

- [ ] **Step 1: Write the failing Run aggregation cases**

Add literal cases proving:

```text
one FAILED Job, no pending/active/manual Jobs       -> RETRY_REQUIRED
one RETRY_PENDING Job, no pending/active/manual    -> RETRY_REQUIRED
FAILED plus remaining PENDING Job                  -> RUNNING
any MANUAL_ACTION_REQUIRED Job                     -> MANUAL_ACTION_REQUIRED
all accepted COMPLETED Jobs                        -> existing completion result
```

Assert `RETRY_REQUIRED` has `completed_at === null`, appears in incomplete discovery, and accepts only `RUNNING`, `FAILED`, or `CANCELLED` as outgoing transitions.

In the multi-source test, change the post-failure assertion from `RUNNING` to `RETRY_REQUIRED`; keep successful sibling Jobs and immutable rejected evidence unchanged.

- [ ] **Step 2: Run the focused lifecycle tests and verify RED**

Run:

```bash
npm run test:m2:runs
npm run test:m2:multi-source-run
```

Expected: FAIL because aggregation still returns `RUNNING` and the state machine does not know `RETRY_REQUIRED`.

- [ ] **Step 3: Implement the minimal lifecycle change**

Add `RETRY_REQUIRED` to `RUN_STATUSES`. Preserve the terminal set. Define transitions:

```ts
RUNNING: [
  'MANUAL_ACTION_REQUIRED',
  'RETRY_REQUIRED',
  'COMPLETED',
  'COMPLETED_WITH_WARNINGS',
  'FAILED',
  'CANCELLED',
],
RETRY_REQUIRED: ['RUNNING', 'FAILED', 'CANCELLED'],
```

In `deriveRunStatusFromJobs`, retain manual and accepted-completion precedence, then return `RUNNING` if any Job is `PENDING`, `RUNNING`, or `VALIDATING`. Return `RETRY_REQUIRED` when at least one remaining Job is `FAILED` or `RETRY_PENDING`. Preserve fail-closed `RUNNING` for anomalous non-terminal combinations not proven safe to release.

Add `RETRY_REQUIRED` to `listIncompleteRuns`. The orchestrator continues returning its existing `RETRY_REQUIRED` stopping outcome; it must not start a retry automatically.

- [ ] **Step 4: Update test fixture ownership intentionally**

The Run-manager test currently creates several incomplete Runs concurrently. Give independent lifecycle examples distinct Workspaces. Reserve shared-Workspace fixtures only for assertions that intentionally exercise the unique active-slot rule.

- [ ] **Step 5: Run lifecycle tests and verify GREEN**

Run the two focused commands again, then run `npm run test:m2:workspace-ownership` to prove the new inactive state releases the partial-index slot. Keep the slice uncommitted until the complete cross-layer contract passes Task 8.

### Task 5: Make Retry Reacquisition and Attempt Creation Atomic

**Files:**
- Modify: `src/main/storage/state-repository.ts`
- Modify: `src/main/core/reconciliation-coordinator.ts`
- Modify: `src/main/sources/google-trends/google-trends-core-runner.ts`
- Modify: `tests/integration/reconciliation/reconciliation-coordinator.integration.cjs`
- Modify: `tests/integration/orchestration/multi-source-run.integration.cjs`

**Interfaces:**
- Consumes: `RETRY_REQUIRED` Run, `FAILED` or `RETRY_PENDING` Job, retry limit, and schema-v6 active index.
- Produces: `StateRepository.reacquireRunAndStartRetryAttempt(input)` whose Run update, Job transitions, attempt count, and Attempt insert are one atomic write.

- [ ] **Step 1: Write the failing atomicity test**

Create Run A in `RETRY_REQUIRED`, then create active Run B in the same Workspace. Capture Run A's Job and Attempt history. Assert:

```js
const retryPlanForRunA = new ResumePlanner(repository)
  .planRun(runAId)
  .jobs.find((jobPlan) =>
    jobPlan.job.job_id === runAJobId
  );

assert.throws(
  () => coordinator.apply(retryPlanForRunA),
  (error) => error.code === 'WORKSPACE_ACTIVE_RUN_EXISTS',
);

assert.equal(repository.getRun(runAId).run_status, 'RETRY_REQUIRED');
assert.equal(repository.getJob(runAJobId).execution_status, 'FAILED');
assert.equal(repository.getJob(runAJobId).attempt_count, 1);
assert.equal(repository.listAttempts(runAJobId).length, 1);
```

Use existing internal `RunManager.cancelRun` to terminalize Run B in the test; do not add UI. Retry Run A again and assert in the committed state:

```js
assert.equal(repository.getRun(runAId).run_status, 'RUNNING');
assert.equal(repository.getJob(runAJobId).execution_status, 'RUNNING');
assert.equal(repository.getJob(runAJobId).attempt_count, 2);
assert.equal(repository.listAttempts(runAJobId).at(-1).attempt_number, 2);
```

- [ ] **Step 2: Run reconciliation and verify RED**

Run `npm run test:m2:reconcile`.

Expected: FAIL because the current coordinator performs `FAILED -> RETRY_PENDING` and `startAttempt` in separate repository transactions without reacquiring the Run slot.

- [ ] **Step 3: Define the atomic repository interface**

Add:

```ts
export interface StartRetryAttemptInput {
  job_id: string;
  max_attempts: number;
}

reacquireRunAndStartRetryAttempt(
  input: StartRetryAttemptInput,
): AttemptRecord | null;
```

`null` means the persisted attempt count has reached `max_attempts`; it must perform no mutation.

- [ ] **Step 4: Implement the operation under one `BEGIN IMMEDIATE`**

Within one transaction:

1. Load the Job joined to its Run and Workspace.
2. Require Run status `RETRY_REQUIRED`.
3. Require Job status `FAILED` or `RETRY_PENDING`.
4. Recheck `attempt_count < max_attempts` from the locked transaction snapshot.
5. Check for another active Run in the same Workspace and throw `WorkspaceActiveRunError` before mutation.
6. Transition the Run to `RUNNING`; the partial index remains the final guard.
7. If needed, validate and apply `FAILED -> RETRY_PENDING`.
8. Validate `RETRY_PENDING -> RUNNING`.
9. Insert the next immutable `RUNNING` Attempt and update Job status/count/timestamps.
10. Commit, then return the persisted Attempt.

Any failure—including the unique index—must roll back the Run, Job, and Attempt changes together. Do not call public transaction-owning methods from inside this transaction; extract a private transaction-local Attempt insertion helper after GREEN if needed to avoid duplicating existing `startAttempt` behavior.

- [ ] **Step 5: Delegate explicit retry to the atomic method**

Change `ReconciliationStateStore` to consume `reacquireRunAndStartRetryAttempt`. `ReconciliationCoordinator.startExplicitRetry` passes `retryPolicy.max_attempts`, maps `null` to its existing `RETRY_EXHAUSTED` result, and maps a returned Attempt to existing `RETRY_STARTED`. Remove the separate public calls that expose the intermediate `RETRY_PENDING` state across commits.

Update the GT Core runner only to consume the coordinator's unchanged public reconciliation result.

- [ ] **Step 6: Run atomic retry tests and verify GREEN**

Run:

```bash
npm run test:m2:reconcile
npm run test:m2:multi-source-run
npm run test:m2:attempts
npm run test:m2:workspace-ownership
```

Require that the blocked retry leaves no Attempt 2 and the successful retry preserves Attempt 1. Keep the slice uncommitted until the complete cross-layer contract passes Task 8.

### Task 6: Scope Internal Recovery to Workspace and Preserve Restart Ownership

**Files:**
- Modify: `src/main/storage/state-repository.ts`
- Modify: `src/main/core/resume-planner.ts`
- Modify: `src/main/sources/google-trends/google-trends-core-runner.ts`
- Modify: `src/main/app/google-trends-desktop-controller-factory.ts`
- Modify: `tests/integration/resume/resume-planner.integration.cjs`
- Modify: `tests/integration/reconciliation/reconciliation-coordinator.integration.cjs`

**Interfaces:**
- Consumes: persisted `RunRecord.workspace_id` and non-terminal Run statuses.
- Produces: `listIncompleteRuns(workspaceId)`, `discoverIncompleteRuns(workspaceId)`, `planRun(workspaceId, runId)`, and Workspace-safe internal recovery after repository reopen.

- [ ] **Step 1: Write failing cross-Workspace recovery cases**

Create one incomplete Run in Workspace A and one in Workspace B. Assert before and after closing/reopening the repository:

```js
assert.deepEqual(
  planner.discoverIncompleteRuns(workspaceA.workspace_id)
    .map((plan) => plan.run.run_id),
  [runA.run.run_id],
);

assert.deepEqual(
  planner.discoverIncompleteRuns(workspaceB.workspace_id)
    .map((plan) => plan.run.run_id),
  [runB.run.run_id],
);

assert.equal(
  planner.planRun(workspaceA.workspace_id, runB.run.run_id),
  null,
);
```

Include a `RETRY_REQUIRED` Run and prove it remains discoverable but does not block creation of a new Run in that Workspace. Include a persisted `RUNNING` Run and prove it remains active and blocks a new Run until reconciliation changes it to `RETRY_REQUIRED` or a terminal state.

- [ ] **Step 2: Run resume/reconciliation tests and verify RED**

Run:

```bash
npm run test:m2:resume
npm run test:m2:reconcile
```

Expected: FAIL because discovery is global and `planRun` has no Workspace boundary.

- [ ] **Step 3: Make Workspace scope mandatory**

Change the storage and planner contracts to:

```ts
listIncompleteRuns(workspaceId: string): RunRecord[];

discoverIncompleteRuns(
  workspaceId: string,
): ResumeRunPlan[];

planRun(
  workspaceId: string,
  runId: string,
): ResumeRunPlan | null;
```

Filter in SQL by both `workspace_id = ?` and the incomplete set `PENDING`, `RUNNING`, `MANUAL_ACTION_REQUIRED`, `RETRY_REQUIRED`. Do not retain a public unscoped fallback.

When the GT resume runner receives a Run ID, load that Run first and call `planRun(run.workspace_id, run.run_id)`. Scope current desktop recovery to the explicitly injected compatibility Workspace instead of choosing the latest Run globally.

- [ ] **Step 4: Refresh Run state after internal reconciliation**

After all `RECONCILE_REQUIRED` Jobs have been processed, call `RunManager.refreshRunStatus` before deciding whether collection can proceed. An interrupted attempt normalized to `RETRY_PENDING` must move its Run to `RETRY_REQUIRED`, releasing the active slot; candidate/manual states remain fail-closed and active.

- [ ] **Step 5: Run recovery tests and verify GREEN**

Run:

```bash
npm run test:m2:resume
npm run test:m2:reconcile
npm run test:m2:runs
npm run test:m2:workspace-ownership
```

Keep the slice uncommitted until the complete cross-layer contract passes Task 8.

### Task 7: Adapt Existing Core Composition Without Expanding Product Scope

**Files:**
- Modify: `src/main.ts`
- Modify: `src/main/app/google-trends-desktop-controller-factory.ts`
- Modify: `src/main/sources/google-trends/google-trends-core-runner.ts`
- Modify: every existing test returned by `rg -l "createRunFromQueryConfig|createRunFromJobPlans|new ResumePlanner" tests`
- Modify: `tests/integration/export/google-trends-export-manager.integration.cjs`
- Modify: `tests/integration/google-trends/batch-core-runner.integration.cjs`
- Modify: affected focused Bash compilation runners to include `src/shared/workspace.ts`
- Modify: `tests/integration/m2-gate/integrated-m2-gate.integration.cjs`
- Modify: `tests/integration/m2-gate/run-integrated-m2-gate.sh`

**Interfaces:**
- Consumes: explicit Workspace-aware Run and recovery APIs.
- Produces: unchanged current GT behavior routed through the technical migration Workspace, plus source-neutral and multi-source test fixtures with explicit ownership.

- [ ] **Step 1: Run static compilation and the M2 gate to expose all remaining callers**

Run:

```bash
npx tsc --noEmit
npm run test:m2:gate
```

Expected: RED at callers that have not supplied `workspace_id`, old schema-version assertions, or unscoped recovery arguments. Record each failing caller; do not make `workspace_id` optional to silence them.

- [ ] **Step 2: Make current production composition explicit and technical**

Add `workspace_id: string` to `RunGoogleTrendsThroughCoreInput` and `CreateGoogleTrendsDesktopControllerInput`. In `main.ts`, pass `MIGRATION_COMPATIBILITY_WORKSPACE_ID` into the current controller factory after schema-v6 initialization.

The factory passes the same ID to new Run creation and recovery discovery. Do not render its name, expose Workspace selection, add Workspace state to IPC, or infer it from `queries.yaml`. Keep the constant and wiring described as pre-Workspace migration compatibility, not product default selection.

- [ ] **Step 3: Update all deterministic fixtures with explicit ownership**

For tests focused on Workspace behavior, create named Workspaces with `repository.createWorkspace`. For unrelated legacy/Core fixtures, pass `MIGRATION_COMPATIBILITY_WORKSPACE_ID` only when they create at most one active Run; create distinct test Workspaces where simultaneous incomplete Runs are intentional.

Do not change source IDs, snapshot shapes, query-group context, Job ordering, retry limits, provider fakes, artifact expectations, metadata schemas, or export assertions.

- [ ] **Step 4: Update gate compilation inputs and schema assertions**

Compile `src/shared/workspace.ts` anywhere `state-repository.ts` or `run-job.ts` now requires it. Change current-schema assertions from 5 to 6. Invoke the schema-v6 and Workspace-ownership runners from the M2 gate; retain the chained v4→v5→v6 test.

- [ ] **Step 5: Run focused compatibility verification**

Run:

```bash
npx tsc --noEmit
npm run lint
npm run test:m2:state
npm run test:m2:attempts
npm run test:m2:runs
npm run test:m2:artifacts
npm run test:m2:resume
npm run test:m2:reconcile
npm run test:m2:orchestrator
npm run test:m2:source-neutral-state
npm run test:m2:source-neutral-core
npm run test:m2:multi-source-run
npm run test:m2:schema-v5
npm run test:m2:schema-v6
npm run test:m2:workspace-ownership
npm run test:m3:gt-core-runner
npm run test:m3:gt-batch-core-runner
npm run test:m3:desktop-controller
npm run test:m6:export
```

No `m3:live-*` command may run. Keep the slice uncommitted until the complete cross-layer contract passes Task 8.

### Task 8: Record the Verified Contract and Create the Technical Checkpoint

**Files:**
- Modify: `PROJECT_SPEC.md`
- Modify: `ARCHITECTURE.md`
- Modify: `DATA_CONTRACTS.md`
- Modify: `TEST_STRATEGY.md`
- Modify: `DECISIONS.md`
- Verify: all implementation and test files from Tasks 1-7

**Interfaces:**
- Consumes: verified schema-v6 and Core behavior.
- Produces: stable documentation and one technical Git checkpoint without handoff-state edits mixed in.

- [ ] **Step 1: Update stable documentation from observed behavior**

Record:

- Workspace as brand/business isolation and ownership identity.
- `1 Run = exactly 1 Workspace` through a required FK.
- schema 6 and the migration-only technical compatibility row.
- exact active set and partial unique index.
- `RETRY_REQUIRED` as non-terminal/inactive.
- atomic retry reacquisition/Job/Attempt transaction.
- Workspace-scoped internal restart/reconciliation.
- no Workspace UI, Presets, Last Run Settings, credentials, or new user recovery workflow.

Add ADR-058 for first-class Workspace Run ownership and DB-backed active-slot enforcement. Do not describe the technical migration Workspace as a customer-facing default or legacy mode.

- [ ] **Step 2: Run static and focused verification**

Run:

```bash
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

- [ ] **Step 3: Run the full deterministic release gate**

Run `npm run test:release:gate` and claim success only if the final line is:

```text
PASS RELEASE-GATE-001: deterministic Core, Google Trends, desktop file access, configuration, validation, and export gates completed
```

- [ ] **Step 4: Inspect the complete technical diff**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

Confirm the two historical untracked files remain untouched. Confirm no UI, credential, Preset, Last Run, provider, export-retention, timeout, scheduler, or live-provider work entered the diff.

- [ ] **Step 5: Create the technical checkpoint**

Stage the implementation, tests, gate wiring, this plan, and stable contract documentation. Commit with:

```bash
git commit -m "feat: add workspace run ownership"
```

### Task 9: Update the Living Handoff Separately

**Files:**
- Modify: `PROJECT_HANDOFF.md`

**Interfaces:**
- Consumes: actual technical commit hash and observed verification output.
- Produces: a separate documentation checkpoint stating the exact verified state and next approval boundary.

- [ ] **Step 1: Record only verified evidence**

Update the handoff with the actual schema-v6 migration, Workspace ownership, active set, `RETRY_REQUIRED`, atomic retry transaction, Workspace-scoped restart evidence, exact commands/results, no-live-call statement, and actual technical commit hash.

State explicitly that the development migration Workspace is technical compatibility only and that Workspace UI, Workspace lifecycle management, Presets, Last Run Settings, connections, credentials, new recovery workflows, provider additions, timeouts, and export generalization remain unimplemented.

- [ ] **Step 2: Verify and commit only the handoff**

Run `git diff --check` and `git status --short`. Stage only `PROJECT_HANDOFF.md`, then commit:

```bash
git commit -m "docs: close workspace ownership checkpoint"
```

Preserve both historical untracked files untouched.
