# İkas Preset Run-Scoped XLSX Binding Design

**Date:** 2026-10-06
**Status:** Approved

## Problem

İkas Products Quick Run already binds the exact user-selected XLSX into a reviewed FILE_IMPORT Job context.

Saved Preset Review has no equivalent one-Run input channel. Blog presets intentionally keep:

`reusable_configuration.sources["ikas-products"].file_path = null`

because the current XLSX is evidence for one Run, not reusable Saved Preset intent.

Today `reviewPreset()` creates a draft from the Saved Preset and submits it unchanged to Review. Therefore:

- İkas readiness remains `FILE_REQUIRED`;
- the İkas source-local resolver has no exact `file_path`;
- İkas produces zero JobPlans;
- the seven-family Blog Review remains fail-closed.

P0-02 already requires:

- `reusable_configuration` to preserve reusable intent;
- `resolved_configuration` to contain exact reviewed execution context;
- Start to consume that exact reviewed resolved context.

## Goal

Allow Saved Preset Review to accept the exact currently selected İkas Products XLSX as transient Run input without persisting the path into the Saved Preset.

Lifecycle:

`Reusable Saved Preset + one-Run XLSX input -> Review -> reviewed resolved configuration -> Start`

## Scope

In scope:

- optional transient source-keyed Review input on `DesktopRunDraft`;
- İkas Products `file_path` as the only consumer in this slice;
- Review-time readiness using that input;
- existing İkas source-local resolution using that input;
- Preset UI selection and binding;
- deterministic controller and renderer coverage.

Out of scope:

- SQLite schema changes;
- persisting XLSX in Saved Presets;
- persisting the transient input envelope;
- FILE_IMPORT acquisition changes;
- İkas parsing or validation changes;
- prior-Run file reuse;
- Keyword Planner CSV Preset binding;
- Google Ads Growth hydration;
- live-provider or packaged-runtime verification.


## Draft contract

`DesktopRunDraft` gains an optional transient Review-input envelope:

```ts
interface DesktopRunScopedInputs {
  sources: JsonObject;
}

interface DesktopRunDraft extends RunDraft {
  source_cards: DesktopSourceCard[];
  run_scoped_inputs?: DesktopRunScopedInputs;
}
```

For P0-04, the only interpreted entry is:

```ts
{
  sources: {
    "ikas-products": {
      file_path: "/exact/current/products.xlsx"
    }
  }
}
```

The envelope is only source-keyed transport. It does not define generic provider semantics.

## Reusable versus resolved configuration

The selected XLSX must not be written into the Saved Preset.

For a Blog preset, reusable İkas configuration remains:

```ts
{
  included: true,
  task_id: "ikas-products-import",
  file_path: null
}
```

Review must preserve that unchanged in `reviewed_draft.reusable_configuration`.

The exact selected path belongs only in:

`reviewed_draft.resolved_configuration.sources["ikas-products"].file_path`


## Review-time readiness

Initial Saved Preset creation may still report İkas as `FILE_REQUIRED` because no one-Run XLSX has been selected yet.

During Review, when an İkas run-scoped input exists, the readiness evaluator receives an effective İkas source configuration containing the exact selected `file_path`.

This readiness overlay must not mutate `draft.reusable_configuration`.

No other provider receives new interpretation from this slice.

## İkas resolution

The existing İkas source-local resolver remains authoritative.

For İkas only, Review resolves `file_path` from:

1. the exact run-scoped Review input when present;
2. otherwise the existing reusable `file_path` for current Quick Run and historical compatibility.

The resolver still validates the path through the existing `createIkasProductsJobContext()` contract.

Malformed, relative, missing, or otherwise invalid paths remain fail-closed.

## Multi-source composition

P0-03 already makes multi-source Review compose every included source through its existing source-local resolver.

No new composer branch is required.

When the composer creates a temporary single-source draft, the transient `run_scoped_inputs` envelope remains attached to that draft.

The İkas source-local resolver consumes only its own input.

## Start behavior

No new Start-time file binding is allowed.

`startReviewedDraft()` continues to:

- re-check readiness against `resolved_configuration`;
- build JobPlans from `resolved_configuration`;
- preserve the reviewed reference date and resolved timestamp;
- avoid re-resolving run-scoped values.

Changing the selected file after Review invalidates the previous renderer Review and requires a new Review.

## Renderer behavior

Preset XLSX selection uses state separate from Quick Run selection.

When the selected Saved Preset includes İkas Products:

- the Preset editor exposes `Select Products XLSX`;
- selecting a file records only transient renderer state;
- the current Preset Review is cleared;
- `reviewPreset()` attaches the exact path through `run_scoped_inputs`;
- Save, Update, Duplicate, and Create continue to persist only reusable configuration;
- switching Preset or Workspace clears the transient Preset XLSX selection;
- successful Preset Start clears the transient selection.

## Data integrity

This slice does not infer or reconstruct provider evidence.

The path is user-selected input only.

The source still reads the exact file through the existing privileged FILE_IMPORT boundary.

Raw XLSX bytes remain authoritative and are preserved before parsing under the existing İkas implementation.

Requested input is never copied into observed provider fields.

## Acceptance criteria

1. `DesktopRunDraft` accepts a valid optional source-keyed run-scoped input envelope.
2. Invalid run-scoped envelope shapes are rejected by `isDesktopRunDraft`.
3. A Blog 7 reusable preset still stores İkas `file_path: null`.
4. Without a current run-scoped XLSX, the existing Blog Review remains fail-closed with İkas as a planning blocker.
5. With an exact run-scoped İkas XLSX, Review produces seven-family planning coverage.
6. The reviewed artifact remains multi-source with null root task/source identity.
7. Reviewed reusable configuration still contains `file_path: null`.
8. Reviewed resolved configuration contains the exact selected XLSX path and existing FILE_IMPORT semantics.
9. Start produces an İkas Job whose persisted source context contains that exact reviewed path.
10. Start does not reread renderer state or replace the reviewed path.
11. Preset Save/Update/Duplicate does not persist the current selected XLSX.
12. Quick Run İkas behavior remains compatible.
13. No live-provider request is required for deterministic verification.
