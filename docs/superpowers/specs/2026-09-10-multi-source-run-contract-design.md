# Multi-Source Run Contract Design

**Date:** 2026-09-10
**Status:** Approved

## Goal

Allow one persisted Run to contain independent Jobs from more than one
`source_id` while preserving schema v5, existing snapshots, Google Trends
behavior, attempt history, evidence, validation, provenance, retry, and
restart/reconciliation.

## Compatibility shape

The schema-v5 `runs.configuration_snapshot_json` column already stores an
arbitrary JSON object. Existing Google Trends snapshots use the legacy
query-group shape. Existing source-neutral single-source snapshots may contain
a singular `source_id`, but Core does not require that field for generic
snapshots.

New multi-source callers use a truthful generic snapshot shaped around the
operation and its selected source configurations, for example:

```json
{
  "schema_version": 1,
  "sources": [
    {
      "source_id": "fake-source-a",
      "requested_context": {
        "batch_label": "primary"
      }
    },
    {
      "source_id": "fake-source-b",
      "requested_context": {
        "batch_label": "secondary"
      }
    }
  ]
}
```

The shape does not copy the first Job's `source_id` to the Run root and does
not invent a synthetic `multi-source` provider. `selected_sources_json`
continues to be derived from the ordered Job plans and records both real source
IDs. Existing snapshot parsing remains backward compatible and no persisted
state is rewritten.

## Persistence and identity

Schema v5 already contains every physical field required by the slice:

- `runs.selected_sources_json` is an array;
- each Job stores `source_id`, `job_key`, and `source_context_json`;
- Job uniqueness is `(run_id, source_id, job_key)`;
- Job IDs contain both `source_id` and `job_key`;
- artifact records retain Run, Job, attempt number, and source identity;
- storage paths are namespaced by Run and source.

The single-source guard in `normalizeCreateRunFromJobPlansInput` is therefore
removed only after a deterministic persistence test fails against it. Duplicate
`source_id + job_key` identities and unsafe filesystem keys remain rejected.
The same `job_key` under two distinct sources remains valid.

No schema v6 migration is introduced.

## Collection and validation dispatch

`CollectionOrchestrator` already resolves the collecting module from
`job.source_id`. Validation is the remaining run-wide dependency: one
`CollectionValidator` is currently injected for the entire orchestrator.

Add a dedicated `CollectionValidatorRegistry` with fail-closed behavior:

```ts
register(sourceId: string, validator: CollectionValidator): void
get(sourceId: string): CollectionValidator
```

It validates source IDs with the established lowercase-hyphenated rule,
rejects duplicate registrations, and rejects unknown source IDs. The
orchestrator resolves the validator for every started Job using
`job.source_id`, just as it already resolves the collecting source.

No provider-specific branch is added to Core.

## Lifecycle proof

The deterministic vertical slice registers `fake-source-a` and
`fake-source-b` independently. One mixed Run contains three Jobs. The order is
chosen so a failed `fake-source-b` Job occurs before a later successful
`fake-source-a` Job, proving that ordinary Job failure does not stop unrelated
pending work.

The test proves:

- truthful mixed-source persistence and reopen;
- per-Job collector and validator dispatch;
- same-key identity across distinct sources;
- independent accepted and failed Job state;
- failed-only explicit retry as attempt 2;
- immutable failed attempt and rejected artifact history;
- accepted siblings receive no second attempt or source call;
- restart/reconciliation rebuilds a mixed-source plan;
- source/job/attempt/artifact/context-correct metadata and validation evidence.

## Compatibility boundaries

The following remain intentionally unchanged:

- SQLite schema version 5 and schema-v4-to-v5 migration;
- legacy Google Trends snapshot parsing;
- existing generic single-source snapshot readability;
- Google Trends QueryGroup adaptation and metadata schema v1;
- Google Trends production runner, desktop controller, and exporter scope;
- existing run, execution, validation, and artifact enums;
- sequential orchestration and explicit retry policy;
- Workspace, presets, Last Run Settings, credentials, freshness, timeouts,
  frontend generalization, multi-source export, and real provider adapters.

Google Trends production composition remains a GT-specific boundary. A later
source-neutral application composition may build a mixed Run containing Google
Trends, but this slice does not generalize the GT UI/export/runtime wrapper.
