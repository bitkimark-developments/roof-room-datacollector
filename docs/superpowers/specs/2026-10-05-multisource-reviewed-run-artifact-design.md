# Multi-Source Reviewed Run Artifact Design

**Date:** 2026-10-05
**Status:** Approved

## Problem

Single-source desktop Review can return a `DesktopReviewedRunDraft` containing exact execution configuration.

Multi-source Saved Preset Review currently leaves `reviewed_draft` null and may independently resolve execution configuration again during Start.

That breaks the desired invariant:

`Review exact execution context -> user approves -> Start that exact reviewed context`

It also prevents clean run-scoped input binding for later fixes such as Ikas Products XLSX selection and Google Ads Growth execution hydration.

## Goal

Generalize the existing reviewed-run artifact contract to multi-source desktop Runs without changing Core source neutrality, provider semantics, persisted schema, raw evidence rules, or reusable Saved Preset semantics.

A multi-source Review that is planning-complete must produce one immutable reviewed execution artifact.

Start must consume that artifact without re-resolving relative policies or run-scoped values.

## Architecture

The lifecycle is:

`Reusable Saved Preset -> Review resolution -> Reviewed multi-source artifact -> Explicit Start -> persisted Run + Jobs`

The Saved Preset remains reusable intent.

The reviewed artifact contains the exact execution configuration approved for one Run.

The Run snapshot preserves that exact resolved configuration separately from the reusable configuration.

## Reviewed artifact identity

`DesktopReviewedRunDraft` becomes truthful for both single-source and multi-source Review.

It contains:

- `workspace_id`
- `task_id: string | null`
- `source_id: string | null`
- `included_sources: string[]`
- `reference_date`
- `resolved_at`
- `reusable_configuration`
- `resolved_configuration`

For single-source single-task Review:

- `source_id` remains the real source ID
- `task_id` remains the real task ID
- `included_sources` contains that source

For single-source multi-task Review:

- `source_id` remains the real source ID
- `task_id` is `null` because no truthful singular root task identity exists
- `included_sources` contains that source
- real task identities remain preserved in source-local resolved request/job context and JobPlans

For multi-source Review:

- `source_id` is `null`
- `task_id` is `null`
- `included_sources` contains the ordered real source IDs

No synthetic `multi-source` provider, task, or source identity is invented.

## One Review clock

Review captures `resolved_at` exactly once.

`reference_date` is derived once from that captured local time.

All source-local resolution performed for the same multi-source Review receives that same Review clock/reference date.

Resolution must not call a new clock independently for each source.

This preserves one coherent reviewed execution boundary and prevents midnight drift between sibling Jobs.

## Reusable versus resolved configuration

`reusable_configuration` remains unchanged reusable intent.

Examples:

- relative date policy
- selected source/task identities
- configured query groups
- other reusable source-local inputs

`resolved_configuration` contains exact provider-facing execution context for this Run.

Examples:

- absolute request dates
- resolved request ranges
- reviewed run-scoped file paths
- Workspace account metadata required for execution

Requested or configured values must never be copied into observed evidence fields.

## Planning completeness

P0-01 remains authoritative.

Every included source must produce at least one JobPlan.

If any included source produces zero Jobs:

- `planning_blocking_sources` identifies it
- `can_start` is false
- the Review must not expose a startable reviewed artifact

Connection/readiness blockers remain separate from planning blockers.

## Start contract

Starting a `DesktopReviewedRunDraft`:

1. validates the Workspace;
2. re-checks current source readiness;
3. builds JobPlans only from `resolved_configuration`;
4. does not re-resolve date policies;
5. does not capture a new reference date;
6. does not replace reviewed run-scoped inputs;
7. reserves the Run using the reviewed resolved configuration;
8. persists the original reusable configuration separately.

The clock may advance between Review and Start without changing execution dates or other reviewed execution context.

## Snapshot provenance

For multi-source Runs the configuration snapshot preserves:

- `workspace_id`
- `reference_date`
- `resolved_at`
- exact `resolved_configuration`
- real source-local task/request context

A singular root `source_id` or `task_id` is not invented for a multi-source Run.

The actual source set remains traceable through real JobPlans and persisted Jobs.

## Compatibility

This slice does not:

- change SQLite schema;
- move provider semantics into Core;
- introduce a synthetic multi-source source;
- change raw artifact authority;
- infer missing provider evidence;
- automatically reuse evidence from prior Runs;
- implement Ikas file binding itself;
- implement Growth hydration itself;
- add live-provider tests.

Existing single-source reviewed Quick Run behavior remains supported.

Existing retry, resume, evidence, validation, packaging, and export ownership remains unchanged.

## Acceptance criteria

1. A planning-complete two-source Review returns non-null `reviewed_draft`.
2. The artifact contains the ordered real `included_sources`.
3. Multi-source `source_id` and `task_id` are null rather than synthetic.
4. Review captures one `resolved_at` and one local `reference_date`.
5. Reusable configuration remains relative and unchanged.
6. Resolved configuration contains the exact Review-time execution values.
7. Advancing the injected clock after Review does not alter Start execution values.
8. Start builds Jobs from the reviewed `resolved_configuration`.
9. The persisted Run snapshot contains the same exact resolved execution context.
10. Any included source producing zero Jobs still fails closed under P0-01.
11. Existing single-source reviewed Run tests continue to pass.
12. No live provider request is required for deterministic verification.

## Follow-on bugs

This contract is the prerequisite for:

- P0-03 — Blog full seven-family planning
- P0-04 — Ikas run-scoped XLSX binding
- P0-05 — Google Ads Growth execution hydration

Those source-specific inputs remain separate follow-on changes and must not be faked inside this generic contract.
