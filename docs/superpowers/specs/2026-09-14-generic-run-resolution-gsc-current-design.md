# Generic Run Resolution + GSC Current 90 Days Design

**Date:** 2026-09-14
**Status:** Approved

## Goal

Reusable task configuration stays relative, while every actual Run stores and executes exact reviewed absolute dates.

First vertical slice:
- task_id: `gsc-current-90-days`
- source_id: `google-search-console-query-page`
- date policy: `TODAY_MINUS_90_TO_YESTERDAY`

For local reference date `2026-09-14`, Review resolves:
- requested_date_start: `2026-06-16`
- requested_date_end: `2026-09-13`

## Architecture

`Reusable configuration -> Review resolution -> Reviewed artifact -> Explicit Start -> Persisted Run and Jobs`

The renderer does not calculate collection dates.
The application/controller layer owns product-level Run resolution.
Provider adapters receive already resolved execution context.

## Reference date

`reference_date` is the local calendar date of the computer running RoofRoom Data Collector, formatted `YYYY-MM-DD`.
It must use local year, month and day semantics rather than UTC date truncation.
Once captured during Review, it is immutable for that reviewed artifact.

## Reusable versus resolved configuration

Reusable configuration preserves repeatable intent such as:
- task_id
- source_id
- relative date policy
- source-specific reusable inputs

Resolved configuration preserves provider-facing absolute values created during Review.

For GSC Current the resolved configuration contains one `date_ranges` entry with:
- job_key: `gsc-current-90-days`
- task_id: `gsc-current-90-days`
- requested_date_start
- requested_date_end

## Review to Start contract

Start accepts the reviewed artifact.
Start must not calculate a new reference date.
Start must not re-resolve the date policy.
Start may re-check readiness, validate the artifact, build JobPlans from resolved configuration, reserve the Run and start Core execution.

This prevents date drift when Review happens before midnight and Start happens after midnight.

## Provenance

The persisted Run must preserve:
- task_id
- source_id
- reference_date
- date_policy
- requested_date_start
- requested_date_end
- resolved_at

The Job source_context must preserve the same exact absolute date range used for execution.
Retry therefore continues the original Run window instead of recalculating today.

## Compatibility

Existing Ikas Quick Run behavior must remain functional.
Existing Core execution, retry, Run History, Run Detail and Export remain authoritative.
The legacy Google Trends desktop controller is not migrated in this slice.

## Acceptance criteria

With local reference date `2026-09-14`:
1. GSC Current Review resolves `2026-06-16 -> 2026-09-13`.
2. Review displays those exact dates.
3. Advancing the injected clock before Start does not change them.
4. Start reserves jobs from the exact reviewed configuration.
5. Run provenance preserves task identity, policy, reference date and absolute range.
6. Job source_context preserves the same absolute range.
7. Renderer performs no date arithmetic.
8. Existing Ikas Quick Run remains functional.
9. No live provider request is required for this architecture checkpoint.

## Out of scope

- GSC Long 16 Months
- Google Trends rolling 24 months
- Google Ads Search Terms policy
- Keyword Planner complete-month policy
- SerpApi snapshot policy
- universal date-policy DSL
- Preset Detail/Edit redesign
- live GSC acceptance
