# Google Ads Negatives v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `05_NEGATIVES` vertical slice as five independently traceable Google Ads keyword-negative configuration datasets under the new `google-ads-configuration` source.

**Architecture:** Reuse the existing source-neutral Run → Job → Attempt → raw artifact → validation lifecycle and the canonical Google Ads OAuth/customer connection. Keep GAQL construction, provider resource semantics, normalization, validation, and error mapping inside the Google Ads source boundary; do not add desktop/package integration or generic provider-family abstractions.

**Tech Stack:** TypeScript, Electron main-process/runtime code, Google Ads API v25 SearchStream REST, existing `ApiRequester`, Node integration tests, Bash 3.2-compatible test runners.

**Spec:** `docs/superpowers/specs/2026-10-02-google-ads-negatives-v1-design.md`

## Global Constraints

- Source id is exactly `google-ads-configuration`.
- Acquisition mode is `OFFICIAL_API`.
- Dataset schema version is exactly `1`.
- v1 contains exactly five datasets: `CAMPAIGN_NEGATIVE_KEYWORDS`, `AD_GROUP_NEGATIVE_KEYWORDS`, `SHARED_NEGATIVE_KEYWORDS`, `CAMPAIGN_NEGATIVE_KEYWORD_LISTS`, `ACCOUNT_NEGATIVE_KEYWORD_LISTS`.
- This slice covers keyword negatives only.
- Campaign/ad-group evidence remains SEARCH-only.
- Performance Max is out of scope.
- No provider values may be invented, reconstructed, copied from request into observation, or replaced with zero/false/empty strings.
- Each dataset performs its own provider request and preserves its own raw SearchStream artifact.
- Valid zero-row provider evidence may become `NO_DATA`; malformed or semantically incompatible evidence may not.
- Existing Google Ads OAuth/customer configuration is reused through the canonical `google-ads-search-terms` Workspace connection.
- No new credential type, Developer Token behavior, connection-management UI, desktop source selection, package recipe, preset, workbook, or export integration is added.
- Normal automated tests must not call a live provider.
- Existing source capability behavior must remain unchanged except the new source explicitly reports `supports_custom_date_range: false`.
- Do not generalize `08_CONVERSION_ACTIONS` or `09_CAMPAIGN_SETTINGS` beyond the minimum source-family seam required now.

## Review Focus

- Unknown, `UNSPECIFIED`, or wrong criterion types must fail semantic validation rather than be treated as keyword negatives.
- Provider statuses including `REMOVED` must remain provider evidence; RoofRoom must not reinterpret status as a recommendation or fabricate an active-state boolean.
- Shared-set membership must never be reconstructed from campaign/account attachment evidence.
- A customer id in Job context that differs from the privileged Workspace connection must stop before requester invocation.
- Structurally valid SearchStream evidence with zero in-contract rows must be distinguishable from malformed provider payloads.

---

### Task 1: Shared contract, immutable Job context, and five GAQL query builders

**Files:**
- Create: `src/shared/google-ads-configuration.ts`
- Create: `src/main/sources/google-ads/configuration-request.ts`
- Create: `src/main/sources/google-ads/negatives-request.ts`
- Modify: `src/shared/google-api.ts`
- Create: `tests/integration/google-api/google-ads-negatives-contract.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-negatives-contract-test.sh`

**Interfaces:**
- Produces `GOOGLE_ADS_CONFIGURATION_SOURCE_ID = 'google-ads-configuration'`.
- Produces `GOOGLE_ADS_CONFIGURATION_DATASET_TYPES`.
- Produces `GoogleAdsConfigurationDatasetType`.
- Produces `GoogleAdsConfigurationResourceMode`.
- Produces `GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET`.
- Produces `GoogleAdsConfigurationJobContext`.
- Produces `createGoogleAdsConfigurationJobContext(input: { dataset_type: GoogleAdsConfigurationDatasetType; customer_id: string }): Readonly<GoogleAdsConfigurationJobContext>`.
- Produces `requireGoogleAdsConfigurationJobContext(value: unknown, expectedCustomerId?: string): GoogleAdsConfigurationJobContext`.
- Produces `googleAdsConfigurationContextAsJson(context: GoogleAdsConfigurationJobContext): Record<string, unknown>`.
- Produces five query builders in `negatives-request.ts`, one per dataset.

- [ ] **Step 1: Write the failing contract test**

Add assertions that:

- source id is exactly `google-ads-configuration`;
- the dataset array contains exactly the five approved dataset ids and no others;
- the resource modes map exactly to:
  - `CAMPAIGN_NEGATIVE_KEYWORDS -> CAMPAIGN_CRITERION`
  - `AD_GROUP_NEGATIVE_KEYWORDS -> AD_GROUP_CRITERION`
  - `SHARED_NEGATIVE_KEYWORDS -> SHARED_CRITERION`
  - `CAMPAIGN_NEGATIVE_KEYWORD_LISTS -> CAMPAIGN_SHARED_SET`
  - `ACCOUNT_NEGATIVE_KEYWORD_LISTS -> CUSTOMER_NEGATIVE_CRITERION`;
- a created context contains source id, dataset type, derived resource mode, supplied normalized customer id, and `dataset_schema_version: 1`;
- parser rejects unsupported schema versions, unknown datasets, wrong resource modes, blank customer ids, and expected-customer mismatch;
- parser does not add date fields.

For each query builder assert the required `FROM` resource and filters:

- campaign direct: `campaign_criterion.type = KEYWORD`, `campaign_criterion.negative = TRUE`, SEARCH campaign filter;
- ad group direct: `ad_group_criterion.type = KEYWORD`, `ad_group_criterion.negative = TRUE`, SEARCH campaign filter;
- shared members: `shared_criterion.type = KEYWORD`, `shared_criterion.negative = TRUE`, shared-set type limited to `NEGATIVE_KEYWORDS` and `ACCOUNT_LEVEL_NEGATIVE_KEYWORDS`;
- campaign list association: shared-set type exactly `NEGATIVE_KEYWORDS`, SEARCH campaign filter;
- account list attachment: `customer_negative_criterion.type = NEGATIVE_KEYWORD_LIST`.

Also assert queries select the provider identity, keyword text/match type, negative/type, status where available, and relevant campaign/ad-group/shared-set identities fixed by the spec.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

`bash tests/integration/google-api/run-google-ads-negatives-contract-test.sh`

Expected: FAIL because the shared contract/context/query modules do not exist.

- [ ] **Step 3: Implement the shared contract**

Implement only the constants/types/interfaces required by the test in `src/shared/google-ads-configuration.ts`.

Do not add package/export types or future conversion/settings dataset ids.

- [ ] **Step 4: Implement context creation/parsing**

Implement the three context functions in `configuration-request.ts`.

The creator derives `resource_mode` from the canonical mapping and emits schema v1 only.

The parser accepts schema v1 only, validates exact source/dataset/resource-mode relationships, preserves the supplied customer identity as request context, and optionally enforces an expected customer id.

- [ ] **Step 5: Implement the five GAQL query builders**

Implement one builder per dataset in `negatives-request.ts`.

Queries must constrain the provider result to the semantic contract rather than fetching broad exclusion resources and hoping normalization filters them later.

Do not filter out provider statuses such as `REMOVED`; preserve status where selected.

- [ ] **Step 6: Export the shared contract through the existing Google API barrel**

Add only the required export in `src/shared/google-api.ts`.

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

`bash tests/integration/google-api/run-google-ads-negatives-contract-test.sh`

Expected: `PASS GOOGLE-ADS-NEGATIVES-CONTRACT-001`.

- [ ] **Step 8: Commit**

Stage only Task 1 files and commit:

`git commit -m "feat: define Google Ads negatives contract"`

---

### Task 2: Provider-row normalization for all five datasets

**Files:**
- Modify: `src/shared/google-ads-configuration.ts`
- Create: `src/main/sources/google-ads/negatives-adapter.ts`
- Create: `tests/integration/google-api/google-ads-negatives-normalization.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-negatives-normalization-test.sh`

**Interfaces:**
- Consumes `GoogleAdsConfigurationDatasetType`.
- Produces explicit normalized row interfaces for all five datasets and a `GoogleAdsConfigurationNormalizedRow` union.
- Produces:
  - `normalizeCampaignNegativeKeywordRows(rows: Record<string, unknown>[])`
  - `normalizeAdGroupNegativeKeywordRows(rows: Record<string, unknown>[])`
  - `normalizeSharedNegativeKeywordRows(rows: Record<string, unknown>[])`
  - `normalizeCampaignNegativeKeywordListRows(rows: Record<string, unknown>[])`
  - `normalizeAccountNegativeKeywordListRows(rows: Record<string, unknown>[])`
  - `normalizeGoogleAdsConfigurationRows(datasetType: GoogleAdsConfigurationDatasetType, rows: Record<string, unknown>[]): GoogleAdsConfigurationNormalizedRow[]`

- [ ] **Step 1: Write normalization tests**

Use canonical nested camelCase `GoogleAdsRow` fixtures.

Assert direct campaign/ad-group normalized rows preserve:

- provider campaign/ad-group identities;
- criterion resource/id;
- provider criterion type;
- provider negative boolean;
- provider status when present;
- keyword text;
- keyword match type.

Assert shared-member rows preserve:

- shared-set resource/id/name/status/type;
- shared-criterion identity/type/negative;
- keyword text and match type.

Assert campaign-list rows preserve campaign identity, SEARCH channel evidence, campaign-shared-set identity/status, and attributed shared-set identity/name/status/type.

Assert account-list rows preserve customer-negative-criterion resource/id/type, `negativeKeywordList.sharedSet`, and attributed shared-set identity/name/status/type where present.

Add failure cases for:

- wrong criterion type;
- `negative: false` where negative semantics are required;
- unsupported shared-set type;
- campaign list using `ACCOUNT_LEVEL_NEGATIVE_KEYWORDS`;
- non-SEARCH campaign/ad-group/campaign-list row;
- missing required provider identity;
- missing required keyword text or match type.

Add explicit assertions that absent optional status/name fields become `null`, not empty strings, zero, or synthetic values.

Add an assertion that `REMOVED` status is preserved exactly.

- [ ] **Step 2: Run normalization test and verify RED**

Run:

`bash tests/integration/google-api/run-google-ads-negatives-normalization-test.sh`

Expected: FAIL because `negatives-adapter.ts` and normalized row types do not exist.

- [ ] **Step 3: Implement normalized row contracts**

Add only the row interfaces needed by the five datasets to `src/shared/google-ads-configuration.ts`.

Keep provider-native enum strings and nullable optional fields.

Do not introduce a generic negative score/state model.

- [ ] **Step 4: Implement the five normalizers and dispatcher**

Use small local record/string/number/boolean helpers as needed.

Required provider identities and semantic invariants throw on absence/mismatch.

Optional provider attributes normalize to `null`.

Do not infer membership, account attachment, campaign attachment, or activity state.

- [ ] **Step 5: Run normalization test and verify GREEN**

Run:

`bash tests/integration/google-api/run-google-ads-negatives-normalization-test.sh`

Expected: `PASS GOOGLE-ADS-NEGATIVES-NORMALIZATION-001`.

- [ ] **Step 6: Re-run Task 1 contract test**

Run:

`bash tests/integration/google-api/run-google-ads-negatives-contract-test.sh`

Expected: PASS.

- [ ] **Step 7: Commit**

Stage only Task 2 files plus the shared contract modification and commit:

`git commit -m "feat: normalize Google Ads negative evidence"`

---

### Task 3: Configuration source acquisition and raw preservation

**Files:**
- Create: `src/main/sources/google-ads/configuration-source.ts`
- Modify: `src/main/sources/google-ads/configuration-request.ts`
- Modify: `src/main/sources/google-api/google-api-runtime.ts`
- Create: `tests/integration/google-api/google-ads-configuration-source.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-configuration-source-test.sh`

**Interfaces:**
- Produces `GoogleAdsConfigurationDatasetDescriptor` with `dataset_type`, `resource_mode`, and `buildQuery(context)`.
- Produces `GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS` containing exactly five descriptors.
- Produces `GoogleAdsConfigurationSource implements CollectingDataSourceModule`.
- Produces `GoogleApiRuntimeFactory.createConfigurationSource(input: { workspace_id: string }): GoogleAdsConfigurationSource`.
- `configuration-request.ts` owns the local SearchStream request needed by this source; do not refactor existing SEARCH reporting transport unless live code proves a shared helper is required for correctness.

- [ ] **Step 1: Write failing source tests**

Assert:

- source id/name/mode/datasetTypes are correct;
- readiness is `NOT_CONFIGURED` without customer id and `READY` with one;
- wrong `context.source_id` fails `SOURCE_CONFIGURATION_INVALID`;
- wrong Job key fails before requester invocation;
- customer mismatch fails before requester invocation;
- unsupported schema fails before requester invocation;
- descriptor resource-mode mismatch or missing descriptor fails before requester invocation;
- an empty query builder result fails before requester invocation;
- valid collection invokes exactly one SearchStream request with the immutable Job customer id and dataset query;
- returned artifact bytes are the exact raw provider response bytes;
- preferred filename is dataset-specific and media type is JSON;
- requester/API failures use existing Google API operational error mapping.

For `GoogleApiRuntimeFactory.createConfigurationSource()` set repository connection data only under `GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID`; assert the factory succeeds and does not require a `google-ads-configuration` Workspace connection.

Also assert the fake requester receives the existing authenticated Google Ads request shape rather than a new credential mechanism.

- [ ] **Step 2: Run source test and verify RED**

Run:

`bash tests/integration/google-api/run-google-ads-configuration-source-test.sh`

Expected: FAIL because the source/factory method do not exist.

- [ ] **Step 3: Implement the local configuration SearchStream request**

In `configuration-request.ts`, implement the minimum request helper needed to call the same Google Ads API v25 SearchStream transport shape already used by SEARCH reporting.

Preserve response bytes exactly.

Do not change existing reporting request behavior merely to deduplicate a small local helper.

- [ ] **Step 4: Implement descriptor registration and source collection**

Implement `GoogleAdsConfigurationSource` following the existing SEARCH reporting source lifecycle:

validate source context → enforce schema v1 → Job-key match → resolve exact descriptor → build query → provider request → raw artifact.

Use `mapGoogleApiCollectionError` for operational failures.

- [ ] **Step 5: Implement `createConfigurationSource()` in the Google API runtime**

Use `requireConnection(workspaceId, GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID)`.

Normalize `customer_id` with the existing runtime helper.

Reuse `createGoogleAdsRequester(connection)` so OAuth and optional `login_customer_id` behavior remain unchanged.

Do not add a new Workspace connection record.

- [ ] **Step 6: Run source test and verify GREEN**

Run:

`bash tests/integration/google-api/run-google-ads-configuration-source-test.sh`

Expected: `PASS GOOGLE-ADS-CONFIGURATION-SOURCE-001`.

- [ ] **Step 7: Run existing SEARCH reporting source regression**

Run:

`bash tests/integration/google-api/run-google-ads-search-reporting-source-test.sh`

Expected: PASS.

- [ ] **Step 8: Commit**

Stage only Task 3 files and commit:

`git commit -m "feat: collect Google Ads negative configuration"`

---

### Task 4: Fail-closed validator and truthful `NO_DATA`

**Files:**
- Create: `src/main/sources/google-ads/configuration-validator.ts`
- Create: `tests/integration/google-api/google-ads-configuration-validation.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-configuration-validation-test.sh`

**Interfaces:**
- Consumes `requireGoogleAdsConfigurationJobContext`.
- Consumes `flattenGoogleAdsSearchStream` from the existing Google Ads SearchStream response helper.
- Consumes `normalizeGoogleAdsConfigurationRows`.
- Produces `GoogleAdsConfigurationValidator implements CollectionValidator`.

- [ ] **Step 1: Write failing validation tests**

Cover:

- Run/Job/Attempt/artifact ownership mismatch → invalid;
- wrong source identity → invalid;
- Job key differing from context dataset → query/context mismatch;
- unsupported schema → query/context mismatch;
- unreadable or non-JSON artifact → `ERROR_NOT_DATA`;
- malformed SearchStream envelope → `INVALID_SCHEMA`;
- semantically wrong criterion/shared-set/campaign scope → `QUERY_MISMATCH` or the existing closest source-specific invalid status;
- valid SearchStream envelope with zero normalized rows → `NO_DATA`;
- valid rows for each of the five datasets → `VALID`.

Assert `NO_DATA` is not returned when normalization throws.

Assert validation does not fabricate date metadata. If the shared validation contract expects date keys, they must be `null`.

- [ ] **Step 2: Run validation test and verify RED**

Run:

`bash tests/integration/google-api/run-google-ads-configuration-validation-test.sh`

Expected: FAIL because validator does not exist.

- [ ] **Step 3: Implement ownership/context/raw/semantic validation**

Follow the existing SEARCH reporting validator ordering but omit date-window checks.

The validator must read the preserved raw artifact, flatten canonical SearchStream pages, dispatch by dataset type, and fail closed on semantic mismatch.

Use a source-specific finding/check id such as `GOOGLE_ADS_CONFIGURATION_RESPONSE`.

- [ ] **Step 4: Run validation test and verify GREEN**

Run:

`bash tests/integration/google-api/run-google-ads-configuration-validation-test.sh`

Expected: `PASS GOOGLE-ADS-CONFIGURATION-VALIDATION-001`.

- [ ] **Step 5: Run normalization + contract regressions**

Run:

`bash tests/integration/google-api/run-google-ads-negatives-normalization-test.sh`

Run:

`bash tests/integration/google-api/run-google-ads-negatives-contract-test.sh`

Expected: both PASS.

- [ ] **Step 6: Commit**

Stage only Task 4 files and commit:

`git commit -m "feat: validate Google Ads negative evidence"`

---

### Task 5: Production runtime registration and capability override

**Files:**
- Modify: `src/main/app/production-collection-runtime.ts`
- Modify: `tests/integration/app/production-source-composition.integration.cjs`
- Use existing: `tests/integration/app/run-production-source-composition-test.sh`

**Interfaces:**
- Production runtime registers source id `google-ads-configuration`.
- Production validator registry registers `GoogleAdsConfigurationValidator`.
- `LazyWorkspaceSource` gains only the minimum optional capability override required to set `supports_custom_date_range: false` for this source.

- [ ] **Step 1: Extend production composition test first**

Update expected source ids to include `google-ads-configuration`.

Assert:

- source mode is `OFFICIAL_API`;
- dataset types are exactly the five approved datasets;
- validator registry resolves the new source;
- `getCapabilities().supports_custom_date_range === false`;
- an existing OFFICIAL_API source that currently reports custom-date support still reports `true`, proving defaults were not changed globally.

Do not add the source to desktop-supported or credential-managed source lists.

- [ ] **Step 2: Run production composition test and verify RED**

Run:

`bash tests/integration/app/run-production-source-composition-test.sh`

Expected: FAIL because the new source is not registered.

- [ ] **Step 3: Add the minimum capability override seam**

Adjust `LazyWorkspaceSource` to accept an optional `Partial<SourceCapabilities>` override and merge it over existing mode defaults.

Do not create a provider-family registry or source-specific branch in generic Core.

- [ ] **Step 4: Register source and validator**

Import the new shared source/dataset constants and validator.

Register a lazy `google-ads-configuration` source resolved by `googleApi.createConfigurationSource({ workspace_id })`.

Pass only `{ supports_custom_date_range: false }` as the capability override.

Register `GoogleAdsConfigurationValidator`.

- [ ] **Step 5: Run production composition test and verify GREEN**

Run:

`bash tests/integration/app/run-production-source-composition-test.sh`

Expected: `PASS PRODUCTION-SOURCE-COMPOSITION-001`.

- [ ] **Step 6: Run source and validation regressions**

Run:

`bash tests/integration/google-api/run-google-ads-configuration-source-test.sh`

Run:

`bash tests/integration/google-api/run-google-ads-configuration-validation-test.sh`

Expected: both PASS.

- [ ] **Step 7: Commit**

Stage Task 5 files and commit:

`git commit -m "feat: register Google Ads configuration source"`

---

### Task 6: Focused Negatives gate, affected regressions, and adopted contract documentation

**Files:**
- Create: `tests/integration/google-api/run-google-ads-negatives-gate.sh`
- Modify: `DATA_CONTRACTS.md`
- Modify: `PROJECT_HANDOFF.md`
- Modify only if needed for a real script entry point: `package.json`

**Interfaces:**
- The Negatives gate runs the focused contract, normalization, source, and validation runners.
- Canonical docs describe only verified implemented behavior.
- Handoff points to the next approved separate configuration slice after this one.

- [ ] **Step 1: Add the focused gate**

Create a Bash 3.2-compatible runner that invokes:

- `run-google-ads-negatives-contract-test.sh`
- `run-google-ads-negatives-normalization-test.sh`
- `run-google-ads-configuration-source-test.sh`
- `run-google-ads-configuration-validation-test.sh`

It must stop on first failure and print `PASS GOOGLE-ADS-NEGATIVES-GATE-001` only after all four pass.

Do not add an npm alias unless repository workflow actually benefits from it.

- [ ] **Step 2: Run the new focused gate**

Run:

`bash tests/integration/google-api/run-google-ads-negatives-gate.sh`

Expected: `PASS GOOGLE-ADS-NEGATIVES-GATE-001`.

- [ ] **Step 3: Run directly affected existing regressions**

Run:

`bash tests/integration/app/run-production-source-composition-test.sh`

Expected: PASS.

Run:

`bash tests/integration/google-api/run-google-ads-search-reporting-gate.sh`

Expected: PASS.

- [ ] **Step 4: Run static verification**

Run:

`npx tsc --noEmit`

Expected: exit 0 with no TypeScript errors.

Run:

`npm run lint`

Expected: exit 0 with no ESLint errors.

Run:

`git diff --check`

Expected: no output.

Do not run live-provider, broad packaging, or release gates solely for reassurance.

- [ ] **Step 5: Perform the slice-end simplification review**

Confirm from the final production diff:

- no provider-specific negative semantics entered Core;
- no connection-management or generic desktop source list was widened;
- no package/export recipe was changed;
- no future conversion/settings abstraction was introduced;
- no dataset reconstructs evidence from another dataset;
- the capability override remains a small local seam;
- status values remain provider evidence;
- no requested identity was copied into observed fields.

If any item fails, simplify before documenting completion.

- [ ] **Step 6: Update `DATA_CONTRACTS.md`**

Document the adopted stable contract:

- source id;
- five datasets;
- schema v1 context;
- current snapshot/no-date semantics;
- keyword-negatives-only boundary;
- direct/shared/campaign-list/account-list separation;
- existing Ads connection reuse;
- truthful `NO_DATA` and missing-is-not-zero rules.

Do not document package/preset/export integration as implemented.

- [ ] **Step 7: Update `PROJECT_HANDOFF.md` from actual evidence**

Record the exact deterministic verification achieved.

State explicitly that live-provider acceptance was not performed unless separately authorized and actually run.

If this slice is complete, set the next implementation scope to `08_CONVERSION_ACTIONS`; keep `09_CAMPAIGN_SETTINGS` subsequent.

Also remove any now-stale wording that says the previous reporting repair has not yet been committed.

- [ ] **Step 8: Re-check docs/static diff only**

Run:

`git diff --check`

Expected: no output.

Inspect:

`git diff -- DATA_CONTRACTS.md PROJECT_HANDOFF.md`

No broad deterministic gate rerun is required solely because documentation changed.

- [ ] **Step 9: Commit the verified slice documentation and gate**

Stage only the focused gate and canonical docs, plus `package.json` only if it was intentionally needed.

Commit:

`git commit -m "docs: record Google Ads negatives contract"`

---

## Final acceptance checkpoint

Before claiming the slice complete, evidence must show:

- all five dataset contracts exist;
- all five query builders are deterministically covered;
- immutable schema-v1 Job context is enforced;
- customer mismatch blocks before provider access;
- exact raw response bytes are preserved;
- all five normalization paths preserve provider identity and semantics;
- wrong criterion/list/campaign scope fails closed;
- valid empty response produces truthful `NO_DATA`;
- production source and validator are registered;
- canonical existing Ads connection is reused;
- custom date-range capability is false only for the new snapshot source;
- SEARCH reporting remains green where affected;
- `npx tsc --noEmit`, lint, and diff check pass;
- canonical docs match verified implementation;
- no live-provider claim is made without separate evidence.

The implementation state after these tasks may be described as **implemented + deterministically verified** only if every required verification above actually passed.

It must not be described as packaged/runtime verified or live-provider verified unless those separate evidence categories are explicitly established.
