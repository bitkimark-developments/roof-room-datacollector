# Generic Run Resolution + GSC Current 90 Days Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Review-time Run resolution and prove it end-to-end with GSC Current 90 Days without Review-to-Start date drift.

**Architecture:** Reusable intent remains relative. Review captures one local reference date and creates exact provider-facing configuration. Start consumes that reviewed artifact directly and never resolves dynamic dates again.

**Tech Stack:** TypeScript, Electron, React, existing DesktopMultiSourceController, SQLite and Core orchestration.

**Spec:** `docs/superpowers/specs/2026-09-14-generic-run-resolution-gsc-current-design.md`

## Global constraints

- reference_date uses local macOS calendar date as YYYY-MM-DD.
- renderer performs no collection date arithmetic.
- reusable configuration preserves relative policy.
- Start does not re-resolve reviewed dynamic configuration.
- task_id and source_id remain separate.
- only TODAY_MINUS_90_TO_YESTERDAY is added in this slice.
- only gsc-current-90-days becomes the first non-Ikas dynamic Quick Run.
- historical untracked handoff files remain untouched.

## Task 1 - Deterministic date resolver

**Create:** `src/shared/desktop-run-resolution.ts`
**Test:** `tests/integration/app/desktop-multisource-flow.integration.cjs`
**Run:** `npm run test:m5:desktop-multisource`

- [ ] Add RED asserting `TODAY_MINUS_90_TO_YESTERDAY` plus `2026-09-14` resolves to `2026-06-16` and `2026-09-13`.
- [ ] Add RED proving local reference-date formatting uses local calendar fields rather than UTC truncation.
- [ ] Implement strict YYYY-MM-DD validation and explicit calendar-day arithmetic.
- [ ] Keep the policy enum intentionally limited to TODAY_MINUS_90_TO_YESTERDAY.
- [ ] Run targeted test, typecheck and diff check.
- [ ] Commit `feat: add desktop run date resolution`.

## Task 2 - Reviewed Run artifact

**Modify:** `src/shared/desktop-multisource.ts`
**Modify:** `src/main/app/desktop-multisource-controller.ts`
**Test:** `tests/integration/app/desktop-multisource-flow.integration.cjs`

- [ ] Add RED for GSC Current Review with task_id, source_id, reference_date, date_policy and exact date_ranges.
- [ ] Review captures local reference date once.
- [ ] Review creates planner-ready resolved_configuration.
- [ ] Existing Ikas file_path behavior remains unchanged.
- [ ] Run targeted test, typecheck and diff check.
- [ ] Commit `feat: resolve reviewed desktop run configuration`.

## Task 3 - Start exact reviewed configuration

**Modify:** `src/main/app/desktop-multisource-controller.ts`
**Modify:** `src/shared/desktop-multisource.ts`
**Modify:** `src/shared/application-info.ts`
**Modify:** `src/preload.ts`
**Modify:** `src/main.ts`
**Test:** `tests/integration/app/desktop-multisource-flow.integration.cjs`

- [ ] Add RED where Review occurs on 2026-09-14 and injected clock advances to 2026-09-15 before Start.
- [ ] Assert persisted Run and Job still use 2026-06-16 through 2026-09-13.
- [ ] Change Start boundary to consume the reviewed artifact.
- [ ] Re-check readiness without running the date resolver again.
- [ ] Persist task_id, source_id, policy, reference_date, resolved_at and absolute range.
- [ ] Keep exact dates in Job source_context.
- [ ] Run targeted test, existing Ikas coverage, typecheck and diff check.
- [ ] Commit `feat: start exact reviewed run configuration`.

## Task 4 - GSC Current task policy metadata

**Modify:** `src/desktop-task-catalog.ts`
**Test:** `tests/integration/app/desktop-ui-smoke.integration.cjs`

- [ ] Add machine-readable TODAY_MINUS_90_TO_YESTERDAY metadata only to gsc-current-90-days.
- [ ] Keep existing human-readable default_summary.
- [ ] Do not add policies for other tasks yet.
- [ ] Run `npm run test:m5:desktop-ui` and typecheck.
- [ ] Commit `feat: define GSC current run policy`.

## Task 5 - GSC Current Quick Run Review UI

**Modify:** `src/DesktopMultiSourceView.tsx`
**Test:** `tests/integration/app/desktop-ui-smoke.integration.cjs`

- [ ] Add RED opening GSC Current and invoking Review.
- [ ] Assert Review shows reference date 2026-09-14.
- [ ] Assert Review shows resolved range 2026-06-16 through 2026-09-13.
- [ ] Enable Quick Run only for GSC Current among the currently disabled non-Ikas tasks.
- [ ] Renderer sends reusable intent and displays values returned by Review.
- [ ] Renderer performs no Date arithmetic.
- [ ] Run UI smoke, typecheck and diff check.
- [ ] Commit `feat: add GSC current quick run review`.

## Task 6 - UI Start uses stored Review artifact

**Modify:** `src/DesktopMultiSourceView.tsx` only if required by RED.
**Test:** `tests/integration/app/desktop-ui-smoke.integration.cjs`

- [ ] Add RED proving Start receives the exact reviewed artifact returned by Review.
- [ ] Do not reconstruct source configuration in the Start click handler.
- [ ] Run UI smoke, typecheck and diff check.
- [ ] Commit `feat: start reviewed GSC current run`.

## Task 7 - Checkpoint

**Modify:** `PROJECT_HANDOFF.md`

- [ ] Run `npm run test:m5:desktop-multisource`.
- [ ] Run `npm run test:m5:desktop-ui`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `git diff --check`.
- [ ] Record implementation commits and deterministic evidence in PROJECT_HANDOFF.md.
- [ ] Leave live GSC acceptance as a separate checkpoint.
- [ ] Commit `docs: record GSC current run resolution checkpoint`.

## Completion boundary

`Task Detail -> Review relative policy -> show exact dates -> Start same reviewed artifact -> persisted Run and Job with same dates -> existing Run lifecycle`

Do not proceed to GSC Long or another source policy until this slice is deterministic and verified.
