# ADS_OPTIMIZATION_PACK v1 Slice B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the source-neutral Task Package recipe, accepted-evidence resolver, baseline assembler, immutable package storage, and deterministic XLSX exporter required for `ADS_OPTIMIZATION_PACK` v1 (`Kampanya Gelişim`), without adding provider acquisition or UI behavior.

**Architecture:** Add a code-defined recipe descriptor and a generic main-process Task Package layer that discovers already accepted Run/Job/Attempt/Artifact evidence, applies exact compatibility checks and permitted daily-row filtering, and assembles CURRENT plus an optional prior-package PREVIOUS snapshot. Persist package-derived normalized tables, `MANIFEST.json`, and the Ads-specific workbook under `app-data/data/packages/<package_id>/`; keep raw artifacts untouched and keep Google Ads worksheet/column semantics outside generic package code.

**Tech Stack:** TypeScript 5.9, Electron main-process filesystem boundary, existing SQLite `StateRepository`, existing `ProductionDataPackageLoader`, Node/Bash deterministic integration tests, `write-excel-file` 4.1.1.

**Spec:** `docs/superpowers/specs/2026-09-29-ads-optimization-pack-v1-design.md`

## Global Constraints

- Recipe identity is exactly `ADS_OPTIMIZATION_PACK`, recipe version is `1`, and the user-facing label is `Kampanya Gelişim`.
- Required coverage is exactly the six `google-ads-search-reporting` datasets implemented by Slice A; the legacy `google-ads-search-terms` quick-run source is not compatible package evidence.
- Campaign scope is SEARCH only. Performance Max and every other campaign mode remain out of scope.
- CURRENT is the last seven complete local calendar days. PREVIOUS is the stored CURRENT snapshot from the latest eligible, non-overlapping, same-recipe package.
- A first successful package is `INITIAL_BASELINE`; it contains no invented PREVIOUS rows, values, deltas, or sheets.
- A comparison may have a gap; record the exact non-negative `gap_days` and do not judge it.
- Current evidence reuse requires the same Workspace, customer, source, dataset, resource mode, SEARCH scope, dataset schema version, export-eligible validation status, and sufficient requested/observed date coverage. Acquisition date is not an eligibility or freshness requirement.
- Exact reuse is preferred. Exact compatible `NO_DATA` is eligible only when its evidence window exactly matches CURRENT. Broader populated DAILY evidence may be filtered only from provider-native normalized rows using `performance_date`; broader `NO_DATA` is ineligible for a narrower requested window.
- Never interpolate, allocate, average, subtract aggregates, estimate missing windows, or backfill current configuration into historical configuration.
- Raw provider artifacts remain immutable. Filtered rows, package tables, manifests, and workbooks are derived package outputs with origin and transformation provenance.
- Missing numeric evidence remains `null`/blank; provider zero remains numeric zero.
- Do not add CPA, ROAS, delta, score, winner/loser, GO/PAUSE, recommendation, budget/bid/action, or other analysis fields.
- The assembler performs no acquisition, provider authentication, provider request, validation-engine duplication, or automatic PREVIOUS refetch.
- Do not add a Task Package SQLite table or a generic user-editable recipe DSL in Slice B.
- Do not add UI, IPC, Review/Start orchestration, retry controls, or live acceptance in Slice B; those remain Slice C work.
- Normal automated tests and the release gate must not call Google or any other live provider.
- Keep helper shell scripts compatible with macOS system Bash 3.2.
- Preserve the existing Production Data Package contract and the Slice A reporting-family behavior.
- Do not modify, stage, rename, delete, or commit `CODEX_HANDOFF_CURRENT.md` or `PROJECT_HANDOFF.pre-20260820.md`.

## Current Repository Evidence

- Verified starting branch/HEAD before this plan: `main` at `c36866e`; `main` and `feat/google-ads-search-reporting-family` point to the same Slice A checkpoint.
- The only starting working-tree entries were the two protected historical untracked files named above.
- `src/shared/google-ads-search-reporting.ts` is the implemented authority for the six dataset and resource-mode mappings.
- `ProductionDataPackageLoader` already verifies accepted raw artifact ownership, kind/state, byte size, SHA-256, source context, native normalization, NULL/zero behavior, and `snapshot_observed_at`.
- `StateRepository` already exposes `listRuns(workspace_id)`, `listJobs(run_id)`, `getArtifact(artifact_id)`, and immutable Job/Artifact provenance; no schema migration is justified.
- `ApplicationDirectories.data` is the existing `app-data/data` root, so Task Package storage can use its `packages/` child without changing the shared directory contract.
- The generic Data Package exporter writes run-scoped `MANIFEST.json`, `FAILURES.json`, `DATASETS.json`, and source-native datasets. Slice B must reuse its accepted-evidence loader seam but must not change its run-package schema into the recipe-package schema.

## Scope

- Source-neutral recipe and Task Package serialized contracts.
- Exact date-window arithmetic and package baseline selection.
- Local discovery and deterministic selection of accepted evidence.
- Exact reuse, exact-window verified `NO_DATA`, and permitted populated DAILY row slicing.
- Missing/not-ready resolution without collection.
- Canonical package directory, schema-validated manifest scanning, package-derived tables, and provenance.
- `INITIAL_BASELINE` and `COMPARISON` assembly.
- Ads-specific XLSX workbook with the approved sheet contract.
- Focused deterministic gate plus adjacent/full regressions.

## Out of Scope

- Google Ads API calls, authentication, quotas, live smoke, or new source adapters.
- Desktop navigation, Review/Start/Open/Retry UI, preload/IPC, or production composition from user intent.
- Automatically launching collection for unresolved requirements.
- Performance Max or any non-SEARCH data.
- Persisted database/schema changes.
- Analysis, recommendations, computed comparison metrics, or historical configuration reconstruction.

## Review Focus

1. A broader `NO_DATA` artifact must remain ineligible for a narrower CURRENT window even though the broader requested range contains it; Task 3 contrasts exact-window `NO_DATA` with the rejected broader case.
2. Multiple compatible candidates must resolve deterministically without treating acquisition age/date as eligibility: exact before filtered, then the narrowest covering range, newest acquisition timestamp, and stable Run/Job/Artifact identity tie-breakers; Task 3 pins the full ordering.
3. Malformed, truncated, checksum-mismatched, path-traversing, or symlinked stored package content must never become a PREVIOUS baseline; Task 4 covers each storage failure class.
4. Formula-like provider strings and nested Ads arrays must remain literal evidence in XLSX cells, while `null` stays blank and `0` stays numeric; Task 7 inspects the generated workbook XML/cells.
5. A write failure or duplicate `package_id` must not expose a partially complete package as baseline-eligible or overwrite an existing package; Task 7 covers staging cleanup, manifest-last publication, and collision refusal.

---

### Task 1: Define the generic Task Package contract, recipe, and window policy

**Files:**
- Create: `src/shared/task-package.ts`
- Create: `src/main/task-packages/task-package-window.ts`
- Create: `src/main/task-packages/ads-optimization-pack-recipe.ts`
- Create: `tests/integration/task-packages/ads-optimization-pack-recipe.integration.cjs`
- Create: `tests/integration/task-packages/run-ads-optimization-pack-recipe-test.sh`
- Modify: `package.json`

**Interfaces:**
- Produces `TaskPackageRecipe`, `TaskEvidenceRequirement`, `TaskPackageWindow`, `TaskPackageEvidenceOrigin`, `TaskPackageEvidenceEntry`, `TaskPackageManifestV1`, `AssembledTaskPackage`, and `TaskPackageAssemblyResult` source-neutral types.
- Produces `ADS_OPTIMIZATION_PACK_V1_RECIPE: TaskPackageRecipe` with the exact identity, label, six requirements, source/resource mappings, acquisition mode `OFFICIAL_API`, SEARCH scope, schema version `1`, opaque account-identity field name `customer_id`, `performance_date` row-date field, and seven-day policy.
- Produces `lastCompleteCalendarDays(reference_date: string, day_count: number): TaskPackageWindow`, `countCalendarDays(window): number`, and `gapDays(previous, current): number` using date-only UTC arithmetic so DST cannot change calendar-day counts.
- Recipe descriptors declare compatibility dimensions; generic types contain no GAQL fields or Google Ads parser logic.

- [ ] **Step 1: Write the failing recipe and date-policy test**

Assert exact recipe identity/version/label, exactly six required dataset declarations, exact Slice A resource mappings, source `google-ads-search-reporting`, SEARCH/schema-v1 compatibility, and no legacy quick-run or Performance Max requirement. Assert reference date `2026-09-30` produces CURRENT `2026-09-23..2026-09-29`, every window is exactly seven days, overlap is rejected, and `2026-09-08..14` → `2026-09-23..29` produces `gap_days = 8`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test:m7:ads-optimization-pack-recipe`

Expected: FAIL because the Task Package contract and recipe do not exist.

- [ ] **Step 3: Implement the minimum generic contracts and pure window helpers**

Keep persisted manifest fields explicit and JSON-compatible. Use discriminated unions for `INITIAL_BASELINE | COMPARISON`, `CURRENT | PREVIOUS`, `COLLECTED | REUSED_EXACT | REUSED_FILTERED | NO_DATA`, and `READY | NOT_READY`; do not add analysis fields.

- [ ] **Step 4: Implement the code-defined Ads recipe**

Import the Slice A constants from `src/shared/google-ads-search-reporting.ts`; do not duplicate the six mappings by hand in generic code.

- [ ] **Step 5: Run focused GREEN and static checks**

Run: `npm run test:m7:ads-optimization-pack-recipe`

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/shared/task-package.ts src/main/task-packages/task-package-window.ts src/main/task-packages/ads-optimization-pack-recipe.ts tests/integration/task-packages/ads-optimization-pack-recipe.integration.cjs tests/integration/task-packages/run-ads-optimization-pack-recipe-test.sh package.json
git commit -m "feat: define ads optimization package recipe"
```

---

### Task 2: Expose verified single-Job dataset loading

**Files:**
- Modify: `src/main/export/production-data-package-loader.ts`
- Modify: `tests/integration/export/production-data-package-loader.integration.cjs`

**Interfaces:**
- Produces `ProductionDataPackageLoader.loadAcceptedJobDataset(run_id: string, job_id: string): Promise<DataPackageInputDataset>`.
- Preserves `loadRunDatasets(run_id)` behavior by implementing it through the same single-Job verification path.
- Adds `attempt_number` to the additive provenance object from the accepted artifact; existing provenance names and Data Package output remain compatible.
- Continues to verify Run/Job/source ownership, accepted artifact state, byte size, SHA-256, source context, and native normalization before returning rows.

- [ ] **Step 1: Add failing single-Job loader tests**

Assert one chosen Google Ads reporting Job loads without loading siblings; wrong Run/Job binding, rejected validation, missing accepted artifact, wrong artifact ownership, and checksum mutation fail closed. Assert the result includes original Run, Job, artifact, attempt number, validation, requested context, acquisition timestamp, checksum, and snapshot timestamp.

- [ ] **Step 2: Run the focused loader test and verify RED**

Run: `npm run test:m6:production-data-package`

Expected: FAIL because `loadAcceptedJobDataset` is absent.

- [ ] **Step 3: Extract the existing verification/parsing path behind the new method**

Do not weaken `loadRunDatasets`; it should still skip ineligible Jobs and fail closed for corrupt accepted evidence exactly as before.

- [ ] **Step 4: Run focused and generic export regressions**

Run: `npm run test:m6:production-data-package`

Run: `npm run test:m6:data-package`

Expected: PASS with existing Production Data Package shapes intact apart from the additive attempt provenance.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/main/export/production-data-package-loader.ts tests/integration/export/production-data-package-loader.integration.cjs
git commit -m "feat: load verified accepted job evidence"
```

---

### Task 3: Resolve compatible CURRENT evidence without acquisition

**Files:**
- Create: `src/main/task-packages/task-package-evidence-resolver.ts`
- Create: `tests/integration/task-packages/task-package-evidence-resolver.integration.cjs`
- Create: `tests/integration/task-packages/run-task-package-evidence-resolver-test.sh`
- Modify: `package.json`

**Interfaces:**
- Produces `TaskPackageEvidenceRepository` using only `listRuns(workspace_id)`, `listJobs(run_id)`, and `getArtifact(artifact_id)`.
- Produces `TaskPackageDatasetLoader` using `loadAcceptedJobDataset(run_id, job_id)`.
- Produces `TaskPackageEvidenceResolver.resolveCurrent(input: { recipe; workspace_id; account_identity: { field: string; value: string }; current_window }): Promise<CurrentEvidenceResolution[]>`; the generic resolver matches the recipe-declared identity field without importing Google Ads semantics.
- Each resolution is `READY` with immutable copied rows and full origin/transformation provenance, or `MISSING` with stable local reason codes and rejected-candidate diagnostics. It never starts a Run or calls a provider.

- [ ] **Step 1: Write RED tests for eligibility and incompatibility**

Cover exact compatible reuse plus rejection for another Workspace/customer/source/dataset/resource mode/schema version/campaign scope, legacy `google-ads-search-terms`, rejected/invalid validation, missing accepted artifact, and insufficient coverage. Verify only `VALID`, `LOW_DATA`, and `NO_DATA` with accepted artifact state are eligible.

- [ ] **Step 2: Add RED tests for deterministic candidate selection without acquisition-date eligibility**

Use compatible candidates acquired on different calendar dates and assert that acquisition date never makes either candidate ineligible. Pin ordering to: exact window before broader populated DAILY evidence; then smallest containing range; then newest artifact acquisition timestamp; then lexical Run ID, Job ID, Artifact ID. The selected result must be stable when repository iteration order changes, and acquisition/snapshot timestamps must remain unchanged in provenance.

- [ ] **Step 3: Add RED tests for `NO_DATA`, filtering, and forbidden reconstruction**

Assert exact compatible `NO_DATA` for the exact CURRENT window is READY with disposition `NO_DATA`. Assert broader `NO_DATA` is ineligible for a narrower CURRENT window and cannot be converted into `REUSED_FILTERED`. Assert broader populated DAILY evidence filters only exact rows whose `performance_date` is within CURRENT, preserves `snapshot_observed_at`, acquisition timestamp, `null`, and `0`, and records `DATE_FILTER` input/output windows and row counts. Reject wider aggregate rows without the exact date field, a requested source window that only partially covers CURRENT, invalid row dates, and any input that would require inference, interpolation, aggregate reconstruction, or proportional allocation.

- [ ] **Step 4: Run the focused test and verify RED**

Run: `npm run test:m7:task-package-evidence`

Expected: FAIL because the resolver is absent.

- [ ] **Step 5: Implement compatibility filtering and candidate selection**

Treat existing validation as the semantic trust decision; the resolver adds only recipe compatibility, exact/containing date coverage, the exact-window `NO_DATA` rule, and deterministic row-selection checks. Do not add acquisition-age or calendar-date freshness checks. Deep-copy selected rows. Do not modify raw bytes, accepted artifacts, Jobs, or validation records.

- [ ] **Step 6: Run focused GREEN and Slice A loader regression**

Run: `npm run test:m7:task-package-evidence`

Run: `npm run test:m6:production-data-package`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/main/task-packages/task-package-evidence-resolver.ts tests/integration/task-packages/task-package-evidence-resolver.integration.cjs tests/integration/task-packages/run-task-package-evidence-resolver-test.sh package.json
git commit -m "feat: resolve compatible task package evidence"
```

---

### Task 4: Add schema-validated immutable package storage and baseline discovery

**Files:**
- Create: `src/main/task-packages/task-package-manifest.ts`
- Create: `src/main/task-packages/task-package-store.ts`
- Create: `tests/integration/task-packages/task-package-store.integration.cjs`
- Create: `tests/integration/task-packages/run-task-package-store-test.sh`
- Modify: `package.json`

**Interfaces:**
- Produces `parseTaskPackageManifest(value: unknown): TaskPackageManifestV1`, rejecting unknown/malformed identity, window, evidence, transformation, origin, table-reference, checksum, and forbidden secret/analysis fields.
- Produces `TaskPackageStore(packages_root: string)` with `scanManifests(): { manifests: TaskPackageManifestV1[]; rejected: StoredPackageRejection[] }`, `readDatasetTable(reference)`, and `publishPackage(input)` so corrupt candidates are visible locally while remaining baseline-ineligible.
- Package-derived tables use deterministic relative names such as `datasets/current-campaign-performance.json` and `datasets/previous-campaign-performance.json`, with role/dataset/row-count/SHA-256 references in the manifest.
- `publishPackage` writes into a private staging directory, writes `MANIFEST.json` last inside staging, and atomically renames the completed directory to `<packages_root>/<package_id>` without overwriting an existing package.

- [ ] **Step 1: Write RED manifest parser tests**

Cover valid `INITIAL_BASELINE` and `COMPARISON` manifests; exact seven-day windows; required six-dataset uniqueness; optional PREVIOUS only for comparison; full run/job/attempt/artifact/checksum/validation/source/resource/snapshot provenance; `DATE_FILTER` provenance; missing and zero JSON values; and rejection of secrets, recommendation/score/delta/action fields, traversal paths, unsupported versions, and inconsistent package kinds.

- [ ] **Step 2: Write RED package-scan and table-integrity tests**

Under a temporary `<data>/packages` root, prove that only regular child directories with a regular non-symlink `MANIFEST.json` are scanned. Malformed JSON, invalid schema, symlinked manifest/table, table traversal, wrong row count, changed bytes, and SHA-256 mismatch must be excluded or fail closed and must never become baseline candidates.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm run test:m7:task-package-store`

Expected: FAIL because manifest/storage support is absent.

- [ ] **Step 4: Implement manifest parsing and safe package reads**

Use `ApplicationDirectories.data/packages` as the production root supplied by the future caller; do not add a new `ApplicationDirectories` field or database table.

- [ ] **Step 5: Implement collision-safe atomic publication**

Clean up only the exact staging directory created by the failed call. Never remove or overwrite an existing final package directory.

- [ ] **Step 6: Run focused GREEN and filesystem regression**

Run: `npm run test:m7:task-package-store`

Run: `npm run test:m2:storage`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/main/task-packages/task-package-manifest.ts src/main/task-packages/task-package-store.ts tests/integration/task-packages/task-package-store.integration.cjs tests/integration/task-packages/run-task-package-store-test.sh package.json
git commit -m "feat: add immutable task package storage"
```

---

### Task 5: Assemble six-dataset CURRENT and `INITIAL_BASELINE`

**Files:**
- Create: `src/main/task-packages/task-package-assembler.ts`
- Create: `tests/integration/task-packages/task-package-assembler.integration.cjs`
- Create: `tests/integration/task-packages/run-task-package-assembler-test.sh`
- Modify: `package.json`

**Interfaces:**
- Produces `TaskPackageAssembler.assemble(input: { recipe; package_id; workspace_id; account_identity: { field: string; value: string }; reference_date; created_at; application_version }): Promise<TaskPackageAssemblyResult>`.
- Consumes the generic recipe, evidence resolver, and valid stored manifests; imports no Google Ads GAQL fields, parsers, or resource-specific row interfaces.
- `NOT_READY` returns all six requirement outcomes and stable reasons without writing a package.
- `READY` returns a complete `AssembledTaskPackage` with CURRENT datasets and either `INITIAL_BASELINE` or comparison context; this task first proves the no-previous-package branch.

- [ ] **Step 1: Write RED initial-baseline tests**

Use six accepted compatible fixtures with a mix of exact reuse, filtered reuse, and verified `NO_DATA`. Assert exact CURRENT dates, six unique requirements, `INITIAL_BASELINE`, no previous package/window/rows, no PREVIOUS tables/sheets contract, and complete source/run/job/attempt/artifact/validation/transformation provenance.

- [ ] **Step 2: Write RED not-ready tests**

Remove each required dataset in turn and assert assembly remains `NOT_READY`, identifies the missing requirement, preserves READY sibling resolutions, writes nothing, and never substitutes an empty row set. Repeat with authentication/API/schema/date/mode/context/validation-style unavailable candidates represented as ineligible local evidence.

- [ ] **Step 3: Add RED integrity tests**

Hash every raw fixture before and after assembly. Assert hashes and bytes are unchanged; package rows are independent copies; missing numeric fields remain `null`, true zeros remain `0`; current snapshot fields retain the artifact's `snapshot_observed_at`; no prohibited analysis/recommendation keys occur recursively.

- [ ] **Step 4: Run the focused test and verify RED**

Run: `npm run test:m7:task-package-assembler`

Expected: FAIL because the assembler is absent.

- [ ] **Step 5: Implement minimal generic initial-baseline assembly**

Do not publish files yet. Build the manifest/table model in memory only after all required evidence is READY.

- [ ] **Step 6: Run focused GREEN**

Run: `npm run test:m7:task-package-assembler`

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/main/task-packages/task-package-assembler.ts tests/integration/task-packages/task-package-assembler.integration.cjs tests/integration/task-packages/run-task-package-assembler-test.sh package.json
git commit -m "feat: assemble initial task package baseline"
```

---

### Task 6: Reuse the latest eligible package as PREVIOUS

**Files:**
- Modify: `src/main/task-packages/task-package-assembler.ts`
- Modify: `tests/integration/task-packages/task-package-assembler.integration.cjs`

**Interfaces:**
- Baseline eligibility requires the exact recipe ID/version, Workspace, account/customer identity, campaign scope, dataset schema, complete six-dataset CURRENT snapshot, and `previous.current_window.end < proposed.current_window.start`.
- Select the eligible manifest with the latest CURRENT end date; break remaining ties by newest `created_at`, then lexical `package_id`.
- PREVIOUS rows come only from checksum-verified package-derived CURRENT tables of that stored package. No provider loader or acquisition method is called for PREVIOUS.

- [ ] **Step 1: Add failing prior-package selection tests**

Provide eligible and ineligible stored manifests for another recipe/version/Workspace/customer/scope/schema, incomplete/failed content, overlap, future window, malformed storage, and a generic Data Package directory. Assert only the latest exact compatible non-overlapping Task Package is selected.

- [ ] **Step 2: Add failing comparison and gap tests**

Assert previous CURRENT `2026-09-08..14` and new CURRENT `2026-09-23..29` produce `COMPARISON`, PREVIOUS `2026-09-08..14`, and `gap_days = 8`. Adjacent windows produce `gap_days = 0`. Overlap never produces a comparison.

- [ ] **Step 3: Add failing temporal-snapshot tests**

Give current and prior package rows different campaign status/budget/ad text/asset state and `snapshot_observed_at`. Assert PREVIOUS preserves the prior immutable row exactly; current configuration is never copied backward. Remove a historical configuration field from the prior row and assert it remains absent/null rather than being filled from CURRENT.

- [ ] **Step 4: Run the focused test and verify RED**

Run: `npm run test:m7:task-package-assembler`

Expected: FAIL on comparison behavior.

- [ ] **Step 5: Implement baseline discovery and PREVIOUS loading**

Copy the prior package's origin and transformation provenance into role `PREVIOUS` and add `source_package_id`; do not relabel it as newly collected evidence.

- [ ] **Step 6: Run focused GREEN**

Run: `npm run test:m7:task-package-assembler`

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/main/task-packages/task-package-assembler.ts tests/integration/task-packages/task-package-assembler.integration.cjs
git commit -m "feat: assemble prior package comparison baseline"
```

---

### Task 7: Export and publish the Ads Optimization workbook/package

**Files:**
- Create: `src/main/export/ads-optimization-pack-exporter.ts`
- Modify: `src/main/task-packages/task-package-store.ts`
- Create: `tests/integration/task-packages/ads-optimization-pack-exporter.integration.cjs`
- Create: `tests/integration/task-packages/run-ads-optimization-pack-exporter-test.sh`
- Modify: `package.json`

**Interfaces:**
- Produces `buildAdsOptimizationWorkbook(package_: AssembledTaskPackage): WorkbookDefinition` and `writeAdsOptimizationPackage(store: TaskPackageStore, package_: AssembledTaskPackage): Promise<PublishedTaskPackage>`.
- Ads-specific exporter owns the explicit normalized column allowlist and sheet mapping; generic assembler/store code does not know Campaign, Keyword, Search Term, RSA, or asset fields.
- `INITIAL_BASELINE` filename is `kampanya-gelisim-<current-package-date>-baseline.xlsx`; comparison filename is `kampanya-gelisim-<current-package-date>-<previous-package-date>.xlsx`. Dates are local package creation dates, not metric-window dates.
- Initial workbook sheets are `00_MANIFEST` plus the six approved CURRENT sheets. Comparison adds the six PREVIOUS sheets in the exact approved order.

- [ ] **Step 1: Write RED workbook-contract tests**

Generate initial and comparison workbooks, unzip them with the repository's existing XLSX-test approach, and assert exact filenames, sheet names/order, manifest date/window/package fields, and omission of every PREVIOUS sheet for `INITIAL_BASELINE`.

- [ ] **Step 2: Add RED cell and column tests**

Assert every dataset uses an explicit stable provider-native column allowlist including identity, `performance_date`, and `snapshot_observed_at`; nested URLs/headlines/descriptions are deterministic JSON strings. Assert `null` is blank, zero is numeric, formula-like provider text is a literal string, and forbidden analysis/recommendation/delta/action columns are absent even if an unexpected input row contains them.

- [ ] **Step 3: Add RED publication/determinism tests**

Publish identical fixed inputs into two temporary roots and compare parsed JSON plus workbook sheet/cell content. Assert per-role table checksums/row counts match the manifest; manifest/origin contains no unrestricted absolute path or secret-shaped key; duplicate `package_id` refuses overwrite. Inject a pre-manifest write failure and prove no final package directory is visible and only that call's staging directory is removed.

- [ ] **Step 4: Run the focused test and verify RED**

Run: `npm run test:m7:ads-optimization-pack-export`

Expected: FAIL because the exporter is absent.

- [ ] **Step 5: Implement workbook tables and explicit Ads column maps**

Use `write-excel-file/node`. Keep all provider snapshot fields labeled as evidence; do not add interpretation or comparisons.

- [ ] **Step 6: Publish package tables, workbook, then validated manifest atomically**

After publication, re-read the final manifest and table references through `TaskPackageStore` before returning success.

- [ ] **Step 7: Run focused GREEN and adjacent export regressions**

Run: `npm run test:m7:ads-optimization-pack-export`

Run: `npm run test:m6:data-package`

Run: `npm run test:m6:production-data-package`

Expected: PASS.

- [ ] **Step 8: Commit Task 7**

```bash
git add src/main/export/ads-optimization-pack-exporter.ts src/main/task-packages/task-package-store.ts tests/integration/task-packages/ads-optimization-pack-exporter.integration.cjs tests/integration/task-packages/run-ads-optimization-pack-exporter-test.sh package.json
git commit -m "feat: export ads optimization task packages"
```

---

### Task 8: Add the deterministic Slice B gate and integrated six-dataset regression

**Files:**
- Create: `tests/integration/task-packages/ads-optimization-pack-slice-b.integration.cjs`
- Create: `tests/integration/task-packages/run-ads-optimization-pack-slice-b-test.sh`
- Create: `tests/integration/task-packages/run-ads-optimization-pack-gate.sh`
- Modify: `tests/integration/release/run-release-gate.sh`
- Modify: `package.json`

**Interfaces:**
- Produces `npm run test:m7:ads-optimization-pack` as the focused deterministic Slice B gate.
- Wires the stable focused gate into `npm run test:release:gate` without any live command.

- [ ] **Step 1: Write the RED end-to-end local package test**

Create real temporary run-scoped raw artifacts and repository records for all six Slice A datasets. Assemble/publish an initial package, then a later comparison that uses exact reuse, broader populated DAILY filtering, and exact-window `NO_DATA`; also provide a broader `NO_DATA` candidate and prove it is rejected for the narrower CURRENT window. Verify the final manifest, derived tables, workbook, raw hashes, baseline, gap, provenance timestamps, NULL/zero, and no-analysis contracts together.

- [ ] **Step 2: Add explicit no-provider-call and backward-compatibility guards**

Use only local fixtures/fakes. Assert no requester/acquirer dependency exists in assembler construction. Run the legacy quick-run/Google Ads family tests and verify the generic Production Data Package still emits its unchanged run-package contract.

- [ ] **Step 3: Run the integrated test and verify RED if any wiring is missing**

Run: `bash tests/integration/task-packages/run-ads-optimization-pack-slice-b-test.sh`

- [ ] **Step 4: Add the aggregate gate and package script**

The gate should call the recipe, evidence, store, assembler, exporter, and integrated Slice B scripts in deterministic order, then print one stable PASS line such as `PASS ADS-OPTIMIZATION-PACK-GATE-001`.

- [ ] **Step 5: Run focused and adjacent gates**

Run:

```bash
npm run test:m7:ads-optimization-pack
npm run test:m3:google-ads-search-reporting
npm run test:m6:production-data-package
npm run test:m6:data-package
```

Expected: PASS; no live Google request.

- [ ] **Step 6: Wire the deterministic gate into the release gate**

Add only the focused aggregate script to `tests/integration/release/run-release-gate.sh`; do not duplicate its child scripts there.

- [ ] **Step 7: Commit Task 8**

```bash
git add tests/integration/task-packages/ads-optimization-pack-slice-b.integration.cjs tests/integration/task-packages/run-ads-optimization-pack-slice-b-test.sh tests/integration/task-packages/run-ads-optimization-pack-gate.sh tests/integration/release/run-release-gate.sh package.json
git commit -m "test: gate ads optimization task packages"
```

---

### Task 9: Verify, review, and reconcile canonical documentation

**Files:**
- Modify only if verified implementation facts require it: `ARCHITECTURE.md`
- Modify only if verified implementation facts require it: `DATA_CONTRACTS.md`
- Modify only if verified implementation facts require it: `TEST_STRATEGY.md`
- Modify only if verified implementation facts require it: `DECISIONS.md`
- Modify: `PROJECT_HANDOFF.md`

**Interfaces:**
- Documentation must distinguish deterministic Slice B implementation from absent Slice C UI and absent live provider acceptance.
- `PROJECT_HANDOFF.md` becomes the authority for the verified final branch/HEAD, commands, PASS/FAIL, no-live-call statement, remaining limitations, and exact next action.

- [ ] **Step 1: Inspect the complete branch diff and repository truth**

Run:

```bash
git status --short
git diff --stat main...HEAD
git diff main...HEAD
git diff --cached
```

Confirm the two protected untracked files remain untouched and no UI, provider request, schema migration, analysis field, or unrelated cleanup entered the branch.

- [ ] **Step 2: Run fresh final verification on the final implementation HEAD**

Run:

```bash
npm run test:m7:ads-optimization-pack
npm run test:m3:google-ads-search-reporting
npm run test:m6:production-data-package
npm run test:m6:data-package
npm run lint
npx tsc --noEmit
git diff --check
npm run test:release:gate
```

Expected: every command exits `0`; record the exact PASS lines. If loopback permission is the only release-gate failure, report that environment boundary and rerun only with the appropriate local-loopback execution permission. Do not claim PASS for a command that did not run.

- [ ] **Step 3: Reconcile only canonical facts proven by the final verification**

Record the source-neutral recipe/assembler/store boundary, immutable package tables/manifest/XLSX provenance, CURRENT/PREVIOUS/INITIAL_BASELINE behavior, exact reuse/slicing/NO_DATA behavior, and deterministic gate. Do not write Slice C UI, live acceptance, or future provider behavior as complete.

- [ ] **Step 4: Commit the documentation checkpoint separately**

```bash
git add ARCHITECTURE.md DATA_CONTRACTS.md TEST_STRATEGY.md DECISIONS.md PROJECT_HANDOFF.md
git diff --cached --check
git commit -m "docs: reconcile ads optimization package slice"
```

Stage only files that actually changed; never stage the protected historical files.

- [ ] **Step 5: Report the final checkpoint**

Report branch/final HEAD, commits, files and seams changed, recipe contract, evidence compatibility/reuse, baseline behavior, provenance, exact test results, live provider calls (`none`), remaining limitations, docs/handoff status, and the exact next action. Do not merge without an explicit integration instruction.

---

## Slice B Acceptance Criteria

This plan is complete when:

- `ADS_OPTIMIZATION_PACK` v1 is a code-defined source-neutral recipe with exactly six required SEARCH reporting datasets;
- the package layer discovers only accepted compatible evidence and never performs acquisition;
- exact reuse, exact-window verified `NO_DATA`, and exact `performance_date` filtering of broader populated DAILY evidence are deterministic and provenance-preserving;
- broader `NO_DATA` never covers a narrower requested window and is never transformed into filtered or inferred evidence;
- incompatible customer/dataset/schema/resource/scope/date/validation evidence is excluded with a visible not-ready result, while acquisition date never acts as an eligibility/freshness filter;
- missing required evidence is never represented as an empty dataset;
- CURRENT is exactly the last seven complete days;
- the first eligible package is `INITIAL_BASELINE` with no PREVIOUS values or sheets;
- PREVIOUS comes only from the latest eligible immutable same-recipe package snapshot and is never refetched;
- `gap_days` is deterministic and overlap is forbidden;
- current configuration is not copied into historical configuration;
- package tables, manifest, and workbook trace every dataset to original source, mode, Run, Job, Attempt, Artifact, checksum, validation, timestamps, dates, recipe/version, role, and slicing transformation;
- raw artifacts remain byte-for-byte unchanged;
- missing values remain blank/null and true zero remains zero;
- workbook names/sheets follow the approved contract and contain no analysis/recommendation fields;
- existing Google Ads Slice A and Production Data Package behavior remain backward-compatible;
- focused/static/full deterministic gates pass without live provider calls;
- canonical docs describe only verified Slice B facts, with Slice C UI and live provider acceptance still explicitly outstanding.
