# Google Ads Conversion Configuration v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `google-ads-configuration` OFFICIAL_API snapshot source with six independently validated Conversion Configuration v1 datasets without changing Core, persistence, credentials, package recipes, or the existing five-dataset Negatives v1 contract.

**Architecture:** Reuse the existing Google Ads configuration Job context, SearchStream transport, Workspace connection, raw-artifact lifecycle, and validator. Add provider-specific query builders and normalization for the six approved resources, route them through a small source-local dispatcher, and extend production registration from five to eleven datasets.

**Tech Stack:** TypeScript, Electron main process, Google Ads REST SearchStream v25, Node.js integration-test runners, shell gates.

**Spec:** `docs/superpowers/specs/2026-10-02-google-ads-conversion-configuration-v1-design.md`

## Global Constraints

- Source remains exactly `google-ads-configuration`.
- Source mode remains exactly `OFFICIAL_API`.
- `dataset_schema_version` remains exactly `1`.
- Existing Negatives v1 remains exactly five datasets.
- Conversion Configuration v1 contains exactly six datasets.
- Full `google-ads-configuration` family contains exactly eleven datasets.
- All six new datasets are current configuration snapshots; no date windows, segments, or reporting metrics.
- All six Jobs use the immutable configured Google Ads `customer_id`; no hidden cross-account rerouting.
- Raw SearchStream evidence remains authoritative.
- Missing provider evidence remains null/absent; never manufacture zero, false, empty string, owner identity, or empty membership.
- `include_in_conversions_metric` is legacy provider evidence only.
- RoofRoom must not synthesize an effective optimization goal set.
- Core, persistence schema, credential model, package/preset/export recipes, and Developer Token behavior do not change.
- Normal automated verification must not call Google Ads live.
- `09_CAMPAIGN_SETTINGS` remains a subsequent independent scope.

## Review Focus

1. A provider-absent optional field must remain null/absent while a real provider `false` or `0` remains intact; Task 2 tests this.
2. A missing custom-goal membership must not become `[]`, while a provider-returned empty membership array remains `[]`; Task 2 tests this.
3. `CUSTOMER_CONVERSION_TRACKING_SETTINGS` must accept exactly one valid customer row, reject zero/multiple rows, and accept `NOT_CONVERSION_TRACKED`; Task 4 tests this.
4. Campaign goal rows must preserve lifecycle evidence such as `campaign.status = REMOVED` rather than silently filtering it; Tasks 1 and 2 test this.
5. Existing Negatives v1 behavior must remain five-dataset compatible after the full source family expands to eleven; Tasks 1, 3, 4, and 6 run explicit regressions.

---

## File Structure

Create:

~~~text
src/main/sources/google-ads/conversion-configuration-request.ts
src/main/sources/google-ads/conversion-configuration-adapter.ts
src/main/sources/google-ads/configuration-normalizer.ts
tests/integration/google-api/google-ads-conversion-configuration-contract.integration.cjs
tests/integration/google-api/google-ads-conversion-configuration-normalization.integration.cjs
tests/integration/google-api/run-google-ads-conversion-configuration-contract-test.sh
tests/integration/google-api/run-google-ads-conversion-configuration-normalization-test.sh
tests/integration/google-api/run-google-ads-conversion-configuration-gate.sh
~~~

Modify:

~~~text
src/shared/google-ads-configuration.ts
src/main/sources/google-ads/configuration-source.ts
src/main/sources/google-ads/configuration-validator.ts
src/main/app/production-collection-runtime.ts
tests/integration/google-api/google-ads-configuration-source.integration.cjs
tests/integration/google-api/google-ads-configuration-validation.integration.cjs
tests/integration/app/production-source-composition.integration.cjs
DATA_CONTRACTS.md
VALIDATION_SPEC.md
PROJECT_HANDOFF.md
~~~

Do not rename or broadly refactor the working Negatives implementation.

---

### Task 1: Lock the six-dataset contract and exact GAQL

**Files:**
- Modify: `src/shared/google-ads-configuration.ts`
- Create: `src/main/sources/google-ads/conversion-configuration-request.ts`
- Create: `tests/integration/google-api/google-ads-conversion-configuration-contract.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-conversion-configuration-contract-test.sh`

**Interfaces:**
- Produces `GOOGLE_ADS_NEGATIVES_DATASET_TYPES`.
- Produces `GOOGLE_ADS_CONVERSION_CONFIGURATION_DATASET_TYPES`.
- Keeps `GOOGLE_ADS_CONFIGURATION_DATASET_TYPES` as the full eleven-dataset family.
- Extends `GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET`.
- Produces:
  - `buildConversionActionsQuery(context: GoogleAdsConfigurationJobContext): string`
  - `buildCustomerConversionGoalsQuery(context: GoogleAdsConfigurationJobContext): string`
  - `buildConversionGoalCampaignConfigsQuery(context: GoogleAdsConfigurationJobContext): string`
  - `buildCampaignConversionGoalsQuery(context: GoogleAdsConfigurationJobContext): string`
  - `buildCustomConversionGoalsQuery(context: GoogleAdsConfigurationJobContext): string`
  - `buildCustomerConversionTrackingSettingsQuery(context: GoogleAdsConfigurationJobContext): string`

- [ ] **Step 1: Write the failing contract test**

Assert:

~~~text
GOOGLE_ADS_NEGATIVES_DATASET_TYPES
= exactly the existing five Negatives IDs

GOOGLE_ADS_CONVERSION_CONFIGURATION_DATASET_TYPES
= exactly:
  CONVERSION_ACTIONS
  CUSTOMER_CONVERSION_GOALS
  CONVERSION_GOAL_CAMPAIGN_CONFIGS
  CAMPAIGN_CONVERSION_GOALS
  CUSTOM_CONVERSION_GOALS
  CUSTOMER_CONVERSION_TRACKING_SETTINGS

GOOGLE_ADS_CONFIGURATION_DATASET_TYPES
= exactly 11 unique IDs
~~~

Assert exact resource modes:

~~~text
CONVERSION_ACTIONS                    → CONVERSION_ACTION
CUSTOMER_CONVERSION_GOALS             → CUSTOMER_CONVERSION_GOAL
CONVERSION_GOAL_CAMPAIGN_CONFIGS      → CONVERSION_GOAL_CAMPAIGN_CONFIG
CAMPAIGN_CONVERSION_GOALS             → CAMPAIGN_CONVERSION_GOAL
CUSTOM_CONVERSION_GOALS               → CUSTOM_CONVERSION_GOAL
CUSTOMER_CONVERSION_TRACKING_SETTINGS → CUSTOMER
~~~

For every new dataset, assert `createGoogleAdsConfigurationJobContext()` preserves:

~~~text
source_id = google-ads-configuration
dataset_type = requested new dataset
resource_mode = exact mapped mode
customer_id = requested digits-only customer ID
dataset_schema_version = 1
~~~

Assert each query builder matches the exact GAQL in the approved spec after whitespace normalization.

Also assert every query contains no `metrics.` and no `segments.` and that campaign-goal queries select `campaign.status`.

- [ ] **Step 2: Run the new contract runner and observe RED**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-conversion-configuration-contract-test.sh
~~~

Expected: FAIL because the six dataset constants/resource mappings/query builders do not yet exist.

- [ ] **Step 3: Extend the shared dataset contract minimally**

In `src/shared/google-ads-configuration.ts`:

- extract the existing five IDs into `GOOGLE_ADS_NEGATIVES_DATASET_TYPES`;
- add the exact six IDs as `GOOGLE_ADS_CONVERSION_CONFIGURATION_DATASET_TYPES`;
- compose `GOOGLE_ADS_CONFIGURATION_DATASET_TYPES` from those two subsets;
- add the exact six resource-mode mappings;
- keep `GoogleAdsConfigurationJobContext` unchanged.

Do not add conversion semantics to Core or generic Job context.

- [ ] **Step 4: Implement the six exact query builders**

In `conversion-configuration-request.ts`, export the six signatures listed above.

Each builder returns only the exact spec-approved SELECT/FROM contract.

Do not add:

~~~text
WHERE status filters
date clauses
metrics
segments
cross-account rerouting
additional provider fields
~~~

- [ ] **Step 5: Run focused contract test GREEN**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-conversion-configuration-contract-test.sh
~~~

Expected:

~~~text
PASS GOOGLE-ADS-CONVERSION-CONFIGURATION-CONTRACT-001
~~~

- [ ] **Step 6: Run existing Negatives contract regression**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-negatives-contract-test.sh
~~~

Expected:

~~~text
PASS GOOGLE-ADS-NEGATIVES-CONTRACT-001
~~~

- [ ] **Step 7: Commit**

~~~bash
git add \
  src/shared/google-ads-configuration.ts \
  src/main/sources/google-ads/conversion-configuration-request.ts \
  tests/integration/google-api/google-ads-conversion-configuration-contract.integration.cjs \
  tests/integration/google-api/run-google-ads-conversion-configuration-contract-test.sh

git commit -m "feat: define Google Ads conversion configuration contract"
~~~

---

### Task 2: Normalize six provider-native configuration resources

**Files:**
- Modify: `src/shared/google-ads-configuration.ts`
- Create: `src/main/sources/google-ads/conversion-configuration-adapter.ts`
- Create: `tests/integration/google-api/google-ads-conversion-configuration-normalization.integration.cjs`
- Create: `tests/integration/google-api/run-google-ads-conversion-configuration-normalization-test.sh`

**Interfaces:**
- Adds six normalized row interfaces to `src/shared/google-ads-configuration.ts`.
- Extends `GoogleAdsConfigurationNormalizedRow` with all six new row types.
- Produces:
  - `normalizeConversionActionRows(rows: Record<string, unknown>[]): GoogleAdsConversionActionRow[]`
  - `normalizeCustomerConversionGoalRows(rows: Record<string, unknown>[]): GoogleAdsCustomerConversionGoalRow[]`
  - `normalizeConversionGoalCampaignConfigRows(rows: Record<string, unknown>[]): GoogleAdsConversionGoalCampaignConfigRow[]`
  - `normalizeCampaignConversionGoalRows(rows: Record<string, unknown>[]): GoogleAdsCampaignConversionGoalRow[]`
  - `normalizeCustomConversionGoalRows(rows: Record<string, unknown>[]): GoogleAdsCustomConversionGoalRow[]`
  - `normalizeCustomerConversionTrackingSettingRows(rows: Record<string, unknown>[]): GoogleAdsCustomerConversionTrackingSettingRow[]`
  - `normalizeGoogleAdsConversionConfigurationRows(datasetType: GoogleAdsConfigurationDatasetType, rows: Record<string, unknown>[]): GoogleAdsConfigurationNormalizedRow[]`

- [ ] **Step 1: Write failing normalization tests for all six happy paths**

Use sanitized SearchStream result-row shapes and assert the exact normalized fields from the design.

Include explicit assertions that:

~~~text
campaign.status = REMOVED
→ normalized campaign_status = REMOVED

conversion_action.include_in_conversions_metric = false
→ false

value_settings.default_value = 0
→ 0
~~~

- [ ] **Step 2: Add failing null/missing integrity cases**

Assert:

~~~text
missing owner_customer
→ null

missing GA4 settings
→ both GA4 normalized fields null

missing cross_account_conversion_tracking_id
→ null

provider conversion_actions = []
→ []

missing conversion_actions field
→ normalization throws/fails closed, not []
~~~

Assert no function accepts a requested customer ID argument from which observed owner fields could be fabricated.

- [ ] **Step 3: Add failing required-field semantic cases**

At minimum reject malformed/missing:

~~~text
conversion action resource identity
conversion action id/name/status/type/category/origin
conversion action primary_for_goal
goal category/origin/biddable
campaign goal-config level
campaign resource identity/id
custom goal resource identity/id/status
customer resource identity/id
conversion tracking status
~~~

Optional provider fields remain nullable and must not trigger rejection merely because they are unavailable.

- [ ] **Step 4: Run normalization runner and observe RED**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-conversion-configuration-normalization-test.sh
~~~

Expected: FAIL because the row types and adapter do not exist.

- [ ] **Step 5: Add exact shared row interfaces**

Add the six interfaces from the approved design to `src/shared/google-ads-configuration.ts`.

Keep provider-native enum/status values as strings unless the existing configuration convention already uses a stricter source-native type.

Do not invent generic score, optimization, effective-goal, or decision fields.

- [ ] **Step 6: Implement the conversion configuration adapter**

Implement the seven exported normalization functions from the Interfaces block.

Use small source-local required/optional field helpers as needed.

Preserve:

~~~text
null vs zero
null vs false
REMOVED status
provider-returned membership
provider resource names
~~~

Fail visibly on required semantic/type mismatches.

- [ ] **Step 7: Run normalization test GREEN**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-conversion-configuration-normalization-test.sh
~~~

Expected:

~~~text
PASS GOOGLE-ADS-CONVERSION-CONFIGURATION-NORMALIZATION-001
~~~

- [ ] **Step 8: Run Negatives normalization regression**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-negatives-normalization-test.sh
~~~

Expected:

~~~text
PASS GOOGLE-ADS-NEGATIVES-NORMALIZATION-001
~~~

- [ ] **Step 9: Commit**

~~~bash
git add \
  src/shared/google-ads-configuration.ts \
  src/main/sources/google-ads/conversion-configuration-adapter.ts \
  tests/integration/google-api/google-ads-conversion-configuration-normalization.integration.cjs \
  tests/integration/google-api/run-google-ads-conversion-configuration-normalization-test.sh

git commit -m "feat: normalize Google Ads conversion configuration"
~~~

---

### Task 3: Dispatch all eleven datasets through the existing configuration source

**Files:**
- Create: `src/main/sources/google-ads/configuration-normalizer.ts`
- Modify: `src/main/sources/google-ads/configuration-source.ts`
- Modify: `tests/integration/google-api/google-ads-configuration-source.integration.cjs`

**Interfaces:**
- Produces:
  - `normalizeGoogleAdsConfigurationRows(datasetType: GoogleAdsConfigurationDatasetType, rows: Record<string, unknown>[]): GoogleAdsConfigurationNormalizedRow[]`
- Reuses the existing `negatives-adapter.ts` export via an import alias rather than renaming it.
- Extends `GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS` from five to eleven descriptors.

- [ ] **Step 1: Extend the existing source test first**

For each of the six new datasets assert:

- descriptor exists exactly once;
- descriptor resource mode equals `GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET`;
- one collection calls the requester exactly once;
- request targets the configured immutable customer;
- request body carries the exact builder GAQL;
- output preserves `response.raw_body` bytes when supplied;
- generated filename is `google-ads-<dataset-id-lowercase-hyphenated>.json`.

Also assert the descriptor registry contains exactly eleven unique datasets.

- [ ] **Step 2: Run existing configuration source runner and observe RED**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-configuration-source-test.sh
~~~

Expected: FAIL because the six descriptors are not registered.

- [ ] **Step 3: Add the source-local normalization dispatcher**

Create `configuration-normalizer.ts`.

Import the current Negatives dispatcher as an alias:

~~~text
normalizeGoogleAdsConfigurationRows
from negatives-adapter
as normalizeGoogleAdsNegativeConfigurationRows
~~~

Export the new family-level `normalizeGoogleAdsConfigurationRows(...)`.

Dispatch:

~~~text
five Negatives dataset IDs
→ existing Negatives adapter

six Conversion Configuration dataset IDs
→ normalizeGoogleAdsConversionConfigurationRows

anything unsupported
→ throw
~~~

Do not introduce a Core registry or generic provider framework.

- [ ] **Step 4: Register six source descriptors**

In `configuration-source.ts`, append six descriptors using the exact query builders and resource modes from Task 1.

Keep existing acquisition lifecycle untouched:

~~~text
context validation
→ descriptor resolution
→ build query
→ one requestGoogleAdsConfigurationRaw call
→ raw bytes artifact
→ existing Google API operational error mapping
~~~

- [ ] **Step 5: Run source test GREEN**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-configuration-source-test.sh
~~~

Expected:

~~~text
PASS GOOGLE-ADS-CONFIGURATION-SOURCE-001
~~~

- [ ] **Step 6: Run both focused contract regressions**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-conversion-configuration-contract-test.sh
bash tests/integration/google-api/run-google-ads-negatives-contract-test.sh
~~~

Expected: both PASS.

- [ ] **Step 7: Commit**

~~~bash
git add \
  src/main/sources/google-ads/configuration-normalizer.ts \
  src/main/sources/google-ads/configuration-source.ts \
  tests/integration/google-api/google-ads-configuration-source.integration.cjs

git commit -m "feat: collect Google Ads conversion configuration"
~~~

---

### Task 4: Validate conversion configuration and lock cardinality semantics

**Files:**
- Modify: `src/main/sources/google-ads/configuration-validator.ts`
- Modify: `tests/integration/google-api/google-ads-configuration-validation.integration.cjs`

**Interfaces:**
- Validator imports `normalizeGoogleAdsConfigurationRows` from `configuration-normalizer.ts`.
- Existing ownership/context/raw-envelope failure mapping stays unchanged.
- Five new multi-row datasets use normal empty-result `NO_DATA`.
- `CUSTOMER_CONVERSION_TRACKING_SETTINGS` requires exactly one normalized row.

- [ ] **Step 1: Write failing validation cases**

Add assertions:

~~~text
valid non-empty CONVERSION_ACTIONS
→ VALID

valid empty CONVERSION_ACTIONS
→ NO_DATA

valid empty CUSTOMER_CONVERSION_GOALS
→ NO_DATA

valid empty CONVERSION_GOAL_CAMPAIGN_CONFIGS
→ NO_DATA

valid empty CAMPAIGN_CONVERSION_GOALS
→ NO_DATA

valid empty CUSTOM_CONVERSION_GOALS
→ NO_DATA
~~~

For tracking settings:

~~~text
exactly one valid row
→ VALID

exactly one row with status NOT_CONVERSION_TRACKED
→ VALID

zero normalized rows
→ QUERY_MISMATCH

more than one normalized row
→ QUERY_MISMATCH
~~~

- [ ] **Step 2: Add malformed semantic validation cases**

Assert a SearchStream envelope that parses but contains a dataset-specific required-field mismatch becomes:

~~~text
QUERY_MISMATCH
~~~

Keep existing mappings intact:

~~~text
ownership mismatch          → INVALID_SCHEMA
invalid immutable context   → QUERY_MISMATCH
unreadable/non-JSON         → ERROR_NOT_DATA
malformed SearchStream      → INVALID_SCHEMA
~~~

- [ ] **Step 3: Run validation runner and observe RED**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-configuration-validation-test.sh
~~~

Expected: FAIL because validation still routes only through the Negatives adapter and has no tracking-settings cardinality rule.

- [ ] **Step 4: Switch validator to family-level dispatcher**

Replace the direct Negatives adapter import with:

~~~text
./configuration-normalizer
~~~

Do not change ownership, source-context, raw read, JSON parse, or SearchStream flattening behavior.

- [ ] **Step 5: Add tracking-settings cardinality branch**

After successful normalization:

~~~text
if dataset = CUSTOMER_CONVERSION_TRACKING_SETTINGS:
  length = 1 → VALID
  length = 0 → QUERY_MISMATCH
  length > 1 → QUERY_MISMATCH
~~~

Do not return `NO_DATA` for this dataset.

For every other configuration dataset preserve:

~~~text
0 rows → NO_DATA
1+ rows → VALID
~~~

- [ ] **Step 6: Run validation test GREEN**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-configuration-validation-test.sh
~~~

Expected:

~~~text
PASS GOOGLE-ADS-CONFIGURATION-VALIDATION-001
~~~

- [ ] **Step 7: Run Negatives gate regression**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-negatives-gate.sh
~~~

Expected:

~~~text
PASS GOOGLE-ADS-NEGATIVES-GATE-001
~~~

- [ ] **Step 8: Commit**

~~~bash
git add \
  src/main/sources/google-ads/configuration-validator.ts \
  tests/integration/google-api/google-ads-configuration-validation.integration.cjs

git commit -m "feat: validate Google Ads conversion configuration"
~~~

---

### Task 5: Extend production composition without creating a new connection boundary

**Files:**
- Modify: `src/main/app/production-collection-runtime.ts`
- Modify: `tests/integration/app/production-source-composition.integration.cjs`

**Interfaces:**
- Production source ID remains `google-ads-configuration`.
- Production dataset list becomes the full exact eleven-dataset `GOOGLE_ADS_CONFIGURATION_DATASET_TYPES`.
- Existing Google Ads Workspace connection/customer/OAuth runtime resolution is reused.
- Capabilities remain snapshot-oriented, especially `supports_custom_date_range: false`.

- [ ] **Step 1: Extend production composition test first**

Assert production registry exposes:

~~~text
google-ads-configuration
→ exactly 11 datasets
→ OFFICIAL_API
→ supports_custom_date_range = false
→ supports_api = true
~~~

Assert the existing Google Ads Workspace connection path is reused.

Assert no new connection type, credential key, or Developer Token requirement is introduced.

- [ ] **Step 2: Run production composition test and observe RED**

Run:

~~~bash
bash tests/integration/app/run-production-source-composition-test.sh
~~~

Expected: FAIL because production composition still exposes only the previous configuration dataset set.

- [ ] **Step 3: Make the minimum production registration change**

Update only the existing Google Ads configuration registration/composition path required to expose all eleven dataset IDs.

Do not modify Core lifecycle, persistence, renderer contracts, or credentials.

- [ ] **Step 4: Run production composition GREEN**

Run:

~~~bash
bash tests/integration/app/run-production-source-composition-test.sh
~~~

Expected:

~~~text
PASS PRODUCTION-SOURCE-COMPOSITION-001
~~~

- [ ] **Step 5: Run SEARCH reporting regression**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-search-reporting-gate.sh
~~~

Expected:

~~~text
PASS GOOGLE-ADS-SEARCH-REPORTING-GATE-001
~~~

with all six existing SEARCH reporting datasets still passing.

- [ ] **Step 6: Commit**

~~~bash
git add \
  src/main/app/production-collection-runtime.ts \
  tests/integration/app/production-source-composition.integration.cjs

git commit -m "feat: register Google Ads conversion configuration"
~~~

---

### Task 6: Add the focused gate, adopt canonical docs, and prove the slice

**Files:**
- Create: `tests/integration/google-api/run-google-ads-conversion-configuration-gate.sh`
- Modify: `DATA_CONTRACTS.md`
- Modify: `VALIDATION_SPEC.md`
- Modify: `PROJECT_HANDOFF.md`

**Interfaces:**
- Gate success marker is exactly `PASS GOOGLE-ADS-CONVERSION-CONFIGURATION-GATE-001`.
- `DATA_CONTRACTS.md` records provider-native persisted/normalized semantics.
- `VALIDATION_SPEC.md` records acceptance/null/NO_DATA/cardinality semantics.
- `PROJECT_HANDOFF.md` records only evidence actually observed at this checkpoint.

- [ ] **Step 1: Create the focused gate**

The gate runs in order:

~~~text
run-google-ads-conversion-configuration-contract-test.sh
run-google-ads-conversion-configuration-normalization-test.sh
run-google-ads-configuration-source-test.sh
run-google-ads-configuration-validation-test.sh
~~~

Only after all succeed print:

~~~text
PASS GOOGLE-ADS-CONVERSION-CONFIGURATION-GATE-001
~~~

- [ ] **Step 2: Run the new focused gate**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-conversion-configuration-gate.sh
~~~

Expected: all four component tests PASS and final gate marker appears.

- [ ] **Step 3: Run affected regressions**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-negatives-gate.sh
bash tests/integration/app/run-production-source-composition-test.sh
bash tests/integration/google-api/run-google-ads-search-reporting-gate.sh
~~~

Expected:

~~~text
PASS GOOGLE-ADS-NEGATIVES-GATE-001
PASS PRODUCTION-SOURCE-COMPOSITION-001
PASS GOOGLE-ADS-SEARCH-REPORTING-GATE-001
~~~

- [ ] **Step 4: Run static verification**

Run:

~~~bash
npx tsc --noEmit
npm run lint
git diff --check
~~~

Expected:

- TypeScript exit 0.
- ESLint exit 0; warnings may be reported separately but no errors.
- `git diff --check` produces no output.

If literal `npm run lint` reproduces the known nested-worktree ESLint-plugin duplication issue rather than a source lint error, verify literal lint in an isolated checkout exactly as the Negatives checkpoint did; do not change repository lint configuration merely to work around worktree ancestry.

- [ ] **Step 5: Adopt the contract in `DATA_CONTRACTS.md`**

Add a bounded section such as:

~~~text
Google Ads configuration — Conversion Configuration v1
~~~

Record:

- exact six dataset IDs and resources;
- full family eleven-dataset relationship;
- current snapshot / no date window;
- raw SearchStream authority;
- nullable optional evidence;
- `include_in_conversions_metric` legacy-evidence status;
- custom-goal membership semantics;
- no requested-to-observed fabrication;
- no effective-goal inference;
- no package/preset/export integration;
- existing Google Ads connection reuse.

- [ ] **Step 6: Adopt validation semantics in `VALIDATION_SPEC.md`**

Record:

- dataset/resource/context validation;
- five normal conversion datasets allow verified empty result as `NO_DATA`;
- tracking-settings requires exactly one row;
- `NOT_CONVERSION_TRACKED` with one row is valid evidence;
- malformed/mismatched evidence fails closed;
- operational errors remain separate;
- no live-provider claim is implied.

- [ ] **Step 7: Update `PROJECT_HANDOFF.md` only from observed evidence**

Record:

- branch `feat/google-ads-conversion-configuration-v1`;
- implementation checkpoint commits actually present;
- exact deterministic gates actually passed;
- no live provider call unless separately authorized and actually run;
- no packaged/runtime claim unless separately proven;
- next independent scope `09_CAMPAIGN_SETTINGS`;
- no push/merge claim unless actually performed.

- [ ] **Step 8: Re-run the final deterministic acceptance set after documentation changes**

Run:

~~~bash
bash tests/integration/google-api/run-google-ads-conversion-configuration-gate.sh
bash tests/integration/google-api/run-google-ads-negatives-gate.sh
bash tests/integration/app/run-production-source-composition-test.sh
bash tests/integration/google-api/run-google-ads-search-reporting-gate.sh
npx tsc --noEmit
npm run lint
git diff --check
~~~

Expected: same fresh passing evidence as Steps 2–4.

- [ ] **Step 9: Commit gate and canonical documentation**

~~~bash
git add \
  tests/integration/google-api/run-google-ads-conversion-configuration-gate.sh \
  DATA_CONTRACTS.md \
  VALIDATION_SPEC.md \
  PROJECT_HANDOFF.md

git commit -m "docs: record Google Ads conversion configuration contract"
~~~

- [ ] **Step 10: Final branch evidence**

Run:

~~~bash
git status --short
git log --oneline --decorate -8
~~~

Expected:

- tracked working tree clean;
- plan/spec and six implementation checkpoints visible;
- no statement that the branch was merged, pushed, packaged, or live-provider verified unless separate evidence exists.

---

## Execution Boundary

Implementation must stop if live repository evidence materially contradicts an approved contract rather than silently redesigning it.

No live Google Ads request is part of this plan.

No package/preset/workbook/export recipe change is part of this plan.

No effective optimization-goal inference is part of this plan.

No `09_CAMPAIGN_SETTINGS` implementation is part of this plan.
