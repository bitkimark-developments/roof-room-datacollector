# Google Ads SEARCH Reporting Family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the SEARCH-only Google Ads reporting source family and six independently retryable dataset adapters, without yet implementing Task Package evidence reuse/UI.

**Architecture:** Register one new source family, `google-ads-search-reporting`, that dispatches six dataset-specific Job contexts to independent query-builder/normalizer contracts while sharing the existing Google Ads OAuth/customer connection and transport. Raw `SearchStream` JSON remains the accepted source artifact; source validators normalize canonical REST stream envelopes and fail closed before Production Data Package loading.

**Tech Stack:** TypeScript, Electron main process, Google Ads API v25 REST SearchStream, SQLite-backed existing Core, Node test runner/Bash integration scripts.

**Spec:** `docs/superpowers/specs/2026-09-29-ads-optimization-pack-v1-design.md`

## Global Constraints

- SEARCH only. Do not implement or generalize to Performance Max.
- Preserve `google-ads-search-terms` quick-run behavior and persisted identities.
- New source family id: `google-ads-search-reporting`.
- Required dataset types: `CAMPAIGN_PERFORMANCE`, `AD_GROUP_PERFORMANCE`, `KEYWORD_PERFORMANCE`, `SEARCH_TERMS`, `AD_PERFORMANCE`, `RSA_ASSET_PERFORMANCE`.
- Google Ads API path remains v25 official REST `SearchStream`.
- Raw provider response is preserved before normalization.
- Canonical provider shape is SearchStream envelope array → response object → `results[]` nested camelCase GoogleAdsRow.
- Missing numeric evidence stays NULL; true zero stays zero.
- Keep canonical monetary values in micros where the provider reports micros.
- No CPA/ROAS/delta/score/recommendation logic.
- Normal automated tests must not call Google.
- Do not modify unrelated current GSC/desktop WIP.
- Re-audit live `git status`, HEAD, and applicable `AGENTS.md` files before edits.

## Review Focus

1. A 200 response with canonical SearchStream envelopes but no result rows must become `NO_DATA`, not schema failure.
2. Numeric string `"0"` must normalize to zero while missing/absent values remain NULL.
3. A row outside the immutable Job date window must fail validation even though the GAQL builder also filters dates.
4. Unsupported dataset/resource mode or `campaign_type != SEARCH` must fail before any provider request.
5. Existing Search Terms quick-run tests and production Data Package export must remain backward-compatible.

---

### Task 1: Add shared Google Ads SEARCH reporting contracts

**Files:**
- Create: `src/shared/google-ads-search-reporting.ts`
- Modify: `src/shared/google-api.ts`
- Test: `tests/integration/google-api/google-ads-search-reporting-contract.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-search-reporting-contract-test.sh`
- Modify: `package.json`

**Interfaces:**
- Produces `GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID = 'google-ads-search-reporting'`.
- Produces a six-value dataset type union and six resource-mode values from the approved spec.
- Produces normalized row interfaces with provider-native numeric/null semantics.
- Existing `GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID` remains unchanged.

- [ ] **Step 1: Write the failing shared-contract test**

Assert:

- the new source id is exact;
- all six dataset types exist exactly once;
- each dataset maps to its locked resource mode;
- the old Search Terms source id is unchanged;
- monetary canonical field names use `*_micros` where applicable.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm run test:m3:google-ads-search-reporting-contract`

Expected: FAIL because the shared contract does not exist.

- [ ] **Step 3: Implement the shared contract**

Keep this file declarative: constants, unions/interfaces, resource-mode mapping, no provider calls and no Core logic.

- [ ] **Step 4: Run focused test**

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Commit message: `feat: define google ads search reporting contracts`

---

### Task 2: Parse the canonical Google Ads SearchStream REST envelope

**Files:**
- Create: `src/main/sources/google-ads/search-stream-response.ts`
- Test: `tests/integration/google-api/google-ads-search-stream-response.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-search-stream-response-test.sh`
- Modify: `package.json`

**Interfaces:**
- Produces `flattenGoogleAdsSearchStream(body: unknown): Record<string, unknown>[]`.
- Consumes the provider's canonical top-level array and each envelope's `results` array.
- Does not normalize dataset semantics.

- [ ] **Step 1: Write failing tests using canonical REST-shaped mocks**

Cover:

- one envelope / multiple results;
- multiple envelopes;
- empty envelopes and empty result arrays → `[]`;
- malformed top-level object;
- envelope with non-array `results`;
- nested camelCase result objects preserved without mutation.

Mark these mocks as official-schema-shaped development mocks, not live-provider fixtures.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:m3:google-ads-search-stream-response`

Expected: FAIL because the helper is absent.

- [ ] **Step 3: Implement `flattenGoogleAdsSearchStream`**

Fail closed on malformed envelope structure. Return a fresh flattened row array and never mutate the raw response.

- [ ] **Step 4: Run focused test**

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Commit message: `feat: parse google ads search stream responses`

---

### Task 3: Add the shared Google Ads reporting requester/source shell

**Files:**
- Create: `src/main/sources/google-ads/search-reporting-source.ts`
- Create: `src/main/sources/google-ads/search-reporting-request.ts`
- Modify: `src/main/sources/google-api/google-api-runtime.ts`
- Test: `tests/integration/google-api/google-ads-search-reporting-source.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-search-reporting-source-test.sh`
- Modify: `package.json`

**Interfaces:**
- `createGoogleAdsReportingJobContext(input)` produces immutable generic source context containing source id, dataset type, resource mode, SEARCH, customer id, absolute dates, schema version 1.
- `GoogleAdsSearchReportingSource.collect(context)` dispatches only to registered dataset descriptors and returns one raw JSON artifact per Job.
- Runtime factory resolves the existing Google Ads Search Terms workspace connection as the v1 compatibility credential/customer anchor.

- [ ] **Step 1: Write failing source-shell tests**

Assert:

- valid absolute source context reaches a mocked requester;
- customer id is taken from immutable source context and is consistent with configured connection identity;
- reversed/invalid dates fail before requester invocation;
- unsupported campaign type/resource mode/dataset type fails before requester invocation;
- raw SearchStream body, not normalized rows, is returned as artifact bytes;
- no task/package analysis field is introduced.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:m3:google-ads-search-reporting-source`

Expected: FAIL.

- [ ] **Step 3: Implement the source shell and runtime factory entry point**

Do not yet register dataset descriptors that have no implemented query/normalizer.

- [ ] **Step 4: Run focused tests plus existing credential composition test**

Run:

`npm run test:m3:google-ads-search-reporting-source`

`npm run test:m3:google-credentials`

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Commit message: `feat: add google ads search reporting source shell`

---

### Task 4: Implement Campaign and Ad Group dataset adapters

**Files:**
- Create: `src/main/sources/google-ads/campaigns-request.ts`
- Create: `src/main/sources/google-ads/campaigns-adapter.ts`
- Create: `src/main/sources/google-ads/ad-groups-request.ts`
- Create: `src/main/sources/google-ads/ad-groups-adapter.ts`
- Modify: `src/main/sources/google-ads/search-reporting-source.ts`
- Test: `tests/integration/google-api/google-ads-campaign-ad-group-reporting.integration.cjs`

**Interfaces:**
- Query builders consume only immutable source context and return GAQL strings.
- Normalizers consume flattened canonical GoogleAdsRow objects and return the shared normalized row interfaces.
- Every normalized performance row has `performance_date` and `snapshot_observed_at` is added later from artifact provenance, not invented from `segments.date`.

- [ ] **Step 1: Write failing query-builder tests**

Assert exact SEARCH filter, exact absolute date range, required approved fields/metrics, and no relative date tokens.

- [ ] **Step 2: Write failing normalizer tests**

Use nested camelCase official-schema-shaped rows. Cover null/zero, ids, budget micros, bidding/status fields, search-share metrics, and malformed identity/numerics.

- [ ] **Step 3: Run and verify failure**

Run the new focused integration file through its shell runner.

- [ ] **Step 4: Implement the minimum Campaign and Ad Group adapters**

Before finalizing each GAQL field combination, check current official v25 field compatibility. If a locked metric is not selectable with the resource/date combination, stop and document the concrete official incompatibility rather than silently dropping or substituting it.

- [ ] **Step 5: Register the two descriptors in the source shell**

- [ ] **Step 6: Run focused tests**

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Commit message: `feat: collect google ads campaign and ad group evidence`

---

### Task 5: Implement Keyword and Search Terms dataset adapters

**Files:**
- Create: `src/main/sources/google-ads/keywords-request.ts`
- Create: `src/main/sources/google-ads/keywords-adapter.ts`
- Modify: `src/main/sources/google-ads/search-terms-request.ts`
- Modify: `src/main/sources/google-ads/search-terms-adapter.ts`
- Modify: `src/main/sources/google-ads/search-reporting-source.ts`
- Test: `tests/integration/google-api/google-ads-keyword-search-term-reporting.integration.cjs`
- Test: `tests/integration/google-api/ads-reviewed-quick-run.integration.cjs`
- Test: `tests/integration/google-api/google-api-adapters.integration.cjs`

**Interfaces:**
- Keyword adapter uses `keyword_view` plus attributed `ad_group_criterion` data.
- Search Terms reporting-family adapter uses `search_term_view` and canonical SearchStream nested rows.
- Existing quick-run source id and date policy remain operational.

- [ ] **Step 1: Add failing canonical SearchStream compatibility coverage to existing Search Terms tests**

The old flat mock may remain only where explicitly testing backward internal compatibility; it cannot be the sole provider-shape test.

- [ ] **Step 2: Add failing Keyword query/normalizer tests**

Cover keyword identity, match type, status, quality snapshot, bid micros, date, search shares, zero/null.

- [ ] **Step 3: Add failing Search Terms reporting-family tests**

Cover search term, keyword resource/text/match type, targeting status, date and native metrics.

- [ ] **Step 4: Run tests and verify failure**

- [ ] **Step 5: Implement the Keyword adapter and upgrade Search Terms parsing/query fields**

Preserve quick-run public behavior unless a compatibility field can be added without breaking existing consumers.

- [ ] **Step 6: Run focused tests plus `npm run test:m3:google-api-adapters`**

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

Commit message: `feat: collect google ads keyword and search term evidence`

---

### Task 6: Implement RSA Ad and RSA Asset dataset adapters

**Files:**
- Create: `src/main/sources/google-ads/ads-request.ts`
- Create: `src/main/sources/google-ads/ads-adapter.ts`
- Create: `src/main/sources/google-ads/rsa-assets-request.ts`
- Create: `src/main/sources/google-ads/rsa-assets-adapter.ts`
- Modify: `src/main/sources/google-ads/search-reporting-source.ts`
- Test: `tests/integration/google-api/google-ads-rsa-reporting.integration.cjs`

**Interfaces:**
- Ads query uses `ad_group_ad` and filters `RESPONSIVE_SEARCH_AD` within SEARCH campaigns.
- RSA asset query uses `ad_group_ad_asset_view` and filters to SEARCH/RSA semantics supported by v25.
- Normalizers preserve repeated headlines/descriptions/final URLs as arrays and asset performance labels as provider enums.

- [ ] **Step 1: Write failing RSA ad query/normalizer tests**

Cover ad ids, type/status, ad strength, policy states, URLs, headline/description arrays, paths, metrics, nulls.

- [ ] **Step 2: Write failing RSA asset query/normalizer tests**

Cover resource name, field type, performance label, pinned field, source/enabled, text when supplied, metrics, nulls.

- [ ] **Step 3: Run and verify failure**

- [ ] **Step 4: Implement both adapters and register descriptors**

Check exact current official v25 GAQL compatibility before locking query fields.

- [ ] **Step 5: Run focused tests**

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

Commit message: `feat: collect responsive search ad evidence`

---

### Task 7: Add source-specific semantic validation

**Files:**
- Create: `src/main/sources/google-ads/search-reporting-validator.ts`
- Modify: `src/main/app/production-collection-runtime.ts`
- Test: `tests/integration/google-api/google-ads-search-reporting-validation.integration.cjs`

**Interfaces:**
- `GoogleAdsSearchReportingValidator` dispatches by the six approved dataset types/resource modes within the source boundary.
- Validator returns existing Core validation statuses only; do not invent new persisted enums in this slice.

- [ ] **Step 1: Write failing validation tests for all six datasets**

Cover valid rows, `NO_DATA`, wrong source/dataset/mode, non-SEARCH identity, malformed envelope, missing identity, invalid numeric value, out-of-range date, missing date where rows exist.

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement the validator**

Use dataset normalizers as schema proof, then apply date/campaign/source semantic checks. Do not calculate marketing judgments.

- [ ] **Step 4: Register source + validator in production runtime**

- [ ] **Step 5: Run focused validation and source-shell tests**

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

Commit message: `feat: validate google ads search reporting evidence`

---

### Task 8: Load all six accepted datasets into Production Data Package

**Files:**
- Modify: `src/main/export/production-data-package-loader.ts`
- Test: `tests/integration/export/production-data-package-loader.integration.cjs`
- Test: `tests/integration/export/data-package-exporter.integration.cjs`

**Interfaces:**
- Existing generic `DataPackage` schema remains source-neutral.
- Loader dispatches the reporting family by immutable Job `dataset_type`/resource mode, not by Core branches.
- Provenance retains run/job/artifact/checksum/requested context and sets `snapshot_observed_at` from artifact acquisition time when writing normalized rows/provenance.

- [ ] **Step 1: Add failing loader tests for all six datasets**

Assert only accepted artifacts load; rejected/malformed evidence is excluded/fails closed; `NO_DATA` loads an empty row set with provenance.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:m6:production-data-package`

- [ ] **Step 3: Implement reporting-family loader dispatch**

Do not add Ads analysis to the generic exporter.

- [ ] **Step 4: Run production data package and generic data package tests**

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

Commit message: `feat: export google ads search reporting datasets`

---

### Task 9: Add deterministic family gate and run repository verification

**Files:**
- Create: `tests/integration/google-api/run-google-ads-search-reporting-gate.sh`
- Modify: `package.json`
- Modify: `tests/integration/release/run-release-gate.sh` only if the new deterministic suite is stable and the repository's current release-gate conventions require inclusion at this stage.
- Modify canonical docs only for implementation facts actually proven by this branch.

**Interfaces:**
- Produces one deterministic entry point for all new Google Ads reporting source-family tests.
- Does not invoke live Google.

- [ ] **Step 1: Add the family gate script and npm alias**

Preferred alias: `test:m3:google-ads-search-reporting`.

Keep macOS Bash 3.2 compatibility.

- [ ] **Step 2: Run focused gate**

Run: `npm run test:m3:google-ads-search-reporting`

Expected: PASS.

- [ ] **Step 3: Run existing adjacent regressions**

Run at minimum:

`npm run test:m3:google-api-adapters`

`npm run test:m3:google-credentials`

`npm run test:m6:production-data-package`

`npm run test:m6:data-package`

Expected: PASS.

- [ ] **Step 4: Run static/full verification appropriate to current HEAD**

Run:

`npm run lint`

`npx tsc --noEmit`

`git diff --check`

Then run `npm run test:release:gate` if the live repository gate is expected to remain deterministic and unrelated pre-existing WIP does not make the result ambiguous.

Record exact output; never claim PASS for a command not run.

- [ ] **Step 5: Do not run live Google Ads smoke automatically**

Stop and report deterministic readiness. A live smoke requires separate explicit user approval. When approved later, each new resource contract must be proven with a minimal call and sanitized observed fixture before Release 1.0 completion is claimed.

- [ ] **Step 6: Update documentation from verified evidence only**

Update `PROJECT_HANDOFF.md` when this is a meaningful checkpoint. Update `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `DATA_CONTRACTS.md`, `VALIDATION_SPEC.md`, `SOURCE_MODULE_GUIDE.md`, `TEST_STRATEGY.md`, or `DECISIONS.md` only where this implemented slice materially changes their stable contract.

- [ ] **Step 7: Commit the verified slice**

Suggested final checkpoint message: `feat: add google ads search reporting family`

---

## Slice-A acceptance criteria

This plan is complete when:

- one source family dispatches six SEARCH reporting datasets as independent Jobs;
- all six queries use immutable absolute dates and fail closed outside SEARCH;
- canonical v25 SearchStream envelope/camelCase rows are supported;
- raw responses remain canonical accepted artifacts;
- each dataset has deterministic normalizer and semantic validation coverage;
- zero and NULL remain distinct;
- current Search Terms quick-run regression remains green;
- Production Data Package can load all six accepted datasets;
- no package/baseline/reuse/UI logic has leaked into this slice;
- deterministic gates pass without live Google calls;
- live acceptance remains an explicit separate action.
