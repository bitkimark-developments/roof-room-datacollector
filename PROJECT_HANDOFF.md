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
e14c959 feat: add reconciliation and retry policy
```

Previous verified checkpoints:

```text
65295d7 docs: update M2 handoff after resume planning
38dc16a feat: add resume reconciliation planning
65b239d docs: update M2 handoff after storage manager
add43fa feat: add raw artifact storage manager
1fdac5d docs: update M2 handoff after artifact persistence
f9c6356 feat: persist artifacts and validation summaries
```

Working tree is clean after `e14c959`.

---

# 2. M2 Completed Core Chain

Verified operational chain:

```text
persist
→ restart
→ discover
→ classify
→ reconcile
→ explicit retry
→ preserve history
```

Persisted entities:

```text
run
└── job
    └── attempt
        ├── candidate artifact
        └── validation summary
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

StorageManager raw artifact persistence is implemented.

Verified:

```text
safe run/source directory creation
exact raw byte preservation
byte_size from persisted bytes
SHA-256 from persisted bytes
no silent overwrite
attempt-suffixed retry filename
path traversal rejection
run-scoped relative paths
restart persistence
```

---

# 4. Resume Planning

ResumePlanner is a read-only reconstruction layer.

Classification:

```text
COMPLETED + accepted artifact
→ SKIP_ACCEPTED

PENDING
→ PENDING

FAILED / RETRY_PENDING
→ RETRY_CANDIDATE

MANUAL_ACTION_REQUIRED
→ BLOCKED_MANUAL_ACTION

RUNNING / VALIDATING
→ RECONCILE_REQUIRED
```

Candidate and accepted artifact references are preserved.

Completed terminal runs are excluded from incomplete-run discovery.

---

# 5. Reconciliation / Retry Policy

Implemented:

```text
ReconciliationCoordinator
RetryPolicy
ReconciliationResult contract
```

Verified behavior:

```text
SKIP_ACCEPTED
→ no mutation / no scheduling

PENDING
→ eligible for initial work
→ not auto-started by reconciliation

BLOCKED_MANUAL_ACTION
→ no automatic failure
→ no automatic retry

RECONCILE_REQUIRED + candidate
→ candidate preserved
→ no recollection
→ validation/reconciliation required first

RECONCILE_REQUIRED without candidate
→ interrupted attempt preserved as FAILED
→ error_code = INTERRUPTED_ATTEMPT
→ job becomes RETRY_PENDING if retry allowed

RETRY_CANDIDATE
→ explicit retry eligibility
→ attempt_number increments
→ prior attempts preserved

retry exhausted
→ RETRY_EXHAUSTED
→ no new attempt
```

Stale resume plans fail closed before mutation.

---

# 6. Verified Reconciliation / Retry Tests

```text
PASS RECONCILE-001: accepted job is skipped without mutation
PASS RECONCILE-002: pending job is initial-work eligible but not auto-started
PASS RECONCILE-003: manual-action job is never auto-failed or retried
PASS RECONCILE-004: candidate evidence is preserved before recollection
PASS RECONCILE-005: interrupted attempt without candidate becomes FAILED evidence then RETRY_PENDING
PASS RETRY-003: explicit retry creates attempt_number 2 and preserves attempt 1
PASS RETRY-004: FAILED job can be explicitly prepared and retried
PASS RETRY-005: max-attempt policy denies exhausted retry without creating history
PASS RECONCILE-006: stale resume plans fail closed before mutation
PASS RECONCILE-007: reconciliation/retry evidence survives repository restart
```

All prior M2 regression suites remain passing.

---

# 7. Current Deterministic Test Surface

```text
npm run test:m2:state
npm run test:m2:attempts
npm run test:m2:runs
npm run test:m2:artifacts
npm run test:m2:storage
npm run test:m2:resume
npm run test:m2:reconcile
```

---

# 8. Current M2 Acceptance-Gate Position

Completed:

```text
run/job persistence
attempt history
state transitions
artifact records
validation summaries
accepted-artifact references
raw filesystem preservation
collision protection
incomplete-run discovery
accepted-job skip
candidate preservation
reconciliation mutation policy
explicit retry policy
retry limit behavior
restart persistence
```

Remaining major M2 gaps:

```text
sequential fake-source orchestration
metadata JSON persistence
validation JSON persistence
structured logging
sensitive-value redaction
BrowserManager foundation
integrated M2 acceptance gate
```

---

# 9. Exact Next Action

Implement the smallest sequential fake-source orchestration vertical slice.

Target flow:

```text
create run
↓
start run
↓
select first schedulable job
↓
start attempt
↓
fake source returns deterministic raw bytes
↓
StorageManager persists raw bytes
↓
StateRepository registers candidate artifact
↓
transition to VALIDATING
↓
deterministic fake validator returns VALID
↓
record validation summary
↓
transition job to COMPLETED
↓
advance to next job
```

One deterministic job should intentionally fail on attempt 1:

```text
attempt 1
→ FAILED with explicit fake error

reconciliation / retry policy
→ RETRY_PENDING
→ attempt 2

attempt 2
→ deterministic success
→ accepted artifact
→ COMPLETED
```

Restart scenario must prove:

```text
already accepted jobs
→ skipped

retry-pending/retryable job
→ reconstructed correctly

remaining pending job
→ continues in order
```

---

# 10. Fake-Source Slice Boundaries

This slice should use only deterministic local test behavior.

Do not implement:

```text
Google Trends browser automation
Playwright provider workflow
real downloads
provider authentication
real CSV validation logic
XLSX export
```

The goal is to prove the core orchestration contracts before introducing provider complexity.

---

# 11. Orchestration Guardrails

Default execution remains sequential.

One job should be active at a time for the fake-source slice.

Source execution must return evidence/data to the core; it must not directly mutate SQLite state.

StorageManager owns artifact bytes and paths.

StateRepository owns persisted operational state.

Validation result persistence must remain separate from execution status.

Accepted jobs must not be recollected during resume.

Retry must append attempts, never rewrite historical attempts.

---

# 12. Work After Fake-Source Orchestration

After the fake-source vertical slice:

```text
MetadataManager / metadata JSON
validation JSON file persistence
structured logging
sensitive-value redaction
BrowserManager foundation
integrated M2 acceptance gate
```

Real Google Trends collection remains M3.

---

# 13. Handoff Discipline

At the end of each meaningful implementation session:

1. verify actual behavior,
2. record tests that actually ran,
3. record known issues,
4. update milestone progress,
5. record latest Git checkpoint,
6. record one exact next action.

Never record unverified work as completed.
