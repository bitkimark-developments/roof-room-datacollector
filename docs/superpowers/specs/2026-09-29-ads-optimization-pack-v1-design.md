# Ads Optimization Pack v1 — Design Specification

**Status:** Approved for implementation planning
**Date:** 2026-09-29
**Product:** RoofRoom Data Collector
**Recipe:** `ADS_OPTIMIZATION_PACK` v1
**User-facing name:** `Kampanya Gelişim`

## 1. Goal

Add a SEARCH-only Google Ads evidence workflow that collects, preserves, validates, reuses, assembles, and exports the provider-native data needed for downstream advertising analysis.

RoofRoom remains a collector/packager. It must not decide whether a campaign, keyword, search term, ad, or asset is good or bad and must not recommend budget, bid, pause/enable, targeting, copy, or other optimization actions.

The downstream ChatGPT Project performs interpretation and recommendations.

## 2. Current repository baseline

The implementation must extend the current source-neutral Core rather than create a second lifecycle.

Current repository evidence inspected before this design:

- SQLite schema is v8.
- Run → Job → Attempt is source-neutral and `query_group_id` is nullable.
- Google Ads Search Terms already exists as an official-API quick-run source using Google Ads API v25 and `search_term_view` for SEARCH.
- Keyword Planner exists separately and is not part of this Ads Optimization recipe.
- Production Data Package loading/export already exists.
- Workspace Google Ads credentials/customer metadata already exist for the current Search Terms connection.
- Superpowers specs/plans are the repository's existing design/planning system.

Implementation must re-audit live HEAD before edits because unrelated WIP may exist after this snapshot.

## 3. Locked scope

### 3.1 Campaign type

v1 supports **SEARCH only**.

Performance Max, Shopping, Display, Demand Gen, App, Video, Smart Campaigns, and other materially different campaign modes are out of scope.

`search_term_view` must never be presented as Performance Max coverage. Performance Max requires a separately verified source contract.

### 3.2 Logical source architecture

Use one logical Google Ads SEARCH reporting source family with independent dataset adapters.

Canonical family source id for the new workflow:

`google-ads-search-reporting`

The existing `google-ads-search-terms` quick-run source remains supported for backward compatibility and must not be removed or silently renamed in this slice.

The reporting family owns six independent Job datasets:

1. `CAMPAIGN_PERFORMANCE`
2. `AD_GROUP_PERFORMANCE`
3. `KEYWORD_PERFORMANCE`
4. `SEARCH_TERMS`
5. `AD_PERFORMANCE`
6. `RSA_ASSET_PERFORMANCE`

Each dataset has its own:

- source context / resource mode;
- GAQL query builder;
- response normalizer;
- semantic validator;
- Job key;
- retry history;
- accepted artifact;
- evidence-reuse decision.

All six share the existing Google Ads OAuth/customer connection and Google Ads API transport.

Core must not branch on campaign/ad-group/keyword/RSA semantics.

### 3.3 Required coverage

All six datasets are REQUIRED COVERAGE for `ADS_OPTIMIZATION_PACK` v1.

A valid provider result with zero rows is valid coverage:

`NO_DATA` → package may continue.

The package is blocked by collection/validation failure, not by a truthful empty result.

Examples that block readiness include authorization failure, provider/API failure, unsupported mode, malformed schema, invalid dates, or rejected evidence.

`VALID`, `LOW_DATA`, and `NO_DATA` are export-eligible according to the existing Core acceptance model.

## 4. Provider/API contract

### 4.1 Transport

Use the official Google Ads API v25 REST `GoogleAdsService.SearchStream` path already established in the repository.

The canonical REST response shape is a top-level JSON array of stream response objects, each containing a `results` array of nested camelCase `GoogleAdsRow` objects.

The source family must preserve the full provider response bytes before normalization.

Do not treat the repository's historical flat mock shape as proof of the live provider schema.

### 4.2 Absolute dates

Every performance Job receives immutable absolute dates in its `source_context`:

- `requested_date_start`
- `requested_date_end`

GAQL uses those absolute dates with `segments.date`.

No Job may derive relative dates at provider-call time.

### 4.3 Common source context

Every Ads Optimization reporting Job must prove at least:

- `source_id = google-ads-search-reporting`
- `dataset_type`
- `resource_mode`
- `campaign_type = SEARCH`
- `customer_id`
- `requested_date_start`
- `requested_date_end`
- `dataset_schema_version = 1`

`customer_id` is safe account identity and must be snapshotted into the immutable Job context so evidence remains traceable even if the Workspace connection changes later.

Secrets, developer token, access token, refresh token, and client secret never enter Job context or exports.

## 5. Dataset contracts

All monetary cost/bid fields keep provider-native micros where Google reports micros. Do not silently convert canonical fields into unnamed currency units.

Percent/share metrics retain the provider's numeric representation. RoofRoom does not multiply them into display percentages inside canonical normalized evidence.

`conversions` and `all_conversions` remain distinct.

`conversions_value` and `all_conversions_value` remain distinct.

RoofRoom does not calculate CPA, ROAS, opportunity scores, deltas, performance grades, or recommendations in v1.

### 5.1 Campaign performance

**Resource mode:** `campaign`

Required identity/snapshot fields:

- `customer.currency_code`
- `customer.time_zone`
- `campaign.id`
- `campaign.name`
- `campaign.status`
- `campaign.primary_status`
- `campaign.advertising_channel_type`
- `campaign.bidding_strategy_type`
- `campaign_budget.id`
- `campaign_budget.amount_micros`
- `campaign_budget.period`
- `campaign_budget.explicitly_shared`
- `segments.date`

Required performance metrics where selectable for the resource:

- `metrics.impressions`
- `metrics.clicks`
- `metrics.ctr`
- `metrics.average_cpc`
- `metrics.cost_micros`
- `metrics.conversions`
- `metrics.conversions_value`
- `metrics.all_conversions`
- `metrics.all_conversions_value`
- `metrics.search_impression_share`
- `metrics.search_budget_lost_impression_share`
- `metrics.search_rank_lost_impression_share`
- `metrics.search_click_share`
- `metrics.top_impression_percentage`
- `metrics.absolute_top_impression_percentage`

Filter:

`campaign.advertising_channel_type = 'SEARCH'`

### 5.2 Ad group performance

**Resource mode:** `ad_group`

Required identity/snapshot fields:

- campaign id/name/channel type;
- `ad_group.id`
- `ad_group.name`
- `ad_group.status`
- `ad_group.primary_status`
- `ad_group.type`
- `ad_group.cpc_bid_micros`
- `ad_group.effective_cpc_bid_micros`
- `ad_group.effective_target_cpa_micros`
- `ad_group.effective_target_roas`
- `segments.date`

Required performance metrics:

- common impressions/clicks/CTR/average CPC/cost/conversion metrics;
- search impression share;
- search budget-lost impression share;
- search rank-lost impression share;
- search click share;
- top and absolute-top impression percentage.

Filter to SEARCH campaigns.

### 5.3 Keyword performance

**Resource mode:** `keyword_view`

Required identity/snapshot fields:

- campaign id/name/channel type;
- ad group id/name;
- `ad_group_criterion.criterion_id`
- `ad_group_criterion.keyword.text`
- `ad_group_criterion.keyword.match_type`
- `ad_group_criterion.status`
- `ad_group_criterion.primary_status`
- `ad_group_criterion.system_serving_status`
- `ad_group_criterion.negative`
- `ad_group_criterion.cpc_bid_micros`
- `ad_group_criterion.effective_cpc_bid_micros`
- `ad_group_criterion.quality_info.quality_score`
- `ad_group_criterion.quality_info.creative_quality_score`
- `ad_group_criterion.quality_info.post_click_quality_score`
- `ad_group_criterion.quality_info.search_predicted_ctr`
- `segments.date`

Required performance metrics:

- common impressions/clicks/CTR/average CPC/cost/conversion metrics;
- search impression share;
- search exact-match impression share;
- search budget-lost impression share;
- search rank-lost impression share;
- search click share;
- top and absolute-top impression percentage.

Filter to SEARCH campaigns.

Quality fields are provider snapshot attributes. RoofRoom records them and does not interpret them.

### 5.4 Search Terms

**Resource mode:** `search_term_view`

Required identity fields:

- `search_term_view.search_term`
- campaign id/name/channel type;
- ad group id/name;
- `segments.keyword.ad_group_criterion`
- `segments.keyword.info.text`
- `segments.keyword.info.match_type`
- `segments.search_term_match_type`
- `segments.search_term_targeting_status`
- `segments.date`

Required performance metrics:

- common impressions/clicks/CTR/average CPC/cost/conversion metrics;
- top and absolute-top impression percentage.

Filter to SEARCH campaigns.

This dataset must continue to enforce the existing explicit `search_term_view` / SEARCH boundary.

### 5.5 Ad / RSA performance

**Resource mode:** `ad_group_ad`

v1 packages Responsive Search Ads only.

Required identity/snapshot fields:

- campaign id/name/channel type;
- ad group id/name;
- `ad_group_ad.ad.id`
- `ad_group_ad.ad.type`
- `ad_group_ad.status`
- `ad_group_ad.primary_status`
- `ad_group_ad.ad_strength`
- `ad_group_ad.policy_summary.approval_status`
- `ad_group_ad.policy_summary.review_status`
- `ad_group_ad.ad.final_urls`
- `ad_group_ad.ad.responsive_search_ad.headlines`
- `ad_group_ad.ad.responsive_search_ad.descriptions`
- `ad_group_ad.ad.responsive_search_ad.path1`
- `ad_group_ad.ad.responsive_search_ad.path2`
- `segments.date`

Required performance metrics:

- common impressions/clicks/CTR/average CPC/cost/conversion metrics;
- top and absolute-top impression percentage.

Filters:

- SEARCH campaign;
- `ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'`.

`ad_strength` and policy status are provider snapshot fields, not RoofRoom judgments.

### 5.6 RSA asset performance

**Resource mode:** `ad_group_ad_asset_view`

Required identity/snapshot fields:

- campaign id/name/channel type;
- ad group id/name;
- ad id/type;
- `ad_group_ad_asset_view.resource_name`
- `ad_group_ad_asset_view.field_type`
- `ad_group_ad_asset_view.performance_label`
- `ad_group_ad_asset_view.pinned_field`
- `ad_group_ad_asset_view.enabled`
- `ad_group_ad_asset_view.source`
- attributed asset resource/name/text when supplied by the API;
- `segments.date`

Required performance metrics:

- impressions;
- clicks;
- CTR;
- average CPC;
- cost micros;
- conversions;
- conversions value;
- all conversions;
- all conversions value.

Filters:

- SEARCH campaign;
- Responsive Search Ads only.

Google's `performance_label` is preserved exactly as provider evidence. RoofRoom does not convert it into an action or recommendation.

## 6. Temporal semantics

Historical performance and configuration snapshots are different facts.

### Performance

Metrics segmented by `segments.date` belong to the requested performance window.

### Snapshot attributes

Status, budget, bidding settings, quality score, ad text, policy state, ad strength, asset performance label, and similar entity attributes are treated as observed configuration/state at artifact acquisition time unless Google explicitly documents them as historical metrics.

Normalized rows/package provenance therefore carry:

- `performance_date`
- `snapshot_observed_at` (artifact acquisition timestamp)

RoofRoom must never claim that a configuration value observed today was also the configuration on an earlier metric date.

Previous configuration is shown only from a previous stored package/evidence snapshot. If no previous snapshot exists, it remains absent/NULL.

## 7. Recipe window and baseline rules

`ADS_OPTIMIZATION_PACK` v1 uses:

- CURRENT = last 7 complete calendar days;
- PREVIOUS = the previous eligible package's stored 7-day current window.

Both windows are seven calendar days.

Overlap is forbidden.

Eligibility is date-window based:

`proposed_current_window.start > previous_current_window.end`

A gap is allowed because this is on-demand, not scheduled. `gap_days` is recorded in the manifest and is not judged.

The first successful package is an `INITIAL_BASELINE` package with CURRENT only. It is exportable and becomes the first future baseline.

Only a previous successful compatible `ADS_OPTIMIZATION_PACK` package may become PREVIOUS baseline. A Blog package, generic Data Package, Search Terms quick run, failed package, cancelled/incomplete package, or incompatible recipe version cannot become the baseline.

However compatible accepted evidence from other collection runs may satisfy CURRENT dataset requirements through evidence reuse.

## 8. Evidence reuse

The goal is to avoid unnecessary duplicate provider calls without fabricating evidence.

### 8.1 Current evidence reuse

A candidate is reusable only when all relevant compatibility dimensions match:

- same Workspace;
- same snapshotted Google Ads `customer_id`;
- same logical source family and dataset type;
- same resource/source mode;
- SEARCH campaign contract;
- same normalized dataset schema version;
- accepted artifact state and export-eligible validation status;
- requested dimensions satisfy the recipe;
- required date coverage is available;
- acquisition freshness satisfies the v1 reuse policy.

v1 freshness policy for CURRENT evidence:

**same local calendar day as the package review/start**.

This directly supports the intended case where Blog/Ads tasks run on the same day without repeating an identical Google Ads call, while avoiding silent reuse of stale current performance evidence across later days.

### 8.2 Exact reuse

If a compatible accepted artifact covers exactly the required current window, reuse it without a provider call.

### 8.3 Deterministic date slice

If a compatible same-day accepted artifact covers a strict superset and its normalized rows contain source-native daily `segments.date`, select only rows whose provider date lies inside the requested seven-day window.

This is filtering, not estimation.

A compatible `NO_DATA` artifact for a superset window may satisfy a subset window because the provider returned no rows for the entire superset under the same query semantics.

### 8.4 Forbidden reuse

Never derive a missing window by:

- proportional allocation;
- arithmetic estimation;
- interpolation;
- averaging;
- subtracting unrelated aggregates;
- copying today's snapshot backward in time.

If exact reuse or deterministic row filtering cannot prove the needed evidence, collect again.

### 8.5 Previous evidence

PREVIOUS evidence is never refetched. It comes from the immutable evidence references stored in the previous eligible package manifest.

## 9. Task package architecture

A Task Package is not a provider collection Run.

Provider acquisition continues to use the existing Run → Job → Attempt lifecycle.

Task packaging is a source-neutral assembly layer that may reference accepted evidence from multiple Runs.

v1 does **not** add separate Blog/Ads run databases and does not require a new SQLite table merely to represent a package.

Canonical package storage:

`app-data/data/packages/<package_id>/`

Each package contains at least:

- `MANIFEST.json`
- the generated XLSX workbook

Raw provider artifacts remain under their original run-scoped canonical storage and are referenced, not copied and relabeled as new provider evidence.

The package manifest is sufficient for v1 baseline discovery; package manifests are schema-validated when scanned.

## 10. Package manifest

The v1 manifest records at least:

- `package_id`
- `recipe_id = ADS_OPTIMIZATION_PACK`
- `recipe_version = 1`
- `package_kind = INITIAL_BASELINE | COMPARISON`
- `workspace_id`
- `customer_id`
- `created_at`
- application version
- `campaign_scope = SEARCH`
- current window start/end
- previous package id and previous window when present
- `gap_days` when comparison exists
- dataset schema version
- required dataset list
- per-dataset evidence disposition:
  - `COLLECTED`
  - `REUSED_EXACT`
  - `REUSED_FILTERED`
  - `NO_DATA`
- original run/job/artifact identities
- artifact SHA-256
- artifact acquisition timestamp
- validation status
- source/resource mode
- snapshot-observed timestamp
- explicit excluded coverage such as `PERFORMANCE_MAX = NOT_IN_RECIPE`

Manifest contains no performance interpretation.

## 11. Workbook contract

Comparison workbook filename:

`kampanya-gelisim-<current-package-date>-<previous-package-date>.xlsx`

Initial baseline filename:

`kampanya-gelisim-<current-package-date>-baseline.xlsx`

Filename dates are package creation dates, not metric-window dates.

Metric windows remain explicit inside `00_MANIFEST`.

Comparison workbook sheets:

1. `00_MANIFEST`
2. `01_CURRENT_CAMPAIGNS`
3. `02_PREVIOUS_CAMPAIGNS`
4. `03_CURRENT_AD_GROUPS`
5. `04_PREVIOUS_AD_GROUPS`
6. `05_CURRENT_KEYWORDS`
7. `06_PREVIOUS_KEYWORDS`
8. `07_CURRENT_SEARCH_TERMS`
9. `08_PREVIOUS_SEARCH_TERMS`
10. `09_CURRENT_ADS`
11. `10_PREVIOUS_ADS`
12. `11_CURRENT_RSA_ASSETS`
13. `12_PREVIOUS_RSA_ASSETS`

For an initial baseline, previous sheets are omitted rather than filled with invented blank comparison rows.

Rows retain source-native identifiers and `performance_date` plus `snapshot_observed_at` where relevant.

No delta, CPA, ROAS, winner/loser, score, recommendation, or action column is generated in v1.

## 12. Review and Start behavior

User flow:

`RoofRoom → Kampanya Gelişim → Review → Start → XLSX`

Review makes no provider API call.

Review uses only local state to display:

- current seven-day window;
- previous eligible package/window, if any;
- next eligible date when overlap guard blocks a comparison;
- one Google Ads connection readiness state;
- each of six datasets as:
  - Reuse exact
  - Reuse filtered
  - Collect required
  - Blocked

If an identical successful package already exists for the same recipe/customer/current window, Review should offer/open that package rather than creating a duplicate baseline entry.

Start performs provider calls only for `Collect required` datasets.

If one required dataset fails, successfully collected/reused evidence remains preserved and the failed dataset is independently retryable. Package export waits until all six required coverages are accepted or valid `NO_DATA`.

## 13. Validation

Each dataset validator must fail closed on:

- wrong source/dataset/resource mode;
- non-SEARCH rows or unsupported campaign mode;
- malformed SearchStream envelope;
- malformed nested GoogleAdsRow structure;
- missing required entity identity;
- invalid/non-parseable metric values;
- dates outside the immutable requested range;
- missing `segments.date` where performance rows exist;
- schema mismatch.

Missing provider numeric evidence remains NULL.

True provider zero remains zero.

Empty `results` across the accepted provider response is `NO_DATA`, not an error.

Low volume is not a reason to expand the seven-day recipe window automatically.

## 14. Credential and safety boundary

The Ads reporting family uses the existing Google Ads OAuth/customer connection rather than adding passwords or a second auth system.

The current persisted Search Terms connection acts as the v1 compatibility anchor for Google Ads customer/credential resolution. The UI may label this connection simply `Google Ads` in the task workflow, but this design does not require renaming persisted connection IDs.

No secret enters:

- renderer payloads;
- Job contexts;
- manifests;
- XLSX/JSON exports;
- logs;
- fixtures.

No automated regression test calls the live Google Ads API.

## 15. Testing strategy

Deterministic tests use official-schema-shaped mocks for development.

A hand-written mock proves internal parsing behavior only; it is not labeled as live provider proof.

Before a new dataset is declared complete, a separately approved minimal live smoke must confirm its actual Google Ads v25 response and a sanitized real response fixture must replace/augment the development mock according to `TEST_STRATEGY.md`.

Required deterministic coverage:

- canonical SearchStream envelope flattening;
- camelCase nested REST row parsing;
- six query builders;
- SEARCH-only fail-closed behavior;
- exact absolute date propagation;
- null versus zero;
- NO_DATA acceptance;
- each dataset validator;
- raw artifact preservation;
- independent Job retry;
- production runtime composition;
- production Data Package loading;
- evidence compatibility/reuse (later package slice);
- package baseline/manifest/workbook (later package slice);
- desktop Review/Start flow (later UI slice).

## 16. Implementation decomposition

This design is intentionally implemented in separate verified subprojects.

### Slice A — Google Ads SEARCH reporting source family

Build the official-API source family, six dataset contracts/adapters/validators, canonical SearchStream parsing, runtime composition, and Data Package loading. Preserve the existing Search Terms quick run.

No task package UI or evidence reuse yet.

### Slice B — Evidence resolver + Task Package assembler/exporter

Add local package storage, recipe identity/version, baseline discovery, same-day evidence reuse, deterministic slicing, manifest, and XLSX exporter.

No provider-specific analysis.

### Slice C — Desktop workflow + hardening

Add `Kampanya Gelişim` Review/Start/Retry/Open flow, local reuse status presentation, overlap guard, initial baseline behavior, release integration, and explicit live acceptance gates.

Each slice must pass its own deterministic gate before the next begins.

## 17. Out of scope for v1

- Performance Max;
- Shopping/Display/Demand Gen/App/Video campaign evidence;
- Auction Insights competitors;
- change history;
- recommendations API;
- automatically applying Google recommendations;
- budget/bid/ad/keyword mutations;
- schedules/background autonomous runs;
- AI analysis;
- CPA/ROAS/delta calculations in RoofRoom;
- optimization scoring;
- generic user-authored recipe DSL/editor;
- dynamic 28/30-day expansion due to low volume;
- automatic historical reconstruction of configuration.

## 18. Acceptance criteria for the complete feature

`ADS_OPTIMIZATION_PACK` v1 is complete only when:

1. SEARCH-only coverage is explicit and enforced.
2. All six required datasets use accepted official-API evidence or valid `NO_DATA`.
3. Raw provider responses are immutable and traceable.
4. Canonical SearchStream response shape is parsed and validated.
5. Missing is never silently converted to zero.
6. No arithmetic estimate is accepted as provider evidence.
7. Current performance uses an exact seven-day window.
8. Previous performance comes only from an eligible stored previous package.
9. Snapshot attributes retain their actual observation timestamp.
10. Same-day compatible evidence can be reused without another provider call.
11. Deterministic subset filtering uses real daily rows only.
12. Required evidence failure blocks package readiness without discarding successful evidence.
13. Initial baseline packaging works without inventing previous data.
14. Comparison package produces the documented workbook/manifest.
15. No analysis/recommendation fields are generated.
16. Deterministic gates pass without live provider calls.
17. Separately approved live smoke evidence exists for every new Google Ads resource contract before Release 1.0 is declared complete.
18. Canonical project documentation and `PROJECT_HANDOFF.md` describe only verified implementation state.

## 19. Official API evidence used for this design

Verified against Google Ads API v25 official documentation on 2026-09-29:

- SearchStream/Search REST behavior and canonical JSON mapping.
- `campaign` reporting fields/metrics.
- `ad_group` reporting fields/metrics.
- `keyword_view` and attributed `ad_group_criterion` fields.
- `search_term_view`, including its explicit exclusion of Performance Max.
- `ad_group_ad` and Responsive Search Ad fields.
- `ad_group_ad_asset_view`, including RSA support and `performance_label`/`pinned_field`.
- `campaign_budget.amount_micros` and related budget fields.

Implementation must re-check official v25 field compatibility while writing each exact GAQL query rather than assuming a cross-resource field combination is valid merely because each field exists independently.
