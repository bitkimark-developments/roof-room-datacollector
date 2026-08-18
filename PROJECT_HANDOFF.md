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
f7b7d46 feat: add run lifecycle aggregation
```

Previous verified checkpoints:

```text
46680d5 docs: update M2 handoff after attempt state slice
31f427d feat: add attempt persistence and job state transitions
47e725b docs: update M2 handoff after run job persistence
996b34e feat: add persisted run and job state
2320804 docs: close M1 and prepare M2
```

Working tree was clean immediately after `f7b7d46`.

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

SQLite schema version 3 includes:

```text
attempts
```

Verified:

```text
first attempt = attempt_number 1
retry attempt = attempt_number 2
```

Retry appends history instead of overwriting prior attempt evidence.

Historical failed attempts retain error/status/timestamps after later retries.

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

`startAttempt()` is required for:

```text
PENDING → RUNNING
RETRY_PENDING → RUNNING
```

so attempt history cannot be bypassed.

## Run Lifecycle / Aggregation

Run lifecycle state is now persisted and aggregated from persisted job state.

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

`run.started_at` is set on first start and remains stable.

Terminal run states persist `completed_at`.

Illegal run transitions fail closed.

A retryable job failure does not automatically force the run to `FAILED`.

Hard validation outcomes also remain non-terminal until retry/final-failure policy is explicitly resolved later.

---

# 3. Current SQLite State

Current application schema:

```text
schema version = 3
```

Migration history:

```text
1 bootstrap_schema
2 run_job_persistence
3 attempt_persistence
```

Verified runtime health:

```text
journal mode = wal
foreign keys = ON
quick check  = ok
```

No schema change was required for the RunManager slice.

---

# 4. Verified M2 Test Surface

Current deterministic scripts:

```text
npm run test:m2:state
npm run test:m2:attempts
npm run test:m2:runs
```

Verified RunManager coverage:

```text
PASS RUN-001: new run starts PENDING
PASS RUN-002: PENDING -> RUNNING and started_at is stable
PASS RUN-003: all VALID jobs aggregate to COMPLETED
PASS RUN-004: LOW_DATA aggregates to COMPLETED_WITH_WARNINGS
PASS RUN-005: NO_DATA aggregates to COMPLETED_WITH_WARNINGS
PASS RUN-006: blocking job aggregates to MANUAL_ACTION_REQUIRED
PASS RUN-007: explicit user cancellation persists CANCELLED
PASS: retryable job failure does not force run FAILED
PASS: hard validation outcome waits for later retry/failure policy
PASS: illegal run transitions fail closed
PASS: terminal run status and timestamps survive restart
```

Previous run/job and attempt regression suites also remain passing.

---

# 5. Current Canonical Status Domains

Run status:

```text
PENDING
RUNNING
MANUAL_ACTION_REQUIRED
COMPLETED
COMPLETED_WITH_WARNINGS
FAILED
CANCELLED
```

Execution status:

```text
PENDING
RUNNING
VALIDATING
COMPLETED
FAILED
CANCELLED
MANUAL_ACTION_REQUIRED
RETRY_PENDING
```

Validation status:

```text
NOT_RUN
VALID
LOW_DATA
NO_DATA
INVALID_SCHEMA
ERROR_NOT_DATA
DATE_MISMATCH
QUERY_MISMATCH
```

Operational error codes remain separate from validation status.

Example:

```text
DOWNLOAD_FAILED
```

is an error code, not a validation status.

---

# 6. M2 Remaining Work

Not yet implemented:

```text
artifact persistence
artifact state / accepted canonical reference
validation-summary persistence
attempt → artifact / validation linkage
filesystem StorageManager
run directory creation
raw artifact collision protection
metadata JSON persistence
validation JSON persistence
incomplete-run discovery
resume reconciliation
accepted-job skip behavior
retry orchestration policy
sequential fake-source orchestration
structured logging
BrowserManager foundation
M2 acceptance gate
```

Real Google Trends browser automation remains M3 work.

---

# 7. Exact Next Action

Continue M2 with the next persistence contract slice:

```text
inspect current artifact + validation contracts
↓
define ArtifactRecord / ArtifactState
↓
define ValidationSummaryRecord
↓
SQLite migration v4
↓
persist candidate artifact reference
↓
link candidate artifact to attempt
↓
persist validation summary
↓
link validation to attempt + artifact
↓
accept VALID / LOW_DATA / NO_DATA artifact explicitly
↓
set job.accepted_artifact_id only after accepted validation
↓
reject hard validation artifact without canonical acceptance
↓
retry success supersedes job.accepted_artifact_id
↓
preserve prior attempt/artifact/validation history
↓
restart verification
↓
lint / type-check / deterministic integration tests
↓
Git checkpoint
```

This slice should remain SQLite/state focused.

Do not yet implement:

```text
real filesystem raw-file copying
full StorageManager
detailed validation JSON files
Google Trends parser
Google Trends validation rules
fake-source orchestration
resume reconciliation
BrowserManager
live Google Trends collection
```

Those should follow after artifact and validation reference contracts are stable.

---

# 8. Artifact / Validation Invariants for Next Slice

The next implementation must preserve:

```text
candidate artifact != automatically accepted artifact
```

A job may retain multiple historical artifacts.

At most one artifact is the canonical accepted artifact for the current job result.

Rejected artifacts remain traceable and must not feed normal exports.

Retry must not erase old:

```text
attempt
artifact
validation result
error evidence
```

If a later retry succeeds:

```text
job.accepted_artifact_id
```

must point to the new accepted artifact while earlier evidence remains persisted.

SQLite remains:

```text
operational state + searchable metadata
```

Filesystem remains the future canonical location for raw artifact bytes and detailed metadata/validation files.

---

# 9. M2 Gate Context

Current completed foundation:

```text
runs/jobs persistence         PASS
attempt persistence           PASS
job state machine             PASS
run state machine             PASS
run aggregation               PASS
manual-action propagation     PASS
warning aggregation           PASS
cancellation persistence      PASS
restart persistence           PASS
```

Still required before M2 completion:

```text
artifact records
validation summaries
accepted artifact references
resume reconstruction
retry orchestration
sequential fake-source orchestration
storage integrity
safe logging
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
