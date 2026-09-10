# RoofRoom Data Collector — Source Module Guide

**Status:** Canonical source onboarding and responsibility guide
**Audience:** Engineers adding or reviewing source modules

---

## 1. Governing rule

> A source module owns source-specific acquisition, parsing, validation, and error mapping. Shared lifecycle belongs to Core.

Google Trends is the first implemented/reference browser-export module. It is an example, not a template that forces every source through query groups, Playwright, CSV, or Google-Trends-specific metadata.

## 2. Source onboarding gate

A source may be implemented only through:

```text
feasibility/acquisition proof
→ source, dataset, and mode contract
→ explicit implementation permission
→ one end-to-end vertical slice
→ deterministic regression coverage
→ limited explicit live acceptance
→ release integration
```

The former “finish Google Trends before any other source” gate is superseded. A new source is gated by its own proof and contract, not by its position in a historical roadmap.

## 3. Release 1.0 approved source families

Feasibility has passed for:

- Google Trends Interest Over Time;
- Google Search Console query, query+page, and date+query;
- Google Ads Search Terms through verified `search_term_view` for SEARCH;
- Google Ads Keyword Planner historical metrics through the official API;
- Keyword Planner manual CSV fallback;
- İkas Products XLSX import;
- Bitkimark sitemap/public XML;
- on-demand SERP through SerpApi.

Feasibility PASS is implementation permission, not implementation completion. Semrush is not active R1 scope. Merchant Center, GA4, and other future sources require their own gates.

## 4. Identity model

Keep these concepts distinct:

- **source identity:** logical provider/source family;
- **dataset identity:** the provider dataset being collected;
- **source mode:** a materially distinct provider path/resource/semantic mode;
- **acquisition mode:** browser export, official API, file import, HTTP/XML, or third-party API.

Do not invent or rename persisted source IDs, enums, or database fields before inspecting `src/shared`, `src/main/storage`, source registration/composition, configuration, IPC, and stored-data compatibility.

## 5. Current module interfaces

The current live repository defines:

- `DataSourceModule` for identity, capabilities, and readiness;
- `CollectingDataSourceModule` for `collect(context)`;
- `CollectionValidator` for source validation;
- `SourceRegistry` for lowercase-hyphenated IDs;
- `CollectionValidatorRegistry` for fail-closed source-keyed validator lookup;
- `CollectionOrchestrator` for current run/job/attempt/artifact lifecycle.

The shared collection and validation contexts carry persisted JSON-compatible `source_context` without requiring a `QueryGroup`. SQLite schema version 5 allows `query_group_id = NULL` and one Run may contain Jobs from multiple source IDs. Collection and validator lookup both use each persisted Job's source identity. The Google Trends adapter reconstructs and validates its own query-group semantics from source context. Production Run configuration and desktop composition remain Google-Trends-shaped in places; new sources must not fill unrelated fields with invented values.

## 6. Required source responsibilities

A source module may own:

- capability/readiness declaration;
- conversion of an approved source request into source-specific job inputs;
- provider/API/browser/file/HTTP interaction;
- bounded pagination or multi-file behavior defined by the source contract;
- raw response/file capture;
- source-specific parsing;
- observed metadata extraction;
- semantic validation;
- mapping provider conditions into safe operational results.

A source module must not:

- create its own parallel run/attempt database;
- write outside StorageManager-approved boundaries;
- overwrite raw evidence;
- accept its own data without the Core validation lifecycle;
- hide retries, refreshes, quota consumption, or provider failures;
- expose secrets to renderer/UI/logs;
- transform missing values into zero;
- generate strategy, intent, or commercial recommendations.

## 7. Core integration responsibilities

Use existing Core for run/job/attempt state, reconciliation, resume/retry, source registration, storage, metadata/provenance, validation coordination, logging, export, and desktop/IPC coordination. Register each collecting module in `SourceRegistry` and its validator under the identical source ID in `CollectionValidatorRegistry`; missing, duplicate, and invalid mappings fail closed.

Credential/access and freshness/due are locked Core responsibilities. Their exact implementation may use compatible components rather than mandatory class names. A source declares needs and consumes safe services; it does not build its own secret store or scheduler.

## 8. Readiness, freshness, execution, and validation

These are separate domains:

- readiness: prerequisites, configuration, file availability, access, authentication;
- freshness: fresh, due/stale, import needed, on demand, unknown;
- execution: what happened during this attempt;
- validation: whether resulting evidence is trustworthy.

Do not encode a quota error as `NO_DATA`, an authentication error as `INVALID_SCHEMA`, or an on-demand policy as a failure.

Current implemented status values in `DATA_CONTRACTS.md` remain authoritative until explicitly migrated.

## 9. Raw evidence and provenance

Every acquisition/import should preserve faithful raw evidence when practical:

- original CSV/XLSX/XML bytes;
- raw API/third-party JSON or an equivalently faithful serialized response;
- request-safe provider metadata;
- retrieval/import time;
- source/dataset/mode/acquisition identity;
- requested and observed context;
- run/job/attempt linkage;
- checksum and byte size where available.

Normalized/derived output is separate. Rejected evidence remains available for audit unless a separately documented retention/security policy requires otherwise.

## 10. `BROWSER_EXPORT` pattern

Use for Google Trends and only for sources with a verified browser-export path.

Requirements:

1. acquire a browser page through shared browser lifecycle;
2. use the application-owned persistent profile;
3. verify provider state before and during interaction;
4. use evidence-based semantic controls and bounded waits;
5. capture supported provider download bytes directly into the candidate lifecycle;
6. close only source-owned pages and allow Core to own browser shutdown;
7. return structured, redacted diagnostics;
8. stop on manual action, rate limit, or security controls without bypass/retry/refresh loops.

## 11. `OFFICIAL_API` pattern

Use for GSC and Google Ads API sources.

Requirements:

1. obtain scoped credentials through the Core security boundary;
2. declare account/property/customer and API scope prerequisites without exposing secrets;
3. build requests from explicit job context;
4. bound pagination and preserve response/request provenance;
5. preserve raw JSON before normalization where practical;
6. map OAuth/access/quota/provider failures to operational outcomes;
7. validate source-specific dimensions and metrics;
8. never use development-only ADC/gcloud state as an undocumented production dependency.

## 12. `FILE_IMPORT` pattern

Use for İkas Products and Keyword Planner CSV fallback.

Requirements:

1. validate user-selected path through privileged main-process code;
2. copy original bytes into run-scoped evidence before parsing;
3. determine format from content/evidence, not extension alone;
4. record original name, media type, size/checksum, and import time;
5. parse with source-specific encoding/delimiter/workbook rules;
6. preserve blanks as null;
7. reject corrupt, unrelated, or unknown schemas;
8. keep imported and API acquisition provenance distinct.

## 13. `HTTP_XML` pattern

Use for Bitkimark public sitemaps.

Requirements:

1. issue bounded standard HTTP requests to allowlisted expected hosts/URLs;
2. preserve status, content type, requested/final URL, retrieval time, and raw bytes;
3. reject HTML/error content masquerading as XML;
4. parse sitemap index and child URL-set semantics;
5. preserve `loc`, nullable `lastmod`, and parent-child relationship;
6. do not infer business change from `lastmod` alone;
7. avoid unbounded site crawling outside the approved sitemap contract.

## 14. `THIRD_PARTY_API` pattern

Use for explicit SerpApi batches.

Requirements:

1. obtain API key through the Core credential boundary;
2. declare and check safe quota/readiness state;
3. run only explicitly requested on-demand batches;
4. preserve raw JSON and provider metadata;
5. validate query/country/language/device and returned organic result structure;
6. distinguish fewer/no results from quota/provider failure;
7. never add intent, page-type, commercial-fit, or action recommendations;
8. never run as an automatic continuous rank tracker.

## 15. Validation integration

The source validator receives the candidate artifact and trusted Core context, then returns deterministic status plus structured findings. `CollectionOrchestrator` resolves that validator from `job.source_id` for every attempt; shared Core must not select validators through provider-specific branches or one Run-wide default.

Generic checks remain reusable. Source checks use stable namespaced IDs. Unsupported schema/mode fails visibly. Requested fields cannot be copied into observed fields without provider evidence.

Only Core coordinates artifact acceptance and accepted-artifact references.

## 16. Error and retry mapping

Map errors at the narrowest truthful boundary:

- source/configuration not ready;
- authentication/access/manual action;
- rate limit/quota;
- network/provider response;
- browser UI contract;
- download/import;
- parse/schema;
- semantic validation;
- storage/persistence.

Retryability is policy, not optimism. Source modules do not automatically retry live providers. A Core-approved retry creates a new attempt and preserves prior evidence.

## 17. Source-specific notes

### Google Trends reference

The current implementation demonstrates browser lifecycle, externally configured jobs, sequential collection, direct provider-byte capture, run-scoped raw storage, validation, resume/retry, diagnostics, desktop workflow, and structured export. Reuse its Core integration patterns, not its provider selectors or query-group assumptions.

### GSC

Separate dataset dimensions and property/search-type context. Preserve provider limits and latency. Pagination and empty data require explicit semantics.

### Google Ads Search Terms

The verified implementation target is `search_term_view` for SEARCH. Treat Performance Max or another resource as a separate mode gate.

### Keyword Planner

Official API is primary; UTF-16 tab-separated manual CSV is fallback. Both normalize only after raw preservation and retain distinct acquisition provenance.

### İkas Products

Map exact fields only from a sanitized real workbook. Preserve blank stock as null.

### Bitkimark public site

Limit acquisition to the approved sitemap/XML scope unless a new feasibility contract expands it.

### SERP

On-demand batch only. Preserve provider evidence; do no downstream analysis.

## 18. Required test package

Every source adds:

- readiness/capability tests;
- parser tests from sanitized evidence;
- source-semantic validation tests;
- missing/null and malformed/non-data tests;
- operational error mapping tests;
- raw preservation/provenance tests;
- fake/mocked Core vertical-slice integration;
- resume/retry/cancellation tests where supported;
- renderer/IPC tests when exposed;
- export eligibility tests;
- a separately guarded minimal live smoke command where needed.

Normal automated tests and CI never call live providers.

## 19. Definition of done

A source is complete only when:

1. feasibility and source contract are documented;
2. one real end-to-end vertical slice uses the shared Core;
3. canonical raw evidence is preserved before transformation;
4. parser and validator fail closed;
5. credential/readiness/freshness behavior is explicit;
6. persisted state and provenance are complete;
7. deterministic tests pass without live calls;
8. explicit limited live smoke evidence passes;
9. desktop/export integration is truthful and usable;
10. unsupported modes are visible;
11. no secret or private production payload is committed;
12. `PROJECT_HANDOFF.md` records actual, not planned, implementation state.

## 20. Governing module rule

Preserve one Core lifecycle across every acquisition mode, while keeping provider semantics, credentials, raw evidence, and validation inside clear source-specific boundaries.
