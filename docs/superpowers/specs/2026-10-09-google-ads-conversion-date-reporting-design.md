# Google Ads Conversion-Date Performance — Design

**Date:** 2026-10-09
**Status:** Approved in the P2-02 user direction; repository design recorded from live code.

## Goal and authority

Add an explicit conversion-date acquisition path to the existing `google-ads-search-reporting` source and expose it as a separate desktop task. Root/scoped `AGENTS.md`, this approved direction, and `TEST_STRATEGY.md` govern implementation; Ponytail's simplification advice cannot weaken them.

## Current implementation evidence

- `src/shared/google-ads-search-reporting.ts` defines six SEARCH datasets and Job contexts with schema version `1 | 2`.
- `search-reporting-request.ts` creates v2 contexts by default and accepts historical v1/v2 contexts. `search-reporting-source.ts` acquires only v2.
- The three approved query builders select standard conversion metrics. The existing uncommitted RED tests assert that v2 GAQL stays unchanged and explicit v3 GAQL adds four fields.
- `src/main/app/desktop-multisource-controller.ts`, `src/desktop-task-catalog.ts`, and `src/DesktopMultiSourceView.tsx` own planning and task-first desktop flows. The existing Task Detail design is `2026-09-14-roofroom-ui-redesign-design.md`.
- `ads-optimization-pack-recipe.ts` requires v2 evidence. Jobs are identified within a Run by `source_id + job_key`.

## Provider-native scope

Only `CAMPAIGN_PERFORMANCE` (`campaign`), `AD_GROUP_PERFORMANCE` (`ad_group`), and `KEYWORD_PERFORMANCE` (`keyword_view`) may acquire v3. Each v3 GAQL selects these additional, separate provider-native metrics:

| Google Ads field | Normalized evidence |
| --- | --- |
| `metrics.conversions_by_conversion_date` | included conversion-action count by conversion date |
| `metrics.conversions_value_by_conversion_date` | included conversion-action value by conversion date |
| `metrics.all_conversions_by_conversion_date` | all conversion-action count by conversion date, regardless of inclusion setting |
| `metrics.all_conversions_value_by_conversion_date` | value of all conversions by conversion date |

The standard conversion fields retain their existing names and meaning. The four additional fields are not reconstructed. The Google Ads API v25 [metrics catalog](https://developers.google.com/google-ads/api/fields/v25/metrics) marks all four as selectable with `campaign`, `ad_group`, and `keyword_view`; when selected with `segments.date`, that date is the conversion date for these fields. The corresponding [campaign](https://developers.google.com/google-ads/api/fields/v25/campaign), [ad_group](https://developers.google.com/google-ads/api/fields/v25/ad_group), and [keyword_view](https://developers.google.com/google-ads/api/fields/v25/keyword_view) catalogs list each field. No live provider request is part of deterministic verification.

## Version and evidence contracts

- v1 artifacts remain readable without mutation; v1 reacquisition remains unsupported.
- v2 remains the default for existing tasks, contexts, and unchanged GAQL. Existing accepted v2 evidence stays valid.
- v3 requires explicit selection in immutable reviewed Job context. Reject v3 for every other dataset before provider access. Reject unsupported mixed configuration before creating a Run.
- Preserve raw SearchStream response bytes, Run/Job/Attempt provenance, exact requested dates, and separate normalized rows. Conversion-date values preserve provider-native null versus zero. Missing required v3 fields are validation failures, not synthesized zeros.
- `ADS_OPTIMIZATION_PACK v2` keeps its v2-only recipe and eligibility. No new package is in scope.

## Desktop task and review

Add one task named **Google Ads — Conversion-Date Performance** in the existing task catalog. It uses the same source ID and Workspace Google Ads connection, with three fixed datasets. Its Task Detail uses the common task page and explains conversion-date reporting, the account, dates, readiness, and blockers. The path is HOME / TASKS → Task Detail → Configure → Review Quick Run → Start Run → Progress → Result.

Review makes no provider request. It displays Workspace, task, account, three datasets, exact dates, readiness, planning completeness, v3 scope, and warnings. Start consumes the exact reviewed account, dates, datasets, and version and persists them in Run/Job contexts. Renderer receives no secrets.

## Collision and preset safety

Because v2 and v3 reuse the source and dataset Job keys, Review rejects a Run selection containing both tasks when their Jobs collide. It must neither choose one nor partially plan Jobs. Existing single-task and supported multi-source reviews remain valid. Presets are neither rewritten nor merged; unsupported preset combinations fail closed.

## Acceptance and exclusions

Focused deterministic tests cover context/version selection, v2 GAQL invariance, v3 field selection and dataset rejection, normalization and validation including missing/null/zero, raw evidence, reviewed immutable plans, collisions, task discovery/review/start, and v1/v2/package regressions. Renderer/controller checks and relevant UI automation establish behavior; TypeScript alone does not establish UI or packaged acceptance.

Excluded: new source/provider/Core identity framework, new credential store, schema-v3 global default, Performance Max, other datasets, package version change, preset redesign, broad UI redesign, live-provider and packaged acceptance without separate authorization.
