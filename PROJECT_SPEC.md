# RoofRoom Data Collector — Project Specification

**Status:** Canonical product and Release 1.0 scope
**Scope:** Stable product boundary, source scope, integrity requirements, package boundaries, and release acceptance

---

## 1. Product definition

RoofRoom Data Collector is a local-first, modular desktop data-collection and evidence-packaging application.

Its governing workflow is:

```text
Collect
→ Preserve
→ Validate
→ Normalize where deterministic
→ Document
→ Package
→ Export
```

Normalization and packaging are downstream representations. They never replace authoritative raw provider evidence.

RoofRoom collects trustworthy provider evidence for downstream use.

It is not an analysis, SEO, advertising, merchandising, scoring, recommendation, strategy, or decision engine.

---

## 2. Product goals

RoofRoom should:

1. reduce repetitive acquisition/import work;
2. support independent source modules behind one source-neutral Core;
3. prefer verified and supported acquisition paths;
4. preserve original provider evidence whenever practical;
5. keep every accepted dataset traceable through Workspace, Run, Job, Attempt, artifact, validation, request, and observation context;
6. validate before canonical acceptance;
7. surface unsupported, malformed, blocked, partial, or unavailable outcomes truthfully;
8. preserve retry/resume history;
9. preserve provider-native meaning and missing-value semantics;
10. produce provenance-preserving packages/exports without becoming an analysis layer.

Reliability, auditability, reproducibility, and recoverability take priority over collection speed.

---

## 3. Product architecture boundary

RoofRoom is:

> **One desktop application with multiple independent source modules sharing one Core.**

Core owns shared lifecycle, privileged infrastructure, persistence, evidence lifecycle, credential boundaries, freshness, validation coordination, packages/export eligibility, and desktop coordination.

Source modules own provider-specific acquisition, parsing, normalization, semantic validation, readiness requirements, and provider error mapping.

Google Trends is the reference browser-export source, not the generic product model.

Detailed ownership belongs in `ARCHITECTURE.md`.

---

## 4. Release 1.0 source scope

Release 1.0 includes the source families whose acquisition paths passed approved feasibility gates.

Current implementation status belongs in `PROJECT_HANDOFF.md`.

### Google Trends

- dataset: Interest Over Time;
- acquisition: controlled Playwright + provider CSV export;
- values `0..100` are relative interest, not search volume;
- comparison-group context remains significant;
- Search Term and Topic remain distinct.

### Google Search Console

Official Search Analytics API.

Supported logical datasets include:

- query-only `QUERY`;
- Query × Page `QUERY_PAGE`.

Reviewed task shapes include adjacent 28-day query windows and Query × Page 28-day, 90-day, and long-window collection.

Preserve property identity, dimensions, requested dates, returned dimensions, provider limitations, raw pages, and native clicks/impressions/CTR/position.

### Google Ads SEARCH reporting

Official Google Ads REST SearchStream.

Approved family:

```text
google-ads-search-reporting
```

SEARCH-only datasets:

- `CAMPAIGN_PERFORMANCE`
- `AD_GROUP_PERFORMANCE`
- `KEYWORD_PERFORMANCE`
- `SEARCH_TERMS`
- `AD_PERFORMANCE`
- `RSA_ASSET_PERFORMANCE`

The legacy `google-ads-search-terms` / `search_term_view` path remains compatible.

Performance Max and materially different Google Ads modes/resources require separate scope and evidence.

### Keyword Planner historical metrics

Primary: official Google Ads API.
Fallback: manual provider CSV import.

Preserve keyword, average monthly searches, competition/index, monthly history, and returned bid metrics.

API and file-import provenance remain distinct.

API-only 3-month and YoY change fields may be derived deterministically from accepted monthly history under the locked data contract; they must be labelled derived and remain null when comparison evidence is unavailable or invalid.

Manual CSV change fields remain provider-exported source evidence.

### İkas Products

Manual Products XLSX import.

Preserve the original workbook and evidence-backed production mapping.

Blank stock or unavailable values remain missing.

### Bitkimark public site

Bounded standard HTTP + sitemap/XML.

Preserve request/final URL context, response metadata, raw XML, sitemap relationships, `loc`, and nullable `lastmod`.

Do not infer a content change merely from `lastmod`.

### SERP

On-demand SerpApi acquisition.

Preserve query context, location/language/device, retrieval time, raw provider JSON/metadata, organic evidence, and provider-returned features.

Do not convert this evidence into intent, commercial-fit, page-type, SEO, or marketing recommendations inside the Collector.

### Excluded / future

Semrush is not active Release 1.0 scope.

Merchant Center, GA4, unsupported Google Ads modes, arbitrary crawling/imports, continuous SERP tracking, and other providers require separate approved scope and feasibility.

---

## 5. Acquisition policy

Preferred order:

```text
supported official API
→ supported first-party export/UI
→ controlled browser automation
→ explicit file import or manual intervention where required
```

Conceptual acquisition modes:

```text
BROWSER_EXPORT
OFFICIAL_API
FILE_IMPORT
HTTP_XML
THIRD_PARTY_API
```

Source, dataset, source mode, and acquisition mode remain separate concepts.

---

## 6. Workspace and lifecycle boundary

A Workspace is the first-class brand/business owner of Runs.

A Run may contain Jobs from multiple sources.

A Job is the independent execution/resume/retry unit.

A retry creates a new immutable Attempt.

One Workspace may have at most one active Run under the implemented active-status contract.

All supported acquisition modes use the same trust lifecycle:

```text
intent
→ readiness
→ Run / Jobs
→ Attempt
→ acquire/import
→ preserve raw candidate
→ parse
→ validate
→ accept/warn/reject
→ normalize where deterministic
→ document/provenance
→ package eligible evidence
→ export
```

---

## 7. Security and provider policy

RoofRoom must not:

- store user passwords in ordinary application data;
- expose OAuth tokens, API keys, client secrets, or equivalent secrets to renderer state;
- put secrets in ordinary config, logs, exports, or documentation;
- depend on the user's normal browser profile;
- copy sessions without explicit consent;
- bypass CAPTCHA, 2FA, anti-bot protections, quotas, or rate limits;
- use CAPTCHA solvers or proxy rotation for evasion.

Authentication, configuration, access, manual intervention, quota, and provider failures are operational states, not dataset-validation outcomes.

---

## 8. Data-integrity rules

### Raw evidence

Raw provider/file evidence remains authoritative and immutable whenever practical.

Normalized, metadata, validation, package, and export artifacts remain separate.

### Missing is not zero

Missing, withheld, absent, unavailable, and numeric zero are different states.

Missing remains null/absent/blank according to the representation.

### Source semantics

Do not invent generic `score`, `demand`, `search_volume`, `commercial_value`, or equivalent fields that erase provider meaning.

### Requested versus observed

Requested context and provider-proven observed context remain distinct.

Never copy a requested value into an observed field merely because the provider omitted evidence.

### Execution versus validation

A successful API response, browser action, download, import, parse, or file write does not automatically prove a trustworthy dataset.

---

## 9. Credential, readiness, and freshness boundary

Credentials remain behind privileged Core/main-process boundaries.

Workspace connection state exposes only safe metadata and readiness.

Freshness remains independent from:

- credential readiness;
- execution;
- validation.

On-demand, manual-import, due, stale, fresh, and unknown states must not be collapsed into execution status.

---

## 10. Package boundaries

### Production Data Package

Packages accepted evidence without cross-source analysis.

### Task Packages

Task Packages assemble compatible accepted evidence. They do not authenticate, call providers, retry, or own acquisition.

`ADS_OPTIMIZATION_PACK v1` follows this boundary.

Its name does not authorize optimization recommendations; the package contains provider-native evidence and deterministic provenance only.

### Blog Writing Pack

`BLOG_WRITING_PACK v1` is a fixed single-Run derived package over accepted evidence.

It records truthful coverage and excludes out-of-recipe evidence.

It does not recollect, retry, create Attempts, mutate Run/Job state, or perform blog-topic/page-type recommendations.

---

## 11. Desktop product boundary

The desktop may:

- manage Workspaces;
- show safe source readiness/connection state;
- manage reusable presets/settings;
- review supported collection tasks;
- start explicit work;
- show progress and remediation;
- resume/retry/cancel where Core reports the action eligible;
- open accepted evidence;
- build/open/reveal supported packages.

Renderer remains presentation and user intent only.

Privileged filesystem, database, browser, provider clients, credentials, and package verification remain in main/Core.

---

## 12. Storage and provenance

SQLite stores operational state and references, not an analytical warehouse.

Canonical raw evidence remains in application-owned storage.

Accepted evidence must remain traceable to relevant:

- Workspace;
- source/dataset/mode;
- Run;
- Job;
- Attempt;
- raw artifact;
- checksum where available;
- retrieval/import time;
- validation;
- requested and observed context.

Exact persisted contracts belong in `DATA_CONTRACTS.md`.

---

## 13. Testing policy

Normal automated tests and CI must not call live providers.

Use deterministic fixtures, mocks, fake sources, local files, and controlled local dependencies.

Live/provider acceptance is explicit, limited, separately authorized, and quota-aware.

Detailed verification depth belongs in `TEST_STRATEGY.md`.

---

## 14. Source implementation gate

A new source or materially different provider mode enters through:

```text
feasibility/acquisition proof
→ source contract
→ implementation approval
→ one vertical slice
→ deterministic regression
→ limited explicit live acceptance where required
```

Historical documentation alone does not create implementation scope.

---

## 15. Release acceptance rule

A claimed Release 1.0 capability is complete only when the relevant implementation:

- uses the shared lifecycle;
- preserves canonical raw evidence and provenance;
- preserves missing/null semantics;
- validates source-specific meaning;
- keeps operational failure separate from dataset quality;
- preserves retry/resume history;
- exposes safe desktop/IPC behavior;
- packages/exports only eligible evidence;
- has deterministic regression coverage;
- has live/provider evidence only where that claim is explicitly made.

Unsupported or unverified modes must fail visibly.

---

## 16. Authority routing

| Need | Authority |
|---|---|
| Current state / next action | `PROJECT_HANDOFF.md` |
| Architecture | `ARCHITECTURE.md` |
| Persistence / nulls / provenance | `DATA_CONTRACTS.md` |
| Validation | `VALIDATION_SPEC.md` |
| Verification depth | `TEST_STRATEGY.md` |
| Source onboarding | `SOURCE_MODULE_GUIDE.md` |
| Historical decisions | `DECISIONS.md` |

---

## 17. Governing product rule

> **Collect trustworthy evidence, preserve its meaning and provenance, and package it without manufacturing facts or decisions.**
