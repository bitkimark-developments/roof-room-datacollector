# ADS_OPTIMIZATION_PACK v1 Slice C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ADS_OPTIMIZATION_PACK` v1 (`Kampanya Gelişim`) usable through the existing desktop Review/Start/Run Detail/Open workflow while keeping acquisition in the existing Core Run/Job/Attempt path and package assembly local-only.

**Architecture:** Add one source-neutral desktop Task Package controller beside the existing multi-source controller. It reads safe Workspace connection metadata, invokes the existing Slice B resolver/assembler/store, and either publishes already-ready evidence or reserves only missing requirements as ordinary Core Jobs; an Ads registration supplies the existing six SEARCH job contexts and workbook writer. Expose this controller through narrow trusted main-process IPC and preload methods, render it inside the existing task catalog/detail UI, reuse Run Detail for polling and retry, and extend the existing safe file-access boundary to open only a verified stored package workbook.

**Tech Stack:** TypeScript 5.9, Electron main/preload/renderer IPC, React 19, existing SQLite `StateRepository`, existing Core orchestration, Node/Bash deterministic integration tests, existing Playwright-driven desktop UI smoke test.

**Spec:** `docs/superpowers/specs/2026-09-29-ads-optimization-pack-v1-design.md`

## Global Constraints

- Recipe identity is exactly `ADS_OPTIMIZATION_PACK`, recipe version is `1`, and the user-facing label is `Kampanya Gelişim`.
- Required coverage is exactly the six `google-ads-search-reporting` datasets implemented by Slice A; the legacy `google-ads-search-terms` connection remains the safe customer/OAuth compatibility anchor, but its quick-run artifacts are not package evidence.
- Campaign scope is SEARCH only. Performance Max and every other campaign mode remain out of scope.
- CURRENT is the last seven complete local calendar days.
- Exact compatible evidence is reused. Broader populated DAILY evidence may be filtered only by provider-native `performance_date`. `NO_DATA` is reusable only for the exact requested window; broader `NO_DATA` cannot satisfy a narrower window.
- Acquisition date is provenance and a deterministic tie-breaker, not an eligibility/freshness rule.
- A first successful package is `INITIAL_BASELINE`; it contains no invented PREVIOUS rows, values, deltas, or sheets. A later compatible package is `COMPARISON` only when Slice B selects an immutable non-overlapping baseline.
- Missing evidence is never represented as empty evidence or numeric zero. Provider zero remains numeric zero; missing remains `null`/blank.
- The Task Package controller, assembler, store, exporter, renderer, preload, and IPC handlers never call a provider directly. Missing evidence is acquired only by reserving existing Core Jobs and invoking the existing Core execution service.
- Retry and recollection use the existing Core Run/Job/Attempt mechanisms. Do not add a Task Package retry engine, mutate accepted evidence, or refetch PREVIOUS evidence.
- Do not add analysis, recommendations, scores, CPA/ROAS decisions, deltas, GO/PAUSE, budget/bid actions, or optimization judgments.
- Renderer payloads contain safe identifiers, dates, readiness states, dispositions, and fixed reason codes only. Credentials, OAuth material, unrestricted paths, raw provider bodies, and internal exception text remain main-process-only.
- Normal automated tests and the release gate must not call Google or any other live provider.
- Do not add a database table, migration, generic recipe editor, background scheduler, or parallel Ads-only desktop shell.
- Keep helper shell scripts compatible with macOS system Bash 3.2.
- Do not modify, stage, rename, delete, or commit `CODEX_HANDOFF_CURRENT.md` or `PROJECT_HANDOFF.pre-20260820.md`.

## Current Repository Evidence

- Planning started on `feat/ads-optimization-pack-slice-c` at `801cfc3`; the only worktree entries were the two protected untracked historical handoff files.
- Slice A already registers `google-ads-search-reporting` in `createProductionCollectionRuntime`, with six strict SEARCH-only source contexts and validators.
- Slice B already provides `ADS_OPTIMIZATION_PACK_V1_RECIPE`, `TaskPackageEvidenceResolver.resolveCurrent(...)`, `TaskPackageAssembler.assemble(...)`, `TaskPackageStore`, and `writeAdsOptimizationPackage(...)`.
- `TaskPackageAssembler` already returns `NOT_READY` with per-requirement resolution or `READY` with a truthful `INITIAL_BASELINE`/`COMPARISON` manifest. It performs no acquisition.
- `TaskPackageStore.scanManifests()` validates manifest, workbook, table paths, regular-file/symlink boundaries, checksums, and row counts before treating a package as usable.
- `DesktopMultiSourceController` already owns Workspace-scoped Run reservation and exposes persisted Run state, while `DesktopExecutionService` owns in-process execution and retry continuation.
- `DesktopMultiSourceView` already implements task catalog/detail, Review-before-Start, Run Detail polling/actions, and the existing `retryDesktopFailed(run_id)` path.
- `src/main.ts` already enforces trusted IPC senders, owns `shell.openPath`/`shell.showItemInFolder`, composes repository/storage/runtime services, and exposes only typed preload methods to the sandboxed renderer.
- `StateRepository` already stores Workspace connection safe metadata and Run/Job/Attempt/Artifact provenance. Package manifests already store package history under `ApplicationDirectories.data/packages`; no missing persisted state was found.

## Reusable Desktop Seams

- Task discovery and navigation: `src/desktop-task-catalog.ts` and the existing task detail route in `src/DesktopMultiSourceView.tsx`.
- Safe Workspace/customer lookup: `StateRepository.getWorkspace(...)` and `getSourceConnection(...)`, using the existing `google-ads-search-terms` connection's normalized safe `customer_id` metadata.
- Provider readiness: the existing readiness/provider-configuration/credential-availability composition in `src/main.ts`; expose its fixed safe result to the Task Package controller rather than reading credentials there.
- Acquisition: `StateRepository.reserveRunFromJobPlans(...)`, `createGoogleAdsReportingJobContext(...)`, and `DesktopExecutionService.execute(...)`.
- Retry/recollection: existing Run Detail plus `DesktopMultiSourceController.retryFailed(...)`; Slice C links to that Run and does not introduce another retry primitive.
- Assembly/publication: Slice B `TaskPackageAssembler` and `writeAdsOptimizationPackage(...)`.
- Safe opening: extend `src/main/app/application-file-access.ts` and keep Electron `shell` calls in `src/main.ts`.
- IPC safety: typed contracts in `src/shared/application-info.ts`, narrow preload methods in `src/preload.ts`, trusted-sender handlers following the existing `*-ipc.ts` factory pattern.
- Deterministic UI verification: extend `tests/integration/app/desktop-ui-smoke.integration.cjs` and its existing local Vite/Playwright wrapper.

## Scope

- A source-neutral desktop Task Package Review/Start controller and recipe registration seam.
- Local-only Review of connection readiness, exact current window, existing identical package, prospective package kind, previous baseline/window, and all six evidence dispositions.
- Start behavior that publishes immediately when evidence is ready or reserves only missing requirements as ordinary Core Jobs when collection is required.
- Safe duplicate handling: an identical verified package is returned/opened, never republished.
- Existing Run Detail integration for acquisition progress, failure, resume/retry eligibility, and re-review after terminal completion.
- Safe package workbook opening through verified manifest/package identity.
- Typed renderer/preload/main IPC contracts and fail-closed payload validation.
- Truthful `NOT_READY`, `INITIAL_BASELINE`, `COMPARISON`, and existing-package UI states.
- Focused deterministic controller/IPC/UI gates and one release-gate entry for the new Slice C controller/IPC aggregate.
- Canonical documentation/handoff reconciliation only after implementation verification.

## Out of Scope

- Changes to Slice A provider queries, adapters, validators, or live-acceptance claims.
- Changes to Slice B evidence eligibility, baseline selection, manifest, workbook, or storage semantics except a narrow verified-workbook lookup needed by the safe-open boundary.
- Any provider call during Review, package assembly, publication, package opening, or deterministic tests.
- Performance Max and non-SEARCH evidence.
- A separate Ads-only Run database, controller shell, navigation system, retry mechanism, or file opener.
- Automatic background publication after process restart; after a collection Run becomes terminal, the renderer re-reviews local evidence and the user explicitly starts publication.
- Live Google Ads acceptance, quota use, provider setup, OAuth acquisition, or credential mutation.
- Schema/database migrations.

## Locked Workflow

1. Opening `Kampanya Gelişim` and choosing Review sends only Workspace/recipe intent to main.
2. Main resolves the current connection and current seven-day window, then uses only local manifests and accepted artifacts.
3. If a verified identical package already exists, Review returns `EXISTING_PACKAGE` and only Open is offered.
4. Otherwise each requirement is shown as `REUSE_EXACT`, `REUSE_FILTERED`, `NO_DATA`, `COLLECT_REQUIRED`, or `BLOCKED`.
5. Review status is `NOT_READY` when any requirement needs collection or is blocked; otherwise it is the assembler's `INITIAL_BASELINE` or `COMPARISON` kind, including previous window/gap only when present.
6. Start always re-resolves main-process state. Ready evidence is assembled and published. Missing evidence with a ready connection becomes one ordinary Core Run containing only missing dataset Jobs.
7. The UI opens that Run in existing Run Detail. Existing Core retry/recollection acts on failed Jobs only and preserves accepted siblings.
8. After the Run is terminal, Review is run again. If all six requirements are accepted, Start publishes; otherwise the remaining reason is shown without fabricating readiness.
9. Open resolves package/workbook identity again under main-process storage checks, then invokes Electron shell opening. The renderer never supplies an absolute path.

## Review Focus

1. A stale or tampered reviewed payload must not change Workspace, customer, recipe/version, SEARCH scope, or dates; Start re-resolves authoritative connection/window/evidence and fails closed on mismatch.
2. An exact `NO_DATA` result may be ready, while broader `NO_DATA` for the same requirement remains `COLLECT_REQUIRED`; controller tests must contrast these states through the real Slice B resolver.
3. A partial collection failure must keep accepted sibling evidence and expose only the existing failed-Job retry path; the package must remain unpublished until re-review finds all six accepted.
4. Duplicate clicks/races must not create two packages or two acquisition Runs for the same reviewed action; existing active/identical state must be returned or the request must fail closed.
5. Package opening must reject unknown, corrupt, path-escaping, symlinked, mismatched, or no-longer-valid workbook content without passing any attacker-controlled path to Electron shell.

---

### Task 1: Define the safe desktop Task Package contract and local Review

**Files:**
- Create: `src/shared/desktop-task-package.ts`
- Create: `src/main/app/desktop-task-package-controller.ts`
- Create: `src/main/app/ads-optimization-pack-desktop-composition.ts`
- Create: `tests/integration/app/desktop-task-package-controller.integration.cjs`
- Create: `tests/integration/app/run-desktop-task-package-controller-test.sh`
- Modify: `package.json`

**Interfaces:**
- `DesktopTaskPackageReviewIntent`: exact keys `workspace_id` and `recipe_id` only.
- `DesktopTaskPackageRequirementView`: safe `requirement_id`, `dataset_type`, `status`, and fixed `reason_codes`; statuses are `REUSE_EXACT | REUSE_FILTERED | NO_DATA | COLLECT_REQUIRED | BLOCKED`.
- `DesktopTaskPackageReview`: safe recipe/workspace/customer identity, `reference_date`, exact `current_window`, `status: NOT_READY | INITIAL_BASELINE | COMPARISON | EXISTING_PACKAGE`, optional verified previous/existing package identifiers/windows, `can_start`, `can_open`, `collection_run_id`, and six requirement views.
- `DesktopTaskPackageErrorCode`: a closed safe-code union covering invalid intent, unknown Workspace/recipe, connection/configuration requirement, stale review, active matching collection, missing/invalid package, Core start failure, and publication failure; internal exception text is not part of the shared contract.
- `DesktopTaskPackageResponse<T>`: `{ ok: true; result: T } | { ok: false; error: { code: DesktopTaskPackageErrorCode; retryable: boolean } }` for every renderer-facing package operation.
- `DesktopTaskPackageDefinition`: recipe plus safe connection anchor, Job-plan builder, and package publisher callbacks; the generic controller does not import Google Ads request builders or workbook columns.
- `DesktopTaskPackageController.review(intent): Promise<DesktopTaskPackageReview>` consumes the definition registry, repository, safe connection-readiness callback, assembler, and store. It never receives a requester/acquirer dependency.
- `createAdsOptimizationPackDesktopDefinition(...)` registers `ADS_OPTIMIZATION_PACK_V1_RECIPE`, anchors to `google-ads-search-terms`, and maps requirements through `createGoogleAdsReportingJobContext(...)` only when Start later requests missing Jobs.

- [ ] **Step 1: Write RED shared-contract and local-review tests**

Assert exact-key intent validation; unknown Workspace/recipe rejection; normalized safe customer identity from connection metadata; exact seven-day window; exactly six unique requirement views; correct `REUSE_EXACT`, `REUSE_FILTERED`, `NO_DATA`, and `COLLECT_REQUIRED` mappings; and no raw rows, paths, credentials, exception messages, or provider payloads in the returned object.

- [ ] **Step 2: Add RED readiness and temporal-truth tests**

Assert missing connection/configuration/credential readiness yields fixed `BLOCKED` reason codes and `can_start = false`; exact `NO_DATA` is ready; broader `NO_DATA` remains `COLLECT_REQUIRED`; broader populated DAILY rows become `REUSE_FILTERED`; and Review invokes no publisher, Core executor, requester, or repository mutation.

Also provide a matching non-terminal collection Run and assert Review returns its safe `collection_run_id`, keeps `NOT_READY`, and disables another Start while allowing the UI to open the existing Run Detail.

- [ ] **Step 3: Add RED package-kind and duplicate tests**

With all six requirements ready, assert the controller reports `INITIAL_BASELINE` or `COMPARISON` exactly as returned by the assembler, including previous window and `gap_days` only for comparison. Add a valid identical stored package and assert `EXISTING_PACKAGE`, `can_start = false`, `can_open = true`, and no new package identity is created.

- [ ] **Step 4: Run the focused test and verify RED**

Run: `npm run test:m7:ads-optimization-pack-desktop-controller`

Expected: FAIL because the desktop Task Package contract/controller/registration do not exist.

- [ ] **Step 5: Implement the minimal contract, generic controller, and Ads registration**

Keep fixed reason-code mapping at the main/shared boundary. Use the existing assembler as the only authority for evidence readiness and package kind; do not duplicate candidate eligibility or baseline rules in the renderer.

- [ ] **Step 6: Run focused GREEN and Slice B regression**

Run: `npm run test:m7:ads-optimization-pack-desktop-controller`

Run: `npm run test:m7:ads-optimization-pack`

Expected: PASS without provider calls.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/shared/desktop-task-package.ts src/main/app/desktop-task-package-controller.ts src/main/app/ads-optimization-pack-desktop-composition.ts tests/integration/app/desktop-task-package-controller.integration.cjs tests/integration/app/run-desktop-task-package-controller-test.sh package.json
git commit -m "feat: review ads optimization packages"
```

---

### Task 2: Start missing Core Jobs or publish ready evidence, and resolve safe workbook opening

**Files:**
- Modify: `src/shared/desktop-task-package.ts`
- Modify: `src/main/app/desktop-task-package-controller.ts`
- Modify: `src/main/app/ads-optimization-pack-desktop-composition.ts`
- Modify: `src/main/app/application-file-access.ts`
- Modify: `tests/integration/app/desktop-task-package-controller.integration.cjs`
- Modify: `tests/integration/app/application-file-access.integration.cjs`

**Interfaces:**
- `DesktopTaskPackageStartIntent`: exact keys `workspace_id`, `recipe_id`, `recipe_version`, `reference_date`, `current_window`, and `account_identity`; the two nested objects accept only `start`/`end` and `field`/`value` respectively. No path or credential field is accepted.
- `DesktopTaskPackageStartResult`: `PACKAGE_PUBLISHED | EXISTING_PACKAGE | COLLECTION_STARTED`, with either a safe package summary or the existing `DesktopRunState`.
- `DesktopTaskPackageController.start(intent): Promise<DesktopTaskPackageStartResult>` re-runs local review before mutation. It publishes only `READY` assembly or reserves only `MISSING` requirements as Core `JobPlan`s and delegates execution through injected `execute_run(run_id)`.
- The Ads definition builds each missing `JobPlan` with source `google-ads-search-reporting`, `job_key = dataset_type`, and the existing immutable context fields: source/dataset/resource, `campaign_type = SEARCH`, normalized customer ID, exact current dates, and schema version `1`.
- `resolveTaskPackageWorkbook(packages_root, package_id): Promise<string>` returns an absolute workbook path only after the package manifest, identity, workbook filename, regular-file boundary, and containment checks pass.

- [ ] **Step 1: Write RED ready-publication tests**

Start from a reviewed all-ready initial baseline and comparison. Assert Start re-resolves authoritative state, generates a safe unique package ID in main, calls the existing assembler and Ads publisher exactly once, returns only safe package fields, preserves raw artifact hashes, and publishes the existing workbook/manifest contract without provider execution.

- [ ] **Step 2: Add RED duplicate/stale/race tests**

Assert an identical verified package returns `EXISTING_PACKAGE`; a customer/window/recipe mismatch between Review and Start fails before mutation; a matching non-terminal Core Run returns the existing Run rather than reserving another; a second concurrent Start cannot publish or reserve duplicate work; and `TaskPackageStore` collision refusal is surfaced as a fixed safe failure without leaking an absolute path.

- [ ] **Step 3: Add RED missing-evidence collection tests**

For two missing and four reusable requirements, assert exactly two Jobs are atomically reserved in one Run, each source context matches `createGoogleAdsReportingJobContext`, accepted siblings are not recollected, the assembler/publisher is not called, and execution goes only through injected Core `execute_run`. Assert blocked readiness reserves nothing.

- [ ] **Step 4: Add RED failure/retry-boundary tests**

Drive the resulting Run to one failed and one accepted Job with deterministic fakes. Assert the package stays absent, Review preserves the accepted evidence and marks only the failed/missing requirement for collection, and the returned Run identity works with existing `getDesktopRunState`/`retryDesktopFailed`; do not add a Task Package retry method.

- [ ] **Step 5: Add RED safe-open resolution tests**

Assert valid initial/comparison workbooks resolve. Reject blank/unsafe/unknown package IDs, missing/corrupt manifests, package-directory/manifest identity mismatch, absent workbook, symlinked workbook, non-file workbook, absolute/traversal filename, and path escape. Assert the resolver never trusts a renderer-supplied path.

- [ ] **Step 6: Run focused tests and verify RED**

Run: `npm run test:m7:ads-optimization-pack-desktop-controller`

Run: `npm run test:m5:file-access`

Expected: FAIL on Start and safe package opening before implementation.

- [ ] **Step 7: Implement minimal Start, Core Job reservation, publication, and safe-open resolution**

Do not wait synchronously for provider execution and do not auto-publish after a Run finishes. Return `COLLECTION_STARTED`, use existing Run Detail/polling/retry, then require a fresh local Review before publication.

- [ ] **Step 8: Run focused and adjacent GREEN**

Run:

```bash
npm run test:m7:ads-optimization-pack-desktop-controller
npm run test:m5:file-access
npm run test:m5:desktop-retry-export
npm run test:m3:google-ads-search-reporting
npm run test:m7:ads-optimization-pack
```

Expected: PASS; no live provider call.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/shared/desktop-task-package.ts src/main/app/desktop-task-package-controller.ts src/main/app/ads-optimization-pack-desktop-composition.ts src/main/app/application-file-access.ts tests/integration/app/desktop-task-package-controller.integration.cjs tests/integration/app/application-file-access.integration.cjs
git commit -m "feat: start and open ads optimization packages"
```

---

### Task 3: Add trusted IPC, preload, and production main-process composition

**Files:**
- Create: `src/main/app/desktop-task-package-ipc.ts`
- Modify: `src/shared/application-info.ts`
- Modify: `src/preload.ts`
- Modify: `src/main.ts`
- Create: `tests/integration/app/desktop-task-package-ipc.integration.cjs`
- Create: `tests/integration/app/run-desktop-task-package-ipc-test.sh`
- Create: `tests/integration/app/desktop-task-package-composition.integration.cjs`
- Create: `tests/integration/app/run-desktop-task-package-composition-test.sh`
- Modify: `package.json`

**Interfaces:**
- Add IPC channels `DESKTOP_TASK_PACKAGE_REVIEW`, `DESKTOP_TASK_PACKAGE_START`, and `DESKTOP_TASK_PACKAGE_OPEN`.
- Add preload methods `reviewDesktopTaskPackage(intent)`, `startDesktopTaskPackage(intent)`, and `openDesktopTaskPackage(input: { package_id: string })`.
- `createDesktopTaskPackageHandlers(...)` validates trusted sender first, exact intent shapes second, delegates to the controller third, and validates the safe response shape before returning it.
- `src/main.ts` composes one `TaskPackageStore` at `path.join(directories.data, 'packages')`, the existing `ProductionDataPackageLoader`, `TaskPackageEvidenceResolver`, `TaskPackageAssembler`, Ads desktop definition, controller, existing readiness/credential services, Core Run executor, publisher, and safe workbook opener.

- [ ] **Step 1: Write RED IPC trust/payload/response tests**

For Review/Start/Open, assert untrusted senders are rejected before delegation; non-object, extra-key, blank-ID, wrong-recipe/version, malformed date/window, and path-bearing payloads fail closed; service exceptions become fixed safe failures; and returned objects contain no credential references, tokens, raw rows, unrestricted paths, or unknown keys.

- [ ] **Step 2: Write RED preload channel tests**

Extend the existing preload test approach to assert each method invokes only its exact channel and forwards only its typed safe intent.

- [ ] **Step 3: Write RED production-composition test**

Using a temporary repository/storage root and deterministic fakes, assert production composition resolves local review, reserves missing Jobs through the existing repository, delegates execution through `DesktopExecutionService`, publishes ready evidence under `data/packages`, and opens only the main-resolved verified workbook. Record zero requester/provider calls.

- [ ] **Step 4: Run IPC/composition tests and verify RED**

Run: `npm run test:m7:ads-optimization-pack-desktop-ipc`

Run: `npm run test:m7:ads-optimization-pack-desktop-composition`

Expected: FAIL because channels, handlers, preload methods, and production wiring are absent.

- [ ] **Step 5: Implement handlers and preload surface**

Follow existing handler-factory patterns so payload validation is testable without Electron. Keep Electron `shell` calls and all filesystem paths in main.

- [ ] **Step 6: Implement production composition in `src/main.ts`**

Reuse existing repository/runtime/readiness instances. Do not initialize another database, credential store, execution service, or Ads provider runtime.

- [ ] **Step 7: Run focused and privilege-boundary GREEN**

Run:

```bash
npm run test:m7:ads-optimization-pack-desktop-ipc
npm run test:m7:ads-optimization-pack-desktop-composition
npm run test:m5:connection-write-ipc
npm run test:m5:connection-write-main-ipc
npx tsc --noEmit
```

Expected: PASS; renderer/preload receive no Node or filesystem privilege.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/main/app/desktop-task-package-ipc.ts src/shared/application-info.ts src/preload.ts src/main.ts tests/integration/app/desktop-task-package-ipc.integration.cjs tests/integration/app/run-desktop-task-package-ipc-test.sh tests/integration/app/desktop-task-package-composition.integration.cjs tests/integration/app/run-desktop-task-package-composition-test.sh package.json
git commit -m "feat: compose task package desktop IPC"
```

---

### Task 4: Add the `Kampanya Gelişim` desktop workflow and deterministic UI coverage

**Files:**
- Modify: `src/desktop-task-catalog.ts`
- Modify: `src/DesktopMultiSourceView.tsx`
- Modify: `src/index.css`
- Modify: `tests/integration/app/desktop-ui-smoke.integration.cjs`

**Interfaces:**
- Change the catalog definition to a discriminated union with `task_kind: COLLECTION` retaining the existing `source_id` contract and `task_kind: TASK_PACKAGE` carrying `recipe_id`. Add one Task Package entry keyed by `ADS_OPTIMIZATION_PACK` with label `Kampanya Gelişim`; branch on `task_kind` before reading `source_id`, and exclude package entries from collection presets and source freshness/run matching.
- The task detail invokes Task Package Review directly and shows the current window, Google Ads readiness, package state, previous eligible window/gap when present, and six requirement statuses.
- Review actions are state-specific: `Open Workbook` for `EXISTING_PACKAGE`; `Start Collection` for actionable `NOT_READY`; `Assemble Package` for `INITIAL_BASELINE`/`COMPARISON`; no Start for blocked state.
- `COLLECTION_STARTED` opens the existing Run Detail using the returned Run state. Existing Run Detail provides polling, accepted-evidence opening, and retry; a `Review Kampanya Gelişim Again` action returns to fresh local Review after terminal state.
- `PACKAGE_PUBLISHED` shows package kind, windows, package ID, and `Open Workbook`; it does not show analysis or recommendations.

- [ ] **Step 1: Write RED task-card and local-review UI tests**

Assert the catalog contains one `Kampanya Gelişim` card, opening it does not create a normal draft, Review invokes only `reviewDesktopTaskPackage`, and the page renders exact current dates plus all six statuses with truthful `NOT_READY` and fixed readiness copy.

- [ ] **Step 2: Add RED baseline/comparison/duplicate UI tests**

Assert `INITIAL_BASELINE` explicitly says no prior comparison exists and renders no invented previous values; `COMPARISON` renders previous window and neutral `gap_days` without judgment; `EXISTING_PACKAGE` disables creation and offers Open; and none of the forbidden analysis/action terms or fields appears.

- [ ] **Step 3: Add RED Start/Run Detail/retry UI tests**

Assert Start is disabled for blocked reviews; actionable missing evidence calls Start once and transitions to existing Run Detail; failed Jobs use only `retryDesktopFailed(run_id)`; accepted siblings stay visible; terminal completion offers re-review; ready evidence publishes and opens through `openDesktopTaskPackage({ package_id })` without passing a path.

- [ ] **Step 4: Add RED missing-versus-zero and exact-NO_DATA presentation tests**

Assert `COLLECT_REQUIRED` is never presented as zero/no rows, exact `NO_DATA` is explicitly labeled provider-accepted no data for the exact window, and zero-valued evidence is not rewritten as missing.

- [ ] **Step 5: Run UI smoke and verify RED**

Run: `npm run test:m5:desktop-ui`

Expected: FAIL because the package task and renderer flow are absent.

- [ ] **Step 6: Implement the smallest workflow in the existing component/styles**

Reuse existing task detail, review panels, status badges, action layout, message handling, and Run Detail. Do not add a router, separate Ads application, direct filesystem access, or provider logic to React.

- [ ] **Step 7: Run UI and adjacent desktop GREEN**

Run:

```bash
npm run test:m5:desktop-ui
npm run test:m5:desktop-multisource
npm run test:m5:desktop-retry-export
npm run lint
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/desktop-task-catalog.ts src/DesktopMultiSourceView.tsx src/index.css tests/integration/app/desktop-ui-smoke.integration.cjs
git commit -m "feat: add ads optimization desktop workflow"
```

---

### Task 5: Add the Slice C gate, verify the milestone, and reconcile documentation

**Files:**
- Create: `tests/integration/app/run-ads-optimization-pack-slice-c-gate.sh`
- Modify: `tests/integration/release/run-release-gate.sh`
- Modify: `package.json`
- Modify after verified implementation only: `ARCHITECTURE.md`
- Modify after verified implementation only: `DATA_CONTRACTS.md`
- Modify after verified implementation only: `DECISIONS.md`
- Modify after verified implementation only: `TEST_STRATEGY.md`
- Modify after verified implementation only: `PROJECT_HANDOFF.md`

**Interfaces:**
- Produce `npm run test:m7:ads-optimization-pack-desktop` as the focused deterministic Slice C controller/IPC/composition gate with one stable PASS line: `PASS ADS-OPTIMIZATION-PACK-DESKTOP-GATE-001`.
- Keep the existing Slice B gate and existing desktop UI smoke entry each wired once in the release gate; add only the new Slice C non-UI aggregate once.
- Keep every live Google/provider command outside ordinary tests and outside `test:release:gate`.

- [ ] **Step 1: Add the aggregate deterministic gate**

Run the controller, IPC, and production-composition scripts in deterministic order. Do not duplicate their child scripts directly in the release gate.

- [ ] **Step 2: Run the focused Slice C and UI gates**

Run:

```bash
npm run test:m7:ads-optimization-pack-desktop
npm run test:m5:desktop-ui
```

Expected: PASS with no live provider call.

- [ ] **Step 3: Run adjacent deterministic regressions**

Run:

```bash
npm run test:m7:ads-optimization-pack
npm run test:m3:google-ads-search-reporting
npm run test:m5:desktop-multisource
npm run test:m5:desktop-retry-export
npm run test:m6:production-data-package
npm run test:m6:data-package
npm run lint
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Wire the Slice C aggregate into the release gate and run it**

Run: `npm run test:release:gate`

Expected: PASS `RELEASE-GATE-001`; the new Slice C aggregate appears once, the Slice B aggregate appears once, the desktop UI smoke appears once, and no live Google/provider call occurs.

- [ ] **Step 5: Perform the implementation diff/security review**

Inspect `git diff`, `git diff --cached`, and `git status --short`. Confirm no secrets/credential refs/raw provider bodies/absolute paths cross IPC, no acquisition dependency entered Task Package assembly, no schema/migration changed, only SEARCH contexts can be reserved, and the two protected files remain untouched and untracked.

- [ ] **Step 6: Reconcile canonical documentation from verified facts only**

Document the source-neutral desktop package controller, safe IPC/open boundary, existing Core retry ownership, deterministic gates, no-migration result, and exact implemented Slice C state. Keep live Google Ads acceptance explicitly separate and unverified. Do not update `PROJECT_SPEC.md` unless implementation proves a genuine product-contract change.

- [ ] **Step 7: Run final hygiene checks**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` exits `0`; status contains only the intended Slice C implementation/docs plus the two untouched protected untracked files.

- [ ] **Step 8: Commit the gate and verified documentation as narrow checkpoints**

```bash
git add tests/integration/app/run-ads-optimization-pack-slice-c-gate.sh tests/integration/release/run-release-gate.sh package.json
git commit -m "test: gate ads optimization desktop workflow"

git add ARCHITECTURE.md DATA_CONTRACTS.md DECISIONS.md TEST_STRATEGY.md PROJECT_HANDOFF.md
git commit -m "docs: record ads optimization desktop workflow"
```

Do not stage or commit the two protected historical files.

---

## Acceptance Criteria

- `Kampanya Gelişim` is available in the existing desktop task catalog without a parallel Ads-only desktop architecture.
- Review is local-only and reports the exact seven-day current window, safe Google Ads readiness, and all six evidence outcomes without provider calls.
- Exact evidence, filtered broader populated DAILY evidence, and exact-window `NO_DATA` are presented truthfully; broader `NO_DATA` remains insufficient for a narrower window.
- `NOT_READY`, `INITIAL_BASELINE`, `COMPARISON`, and `EXISTING_PACKAGE` are distinct, truthful states.
- An initial baseline contains no invented PREVIOUS data; a comparison shows only the immutable baseline chosen by Slice B and treats gaps neutrally.
- Start revalidates authoritative main-process state and never trusts renderer paths, credentials, customer/window changes, or package readiness.
- Ready evidence is assembled/published without acquisition. Missing evidence creates only the missing SEARCH reporting Jobs in the existing Core lifecycle.
- Partial failure preserves accepted evidence, blocks publication, and retries only through the existing Run Detail/Core retry path.
- The Task Package assembler/controller never acquires, retries, authenticates, or calls a provider directly.
- An identical verified package is opened/returned instead of duplicated.
- Package opening accepts only a verified stored package ID and resolves the workbook wholly inside the main process.
- Renderer/preload IPC exposes safe fixed contracts only; no secret, raw provider body, internal path, or unrestricted error text crosses the boundary.
- Missing remains missing/blank, provider zero remains zero, raw evidence remains immutable, and provenance remains traceable.
- No analysis, recommendation, score, CPA/ROAS decision, GO/PAUSE, budget/bid action, or optimization judgment is introduced.
- No database/schema migration is added.
- Focused Slice C, UI, adjacent Slice A/B, type, lint, and full release gates pass deterministically without live provider calls.
- Canonical documentation records only verified implementation; live Google Ads acceptance remains a separate explicitly authorized step.

## Resolved Architecture Decisions

- Use a generic desktop Task Package controller plus a thin Ads recipe registration, not an Ads-only controller or changes to source-neutral Core.
- Keep Review local-only and make Start re-resolve authoritative state.
- Publish immediately only when all six local requirements are ready; otherwise start one ordinary Core Run containing only missing Jobs.
- Return the collection Run to existing Run Detail and require a fresh Review before publication after terminal completion.
- Reuse existing Core retry/recollection; add no package retry API.
- Keep package history manifest-backed under `data/packages`; no schema/database migration is required.
- Extend the main-process safe file resolver and open by package ID; never expose or accept an absolute path in renderer IPC.

## Unresolved Decisions

None. If implementation reveals a contradiction in the approved Slice A/B contracts or current repository interfaces, stop planning/execution at that point and return to design review rather than silently changing those contracts.
