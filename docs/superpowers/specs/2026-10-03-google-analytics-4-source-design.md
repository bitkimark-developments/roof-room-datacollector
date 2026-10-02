# Google Analytics 4 Source — Design

**Date:** 2026-10-03  
**Status:** Proposed design approved in chat; written-spec review pending  
**Target repository path:** `docs/superpowers/specs/2026-10-03-google-analytics-4-source-design.md`

## 1. Purpose

Add one Google Analytics 4 source family to RoofRoom Data Collector so the application can collect trustworthy first-party GA4 evidence for two downstream Bitkimark workflows:

- Bitkimark Blog Agentic
- Bitkimark Google Ads Growth Rebuild

RoofRoom remains a collector/evidence system. It does not interpret GA4 data, select blog topics, diagnose funnel causes, optimize advertising, score performance, or create recommendations.

The source adds two independent logical datasets under one provider connection:

```text
google-analytics-4
├── GA4_CONTENT_PERFORMANCE
└── GA4_PAID_FUNNEL
```

The two datasets share authorization/property infrastructure but keep their own provider query, grain, normalization, validation, and Job identity.

## 2. Existing repository constraints

The current repository already has:
- source-neutral Workspace → Run → Job → Attempt lifecycle;
- Workspace source connections with safe metadata plus opaque credential references;
- a shared Google OAuth application configuration;
- Google OAuth refresh credentials in the privileged credential store;
- stored `granted_scopes` compatibility checks;
- official-API source composition through the Google API runtime;
- separate source-specific validators;
- deterministic package/export eligibility.

Do not create a second lifecycle/database/OAuth application, renderer-owned credential, generic Core analytics abstraction, or cross-provider analysis layer.

Provider-specific GA4 semantics stay in the GA4 source module.

## 3. Git/worktree isolation

Observed checkout:
- branch `fix/google-ads-reporting-metrics`
- HEAD `fdf2dc9`
- `main` / `origin/main` at `2568d2a`
- untracked `src/main/sources/google-ads/configuration-normalizer.ts`

GA4 work must not modify, delete, stash, or absorb that unrelated WIP.

Implementation should start in a separate clean worktree/feature branch based on the verified current `main` checkpoint unless repository state changes before execution.

Suggested branch:

```text
feat/google-analytics-4-source-v1
```

## 4. Provider/API boundary

Use the official Google Analytics Data API.

Primary endpoint family:

```text
https://analyticsdata.googleapis.com/v1beta
```

Dataset acquisition uses:

```text
POST /v1beta/properties/{property_id}:runReport
```

Do not use `runFunnelReport` in v1. Do not add the Google Analytics Admin API in v1.

The user already has the GA4 Property ID. Property discovery/dropdown is deferred.

## 5. OAuth and connection model

### 5.1 Source identity

```text
source_id: google-analytics-4
acquisition_mode: OFFICIAL_API
```

Datasets:
- `GA4_CONTENT_PERFORMANCE`
- `GA4_PAID_FUNNEL`

### 5.2 OAuth scope

Add:

```text
GOOGLE_ANALYTICS_READONLY_SCOPE
https://www.googleapis.com/auth/analytics.readonly
```

Scope routing must become explicit:

```text
GSC → webmasters.readonly
Google Ads / Keyword Planner → adwords
GA4 → analytics.readonly
```

GA4 must never fall through a generic `else → adwords` branch.

### 5.3 Credential reuse

Reuse the existing Google OAuth application configuration, but give `google-analytics-4` its own Workspace source connection and credential reference.

Do not generalize current Ads/KWP sibling-credential rebind logic merely to make all Google sources share one refresh token.

This keeps the change small and avoids perturbing working GSC/Ads credential relationships.

### 5.4 Connection metadata

Safe Workspace metadata:

```json
{
  "property_id": "123456789"
}
```

Rules:
- `property_id` is not secret;
- trim whitespace;
- accepted canonical value is digits only;
- do not persist the `properties/` prefix;
- construct `properties/{property_id}` only at request time;
- never hard-code the Bitkimark Property ID in code/tests/docs.

## 6. Dataset — `GA4_CONTENT_PERFORMANCE`

Purpose: first-party behavioral evidence for existing landing/content pages.

### Request window

Require explicit absolute dates:

```text
start_date: YYYY-MM-DD
end_date: YYYY-MM-DD
```

A ~90-day window is the recommended Blog use case, but the source must not silently invent relative dates.

### Provider dimensions

```text
landingPage
```

### Provider metrics

```text
activeUsers
sessions
engagedSessions
engagementRate
keyEvents
itemViewEvents
addToCarts
checkouts
ecommercePurchases
transactions
purchaseRevenue
```

### Normalized row

```text
landing_page
active_users
sessions
engaged_sessions
engagement_rate
key_events
item_view_events
add_to_carts
checkouts
ecommerce_purchases
transactions
purchase_revenue
```

Request/provenance separately preserves:
- `property_id`
- requested start/end dates
- provider currency code
- provider timezone
- retrieval time

Missing/zero rules:
- provider `"0"` → numeric zero;
- absent/empty/unparseable metric is not zero;
- `(not set)` remains provider-native text;
- no fabricated landing page.

## 7. Dataset — `GA4_PAID_FUNNEL`

Purpose: first-party paid-session/ecommerce evidence between ad arrival and ecommerce outcomes.

### Request window

Require explicit absolute `start_date` and `end_date`.

No source-level default window.

### Provider dimensions

```text
date
sessionSource
sessionMedium
sessionCampaignId
sessionCampaignName
landingPage
deviceCategory
```

### Provider metrics

```text
sessions
engagedSessions
itemViewEvents
addToCarts
checkouts
ecommercePurchases
transactions
totalPurchasers
purchaseRevenue
```

### Paid traffic filter

Canonical v1 provider query filter:

```text
sessionSource == "google"
AND
sessionMedium == "cpc"
```

Preserve the exact filter in provenance.

Do not infer additional paid-medium aliases.

### Date normalization

Provider `date` is `YYYYMMDD`.

Normalize deterministically to `YYYY-MM-DD` only when the returned value is a valid calendar date.

Never infer row dates from the requested date range.

### Normalized row

```text
performance_date
session_source
session_medium
session_campaign_id
session_campaign_name
landing_page
device_category
sessions
engaged_sessions
item_view_events
add_to_carts
checkouts
ecommerce_purchases
transactions
total_purchasers
purchase_revenue
```

Preserve provider-native `(not set)` and similar returned strings.

Do not enrich GA4 rows using Ads-side campaign IDs/names.

## 8. Pagination and raw evidence

`runReport` returns at most 250,000 rows per request.

Use deterministic offset pagination with `limit=250000`.

A single dataset Job creates one Attempt. If multiple provider calls are needed, preserve every exact response body in one source-owned raw bundle.

Conceptual bundle:

```json
{
  "bundle_schema_version": 1,
  "dataset_type": "GA4_PAID_FUNNEL",
  "request": {
    "property_id": "123456789",
    "start_date": "2026-09-01",
    "end_date": "2026-09-30",
    "limit": 250000
  },
  "pages": [
    {
      "offset": 0,
      "raw_body_base64": "..."
    }
  ]
}
```

The bundle is provenance/transport structure. Exact provider body bytes remain authoritative.

Never discard prior pages after later calls or failures.

## 9. Provider response semantics

Expected successful evidence:
- `dimensionHeaders`
- `metricHeaders`
- `rows`
- `rowCount`
- `metadata`
- `kind`

Rows may be absent/empty when `rowCount == 0`.

Preserve provider metadata `currencyCode` and `timeZone` when returned.

Metric values arrive as provider strings and are parsed only under the expected metric type.

Raw bytes and normalized numbers remain separate.

## 10. Validation

GA4 gets its own source validator.

### Ownership/context

Validate:
- source ID;
- dataset type;
- Job/Attempt/artifact ownership;
- acquisition mode;
- requested property/date context;
- raw bundle structure;
- every raw page decodes to JSON.

### Header contract

For every page:
- dimension headers exactly match requested dataset dimensions and order;
- metric headers exactly match requested metrics and order;
- row dimension count matches headers;
- row metric count matches headers.

Unexpected/mismatched provider columns fail closed.

### Pagination contract

Validate:
- non-negative integer `rowCount`;
- ordered/non-overlapping offsets;
- expected pagination progression;
- complete row coverage;
- no repeated page;
- incomplete multi-page evidence is not accepted.

### Dataset semantics

Content:
- one `landingPage` value per row;
- locked metric names;
- zero/missing distinction preserved.

Paid funnel:
- exact `google / cpc` request filter is present in request context;
- returned date parses as valid `YYYYMMDD`;
- source/medium/campaign/landing/device remain provider evidence.

### Metadata

Preserve provider-returned currency/timezone only.

Do not populate observed metadata from requested Workspace config.

### `NO_DATA`

Verified `NO_DATA` requires a successful exact provider response where:

```text
rowCount == 0
```

and no rows are returned.

Never infer `NO_DATA` from auth/config/quota/network/schema/pagination failure or all-zero rows.

### Failure mapping

Operational failures remain operational:
- OAuth missing/expired/incompatible;
- property access denied;
- network/provider failure;
- quota/rate-limit;
- cancellation.

Malformed successful structure → `INVALID_SCHEMA`.

Request/response semantic mismatch → `QUERY_MISMATCH`.

Unreadable/non-JSON successful payload → `ERROR_NOT_DATA`.

No hidden provider retry.

## 11. Readiness

GA4 readiness requires:
1. Google OAuth application configuration available;
2. `google-analytics-4` Workspace connection exists;
3. credential reference exists;
4. credential is compatible with `analytics.readonly`;
5. safe metadata contains valid numeric `property_id`.

Readiness does not make a live provider request.

If scope compatibility fails, expose the existing reauthorization path.

## 12. Desktop behavior

Add one source card:

```text
Google Analytics 4
```

Configuration:
- Property ID

Connection action:
- Connect Google / Reconnect Google

No API key.
No Measurement ID.
No Admin API property picker in v1.

Collection review exposes the two datasets/tasks with resolved absolute dates.

Renderer receives only safe state.

## 13. Runtime/source composition

Register one lazy source family:

```text
google-analytics-4
OFFICIAL_API
GA4_CONTENT_PERFORMANCE
GA4_PAID_FUNNEL
```

Dispatch acquisition by persisted dataset identity.

Register a GA4-specific validator.

The shared Google API runtime may construct authenticated requesters, but request/query/parser/validator semantics stay in the GA4 source boundary.

## 14. Proposed source-owned files

```text
src/shared/google-analytics-4.ts

src/main/sources/google-analytics-4/
├── google-analytics-4-request.ts
├── google-analytics-4-source.ts
├── google-analytics-4-parser.ts
└── google-analytics-4-validator.ts
```

Add only small helpers required by real implementation evidence.

Do not create a generic analytics framework.

## 15. Tests

Normal automated tests must not call GA4.

Minimum deterministic coverage:

OAuth/connection:
- GA4 → `analytics.readonly`;
- GSC behavior unchanged;
- Ads/KWP behavior unchanged;
- incompatible credential requires reauthorization;
- property ID validation;
- no secret exposure.

Request:
- exact v1beta endpoint;
- property path;
- exact dimensions/metrics;
- absolute dates;
- exact `google / cpc` filter;
- `limit=250000` + offsets.

Raw preservation:
- one-page exact body;
- multi-page exact bodies;
- prior pages preserved;
- interrupted pagination not accepted.

Parser:
- header-driven mapping;
- true zero retained;
- missing not converted to zero;
- `(not set)` preserved;
- date normalization;
- invalid date rejected;
- revenue parsing;
- provider currency/timezone preserved.

Validation:
- valid content evidence;
- valid paid-funnel evidence;
- verified no-data;
- wrong headers/source/dataset;
- bad row widths;
- malformed JSON;
- invalid metric values;
- pagination gap/overlap/duplicate/incomplete;
- operational failure separate from validation.

Integration:
- source/validator registry;
- Workspace connection/readiness;
- desktop review/start;
- Run/Job/Attempt ownership;
- accepted evidence/export eligibility;
- existing Google/GSC/Ads/KWP regressions.

## 16. Live acceptance

Deterministic completion and live-provider acceptance remain separate claims.

After deterministic completion, one bounded explicitly authorized live run should prove:
- OAuth scope;
- Property ID access;
- both dataset queries accepted by current GA4;
- returned headers/types match;
- raw evidence preserved;
- no destructive action.

Do not assert exact production business metrics.

No live GA4 in ordinary regression/CI.

## 17. Quota behavior

`runReport` uses GA4 Core quota.

Keep acquisition bounded and sequential.

On quota/rate-limit:
- preserve existing Attempt evidence;
- return operational failure;
- no evasion;
- no proxy rotation;
- no invisible retry.

## 18. Downstream/package boundary

This slice does not create:
- Blog reasoning recipe;
- Ads Growth reasoning recipe;
- cross-source joins;
- topic recommendations;
- funnel diagnosis;
- optimization advice.

The two GA4 datasets become ordinary accepted/exportable RoofRoom evidence.

Any later package convenience composition is a separate task.

## 19. Out of scope

- Google Analytics Admin API
- property picker/discovery
- Realtime API
- Funnel API
- BigQuery export
- Measurement Protocol writes
- GA4 mutation/configuration
- custom dimensions/metrics
- arbitrary user-authored GA4 queries
- attribution-model selection
- Ads ↔ GA4 joining
- user-level identifiers
- Merchant/Clarity/other providers

## 20. Current provider facts used by this design

Verified against Google developer documentation on 2026-10-03:
- Data API exposes `v1beta properties.runReport`;
- `analytics.readonly` supports read access;
- required standard dimensions exist;
- required standard session/engagement/ecommerce metrics exist;
- `runReport` supports `limit`/`offset` pagination to 250,000 rows/request;
- response metadata can include property currency and timezone.

## 21. Acceptance boundary

This design is ready for implementation planning when this written spec is approved.

Approval does not mean code implemented, tests passed, packaged runtime accepted, or GA4 live-provider accepted.

Next step after written-spec approval: create the implementation plan under `docs/superpowers/plans/`.
