# RoofRoom Data Collector — Project Handoff

**Document:** `PROJECT_HANDOFF.md`
**Product:** RoofRoom Data Collector
**Last Updated:** 2026-08-18
**Current Milestone:** M2 — Core Collector Engine
**Milestone Status:** IN PROGRESS
**Previous Milestone:** M1 — Application Skeleton — COMPLETED

---

# 1. Current Repository

Repository:

```text
~/Projects/roofroom-data-collector/
```

Branch:

```text
main
```

Latest verified checkpoint:

```text
38dc16a feat: add resume reconciliation planning
```

Previous verified checkpoints:

```text
65b239d docs: update M2 handoff after storage manager
add43fa feat: add raw artifact storage manager
1fdac5d docs: update M2 handoff after artifact persistence
f9c6356 feat: persist artifacts and validation summaries
4852f1c docs: update M2 handoff after run lifecycle slice
f7b7d46 feat: add run lifecycle aggregation
```

Working tree is clean after `38dc16a`.

---

# 2. M2 Completed Foundation

Verified persistence chain:

```text
run
└── job
    └── attempt
        ├── candidate artifact
        └── validation summary
```

Verified core behavior:

```text
run/job persistence
attempt persistence
job execution state machine
run lifecycle aggregation
artifact persistence
validation-summary persistence
accepted-artifact references
raw filesystem persistence
resume discovery/reconstruction
```

Current SQLite schema:

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

---

# 3. Storage Foundation

StorageManager is implemented for raw source artifacts.

Verified:

```text
run/source directories are created safely
raw bytes are preserved exactly
byte_size is derived from persisted bytes
SHA-256 is derived from persisted bytes
silent overwrite is rejected
retry gets a distinct attempt-suffixed filename
path traversal fails closed
relative paths remain run-scoped
raw evidence survives StorageManager restart
```

Raw artifact layout:

```text
data/runs/<run_id>/
├── <source_id>/
│   ├── raw/
│   ├── metadata/
│   └── validation/
├── exports/
└── logs/
```

---

# 4. Resume / Reconciliation Foundation

ResumePlanner is implemented as a read-only reconstruction layer.

StateRepository can discover non-terminal runs:

```text
PENDING
RUNNING
MANUAL_ACTION_REQUIRED
```

Completed terminal runs are excluded from incomplete-run discovery.

Resume job classification:

```text
COMPLETED + accepted artifact
→ SKIP_ACCEPTED

PENDING
→ PENDING

FAILED
→ RETRY_CANDIDATE

RETRY_PENDING
→ RETRY_CANDIDATE

MANUAL_ACTION_REQUIRED
→ BLOCKED_MANUAL_ACTION

RUNNING
→ RECONCILE_REQUIRED

VALIDATING
→ RECONCILE_REQUIRED

COMPLETED without accepted artifact
→ RECONCILE_REQUIRED
```

Resume planning preserves candidate and accepted artifact references.

It does not automatically recollect, retry, or mutate job state.

---

# 5. Verified Resume Tests

```text
PASS DB-009: multiple incomplete runs are discovered while completed runs are excluded
PASS RESUME-001/JOB-007: completed accepted job is classified SKIP_ACCEPTED
PASS RESUME-002: interrupted RUNNING job without artifact requires reconciliation
PASS RESUME-003: interrupted job with candidate is reconciled before recollection
PASS RESUME-004: accepted artifact reference survives repository restart
PASS RESUME-005: multiple interrupted runs reconstruct independently
PASS: FAILED/RETRY_PENDING policy is represented as RETRY_CANDIDATE without auto-retry
PASS: MANUAL_ACTION_REQUIRED remains blocked and is not auto-retried
PASS: resume planning is read-only and does not rewrite persisted job states
```

Previous M2 regression suites remain passing.

---

# 6. Current Deterministic Test Surface

```text
npm run test:m2:state
npm run test:m2:attempts
npm run test:m2:runs
npm run test:m2:artifacts
npm run test:m2:storage
npm run test:m2:resume
```

---

# 7. Current M2 Acceptance-Gate Position

Completed:

```text
runs/jobs persist
attempt history persists
state transitions persist
artifact records persist
validation summaries persist
accepted artifact references are explicit
raw bytes are preserved on filesystem
collision protection exists
resume can discover incomplete runs
accepted jobs are identified for skip
candidate evidence is preserved for reconciliation
multiple interrupted runs reconstruct independently
```

Still missing:

```text
reconciliation mutation policy
retry orchestration policy
sequential fake-source orchestration
metadata JSON persistence
validation JSON persistence
structured logging
sensitive-value redaction
BrowserManager foundation
integrated M2 acceptance gate
```

---

# 8. Exact Next Action

Implement the next smallest orchestration slice:

```text
read ResumeJobPlan
↓
introduce explicit RetryPolicy / ReconciliationCoordinator boundary
↓
SKIP_ACCEPTED
→ no mutation / no scheduling

PENDING
→ schedulable initial work

RETRY_CANDIDATE
→ explicit retry eligibility check

RECONCILE_REQUIRED without candidate
→ mark interrupted attempt failed with structured error
→ move job to RETRY_PENDING when retry is allowed

RECONCILE_REQUIRED with candidate
→ preserve candidate evidence
→ do not recollect automatically
→ hand off to validation/reconciliation path

BLOCKED_MANUAL_ACTION
→ no automatic retry
↓
prove attempt history is preserved
↓
prove retry creates attempt_number +1
↓
prove accepted jobs remain untouched
↓
restart verification
↓
Git checkpoint
```

The slice should not yet execute a fake source.

---

# 9. Retry / Reconciliation Guardrails

Retry must never overwrite previous attempt evidence.

Accepted jobs must not be scheduled again during normal resume.

Manual-action jobs must not be converted to failure automatically.

Candidate artifacts must not be discarded merely because the process restarted.

A retry decision must be explicit and deterministic.

Do not embed provider-specific Google Trends behavior into the core retry policy.

---

# 10. Work After Reconciliation / Retry Policy

After the next slice:

```text
sequential fake-source orchestration
MetadataManager / metadata JSON
validation JSON file persistence
structured logging
sensitive-value redaction
BrowserManager foundation
M2 integrated acceptance gate
```

Real Google Trends collection remains M3.

---

# 11. Handoff Discipline

At the end of each meaningful implementation session:

1. verify actual behavior,
2. record tests that actually ran,
3. record known issues,
4. update milestone progress,
5. record latest Git checkpoint,
6. record one exact next action.

Never record unverified work as completed.
