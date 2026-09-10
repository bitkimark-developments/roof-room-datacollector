# RoofRoom Data Collector — Architecture

**Status:** Canonical multi-source architecture
**Scope:** Component boundaries, dependency direction, acquisition patterns, and shared lifecycle

---

## 1. Governing principle

RoofRoom Data Collector is one local-first Electron application with multiple independent source modules and one shared Core.

```text
Desktop UI
  ↓ typed IPC
Application Core
  ↓ registered source contract
Source Modules
  ↓
Browser | Official API | File Import | HTTP/XML | Third-party API
```

Google Trends is the implemented reference for browser-export acquisition. It is not the architectural center of every future source.

## 2. Current physical baseline

The live repository currently uses:

- Electron main, preload, and React renderer boundaries;
- TypeScript and Vite through Electron Forge;
- a `SourceRegistry`, a source-keyed `CollectionValidatorRegistry`, and `DataSourceModule`/`CollectingDataSourceModule` contracts;
- `CollectionOrchestrator`, run/job/attempt state machines, resume, reconciliation, and retry policy;
- `StateRepository` backed by `node:sqlite` schema version 6;
- `StorageManager` for application-owned run-scoped evidence;
- source-specific Google Trends collection, parsing, validation, and export;
- Playwright with an application-owned persistent browser profile.

The current desktop composition and export path are Google-Trends-specific. Credential lifecycle, freshness lifecycle, and the other Release 1.0 adapters are not implemented merely because they are required by this architecture. Exact live status belongs in `PROJECT_HANDOFF.md`.

## 3. Process and security boundaries

### Renderer

The React renderer owns presentation and user intent only. It must not receive filesystem, database, browser, OAuth token, API key, or unrestricted network privileges.

### Preload / IPC

Preload exposes a narrow, typed, allowlisted API. Inputs are validated again in the main process. Sensitive provider responses and credentials do not cross this boundary.

### Main process

The main process owns privileged orchestration, persistence, storage, browser automation, provider/API clients, import readers, validation coordination, logging, export, and secure credential access.

## 4. Shared Core responsibilities

Core owns reusable lifecycle behavior:

| Responsibility | Boundary |
|---|---|
| Run management | creates and aggregates user-initiated operations |
| Workspace ownership | isolates Runs by brand/business and enforces one active Run per Workspace |
| Job management | creates independent work and resume/retry units |
| Attempt history | preserves every execution attempt |
| Reconciliation/resume | resolves interrupted state before recollection |
| Retry | applies explicit policy without source-owned hidden loops |
| Source registry | exposes source identity, capability, and readiness |
| Browser lifecycle | provides the persistent app-owned browser only when required |
| Credential/access lifecycle | mediates secure secrets and safe connection state |
| Freshness/due lifecycle | decides fresh, due, import-needed, or on-demand state independently of execution |
| Artifact lifecycle | tracks candidate, accepted, warned, rejected, superseded, and derived evidence |
| Storage | owns canonical application paths and collision-safe writes |
| Metadata/provenance | links request, observation, source, and raw artifact |
| Validation coordination | resolves the validator from each Job's source identity and invokes checks before acceptance |
| Logging | produces structured, redacted operational evidence |
| Export | produces user-facing representations from eligible accepted data |
| Desktop coordination | maps user intent and Core state through trusted IPC |

These are responsibilities, not mandatory class names. Existing components should be extended compatibly; a documentation term does not require a refactor.

## 5. Source-module boundary

A source module owns:

- provider/dataset semantics;
- request/job planning specific to that source;
- browser, API, file, or HTTP acquisition behavior;
- provider response/error mapping;
- parsing;
- source-specific validation;
- observed-context extraction.

A source module does not own a private run manager, database schema, arbitrary filesystem root, retry scheduler, desktop security boundary, or global export policy.

The current TypeScript contract is intentionally narrower than the full multi-source target. Its current names and persisted values remain authoritative until a separately approved implementation slice evolves them.

## 6. Acquisition modes

Source identity, source mode, dataset identity, and acquisition mode are orthogonal.

### `BROWSER_EXPORT`

Used by Google Trends. Core supplies browser lifecycle and storage. The source controls verified provider UI actions and captures provider export bytes. Provider blocks stop safely; there is no CAPTCHA, 2FA, anti-bot, quota, or rate-limit bypass.

### `OFFICIAL_API`

Used by GSC, Google Ads Search Terms, and Keyword Planner. The source builds supported API requests and maps responses/errors. Credentials come through the Core security boundary. Raw provider JSON or an equivalently faithful serialized response is preserved before normalization.

### `FILE_IMPORT`

Used by İkas Products XLSX and the Keyword Planner CSV fallback. The user chooses an input file. The original is copied into immutable run-scoped evidence before parsing. File extension alone must not determine encoding or format.

### `HTTP_XML`

Used by Bitkimark public sitemaps. The source performs bounded standard HTTP retrieval, preserves response bytes and URL/status metadata, parses XML, and keeps parent-child sitemap relationships.

### `THIRD_PARTY_API`

Used by on-demand SerpApi batches. Quota is an operational concern; no automatic all-keyword refresh is allowed. Raw JSON and provider metadata are preserved.

## 7. Common lifecycle

Every mode participates in one Core lifecycle:

```text
User intent / due decision / import selection
→ readiness check
→ run and jobs
→ attempt
→ acquire or import
→ preserve candidate evidence
→ parse
→ validate
→ accept, warn, or reject
→ metadata and provenance
→ eligible export
```

An acquisition success is not a validation success. Operational errors are recorded without inventing a dataset. Validation failure preserves raw evidence when practical but prevents canonical acceptance.

## 8. Run, job, and attempt

- A Workspace is the first-class brand/business identity that owns Runs.
- A run is one coordinated user/Core operation and may contain independently executable Jobs from multiple sources.
- A job is the independent execution, resume, and retry unit.
- An attempt is one immutable execution history item for a job.

Every Run has one required Workspace foreign key. The database permits at most one active Run (`PENDING`, `RUNNING`, or `MANUAL_ACTION_REQUIRED`) per Workspace. `RETRY_REQUIRED` is non-terminal but inactive, so explicit retry must atomically reacquire the Workspace slot, transition the Job, and create the new Attempt in one repository transaction. Restart discovery and reconciliation require an explicit Workspace scope.

Collection and validation dispatch both resolve from each persisted Job's `source_id`. A normal Job failure does not reset completed siblings, and explicit retry creates a new attempt only for an eligible failed Job. Current SQLite and TypeScript statuses are persisted contracts and must not be renamed casually.

## 9. Persistence and storage

SQLite stores operational state and links. The filesystem stores raw bytes, metadata, validation documents, logs, and exports.

Current canonical application state is under the Electron `userData/app-data` boundary, including `database/`, `config/`, `data/runs/`, `logs/`, and `browser-profiles/`.

Raw writes are collision-safe and run-scoped. Derived files do not replace raw evidence. Downloads is reserved for intentional user-visible copies and is not canonical application state.

Current schema version 6 includes `workspaces`, `runs`, `jobs`, `attempts`, `artifacts`, and `validations`. Runs require `workspace_id`, persist an ordered array of selected source IDs, and use a partial unique index for the exact active status set. Jobs use `source_id + job_key` as their identity within a Run, persist JSON-compatible source context, and allow `query_group_id = NULL` for non-Google-Trends work. The same `job_key` may therefore exist under different source IDs. Existing Google Trends jobs retain `job_key === query_group_id`. The schema still has no implemented freshness or credential tables.

Migration from pre-Workspace schemas creates one deterministic development Workspace and attaches historical Runs to it. That row is migration/runtime compatibility only; it is not a customer-facing default, legacy mode, or product taxonomy. Workspace UI/lifecycle management, Presets, Last Run Settings, and credential work remain outside this slice.

Legacy Google Trends snapshots and committed generic single-source snapshots remain readable without migration. New generic multi-source snapshots describe real source membership with a `sources` array; they do not copy the first Job's source to a singular Run-level `source_id` or invent a synthetic provider identity.

## 10. Credential/access architecture

Credential lifecycle is a dedicated Core security boundary even if implemented through several compatible components rather than one named manager.

Requirements:

- source modules declare access requirements;
- secrets are not stored in ordinary YAML/JSON/CSV config or logs;
- macOS production storage uses an appropriate secure mechanism;
- OAuth refresh lifecycle is application-controlled rather than dependent on development-only ADC/gcloud state;
- renderer/UI receives only safe states such as ready, not configured, authentication required, access denied, unavailable, or manual action required;
- source modules never log raw tokens, API keys, developer tokens, client secrets, passwords, or account payloads containing secrets.

## 11. Freshness architecture

Freshness is separate from readiness, execution, and validation.

A future compatible contract may represent last successful collection/import, refresh policy, next due time, on-demand policy, and a safe freshness state. Exact names and persistence are deferred to implementation design against the current schema.

Examples:

- SERP is on demand, not continuously due;
- manual catalog input may need import without an authentication failure;
- GSC may be due while access is ready;
- an API source may be due but not ready because authentication is required.

## 12. Validation architecture

Workspace-owned source connections are a Core persistence boundary. SQLite stores only source-owned safe metadata and a credential reference; an injected credential port answers availability without exposing secret values. A source-keyed readiness registry combines the Workspace-scoped connection with that availability and delegates semantic requirements to the source evaluator.

Workspace-owned reusable configuration is persisted as Saved Collection Presets and system-managed Last Run Settings. A temporary Run Draft resolves effective source-owned configuration without mutating its origin. New starts use one atomic repository reservation transaction that persists the immutable resolved Run Snapshot and updates Last Run Settings together; credentials remain outside all three stores.

`ValidationCoordinator`/Core lifecycle owns validation invocation and artifact state transition. `CollectionValidatorRegistry` fails closed for invalid, duplicate, or unknown source IDs, and `CollectionOrchestrator` resolves a validator for each Job from `job.source_id`. Each source validator owns semantic checks.

Generic checks cover existence, readability, content signature, parseability, required provenance, and structural safety. Source checks cover dimensions, identifiers, date/context, metric domains, expected schema, completeness limitations, and source-mode semantics.

Validation findings carry structured detail. New operational failures should not be forced into the validation enum.

## 13. Source-specific architecture notes

### Google Trends

Current flow uses externally configured query groups, one sequential job per group, an app-owned Playwright profile, supported CSV capture, run-scoped storage, parser/validator, SQLite state, and structured export. Current production runner, desktop factory, and export implementation remain source-specific even though the shared Core now supports multi-source Runs.

### Google Search Console

The adapter will require official API acquisition, OAuth scope/property selection, dataset-specific dimensions, raw JSON preservation, row/pagination handling, and provider limitation metadata.

### Google Ads Search Terms

The adapter will use the official API and preserve the verified `search_term_view` source mode. Campaign modes not covered by the proof must not be silently treated as complete.

### Keyword Planner

API and manual CSV import are two acquisition paths for one logical source/dataset family. Provenance must keep the paths distinct.

### İkas Products

Import preserves the original XLSX before normalization and treats blank stock as missing.

### Bitkimark public site

The HTTP/XML adapter preserves raw responses, source URLs, response metadata, and sitemap relationships.

### SERP

The SerpApi adapter is an explicit on-demand batch source with quota-aware readiness and no continuous rank-tracking loop.

## 14. Dependency direction

```text
renderer → preload contract → main application coordination
main coordination → Core interfaces
Core → source interfaces, storage/repository/validation abstractions
source implementation → provider client/browser/import parser
```

Core must not import provider-specific selectors, API resources, worksheet columns, or SERP fields. Source modules may depend on shared contracts but must not mutate global run state directly.

## 15. Testing boundaries

- Core orchestration is tested with fake source modules.
- Parsers and validators use evidence-based sanitized fixtures.
- API clients use mocks/record-like sanitized fixtures in normal regression.
- file imports use controlled fixture files.
- HTTP/XML uses local fixtures or controlled local servers.
- browser UI behavior uses deterministic fakes/fixtures where possible.
- all live provider calls are explicit, limited, separately invoked, and quota-aware.

Normal automated tests and CI must not call live providers.

## 16. Anti-patterns

Do not:

- put source-specific branches throughout Core;
- treat download/API/import success as validation success;
- mutate raw evidence during parsing;
- let source modules write arbitrary paths or own retries invisibly;
- expose provider credentials to renderer code;
- use freshness as execution status;
- combine source metrics into an invented cross-source score;
- infer provider completeness for an unverified source mode;
- create a physical repository layout in documentation before implementation evidence exists.

## 17. Governing architecture rule

Acquisition mechanisms may differ, but every source must enter the same auditable Core lifecycle while preserving its own semantics, security boundary, raw evidence, and validation rules.
