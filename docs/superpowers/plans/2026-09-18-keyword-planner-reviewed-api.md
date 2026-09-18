# Keyword Planner Reviewed Official API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the truthful reviewed desktop-to-provider vertical for Google Ads Keyword Planner historical metrics using explicit keyword groups persisted in each Job context.

**Architecture:** Reuse the existing desktop reviewed-artifact boundary, source-neutral Job planning, Google credential runtime, Keyword Planner adapter, validator, and Core orchestrator. Add only source-specific Keyword Planner context validation and UI input; build the provider request during `collect(context)` so Review, persisted Job context, Start, and the final request share the same group and ordered keyword list.

**Tech Stack:** TypeScript, React, Electron trusted IPC, SQLite repository, Node test runner, deterministic mocked HTTP requester.

**Spec:** `PROJECT_SPEC.md` sections 4.4, 8, 9, 12-14; `SOURCE_MODULE_GUIDE.md` Keyword Planner contract; accepted Release 1.0 continuation request.

## Global Constraints

- Official API and manual CSV fallback retain distinct acquisition provenance; this plan implements only `OFFICIAL_API`.
- Missing provider metrics remain `NULL`; raw provider JSON is preserved before normalization.
- Ordinary tests make zero live-provider requests.
- Credentials and secrets never enter drafts, Jobs, snapshots, logs, exports, or renderer state.
- Do not generalize this slice to arbitrary Google Ads APIs or add marketing/keyword-selection logic.
- Preserve the two historical untracked handoff files unchanged.

---

### Task 1: Source context and provider request binding

**Files:**
- Create: `src/main/sources/google-ads/keyword-planner-request.ts`
- Modify: `src/main/sources/google-ads/google-ads-sources.ts`
- Modify: `src/main/sources/google-api/google-api-runtime.ts`
- Modify: `src/main/app/production-collection-runtime.ts`
- Test: `tests/integration/google-api/keyword-planner-reviewed-api.integration.cjs`
- Test: `tests/integration/google-api/run-keyword-planner-reviewed-api-test.sh`

**Interfaces:**
- Consumes: `SourceCollectionContext.source_context`.
- Produces: `KeywordPlannerJobContext` with exact `task_id`, `source_id`, `source_mode`, `group_id`, and ordered non-empty `keywords`; `GoogleKeywordPlannerSource.collect(context)` binds this context to `fetchKeywordPlanner`.

- [x] **Step 1: Write the failing source-context test**

Create a source through `GoogleApiRuntimeFactory`, call it twice with different valid Job contexts, and assert each mocked provider request receives that call's ordered keywords. Assert malformed, empty, mismatched-source, and mismatched-mode contexts fail before requester invocation.

- [x] **Step 2: Run the focused test and verify RED**

Run: `bash tests/integration/google-api/run-keyword-planner-reviewed-api-test.sh`

Expected: FAIL because `GoogleKeywordPlannerSource` still captures constructor keywords and ignores `collect(context)`.

- [x] **Step 3: Implement minimal source-context validation and dynamic binding**

Add a strict request-context parser. Remove constructor keyword storage from normal runtime creation. In production composition, create the Workspace source without extracting keywords; let `collect(context)` validate and forward the persisted Job context.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `bash tests/integration/google-api/run-keyword-planner-reviewed-api-test.sh`

Expected: the source-context case passes with no live requests.

### Task 2: Reviewed draft and persisted Job groups

**Files:**
- Modify: `src/main/app/desktop-multisource-controller.ts`
- Test: `tests/integration/google-api/keyword-planner-reviewed-api.integration.cjs`

**Interfaces:**
- Consumes: reusable source config `{ included: true, task_id: 'keyword-planner-historical-metrics', groups: [{ group_id, group_name, keywords }] }`.
- Produces: immutable reviewed artifact and one `JobPlan` per group whose `source_context` exactly matches the provider request context.

- [x] **Step 1: Write the failing Review-to-Core test**

Use two literal groups, Review at a fixed clock, advance the clock before Start, reopen the repository, run through the production orchestrator with intercepted HTTP, and assert group order, Job contexts, raw artifacts, and exact request keyword arrays.

- [x] **Step 2: Run the focused test and verify RED**

Run: `bash tests/integration/google-api/run-keyword-planner-reviewed-api-test.sh`

Expected: FAIL because `resolveReviewedDraft` returns `null` for Keyword Planner and Start cannot consume a reviewed artifact.

- [x] **Step 3: Implement minimal reviewed Keyword Planner resolution**

Validate and clone named groups during Review, add the fixed official-API source semantics to each resolved group, preserve the reference date as review provenance without inventing a requested date range, and reuse the existing generic group Job planner.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `bash tests/integration/google-api/run-keyword-planner-reviewed-api-test.sh`

Expected: Review, persistence, reopen, Core execution, and mocked requests pass.

### Task 3: Explicit desktop keyword-group input

**Files:**
- Modify: `src/DesktopMultiSourceView.tsx`
- Modify: `src/index.css` only if existing form styles are insufficient
- Test: `tests/integration/app/desktop-ui-smoke.integration.cjs`

**Interfaces:**
- Consumes: user-entered lines in `group_id: keyword one, keyword two` form.
- Produces: explicit ordered Keyword Planner groups in the reusable draft; Review displays the exact reviewed keywords before Start.

- [x] **Step 1: Write the failing renderer smoke flow**

Make Keyword Planner READY, open its task, enter two named groups, Review, and assert the IPC draft contains the exact groups and Start receives the exact reviewed artifact. Assert empty/malformed input cannot Review.

- [x] **Step 2: Run the UI smoke test and verify RED**

Run: `npm run test:m5:desktop-ui`

Expected: FAIL because Keyword Planner has no task-specific input and Quick Run remains disabled.

- [x] **Step 3: Implement the smallest explicit group editor**

Add local input state, deterministic parsing/validation, source configuration construction, Review eligibility, and exact reviewed-group presentation. Do not infer or recommend keywords.

- [x] **Step 4: Run focused UI and source tests and verify GREEN**

Run: `npm run test:m5:desktop-ui`

Run: `bash tests/integration/google-api/run-keyword-planner-reviewed-api-test.sh`

Expected: both pass.

### Task 4: Regression, release integration, and checkpoint

**Files:**
- Modify: `tests/integration/release/run-release-gate.sh`
- Modify: `PROJECT_HANDOFF.md` after the technical commit

**Interfaces:**
- Consumes: the focused deterministic suite.
- Produces: release-gate coverage and an exact living-state checkpoint.

- [x] **Step 1: Wire the focused suite into the deterministic release gate**

Add the Keyword Planner reviewed official-API runner beside the existing Ads/GSC reviewed-request suites.

- [x] **Step 2: Run coherent verification**

Run the focused suite, Google API adapters, Google credential composition, desktop multi-source/UI regressions, typecheck, lint, `git diff --check`, and `npm run test:release:gate`.

- [x] **Step 3: Inspect the complete diff and commit the technical slice**

Commit only implementation, tests, release wiring, and this plan with message `feat(keyword-planner): bind reviewed groups to API requests`.

- [x] **Step 4: Document and commit the checkpoint separately**

Append exact verification evidence, no-live status, remaining manual CSV/live-acceptance gaps, and the next accepted slice to `PROJECT_HANDOFF.md`; commit with a docs-only message.

- [x] **Step 5: Fast-forward local main**

Switch to `main`, fast-forward this branch, verify status, and continue to the FILE_IMPORT + İkas audit.
