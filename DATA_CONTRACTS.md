# RoofRoom Data Collector — Data Contracts

**Document:** `DATA_CONTRACTS.md`  
**Product:** RoofRoom Data Collector  
**Status:** M0 approved baseline  
**Scope:** Shared identifiers, enums, schemas, naming rules, null semantics, date/time conventions, artifact contracts, provenance, validation records, and persistence boundaries.

---

# 1. Purpose

This document defines how RoofRoom Data Collector represents data consistently across:

- application core,
- source modules,
- SQLite state,
- metadata JSON,
- validation JSON,
- CSV/XLSX exports,
- IPC payloads,
- logs,
- future source integrations.

The goal is to prevent semantic drift such as:

```text
google_trends
GOOGLE_TRENDS
Google Trends
trends
```

representing the same concept differently in different parts of the application.

This document defines the canonical vocabulary.

Detailed validation logic belongs in `VALIDATION_SPEC.md`.

Detailed component responsibilities belong in `ARCHITECTURE.md`.

Fast-changing implementation progress belongs in `PROJECT_HANDOFF.md`.

---

# 2. Contract Principles

All contracts should follow these rules.

## 2.1 Preserve Source Meaning

A field must retain the meaning defined by its source.

Example:

```text
Google Trends relative_interest
```

must never silently become:

```text
estimated_searches
```

---

## 2.2 Missing Is Not Zero

Missing, unavailable, not-applicable, and unknown values are not equivalent to zero.

Examples:

```text
avg_monthly_searches = NULL
```

is different from:

```text
avg_monthly_searches = 0
```

---

## 2.3 Raw Data Is Evidence

Raw files are preserved independently from normalized representations.

Normalized datasets may improve structure, but they must not overwrite or reinterpret the original source artifact.

---

## 2.4 Stable IDs, Human-Readable Labels

Use stable machine identifiers for contracts and storage.

Use human-readable display names only for UI.

Example:

```text
source_id   = google-trends
source_name = Google Trends
```

The machine identifier is authoritative.

---

## 2.5 Execution and Validation Are Separate

Execution status answers:

> Did the collection operation execute?

Validation status answers:

> Is the collected dataset acceptable?

These must remain separate concepts.

---

# 3. Naming Conventions

## 3.1 Contract Field Names

Use:

```text
snake_case
```

for persisted JSON, SQLite columns, normalized CSV columns, and metadata.

Examples:

```text
run_id
job_id
source_id
query_group_id
requested_date_start
validation_status
```

TypeScript implementation may use either snake_case at persistence boundaries or camelCase internally, but serialization contracts must remain explicit and deterministic.

Do not mix naming styles inside one persisted schema.

---

## 3.2 Stable Enum Values

Persisted enum values should use:

```text
UPPER_SNAKE_CASE
```

Examples:

```text
RUNNING
VALID
MANUAL_ACTION_REQUIRED
GOOGLE_TRENDS_UI
SEARCH_TERM
WEB_SEARCH
```

---

## 3.3 Source IDs

Canonical source IDs:

```text
google-trends
google-keyword-planner
google-search-console
semrush
merchant-center
ga4
google-ads
```

For MVP, only:

```text
google-trends
```

is active.

Do not create aliases such as:

```text
trends
google_trends
gt
```

in persisted contracts.

---

# 4. ID Contracts

IDs must be:

- unique within their required scope,
- stable after creation,
- filesystem-safe where used in paths,
- non-semantic enough to avoid accidental meaning changes.

---

## 4.1 Run ID

Canonical concept:

```text
run_id
```

Recommended format:

```text
rr_YYYYMMDDTHHMMSSmmmZ_<short_random>
```

Example:

```text
rr_20260818T005912345Z_a7f3c9
```

Properties:

- prefix identifies RoofRoom run,
- timestamp is UTC,
- random suffix reduces collision risk,
- contains only filesystem-safe characters.

Do not use local timezone characters such as:

```text
+
:
```

inside filesystem IDs.

Human-local timestamps belong in metadata, not IDs.

---

## 4.2 Job ID

Canonical format:

```text
<run_id>__<source_id>__<job_key>
```

Example:

```text
rr_20260818T005912345Z_a7f3c9__google-trends__GT04
```

If this becomes too long for implementation convenience, an opaque internal UUID/ULID may be used, provided the persisted contract still stores:

- `run_id`
- `source_id`
- `job_key`

separately.

The semantic identity of a job is not carried only by the opaque ID.

---

## 4.3 Attempt ID

Each retry attempt must have independent identity.

Conceptual format:

```text
<job_id>__attempt_<n>
```

Example:

```text
rr_...__google-trends__GT04__attempt_2
```

Persist at minimum:

```text
attempt_number
```

starting from:

```text
1
```

Never overwrite attempt history.

---

## 4.4 Artifact ID

Artifacts should have stable identifiers independent of raw filename.

Recommended conceptual form:

```text
artifact_<opaque_id>
```

Artifact metadata must separately store:

- artifact type,
- path,
- filename,
- source,
- run,
- job,
- attempt.

---

# 5. Time and Date Contracts

## 5.1 Date-Only Values

Use ISO 8601 calendar date:

```text
YYYY-MM-DD
```

Example:

```text
2026-08-17
```

Use date-only values for requested/actual source date boundaries.

---

## 5.2 Timestamps

Persist timestamps in ISO 8601 with timezone.

Preferred canonical persistence:

```text
UTC
```

Example:

```text
2026-08-18T00:59:12.345Z
```

If local timestamps are additionally stored for display/audit, include explicit offset:

```text
2026-08-18T03:59:12.345+03:00
```

Never persist timezone-ambiguous timestamps.

---

## 5.3 Required Timestamp Fields

Where applicable:

```text
created_at
started_at
completed_at
retrieved_at
validated_at
updated_at
```

Nullable until the relevant event occurs.

---

## 5.4 Requested vs Actual Date Range

Always distinguish:

```text
requested_date_start
requested_date_end
actual_date_start
actual_date_end
```

Example:

```json
{
  "requested_date_start": "2024-08-18",
  "requested_date_end": "2026-08-17",
  "actual_date_start": "2024-08-18",
  "actual_date_end": "2026-08-16"
}
```

Do not fabricate unavailable source dates to match the request.

---

# 6. NULL and Missing-Value Semantics

## 6.1 JSON

Use:

```json
null
```

for a known field whose value is unavailable or not applicable.

Do not use:

```text
""
"N/A"
"unknown"
"-"
0
```

as substitutes unless the source itself literally returned that value and the raw representation is being preserved.

---

## 6.2 SQLite

Use SQL:

```text
NULL
```

for missing values.

Do not use sentinel numeric values such as:

```text
-1
999999
```

unless a source contract explicitly requires them.

---

## 6.3 CSV

For normalized RoofRoom-generated CSV output, missing values should normally be exported as blank cells.

Example:

```csv
query,relative_interest,avg_monthly_searches
monstera,72,
```

The blank means missing/not available.

It does not mean zero.

---

## 6.4 XLSX

Missing values should remain empty cells where practical.

Do not populate numeric missing cells with `0`.

---

# 7. Source Contract

Canonical source record:

```json
{
  "source_id": "google-trends",
  "source_name": "Google Trends",
  "source_mode": "GOOGLE_TRENDS_UI"
}
```

---

## 7.1 Source Mode

Source mode identifies a materially different collection/scaling mechanism.

Initial known modes:

```text
GOOGLE_TRENDS_UI
GOOGLE_TRENDS_API
```

For MVP:

```text
GOOGLE_TRENDS_UI
```

is expected.

Future sources may define their own modes.

---

# 8. Geography and Locale Contracts

## 8.1 Country

Persist canonical machine country code where possible.

For Turkey:

```text
country_code = TR
country_name = Turkey
```

If a source uses a different country code internally, source-specific representation may be stored separately.

Do not replace canonical RoofRoom country semantics with provider-specific labels.

---

## 8.2 Language

Canonical language code should use a stable code where applicable.

For Turkish:

```text
language_code = tr
language_name = Turkish
```

For Google Trends MVP, language is not necessarily a filtering dimension and may be:

```text
null
```

if not explicitly applied by the source.

---

# 9. Search-Type Contract

Canonical values:

```text
WEB_SEARCH
IMAGE_SEARCH
NEWS_SEARCH
GOOGLE_SHOPPING
YOUTUBE_SEARCH
```

Google Trends MVP:

```text
WEB_SEARCH
```

Persist the canonical enum even if the provider UI displays localized wording.

---

# 10. Selection-Type Contract

Canonical values:

```text
SEARCH_TERM
TOPIC
```

Google Trends MVP:

```text
SEARCH_TERM
```

Search Term and Topic datasets must not share a single numeric series without explicit source-mode context.

---

# 11. Category Contract

Google Trends MVP requested category:

```text
category_id = null
category_name = "All Categories"
```

`category_id` remains `null` until live provider behavior confirms a stable provider identifier. If such an identifier is later verified, preserve it explicitly.

Do not invent provider category IDs or copy an assumed identifier into observed metadata.

---

# 12. Dataset-Type Contract

Canonical Google Trends MVP dataset type:

```text
INTEREST_OVER_TIME
```

Future Google Trends dataset types may include:

```text
INTEREST_BY_SUBREGION
RELATED_QUERIES_TOP
RELATED_QUERIES_RISING
```

These are out of scope for the base MVP but reserved for consistent future naming.

---

# 13. Query Group Contract

Canonical query-group structure:

```json
{
  "query_group_id": "GT01",
  "query_group_name": "generic_commercial",
  "queries": [
    "canlı bitki",
    "online bitki",
    "bitki satın al",
    "bitki siparişi",
    "saksılı bitki"
  ]
}
```

Required fields:

```text
query_group_id
query_group_name
queries
```

Rules:

- `query_group_id` must be unique in one config file.
- `query_group_name` should be stable and machine-friendly.
- `queries` must be an ordered array.
- query order must be preserved.
- duplicate query strings across different groups are allowed.
- duplicate query strings inside the same group should be rejected unless a source-specific reason is documented.

---

## 13.1 GT ID Pattern

Initial MVP group IDs:

```text
GT01
GT02
...
GT20
```

Preferred validation pattern:

```regex
^GT[0-9]{2}$
```

Do not assume future source group IDs must use `GT`.

---

# 14. Query Config Contract

Preferred initial YAML shape:

```yaml
version: 1

source: google-trends

groups:
  - id: GT01
    name: generic_commercial
    queries:
      - canlı bitki
      - online bitki
      - bitki satın al
      - bitki siparişi
      - saksılı bitki
```

Normalized internal representation:

```json
{
  "config_version": 1,
  "source_id": "google-trends",
  "groups": [
    {
      "query_group_id": "GT01",
      "query_group_name": "generic_commercial",
      "queries": [
        "canlı bitki",
        "online bitki",
        "bitki satın al",
        "bitki siparişi",
        "saksılı bitki"
      ]
    }
  ]
}
```

Release 1.0 accepts YAML/YML, JSON, and CSV configuration inputs. YAML is the canonical human-authored format; JSON and CSV are import adapters.

All three formats must normalize into the same canonical internal `QueryConfig` representation before collector logic consumes them. Input-format differences must not change job/query semantics.

The application config directory must contain at most one supported authority:

```text
query-groups.yaml
query-groups.yml
query-groups.json
query-groups.csv
```

Multiple supported files fail closed.

Canonical CSV header:

```text
version,source,group_id,group_name,query_order,query
```

`query_order` must be positive and contiguous within each group.

---

# 15. Run Contract

Canonical run representation:

```json
{
  "run_id": "rr_20260818T005912345Z_a7f3c9",
  "run_status": "RUNNING",
  "created_at": "2026-08-18T00:59:12.345Z",
  "started_at": "2026-08-18T00:59:13.020Z",
  "completed_at": null,
  "application_version": "0.1.0",
  "selected_sources": [
    "google-trends"
  ],
  "requested_configuration": {
    "country_code": "TR",
    "search_type": "WEB_SEARCH",
    "selection_type": "SEARCH_TERM",
    "dataset_type": "INTEREST_OVER_TIME",
    "requested_date_start": "2024-08-18",
    "requested_date_end": "2026-08-17"
  }
}
```

`application_version` is shown as an example only.

Do not lock an actual software version before implementation.

---

# 16. Run Status Contract

Canonical run statuses:

```text
PENDING
RUNNING
MANUAL_ACTION_REQUIRED
COMPLETED
COMPLETED_WITH_WARNINGS
FAILED
CANCELLED
```

Reserved/optional:

```text
PAUSED
```

`PAUSED` should not be required for Release 1.0 unless implemented cleanly.

---

## 16.1 Run Status Semantics

### PENDING

Run exists but execution has not started.

### RUNNING

At least one job is active or eligible work is progressing.

### MANUAL_ACTION_REQUIRED

Progress cannot continue until the user performs a provider-side action.

### COMPLETED

All required jobs reached acceptable terminal states with no warnings requiring run-level qualification.

### COMPLETED_WITH_WARNINGS

Run finished, but one or more jobs contain warning-level validation states such as `LOW_DATA`.

### FAILED

Run cannot complete successfully due to unrecoverable run-level failure or configured failure policy.

A single job failure should not automatically imply run-level `FAILED` if other jobs can continue and retry remains possible.

### CANCELLED

User intentionally terminated the run.

---

# 17. Job Contract

Canonical job representation:

```json
{
  "job_id": "rr_...__google-trends__GT04",
  "run_id": "rr_20260818T005912345Z_a7f3c9",
  "source_id": "google-trends",
  "job_key": "GT04",
  "query_group_id": "GT04",
  "execution_status": "RUNNING",
  "validation_status": "NOT_RUN",
  "attempt_count": 1,
  "accepted_artifact_id": null,
  "created_at": "2026-08-18T00:59:13.100Z",
  "started_at": "2026-08-18T01:00:03.000Z",
  "completed_at": null
}
```

---

# 18. Execution Status Contract

Canonical execution statuses:

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

These represent process state, not dataset quality.

---

## 18.1 Execution Status Semantics

### PENDING

Job has not started.

### RUNNING

Collection is actively executing.

### VALIDATING

Source collection produced a candidate artifact and validation is in progress.

### COMPLETED

Execution finished and a terminal validation result exists.

### FAILED

Execution failed before an acceptable terminal result.

### CANCELLED

User or run cancellation stopped the job.

### MANUAL_ACTION_REQUIRED

User action is required before the job can continue.

### RETRY_PENDING

Job is scheduled/selected for another attempt.

---

# 19. Validation Status Contract

Canonical validation statuses:

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

Potential future generic statuses may be added only when their semantics cannot be represented by existing statuses plus structured findings.

Avoid uncontrolled proliferation of source-specific status values.

---

## 19.1 Validation Status Semantics

### NOT_RUN

Validation has not executed.

### VALID

Dataset passed all required acceptance checks.

### LOW_DATA

Dataset is structurally valid but data density is low enough to warrant warning.

This is not equivalent to failure.

### NO_DATA

Source returned no meaningful data for the requested dataset.

This is distinct from download/parsing failure.

### INVALID_SCHEMA

Content is data-like but does not match the expected schema.

### ERROR_NOT_DATA

Downloaded content is not the requested dataset.

Examples:

- HTML login page,
- provider error page,
- access-denied page.

### DATE_MISMATCH

Actual data coverage conflicts materially with the expected/requested date contract.

### QUERY_MISMATCH

Expected query series do not match the returned dataset.

Operational conditions such as `DOWNLOAD_FAILED` and `MANUAL_ACTION_REQUIRED` are intentionally excluded from `validation_status`. If collection does not produce a valid candidate artifact, use `validation_status = NOT_RUN` together with the appropriate execution status and/or `error_code`.

---

# 20. Validation Finding Contract

A validation result should contain individual findings.

Canonical structure:

```json
{
  "check_id": "GT_EXPECTED_QUERIES",
  "severity": "ERROR",
  "passed": false,
  "message": "Expected query column 'monstera' was not found.",
  "expected": [
    "starliçe",
    "monstera",
    "areka palmiyesi",
    "dracaena",
    "yucca"
  ],
  "actual": [
    "starliçe",
    "areka palmiyesi",
    "dracaena",
    "yucca"
  ]
}
```

`expected` and `actual` may be scalar, array, object, or null depending on check.

---

# 21. Validation Severity Contract

Canonical severities:

```text
INFO
WARNING
ERROR
```

Interpretation:

- `INFO` — useful audit information; no acceptance impact.
- `WARNING` — suspicious or weak condition; may permit acceptance with warning.
- `ERROR` — required validation condition failed.

Validation status mapping belongs in `VALIDATION_SPEC.md`.

---

# 22. Validation Result Contract

Canonical representation:

```json
{
  "validation_id": "validation_<opaque_id>",
  "run_id": "rr_20260818T005912345Z_a7f3c9",
  "job_id": "rr_...__google-trends__GT04",
  "artifact_id": "artifact_<opaque_id>",
  "validation_status": "VALID",
  "validated_at": "2026-08-18T01:00:19.000Z",
  "checks_total": 11,
  "checks_passed": 11,
  "checks_warning": 0,
  "checks_failed": 0,
  "findings": []
}
```

Detailed check definitions belong in `VALIDATION_SPEC.md`.

---

# 23. Attempt Contract

Every collection attempt should be represented independently.

Example:

```json
{
  "attempt_id": "rr_...__google-trends__GT04__attempt_2",
  "job_id": "rr_...__google-trends__GT04",
  "attempt_number": 2,
  "execution_status": "COMPLETED",
  "started_at": "2026-08-18T01:10:00.000Z",
  "completed_at": "2026-08-18T01:10:17.000Z",
  "candidate_artifact_id": "artifact_<opaque_id>",
  "validation_id": "validation_<opaque_id>",
  "error_code": null
}
```

Attempt records must not be overwritten when a retry occurs.

---

# 24. Artifact Contract

Canonical artifact record:

```json
{
  "artifact_id": "artifact_<opaque_id>",
  "run_id": "rr_20260818T005912345Z_a7f3c9",
  "job_id": "rr_...__google-trends__GT04",
  "attempt_number": 1,
  "source_id": "google-trends",
  "artifact_kind": "RAW_SOURCE_FILE",
  "artifact_state": "ACCEPTED",
  "media_type": "text/csv",
  "filename": "GT04_TR_24M_interest_over_time.csv",
  "relative_path": "google-trends/raw/GT04_TR_24M_interest_over_time.csv",
  "byte_size": 18423,
  "sha256": null,
  "created_at": "2026-08-18T01:00:15.000Z"
}
```

Hash field is nullable until file hashing is implemented.

---

# 25. Artifact Kind Contract

Canonical artifact kinds:

```text
RAW_SOURCE_FILE
METADATA_JSON
VALIDATION_JSON
NORMALIZED_CSV
EXPORT_XLSX
LOG_FILE
```

Future kinds may be added when needed.

---

# 26. Artifact State Contract

Canonical states:

```text
CANDIDATE
ACCEPTED
ACCEPTED_WITH_WARNING
REJECTED
SUPERSEDED
```

Semantics:

### CANDIDATE

Produced by collection but not yet validated.

### ACCEPTED

Validated and canonical for the job.

### ACCEPTED_WITH_WARNING

Structurally acceptable but accompanied by warning-level validation status.

### REJECTED

Retained for audit but not accepted as canonical data.

### SUPERSEDED

Previously accepted/candidate artifact replaced by a later accepted attempt while historical evidence remains preserved.

A raw file should not be physically destroyed merely because its state becomes `SUPERSEDED` unless a retention policy explicitly allows it.

---

# 27. Raw Filename Contract

Google Trends MVP canonical raw filename:

```text
<query_group_id>_TR_24M_interest_over_time.csv
```

Example:

```text
GT04_TR_24M_interest_over_time.csv
```

Rules:

- preserve group identity,
- use canonical country token `TR`,
- use canonical period token `24M`,
- use lowercase dataset descriptor for filename readability,
- avoid spaces,
- avoid locale-specific characters in structural filename tokens.

If multiple attempts must coexist physically, do not silently overwrite.

Recommended retry candidate naming:

```text
GT04_TR_24M_interest_over_time__attempt_2.csv
```

The first accepted canonical artifact may remain without attempt suffix if there is no collision.

Exact implementation may choose attempt subdirectories instead, provided history is preserved.

---

# 28. Metadata Filename Contract

Recommended:

```text
GT04.metadata.json
```

or, when attempt-specific:

```text
GT04.attempt_2.metadata.json
```

Metadata filename does not replace internal IDs.

---

# 29. Validation Filename Contract

Recommended:

```text
GT04.validation.json
```

or:

```text
GT04.attempt_2.validation.json
```

---

# 30. Run Filesystem Contract

Conceptual run layout:

```text
<run_id>/
├── run.json
│
├── google-trends/
│   ├── raw/
│   ├── metadata/
│   └── validation/
│
├── exports/
└── logs/
```

All paths persisted in metadata should preferably be relative to the run root unless an absolute path is operationally required.

Relative paths improve portability.

---

# 31. Run Metadata Contract

`run.json` should contain a reproducible run snapshot.

Example:

```json
{
  "schema_version": 1,
  "run_id": "rr_20260818T005912345Z_a7f3c9",
  "run_status": "COMPLETED_WITH_WARNINGS",
  "application_version": "0.1.0",
  "created_at": "2026-08-18T00:59:12.345Z",
  "started_at": "2026-08-18T00:59:13.020Z",
  "completed_at": "2026-08-18T01:08:44.000Z",
  "sources": [
    "google-trends"
  ],
  "requested_configuration": {
    "country_code": "TR",
    "search_type": "WEB_SEARCH",
    "selection_type": "SEARCH_TERM",
    "dataset_type": "INTEREST_OVER_TIME",
    "requested_date_start": "2024-08-18",
    "requested_date_end": "2026-08-17"
  },
  "query_config_snapshot": {
    "config_version": 1,
    "groups": [
      "GT01",
      "GT02",
      "GT03"
    ]
  }
}
```

The full query config may be copied into run metadata or stored as a separate snapshot artifact.

The important requirement is reproducibility.

---

# 32. Dataset Metadata Contract

Each collected dataset should have source-specific provenance metadata.

Canonical common envelope:

```json
{
  "schema_version": 1,
  "run_id": "rr_20260818T005912345Z_a7f3c9",
  "job_id": "rr_...__google-trends__GT04",
  "attempt_number": 1,

  "source_id": "google-trends",
  "source_name": "Google Trends",
  "source_mode": "GOOGLE_TRENDS_UI",

  "dataset_type": "INTEREST_OVER_TIME",

  "query_group_id": "GT04",
  "query_group_name": "major_species",
  "queries": [
    "starliçe",
    "monstera",
    "areka palmiyesi",
    "dracaena",
    "yucca"
  ],

  "country_code": "TR",
  "country_name": "Turkey",
  "language_code": null,

  "category_id": null,
  "category_name": "All Categories",
  "search_type": "WEB_SEARCH",
  "selection_type": "SEARCH_TERM",

  "requested_date_start": "2024-08-18",
  "requested_date_end": "2026-08-17",
  "actual_date_start": "2024-08-18",
  "actual_date_end": "2026-08-17",

  "retrieved_at": "2026-08-18T01:00:15.000Z",
  "application_version": "0.1.0",

  "raw_artifact_id": "artifact_<opaque_id>",
  "raw_relative_path": "google-trends/raw/GT04_TR_24M_interest_over_time.csv",

  "validation_status": "VALID"
}
```

Fields that cannot yet be verified should remain `null`.

Do not invent source-reported settings merely because they were requested.

Where useful, preserve both:

```text
requested_*
observed_*
```

semantics.

---

# 33. Requested vs Observed Configuration

Where source verification is possible, preserve the distinction.

Example:

```json
{
  "requested": {
    "country_code": "TR",
    "search_type": "WEB_SEARCH",
    "selection_type": "SEARCH_TERM"
  },
  "observed": {
    "country_code": "TR",
    "search_type": "WEB_SEARCH",
    "selection_type": "SEARCH_TERM"
  }
}
```

If an observed value cannot be reliably extracted:

```json
{
  "observed": {
    "country_code": null
  }
}
```

Do not set observed values by assumption.

---

# 34. Google Trends Normalized Row Contract

The raw Google Trends CSV remains unchanged.

The implemented normalized CSV/XLSX row uses:

```json
{
  "run_id": "rr_...",
  "job_id": "rr_...",
  "query_group_id": "GT04",
  "source_id": "google-trends",
  "source_mode": "GOOGLE_TRENDS_UI",
  "dataset_type": "INTEREST_OVER_TIME",
  "country_code": "TR",
  "search_type": "WEB_SEARCH",
  "selection_type": "SEARCH_TERM",
  "requested_date_start": "2024-08-18",
  "requested_date_end": "2026-08-17",
  "actual_date_start": "2024-08-18",
  "actual_date_end": "2026-08-16",
  "period_start": "2026-08-09",
  "period_end": null,
  "query": "monstera",
  "relative_interest": 72,
  "validation_status": "VALID",
  "raw_artifact_id": "artifact_<opaque_id>"
}
```

The verified Release 1.0 classic Explore exports use weekly `period_start` rows for the locked 24-month scope.

Therefore:

```text
period_start
period_end
```

are preferable to a falsely precise `date` contract until source behavior is verified.

---

# 35. Google Trends Relative Interest Contract

Field:

```text
relative_interest
```

Type:

```text
integer | null
```

Expected semantic range for classic Google Trends UI:

```text
0..100
```

However validation logic must be based on actual source behavior verified during implementation.

Do not use this field for:

```text
estimated_searches
search_volume
monthly_searches
```

---

# 36. Comparison Context Contract

Every normalized Trends row must preserve:

```text
query_group_id
```

and preferably:

```text
job_id
```

This ensures duplicate queries are not detached from their comparison context.

Example:

```text
query = monstera
query_group_id = GT04
relative_interest = 100
```

is distinct from:

```text
query = monstera
query_group_id = GT05
relative_interest = 70
```

Do not deduplicate these records by query alone.

---

# 37. Error Contract

Operational errors should use stable error codes plus human-readable details.

Canonical error structure:

```json
{
  "error_code": "DOWNLOAD_FAILED",
  "error_scope": "JOB",
  "source_id": "google-trends",
  "message": "Google Trends CSV download did not complete.",
  "retryable": true,
  "occurred_at": "2026-08-18T01:00:12.000Z",
  "details": {}
}
```

---

# 38. Error Scope Contract

Canonical scopes:

```text
APPLICATION
RUN
JOB
SOURCE
VALIDATION
EXPORT
```

---

# 39. Retryable Contract

Field:

```text
retryable
```

Type:

```text
boolean
```

A retryable flag is operational guidance, not a promise that retry will succeed.

Examples:

```text
temporary browser timeout → true
invalid config schema     → false
manual login required     → false as automatic retry
```

Manual-action workflows are separate from automatic retries.

---

# 40. Manual Action Contract

Canonical structure:

```json
{
  "action_type": "AUTHENTICATION_REQUIRED",
  "source_id": "google-trends",
  "run_id": "rr_...",
  "job_id": "rr_...",
  "message": "Complete authentication in the opened browser window.",
  "created_at": "2026-08-18T01:00:00.000Z"
}
```

Possible future action types:

```text
AUTHENTICATION_REQUIRED
SECURITY_CHALLENGE
CONSENT_REQUIRED
PROVIDER_CONFIRMATION_REQUIRED
```

The application must not encode bypass instructions.

---

# 41. Source Readiness Contract

Conceptual readiness result:

```json
{
  "source_id": "google-trends",
  "readiness_status": "READY",
  "checked_at": "2026-08-18T00:58:00.000Z",
  "message": null
}
```

Canonical readiness statuses:

```text
READY
NOT_CONFIGURED
AUTHENTICATION_REQUIRED
MANUAL_ACTION_REQUIRED
UNAVAILABLE
ERROR
```

---

# 42. Source Capabilities Contract

Conceptual capability contract:

```json
{
  "source_id": "google-trends",
  "requires_browser": true,
  "requires_oauth": false,
  "may_require_manual_login": true,
  "supports_custom_date_range": true,
  "supports_direct_export": true,
  "supports_api": false,
  "max_concurrency": 1
}
```

Capability values must reflect actual implementation/source behavior.

Do not hard-code claims that have not been verified.

---

# 43. IPC Data Contracts

IPC payloads should use serializable plain data.

Allowed:

- strings,
- numbers,
- booleans,
- arrays,
- plain objects,
- null.

Do not pass:

- Playwright objects,
- Node streams,
- database connections,
- filesystem handles,
- functions,
- provider session objects.

Example run summary payload:

```json
{
  "run_id": "rr_...",
  "run_status": "RUNNING",
  "jobs_total": 20,
  "jobs_completed": 4,
  "jobs_failed": 1,
  "jobs_pending": 15
}
```

---

# 44. SQLite Persistence Boundary

SQLite is for operational state and searchable indexes.

Initial logical entities:

```text
runs
jobs
attempts
artifacts
validations
errors
```

Exact SQL DDL is intentionally deferred until M1/M2 implementation.

---

# 45. Runs Table — Logical Contract

Minimum fields:

```text
run_id
run_status
application_version
created_at
started_at
completed_at
requested_configuration_json
```

Optional indexed summary fields may be added where useful.

---

# 46. Jobs Table — Logical Contract

Minimum fields:

```text
job_id
run_id
source_id
job_key
query_group_id
execution_status
validation_status
attempt_count
accepted_artifact_id
created_at
started_at
completed_at
```

---

# 47. Attempts Table — Logical Contract

Minimum fields:

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

---

# 48. Artifacts Table — Logical Contract

Minimum fields:

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

---

# 49. Validations Table — Logical Contract

Minimum fields:

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

Detailed findings may live primarily in JSON files, with summaries indexed in SQLite.

---

# 50. Errors Table — Logical Contract

Minimum fields:

```text
error_id
run_id
job_id
attempt_number
error_code
error_scope
retryable
message
occurred_at
details_json
```

---

# 51. SQLite Foreign-Key Expectations

Conceptually:

```text
runs
  └── jobs
        └── attempts
              ├── artifacts
              └── validations
```

Artifacts and validations must remain traceable to run/job context.

Exact cascade/delete policies will be decided during implementation.

Deletion should be conservative because auditability is a core requirement.

---

# 52. Schema Versioning

Persisted JSON contracts should include:

```text
schema_version
```

starting with:

```text
1
```

Example:

```json
{
  "schema_version": 1
}
```

Schema migration strategy should be introduced before breaking persisted contracts.

Do not silently reinterpret old data under a new schema.

---

# 53. Application Version vs Schema Version

These are different.

Example:

```text
application_version = 1.2.0
schema_version      = 1
```

Application releases may change without changing data schema.

A schema version changes only when persisted contract interpretation changes.

---

# 54. Export Workbook Contract

Implemented workbook filename:

```text
ROOFROOM_SEARCH_DEMAND_RAW_<YYYY-MM-DD>.xlsx
```

Example:

```text
ROOFROOM_SEARCH_DEMAND_RAW_2026-08-18.xlsx
```

Release 1.0 sheets:

```text
README
RUN_METADATA
QUERY_UNIVERSE
GT_24M_RAW
VALIDATION_LOG
ERROR_LOG
```

The same export operation emits a run-scoped CSV package:

```text
exports/ROOFROOM_SEARCH_DEMAND_RAW_<YYYY-MM-DD>/
  RUN_METADATA.csv
  QUERY_UNIVERSE.csv
  GT_24M_RAW.csv
  VALIDATION_LOG.csv
  ERROR_LOG.csv
  README.txt
```

Derived export creation must refuse to overwrite an existing package or workbook.

---

# 55. Workbook NULL Semantics

For numeric data:

- missing → empty cell,
- true zero → numeric `0`.

For text:

- missing → empty cell,
- source literal `"0"` remains text only if source semantics require it.

Workbook generation must not infer unavailable values.

---

# 56. QUERY_UNIVERSE Sheet Contract

Suggested columns:

```text
query_group_id
query_group_name
query_order
query
source_id
active
```

Example:

```text
GT04 | major_species | 1 | starliçe        | google-trends | TRUE
GT04 | major_species | 2 | monstera        | google-trends | TRUE
GT05 | secondary     | 1 | monstera        | google-trends | TRUE
```

Duplicate queries across groups are expected and preserved.

---

# 57. GT_24M_RAW Sheet Contract

This sheet should represent normalized Google Trends rows while preserving comparison-group context.

Suggested columns:

```text
run_id
job_id
query_group_id
source_id
source_mode
dataset_type
country_code
search_type
selection_type
requested_date_start
requested_date_end
actual_date_start
actual_date_end
period_start
period_end
query
relative_interest
validation_status
raw_artifact_id
```

Do not add absolute search-volume fields derived from Trends.

---

# 58. VALIDATION_LOG Sheet Contract

Suggested columns:

```text
run_id
job_id
query_group_id
artifact_id
validation_status
check_id
severity
passed
message
expected
actual
validated_at
```

Complex `expected`/`actual` structures may be stringified in workbook output.

Canonical detailed JSON remains authoritative.

---

# 59. ERROR_LOG Sheet Contract

Suggested columns:

```text
run_id
job_id
attempt_number
source_id
error_code
error_scope
retryable
message
occurred_at
```

Do not export sensitive authentication data.

---

# 60. Logging Contract

Structured application logs should include where available:

```text
timestamp
level
category
event
run_id
job_id
attempt_number
source_id
message
error_code
```

Canonical log levels:

```text
DEBUG
INFO
WARN
ERROR
```

Production builds may reduce DEBUG output.

---

# 61. Sensitive Data Contract

The following must never be intentionally persisted in normal project metadata/logging:

- account passwords,
- 2FA codes,
- CAPTCHA solutions,
- full browser cookies,
- raw session tokens,
- OAuth client secrets in logs,
- access tokens in logs,
- refresh tokens in logs.

Future secure token storage requires a dedicated design.

---

# 62. Data Retention Baseline

MVP default:

- accepted raw files → retain,
- rejected source artifacts useful for audit → retain,
- metadata → retain,
- validation records → retain,
- attempt history → retain,
- export workbooks → retain until user removes them,
- logs → retain according to future configurable retention policy.

Automatic destructive cleanup should be conservative.

---

# 63. Contract for Rejected Artifacts

A rejected artifact should still be traceable.

Example:

```json
{
  "artifact_state": "REJECTED",
  "validation_status": "ERROR_NOT_DATA"
}
```

This helps answer:

> What did the collector actually receive?

Do not silently delete evidence such as an HTML error page before recording enough diagnostic context.

Sensitive provider pages may require redaction or restricted retention during implementation.

---

# 64. Contract for Accepted-With-Warning Data

Example:

```json
{
  "execution_status": "COMPLETED",
  "validation_status": "LOW_DATA",
  "artifact_state": "ACCEPTED_WITH_WARNING"
}
```

This state means:

- structurally valid,
- preserved,
- usable with caution,
- warning clearly surfaced.

---

# 65. Contract for No Data

Example:

```json
{
  "execution_status": "COMPLETED",
  "validation_status": "NO_DATA"
}
```

`NO_DATA` is not:

```text
0
```

and is not automatically equivalent to collection failure.

Detailed `VALIDATION_SPEC.md` will define whether a source-provided no-data response creates a raw artifact and how it is exported.

---

# 66. Configuration Snapshot Contract

Every run should retain the exact effective configuration used.

At minimum:

```text
source_id
selected query groups
queries
country
date range
search type
selection type
dataset type
```

Do not depend on the current live config file to explain an old run.

If the config changes later, historical runs must remain reproducible.

---

# 67. Provenance Chain Contract

Every accepted export row should be traceable through:

```text
export row
↓
raw_artifact_id
↓
artifact
↓
attempt
↓
job
↓
run
↓
configuration snapshot
```

Where a normalized row is produced from a raw file, preserve the raw artifact reference.

---

# 68. Contract Invariants

The following are hard invariants unless a future architecture decision explicitly changes them.

## Invariant 1

Every job belongs to exactly one run.

## Invariant 2

Every attempt belongs to exactly one job.

## Invariant 3

Every accepted artifact belongs to one run and one job.

## Invariant 4

A job may have multiple attempts.

## Invariant 5

A job may have multiple historical artifacts.

## Invariant 6

At most one artifact should be canonical/accepted for a given job result at a time.

## Invariant 7

Raw source artifacts are not modified in place after acceptance.

## Invariant 8

Validation status does not replace execution status.

## Invariant 9

Missing numeric values are not silently converted to zero.

## Invariant 10

Google Trends relative-interest values are not converted to absolute search volume.

## Invariant 11

Google Trends rows preserve query comparison-group context.

## Invariant 12

Search Term and Topic modes remain distinguishable.

---

# 69. Deferred Contract Decisions

The following still require provider or future-version evidence rather than guesswork:

- explicit Google Trends provider `NO_DATA` representation,
- a non-zero `LOW_DATA` density threshold, if one is ever needed,
- behavior of future Google Trends locale/header variants,
- breaking-schema migration requirements for future persisted versions.

When these are resolved, update this document only if they affect stable contracts.

---

# 70. M1 Data-Contract Acceptance Gate

Before M1 is complete, implementation should prove:

- run IDs can be generated according to contract intent,
- the YAML loader parses into the canonical query-group representation,
- duplicate group IDs are rejected,
- SQLite opens successfully and schema/migration bootstrap succeeds,
- timestamps serialize consistently,
- source IDs use canonical values,
- renderer receives safe serializable summaries only.

Persisted run/job state is an M2 responsibility.

---

# 71. M2 Data-Contract Acceptance Gate

Before M2 is complete, implementation should prove:

- runs and jobs persist in SQLite,
- jobs create independent attempts,
- attempt history survives restart,
- artifact records persist,
- resume can reconstruct incomplete state,
- retry does not erase previous attempts,
- accepted artifact references are unambiguous,
- operational and validation statuses remain separate.

---

# 72. M3 Data-Contract Acceptance Gate

Before the Google Trends collector expands to GT01–GT20, implementation should prove with real source exports:

- query group identity is preserved,
- raw filename contract works,
- actual date coverage can be represented without fabrication,
- source mode is recorded,
- returned query series map correctly,
- relative-interest values parse safely,
- candidate and accepted artifact states work,
- duplicate queries across different groups remain distinguishable.

---

# 73. Related Documents

This contract is based on and must remain consistent with:

- `PROJECT_SPEC.md`
- `ARCHITECTURE.md`
- `PROJECT_HANDOFF.md`

Next M0 documents:

- `VALIDATION_SPEC.md`
- `TEST_STRATEGY.md`
- `DECISIONS.md`
- `SOURCE_MODULE_GUIDE.md`

---

# 74. Governing Data Rule

When choosing between convenience and semantic accuracy:

> **Preserve semantic accuracy.**

RoofRoom Data Collector must never make a dataset easier to analyze by destroying the information required to understand where the data came from, how it was collected, what it means, or whether it was valid.
