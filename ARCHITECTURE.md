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
- `StateRepository` backed by `node:sqlite` schema version 8;
- `StorageManager` for application-owned run-scoped evidence;
- source-specific Google Trends collection, parsing, validation, and export;
- Playwright with an application-owned persistent browser profile.

The current desktop composition includes Workspace-scoped credentials/readiness, a derived source-neutral freshness boundary, and the implemented Release 1.0 source adapters. Exact export-loader and live-acceptance status belongs in `PROJECT_HANDOFF.md`.

## 3. Process and security boundaries

### Renderer

The React renderer owns presentation and user intent only. It must not receive filesystem, database, browser, OAuth token, API key, or unrestricted network privileges.

### Preload / IPC

Preload exposes a narrow, typed, allowlisted API. Inputs are validated again in the main process. Sensitive provider responses and credentials do not cross this boundary.

### Main process

The main process owns privileged orchestration, persistence, storage, browser automation, provider/API clients, import readers, validation coordination, logging, export, and secure credential access.

### User-facing configuration and remediation boundary

The renderer may present safe connection/readiness state and collect structured user intent. Privileged connection operations, credential references, secret access, provider request composition, and provider execution remain behind typed allowlisted IPC in the main/Core boundary.

The implemented Workspace connection read path is `DesktopMultiSourceController.getWorkspaceConnections(workspace_id)` → trusted `DESKTOP_CONNECTIONS` main-process IPC → preload `getDesktopWorkspaceConnections(workspace_id)` → read-only Workspace presentation. The renderer-visible payload is limited to `source_id`, `credential_status`, and `readiness_status`; credential references and secret material do not cross the boundary.

Privileged connection writes use dedicated trusted channels for Manage, Disconnect, Google Connect/Reconnect, and SerpApi provisioning. Main validates each unknown renderer intent against an action-specific allowlist before delegating to `WorkspaceConnectionManagementService`, then validates the service response before it can cross preload. SerpApi provisioning accepts only Workspace ID plus `source_id: 'serpapi'`; the API key never enters the intent. Responses contain only source, action, outcome, or a fixed safe error code, and connection state is always reread through the unchanged safe read path after a mutation attempt.

Workspace is the user-facing context for connection management. Task surfaces may route the user to Workspace remediation, but task components must not own, persist, or expose secrets.

Structured editors and bounded selectors compile validated user intent into the existing reviewed source/job context. They must not construct provider requests or create a parallel persistence model.

Run History, task Recent Runs, and operational dashboards must derive from persisted Core state rather than UI-only status. Presentation improvements alone do not justify a new persistence schema.

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

Used by GSC, the Google Ads SEARCH reporting family and legacy Search Terms quick-run path, and Keyword Planner. The source builds supported API requests and maps responses/errors. Credentials come through the Core security boundary. Raw provider JSON or an equivalently faithful serialized response is preserved before normalization.

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

Current schema version 8 includes `workspaces`, `runs`, `jobs`, `attempts`, `artifacts`, `validations`, Saved Presets, Last Run Settings, and Workspace source connections. Runs require `workspace_id`, persist an ordered array of selected source IDs, and use a partial unique index for the exact active status set. Jobs use `source_id + job_key` as their identity within a Run, persist JSON-compatible source context, and allow `query_group_id = NULL` for non-Google-Trends work. The same `job_key` may therefore exist under different source IDs. Existing Google Trends jobs retain `job_key === query_group_id`. Credential secrets remain outside SQLite, and freshness is derived rather than cached in a separate table.

Migration from pre-Workspace schemas creates one deterministic development Workspace and attaches historical Runs to it. That row is migration/runtime compatibility only; it is not a customer-facing default, legacy mode, or product taxonomy. Current Workspace UI, Presets, Last Run Settings, and Workspace-scoped connection/readiness capabilities build on this persisted Workspace boundary; exact current product state belongs in PROJECT_HANDOFF.md.

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

On macOS, `SecretIngressPort` is a main-process-only boundary. `MacOsascriptSecretIngress` starts the system `/usr/bin/osascript` with `shell:false` and no secret argv, supplies a fixed masked-dialog AppleScript program through stdin, and accepts only bounded protocol output through private stdout/stderr pipes. Timeouts, cancellation, malformed protocol, output overflow, and process failures become fixed outcomes; clipboard and temporary files are not used. The returned plaintext is necessarily present briefly in main-process memory and is never logged or exposed across preload.

`MainProcessSerpApiCredentialAcquirer` is the only production consumer in this slice. It validates 1–512 printable non-whitespace ASCII bytes, creates a fresh opaque credential reference, and writes the value immediately through the existing OS-backed `CredentialStore`. `WorkspaceConnectionManagementService` receives only the fresh reference. New provisioning publishes the SerpApi row after the store write; replacement atomically rebinds the exact existing row, compensates pre-publication/rebind failures by deleting the fresh unreferenced credential, and deletes old material only after a global zero-reference check. A committed replacement with failed obsolete-credential cleanup returns a safe warning.

## 11. Freshness architecture

Freshness is separate from readiness, execution, and validation.

The Core freshness contract represents `FRESH`, `DUE`, `STALE`, `IMPORT_NEEDED`, `ON_DEMAND`, and `UNKNOWN`. It derives the last successful collection/import from the latest source Job that is completed, has an accepted artifact, and has an accepted validation status. Candidate persistence, failed/rejected validation, readiness, and mere provider access never advance freshness.

Policies are source-neutral: unknown, on demand, manual import, or an explicit bounded interval with separate due and stale thresholds. Clock-dependent evaluation uses an injected clock and returns nullable last-success and next-due timestamps. SerpApi is always on demand; the manual İkas and Keyword Planner CSV sources default to manual-import semantics; sources without an approved cadence remain unknown unless safe configuration supplies an explicit interval policy. Freshness evaluation never schedules or starts work.

Examples:

- SERP is on demand, not continuously due;
- manual catalog input may need import without an authentication failure;
- GSC may be due while access is ready;
- an API source may be due but not ready because authentication is required.

## 12. Validation architecture

Workspace-owned source connections are a Core persistence boundary. SQLite stores only source-owned safe metadata and a credential reference; an injected credential port answers availability without exposing secret values. A source-keyed readiness registry combines the Workspace-scoped connection with that availability and delegates semantic requirements to the source evaluator.

`WorkspaceConnectionManagementService` is the serialized main-process write boundary. Schema-v8 repository primitives delete or restore one exact Workspace/source row, count credential references globally, and atomically rebind an exact same-Workspace source allowlist from one expected reference to its replacement. Disconnect removes the row first, retains shared credential material while any reference remains, and restores the complete row if last-reference credential deletion fails. Google Connect cleans up a newly acquired unreferenced credential if row publication fails. Google Reconnect atomically rebinds the target plus a same-Workspace Ads/Keyword Planner sibling only when both use the exact old reference; old material is deleted only after a global zero-reference check. Repository lookup failures fail closed before OAuth acquisition or partial rebind.

Production Google API composition uses Electron `safeStorage` in the main process, PKCE desktop OAuth with a temporary loopback callback, refresh-token exchange, and per-request authentication decorators. `bootstrapGoogleOAuthInElectron` is the explicit browser bootstrap; `GoogleApiRuntimeFactory` provides Workspace-scoped GSC, Ads Search Terms, and Keyword Planner source modules plus confirmation-guarded live-smoke variants for normal Core execution. Short-lived access tokens are memory-only and authorization headers never enter Core snapshots or provenance. Google Ads developer-token material remains an optional encrypted compatibility value and is emitted only when present.

Normal Workspace Google Connect/Reconnect uses a main-owned OAuth credential acquirer with the system browser and loopback callback. Existing encrypted bundles may supply reconnect application configuration without crossing IPC. Normal first-connect application configuration remains unavailable until a separate approved main-owned configuration path exists. SerpApi API-key provisioning is composed through the main-owned native masked prompt and credential acquirer described above; renderer state contains no secret field, credential reference, clipboard action, native output, or generic process control.

SerpApi composition uses the same Workspace `credential_ref`/`CredentialStore` boundary and a single bounded `GET /search?engine=google` request per query Job. `SerpApiRuntimeFactory` creates source modules for existing Core orchestration; confirmation-guarded smoke construction never creates a second Run manager or persistence path. Raw provider JSON remains the canonical artifact, while first-page organic and provider-returned PAA rows are normalized separately.

The later manual smoke entry point is `npm run m3:live-serpapi -- --confirm-live-serpapi --workspace=<workspace_id>`. It runs in Electron, resolves the app-owned secure store and Workspace database, creates one Core Run/Job, and emits only safe lifecycle status; no live invocation is part of deterministic verification.

Workspace-owned reusable configuration is persisted as Saved Collection Presets and system-managed Last Run Settings. A temporary Run Draft resolves effective source-owned configuration without mutating its origin. New starts use one atomic repository reservation transaction that persists the immutable resolved Run Snapshot and updates Last Run Settings together; credentials remain outside all three stores.

The desktop surface has a generalized multi-source facade. `DesktopMultiSourceController` builds sanitized Workspace-scoped drafts and review summaries, gates included-source readiness before reservation, and delegates Run creation to the existing `reserveRunFromJobPlans` path. The renderer exposes HOME/RUNS/PRESETS/WORKSPACE navigation and source cards without credentials or raw provider payloads, plus explicit persisted-state-driven run actions such as resume, retry, manual continuation, and cancellation where Core reports them eligible. The renderer does not own collection, retry, reconciliation, or cancellation loops.

`DataPackage` exports keep source datasets separate and include a Run manifest, safe failure document, and Job-keyed dataset index. Production loading reads only completed Jobs with accepted validation and their exact accepted raw artifact, verifies file kind/state/ownership/size/SHA-256, and reuses the source's verified parser/normalizer. Each dataset file includes source/dataset/Job identity in its filename and index provenance, so repeated Jobs cannot overwrite one another. Export All may include safe failure context; Successful Only contains accepted datasets and provenance only. Raw artifacts remain immutable and no cross-source row join is performed.

`BLOG_WRITING_PACK` v1 is a thin single-Run specialization over the generalized Production Data Package boundary, not an Ads Task Package. Its fixed recipe admits only Google Trends `INTEREST_OVER_TIME`, GSC `QUERY_PAGE`, legacy Ads `SEARCH_TERMS`, Keyword Planner `KEYWORD_HISTORICAL_METRICS` from either API or manual CSV provenance, İkas `PRODUCTS`, Bitkimark `SITEMAP_URLS`, and SerpApi `GOOGLE_SERP`. Out-of-recipe Jobs do not affect Blog loading, failures, or coverage. Zero accepted in-recipe datasets is `NOT_READY`; otherwise publication is `COMPLETE` only when every logical family is covered and `PARTIAL` when any expected family is missing or incomplete.

Blog packages are immutable derived snapshots under `ApplicationDirectories.data/blog-writing-packs/<package_id>/`. Publication uses private staging, validation, and atomic final-directory rename. The package preserves generic `MANIFEST.json`/dataset evidence and adds `BLOG_PACKAGE.json` plus the fixed `BLOG_WRITING_PACK.xlsx`; raw provider artifacts remain authoritative in Run storage and are referenced through provenance rather than copied. Build/Open/Reveal remain local main-process operations, package opening accepts only trusted package identity, and Blog packaging creates no provider call, retry, Attempt, Run/Job mutation, SQLite table, or schema migration.

The Slice B Task Package layer is a separate source-neutral assembly boundary above accepted Run/Job/Attempt/Artifact evidence. A code-defined recipe asks the evidence resolver for compatible accepted datasets; the assembler does not authenticate, acquire, retry, or call a provider. `INITIAL_BASELINE` packages contain CURRENT only. Later `COMPARISON` packages load PREVIOUS only from checksum-verified CURRENT tables in the latest compatible, non-overlapping immutable Task Package.

Task Packages are published under `ApplicationDirectories.data/packages/<package_id>/` through a private staging directory and atomic final-directory rename. Package-derived JSON tables, the XLSX workbook, and schema-validated `MANIFEST.json` are derived outputs; original raw artifacts remain in their run-scoped locations. Generic recipe/resolver/assembler/store code owns compatibility, provenance, window, integrity, and publication rules. The Ads-specific exporter alone owns worksheet names and provider-native column allowlists.

The desktop Task Package controller is a source-neutral local orchestration boundary. Review resolves authoritative main-process Workspace/connection state and accepted evidence without acquisition. Start resolves that state again: complete evidence is assembled locally, while missing evidence reserves only the missing source Jobs through the existing Core Run/Job/Attempt lifecycle. Collection polling, accepted-evidence opening, and retry remain the existing Run Detail/Core responsibilities. Review, Start, and Open use exact trusted IPC contracts; Open accepts package identity only, and the main process resolves and opens the verified workbook path.

`ValidationCoordinator`/Core lifecycle owns validation invocation and artifact state transition. `CollectionValidatorRegistry` fails closed for invalid, duplicate, or unknown source IDs, and `CollectionOrchestrator` resolves a validator for each Job from `job.source_id`. Each source validator owns semantic checks.

Generic checks cover existence, readability, content signature, parseability, required provenance, and structural safety. Source checks cover dimensions, identifiers, date/context, metric domains, expected schema, completeness limitations, and source-mode semantics.

Validation findings carry structured detail. New operational failures should not be forced into the validation enum.

## 13. Source-specific architecture notes

İkas Products and Bitkimark Sitemap are independent source modules entering the existing Run → Job → Attempt → Artifact → Validation lifecycle. Neither source introduces QueryGroup assumptions or cross-source row merging.

### Google Trends

Current flow uses externally configured query groups, one sequential job per group, an app-owned Playwright profile, supported CSV capture, run-scoped storage, parser/validator, SQLite state, and structured export. Current production runner, desktop factory, and export implementation remain source-specific even though the shared Core now supports multi-source Runs.

### Google Search Console

The adapter will require official API acquisition, OAuth scope/property selection, dataset-specific dimensions, raw JSON preservation, row/pagination handling, and provider limitation metadata.

### Google Ads SEARCH reporting

The implemented `google-ads-search-reporting` source family is SEARCH-only and dispatches six independently tracked dataset Jobs:

- `CAMPAIGN_PERFORMANCE` → `campaign`;
- `AD_GROUP_PERFORMANCE` → `ad_group`;
- `KEYWORD_PERFORMANCE` → `keyword_view`;
- `SEARCH_TERMS` → `search_term_view`;
- `AD_PERFORMANCE` → `ad_group_ad`;
- `RSA_ASSET_PERFORMANCE` → `ad_group_ad_asset_view`.

The adapters share the existing Google Ads OAuth/customer transport boundary while keeping GAQL, parsing/normalization, semantic validation, and dataset provenance source-specific. Canonical REST SearchStream JSON is preserved before normalization.

The existing `google-ads-search-terms` quick-run path remains for compatibility. Core does not learn GAQL/resource semantics. Performance Max and other unapproved Google Ads modes remain outside this contract.

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
