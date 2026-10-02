# Google Ads Campaign Settings v1 — Design

**Date:** 2026-10-02
**Branch:** `feat/google-ads-campaign-settings-v1`
**Base checkpoint:** `fba9ca2`
**Source family:** `google-ads-configuration`
**Source mode:** `OFFICIAL_API`
**Google Ads API:** v25

## 1. Goal

Add a bounded provider-native Google Ads current-configuration snapshot for Search campaign delivery/configuration.

The slice extends the existing `google-ads-configuration` family with campaign configuration, campaign budgets, and a narrow allowlist of campaign targeting criteria.

It is evidence collection, not performance reporting, optimization analysis, compliance scoring, recommendation, or mutation.

The governing model remains:

> Collect → Preserve → Validate → Normalize where deterministic → Document → Package → Export

Raw provider evidence remains authoritative.

Requested or expected values must never be copied into observed provider fields.

## 2. Public dataset scope

Add exactly three public datasets:

```text
CAMPAIGN_SETTINGS
CAMPAIGN_BUDGETS
CAMPAIGN_TARGETING_CRITERIA
```

The existing Google Ads configuration family therefore grows from eleven to exactly fourteen datasets.

Resource ownership:

```text
CAMPAIGN_SETTINGS
  → CAMPAIGN

CAMPAIGN_BUDGETS
  → CAMPAIGN_BUDGET

CAMPAIGN_TARGETING_CRITERIA
  → CAMPAIGN_CRITERION
```

`CAMPAIGN_TARGETING_CRITERIA` is limited to:

```text
LOCATION
LANGUAGE
DEVICE
AD_SCHEDULE
```

No other `campaign_criterion` family belongs to this slice.

## 3. Snapshot semantics

This is a current configuration snapshot.

It has:

- no requested date window;
- no performance metrics;
- no performance segmentation;
- no historical configuration reconstruction;
- `supports_custom_date_range: false`.

`CAMPAIGN_SETTINGS` and `CAMPAIGN_TARGETING_CRITERIA` are restricted to provider campaigns whose `advertising_channel_type` is `SEARCH`.

`CAMPAIGN_BUDGETS` preserves one row per provider `campaign_budget` resource. It is not converted into a campaign-budget association dataset.

Search campaign budget usage is proven through:

```text
CAMPAIGN_SETTINGS.campaign_budget_resource_name
→ CAMPAIGN_BUDGETS.campaign_budget_resource_name
```

A budget row alone does not prove Search campaign usage.

## 4. Ownership boundary

Conversion configuration remains owned by Conversion Configuration v1.

Campaign Settings v1 must not collect:

- conversion actions;
- customer conversion goals;
- campaign conversion goals;
- custom conversion goals;
- customer conversion tracking settings.

Conceptually:

```text
Conversion Configuration v1
  → conversion optimization configuration

Campaign Settings v1
  → campaign delivery/configuration
```

Account-level settings such as `customer.auto_tagging_enabled` also remain outside this slice.

## 5. CAMPAIGN_SETTINGS

### 5.1 Grain

One normalized row represents one provider `campaign` resource returned by the approved Search-only query.

Provider `REMOVED` rows may remain preserved as snapshot evidence.

RoofRoom does not add synthetic effective-state fields.

### 5.2 Normalized fields

```text
campaign_resource_name
campaign_id
campaign_name
campaign_status

advertising_channel_type
advertising_channel_sub_type

start_date_time
end_date_time

campaign_budget_resource_name

campaign_keyword_match_type

bidding_strategy_type
bidding_strategy_resource_name

manual_cpc_enhanced_cpc_enabled

target_spend_cpc_bid_ceiling_micros
target_spend_target_spend_micros

maximize_conversions_target_cpa_micros
maximize_conversion_value_target_roas

target_cpa_target_cpa_micros
target_roas_target_roas

target_impression_share_location
target_impression_share_location_fraction_micros
target_impression_share_cpc_bid_ceiling_micros

target_google_search
target_search_network
target_content_network
target_partner_search_network

positive_geo_target_type
negative_geo_target_type

tracking_url
tracking_url_template
final_url_suffix

ai_max_enable_ai_max
ai_max_bundling_required

asset_automation_settings[]
```

Each `asset_automation_settings` item preserves:

```text
asset_automation_type
asset_automation_status
```

### 5.3 Bidding semantics

Do not flatten bidding evidence into a synthetic strategy field.

Preserve:

- provider `bidding_strategy_type`;
- portfolio `bidding_strategy` resource reference where present;
- applicable provider-native campaign-owned strategy fields.

`target_spend` remains the provider-native campaign representation relevant to Maximize Clicks.

`target_spend.target_spend_micros` is deprecated provider evidence only. RoofRoom must not promote it into an invented canonical metric.

Target Impression Share fields remain included as provider-native Search campaign bidding configuration.

### 5.4 Portfolio strategy limitation

When `campaign.bidding_strategy` contains a portfolio strategy resource name, Campaign Settings v1 proves only:

- assignment;
- type;
- provider resource reference.

It does not prove the portfolio bidding strategy parameter configuration.

Do not add a synthetic field such as:

```text
portfolio_strategy_config_complete
```

A future `BIDDING_STRATEGY_SETTINGS` scope may collect portfolio strategy internals if a real requirement appears.

### 5.5 Network semantics

Preserve separately:

```text
network_settings.target_google_search
network_settings.target_search_network
network_settings.target_content_network
network_settings.target_partner_search_network
```

`target_search_network` and `target_partner_search_network` must not be collapsed into one meaning.

### 5.6 Geo routing semantics

Preserve:

```text
geo_target_type_setting.positive_geo_target_type
geo_target_type_setting.negative_geo_target_type
```

These campaign-level geo-routing fields remain separate from individual LOCATION criteria.

### 5.7 Tracking and URL configuration

Preserve provider-native:

```text
tracking_setting.tracking_url
tracking_url_template
final_url_suffix
```

No synthetic routing interpretation is introduced.

### 5.8 AI Max and asset automation

Preserve:

```text
ai_max_setting.enable_ai_max
ai_max_setting.bundling_required
asset_automation_settings
```

Repeated provider automation settings remain repeated normalized evidence.

The collector does not reinterpret these values into scoring or recommendations.

### 5.9 Campaign lifecycle timestamps

Use provider v25 fields:

```text
start_date_time
end_date_time
```

Do not restore deprecated `start_date` / `end_date`.

The provider values are preserved as returned.

Campaign Settings v1 does not invent account timezone metadata if it is not independently evidenced elsewhere.

### 5.10 Exact GAQL

```sql
SELECT
  campaign.resource_name,
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.advertising_channel_sub_type,
  campaign.start_date_time,
  campaign.end_date_time,
  campaign.campaign_budget,
  campaign.keyword_match_type,
  campaign.bidding_strategy_type,
  campaign.bidding_strategy,
  campaign.manual_cpc.enhanced_cpc_enabled,
  campaign.target_spend.cpc_bid_ceiling_micros,
  campaign.target_spend.target_spend_micros,
  campaign.maximize_conversions.target_cpa_micros,
  campaign.maximize_conversion_value.target_roas,
  campaign.target_cpa.target_cpa_micros,
  campaign.target_roas.target_roas,
  campaign.target_impression_share.location,
  campaign.target_impression_share.location_fraction_micros,
  campaign.target_impression_share.cpc_bid_ceiling_micros,
  campaign.network_settings.target_google_search,
  campaign.network_settings.target_search_network,
  campaign.network_settings.target_content_network,
  campaign.network_settings.target_partner_search_network,
  campaign.geo_target_type_setting.positive_geo_target_type,
  campaign.geo_target_type_setting.negative_geo_target_type,
  campaign.tracking_setting.tracking_url,
  campaign.tracking_url_template,
  campaign.final_url_suffix,
  campaign.ai_max_setting.enable_ai_max,
  campaign.ai_max_setting.bundling_required,
  campaign.asset_automation_settings
FROM campaign
WHERE campaign.advertising_channel_type = 'SEARCH'
```

Do not add:

```text
status != REMOVED
metrics.*
segments.*
date filters
```

## 6. CAMPAIGN_BUDGETS

### 6.1 Grain

Exactly one normalized row per returned provider `campaign_budget`.

Do not change the grain to:

```text
campaign_budget × campaign association
```

Do not add campaign fields or campaign association segmentation.

### 6.2 Normalized fields

```text
campaign_budget_resource_name
campaign_budget_id
campaign_budget_name
campaign_budget_status

amount_micros
delivery_method
explicitly_shared
reference_count
total_amount_micros
period
type
```

`reference_count` is provider-native shared-budget evidence and must be preserved.

`explicitly_shared` remains distinct from `reference_count`.

Do not infer exact association membership from either value.

### 6.3 Amount semantics

Preserve provider-native amount fields.

Missing or non-applicable values must not become zero.

Do not total, allocate, deduplicate, or otherwise reconstruct budget amounts inside the collector.

### 6.4 Exact GAQL

```sql
SELECT
  campaign_budget.resource_name,
  campaign_budget.id,
  campaign_budget.name,
  campaign_budget.status,
  campaign_budget.amount_micros,
  campaign_budget.delivery_method,
  campaign_budget.explicitly_shared,
  campaign_budget.reference_count,
  campaign_budget.total_amount_micros,
  campaign_budget.period,
  campaign_budget.type
FROM campaign_budget
```

Do not add campaign association segments.

Do not add a Search-only association filter.

## 7. CAMPAIGN_TARGETING_CRITERIA

### 7.1 Grain

One normalized row represents one returned provider `campaign_criterion` belonging to a Search campaign and one approved criterion type:

```text
LOCATION
LANGUAGE
DEVICE
AD_SCHEDULE
```

### 7.2 Common normalized fields

```text
criterion_resource_name

campaign_resource_name
campaign_id
campaign_name
campaign_status

criterion_id
criterion_type
negative
criterion_status
```

`negative` is preserved because positive targeting alone does not prove the absence of exclusions.

### 7.3 LOCATION fields

```text
location_geo_target_constant_resource_name

location_geo_target_constant_id
location_geo_target_constant_name
location_geo_target_constant_canonical_name
location_geo_target_constant_country_code
location_geo_target_constant_target_type
location_geo_target_constant_status
```

The resource reference comes from campaign-criterion SearchStream evidence.

Human-resolvable geo fields come from a second provider request that resolves only resource names actually observed in that SearchStream response.

No requested/configured country value may populate these observed fields.

### 7.4 LANGUAGE fields

```text
language_constant_resource_name
language_constant_id
language_constant_code
language_constant_name
language_constant_targetable
```

Language constant details are collected as attributed provider evidence in the campaign-criterion query.

### 7.5 DEVICE fields

```text
device_type
```

### 7.6 AD_SCHEDULE fields

```text
ad_schedule_day_of_week
ad_schedule_start_hour
ad_schedule_start_minute
ad_schedule_end_hour
ad_schedule_end_minute
```

### 7.7 Exact criterion GAQL

```sql
SELECT
  campaign_criterion.resource_name,
  campaign_criterion.campaign,
  campaign_criterion.criterion_id,
  campaign_criterion.type,
  campaign_criterion.negative,
  campaign_criterion.status,
  campaign_criterion.location.geo_target_constant,
  campaign_criterion.language.language_constant,
  language_constant.resource_name,
  language_constant.id,
  language_constant.code,
  language_constant.name,
  language_constant.targetable,
  campaign_criterion.device.type,
  campaign_criterion.ad_schedule.day_of_week,
  campaign_criterion.ad_schedule.start_hour,
  campaign_criterion.ad_schedule.start_minute,
  campaign_criterion.ad_schedule.end_hour,
  campaign_criterion.ad_schedule.end_minute,
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type
FROM campaign_criterion
WHERE campaign.advertising_channel_type = 'SEARCH'
  AND campaign_criterion.type IN (
    'LOCATION',
    'LANGUAGE',
    'DEVICE',
    'AD_SCHEDULE'
  )
```

No other criterion family is accepted.

## 8. Geo target resolver

### 8.1 Why a second provider request exists

The campaign-criterion SearchStream proves the LOCATION `geo_target_constant` resource reference but does not by itself provide the complete human-resolvable geo detail required by this contract.

The collector therefore resolves only observed LOCATION resource names.

### 8.2 Request derivation

After parsing the criterion SearchStream:

1. collect LOCATION `geoTargetConstants/...` resource names;
2. preserve exact resource identity;
3. deduplicate only for the resolver request;
4. if no LOCATION refs exist, do not issue a resolver request;
5. otherwise call Google Ads API v25 `SuggestGeoTargetConstants`;
6. use the provider request form accepting exact geo target resource names;
7. never substitute expected country, locale, or campaign configuration values.

### 8.3 Resolver completeness

For every observed LOCATION resource name:

- provider resolution evidence must exist;
- returned geo identity must correspond to the requested provider resource;
- normalized detail must come from returned provider evidence.

Missing resolver evidence must not be reconstructed.

## 9. Targeting raw evidence bundle

The current Core lifecycle persists one candidate artifact per Attempt.

Campaign Settings v1 does not change that lifecycle.

`CAMPAIGN_TARGETING_CRITERIA` therefore uses a source-owned lossless evidence bundle when geo resolution is required.

Conceptual artifact:

```json
{
  "bundle_schema_version": 1,
  "parts": [
    {
      "kind": "CAMPAIGN_CRITERIA_SEARCH_STREAM",
      "raw_body_base64": "..."
    },
    {
      "kind": "GEO_TARGET_CONSTANT_SUGGESTIONS",
      "requested_resource_names": [
        "geoTargetConstants/..."
      ],
      "raw_body_base64": "..."
    }
  ]
}
```

Rules:

- exact provider response bytes are preserved losslessly as base64;
- provider bytes are not parsed and reserialized as a substitute for raw evidence;
- SearchStream part is mandatory;
- geo resolver part exists only when LOCATION refs were observed;
- resolver requested resource names are persisted as request context;
- normalized rows remain derived representation;
- this bundle does not become a generic multi-request abstraction.

When no LOCATION refs exist, the targeting artifact contains only the SearchStream part.

Campaign and Budget datasets continue to preserve exact raw SearchStream bytes directly.

## 10. Collection lifecycle limitation

The source continues using:

```text
Run
→ Job
→ Attempt
→ candidate artifact
→ validation
```

No dynamic provider-specific Job is created after validation.

No Core dependent-Job scheduler is added.

No Core multi-artifact-per-Attempt redesign is added.

If the criterion SearchStream succeeds but a required geo resolver call fails operationally, the Attempt fails before producing its single candidate artifact.

This slice does not redesign Core solely to persist partial multi-request Attempts.

## 11. Protobuf / ProtoJSON presence semantics

Normalization must be field-aware.

Do not apply:

```text
missing JSON key → null
```

as a generic rule.

Use:

```text
explicit-presence scalar/message
  unset        → null
  set default  → actual default

oneof / inactive bidding strategy message
  inactive     → null

repeated
  selected and empty → []

implicit-presence scalar
  provider/protobuf default semantics apply
  JSON omission alone does not prove null

type-specific criterion fields
  unrelated family → normalized null
  active family    → provider value/default preserved
```

Real provider values such as:

```text
false
0
ZERO
UNSPECIFIED
[]
```

must remain distinguishable from unavailable evidence wherever provider semantics support the distinction.

`asset_automation_settings` is repeated evidence. A successfully requested field with no returned elements normalizes to `[]`.

Do not invent a nullable repeated-field presence distinction.

## 12. Validation

Reuse the current Google Ads configuration validator ownership and immutable-context boundary.

### 12.1 Empty results

A structurally and semantically valid zero-row result may validate as:

```text
NO_DATA
```

for:

```text
CAMPAIGN_SETTINGS
CAMPAIGN_BUDGETS
CAMPAIGN_TARGETING_CRITERIA
```

### 12.2 Existing failure mapping

Preserve:

```text
artifact/run/job/attempt ownership mismatch
  → INVALID_SCHEMA

invalid immutable Job context
  → QUERY_MISMATCH

dataset/resource semantic mismatch
  → QUERY_MISMATCH

provider-row semantic/type mismatch
  → QUERY_MISMATCH

unreadable / non-JSON artifact
  → ERROR_NOT_DATA

malformed SearchStream or malformed targeting bundle
  → INVALID_SCHEMA
```

### 12.3 Targeting validation

For `CAMPAIGN_TARGETING_CRITERIA`:

- SearchStream bundle part is required;
- only LOCATION/LANGUAGE/DEVICE/AD_SCHEDULE are accepted;
- campaign type must be SEARCH;
- each criterion family must satisfy its own required detail contract;
- unrelated type-specific normalized fields remain null;
- LOCATION rows require provider geo resource references;
- if LOCATION rows exist, resolver evidence is required;
- resolver request refs must equal the unique observed LOCATION refs;
- every observed LOCATION ref must resolve;
- resolved identity must correspond to the criterion resource reference;
- LANGUAGE rows require attributed language identity/detail evidence.

Missing required geo resolution maps to:

```text
QUERY_MISMATCH
```

Operational resolver failure remains an acquisition failure rather than a validation outcome.

## 13. REMOVED semantics

Do not filter provider `REMOVED` resources merely to produce a cleaner snapshot.

They may remain preserved as provider snapshot/audit evidence.

This slice does not claim that `REMOVED` rows are effective active configuration.

Do not add derived fields or tables for:

```text
effective campaign count
effective targeting coverage
effective budget relationships
configuration compliance
```

Downstream consumers that later derive effective-current state must apply provider lifecycle/status semantics explicitly.

## 14. Source composition

Provider-specific behavior stays under:

```text
src/main/sources/google-ads/**
```

Expected implementation surface:

```text
src/shared/google-ads-configuration.ts
  + three dataset IDs
  + three resource modes
  + normalized row contracts

src/main/sources/google-ads/campaign-settings-request.ts
  exact campaign GAQL
  exact budget GAQL
  exact targeting GAQL
  geo resolver request helper

src/main/sources/google-ads/campaign-settings-adapter.ts
  campaign normalization
  budget normalization
  targeting normalization
  targeting bundle parse/join

src/main/sources/google-ads/configuration-normalizer.ts
  dispatch fourteen datasets

src/main/sources/google-ads/configuration-source.ts
  + three dataset descriptors
  campaign/budget → existing SearchStream path
  targeting → bounded source-owned multi-request path

src/main/sources/google-ads/configuration-validator.ts
  existing ownership/context mappings
  Campaign Settings semantic validation
  targeting bundle completeness validation
```

Do not generalize the targeting special case into a generic multi-request descriptor framework.

If production composition already consumes the shared configuration dataset constant, do not add redundant production behavior.

## 15. Connection and security boundary

Reuse the existing canonical Workspace Google Ads connection and authenticated requester.

Do not add:

- a new connection type;
- a new credential field;
- Developer Token setup;
- password storage;
- CAPTCHA/2FA bypass;
- proxy/session copying.

Ordinary deterministic tests must not call Google Ads live.

## 16. TDD sequence

Implementation follows focused deterministic TDD:

1. add failing contract/query tests for the three datasets;
2. implement the minimum shared contract and exact request builders;
3. add failing normalization tests for Campaign, CampaignBudget, and four targeting families;
4. implement provider-native normalization and protobuf presence handling;
5. add failing acquisition tests for geo resolution and lossless targeting bundle evidence;
6. implement the bounded targeting multi-request acquisition path;
7. extend configuration source dispatch from eleven to fourteen datasets;
8. add failing validation cases for Campaign Settings and targeting resolver completeness;
9. implement the minimum validation changes;
10. prove production composition exposes exactly fourteen configuration datasets and reuses the existing connection;
11. add the focused Campaign Settings gate;
12. run affected regression/static verification;
13. adopt canonical docs only from observed evidence.

Every production behavior change receives a deterministic failing test before its minimum implementation.

## 17. Focused gate

Create:

```text
tests/integration/google-api/run-google-ads-campaign-settings-gate.sh
```

It covers at minimum:

```text
Campaign Settings contract/query test
Campaign Settings normalization test
configuration source integration
configuration validation integration
```

Success marker:

```text
PASS GOOGLE-ADS-CAMPAIGN-SETTINGS-GATE-001
```

Normal execution must not call Google Ads live.

## 18. Affected regressions

Final deterministic acceptance includes:

```text
run-google-ads-campaign-settings-gate.sh
run-google-ads-conversion-configuration-gate.sh
run-google-ads-negatives-gate.sh
run-google-ads-search-reporting-gate.sh
production source composition integration
npx tsc --noEmit
npm run lint
git diff --check
```

If the known nested-worktree ESLint plugin-resolution issue reproduces, use the same worktree-local isolated ESLint verification already established by the previous configuration slice.

Do not change lint configuration merely to work around worktree ancestry.

## 19. Documentation adoption

After deterministic verification:

- adopt Campaign Settings v1 data semantics in `DATA_CONTRACTS.md`;
- adopt validation and geo-resolution completeness rules in `VALIDATION_SPEC.md`;
- update `PROJECT_HANDOFF.md` only from actual branch and verification evidence.

Do not add package, preset, workbook, recommendation, score, or export-recipe semantics.

## 20. Explicitly out of scope

This design excludes:

```text
performance metrics
date-window reporting
historical configuration reconstruction

conversion actions
conversion goals
conversion tracking settings

customer.auto_tagging_enabled
other account-level settings

placements
topics
audiences
demographics
user lists
content labels
IP blocks
webpages
other campaign_criterion families

portfolio bidding-strategy internals

mutations
bidding changes
recommendations
optimization analysis
compliance scoring

effective-current derived tables

Performance Max claims

package/preset/export recipe integration

live-provider verification

Core dynamic dependent-Job scheduling
Core multi-artifact-per-Attempt redesign
generic multi-request source framework
```

## 21. Acceptance boundary

The slice may be called `implemented + deterministically verified` only when fresh evidence proves:

- exact three-dataset Campaign Settings contract;
- compatibility of the existing eleven configuration datasets;
- exact v25 campaign/budget/criterion query construction;
- provider-native normalization and presence semantics;
- lossless targeting raw evidence preservation;
- geo resolver completeness and traceability;
- fail-closed validation;
- production registration of exactly fourteen configuration datasets;
- existing Google Ads connection reuse;
- focused Campaign Settings gate;
- affected regression gates;
- TypeScript/static checks;
- canonical documentation adoption.

Do not call the slice:

- live-provider verified;
- packaged/runtime verified;
- pushed;
- merged;

without separate evidence supporting that exact claim.
