# RoofRoom Data Collector — Project Handoff

**Checkpoint date:** 2026-10-02
**Current branch:** `feat/google-ads-negatives-v1`
**Production implementation checkpoint:** `8929306`
**Repository state:** Google Ads Negatives v1 production implementation is committed; this handoff update closes the slice with its focused gate and adopted contract documentation
**Current stage:** `05_NEGATIVES` implemented and deterministically verified; live-provider acceptance was not performed
**Current action:** after the slice-closing checkpoint, the next approved separate Google Ads configuration scope is `08_CONVERSION_ACTIONS`; keep `09_CAMPAIGN_SETTINGS` subsequent

---

## 1. Purpose

This file records only the latest verified repository state, material open acceptance boundaries, closed areas, and the next safe action.

It is the router for current work, not a historical changelog.

For stable product, architecture, contracts, validation, testing, or historical rationale, use the authority table below.

---

## 2. Repository state

Authoritative repository:

```text
/Users/furkan/Projects/roofroom-data-collector
```

Observed current state:

    branch:                     feat/google-ads-negatives-v1
    production implementation:  8929306

The production implementation is committed. The focused Negatives gate and this canonical documentation update form the slice-closing checkpoint that contains this handoff revision.

Local and remote feature/fix branches used by the completed work were cleaned up after their relevant commits or patch-equivalent changes were integrated.

---

## 3. Current product state

Release 1.0 local multi-source Collector implementation is complete.

The application now includes:

- Workspace-owned Runs;
- source-keyed multi-source Jobs;
- immutable Attempt history;
- resume, reconciliation, explicit retry, cancellation where safely supported;
- schema-v8 persistence;
- Saved Collection Presets and Last Run Settings;
- Workspace source connections and safe readiness state;
- source-neutral freshness evaluation;
- secure credential boundaries and packaged connection/remediation flows;
- accepted-evidence access;
- generalized Production Data Package export;
- post-R1 desktop UX/operations hardening;
- Google Ads SEARCH reporting family;
- Google Ads configuration Negatives v1 snapshot family;
- `ADS_OPTIMIZATION_PACK v2` with historical v1 read compatibility;
- `BLOG_WRITING_PACK v1`.

Google Trends remains the reference browser-export source, not the generic Core model.

---

## 4. Current persisted baseline

Current SQLite schema version:

```text
8
```

Implemented tables:

```text
schema_migrations
workspaces
runs
jobs
attempts
artifacts
validations
saved_collection_presets
workspace_last_run_settings
workspace_source_connections
```

Important current contracts:

- every Run belongs to exactly one Workspace;
- one Workspace may have at most one active Run in `PENDING`, `RUNNING`, or `MANUAL_ACTION_REQUIRED`;
- `RETRY_REQUIRED` is non-terminal but does not occupy the active slot;
- retry reacquisition, Job transition, and next Attempt creation are atomic;
- a Job is identified within a Run by `source_id + job_key`;
- `query_group_id` is nullable and Google-Trends/legacy-specific;
- non-Google-Trends Jobs never fabricate query groups;
- freshness is derived from accepted completed Job history rather than a freshness cache;
- credential secrets remain outside SQLite behind the privileged credential boundary.

Exact persisted contracts belong in `DATA_CONTRACTS.md`.

---

## 5. Source and dataset state

### Release 1.0 source paths

Local implementation is complete for the approved R1 source paths:

- Google Trends Interest Over Time;
- Google Search Console;
- legacy Google Ads Search Terms;
- Google Ads Keyword Planner API;
- Keyword Planner manual CSV;
- İkas Products XLSX;
- Bitkimark sitemap/XML;
- SerpApi on-demand SERP.

### Later completed expansions

Also implemented:

- GSC query-only `QUERY` datasets and Query × Page `QUERY_PAGE` datasets;
- adjacent Current/Previous 28-day GSC query Jobs;
- GSC Query × Page 28-day, 90-day, and long-window reviewed tasks;
- six-dataset `google-ads-search-reporting` SEARCH family:
  - `CAMPAIGN_PERFORMANCE`
  - `AD_GROUP_PERFORMANCE`
  - `KEYWORD_PERFORMANCE`
  - `SEARCH_TERMS`
  - `AD_PERFORMANCE`
  - `RSA_ASSET_PERFORMANCE`
- reporting schema v2 for current acquisition, with historical schema v1 evidence remaining readable but not reacquirable;
- schema v2 Campaign/Ad Group/Keyword reporting preserves conversion-efficiency metrics plus Search Top/Absolute Top impression share as distinct provider-native fields;
- five-dataset `google-ads-configuration` Negatives v1 snapshot family:
  - `CAMPAIGN_NEGATIVE_KEYWORDS`
  - `AD_GROUP_NEGATIVE_KEYWORDS`
  - `SHARED_NEGATIVE_KEYWORDS`
  - `CAMPAIGN_NEGATIVE_KEYWORD_LISTS`
  - `ACCOUNT_NEGATIVE_KEYWORD_LISTS`
- immutable Negatives schema-v1 Job context with no requested date window;
- deterministic Keyword Planner 3-month and YoY derived change fields from accepted monthly history;
- `ADS_OPTIMIZATION_PACK v2`;
- `BLOG_WRITING_PACK v1`.

Performance Max remains outside the approved Google Ads reporting contract.

---

## 6. Current credential and connection boundary

Current production credential behavior includes:

- shared Google OAuth application configuration behind the main/Core boundary;
- Workspace/account metadata kept separate from secret material;
- OAuth refresh credentials behind the credential store;
- SerpApi API-key storage behind the same privileged security boundary;
- main-owned native macOS masked secret ingress;
- safe renderer-visible connection/readiness states only.

The Google Ads Developer Token is retired from active application behavior. Legacy persisted fields may remain readable only for backward compatibility.

Google Ads configuration Negatives v1 reuses the existing Workspace Google Ads connection keyed by the legacy Search Terms source. It does not create a separate configuration-source credential or Workspace connection record.

Do not reintroduce Developer Token setup as a current requirement without a new approved contract.

---

## 7. Current package boundaries

### Production Data Package

The generic Production Data Package consumes accepted evidence and keeps source datasets separate.

It does not perform cross-source analysis.

### `ADS_OPTIMIZATION_PACK v2`

A source-neutral Task Package layer above accepted evidence.

It:

- requires the six approved Google Ads SEARCH reporting datasets at dataset schema v2;
- uses exact compatible accepted evidence;
- rejects historical schema v1 evidence as CURRENT or PREVIOUS input for the active v2 recipe while preserving historical v1 readability;
- may deterministically filter broader DAILY evidence only by real `performance_date` rows;
- never reconstructs, interpolates, allocates, averages, or infers unavailable source evidence;
- does not own provider acquisition or retry;
- preserves immutable package provenance.

The desktop Review/Start/Open workflow is deterministically implemented.

Expanded live acceptance for the six-dataset reporting family remains separate from deterministic completion.

### `BLOG_WRITING_PACK v1`

Latest verified implementation checkpoint: `33f4734`, followed by validated repair commits and the current documentation checkpoint.

The Blog package:

- is a thin single-Run specialization over Production Data Package;
- has a fixed seven-family recipe;
- records truthful COMPLETE/PARTIAL/MISSING/verified-NO_DATA coverage;
- excludes out-of-recipe evidence before loading;
- preserves Keyword Planner API/manual provenance separately;
- publishes immutable `BLOG_PACKAGE.json` and `BLOG_WRITING_PACK.xlsx`;
- builds/opens/reveals locally without provider acquisition, retry, new Attempts, Run/Job mutation, or schema migration.

Fresh deterministic verification and packaged arm64 acceptance passed. No live provider request was made for this slice.

---

## 8. Verification and live-evidence boundaries

Current evidence includes deterministic release-gate success across the implemented Core/source/package surface and successful local arm64 packaging.

Previously recorded real/live acceptance includes bounded evidence for:

- Google Trends;
- Google Search Console;
- Bitkimark root sitemap;
- real İkas workbook parsing;
- real Keyword Planner manual CSV;
- a bounded Keyword Planner official-API run;
- the legacy Google Ads `search_term_view` SEARCH proof.

SerpApi secure provisioning has packaged human-observed acceptance, but credential provisioning is not provider collection acceptance.

The expanded six-dataset Google Ads SEARCH reporting family is deterministically complete; live acceptance for the additional resources remains a separate explicitly authorized step.

Google Ads configuration Negatives v1 is implemented and deterministically verified across its five dataset contracts, query builders, normalization paths, raw SearchStream acquisition, fail-closed validation, truthful `NO_DATA`, production registration, existing Ads connection reuse, and snapshot-specific capability override.

The focused Negatives gate passed, the affected production source-composition regression passed, and the affected Google Ads SEARCH reporting gate passed without live-provider calls. `npx tsc --noEmit` passed after the metadata typing correction. ESLint reported zero errors when the repository lint script was run with the worktree-local ESLint configuration isolated; the unqualified nested-worktree invocation otherwise encounters duplicate plugin resolution from identical worktree and parent repository configs.

Live-provider acceptance for Negatives v1 was not performed.

Do not convert deterministic, packaged, credential, or feasibility evidence into a live-provider claim.

---

## 9. Closed areas

Do not reopen without new failing evidence or explicit scope approval:

- local-first one-app / multi-source architecture;
- Workspace ownership and one-active-Run database rule;
- source-keyed Jobs and nullable GT-only `query_group_id`;
- immutable Attempt history;
- raw-evidence preservation;
- missing-is-not-zero semantics;
- requested-versus-observed separation;
- execution-versus-validation separation;
- provider semantics staying outside generic Core;
- credential secrets staying outside renderer and ordinary config;
- source-neutral freshness separation;
- current R1 acquisition-mode boundaries;
- Google Trends relative-interest semantics;
- current safe connection/readiness IPC boundary;
- Developer Token retirement;
- Task/Blog package non-acquisition boundary;
- Performance Max remaining outside the approved SEARCH family.

---

## 10. Exact next action

The bounded Google Ads configuration `05_NEGATIVES` slice is implemented and deterministically verified on `feat/google-ads-negatives-v1`.

The adopted Negatives v1 scope is complete without live-provider acceptance. It does not include placements, brand exclusions, IP exclusions, topics/content labels/webpages, mutations, Performance Max claims, package/preset/export integration, conversion actions, or campaign settings.

Next:

1. create the slice-closing focused-gate and canonical-documentation checkpoint;
2. do not push or merge without explicit authorization;
3. use `08_CONVERSION_ACTIONS` as the next approved separate Google Ads configuration implementation scope;
4. keep `09_CAMPAIGN_SETTINGS` subsequent and independent.

Do not broaden Negatives v1 while beginning the next slice.

Do not run a live provider request merely to reconfirm an already deterministic result.

---

## 11. Authority routing

| Need | Authority |
|---|---|
| Current repository state / next action | `PROJECT_HANDOFF.md` |
| Product scope / stable acceptance boundary | `PROJECT_SPEC.md` |
| Component ownership / dependency direction | `ARCHITECTURE.md` |
| Persisted contracts / nulls / provenance | `DATA_CONTRACTS.md` |
| Evidence acceptance semantics | `VALIDATION_SPEC.md` |
| Test depth / regression / live gates | `TEST_STRATEGY.md` |
| Adding or extending a source | `SOURCE_MODULE_GUIDE.md` |
| Historical architectural rationale | `DECISIONS.md` |

Read only the smallest authority set required by the task.

`DECISIONS.md` is cold history and should not be loaded for ordinary implementation work.

---

## 12. Evidence discipline

Keep these claims distinct:

- planned;
- implemented;
- deterministically verified;
- packaged/runtime verified;
- feasibility approved;
- live-provider verified.

Never upgrade one category into another without evidence.

---

## 13. Governing handoff rule

> **Record where the repository is now, what remains unproven, and the next smallest safe action. Keep history in Git, not in the active handoff.**
