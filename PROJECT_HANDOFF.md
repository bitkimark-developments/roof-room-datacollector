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
31f427d feat: add attempt persistence and job state transitions
```

Previous verified checkpoints:

```text
47e725b docs: update M2 handoff after run job persistence
996b34e feat: add persisted run and job state
2320804 docs: close M1 and prepare M2
5503309 feat: add SQLite schema bootstrap
35d9b74 feat: add source registry and Google Trends placeholder
```

Working tree was clean immediately after `31f427d`.

---

# 2. M2 Completed Work

## Run / Job Persistence

Verified:

- SQLite schema version 2 introduced `runs` and `jobs`,
- one query group persists as one independently tracked job,
- job order follows QueryConfig order,
- run configuration snapshot survives restart,
- run/job records survive repository reopen,
- foreign-key integrity remains valid,
- invalid persisted status values fail closed.

Initial states:

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

Canonical attempt context now preserves:

```text
attempt_id
job_id
attempt_number
execution_status
candidate_artifact_id
validation_id
error_code
started_at
completed_at
```

Verified:

```text
first attempt → attempt_number = 1
retry         → attempt_number = 2
```

Retry appends a new attempt and does not overwrite the previous attempt.

A previous failed attempt retains its historical:

```text
execution_status
error_code
timestamps
```

after a later retry succeeds.

## Job Execution State Machine

Verified legal transitions include:

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

Starting:

```text
PENDING → RUNNING
```

or:

```text
RETRY_PENDING → RUNNING
```

must pass through `startAttempt()` so attempt history cannot be bypassed.

Verified failure semantics:

```text
execution_status = FAILED
error_code = DOWNLOAD_FAILED
validation_status = NOT_RUN
```

`DOWNLOAD_FAILED` is not stored as a validation status.

`MANUAL_ACTION_REQUIRED` remains distinct from `FAILED`.

## Validation Completion Guard

A job may move:

```text
VALIDATING → COMPLETED
```

only with a terminal validation status.

Example verified:

```text
execution_status  = COMPLETED
validation_status = VALID
```

Illegal transitions fail closed.

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

Verified runtime health remains:

```text
journal mode = wal
foreign keys = ON
quick check  = ok
```

Deterministic integration tests use temporary databases and do not populate the real application database with fake operational records.

---

# 4. Verified M2 Tests

Verified run/job persistence tests:

```text
PASS ID-001: run_id is filesystem-safe
PASS ID-002: rapid run_id generation remained unique
PASS DB-001: legacy schema upgrades correctly
PASS DB-002: run persisted as PENDING
PASS DB-003: ordered jobs persisted independently
PASS DB-008: run/jobs survive repository restart
PASS DB-010: foreign-key integrity remains valid
PASS: invalid persisted status values fail closed
PASS: configuration snapshot survives restart
```

Verified attempt / state-machine tests:

```text
PASS ID-004: first attempt starts at attempt_number 1
PASS ID-005: retry creates attempt_number 2
PASS JOB-001: PENDING -> RUNNING via startAttempt
PASS JOB-002: RUNNING -> VALIDATING
PASS JOB-003: VALIDATING -> COMPLETED + VALID
PASS JOB-004: RUNNING -> FAILED with error_code
PASS JOB-005: FAILED -> RETRY_PENDING
PASS JOB-006: MANUAL_ACTION_REQUIRED stays distinct from FAILED
PASS ATTEMPT-001: first attempt persisted
PASS ATTEMPT-002: retry appends a new attempt
PASS ATTEMPT-003: prior failed attempt evidence preserved
PASS DB-004/DB-008: attempts survive repository restart
PASS: illegal transitions and invalid attempt states fail closed
```

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

These persisted domains remain separate.

---

# 6. M2 Remaining Work

Not yet implemented:

```text
RunManager lifecycle / aggregation
run timestamp transitions
run-level cancellation behavior
artifact persistence
validation-summary persistence
accepted artifact references
incomplete-run discovery
resume reconciliation
accepted-job skip behavior
sequential fake-source orchestration
retry orchestration policy
storage collision protection
structured logging
BrowserManager foundation
M2 acceptance gate
```

Real Google Trends browser automation remains M3 work.

---

# 7. Exact Next Action

Continue M2 with a focused RunManager slice:

```text
define run transition / aggregation service
↓
persist PENDING → RUNNING
↓
set run.started_at exactly once
↓
derive run state from persisted jobs
↓
prove all VALID jobs → COMPLETED
↓
prove LOW_DATA / NO_DATA warning outcome → COMPLETED_WITH_WARNINGS
↓
prove blocking MANUAL_ACTION_REQUIRED → run MANUAL_ACTION_REQUIRED
↓
prove remaining pending/retryable work → RUNNING
↓
prove single retryable job failure does not automatically force run FAILED
↓
persist terminal completed_at
↓
prove user cancellation → CANCELLED
↓
reject illegal run transitions
↓
restart and verify persisted run state
↓
lint / type-check / deterministic integration tests
↓
Git checkpoint
```

This slice should not yet implement:

```text
artifact persistence
validation-summary records
fake-source orchestration
resume reconciliation
BrowserManager
real Google Trends collection
```

Those follow after run-level lifecycle semantics are stable.

---

# 8. M2 Gate Context

The M2 deterministic gate still requires:

```text
runs/jobs persist
run/job state transitions
sequential fake-source orchestration
attempt persistence
artifact persistence
validation-summary persistence
resume
accepted-job skip behavior
retry history preservation
cancellation
manual-action state
storage collision protection
sensitive-safe logging
```

Current progress covers:

```text
runs/jobs persistence         PASS
job state transitions         PASS
attempt persistence           PASS
retry attempt preservation    PASS
manual-action job semantics   PASS
```

Run-level aggregation is the next missing state-machine foundation.

---

# 9. Handoff Discipline

At the end of every meaningful implementation session:

1. verify actual behavior,
2. record tests that actually ran,
3. record known failures,
4. update current milestone state,
5. record latest verified Git checkpoint,
6. record one exact next action.

Never record unverified work as completed.
