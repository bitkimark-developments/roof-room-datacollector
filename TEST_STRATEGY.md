# RoofRoom Data Collector — Test Strategy

**Status:** Canonical multi-source test strategy
**Primary rule:** Normal automated tests never call live providers

---

## 1. Goals

Testing must prove that the application:

- preserves source evidence and semantics;
- keeps run/job/attempt state coherent;
- rejects malformed, suspicious, or mismatched data;
- never replaces missing values with zero;
- separates operational failure from validation;
- resumes/retries without erasing history;
- keeps credentials and privileged operations outside the renderer;
- integrates independent source modules through shared Core;
- can be verified deterministically without spending provider quota.

## 2. Test categories

### Unit

Pure parsing, validation, state transitions, ID/path rules, freshness calculations, readiness mapping, error mapping, and serializers.

### Integration

SQLite, filesystem storage, orchestration with fake sources, configuration adapters, import pipelines, API client boundaries with mocks, local HTTP/XML behavior, IPC, export, and desktop controller behavior.

### Renderer/UI

Source selection, freshness/readiness display, input validation, progress, manual-action/error states, resume/retry intent, import selection, and file-access behavior through mocked IPC.

### Packaging/release

Type checks, lint, deterministic suites, package composition, Electron security boundary, schema integrity, and source-specific gates.

### Live provider smoke

Explicit, separately invoked, minimal, quota-aware checks using approved accounts/requests. They are not normal regression tests.

## 3. Non-negotiable live-provider policy

Unit, integration, regression, release-gate, and CI commands must not call Google Trends, GSC, Google Ads, Keyword Planner, SerpApi, or any other live provider.

Live commands must:

1. require explicit invocation/confirmation;
2. state which provider and approximate call scope they use;
3. make the minimum request needed for the evidence goal;
4. stop on authentication, manual action, rate limit, or quota exhaustion;
5. avoid automatic retry, refresh, or evasion;
6. record safe structure/provenance evidence without leaking secrets;
7. avoid assertions on unstable exact business metric values.

SerpApi quota must never be consumed by an automated refresh or regression loop. Google Ads/GSC/Keyword Planner must not be repeatedly called while fixing deterministic tests.

## 4. Fixture policy

Fixtures are sanitized representations of observed provider behavior. A hand-written model may test internal code, but it must not be described as proof of provider schema.

Each fixture records, in a nearby README or manifest where practical:

- source and dataset;
- acquisition/source mode;
- evidence origin and sanitization date;
- removed sensitive fields;
- encoding/delimiter/media type;
- important provider limitations;
- expected parser and validation result.

Fixtures must not contain OAuth tokens, API keys, developer tokens, passwords, cookies, private account identifiers that are not necessary, or production secrets.

## 5. Shared Core suite

The deterministic Core suite covers:

- run creation, transition, aggregation, completion, cancellation, and manual action;
- job ordering, independent failure, validation state, and accepted artifact references;
- immutable attempt creation and retry history;
- schema-v6 Workspace migration and required Run ownership;
- database-backed one-active-Run enforcement across repository connections and restart;
- SQLite migrations, foreign keys, strict status values, and integrity checks;
- collision-safe raw storage, SHA-256/byte size, path containment, and immutability;
- metadata and validation persistence;
- sequential orchestration with fake sources;
- reconciliation and resume behavior;
- explicit retry limits;
- atomic Workspace retry reacquisition, Job transition, and Attempt creation with rollback on conflict;
- Workspace-scoped incomplete-Run discovery and cross-Workspace fail-closed resume planning;
- structured log redaction;
- renderer/main/preload privilege boundaries;
- export eligibility and provenance.

Multi-source Core tests include jobs that do not naturally have a Google Trends query group. Chained schema-v4/v5/v6 migration preservation, nullable `query_group_id`, persisted source context, Workspace ownership, and the fake JSON source lifecycle are deterministic release-gate coverage; no placeholder query group is used.

The deterministic multi-source Run gate uses two independently registered fake sources and validators in one persisted Run. It proves truthful selected-source membership, per-Job collector/validator dispatch, same-key cross-source identity, continuation after a middle Job failure, restart/reconciliation, failed-only attempt-2 retry, immutable rejected evidence, and source/job/attempt-correct provenance. The validator-registry gate separately proves invalid and duplicate registrations, and unknown lookups, fail closed.

## 6. Acquisition-mode suites

### Browser export

Deterministic tests cover selector/control contracts, bounded waits, provider-state mapping, direct byte capture, no unauthorized refresh/retry, source page cleanup, and fail-closed diagnostics. Live browser smoke remains explicit.

### Official API

Tests use mocked clients or sanitized response fixtures for pagination, dimensions, request mapping, error/auth/quota mapping, raw JSON preservation, cancellation, and provenance. No live OAuth or API call occurs in ordinary tests.

### File import

Tests use local fixtures for file selection boundaries, original-byte preservation, MIME/signature checks, encoding/delimiter detection, workbook/CSV parsing, malformed input, null behavior, duplicate import/collision policy, and provenance.

### HTTP/XML

Tests use XML fixtures or a controlled local HTTP server for status/content mismatch, malformed XML, sitemap index/child relationships, URL validation, duplicate rows, missing `lastmod`, and raw response preservation.

### Third-party API

Tests use mocked SerpApi responses for success, fewer/no organic results, provider errors, quota mapping, context, raw JSON, and no analysis fields. They never spend real search quota.

## 7. Source-specific deterministic matrix

### Google Trends

Keep all current deterministic suites covering provider state/probe, query controls, geography, date period/range/dialog, fixed filters, download selection/capture, parser, validation, collecting source, runtime composition, Core persistence, batch flow, desktop workflow, export, and UI diagnostics.

Current test IDs and scripts in the repository remain evidence; documentation does not renumber them. New period changes must update contract, UI, propagation, date derivation, validation cadence, and resume snapshot tests together.

### Google Search Console

Required coverage:

- query, query+page, and date+query request/response contracts;
- OAuth/readiness mapping without live access;
- pagination/row handling;
- metric and dimension parsing;
- empty response versus operational failure;
- requested/observed date and property provenance;
- raw JSON preservation and validation.

### Google Ads Search Terms

Required coverage:

- GAQL/request mapping for verified `search_term_view` mode;
- SEARCH campaign rows;
- unsupported/unverified campaign mode surfaces visibly;
- native metrics/nulls and date context;
- API error/auth/quota mapping;
- raw response and provenance.

### Keyword Planner

Required API coverage includes historical-metrics request mapping, keyword identity, average searches, competition/index, monthly rows, nullable bid/volume fields, and operational error mapping.

Required import coverage includes UTF-16, tab delimiter despite `.csv`, leading provider metadata/segmentation rows, blank metric `NULL`, unrelated/malformed input, original-byte preservation, and API/import provenance distinction.

### İkas Products

Required coverage includes valid real-shape workbook, blank stock, product/variant identity, missing required fields, corrupt workbook, original preservation, normalized linkage, and no missing-to-zero conversion.

### Bitkimark public site

Required coverage includes sitemap index, blogs/pages/products/collections children, `loc`, nullable `lastmod`, malformed XML, HTML error content, duplicate/foreign URLs, HTTP failures, and provenance.

### SERP

Required coverage includes successful organic results, fewer results, no organic results, provider error, quota exhaustion, query/country/language/device context, nullable fields, raw JSON, and a regression assertion that Collector output contains no intent or recommendation fields.

## 8. Credential and freshness tests

Credential boundary tests must prove:

- secrets do not appear in renderer IPC, logs, docs, configuration snapshots, validation findings, or exports;
- missing/expired/denied access maps to safe readiness/operational states;
- development-only credentials are not an implicit production runtime dependency;
- source modules receive access through a controlled Core boundary.

Freshness tests must prove:

- fresh, due, stale/import-needed, on-demand, and unknown semantics are deterministic;
- readiness and freshness are independent;
- SERP on-demand policy does not schedule all-keyword refresh;
- clock-dependent logic uses an injected/fixed clock;
- successful collection/import updates freshness only after the required acceptance boundary.

The implemented states are `FRESH`, `DUE`, `STALE`, `IMPORT_NEEDED`, `ON_DEMAND`, and `UNKNOWN`; policy kinds are `UNKNOWN`, `ON_DEMAND`, `MANUAL_IMPORT`, and `INTERVAL`.

## 9. Validation and integrity tests

Every source must test:

- valid evidence;
- zero-byte/non-data/error content;
- malformed or changed schema;
- missing required identity;
- missing numeric values remaining null;
- true zero remaining zero;
- requested/observed mismatch;
- rejected artifact excluded from normal export;
- accepted-with-warning retains warning;
- raw bytes/checksum unchanged after parse/export;
- validation result and execution result remain distinct.

## 10. Resume/retry tests

Source integration must prove:

- completed accepted jobs are not recollected;
- interrupted attempts reconcile before new work;
- failed-job retry creates a new attempt;
- old artifacts and errors remain preserved;
- manual action does not create an unauthorized automatic retry;
- rate-limited/quota-exhausted sources do not loop;
- file-import retry does not overwrite the original artifact;
- multi-source runs can make safe progress without corrupting another source's state.
- a source-specific validator is never reused for another source merely because both Jobs belong to one Run.

## 11. UI and IPC tests

Connection/readiness infrastructure is covered by deterministic v8 migration and Workspace readiness vertical-slice tests. They verify isolation, duplicate logical connection enforcement, credential availability states, unsupported-source fail-closed behavior, and secret-free persistence.

Freshness coverage uses a fixed clock and schema-v8 accepted Job history. It verifies exact due/stale boundaries, manual-import/on-demand/unknown policies, Workspace/source isolation, invalid policy and timestamp rejection, repository reopen, no advancement before accepted Job completion, readiness independence, and separate renderer labels. It performs no provider request and starts no scheduler.

Google request-composition tests use a deterministic `safeStorage` adapter and fake HTTP responses to verify encrypted-at-rest credential files, PKCE material, browser-bootstrap composition, form-encoded refresh exchange, bearer and Ads headers, bounded explicit live guards, reauthorization state, missing-credential failure, and absence of secret propagation. They never open a browser or call Google.

SerpApi source coverage uses sanitized deterministic JSON and fake credentials/transport to verify one request per query, Workspace isolation, Türkiye/Turkish/Desktop parameters, exact raw preservation, first-ten organic/PAA normalization, nullable fields, readiness, quota/timeout stop behavior, and independent query-level Job plans. No SerpApi request runs in deterministic tests.

The guarded `m3:live-serpapi` command has a deterministic argument test proving unconfirmed or unbounded invocations exit before Electron/provider activity.

The Workspace preset checkpoint is covered by deterministic schema-v7 migration and repository reservation vertical-slice tests, including Workspace isolation, preset immutability, atomic Last Run update/rollback, immutable resolved snapshots, and reopen persistence.

Generalized desktop coverage uses a compact controller integration test for heterogeneous source planning, readiness blocking, Workspace-scoped draft sanitization, and reservation, plus a package test for separate datasets, manifest/failure evidence, Successful Only filtering, and NULL preservation. Existing UI smoke remains a localhost-only renderer check; no provider requests are part of these tests.

UXH2-B adds dedicated deterministic coverage for the read-only Workspace connection boundary: preload invokes only the allowlisted `DESKTOP_CONNECTIONS` channel, the trusted main handler rejects invalid Workspace IDs before delegation, production composition supplies the real credential-availability reader, and the Workspace renderer shows credential status separately from readiness while negative sentinel credential references/secrets remain absent from the DOM. These focused tests are part of `npm run test:release:gate`.

Test safe source summaries, readiness/freshness distinction, selection/import input, start/cancel/resume/retry intent, progress and validation display, unsupported/manual/quota states, canonical file opening, export opening, and strict rejection of invalid renderer inputs.

The renderer must not receive tokens, API keys, unrestricted paths, raw account payloads, or browser objects.

## 12. Export tests

Deterministic non-Google source coverage includes one İkas XLSX raw-preservation/parser/validator slice covering the production 40-column mapping, label-based variant attributes, nullable sale price/stock, URL-vs-image separation, and source-native availability, plus one Bitkimark XML inventory/annotation/validator slice; live provider requests remain excluded from routine gates.

The guarded Bitkimark live-sitemap command has a deterministic `BITKIMARK-LIVE-CMD-001` test. It proves exact confirmation and HTTPS URL validation before fetch, one-request/no-retry behavior, raw-byte hash/size preservation, parser/validator acceptance and annotation counts, safe summary output, and controlled HTTP failure handling. The command itself is acceptance-only and is never run by deterministic gates.

Exports must:

- include only eligible accepted/accepted-with-warning data;
- preserve source/dataset/acquisition labels;
- keep provider-native metric names and units;
- preserve query/comparison and requested/observed context;
- keep missing cells empty and real zeros numeric;
- link provenance to raw evidence;
- distinguish separate sources/sheets/tables;
- refuse unsafe overwrite/collision;
- never turn Downloads into canonical raw storage.

Generic production Data Package coverage must exercise every implemented Release 1.0 source through its accepted raw artifact and verified native parser/normalizer. It must also prove exact Job/source binding, same-source multi-Job filename separation, persisted dataset provenance, NULL preservation, terminal-Run enforcement, rejection of changed bytes/checksums and mismatched identities, failed/rejected omission from normalized datasets, and safe failure retention in Export All. These tests use sanitized local fixtures and make no provider request.

## 13. Commands and gate design

The current `package.json` exposes focused deterministic scripts and `npm run test:release:gate`. Existing script names remain valid until implementation changes them.

Every future source adds:

- focused parser/validator tests;
- acquisition-boundary tests;
- Core vertical-slice integration tests;
- UI/IPC tests where exposed;
- its deterministic script to the relevant release gate;
- a separately guarded live smoke command, if live evidence is required.

Every source composition used by `CollectionOrchestrator` also registers its validator under the same source ID. A missing validator is a fail-closed composition error.

No ordinary gate may invoke that live command.

## 14. Development stage gate

For each implementation slice:

```text
repository/live-contract audit
→ bounded implementation plan
→ focused deterministic RED
→ confirm the failure is the intended failure
→ minimal implementation
→ focused GREEN
→ relevant regressions
→ typecheck / lint / diff check
→ full deterministic release gate at the coherent slice boundary
→ package/smoke when IPC, preload, packaging, privileged file/connection behavior, or integrated packaged journeys changed
→ review diff
→ technical commit
→ handoff/documentation checkpoint
→ fast-forward local main
→ post-merge verification
→ limited explicit live smoke only when separately required and authorized
```

Expensive verification is batched at coherent boundaries rather than after every small edit. A broad failing gate triggers systematic debugging: reproduce, inspect evidence, trace the root cause, test one hypothesis, apply the smallest justified fix, then rerun the affected verification.

Test results are recorded as PASS only when the exact command ran successfully. Historical results remain historical and must be labeled with their checkpoint/date.

## 15. Release 1.0 gate

Release 1.0 requires:

1. Core deterministic suite passing;
2. each in-scope implemented source's fixture/parser/validator/acquisition integration passing;
3. credential and freshness boundaries passing;
4. renderer/IPC and export integrity passing;
5. package/build checks passing on the target environment;
6. separately approved live smoke evidence for every implemented acquisition path;
7. no live provider call in automated regression/CI;
8. no unverified source mode presented as complete;
9. no secrets in repository or test artifacts;
10. exact command evidence recorded in `PROJECT_HANDOFF.md`.

Google Trends passing alone is a source checkpoint, not the complete multi-source Release 1.0 gate.

Target-mac packaging acceptance is separate from the deterministic release gate. It requires a fresh `npm run package`, an actual `.app` artifact, valid local code-signature structure, packaged external runtime dependencies, and an isolated launch from outside the repository so local `node_modules` cannot mask a missing packaged dependency. Apple Developer ID signing and notarization remain separate distribution credentials, not prerequisites for local R1 acceptance.

## 16. Governing test rule

Prefer deterministic evidence. Use live providers only for the smallest explicit proof that cannot be established locally, and never turn an external account or quota into a routine regression dependency.

## 17. UX & Operations Hardening test program

The post-R1 UX/Operations Hardening program adds deterministic user-journey coverage without weakening the existing source/data-integrity gates.

Required slices and primary proofs:

- **UXH0 Reality Lock:** no feature-code change; repository/UI capability matrix must be evidence-based.
- **UXH1 Status & Remediation:** every blocking readiness presentation has a reason and remediation action; readiness and freshness remain independent.
- **UXH2 Workspace Connections:** the safe read-only connection state is already covered through trusted IPC and renderer leak-negatives; future connect/manage/disconnect actions must remain behind privileged IPC/Core boundaries; secrets never reach renderer/log/export.
- **UXH3 Task Detail Remediation:** no supported task ends at a dead-end `CONFIGURATION REQUIRED` state.
- **UXH4 Structured Editors:** Keyword Planner/SerpApi add/edit/remove and duplicate/empty validation are deterministic; Review receives the exact normalized user intent.
- **UXH5 File Import UX:** selected file preview/replace/remove is deterministic; path privileges remain in main/Core; original bytes remain unchanged.
- **UXH6 Bitkimark Selector:** only approved sitemap URLs can be selected through the primary UI; selected count equals planned request count.
- **UXH7 Run History/Detail:** task/source, execution state, validation state, failure reason, retry, evidence, and export actions derive from persisted Core state.
- **UXH8 Task Recent Runs:** Workspace + task/source filtering is correct and cannot leak another task/workspace history.
- **UXH9 Presets:** create/edit/rename/duplicate/delete/reopen/review/run is covered; delete confirmation and persisted content are verified.
- **UXH10 Editing Safety:** navigation/workspace changes do not silently discard or cross-contaminate dirty edits.
- **UXH11 Source Context:** safe property/account/scope/request/file information is displayed without secret leakage.
- **UXH12 Dashboard:** summary counts derive from the same readiness/run/freshness truth as task/run surfaces.
- **UXH13 Polish:** accessibility/readability changes must not alter machine contracts.
- **UXH14 Integrated Gate:** packaged end-to-end connection/configure/review/run/evidence/export, file-import, failure/retry, preset, and Workspace-isolation journeys pass.

For renderer/main boundary changes, tests must include invalid IPC input and privilege-boundary negatives.

For credential UX changes, assert that OAuth tokens, API keys, developer tokens, client secrets, passwords, unrestricted paths, and raw account payloads never enter renderer state, logs, validation findings, configuration snapshots, or exports.

For editing flows, use fixed deterministic inputs; do not rely on live providers.

At coherent UXH slice boundaries run focused GREEN, relevant regressions, typecheck, lint, `git diff --check`, and the full deterministic release gate. Run packaging/smoke when IPC, preload, packaging, privileged file/connection behavior, or final integrated user journeys change.
