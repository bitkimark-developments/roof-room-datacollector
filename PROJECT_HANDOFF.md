# RoofRoom Data Collector — Project Handoff

**Checkpoint date:** 2026-10-02
**Current branch:** `feat/google-ads-campaign-settings-v1`
**Production implementation checkpoint:** `08f3c43`
**Repository state:** Google Ads Campaign Settings v1 production behavior is committed; this handoff update records the deterministic verification checkpoint and adopted contract documentation
**Current stage:** Google Ads Campaign Settings v1 is implemented and deterministically verified; live-provider acceptance was not performed
**Current action:** complete the canonical documentation checkpoint and retain future Google Ads configuration extensions as independent scoped work

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

    branch:                     feat/google-ads-campaign-settings-v1
    production implementation:  08f3c43

The Conversion Configuration production implementation is committed. The focused Conversion Configuration gate and this canonical documentation update form the slice-closing checkpoint that contains this handoff revision.

Observed implementation checkpoints on this branch:

- `09f7bfc` — define the six-dataset Conversion Configuration contract and exact GAQL;
- `6404296` — normalize the six provider-native resources;
- `f032c54` — collect the six datasets through the existing configuration source;
- `b0dbd78` — validate conversion configuration and tracking-settings cardinality;
- `e473870` — verify production registration of the full configuration family and existing connection reuse.

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
- Google Ads configuration Negatives v1 and Conversion Configuration v1 snapshot family;
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
- eleven-dataset `google-ads-configuration` snapshot family composed of:
  - Negatives v1:
    - `CAMPAIGN_NEGATIVE_KEYWORDS`
    - `AD_GROUP_NEGATIVE_KEYWORDS`
    - `SHARED_NEGATIVE_KEYWORDS`
    - `CAMPAIGN_NEGATIVE_KEYWORD_LISTS`
    - `ACCOUNT_NEGATIVE_KEYWORD_LISTS`
  - Conversion Configuration v1:
    - `CONVERSION_ACTIONS`
    - `CUSTOMER_CONVERSION_GOALS`
    - `CONVERSION_GOAL_CAMPAIGN_CONFIGS`
    - `CAMPAIGN_CONVERSION_GOALS`
    - `CUSTOM_CONVERSION_GOALS`
    - `CUSTOMER_CONVERSION_TRACKING_SETTINGS`
- immutable configuration schema-v1 Job context with no requested date window;
- provider-native Conversion Configuration normalization preserving null, real false/zero values, lifecycle/status evidence, ownership, and custom-goal membership without requested-to-observed fabrication;
- tracking-settings validation requiring exactly one normalized customer row, including valid `NOT_CONVERSION_TRACKED` evidence;
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

The full Google Ads configuration family, including Negatives v1 and Conversion Configuration v1, reuses the existing Workspace Google Ads connection keyed by the legacy Search Terms source. It does not create a separate configuration-source credential or Workspace connection record.

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

Google Ads configuration Negatives v1 remains deterministically verified across its five dataset contracts.

Conversion Configuration v1 is implemented and deterministically verified across its six dataset/resource contracts, exact GAQL, provider-native normalization, raw SearchStream acquisition, fail-closed semantic validation, five-dataset verified `NO_DATA` behavior, exactly-one-row tracking-settings cardinality, production registration, existing Ads connection reuse, and snapshot-specific capability behavior.

The focused Conversion Configuration gate passed with `PASS GOOGLE-ADS-CONVERSION-CONFIGURATION-GATE-001`. The Negatives gate, production source-composition test, and Google Ads SEARCH reporting gate also passed after the conversion changes, without live-provider calls. `npx tsc --noEmit` passed.

The literal nested-worktree `npm run lint` invocation reproduced the previously observed duplicate `eslint-plugin-import` resolution failure from the worktree and parent repository configurations. With the worktree-local ESLint configuration isolated via `--no-eslintrc --config`, lint exited 0 with zero errors and two non-blocking `import/no-duplicates` warnings in the existing configuration-source import structure. Repository lint configuration was not changed.

Live-provider acceptance for Conversion Configuration v1 was not performed. No packaged/runtime acceptance claim is made for this slice.

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

Completed deterministic source checkpoints:

- Google Analytics 4 source vertical slice;
- Google Ads Change History source vertical slice;
- Google Keyword Planner validator migration;
- Google Ads Campaign Settings v1 gate;
- Google Ads Negatives v1 checkpoint;
- Google Ads Search Reporting checkpoint.

Next:

1. preserve completed source boundaries and evidence checkpoints;
2. select the next approved independent source scope from current repository state;
3. do not expand completed slices without explicit scope.

Do not run live provider requests merely to reconfirm already deterministic results.

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


## Asset collection preset checkpoint

Completed deterministic preset preparation:

- Added `Google Ads Growth Rebuild` reusable collection preset.
- Added `Blog Agentic Content Research` reusable collection preset.
- Added terminal seed script:
  - `scripts/create-asset-presets.ts`
- Verified presets persist through the existing `saved_collection_presets` repository boundary.

Preset scope remains configuration-only:
- Presets define source inclusion and collection configuration.
- Provider evidence semantics remain owned by source modules.
- Missing provider inputs (query groups, date ranges, sites, etc.) must remain explicit and are not inferred.

## Future preset catalog milestone

Expand reusable preset catalog with predefined collection groups:

Ads Growth:
- 7 day Ads Growth
- 14 day Ads Growth
- 30 day Ads Growth
- 60 day Ads Growth

Blog Agentic:
- 7 day Blog Trend Research
- 14 day Blog Trend Research
- 30 day Blog Trend Research
- 60 day Blog Trend Research

This milestone is focused on preset coverage and user workflow improvements. It does not move provider semantics or evidence handling into presets.

## Latest completed source checkpoints

Latest completed vertical slices:

- Google Analytics 4 source vertical slice
  Commit:
  161b2be feat: add google analytics 4 source vertical slice

- Google Ads Change History source vertical slice
  Commit:
  0cc9d20 feat: add google ads change history source vertical slice

### Completion details for Google Ads Change History

Completed deterministic verification:
- shared source contract
- provider request boundary
- raw artifact preservation path
- provider row normalization
- fail-closed validation
- production runtime registration
- validator registration
- export/package loading

Architecture verification:
- Provider-specific Google Ads Change History semantics remain outside Core.
- Source identity and dataset identity are represented through shared contracts.
- Core remains source-neutral.

### Verification boundary

Completed:
- deterministic integration verification

Not performed:
- live Google Ads API verification
- real credential verification
- packaged desktop runtime verification

These require separate explicit verification scope.

---

## Keyword Planner validator migration checkpoint

Completed:
- Google Keyword Planner validation ownership moved from generic Google API validator path to dedicated KeywordPlannerValidator.
- Existing source identity and dataset contracts preserved.
- Existing Keyword Planner deterministic tests remain passing.

Verification:
- Keyword Planner reviewed API integration tests passed.
- Production source composition verification passed.
- Related Google Ads Change History and export regression checks passed.

Not performed:
- Live Google Ads API verification.
- Real credential verification.
- Packaged desktop runtime verification.

---

## Google Ads Campaign Settings v1 checkpoint

Completed:
- Campaign Settings remains within the existing `google-ads-configuration` source family.
- Provider-native Campaign Settings contract, query, normalization, and validation boundaries are implemented.
- Core remains source-neutral and provider semantics remain inside the Google Ads source module.

Verification:
- Google Ads Campaign Settings gate passed.
- Contract, normalization, source, and validation integration checks passed.

Export boundary:
- No dedicated Campaign Settings export mapping was identified as required.
- Existing package/export behavior remains unchanged.

Not performed:
- Live Google Ads API verification.
- Real credential verification.
- Packaged desktop runtime verification.

---

## Google Ads Negatives v1 checkpoint

Completed:
- Google Ads negative evidence contracts are verified.
- Five negative dataset/resource contracts preserve provider-native semantics.
- Negative keyword normalization preserves identities, nulls, and provider status.
- Core remains source-neutral and Google Ads semantics remain inside the source module.

Verification:
- Google Ads Negatives gate passed.
- Contract, normalization, configuration source, and validation integration checks passed.

Not performed:
- Live Google Ads API verification.
- Real credential verification.
- Packaged desktop runtime verification.

---

## Google Ads Search Reporting checkpoint

Completed:
- Google Ads Search Reporting vertical slice is deterministically verified.
- Six canonical SEARCH reporting datasets preserve provider-native semantics:
  - CAMPAIGN_PERFORMANCE
  - AD_GROUP_PERFORMANCE
  - KEYWORD_PERFORMANCE
  - SEARCH_TERMS
  - AD_PERFORMANCE
  - RSA_ASSET_PERFORMANCE
- SearchStream raw evidence handling, normalization, and fail-closed validation boundaries are verified.
- Core remains source-neutral and Google Ads reporting semantics remain inside the source module.

Verification:
- Google Ads Search Reporting gate passed.
- Contract, source, SearchStream, normalization, and validation integration checks passed.

Not performed:
- Live Google Ads API verification.
- Real credential verification.
- Packaged desktop runtime verification.

---

## 13. Governing handoff rule

> **Record where the repository is now, what remains unproven, and the next smallest safe action. Keep history in Git, not in the active handoff.**
