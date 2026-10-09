# Google Ads Conversion-Date Performance Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Preserve the existing uncommitted RED tests.

**Goal:** Add explicitly reviewed v3 conversion-date evidence for three SEARCH datasets and a separate desktop task.

**Architecture:** Extend the existing Google Ads reporting source and its versioned context. Reuse source-specific adapters, validation, Workspace connection, and common Task Detail/Review/Run path. Reject v2/v3 Job collisions at Review.

**Tech Stack:** TypeScript, Electron/React, existing CJS integration tests.

**Spec:** `docs/superpowers/specs/2026-10-09-google-ads-conversion-date-reporting-design.md`

## Global constraints

- Root/scoped `AGENTS.md` and `TEST_STRATEGY.md` take precedence over simplification advice.
- v2 remains default; v1 historical readability and v2 package eligibility remain intact.
- Only campaign, ad group, and keyword reporting acquire v3. No live provider calls.
- Preserve current uncommitted RED tests and unrelated work. No push or merge.

## File map and verification entry points

- Source contract/query: `src/shared/google-ads-search-reporting.ts`; `src/main/sources/google-ads/{search-reporting-request,search-reporting-source,campaigns-request,ad-groups-request,keywords-request}.ts`; `tests/integration/google-api/run-google-ads-search-reporting-gate.sh`.
- Normalization, validation, accepted export: `src/main/sources/google-ads/{reporting-row-helpers,campaigns-adapter,ad-groups-adapter,keywords-adapter,search-reporting-validator}.ts`; `src/main/export/production-data-package-loader.ts`; `tests/integration/export/run-production-data-package-loader-test.sh`.
- Desktop contract/flow: `src/shared/desktop-multisource.ts`; `src/desktop-task-catalog.ts`; `src/main/app/desktop-multisource-controller.ts`; `src/DesktopMultiSourceView.tsx`; `tests/integration/app/{run-desktop-multisource-flow-test,run-desktop-ui-smoke-test}.sh`.
- Package eligibility: `tests/integration/task-packages/task-package-evidence-resolver.integration.cjs`; `tests/integration/task-packages/run-ads-optimization-pack-gate.sh`. No recipe edit.

## Tasks

- [x] **Versioned request contract and GAQL.** Extend `src/shared/google-ads-search-reporting.ts`, `src/main/sources/google-ads/search-reporting-request.ts`, the three approved request builders, and `search-reporting-source.ts`. Preserve the existing RED tests in `tests/integration/google-api/google-ads-campaign-ad-group-reporting.integration.cjs` and `google-ads-keyword-search-term-reporting.integration.cjs`; add context/default/unsupported-dataset coverage. Observe RED, implement v3 opt-in and fail-closed acquisition, then run focused tests. Preserve exact v2 query output.
- [x] **Normalized evidence and validation.** Extend the three approved adapters, `reporting-row-helpers.ts`, shared row types, `search-reporting-validator.ts`, and `src/main/export/production-data-package-loader.ts`. Focused tests cover four separate fields, missing/null/zero, raw bytes, accepted v3 evidence, and v1/v2 compatibility.
- [x] **Reviewed planning and desktop task.** Use `src/desktop-task-catalog.ts`, `src/main/app/desktop-multisource-controller.ts`, `src/shared/desktop-multisource.ts`, and `src/DesktopMultiSourceView.tsx`. The separate task fixes three v3 Jobs and uses the common Task Detail/Review route. Controller and Playwright tests cover task discovery, account/date/readiness display, exact reviewed context/start, account changes, mixed-version blockers, and existing task behavior.
- [x] **Compatibility and documentation.** Relevant deterministic source, planner, renderer, historical v1/v2, and `ADS_OPTIMIZATION_PACK v2` gates passed. The adjacent Slice C task-package gate fails on its pre-existing checked-in v1 fixture versus the active v2 recipe; it does not gate this P2-02 source/UI checkpoint. Owning contract, status register, and current handoff record this bounded result. No packaged/runtime or live-provider claim.

## Acceptance

All three v3 datasets collect four additional native metrics; v2 remains unchanged/default; v1 historical evidence remains readable; invalid/mixed plans fail before Run/provider requests; the separate Task Detail supports Review → Start with exact persisted scope; v2 package regressions pass. Claims remain bounded to executed verification.
