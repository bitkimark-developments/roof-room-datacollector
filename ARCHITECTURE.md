# RoofRoom Data Collector — Architecture

**Document:** `ARCHITECTURE.md`  
**Product:** RoofRoom Data Collector  
**Status:** M0 approved baseline  
**Scope:** Internal architecture for the local-first, modular desktop application, with Google Trends as the first source module.

---

# 1. Purpose

This document defines how RoofRoom Data Collector should be structured internally.

It focuses on:

- application boundaries,
- component responsibilities,
- dependency direction,
- run/job orchestration,
- source-module integration,
- browser automation ownership,
- local persistence,
- raw-data storage,
- validation flow,
- export flow,
- failure boundaries,
- future extensibility.

This document intentionally avoids locking low-level implementation details that should be verified during M1/M2.

Detailed field schemas and naming conventions belong in `DATA_CONTRACTS.md`.

Detailed validation rules belong in `VALIDATION_SPEC.md`.

Current implementation progress belongs in `PROJECT_HANDOFF.md`.

---

# 2. Governing Architecture Principle

RoofRoom Data Collector must be designed as:

> **One application with multiple independent data-source modules.**

Google Trends is only the first source module.

The application must not evolve into a set of unrelated source-specific scripts.

Shared concerns should be implemented once in the application core and reused by all source modules.

Examples of shared concerns:

- run management,
- job state,
- resume/retry,
- browser lifecycle,
- persistent state,
- storage,
- metadata/provenance,
- validation coordination,
- logging,
- export,
- desktop UI integration.

Source-specific concerns should remain isolated inside source modules.

Examples:

- Google Trends page interaction,
- Google Ads API calls,
- Search Console API requests,
- Semrush-specific response parsing.

---

# 3. Architectural Goals

The architecture should optimize for the following qualities, in order:

1. **Data integrity**
2. **Traceability**
3. **Failure visibility**
4. **Recoverability**
5. **Source isolation**
6. **Maintainability**
7. **Extensibility**
8. **Operational simplicity**
9. **Performance**

Collection speed is intentionally lower priority than correctness and reproducibility.

---

# 4. High-Level System View

```text
┌───────────────────────────────────────────────┐
│              RoofRoom Data Collector          │
│                                               │
│  ┌─────────────────────────────────────────┐  │
│  │              Desktop UI                 │  │
│  │ React renderer                          │  │
│  │                                         │  │
│  │ - source selection                      │  │
│  │ - run configuration                     │  │
│  │ - progress                              │  │
│  │ - retry/resume                          │  │
│  │ - manual-action prompts                 │  │
│  └──────────────────┬──────────────────────┘  │
│                     │ IPC                     │
│  ┌──────────────────▼──────────────────────┐  │
│  │           Application Core              │  │
│  │ Electron main process                   │  │
│  │                                         │  │
│  │ - Run Manager                           │  │
│  │ - Job Manager                           │  │
│  │ - Source Registry                       │  │
│  │ - Collection Orchestrator               │  │
│  │ - Browser Manager                       │  │
│  │ - Storage Manager                       │  │
│  │ - Metadata Manager                      │  │
│  │ - Validation Coordinator                │  │
│  │ - Export Manager                        │  │
│  │ - Logger                                │  │
│  └──────────────┬───────────────┬──────────┘  │
│                 │               │             │
│         ┌───────▼───────┐ ┌────▼─────────┐   │
│         │ Source Modules │ │ Local State  │   │
│         │               │ │ SQLite       │   │
│         │ Google Trends │ └──────────────┘   │
│         │ future sources│                     │
│         └───────┬───────┘                     │
│                 │                             │
│        ┌────────▼────────┐                    │
│        │ External Source │                    │
│        │ UI / API        │                    │
│        └─────────────────┘                    │
│                                               │
│        ┌─────────────────────────────┐        │
│        │ Local Data Files            │        │
│        │ raw / metadata / validation │        │
│        │ logs / exports              │        │
│        └─────────────────────────────┘        │
└───────────────────────────────────────────────┘
```

---

# 5. Electron Process Boundaries

RoofRoom Data Collector should follow a clear separation between the Electron main process and the renderer process.

## 5.1 Renderer Process

The renderer is the presentation layer.

Primary responsibilities:

- display available source modules,
- display source readiness/status,
- allow the user to select query groups,
- accept supported run configuration,
- start a run through a controlled IPC request,
- display live job/run progress,
- display warnings and validation results,
- offer retry/resume actions,
- display `MANUAL_ACTION_REQUIRED`,
- open relevant local folders through approved application actions.

The renderer should **not**:

- directly access SQLite,
- directly write raw source files,
- directly launch Playwright,
- directly manage browser profiles,
- directly call source APIs,
- contain source-specific collection logic,
- contain business-critical validation logic,
- execute arbitrary filesystem operations.

The UI should request actions from the application core.

---

## 5.2 Main Process

The Electron main process owns trusted application capabilities.

Primary responsibilities:

- application lifecycle,
- run orchestration,
- job orchestration,
- SQLite access,
- filesystem access,
- BrowserManager,
- source module execution,
- validation coordination,
- logging,
- export generation,
- secure IPC handling.

Long-running collection work should not block renderer responsiveness.

Implementation details may later use workers or child processes if needed, but this is not an M0 requirement.

The first implementation should remain as simple as possible while preserving clean boundaries.

---

## 5.3 Preload / IPC Boundary

Renderer-to-core communication should use a narrow, explicit API exposed through Electron's preload/context bridge mechanism.

Conceptual commands:

```text
getApplicationStatus()
listSources()
loadQueryGroups()
createRun()
startRun()
cancelRun()
resumeRun()
retryJobs()
getRun()
getRunJobs()
openRunFolder()
```

Conceptual events:

```text
run:updated
job:updated
validation:completed
manual-action:required
log:event
```

The final IPC contract belongs in implementation and `DATA_CONTRACTS.md`.

The architecture should avoid exposing generic filesystem, database, shell, or browser-control primitives to the renderer.

---

# 6. Core Component Model

The application core should be composed of focused services.

```text
Application Core
│
├── AppController
├── RunManager
├── JobManager
├── CollectionOrchestrator
├── SourceRegistry
├── BrowserManager
├── StateRepository
├── StorageManager
├── MetadataManager
├── ValidationCoordinator
├── ExportManager
└── Logger
```

These names describe responsibilities, not mandatory class names.

Implementation may use classes, functions, services, or modules as appropriate.

---

# 7. AppController

The AppController represents the top-level application coordination boundary.

Responsibilities:

- initialize core services,
- validate local application directories,
- initialize SQLite,
- initialize the source registry,
- expose safe application operations to IPC handlers,
- recover interrupted state at startup,
- coordinate graceful shutdown.

The AppController should not implement source-specific browser selectors or parsing rules.

---

# 8. RunManager

A **run** is one user-initiated collection operation.

The RunManager owns run lifecycle.

Responsibilities:

- create a run,
- assign `run_id`,
- store requested configuration,
- track selected sources,
- track selected jobs,
- calculate overall run status,
- record run timestamps,
- persist status transitions,
- expose resumable runs,
- mark terminal run state.

Conceptual run lifecycle:

```text
PENDING
   │
   ▼
RUNNING
   │
   ├──────────────► MANUAL_ACTION_REQUIRED
   │                        │
   │                        └────► RUNNING
   │
   ├──────────────► PAUSED
   │                        │
   │                        └────► RUNNING
   │
   ├──────────────► CANCELLED
   │
   ├──────────────► FAILED
   │
   ├──────────────► COMPLETED_WITH_WARNINGS
   │
   └──────────────► COMPLETED
```

Not every state must be fully supported in the earliest implementation.

`PAUSED`, for example, may be postponed if it complicates MVP reliability.

---

# 9. JobManager

A **job** is the smallest independently tracked collection task.

For Google Trends MVP:

> one query group = one job

Example:

```text
Run RR-...
│
├── GT01
├── GT02
├── GT03
└── GT04
```

Responsibilities:

- create jobs from run configuration,
- assign `job_id`,
- maintain job state,
- record attempts,
- track validation result,
- track produced artifacts,
- distinguish retryable from non-retryable conditions,
- prevent already accepted jobs from being rerun during normal resume.

Conceptual job lifecycle:

```text
PENDING
   │
   ▼
RUNNING
   │
   ├──────────────► MANUAL_ACTION_REQUIRED
   │                        │
   │                        └────► PENDING / RUNNING
   │
   ├──────────────► FAILED
   │                  error_code = DOWNLOAD_FAILED (example)
   │                        │
   │                        └────► RETRY_PENDING
   │
   ├──────────────► VALIDATING
   │                        │
   │                        └────► COMPLETED
   │                                  + validation_status
   │                                    VALID / LOW_DATA / NO_DATA /
   │                                    INVALID_SCHEMA / ERROR_NOT_DATA /
   │                                    DATE_MISMATCH / QUERY_MISMATCH
   │
   └──────────────► CANCELLED
```

Detailed state names are canonicalized in `DATA_CONTRACTS.md`.

Validation status and execution status are separate persisted domains. Transport/control-flow conditions such as `DOWNLOAD_FAILED` are represented as error codes or execution states, not dataset validation statuses.

For example:

```text
execution_status = COMPLETED
validation_status = LOW_DATA
```

is different from:

```text
execution_status = FAILED
validation_status = NOT_RUN
```

---

# 10. CollectionOrchestrator

The CollectionOrchestrator controls execution order.

For the Google Trends MVP, the default behavior should be sequential:

```text
GT01
↓
collect
↓
persist raw file
↓
validate
↓
persist metadata/result
↓
GT02
↓
...
```

Responsibilities:

- fetch pending jobs,
- execute jobs one at a time by default,
- invoke the correct source module,
- coordinate download → persist → validate,
- stop or suspend safely when manual action is required,
- continue to the next eligible job,
- update run-level status,
- respect cancellation,
- support retries.

The orchestrator should not know how to operate Google Trends UI.

It should only know how to invoke a source-module contract.

---

# 11. SourceRegistry

The SourceRegistry provides a central list of available source modules.

Conceptual source identifiers:

```text
google-trends
google-keyword-planner
google-search-console
semrush
merchant-center
ga4
google-ads
```

For MVP:

```text
google-trends
```

only.

Responsibilities:

- register source modules,
- expose source metadata,
- resolve a source by stable identifier,
- expose source capabilities,
- expose readiness/configuration state,
- prevent core code from using hard-coded source-specific branching where avoidable.

Conceptual usage:

```ts
const source = sourceRegistry.get("google-trends")
await source.collect(jobContext)
```

The exact TypeScript contract will be defined later.

---

# 12. Source Module Boundary

Each source module owns only behavior that is unique to that external source.

A source module may contain:

```text
sources/google-trends/
│
├── source definition
├── collector
├── source-specific config
├── parser
├── validator rules
├── browser selectors / UI adapter
├── error mapping
└── fixtures/tests
```

The module should not implement:

- global run persistence,
- arbitrary filesystem structure,
- generic logging infrastructure,
- workbook export,
- generic retry policy,
- generic browser lifecycle,
- global application state.

Those belong to shared core components.

---

# 13. Conceptual Source Module Contract

Future modules should conform to a common logical contract.

The exact code is intentionally not locked yet.

Conceptually:

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

  validate(
    context: ValidationContext
  ): Promise<ValidationResult>
}
```

Possible future capability flags:

```text
requiresBrowser
requiresOAuth
requiresManualLogin
supportsResume
supportsDirectExport
supportsAPI
supportsCustomDateRange
```

The core should depend on the interface, not concrete Google Trends implementation.

---

# 14. Google Trends Module

The Google Trends module is the first implementation of the source-module contract.

Conceptual structure:

```text
sources/
└── google-trends/
    ├── googleTrendsSource.ts
    ├── googleTrendsCollector.ts
    ├── googleTrendsUiAdapter.ts
    ├── googleTrendsParser.ts
    ├── googleTrendsValidator.ts
    ├── googleTrendsErrors.ts
    └── selectors/
```

Exact filenames may change during implementation.

Responsibilities:

- translate a GT query-group job into Google Trends UI actions,
- request a browser session from BrowserManager,
- apply:
  - query comparison group,
  - Turkey geography,
  - exact date range,
  - All Categories,
  - Web Search,
  - Search Term,
- wait for Interest Over Time,
- trigger the supported CSV export flow,
- return the downloaded artifact to the core,
- extract source-specific metadata where reliable,
- map source-specific failures into controlled error types,
- perform Google Trends-specific validation through the validation contract.

It should not directly decide final run status.

---

# 15. BrowserManager

Browser automation is a shared infrastructure service.

Responsibilities:

- create/reuse the application-specific persistent browser profile,
- launch Playwright browser contexts,
- close browser resources cleanly,
- expose a controlled browser session to source modules,
- coordinate download locations where appropriate,
- surface browser crashes,
- support manual user authentication,
- avoid source modules each starting unrelated browser instances.

Conceptual structure:

```text
BrowserManager
│
├── profile management
├── browser lifecycle
├── context lifecycle
├── download coordination
└── manual-action coordination
```

---

## 15.1 Browser Profile Policy

Do not depend on the user's normal Chrome default profile.

Use an application-owned profile directory.

Conceptual location:

```text
<app-data>/
└── browser-profiles/
    └── google/
```

Future non-Google sources may use separate profiles if required:

```text
browser-profiles/
├── google/
└── semrush/
```

The exact macOS application-data path will be decided during implementation using Electron-supported application paths.

---

## 15.2 Authentication

RoofRoom Data Collector must not store passwords.

When authentication is required:

```text
source detects login requirement
↓
job/run enters MANUAL_ACTION_REQUIRED
↓
browser remains available where safe
↓
user authenticates directly with provider
↓
application re-checks readiness
↓
collection continues
```

No automation should bypass CAPTCHA, 2FA, anti-bot, or provider security controls.

---

# 16. SQLite / StateRepository

SQLite is intended for application state, not as the canonical raw-data store.

SQLite should contain operational records such as:

- runs,
- jobs,
- attempts,
- statuses,
- artifact references,
- validation summaries,
- source configuration snapshots or references,
- timestamps,
- application bookkeeping.

The database should not replace immutable raw source files.

Conceptual boundary:

```text
SQLite
= operational state + searchable metadata

Filesystem
= raw artifacts + detailed metadata + validation reports + exports
```

Exact tables and schemas belong in `DATA_CONTRACTS.md`.

---

# 17. StorageManager

StorageManager owns filesystem layout and artifact persistence.

Responsibilities:

- create run directories,
- create source-specific directories,
- persist raw files,
- avoid accidental raw overwrite,
- persist metadata documents,
- persist validation reports,
- persist logs/exports where appropriate,
- calculate and store file hashes if adopted,
- return stable artifact references to the rest of the application.

Source modules should not invent their own arbitrary directory trees.

---

# 18. Run-Oriented Filesystem Layout

Preferred conceptual structure:

```text
data/
└── runs/
    └── <run_id>/
        ├── run.json
        │
        ├── google-trends/
        │   ├── raw/
        │   │   ├── GT01_TR_24M_interest_over_time.csv
        │   │   ├── GT02_TR_24M_interest_over_time.csv
        │   │   └── ...
        │   │
        │   ├── metadata/
        │   │   ├── GT01.metadata.json
        │   │   ├── GT02.metadata.json
        │   │   └── ...
        │   │
        │   └── validation/
        │       ├── GT01.validation.json
        │       ├── GT02.validation.json
        │       └── ...
        │
        ├── exports/
        │   └── ROOFROOM_SEARCH_DEMAND_RAW_<date>.xlsx
        │
        └── logs/
            └── run.log
```

The final filesystem-safe `run_id` format will be defined in `DATA_CONTRACTS.md`.

---

# 19. Raw Artifact Immutability

The raw download is evidence.

Once a raw file is accepted into the run's raw directory:

- do not modify it in place,
- do not normalize it in place,
- do not rewrite missing values,
- do not rename columns inside the raw file,
- do not deduplicate rows inside the raw file.

If normalization is needed:

```text
raw source
↓
read-only input
↓
parser / normalizer
↓
separate normalized representation
```

If a retry produces a second artifact, the architecture must preserve enough attempt context to avoid silently replacing evidence.

The exact retry artifact naming policy will be defined in `DATA_CONTRACTS.md`.

---

# 20. MetadataManager

MetadataManager coordinates provenance records.

Responsibilities:

- create standard metadata envelopes,
- merge core metadata with source-provided metadata,
- record requested configuration,
- record actual observed data range where available,
- record artifact references,
- record collection timestamps,
- record source/source mode,
- record application version,
- record validation status after validation,
- preserve run/job linkage.

Source modules may provide source-specific fields, but common provenance fields should be standardized.

---

# 21. Validation Architecture

Validation is a first-class pipeline stage.

Conceptual flow:

```text
SOURCE COLLECTION
       │
       ▼
RAW ARTIFACT
       │
       ▼
BASIC FILE CHECKS
       │
       ▼
SOURCE PARSER
       │
       ▼
SOURCE-SPECIFIC VALIDATION
       │
       ▼
VALIDATION RESULT
       │
       ├── VALID
       ├── LOW_DATA
       ├── NO_DATA
       └── REJECT / ERROR
```

A download event alone must never mark a job as successfully collected.

---

# 22. ValidationCoordinator

ValidationCoordinator is shared infrastructure.

Responsibilities:

- invoke generic file checks,
- invoke source-specific validator,
- aggregate validation findings,
- produce a standard validation result,
- persist validation result,
- update job state through JobManager.

Generic checks may include:

- file exists,
- file is readable,
- file size is plausible,
- file appears to be expected content type,
- HTML/error-page detection.

Source-specific checks belong to the source module.

For Google Trends these include:

- expected query columns,
- expected date/time dimension,
- relative-interest value parsing,
- range constraints,
- requested-vs-actual date coverage,
- all-zero detection,
- duplicates,
- unexpected schema.

---

# 23. Validation vs Collection Status

Execution and validation should not be collapsed into one status field.

Example:

```text
execution_status:
COMPLETED

validation_status:
VALID
```

or:

```text
execution_status:
COMPLETED

validation_status:
LOW_DATA
```

or:

```text
execution_status:
FAILED

validation_status:
NOT_RUN
```

This prevents ambiguous states.

The exact enums belong in `DATA_CONTRACTS.md`.

---

# 24. Logging Architecture

Logging should be structured enough to support debugging and audit.

Relevant event categories:

```text
APP
RUN
JOB
SOURCE
BROWSER
DOWNLOAD
VALIDATION
STORAGE
EXPORT
ERROR
SECURITY
```

Useful fields may include:

- timestamp,
- level,
- run_id,
- job_id,
- source,
- event name,
- message,
- error code,
- attempt number.

Sensitive credentials, passwords, OAuth secrets, full cookies, and session tokens must not be written to normal logs.

---

# 25. Error Boundary Model

Failures should be isolated as close as possible to the affected job.

Example:

```text
GT01 → VALID
GT02 → VALID
GT03 → FAILED (error_code=DOWNLOAD_FAILED)
GT04 → VALID
```

A GT03 failure should not automatically corrupt GT01/GT02 artifacts.

Important failure boundaries:

## Application-level failure

Examples:

- unrecoverable database initialization failure,
- corrupted application configuration,
- critical filesystem failure.

Possible result:

```text
RUN cannot start
```

## Run-level failure

Examples:

- user cancels entire run,
- required global resource becomes unavailable.

Possible result:

```text
RUN = FAILED / CANCELLED
```

## Job-level failure

Examples:

- one CSV download fails,
- one group returns unexpected schema,
- one source page fails to load.

Possible result:

```text
JOB = FAILED
RUN may continue
```

## Manual-action condition

Examples:

- provider requests login,
- provider requests user confirmation,
- CAPTCHA/2FA/security challenge appears.

Possible result:

```text
MANUAL_ACTION_REQUIRED
```

This is not equivalent to a collector bug.

---

# 26. Retry Architecture

Retries should occur at the job level.

A retry should:

1. preserve previous attempt history,
2. create/increment attempt context,
3. recollect only the requested failed job,
4. produce a new candidate artifact,
5. validate the new artifact,
6. update the job's accepted artifact reference only after successful acceptance.

Automatic retry policy should be conservative.

The MVP should avoid aggressive repeated requests to external platforms.

---

# 27. Resume Architecture

Resume is based on persisted run/job state.

Startup recovery concept:

```text
Application starts
↓
StateRepository checks incomplete runs
↓
RunManager reconstructs run state
↓
Completed + accepted jobs remain completed
↓
Failed jobs remain failed/retryable
↓
Pending jobs remain pending
↓
Previously running job is reconciled
↓
User may resume
```

An interrupted `RUNNING` job must not automatically be assumed successful.

Its artifacts, if any, should be reconciled and validated before deciding whether recollection is necessary.

---

# 28. Export Architecture

Export is downstream from validated source data.

Conceptual flow:

```text
RAW SOURCE FILES
      │
      ├──────────────► preserved unchanged
      │
      ▼
PARSED / NORMALIZED REPRESENTATION
      │
      ▼
EXPORT MANAGER
      │
      ├── CSV package
      └── XLSX workbook
```

ExportManager responsibilities:

- read validated artifacts,
- produce analysis-ready package,
- preserve source semantics,
- preserve missing values,
- retain query-group context,
- include provenance references,
- include validation logs/summaries.

ExportManager must not:

- convert Google Trends values to search volume,
- merge Search Term and Topic series,
- silently stitch independently normalized Trends groups,
- overwrite raw source files.

---

# 29. Query Configuration Architecture

Query groups must be external configuration.

Preferred initial conceptual format:

```yaml
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

ConfigLoader should:

- read config,
- parse it,
- validate required fields,
- reject duplicate group IDs,
- preserve query order,
- expose normalized internal representation.

The exact schema belongs in `DATA_CONTRACTS.md`.

Collector logic must not hard-code GT01–GT20 query strings.

---

# 30. Dependency Direction

Dependencies should flow inward toward stable core contracts.

Preferred conceptual direction:

```text
Renderer/UI
   │
   ▼
Application Services / IPC Facade
   │
   ▼
Core Contracts
   ▲
   │
Source Modules
   │
   ├── Google Trends adapter
   ├── future Google Ads adapter
   ├── future Search Console adapter
   └── future Semrush adapter
```

Infrastructure implementations support the core:

```text
Core
▲   ▲   ▲
│   │   │
SQLite
Filesystem
Playwright
```

The core should not depend on UI components.

Google Trends code should not leak into generic RunManager/JobManager logic.

---

# 31. Suggested Repository Structure

Initial conceptual repository structure:

```text
roofroom-data-collector/
│
├── docs/
│   └── optional future documentation
│
├── config/
│   └── query-groups.yaml
│
├── src/
│   ├── main/
│   │   ├── app/
│   │   ├── ipc/
│   │   ├── core/
│   │   │   ├── runs/
│   │   │   ├── jobs/
│   │   │   ├── orchestration/
│   │   │   ├── validation/
│   │   │   ├── storage/
│   │   │   ├── metadata/
│   │   │   ├── browser/
│   │   │   ├── export/
│   │   │   └── logging/
│   │   │
│   │   ├── sources/
│   │   │   └── google-trends/
│   │   │
│   │   └── infrastructure/
│   │       ├── sqlite/
│   │       ├── filesystem/
│   │       └── playwright/
│   │
│   ├── preload/
│   │
│   ├── renderer/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   └── state/
│   │
│   └── shared/
│       ├── contracts/
│       └── types/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   └── e2e/
│
├── PROJECT_SPEC.md
├── PROJECT_HANDOFF.md
├── ARCHITECTURE.md
├── DATA_CONTRACTS.md
├── VALIDATION_SPEC.md
├── TEST_STRATEGY.md
├── DECISIONS.md
└── SOURCE_MODULE_GUIDE.md
```

This is a design target, not a mandatory final directory tree.

M1 should validate the actual Electron/Vite project conventions before finalizing paths.

---

# 32. Shared Contracts

Shared TypeScript contracts should live in a location usable by main/preload/renderer where appropriate, without exposing privileged implementations.

Examples:

- `RunSummary`
- `JobSummary`
- `SourceSummary`
- `ValidationSummary`
- `RunRequest`
- `RetryRequest`
- `ManualActionNotice`

Privileged objects must not cross IPC directly.

For example, never send Playwright `Page`, database handles, filesystem streams, or authentication objects to the renderer.

---

# 33. Security Boundary

The renderer should be treated as less trusted than the main process.

Privileged capabilities remain in main/infrastructure layers.

Security-relevant rules:

- no raw Node.js filesystem API exposed to renderer,
- no arbitrary shell execution from renderer,
- no arbitrary URL-to-browser-control IPC,
- no password storage,
- no cookie/session export features by default,
- no CAPTCHA-solving integration,
- no anti-bot bypass features.

Future authentication tokens for official APIs should use a dedicated secrets/storage design rather than ad hoc JSON files.

That future design will be documented when the first OAuth/API source is implemented.

---

# 34. Google Trends Collection Sequence

Detailed conceptual sequence:

```text
User clicks START
        │
        ▼
Renderer sends create/start request
        │
        ▼
RunManager creates run
        │
        ▼
JobManager creates selected GT jobs
        │
        ▼
CollectionOrchestrator selects GT01
        │
        ▼
SourceRegistry resolves GoogleTrendsSource
        │
        ▼
GoogleTrendsSource requests browser session
        │
        ▼
BrowserManager opens application Google profile
        │
        ▼
GoogleTrends UI adapter applies configuration
        │
        ▼
Official CSV export triggered
        │
        ▼
StorageManager persists candidate raw artifact
        │
        ▼
MetadataManager creates provenance record
        │
        ▼
ValidationCoordinator validates artifact
        │
        ├── accepted
        │      ▼
        │   Job completed
        │
        └── failed/warning
               ▼
            Job status recorded
        │
        ▼
Next eligible job
```

---

# 35. Candidate vs Accepted Artifacts

To avoid treating every download as valid evidence, the architecture should distinguish conceptually between:

```text
candidate artifact
```

and:

```text
accepted raw artifact
```

A source collection may produce a candidate file.

Validation then determines whether it becomes:

- accepted,
- accepted with warning,
- retained as rejected evidence,
- discarded only if clearly temporary and not useful for audit.

The final persistence policy will be defined in `DATA_CONTRACTS.md` and `VALIDATION_SPEC.md`.

No suspicious artifact should silently become the canonical dataset.

---

# 36. Manual Action Flow

Manual action is a normal controlled state.

Conceptual flow:

```text
Collector detects authentication/security requirement
↓
source returns MANUAL_ACTION_REQUIRED
↓
JobManager records state
↓
RunManager reflects suspended/manual state
↓
UI shows clear instruction
↓
user completes provider-side action
↓
application checks readiness again
↓
job resumes or retries
```

The application must never reinterpret a security challenge as permission to bypass it.

---

# 37. Concurrency Policy

Google Trends MVP default:

> **single active collection job**

Reasons:

- simpler failure isolation,
- lower risk of rate limiting,
- easier browser-state reasoning,
- simpler downloads,
- easier validation,
- easier debugging,
- better reproducibility.

Future source modules may support controlled concurrency if justified.

Concurrency should be a source capability/policy, not a global assumption.

---

# 38. Time and Date Handling

The application must distinguish:

- requested date range,
- actual source date range,
- collection timestamp.

Example:

```text
requested_date_start = 2024-08-18
requested_date_end   = 2026-08-17

actual_date_start    = source-derived
actual_date_end      = source-derived

retrieved_at         = timestamp with timezone
```

The collector must not fabricate unavailable dates.

Exact serialization rules belong in `DATA_CONTRACTS.md`.

---

# 39. Future Official API Sources

Future API-based sources should use the same core pipeline.

Example:

```text
Search Console Source
        │
        ▼
Official API client
        │
        ▼
SourceCollectionResult
        │
        ▼
Storage
        │
        ▼
Validation
        │
        ▼
Metadata
        │
        ▼
Export
```

API modules do not need BrowserManager unless authentication or user setup requires it.

This is why BrowserManager must remain a shared optional service rather than a required property of every source.

---

# 40. Future Browser-Based Sources

A future browser-automated source should reuse BrowserManager.

Example:

```text
Source Module
↓
BrowserManager
↓
source-specific UI adapter
↓
download
↓
shared storage / validation / metadata pipeline
```

A source may use a dedicated persistent profile when security/session isolation requires it.

---

# 41. Future Source Isolation

A new source module should normally remain inside the same application.

Consider separate process/application isolation only if justified by:

- incompatible runtime requirements,
- security boundary requirements,
- licensing restrictions,
- deployment constraints,
- unstable third-party dependencies,
- extreme resource usage.

Separate apps are an exception, not the default architecture.

---

# 42. Testing Boundaries

Architecture should allow components to be tested independently.

Examples:

## Unit-testable

- run-state calculations,
- job-state transitions,
- config parsing,
- filename generation,
- validation logic,
- metadata creation,
- export transformations.

## Integration-testable

- SQLite persistence,
- filesystem storage,
- retry/resume reconstruction,
- source → storage → validation pipeline.

## Browser/e2e-testable

- Google Trends UI flow,
- download capture,
- manual-action detection,
- real run progress.

Testing details belong in `TEST_STRATEGY.md`.

---

# 43. Architecture Anti-Patterns

The following should be avoided.

## Anti-pattern: Google Trends logic in UI

Bad:

```text
React button
→ directly manipulates Playwright
```

Preferred:

```text
React UI
→ IPC
→ Core orchestrator
→ Google Trends source
```

---

## Anti-pattern: One giant collector service

Bad:

```text
Collector.ts
= UI + browser + DB + validation + export + Trends selectors
```

Preferred:

Focused components with explicit ownership.

---

## Anti-pattern: Source module owns shared infrastructure

Bad:

```text
google-trends/
└── own database
└── own logger
└── own arbitrary data directory
└── own browser lifecycle
```

Preferred:

Use shared core services.

---

## Anti-pattern: Raw CSV rewritten during parsing

Bad:

```text
download.csv
↓
normalize columns in place
↓
save over download.csv
```

Preferred:

```text
raw/download.csv
↓
read
↓
normalized representation
```

---

## Anti-pattern: Download means success

Bad:

```text
download event
→ COMPLETED
```

Preferred:

```text
download
→ storage
→ parse
→ validate
→ accepted/rejected
```

---

## Anti-pattern: Source-specific statuses everywhere

Bad:

```text
GT_DOWNLOAD_WEIRD
SEMRUSH_DOWNLOAD_WEIRD
GSC_DOWNLOAD_WEIRD
```

for identical generic failure concepts.

Preferred:

Standard common statuses plus source-specific error details.

---

# 44. Architecture Decisions Deferred to M1/M2

The following should not be prematurely locked in M0:

- exact package versions,
- exact SQLite library,
- exact XLSX library,
- exact Electron/Vite starter structure,
- exact DI framework or whether one is needed,
- exact IPC library/pattern beyond narrow typed IPC,
- exact logging library,
- exact schema-validation library,
- exact file-hashing algorithm implementation,
- worker-thread/process architecture,
- exact Playwright browser channel,
- exact Google Trends selectors,
- exact retry timing values,
- exact cooldown timing values.

These should be selected after checking current official documentation and testing on the target MacBook Air M1 environment.

---

# 45. M1 Architectural Deliverables

M1 — Application Skeleton should prove the architecture with the smallest working slice.

Required architectural proof:

```text
Electron launches
↓
React renderer loads
↓
typed/safe IPC call works
↓
Core initializes
↓
SQLite initializes
↓
query config loads
↓
SourceRegistry reports Google Trends
↓
local application directories resolve
```

No real Google Trends collection is required to complete the earliest M1 slice.

---

# 46. M2 Architectural Deliverables

M2 — Core Collector Engine should establish:

- persisted runs,
- persisted jobs,
- run/job state transitions,
- sequential orchestration,
- resume reconstruction,
- retry foundation,
- StorageManager,
- MetadataManager,
- Logger,
- BrowserManager foundation,
- source-module contract.

A fake/test source may be useful for testing the core without depending on Google Trends UI.

The decision to use such a test source can be made during implementation.

---

# 47. M3 Architectural Deliverables

M3 — Google Trends MVP Collector should plug into the already-working core and include only the minimum validation slice required to trust the first real source artifact. The reusable/hardened validation framework remains the focus of M4.

Expected integration:

```text
GoogleTrendsSource
↓
BrowserManager
↓
Google Trends UI
↓
CSV download
↓
StorageManager
↓
ValidationCoordinator
↓
JobManager
```

Google Trends implementation must not require rewriting the run/job/storage architecture.

If adding Google Trends requires major core redesign, revisit the module boundary before expanding to GT01–GT20.

---

# 48. Architecture Acceptance Criteria

This architecture is considered suitable for M0 when it clearly supports all of the following:

- one application with multiple future source modules,
- Google Trends as the first module,
- renderer/main privilege separation,
- reusable run management,
- reusable job management,
- sequential MVP orchestration,
- persistent resume/retry state,
- application-specific browser profile,
- source-independent storage conventions,
- immutable raw files,
- provenance metadata,
- validation before acceptance,
- failure isolation at job level,
- explicit manual-action state,
- structured logging,
- downstream CSV/XLSX exports,
- future API and browser-based sources,
- no silent Trends cross-group normalization,
- no Trends-to-search-volume conversion.

---

# 49. Architecture Summary

RoofRoom Data Collector should behave as a modular ingestion platform rather than a source-specific automation script.

The central flow is:

```text
USER REQUEST
↓
RUN
↓
JOBS
↓
SOURCE MODULE
↓
RAW ARTIFACT
↓
PRESERVE
↓
VALIDATE
↓
DOCUMENT / PROVENANCE
↓
EXPORT
```

Shared infrastructure belongs to Core.

External-platform behavior belongs to Source Modules.

The Google Trends MVP should prove that this architecture works before additional source modules are added.

---

# 50. Related Documents

Architecture must remain consistent with:

- `PROJECT_SPEC.md`
- `PROJECT_HANDOFF.md`

The next M0 documents should refine this architecture:

1. `DATA_CONTRACTS.md`
2. `VALIDATION_SPEC.md`
3. `TEST_STRATEGY.md`
4. `DECISIONS.md`
5. `SOURCE_MODULE_GUIDE.md`

Fast-changing implementation status should remain in `PROJECT_HANDOFF.md`.

---

# 51. Governing Architecture Rule

When choosing between a faster implementation and a more traceable, testable, recoverable implementation:

> **Prefer the design that better preserves data integrity and reproducibility.**

RoofRoom Data Collector is successful when every accepted dataset can be traced back through:

```text
export
↓
validated dataset
↓
raw source artifact
↓
job
↓
run
↓
requested source configuration
```

without losing source meaning or collection context.
