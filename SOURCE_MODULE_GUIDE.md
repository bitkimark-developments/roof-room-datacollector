# RoofRoom Data Collector — Source Module Guide

**Document:** `SOURCE_MODULE_GUIDE.md`  
**Product:** RoofRoom Data Collector  
**Status:** M0 approved baseline  
**Last Updated:** 2026-08-18  
**Purpose:** Define the standard contract, responsibilities, lifecycle, testing expectations, and acceptance criteria for adding new data-source modules to RoofRoom Data Collector.

---

# 1. Purpose

RoofRoom Data Collector is designed as:

> **One application with multiple independent data-source modules.**

This document defines how a source module must integrate with the shared RoofRoom Core without duplicating or bypassing common infrastructure.

The guide should answer:

- What belongs inside a source module?
- What must remain in Core?
- What contract must every source implement?
- How should browser-based and API-based sources differ?
- How are readiness, collection, validation, metadata, errors, retry, and manual action represented?
- What tests are required before a source is considered production-ready?
- How should future sources be added without changing existing architecture unnecessarily?

Google Trends is the first source module and serves as the initial reference implementation.

This guide is architectural and intentionally avoids locking package versions, concrete class names, or source-specific selectors before implementation evidence exists.

---

# 2. Governing Module Principle

A source module owns only what is unique to the external source.

Shared concerns remain in Core.

Conceptual boundary:

```text
RoofRoom Core
│
├── runs
├── jobs
├── attempts
├── resume
├── retry coordination
├── browser lifecycle
├── storage
├── metadata/provenance
├── validation coordination
├── logging
├── export
└── desktop integration

Source Module
│
├── source identity
├── source capabilities
├── readiness checks
├── source-specific collection
├── source-specific parsing
├── source-specific validation rules
├── source-specific error mapping
└── source-specific fixtures/tests
```

A new source should integrate into Core.

It should not recreate Core.

---

# 3. Source Module Goals

Every source module should:

1. Have one stable machine identifier.
2. Expose its capabilities explicitly.
3. Expose readiness state explicitly.
4. Translate a RoofRoom job into source-specific collection actions.
5. Produce source artifacts without silently changing source meaning.
6. Preserve source-specific provenance.
7. Use shared storage rather than inventing arbitrary filesystem layouts.
8. Use shared validation coordination.
9. Map source-specific failures into stable RoofRoom error concepts.
10. Support job-level retry where technically meaningful.
11. Preserve attempt history.
12. Surface provider-side user intervention as `MANUAL_ACTION_REQUIRED`.
13. Be testable independently from the UI.
14. Keep browser/API implementation details isolated.
15. Avoid business-analysis logic.

---

# 4. Source Module Non-Goals

A source module must not independently own:

- global run creation,
- global run status,
- global job persistence,
- SQLite initialization,
- arbitrary filesystem structure,
- workbook generation,
- global logging infrastructure,
- application-wide retry policy,
- Electron renderer UI logic,
- cross-source business analysis,
- marketing recommendations.

A module may provide source-specific facts needed by these systems, but Core remains responsible for orchestration.

---

# 5. Standard Source Lifecycle

Every source should conceptually participate in the same lifecycle.

```text
REGISTER
↓
CHECK READINESS
↓
CREATE JOB CONTEXT
↓
COLLECT
↓
PRODUCE CANDIDATE ARTIFACT / SOURCE RESULT
↓
PRESERVE
↓
PARSE
↓
VALIDATE
↓
ACCEPT / WARN / REJECT
↓
PERSIST FINAL STATE
↓
EXPORT ELIGIBLE DATA
```

This lifecycle should remain recognizable whether the source uses:

- browser automation,
- official API,
- downloaded files,
- manual provider interaction,
- future authenticated integrations.

---

# 6. Source Registry Contract

Every source module must register with the shared SourceRegistry.

The registry should expose at minimum:

```text
source_id
source_name
source_version or implementation version if later adopted
capabilities
readiness
```

Canonical source IDs already reserved include:

```text
google-trends
google-keyword-planner
google-search-console
semrush
merchant-center
ga4
google-ads
```

A source ID must:

- be stable,
- be machine-readable,
- use lowercase hyphenated form,
- not depend on a display label,
- not change casually after persisted runs exist.

Do not persist aliases such as:

```text
gt
trends
google_trends
```

for `google-trends`.

---

# 7. Source Display Name vs Machine ID

Example:

```text
source_id   = google-trends
source_name = Google Trends
```

The machine ID is authoritative.

The display name exists for UI readability.

A display-name change must not alter historical source identity.

---

# 8. Conceptual Source Module Interface

The exact TypeScript interface is intentionally not locked in M0.

The implementation should preserve the following logical contract:

```ts
interface DataSourceModule {
  id: SourceId
  name: string

  getCapabilities(): SourceCapabilities

  checkReadiness(
    context: SourceReadinessContext
  ): Promise<SourceReadinessResult>

  collect(
    context: CollectionContext
  ): Promise<SourceCollectionResult>

  parse?(
    context: ParseContext
  ): Promise<ParsedSourceResult>

  validate(
    context: ValidationContext
  ): Promise<ValidationResult>
}
```

Implementation may split these responsibilities across multiple classes/modules.

For example:

```text
GoogleTrendsSource
GoogleTrendsCollector
GoogleTrendsParser
GoogleTrendsValidator
```

This is preferable to one oversized source class.

---

# 9. Source Capability Contract

A source must expose capabilities based on actual implementation behavior.

Conceptual fields:

```text
requires_browser
requires_oauth
may_require_manual_login
supports_custom_date_range
supports_direct_export
supports_api
supports_resume
max_concurrency
```

Example:

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

Capability values must not be aspirational.

If a feature has not been implemented or verified, do not claim support.

---

# 10. Capability Design Rule

Capabilities should help Core answer operational questions such as:

```text
Does this source need BrowserManager?
Can jobs run concurrently?
Can this source operate before login?
Does this source support custom date ranges?
Can the source resume internally?
```

Capabilities should not encode business strategy.

Bad:

```text
high_value_source = true
```

Good:

```text
requires_browser = true
```

---

# 11. Source Readiness Contract

Before collection begins, Core should be able to ask a source whether it is ready.

Canonical readiness statuses:

```text
READY
NOT_CONFIGURED
AUTHENTICATION_REQUIRED
MANUAL_ACTION_REQUIRED
UNAVAILABLE
ERROR
```

Conceptual result:

```json
{
  "source_id": "google-trends",
  "readiness_status": "READY",
  "checked_at": "2026-08-18T01:00:00.000Z",
  "message": null
}
```

Readiness does not mean the next collection is guaranteed to succeed.

It only means the source is presently eligible for collection.

---

# 12. Readiness Responsibilities

A source-specific readiness check may verify:

- required configuration exists,
- required browser profile can be opened,
- required API credentials/configuration exist,
- authentication appears available,
- source is reachable where appropriate,
- required source feature is accessible.

A readiness check must not:

- bypass authentication,
- solve CAPTCHA,
- silently refresh unauthorized sessions,
- treat unknown state as `READY`.

Unknown or blocked provider state should remain explicit.

---

# 13. Collection Context

Core should provide a source module with a controlled collection context.

Conceptual fields may include:

```text
run_id
job_id
attempt_id
attempt_number
source_id
job_key
requested_configuration
query_group or source job payload
storage handle/facade
browser access if applicable
logger facade
cancellation signal
```

A source module should receive only what it needs.

Do not provide arbitrary access to unrelated application state.

---

# 14. Source Job Payload

Each source defines the payload required for one independently tracked job.

For Google Trends:

```text
job_key = GT04
payload = query group + source settings
```

Future examples may differ.

Search Console might define one job by:

```text
dataset_type + date range + dimension set
```

Keyword Planner might define one job by:

```text
keyword batch + location/language/network settings
```

The source determines the semantic job payload.

Core determines job lifecycle and persistence.

---

# 15. Job Granularity Rule

A source job should be small enough that:

- failure is isolated,
- retry is useful,
- progress is understandable,
- provenance remains clear.

But not so small that:

- orchestration becomes unnecessarily fragmented,
- provider request volume becomes excessive,
- storage becomes unmanageable.

For Google Trends MVP:

> **one comparison query group = one job**

is the accepted baseline.

Future source job granularity must be justified by the source contract.

---

# 16. Collection Result Contract

A source collection should return a structured result rather than mutating global state directly.

Conceptual result categories:

```text
ARTIFACT_PRODUCED
NO_ARTIFACT
MANUAL_ACTION_REQUIRED
FAILED
```

A successful browser/API action does not automatically mean `VALID`.

Collection should return enough information for Core to:

- persist candidate artifacts,
- create metadata,
- invoke validation,
- record errors,
- update attempt state.

---

# 17. Candidate Artifact Rule

Source modules produce **candidate** artifacts/results.

They do not directly declare canonical acceptance.

Conceptual flow:

```text
SourceModule.collect()
↓
candidate artifact
↓
StorageManager
↓
ValidationCoordinator
↓
source parser/validator
↓
artifact state
```

Final states include:

```text
ACCEPTED
ACCEPTED_WITH_WARNING
REJECTED
```

---

# 18. Artifact Ownership

Source modules may determine:

- source-specific artifact type,
- expected media type,
- source filename where known,
- source-specific parsing needs.

StorageManager owns:

- run directory,
- source subdirectory,
- collision prevention,
- final relative paths,
- persistence,
- artifact registration.

Source modules must not create unrelated absolute paths on their own.

---

# 19. Raw Artifact Policy

When a source provides a raw file:

> **preserve the original bytes whenever practical.**

Do not:

- rewrite headers in place,
- replace missing values,
- normalize dates in place,
- deduplicate rows in place,
- append RoofRoom metadata into the original file.

Normalized or derived data belongs in separate artifacts.

---

# 20. API Source Raw Evidence

An API source may not naturally produce a downloaded source file.

In that case the module should preserve a source-faithful raw response artifact where appropriate.

Examples may include:

```text
JSON response
CSV response
provider export file
request/response metadata
```

The exact raw-evidence format must preserve source semantics without exposing sensitive secrets.

Do not persist access tokens or credentials as part of raw evidence.

---

# 21. Browser-Based Source Pattern

Browser-based modules should follow:

```text
Source Module
↓
BrowserManager
↓
source-specific UI adapter
↓
provider UI
↓
official export/download
↓
candidate artifact
↓
StorageManager
↓
ValidationCoordinator
```

The source module owns:

- source page workflow,
- selectors,
- state verification,
- source-specific download trigger.

BrowserManager owns:

- browser/profile lifecycle,
- shared browser resource handling,
- application-specific profile location,
- browser crash surfacing.

---

# 22. API-Based Source Pattern

API-based modules should follow:

```text
Source Module
↓
official API client
↓
request
↓
response
↓
raw response preservation
↓
parser / normalizer
↓
validation
```

The source module owns:

- source-specific API request construction,
- pagination if required,
- provider-specific error interpretation,
- response parsing.

Core still owns:

- run/job lifecycle,
- attempts,
- storage,
- validation coordination,
- logging,
- retry orchestration,
- export.

---

# 23. Authentication Boundary

Authentication is source-specific in behavior but application-wide in policy.

The source may detect:

```text
AUTHENTICATION_REQUIRED
SECURITY_CHALLENGE
CONSENT_REQUIRED
PROVIDER_CONFIRMATION_REQUIRED
```

The application must not:

- store user passwords,
- store 2FA codes,
- bypass CAPTCHA,
- bypass provider security controls,
- copy unauthorized sessions,
- log tokens.

Future OAuth sources require a dedicated secure token-storage design.

Do not invent ad hoc plaintext token JSON storage.

---

# 24. Manual Action Contract

When user intervention is required, the module should return a structured manual-action result.

Conceptual example:

```json
{
  "action_type": "AUTHENTICATION_REQUIRED",
  "source_id": "google-trends",
  "run_id": "rr_...",
  "job_id": "rr_...",
  "message": "Complete authentication in the opened provider window.",
  "created_at": "2026-08-18T01:00:00.000Z"
}
```

The source should not attempt to bypass the condition.

---

# 25. Manual Action Resume

After user action:

```text
user completes provider action
↓
Core requests readiness re-check
↓
source confirms READY
↓
job resumes or receives a new attempt according to implementation
```

The exact transition may vary by source, but attempt history and state must remain auditable.

---

# 26. Source-Specific Parsing

A parser converts source artifact structure into a RoofRoom-understood representation.

The parser should:

- preserve source semantics,
- avoid guessing unknown fields,
- preserve missing values,
- expose source-specific metadata,
- fail visibly on incompatible schema.

The parser should not:

- decide business value,
- silently coerce invalid values,
- invent missing fields,
- normalize across unrelated source datasets.

---

# 27. Parser Design Rule

Prefer explicit semantic mapping over positional assumptions.

Bad:

```text
column 2 must always be query 1
```

when the provider may reorder columns.

Preferred:

```text
identify series using verified source identity/header behavior
```

If identity cannot be established:

```text
QUERY_MISMATCH
```

or:

```text
INVALID_SCHEMA
```

should result.

---

# 28. Validation Integration

Each source must provide source-specific validation logic.

Shared ValidationCoordinator handles:

- generic file checks,
- aggregation,
- deterministic status resolution,
- persistence,
- artifact state transition.

Source validator handles source semantics.

Conceptual flow:

```text
generic validation
↓
source parser
↓
source-specific validation
↓
ValidationResult
```

---

# 29. Generic vs Source-Specific Validation

Generic examples:

```text
artifact exists
artifact readable
non-empty content
HTML/error-page detection
parseable data structure
```

Source-specific examples for Google Trends:

```text
expected queries
temporal dimension
relative-interest parsing
relative-interest range
requested vs actual date coverage
comparison-group context
search type
selection type
geography
category
```

A future Search Console validator would use different semantic checks.

---

# 30. Validation Check Namespace

Source-specific validation checks should use a stable namespace/prefix.

Examples:

```text
GT_EXPECTED_QUERIES
GT_DATE_COVERAGE
```

Future examples might use:

```text
GSC_<CHECK>
KWP_<CHECK>
SEMRUSH_<CHECK>
```

Do not create source-specific check names for generic reusable file checks.

Generic checks use:

```text
GEN_<CHECK>
```

---

# 31. Validation Status Reuse

Sources should reuse canonical dataset validation statuses whenever possible:

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

Transport/control-flow conditions such as `DOWNLOAD_FAILED` and `MANUAL_ACTION_REQUIRED` must be represented through `error_code` and execution/readiness state rather than being added to `validation_status`.

Do not create new statuses such as:

```text
GSC_WEIRD
SEMRUSH_BAD_DOWNLOAD
GT_STRANGE_FILE
```

for conditions already representable through:

- canonical status,
- `error_code`,
- findings,
- source-specific details.

New global statuses require an explicit architectural decision.

---

# 32. Error Mapping

Each source should map provider-specific failures into stable RoofRoom error records.

Canonical structure:

```json
{
  "error_code": "DOWNLOAD_FAILED",
  "error_scope": "JOB",
  "source_id": "google-trends",
  "message": "Provider export did not complete.",
  "retryable": true,
  "occurred_at": "2026-08-18T01:00:00.000Z",
  "details": {}
}
```

Provider-specific detail may exist inside:

```text
details
```

without creating uncontrolled global status values.

---

# 33. Error Scope

Canonical scopes include:

```text
APPLICATION
RUN
JOB
SOURCE
VALIDATION
EXPORT
```

A source module will typically emit:

```text
SOURCE
JOB
VALIDATION
```

scoped conditions.

Run/application failures remain Core responsibilities.

---

# 34. Retryability

A source may provide guidance:

```text
retryable = true | false
```

This does not directly trigger an automatic retry.

Core owns retry policy.

Examples:

```text
temporary provider timeout → retryable true
invalid source config      → retryable false
authentication required    → manual action, not automatic retry
```

---

# 35. Retry Rules for Source Modules

A source module must be safe to call again for a new attempt.

It must not assume:

```text
first attempt state still exists perfectly
```

Before recollection, source logic may need to:

- reset source page state,
- reapply filters,
- clear stale job-specific UI state,
- create a new API request,
- re-check readiness.

It must not overwrite previous attempt evidence.

---

# 36. Resume Expectations

A source module may expose source-specific reconciliation behavior if needed.

Core remains responsible for deciding:

- which run is incomplete,
- which job was active,
- whether a candidate artifact exists,
- whether the job is already accepted.

If a valid candidate artifact already exists after restart:

```text
validate/reconcile before recollection
```

is preferred.

---

# 37. Provenance Requirements

Every source module must contribute enough metadata to explain:

- what source was used,
- which source mode was used,
- what was requested,
- what was observed,
- what was returned,
- when collection occurred.

Core common fields include:

```text
run_id
job_id
attempt_number
source_id
source_name
source_mode
retrieved_at
application_version
raw_artifact_id
validation_status
```

The source may add source-specific fields.

---

# 38. Requested vs Observed State

A source must not confuse:

```text
requested configuration
```

with:

```text
verified/observed configuration
```

Example:

```json
{
  "requested": {
    "country_code": "TR"
  },
  "observed": {
    "country_code": "TR"
  }
}
```

If the observed value cannot be reliably verified:

```json
{
  "observed": {
    "country_code": null
  }
}
```

Never copy requested values into observed fields by assumption.

---

# 39. Source Mode

A source mode should distinguish materially different collection semantics.

Google Trends examples:

```text
GOOGLE_TRENDS_UI
GOOGLE_TRENDS_API
```

A source should define a new mode when changing collection path affects:

- scaling,
- meaning,
- aggregation,
- data availability,
- provider semantics.

A mere implementation refactor does not require a new source mode.

---

# 40. Source Semantic Integrity

Every source module must preserve the native meaning of source metrics.

Examples:

```text
Google Trends
relative_interest

Google Search Console
clicks
impressions
ctr
position

Keyword Planner
avg_monthly_searches
competition
competition_index
top-of-page bid fields

Semrush
third-party estimate fields
```

Do not make different metrics look interchangeable because column names seem similar.

Cross-source interpretation belongs to a separate analysis layer.

---

# 41. Missing-Value Rule

All source modules must preserve:

```text
missing != zero
```

A parser must distinguish:

- absent field,
- blank field,
- provider suppression marker,
- explicit zero,
- invalid value.

Provider-specific suppression semantics must be documented before normalization.

---

# 42. Source-Specific Storage Layout

StorageManager owns the root structure.

Each source receives a stable source namespace.

Example:

```text
<run_id>/
└── google-trends/
    ├── raw/
    ├── metadata/
    └── validation/
```

Future example:

```text
<run_id>/
└── google-search-console/
    ├── raw/
    ├── metadata/
    └── validation/
```

A source should not write directly into another source's namespace.

---

# 43. Source Artifact Naming

Naming should preserve meaningful source/job identity without encoding unstable assumptions.

Google Trends example:

```text
GT04_TR_24M_interest_over_time.csv
```

A future source should define its own canonical artifact naming pattern only after its job/data contract is clear.

Attempt collisions must not overwrite prior evidence.

Possible strategies:

```text
attempt suffix
```

or:

```text
attempt subdirectory
```

are both acceptable if history remains preserved.

---

# 44. Source Module Directory Structure

Conceptual production structure:

```text
src/main/sources/
└── <source-id>/
    ├── source definition
    ├── collector
    ├── parser
    ├── validator
    ├── errors
    ├── source-specific config
    ├── API or UI adapter
    └── selectors if browser-based
```

Example:

```text
src/main/sources/
└── google-trends/
    ├── googleTrendsSource.ts
    ├── googleTrendsCollector.ts
    ├── googleTrendsUiAdapter.ts
    ├── googleTrendsParser.ts
    ├── googleTrendsValidator.ts
    ├── googleTrendsErrors.ts
    └── selectors/
```

Exact filenames are not mandatory.

Responsibility separation is more important than naming.

---

# 45. Test Directory Structure per Source

Conceptual:

```text
tests/
├── fixtures/
│   └── <source-id>/
├── unit/
│   └── <source-id>/
├── integration/
│   └── <source-id>/
└── browser/
    └── <source-id>/
```

An API-only source may not require browser tests.

A browser source normally should.

---

# 46. Required Source Unit Tests

Every source should test deterministic logic such as:

- source config parsing,
- request/job payload generation,
- parser mapping,
- source-specific validation checks,
- error mapping,
- missing-value behavior,
- source mode handling.

The exact set depends on source semantics.

---

# 47. Required Source Fixture Tests

A source parser/validator should be exercised against controlled fixtures.

Required fixture categories where applicable:

```text
valid source artifact
malformed source artifact
unexpected schema
missing required field
invalid numeric value
provider error payload/page
low/no-data representation if source supports it
```

Prefer fixtures derived from sanitized real source behavior.

Do not fabricate an imaginary provider schema and then treat it as authoritative.

---

# 48. Required Integration Tests

A source should prove:

```text
job context
↓
source collection result
↓
candidate artifact
↓
storage
↓
validation
↓
artifact state
↓
job state
```

This can often be tested with mocked transport or fixtures before live testing.

---

# 49. Required Live/Provider Tests

Before a source is production-ready, test real provider behavior.

For browser sources:

- page access,
- authentication/manual-action behavior,
- setting application,
- download capture,
- provider error handling.

For API sources:

- authentication,
- representative request,
- pagination if applicable,
- rate-limit/provider error handling,
- real response parsing.

Live tests should be targeted and non-aggressive.

---

# 50. Live-Test Safety

No source module may test or implement:

- CAPTCHA bypass,
- 2FA bypass,
- anti-bot bypass,
- proxy rotation for evasion,
- rate-limit evasion,
- unauthorized session reuse.

A provider challenge should produce a controlled state.

---

# 51. Source Release Acceptance Checklist

A source module is not release-ready merely because one request worked.

Before enabling a source in production UI, verify:

- [ ] stable `source_id`
- [ ] display name
- [ ] capabilities defined
- [ ] readiness implemented
- [ ] job granularity defined
- [ ] source configuration contract defined
- [ ] collection path implemented
- [ ] candidate artifact/result preserved
- [ ] parser implemented
- [ ] source-specific validator implemented
- [ ] provenance fields defined
- [ ] requested vs observed state separated
- [ ] error mapping implemented
- [ ] manual-action behavior implemented if relevant
- [ ] retry behavior defined
- [ ] resume implications documented
- [ ] fixture tests exist
- [ ] integration tests pass
- [ ] live provider behavior verified
- [ ] sensitive data is not logged
- [ ] raw evidence is preserved
- [ ] export semantics are defined
- [ ] source documentation is updated
- [ ] `DECISIONS.md` updated if architecture changed
- [ ] `PROJECT_HANDOFF.md` updated with verified state

---

# 52. Source Module Development Sequence

Recommended sequence for a new source:

```text
1. Define source purpose
2. Define source_id
3. Define dataset types
4. Define job granularity
5. Define capabilities
6. Define readiness
7. Define config contract
8. Capture one real source response/export
9. Preserve raw evidence
10. Document source semantics
11. Create sanitized fixture
12. Implement parser
13. Implement validator
14. Implement collection adapter
15. Integrate with SourceRegistry
16. Integrate with Core pipeline
17. Add retry/error mapping
18. Add live test
19. Expand representative scenarios
20. Release gate
```

Do not start by building a large UI.

---

# 53. Vertical Slice Rule

The first implementation of a new source should be one complete vertical slice.

Preferred:

```text
one job
↓
real source
↓
raw evidence
↓
validation
↓
metadata
↓
accepted result
```

Avoid:

```text
all source screens
all datasets
all export types
all UI controls
```

before one reliable collection path works.

---

# 54. Browser Source Vertical Slice

For a browser source, first prove:

```text
source registered
↓
browser opens correct app profile
↓
one controlled provider workflow
↓
one real export/download
↓
raw artifact preserved
↓
validator accepts/rejects correctly
```

Then expand scope.

---

# 55. API Source Vertical Slice

For an API source, first prove:

```text
source registered
↓
authentication/readiness works
↓
one representative request
↓
raw response preserved
↓
parser maps correctly
↓
validator accepts/rejects
```

Then add pagination, additional dimensions, or batch processing.

---

# 56. Google Trends Reference Module

Google Trends is the first reference source.

Current MVP source identity:

```text
source_id    = google-trends
source_mode  = GOOGLE_TRENDS_UI
dataset_type = INTEREST_OVER_TIME
```

Fixed requested context:

```text
country_code   = TR
search_type    = WEB_SEARCH
selection_type = SEARCH_TERM
category       = All Categories
period         = exact 24 months
```

Job granularity:

```text
one GT comparison group = one job
```

Collection policy:

```text
single active job
```

---

# 57. Google Trends Reference Flow

```text
GoogleTrendsSource
↓
BrowserManager
↓
GoogleTrendsUiAdapter
↓
provider UI
↓
official CSV export
↓
StorageManager
↓
candidate artifact
↓
GoogleTrendsParser
↓
GoogleTrendsValidator
↓
ValidationCoordinator
↓
accepted / warning / rejected
```

The source module does not directly decide final run status.

---

# 58. Google Trends Source-Specific Responsibilities

The module owns:

- applying query group,
- applying Turkey,
- applying exact date range,
- applying All Categories,
- applying Web Search,
- ensuring Search Term,
- navigating to Interest Over Time,
- triggering supported CSV export,
- identifying source-specific errors,
- parsing real export structure,
- validating query/date/value semantics.

Core owns:

- run/job records,
- attempts,
- browser lifecycle,
- storage root,
- validation aggregation,
- final artifact state,
- logging infrastructure,
- export workbook,
- resume orchestration.

---

# 59. Google Trends Module Expansion Rule

Do not expand to all GT01–GT20 until:

- one real export is preserved,
- actual schema is documented,
- parser works,
- query identity mapping works,
- date behavior is understood,
- validator works,
- raw preservation is verified.

Then:

```text
one group
↓
a few representative groups
↓
GT01–GT20
```

---

# 60. Future Keyword Planner Module

A future Keyword Planner module should follow the same source-module lifecycle.

Preferred integration direction from the current project baseline:

```text
official Google Ads API
```

when suitable.

Potential dataset types may include:

```text
HISTORICAL_METRICS
KEYWORD_IDEAS
```

The future module must retain source-specific meanings such as:

```text
avg_monthly_searches
monthly_searches
competition
competition_index
top_of_page_bid_low
top_of_page_bid_high
```

These must not be merged with Google Trends `relative_interest`.

The exact module contract is deferred until that source enters scope.

---

# 61. Future Search Console Module

Preferred integration direction:

```text
official Search Analytics API
```

Potential dataset types may include:

```text
QUERIES
QUERY_PAGE
DATE_QUERY
```

Fields may include:

```text
clicks
impressions
ctr
position
```

Search Console values represent observed site visibility/performance.

They must not be labeled as national market search volume.

The exact module contract is deferred until implementation.

---

# 62. Future Semrush Module

Semrush should remain a distinct source module.

Its metrics must remain clearly labeled as:

```text
third-party estimates
```

Semrush numeric estimates must not replace or be averaged with first-party Google metrics merely because field concepts appear similar.

Exact transport/API/browser details are deferred.

---

# 63. Source Module Anti-Patterns

Avoid the following.

## Anti-pattern: Source Creates Its Own Core

Bad:

```text
google-trends/
├── database.ts
├── run-manager.ts
├── logger.ts
├── export-manager.ts
└── browser-manager.ts
```

Preferred:

Use shared Core services.

---

## Anti-pattern: Source Mutates Global Run State

Bad:

```text
GoogleTrendsSource sets run = COMPLETED
```

Preferred:

```text
source returns result
↓
Core evaluates job/run state
```

---

## Anti-pattern: Source Writes Arbitrary Paths

Bad:

```text
~/Downloads/trends-final-final.csv
```

Preferred:

Use StorageManager under run/source namespace.

---

## Anti-pattern: Source Accepts Its Own Artifact Without Validation

Bad:

```text
download succeeded
→ accepted
```

Preferred:

```text
candidate
→ validation
→ acceptance
```

---

## Anti-pattern: Source Hides Provider Failure

Bad:

```text
catch error
return empty dataset
```

Preferred:

return structured failure/error.

---

## Anti-pattern: Source Converts Missing to Zero

Never allowed.

---

## Anti-pattern: Source Produces Strategy

Bad:

```text
keyword_priority = HIGH
```

unless this is literally a provider-returned field with documented semantics.

Collector modules do not create business recommendations.

---

## Anti-pattern: Source Copies Requested State into Observed State

If source verification is unavailable:

```text
observed = null
```

not assumed.

---

## Anti-pattern: One Giant Source File

Avoid combining:

- transport,
- selectors,
- parsing,
- validation,
- errors,
- metadata

into one giant implementation when responsibilities can be separated clearly.

---

# 64. Source Schema Drift Policy

When a provider changes its schema:

```text
old parser fails
↓
artifact retained
↓
INVALID_SCHEMA
↓
developer inspects real artifact
↓
parser updated intentionally
↓
new fixture added
↓
regression test added
```

Do not silently guess a new provider schema.

---

# 65. Source UI Drift Policy

When a browser source changes its UI:

```text
required selector/state verification fails
↓
source returns controlled failure
↓
job remains unaccepted
↓
developer inspects current UI
↓
adapter/selectors updated
↓
browser regression test added
```

Do not fall back to arbitrary DOM positions that may apply wrong filters.

---

# 66. Source API Version Drift Policy

For API sources:

- use supported official APIs,
- detect documented breaking changes,
- preserve source/API version context where materially relevant,
- add migration/regression coverage before changing persisted semantics.

Exact version-handling design belongs to the source when implemented.

---

# 67. Logging Requirements

Source logs should include where available:

```text
timestamp
source_id
run_id
job_id
attempt_number
event
message
error_code
```

Source modules must not log:

- passwords,
- 2FA codes,
- full cookies,
- raw session tokens,
- access tokens,
- refresh tokens,
- OAuth secrets.

---

# 68. Source Event Naming

Prefer stable, descriptive events.

Examples:

```text
SOURCE_READINESS_STARTED
SOURCE_READY
SOURCE_COLLECTION_STARTED
SOURCE_ARTIFACT_PRODUCED
SOURCE_COLLECTION_FAILED
SOURCE_MANUAL_ACTION_REQUIRED
SOURCE_PARSE_STARTED
SOURCE_PARSE_FAILED
```

Do not create noisy low-level logs for every DOM operation unless useful for debugging.

---

# 69. Cancellation

A source module should honor Core cancellation where technically possible.

On cancellation:

- stop new source requests/actions,
- preserve already-written candidate/raw evidence,
- clean up owned temporary resources,
- do not mark incomplete data as accepted.

Cancellation is not a validation status.

---

# 70. Concurrency

Concurrency is a source capability/policy.

Google Trends MVP:

```text
max_concurrency = 1
```

Future API sources may support higher concurrency only if:

- provider limits allow it,
- retry semantics remain clear,
- storage remains safe,
- job isolation remains strong,
- implementation evidence justifies it.

Do not assume one global concurrency policy fits every source.

---

# 71. Source Module Documentation

A production source should document:

```text
Source ID
Source Name
Source Mode(s)
Dataset Types
Authentication Model
Job Granularity
Capabilities
Collection Path
Raw Artifact Format
Metadata Fields
Validation Rules
Error Mapping
Retry Behavior
Manual Action Behavior
Known Provider Constraints
Test Fixtures
Live-Test Procedure
```

These details may live in source-specific README/docs later.

---

# 72. Source Module Definition of Done

A source module is complete only when:

1. its purpose is in scope,
2. source identity is stable,
3. job contract is defined,
4. collection path works,
5. raw evidence is preserved,
6. parser is deterministic,
7. validation is implemented,
8. provenance is complete enough to audit,
9. error handling is explicit,
10. manual-action behavior is safe,
11. retry does not destroy history,
12. tests exist,
13. real provider behavior has been verified,
14. no source semantics are silently changed,
15. documentation is updated.

---

# 73. New Source Review Questions

Before approving a new module, ask:

- Is this source actually in current milestone scope?
- Does an official API exist and is it suitable?
- If not, is there a supported export path?
- Does browser automation require Playwright?
- What is one independently retryable job?
- What raw evidence can be preserved?
- What source-specific metadata is required?
- What makes a result `VALID`?
- What does the provider's no-data response look like?
- What failures require manual action?
- What values must remain source-specific?
- What must never be inferred?
- Can the core support this without source-specific branching?
- What fixtures can be captured from real behavior?
- What live tests prove the integration?

If these cannot be answered, the module design is not ready.

---

# 74. Architecture Compatibility Gate

A new source should integrate without requiring major changes to:

```text
RunManager
JobManager
StorageManager
ValidationCoordinator
MetadataManager
ExportManager
```

Small generic extensions may be appropriate.

But if the source requires substantial source-specific branching in Core:

> revisit the source-module contract before implementation continues.

---

# 75. When a Separate Process or App Is Justified

The default remains one application.

Separate runtime/process isolation should only be considered for strong reasons such as:

- incompatible runtime,
- security boundary,
- licensing constraint,
- deployment constraint,
- unstable third-party dependency,
- extreme resource usage.

A separate source application is not the default solution to integration difficulty.

Any such change requires an ADR.

---

# 76. M2 Source-Contract Gate

Before M2 is complete, Core should prove that a source module can:

- register,
- expose capabilities,
- expose readiness,
- receive a job context,
- produce a deterministic test artifact/result,
- pass through storage,
- pass through validation,
- produce job state,
- retry through a second attempt,
- survive resume reconstruction.

A fake/test source may be used to prove this before Google Trends.

---

# 77. M3 Google Trends Source Gate

M3 must include the minimum source-specific validation slice required to trust the first real artifact; the reusable validation framework is hardened in M4. Before expanding Google Trends broadly:

- source registered as `google-trends`,
- browser access goes through BrowserManager,
- one real GT job runs,
- one official CSV is captured,
- raw artifact preserved,
- source metadata produced,
- parser works against real schema,
- validator produces deterministic result,
- candidate/accepted states work,
- query-group context survives,
- retry does not overwrite evidence.

---

# 78. Future Source Onboarding Gate

Before beginning implementation of any post-Google-Trends source:

1. Google Trends Release 1.0 must be stable unless roadmap explicitly changes.
2. New source scope must be approved.
3. Source integration path must be researched.
4. Official API/export options must be evaluated.
5. A source job contract must be defined.
6. Data semantics must be documented.
7. A first vertical slice must be planned.
8. Required Core changes must be identified before coding.

---

# 79. Relationship to Other Documents

This guide must remain consistent with:

- `PROJECT_SPEC.md`
- `ARCHITECTURE.md`
- `DATA_CONTRACTS.md`
- `VALIDATION_SPEC.md`
- `TEST_STRATEGY.md`
- `DECISIONS.md`
- `PROJECT_HANDOFF.md`

Document roles:

```text
PROJECT_SPEC.md
→ what we are building

ARCHITECTURE.md
→ how the application is structured

DATA_CONTRACTS.md
→ canonical data vocabulary

VALIDATION_SPEC.md
→ how data acceptance is decided

TEST_STRATEGY.md
→ how correctness is proven

DECISIONS.md
→ why major choices were made

SOURCE_MODULE_GUIDE.md
→ how a source plugs into RoofRoom Core

PROJECT_HANDOFF.md
→ where the project is now
```

---

# 80. M0 Source-Module Acceptance Criteria

The source-module architecture is sufficiently defined for M0 when it is clear that:

- Google Trends is one module inside a reusable application,
- future browser and API sources can use the same Core lifecycle,
- Core vs source responsibilities are explicit,
- source capabilities are explicit,
- readiness is explicit,
- manual action is explicit,
- source artifacts are candidates before validation,
- source validation is isolated,
- source failures do not mutate global state directly,
- retries preserve attempt history,
- source metrics retain native semantics,
- source tests are required before release,
- adding a new source does not require rewriting the application.

---

# 81. Governing Source Module Rule

When implementing a new source, ask:

> **What is unique to this provider, and what is already a shared RoofRoom responsibility?**

Put only provider-specific behavior in the source module.

Reuse Core for everything else.

The architecture is healthy when a new source can be added by extending the system rather than rewriting it.
