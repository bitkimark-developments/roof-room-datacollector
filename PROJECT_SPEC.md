# RoofRoom Data Collector — Project Specification

**Document:** `PROJECT_SPEC.md`  
**Status:** Canonical Release 1.0 product specification
**Scope:** Stable product boundaries, verified source scope, integrity rules, and release acceptance criteria

---

## 1. Product definition

RoofRoom Data Collector is a local-first, modular desktop data-collection application.

Its governing workflow is:

> **Collect → Preserve → Validate → Document → Export**

The product collects trustworthy source evidence for later use. It is not an analysis or decision engine.

The Collector must not generate SEO strategy, keyword recommendations, blog-topic or page-type decisions, PDP/category/blog recommendations, SERP intent conclusions, or advertising, merchandising, and commercial decisions. Those activities belong to a separate downstream analysis or agentic layer.

## 2. Product goals

The application should:

1. reduce repetitive manual acquisition and export work;
2. host multiple independent source modules behind one shared Core;
3. prefer verified, supported acquisition paths;
4. preserve original provider evidence whenever practical;
5. trace every dataset to its source, run, job, attempt, request context, and raw artifact;
6. validate acquired or imported evidence before canonical acceptance;
7. expose incomplete, malformed, suspicious, unsupported, or blocked outcomes;
8. support safe resume and job-level retry without erasing attempt history;
9. preserve source-native meaning and missing-value semantics;
10. export structured data suitable for downstream analysis.
11. isolate each Run under exactly one first-class Workspace identity.

Reliability, auditability, and recoverability take priority over collection speed.

## 3. Architecture principle

RoofRoom Data Collector is:

> **One application with multiple independent source modules and shared Core infrastructure.**

The shared Core owns cross-source lifecycle concerns. A source module owns only its provider-specific acquisition, parsing, semantic validation, and operational error mapping.

Google Trends is the first implemented source and the reference browser-export module. It is not the entire product.

Adding a source should extend the application rather than create another unrelated collector. Separate runtimes are justified only by concrete security, licensing, compatibility, deployment, or isolation requirements.

## 4. Release 1.0 source scope

The source paths below passed feasibility checks using real provider, account, file, or endpoint evidence and are approved for implementation. **Feasibility approval does not mean the adapter is already implemented.** Current implementation status belongs in `PROJECT_HANDOFF.md`.

### 4.1 Google Trends

- Dataset: Interest Over Time.
- Primary acquisition: Playwright-controlled Google Trends UI and the provider-supported CSV export.
- Initial semantics: externally configured comparison groups, Turkey, All Categories, Web Search, Search Term.
- Status: feasibility **FINAL PASS**; implemented reference source.

Values from 0 through 100 are relative interest, not search counts. Independently normalized comparison groups retain group context and are not silently treated as globally comparable. Search Term and Topic datasets remain separate. Exact supported period behavior is defined by the live code and contracts, not inferred from historical documentation.

### 4.2 Google Search Console

- Primary acquisition: official Search Analytics API.
- `google-search-console-query`: query-level dataset using the `query` dimension.
- `google-search-console-query-page`: Query × Page dataset using `query` + `page`.
- Query and Query × Page remain separate source/data contracts.
- Native metrics: clicks, impressions, CTR, and average position.
- Query Current + Previous 28 Days creates two independent Jobs:
  - Current 28 complete days: today minus 28 days through yesterday.
  - Previous 28 complete days: today minus 56 days through today minus 29 days.
- Query × Page supports Current 28 Days, Current 90 Days, and Long 16 Calendar Months.
- Both GSC contracts reuse the same Workspace GSC connection, Site URL metadata, and OAuth credential boundary.
- Production Data Package output preserves query-only data as `QUERY` and Query × Page data as `QUERY_PAGE`.
- Missing numeric provider values remain `NULL`/blank and are never converted to zero.
- Raw Search Analytics response pages remain preserved separately from normalized output.
- Status: feasibility **FINAL PASS**; these collection, validation, reviewed-task, and Data Package contracts are implemented.

Privacy filtering, row limits, data latency, property identity, requested versus returned dimensions, exact requested date windows, and source identity must remain visible in provenance.

### 4.3 Google Ads Search Terms

- Primary acquisition: official Google Ads API.
- Verified source mode: `search_term_view`.
- Real rows were returned from the Bitkimark account for a SEARCH campaign.
- Status: feasibility **FINAL PASS**; implementation state is tracked separately.

The SEARCH proof must not be generalized silently to Performance Max or another materially different mode. An unverified mode must be routed to a separately proven acquisition contract or produce an explicit unsupported/manual state.

### 4.4 Google Ads Keyword Planner historical metrics

- Primary acquisition: official Google Ads API.
- Verified operation: `KeywordPlanIdeaService.GenerateKeywordHistoricalMetrics`.
- Verified response shape: keyword, average monthly searches, competition, competition index, and 12 monthly search-volume rows.
- Fallback: manual Keyword Planner CSV import.
- Status: API and file feasibility **FINAL PASS**; implementation state is tracked separately.

The verified manual file uses UTF-16 text, tab-separated fields despite a `.csv` extension, and provider metadata/segmentation rows before keyword rows. Blank metrics remain `NULL`; they are never converted to zero.

### 4.5 İkas product catalog

- Acquisition: manually exported Products XLSX imported into RoofRoom.
- Preserve the original workbook and normalize separately.
- Blank stock remains `NULL`, never zero.
- Status: feasibility **FINAL PASS**; implementation state is tracked separately.

### 4.6 Bitkimark public site

- Acquisition: standard HTTP and sitemap/XML.
- Verified structure: `sitemap.xml`, `blogs.xml`, `pages.xml`, `products.xml`, and `collections.xml`.
- Preserve `loc` and `lastmod` where supplied.
- Status: feasibility **FINAL PASS**; implementation state is tracked separately.

`lastmod` is provider evidence. It must not be transformed into an unsupported conclusion that page content definitely changed.

### 4.7 SERP

- Provider: SerpApi Free.
- Acquisition: explicit, on-demand query batches.
- A real Turkey/Turkish Google Search smoke test and account/free-quota behavior were verified.
- Status: feasibility **FINAL PASS**; implementation state is tracked separately.

SERP is not a continuous rank tracker and must not automatically query the entire keyword universe on every refresh.

The Collector may preserve query context, retrieval time, organic positions, title, URL, domain, snippet, provider feature data, raw JSON, and provider metadata. It must not derive dominant intent, commercial fit, recommended page type, `NEW BLOG`, `PDP FIRST`, or `CATEGORY FIRST`.

### 4.8 Excluded and future sources

Semrush is not an active Release 1.0 requirement because no current paid/API acquisition path has been verified. Historical references do not put it back on the implementation roadmap.

Merchant Center, GA4, Google Ads performance datasets beyond the verified Search Terms scope, and other providers are extensibility examples only. Each requires a separate feasibility and scope gate.

## 5. Acquisition vocabulary

| Acquisition mode | Release 1.0 use |
|---|---|
| `BROWSER_EXPORT` | Google Trends |
| `OFFICIAL_API` | Google Search Console; Google Ads Search Terms; Keyword Planner |
| `FILE_IMPORT` | İkas Products XLSX; Keyword Planner CSV fallback |
| `HTTP_XML` | Bitkimark public site |
| `THIRD_PARTY_API` | SERP through SerpApi |

Source identity, dataset identity, source mode, and acquisition mode are separate concepts. These names are architectural vocabulary; they do not by themselves rename current persisted values, TypeScript unions, SQLite fields, or IPC contracts.

## 6. Shared Core responsibilities

The Core conceptually owns:

- run and job management;
- immutable attempt history;
- resume, reconciliation, and retry coordination;
- source registration and capability discovery;
- browser lifecycle for sources that need a browser;
- credential and access lifecycle through a dedicated security boundary;
- freshness, due, and on-demand lifecycle;
- raw, candidate, accepted, rejected, and derived artifact lifecycle;
- storage and metadata/provenance;
- validation orchestration;
- structured logging and export coordination;
- desktop UI and trusted IPC coordination.

Credential and freshness responsibilities are required, but this specification does not require classes with particular names. They must be integrated compatibly with the existing Core rather than used as justification for a rewrite.

## 7. Security and provider policy

Acquisition preference is: supported official API; supported first-party export; controlled browser automation; explicit user intervention or file import where necessary.

The application must not store user passwords; put OAuth refresh tokens, API keys, developer tokens, client secrets, or passwords in ordinary config, logs, exports, or documentation; use the user's normal browser profile; copy sessions without explicit consent; bypass CAPTCHA, 2FA, anti-bot controls, quotas, or rate limits; use CAPTCHA solvers or proxy rotation for evasion; or depend on undocumented/private endpoints as the default when a supported path exists.

Authentication or security intervention is an operational state such as `MANUAL_ACTION_REQUIRED`, not a dataset validation result. Rate limiting or quota exhaustion must stop unsafe automatic progress.

## 8. Data-integrity rules

### 8.1 Raw evidence

Original provider evidence should be immutable whenever practical. Examples include Google Trends CSV, Google API raw JSON, SerpApi raw JSON, original İkas XLSX, imported Keyword Planner CSV, and downloaded sitemap/XML.

Parsing, normalization, or export creates separate representations. Rejected or suspicious evidence is not automatically deleted.

### 8.2 Missing values

Missing, blank, withheld, unavailable, and zero are distinct. A missing value remains `NULL` or an empty output cell. Zero is used only when the source actually returned zero.

### 8.3 Source semantics

Metrics from different providers remain separate and explicitly named. Google Trends relative interest, Keyword Planner estimates, GSC observed performance, Google Ads account metrics, catalog facts, and third-party SERP data must not be collapsed into an invented generic score or volume.

### 8.4 Requested and observed context

The requested date, geography, language, device, dimensions, selection mode, and source mode must remain distinguishable from provider-returned or observed context.

### 8.5 Execution and validation

A successful API response, HTTP request, browser interaction, download, or file import does not automatically make a valid dataset. Execution status and validation status remain separate domains.

## 9. Lifecycle

All acquisition modes participate in the same trust lifecycle:

```text
Plan job
→ acquire or import
→ preserve raw/candidate evidence
→ parse
→ validate
→ accept, warn, or reject
→ record provenance
→ export eligible data
```

Workspace, run, job, and attempt remain separate concepts. A Workspace identifies the brand/business boundary that owns a Run; every Run belongs to exactly one Workspace. A job is the independent resume/retry unit. A retry creates a new attempt and does not overwrite prior evidence. At most one Run may actively occupy a Workspace at a time.

`RETRY_REQUIRED` is a non-terminal Run state that releases the Workspace's active slot while preserving explicit retry eligibility. Reacquiring that slot, moving the eligible Job into execution, and creating the next Attempt must be one atomic operation. Restart discovery and reconciliation are scoped to an explicit Workspace.

Freshness/readiness are separate from execution: freshness answers whether work is due, stale, fresh, needed, or on demand; readiness answers whether access, credentials, input, and source prerequisites permit work; execution answers what happened during a job; validation answers whether the resulting dataset can be trusted.

## 10. Desktop product boundary

The desktop application should provide a non-technical workflow for seeing sources and their safe connection/readiness state; understanding freshness or import need; selecting configured work; starting explicit provider or import operations; viewing progress and operational stops; resuming or explicitly retrying eligible work; opening canonical evidence and accepted exports; and distinguishing raw technical archives from user-facing exports.

Provider credentials and sensitive content must not cross into the renderer except through strictly limited safe state. Workspace-owned connection metadata persists only safe source fields and a credential reference; readiness is source-specific and reports configuration/connection/manual states without exposing secrets.

Workspace selection, Saved Collection Presets, Last Run Settings, reviewed Run Drafts, explicit run controls, and Workspace-scoped connection/readiness state are implemented application capabilities over the shared Core. The renderer remains presentation-oriented: it may request these actions through trusted IPC but must not own collection execution, credential storage, or provider request construction.

### 10.1 UX and operations hardening contract

The desktop product must not expose a blocking state without an understandable reason and a direct user action when remediation is possible.

A user-facing readiness presentation should distinguish safe concepts such as:

```text
application/system health
connection required
input required
file/import required
manual action required
ready
```

without collapsing the underlying readiness, freshness, execution, and validation domains.

Workspace is the user-facing management surface for provider connections and safe account/property labels. Secret values remain behind the Core security boundary and must not be returned to the renderer.

Task editing must prefer structured controls over compact developer-oriented mini-languages. Bulk paste/import may remain as an optional convenience, but the canonical reviewed artifact must be built from explicit validated user input.

Run history must communicate task/source, execution state, validation state, time, failure/retry state, evidence, and export actions without requiring the user to interpret internal IDs as the primary label.

Presets are reusable configurations and therefore require a truthful create, inspect, edit, save, reopen, review, and run lifecycle. Destructive preset deletion must be explicit and confirmed.

Navigation and Workspace changes must not silently discard or cross-contaminate unsaved task/preset edits.

## 11. Storage and provenance

Canonical application state and raw run evidence use a deliberate application-owned location. A user-visible Downloads directory may contain intentional exported/copied files, but it is not the authoritative datastore.

Every accepted dataset must be traceable through stable identifiers to source and dataset semantics; acquisition/source mode; run, job, and attempt; requested and observed context; raw artifact and checksum where available; retrieval/import time; validation outcome; and application/schema version where applicable.

Physical paths and exact database fields are governed by the live implementation and `DATA_CONTRACTS.md`.

## 12. Testing policy

Normal unit, integration, regression, and CI tests must not call live providers. They use fixtures, mocks, fake source modules, and controlled local dependencies.

Live provider tests are explicit, limited, manual or separately invoked, and quota-aware. They verify access, response structure, parsing, and provenance rather than unstable exact business metrics.

SerpApi quota must not be consumed automatically. Google Ads, GSC, or Keyword Planner calls must not run in ordinary regression loops. Google Trends live actions remain explicitly guarded. Sanitized fixtures must come from observed provider behavior, not invented schemas presented as evidence.

## 13. Source implementation gate

```text
feasibility/acquisition proof
→ source and dataset contract
→ explicit implementation permission
→ one end-to-end vertical slice
→ deterministic regression coverage
→ limited live acceptance evidence
→ release integration
```

No source is blocked merely because Google Trends must be “finished first.” It is blocked when its own feasibility, contract, permission, integrity, or test gate is missing.

## 14. Release 1.0 acceptance criteria

Release 1.0 is complete only when:

1. every in-scope adapter is actually implemented and implementation is not confused with feasibility;
2. each implemented source uses the shared run/job/attempt and artifact lifecycle;
3. every source has real or sanitized evidence-based fixtures;
4. raw evidence and provenance are preserved;
5. missing values remain missing;
6. requested and observed context are distinguishable;
7. source-specific validation prevents suspicious evidence from canonical acceptance;
8. operational access/quota failures remain separate from validation;
9. safe resume/retry behavior is verified where supported;
10. exports preserve source identity and metric semantics;
11. credential and freshness responsibilities are implemented through Core-compatible boundaries;
12. the desktop workflow exposes supported sources without leaking secrets;
13. automated regression makes no live-provider requests;
14. explicit live smoke evidence exists for each implemented acquisition path;
15. unsupported source modes fail visibly rather than claiming completeness.

The existing Google Trends MVP remains a completed reference slice only to the extent proven by live code and tests. It does not satisfy the multi-source Release 1.0 gate by itself.

## 15. Document authority

- `PROJECT_HANDOFF.md` records live repository state and the exact next action.
- `ARCHITECTURE.md` records component boundaries and dependency direction.
- `DATA_CONTRACTS.md` records identifiers, states, null semantics, and provenance contracts.
- `VALIDATION_SPEC.md` records generic and source-specific validation behavior.
- `TEST_STRATEGY.md` records deterministic and live-test gates.
- `SOURCE_MODULE_GUIDE.md` records source onboarding and module boundaries.
- `DECISIONS.md` preserves architecture decision history and supersession.

Fast-changing progress must not be written into this specification.

## 16. Governing product rule

The primary quality metric is not how much data the application collects. It is how reliably the evidence can be traced, preserved, validated, reproduced, audited, and exported without losing source meaning.
