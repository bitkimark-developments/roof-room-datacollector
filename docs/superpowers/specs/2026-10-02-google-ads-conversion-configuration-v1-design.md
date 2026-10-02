# Google Ads Conversion Configuration v1 — Design

**Date:** 2026-10-02
**Status:** Approved design awaiting implementation plan
**Branch:** `feat/google-ads-conversion-configuration-v1`
**Base checkpoint:** `8cbb900`
**Source family:** `google-ads-configuration`

## 1. Goal

Add the minimum Google Ads configuration evidence required to preserve the provider-side inputs from which a downstream system can determine a campaign's effective conversion-goal configuration.

RoofRoom does not calculate, score, recommend, or declare the effective optimization goal set.

The approved scope is the bounded C-lite conversion configuration surface.

## 2. Architecture boundary

Reuse the existing source:

~~~text
source_id: google-ads-configuration
source_mode: OFFICIAL_API
supports_custom_date_range: false
dataset_schema_version: 1
~~~

Do not create a new source identity, credential type, Workspace connection, Core lifecycle, persistence migration, package recipe, or optimization layer.

All datasets are current configuration snapshots, not date-windowed reporting datasets.

## 3. Dataset contract

Keep the existing Negatives v1 subset explicit and unchanged:

~~~text
CAMPAIGN_NEGATIVE_KEYWORDS
AD_GROUP_NEGATIVE_KEYWORDS
SHARED_NEGATIVE_KEYWORDS
CAMPAIGN_NEGATIVE_KEYWORD_LISTS
ACCOUNT_NEGATIVE_KEYWORD_LISTS
~~~

Add the Conversion Configuration v1 subset:

~~~text
CONVERSION_ACTIONS
CUSTOMER_CONVERSION_GOALS
CONVERSION_GOAL_CAMPAIGN_CONFIGS
CAMPAIGN_CONVERSION_GOALS
CUSTOM_CONVERSION_GOALS
CUSTOMER_CONVERSION_TRACKING_SETTINGS
~~~

After adoption:

- Negatives v1 remains exactly five datasets.
- Conversion Configuration v1 is exactly six datasets.
- `google-ads-configuration` supports exactly eleven datasets.

Dataset-to-resource modes:

~~~text
CONVERSION_ACTIONS
→ CONVERSION_ACTION

CUSTOMER_CONVERSION_GOALS
→ CUSTOMER_CONVERSION_GOAL

CONVERSION_GOAL_CAMPAIGN_CONFIGS
→ CONVERSION_GOAL_CAMPAIGN_CONFIG

CAMPAIGN_CONVERSION_GOALS
→ CAMPAIGN_CONVERSION_GOAL

CUSTOM_CONVERSION_GOALS
→ CUSTOM_CONVERSION_GOAL

CUSTOMER_CONVERSION_TRACKING_SETTINGS
→ CUSTOMER
~~~

The immutable Job context remains:

~~~text
source_id
dataset_type
resource_mode
customer_id
dataset_schema_version: 1
~~~

No conversion-specific field is added to generic Job context.

## 4. Normalized evidence contract

### `CONVERSION_ACTIONS`

Preserve:

~~~text
conversion_action_resource_name
conversion_action_id
conversion_action_name
conversion_action_status
conversion_action_type
conversion_action_category
conversion_action_origin
owner_customer
counting_type
primary_for_goal
include_in_conversions_metric
click_through_lookback_window_days
view_through_lookback_window_days
attribution_model
data_driven_model_status
default_value
default_currency_code
always_use_default_value
google_analytics_4_property_id
google_analytics_4_event_name
~~~

`include_in_conversions_metric` is retained as legacy provider evidence only. It is not RoofRoom's canonical authority for bidding semantics.

Nullable provider evidence remains null or absent. Do not fabricate owner, GA4, attribution, or value-setting evidence.

### `CUSTOMER_CONVERSION_GOALS`

~~~text
resource_name
category
origin
biddable
~~~

### `CONVERSION_GOAL_CAMPAIGN_CONFIGS`

~~~text
resource_name
campaign_resource_name
campaign_id
campaign_name
campaign_status
goal_config_level
custom_conversion_goal_resource_name
~~~

`goal_config_level` is required provider evidence.

### `CAMPAIGN_CONVERSION_GOALS`

~~~text
resource_name
campaign_resource_name
campaign_id
campaign_name
campaign_status
category
origin
biddable
~~~

### `CUSTOM_CONVERSION_GOALS`

~~~text
resource_name
id
name
status
conversion_action_resource_names
~~~

Collect this dataset on every snapshot rather than conditionally.

A provider-returned empty membership array remains empty. Missing or unproven membership must not be manufactured as an empty array.

### `CUSTOMER_CONVERSION_TRACKING_SETTINGS`

~~~text
customer_resource_name
customer_id
conversion_tracking_status
conversion_tracking_id
cross_account_conversion_tracking_id
google_ads_conversion_customer
~~~

This dataset preserves conversion ownership and cross-account tracking context.

Requested `customer_id` must never populate observed conversion-owner fields.

## 5. Exact GAQL contract

Each dataset produces one independent SearchStream request.

No date segments, reporting metrics, historical windows, or recommendation fields are permitted.

### `CONVERSION_ACTIONS`

~~~sql
SELECT
  conversion_action.resource_name,
  conversion_action.id,
  conversion_action.name,
  conversion_action.status,
  conversion_action.type,
  conversion_action.category,
  conversion_action.origin,
  conversion_action.owner_customer,
  conversion_action.counting_type,
  conversion_action.primary_for_goal,
  conversion_action.include_in_conversions_metric,
  conversion_action.click_through_lookback_window_days,
  conversion_action.view_through_lookback_window_days,
  conversion_action.attribution_model_settings.attribution_model,
  conversion_action.attribution_model_settings.data_driven_model_status,
  conversion_action.value_settings.default_value,
  conversion_action.value_settings.default_currency_code,
  conversion_action.value_settings.always_use_default_value,
  conversion_action.google_analytics_4_settings.property_id,
  conversion_action.google_analytics_4_settings.event_name
FROM conversion_action
~~~

### `CUSTOMER_CONVERSION_GOALS`

~~~sql
SELECT
  customer_conversion_goal.resource_name,
  customer_conversion_goal.category,
  customer_conversion_goal.origin,
  customer_conversion_goal.biddable
FROM customer_conversion_goal
~~~

### `CONVERSION_GOAL_CAMPAIGN_CONFIGS`

~~~sql
SELECT
  conversion_goal_campaign_config.resource_name,
  conversion_goal_campaign_config.campaign,
  conversion_goal_campaign_config.goal_config_level,
  conversion_goal_campaign_config.custom_conversion_goal,
  campaign.id,
  campaign.name,
  campaign.status
FROM conversion_goal_campaign_config
~~~

### `CAMPAIGN_CONVERSION_GOALS`

~~~sql
SELECT
  campaign_conversion_goal.resource_name,
  campaign_conversion_goal.campaign,
  campaign_conversion_goal.category,
  campaign_conversion_goal.origin,
  campaign_conversion_goal.biddable,
  campaign.id,
  campaign.name,
  campaign.status
FROM campaign_conversion_goal
~~~

### `CUSTOM_CONVERSION_GOALS`

~~~sql
SELECT
  custom_conversion_goal.resource_name,
  custom_conversion_goal.id,
  custom_conversion_goal.name,
  custom_conversion_goal.status,
  custom_conversion_goal.conversion_actions
FROM custom_conversion_goal
~~~

### `CUSTOMER_CONVERSION_TRACKING_SETTINGS`

~~~sql
SELECT
  customer.resource_name,
  customer.id,
  customer.conversion_tracking_setting.conversion_tracking_status,
  customer.conversion_tracking_setting.conversion_tracking_id,
  customer.conversion_tracking_setting.cross_account_conversion_tracking_id,
  customer.conversion_tracking_setting.google_ads_conversion_customer
FROM customer
~~~

Do not add status filters merely to hide provider lifecycle evidence such as `REMOVED`.

## 6. Customer routing

All six Jobs use the immutable configured Google Ads `customer_id`.

V1 must not:

~~~text
collect tracking settings
→ inspect google_ads_conversion_customer
→ silently reroute another Job to a different customer
~~~

Provider-returned ownership and conversion-customer identities remain observed evidence.

Cross-account behavior that requires different request targeting must be proven separately before changing acquisition routing.

Deterministic tests do not constitute live cross-account provider verification.

## 7. Missing and null semantics

Missing is not zero, false, empty string, or inferred evidence.

Examples:

~~~text
owner_customer unavailable
→ null

cross_account_conversion_tracking_id unavailable
→ null

GA4 property/event unavailable
→ null

custom_conversion_goal reference unavailable
→ null

conversion action default currency unavailable
→ null
~~~

Real provider-returned `false` remains false.

Real provider-returned numeric zero remains zero.

Requested values must not populate observed fields without provider evidence.

## 8. Validation ordering

Keep the existing configuration validator lifecycle:

~~~text
artifact / Run / Job / Attempt ownership
→ immutable Job context
→ raw artifact read
→ JSON parse
→ SearchStream envelope flattening
→ dataset-specific normalization
→ dataset-specific cardinality
→ validation outcome
~~~

Failure mapping:

~~~text
ownership mismatch
→ INVALID_SCHEMA

Job context / dataset / resource-mode mismatch
→ QUERY_MISMATCH

unreadable or non-JSON raw artifact
→ ERROR_NOT_DATA

malformed SearchStream envelope
→ INVALID_SCHEMA

dataset-specific semantic/type mismatch
→ QUERY_MISMATCH
~~~

Do not add a new global validation status.

## 9. `NO_DATA` and cardinality

For these datasets:

~~~text
CONVERSION_ACTIONS
CUSTOMER_CONVERSION_GOALS
CONVERSION_GOAL_CAMPAIGN_CONFIGS
CAMPAIGN_CONVERSION_GOALS
CUSTOM_CONVERSION_GOALS
~~~

a valid SearchStream envelope with zero successfully normalized rows is `NO_DATA`.

For:

~~~text
CUSTOMER_CONVERSION_TRACKING_SETTINGS
~~~

the required cardinality is:

~~~text
exactly 1 valid row → VALID
0 rows              → QUERY_MISMATCH
more than 1 row     → QUERY_MISMATCH
~~~

`conversion_tracking_status = NOT_CONVERSION_TRACKED` is valid provider evidence and remains `VALID`.

Do not convert parser, auth, quota, schema, routing, or configuration failures into `NO_DATA`.

## 10. Effective-goal inference boundary

RoofRoom must not emit conclusions such as:

~~~text
Campaign X optimizes for purchase.
Campaign Y optimizes for add_to_cart.
~~~

RoofRoom preserves only the independent provider evidence required for a downstream consumer to derive such conclusions:

~~~text
conversion action identity/configuration
customer-level category/origin biddability
campaign goal-config level
campaign-level category/origin biddability
custom-goal membership
conversion tracking ownership context
~~~

No effective-goal score, decision, recommendation, or synthesized canonical field belongs in this slice.

## 11. Repository integration

Extend:

~~~text
src/shared/google-ads-configuration.ts
src/main/sources/google-ads/configuration-source.ts
src/main/sources/google-ads/configuration-validator.ts
src/main/app/production-collection-runtime.ts
tests/integration/google-api/google-ads-configuration-source.integration.cjs
tests/integration/google-api/google-ads-configuration-validation.integration.cjs
~~~

Add:

~~~text
src/main/sources/google-ads/conversion-configuration-request.ts
src/main/sources/google-ads/conversion-configuration-adapter.ts
src/main/sources/google-ads/configuration-normalizer.ts
~~~

`configuration-normalizer.ts` is a small source-module dispatcher only:

~~~text
Negatives dataset
→ negatives-adapter

Conversion Configuration dataset
→ conversion-configuration-adapter

unsupported dataset
→ fail closed
~~~

Do not move provider semantics into Core.

Do not rename or broadly refactor working Negatives files merely for symmetry.

The existing SearchStream transport, error mapping, raw-byte preservation, Google Ads connection reuse, snapshot capability, and lifecycle remain unchanged.

## 12. Shared contracts

Expose explicit dataset subsets:

~~~text
GOOGLE_ADS_NEGATIVES_DATASET_TYPES
GOOGLE_ADS_CONVERSION_CONFIGURATION_DATASET_TYPES
GOOGLE_ADS_CONFIGURATION_DATASET_TYPES
~~~

Contract:

~~~text
Negatives v1
→ exactly 5 datasets

Conversion Configuration v1
→ exactly 6 datasets

google-ads-configuration full family
→ exactly 11 datasets
~~~

## 13. Deterministic TDD coverage

Add focused contract coverage:

~~~text
tests/integration/google-api/google-ads-conversion-configuration-contract.integration.cjs
tests/integration/google-api/run-google-ads-conversion-configuration-contract-test.sh
~~~

Lock:

- six exact Conversion Configuration dataset IDs;
- six exact resource modes;
- schema-v1 immutable context;
- exact GAQL builders;
- no date segments;
- no reporting metrics;
- Negatives subset remains exactly five datasets;
- full configuration source family becomes exactly eleven datasets.

Add focused normalization coverage:

~~~text
tests/integration/google-api/google-ads-conversion-configuration-normalization.integration.cjs
tests/integration/google-api/run-google-ads-conversion-configuration-normalization-test.sh
~~~

Cover:

- all six dataset happy paths;
- nullable provider fields;
- real false and zero preservation;
- provider enum/status preservation;
- optional GA4 evidence;
- custom-goal membership;
- malformed required fields;
- no requested-to-observed fabrication;
- tracking-settings field normalization.

Extend existing configuration source and validation tests to all eleven datasets rather than duplicating the shared acquisition lifecycle.

Validation coverage must additionally lock `CUSTOMER_CONVERSION_TRACKING_SETTINGS` to exactly one normalized row: zero or more than one is `QUERY_MISMATCH`; `NOT_CONVERSION_TRACKED` with one valid row remains `VALID`.

## 14. Focused gate

Add:

~~~text
tests/integration/google-api/run-google-ads-conversion-configuration-gate.sh
~~~

The gate runs:

~~~text
conversion configuration contract
conversion configuration normalization
configuration source
configuration validation
~~~

Success marker:

~~~text
PASS GOOGLE-ADS-CONVERSION-CONFIGURATION-GATE-001
~~~

## 15. Affected regressions

At slice acceptance run:

~~~text
run-google-ads-conversion-configuration-gate.sh
run-google-ads-negatives-gate.sh
production source composition integration
run-google-ads-search-reporting-gate.sh
npx tsc --noEmit
npm run lint
git diff --check
~~~

Normal automated verification must not call Google Ads live.

Live-provider acceptance, if required later, is a separate explicit, bounded, quota-aware action.

## 16. Documentation adoption

After implementation is deterministically verified:

- document Conversion Configuration v1 in `DATA_CONTRACTS.md`;
- document its validation semantics in `VALIDATION_SPEC.md`;
- update `PROJECT_HANDOFF.md` from actual verification evidence;
- make `09_CAMPAIGN_SETTINGS` the next independent configuration scope.

Do not add these datasets to an Ads package, preset, workbook, or export recipe in this slice.

## 17. Explicitly out of scope

This design does not include:

- conversion performance metrics;
- date-based conversion reporting;
- historical configuration reconstruction;
- conversion mutations;
- bidding changes;
- optimization recommendations;
- effective-goal inference inside RoofRoom;
- package or preset integration;
- campaign settings beyond the minimal campaign identity/status required to interpret goal resources;
- Performance Max claims;
- live-provider verification;
- automatic cross-account rerouting.

## 18. Acceptance boundary

The slice may be called `implemented + deterministically verified` only when fresh evidence proves:

- the approved six-dataset Conversion Configuration contract;
- preservation of the existing five-dataset Negatives v1 contract;
- source acquisition and raw SearchStream preservation;
- deterministic normalization;
- dataset-specific validation and cardinality;
- production registration and existing Google Ads connection reuse;
- affected regression gates;
- TypeScript/static checks;
- canonical documentation updates.

Do not call the slice packaged/runtime verified or live-provider verified without separate evidence.

The next implementation scope after this slice remains:

~~~text
09_CAMPAIGN_SETTINGS
~~~
