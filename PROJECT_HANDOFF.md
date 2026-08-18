# RoofRoom Data Collector — Project Handoff

**Document:** `PROJECT_HANDOFF.md`
**Product:** RoofRoom Data Collector
**Last Updated:** 2026-08-18
**Current Milestone:** M2 — Core Collector Engine
**Milestone Status:** IN PROGRESS
**Previous Milestone:** M1 — Application Skeleton — COMPLETED
**M0 Final Consistency Review:** PASS

---

# 1. Current Repository

Verified repository path:

```text
~/Projects/roofroom-data-collector/
```

Current branch:

```text
main
```

Latest verified checkpoint:

```text
f9c6356 feat: persist artifacts and validation summaries
```

Previous verified checkpoints:

```text
4852f1c docs: update M2 handoff after run lifecycle slice
f7b7d46 feat: add run lifecycle aggregation
46680d5 docs: update M2 handoff after attempt state slice
31f427d feat: add attempt persistence and job state transitions
47e725b docs: update M2 handoff after run job persistence
996b34e feat: add persisted run and job state
```

Working tree is clean after `f9c6356`.

---

# 2. M2 Completed Work

## Run / Job Persistence

Verified:

```text
runs persist
jobs persist
one query group = one ordered job
configuration snapshot survives restart
foreign-key integrity remains valid
invalid persisted statuses fail closed
```

Initial state:

```text
run_status        = PENDING
execution_status  = PENDING
validation_status = NOT_RUN
attempt_count     = 0
```

## Attempt Persistence

SQLite schema version 3 introduced:

```text
attempts
```

Verified:

```text
first attempt = attempt_number 1
retry attempt = attempt_number 2
```

Retry appends history instead of overwriting prior attempt evidence.

## Job Execution State Machine

Verified:

```text
PENDING → RUNNING
RUNNING → VALIDATING
VALIDATING → COMPLETED
RUNNING → FAILED
FAILED → RETRY_PENDING
RETRY_PENDING → RUNNING
RUNNING → MANUAL_ACTION_REQUIRED
MANUAL_ACTION_REQUIRED → RUNNING
```

`startAttempt()` is required for entering `RUNNING` from `PENDING` or `RETRY_PENDING`.

## Run Lifecycle / Aggregation

Verified:

```text
new run                        → PENDING
start run                      → RUNNING
all jobs COMPLETED + VALID     → COMPLETED
LOW_DATA / NO_DATA present     → COMPLETED_WITH_WARNINGS
blocking manual-action job     → MANUAL_ACTION_REQUIRED
retryable job failure remains  → RUNNING
explicit user cancellation     → CANCELLED
```

Run timestamps persist across restart.

## Artifact Persistence

SQLite schema version 4 introduced:

```text
artifacts
validations
```

Canonical artifact state support:

```text
CANDIDATE
ACCEPTED
ACCEPTED_WITH_WARNING
REJECTED
SUPERSEDED
```

Artifact metadata persistence includes:

```text
artifact_id
run_id
job_id
attempt_number
source_id
artifact_kind
artifact_state
filename
relative_path
media_type
byte_size
sha256
created_at
```

Candidate artifact registration links:

```text
attempt.candidate_artifact_id
```

A candidate artifact is not canonical before validation.

## Validation Summary Persistence

Validation summaries persist:

```text
validation_id
run_id
job_id
artifact_id
validation_status
checks_total
checks_passed
checks_warning
checks_failed
validated_at
validation_json_path
```

Attempt linkage:

```text
attempt.validation_id
```

Validation-to-artifact mapping verified:

```text
VALID           → ACCEPTED
LOW_DATA        → ACCEPTED_WITH_WARNING
NO_DATA         → ACCEPTED_WITH_WARNING
INVALID_SCHEMA  → REJECTED
ERROR_NOT_DATA  → REJECTED
DATE_MISMATCH   → REJECTED
QUERY_MISMATCH  → REJECTED
```

Accepted artifacts update:

```text
job.accepted_artifact_id
```

Rejected artifacts remain traceable and are not made canonical.

Retry success can become the job's new canonical artifact while earlier attempt/artifact/validation history remains persisted.

---

# 3. Current SQLite State

Current application schema:

```text
schema version = 4
```

Migration history:

```text
1 bootstrap_schema
2 run_job_persistence
3 attempt_persistence
4 artifact_validation_persistence
```

Verified runtime health:

```text
journal mode = wal
foreign keys = ON
quick check  = ok
```

Deterministic tests use temporary databases.

The real application database is not populated with fake operational records by the integration tests.

---

# 4. Verified M2 Test Surface

Current deterministic scripts:

```text
npm run test:m2:state
npm run test:m2:attempts
npm run test:m2:runs
npm run test:m2:artifacts
```

Verified artifact/validation coverage:

```text
PASS ARTIFACT-001: candidate artifact persists before validation
PASS ARTIFACT-002: attempt links to one candidate artifact
PASS VALIDATION-001: VALID maps artifact to ACCEPTED
PASS VALIDATION-002: INVALID_SCHEMA maps artifact to REJECTED
PASS VALIDATION-003: LOW_DATA maps artifact to ACCEPTED_WITH_WARNING
PASS ACCEPT-001: accepted_artifact_id is set only after accepted validation
PASS RETRY-001: retry success becomes the job canonical artifact
PASS RETRY-002: rejected attempt/artifact/validation history is preserved
PASS DB-ARTIFACT-001: artifact/validation records survive restart
PASS: invalid artifact/validation persisted states fail closed
```

Previous run/job, attempt, and RunManager regression suites also remain passing.

---

# 5. Current M2 Persistence Chain

The operational persistence chain is now:

```text
run
└── job
    └── attempt
        ├── candidate artifact
        └── validation summary
```

Canonical job result reference:

```text
job.accepted_artifact_id
```

Historical evidence remains append-preserving across retries.

---

# 6. M2 Remaining Work

Not yet implemented:

```text
StorageManager
run filesystem directory creation
candidate raw artifact file persistence
filesystem-safe artifact naming
collision protection
immutable/raw-file preservation behavior
SHA-256 computation from actual bytes
byte-size verification from actual bytes
metadata JSON persistence
validation JSON persistence
incomplete-run discovery
resume reconciliation
accepted-job skip behavior
retry orchestration policy
sequential fake-source orchestration
structured logging
sensitive-value redaction
BrowserManager foundation
M2 acceptance gate
```

Real Google Trends browser automation remains M3 work.

---

# 7. Exact Next Action

Continue M2 with a focused filesystem StorageManager slice:

```text
inspect filesystem layout / artifact naming contracts
↓
define StorageManager boundary
↓
create run directory safely
↓
persist candidate raw bytes into run-scoped raw directory
↓
never overwrite an existing raw artifact silently
↓
derive byte_size from actual persisted bytes
↓
derive sha256 from actual persisted bytes
↓
return stable ArtifactFileReference metadata
↓
prove relative path is inside application data root
↓
prove retry collision creates a separate artifact path
↓
prove existing raw file is not mutated by later retry
↓
prove candidate file survives process/repository restart
↓
deterministic local filesystem integration tests
↓
lint / type-check / regression tests
↓
Git checkpoint
```

This slice should not yet implement:

```text
Google Trends browser collection
Google Trends CSV parsing
full validation engine
resume orchestration
fake-source orchestration
BrowserManager
XLSX export
```

---

# 8. StorageManager Guardrails

Raw source files should be immutable whenever practical.

Storage operations must fail closed on path traversal and unsafe paths.

Do not silently overwrite an existing artifact.

Missing data remains missing; do not synthesize data.

SQLite remains the operational/searchable metadata store.

Filesystem remains the canonical storage location for raw artifact bytes and detailed JSON files.

The StorageManager should return metadata to the core rather than directly deciding validation or acceptance.

---

# 9. M2 Gate Context

Current completed foundation:

```text
runs/jobs persistence           PASS
attempt persistence             PASS
job state machine               PASS
run state machine               PASS
run aggregation                 PASS
artifact records                PASS
validation summaries            PASS
accepted artifact references    PASS
retry evidence preservation     PASS
restart persistence             PASS
```

Still required before M2 completion:

```text
filesystem storage integrity
resume reconstruction
accepted-job skip behavior
retry orchestration
sequential fake-source orchestration
safe structured logging
BrowserManager foundation
```

---

# 10. Handoff Discipline

At the end of every meaningful implementation session:

1. verify actual behavior,
2. record tests that actually ran,
3. record known failures,
4. update current milestone state,
5. record latest verified Git checkpoint,
6. record one exact next action.

Never record unverified work as completed.
