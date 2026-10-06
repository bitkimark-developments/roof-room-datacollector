# İkas Preset Run-Scoped XLSX Binding Implementation Plan

**Goal:** Bind the currently selected İkas Products XLSX into one Saved Preset Review/Run without persisting that path into reusable Saved Preset configuration.

**Spec:** `docs/superpowers/specs/2026-10-06-ikas-preset-run-scoped-input-design.md`

## Inspected current evidence

GitHub branch `feat/google-analytics-4-source-v1` at `f0808ea` shows:

- Quick Run puts `selectedIkasFile.file_path` into its one-source draft before Review.
- Preset `reviewPreset()` creates a `SAVED_PRESET` draft and sends it unchanged to Review.
- `DesktopRunDraft` currently has no transient Run-input field.
- `reviewDraft()` performs readiness using only `reusable_configuration`.
- the existing İkas source-local resolver consumes `config.file_path`;
- P0-03 multi-source composition invokes every included source-local resolver;
- `startReviewedDraft()` consumes exact `resolved_configuration`;
- the Blog 7 deterministic fixture currently proves six Jobs plus one İkas planning blocker.

## Constraints

- No SQLite schema change.
- Do not persist the current XLSX in Saved Preset configuration.
- Do not change İkas parsing, validation, raw preservation, or FILE_IMPORT acquisition.
- Do not generalize provider-specific semantics into Core.
- Do not add run-scoped semantics for unrelated sources.
- Preserve Quick Run behavior.
- Preserve P0-01, P0-02, and P0-03 fail-closed behavior.
- Normal automated tests must not call live providers.

## Task 1 — Add the transient draft contract

**Files:**

- Modify: `src/shared/desktop-multisource.ts`
- Modify: `tests/integration/app/desktop-multisource-flow.integration.cjs`

**RED:**

Add contract assertions proving:

- a draft with `run_scoped_inputs.sources["ikas-products"].file_path` is valid;
- null, array, or invalid `sources` envelope shapes are rejected.

Run:

`bash tests/integration/app/run-desktop-multisource-flow-test.sh`

Expected RED: the existing validator does not enforce the new contract.

**GREEN:**

Add `DesktopRunScopedInputs` and optional `DesktopRunDraft.run_scoped_inputs`.

Extend `isDesktopRunDraft()` only enough to validate the optional source-keyed object envelope.

Run:

- `bash tests/integration/app/run-desktop-multisource-flow-test.sh`
- `npx tsc --noEmit`

## Task 2 — Make Review consume the İkas one-Run file without mutating reusable intent

**Files:**

- Modify: `src/main/app/desktop-multisource-controller.ts`
- Modify: `tests/integration/app/desktop-multisource-flow.integration.cjs`
- Modify: `tests/integration/presets/asset-preset-multisource-window.integration.cjs`

**RED A — readiness:**

Change the existing İkas run-input readiness fixture so:

- reusable İkas configuration contains no current file path;
- exact path exists only under `run_scoped_inputs`;
- Review must report İkas `READY`.

Expected RED: readiness currently sees only reusable source configuration.

**RED B — seven-family Blog planning:**

Starting from the existing Blog 7 fixture:

- retain reusable `file_path: null`;
- attach exact XLSX only through `run_scoped_inputs`;
- assert seven Jobs;
- assert empty `planning_blocking_sources`;
- assert `can_start === true`;
- assert a non-null multi-source reviewed artifact;
- assert reviewed reusable İkas path remains null;
- assert reviewed resolved İkas path equals the exact run-scoped path.

Then Start the reviewed artifact and assert the İkas Job source context contains the same exact path.

Expected RED: the current İkas resolver reads only reusable `config.file_path`.

**GREEN:**

Add the smallest application-layer helper needed to expose the exact İkas run-scoped `file_path` to:

- Review readiness;
- the existing İkas source-local resolver.

Do not mutate reusable configuration.

Do not change the multi-source composer architecture.

Do not add Start-time resolution.

Run:

- `bash tests/integration/app/run-desktop-multisource-flow-test.sh`
- `bash tests/integration/presets/run-asset-preset-multisource-window-test.sh`
- `npx tsc --noEmit`

## Task 3 — Bind the XLSX from Preset UI

**Files:**

- Modify: `src/DesktopMultiSourceView.tsx`
- Modify: `tests/integration/app/desktop-ui-smoke.integration.cjs`

**RED:**

Extend the UI fixture with an İkas-containing Saved Preset whose reusable configuration has `file_path: null`.

Assert:

- Preset editor exposes a Products XLSX selector for that Run;
- selecting the file uses `IKAS_PRODUCTS_XLSX`;
- Review receives the exact path only under `run_scoped_inputs`;
- Review receives unchanged reusable preset configuration;
- Save/Update/Duplicate input does not gain the current XLSX;
- the returned reviewed artifact exposes the exact path only in resolved configuration;
- Start receives that exact reviewed artifact;
- selecting another file invalidates a prior Preset Review.

Expected RED: current Preset UI has no file-selection/binding path.

**GREEN:**

Add Preset-specific transient İkas file state.

Reset it when:

- Preset changes;
- Workspace changes;
- successful Preset Start occurs.

When the selected Preset includes İkas Products, expose the native file selector.

Attach its exact path to `nextDraft.run_scoped_inputs` immediately before `reviewDesktopDraft()`.

Do not modify `presetEditorConfiguration`.

Run:

`npm run test:m5:desktop-ui`

## Task 4 — Focused deterministic verification

Run:

- `bash tests/integration/presets/run-asset-preset-multisource-window-test.sh`
- `bash tests/integration/app/run-desktop-multisource-flow-test.sh`
- `bash tests/integration/file-import/run-ikas-reviewed-file-import-test.sh`
- `npm run test:m5:desktop-ui`
- `npx tsc --noEmit`
- `git diff --check`

Acceptance requires:

- Blog Review has seven source families and seven Jobs when the exact XLSX is supplied;
- reviewed reusable configuration still has `file_path: null`;
- reviewed resolved configuration and persisted İkas Job context contain the exact selected path;
- without the input, existing fail-closed behavior remains;
- Quick Run FILE_IMPORT regressions remain green.

## Task 5 — Checkpoint

After deterministic verification:

- update only P0-04 in `docs/USER_JOURNEY_BUG_REGISTER.md`;
- mark it `DETERMINISTICALLY VERIFIED`;
- keep P0-05 `OPEN`;
- record exact commits and verification;
- do not claim packaged-runtime or live-provider verification.

Do not push without explicit approval.
