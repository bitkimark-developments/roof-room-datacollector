# RoofRoom Data Collector — Data Contracts

**Status:** Canonical contracts reconciled with schema v8 and current source/package contracts
**Scope:** Persisted IDs/states, null semantics, provenance, source-native meaning, and package evidence rules

---

## 1. Contract principles

1. Preserve source meaning.
2. Missing is not zero.
3. Raw evidence is immutable whenever practical.
4. Requested and observed context remain distinct.
5. Execution and validation are separate domains.
6. Source, dataset, source mode, and acquisition mode are separate.
7. Stable machine IDs and human labels are different concerns.
8. Documentation does not perform a migration.

---

## 2. Serialization

Persisted JSON/database fields use `snake_case`.

Dates:

```text
YYYY-MM-DD
```

Persisted timestamps:

```text
UTC ISO 8601 ending in Z
```

Provider-native calendar dates remain dates unless the provider contract proves otherwise.

---

## 3. Current source identities

Implemented source/module identities include:

| `source_id` | Acquisition | Main dataset(s) |
|---|---|---|
| `google-trends` | `BROWSER_EXPORT` | `INTEREST_OVER_TIME` |
| `google-search-console-query` | `OFFICIAL_API` | `QUERY` |
| `google-search-console-query-page` | `OFFICIAL_API` | `QUERY_PAGE` |
| `google-ads-search-terms` | `OFFICIAL_API` | `SEARCH_TERMS` |
| `google-ads-search-reporting` | `OFFICIAL_API` | six SEARCH reporting datasets |
| `google-keyword-planner` | `OFFICIAL_API` | `KEYWORD_HISTORICAL_METRICS` |
| `google-keyword-planner-csv` | `FILE_IMPORT` | `KEYWORD_HISTORICAL_METRICS` |
| `ikas-products` | `FILE_IMPORT` | `PRODUCTS` |
| `bitkimark-sitemap` | `HTTP_XML` | `SITEMAP_URLS` |
| `serpapi` | `THIRD_PARTY_API` | `GOOGLE_SERP` |

Google Trends query-group IDs match the live implementation contract and remain GT-specific.

Current Run IDs:

```text
rr_<UTC timestamp>_<6 lowercase hex>
```

Current Workspace IDs:

```text
ws_<UTC timestamp>_<6 lowercase hex>
```

---

## 4. Current persisted statuses

### Run

```text
PENDING
RUNNING
MANUAL_ACTION_REQUIRED
RETRY_REQUIRED
COMPLETED
COMPLETED_WITH_WARNINGS
FAILED
CANCELLED
```

### Execution

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

### Validation

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

Operational auth/config/quota/provider/import failures are not automatically validation statuses.

---

## 5. Readiness and freshness domains

Source readiness and desktop remediation are separate from freshness.

Safe readiness may represent states such as ready, configuration required, connection required, file required, manual action required, unavailable, or error according to the implemented boundary.

Freshness is source-neutral and conceptually includes:

```text
FRESH
DUE
STALE
IMPORT_NEEDED
ON_DEMAND
UNKNOWN
```

Do not collapse readiness, freshness, execution, and validation into one state.

---

## 6. Workspace / Run / Job / Attempt

```text
Workspace
└── Run
    └── Job
        ├── Attempt 1
        └── Attempt N
```

### Workspace

Stores first-class brand/business identity.

### Run

Requires `workspace_id`.

May contain Jobs from multiple sources.

One Workspace may have at most one active Run in the implemented active-status set.

### Job

Independent execution/resume/retry unit.

Identity within a Run:

```text
source_id + job_key
```

`query_group_id` is nullable and GT/legacy-specific.

Non-GT Jobs use no fake query group.

### Attempt

Immutable execution history.

Retry creates a new Attempt and preserves previous attempts/artifacts/validations/error evidence.

---

## 7. Artifact contract

Current kinds include:

```text
RAW_SOURCE_FILE
METADATA_JSON
VALIDATION_JSON
NORMALIZED_CSV
EXPORT_XLSX
LOG_FILE
```

Current states:

```text
CANDIDATE
ACCEPTED
ACCEPTED_WITH_WARNING
REJECTED
SUPERSEDED
```

Artifact provenance includes Run/Job/Attempt/source identity, path, media type, byte size, SHA-256 where available, and timestamps.

Raw evidence is never rewritten into normalized output.

---

## 8. SQLite boundary

Current schema version:

```text
8
```

Implemented tables:

```text
schema_migrations
workspaces
runs
jobs
attempts
artifacts
validations
saved_collection_presets
workspace_last_run_settings
workspace_source_connections
```

There is no general analytical warehouse.

Credential secrets remain outside SQLite.

Freshness is derived from accepted completed Job history.

---

## 9. Evidence lifecycle

```text
provider/file bytes
→ RAW_SOURCE_FILE / CANDIDATE
→ parse
→ source validation
→ ACCEPTED | ACCEPTED_WITH_WARNING | REJECTED
→ optional deterministic normalization
→ metadata / validation / package / export artifacts
```

Rejected raw evidence remains preserved when practical.

Only eligible accepted evidence enters normal packages/exports.

---

## 10. Provenance baseline

Accepted evidence must remain traceable to relevant:

```text
workspace_id
run_id
job_id
attempt
source_id
source_mode
dataset_type
acquisition mode
raw_artifact_id
raw_relative_path
byte_size / sha256 where available
retrieved_at / imported_at
validation_status
requested context
observed context where proven
application/schema version
```

Provider-specific provenance may add fields required by that source.

Do not force unrelated provider metadata into a generic record.

---

## 11. Requested versus observed

Examples:

```text
requested dates      / observed dates
requested dimensions / returned dimensions
requested country    / observed country
requested mode       / observed mode
requested device     / observed device
```

Requested values must not populate observed fields without provider evidence.

Unavailable observed values remain missing.

---

## 12. Missing and numeric semantics

Canonical missing representations:

```text
JSON   → null or absent optional field
SQLite → NULL
CSV    → blank
XLSX   → empty cell
```

True numeric zero remains zero only when actually returned or deterministically derived under an approved contract.

Do not turn parse failures, blanks, withheld values, absent stock, or unavailable provider metrics into zero.

Provider-native units remain explicit.

---

## 13. Source-native semantics

### Google Trends

`relative_interest` is provider-native 0–100 relative interest.

Comparison-group context remains part of identity/meaning.

Do not convert it to absolute search counts.

### Google Search Console

Keep `QUERY` and `QUERY_PAGE` contracts distinct.

Preserve clicks, impressions, CTR, position, dimensions, property/search-type/date context, raw response pages, and provider limitations.

### Google Ads SEARCH reporting

Approved SEARCH-only datasets:

```text
CAMPAIGN_PERFORMANCE
AD_GROUP_PERFORMANCE
KEYWORD_PERFORMANCE
SEARCH_TERMS
AD_PERFORMANCE
RSA_ASSET_PERFORMANCE
```

Preserve dataset/resource identity, provider-native units, date/segment context, and raw SearchStream evidence.

Current `google-ads-search-reporting` acquisition emits dataset schema v2. Historical schema v1 Job contexts remain readable for preserved evidence, but current provider reacquisition must not run under a v1 context.

For `CAMPAIGN_PERFORMANCE`, `AD_GROUP_PERFORMANCE`, and `KEYWORD_PERFORMANCE`, schema v2 additionally preserves provider-native:

- `conversions_from_interactions_rate`
- `cost_per_conversion`
- `conversions_value_per_cost`
- `search_top_impression_share`
- `search_absolute_top_impression_share`

`search_top_impression_share` and `search_absolute_top_impression_share` remain distinct from `top_impression_percentage` and `absolute_top_impression_percentage`.

`cost_per_conversion` preserves the provider field as a numeric value and is not renamed into the `_micros` canonical field family.

Legacy `google-ads-search-terms` remains compatible.

Performance Max is outside this contract.

### Google Ads configuration — Negatives v1

`google-ads-configuration` is an `OFFICIAL_API` current-configuration snapshot source.

Approved dataset schema v1 datasets are exactly:

- `CAMPAIGN_NEGATIVE_KEYWORDS`
- `AD_GROUP_NEGATIVE_KEYWORDS`
- `SHARED_NEGATIVE_KEYWORDS`
- `CAMPAIGN_NEGATIVE_KEYWORD_LISTS`
- `ACCOUNT_NEGATIVE_KEYWORD_LISTS`

The immutable Job context contains exactly source identity, dataset type, provider resource mode, customer ID, and `dataset_schema_version: 1`. This source is not date-windowed and does not support custom date ranges.

The adopted v1 boundary is keyword negatives only. Campaign-direct and ad-group-direct negatives preserve provider criterion identity and require SEARCH campaign scope, provider criterion type `KEYWORD`, and `negative: true`. Shared negative keyword members remain separate shared-criterion evidence. Campaign-list and account-list attachments remain separate provider attachment evidence.

Direct criteria, shared members, campaign-list attachments, and account-list attachments are independent evidence datasets. Do not reconstruct one dataset from another. In particular, an account attachment does not prove or reconstruct the members of its referenced shared set.

Raw Google Ads SearchStream response bytes remain authoritative. Provider identities and provider-native status/type values remain evidence; `REMOVED` is preserved. Optional unavailable provider fields normalize to `null`, never empty strings, zero, or synthetic values.

A structurally valid SearchStream response that normalizes to zero rows may validate as `NO_DATA`. Malformed envelopes or semantic normalization failures fail closed and must not be converted into `NO_DATA`. Missing remains distinct from zero.

This source reuses the existing canonical Google Ads Workspace connection and authenticated requester. It does not create a separate `google-ads-configuration` credential or connection record.

Negatives v1 is not part of an adopted package, preset, analysis, recommendation, or export recipe contract.

### Google Ads configuration — Conversion Configuration v1

`google-ads-configuration` also owns six provider-native Conversion Configuration schema-v1 snapshot datasets:

- `CONVERSION_ACTIONS` → `CONVERSION_ACTION`
- `CUSTOMER_CONVERSION_GOALS` → `CUSTOMER_CONVERSION_GOAL`
- `CONVERSION_GOAL_CAMPAIGN_CONFIGS` → `CONVERSION_GOAL_CAMPAIGN_CONFIG`
- `CAMPAIGN_CONVERSION_GOALS` → `CAMPAIGN_CONVERSION_GOAL`
- `CUSTOM_CONVERSION_GOALS` → `CUSTOM_CONVERSION_GOAL`
- `CUSTOMER_CONVERSION_TRACKING_SETTINGS` → `CUSTOMER`

Together with the five Negatives v1 datasets, the current `google-ads-configuration` family contains exactly eleven independent dataset types.

Conversion Configuration v1 is a current-configuration snapshot contract. It has no requested date window and keeps `supports_custom_date_range: false`.

Raw Google Ads SearchStream response bytes remain authoritative. Normalized rows preserve provider resource identity, lifecycle/status values, real `false` and zero values, and nullable optional evidence without fabricating replacements.

`CONVERSION_ACTIONS` preserves provider-native action identity, status/type/category/origin, ownership, counting and goal flags, lookback settings, attribution settings, default value/currency settings, and Google Analytics 4 linkage where returned. `include_in_conversions_metric` is preserved only as legacy provider evidence; RoofRoom does not reinterpret it as a current effective-goal decision.

`CUSTOM_CONVERSION_GOALS.conversion_action_resource_names` preserves provider-returned membership exactly. A provider-returned empty array remains `[]`; missing or unproven membership must not be normalized into an empty array.

Requested `customer_id` is immutable request context and must not be copied into observed ownership or conversion-customer fields without provider evidence.

RoofRoom does not derive an effective campaign conversion-goal model from these datasets. It does not infer goal precedence, bidding behavior, or optimization intent.

Conversion Configuration v1 is not part of an adopted package, preset, analysis, recommendation, or export recipe contract.

The family reuses the existing canonical Google Ads Workspace connection and authenticated requester. It does not add a configuration-specific credential, connection type, or Developer Token requirement.

### Keyword Planner

Preserve provider-native monthly history.

For API evidence, `change_3_month` and `change_yoy` may be deterministic RoofRoom-derived fields under the locked month-comparison rules.

They remain null if required evidence is missing or baseline is zero.

Do not widen provider requests merely to manufacture YoY.

For manual CSV, provider-exported change fields remain source-native imported evidence.

### İkas

Preserve original XLSX and exact evidence-backed field mapping.

Blank sale price/stock remain missing.

Do not create storefront URLs when unavailable.

### Bitkimark

Preserve request/response metadata, raw XML, sitemap relationships, `loc`, nullable `lastmod`.

### SERP

Preserve request context, raw JSON/provider metadata, organic result evidence, and provider-returned features.

Do not add analysis/recommendation fields.

---

## 14. Workspace configuration contracts

Saved Collection Presets and Last Run Settings are Workspace-owned reusable configuration.

A reviewed Run persists its own immutable resolved snapshot.

Run reservation and Last Run Settings update are atomic under the implemented contract.

Workspace source connections store only safe metadata and opaque credential references.

Secret material remains behind the credential-store boundary.

---

## 15. Package contracts

### Production Data Package

Indexes accepted source datasets separately and preserves exact Run/Job/source/artifact/checksum/request provenance.

No cross-source row join is implied.

### `ADS_OPTIMIZATION_PACK v2`

Active recipe version is 2 and requires exactly the six approved Google Ads SEARCH reporting datasets at dataset schema v2.

Historical recipe/schema v1 packages remain readable. They are not compatible CURRENT evidence or PREVIOUS baselines for the active v2 recipe.

Task Package manifest format remains `manifest_version: 1`. Supported recipe/schema pairs are exactly `1/1` and `2/2`; mixed pairs fail closed.

Current window semantics are code-defined and exact.

Evidence reuse is permitted only when compatibility is proven.

A broader populated DAILY artifact may be filtered only using real date rows.

A broader `NO_DATA` result cannot prove a narrower window.

PREVIOUS comes from a verified immutable prior package, never from reconstruction.

No interpolation, subtraction, averaging, allocation, or historical configuration backfill may manufacture evidence.

Package manifests/tables/workbooks are derived outputs; raw artifacts remain canonical.

### `BLOG_WRITING_PACK v1`

Fixed logical families:

```text
INTEREST_OVER_TIME
QUERY_PAGE
SEARCH_TERMS
KEYWORD_HISTORICAL_METRICS
PRODUCTS
SITEMAP_URLS
GOOGLE_SERP
```

Out-of-recipe evidence is excluded before loading.

Zero accepted in-recipe datasets is `NOT_READY`.

Otherwise coverage is truthful per family; overall package is complete only when every expected family is covered.

Verified `NO_DATA` may satisfy coverage without fabricated rows.

Keyword Planner API/manual provenance remains distinct.

Blog packaging is local-only and creates no provider call, retry, Attempt, Run/Job transition, or schema migration.

---

## 16. Validation findings

Structured findings include:

```text
check_id
severity
passed
message
expected
actual
```

Severity:

```text
INFO
WARNING
ERROR
```

Prefer source-specific findings/operational codes over unnecessary global validation-status expansion.

---

## 17. Contract-change gate

Any change to persisted IDs, statuses, SQLite schema/constraints, artifact paths, TypeScript interfaces, IPC contracts, or serialization meaning requires:

```text
inspect live implementation and compatibility
→ add deterministic failing coverage
→ design migration/compatibility if needed
→ implement explicitly
→ verify affected boundaries
→ document the adopted contract
```

Documentation alone never performs a migration.

---

## 18. Governing data rule

> **If provider evidence does not prove a value, RoofRoom must not invent it, infer it as source fact, copy it from the request into observation, or replace it with zero.**
