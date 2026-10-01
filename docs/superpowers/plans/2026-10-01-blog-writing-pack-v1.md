# BLOG_WRITING_PACK v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an immutable, single-Run `BLOG_WRITING_PACK v1` that packages already accepted RoofRoom evidence into a provenance-preserving XLSX plus generic evidence files, and exposes local Build/Open/Reveal actions from Run Detail without acquisition or analysis.

**Architecture:** Add a thin Blog-specific layer over the existing `ProductionDataPackageLoader` and generalized Data Package. A Blog assembler filters one Run through the locked recipe and computes Job-level coverage; a workbook exporter renders the fixed v1 sheets; a dedicated filesystem store publishes immutable snapshots under `<ApplicationDirectories.data>/blog-writing-packs/<package_id>/` through private staging and atomic rename. Desktop integration stays separate from the Ads-shaped Task Package subsystem and accepts only trusted Run/package identities across IPC.

**Tech Stack:** TypeScript, Electron, React, Node filesystem APIs, `write-excel-file`, existing Data Package/Core contracts, deterministic CJS integration tests and shell gates.

**Spec:** `docs/superpowers/specs/2026-10-01-blog-writing-pack-v1-design.md`

## Global Constraints

- Recipe ID is exactly `BLOG_WRITING_PACK`; recipe version is exactly `1`.
- Use evidence from exactly one existing Run. No cross-Run merge or evidence reuse in v1.
- Building is local-only: no provider call, retry, recollection, credential mutation, Run/Job transition, or Attempt creation.
- Zero eligible accepted in-recipe Jobs => `NOT_READY`, no package.
- At least one eligible accepted in-recipe Job permits publication.
- Overall package coverage is `COMPLETE` only when every logical Blog dataset family is `COVERED`; otherwise a published package is `PARTIAL`.
- Every explicit successful build creates a new immutable `package_id`; prior snapshots remain untouched.
- Do not add a Blog package SQLite table or schema migration.
- Canonical package root is `<ApplicationDirectories.data>/blog-writing-packs/`.
- Provider raw artifacts remain in canonical Run storage and are not copied into Blog packages.
- Only Core-eligible accepted/accepted-with-warning evidence enters normal Blog output.
- `NO_DATA` is a verified provider outcome, never an auth/quota/schema/parse/missing-Job/failure substitute.
- Missing values remain `null` / empty cells; real numeric zero remains numeric zero.
- Google Trends remains relative interest and must preserve `query_group_id`.
- Keyword Planner API and manual CSV remain provenance-distinct; preserve both if both are accepted in one Run.
- Blog v1 excludes GSC `QUERY` and the six-dataset `google-ads-search-reporting` family.
- No scoring, intent classification, SEO/ad recommendations, calculated marketing KPIs, or commercial decisions.
- Preserve generic `MANIFEST.json`; add Blog-specific `BLOG_PACKAGE.json`.
- Renderer never receives arbitrary absolute paths, raw provider bodies, tokens, secrets, credentials, or unrestricted requested context.
- Never modify/stage/delete/commit `CODEX_HANDOFF_CURRENT.md` or `PROJECT_HANDOFF.pre-20260820.md`.
- Ordinary tests and release gate make no live-provider requests.
- Implementation uses Ponytail FULL by default.
- Every production behavior follows RED -> minimal GREEN -> focused regression -> commit.
- Before completion run `@ponytail-review`, then a separate correctness review over the full implementation diff.
- After reviews, rerun focused Blog gates, adjacent regressions, lint/typecheck, full release gate, packaging, and safe packaged acceptance.
- Update `PROJECT_HANDOFF.md` only from verification that actually ran.

## Review Focus

1. Accepted out-of-recipe Jobs in the same Run must not enter Blog datasets, workbook sheets, coverage, or Blog failures.
2. Mixed sibling outcomes in one logical family must preserve accepted sibling rows while forcing the family/package to `PARTIAL`.
3. Accepted Keyword Planner API + manual CSV evidence must both survive with distinct provenance.
4. Traversal IDs, manifest mismatch, symlink/escaped workbook, corrupt XLSX, collisions, and incomplete staging must fail closed.
5. Repeated builds of the same Run must publish independent immutable snapshots under different package IDs.

---

### Task 1: Split Base Data Package Evidence Writing From Keyword Planner User Exports

**Files:**
- Modify: `src/main/export/data-package-exporter.ts`
- Modify: `tests/integration/export/data-package-exporter.integration.cjs`
- Verify: `tests/integration/export/run-data-package-exporter-test.sh`

**Interfaces:**
- Produces: `writeDataPackageEvidence(directory: string, dataPackage: DataPackage): Promise<string>`
- Preserves: `writeDataPackage(directory: string, dataPackage: DataPackage): Promise<string>`
- Blog callers use only `writeDataPackageEvidence()`.

- [ ] **Step 1: Write the failing test**

Assert `writeDataPackageEvidence()` writes `MANIFEST.json`, `FAILURES.json`, `DATASETS.json`, and collision-safe dataset JSON files but no Keyword Planner CSV/XLSX user exports. Retain an assertion that `writeDataPackage()` still emits the existing KWP user exports.

- [ ] **Step 2: Run RED**

```bash
bash tests/integration/export/run-data-package-exporter-test.sh
```

Expected: FAIL because `writeDataPackageEvidence` does not exist.

- [ ] **Step 3: Implement the minimal split**

Add the exact signature above. Move only generic evidence-file writing into it. Keep `writeDataPackage()` as compatibility wrapper: base evidence writer, then `writeKeywordPlannerUserExport()`.

- [ ] **Step 4: Verify**

```bash
bash tests/integration/export/run-data-package-exporter-test.sh
bash tests/integration/export/run-production-data-package-loader-test.sh
npm run lint
npx tsc --noEmit
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add src/main/export/data-package-exporter.ts tests/integration/export/data-package-exporter.integration.cjs
git commit -m "refactor: split base data package evidence writer"
```

---

### Task 2: Add Blog Recipe, Manifest Contract, and Single-Run Coverage Assembler

**Files:**
- Create: `src/shared/blog-writing-pack.ts`
- Create: `src/main/blog-writing-packs/blog-writing-pack-recipe.ts`
- Create: `src/main/blog-writing-packs/blog-writing-pack-assembler.ts`
- Create: `tests/integration/blog-writing-packs/blog-writing-pack-assembler.integration.cjs`
- Create: `tests/integration/blog-writing-packs/run-blog-writing-pack-assembler-test.sh`

**Interfaces:**
- Constants: `BLOG_WRITING_PACK_RECIPE_ID = 'BLOG_WRITING_PACK'`, version `1`, workbook `BLOG_WRITING_PACK.xlsx`.
- Logical families: `INTEREST_OVER_TIME`, `QUERY_PAGE`, `SEARCH_TERMS`, `KEYWORD_HISTORICAL_METRICS`, `PRODUCTS`, `SITEMAP_URLS`, `GOOGLE_SERP`.
- Entry point:

```ts
export const assembleBlogWritingPack = (input: {
  package_id: string;
  created_at: string;
  application_version: string;
  run: RunRecord;
  jobs: readonly JobRecord[];
  datasets: readonly DataPackageInputDataset[];
}): BlogWritingPackAssemblyResult
```

**Locked mapping:**

```text
google-trends                    -> INTEREST_OVER_TIME
google-search-console-query-page -> QUERY_PAGE
google-ads-search-terms          -> SEARCH_TERMS
google-keyword-planner           -> KEYWORD_HISTORICAL_METRICS
google-keyword-planner-csv       -> KEYWORD_HISTORICAL_METRICS
ikas-products                    -> PRODUCTS
bitkimark-sitemap                -> SITEMAP_URLS
serpapi                          -> GOOGLE_SERP
```

- [ ] **Step 1: Write RED recipe-filter tests**

Assert exact mapping. Accepted GSC `QUERY` and accepted `google-ads-search-reporting` Jobs in the same Run are excluded. In-recipe source + unexpected dataset type fails closed.

- [ ] **Step 2: Write RED coverage tests**

Cover: all seven covered -> `COMPLETE`; at least one accepted + missing families -> `PARTIAL`; zero accepted -> `NOT_READY`; GT01..GT04 accepted + GT05 failed -> GT family `PARTIAL`; accepted `NO_DATA` creates no fake rows; KWP API + CSV both preserved.

Each family exposes:

```ts
status: 'COVERED' | 'PARTIAL' | 'MISSING'
total_jobs: number
accepted_jobs: number
no_data_jobs: number
incomplete_jobs: number
```

- [ ] **Step 3: Write RED identity tests**

Reject accepted Job with no matching loaded dataset, duplicate dataset for one Job, dataset job/source/key mismatch, and source-to-dataset mismatch. Never invent synthetic Jobs or failure rows for absent families.

- [ ] **Step 4: Run RED**

```bash
bash tests/integration/blog-writing-packs/run-blog-writing-pack-assembler-test.sh
```

- [ ] **Step 5: Implement pure assembler**

Filter to the Blog recipe before generalized Data Package logic. Build generalized package in `ALL` mode from only in-recipe evidence. Manifest fields must match the approved spec: package/run/workspace identity, coverage arrays, `coverage_by_dataset`, workbook filename, and generic file names.

- [ ] **Step 6: Verify**

```bash
bash tests/integration/blog-writing-packs/run-blog-writing-pack-assembler-test.sh
bash tests/integration/export/run-data-package-exporter-test.sh
bash tests/integration/export/run-production-data-package-loader-test.sh
npm run lint
npx tsc --noEmit
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add src/shared/blog-writing-pack.ts src/main/blog-writing-packs/blog-writing-pack-recipe.ts src/main/blog-writing-packs/blog-writing-pack-assembler.ts tests/integration/blog-writing-packs/blog-writing-pack-assembler.integration.cjs tests/integration/blog-writing-packs/run-blog-writing-pack-assembler-test.sh
git commit -m "feat: add blog writing pack assembler"
```

---

### Task 3: Render the Fixed BLOG_WRITING_PACK v1 Workbook

**Files:**
- Create: `src/main/export/blog-writing-pack-exporter.ts`
- Create: `tests/integration/blog-writing-packs/blog-writing-pack-exporter.integration.cjs`
- Create: `tests/integration/blog-writing-packs/run-blog-writing-pack-exporter-test.sh`

**Interfaces:**

```ts
export interface BlogWritingPackWorkbookDefinition {
  filename: 'BLOG_WRITING_PACK.xlsx';
  sheets: Array<{ name: string; data: SheetData }>;
}

export const buildBlogWritingPackWorkbook = (
  assembly: BlogWritingPackAssembly,
): BlogWritingPackWorkbookDefinition

export const renderBlogWritingPackWorkbook = (
  assembly: BlogWritingPackAssembly,
): Promise<Uint8Array>
```

- [ ] **Step 1: Write RED sheet/header tests**

Require exact sheet order: `README`, `RUN_METADATA`, `GT_INTEREST`, `GSC_QUERY_PAGE`, `ADS_SEARCH_TERMS`, `KWP_METRICS`, `KWP_MONTHLY`, `PRODUCTS`, `SITEMAP_URLS`, `SERP_RESULTS`, `FAILURES`, `PROVENANCE`.

Pin these exact v1 columns:

```text
README
section, value

RUN_METADATA
package_id, recipe_id, recipe_version, run_id, workspace_id, created_at, application_version, coverage_status, expected_datasets, present_datasets, no_data_datasets, incomplete_datasets, missing_datasets

GT_INTEREST
source_id, job_id, job_key, validation_status, query_group_id, period_start, temporal_dimension, category_label, query, geography_label, relative_interest

GSC_QUERY_PAGE
source_id, job_id, job_key, validation_status, query, page, clicks, impressions, ctr, position

ADS_SEARCH_TERMS
source_id, job_id, job_key, validation_status, search_term, keyword, match_type, campaign, ad_group, impressions, clicks, ctr, average_cpc, cost, conversions, conversion_value

KWP_METRICS
source_id, job_id, job_key, validation_status, group_id, requested_keyword, returned_keyword, close_variants, matched_requested_keywords, currency, avg_monthly_searches, competition, competition_index, top_of_page_bid_low, top_of_page_bid_high, change_3_month, change_yoy

KWP_MONTHLY
source_id, job_id, job_key, validation_status, group_id, requested_keyword, returned_keyword, currency, year, month, searches

PRODUCTS
source_id, job_id, job_key, validation_status, product_title, product_id, variant_id, url, categories_product_type, categories, product_type, availability, price, sale_price, description, slug, image_url, plant_height, pot_type, stock, deleted, variant_active, continue_selling, sales_channel_lower, sales_channel_upper

SITEMAP_URLS
source_id, job_id, job_key, validation_status, loc, lastmod, document_kind, source_url, parent_sitemap_url, retrieved_at

SERP_RESULTS
source_id, job_id, job_key, validation_status, query, position, title, url, domain, snippet, paa, result_type

FAILURES
source_id, job_key, code

PROVENANCE
source_id, dataset_type, job_id, job_key, run_id, workspace_id, attempt_number, validation_status, raw_artifact_id, raw_artifact_filename, raw_artifact_media_type, raw_artifact_byte_size, raw_artifact_sha256, acquired_at, requested_context
```

- [ ] **Step 2: Write RED semantic-row tests**

Prove numeric zero stays numeric; null/missing -> empty cell; structured values -> deterministic JSON; GT preserves trusted `query_group_id`; duplicate query text across groups stays distinct; KWP API + CSV both appear; API currency empty if unavailable; monthly rows come only from actual history; source sheets preserve locked fields; provenance remains sanitized and deterministic.

- [ ] **Step 3: Write RED empty/NO_DATA behavior**

All locked sheets exist when empty. Verified `NO_DATA` creates no fabricated rows.

- [ ] **Step 4: Run RED**

```bash
bash tests/integration/blog-writing-packs/run-blog-writing-pack-exporter-test.sh
```

- [ ] **Step 5: Implement workbook rendering**

Use `write-excel-file/node` and existing cell semantics. Add no formulas, KPIs, recommendations, charts, or styling framework.

- [ ] **Step 6: Verify**

```bash
bash tests/integration/blog-writing-packs/run-blog-writing-pack-exporter-test.sh
npm run lint
npx tsc --noEmit
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add src/main/export/blog-writing-pack-exporter.ts tests/integration/blog-writing-packs/blog-writing-pack-exporter.integration.cjs tests/integration/blog-writing-packs/run-blog-writing-pack-exporter-test.sh
git commit -m "feat: add blog writing pack workbook"
```

---

### Task 4: Publish Immutable Blog Package Snapshots Atomically

**Files:**
- Create: `src/main/blog-writing-packs/blog-writing-pack-store.ts`
- Create: `src/main/blog-writing-packs/blog-writing-pack-publisher.ts`
- Create: `tests/integration/blog-writing-packs/blog-writing-pack-store.integration.cjs`
- Create: `tests/integration/blog-writing-packs/run-blog-writing-pack-store-test.sh`

**Interfaces:**

```ts
export interface PublishedBlogWritingPack {
  package_id: string;
  manifest: BlogWritingPackManifest;
}

export class BlogWritingPackStore {
  constructor(root: string);
  publish(input: {
    manifest: BlogWritingPackManifest;
    data_package: DataPackage;
    workbook_bytes: Uint8Array;
  }): Promise<PublishedBlogWritingPack>;
  readManifest(package_id: string): Promise<BlogWritingPackManifest>;
}
```

- [ ] **Step 1: Write RED layout tests**

Package contains only approved files: `BLOG_WRITING_PACK.xlsx`, `BLOG_PACKAGE.json`, `MANIFEST.json`, `DATASETS.json`, `FAILURES.json`, and source-separated dataset JSON files. No KWP user-export CSV/XLSX; no copied raw provider artifacts.

- [ ] **Step 2: Write RED immutable/atomic tests**

Final directory appears only after validation; staging stays inside Blog root; failed publish cleans staging; existing package ID refuses overwrite; two package IDs for same Run coexist; first remains byte-identical after second build.

- [ ] **Step 3: Write RED integrity tests**

Validate Blog/generic manifest identity, dataset index containment, workbook regular-file/no-symlink status, and basic XLSX structure before atomic rename. Corrupt/truncated XLSX prevents publication.

- [ ] **Step 4: Run RED**

```bash
bash tests/integration/blog-writing-packs/run-blog-writing-pack-store-test.sh
```

- [ ] **Step 5: Implement dedicated store**

Use root `path.join(directories.data, 'blog-writing-packs')`, private staging under root, validation, then atomic `rename`. Do not generalize Ads store merely to share a few lines.

- [ ] **Step 6: Verify**

```bash
bash tests/integration/blog-writing-packs/run-blog-writing-pack-store-test.sh
bash tests/integration/blog-writing-packs/run-blog-writing-pack-exporter-test.sh
bash tests/integration/export/run-data-package-exporter-test.sh
npm run lint
npx tsc --noEmit
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add src/main/blog-writing-packs/blog-writing-pack-store.ts src/main/blog-writing-packs/blog-writing-pack-publisher.ts tests/integration/blog-writing-packs/blog-writing-pack-store.integration.cjs tests/integration/blog-writing-packs/run-blog-writing-pack-store-test.sh
git commit -m "feat: publish immutable blog writing packs"
```

---

### Task 5: Add Safe Main-Process Blog Package Resolution

**Files:**
- Modify: `src/main/app/application-file-access.ts`
- Modify: `tests/integration/app/application-file-access.integration.cjs`

**Interfaces:**

```ts
export const resolveBlogWritingPackWorkbook = async (
  packages_root: string,
  package_id: string,
): Promise<string>

export const resolveBlogWritingPackDirectory = async (
  packages_root: string,
  package_id: string,
): Promise<string>
```

- [ ] **Step 1: Write RED identity/manifest tests**

Reject empty/dot/traversal/absolute/slash IDs, unknown package, missing/mismatched Blog manifest, wrong recipe/version, escaped/absolute workbook filename.

- [ ] **Step 2: Write RED filesystem/XLSX tests**

Reject escaped package dir, workbook symlink/directory/missing/corrupt/truncated XLSX. Accept only structurally valid workbook via verified package ID.

- [ ] **Step 3: Run existing file-access integration and confirm RED**

- [ ] **Step 4: Implement using existing safe local helpers**

Reuse/extract safe ID, containment, regular-file/no-symlink, and XLSX structure checks. Do not weaken Ads Task Package checks.

- [ ] **Step 5: Verify**

Run existing file-access integration runner plus:

```bash
npm run test:m7:ads-optimization-pack-desktop
npm run lint
npx tsc --noEmit
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git add src/main/app/application-file-access.ts tests/integration/app/application-file-access.integration.cjs
git commit -m "feat: resolve blog writing packs safely"
```

---

### Task 6: Add Local-Only Desktop Blog Build Controller and IPC Boundary

**Files:**
- Create: `src/shared/desktop-blog-writing-pack.ts`
- Create: `src/main/app/desktop-blog-writing-pack-controller.ts`
- Create: `src/main/app/desktop-blog-writing-pack-ipc.ts`
- Create: `tests/integration/app/desktop-blog-writing-pack-controller.integration.cjs`
- Create: `tests/integration/app/desktop-blog-writing-pack-ipc.integration.cjs`
- Create: `tests/integration/app/run-desktop-blog-writing-pack-controller-test.sh`
- Create: `tests/integration/app/run-desktop-blog-writing-pack-ipc-test.sh`

**Interfaces:**

```ts
export type DesktopBlogWritingPackBuildResult =
  | { status: 'NOT_READY'; run_id: string; missing_datasets: string[]; coverage_by_dataset: BlogWritingPackManifest['coverage_by_dataset']; }
  | { status: 'PACKAGE_PUBLISHED'; package: { package_id: string; run_id: string; coverage_status: 'COMPLETE' | 'PARTIAL'; present_datasets: string[]; no_data_datasets: string[]; incomplete_datasets: string[]; missing_datasets: string[]; }; };

export class DesktopBlogWritingPackController {
  build(run_id: string): Promise<DesktopBlogWritingPackBuildResult>;
}
```

- [ ] **Step 1: Write RED eligibility tests**

Unknown/non-terminal Run rejects; zero accepted Blog evidence -> `NOT_READY`; accepted evidence -> one package. Controller must not retry, mutate Run/Job, create Attempt, or execute provider acquisition.

Accepted terminal states: `COMPLETED`, `COMPLETED_WITH_WARNINGS`, `FAILED`, `CANCELLED`.

- [ ] **Step 2: Write RED repeated-build test**

Two explicit builds of same Run create two package IDs/snapshots.

- [ ] **Step 3: Write RED IPC tests**

Handlers: build by `run_id`, open/reveal by `package_id`. Reject malformed IDs, extra keys, arbitrary paths, traversal, and unsafe outputs containing path/raw/secret-shaped fields. Map internals to safe local errors.

- [ ] **Step 4: Run RED**

```bash
bash tests/integration/app/run-desktop-blog-writing-pack-controller-test.sh
bash tests/integration/app/run-desktop-blog-writing-pack-ipc-test.sh
```

- [ ] **Step 5: Implement controller/IPC**

Inject narrow dependencies: repository `getRun/listJobs`, ProductionDataPackageLoader-compatible loader, Blog store/publisher, clock, package-ID generator, application version. Open/Reveal resolve verified package IDs in main process. Do not import Ads Task Package recipe/controller semantics.

- [ ] **Step 6: Verify**

```bash
bash tests/integration/app/run-desktop-blog-writing-pack-controller-test.sh
bash tests/integration/app/run-desktop-blog-writing-pack-ipc-test.sh
npm run test:m5:desktop-retry-export
npm run lint
npx tsc --noEmit
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add src/shared/desktop-blog-writing-pack.ts src/main/app/desktop-blog-writing-pack-controller.ts src/main/app/desktop-blog-writing-pack-ipc.ts tests/integration/app/desktop-blog-writing-pack-controller.integration.cjs tests/integration/app/desktop-blog-writing-pack-ipc.integration.cjs tests/integration/app/run-desktop-blog-writing-pack-controller-test.sh tests/integration/app/run-desktop-blog-writing-pack-ipc-test.sh
git commit -m "feat: add desktop blog writing pack boundary"
```

---

### Task 7: Wire Build/Open/Reveal Into Electron and Run Detail

**Files:**
- Modify: `src/main.ts`
- Modify: `src/preload.ts`
- Modify: existing shared module imported by `src/preload.ts` as `IPC_CHANNELS`
- Modify: `src/DesktopMultiSourceView.tsx`
- Modify: `tests/integration/app/desktop-ui-smoke.integration.cjs`
- Modify/Create existing preload/main IPC integration coverage required by the new channels

**Interfaces:**
- Renderer: `buildBlogWritingPack(run_id)`, `openBlogWritingPack(package_id)`, `revealBlogWritingPack(package_id)`.
- New channels live in the existing central `IPC_CHANNELS` registry.
- Main composition uses `path.join(directories.data, 'blog-writing-packs')`; do not expand `ApplicationDirectories`.

- [ ] **Step 1: Inspect exact central IPC registry before editing**

Resolve the file imported by `src/preload.ts` as `IPC_CHANNELS`; modify it in place.

- [ ] **Step 2: Write RED main/preload channel tests**

All three renderer calls invoke exact central channels with only required IDs and use trusted-sender checks in main.

- [ ] **Step 3: Write RED Run Detail UI tests**

Terminal Run shows `Build Blog Writing Pack`. `NOT_READY` shows safe no-package state. Publication shows package ID, `COMPLETE`/`PARTIAL`, coverage summary, `Open Blog Writing Pack`, `Reveal Blog Writing Pack`. No absolute path. Switching Run clears stale Blog result.

- [ ] **Step 4: Write RED repeat-build UI test**

Second Build issues a new build request. Open/Reveal send only package ID.

- [ ] **Step 5: Run RED**

Run new Blog IPC runner plus:

```bash
npm run test:m5:desktop-ui
```

- [ ] **Step 6: Implement Electron composition and safe open/reveal**

Use current repository, ProductionDataPackageLoader, Blog root, app version, existing safe package-ID convention, and injected clock. Resolve verified package identity in main before open/reveal.

- [ ] **Step 7: Implement minimal Run Detail UI**

Add Blog action beside existing terminal exports. Do not add wizard/acquisition flow/generic Task Package refactor.

- [ ] **Step 8: Verify**

```bash
bash tests/integration/app/run-desktop-blog-writing-pack-controller-test.sh
bash tests/integration/app/run-desktop-blog-writing-pack-ipc-test.sh
npm run test:m5:desktop-ui
npm run test:m5:desktop-retry-export
npm run test:m7:ads-optimization-pack-desktop
npm run lint
npx tsc --noEmit
git diff --check
```

- [ ] **Step 9: Commit**

Stage only exact changed implementation/test files, then:

```bash
git commit -m "feat: expose blog writing pack in run detail"
```

---

### Task 8: Aggregate Gate, Reviews, Packaging, and Documentation

**Files:**
- Create: `tests/integration/blog-writing-packs/run-blog-writing-pack-gate.sh`
- Modify: `package.json`
- Modify: `tests/integration/release/run-release-gate.sh`
- Modify after verification only: canonical docs actually made stale, plus `PROJECT_HANDOFF.md`

**Interfaces:**
- One Blog aggregate command, preferably `test:m6:blog-writing-pack` if live naming still matches.
- Full release gate invokes Blog aggregate and never calls live providers.

- [ ] **Step 1: Add and run Blog aggregate gate**

```bash
npm run test:m6:blog-writing-pack
```

- [ ] **Step 2: Run adjacent regressions**

```bash
npm run test:m6:data-package
npm run test:m6:production-data-package
npm run test:m5:desktop-retry-export
npm run test:m5:desktop-ui
npm run test:m7:ads-optimization-pack
npm run test:m7:ads-optimization-pack-desktop
npm run lint
npx tsc --noEmit
git diff --check
```

- [ ] **Step 3: Run Ponytail FULL simplification review**

Mandatory `@ponytail-review`. Focus on unnecessary generic Task Package abstractions, needless storage generalization, accidental acquisition/retry logic, schema/persistence additions, and workbook logic beyond deterministic presentation. Fix/rule findings and rerun affected tests.

- [ ] **Step 4: Run separate correctness review**

Fresh reviewer/Codex context over the complete implementation diff against approved design, this plan, provenance/security, NO_DATA/partial coverage, renderer path/secret boundary, and immutable snapshot requirements. Fix findings with TDD.

- [ ] **Step 5: Fresh completion verification**

```bash
npm run test:m6:blog-writing-pack
npm run test:m6:data-package
npm run test:m6:production-data-package
npm run test:m5:desktop-ui
npm run test:m7:ads-optimization-pack
npm run test:m7:ads-optimization-pack-desktop
npm run lint
npx tsc --noEmit
git diff --check
npm run test:release:gate
```

Required evidence: `PASS RELEASE-GATE-001`. If the known loopback `EPERM` sandbox boundary occurs, rerun the exact gate with the already-established loopback permission; do not change product code for it.

- [ ] **Step 6: Package and run safe packaged-app acceptance**

```bash
npm run package
```

Verify target Apple Silicon `.app`, code-sign inspection, isolated launch, existing Run Detail/export surfaces, Blog UI safety, and no path/token/secret/stack leak. If a truthful accepted-Run packaged fixture exists, also build/open/reveal a Blog package. Otherwise record packaged Blog publication as unexecuted; do not invent evidence or add a seed system in this scope.

- [ ] **Step 7: Update canonical docs from observed results only**

Document only what verification proved: architecture/package root, manifest/coverage contracts, base Data Package writer seam, desktop Build/Open/Reveal, aggregate gate, packaged acceptance actually performed. `PROJECT_HANDOFF.md` records exact branch/HEAD, commands, limitations, known issues, exact next action.

- [ ] **Step 8: Final checks and checkpoint commit**

```bash
git diff --check
git status --short
git diff --stat
```

Confirm protected historical files remain untouched/untracked. Stage only verified files and commit the actual checkpoint. Do not merge or push until final branch review and explicit integration decision.
