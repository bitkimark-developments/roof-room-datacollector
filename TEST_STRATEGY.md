# RoofRoom Data Collector — Test Strategy

**Document:** `TEST_STRATEGY.md`  
**Product:** RoofRoom Data Collector  
**Status:** M0 approved baseline  
**Scope:** Test levels, test ownership, fixtures, failure simulation, live-source verification, resume/retry testing, data-integrity regression, milestone gates, and Release 1.0 quality criteria.

---

# 1. Purpose

RoofRoom Data Collector is a data collection system whose primary quality requirement is not simply that the application runs, but that collected data is:

- traceable,
- preserved,
- validated,
- recoverable,
- reproducible,
- exported without losing source meaning.

Testing must therefore prove more than:

```text
the button works
```

or:

```text
a CSV was downloaded
```

The test strategy must prove the complete chain:

```text
request
↓
run
↓
job
↓
attempt
↓
source interaction
↓
candidate artifact
↓
raw preservation
↓
validation
↓
accepted/rejected state
↓
resume/retry behavior
↓
export
↓
provenance
```

This document defines how that proof should be built incrementally across M1–M7.

---

# 2. Governing Test Principle

The project should follow:

> **Test the smallest deterministic component first, then test the integration boundary, then test the real external source.**

Do not depend on Google Trends for every test.

The majority of application behavior should be testable without live external services.

Live browser/source tests are required, but they should validate the integration rather than replace deterministic automated tests.

---

# 3. Testing Goals

The test system should provide confidence that:

1. The application starts correctly.
2. Configuration is parsed and rejected correctly when invalid.
3. Run and job state transitions are deterministic.
4. SQLite state survives restart.
5. Resume does not recollect already accepted jobs.
6. Retry preserves previous attempts.
7. Raw artifacts are not overwritten.
8. Candidate artifacts are not accepted before validation.
9. Invalid data cannot enter normal exports.
10. Missing values remain missing.
11. Google Trends values remain relative-interest values.
12. Comparison-group context is preserved.
13. Source-specific failures remain isolated to affected jobs.
14. Browser failures are surfaced clearly.
15. Manual authentication/security states do not trigger bypass behavior.
16. Google Trends UI changes fail visibly rather than silently corrupting data.
17. Workbook/CSV exports preserve provenance.
18. Release builds behave correctly on the target environment.

---

# 4. Test Pyramid

RoofRoom should use a practical test pyramid.

```text
                    ┌──────────────────┐
                    │ Live Source Tests│
                    │   few / costly   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ Browser / E2E    │
                    │ targeted         │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ Integration Tests│
                    │ core pipelines   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ Unit Tests       │
                    │ many / fast      │
                    └──────────────────┘
```

The project should have:

- many fast unit tests,
- focused integration tests,
- targeted browser/E2E tests,
- a small set of controlled live Google Trends verification tests.

---

# 5. Test Categories

Canonical categories:

```text
UNIT
INTEGRATION
FIXTURE
IPC
BROWSER
E2E
LIVE_SOURCE
FAILURE_SIMULATION
REGRESSION
MANUAL_ACCEPTANCE
RELEASE_SMOKE
```

A single test may logically belong to more than one category, but test naming should clearly communicate its primary purpose.

---

# 6. Test ID Convention

Stable test IDs are useful for documentation and handoff.

Recommended pattern:

```text
<AREA>-<NUMBER>
```

Examples:

```text
CFG-001
RUN-001
JOB-001
DB-001
VAL-001
GT-001
RESUME-001
RETRY-001
EXPORT-001
SEC-001
E2E-001
REL-001
```

Test IDs should remain stable even if implementation filenames change.

---

# 7. Test Directory Structure

Conceptual structure:

```text
tests/
├── unit/
│   ├── config/
│   ├── runs/
│   ├── jobs/
│   ├── validation/
│   ├── metadata/
│   ├── storage/
│   └── export/
│
├── integration/
│   ├── sqlite/
│   ├── orchestration/
│   ├── resume/
│   ├── retry/
│   ├── artifacts/
│   └── export/
│
├── fixtures/
│   ├── generic/
│   └── google-trends/
│
├── browser/
│   └── google-trends/
│
├── e2e/
│
└── release/
```

Exact paths may change after the real project skeleton is created.

---

# 8. Unit Testing Scope

Unit tests should cover deterministic logic without external services.

Preferred targets:

- config parsing,
- schema validation,
- ID generation,
- filename generation,
- state-transition logic,
- run aggregation,
- retry eligibility,
- date calculations,
- metadata construction,
- validation check logic,
- validation status precedence,
- artifact-state mapping,
- normalized row construction,
- export transformation logic.

Unit tests should generally not:

- launch Electron,
- launch Chromium,
- access live Google Trends,
- depend on internet access.

---

# 9. Configuration Tests

The query configuration is an important reproducibility boundary.

Required tests should include:

## CFG-001 — Valid Config Loads

Given a valid YAML configuration:

```text
GT01
GT02
...
```

Expected:

- config parses,
- source ID is canonical,
- query order is preserved.

---

## CFG-002 — Duplicate Group ID Rejected

Input:

```text
GT01
GT01
```

Expected:

```text
configuration error
```

No run should start.

---

## CFG-003 — Missing Group ID Rejected

Expected:

- parsing fails clearly,
- no partially valid run is created.

---

## CFG-004 — Empty Query List Rejected

A configured group with no queries must not silently become a job.

---

## CFG-005 — Duplicate Query Within Group

By default:

```text
reject
```

unless a future source-specific contract explicitly permits it.

---

## CFG-006 — Duplicate Query Across Groups

Expected:

```text
allowed
```

Comparison-group context must remain separate.

---

## CFG-007 — Query Order Preserved

The normalized config representation must retain input order.

---

## CFG-008 — JSON Adapter Normalizes to Canonical Contract

Before Release 1.0, a valid JSON configuration must produce the same canonical `QueryConfig` semantics as equivalent YAML input.

---

## CFG-009 — CSV Adapter Normalizes to Canonical Contract

Before Release 1.0, a valid CSV configuration must produce the same canonical query groups, query order, and source identity as equivalent YAML input.

---

## CFG-010 — Cross-Format Equivalence

Equivalent YAML, JSON, and CSV inputs must normalize to equivalent internal query-group representations. Collector logic must not branch on the original input format.

---

# 10. ID and Naming Tests

Required deterministic tests:

```text
ID-001 run_id is filesystem-safe
ID-002 run_id is unique across rapid creation
ID-003 job identity preserves run/source/job_key
ID-004 attempt_number starts at 1
ID-005 retry increments attempt_number
FILE-001 canonical GT raw filename
FILE-002 retry cannot silently overwrite prior artifact
FILE-003 relative paths remain run-root relative
```

---

# 11. Run State Tests

RunManager must be tested independently.

Examples:

## RUN-001 — New Run

Expected:

```text
PENDING
```

before execution.

---

## RUN-002 — Start Run

Transition:

```text
PENDING → RUNNING
```

---

## RUN-003 — All Jobs Valid

Expected:

```text
COMPLETED
```

---

## RUN-004 — Low Data Warning

If all jobs are terminal and one is:

```text
LOW_DATA
```

Expected run result:

```text
COMPLETED_WITH_WARNINGS
```

---

## RUN-005 — No Data Warning

A valid provider no-data outcome must not be converted to numeric zero.

Run aggregation should surface warning context.

---

## RUN-006 — Manual Action

A blocking source job should make the run reflect:

```text
MANUAL_ACTION_REQUIRED
```

without marking successful jobs failed.

---

## RUN-007 — User Cancellation

Expected:

```text
CANCELLED
```

with already persisted artifacts preserved.

---

# 12. Job State Tests

Job lifecycle must be deterministic.

Examples:

```text
JOB-001 PENDING → RUNNING
JOB-002 RUNNING → VALIDATING
JOB-003 VALIDATING → COMPLETED + VALID
JOB-004 RUNNING → FAILED
JOB-005 FAILED → RETRY_PENDING
JOB-006 MANUAL_ACTION_REQUIRED does not become FAILED automatically
JOB-007 completed accepted job is not scheduled by normal resume
```

Execution and validation statuses must be tested separately.

---

# 13. Attempt Tests

Attempt history is critical for auditability.

Required tests:

## ATTEMPT-001 — First Attempt

Expected:

```text
attempt_number = 1
```

---

## ATTEMPT-002 — Retry Creates New Attempt

Expected:

```text
attempt 1 remains persisted
attempt 2 is created
```

---

## ATTEMPT-003 — Previous Failure Preserved

Retry must not erase:

- old error,
- old artifact,
- old validation result.

---

## ATTEMPT-004 — Accepted Retry Supersedes Canonical Reference

If attempt 2 succeeds:

```text
job.accepted_artifact_id
```

points to the new accepted artifact.

Historical attempt 1 evidence remains preserved.

---

# 14. SQLite Integration Tests

SQLite is operational state, so restart behavior must be proven.

Test with isolated temporary databases.

Required tests:

```text
DB-001 initialize empty database
DB-002 create run
DB-003 create jobs
DB-004 persist attempt
DB-005 persist artifact reference
DB-006 persist validation summary
DB-007 persist error
DB-008 reload state in a new repository instance
DB-009 incomplete run can be discovered
DB-010 foreign-key relationships remain valid
```

Tests should avoid using the developer's real application database.

---

# 15. Filesystem / Storage Integration Tests

Use temporary directories.

Required tests:

## STORAGE-001 — Run Directory Creation

Expected run structure is created safely.

---

## STORAGE-002 — Raw Artifact Persistence

Candidate source file can be persisted.

---

## STORAGE-003 — Raw Artifact Is Not Modified

After acceptance, test code should verify that normalization/export operations do not mutate raw bytes.

If hashing is implemented, compare hashes.

Otherwise compare bytes directly.

---

## STORAGE-004 — Collision Protection

A second attempt must not overwrite attempt 1 silently.

---

## STORAGE-005 — Metadata Persistence

Metadata JSON remains linked to correct run/job/artifact.

---

## STORAGE-006 — Validation Persistence

Validation JSON remains linked to correct candidate artifact.

---

# 16. Validation Unit Tests

The validation engine should be heavily fixture-driven.

Generic minimum tests:

```text
VAL-001 artifact missing
VAL-002 unreadable artifact
VAL-003 zero-byte file
VAL-004 HTML page detection
VAL-005 malformed CSV
VAL-006 missing required column
VAL-007 unexpected schema
VAL-008 invalid numeric field
VAL-009 deterministic status precedence
VAL-010 artifact-state mapping
VAL-011 missing value remains null
VAL-012 rejected artifact is export-ineligible
```

These requirements follow the validation-first model where candidate artifacts must be checked before acceptance.

---

# 17. Validation Status Precedence Tests

When multiple failures exist, primary status resolution must remain deterministic.

Example:

```text
HTML page
+
CSV parser failure
```

Expected primary status:

```text
ERROR_NOT_DATA
```

not:

```text
INVALID_SCHEMA
```

because the content is not a dataset at all.

Test dataset-validation precedence for at least:

```text
ERROR_NOT_DATA
INVALID_SCHEMA
QUERY_MISMATCH
DATE_MISMATCH
NO_DATA
LOW_DATA
VALID
```

Separately test that `DOWNLOAD_FAILED` routes to `execution_status = FAILED` + `error_code = DOWNLOAD_FAILED` + `validation_status = NOT_RUN`, and that `MANUAL_ACTION_REQUIRED` routes to the execution state with validation `NOT_RUN`.

---

# 18. Fixture Strategy

Fixtures are controlled source-like artifacts used for deterministic tests.

Fixtures should be:

- small,
- clearly named,
- documented,
- immutable,
- sanitized when based on real source files.

Preferred principle:

> **Use sanitized real source behavior whenever possible.**

Do not invent an imaginary Google Trends CSV schema and then test the application against that invented schema.

---

# 19. Fixture Provenance

Every real-source-derived fixture should include lightweight provenance documentation.

Example:

```text
fixture:
gt_interest_valid_5_queries.csv

derived_from:
real Google Trends UI export

sanitized:
yes

source_mode:
GOOGLE_TRENDS_UI

purpose:
valid five-query parser/validator test
```

Do not include sensitive account/session information.

---

# 20. Generic Fixture Set

Initial generic fixtures:

```text
empty_file.csv
html_login_page.html
html_error_page.html
malformed_csv.csv
numeric_parse_error.csv
unexpected_schema.csv
```

These fixtures can be created independently of Google Trends.

---

# 21. Google Trends Fixture Set

After the first real exports are captured and understood, create sanitized fixtures for:

```text
gt_valid_5_queries.csv
gt_queries_reordered.csv
gt_query_missing.csv
gt_wrong_group.csv
gt_wrong_date_range.csv
gt_duplicate_period.csv
gt_invalid_numeric.csv
gt_out_of_range_value.csv
gt_all_zero.csv
gt_low_signal.csv
gt_true_no_data.<appropriate-format>
```

Do not create `gt_true_no_data` until the real provider behavior is known.

---

# 22. Google Trends Parser Tests

After the live schema is discovered:

## GT-PARSE-001 — Valid Export

Expected:

- parser succeeds,
- temporal values map correctly,
- query series map correctly,
- raw file remains unchanged.

---

## GT-PARSE-002 — Reordered Query Columns

If Google legitimately reorders columns:

Expected:

- mapping remains correct by identity,
- no false `QUERY_MISMATCH`.

---

## GT-PARSE-003 — Missing Query

Expected:

```text
QUERY_MISMATCH
```

---

## GT-PARSE-004 — Unknown Schema

Expected:

```text
INVALID_SCHEMA
```

No guessed remapping.

---

# 23. Google Trends Semantic Tests

Required once real source behavior is established:

```text
GT-SEM-001 relative interest parses without absolute-volume conversion
GT-SEM-002 values remain associated with query_group_id
GT-SEM-003 duplicate query across GT04/GT05 stays separate
GT-SEM-004 SEARCH_TERM cannot silently become TOPIC
GT-SEM-005 WEB_SEARCH context is preserved
GT-SEM-006 TR geography request/observation is represented correctly
GT-SEM-007 requested and actual date ranges remain separate
```

---

# 24. Google Trends Date Tests

Date behavior is especially important because the MVP requires an exact requested 24-month window.

Required tests after live calibration:

```text
GT-DATE-001 exact requested range represented correctly
GT-DATE-002 actual source lag represented separately
GT-DATE-003 known acceptable boundary rounding
GT-DATE-004 materially wrong period → DATE_MISMATCH
GT-DATE-005 stale previous preset → DATE_MISMATCH
```

Do not invent source-lag tolerance before real behavior is documented.

---

# 25. Google Trends Low-Data / No-Data Tests

Thresholds must come from real calibration.

After calibration:

```text
GT-DATA-001 normal signal → VALID
GT-DATA-002 calibrated sparse signal → LOW_DATA
GT-DATA-003 real provider no-data response → NO_DATA
GT-DATA-004 empty file ≠ NO_DATA
GT-DATA-005 malformed all-zero artifact cannot silently become NO_DATA
```

`LOW_DATA` and `NO_DATA` must remain distinct from failure and from numeric zero.

---

# 26. Integration Pipeline Tests

Core integration should be testable without live Google.

Recommended use:

```text
FakeSourceModule
```

or equivalent deterministic test double.

Conceptual pipeline test:

```text
run created
↓
job created
↓
fake source produces candidate
↓
StorageManager persists candidate
↓
ValidationCoordinator validates
↓
artifact accepted/rejected
↓
job state persisted
↓
run aggregation updates
```

This proves the core independently from Google Trends UI stability.

---

# 27. Fake Source Module

A deterministic fake source is recommended for M2 tests if it materially simplifies coverage.

It may support scenarios such as:

```text
SUCCESS
DOWNLOAD_FAILURE
INVALID_DATA
MANUAL_ACTION
DELAY
CRASH
```

The fake source must never become production business logic.

Its purpose is to test the shared core.

---

# 28. Orchestration Tests

Required tests:

## ORCH-001 — Sequential Execution

For MVP:

```text
max active Google Trends jobs = 1
```

Test that GT02 does not start while GT01 is active.

---

## ORCH-002 — Continue After Job Failure

Example:

```text
GT01 VALID
GT02 FAILED
GT03 should still be eligible
```

according to configured run policy.

---

## ORCH-003 — Manual Action Stops Safe Progress

If a provider-wide browser/authentication state blocks subsequent jobs:

Expected:

- no aggressive retry loop,
- run enters manual-action state.

---

## ORCH-004 — Cancellation

Cancellation should:

- stop new jobs,
- preserve completed artifacts,
- persist terminal status.

---

# 29. Resume Tests

Resume is a Release 1.0-critical feature.

Required deterministic scenarios:

## RESUME-001 — Completed Jobs Stay Completed

Before interruption:

```text
GT01 VALID
GT02 VALID
GT03 RUNNING
GT04 PENDING
```

After restart:

```text
GT01 not recollected
GT02 not recollected
GT03 reconciled
GT04 pending
```

---

## RESUME-002 — Running Job Without Artifact

Expected:

- previous attempt marked incomplete/failed as designed,
- job becomes retryable,
- not assumed successful.

---

## RESUME-003 — Running Job With Candidate Artifact

Expected:

- candidate is reconciled,
- validation is attempted if safe,
- job is not automatically recollected before reconciliation.

---

## RESUME-004 — Accepted Artifact Survives Restart

Expected:

- accepted reference remains canonical,
- raw bytes unchanged.

---

## RESUME-005 — Multiple Interrupted Runs

Application should identify incomplete runs without corrupting prior completed runs.

---

# 30. Retry Tests

Required scenarios:

## RETRY-001 — Failed Job Only

Example:

```text
GT01 VALID
GT02 FAILED (error_code=DOWNLOAD_FAILED)
GT03 VALID
```

Retry GT02 only.

Expected:

- GT01 not rerun,
- GT03 not rerun,
- GT02 creates attempt 2.

---

## RETRY-002 — Old Attempt Preserved

Attempt 1 artifact/error remains available.

---

## RETRY-003 — New Valid Artifact Becomes Canonical

Attempt 2 succeeds.

Expected:

```text
accepted_artifact_id = attempt 2 artifact
```

---

## RETRY-004 — Retry Fails Again

Attempt 3 may be created only according to conservative retry policy.

No overwrite.

---

# 31. Failure Simulation Strategy

Failure testing should be deliberate.

Simulate:

- database write failure,
- filesystem permission failure,
- missing directory,
- disk write error where practical,
- browser crash,
- page timeout,
- download timeout,
- malformed artifact,
- process interruption,
- application shutdown during active job,
- validation exception,
- workbook export exception.

The objective is not to create every theoretical failure, but to test the failures most likely to corrupt state or data.

---

# 32. Process Interruption Testing

Important scenarios:

```text
kill app after run creation
kill app after job creation
kill app during browser collection
kill app after candidate file write
kill app during validation
kill app after validation before next job
kill app during export
```

After each simulated interruption:

- reopen application,
- inspect persisted state,
- verify no accepted data is lost,
- verify incomplete work is not falsely marked successful.

---

# 33. Browser Tests

Browser tests verify source/UI adapter behavior.

Use Playwright against controlled or live pages where appropriate.

Test responsibilities:

- browser profile can launch,
- correct profile path is used,
- download event can be captured,
- browser crash is surfaced,
- source module receives usable page/context,
- cleanup works.

Avoid testing core business state only through browser tests.

---

# 34. Google Trends UI Adapter Tests

When selectors/workflow are implemented, targeted tests should cover:

```text
open Trends
apply query group
apply Turkey
apply exact date range
apply All Categories
apply Web Search
confirm Search Term
reach Interest Over Time
trigger official CSV export
capture download
```

These tests may be partially live because the external UI is not fully controllable.

They must fail clearly if the UI changes.

---

# 35. Selector Strategy Tests

Selectors should favor stable, semantically meaningful UI anchors where possible.

Tests should detect when:

- required element is missing,
- multiple unexpected matches occur,
- state cannot be verified.

Do not silently fall back to guessed DOM positions that could select the wrong setting.

---

# 36. Live Google Trends Tests

Live source tests are required but should remain limited.

They should be:

- sequential,
- non-aggressive,
- manually invokable when appropriate,
- clearly separated from fast local tests.

Live tests should not run repeatedly merely to satisfy ordinary unit-test workflows.

---

# 37. Live Test Safety Rules

Live Google Trends tests must:

- not bypass CAPTCHA,
- not bypass 2FA,
- not bypass anti-bot protections,
- not evade rate limits,
- not use proxy rotation,
- not copy unauthorized cookies/sessions.

If security intervention appears:

```text
MANUAL_ACTION_REQUIRED
```

is the expected behavior.

---

# 38. First Live-Source Discovery Test

Before implementing broad GT01–GT20 automation, run one controlled group.

Objective:

1. Collect one real 24-month Interest Over Time export.
2. Preserve raw bytes.
3. Record exact source configuration.
4. Inspect actual CSV schema.
5. Inspect encoding/delimiter.
6. Determine temporal granularity.
7. Determine query-column representation.
8. Determine actual date coverage behavior.
9. Build sanitized fixture.
10. Write parser/validator tests from evidence.

This is a discovery/contract test, not merely a smoke test.

---

# 39. Progressive Live-Test Expansion

Google Trends rollout:

```text
Phase A:
1 query group

Phase B:
3 representative groups

Phase C:
GT01–GT20
```

Do not run all GT01–GT20 until the single-group path is reliable and validator-backed.

---

# 40. Representative Group Selection

When expanding from one group to a few groups, choose groups that exercise different data characteristics.

Examples:

- stronger-signal generic terms,
- species terms,
- potentially lower-signal long-tail terms.

Selection is for test diversity, not marketing analysis.

Do not use test results to make commercial recommendations inside the collector.

---

# 41. E2E Test Scope

End-to-end tests verify the application from UI request to persisted output.

Conceptual E2E flow:

```text
launch app
↓
renderer loads
↓
select GT group
↓
start run
↓
core creates run/job
↓
source produces artifact
↓
validation runs
↓
UI shows final result
↓
run folder contains expected files
```

Use deterministic fake source E2E where possible.

Reserve live Google Trends E2E for a small set of acceptance tests.

---

# 42. IPC Tests

The renderer/main boundary is security-relevant.

Required tests:

```text
IPC-001 listSources returns serializable data
IPC-002 createRun validates payload
IPC-003 invalid source ID rejected
IPC-004 renderer cannot request arbitrary filesystem path operations
IPC-005 renderer cannot invoke arbitrary shell
IPC-006 job/run events serialize correctly
```

No privileged Playwright/database objects should cross IPC.

---

# 43. UI Tests

UI testing should focus on behavior important to safe operation.

Examples:

```text
UI-001 sources display
UI-002 selected groups included in run request
UI-003 progress reflects run/job state
UI-004 VALID visually distinct
UI-005 LOW_DATA visibly warns
UI-006 NO_DATA not displayed as zero
UI-007 hard failure visibly distinct
UI-008 MANUAL_ACTION_REQUIRED visible
UI-009 Retry Failed sends only eligible jobs
UI-010 Resume shows incomplete run
```

Pixel-perfect visual testing is not an MVP priority.

---

# 44. Export Tests

Exports must preserve semantics.

Required tests:

## EXPORT-001 — Workbook Sheets Exist

Expected MVP sheets:

```text
README
RUN_METADATA
QUERY_UNIVERSE
GT_24M_RAW
VALIDATION_LOG
ERROR_LOG
```

when implemented.

---

## EXPORT-002 — Missing Numeric Values Stay Empty

Expected:

```text
null → empty cell
```

not:

```text
0
```

---

## EXPORT-003 — True Zero Remains Zero

Expected:

```text
relative_interest = 0
```

exports as numeric zero.

---

## EXPORT-004 — Comparison Group Preserved

`monstera` in GT04 and GT05 must remain separate rows/context.

---

## EXPORT-005 — Rejected Artifact Excluded

Rejected source artifacts must not generate normal GT rows.

---

## EXPORT-006 — Warning State Preserved

LOW_DATA rows retain validation context.

---

## EXPORT-007 — Provenance Reference Exists

Normalized/exported rows retain linkage to raw artifact/job/run.

---

# 45. Raw Data Integrity Regression Tests

Tests should explicitly prove:

- raw source bytes are not modified by parsing,
- raw source bytes are not modified by validation,
- raw source bytes are not modified by workbook generation,
- retry does not overwrite prior raw evidence.

If file hashing is adopted:

```text
hash before normalization == hash after normalization
```

should be tested.

---

# 46. Semantic Regression Tests

These are especially important for RoofRoom.

Must prevent future refactors from introducing:

```text
missing → 0
relative_interest → estimated_searches
query-only deduplication
Search Term + Topic merge
cross-group global normalization
rejected artifact → export
```

Each should have at least one automated regression test.

---

# 47. Security Behavior Tests

Test expected safe behavior, not bypass capability.

Examples:

## SEC-001 — Password Not Persisted

No collector configuration should contain account password fields.

---

## SEC-002 — Manual Authentication

Authentication-required condition maps to controlled user action.

---

## SEC-003 — CAPTCHA / Security Challenge

Expected:

```text
MANUAL_ACTION_REQUIRED
```

No automatic solve/retry bypass loop.

---

## SEC-004 — Sensitive Logging

Known sensitive fields must not appear in normal logs.

---

## SEC-005 — Renderer Privilege Boundary

Renderer cannot directly access database/browser/filesystem primitives.

---

# 48. Performance Testing

Heavy performance testing is not an MVP priority.

MVP performance expectations:

- UI remains responsive during collection,
- SQLite operations are not excessively slow,
- workbook generation handles expected GT01–GT20 volume,
- sequential collection does not leak browser contexts/resources.

Test resource usage only when real behavior suggests a problem.

Do not optimize prematurely.

---

# 49. Memory / Resource Leak Checks

During longer GT01–GT20 test runs, monitor:

- number of browser contexts,
- orphan pages,
- file handles,
- SQLite connections,
- renderer responsiveness.

The application should cleanly release resources after run completion/cancellation.

---

# 50. Test Environment Isolation

Tests must not write into real production/user run directories unless explicitly performing a live/manual acceptance test.

Automated tests should use:

- temporary filesystem roots,
- temporary SQLite databases,
- dedicated browser test profile where needed.

Never use the normal personal browser profile.

---

# 51. Determinism Rules

Tests should avoid unnecessary dependence on:

- current wall-clock time,
- random IDs without injection,
- internet availability,
- external UI state.

Where possible, inject:

- clock,
- ID generator,
- filesystem root,
- source module,
- retry policy.

This improves reproducibility without overengineering the production architecture.

---

# 52. Clock Testing

Date logic is important for exact 24-month requests.

Test with fixed clock inputs.

Example:

```text
effective current date:
2026-08-18

expected requested range:
2024-08-18
through
2026-08-17
```

The test should not depend on the real system date.

---

# 53. Test Data Cleanup

Automated tests should clean temporary resources after execution.

However failing tests may preserve debug artifacts in a designated test-output directory if useful.

Never clean or delete real application run data automatically from tests.

---

# 54. Test Result Recording

`PROJECT_HANDOFF.md` should record meaningful verified test state, not every unit test name.

Example:

```text
Verified:
- unit suite passed
- SQLite restart integration passed
- GT01 live export passed
- resume after GT03 interruption passed

Known failure:
- exact date verification unstable
```

Do not record a test as passed unless it actually ran.

---

# 55. Test Commands

Exact package-manager and test-runner commands are intentionally not locked in M0.

When implementation begins, define standard scripts such as conceptually:

```text
test
test:unit
test:integration
test:browser
test:live
test:e2e
test:release
```

Actual script names may vary.

Current package/tool versions must be selected using current official documentation.

---

# 56. CI Philosophy

A CI service is not required to begin M1.

The test architecture should nevertheless separate suites so future CI can run:

```text
fast deterministic tests
```

without requiring live Google authentication.

Potential future CI gate:

```text
typecheck
lint
unit
integration
build
```

Live Google Trends tests should not become mandatory unattended CI unless platform behavior and authentication make that safe and reliable.

---

# 57. Pre-Commit Expectations

Do not make every Git commit depend on the heaviest possible suite.

Typical development checkpoint:

```text
relevant unit tests
+
relevant integration tests
+
type/build verification
```

Before a milestone checkpoint:

```text
full deterministic suite
+
milestone-specific acceptance tests
```

Before Release 1.0:

```text
full regression
+
live-source acceptance
+
fresh-launch test
+
resume/retry scenarios
```

---

# 58. M1 Test Gate — Application Skeleton

M1 is test-complete when the following are verified:

- Electron application launches.
- React renderer loads.
- preload/IPC bridge works.
- privileged objects are not exposed to renderer.
- query config loads.
- invalid config is rejected.
- duplicate group ID is rejected.
- SQLite initializes.
- database schema/migration bootstrap succeeds.
- source registry exposes `google-trends`.
- application data paths resolve.
- build can be launched on the target development environment.

No real Google Trends collection is required for the earliest M1 gate.

---

# 59. M2 Test Gate — Core Collector Engine

M2 is test-complete when:

- runs and jobs persist in SQLite,
- run/job state transitions pass deterministic tests,
- sequential orchestration works with fake/test source,
- attempts persist,
- artifacts persist,
- validation summaries persist,
- resume reconstructs an interrupted run,
- accepted jobs are not recollected,
- retry creates a new attempt,
- previous attempts remain preserved,
- cancellation preserves completed data,
- manual-action state is representable,
- storage collision protection works,
- logger does not expose known sensitive fields.

---

# 60. M3 Test Gate — Google Trends Collector

M3 includes the minimum vertical-slice validation required to trust the first real artifact; M4 later generalizes and hardens that system. Before expanding to GT01–GT20:

- one real GT query group completes,
- exact requested configuration is recorded,
- raw export is preserved,
- real CSV schema is documented,
- parser fixture exists,
- query identity maps correctly,
- source mode is recorded,
- actual date coverage is represented,
- numeric values parse safely,
- validation runs,
- accepted artifact becomes canonical,
- failure to collect produces a controlled state.

Then test several representative groups.

Only after those tests pass should GT01–GT20 be exercised.

---

# 61. M4 Test Gate — Validation Engine

M4 is the reusable/hardened validation-engine milestone. It is test-complete when:

- generic validation checks pass unit tests,
- Google Trends validator passes fixture tests,
- status precedence is deterministic,
- HTML/error pages are rejected,
- malformed schema is rejected,
- query mismatch is rejected,
- date mismatch is rejected,
- invalid numeric data is rejected,
- all-zero condition is surfaced,
- LOW_DATA threshold is evidence-based if activated,
- NO_DATA representation is evidence-based,
- rejected artifacts are export-ineligible,
- validation JSON persists,
- SQLite validation summaries persist.

---

# 62. M5 Test Gate — Desktop UX

M5 is test-complete when the UI can accurately present:

- source readiness,
- selected query groups,
- run state,
- per-job progress,
- valid result,
- warning result,
- failure result,
- manual-action requirement,
- retry failed jobs,
- resumable run.

UI must not visually erase warning/failure semantics.

---

# 63. M6 Test Gate — Data Package & Workbook

M6 is test-complete when:

- workbook generates successfully,
- required sheets exist,
- normalized GT rows preserve group context,
- missing numeric values remain empty,
- true zero remains zero,
- validation log is included,
- error log is included,
- rejected data is excluded from normal data sheets,
- provenance references survive export,
- raw files remain unchanged.

---

# 64. M7 Test Gate — Hardening & Release 1.0

M7 requires:

- full deterministic regression suite passes,
- YAML, JSON, and CSV query-config adapters pass cross-format equivalence tests,
- GT01–GT20 live collection has been exercised,
- multiple real collection runs have been completed,
- retry has been verified,
- interrupted-run resume has been verified,
- browser failure handling has been verified,
- malformed/non-data download handling has been verified,
- manual-action path has been verified where possible,
- fresh application launch has been verified,
- generated workbook has been inspected,
- no rejected artifact leaks into canonical output,
- raw evidence remains preserved.

---

# 65. Release 1.0 Critical Scenarios

The following are Release 1.0 blocking scenarios.

## REL-001 — Normal GT01 Run

Expected:

```text
VALID
```

with complete provenance.

---

## REL-002 — Multi-Group Run

Several groups execute sequentially and independently.

---

## REL-003 — Full GT01–GT20 Run

All configured groups are processed without state corruption.

Individual groups may legitimately produce warning/failure statuses, but the application must represent them accurately.

---

## REL-004 — Download Failure

One group fails to download.

Expected:

- job failure isolated,
- other accepted artifacts preserved,
- retry possible.

---

## REL-005 — Invalid Download

HTML/error artifact received.

Expected:

```text
ERROR_NOT_DATA
REJECTED
```

---

## REL-006 — Query Mismatch

Expected:

```text
QUERY_MISMATCH
REJECTED
```

---

## REL-007 — Date Mismatch

Expected:

```text
DATE_MISMATCH
REJECTED
```

---

## REL-008 — Application Interrupted Mid-Run

After restart:

- completed accepted jobs remain completed,
- active job is reconciled,
- pending work remains resumable.

---

## REL-009 — Retry Failed Job

Only failed job recollects.

Attempt history remains.

---

## REL-010 — Export Integrity

Workbook preserves:

- source semantics,
- nulls,
- group context,
- provenance,
- validation context.

---

# 66. Regression Suite

Every fixed production-relevant defect should receive a regression test when practical.

Examples:

```text
selector selected wrong search type
download saved HTML as CSV
retry overwrote first artifact
resume reran completed group
missing values became zero in workbook
duplicate query lost GT group context
```

The test should reproduce the original failure and prove the fix.

---

# 67. Flaky Test Policy

Flaky tests reduce trust.

If a deterministic test is flaky:

- investigate,
- fix the test or implementation,
- do not repeatedly rerun until green and ignore the cause.

Live external-source tests may fail due to provider conditions.

Those failures should be classified separately from deterministic code regressions.

---

# 68. Live Failure Classification

A live-source failure should distinguish:

```text
APPLICATION_BUG
SOURCE_UI_CHANGED
NETWORK_FAILURE
PROVIDER_ERROR
AUTHENTICATION_REQUIRED
SECURITY_CHALLENGE
RATE_LIMIT_OR_TRAFFIC_CONTROL
UNKNOWN_EXTERNAL_FAILURE
```

These classifications may exist as error details rather than new validation statuses.

---

# 69. Manual Acceptance Testing

Some real-provider behavior requires human observation.

Manual acceptance checks may include:

- confirm UI shows Turkey,
- confirm exact date range,
- confirm Web Search,
- confirm All Categories,
- confirm Search Term,
- visually compare downloaded CSV to Trends screen,
- verify manual login flow.

Manual acceptance results should be documented during M3/M7 when used as release evidence.

---

# 70. Manual Test Evidence

For important manual acceptance tests, record:

```text
date
application version / commit
run_id
test ID
result
notes
```

Screenshots may be retained when useful, but should not contain unnecessary sensitive information.

---

# 71. Source Sampling Variability

Google Trends may exhibit source sampling behavior.

Tests should not fail merely because every numeric value differs slightly between independent live runs unless exact equality is actually part of the source contract.

Live-source tests should primarily verify:

- structure,
- requested context,
- value parseability,
- range,
- provenance,
- validation behavior.

Do not assert invented exact numeric results.

---

# 72. Test Assertions for External Data

Good live assertion:

```text
all parsed relative_interest values are valid source values
```

Bad live assertion:

```text
monstera must equal 73 today
```

unless the test is explicitly verifying a preserved fixture rather than live provider output.

---

# 73. Future Source Modules

New source modules must add:

- source parser tests,
- source semantic validation tests,
- fixture set,
- integration pipeline test,
- source-specific browser/API test where needed,
- manual authentication/security tests where relevant.

They should reuse existing core run/job/resume/retry/storage tests rather than rebuilding those concepts independently.

---

# 74. Definition of a Passing Feature

A feature is not complete merely because implementation exists.

A feature is complete when:

1. expected behavior is defined,
2. relevant deterministic tests exist,
3. integration boundary is tested,
4. failure behavior is tested where important,
5. tests pass,
6. implementation is verified in the actual application when necessary,
7. `PROJECT_HANDOFF.md` records verified state,
8. a Git checkpoint is created when appropriate.

---

# 75. Test Documentation Discipline

Do not duplicate every implementation detail in this file.

This document defines stable test strategy.

Use:

- test source files for exact cases,
- `PROJECT_HANDOFF.md` for current pass/fail status,
- `DECISIONS.md` for important testing policy decisions,
- `VALIDATION_SPEC.md` for validation semantics.

---

# 76. Deferred Test-Tool Decisions

The following are intentionally not locked in M0:

- exact test runner,
- exact assertion library,
- exact React component-test library,
- exact Electron E2E tooling,
- exact coverage tool,
- exact CI provider,
- exact mocking library,
- exact coverage percentage thresholds.

These should be chosen after the application skeleton and current official tooling compatibility are verified.

Do not select package versions from memory.

---

# 77. Coverage Philosophy

Code coverage percentage is a diagnostic metric, not the product quality target.

Do not optimize for arbitrary coverage numbers.

Prioritize coverage of:

- state transitions,
- data integrity invariants,
- validation logic,
- resume/retry,
- artifact preservation,
- exports,
- security boundaries.

A smaller test suite covering these risks is more valuable than high percentage coverage of trivial UI code.

---

# 78. M0 Test-Strategy Acceptance Criteria

This strategy is sufficient for M0 when it clearly defines how the project will prove:

- application skeleton correctness,
- core run/job behavior,
- SQLite persistence,
- source-module integration,
- raw artifact preservation,
- validation correctness,
- retry behavior,
- resume behavior,
- manual-action behavior,
- Google Trends real-export behavior,
- export integrity,
- release regression.

No test results are claimed at M0 because implementation has not started.

---

# 79. Related Documents

This test strategy must remain consistent with:

- `PROJECT_SPEC.md`
- `ARCHITECTURE.md`
- `DATA_CONTRACTS.md`
- `VALIDATION_SPEC.md`
- `PROJECT_HANDOFF.md`

Next M0 documents:

- `DECISIONS.md`
- `SOURCE_MODULE_GUIDE.md`

---

# 80. Governing Test Rule

The primary testing question is not:

> **Did the automation run?**

It is:

> **Can we prove that the application collected, preserved, validated, recovered, and exported the correct source data without silently changing its meaning?**

When a test cannot distinguish a trustworthy dataset from a plausible-looking wrong dataset, the test is not sufficient.
