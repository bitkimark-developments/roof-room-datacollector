# Google Ads Campaign Settings v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `google-ads-configuration` from eleven to fourteen provider-native current-configuration datasets by adding Search campaign settings, campaign-budget resources, and LOCATION/LANGUAGE/DEVICE/AD_SCHEDULE campaign targeting with traceable geo resolution.

**Architecture:** Preserve the existing configuration source family, immutable Job context, descriptor model, Workspace Google Ads connection, one-candidate-artifact Attempt lifecycle, and validator. Campaign and Budget continue through the existing single SearchStream path. Targeting is the only bounded special acquisition path: preserve the exact SearchStream bytes inside a source-owned evidence bundle, resolve only observed LOCATION resource names through Google Ads API v25 `POST /v25/geoTargetConstants:suggest`, preserve that exact response as a second bundle part, then normalize/validate from the preserved evidence.

**Tech Stack:** TypeScript, Node.js, CommonJS integration tests, shell gate runners, Google Ads API v25 REST/ProtoJSON, existing `ApiRequester`, existing Google Ads authenticated Workspace connection.

**Spec:** `docs/superpowers/specs/2026-10-02-google-ads-campaign-settings-v1-design.md`

## Global Constraints

- Source family remains exactly `google-ads-configuration`.
- Source mode remains exactly `OFFICIAL_API`.
- Google Ads API remains v25.
- `dataset_schema_version` remains exactly `1`.
- `supports_custom_date_range` remains `false`.
- Add exactly `CAMPAIGN_SETTINGS`, `CAMPAIGN_BUDGETS`, and `CAMPAIGN_TARGETING_CRITERIA`; total configuration dataset count becomes exactly fourteen.
- `CAMPAIGN_SETTINGS` and `CAMPAIGN_TARGETING_CRITERIA` are Search-only provider snapshots.
- `CAMPAIGN_BUDGETS` grain is exactly one normalized row per `campaign_budget` resource; do not turn it into an association table.
- Targeting criterion allowlist is exactly LOCATION, LANGUAGE, DEVICE, AD_SCHEDULE.
- LOCATION negatives remain provider evidence and must not be filtered.
- Raw provider bytes remain authoritative; requested/expected values must never populate observed fields.
- Targeting resolver input must be derived only from LOCATION resource names observed in the targeting SearchStream response.
- Do not add Core dynamic dependent Jobs, Core multi-artifact Attempts, or a generic multi-request framework.
- Do not add portfolio bidding internals, effective-current scoring, recommendations, mutations, Performance Max claims, account-level settings, conversion configuration, package/preset/export recipe integration, or live-provider verification.
- Ordinary deterministic tests must not call Google Ads live.
- Every production behavior change starts with a deterministic failing test.
- Existing Negatives and Conversion Configuration semantics must remain compatible.

## Current Repository Evidence

- `src/shared/google-ads-configuration.ts` currently composes five Negatives plus six Conversion Configuration datasets into eleven total datasets.
- `GoogleAdsConfigurationJobContext` already carries source ID, dataset type, resource mode, customer ID, and schema version 1.
- `requestGoogleAdsConfigurationRaw()` currently POSTs SearchStream requests to `https://googleads.googleapis.com/v25/customers/{customer_id}/googleAds:searchStream`.
- `normalizeGoogleAdsConfigurationRows()` currently dispatches Negatives and Conversion Configuration adapters.
- `GoogleAdsConfigurationSource` currently owns one descriptor table and returns one raw artifact per collection.
- Production composition already registers `GOOGLE_ADS_CONFIGURATION_DATASET_TYPES` directly; extending the shared constant should flow through without a new production source abstraction.
- Google Ads API v25 `SuggestGeoTargetConstants` REST path is `/v25/geoTargetConstants:suggest`; its `geo_targets.geo_target_constants` selector accepts exact geo target resource names.

## Review Focus

1. **ProtoJSON default omission:** an implicit-presence scalar/enum omitted from JSON must normalize according to its provider default, not automatically to null. Task 2 owns tests for false/zero/UNSPECIFIED/default behavior.
2. **No LOCATION criteria:** targeting acquisition must make no resolver request and must still preserve a valid one-part targeting evidence bundle. Task 3 owns this test.
3. **Duplicate LOCATION references:** resolver input must contain each observed resource name once while normalized output retains every distinct criterion row. Task 3 owns this test.
4. **Lossless raw evidence unavailable:** targeting must fail acquisition rather than present reserialized provider JSON as exact raw evidence when a required response has no `raw_body`. Task 3 owns this test.
5. **Incomplete or identity-mismatched geo resolution:** structurally parseable targeting evidence must fail `QUERY_MISMATCH`, never fabricate location detail or become `NO_DATA`. Task 4 owns this test.

---

### Task 1: Lock the three-dataset contract and exact v25 requests

**Files:**
- Modify: `src/shared/google-ads-configuration.ts`
- Create: `src/main/sources/google-ads/campaign-settings-request.ts`
- Create: `tests/integration/google-api/google-ads-campaign-settings-contract.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-campaign-settings-contract-test.sh`

**Interfaces:**
- Produces `GOOGLE_ADS_CAMPAIGN_SETTINGS_DATASET_TYPES`.
- Produces `GoogleAdsCampaignSettingsDatasetType`.
- Produces `GoogleAdsCampaignSettingsRow`.
- Produces `GoogleAdsCampaignBudgetRow`.
- Produces `GoogleAdsCampaignTargetingCriterionRow`.
- Extends `GoogleAdsConfigurationDatasetType`, `GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET`, and `GoogleAdsConfigurationNormalizedRow`.
- Produces:
  - `buildCampaignSettingsQuery(context: GoogleAdsConfigurationJobContext): string`
  - `buildCampaignBudgetsQuery(context: GoogleAdsConfigurationJobContext): string`
  - `buildCampaignTargetingCriteriaQuery(context: GoogleAdsConfigurationJobContext): string`
  - `requestGoogleAdsGeoTargetConstantsRaw(input: { resource_names: readonly string[] }, requester: ApiRequester): Promise<{ body: unknown; raw_bytes: Uint8Array }>`

- [ ] **Step 1: Write the failing contract test**

Assert:

```text
GOOGLE_ADS_CAMPAIGN_SETTINGS_DATASET_TYPES
=
[
  CAMPAIGN_SETTINGS,
  CAMPAIGN_BUDGETS,
  CAMPAIGN_TARGETING_CRITERIA
]
```

Assert the complete configuration list contains the existing eleven in their existing order followed by these three and has length 14 with 14 unique values.

Assert resource modes:

```text
CAMPAIGN_SETTINGS           → CAMPAIGN
CAMPAIGN_BUDGETS            → CAMPAIGN_BUDGET
CAMPAIGN_TARGETING_CRITERIA → CAMPAIGN_CRITERION
```

Assert schema version remains 1 through `createGoogleAdsConfigurationJobContext()` / `requireGoogleAdsConfigurationJobContext()`.

Assert each query is exactly the approved spec query: no metrics, no segments/date window, no `REMOVED` exclusion, Search filter only on Campaign and Targeting, and no Search/campaign association filter on Budget.

- [ ] **Step 2: Run the contract test and prove RED**

Run:

```bash
bash tests/integration/google-api/run-google-ads-campaign-settings-contract-test.sh
```

Expected: FAIL because the Campaign Settings contract/request module does not yet exist.

- [ ] **Step 3: Add the minimum shared contract**

In `src/shared/google-ads-configuration.ts` add the three-dataset constant/type, resource-mode mappings, and the three row interfaces from the approved spec.

Do not rename or reorder the existing eleven dataset IDs.

Do not increment `dataset_schema_version`.

- [ ] **Step 4: Add the three exact GAQL builders**

In `campaign-settings-request.ts`, implement the three query builders using the exact fields and filters in the approved design.

The context parameter exists to match the existing descriptor `buildQuery(context)` interface; do not introduce date inputs.

- [ ] **Step 5: Add the v25 geo resolver request helper**

Implement:

```text
POST https://googleads.googleapis.com/v25/geoTargetConstants:suggest
```

with ProtoJSON body:

```json
{
  "geoTargets": {
    "geoTargetConstants": ["geoTargetConstants/..."]
  }
}
```

Requirements:

- input list must be non-empty;
- values must match `geoTargetConstants/{id}`;
- preserve caller order;
- do not add `countryCode` or `locale`;
- require successful 2xx status;
- require `response.raw_body`; do not synthesize raw bytes from `response.body`.

- [ ] **Step 6: Run the contract test and prove GREEN**

Run the same contract runner.

Expected: PASS with no live provider calls.

- [ ] **Step 7: Commit**

```bash
git add \
  src/shared/google-ads-configuration.ts \
  src/main/sources/google-ads/campaign-settings-request.ts \
  tests/integration/google-api/google-ads-campaign-settings-contract.integration.cjs \
  tests/integration/google-api/run-google-ads-campaign-settings-contract-test.sh
git diff --cached --check
git commit -m "feat: define Google Ads campaign settings contract"
```

---

### Task 2: Normalize provider-native Campaign, Budget, and Targeting evidence

**Files:**
- Create: `src/main/sources/google-ads/campaign-settings-adapter.ts`
- Modify: `src/main/sources/google-ads/configuration-normalizer.ts`
- Create: `tests/integration/google-api/google-ads-campaign-settings-normalization.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-campaign-settings-normalization-test.sh`

**Interfaces:**
- Produces `GoogleAdsGeoTargetConstantEvidence`.
- Produces `GoogleAdsCampaignTargetingEvidenceBundleV1`.
- Produces:
  - `extractGoogleAdsCampaignTargetingGeoResourceNames(body: unknown): string[]`
  - `buildGoogleAdsCampaignTargetingEvidenceBundleBytes(input): Uint8Array`
  - `parseGoogleAdsCampaignTargetingEvidenceBundle(value: unknown): GoogleAdsCampaignTargetingEvidenceBundleV1`
  - `normalizeGoogleAdsCampaignSettingsRows(datasetType, rows, options?): GoogleAdsConfigurationNormalizedRow[]`
- Extends `normalizeGoogleAdsConfigurationRows(datasetType, rows, options?)` to dispatch all fourteen datasets.
- `options` may carry resolved geo constants for the targeting adapter; it must not change existing Negatives/Conversion behavior.

- [ ] **Step 1: Write failing Campaign normalization tests**

Cover:

- identity/name/status/channel/subtype;
- `campaign.keywordMatchType` → `campaign_keyword_match_type`;
- `startDateTime` / `endDateTime`;
- campaign budget reference;
- standard bidding native submessages;
- Target Impression Share fields;
- network fields kept separate;
- geo target type settings;
- tracking fields;
- AI Max;
- repeated `assetAutomationSettings`.

Also assert:

- portfolio `biddingStrategy` reference is preserved but no synthetic portfolio-completeness field exists;
- `REMOVED` status is preserved;
- repeated empty automation settings normalize to `[]`.

- [ ] **Step 2: Add ProtoJSON presence regression cases**

Pin field-aware behavior:

```text
explicit presence unset     → null
explicit presence set false → false
explicit presence set 0     → 0
inactive bidding oneof      → null
repeated selected empty     → []
implicit enum/scalar omit   → provider default, not automatic null
```

Include at least one enum/default case that becomes `UNSPECIFIED` and one boolean/number default case as dictated by the v25 field definition used by the adapter.

- [ ] **Step 3: Write failing Budget normalization tests**

Assert one provider `campaignBudget` object produces one row and preserves:

```text
resource_name
id
name
status
amount_micros
delivery_method
explicitly_shared
reference_count
total_amount_micros
period
type
```

Assert no campaign-association fields are emitted and missing amount evidence is not converted to zero.

- [ ] **Step 4: Write failing Targeting normalization tests**

Cover LOCATION, including negative LOCATION; LANGUAGE with attributed language constant detail; DEVICE; AD_SCHEDULE.

Assert unrelated family fields normalize to null.

For LOCATION, pass a resolver map keyed by exact `geoTargetConstants/...` resource name and assert all human-readable geo fields come only from that map.

- [ ] **Step 5: Prove RED**

Run:

```bash
bash tests/integration/google-api/run-google-ads-campaign-settings-normalization-test.sh
```

Expected: FAIL because the adapter/dispatch does not yet exist.

- [ ] **Step 6: Implement the minimum adapter and dispatch**

Follow existing Google Ads adapter parsing conventions.

Do not create generic source-neutral metric/config abstractions.

Do not infer effective-current state.

Do not copy configured country/language values into observed fields.

- [ ] **Step 7: Prove GREEN and run existing normalization regressions**

Run:

```bash
bash tests/integration/google-api/run-google-ads-campaign-settings-normalization-test.sh
bash tests/integration/google-api/run-google-ads-conversion-configuration-normalization-test.sh
bash tests/integration/google-api/run-google-ads-negatives-normalization-test.sh
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add \
  src/main/sources/google-ads/campaign-settings-adapter.ts \
  src/main/sources/google-ads/configuration-normalizer.ts \
  tests/integration/google-api/google-ads-campaign-settings-normalization.integration.cjs \
  tests/integration/google-api/run-google-ads-campaign-settings-normalization-test.sh
git diff --cached --check
git commit -m "feat: normalize Google Ads campaign settings"
```

---

### Task 3: Acquire targeting as a lossless two-request evidence bundle

**Files:**
- Modify: `src/main/sources/google-ads/configuration-request.ts`
- Modify: `src/main/sources/google-ads/configuration-source.ts`
- Modify: `src/main/sources/google-ads/campaign-settings-request.ts`
- Modify: `src/main/sources/google-ads/campaign-settings-adapter.ts`
- Modify: `tests/integration/google-api/google-ads-configuration-source.integration.cjs`
- Modify: `tests/integration/google-api/run-google-ads-configuration-source-test.sh`

**Interfaces:**
- Extend `requestGoogleAdsConfigurationRaw()` input with optional `require_raw_body?: boolean`; existing callers retain current behavior when false/omitted.
- Targeting calls SearchStream with `require_raw_body: true`.
- `extractGoogleAdsCampaignTargetingGeoResourceNames()` returns unique observed LOCATION refs in first-observation order.
- `buildGoogleAdsCampaignTargetingEvidenceBundleBytes()` produces exact bundle schema version 1.
- Campaign/Budget remain descriptor-driven single SearchStream artifacts.

- [ ] **Step 1: Extend the source integration test to RED for fourteen descriptors**

Assert descriptors cover every shared configuration dataset exactly once and new descriptors map:

```text
CAMPAIGN_SETTINGS           → buildCampaignSettingsQuery
CAMPAIGN_BUDGETS            → buildCampaignBudgetsQuery
CAMPAIGN_TARGETING_CRITERIA → buildCampaignTargetingCriteriaQuery
```

Run:

```bash
bash tests/integration/google-api/run-google-ads-configuration-source-test.sh
```

Expected: FAIL at the new Campaign Settings expectations.

- [ ] **Step 2: Add targeting acquisition RED tests**

With a fake `ApiRequester`, assert:

1. first request is exact customer SearchStream endpoint/query;
2. observed LOCATION refs include both positive and negative criteria;
3. duplicate resource refs are sent to resolver once;
4. resolver request is exactly `/v25/geoTargetConstants:suggest` with `geoTargets.geoTargetConstants`;
5. emitted artifact is JSON bundle schema 1;
6. SearchStream part base64-decodes byte-for-byte to the first provider `raw_body`;
7. resolver part base64-decodes byte-for-byte to the second provider `raw_body`;
8. persisted resolver `requested_resource_names` equals unique observed refs.

- [ ] **Step 3: Add no-LOCATION RED test**

For targeting evidence containing LANGUAGE/DEVICE/AD_SCHEDULE but no LOCATION:

- requester is called exactly once;
- no geo resolver request occurs;
- artifact contains exactly the SearchStream part;
- artifact remains `ARTIFACT_PRODUCED`.

- [ ] **Step 4: Add raw-preservation and resolver-failure RED tests**

Assert:

- missing SearchStream `raw_body` for targeting fails acquisition;
- missing resolver `raw_body` fails acquisition;
- resolver non-2xx fails acquisition;
- none of these cases emits a candidate artifact;
- error mapping remains the existing Google Ads acquisition error path.

- [ ] **Step 5: Implement the three descriptors and bounded targeting branch**

Keep the existing descriptor model.

In `GoogleAdsConfigurationSource.collect()`:

- Campaign and Budget follow the existing generic descriptor SearchStream path.
- Only `CAMPAIGN_TARGETING_CRITERIA` takes the special path.
- Request SearchStream.
- Derive LOCATION refs from parsed response body.
- If refs exist, call the resolver.
- Build one source-owned artifact containing exact raw parts.
- If refs do not exist, build one-part targeting bundle.
- Do not persist or schedule anything from inside the source; return one `ARTIFACT_PRODUCED` result exactly as Core already expects.

- [ ] **Step 6: Prove GREEN**

Run:

```bash
bash tests/integration/google-api/run-google-ads-configuration-source-test.sh
bash tests/integration/google-api/run-google-ads-campaign-settings-contract-test.sh
bash tests/integration/google-api/run-google-ads-campaign-settings-normalization-test.sh
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  src/main/sources/google-ads/configuration-request.ts \
  src/main/sources/google-ads/configuration-source.ts \
  src/main/sources/google-ads/campaign-settings-request.ts \
  src/main/sources/google-ads/campaign-settings-adapter.ts \
  tests/integration/google-api/google-ads-configuration-source.integration.cjs \
  tests/integration/google-api/run-google-ads-configuration-source-test.sh
git diff --cached --check
git commit -m "feat: collect Google Ads campaign settings"
```

---

### Task 4: Validate Campaign Settings and geo-resolution completeness fail-closed

**Files:**
- Modify: `src/main/sources/google-ads/configuration-validator.ts`
- Modify: `src/main/sources/google-ads/campaign-settings-adapter.ts`
- Modify: `tests/integration/google-api/google-ads-configuration-validation.integration.cjs`

**Interfaces:**
- Preserve public `GoogleAdsConfigurationValidator.validate(context: CollectionValidationContext): Promise<CollectionValidationDecision>`.
- Targeting validation parses bundle schema 1, decodes raw parts, parses the SearchStream and resolver JSON independently, verifies request/response identity, then normalizes.
- Campaign/Budget continue through raw SearchStream validation.

- [ ] **Step 1: Add valid Campaign/Budget/Targeting RED cases**

Assert valid non-empty artifacts return `VALID`.

Assert structurally valid zero-row evidence returns `NO_DATA` for each of the three new datasets.

Date metadata remains null because this is not a date-windowed source.

- [ ] **Step 2: Add Search-only and allowlist RED cases**

Assert `QUERY_MISMATCH` for:

- Campaign row whose channel is not SEARCH;
- Targeting row whose campaign channel is not SEARCH;
- Targeting criterion type outside LOCATION/LANGUAGE/DEVICE/AD_SCHEDULE;
- active type missing its required native detail.

Do not map these semantic mismatches to `NO_DATA`.

- [ ] **Step 3: Add geo completeness RED cases**

Assert `QUERY_MISMATCH` for:

- LOCATION refs present but resolver part absent;
- `requested_resource_names` differs from unique observed LOCATION refs;
- requested ref missing from resolver suggestions;
- top-level resolved resource identity mismatches request;
- unexpected top-level resolved resource is present;
- duplicate ambiguous resolution for one requested ref;
- required geo detail is incomplete.

Assert no country/name/status value is fabricated to repair these cases.

- [ ] **Step 4: Add malformed bundle RED cases**

Assert `INVALID_SCHEMA` for:

- unsupported bundle schema version;
- missing mandatory SearchStream part;
- duplicate part kind;
- invalid base64;
- decoded raw part is not valid JSON;
- malformed SearchStream envelope.

Keep unreadable/non-JSON artifact behavior as `ERROR_NOT_DATA` according to the existing validator boundary.

- [ ] **Step 5: Add ownership/context regressions for a new dataset**

Reuse existing ownership mismatch patterns with `CAMPAIGN_TARGETING_CRITERIA`.

Assert ownership mismatch remains `INVALID_SCHEMA` and immutable context/resource mismatch remains `QUERY_MISMATCH`.

- [ ] **Step 6: Prove RED**

Run:

```bash
bash tests/integration/google-api/run-google-ads-configuration-validation-test.sh
```

Expected: FAIL on the new Campaign Settings cases.

- [ ] **Step 7: Implement minimum validation changes**

Do not move provider semantics into Core.

Do not introduce an `effective_current` field.

Do not require portfolio bidding internals.

Treat provider `REMOVED` as valid snapshot evidence when the rest of the row satisfies the provider contract.

- [ ] **Step 8: Prove GREEN plus existing configuration regressions**

Run:

```bash
bash tests/integration/google-api/run-google-ads-configuration-validation-test.sh
bash tests/integration/google-api/run-google-ads-conversion-configuration-gate.sh
bash tests/integration/google-api/run-google-ads-negatives-gate.sh
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add \
  src/main/sources/google-ads/configuration-validator.ts \
  src/main/sources/google-ads/campaign-settings-adapter.ts \
  tests/integration/google-api/google-ads-configuration-validation.integration.cjs
git diff --cached --check
git commit -m "feat: validate Google Ads campaign settings"
```

---

### Task 5: Register the fourteen-dataset production surface and focused gate

**Files:**
- Modify: `tests/integration/app/production-source-composition.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-campaign-settings-gate.sh`
- Modify only if compilation requires it: existing Google Ads configuration test runners' source lists
- Do not modify `src/main/app/production-collection-runtime.ts` unless the failing production-composition test proves the shared constant is not sufficient.

**Interfaces:**
- Production `google-ads-configuration` source exposes exactly fourteen unique dataset IDs.
- It remains `OFFICIAL_API`.
- It remains `supports_custom_date_range: false`.
- It reuses only the existing Google Ads Workspace connection boundary.
- Focused gate success marker is exactly `PASS GOOGLE-ADS-CAMPAIGN-SETTINGS-GATE-001`.

- [ ] **Step 1: Change production-composition expectations to RED**

Expected ordered dataset list is the existing eleven followed by:

```text
CAMPAIGN_SETTINGS
CAMPAIGN_BUDGETS
CAMPAIGN_TARGETING_CRITERIA
```

Expected length and unique count: `14`.

Retain existing assertions proving the same Google Ads connection boundary and no eager new credential type/read.

- [ ] **Step 2: Run the existing production-source-composition integration runner**

Run:

```bash
bash tests/integration/app/run-production-source-composition-test.sh
```

Do not create a second production-composition runner.

Expected before necessary test/contract updates: FAIL on the eleven-dataset expectation; after Tasks 1–4 and expectation update: PASS without a production-runtime architecture change.

- [ ] **Step 3: Create the focused Campaign Settings gate**

`run-google-ads-campaign-settings-gate.sh` runs exactly:

```bash
bash tests/integration/google-api/run-google-ads-campaign-settings-contract-test.sh
bash tests/integration/google-api/run-google-ads-campaign-settings-normalization-test.sh
bash tests/integration/google-api/run-google-ads-configuration-source-test.sh
bash tests/integration/google-api/run-google-ads-configuration-validation-test.sh
```

Then prints:

```text
PASS GOOGLE-ADS-CAMPAIGN-SETTINGS-GATE-001
```

- [ ] **Step 4: Run the focused gate**

Run:

```bash
bash tests/integration/google-api/run-google-ads-campaign-settings-gate.sh
```

Expected: PASS marker exactly once; no live provider calls.

- [ ] **Step 5: Run affected Google Ads regression gates**

Run:

```bash
bash tests/integration/google-api/run-google-ads-conversion-configuration-gate.sh
bash tests/integration/google-api/run-google-ads-negatives-gate.sh
bash tests/integration/google-api/run-google-ads-search-reporting-gate.sh
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add \
  tests/integration/app/production-source-composition.integration.cjs \
  tests/integration/google-api/run-google-ads-campaign-settings-gate.sh \
  tests/integration/google-api/run-google-ads-*-test.sh
git diff --cached --check
git commit -m "feat: register Google Ads campaign settings"
```

Before committing, unstage any runner that did not actually require modification.

---

### Task 6: Adopt canonical contracts and run final deterministic verification

**Files:**
- Modify: `DATA_CONTRACTS.md`
- Modify: `VALIDATION_SPEC.md`
- Modify: `PROJECT_HANDOFF.md`
- Do not modify `TEST_STRATEGY.md` unless implementation produces a genuinely new lasting verification rule rather than a feature-specific gate.

**Interfaces:**
- Documentation must describe observed implemented behavior, not planned behavior.
- Handoff must distinguish deterministic verification from packaged/runtime and live-provider verification.

- [ ] **Step 1: Update `DATA_CONTRACTS.md` from verified implementation**

Document:

- three new dataset IDs and grains;
- exact Search-only scope where applicable;
- Budget resource grain and `reference_count`;
- provider-native bidding/network/AI Max semantics;
- targeting type fields;
- negative LOCATION preservation;
- human-readable geo resolution provenance;
- ProtoJSON presence/default semantics;
- portfolio strategy limitation;
- REMOVED snapshot limitation;
- targeting lossless evidence bundle and requested-resource-name provenance.

- [ ] **Step 2: Update `VALIDATION_SPEC.md` from verified tests**

Document:

- VALID / NO_DATA rules for the three datasets;
- Search/type semantic mismatch → `QUERY_MISMATCH`;
- targeting bundle structural failure → `INVALID_SCHEMA`;
- geo resolver incompleteness/identity mismatch → `QUERY_MISMATCH`;
- operational provider resolver failure remains acquisition failure;
- ownership mismatch remains `INVALID_SCHEMA`;
- no fabricated location evidence.

- [ ] **Step 3: Run final focused and regression gates**

Run:

```bash
bash tests/integration/google-api/run-google-ads-campaign-settings-gate.sh
bash tests/integration/google-api/run-google-ads-conversion-configuration-gate.sh
bash tests/integration/google-api/run-google-ads-negatives-gate.sh
bash tests/integration/google-api/run-google-ads-search-reporting-gate.sh
```

Run:

```bash
bash tests/integration/app/run-production-source-composition-test.sh
```

Expected: all PASS.

- [ ] **Step 4: Run static verification**

Run:

```bash
npx tsc --noEmit
npm run lint
git diff --check
```

If the previously observed nested-worktree ESLint plugin-resolution issue reproduces, use the same worktree-local isolated ESLint invocation already established by the prior Google Ads configuration slice. Do not change repository lint configuration to hide the environment issue.

- [ ] **Step 5: Inspect the final implementation diff before claiming completion**

Run:

```bash
git status --short
git diff --stat 9e70b96..HEAD
git diff --check 9e70b96..HEAD
git log --oneline --decorate 9e70b96..HEAD
```

Confirm there is no:

```text
Core dynamic dependent-Job scheduler
Core multi-artifact-per-Attempt redesign
generic multi-request framework
new credential boundary
date-window/metrics logic
conversion-config duplication
portfolio bidding internals
effective-current scoring
package/export recipe expansion
live-provider test
```

- [ ] **Step 6: Update `PROJECT_HANDOFF.md` with exact observed evidence**

Record only:

- actual branch/head;
- actual implemented dataset count;
- exact gates that passed;
- TypeScript/lint/diff evidence;
- not live-provider verified;
- not packaged/runtime verified unless separately proven;
- not pushed/merged unless separately performed.

- [ ] **Step 7: Commit canonical documentation**

```bash
git add DATA_CONTRACTS.md VALIDATION_SPEC.md PROJECT_HANDOFF.md
git diff --cached --check
git commit -m "docs: record Google Ads campaign settings contract"
```

- [ ] **Step 8: Re-run the acceptance-critical checks after the documentation commit**

At minimum:

```bash
bash tests/integration/google-api/run-google-ads-campaign-settings-gate.sh
npx tsc --noEmit
git diff --check
git status --short
```

Do not label the slice beyond the exact evidence produced.

## Acceptance Criteria

Campaign Settings v1 is `implemented + deterministically verified` only when fresh evidence proves all of the following:

- configuration family exposes exactly fourteen unique datasets;
- existing eleven datasets remain compatible;
- exact approved v25 Campaign/Budget/Targeting GAQL is locked by tests;
- Campaign and Targeting are Search-only;
- Budget remains one row per budget resource;
- `campaign.keyword_match_type` is preserved;
- `campaign_budget.reference_count` is preserved;
- native bidding/network/geo-routing/tracking/AI Max fields are preserved;
- ProtoJSON false/zero/default/repeated semantics are field-aware;
- only LOCATION/LANGUAGE/DEVICE/AD_SCHEDULE criteria are accepted;
- negative LOCATION evidence is preserved;
- language details are provider-attributed;
- geo resolver input derives only from observed LOCATION refs;
- targeting artifact preserves exact SearchStream/resolver bytes;
- missing required exact raw bytes fails acquisition;
- missing/mismatched geo resolution fails closed;
- valid empty datasets map according to the approved NO_DATA rules;
- portfolio bidding internals are not falsely claimed;
- REMOVED rows are preserved without synthetic effective-current semantics;
- existing Workspace Google Ads connection is reused;
- focused Campaign Settings gate passes;
- Conversion Configuration, Negatives, SEARCH Reporting, production composition, TypeScript, lint, and diff checks pass at the required depth;
- canonical docs reflect verified behavior;
- no live-provider claim, package/runtime claim, push claim, or merge claim is made without separate evidence.
