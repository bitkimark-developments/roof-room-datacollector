# Multi-Source Run Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one schema-v5 Run to persist and execute Jobs from multiple registered sources with per-Job collector/validator dispatch, independent failure, failed-only retry, restart safety, and correct provenance.

**Architecture:** Preserve the existing schema-v5 Run/Job/Attempt model and generic snapshot parser. Remove the persistence-only mixed-source guard after a RED test, then add a dedicated fail-closed `CollectionValidatorRegistry` and resolve validators by each Job's `source_id` inside `CollectionOrchestrator`; all other lifecycle components remain source-neutral and unchanged.

**Tech Stack:** TypeScript 5.9, Node.js built-in `node:sqlite`, Bash 3.2-compatible integration runners, Node `assert`, Electron/Vite project tooling.

**Spec:** `docs/superpowers/specs/2026-09-10-multi-source-run-contract-design.md`

## Global Constraints

- Keep SQLite schema version exactly `5`; do not add a migration.
- Preserve existing Google Trends snapshots and generic single-source snapshots.
- New multi-source snapshots use a real `sources` array and no synthetic or first-source root `source_id`.
- Resolve both collection and validation from each persisted `job.source_id`.
- Keep execution sequential and retry explicit and Job-scoped.
- Make no live provider calls.
- Do not generalize Google Trends UI, exporter, or production runtime composition.
- Do not implement Workspace, presets, Last Run Settings, credentials, freshness, timeouts, frontend work, or real provider adapters.
- Do not touch `CODEX_HANDOFF_CURRENT.md` or `PROJECT_HANDOFF.pre-20260820.md`.
- Create one verified technical checkpoint after all deterministic verification; update `PROJECT_HANDOFF.md` only after that commit.

---

### Task 1: Admit Mixed-Source Job Plans Without Changing Schema

**Files:**
- Modify: `tests/integration/sqlite/source-neutral-job-persistence.integration.cjs`
- Modify: `src/main/storage/state-repository.ts`

**Interfaces:**
- Consumes: `StateRepository.createRunFromJobPlans(input: CreateRunFromJobPlansInput)` and schema-v5 uniqueness `(run_id, source_id, job_key)`.
- Produces: mixed-source Run creation with ordered unique `run.selected_sources`, source-scoped Job identity, and unchanged generic snapshot persistence.

- [ ] **Step 1: Replace the old mixed-source rejection assertion with the failing compatibility case**

Use a snapshot with no singular root source:

```js
const multiSourceSnapshot = {
  schema_version: 1,
  sources: [
    {
      source_id: 'fake-source-a',
      requested_context: { batch_label: 'primary' },
    },
    {
      source_id: 'fake-source-b',
      requested_context: { batch_label: 'secondary' },
    },
  ],
};

const mixed = repositoryA.createRunFromJobPlans({
  application_version: '1.0.0',
  configuration_snapshot: multiSourceSnapshot,
  job_plans: [
    {
      source_id: 'fake-source-a',
      job_key: 'same-key',
      query_group_id: null,
      source_context: { fixture_id: 'alpha' },
    },
    {
      source_id: 'fake-source-b',
      job_key: 'same-key',
      query_group_id: null,
      source_context: { fixture_id: 'gamma' },
    },
  ],
});

assert.deepEqual(mixed.run.selected_sources, [
  'fake-source-a',
  'fake-source-b',
]);
assert.deepEqual(mixed.run.configuration_snapshot, multiSourceSnapshot);
assert.equal(mixed.jobs.length, 2);
assert.notEqual(mixed.jobs[0].job_id, mixed.jobs[1].job_id);
```

Retain the same-source duplicate rejection, unsafe-key rejection,
legacy-looking generic snapshot case, and repository reopen assertions. Add
reopen assertions for the mixed Run and both same-key Jobs.

- [ ] **Step 2: Run the persistence test and verify RED**

Run `npm run test:m2:source-neutral-state`.

Expected: FAIL because `normalizeCreateRunFromJobPlansInput` still reports
`job_plans must contain jobs from exactly one source_id in this release.`

- [ ] **Step 3: Remove only the single-source cardinality guard**

Delete the `sourceIds.size !== 1` rejection from
`normalizeCreateRunFromJobPlansInput`. Preserve plan normalization, JSON
validation, duplicate `(source_id, job_key)` rejection, and filesystem-safe
`job_key` validation.

- [ ] **Step 4: Run the persistence test and verify GREEN**

Run `npm run test:m2:source-neutral-state`.

Expected: `PASS DB-011`, including mixed-source selected membership, same-key
cross-source identity, and close/reopen fidelity.

### Task 2: Add a Fail-Closed Source-Keyed Validator Registry

**Files:**
- Create: `src/main/core/collection-validator-registry.ts`
- Create: `tests/integration/orchestration/collection-validator-registry.integration.cjs`
- Create: `tests/integration/orchestration/run-collection-validator-registry-test.sh`
- Modify: `package.json`
- Modify: `tests/integration/m2-gate/run-integrated-m2-gate.sh`

**Interfaces:**
- Consumes: `CollectionValidator` from `src/shared/collection.ts` and the established lowercase-hyphenated source-ID rule.
- Produces: `CollectionValidatorRegistry.register(sourceId, validator)` and `CollectionValidatorRegistry.get(sourceId)`.

- [ ] **Step 1: Write the registry contract test before the registry exists**

The test proves valid registration/lookup and fail-closed behavior:

```js
const registry = new CollectionValidatorRegistry();
const validatorA = { async validate() { throw new Error('not called'); } };

registry.register('fake-source-a', validatorA);
assert.equal(registry.get('fake-source-a'), validatorA);
assert.throws(
  () => registry.register('Fake Source', validatorA),
  (error) => error.code === 'INVALID_SOURCE_ID',
);
assert.throws(
  () => registry.register('fake-source-a', validatorA),
  (error) => error.code === 'DUPLICATE_SOURCE_ID',
);
assert.throws(
  () => registry.get('missing-source'),
  (error) => error.code === 'UNKNOWN_SOURCE_ID',
);
```

The Bash runner compiles the registry plus `src/shared/collection.ts` and its
type dependencies to a temporary directory, then executes the test. It uses
`mktemp -d` and a Bash 3.2-compatible cleanup trap.

- [ ] **Step 2: Run the registry test and verify RED**

Run `bash tests/integration/orchestration/run-collection-validator-registry-test.sh`.

Expected: FAIL because `collection-validator-registry.ts` does not exist.

- [ ] **Step 3: Implement the minimal registry**

Create:

```ts
export type CollectionValidatorRegistryErrorCode =
  | 'INVALID_SOURCE_ID'
  | 'DUPLICATE_SOURCE_ID'
  | 'UNKNOWN_SOURCE_ID';

export class CollectionValidatorRegistryError extends Error {
  constructor(
    public readonly code: CollectionValidatorRegistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CollectionValidatorRegistryError';
  }
}

export class CollectionValidatorRegistry {
  private readonly validators = new Map<string, CollectionValidator>();

  register(sourceId: string, validator: CollectionValidator): void;
  get(sourceId: string): CollectionValidator;
}
```

Use the same source-ID pattern as `SourceRegistry`. Reject invalid IDs,
duplicates, and missing IDs with the exact error codes tested above.

- [ ] **Step 4: Run the registry test and verify GREEN**

Run the focused runner again and require its dedicated PASS line.

- [ ] **Step 5: Add the focused script and compilation input to normal gates**

Add a package script named `test:m2:validator-registry`. Add
`src/main/core/collection-validator-registry.ts` to the M2 compilation list and
invoke the focused registry runner from `run-integrated-m2-gate.sh`.

### Task 3: Prove and Implement Per-Job Multi-Source Dispatch

**Files:**
- Create: `tests/integration/orchestration/multi-source-run.integration.cjs`
- Create: `tests/integration/orchestration/run-multi-source-run-test.sh`
- Modify: `src/main/core/collection-orchestrator.ts`
- Modify: `src/main/sources/google-trends/google-trends-core-runner.ts`
- Modify: `tests/integration/m2-gate/integrated-m2-gate.integration.cjs`
- Modify: `tests/integration/orchestration/sequential-fake-source.integration.cjs`
- Modify: `tests/integration/orchestration/source-neutral-fake-json.integration.cjs`
- Modify: `package.json`
- Modify: `tests/integration/m2-gate/run-integrated-m2-gate.sh`

**Interfaces:**
- Consumes: `CollectionValidatorRegistry`, `SourceRegistry`, schema-v5 Job records, `ResumePlanner`, `ReconciliationCoordinator`, and `RetryPolicy`.
- Produces: `CollectionOrchestrator(..., sourceRegistry, validatorRegistry, runManager, ...)` with both collection and validation resolved from `job.source_id`.

- [ ] **Step 1: Write the full mixed-source lifecycle test**

Register two independent collecting source instances and two independent
validators. Persist one Run with these ordered Jobs:

```text
fake-source-a / alpha    -> attempt 1 VALID
fake-source-b / gamma    -> attempt 1 INVALID_SCHEMA
fake-source-a / beta     -> attempt 1 VALID
```

The failure in the middle proves later unrelated work still executes. Use
literal event expectations:

```js
assert.deepEqual(collectionEvents, [
  'fake-source-a:alpha:attempt_1',
  'fake-source-b:gamma:attempt_1',
  'fake-source-a:beta:attempt_1',
]);
assert.deepEqual(validationEvents, [
  'fake-source-a:alpha:attempt_1',
  'fake-source-b:gamma:attempt_1',
  'fake-source-a:beta:attempt_1',
]);
```

Each fake collector asserts its own `source_id` and literal `source_context`.
Each fake validator rejects a context whose Job or artifact belongs to another
source and records the source/job/attempt it validated.

Close the first repository after the initial run. Reopen it, prove the mixed
Run, selected sources, Jobs, attempts, accepted artifacts, failed state, and
resume actions survived. Apply `ReconciliationCoordinator` only to gamma's
`RETRY_CANDIDATE`, then execute attempt 2. Assert alpha and beta each still
have one attempt and one collection event, gamma has two immutable attempts,
the old rejected artifact/finding remains, and the new artifact is accepted.

Read metadata and validation JSON from both source namespaces and assert
literal `run_id`, `job_id`, `attempt_id`, `attempt_number`, `source_id`,
`source_mode`, `job_key`, `source_context`, raw artifact linkage, and validation
status. End with `PASS MULTI-SOURCE-RUN-001`.

- [ ] **Step 2: Run the mixed-source test and verify RED**

Run `bash tests/integration/orchestration/run-multi-source-run-test.sh`.

Expected: FAIL when the current orchestrator treats the validator registry as
one `CollectionValidator` instead of resolving by the current Job's source ID.

- [ ] **Step 3: Resolve the validator per Job**

Change the constructor dependency to `CollectionValidatorRegistry`. Immediately
before validation, resolve:

```ts
const validator = this.validators.get(job.source_id);
const validation = await validator.validate({
  run,
  job: validatingJob,
  attempt,
  artifact,
  source_context: validatingJob.source_context,
  absolute_path: persisted.absolute_path,
});
```

Do not add provider conditions. Keep the existing `SourceRegistry.get` call
for collection dispatch.

- [ ] **Step 4: Update every existing orchestrator composition**

For each existing single-source test/runtime, create one
`CollectionValidatorRegistry`, register the existing source ID and validator,
and pass the registry into `CollectionOrchestrator`. The Google Trends Core
runner registers only `google-trends`; its public API and source-specific
behavior stay unchanged.

- [ ] **Step 5: Run the mixed-source test and verify GREEN**

Run the focused multi-source runner again and require
`PASS MULTI-SOURCE-RUN-001`.

- [ ] **Step 6: Integrate the vertical slice into deterministic gates**

Add a package script named `test:m2:multi-source-run`, compile the validator
registry in the runner, and invoke the new runner from the M2 gate. No live
command is added.

### Task 4: Record the Implemented Stable Contract

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `DATA_CONTRACTS.md`
- Modify: `TEST_STRATEGY.md`
- Modify: `SOURCE_MODULE_GUIDE.md`
- Modify: `DECISIONS.md`

**Interfaces:**
- Consumes: the verified mixed-source persistence/orchestration behavior from Tasks 1-3.
- Produces: stable documentation that distinguishes implemented multi-source Core behavior from still-GT-specific production UI/export/runtime composition.

- [ ] **Step 1: Update architecture and contract facts**

Record that one Run may contain Jobs from multiple source IDs, source and
validator dispatch both use `job.source_id`, Job identity remains
`source_id + job_key`, schema v5 remains current, and generic multi-source
snapshots use real source membership without overwriting legacy shapes.

- [ ] **Step 2: Update test and onboarding guidance**

Record the deterministic mixed-source lifecycle gate and require each future
source composition to register its validator under the same source ID. Keep
provider adapters, credentials, freshness, UI, and export generalization
unimplemented.

- [ ] **Step 3: Add the architectural decision**

Add an accepted ADR stating that one user collection operation is one
persisted Run containing independently source-keyed Jobs, and that validators
are selected per Job through a fail-closed source-keyed registry. State that
this is package-level coordination, not row-level merging.

### Task 5: Verify the Complete Slice and Create the Technical Checkpoint

**Files:**
- Verify all files from Tasks 1-4.

**Interfaces:**
- Consumes: the complete implementation and deterministic gates.
- Produces: a verified technical Git checkpoint with no handoff edit mixed in.

- [ ] **Step 1: Run focused deterministic tests**

Run these commands and require their final PASS lines:

```bash
npm run test:m2:source-neutral-state
npm run test:m2:validator-registry
npm run test:m2:multi-source-run
npm run test:m2:source-neutral-core
npm run test:m2:schema-v5
npm run test:m2:orchestrator
npm run test:m2:resume
npm run test:m2:reconcile
npm run test:m3:gt-core-runner
npm run test:m3:gt-batch-core-runner
npm run test:m3:desktop-controller
npm run test:m6:export
npm run test:m2:gate
```

- [ ] **Step 2: Run static verification**

Run `npx tsc --noEmit`, `npm run lint`, and `git diff --check`.

- [ ] **Step 3: Run the full deterministic release gate**

Run `npm run test:release:gate`. Claim full success only if it reaches
`PASS RELEASE-GATE-001`. Do not run any `m3:live-*` command.

- [ ] **Step 4: Inspect the technical diff and protected files**

Run `git status --short`, `git diff --stat`, and `git diff --check`. Confirm the
two pre-existing historical files remain unmodified and untracked.

- [ ] **Step 5: Create the technical checkpoint**

Stage only the plan/spec, implementation, tests, gate wiring, and stable
contract documentation. Commit with:

```bash
git commit -m "feat: support multi-source jobs within one run"
```

### Task 6: Update the Living Handoff After the Technical Commit

**Files:**
- Modify: `PROJECT_HANDOFF.md`

**Interfaces:**
- Consumes: actual technical commit hash, exact tests run, and observed verification results.
- Produces: a separate documentation checkpoint naming the next bounded action.

- [ ] **Step 1: Rewrite only live-state sections from verified evidence**

Record the actual technical hash, schema-v5/no-migration decision, validator
registry, mixed-source lifecycle evidence, exact PASS/FAIL results, no-live-call
status, remaining GT-specific UI/export/runtime composition, and exact next
approved milestone. Do not claim future provider, Workspace, preset, timeout,
credential, export, or UI work as implemented.

- [ ] **Step 2: Verify and commit the handoff separately**

Run `git diff --check` and `git status --short`. Stage only
`PROJECT_HANDOFF.md`, then commit with:

```bash
git commit -m "docs: close multi-source run checkpoint"
```

Preserve both historical untracked files untouched.
