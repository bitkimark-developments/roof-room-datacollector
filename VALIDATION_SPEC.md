# RoofRoom Data Collector — Validation Specification

**Document:** `VALIDATION_SPEC.md`  
**Product:** RoofRoom Data Collector  
**Status:** M0 approved baseline  
**Scope:** Validation architecture, check taxonomy, deterministic status mapping, artifact acceptance rules, Google Trends MVP validation requirements, warning/error semantics, and implementation acceptance gates.

---

# 1. Purpose

Validation is a first-class product capability in RoofRoom Data Collector.

A successful browser action, API response, file download, or CSV parse does **not** automatically mean that collection succeeded.

The validator must answer:

> **Did we collect the expected dataset, from the expected source, with the expected structure and context, without silently corrupting or inventing meaning?**

This document defines:

- validation stages,
- generic checks,
- source-specific checks,
- validation severities,
- validation statuses,
- deterministic status precedence,
- artifact acceptance/rejection rules,
- Google Trends MVP validation behavior,
- retry/manual-action implications,
- persistence requirements,
- testability requirements.

Canonical status names, field names, artifact states, and identifiers come from `DATA_CONTRACTS.md`.

---

# 2. Governing Validation Principle

RoofRoom Data Collector must follow:

> **Collect → Preserve Candidate → Validate → Accept / Warn / Reject → Document**

Never:

```text
Download
↓
Assume success
```

Instead:

```text
Collection attempt
↓
Candidate artifact
↓
Generic validation
↓
Source-specific parsing
↓
Source-specific validation
↓
Deterministic result
↓
Accepted / Accepted with Warning / Rejected
```

Validation exists to prevent silent bad data.

---

# 3. Validation Goals

The validation system should:

1. Detect missing artifacts.
2. Detect unreadable artifacts.
3. Detect HTML/login/error pages saved instead of data.
4. Detect malformed or unexpected schemas.
5. Detect query mismatches.
6. Detect date-range mismatches.
7. Detect non-numeric or invalid numeric values.
8. Detect suspicious all-zero / near-empty data.
9. Detect duplicate temporal rows where inappropriate.
10. Preserve warning-level datasets instead of silently discarding them.
11. Reject clearly invalid artifacts.
12. Keep validation logic deterministic and testable.
13. Produce an auditable validation report for every candidate artifact.
14. Keep generic validation reusable across future source modules.
15. Keep source-specific semantics inside source validators.

---

# 4. Validation Architecture

Conceptual pipeline:

```text
SOURCE COLLECTION
      │
      ▼
CANDIDATE ARTIFACT
      │
      ▼
STAGE A — ARTIFACT EXISTENCE / ACCESS
      │
      ▼
STAGE B — CONTENT-TYPE / NOT-AN-ERROR CHECKS
      │
      ▼
STAGE C — PARSE / SCHEMA CHECKS
      │
      ▼
STAGE D — SOURCE-SPECIFIC SEMANTIC CHECKS
      │
      ▼
STAGE E — DATA QUALITY / SUSPICION CHECKS
      │
      ▼
STATUS RESOLUTION
      │
      ├── VALID
      ├── LOW_DATA
      ├── NO_DATA
      ├── INVALID_SCHEMA
      ├── ERROR_NOT_DATA
      ├── DATE_MISMATCH
      └── QUERY_MISMATCH
      │
      ▼
ARTIFACT STATE
      ├── ACCEPTED
      ├── ACCEPTED_WITH_WARNING
      └── REJECTED
```

---

# 5. Validation Responsibility Boundaries

## 5.1 ValidationCoordinator

Shared core responsibility.

It should:

- run generic checks,
- invoke the source-specific parser/validator,
- aggregate findings,
- resolve the final validation status,
- persist the validation result,
- update artifact state,
- update job validation status,
- expose a serializable validation summary to UI.

It should not contain Google Trends-specific column names or selectors.

---

## 5.2 Source Validator

Source-module responsibility.

For Google Trends, it should understand:

- expected query comparison group,
- expected Interest Over Time structure,
- relative-interest values,
- temporal coverage,
- search term semantics,
- source-specific schema variants.

It should not directly mutate global run state.

---

# 6. Validation Result Contract

A validation result must follow the canonical contract from `DATA_CONTRACTS.md`.

Example:

```json
{
  "validation_id": "validation_<opaque_id>",
  "run_id": "rr_...",
  "job_id": "rr_...__google-trends__GT04",
  "artifact_id": "artifact_<opaque_id>",
  "validation_status": "VALID",
  "validated_at": "2026-08-18T01:00:19.000Z",
  "checks_total": 12,
  "checks_passed": 12,
  "checks_warning": 0,
  "checks_failed": 0,
  "findings": []
}
```

Every validation attempt should produce a persisted result when enough artifact context exists.

---

# 7. Validation Finding Contract

Each check should produce a finding.

Example:

```json
{
  "check_id": "GT_EXPECTED_QUERIES",
  "severity": "ERROR",
  "passed": false,
  "message": "Returned series do not match the requested query group.",
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

Required conceptual fields:

```text
check_id
severity
passed
message
expected
actual
```

Optional future fields:

```text
details
row_numbers
column_names
source_evidence
```

---

# 8. Validation Severities

Canonical severities:

```text
INFO
WARNING
ERROR
```

## 8.1 INFO

Used for:

- successful informational checks,
- observed source characteristics,
- non-blocking diagnostics.

No artifact acceptance impact.

---

## 8.2 WARNING

Used when:

- dataset is structurally valid,
- source meaning is still preserved,
- but data is suspicious, sparse, incomplete in a non-fatal way, or weak.

A warning may lead to:

```text
LOW_DATA
```

and:

```text
ACCEPTED_WITH_WARNING
```

Warnings must never be silently hidden.

---

## 8.3 ERROR

Used when:

- the requested dataset was not collected correctly,
- source/context/schema identity cannot be trusted,
- the artifact is not usable as the requested canonical dataset.

Error-level findings usually lead to:

```text
REJECTED
```

---

# 9. Validation Statuses

Canonical dataset validation statuses:

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

These statuses are dataset validation outcomes only. Transport and control-flow conditions are represented separately through execution state and error records.

---

# 10. Status Semantics

## 10.1 NOT_RUN

Validation has not executed.

Typical reasons:

- job has not produced an artifact,
- execution failed before validation,
- manual action blocks collection before artifact creation.

Artifact state:

```text
no candidate artifact
```

or, if a partial artifact exists, its state must not be accepted.

---

## 10.2 VALID

The dataset passes all required validation checks.

Conditions:

- expected artifact exists,
- artifact is readable,
- artifact is data rather than login/error content,
- parser succeeds,
- required structure is present,
- expected query context matches,
- date coverage is acceptable,
- numeric fields are valid,
- no fatal integrity condition is detected,
- warning-level conditions do not require `LOW_DATA`.

Artifact state:

```text
ACCEPTED
```

---

## 10.3 LOW_DATA

The dataset is structurally valid but contains unusually sparse or weak data.

Examples may include:

- very high proportion of missing/zero values,
- only a small subset of queries contains signal,
- data density is insufficient for normal analytical use but still represents a valid source response.

Important:

```text
LOW_DATA != NO_DATA
LOW_DATA != FAILED
```

Artifact state:

```text
ACCEPTED_WITH_WARNING
```

The exact threshold must be calibrated against real Google Trends exports during M3/M4.

Do not invent a threshold in M0.

---

## 10.4 NO_DATA

The source validly indicates that no meaningful dataset exists for the requested query/context.

This must be distinguished from:

- download failure,
- empty file,
- parser failure,
- login page,
- all-zero data caused by malformed collection.

`NO_DATA` should only be used when the validator has reasonable evidence that the provider response genuinely represents no data.

Artifact state:

```text
ACCEPTED_WITH_WARNING
```

or source-specific no-data evidence may be retained as accepted diagnostic evidence.

The exact Google Trends UI no-data representation must be verified during implementation.

---

## 10.5 INVALID_SCHEMA

The candidate appears to be structured data but does not conform to the expected dataset schema.

Examples:

- required temporal dimension missing,
- expected value columns missing,
- unexpected format incompatible with parser,
- CSV shape materially changed.

Artifact state:

```text
REJECTED
```

---

## 10.6 ERROR_NOT_DATA

The candidate is not the requested dataset.

Examples:

- HTML login page,
- Google error page,
- access denied page,
- generic consent/security page,
- unexpected webpage saved with `.csv` extension.

Artifact state:

```text
REJECTED
```

---

## 10.7 DATE_MISMATCH

The actual source data coverage materially conflicts with the requested/expected date contract.

Examples:

- export covers a clearly different period,
- export starts/ends outside allowed source behavior,
- parser detects an incompatible date range,
- exact period request did not take effect.

Artifact state:

```text
REJECTED
```

unless a future source-specific policy explicitly classifies a known provider lag as acceptable.

Requested and actual range must remain separately recorded.

---

## 10.8 QUERY_MISMATCH

Returned query series do not match the requested comparison group.

Examples:

- one requested query missing unexpectedly,
- an unrelated query appears,
- previous job's query set is returned,
- query order/identity cannot be reliably mapped.

Artifact state:

```text
REJECTED
```

Query-order differences alone should not cause failure if mapping is deterministic and source behavior legitimately reorders columns.

---

## 10.9 Operational Outcomes Before Dataset Validation

Some collection outcomes occur before a candidate dataset exists and therefore do not belong in `validation_status`.

Examples:

### DOWNLOAD_FAILED

Represent as:

```text
execution_status = FAILED
error_code = DOWNLOAD_FAILED
validation_status = NOT_RUN
```

A partial artifact may be retained as diagnostic evidence, but it is not canonical data.

### MANUAL_ACTION_REQUIRED

Represent as:

```text
execution_status = MANUAL_ACTION_REQUIRED
validation_status = NOT_RUN
```

Examples include authentication, CAPTCHA/security challenge, or provider consent. No bypass attempt is allowed.

---

# 11. Deterministic Validation Status Resolution

When multiple dataset-validation checks fail, the validator must choose one primary `validation_status` deterministically while preserving all findings.

Recommended precedence for Google Trends MVP:

```text
ERROR_NOT_DATA
↓
INVALID_SCHEMA
↓
QUERY_MISMATCH
↓
DATE_MISMATCH
↓
NO_DATA
↓
LOW_DATA
↓
VALID
```

`NOT_RUN` applies when dataset validation has not executed.

Rationale:

- non-data content supersedes schema,
- schema must be trustworthy before semantic checks,
- query/date identity failures reject the dataset,
- no-data/low-data are valid-source outcomes,
- only fully acceptable results become `VALID`.

Implementation may refine precedence if real source behavior requires it, but changes must be documented.

---

# 12. Artifact Acceptance Matrix

| Validation Status | Artifact State | Canonical Data? | Retry Candidate? |
|---|---|---:|---:|
| `VALID` | `ACCEPTED` | Yes | No |
| `LOW_DATA` | `ACCEPTED_WITH_WARNING` | Yes, with warning | Optional/manual |
| `NO_DATA` | `ACCEPTED_WITH_WARNING` | No meaningful rows; evidence retained | Optional/manual |
| `INVALID_SCHEMA` | `REJECTED` | No | Yes |
| `ERROR_NOT_DATA` | `REJECTED` | No | Yes / manual depending cause |
| `DATE_MISMATCH` | `REJECTED` | No | Yes |
| `QUERY_MISMATCH` | `REJECTED` | No | Yes |

Operational failures such as `DOWNLOAD_FAILED` and `MANUAL_ACTION_REQUIRED` do not enter this matrix because dataset validation remains `NOT_RUN` unless a candidate dataset exists.

---

# 13. Generic Validation Checks

These checks should be reusable across source modules where applicable.

Recommended check IDs use:

```text
GEN_<CHECK_NAME>
```

---

## 13.1 GEN_ARTIFACT_EXISTS

Purpose:

Confirm that the expected candidate artifact exists.

If the expected artifact does not exist, dataset validation does not begin. Record:

```text
execution_status = FAILED
error_code = DOWNLOAD_FAILED
validation_status = NOT_RUN
```

---

## 13.2 GEN_ARTIFACT_READABLE

Purpose:

Confirm the file can be opened/read.

If the artifact cannot be read because collection/storage did not complete, record an execution/storage error and keep `validation_status = NOT_RUN`. If readable bytes exist but their structure is invalid, later checks may resolve to `INVALID_SCHEMA` or `ERROR_NOT_DATA`.

---

## 13.3 GEN_NON_EMPTY_FILE

Purpose:

Reject zero-byte or effectively empty artifacts.

Expected:

```text
byte_size > 0
```

A fixed minimum-byte threshold should not be locked until real artifacts are tested.

Severity:

```text
ERROR
```

A zero-byte candidate is not a valid provider no-data response. If it represents an incomplete download, use `error_code = DOWNLOAD_FAILED` with `validation_status = NOT_RUN`; otherwise reject the candidate as structurally invalid.

---

## 13.4 GEN_CONTENT_SIGNATURE

Purpose:

Determine whether content resembles the expected data format.

For CSV-like exports, inspect:

- initial bytes/text,
- delimiters,
- recognizable row structure,
- binary mismatch.

Do not rely only on file extension.

---

## 13.5 GEN_HTML_DETECTION

Purpose:

Detect HTML or provider web pages masquerading as CSV/data.

Indicators may include:

```text
<!DOCTYPE html
<html
<head
<body
```

as well as source-specific login/error markers.

Likely status:

```text
ERROR_NOT_DATA
```

Severity:

```text
ERROR
```

Do not retain sensitive HTML content in logs.

---

## 13.6 GEN_PARSEABLE

Purpose:

Confirm the artifact can be parsed by the expected parser.

Failure:

```text
INVALID_SCHEMA
```

Severity:

```text
ERROR
```

---

## 13.7 GEN_REQUIRED_COLUMNS

Purpose:

Confirm required structural columns/dimensions exist.

Source-specific expected columns should be supplied by the source validator.

Failure:

```text
INVALID_SCHEMA
```

---

## 13.8 GEN_UNEXPECTED_SCHEMA_CHANGE

Purpose:

Detect material unexpected columns/structure.

Not every extra column must be fatal.

Policy:

- harmless extra metadata → `INFO`/`WARNING`,
- structure that breaks semantic mapping → `ERROR`.

---

## 13.9 GEN_DUPLICATE_ROWS

Purpose:

Detect exact duplicate rows where the dataset contract expects uniqueness.

Severity depends on source semantics.

For Google Trends temporal rows, duplicate period/query pairs may be an error.

---

## 13.10 GEN_NUMERIC_PARSE

Purpose:

Confirm numeric fields are parseable where expected.

Missing values remain missing.

Do not coerce invalid values to `0`.

Failure:

```text
INVALID_SCHEMA
```

or source-specific status.

---

# 14. Generic Error-Page Detection Rules

A file extension does not establish content identity.

The validator should examine content for likely non-data responses.

Examples:

```text
login
sign in
access denied
error
captcha
unusual traffic
consent
```

These strings must be implemented carefully and source-specifically to avoid false positives.

Detection should prefer:

- strong HTML structure,
- known provider markers,
- incompatible MIME/content patterns,
- parser failure combined with page signatures.

Do not classify based on one weak substring alone.

---

# 15. Generic Missing-Value Rules

Validation must never transform:

```text
missing
```

into:

```text
0
```

Checks should distinguish:

- empty cell,
- absent column,
- explicit numeric zero,
- provider-specific suppression marker,
- parser null.

Any provider-specific suppression markers must be documented before normalization.

---

# 16. Google Trends MVP Validation Scope

The MVP validates:

```text
source_id      = google-trends
source_mode    = GOOGLE_TRENDS_UI
dataset_type   = INTEREST_OVER_TIME
country_code   = TR
search_type    = WEB_SEARCH
selection_type = SEARCH_TERM
```

Primary period:

```text
exact requested 24-month window
```

Category:

```text
All Categories
```

Actual source behavior must be observed rather than invented.

---

# 17. Google Trends Check Namespace

Google Trends-specific checks should use:

```text
GT_<CHECK_NAME>
```

Initial proposed checks:

```text
GT_SOURCE_MODE
GT_DATASET_TYPE
GT_EXPECTED_QUERIES
GT_TEMPORAL_DIMENSION
GT_DATE_COVERAGE
GT_RELATIVE_INTEREST_PARSE
GT_RELATIVE_INTEREST_RANGE
GT_ALL_ZERO
GT_SIGNAL_DENSITY
GT_DUPLICATE_PERIODS
GT_QUERY_CONTEXT
GT_SEARCH_TERM_MODE
GT_WEB_SEARCH_MODE
GT_GEOGRAPHY
GT_CATEGORY
```

Not all checks can be fully implemented until real exports are inspected.

---

# 18. GT_SOURCE_MODE

Purpose:

Ensure metadata identifies the collector mode correctly.

Expected MVP:

```text
GOOGLE_TRENDS_UI
```

This check primarily protects internal provenance consistency.

If actual collection mode is unknown or incorrectly labeled, validation cannot claim full provenance.

Severity:

```text
ERROR
```

if source mode is materially ambiguous.

---

# 19. GT_DATASET_TYPE

Purpose:

Confirm the collected artifact represents:

```text
INTEREST_OVER_TIME
```

and not another Google Trends export.

Potential evidence:

- export structure,
- source-specific headers,
- collection context.

Failure:

```text
INVALID_SCHEMA
```

or `QUERY_MISMATCH` depending observed content.

---

# 20. GT_EXPECTED_QUERIES

Purpose:

Confirm returned series correspond to the exact query comparison group.

Inputs:

```text
expected_queries
actual_series
```

Rules:

- every expected query must map to one returned series,
- unrelated unexpected query series must not silently replace expected series,
- duplicate queries across different GT groups are allowed,
- comparison-group identity must be preserved.

Failure:

```text
QUERY_MISMATCH
```

Severity:

```text
ERROR
```

Exact mapping logic must be based on live CSV structure.

---

# 21. GT_QUERY_CONTEXT

Purpose:

Ensure parsed normalized rows retain:

```text
query_group_id
job_id
```

This protects against cross-group deduplication.

Failure before export generation should block normalized output.

Severity:

```text
ERROR
```

This is primarily an internal validation invariant.

---

# 22. GT_TEMPORAL_DIMENSION

Purpose:

Confirm the Interest Over Time dataset contains a recognizable temporal dimension.

Do not assume in M0 whether the live 24-month export is daily, weekly, or another granularity.

The parser must first determine actual source behavior during M3.

Failure:

```text
INVALID_SCHEMA
```

---

# 23. GT_DATE_COVERAGE

Purpose:

Compare requested and actual coverage.

Inputs:

```text
requested_date_start
requested_date_end
actual_date_start
actual_date_end
```

Rules:

- preserve both requested and actual,
- do not invent dates,
- allow only source behavior explicitly documented/calibrated by implementation,
- material unexplained mismatch → `DATE_MISMATCH`.

The acceptable tolerance, if any, must be calibrated from real Google Trends behavior.

No arbitrary tolerance is locked in M0.

---

# 24. GT_RELATIVE_INTEREST_PARSE

Purpose:

Confirm every non-missing relative-interest value is safely parseable.

Expected normalized type:

```text
integer | null
```

Do not:

- parse invalid text as zero,
- discard suppressed/missing values without trace,
- infer absolute volume.

Failure:

```text
INVALID_SCHEMA
```

---

# 25. GT_RELATIVE_INTEREST_RANGE

Expected semantic range for classic UI values:

```text
0..100
```

However the implementation must verify actual export representation before locking parser assumptions.

If a parsed non-null value falls outside verified source range:

Severity:

```text
ERROR
```

Likely status:

```text
INVALID_SCHEMA
```

Do not clamp values into range.

---

# 26. GT_ALL_ZERO

Purpose:

Detect a structurally valid dataset where all parsed query values are zero.

This is suspicious but not automatically a collector failure.

Possible meanings:

- genuinely no measurable signal,
- wrong query selection,
- malformed export,
- source suppression/low-volume behavior.

M0 policy:

```text
all-zero alone must not produce VALID
```

The final mapping between:

```text
NO_DATA
LOW_DATA
```

must be calibrated with real Google Trends no-data/low-data exports.

Until calibrated, treat as a warning/suspicion condition rather than silently valid data.

---

# 27. GT_SIGNAL_DENSITY

Purpose:

Estimate whether the dataset contains enough non-zero/non-missing observations to be considered normal vs low-data.

Potential diagnostic metrics:

```text
total_value_cells
non_missing_cells
non_zero_cells
zero_ratio
missing_ratio
queries_with_any_signal
queries_without_signal
```

These are validation diagnostics, not business analysis.

Example diagnostic:

```json
{
  "zero_ratio": 0.91,
  "missing_ratio": 0.00,
  "queries_with_any_signal": 2,
  "queries_total": 5
}
```

Do not lock a `LOW_DATA` threshold until real datasets are sampled.

Thresholds must be documented and tested before Release 1.0.

---

# 28. GT_DUPLICATE_PERIODS

Purpose:

Detect duplicate temporal records incompatible with expected normalized uniqueness.

Expected normalized uniqueness concept:

```text
query_group_id
+ query
+ period_start
(+ period_end if applicable)
```

Duplicate rows may indicate:

- parser duplication,
- malformed CSV,
- normalization bug.

Severity:

```text
ERROR
```

unless real source exports demonstrate legitimate duplicates.

---

# 29. GT_GEOGRAPHY

Expected request:

```text
TR
```

Validation must distinguish:

```text
requested geography
```

from:

```text
observed geography
```

If the export itself does not reliably encode geography, do not claim it was file-verified.

Possible evidence sources:

- UI state observed during collection,
- source metadata,
- request configuration snapshot.

Recommended result structure:

```json
{
  "requested": "TR",
  "observed": "TR",
  "verification_method": "UI_STATE"
}
```

If reliable observation is unavailable:

```text
observed = null
```

Do not fabricate confirmation.

---

# 30. GT_WEB_SEARCH_MODE

Expected:

```text
WEB_SEARCH
```

Validation may use collection-time UI evidence if the CSV does not encode search type.

If source state cannot be verified, metadata should remain explicit about that limitation.

A confirmed wrong mode should reject the artifact.

Likely status:

```text
INVALID_SCHEMA
```

or source-context mismatch.

---

# 31. GT_SEARCH_TERM_MODE

Expected:

```text
SEARCH_TERM
```

Topic data must not be silently accepted as Search Term data.

If UI/source evidence indicates `TOPIC`:

Artifact must be rejected for the MVP job.

Status may resolve to:

```text
QUERY_MISMATCH
```

or another explicit context mismatch if later introduced.

Until a dedicated context status exists, preserve a precise finding message.

---

# 32. GT_CATEGORY

Expected:

```text
All Categories
```

As with geography/search type, verification method may depend on UI state rather than CSV.

Record:

```text
requested_category
observed_category
verification_method
```

Do not invent a category ID if not verified.

---

# 33. Google Trends Required MVP Checks

Before an artifact may become `ACCEPTED`, the MVP should eventually require successful results for at least:

```text
GEN_ARTIFACT_EXISTS
GEN_ARTIFACT_READABLE
GEN_NON_EMPTY_FILE
GEN_HTML_DETECTION
GEN_PARSEABLE
GEN_REQUIRED_COLUMNS
GT_DATASET_TYPE
GT_EXPECTED_QUERIES
GT_TEMPORAL_DIMENSION
GT_DATE_COVERAGE
GT_RELATIVE_INTEREST_PARSE
GT_RELATIVE_INTEREST_RANGE
GT_QUERY_CONTEXT
```

Configuration-context checks should also be required where reliable verification is implemented:

```text
GT_GEOGRAPHY
GT_WEB_SEARCH_MODE
GT_SEARCH_TERM_MODE
GT_CATEGORY
```

If a setting cannot yet be file-verified, metadata must state the verification method/limitation rather than pretending the check passed.

---

# 34. Google Trends Warning Checks

Likely warning-level checks:

```text
GT_ALL_ZERO
GT_SIGNAL_DENSITY
```

Potential future:

```text
GT_PARTIAL_QUERY_SIGNAL
GT_SOURCE_LAG
```

These should not be invented until real source behavior demonstrates a need.

---

# 35. Google Trends Low-Data Calibration

`LOW_DATA` is useful only if it is evidence-based.

Calibration plan during M3/M4:

1. Collect several known high-signal groups.
2. Collect several expected low-signal groups.
3. Observe Google Trends export representations.
4. Measure:
   - zero ratio,
   - missing ratio,
   - queries with any signal,
   - number of periods,
   - source-provided suppression markers if any.
5. Propose threshold.
6. Test threshold against fixtures.
7. Record decision in `DECISIONS.md`.
8. Update this specification with locked threshold.

Until then:

> Do not hard-code an arbitrary low-data percentage.

---

# 36. Google Trends No-Data Calibration

`NO_DATA` must represent a genuine provider no-data outcome.

During implementation, determine whether Google Trends expresses no data via:

- absent export control,
- UI no-data message,
- valid CSV with empty rows,
- valid CSV with all-zero values,
- another source-specific representation.

Then encode that evidence explicitly.

Do not equate:

```text
empty file
```

with:

```text
NO_DATA
```

An empty/unparseable file is normally an error, not valid no-data evidence.

---

# 37. Date Mismatch Policy

Date validation must avoid false precision.

A mismatch is fatal when:

- the wrong requested period was clearly used,
- actual coverage is outside known source behavior,
- a previous job's/date preset export was downloaded,
- start/end range is materially incompatible.

A mismatch may be acceptable when:

- the source has a documented/verified availability lag,
- source granularity causes boundary rounding,
- the actual range remains consistent with verified source semantics.

Such exceptions must be:

- explicit,
- testable,
- source-specific,
- recorded in metadata.

---

# 38. Query Mismatch Policy

A query mismatch is fatal when:

- one or more requested query identities cannot be mapped,
- unrelated queries appear instead,
- stale previous-group data was exported,
- Topic vs Search Term identity differs from request.

Non-fatal differences may include:

- column order changed by provider,
- harmless formatting variations that map deterministically.

Query normalization must not collapse distinct literal search terms unless the provider itself does so and this behavior is preserved in metadata.

---

# 39. Schema Change Policy

External UI exports may change.

When a new schema appears:

```text
old parser fails
↓
artifact retained
↓
INVALID_SCHEMA
↓
job not accepted
↓
developer inspects real artifact
↓
parser updated intentionally
↓
fixtures added
↓
validation spec updated if semantics changed
```

Never respond to unknown schema by:

- ignoring extra fields blindly,
- guessing missing fields,
- filling nulls with zero,
- silently remapping columns based only on position.

---

# 40. Rejected Artifact Retention

Rejected artifacts should usually be retained for audit/debugging.

Examples:

```text
INVALID_SCHEMA
ERROR_NOT_DATA
DATE_MISMATCH
QUERY_MISMATCH
```

Retention requirements:

- artifact remains linked to run/job/attempt,
- artifact state = `REJECTED`,
- validation result retained,
- sensitive content should not be copied into logs.

If an artifact contains sensitive provider/security page content, implementation may apply a restricted retention/redaction policy.

That policy must be documented before destructive cleanup.

---

# 41. Retry Guidance by Status

## VALID

Automatic retry:

```text
No
```

---

## LOW_DATA

Automatic retry:

```text
No by default
```

User may choose a manual recollection if sampling variability is suspected.

---

## NO_DATA

Automatic retry:

```text
No by default
```

May be retried manually if the user changes request/configuration.

---

## INVALID_SCHEMA

Automatic retry:

```text
Usually no immediate repeated retry
```

If caused by transient/stale UI state, one controlled retry may be reasonable.

Repeated identical schema failure should stop.

---

## ERROR_NOT_DATA

Depends on cause.

Login/security page:

```text
MANUAL_ACTION_REQUIRED
```

Transient provider error:

controlled retry may be allowed.

---

## DATE_MISMATCH

Controlled retry may be appropriate after reapplying date filters.

Repeated mismatch should stop and surface error.

---

## QUERY_MISMATCH

Controlled retry may be appropriate after resetting/reapplying queries.

Repeated mismatch should stop.

---

## Operational error: DOWNLOAD_FAILED

Retryable:

```text
Yes
```

with conservative limits. This is an `error_code`, not a validation status.

---

## Execution state: MANUAL_ACTION_REQUIRED

Automatic retry:

```text
No
```

Wait for user action. This is an execution/control-flow state, not a validation status.

---

# 42. Automatic Retry Limits

Exact retry counts and cooldowns are not locked in M0.

Principles:

- retries are per job,
- preserve attempt history,
- no aggressive loops,
- no rate-limit bypass behavior,
- identical repeated failure should stop,
- security/manual states are never automatic retry loops.

Exact retry policy belongs in implementation and may be recorded in `DECISIONS.md`.

---

# 43. Validation and Resume

On application restart:

```text
job was RUNNING
↓
check persisted attempt/artifact
↓
if candidate artifact exists
    validate/reconcile it
else
    mark previous attempt incomplete
↓
never assume success
```

If an accepted artifact with completed validation already exists:

```text
do not recollect during normal resume
```

---

# 44. Validation Persistence

Each validation result should be persisted in:

1. SQLite summary record.
2. Detailed validation JSON file.

SQLite stores searchable summary.

JSON stores detailed findings.

Conceptual path:

```text
<run_id>/
└── google-trends/
    └── validation/
        └── GT04.validation.json
```

Attempt-specific validation may use:

```text
GT04.attempt_2.validation.json
```

---

# 45. Validation JSON Example — VALID

```json
{
  "schema_version": 1,
  "validation_id": "validation_abc123",
  "run_id": "rr_...",
  "job_id": "rr_...__google-trends__GT04",
  "artifact_id": "artifact_xyz",
  "validation_status": "VALID",
  "validated_at": "2026-08-18T01:00:19.000Z",
  "checks_total": 13,
  "checks_passed": 13,
  "checks_warning": 0,
  "checks_failed": 0,
  "findings": [
    {
      "check_id": "GEN_ARTIFACT_EXISTS",
      "severity": "ERROR",
      "passed": true,
      "message": "Candidate artifact exists.",
      "expected": true,
      "actual": true
    }
  ]
}
```

A check may have severity `ERROR` even when it passes; severity represents consequence if it fails.

---

# 46. Validation JSON Example — LOW_DATA

```json
{
  "schema_version": 1,
  "validation_status": "LOW_DATA",
  "checks_total": 14,
  "checks_passed": 13,
  "checks_warning": 1,
  "checks_failed": 0,
  "findings": [
    {
      "check_id": "GT_SIGNAL_DENSITY",
      "severity": "WARNING",
      "passed": false,
      "message": "Dataset is structurally valid but contains low signal density.",
      "expected": null,
      "actual": {
        "zero_ratio": 0.91,
        "queries_with_any_signal": 2,
        "queries_total": 5
      }
    }
  ]
}
```

The numeric values above are example payload shape only, not locked thresholds.

---

# 47. Validation JSON Example — ERROR_NOT_DATA

```json
{
  "schema_version": 1,
  "validation_status": "ERROR_NOT_DATA",
  "checks_failed": 1,
  "findings": [
    {
      "check_id": "GEN_HTML_DETECTION",
      "severity": "ERROR",
      "passed": false,
      "message": "Downloaded artifact appears to be an HTML page rather than CSV data.",
      "expected": "CSV-like data",
      "actual": "HTML-like content"
    }
  ]
}
```

Do not embed full sensitive page contents in validation JSON.

---

# 48. Validation Logging

Important validation events should be logged.

Example categories:

```text
VALIDATION_STARTED
VALIDATION_CHECK_FAILED
VALIDATION_WARNING
VALIDATION_COMPLETED
ARTIFACT_ACCEPTED
ARTIFACT_REJECTED
```

Logs should contain:

```text
timestamp
run_id
job_id
attempt_number
artifact_id
validation_status
check_id where relevant
```

Do not log credentials/session tokens.

---

# 49. UI Presentation Rules

UI must distinguish:

```text
success
warning
failure
manual action
```

Example:

```text
GT01  ✅ Valid
GT02  ⚠ Low Data
GT03  ○ No Data
GT04  ❌ Query Mismatch
GT05  🔐 Manual Action Required
```

The UI must not represent `LOW_DATA` as identical to `VALID`.

The UI must not represent `NO_DATA` as numeric zero.

Detailed UI styling belongs to M5.

---

# 50. Run-Level Result Aggregation

Run status should derive from job execution/validation outcomes.

Conceptual rules:

## COMPLETED

All jobs terminal and acceptable, with validation:

```text
VALID
```

only.

## COMPLETED_WITH_WARNINGS

All jobs terminal, no unresolved hard failures, but one or more:

```text
LOW_DATA
NO_DATA
```

or other accepted warning states.

## RUNNING

Pending/running/retry work remains.

## MANUAL_ACTION_REQUIRED

Progress is blocked by provider-side user action.

## FAILED

Run cannot proceed because of unrecoverable run-level condition.

A run containing retryable rejected jobs may remain resumable rather than immediately becoming final `FAILED`.

Exact aggregation state machine will be implemented in M2.

---

# 51. Export Eligibility

Only accepted artifacts should feed normal normalized/export datasets.

Eligible:

```text
ACCEPTED
ACCEPTED_WITH_WARNING
```

Not eligible as normal data:

```text
CANDIDATE
REJECTED
SUPERSEDED
```

`NO_DATA` jobs may contribute metadata/validation rows but must not generate fabricated numeric data rows.

---

# 52. Workbook Validation Reporting

`VALIDATION_LOG` should expose validation findings.

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

This allows downstream analysts to see data-quality context.

---

# 53. Validation Test Fixture Strategy

Validation logic should be testable without live Google Trends.

Maintain fixtures representing:

```text
valid export
empty file
HTML login page
HTML error page
malformed CSV
missing query column
unexpected query column
non-numeric value
out-of-range value
date mismatch
duplicate period row
all-zero dataset
low-density dataset
no-data representation
```

The exact fixtures should be created from sanitized real source behavior where possible.

Do not fabricate fixture structures and then assume Google Trends uses them.

---

# 54. Generic Validation Unit Tests

At minimum test:

```text
artifact missing
artifact unreadable
zero-byte file
HTML detection
CSV parser failure
required-column failure
numeric parse failure
status precedence
artifact-state mapping
```

---

# 55. Google Trends Validator Tests

After real export schema is known, test:

```text
expected five-query group
queries reordered
one query missing
wrong previous group returned
wrong date window
valid source lag
invalid source lag
non-numeric relative interest
relative interest outside verified range
duplicate periods
all-zero data
low signal density
true no-data provider response
```

---

# 56. Validation Invariants

The following rules are mandatory.

## Invariant 1

No candidate artifact becomes canonical before validation.

## Invariant 2

A file extension is not proof of content type.

## Invariant 3

Parser success is not proof of semantic correctness.

## Invariant 4

Missing values are never silently converted to zero.

## Invariant 5

Google Trends values are never converted to absolute search volume.

## Invariant 6

Query comparison-group identity must remain intact.

## Invariant 7

A rejected artifact must not feed normal exports.

## Invariant 8

A warning-level artifact must remain visibly marked.

## Invariant 9

A manual security challenge must never trigger bypass behavior.

## Invariant 10

Unknown source behavior must not be guessed into `VALID`.

---

# 57. Validation Anti-Patterns

Avoid:

## Anti-pattern: Download = success

```text
CSV downloaded
→ VALID
```

Wrong.

---

## Anti-pattern: Parse = success

```text
CSV parsed
→ VALID
```

Wrong.

Schema/query/date semantics may still be wrong.

---

## Anti-pattern: All zero = no data automatically

Wrong until provider behavior is verified.

---

## Anti-pattern: Missing = zero

Never allowed.

---

## Anti-pattern: Unknown column ignored silently

Potential schema drift must be surfaced.

---

## Anti-pattern: Wrong query accepted because column count matches

Identity matters, not only shape.

---

## Anti-pattern: Requested config recorded as observed config

Requested state and verified/observed state must remain separate.

---

## Anti-pattern: Retrying security challenge indefinitely

Manual action is a first-class state.

---

# 58. Deferred Validation Decisions

The following must be determined using real Google Trends MVP artifacts during M3/M4:

- exact CSV header/schema,
- exact delimiter/encoding behavior,
- exact temporal granularity for 24-month exports,
- exact no-data representation,
- exact low-data representation,
- exact source lag/boundary behavior,
- exact category verification method,
- exact geography verification method,
- exact Web Search verification method,
- exact Search Term verification method,
- LOW_DATA threshold,
- automatic retry count,
- retry/cooldown timings.

Do not lock these from memory.

---

# 59. M3 Minimum Validation Slice / Discovery Gate

M3 must include the minimum validation required to trust the first real Google Trends artifact. Before expanding the collector beyond the first reliable query group:

1. Capture a real Interest Over Time CSV.
2. Preserve the original file.
3. Document actual headers and encoding.
4. Document temporal granularity.
5. Map expected query identities.
6. Confirm numeric representation.
7. Confirm requested/actual date behavior.
8. Add sanitized fixture.
9. Implement parser.
10. Implement required checks.
11. Verify valid artifact becomes `ACCEPTED`.

---

# 60. M4 Validation Engine Acceptance Criteria

M4 generalizes and hardens the minimum M3 validation slice into the reusable validation engine. M4 is complete when:

- generic checks are reusable,
- Google Trends validator is isolated in the source module,
- every candidate artifact gets a validation result,
- status resolution is deterministic,
- validation result persists to SQLite + JSON,
- rejected artifacts do not feed exports,
- LOW_DATA remains visible,
- NO_DATA remains distinct from zero,
- HTML/error pages are rejected,
- query mismatch is rejected,
- date mismatch is rejected,
- schema mismatch is rejected,
- numeric parse errors are rejected,
- all-zero/sparse data is surfaced,
- retry does not erase earlier validation history,
- fixtures cover major failure modes,
- validator tests pass.

---

# 61. Release 1.0 Validation Gate

Before Google Trends Release 1.0:

- GT01–GT20 have been exercised through the validator.
- Multiple real runs have been tested.
- At least one retry scenario has been verified.
- Resume with existing accepted artifacts has been verified.
- At least one malformed/non-data artifact test has been verified.
- Date validation behavior is documented.
- Query mapping behavior is documented.
- Low/no-data behavior is calibrated.
- Validation logs are exported.
- No rejected artifact appears as normal GT raw normalized data.
- Missing values remain missing.
- Comparison-group context is preserved.

---

# 62. Future Source Modules

Future source validators should reuse the same generic framework.

Example:

```text
Source artifact
↓
Generic checks
↓
Source parser
↓
Source semantic checks
↓
ValidationResult
```

Future sources may add statuses only when existing generic statuses cannot represent the condition accurately.

Avoid turning validation into source-specific ad hoc logic.

---

# 63. Relationship to Other Documents

This specification is based on and must remain consistent with:

- `PROJECT_SPEC.md`
- `ARCHITECTURE.md`
- `DATA_CONTRACTS.md`
- `PROJECT_HANDOFF.md`

Next M0 documents:

- `TEST_STRATEGY.md`
- `DECISIONS.md`
- `SOURCE_MODULE_GUIDE.md`

Thresholds and implementation-specific validation discoveries should be reflected in `DECISIONS.md` when they become stable architectural choices.

---

# 64. Governing Validation Rule

When uncertain whether suspicious data should be accepted:

> **Do not silently accept it.**

Preserve the artifact, preserve the evidence, record the findings, surface the uncertainty, and require an explicit validated path before treating it as canonical data.
