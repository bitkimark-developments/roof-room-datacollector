# RoofRoom Data Collector — Project Specification

**Document:** `PROJECT_SPEC.md`  
**Product:** RoofRoom Data Collector  
**Status:** M0 approved baseline  
**Purpose:** Define the relatively stable product scope, architecture, requirements, technical boundaries, data principles, and acceptance criteria for RoofRoom Data Collector.

---

## 1. Product Overview

RoofRoom Data Collector is a **local-first, modular desktop data collection application**.

Its purpose is to collect, preserve, validate, document, and export reliable raw data from external data sources for later analysis.

The application is not an analysis or decision-making engine.

Its core responsibility is:

> **Collect → Preserve → Validate → Document → Export**

Potential data sources include:

- Google Trends
- Google Ads Keyword Planner
- Google Search Console
- Semrush
- Google Merchant Center
- Google Analytics 4
- Google Ads
- Future data sources

The initial release focuses exclusively on **Google Trends**.

---

## 2. Product Goals

RoofRoom Data Collector should:

1. Reduce repetitive manual data-export work.
2. Preserve original source data whenever possible.
3. Make every collected dataset traceable to its source and collection run.
4. Detect incomplete, invalid, suspicious, or incorrect exports.
5. Allow interrupted collection runs to resume.
6. Allow failed jobs to be retried independently.
7. Standardize data collection without inventing unavailable values.
8. Export structured datasets suitable for later analysis.
9. Support multiple source modules inside one application.
10. Prioritize reliability and reproducibility over collection speed.

---

## 3. Non-Goals

RoofRoom Data Collector must not automatically produce commercial, marketing, SEO, merchandising, or advertising recommendations.

Examples of out-of-scope outputs:

- “Increase budget for this keyword.”
- “This plant is the best advertising product.”
- “Add this SKU to PMax.”
- “Use this query as a negative keyword.”
- “Allocate more budget to Istanbul.”
- “This product has the highest commercial potential.”

These belong to a separate future analysis layer.

The collector may calculate technical validation statistics required to assess dataset integrity, but those calculations must not be presented as business strategy.

---

# 4. Architecture Principle

The product must be designed as:

> **One application with multiple independent data-source modules.**

Google Trends is the first source module, not the application itself.

The architecture should separate:

- Shared application/core responsibilities
- Source-specific collection logic
- Validation
- Storage
- Metadata/provenance
- Export
- User interface

Future data sources should normally be added as modules rather than separate desktop applications.

A separate application should only be considered when strong technical, security, licensing, runtime, or deployment constraints require isolation.

---

# 5. High-Level Architecture

Conceptual architecture:

```text
RoofRoom Data Collector
│
├── Desktop UI
│
├── Application Core
│   ├── Run Manager
│   ├── Job Manager
│   ├── State / Resume Manager
│   ├── Browser Manager
│   ├── File / Storage Manager
│   ├── Metadata Manager
│   ├── Logging
│   └── Export Manager
│
├── Validation Engine
│
├── Source Modules
│   ├── Google Trends
│   ├── Google Keyword Planner       [future]
│   ├── Google Search Console        [future]
│   ├── Semrush                      [future]
│   ├── Merchant Center              [future]
│   └── Other sources                [future]
│
├── Local State
│   └── SQLite
│
└── Data Storage
    ├── Raw source files
    ├── Metadata
    ├── Validation results
    ├── Logs
    └── Structured exports
```

---

# 6. Shared Core Responsibilities

The application core should provide reusable infrastructure for all source modules.

## 6.1 Run Management

A **run** represents one user-initiated collection operation.

A run should have:

- `run_id`
- created timestamp
- started timestamp
- completed timestamp where applicable
- selected source(s)
- selected jobs/query groups
- requested configuration
- run status
- application version

Possible run states may include:

- `PENDING`
- `RUNNING`
- `PAUSED`
- `COMPLETED`
- `COMPLETED_WITH_WARNINGS`
- `FAILED`
- `CANCELLED`
- `MANUAL_ACTION_REQUIRED`

---

## 6.2 Job Management

Collection work should be split into independent jobs.

For the Google Trends MVP, one query group should normally correspond to one collection job.

Example:

```text
GT01 completed
GT02 completed
GT03 failed
GT04 pending
```

Completed jobs should not be rerun unnecessarily after an interruption.

Failed jobs must be independently retryable.

---

## 6.3 Resume Support

Application state must be persisted locally.

If the application closes unexpectedly, the next launch should be able to determine:

- which run was interrupted,
- which jobs completed successfully,
- which jobs failed,
- which jobs were pending,
- whether resume is possible.

Resume must preserve already accepted raw data rather than automatically recollecting it.

---

## 6.4 Browser Management

Browser automation should be centralized rather than implemented separately by every source module.

When browser automation is needed:

- Prefer Playwright.
- Use an application-specific persistent browser profile.
- Do not depend on the user's normal Chrome default profile.
- Do not store account passwords.
- Allow the user to perform authentication manually when required.

Browser security challenges must not be bypassed.

---

## 6.5 Validation

A successful download is not automatically a successful collection.

Every collected dataset must pass source-appropriate validation before being marked accepted.

Validation details are defined separately in `VALIDATION_SPEC.md`.

---

## 6.6 Logging

The application should maintain sufficient logs to understand:

- run lifecycle,
- job lifecycle,
- browser failures,
- download failures,
- parsing failures,
- validation failures,
- manual-action states,
- retries,
- unexpected exceptions.

Logs should support debugging without exposing sensitive credentials.

---

# 7. Preferred Technology Direction

Current preferred technology stack:

- **Language:** TypeScript
- **Desktop:** Electron
- **UI:** React
- **Build tooling:** Vite
- **Browser automation:** Playwright
- **Local state/database:** SQLite
- **Configuration:** YAML/JSON/CSV import adapters with one canonical internal QueryConfig
- **Version control:** Git
- **CSV processing:** appropriate maintained Node/TypeScript library
- **XLSX export:** appropriate maintained Node/TypeScript library

Package versions must not be fixed from memory.

When implementation starts, current official documentation should be checked before selecting runtime and package versions.

Primary development environment:

- MacBook Air M1
- macOS
- Visual Studio Code

Development instructions should prefer macOS-compatible commands.

---

# 8. API and Automation Policy

Use the following priority order when integrating a data source:

1. Supported official API, when suitable.
2. Supported first-party export mechanism through the official UI.
3. Controlled browser automation using Playwright.
4. Manual user intervention where platform restrictions require it.

Avoid architectures dependent on undocumented/private endpoints when a supported API or UI workflow exists.

The application must not:

- store user passwords,
- bypass CAPTCHA,
- bypass 2FA,
- bypass anti-bot systems,
- bypass rate limits,
- use CAPTCHA-solving services,
- use proxy rotation to evade platform restrictions,
- steal or silently copy browser sessions,
- rely on unauthorized private endpoints.

When user action is required, use a controlled state such as:

`MANUAL_ACTION_REQUIRED`

---

# 9. Data Integrity Principles

## 9.1 Never Invent Data

Unavailable values must remain unavailable.

Missing values must not silently become zero.

Use:

- `NULL`
- blank/empty field where the output format requires it

according to the relevant data contract.

---

## 9.2 Preserve Raw Data

Original source files should be treated as immutable whenever practical.

If normalization or transformation is required:

- preserve the raw source file,
- create a separate normalized or derived dataset,
- retain traceability between derived data and the raw source.

---

## 9.3 Source Separation

Metrics from different sources must retain their source semantics.

Examples:

```text
Google Trends
metric class = relative demand

Google Keyword Planner
metric class = approximate Google Ads search-volume data

Google Search Console
metric class = RoofRoom/Bitkimark observed Google visibility

Semrush
metric class = third-party estimate
```

Values from different sources must not be averaged or merged into one metric merely because they appear conceptually similar.

---

# 10. Google Trends MVP Scope

## 10.1 MVP Objective

The first release must reliably collect Google Trends **Interest Over Time** data for predefined query groups.

The initial target query universe consists of `GT01` through `GT20`.

The query universe must not be hard-coded into collector logic.

It must be loaded from external configuration.

Release 1.0 must accept external Google Trends query configuration through:

- YAML
- JSON
- CSV

YAML is the canonical human-authored format and the first implementation target. JSON and CSV are import adapters that must normalize into the same internal `QueryConfig` contract before Release 1.0. Collector logic must remain independent of the input file format.

---

## 10.2 Fixed Google Trends Settings

Default MVP settings:

| Setting | Value |
|---|---|
| Geography | Turkey |
| Category | All Categories |
| Search Type | Web Search |
| Selection | Search Term |
| Primary Period | Exact 24-month range |
| Dataset | Interest Over Time |

The requested date range should normally exclude the incomplete current day.

Example for a run on 2026-08-18:

```text
requested_start = 2024-08-18
requested_end   = 2026-08-17
```

The system must distinguish the requested date range from the actual range returned by the source.

---

## 10.3 Google Trends Query Groups

Each group must retain:

- group identifier, e.g. `GT04`
- group name
- ordered query list
- source configuration
- comparison-group context

A query appearing in multiple groups must remain associated with each comparison group in raw and normalized datasets.

Raw Trends values must not be deduplicated in a way that loses group context.

---

# 11. Google Trends Data Semantics

Google Trends values must be stored as **relative interest**, not absolute search volume.

Valid:

```text
relative_interest = 70
```

Invalid:

```text
estimated_searches = 7000
```

The collector must never convert Google Trends 0–100 values into estimated search counts.

---

## 11.1 Cross-Group Comparability

Different Google Trends comparison groups may be normalized independently.

Therefore values from separate comparison groups must not automatically be treated as globally comparable.

Example:

```text
GT04
Monstera = 100
Starliçe = 80

GT05
Ficus = 100
Monstera = 70
```

These values must retain their group context.

No global ranking may be implied directly from the raw values.

---

## 11.2 Search Term vs Topic

Search Term and Topic must remain separate source modes/datasets.

They must never be silently merged into one numeric series.

The Google Trends MVP uses:

`selection_type = SEARCH_TERM`

Topic support belongs to a later enhancement unless explicitly moved into scope.

---

## 11.3 UI vs API Modes

If Google Trends UI exports and Google Trends API produce differently scaled datasets, they must be treated as different source modes.

Example conceptual modes:

- `GOOGLE_TRENDS_UI`
- `GOOGLE_TRENDS_API`

Scaling differences must be represented in metadata rather than hidden.

---

# 12. Google Trends MVP Collection Workflow

Target workflow for each selected query group:

```text
Load config
↓
Create job
↓
Open Google Trends
↓
Apply query comparison group
↓
Apply Turkey geography
↓
Apply exact date range
↓
Apply All Categories
↓
Apply Web Search
↓
Ensure Search Term selection
↓
Wait for Interest Over Time dataset
↓
Use official CSV export where feasible
↓
Preserve downloaded source file
↓
Generate metadata
↓
Validate dataset
↓
Accept / warn / reject
↓
Persist job state
↓
Continue to next job
```

Collection should be sequential by default.

Aggressive parallel collection is not required for the MVP.

Reliability is more important than speed.

---

# 13. Google Trends Raw File Naming

Initial naming convention:

```text
GT01_TR_24M_interest_over_time.csv
GT02_TR_24M_interest_over_time.csv
...
GT20_TR_24M_interest_over_time.csv
```

Names may later include run-specific or timestamp context at the directory level rather than modifying source filenames unnecessarily.

The original downloaded bytes should be preserved.

---

# 14. Data Storage Model

A run-oriented structure is preferred.

Conceptual example:

```text
data/
└── runs/
    └── <run_id>/
        ├── run.json
        ├── google-trends/
        │   ├── raw/
        │   ├── metadata/
        │   └── validation/
        ├── exports/
        └── logs/
```

Example:

```text
data/runs/rr_20260818T005912345Z_a7f3c9/
```

Exact filesystem-safe run ID formatting will be defined in `DATA_CONTRACTS.md`.

---

# 15. Provenance Requirements

Every accepted or rejected dataset should retain enough metadata to support later auditing.

Relevant canonical fields include:

- `source_id`
- `source_mode`
- `query_group_id`
- `queries`
- `country_code`
- `language_code`
- `requested_date_start`
- `requested_date_end`
- `actual_date_start`
- `actual_date_end`
- `category_id`
- `category_name`
- `search_type`
- `selection_type`
- `retrieved_at`
- `run_id`
- `job_id`
- `application_version`
- `validation_status`
- `raw_artifact_id`

Human-readable source/country/category names may be stored as supplemental metadata where useful.

Where useful, a cryptographic file hash may be stored to help prove that raw files were not modified after collection.

---

# 16. Validation Requirements

Every Google Trends export must be validated before acceptance.

Relevant checks include:

- file exists,
- file is readable,
- content is expected data rather than HTML/login/error output,
- CSV parses successfully,
- expected queries are present,
- expected columns/dimensions are present,
- date data is present,
- requested vs actual date coverage is understood,
- numeric fields are parseable,
- values fall within expected source constraints,
- data is non-empty,
- all-zero datasets are detected,
- unexpected columns are detected,
- duplicate dates/rows are detected where applicable.

Canonical dataset validation statuses include:

- `NOT_RUN`
- `VALID`
- `LOW_DATA`
- `NO_DATA`
- `INVALID_SCHEMA`
- `ERROR_NOT_DATA`
- `DATE_MISMATCH`
- `QUERY_MISMATCH`

Operational conditions remain separate from dataset validation. For example, a failed download is represented through `execution_status = FAILED` plus `error_code = DOWNLOAD_FAILED`, while provider-side user intervention uses `execution_status = MANUAL_ACTION_REQUIRED`; in both cases validation remains `NOT_RUN` unless a real candidate dataset exists.

Detailed validation logic belongs in `VALIDATION_SPEC.md`.

---

# 17. Retry and Failure Handling

Failed jobs must not automatically invalidate unrelated successful jobs.

A user should be able to retry selected failed jobs.

Example:

```text
GT01 VALID
GT02 VALID
GT03 FAILED (error_code=DOWNLOAD_FAILED)
GT04 VALID
```

The application should allow retrying `GT03` without recollecting `GT01`, `GT02`, and `GT04`.

Unexpected failures must be logged.

---

# 18. Desktop UI Scope

The Google Trends MVP UI should remain intentionally simple.

Conceptual interface:

```text
ROOFROOM DATA COLLECTOR

Google Trends
Status: Ready

Period
● Last 24 Months
○ Custom

Query Groups
[x] GT01
[x] GT02
[x] GT03
...
[x] GT20

[ START COLLECTION ]
```

Progress view:

```text
GT01  Completed
GT02  Completed
GT03  Low Data
GT04  Running
GT05  Waiting
```

Useful controls may include:

- Start
- Cancel
- Retry Failed
- Resume Previous Run
- Open Data Folder

Pause support may be implemented if it does not complicate MVP reliability.

---

# 19. Export Requirements

The collector should preserve source-specific raw datasets first.

It may additionally generate a structured workbook for analysis.

Initial target workbook:

```text
ROOFROOM_SEARCH_DEMAND_RAW_<date>.xlsx
```

Potential MVP sheets:

- `README`
- `RUN_METADATA`
- `QUERY_UNIVERSE`
- `GT_24M_RAW`
- `VALIDATION_LOG`
- `ERROR_LOG`

Workbook generation must not modify or replace original raw source files.

Missing values must remain missing rather than being converted to zero.

---

# 20. Future Source Modules

The architecture must allow future modules such as:

## Google Ads Keyword Planner

Potential future datasets:

- historical metrics
- monthly searches
- competition
- competition index
- top-of-page bid ranges
- keyword discovery

Prefer the official Google Ads API where available and suitable.

---

## Google Search Console

Potential future datasets:

- queries
- query/page
- date/query

Prefer the official Search Analytics API.

Search Console data must represent observed site visibility, not total Turkey market search volume.

---

## Semrush

Semrush data is a third-party estimate and must retain source labeling.

It must not replace first-party Google metrics.

---

## Merchant Center / GA4 / Google Ads

These may be added as separate source modules after the core architecture and earlier source modules are stable.

---

# 21. Out of Scope for Google Trends MVP

The following are intentionally postponed until the base Interest Over Time collector is stable:

- Keyword Planner
- Search Console
- Semrush
- Merchant Center
- GA4
- Google Ads performance collection
- Topic Audit
- Interest by Subregion
- Related Top Queries
- Related Rising Queries
- 36-month secondary collection
- 5-year structural trend collection
- automatic anchor stitching
- global Trends normalization
- marketing analysis
- SEO strategy recommendations
- advertising recommendations

These items must not delay the first stable Google Trends MVP.

---

# 22. Development Workflow

Development discipline:

> **Plan → Implement → Test → Verify → Git Commit → Document → Next Milestone**

Prefer small working vertical slices.

For Google Trends:

1. Make one query group work reliably.
2. Verify the resulting raw file manually and programmatically.
3. Test a small number of groups.
4. Add resume/retry robustness.
5. Expand to GT01–GT20.
6. Run regression tests.

Do not implement large untested sections before running the application.

Before major code changes, inspect the existing repository and relevant files.

Do not rewrite working architecture without a clear reason.

---

# 23. Project Milestones

High-level roadmap:

## M0 — Product & Architecture Lock

Define:

- scope,
- architecture,
- data contracts,
- source module boundaries,
- validation philosophy,
- security principles,
- acceptance criteria.

## M1 — Application Skeleton

Deliver:

- Electron application launches,
- React UI renders,
- local application structure exists,
- config loading works,
- SQLite initializes,
- basic source registry exists.

## M2 — Core Collector Engine

Deliver:

- run management,
- job state,
- persistence,
- resume/retry foundation,
- logging,
- storage infrastructure,
- browser manager foundation.

## M3 — Google Trends MVP Collector

Deliver:

- Playwright Google Trends workflow,
- one reliable query group,
- official CSV download handling,
- the minimum vertical-slice validation required to trust a real artifact (file/content checks, parsing, query identity, temporal structure, numeric validity, candidate → accepted/rejected),
- expand progressively to GT01–GT20 only after the first slice is trustworthy.

## M4 — Validation Engine

Deliver:

- reusable generic validation framework,
- full deterministic validation-status mapping,
- validation persistence and reporting,
- rejection/warning handling,
- LOW_DATA and NO_DATA calibration from real source behavior,
- fixture/regression coverage for validation failures.

## M5 — Desktop UX

Deliver:

- source status,
- query selection,
- progress UI,
- retry/resume controls,
- usable local workflow.

## M6 — Data Package & Workbook

Deliver:

- structured export package,
- workbook generation,
- metadata sheets,
- validation/error reporting.

## M7 — Hardening & Release 1.0

Deliver:

- failure simulations,
- recovery testing,
- regression testing,
- fresh-install testing,
- release documentation,
- stable Google Trends MVP.

---

# 24. Google Trends MVP Acceptance Criteria

The Google Trends MVP is successful when:

- GT01–GT20 can be loaded from external configuration.
- Release 1.0 accepts YAML, JSON, and CSV query configuration inputs that normalize to the same internal contract.
- The app runs locally on the target macOS development environment.
- Turkey geography is applied.
- All Categories is applied.
- Web Search is applied.
- Search Term mode is used.
- An exact 24-month requested range can be applied.
- Interest Over Time is collected for selected groups.
- Google Trends CSV exports can be saved locally.
- Original raw files are preserved.
- Each dataset receives provenance metadata.
- Each dataset is validated.
- Corrupted/non-data downloads are detected.
- Missing or suspicious datasets are not silently accepted.
- Failed jobs can be retried independently.
- Interrupted runs can be resumed.
- Completed jobs are not unnecessarily recollected.
- Google account passwords are never stored by the app.
- CAPTCHA/2FA/anti-bot protections are not bypassed.
- Google Trends values remain relative-interest values.
- Cross-group comparability is not assumed automatically.
- Duplicate queries retain comparison-group context.
- Missing values are not silently converted to zero.
- A structured CSV/XLSX analysis package can be generated.

---

# 25. Locked Initial Decisions

Unless later evidence requires revision, the following decisions are considered the current architecture baseline:

1. Product name: **RoofRoom Data Collector**.
2. Product is local-first desktop software.
3. Product uses a modular multi-source architecture.
4. Google Trends is the first source module.
5. Initial Google Trends scope is Interest Over Time only.
6. Initial primary time window is exact 24 months.
7. Initial geography is Turkey.
8. Initial search type is Web Search.
9. Initial category is All Categories.
10. Initial selection type is Search Term.
11. Query groups are externally configurable.
12. Raw source files are preserved.
13. Missing values are not replaced with zero.
14. Google Trends 0–100 values are not converted to search volume.
15. Different Trends comparison groups are not assumed globally comparable.
16. Search Term and Topic datasets remain separate.
17. Playwright is the preferred browser automation technology.
18. Application-specific persistent browser profiles are preferred.
19. Official APIs or supported exports are preferred over undocumented endpoints.
20. CAPTCHA, 2FA, anti-bot, and rate-limit bypass techniques are prohibited.
21. SQLite is the preferred local state store.
22. TypeScript/Electron/React/Vite is the current desktop stack direction.
23. Development proceeds through small tested milestones.
24. The Google Trends MVP must be stable before adding later source modules.

---

# 26. Related Project Documents

This specification should be complemented by:

- `PROJECT_HANDOFF.md` — current project state and next action
- `ARCHITECTURE.md` — detailed component architecture
- `DATA_CONTRACTS.md` — schemas, identifiers, naming, null semantics
- `VALIDATION_SPEC.md` — detailed validation logic
- `TEST_STRATEGY.md` — verification and regression strategy
- `DECISIONS.md` — architecture decision log
- `SOURCE_MODULE_GUIDE.md` — contract for adding future source modules

`PROJECT_SPEC.md` should remain relatively stable.

Fast-changing project progress must be recorded in `PROJECT_HANDOFF.md`, not here.

---

# 27. Governing Product Principle

The primary quality metric of RoofRoom Data Collector is **not how much data it collects**.

The primary quality metric is how reliably the collected data can be:

- traced,
- validated,
- preserved,
- reproduced,
- audited,
- exported without losing source meaning.

When reliability conflicts with collection speed, prefer reliability.
