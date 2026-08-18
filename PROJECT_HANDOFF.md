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
add43fa feat: add raw artifact storage manager
```

Previous verified checkpoints:

```text
1fdac5d docs: update M2 handoff after artifact persistence
f9c6356 feat: persist artifacts and validation summaries
4852f1c docs: update M2 handoff after run lifecycle slice
f7b7d46 feat: add run lifecycle aggregation
46680d5 docs: update M2 handoff after attempt state slice
31f427d feat: add attempt persistence and job state transitions
```

Working tree is clean after `add43fa`.

---

# 2. M2 Completed Foundation

Verified Core persistence chain:

```text
run
└── job
    └── attempt
        ├── candidate artifact
        └── validation summary
```

Verified behavior:

```text
runs/jobs persist
attempts persist
attempt history survives restart
job execution state machine works
run lifecycle aggregation works
artifact records persist
validation summaries persist
accepted artifact references are explicit
retry preserves historical evidence
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

# 3. StorageManager

Raw artifact filesystem persistence is now implemented and tested.

Run-scoped layout:

```text
data/runs/<run_id>/
├── <source_id>/
│   ├── raw/
│   ├── metadata/
│   └── validation/
├── exports/
└── logs/
```

Verified behavior:

```text
run/source directories created safely
exact raw bytes preserved
byte_size derived from persisted bytes
SHA-256 derived from persisted bytes
existing artifact never silently overwritten
retry creates a distinct attempt-suffixed path
unsafe filenames/path traversal fail closed
relative artifact paths remain run-scoped
persisted evidence survives StorageManager restart
```

Retry naming currently follows:

```text
attempt 1:
GT01_TR_24M_interest_over_time.csv

attempt 2:
GT01_TR_24M_interest_over_time__attempt_2.csv
```

Raw evidence remains immutable.

No SQLite schema change was required for this slice.

---

# 4. Current Deterministic Test Surface

```text
npm run test:m2:state
npm run test:m2:attempts
npm run test:m2:runs
npm run test:m2:artifacts
npm run test:m2:storage
```

Storage tests verified:

```text
PASS STORAGE-001: run/source filesystem directories are created
PASS STORAGE-002: raw artifact bytes are preserved exactly
PASS STORAGE-003: byte_size and SHA-256 come from persisted bytes
PASS STORAGE-004: existing raw artifact is never silently overwritten
PASS STORAGE-005: retry uses a separate attempt-suffixed path
PASS STORAGE-006: unsafe filename/path traversal fails closed
PASS STORAGE-007: artifact relative_path remains run-scoped
PASS STORAGE-008: persisted raw evidence survives manager restart
```

Previous M2 regression suites remain passing.

---

# 5. Current M2 Acceptance-Gate Position

Already proven:

```text
runs/jobs persistence
independent attempts
attempt restart persistence
artifact records
accepted artifact references
retry history preservation
execution/validation status separation
raw filesystem preservation
collision protection
```

The most important remaining data-contract gap is:

```text
resume can reconstruct incomplete state
```

The source-module M2 gate also still requires a fake/test source to:

```text
receive a job context
produce deterministic test evidence
pass through storage
pass through validation
produce job state
retry through a second attempt
survive resume reconstruction
```

---

# 6. Decision — Next Slice

Resume/reconciliation foundation comes before metadata/validation JSON file persistence.

Reason:

```text
resume reconstruction is an explicit M2 acceptance-gate requirement
```

while detailed metadata/validation JSON persistence is important but does not unblock the core run/job recovery semantics as directly.

MetadataManager remains required before M2 closure and will follow after resume semantics are stable.

---

# 7. Exact Next Action

Implement the smallest resume/reconciliation slice:

```text
inspect resume contracts + current StateRepository read APIs
↓
discover non-terminal/incomplete runs
↓
load jobs, attempts, accepted artifact references
↓
classify each job deterministically
↓
accepted + completed job
→ SKIP / preserve
↓
FAILED retryable job
→ RETRY_CANDIDATE
↓
RETRY_PENDING job
→ RETRY_CANDIDATE
↓
MANUAL_ACTION_REQUIRED
→ BLOCKED_MANUAL_ACTION
↓
RUNNING / VALIDATING interrupted state
→ RECONCILE_REQUIRED
↓
PENDING
→ PENDING
↓
verify accepted artifact reference resolves to persisted artifact metadata
↓
do not recollect automatically during reconstruction
↓
restart tests
↓
Git checkpoint
```

Do not yet implement automatic retry execution.

Do not yet implement Google Trends browser work.

---

# 8. Next Resume Slice Boundaries

The first resume slice should answer only:

```text
What persisted work exists?
What state was each job in?
Which jobs are already accepted and must be skipped?
Which jobs need reconciliation?
Which jobs are retry candidates?
Which jobs require manual action?
```

It should not yet answer:

```text
When should automatic retry run?
How many retries are allowed?
How long should cooldown be?
How does live provider/browser state reconcile?
```

Those belong to later orchestration policy.

---

# 9. Remaining M2 Work After Resume Foundation

```text
retry orchestration policy
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

# 10. Handoff Discipline

At the end of each meaningful implementation session:

1. verify actual behavior,
2. record tests that actually ran,
3. record known issues,
4. update milestone progress,
5. record latest Git checkpoint,
6. record one exact next action.

Never record unverified work as completed.
