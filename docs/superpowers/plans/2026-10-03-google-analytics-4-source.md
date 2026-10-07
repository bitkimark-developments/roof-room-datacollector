# Google Analytics 4 Source v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one `google-analytics-4` OFFICIAL_API source with independently collected and validated `GA4_CONTENT_PERFORMANCE` and `GA4_PAID_FUNNEL` evidence.

**Architecture:** Reuse RoofRoom’s existing privileged Google OAuth application/credential infrastructure, but create a dedicated Workspace source connection for GA4 with `property_id` safe metadata and `analytics.readonly` scope. Keep GA4 request construction, raw-page preservation, parsing/normalization, semantic validation, readiness, and dataset semantics inside the GA4/source boundary; register the result through existing source-neutral Core/runtime/desktop composition.

**Tech Stack:** TypeScript, Electron main process, existing RoofRoom source/Core interfaces, Google Analytics Data API v1beta `properties.runReport`, existing Google OAuth/credential store, deterministic shell/TypeScript integration tests.

**Spec:** `docs/superpowers/specs/2026-10-03-google-analytics-4-source-design.md`

## Global Constraints

- Start execution by reading current `PROJECT_HANDOFF.md`, root/scoped `AGENTS.md`, `.agent/PLANS.md`, and this spec/plan. Live repository evidence overrides stale path assumptions.
- Preserve the existing unrelated checkout/WIP. At design time the observed checkout was `fix/google-ads-reporting-metrics` at `fdf2dc9`, while `main`/`origin/main` were `2568d2a`, with untracked `src/main/sources/google-ads/configuration-normalizer.ts`.
- Create an isolated clean worktree from the then-current verified `main` using `superpowers:using-git-worktrees`; do not stash/reset/delete unrelated WIP.
- Source ID: `google-analytics-4`.
- Acquisition mode: `OFFICIAL_API`.
- Dataset types: `GA4_CONTENT_PERFORMANCE`, `GA4_PAID_FUNNEL`.
- OAuth scope: `https://www.googleapis.com/auth/analytics.readonly`.
- Workspace safe metadata stores digits-only `property_id`; no API key, no Measurement ID, no hard-coded Bitkimark Property ID.
- Provider endpoint: Google Analytics Data API v1beta `POST /v1beta/properties/{property_id}:runReport`.
- Do not add Google Analytics Admin API, Realtime API, Funnel API, BigQuery, Measurement Protocol writes, custom dimensions/metrics, arbitrary query UI, Ads↔GA4 joins, analysis, scoring, recommendations, or package recipes.
- `GA4_CONTENT_PERFORMANCE` requires explicit absolute dates and uses `landingPage` plus the locked session/engagement/ecommerce metrics from the spec.
- `GA4_PAID_FUNNEL` requires explicit absolute dates and exact provider filter `sessionSource == "google" AND sessionMedium == "cpc"`.
- Missing is not zero. Preserve provider `(not set)` text. Never infer campaign, page, date, metric, property, timezone, or currency evidence.
- Preserve raw provider evidence for every pagination page within the Attempt. Retries create/preserve Attempts according to existing Core behavior; no hidden provider retry.
- `runReport` pagination uses deterministic `limit=250000` with offset progression.
- Verified `NO_DATA` requires a successful exact request with provider `rowCount == 0` and no rows.
- Normal automated tests must not call live GA4.
- Deterministic completion, packaged/runtime verification, feasibility, and live-provider acceptance are separate evidence claims.
- Do not broaden provider-specific GA4 semantics into generic Core abstractions.

## File Structure

### New source/shared files

- `src/shared/google-analytics-4.ts` — source/dataset constants, persisted request-context types, normalized row types, raw bundle schema types.
- `src/main/sources/google-analytics-4/google-analytics-4-request.ts` — locked Data API query construction, exact source/medium filter, pagination requests, raw page bundle acquisition.
- `src/main/sources/google-api/api-helpers.ts` — extend the existing HTTP response contract with an optional/raw response text field populated before JSON parsing so GA4 can preserve exact provider bodies without replacing parsed-body behavior used by existing sources.
- `src/main/sources/google-analytics-4/google-analytics-4-parser.ts` — response/header parsing and deterministic normalization.
- `src/main/sources/google-analytics-4/google-analytics-4-source.ts` — `DataSourceModule`/collecting source dispatch by dataset type.
- `src/main/sources/google-analytics-4/google-analytics-4-validator.ts` — source-specific raw bundle, header, pagination, semantic, and no-data validation.

### Existing files expected to change

- `src/main/sources/google-api/google-oauth-credential-acquirer.ts` — add Analytics scope and explicit per-source scope mapping.
- `src/main/sources/google-api/google-auth.ts` — re-export Analytics scope if existing import conventions require it.
- `src/main/sources/google-api/google-api-runtime.ts` — construct GA4 source with authenticated requester and validated `property_id`.
- `src/shared/workspace-connection-management.ts` — add GA4 Google connection ID and metadata intent.
- `src/shared/desktop-multisource.ts` — include GA4 in supported/credential-managed source identities/config shape.
- `src/main/app/workspace-connection-management-service.ts` — connect/reconnect/readiness handling for the dedicated GA4 credential and property metadata; do not fold GA4 into Ads/KWP sibling reuse.
- `src/main/app/production-collection-runtime.ts` — register GA4 source and validator.
- `src/main/app/desktop-multisource-controller.ts` — plan/review source jobs using explicit resolved absolute dates.
- Renderer/preload files that currently render source cards and connection metadata — add only the smallest GA4 Property ID/connect/reconnect surface after locating the existing GSC/Ads patterns at execution time.
- `package.json` — add focused deterministic GA4 test gate only if that matches the current repository test-script convention.
- `DATA_CONTRACTS.md` — add stable GA4 source/dataset/provenance/null semantics.
- `VALIDATION_SPEC.md` — add GA4 acceptance/no-data/header/pagination semantics.
- `SOURCE_MODULE_GUIDE.md` only if a reusable source-onboarding rule genuinely changes; otherwise do not edit it.
- `PROJECT_HANDOFF.md` only after implementation/verification evidence exists.

### New deterministic test area

Use repository-native conventions discovered at execution time. The intended ownership is:

- `tests/integration/google-analytics-4/run-google-analytics-4-gate.sh contract`
- `tests/integration/google-analytics-4/google-analytics-4-contract.test.ts`
- `tests/integration/google-analytics-4/run-google-analytics-4-gate.sh request`
- `tests/integration/google-analytics-4/google-analytics-4-request.test.ts`
- `tests/integration/google-analytics-4/run-google-analytics-4-gate.sh validation`
- `tests/integration/google-analytics-4/google-analytics-4-validation.test.ts`
- `tests/integration/google-analytics-4/run-google-analytics-4-gate.sh desktop`
- `tests/integration/google-analytics-4/google-analytics-4-desktop.test.ts`

If the live repository has a materially different adjacent test naming/runner convention, preserve that convention while keeping the task/test boundaries below unchanged.

## Review Focus

1. **Previously-authorized Google credential lacking Analytics scope** — GA4 must surface reauthorization/configuration-required behavior without breaking or silently rewriting GSC/Ads/KWP credentials. Pin in Task 2.
2. **GA4 property ID with spaces/prefix/non-digits** — whitespace may normalize; `properties/123` or non-digits must fail safe metadata validation rather than reaching provider construction. Pin in Task 2.
3. **Pagination interrupted after one or more successful pages** — preserved partial raw evidence must not be accepted as a complete dataset. Pin in Tasks 3 and 5.
4. **Provider returns `(not set)`, empty values, zero metrics, or malformed numeric/date values** — keep provider strings, distinguish true zero from missing, and fail closed on impossible typed values. Pin in Task 4.
5. **Provider schema drift/header reordering** — exact dataset header contract must reject unexpected/missing/reordered dimensions or metrics rather than normalize by assumption. Pin in Task 5.

---

### Task 1: Lock the shared GA4 contract and source identity

**Files:**
- Create: `src/shared/google-analytics-4.ts`
- Modify: `src/shared/workspace-connection-management.ts`
- Modify: `src/shared/desktop-multisource.ts`
- Test: `tests/integration/google-analytics-4/google-analytics-4-contract.test.ts`
- Test runner: `tests/integration/google-analytics-4/run-google-analytics-4-gate.sh contract`

**Interfaces:**
- Consumes: existing source ID/dataset/request-context patterns from adjacent Google source shared contracts.
- Produces:
  - `GOOGLE_ANALYTICS_4_SOURCE_ID = 'google-analytics-4'`
  - `GA4_DATASET_TYPES = ['GA4_CONTENT_PERFORMANCE', 'GA4_PAID_FUNNEL'] as const`
  - `GoogleAnalytics4DatasetType`
  - `GoogleAnalytics4ConnectionMetadata { property_id: string }`
  - explicit request-context types containing dataset type and absolute `start_date`/`end_date`
  - normalized row/raw bundle types needed by Tasks 3–5
  - GA4 included in desktop-supported and Google-connection source IDs.

- [ ] **Step 1: Write the failing shared-contract test**

Assert:
- source ID exact value;
- exactly two approved dataset types;
- GA4 is a supported desktop/credential-managed Google connection;
- metadata accepts canonical property string type only at the shared type boundary;
- no API-key/Measurement-ID field exists in the GA4 metadata contract.

- [ ] **Step 2: Run the focused contract test and verify RED**

Run the new repository-native shell runner directly.

Expected: FAIL because GA4 shared contract/source identity does not exist.

- [ ] **Step 3: Implement the minimal shared types/constants**

Keep dataset/source naming exact. Do not add package recipe types or generic analytics abstractions.

- [ ] **Step 4: Run the contract test and TypeScript check**

Run:
```bash
bash tests/integration/google-analytics-4/run-google-analytics-4-gate.sh contract
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/google-analytics-4.ts src/shared/workspace-connection-management.ts src/shared/desktop-multisource.ts tests/integration/google-analytics-4
git commit -m "feat: define Google Analytics 4 source contract"
```

---

### Task 2: Add GA4 OAuth scope, property metadata, and dedicated Workspace connection behavior

**Files:**
- Modify: `src/main/sources/google-api/google-oauth-credential-acquirer.ts`
- Modify: `src/main/sources/google-api/google-auth.ts`
- Modify: `src/main/app/workspace-connection-management-service.ts`
- Modify: `src/main/sources/google-api/google-api-readiness.ts` only if the live readiness pattern requires source-specific metadata there.
- Test: extend the existing Google OAuth credential-acquirer integration test.
- Test: `tests/integration/google-analytics-4/google-analytics-4-contract.test.ts`

**Interfaces:**
- Consumes: `GOOGLE_ANALYTICS_4_SOURCE_ID`, `GoogleAnalytics4ConnectionMetadata`.
- Produces:
  - `GOOGLE_ANALYTICS_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'`
  - explicit `requiredScopesForSource(sourceId)` behavior:
    - GSC → webmasters readonly
    - Ads/KWP → adwords
    - GA4 → analytics readonly
  - property metadata normalization/validation returning canonical digits-only `property_id`
  - dedicated connect/reconnect behavior with no Ads/KWP sibling-credential reuse.

- [ ] **Step 1: Add failing OAuth routing tests**

Assertions:
- GA4 requests only `analytics.readonly`;
- GSC scope remains unchanged;
- Ads/KWP scope remains unchanged;
- no unknown Google source silently falls through to Ads scope.

- [ ] **Step 2: Add failing connection metadata tests**

Cases:
- `" 123456789 "` → stored `"123456789"`;
- `""`, `"properties/123456789"`, `"G-ABC"`, `"12-34"`, `"abc"` → rejected;
- existing credential without Analytics scope → incompatible/reauthorization-required;
- connecting GA4 does not rebind Ads/KWP credential refs;
- reconnecting GA4 updates only GA4 unless a future explicit unification contract exists.

- [ ] **Step 3: Run focused OAuth/connection tests and verify RED**

Run:
```bash
bash tests/integration/google-api/run-google-oauth-credential-acquirer-test.sh
bash tests/integration/google-analytics-4/run-google-analytics-4-gate.sh contract
```

Expected: new GA4 assertions FAIL.

- [ ] **Step 4: Implement explicit source→scope routing and metadata handling**

Replace the current implicit GSC-vs-else scope branch with exhaustive explicit routing. Reuse the existing Google OAuth app/client configuration and credential store.

- [ ] **Step 5: Run focused tests plus typecheck**

Expected: all focused tests PASS; `npx tsc --noEmit` PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/sources/google-api src/main/app/workspace-connection-management-service.ts src/shared tests/integration/google-api tests/integration/google-analytics-4
git commit -m "feat: connect Google Analytics 4 workspaces"
```

---

### Task 3: Build locked GA4 requests, deterministic pagination, and raw evidence bundling

**Files:**
- Create: `src/main/sources/google-analytics-4/google-analytics-4-request.ts`
- Test: `tests/integration/google-analytics-4/google-analytics-4-request.test.ts`
- Test runner: `tests/integration/google-analytics-4/run-google-analytics-4-gate.sh request`
- Modify: `src/main/sources/google-api/api-helpers.ts`

**Interfaces:**
- Consumes:
  - GA4 dataset/request-context types;
  - authenticated `ApiRequester`;
  - canonical `property_id`.
- Produces:
  - `buildGoogleAnalytics4RunReportRequest(context)` returning exact URL/method/body;
  - `collectGoogleAnalytics4RawBundle(input)` returning one bundle containing request provenance plus every preserved provider page;
  - `ApiResponse.raw_body_text` (or the exact existing response type name) populated by `createFetchApiRequester` from the network response before JSON parsing while keeping the existing parsed `body`;
  - pagination limit exactly `250000`;
  - no retry loop beyond pagination itself.

- [ ] **Step 1: Write failing request-shape tests for `GA4_CONTENT_PERFORMANCE`**

Assert exact:
- `POST https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport`;
- absolute date range;
- dimensions `[landingPage]`;
- metrics `[activeUsers, sessions, engagedSessions, engagementRate, keyEvents, itemViewEvents, addToCarts, checkouts, ecommercePurchases, transactions, purchaseRevenue]`;
- `limit: 250000`;
- initial offset `0`.

- [ ] **Step 2: Write failing request-shape tests for `GA4_PAID_FUNNEL`**

Assert exact dimensions/metrics from spec and exact AND dimension filter:
- `sessionSource == "google"`
- `sessionMedium == "cpc"`

- [ ] **Step 3: Write failing pagination/raw preservation tests**

Cases:
- one page;
- multiple pages use offsets `0`, `250000`, `500000`, etc.;
- stop only when provider `rowCount` coverage is complete;
- earlier raw responses remain in bundle;
- network/provider failure after page N retains the Attempt’s already-preserved raw-page evidence but does not return a complete accepted bundle;
- no hidden retry after a quota/network/provider failure.

- [ ] **Step 4: Run request tests and verify RED**

Run the request test runner.

Expected: FAIL because requester/bundle implementation does not exist.

- [ ] **Step 5: Extend the existing HTTP response contract for raw preservation**

In `src/main/sources/google-api/api-helpers.ts`, preserve the provider response text before JSON parsing and expose it alongside the existing parsed `body`. Existing callers continue reading `body`; GA4 stores the exact raw text from the new field. Add/extend the adjacent Google API transport test to prove parsed-body behavior is unchanged.

- [ ] **Step 6: Implement minimal request builder and pagination collector**

Use the existing authenticated requester and the raw-text response field. Store every page’s exact raw response text in the GA4 bundle together with offset/request provenance. Do not reserialize parsed JSON as raw evidence.

- [ ] **Step 7: Run request tests, adjacent Google API transport tests, and typecheck**

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/sources/google-analytics-4 src/main/sources/google-api/api-helpers.ts tests/integration/google-analytics-4
git commit -m "feat: acquire Google Analytics 4 report evidence"
```

---

### Task 4: Parse and normalize GA4 provider evidence without inventing values

**Files:**
- Create: `src/main/sources/google-analytics-4/google-analytics-4-parser.ts`
- Extend: `tests/integration/google-analytics-4/google-analytics-4-request.test.ts` or create parser-focused test according to live test convention.

**Interfaces:**
- Consumes: decoded preserved provider page bodies plus locked dataset type.
- Produces:
  - `normalizeGoogleAnalytics4Rows(datasetType, bundle)` returning typed normalized rows and preserved provider metadata;
  - deterministic `YYYYMMDD` → `YYYY-MM-DD`;
  - numeric parsers that distinguish zero from missing/invalid.

- [ ] **Step 1: Write failing content normalization tests**

Cases:
- normal row;
- `"0"` remains numeric zero;
- decimal `purchaseRevenue`;
- `(not set)` landing page preserved;
- missing metric value is not converted to zero;
- provider currency/timezone preserved only when returned.

- [ ] **Step 2: Write failing paid-funnel normalization tests**

Cases:
- valid `20261003` → `2026-10-03`;
- invalid calendar date rejected;
- campaign ID/name `(not set)` preserved;
- source/medium preserved exactly;
- no Ads-side enrichment;
- empty/unparseable numeric values do not become zero.

- [ ] **Step 3: Run parser tests and verify RED**

Expected: FAIL because parser does not exist.

- [ ] **Step 4: Implement header-driven normalization**

Map values by the validated provider headers; do not positionally assume a schema before checking headers. Keep raw evidence separate from normalized output.

- [ ] **Step 5: Run parser/request tests and typecheck**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/sources/google-analytics-4 tests/integration/google-analytics-4
git commit -m "feat: normalize Google Analytics 4 evidence"
```

---

### Task 5: Add GA4-specific semantic validation and verified no-data behavior

**Files:**
- Create: `src/main/sources/google-analytics-4/google-analytics-4-validator.ts`
- Test: `tests/integration/google-analytics-4/google-analytics-4-validation.test.ts`
- Test runner: `tests/integration/google-analytics-4/run-google-analytics-4-gate.sh validation`

**Interfaces:**
- Consumes: Job/Attempt/artifact context, GA4 raw bundle, dataset type.
- Produces: existing `CollectionValidator` result with fail-closed GA4 semantics.

- [ ] **Step 1: Write failing happy-path validation tests for both datasets**

Assert accepted evidence requires exact source/dataset/acquisition ownership, request dates/property context, headers, row widths, pagination completeness, and valid typed metric/date values.

- [ ] **Step 2: Write failing Review Focus schema/pagination tests**

Cases:
- reordered/missing/extra dimension header → reject;
- reordered/missing/extra metric header → reject;
- row width mismatch → reject;
- offset gap/overlap/duplicate page → reject;
- interrupted/incomplete page coverage → reject.

- [ ] **Step 3: Write failing no-data tests**

Accept verified no-data only when exact successful request has `rowCount == 0` and no rows.

Reject treating auth failure, property failure, quota failure, malformed JSON, incomplete pagination, or all-zero rows as no-data.

- [ ] **Step 4: Write failing error-classification tests**

Pin:
- malformed successful JSON/structure → repository-standard `INVALID_SCHEMA`;
- request/response semantic mismatch → `QUERY_MISMATCH`;
- unreadable/not-data successful payload → `ERROR_NOT_DATA`;
- network/auth/quota/provider failures remain operational rather than semantic validation.

- [ ] **Step 5: Run validation tests and verify RED**

Expected: FAIL.

- [ ] **Step 6: Implement validator minimally**

Do not move GA4-specific header/filter/date semantics into generic Core.

- [ ] **Step 7: Run all GA4 source tests plus typecheck**

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/sources/google-analytics-4 tests/integration/google-analytics-4
git commit -m "feat: validate Google Analytics 4 evidence"
```

---

### Task 6: Implement the GA4 source module and Google API runtime composition

**Files:**
- Create: `src/main/sources/google-analytics-4/google-analytics-4-source.ts`
- Modify: `src/main/sources/google-api/google-api-runtime.ts`
- Modify: `src/main/app/production-collection-runtime.ts`
- Test: extend GA4 contract/validation tests with registry/runtime composition.

**Interfaces:**
- Consumes Tasks 1–5.
- Produces:
  - `GoogleAnalytics4Source` implementing the existing collecting source interface;
  - dataset dispatch to locked request/normalize behavior;
  - `GoogleApiRuntimeFactory.createGoogleAnalytics4Source({ workspace_id })`;
  - runtime registration of one source and one GA4 validator.

- [ ] **Step 1: Write failing runtime/source tests**

Assert:
- source ID/datasets/acquisition mode;
- Workspace GA4 connection is required;
- numeric property metadata required;
- OAuth credential ref required;
- both dataset types dispatch;
- unknown dataset rejected;
- source/validator registry contains GA4 exactly once.

- [ ] **Step 2: Run focused runtime tests and verify RED**

Expected: FAIL.

- [ ] **Step 3: Implement source/runtime registration**

Use authenticated requester construction already owned by Google API runtime. Keep GA4 provider query semantics in the GA4 source files.

- [ ] **Step 4: Run focused tests, production source composition regression, and typecheck**

Run the current repository’s production-composition gate plus GA4 tests.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/sources/google-analytics-4 src/main/sources/google-api/google-api-runtime.ts src/main/app/production-collection-runtime.ts tests/integration/google-analytics-4
git commit -m "feat: register Google Analytics 4 source"
```

---

### Task 7: Add desktop configuration, review, and Job planning

**Files:**
- Modify: `src/main/app/desktop-multisource-controller.ts`
- Modify: current renderer/preload source-card/config files discovered from the existing GSC/Ads implementation.
- Modify: connection IPC/types only where the existing GA4 `GoogleConnectionMetadataIntent` requires propagation.
- Test: `tests/integration/google-analytics-4/google-analytics-4-desktop.test.ts`
- Test runner: `tests/integration/google-analytics-4/run-google-analytics-4-gate.sh desktop`

**Interfaces:**
- Consumes: GA4 connection metadata and dataset request-context types.
- Produces:
  - desktop source card `Google Analytics 4`;
  - Property ID field;
  - Connect Google / Reconnect Google action;
  - dataset inclusion/configuration for both datasets;
  - Job plans with explicit resolved absolute dates.

- [ ] **Step 1: Write failing desktop connection/readiness tests**

Assert:
- Property ID visible as safe config;
- no API Key/Measurement ID field;
- missing property or Analytics-compatible credential blocks selected GA4 source;
- renderer does not receive refresh token/client secret.

- [ ] **Step 2: Write failing Job planning tests**

Assert:
- content Job carries exact `GA4_CONTENT_PERFORMANCE`, start/end;
- paid Job carries exact `GA4_PAID_FUNNEL`, start/end and locked filter semantics via source context;
- `query_group_id` remains `null`;
- no relative date string is persisted as observed/requested date evidence;
- GA4 can coexist in a multi-source Run without provider-specific Core changes.

- [ ] **Step 3: Run desktop tests and verify RED**

Expected: FAIL.

- [ ] **Step 4: Implement the smallest desktop/UI/controller changes**

Mirror existing source-card/config patterns. Do not add Admin API property discovery.

- [ ] **Step 5: Run GA4 desktop tests plus existing multi-source/connection regression gates**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/app src/shared src/renderer src/preload tests/integration/google-analytics-4
git commit -m "feat: add Google Analytics 4 desktop flow"
```

Adjust `src/renderer`/`src/preload` add paths to the actual files touched; do not stage unrelated files.

---

### Task 8: Lock canonical data/validation documentation and deterministic release gate

**Files:**
- Modify: `DATA_CONTRACTS.md`
- Modify: `VALIDATION_SPEC.md`
- Modify: `PROJECT_HANDOFF.md` only after fresh verification
- Modify: `package.json` if a focused GA4 gate is added
- Test: all GA4 deterministic gates plus directly affected Google/source composition regressions.

**Interfaces:**
- Consumes: implemented verified behavior.
- Produces: canonical documentation matching observed code/tests; one repeatable deterministic GA4 gate.

- [ ] **Step 1: Update `DATA_CONTRACTS.md`**

Record:
- source identity/datasets;
- request context;
- normalized rows;
- null/zero semantics;
- property/requested-vs-observed provenance;
- raw pagination bundle semantics.

Do not document unimplemented package inclusion.

- [ ] **Step 2: Update `VALIDATION_SPEC.md`**

Record:
- exact headers;
- pagination completeness;
- dataset semantic checks;
- verified no-data;
- operational-vs-semantic failure boundary.

- [ ] **Step 3: Run fresh deterministic verification**

Minimum:
```bash
bash tests/integration/google-api/run-google-oauth-credential-acquirer-test.sh
bash tests/integration/google-analytics-4/run-google-analytics-4-gate.sh contract
bash tests/integration/google-analytics-4/run-google-analytics-4-gate.sh request
bash tests/integration/google-analytics-4/run-google-analytics-4-gate.sh validation
bash tests/integration/google-analytics-4/run-google-analytics-4-gate.sh desktop
npx tsc --noEmit
git diff --check
```

Also run the repository’s current directly affected:
- workspace connection management gate;
- production source composition gate;
- multi-source desktop controller gate;
- Google Search Console regression;
- Google Ads/Keyword Planner OAuth/readiness regression.

Expected: all PASS.

- [ ] **Step 4: Run isolated lint for changed TypeScript files**

Use the repository’s existing ESLint command/config against only the touched TS/TSX files.

Expected: PASS.

- [ ] **Step 5: Update `PROJECT_HANDOFF.md` with exact evidence level**

State only what fresh output proves:
- implemented;
- deterministically verified;
- whether packaged/runtime verified;
- live GA4 acceptance still pending unless Task 9 is explicitly run.

- [ ] **Step 6: Commit documentation/checkpoint**

```bash
git add DATA_CONTRACTS.md VALIDATION_SPEC.md PROJECT_HANDOFF.md package.json
git commit -m "docs: record Google Analytics 4 source contract"
```

Omit unchanged files from staging.

---

### Task 9: Optional bounded live-provider acceptance after deterministic completion

**Files:**
- Create or extend a GA4 live smoke entrypoint only if current repository conventions require one.
- Do not add live-provider behavior to ordinary tests.

**Interfaces:**
- Consumes: completed deterministic source + user-enabled Data API + real Workspace Property ID/credential.
- Produces: live acceptance evidence only; it must not alter the deterministic implementation contract.

- [ ] **Step 1: Require explicit live-acceptance confirmation**

Reuse the repository’s existing Google live-acceptance safety gate/pattern. Do not run from CI/ordinary tests.

- [ ] **Step 2: Run one bounded content report**

Use a small explicit date range and the configured Workspace property.

Verify only:
- OAuth/property access;
- provider accepts locked dimensions/metrics;
- returned headers/types match;
- raw evidence is preserved.

Do not print or commit sensitive/business row values unnecessarily.

- [ ] **Step 3: Run one bounded paid-funnel report**

Same constraints; prove exact locked dimensions/metrics/filter are accepted.

- [ ] **Step 4: Record live result separately**

If both succeed, handoff may state **live-provider verified** for the bounded GA4 query contract.

If not run or blocked, leave status as deterministically verified only.

Do not weaken validation/query contracts merely to force live acceptance.

---

## Execution Preflight

Before Task 1 implementation:

1. Invoke `superpowers:using-git-worktrees`.
2. Read live `.agent/PLANS.md` and reconcile this plan if it imposes stricter checkpoint/staging rules.
3. Re-read current `PROJECT_HANDOFF.md` only once to detect state changes since design.
4. Confirm `main`/`origin/main` base and preserve the unrelated existing checkout.
5. Create the isolated GA4 worktree/branch.
6. Run the smallest baseline gates needed to prove the new worktree starts healthy.
7. Begin Task 1 with RED test first.

If current repository evidence materially invalidates an interface/path assumed above, update this plan before writing production code; do not silently generalize or work around the mismatch.

## Final Verification Boundary

A successful implementation can claim **deterministically verified** only after all Task 8 gates pass from fresh output.

Do not claim:
- packaged/runtime verification unless an actual packaged/runtime gate was run;
- live-provider verification unless Task 9 was explicitly authorized and passed;
- Blog or Ads Growth downstream completeness merely because GA4 source collection exists;
- package inclusion unless a separate approved package-composition task implements it.
