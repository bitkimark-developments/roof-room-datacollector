# Workspace Saved Presets and Last Run Settings Design

**Date:** 2026-09-10
**Status:** Approved for implementation

## Goal

Add the minimum Core persistence needed to build a temporary Workspace-owned Run Draft from a Saved Collection Preset, Last Run Settings, or blank state, then atomically reserve a Run while preserving an immutable resolved Run Snapshot.

## Boundaries

- A Saved Collection Preset belongs to exactly one Workspace and is user-managed.
- Last Run Settings has exactly one system-managed record per Workspace.
- A Run Draft is a TypeScript value only; it has no table and no automatic persistence.
- Reusable configurations are source-owned JSON objects. Core validates JSON compatibility but does not define unsupported provider fields or a universal configuration schema.
- A new product reservation path persists a `PENDING` Run, its Jobs, and effective Last Run Settings in one `BEGIN IMMEDIATE` transaction.
- The pre-existing low-level Run creation methods remain compatibility-only and are not removed or refactored into product behavior during this checkpoint.
- A Run Snapshot is a separate JSON object supplied after source-specific resolution. New Google Trends reservations include `reference_date`, `requested_date_start`, and `requested_date_end`.
- Run Setup/Review overrides operate on a draft/effective configuration and never update the source Saved Preset.
- Credentials and secrets are prohibited by contract. This slice adds no credential storage and no speculative heuristic scanner over source-owned JSON.

## Persistence

SQLite schema v7 adds:

```text
saved_collection_presets
  preset_id TEXT PRIMARY KEY
  workspace_id TEXT NOT NULL REFERENCES workspaces RESTRICT
  preset_name TEXT NOT NULL
  reusable_configuration_json TEXT NOT NULL JSON object
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL

workspace_last_run_settings
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces RESTRICT
  reusable_configuration_json TEXT NOT NULL JSON object
  updated_at TEXT NOT NULL
```

No v6 record is backfilled into either table because no historical Saved Preset or reliable reusable Last Run Settings exists. Existing Runs and snapshots remain unchanged.

## Core contracts

`src/shared/collection-configuration.ts` defines `ReusableCollectionConfiguration`, `SavedCollectionPresetRecord`, `LastRunSettingsRecord`, and non-persisted `RunDraft`/origin types.

`StateRepository` provides Workspace-scoped Saved Preset create/get/list/update methods and a Workspace-scoped Last Run Settings read. Cross-Workspace preset lookup returns no record; cross-Workspace update fails as an unknown scoped record without disclosing ownership.

`reserveRunFromJobPlans` is the single new product reservation transaction. `reserveRunFromQueryConfig` is only the Google-Trends-compatible adapter into that transaction. Both require effective reusable settings and an already-resolved immutable snapshot. A reservation conflict or insert failure rolls back the Last Run Settings write.

## Google Trends compatibility

The existing Google Trends Core runner uses the new reservation adapter. The current desktop factory supplies source-owned reusable settings containing selected query-group IDs and the approved period selection. Direct compatibility callers may omit that richer object; the runner derives a credential-free source-owned representation from its already-validated inputs and uses the requested end date as the reference date.

No renderer, IPC, provider, export, readiness, or credential behavior changes.

## Verification

One migration test proves v6→v7 preservation and empty new stores. One repository vertical slice proves Workspace isolation, preset immutability under draft overrides, atomic Last Run Settings update on successful reservation, resolved immutable snapshot persistence, rollback on reservation conflict, and repository reopen. Existing state, Workspace ownership, multi-source, Google Trends Core/batch, desktop, export, and M2 gates provide compatibility evidence. The full deterministic release gate runs once at closure.
