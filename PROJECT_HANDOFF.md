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
996b34e feat: add persisted run and job state
```

Previous verified checkpoints:

```text
2320804 docs: close M1 and prepare M2
5503309 feat: add SQLite schema bootstrap
35d9b74 feat: add source registry and Google Trends placeholder
b8d9505 docs: update M1 handoff after config slice
9e3328b feat: add app directories and YAML query config loader
885b132 docs: add M0 baseline and update M1 handoff
06740fb feat: add React renderer and typed IPC bridge
e2409cc chore: bootstrap Electron Forge Vite TypeScript app
```

Working tree was clean immediately after `996b34e`.

---

# 2. Milestone Status

## M0 — Product & Architecture Lock

```text
STATUS: COMPLETED
```

## M1 — Application Skeleton

```text
STATUS: COMPLETED
```

## M2 — Core Collector Engine

```text
STATUS: IN PROGRESS
```

M2 currently has verified run/job persistence.

Attempts, retry/resume orchestration, artifacts, validation summaries, storage infrastructure, logging, BrowserManager foundation, and fake-source orchestration are not yet complete.

## M3 — Google Trends MVP Collector

```text
STATUS: NOT STARTED
```

No real Google Trends browser collection has started.

---

# 3. Verified M1 Baseline

Target machine:

```text
macOS:        26.5.2
Architecture: arm64
Node.js dev:  24.19.0 via nvm
npm:          11.17.0
Electron:     43.4.0
Electron Node:24.18.1
SQLite:       3.53.1
```

Verified M1 chain:

```text
Electron
↓
React
↓
safe typed IPC
↓
application directories
↓
YAML QueryConfig
↓
SourceRegistry
↓
SQLite bootstrap
↓
production package
↓
packaged macOS app launch
```

---

# 4. M2 Completed Work

## SQLite Schema Version 2

Schema version 2 adds operational persistence for:

```text
runs
jobs
```

Migration history:

```text
1 bootstrap_schema
2 run_job_persistence
```

The existing M1 database successfully migrated from schema version 1 to version 2.

Foreign-key enforcement remains enabled.

SQLite quick-check remains healthy.

## Run Persistence

A new run is persisted with:

```text
run_status = PENDING
```

The run stores:

```text
run_id
run_status
created_at
started_at
completed_at
application_version
selected_sources
configuration_snapshot
```

The configuration snapshot preserves the effective source/query/date/search configuration used at run creation.

Historical run interpretation does not depend on the current live config file.

## Job Persistence

For the Google Trends configuration:

```text
one query group = one job
```

Jobs persist independently and in query-group order.

Initial job state:

```text
execution_status = PENDING
validation_status = NOT_RUN
attempt_count = 0
accepted_artifact_id = null
```

Job identity preserves:

```text
run_id
source_id
job_key
query_group_id
job_order
```

## StateRepository

The first StateRepository slice can:

```text
create run from canonical QueryConfig
create ordered jobs
read a run
list jobs in deterministic order
read run/job counts
close and reopen repository
```

A new repository instance can reload the same persisted run and jobs.

## Persisted Status Guards

SQLite-level constraints reject invalid persisted status values.

Execution and validation remain separate domains.

Examples verified to fail closed:

```text
run_status = NOT_A_STATUS
execution_status = DOWNLOAD_FAILED
validation_status = MANUAL_ACTION_REQUIRED
```

`DOWNLOAD_FAILED` remains an operational error code rather than an execution/validation status.

`MANUAL_ACTION_REQUIRED` remains an execution/control-flow state rather than validation status.

## Foreign-Key Integrity

Verified relationship:

```text
runs
└── jobs
```

Invalid job reassignment to a missing run is rejected.

`PRAGMA foreign_key_check` returned no problems.

---

# 5. M2 Deterministic Verification Record

Verified integration tests:

```text
PASS ID-001: run_id is filesystem-safe
PASS ID-002: rapid run_id generation remained unique
PASS DB-001: legacy schema v1 upgrades to v2
PASS DB-002: run persisted as PENDING
PASS DB-003: ordered jobs persisted independently
PASS DB-008: run/jobs survive repository restart
PASS DB-010: foreign-key integrity remains valid
PASS: invalid persisted status values fail closed
PASS: configuration snapshot survives restart
```

Verified runtime database state:

```text
schema version      = 2
migrations applied  = 2
journal mode        = wal
foreign keys        = ON
quick check         = ok
```

The real application database was not populated with fake run/job records during deterministic integration testing.

Temporary databases are used for persistence tests.

---

# 6. Current Canonical Status Domains

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

These domains must remain separate.

Operational conditions such as:

```text
DOWNLOAD_FAILED
```

belong in structured error/error-code context rather than validation status.

---

# 7. M2 Remaining Work

Not yet implemented:

```text
attempt persistence
attempt numbering
job execution transition service
run transition service
retry creation semantics
retry history preservation
artifact persistence
validation-summary persistence
error persistence
incomplete-run discovery
resume reconciliation
accepted-job skip behavior
sequential fake-source orchestration
cancellation behavior
manual-action orchestration
storage collision protection
structured logging
BrowserManager foundation
M2 acceptance gate
```

Real Google Trends automation remains M3 work.

---

# 8. Current Dependency / Security Notes

Production dependency audit previously verified:

```text
npm audit --omit=dev
0 vulnerabilities
```

Full development/build dependency findings remain known technical debt.

Do not run:

```text
npm audit fix --force
```

without a deliberate toolchain migration and regression test.

Do not log passwords, 2FA codes, cookies, session tokens, OAuth secrets, access tokens, or refresh tokens.

---

# 9. Exact Next Action

Continue M2 with the next smallest persistence/state-machine slice:

```text
define canonical AttemptRecord
↓
SQLite migration v3 → attempts
↓
create first attempt with attempt_number = 1
↓
persist attempt independently from job
↓
increment job.attempt_count transactionally
↓
reload attempt history after repository restart
↓
define deterministic job execution transition guard
↓
prove:
PENDING → RUNNING
RUNNING → VALIDATING
VALIDATING → COMPLETED
RUNNING → FAILED
FAILED → RETRY_PENDING
MANUAL_ACTION_REQUIRED remains distinct from FAILED
↓
reject illegal transitions
↓
lint / type-check / deterministic integration tests
↓
Git checkpoint
```

The first attempt/state-transition slice should not yet implement:

```text
artifact persistence
validation-summary persistence
retry orchestration
resume orchestration
real source collection
BrowserManager
```

Those follow after attempt persistence and transition semantics are stable.

---

# 10. Attempt Contract Target

The canonical attempt record should preserve:

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

Attempt history must be append-only in normal retry behavior.

A retry must not overwrite or delete the previous attempt.

The first attempt starts at:

```text
attempt_number = 1
```

A later retry creates:

```text
attempt_number = 2
```

rather than rewriting attempt 1.

---

# 11. M2 Boundary

Do not connect the live Google Trends UI yet.

M2 proves reusable Core behavior using deterministic local tests and fake/test sources.

M3 will own:

```text
Playwright Google Trends navigation
real provider state
real CSV export
real parser evidence
real source validation
first live GT group
progressive GT01–GT20 rollout
```

---

# 12. Handoff Discipline

At the end of every meaningful implementation session:

1. verify actual behavior,
2. record tests that actually ran,
3. record known failures,
4. update current milestone state,
5. record latest verified Git checkpoint,
6. record one exact next action.

Never record unverified implementation work as completed.
