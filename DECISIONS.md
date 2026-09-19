# RoofRoom Data Collector — Architecture Decision Log

**Document:** `DECISIONS.md`  
**Product:** RoofRoom Data Collector  
**Status:** Active architecture decision log  
**Last Updated:** 2026-08-18  
**Purpose:** Record important product, architecture, data-integrity, validation, testing, and implementation decisions so they are not repeatedly reopened without new evidence.

---

# 1. How to Use This Document

This file is an Architecture Decision Record (ADR) log.

Use it to answer:

> **What did we decide, why did we decide it, and what would justify changing it?**

This document should contain decisions with architectural or long-term implementation impact.

Do not use it for:

- current bugs,
- current milestone progress,
- temporary TODOs,
- latest Git commit,
- test pass/fail status,
- short-lived implementation notes.

Those belong in `PROJECT_HANDOFF.md`.

Stable product requirements belong in `PROJECT_SPEC.md`.

Detailed component design belongs in `ARCHITECTURE.md`.

Detailed schemas belong in `DATA_CONTRACTS.md`.

Validation behavior belongs in `VALIDATION_SPEC.md`.

Testing policy belongs in `TEST_STRATEGY.md`.

---

# 2. Decision Statuses

Use one of the following statuses:

```text
PROPOSED
ACCEPTED
DEFERRED
SUPERSEDED
REJECTED
```

## PROPOSED

A decision is under consideration but not yet locked.

## ACCEPTED

The decision is part of the current architecture baseline.

## DEFERRED

The decision is intentionally postponed until implementation evidence or current official documentation is available.

## SUPERSEDED

A later ADR explicitly replaces this decision.

## REJECTED

The option was considered and intentionally not selected.

---

# 3. Decision Change Rule

An accepted decision should not be changed casually.

A change should normally require one or more of:

- implementation evidence,
- test failure,
- source/platform behavior,
- security requirement,
- maintainability problem,
- compatibility constraint,
- strong simplification opportunity,
- updated official documentation.

When changing an accepted decision:

1. keep the old ADR,
2. mark it `SUPERSEDED`,
3. add the new ADR,
4. explain why the previous assumption no longer holds.

Do not rewrite history.

---

# ADR-001 — Build One Modular Application

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

RoofRoom Data Collector will be designed as:

> **One application with multiple independent data-source modules.**

Google Trends is the first source module, not a standalone application.

Future sources should normally plug into the shared core.

## Context

The product is expected to collect from multiple sources over time:

- Google Trends
- Google Ads Keyword Planner
- Google Search Console
- Semrush
- Merchant Center
- GA4
- Google Ads
- future sources

Creating a separate application for every source would duplicate state management, logging, validation, storage, export, and UI infrastructure.

## Consequences

Shared core responsibilities include:

- run management,
- job/state management,
- resume/retry,
- browser management,
- storage,
- metadata/provenance,
- validation coordination,
- logging,
- export,
- desktop UI integration.

Source-specific logic remains isolated in source modules.

## Revisit If

A future source has strong runtime, licensing, security, deployment, or resource-isolation requirements that justify a separate application/process.

---

# ADR-002 — Local-First Desktop Product

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

RoofRoom Data Collector will begin as a **local-first desktop application**.

## Context

The first use case involves:

- local browser automation,
- persistent user authentication state,
- local raw-file preservation,
- local SQLite state,
- user-controlled collection runs.

A hosted SaaS backend is not required for the Google Trends MVP.

## Consequences

The initial architecture avoids unnecessary:

- hosted backend,
- multi-tenant infrastructure,
- cloud database,
- server-side browser fleet,
- account system.

The design should still avoid choices that make later evolution unnecessarily difficult.

## Revisit If

Multi-user synchronization, remote execution, collaboration, centralized scheduling, or hosted collection becomes a real product requirement.

---

# ADR-003 — Collector and Analysis Layer Remain Separate

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

RoofRoom Data Collector will collect, preserve, validate, document, and export data.

It will **not** make marketing, SEO, advertising, merchandising, or commercial decisions.

## Context

The product's quality metric is trustworthy data collection, not recommendation generation.

Combining collection and strategy would blur data provenance and make it harder to distinguish source facts from derived business conclusions.

## Consequences

Collector outputs may contain:

- raw data,
- normalized data,
- provenance,
- validation findings,
- technical quality diagnostics.

Collector outputs must not include recommendations such as:

- increase budget,
- select a product for advertising,
- choose negative keywords,
- allocate spend by region.

## Revisit If

A separate analysis product/layer is explicitly designed later.

---

# ADR-004 — Google Trends Is the First MVP Source

**Status:** SUPERSEDED by ADR-050
**Date:** 2026-08-18

## Decision

Release 1.0 focuses only on the Google Trends source module.

## Context

The product architecture is broader than Google Trends, but implementation risk is lower if the shared core is proven with one real source first.

## Consequences

Do not add the following before the base Google Trends MVP is stable:

- Keyword Planner
- Search Console
- Semrush
- Merchant Center
- GA4
- Google Ads collection

## Revisit If

A blocking Google Trends platform change makes another source a better first proof of the architecture.

---

# ADR-005 — Narrow Google Trends MVP Scope

**Status:** SUPERSEDED by ADR-051
**Date:** 2026-08-18

## Decision

The initial Google Trends MVP uses:

```text
Geography      = Turkey
Category       = All Categories
Search Type    = Web Search
Selection      = Search Term
Dataset        = Interest Over Time
Primary Period = exact 24 months
```

Query groups:

```text
GT01–GT20
```

loaded from external configuration.

## Consequences

The following are postponed:

- Topic Audit
- Interest by Subregion
- Related Queries
- 36-month collection
- 5-year collection
- anchor stitching
- global cross-group normalization

## Revisit If

The base Interest Over Time workflow is stable and a later milestone explicitly expands scope.

---

# ADR-006 — Query Universe Is External Configuration

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

GT01–GT20 query groups must not be hard-coded into collector logic.

They will be loaded from external configuration.

Release 1.0 accepted input formats:

```text
YAML
JSON
CSV
```

YAML is the canonical human-authored format and the first implementation target. JSON and CSV are import adapters that normalize into the same internal `QueryConfig` contract.

## Context

Query lists are product configuration, not application behavior.

External configuration improves:

- reproducibility,
- editability,
- testing,
- source-module separation.

## Consequences

The config contract preserves:

- group ID,
- group name,
- query order,
- duplicate queries across different groups.

Duplicate group IDs are invalid.

## Revisit If

Implementation evidence shows another primary config format is materially safer or simpler.

---

# ADR-007 — Prefer Official API, Then Supported UI Export

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Integration priority:

1. supported official API when suitable,
2. supported first-party UI/export mechanism,
3. controlled Playwright browser automation,
4. manual user intervention when required.

## Context

Reliability and platform compatibility are more important than collection speed.

## Consequences

Avoid architecture dependent on undocumented/private endpoints when a supported route exists.

## Revisit If

An official API becomes suitable for a source currently collected through UI automation.

---

# ADR-008 — Playwright Is the Preferred Browser Automation Technology

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

When browser automation is required, use **Playwright** as the default automation technology.

## Context

The Google Trends MVP requires browser interaction and download handling.

The architecture also benefits from reusable browser/context management.

## Consequences

Playwright belongs behind shared browser infrastructure rather than directly inside React UI.

Exact browser channel and package version are not locked in M0.

## Revisit If

Current implementation testing reveals a material compatibility or maintenance problem.

---

# ADR-009 — Use an Application-Specific Persistent Browser Profile

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

RoofRoom will use an application-owned persistent browser profile.

It will not depend on the user's normal/default Chrome profile.

## Context

The app may need persistent provider login state.

Using a dedicated profile improves isolation and reproducibility.

## Consequences

Conceptual layout:

```text
<app-data>/
└── browser-profiles/
    └── google/
```

The exact Electron-supported macOS path is deferred to implementation.

## Revisit If

A future source requires separate source-specific profile isolation or an official API removes the browser requirement.

---

# ADR-010 — Never Store Passwords or Bypass Provider Security

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

The application must never:

- store account passwords,
- bypass CAPTCHA,
- bypass 2FA,
- bypass anti-bot systems,
- evade rate limits,
- use CAPTCHA solvers,
- use proxy rotation to evade protections,
- silently copy unauthorized cookies/sessions.

## Consequences

Provider-side security requirements become controlled states such as:

```text
MANUAL_ACTION_REQUIRED
```

The user completes authentication directly with the provider.

## Revisit If

Not applicable as an implementation optimization. This is a governing security rule.

---

# ADR-011 — Raw Source Files Are Evidence

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Original source files will be preserved and treated as immutable whenever practical.

## Context

Raw files are required for:

- auditability,
- parser debugging,
- future reprocessing,
- reproducibility,
- proving what the provider returned.

## Consequences

Never normalize or rewrite the raw file in place.

Use:

```text
raw artifact
↓
parser / normalizer
↓
separate normalized representation
```

Retry attempts must not silently overwrite previous raw evidence.

## Revisit If

A source contract makes raw-file retention impossible or creates a documented security/privacy requirement requiring restricted retention.

---

# ADR-012 — Missing Values Are Not Zero

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Missing or unavailable values must remain missing.

They must never be silently converted to numeric `0`.

## Consequences

Canonical handling:

```text
JSON   → null
SQLite → NULL
CSV    → blank normalized cell
XLSX   → empty cell
```

A real numeric zero remains zero.

## Revisit If

A specific source explicitly defines a missing marker that requires a different source-specific representation while preserving semantics.

---

# ADR-013 — Google Trends Values Remain Relative Interest

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Google Trends 0–100 values are stored as:

```text
relative_interest
```

They must never be converted into estimated absolute search counts.

## Context

Google Trends does not provide absolute search volume through these values.

## Consequences

Valid:

```text
relative_interest = 70
```

Invalid:

```text
estimated_searches = 7000
```

No derived search-volume field may be created from Trends values inside the collector.

---

# ADR-014 — Preserve Google Trends Comparison-Group Context

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Google Trends values must retain their comparison-group context.

Duplicate queries across different groups remain distinct records.

## Context

Different comparison groups may be normalized independently.

## Consequences

The effective context includes at least:

```text
query
query_group_id
```

Prefer also:

```text
job_id
```

Example:

```text
monstera + GT04
```

is not the same record as:

```text
monstera + GT05
```

The collector must not deduplicate by query alone.

---

# ADR-015 — Do Not Assume Cross-Group Global Comparability

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Google Trends values from separately normalized comparison groups must not automatically be ranked or merged as globally comparable.

## Consequences

No silent:

- anchor stitching,
- cross-group scaling,
- global normalization,
- query-level deduplication.

Any future stitching method must be explicitly designed, validated, and documented.

---

# ADR-016 — Search Term and Topic Remain Separate

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Google Trends Search Term and Topic datasets must remain distinguishable and must not be silently merged.

MVP:

```text
selection_type = SEARCH_TERM
```

## Consequences

Future Topic support requires distinct source/selection metadata and separate datasets.

---

# ADR-017 — UI and API Trends Modes Must Remain Distinct if Scaling Differs

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

If Google Trends UI and official API modes use materially different scaling or semantics, store them as distinct source modes.

Canonical conceptual values:

```text
GOOGLE_TRENDS_UI
GOOGLE_TRENDS_API
```

## Consequences

Never merge the numeric outputs as though they were generated by the same scaling contract.

---

# ADR-018 — One Google Trends Query Group Equals One Job

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

For the Google Trends MVP:

> **one query group = one independently tracked job**

## Context

This supports:

- progress tracking,
- failure isolation,
- retry,
- resume,
- provenance.

## Consequences

Example:

```text
GT01 completed
GT02 completed
GT03 failed
GT04 pending
```

A GT03 failure does not require recollecting GT01/GT02.

---

# ADR-019 — Collection Is Sequential by Default

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

The Google Trends MVP uses a single active collection job by default.

## Context

Sequential collection simplifies:

- browser state,
- download handling,
- debugging,
- retry,
- validation,
- reproducibility,
- conservative platform usage.

## Consequences

Performance is intentionally secondary to reliability.

Future sources may support controlled concurrency if justified.

---

# ADR-020 — Persist Run, Job, Attempt, and Artifact State

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Collection state must be persisted so interrupted runs can be reconstructed.

Core logical entities include:

```text
runs
jobs
attempts
artifacts
validations
errors
```

## Consequences

The application can determine:

- completed jobs,
- pending jobs,
- failed jobs,
- incomplete attempts,
- accepted artifacts,
- retry eligibility.

Previously accepted jobs must not be recollected unnecessarily during normal resume.

---

# ADR-021 — Use SQLite for Operational State

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

SQLite is the preferred local operational state store.

## Boundary

```text
SQLite
= operational state + searchable summaries

Filesystem
= raw evidence + detailed metadata + validation + exports
```

SQLite does not replace raw source files.

## Deferred

The exact Node/TypeScript SQLite library and SQL DDL are not yet selected.

---

# ADR-022 — Execution Status and Validation Status Are Separate

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Execution lifecycle and dataset quality must not be represented by one field.

Example:

```text
execution_status  = COMPLETED
validation_status = LOW_DATA
```

is valid.

## Consequences

This prevents ambiguous states such as treating a successfully downloaded but invalid dataset as a successful collection.

---

# ADR-023 — Validation Happens Before Canonical Acceptance

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

A downloaded artifact begins as a candidate.

It becomes canonical only after validation.

Conceptual flow:

```text
CANDIDATE
↓
VALIDATE
↓
ACCEPTED / ACCEPTED_WITH_WARNING / REJECTED
```

## Consequences

A browser download event alone never marks the data `VALID`.

---

# ADR-024 — Use Deterministic Validation Statuses

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Canonical MVP dataset validation statuses include:

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

Operational conditions remain outside `validation_status`:

```text
DOWNLOAD_FAILED         → error_code with execution_status = FAILED
MANUAL_ACTION_REQUIRED  → execution_status
```

## Consequences

Validation findings may be numerous, but the primary dataset-validation status must resolve deterministically. Execution/control-flow failures remain independently traceable.

All findings are still preserved.

---

# ADR-025 — Preserve Rejected Artifacts When Useful for Audit

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

A rejected artifact should normally remain traceable to:

- run,
- job,
- attempt,
- validation result.

## Context

A bad artifact can explain:

- provider error,
- schema change,
- stale download,
- login page,
- parser breakage.

## Consequences

Rejected data must not feed normal exports.

Sensitive provider/security pages may require restricted retention/redaction later.

---

# ADR-026 — Retry Is Job-Level and Attempt History Is Immutable

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Retries operate at job level.

Each retry creates a new attempt.

Previous attempts remain preserved.

## Consequences

If attempt 1 fails and attempt 2 succeeds:

```text
attempt 1 → historical evidence
attempt 2 → canonical accepted artifact
```

No retry may silently overwrite attempt history.

---

# ADR-027 — Resume Reconciles Interrupted Work Before Recollection

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

An interrupted `RUNNING` job is not automatically considered failed or successful.

On restart:

1. inspect persisted attempt,
2. inspect candidate artifact if present,
3. validate/reconcile where possible,
4. recollect only when necessary.

## Consequences

Already accepted jobs remain accepted and are not normally rerun.

---

# ADR-028 — Renderer Does Not Own Privileged Capabilities

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Electron renderer is presentation-only.

Privileged capabilities remain in main/core infrastructure.

Renderer must not directly own:

- SQLite,
- filesystem writes,
- Playwright,
- browser profiles,
- source API clients,
- arbitrary shell execution.

## Consequences

Renderer communicates through a narrow preload/IPC API.

Privileged objects are never sent across IPC.

---

# ADR-029 — Use Stable Machine IDs and Explicit Serialization Contracts

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Persisted contracts use stable machine identifiers.

Examples:

```text
source_id = google-trends
search_type = WEB_SEARCH
selection_type = SEARCH_TERM
```

Persisted field names use:

```text
snake_case
```

Persisted enum values use:

```text
UPPER_SNAKE_CASE
```

## Consequences

UI labels may be human-friendly, but machine identifiers remain authoritative.

---

# ADR-030 — Use ISO Dates and UTC Timestamps

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Date-only values use:

```text
YYYY-MM-DD
```

Persisted timestamps use ISO 8601 with explicit timezone, preferably UTC.

Example:

```text
2026-08-18T00:59:12.345Z
```

## Consequences

Never persist timezone-ambiguous timestamps.

Requested and actual source date ranges remain separate.

---

# ADR-031 — Run-Oriented Filesystem Layout

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Source artifacts are organized under immutable run context.

Conceptual structure:

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

## Consequences

Historical runs remain auditable and are not silently overwritten by later runs.

---

# ADR-032 — Export Only Accepted Data as Normal Data

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Normal normalized/export datasets may consume only:

```text
ACCEPTED
ACCEPTED_WITH_WARNING
```

artifacts.

They must not consume:

```text
CANDIDATE
REJECTED
SUPERSEDED
```

artifacts as canonical rows.

## Consequences

`NO_DATA` may contribute metadata/validation rows but must not generate fabricated numeric data.

---

# ADR-033 — Workbook Preserves Source Semantics and Provenance

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

The generated workbook is a downstream analysis-ready package, not a replacement for raw evidence.

Potential MVP sheets:

```text
README
RUN_METADATA
QUERY_UNIVERSE
GT_24M_RAW
VALIDATION_LOG
ERROR_LOG
```

## Consequences

Workbook generation must preserve:

- NULL semantics,
- comparison group,
- source mode,
- run/job provenance,
- validation status.

Raw files remain unchanged.

---

# ADR-034 — Test Core Logic Without Depending on Live Google

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Most core behavior must be testable deterministically without Google Trends availability.

## Consequences

Unit/integration tests should cover:

- state transitions,
- persistence,
- resume,
- retry,
- validation,
- storage,
- export.

A deterministic fake/test source may be used where useful.

Live Google Trends tests remain targeted integration/acceptance tests.

---

# ADR-035 — Use Sanitized Real Source Behavior for Google Trends Fixtures

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Google Trends parser/validator fixtures should be derived from sanitized real exports where possible.

## Context

Inventing an imaginary source schema creates false confidence.

## Consequences

The first real successful export should be inspected and converted into test fixtures before broad GT01–GT20 rollout.

---

# ADR-036 — Progressive Google Trends Rollout

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Google Trends implementation expands in stages:

```text
Phase A → one query group
Phase B → a few representative groups
Phase C → GT01–GT20
```

## Consequences

Do not automate all 20 groups before:

- real CSV schema is known,
- parser works,
- validator works,
- raw preservation works,
- retry/resume foundations work.

---

# ADR-037 — Development Uses Small Verified Checkpoints

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Development discipline:

> **Plan → Implement → Test → Verify → Git Commit → Document → Next Milestone**

## Consequences

Avoid writing large untested sections before running the application.

Important working states receive Git checkpoints and handoff updates.

---

# ADR-038 — Current Preferred Desktop Stack

**Status:** ACCEPTED AS DIRECTION  
**Date:** 2026-08-18

## Decision

Current preferred stack direction:

- TypeScript
- Electron
- React
- Vite
- Playwright
- SQLite
- YAML/JSON/CSV configuration adapters
- Git
- maintained CSV/XLSX libraries

## Important Qualification

This ADR accepts the **technology direction**, not package versions or every specific library.

## Revisit If

Current official documentation, compatibility testing, or Apple Silicon packaging reveals a material issue.

---

# ADR-039 — Do Not Lock Package Versions from Memory

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Runtime and package versions will be selected using current official documentation during implementation.

## Consequences

Do not encode remembered versions into M0 architecture documents.

This applies especially to:

- Node.js,
- Electron,
- Vite,
- Playwright,
- SQLite packages,
- XLSX packages,
- testing tools.

---

# ADR-040 — LOW_DATA Threshold Must Be Evidence-Based

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Do not hard-code an arbitrary Google Trends `LOW_DATA` threshold in M0.

## Context

Real source behavior has not yet been calibrated.

## Consequences

During M3/M4:

1. collect real exports,
2. measure signal density,
3. observe low/no-data behavior,
4. propose threshold,
5. test against fixtures,
6. record final decision in a new ADR or update through superseding ADR.

---

# ADR-041 — NO_DATA Must Represent a Verified Provider Outcome

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

`NO_DATA` must not be inferred merely from:

- zero-byte file,
- parser failure,
- malformed CSV,
- arbitrary all-zero data.

## Consequences

The actual Google Trends no-data representation must be discovered and documented before `NO_DATA` classification is considered reliable.

---

# ADR-042 — Unknown External Schema Fails Closed

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

When an external export schema changes unexpectedly, RoofRoom should fail visibly rather than guess.

## Consequences

Unknown schema:

```text
artifact retained
↓
INVALID_SCHEMA
↓
developer inspection
↓
intentional parser update
↓
new fixture/regression test
```

Never silently:

- map by guessed column position,
- invent missing columns,
- ignore semantic changes.

---

# ADR-043 — Google Trends Live Tests Do Not Assert Exact Numeric Values

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Live-source tests should validate:

- structure,
- context,
- parseability,
- source range,
- provenance,
- validation behavior.

They should not generally assert that a live query equals one exact numeric value.

## Context

Google Trends may exhibit sampling/source variability.

## Consequences

Exact numeric assertions belong to preserved fixtures, not unstable live data.

---

# ADR-044 — CI Is Not Required for M1

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

A hosted CI system is not required to begin M1.

## Consequences

The test architecture should still separate:

```text
typecheck
lint
unit
integration
build
```

so future CI can adopt them.

Live authenticated Google Trends tests should not automatically become unattended CI requirements.

---

# ADR-045 — M1 Verified Desktop Toolchain Baseline

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

The verified M1 desktop implementation baseline is:

```text
Project Node via nvm = 24
Verified dev Node    = 24.19.0
Electron             = 43.4.0
Electron Forge       = 7.11.2
Vite                 = 5.4.21
React                = 18.3.1
TypeScript           = 5.9.3
```

Electron Forge with the Vite plugin remains the current desktop build/package integration.

These versions are a verified project baseline, not permanent forever-pins.

## Context

M0 intentionally deferred exact runtime/tooling choices until current implementation evidence was available.

M1 verified development launch, production packaging, and packaged application launch on the target Apple Silicon Mac.

## Consequences

Toolchain upgrades must be deliberate and followed by lint, type-check, package/build, and runtime smoke verification.

## Resolves

```text
ADR-D001 — Exact Node.js Version
ADR-D002 — Exact Electron Version
ADR-D003 — Exact Vite / Electron Integration Setup
```

## Revisit If

A required dependency, security requirement, packaging defect, or demonstrated maintenance benefit justifies migration.

---

# ADR-046 — Use Electron userData With an App-Owned Subdirectory

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

Writable RoofRoom application state uses Electron's application-specific `userData` path with an additional:

```text
app-data/
```

subdirectory.

Verified macOS layout:

```text
~/Library/Application Support/RoofRoom Data Collector/app-data/
```

Current children include:

```text
config/
data/
data/runs/
database/
browser-profiles/
logs/
```

## Consequences

Source modules must not invent unrelated writable roots.

Tests should prefer temporary roots rather than real user application data.

## Revisit If

A future platform or deliberate user-selectable data-root feature requires a different path strategy.

---

# ADR-047 — Use Built-In node:sqlite Behind the Storage Boundary

**Status:** ACCEPTED  
**Date:** 2026-08-18

## Decision

The current SQLite implementation uses Electron's bundled Node:

```text
node:sqlite
```

behind the privileged main-process storage boundary.

No third-party SQLite native addon is required at the current baseline.

Verified M1 runtime:

```text
Electron = 43.4.0
Node     = 24.18.1
SQLite   = 3.53.1
```

## Context

A direct probe in the actual Electron runtime successfully opened SQLite, created a STRICT table, inserted data, read it back, and closed the database.

The packaged application also launched successfully with the SQLite bootstrap enabled.

## Consequences

Renderer code must not access `node:sqlite`.

`DatabaseSync` is acceptable for the current small operational-state workload, but SQLite remains encapsulated so the implementation can change if measured blocking or concurrency becomes material.

Schema changes use explicit migrations and `PRAGMA user_version`.

Unsupported future schema versions fail closed.

## Resolves

```text
ADR-D004 — Exact SQLite Package
```

The resolution is to use the runtime's built-in module rather than an external SQLite package.

## Revisit If

Electron compatibility changes, measured main-process blocking becomes unacceptable, concurrency requirements change materially, or packaging reliability regresses.

---

# ADR-048 — Use write-excel-file for the MVP Workbook

**Status:** ACCEPTED
**Date:** 2026-08-19

## Decision

The Release 1.0 structured XLSX package uses:

```text
write-excel-file 4.1.1
```

from the privileged main-process export boundary.

## Context

The implemented export gate verified:

- six named worksheets,
- numeric `0` preservation,
- missing numeric cells remaining empty,
- duplicate query preservation across comparison groups,
- Apple Silicon Electron packaging,
- no overwrite of an existing derived package.

The selected package has a small runtime dependency surface and passed the production dependency audit at the verified checkpoint.

## Consequences

Raw provider files remain authoritative evidence. XLSX remains a derived, provenance-preserving export and must not become a replacement for run-scoped raw artifacts.

## Resolves

```text
ADR-D005 — Exact XLSX Library
```

## Revisit If

Dataset size, formatting requirements, maintenance status, security findings, or Electron packaging behavior materially changes.

---

# ADR-049 — Exact No-Positive-Signal Evidence Is LOW_DATA

**Status:** ACCEPTED
**Date:** 2026-08-19

## Decision

A structurally valid Google Trends dataset with no positive relative-interest value across the complete accepted artifact is classified as:

```text
LOW_DATA
```

All-zero and all-missing evidence remain distinguishable in validation findings. Missing values remain `null`; they are not rewritten as zero.

This rule does not define an arbitrary non-zero density threshold.

## Context

The application needs a visible warning for accepted evidence that contains no positive signal without inventing provider semantics.

`NO_DATA` remains reserved for a separately verified explicit provider no-data outcome. Parser failure, HTML content, all-zero data, and all-missing data do not become fabricated `NO_DATA` results.

## Consequences

The exact no-positive-signal boundary is deterministic. Calibration for sparse but non-zero datasets remains deferred and evidence-based under ADR-040 and ADR-D014.

---

# ADR-050 — Release 1.0 Is the Verified Multi-Source Collector

**Status:** ACCEPTED
**Date:** 2026-09-09
**Supersedes:** ADR-004

## Decision

Release 1.0 includes the source families whose acquisition paths passed real feasibility checks: Google Trends, Google Search Console, Google Ads Search Terms, Google Ads Keyword Planner historical metrics with manual CSV fallback, İkas Products XLSX, Bitkimark public sitemap/XML, and on-demand SERP through SerpApi.

Feasibility PASS grants implementation permission; it does not mean an adapter is implemented. Semrush is not active Release 1.0 scope. Merchant Center, GA4, and other providers remain examples until they pass their own feasibility and scope gates.

## Context

ADR-004 correctly made Google Trends the first Core proof. That proof now exists, and real acquisition feasibility has been established for additional modes and sources.

## Consequences

Release documentation must report feasibility and implementation independently. The multi-source Release 1.0 gate is not complete merely because Google Trends passes.

---

# ADR-051 — Google Trends Remains the Reference Browser-Export Module

**Status:** ACCEPTED
**Date:** 2026-09-09
**Supersedes:** ADR-005 as the overall Release 1.0 boundary

## Decision

Google Trends remains the first implemented source and the reference `BROWSER_EXPORT` module. Its Interest Over Time semantics, comparison-group integrity, security rules, and evidence-based date behavior remain source-specific.

The currently supported period presets and exact runtime behavior are governed by the tested implementation. Historical fixed-24-month scope and later period expansion do not constrain unrelated source modules.

## Consequences

New sources reuse the Core lifecycle, not Google Trends selectors, query-group assumptions, CSV schema, or browser requirement.

---

# ADR-052 — New Sources Require Feasibility Proof Before Implementation

**Status:** ACCEPTED
**Date:** 2026-09-09

## Decision

Source onboarding follows:

```text
feasibility/acquisition proof
→ source contract
→ implementation permission
→ vertical slice
→ deterministic regression
→ limited live acceptance
```

## Consequences

Old documentation references do not create implementation scope. Unverified provider modes cannot be presented as complete. The former rule that every source must wait for all Google Trends work is superseded.

---

# ADR-053 — Automated Regression Never Calls Live Providers

**Status:** ACCEPTED
**Date:** 2026-09-09
**Extends:** ADR-034 and ADR-043

## Decision

Unit, integration, regression, release-gate, and CI tests use fixtures, mocks, fake sources, and controlled local dependencies. They never call live providers.

Live provider smoke tests are explicit, separately invoked, limited, quota-aware, and do not assert unstable exact business metrics.

## Consequences

SerpApi quota is never consumed automatically. Google Ads, GSC, Keyword Planner, and Google Trends are not called repeatedly during regression work.

---

# ADR-054 — Credentials Use a Dedicated Core Security Boundary

**Status:** ACCEPTED
**Date:** 2026-09-09

## Decision

OAuth tokens, API keys, developer tokens, client secrets, and equivalent credentials are mediated by a dedicated Core security boundary. They do not live in ordinary configuration, logs, exports, documentation, or renderer state.

This decision defines a responsibility, not a mandatory class name. The implementation must reconcile with the existing Electron main/preload/renderer boundary and use appropriate secure local storage.

## Consequences

Source modules declare access needs and receive controlled access. UI sees safe readiness/connection states only. Development-only ADC/gcloud state is not an undocumented production dependency.

---

# ADR-055 — Freshness Is Separate From Readiness and Execution

**Status:** ACCEPTED
**Date:** 2026-09-09

## Decision

Freshness/due state is a separate Core responsibility from credential readiness, job execution, and dataset validation.

## Consequences

A source may be due but not authenticated, ready but fresh, import-needed without an access failure, or on demand without being stale. SERP remains on demand rather than a continuous rank tracker.

The implemented contract derives last success from accepted completed Job history instead of duplicating it in a freshness cache. Policies are unknown, on demand, manual import, or an explicit bounded interval. A source without an approved cadence remains unknown. Freshness is informational and never schedules or starts collection.

---

# ADR-056 — All Acquisition Modes Share One Core Lifecycle

**Status:** ACCEPTED
**Date:** 2026-09-09

## Decision

`BROWSER_EXPORT`, `OFFICIAL_API`, `FILE_IMPORT`, `HTTP_XML`, and `THIRD_PARTY_API` use the same run/job/attempt, raw/candidate/accepted artifact, validation, provenance, logging, and export lifecycle.

Source identity, source mode, dataset identity, and acquisition mode remain distinct concepts. These architectural terms do not rename current persisted enums or fields automatically.

## Consequences

Core is generalized through tested compatible slices. Source-specific selectors, API resources, file layouts, and response semantics remain inside source modules.

---

# ADR-057 — One Collection Operation Is One Multi-Source Run

**Status:** ACCEPTED
**Date:** 2026-09-10

## Decision

One user collection operation is represented by one persisted Run containing independently source-keyed Jobs. Jobs in that Run may have different `source_id` values. Collection and validation dispatch both resolve from each Job's persisted source identity; validation uses a fail-closed source-keyed registry rather than one Run-wide validator.

Run membership records the real selected sources. Generic multi-source configuration snapshots describe those sources explicitly and do not copy the first Job's source or invent a synthetic provider identity. Existing Google Trends and generic single-source snapshots remain compatible.

## Context

The approved desktop journey treats one Start Collection action as one auditable collection operation and future data package. Schema v5 already persists selected-source arrays, per-Job source identity/context, composite Job identity, attempts, artifacts, and validation evidence, so no schema migration is needed for this contract.

## Consequences

A failed Job does not erase or recollect successful siblings. Explicit retry creates a new attempt only for an eligible failed Job. This is package-level coordination of source-native datasets, not a row-level join or cross-source analysis. Google Trends production UI/export/runtime composition remains source-specific until a separate approved application slice generalizes it.

---

# ADR-058 — Workspace Owns Runs and the Database Enforces the Active Slot

**Status:** ACCEPTED
**Date:** 2026-09-10

## Decision

Workspace is the first-class brand/business identity that owns Runs. Every Run has one required Workspace foreign key. SQLite schema v6 enforces at most one active Run per Workspace with a partial unique index over exactly `PENDING`, `RUNNING`, and `MANUAL_ACTION_REQUIRED`.

`RETRY_REQUIRED` is a non-terminal, inactive Run state. Explicit retry reacquires the Workspace slot, transitions the eligible Job, and creates the next Attempt atomically in one repository transaction. Restart discovery and reconciliation are explicitly Workspace-scoped.

## Context

Run ownership and concurrency must remain correct across repository instances, process restart, and retry races. An application-only precheck cannot provide that guarantee. Pre-Workspace records require deterministic migration compatibility without creating optional ownership or a permanent legacy product mode.

## Consequences

Schema-v6 migration creates one deterministic development Workspace and assigns pre-v6 Runs to it. That row is technical migration/runtime compatibility only, not a customer-facing default. New Run APIs require explicit ownership. Workspace UI/lifecycle management, Presets, Last Run Settings, credentials, provider changes, and new cancel/stop/resume workflows remain outside this decision's implementation slice.

---

# ADR-059 — Workspace-Owned Saved Presets and Atomic Last Run Settings Reservation

**Status:** ACCEPTED
**Documented from implemented contract:** 2026-09-19

## Decision

Saved collection presets and Last Run Settings belong to one Workspace. Presets retain reusable relative configuration; a reviewed Run persists the resolved immutable configuration. Reserving a Run and updating Last Run Settings is one atomic repository operation so a failed reservation cannot publish settings for a Run that does not exist.

## Consequences

Schema v7 stores presets and one system-managed Last Run Settings record per Workspace. Renderer drafts are temporary and sanitized; durable execution truth remains the reserved Run and its Jobs.

---

# ADR-060 — Workspace Connection Metadata, Credential Boundary, and Source-Keyed Readiness

**Status:** ACCEPTED
**Documented from implemented contract:** 2026-09-19

## Decision

Each Workspace may have one connection record per source. SQLite stores only an opaque credential reference and source-owned safe metadata. Secrets remain behind the Core credential-store boundary. Readiness is evaluated per Workspace and source and remains separate from freshness, execution, and validation.

## Consequences

Schema v8 adds `workspace_source_connections`. Desktop readiness reports the concrete action required—configuration, connection, file selection, or manual intervention—without exposing credential material to the renderer or exports.

---

# ADR-061 — İkas XLSX and Bitkimark Sitemap Use Bounded Shared-Core Source Slices

**Status:** ACCEPTED
**Documented from implemented contract:** 2026-09-19

## Decision

İkas Products enters Core through explicit `FILE_IMPORT` of a reviewed XLSX path. Bitkimark enters through explicit `HTTP_XML` requests restricted to the approved HTTPS host and reviewed sitemap URLs. Both preserve original bytes before source-specific parsing and validation.

## Consequences

The collector does not become a generic spreadsheet importer or website crawler. File type, workbook shape, response status/content type, final host, XML structure, and provenance fail closed under their source contracts.

---

# ADR-062 — Google API Credentials Use Electron safeStorage and Desktop PKCE OAuth

**Status:** ACCEPTED
**Documented from implemented contract:** 2026-09-19

## Decision

Google OAuth bundles are stored as OS-encrypted local credential files addressed by opaque references. Desktop authorization uses the approved PKCE composition; short-lived access tokens remain memory-only. Provider account/site identifiers may be stored only as safe Workspace connection metadata.

## Consequences

OAuth tokens, client secrets, Google Ads developer-token compatibility values, authorization headers, and equivalent secrets are excluded from SQLite, renderer state, logs, exports, tests, and documentation.

---

# ADR-063 — SerpApi Is a Workspace-Scoped On-Demand Snapshot Source

**Status:** ACCEPTED
**Documented from implemented contract:** 2026-09-19

## Decision

One reviewed SerpApi query is one source-keyed Job carrying explicit Google Turkey, Turkish-language, desktop, first-page request context. The exact JSON response is raw evidence; normalized output preserves organic and provider-returned PAA rows. The API key is resolved only through the Workspace credential boundary.

## Consequences

SerpApi is `ON_DEMAND`, not a periodic rank tracker. Quota, authentication, provider, network, and timeout failures are operational outcomes and are never retried automatically by the guarded live smoke.

---

# ADR-064 — Generalized Desktop Flow Delegates to Existing Core Contracts

**Status:** ACCEPTED
**Documented from implemented contract:** 2026-09-19

## Decision

The source-neutral desktop flow owns Workspace selection, sanitized drafts, readiness/freshness display, immutable Review → Start handoff, Run progress, explicit retry/resume/cancel actions, accepted-evidence access, and source-separated Data Package export. It delegates persistence, lifecycle transitions, validation, storage, and privileged filesystem operations to existing Core/main-process boundaries.

## Consequences

The renderer never receives credentials or unrestricted local paths. Source-specific request construction and parsing stay inside source modules; the generalized UI does not merge source semantics or invent analysis.

---

# ADR-065 — İkas Production Mapping Uses Exact Evidence-Backed Fields

**Status:** ACCEPTED
**Documented from implemented contract:** 2026-09-19

## Decision

The production İkas mapping uses the verified `Ikas Excel File` worksheet and exact identity, title, category, type, price, description, slug, stock/activity, and image headers. `Bitki Boyu (Saksı Dahil)` and `Saksı Tipi` are resolved by label across the three variant slots. Image URL is not storefront URL evidence.

## Consequences

Missing storefront URL, sale price, stock, or attributes remain `NULL`; they are never replaced with zero or inferred from unrelated fields. Availability is a deterministic derivative of preserved source-native activity/stock evidence.

---

# 4. Deferred Decisions

The following decisions are intentionally not locked in M0.

They should be resolved only after current official documentation and/or implementation testing.

---

# ADR-D001 — Exact Node.js Version

**Status:** SUPERSEDED  
**Resolution:** ADR-045

Resolve during project bootstrap.

Criteria:

- current supported/LTS status,
- Electron compatibility,
- toolchain compatibility,
- Apple Silicon support.

---

# ADR-D002 — Exact Electron Version

**Status:** SUPERSEDED  
**Resolution:** ADR-045

Resolve during M1 using official Electron documentation.

---

# ADR-D003 — Exact Vite / Electron Integration Setup

**Status:** SUPERSEDED  
**Resolution:** ADR-045

Do not lock a starter/template structure before validating current tooling.

---

# ADR-D004 — Exact SQLite Package

**Status:** SUPERSEDED  
**Resolution:** ADR-047

Selection criteria:

- active maintenance,
- Electron compatibility,
- Apple Silicon compatibility,
- packaging reliability,
- TypeScript ergonomics.

SQLite itself remains accepted.

---

# ADR-D005 — Exact XLSX Library

**Status:** SUPERSEDED
**Resolution:** ADR-048

The Release 1.0 choice is recorded with its verified constraints in ADR-048.

---

# ADR-D006 — Exact CSV Parsing Library

**Status:** DEFERRED

Choose after inspecting real Google Trends export encoding/schema.

---

# ADR-D007 — Exact Schema Validation Library

**Status:** DEFERRED

Choose during M1/M2 based on TypeScript integration and maintenance.

---

# ADR-D008 — Exact Logging Library

**Status:** DEFERRED

Logging contract is accepted; implementation library is not.

---

# ADR-D009 — Exact Test Runner and UI/E2E Tooling

**Status:** DEFERRED

Test strategy is accepted.

Exact tools for:

- unit tests,
- React tests,
- Electron E2E,
- coverage

will be selected during implementation.

---

# ADR-D010 — Exact Google Trends Browser Channel

**Status:** DEFERRED

Playwright is accepted.

Exact Chromium/Chrome channel should be tested on the target Mac.

---

# ADR-D011 — Exact Google Trends Selectors

**Status:** DEFERRED

Selectors must come from the current live UI.

Do not lock from memory.

---

# ADR-D012 — Exact Google Trends CSV Schema

**Status:** DEFERRED

Must be discovered from a preserved real export.

Includes:

- headers,
- encoding,
- delimiter,
- temporal granularity,
- query representation.

---

# ADR-D013 — Exact Google Trends No-Data Representation

**Status:** DEFERRED

Must be observed from real provider behavior.

---

# ADR-D014 — Exact LOW_DATA Threshold

**Status:** DEFERRED

Requires evidence-based M3/M4 calibration.

---

# ADR-D015 — Exact Date-Lag / Boundary Tolerance

**Status:** DEFERRED

Requested vs actual date range is accepted.

Any permissible source lag or period rounding must be derived from real export behavior.

---

# ADR-D016 — Exact Automatic Retry Count and Cooldown

**Status:** DEFERRED

Principles are accepted:

- conservative,
- per job,
- no aggressive loops,
- no security-challenge retry loops.

Exact values require live testing.

---

# ADR-D017 — File Hashing Policy

**Status:** DEFERRED

Raw immutability is accepted.

Whether SHA-256 hashing becomes mandatory in MVP or later will be decided during M2/M4.

---

# ADR-D018 — Exact Run ID Implementation Library

**Status:** DEFERRED

The contract requires stable, unique, filesystem-safe IDs.

Exact random/UUID/ULID implementation is not locked.

---

# ADR-D019 — Exact SQLite DDL and Migration Tool

**Status:** DEFERRED

Logical entities are accepted.

Exact tables, indexes, foreign-key actions, and migration mechanism are implementation decisions for M1/M2.

---

# ADR-D020 — Worker Threads / Child Processes

**Status:** DEFERRED

Do not introduce additional process complexity unless actual responsiveness/resource behavior requires it.

---

# 5. Explicitly Rejected Directions

These directions are currently rejected by the architecture baseline.

---

# ADR-R001 — Separate Standalone App Per Data Source

**Status:** REJECTED

Reason:

Would duplicate core infrastructure and fragment the product.

Preferred:

```text
one application
+
source modules
```

---

# ADR-R002 — Google Trends Values as Search Volume

**Status:** REJECTED

Reason:

Destroys source semantics.

---

# ADR-R003 — Missing Numeric Data Becomes Zero

**Status:** REJECTED

Reason:

Creates invented data and corrupts downstream analysis.

---

# ADR-R004 — Direct Google Trends Cross-Group Ranking

**Status:** REJECTED

Reason:

Independent normalization context makes this unsafe without an explicitly validated method.

---

# ADR-R005 — Collector Generates Marketing Strategy

**Status:** REJECTED

Reason:

Collection and analysis are intentionally separated.

---

# ADR-R006 — Depend on User's Normal Chrome Profile

**Status:** REJECTED

Reason:

Poor isolation, fragile automation, unnecessary coupling to personal browser state.

---

# ADR-R007 — Undocumented Private Endpoint as Default Architecture

**Status:** REJECTED

Reason:

Reliability and platform compliance are higher priorities.

---

# ADR-R008 — CAPTCHA / 2FA / Anti-Bot Bypass

**Status:** REJECTED

Reason:

Violates the project's security and compliance principles.

---

# ADR-R009 — Parallel Google Trends Collection by Default

**Status:** REJECTED FOR MVP

Reason:

Adds complexity and platform risk without meaningful MVP benefit.

Future source-specific concurrency may be considered separately.

---

# ADR-R010 — Accept Every Download Automatically

**Status:** REJECTED

Reason:

A downloaded file may be:

- HTML,
- stale data,
- wrong queries,
- wrong dates,
- malformed schema,
- login/error content.

Validation is mandatory.

---

# 6. Decision Index

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | One modular application | ACCEPTED |
| ADR-002 | Local-first desktop | ACCEPTED |
| ADR-003 | Collector / analysis separation | ACCEPTED |
| ADR-004 | Google Trends first MVP source | SUPERSEDED by ADR-050 |
| ADR-005 | Narrow GT MVP scope | SUPERSEDED by ADR-051 |
| ADR-006 | External query configuration | ACCEPTED |
| ADR-007 | Prefer official API / supported UI | ACCEPTED |
| ADR-008 | Playwright preferred | ACCEPTED |
| ADR-009 | App-specific browser profile | ACCEPTED |
| ADR-010 | No security bypass / password storage | ACCEPTED |
| ADR-011 | Raw source files are evidence | ACCEPTED |
| ADR-012 | Missing is not zero | ACCEPTED |
| ADR-013 | Trends remains relative interest | ACCEPTED |
| ADR-014 | Preserve comparison-group context | ACCEPTED |
| ADR-015 | No automatic cross-group comparability | ACCEPTED |
| ADR-016 | Search Term / Topic separate | ACCEPTED |
| ADR-017 | UI/API source modes distinct | ACCEPTED |
| ADR-018 | One GT group = one job | ACCEPTED |
| ADR-019 | Sequential GT collection | ACCEPTED |
| ADR-020 | Persist run/job/attempt/artifact state | ACCEPTED |
| ADR-021 | SQLite operational state | ACCEPTED |
| ADR-022 | Execution / validation status separate | ACCEPTED |
| ADR-023 | Validation before acceptance | ACCEPTED |
| ADR-024 | Deterministic validation statuses | ACCEPTED |
| ADR-025 | Preserve rejected artifacts | ACCEPTED |
| ADR-026 | Job-level retry + attempt history | ACCEPTED |
| ADR-027 | Resume reconciles interrupted work | ACCEPTED |
| ADR-028 | Renderer privilege boundary | ACCEPTED |
| ADR-029 | Stable machine IDs/contracts | ACCEPTED |
| ADR-030 | ISO dates / UTC timestamps | ACCEPTED |
| ADR-031 | Run-oriented filesystem | ACCEPTED |
| ADR-032 | Export accepted artifacts only | ACCEPTED |
| ADR-033 | Workbook preserves provenance | ACCEPTED |
| ADR-034 | Core tests independent of live Google | ACCEPTED |
| ADR-035 | Fixtures from sanitized real behavior | ACCEPTED |
| ADR-036 | Progressive GT rollout | ACCEPTED |
| ADR-037 | Small verified Git checkpoints | ACCEPTED |
| ADR-038 | Preferred TypeScript/Electron stack | ACCEPTED AS DIRECTION |
| ADR-039 | No package versions from memory | ACCEPTED |
| ADR-040 | Evidence-based LOW_DATA threshold | ACCEPTED |
| ADR-041 | Verified provider NO_DATA semantics | ACCEPTED |
| ADR-042 | Unknown schema fails closed | ACCEPTED |
| ADR-043 | No exact live GT numeric assertions | ACCEPTED |
| ADR-044 | CI not required for M1 | ACCEPTED |
| ADR-045 | Verified desktop toolchain baseline | ACCEPTED |
| ADR-046 | Electron userData application storage | ACCEPTED |
| ADR-047 | Built-in node:sqlite storage backend | ACCEPTED |
| ADR-048 | write-excel-file for MVP workbook | ACCEPTED |
| ADR-049 | Exact no-positive-signal evidence is LOW_DATA | ACCEPTED |
| ADR-050 | R1 is the verified multi-source collector | ACCEPTED |
| ADR-051 | GT remains the reference browser-export module | ACCEPTED |
| ADR-052 | New sources require feasibility proof | ACCEPTED |
| ADR-053 | Automated regression never calls live providers | ACCEPTED |
| ADR-054 | Credentials use a Core security boundary | ACCEPTED |
| ADR-055 | Freshness is separate from readiness/execution | ACCEPTED |
| ADR-056 | Acquisition modes share one Core lifecycle | ACCEPTED |
| ADR-057 | One collection operation is one multi-source Run | ACCEPTED |
| ADR-058 | Workspace owns Runs and database enforces active slot | ACCEPTED |
| ADR-059 | Workspace-owned Saved Presets and atomic Last Run Settings reservation | ACCEPTED |
| ADR-060 | Workspace-owned connection metadata with credential boundary and source-keyed readiness | ACCEPTED |
| ADR-061 | İkas XLSX and Bitkimark Sitemap enter shared Core as bounded source slices | ACCEPTED |
| ADR-062 | Google API credentials use Electron safeStorage plus desktop PKCE OAuth composition | ACCEPTED |
| ADR-063 | SerpApi uses one Workspace-scoped query Job with raw JSON plus organic/PAA normalization | ACCEPTED |
| ADR-064 | Generalized desktop flow delegates Workspace drafts, readiness, reservation, retry, and source-separated packages to existing Core contracts | ACCEPTED |
| ADR-065 | İkas production XLSX mapping uses exact identity/price headers and label-based variant attributes; storefront URL is unavailable without explicit evidence | ACCEPTED |

---

# 7. M0 Decision Gate

Before M0 is complete:

- all major architectural assumptions should be represented either as `ACCEPTED` or `DEFERRED`,
- no important implementation uncertainty should be disguised as an accepted fact,
- deferred decisions must have clear criteria for resolution,
- `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `DATA_CONTRACTS.md`, `VALIDATION_SPEC.md`, and `TEST_STRATEGY.md` must not materially contradict this log.

The remaining M0 documentation task after this file is:

```text
SOURCE_MODULE_GUIDE.md
```

followed by a final M0 consistency review.

---

# 8. Governing Decision Rule

When a future implementation choice conflicts with an accepted ADR:

> **Do not silently diverge.**

Either:

1. implement the accepted decision, or
2. create a new documented decision explaining why evidence justifies changing it.

RoofRoom Data Collector should evolve through explicit, testable architectural decisions rather than accidental drift.
