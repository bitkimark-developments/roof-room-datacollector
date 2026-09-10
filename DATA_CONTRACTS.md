# RoofRoom Data Collector — Data Contracts

**Status:** Canonical contracts reconciled with SQLite schema version 6 and current TypeScript interfaces
**Rule:** Conceptual multi-source additions do not silently rename implemented persisted values

---

## 1. Contract principles

1. Preserve source meaning.
2. Missing is not zero.
3. Raw evidence is immutable whenever practical.
4. Stable machine identifiers and human labels are different concerns.
5. Execution and validation are separate domains.
6. Requested and observed/provider-returned context remain distinguishable.
7. Source identity, dataset identity, source mode, and acquisition mode are separate.
8. Feasibility evidence does not imply an implemented persistence contract.

## 2. Naming and serialization

Persisted JSON and database fields use `snake_case`. TypeScript implementation properties may follow the established repository style where already public.

- Calendar dates use `YYYY-MM-DD`.
- Persisted timestamps use parseable UTC ISO 8601 values ending in `Z`.
- Provider-native calendar dates remain dates rather than being converted arbitrarily to instants.
- Configuration, metadata, validation, and exported contracts are versioned independently from the application version where a schema version exists.

## 3. Current implemented identity contracts

The current code accepts lowercase hyphenated source IDs. The implemented source is:

```text
source_id: google-trends
source_mode: GOOGLE_TRENDS_UI
dataset_type: INTEREST_OVER_TIME
```

The current query configuration requires `source_id = google-trends` and group IDs matching `GT[0-9]{2}`. These are current implementation facts, not a requirement that every future source use query groups.

Current run IDs use:

```text
rr_<UTC timestamp>_<6 lowercase hexadecimal characters>
```

Current Workspace IDs use:

```text
ws_<UTC timestamp>_<6 lowercase hexadecimal characters>
```

Exact future source IDs, dataset IDs, and source-mode strings must be introduced through source-contract implementation work. Architectural examples in this document are not persisted enums until code/schema/tests adopt them.

## 4. Current implemented status contracts

These values match `src/shared/run-job.ts` and SQLite schema version 6 and must not be renamed without an explicit migration.

### Run status

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

### Execution status

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

### Validation status

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

Operational causes such as authentication required, access denied, rate limited, quota exhausted, provider error, import failure, or unsupported source mode are not new validation statuses. They belong in readiness/control/error contracts and may map to existing execution outcomes until a separately designed persisted contract is implemented.

## 5. Current readiness and capability contracts

Current source readiness values are:

```text
READY
NOT_CONFIGURED
AUTHENTICATION_REQUIRED
MANUAL_ACTION_REQUIRED
UNAVAILABLE
ERROR
```

Current capabilities expose:

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

Future credential/access work may need richer safe states, but existing values are not renamed by this document.

## 6. Run, job, and attempt

```text
Workspace
└── Run
    └── Job
        ├── Attempt 1
        ├── Attempt 2
        └── Attempt N
```

### Workspace

A Workspace records `workspace_id`, a non-empty human `workspace_name`, and `created_at`. It is the first-class brand/business ownership boundary for Runs. The deterministic development Workspace created by migration is technical compatibility only and is not a user-facing default or legacy product type.

### Run

A run records one coordinated operation, required `workspace_id`, application version, ordered selected-source membership, timestamps, status, and an immutable requested/configuration snapshot. One Run belongs to exactly one Workspace and may contain Jobs from multiple source IDs.

The active Run set is exactly `PENDING`, `RUNNING`, and `MANUAL_ACTION_REQUIRED`; SQLite permits no more than one member of that set per Workspace. `RETRY_REQUIRED` is non-terminal and retry-eligible but does not occupy the active slot. Retry reacquisition, eligible Job transition, and next-Attempt creation are atomic. Incomplete-Run discovery and resume planning require Workspace scope.

Legacy Google Trends snapshots keep their query-group shape. Existing generic single-source snapshots remain readable as arbitrary JSON objects. A new generic multi-source snapshot represents actual membership through a `sources` array and must not use the first Job's source or a fabricated `multi-source` value as a singular Run-level source identity.

### Job

A job is the independent execution, resume, and retry unit. It records source identity, stable `job_key`, JSON-compatible source context, order, execution/validation states, attempt count, and accepted artifact reference. Its identity within a Run is `source_id + job_key`; the same `job_key` is valid under two different sources, while a duplicate pair remains invalid.

`query_group_id` is nullable and Google-Trends/legacy-specific. Non-Google-Trends jobs use `NULL`; they never fabricate a query group or sentinel. Google Trends jobs retain `job_key === query_group_id` and persist their real query-group context.

### Attempt

An attempt records one job execution, attempt number, execution state, candidate artifact, validation reference, operational error code, and timestamps. Retrying creates a new attempt; previous attempts are not overwritten.

## 7. Current artifact contracts

### Artifact kind

```text
RAW_SOURCE_FILE
METADATA_JSON
VALIDATION_JSON
NORMALIZED_CSV
EXPORT_XLSX
LOG_FILE
```

### Artifact state

```text
CANDIDATE
ACCEPTED
ACCEPTED_WITH_WARNING
REJECTED
SUPERSEDED
```

An artifact record includes `artifact_id`, run/job linkage, attempt number, source, kind/state, filename, relative path, media type, byte size, SHA-256 when available, and creation time.

Raw provider evidence begins as a candidate, remains preserved after validation failure when practical, and is never rewritten into its normalized representation.

## 8. SQLite boundary

Current database schema version: `6`.

Implemented tables:

```text
schema_migrations
workspaces
runs
jobs
attempts
artifacts
validations
```

There is no implemented `errors`, credentials, freshness, dataset-instance, or source catalog table. Documentation may define their semantics, but must not claim they exist.

Schema v5 introduced multi-source Runs through `selected_sources_json`, per-Job `source_id`, composite Job uniqueness, and source-scoped artifact relationships. Schema v6 preserves those snapshots and adds required Workspace ownership, `RETRY_REQUIRED`, and the partial unique active-Run index. Pre-v6 Runs migrate to the deterministic technical development Workspace; the compatibility row does not create a nullable or implicit ownership path for new Run APIs.

SQLite stores operational records and references; filesystem artifacts store raw bytes and detailed documents. Foreign keys, strict tables, schema migrations, and existing status checks remain authoritative.

## 9. Raw, candidate, accepted, and derived lifecycle

```text
provider/file bytes
→ RAW_SOURCE_FILE / CANDIDATE
→ parse
→ source validation
→ ACCEPTED | ACCEPTED_WITH_WARNING | REJECTED
→ separate metadata/validation/normalized/export artifacts
```

Validation failure does not justify deleting provider evidence. Only accepted or accepted-with-warning evidence may enter normal data exports.

## 10. Provenance baseline

Every accepted dataset must be traceable to:

```text
run_id
job_id
attempt identity or attempt_number
source_id
source_mode
dataset_type
raw_artifact_id
raw_relative_path
retrieved_at or imported_at
application_version
validation_status
requested context
observed context where proven
```

Collection and validation are both selected from the persisted Job's `source_id`. Source-specific validators fail closed when Job or artifact source identity does not match their registered source.

Where supported, raw artifacts carry byte size and SHA-256. Dataset schema version and application version are separate concepts.

Google Trends metadata remains backward compatible at metadata schema version 1 and includes query-group, country, category, search type, selection type, requested dates, actual dates, and raw artifact linkage. A non-query-group job emits source-neutral metadata schema version 2 with source, job, attempt, raw artifact, validation, and persisted source-context evidence rather than fake Google Trends fields.

## 11. Requested versus observed context

Do not copy requested values into observed fields merely because the provider response omitted evidence.

Examples that may need separate fields:

```text
requested_date_start / observed_date_start
requested_date_end / observed_date_end
requested_country / observed_country
requested_dimensions / returned_dimensions
requested_source_mode / observed_source_mode
requested_device / observed_device
```

An unavailable observed value remains `NULL`.

## 12. Missing-value and numeric rules

- JSON missing numeric evidence is `null` or an absent optional field according to the source schema.
- SQLite uses `NULL`.
- CSV/XLSX uses an empty field/cell.
- A numeric zero is preserved as zero only when returned by the provider.
- Blank stock, blank metrics, withheld values, and parse failures must not become zero.
- Provider-native units remain explicit: for example `cost_micros`, `ctr`, `position`, `avg_monthly_searches`, or `relative_interest`.
- Do not create generic `score`, `demand`, or `search_volume` fields that erase source semantics.

## 13. Conceptual multi-source identity

The following are Release 1.0 logical source families, not automatically implemented source IDs:

- Google Trends;
- Google Search Console;
- Google Ads Search Terms;
- Google Ads Keyword Planner;
- İkas Products;
- Bitkimark public site;
- SERP/SerpApi.

Keyword Planner API and manual CSV are acquisition/source modes for one logical dataset family, not necessarily two sources. Similarly, future Google Ads resources with materially different semantics must retain their source mode and must not be merged silently.

## 14. Acquisition-mode contract

The conceptual vocabulary is:

```text
BROWSER_EXPORT
OFFICIAL_API
FILE_IMPORT
HTTP_XML
THIRD_PARTY_API
```

An implementation must preserve acquisition mode in provenance. Adding these strings to documentation does not add them to a current persisted union.

## 15. Freshness contract

Schema v8 adds `workspace_source_connections`, one logical record per `(workspace_id, source_id)`. It contains only `credential_ref`, source-owned safe metadata, and timestamps; credential secrets are held by the secure backend boundary and never serialized into SQLite or run configuration.

Schema v7 adds `saved_collection_presets` (Workspace-owned durable reusable JSON objects) and `workspace_last_run_settings` (one system-managed JSON object per Workspace). Presets may retain relative source rules; each reserved Run Snapshot stores resolved absolute dates and reference date. Drafts are TypeScript-only and do not persist automatically. Last Run Settings records the last attempted configuration after successful Run reservation.

Freshness is a separate conceptual domain from readiness, execution, and validation.

It must eventually support facts such as:

```text
last successful acquisition/import time
refresh policy
next due time
fresh / due / stale
needs import
on demand
unknown
```

Exact enum names, tables, and IPC types remain an implementation decision. `ON_DEMAND`-like semantics are not an error; SERP is the primary Release 1.0 example.

## 16. Credential/access contract

Configuration may contain source enablement, refresh policy, property/account references safe to display, country/language/device, query groups, and import patterns.

Ordinary configuration, logs, raw exports, and documentation must not contain passwords, OAuth refresh tokens, client secrets, API keys, or developer tokens.

The renderer receives only safe readiness/connection state. The secure storage reference and secret value remain inside the Core security boundary.

## 17. Source-specific dataset semantics

The İkas Products import is `FILE_IMPORT`; the original XLSX is canonical evidence and normalized product fields remain nullable when absent. Bitkimark sitemap acquisition is `HTTP_XML`; canonical URL inventory and raw XML are preserved, with deterministic keyword annotations kept as derived data.

### Google Trends — Interest Over Time

Preserve query-group ID, query identity/order, geography, category, search type, selection type, requested/observed period, temporal bucket, and nullable relative-interest values. Duplicate queries in separate groups remain separate comparison contexts.

### Google Search Console

Supported conceptual datasets:

- query: `query`, `clicks`, `impressions`, `ctr`, `position`;
- query + page: the above plus `page`;
- date + query: the query metrics plus provider-native `date`.

Preserve property, search type, request dates, returned dimensions, pagination/row handling, and provider completeness/privacy limitations.

### Google Ads Search Terms

The verified mode is `search_term_view` for SEARCH campaigns. Preserve date/segment context, search term, campaign/ad-group identifiers and names where returned, and provider-native metrics. Do not claim Performance Max completeness without a separately verified mode.

### Keyword Planner historical metrics

Preserve keyword, average monthly searches, competition, competition index, monthly rows (`year`, `month`, nullable searches), and bid metrics when returned. API and manual CSV outputs may normalize to compatible tables while retaining distinct acquisition provenance.

### İkas Products

Preserve the original XLSX. Normalize only fields actually observed in the real file, including provider-native identifiers and variant/product values. Blank stock remains `NULL`. Exact worksheet/column mapping is locked from an evidence-based fixture during implementation.

### Bitkimark public site

Preserve requested URL, response/retrieval metadata, raw XML, sitemap kind, child/parent relationship, `loc`, and nullable `lastmod`. HTML/error content must not be parsed as valid XML data.

### SERP

Preserve query, country, language, device, retrieval time, provider, raw JSON/metadata, and returned organic position/title/URL/domain/snippet. Missing fields remain `NULL`. Analysis fields such as dominant intent, commercial fit, recommended page type, and action are prohibited in Collector output.

Quota/plan facts are operational metadata, not SERP business data.

## 18. Validation detail

Current structured findings contain:

```text
check_id
severity: INFO | WARNING | ERROR
passed
message
expected
actual
```

The summary stores validation status and check totals. Source-specific checks use stable namespaces. A new provider condition should usually become a structured finding or operational error code rather than expanding the global validation enum automatically.

## 19. Export semantics

Exports retain source, dataset, and provenance boundaries. Different metrics are not averaged or renamed into a shared commercial meaning. Missing values stay empty; true zeros stay numeric zero; rejected artifacts are excluded from normal data sheets.

User-visible Downloads copies, if introduced, are derived exports downstream of canonical run-scoped evidence and never become the authoritative raw artifact.

## 20. Contract-change gate

Any change to persisted IDs, statuses, SQLite columns/check constraints, artifact paths, TypeScript interfaces, or IPC data requires:

1. inspection of current code and stored data;
2. compatibility/migration design;
3. deterministic tests;
4. explicit implementation approval;
5. documentation of the actual adopted contract.

No documentation-only reconciliation performs such a migration.

## 21. Governing data rule

If the source did not provide or prove a value, the Collector must not invent it, infer it as fact, or replace it with zero.
