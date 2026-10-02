# Google Ads Negatives v1 — Design Specification

**Status:** Design approved in chat; written-spec review required before implementation planning
**Date:** 2026-10-02
**Product:** RoofRoom Data Collector
**Source family:** `google-ads-configuration`
**Slice:** `05_NEGATIVES`

## 1. Goal

Add a provider-specific Google Ads configuration source slice that collects, preserves, validates, and normalizes evidence for keyword negatives without turning RoofRoom into an analysis or recommendation engine.

The slice uses the existing source-neutral Core lifecycle:

Run → Job → Attempt → raw artifact → validation → accepted evidence

Google Ads acquisition, GAQL/resource semantics, normalization, and semantic validation remain inside the Google Ads source boundary.

This slice does not score, interpret, recommend, mutate, optimize, or infer negative-keyword strategy.

## 2. Current repository baseline

The design extends existing working boundaries rather than creating a parallel lifecycle.

Current inspected repository evidence:

- Google Ads official-API acquisition already uses the privileged Google API runtime.
- `google-ads-search-reporting` is a separate source identity that reuses the canonical `google-ads-search-terms` Workspace connection.
- The canonical Ads connection supplies `customer_id`, optional `login_customer_id`, OAuth credential reference, and authenticated Google Ads requester.
- Search reporting already proves a descriptor-based multi-dataset source pattern with independent Job contexts, raw SearchStream preservation, normalization, and fail-closed validation.
- Production source and validator registration already occur in `production-collection-runtime.ts`.
- Generic desktop source registration is distinct from production runtime source registration.
- The existing Google Ads scoped instructions require provider semantics to remain inside the source module and prohibit unsupported Performance Max generalization.
- Normal deterministic tests must not call live Google Ads.

Implementation must re-check live HEAD where the implementation plan requires exact file/test entry points.

## 3. Locked scope

### 3.1 Source identity

Create one logical configuration source family:

`google-ads-configuration`

Acquisition mode:

`OFFICIAL_API`

The source represents current provider configuration snapshots rather than date-windowed performance reporting.

It does not accept or derive a requested performance date range.

### 3.2 v1 dataset set

`05_NEGATIVES` contains exactly five independent datasets:

1. `CAMPAIGN_NEGATIVE_KEYWORDS`
2. `AD_GROUP_NEGATIVE_KEYWORDS`
3. `SHARED_NEGATIVE_KEYWORDS`
4. `CAMPAIGN_NEGATIVE_KEYWORD_LISTS`
5. `ACCOUNT_NEGATIVE_KEYWORD_LISTS`

Each dataset is an independent Job/evidence unit with its own:

- immutable source context;
- Job key;
- resource mode;
- GAQL query builder;
- raw provider response;
- normalization path;
- semantic validation;
- Attempt history;
- accepted/rejected state.

One dataset must not manufacture rows from another dataset's evidence.

### 3.3 Keyword-negatives-only boundary

v1 collects keyword-negative configuration only.

Out of scope includes:

- negative placements;
- brand exclusions;
- IP exclusions;
- topics;
- content labels;
- webpage exclusions;
- YouTube/channel exclusions;
- other criterion/exclusion types;
- mutation/write operations.

A provider resource containing several criterion types does not widen the RoofRoom contract.

Queries and validators must constrain and prove the approved keyword-negative semantics.

### 3.4 Campaign mode boundary

Campaign- and ad-group-scoped evidence in this slice remains within the approved SEARCH configuration scope.

Account-level and shared-list evidence may be account-scoped provider evidence. Its presence must not be represented as proof of configuration or applicability for Performance Max or any other campaign type.

Performance Max remains outside the approved scope.

## 4. Architecture

### 4.1 Source ownership

Core continues to own:

- Run / Job / Attempt lifecycle;
- raw artifact storage;
- validation orchestration;
- accepted-evidence lifecycle;
- persistence;
- privileged credential infrastructure;
- retry/resume behavior already supplied by Core.

The Google Ads configuration module owns:

- source and dataset identities;
- Job-context parsing;
- Google Ads resource semantics;
- GAQL construction;
- provider response interpretation;
- deterministic normalization;
- semantic validation;
- Google Ads operational error mapping.

No provider-specific negative-keyword semantics move into generic Core abstractions.

### 4.2 Initial module surface

New shared contract:

- `src/shared/google-ads-configuration.ts`

New Google Ads source files:

- `src/main/sources/google-ads/configuration-request.ts`
- `src/main/sources/google-ads/configuration-source.ts`
- `src/main/sources/google-ads/configuration-validator.ts`
- `src/main/sources/google-ads/negatives-request.ts`
- `src/main/sources/google-ads/negatives-adapter.ts`

Expected existing integration points:

- `src/shared/google-api.ts`
- `src/main/sources/google-api/google-api-runtime.ts`
- `src/main/app/production-collection-runtime.ts`

The implementation plan must use live repository evidence for exact test files and any additional directly required registration path.

Do not create abstractions for future `08_CONVERSION_ACTIONS` or `09_CAMPAIGN_SETTINGS` beyond the minimum source-family seam actually needed by this slice.

## 5. Job context and schema

Every v1 Job context must prove:

- `source_id = google-ads-configuration`
- `dataset_type`
- `resource_mode`
- `customer_id`
- `dataset_schema_version = 1`

The Job key is exactly the dataset type.

`customer_id` is immutable requested/account context used for traceability and acquisition authorization.

Before a provider call, the context customer identity must match the normalized customer identity resolved from the privileged Workspace connection.

Requested account identity must not be copied into a provider-observed field and presented as observation.

Secrets never enter source context or normalized/export evidence.

The v1 context contains no performance-date fields.

New Job creation emits only schema v1.

Unsupported schema versions fail closed.

A future semantic/acquisition shape change that would alter evidence meaning requires an explicit schema-version change rather than silently reinterpreting v1 evidence.

## 6. Dataset/resource contracts

### 6.1 `CAMPAIGN_NEGATIVE_KEYWORDS`

Provider resource mode:

`CAMPAIGN_CRITERION`

The query must prove direct campaign-level keyword exclusions.

Required semantic invariants include:

- `campaign_criterion.type = KEYWORD`;
- `campaign_criterion.negative = true`;
- campaign belongs to the approved SEARCH scope;
- keyword text and match type come from provider evidence.

Preserve at least the provider-backed identity/context needed for traceability:

- campaign id/resource identity;
- campaign name where selected;
- campaign advertising channel type;
- criterion resource name/id;
- criterion status where available;
- negative flag;
- keyword text;
- keyword match type.

### 6.2 `AD_GROUP_NEGATIVE_KEYWORDS`

Provider resource mode:

`AD_GROUP_CRITERION`

The query must prove direct ad-group-level keyword exclusions.

Required semantic invariants include:

- criterion type is `KEYWORD`;
- `negative = true`;
- owning campaign is within approved SEARCH scope;
- keyword text and match type come from provider evidence.

Preserve at least:

- campaign identity;
- ad-group identity;
- criterion resource name/id;
- criterion status where available;
- negative flag;
- keyword text;
- keyword match type.

### 6.3 `SHARED_NEGATIVE_KEYWORDS`

Provider resource mode:

`SHARED_CRITERION`

This dataset preserves keyword members of negative-keyword shared sets.

Only shared sets whose provider-native type is one of:

- `NEGATIVE_KEYWORDS`
- `ACCOUNT_LEVEL_NEGATIVE_KEYWORDS`

are in contract.

Each accepted member must additionally prove:

- `shared_criterion.type = KEYWORD`;
- `shared_criterion.negative = true`.

Each normalized member must remain traceable to its provider shared set.

Preserve at least:

- shared-set resource name/id;
- shared-set name;
- shared-set status where available;
- shared-set provider type;
- shared-criterion resource identity;
- negative flag;
- keyword text;
- keyword match type.

Do not infer campaign or account attachment from membership alone.

### 6.4 `CAMPAIGN_NEGATIVE_KEYWORD_LISTS`

Provider resource mode:

`CAMPAIGN_SHARED_SET`

This dataset proves campaign-to-shared-negative-keyword-list association.

Preserve at least:

- campaign identity;
- campaign advertising channel type;
- campaign-shared-set resource identity;
- association status where available;
- shared-set resource name/id;
- shared-set name where selectable;
- shared-set provider type.

Only associations whose attributed `shared_set.type = NEGATIVE_KEYWORDS` are in contract.

`ACCOUNT_LEVEL_NEGATIVE_KEYWORDS` remains account-level evidence and must not be accepted as a campaign-list association.

This dataset does not prove the list's members. Member evidence belongs to `SHARED_NEGATIVE_KEYWORDS`.

### 6.5 `ACCOUNT_NEGATIVE_KEYWORD_LISTS`

Provider resource mode:

`CUSTOMER_NEGATIVE_CRITERION`

This dataset proves account-level negative-keyword-list attachment/context through the provider's customer negative criterion representation.

Required semantic invariant:

- customer negative criterion type is `NEGATIVE_KEYWORD_LIST`.

Preserve at least:

- customer-negative-criterion resource name/id;
- criterion provider type;
- provider `negative_keyword_list.shared_set` resource identity;
- attributed shared-set identity/name/status/type where selectable.

The associated shared set must preserve its provider-native `ACCOUNT_LEVEL_NEGATIVE_KEYWORDS` meaning where that type is available as attributed evidence.

This dataset does not manufacture shared-list members. Member evidence belongs to `SHARED_NEGATIVE_KEYWORDS`.

## 7. Acquisition and raw evidence

Use the existing Google Ads API v25 SearchStream transport already established in the repository.

Each Job performs its own provider request for its own dataset contract.

The full raw provider response bytes are preserved before normalization.

Raw provider evidence remains authoritative.

Normalized rows remain derived representations and must not replace or mutate raw evidence.

No dataset may reconstruct missing provider rows from:

- another negatives dataset;
- campaign/list attachment counts;
- shared-set member counts;
- requested values;
- historical package evidence.

Retries create new Attempts and preserve prior Attempt evidence under the existing Core lifecycle.

## 8. Snapshot semantics

This source is a current configuration snapshot source, not historical performance reporting.

Do not invent a provider observation timestamp when the provider does not return one.

Acquisition timing remains traceable through the persisted Run / Job / Attempt / artifact lifecycle.

If a later derived/export representation exposes a snapshot timestamp, it must be clearly RoofRoom acquisition metadata rather than a provider-native field.

## 9. Validation semantics

Validation is fail-closed.

Validation order should follow:

1. Run / Job / Attempt / artifact ownership;
2. source identity;
3. immutable Job context;
4. Job-key/dataset agreement;
5. schema version;
6. raw SearchStream envelope;
7. dataset-specific normalization;
8. dataset-specific semantic invariants.

A malformed/unreadable artifact is not `NO_DATA`.

An API/auth/quota/transport failure is not a validation result; it remains an execution failure through existing Google API error mapping.

`NO_DATA` is valid only when:

- the provider response is structurally valid;
- the immutable Job/query contract is valid;
- normalization succeeds;
- zero in-contract rows are present.

Missing provider fields remain missing/null where the contract permits them.

Missing is never converted into:

- zero;
- false;
- empty keyword text;
- inferred match type;
- inferred list membership;
- inferred campaign/account attachment.

Rows proving the wrong criterion type, wrong shared-set type, non-negative semantics, or unsupported campaign scope must fail or be excluded according to the explicit dataset query/validation contract; they must never be silently reinterpreted.

## 10. Credential and runtime integration

Do not create a new credential type, OAuth flow, Developer Token path, or desktop connection-management source.

`GoogleApiRuntimeFactory.createConfigurationSource()` reuses the same canonical Workspace Google Ads connection used by `createSearchReportingSource()`:

- connection source identity: existing `GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID`;
- safe `customer_id`;
- optional `login_customer_id`;
- existing OAuth credential reference;
- existing authenticated Google Ads requester.

The Developer Token remains retired from active application behavior.

Register `google-ads-configuration` and its validator in the production collection runtime.

## 11. Capabilities

Configuration snapshots do not support custom date ranges.

Existing production runtime capability defaults must remain unchanged for existing sources.

If `LazyWorkspaceSource` requires adjustment, add only a small registration-local capability override seam.

The intended minimum is an optional `Partial<SourceCapabilities>` override merged over existing mode defaults.

Use it in this slice only to set:

`supports_custom_date_range: false`

Do not create a generic provider-family capability architecture.

## 12. Desktop, package, and export boundary

This source/evidence slice does not add `google-ads-configuration` to:

- generic desktop source selection;
- Workspace connection-management source IDs;
- Saved Collection Presets;
- Last Run Settings source options;
- `ADS_OPTIMIZATION_PACK`;
- workbook/export recipe composition.

Those integration decisions occur only after the separately scoped configuration datasets are ready.

`08_CONVERSION_ACTIONS` and `09_CAMPAIGN_SETTINGS` are not implemented by this slice.

Generic Production Data Package behavior is not intentionally redesigned here. If live implementation inspection shows that a source-enumerated generic loader would reject otherwise accepted evidence solely because this source is new, stop and resolve that contract explicitly rather than silently widening this design.

## 13. Out of scope

Explicitly out of scope:

- all non-keyword exclusions;
- mutations/writes to Google Ads;
- recommendations or optimization logic;
- scoring/ranking;
- strategy;
- Performance Max support claims;
- conversion actions;
- campaign settings;
- package/preset/workbook composition;
- by-conversion-time/date reporting;
- SQLite migration unless live evidence proves one is required;
- live-provider verification without separate explicit authorization.

## 14. Deterministic TDD sequence

Implementation should proceed in the smallest reviewable vertical sequence.

### 14.1 Shared contract and query shape

Start with deterministic failing coverage for:

- source id;
- five dataset types;
- resource-mode mapping;
- schema-v1 Job context;
- query selection;
- required keyword-negative filters;
- SEARCH campaign filtering where applicable;
- shared/account-list type filters.

Then add the minimum production contract/query implementation.

### 14.2 Source acquisition

Failing coverage first for:

- wrong source id;
- customer mismatch;
- Job-key/dataset mismatch;
- unsupported schema;
- missing descriptor;
- wrong resource mode;
- empty query;
- raw-byte preservation;
- Google API operational error mapping.

Then implement the minimum source behavior.

### 14.3 Normalization

Failing coverage first for all five datasets.

Prove:

- provider identities survive normalization;
- keyword text/match type are provider-derived;
- null/missing stays missing;
- zero/false are not substituted;
- wrong criterion/list types fail closed;
- shared membership is not reconstructed from attachment datasets.

### 14.4 Validation

Failing coverage first for:

- ownership mismatch;
- malformed raw artifact;
- invalid Job context;
- semantic mismatch;
- valid empty provider response → `NO_DATA`;
- valid rows → `VALID`.

### 14.5 Runtime integration

Prove deterministically:

- production source registration;
- validator registration;
- canonical Ads credential reuse;
- no new connection-management requirement;
- `supports_custom_date_range = false`;
- existing source capability behavior remains unchanged.

### 14.6 Affected regression

At slice close, run only the directly relevant deterministic verification required by the changed boundaries, including:

- new Negatives focused gate;
- existing Google Ads SEARCH reporting gate where shared Google Ads runtime behavior is touched;
- directly affected Google API/runtime tests;
- TypeScript compile check;
- lint.

Do not run live Google Ads in normal tests.

Do not run broad packaging/release gates unless the changed boundary or claimed outcome requires them.

## 15. Acceptance criteria

`05_NEGATIVES` is implementation-complete only when deterministic evidence proves all of the following:

1. `google-ads-configuration` is a registered production source.
2. Exactly the five approved Negatives datasets are in the v1 source contract.
3. New Job contexts emit schema v1 and fail closed on unsupported versions.
4. Customer identity mismatch blocks acquisition before provider access.
5. Each dataset has its own provider request and raw artifact.
6. Direct campaign and ad-group rows prove keyword-negative semantics.
7. Shared-list member rows preserve list type and membership evidence.
8. Campaign/list association remains distinct from list-member evidence.
9. Account-level list attachment remains distinct from list-member evidence.
10. Missing values are never fabricated as zero/false/empty/inferred evidence.
11. Valid zero-row provider evidence becomes `NO_DATA`.
12. Malformed or semantically incompatible evidence is rejected.
13. Existing Google Ads OAuth/customer connection is reused without new credential UI or secret exposure.
14. Configuration capability reports no custom date-range support.
15. Existing Google Ads SEARCH reporting behavior remains deterministically green where affected.
16. No live-provider claim is made without separately recorded live acceptance.
17. Canonical contracts/handoff are updated only to match verified implementation state.

## 16. Evidence-claim boundary

Completion states remain distinct:

- design approved;
- implementation planned;
- implemented;
- deterministically verified;
- packaged/runtime verified;
- live-provider verified.

This specification and its commit are design evidence only.

They do not prove implementation, package integration, or live Google Ads acceptance.
