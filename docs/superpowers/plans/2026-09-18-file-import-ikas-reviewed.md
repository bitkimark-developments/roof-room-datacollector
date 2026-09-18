# FILE_IMPORT + İkas Reviewed Vertical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the user-selected İkas Products XLSX into an immutable reviewed Job context and execute it through a small reusable FILE_IMPORT byte-acquisition boundary into existing Core raw preservation and validation.

**Architecture:** Keep file selection in trusted Electron main IPC and parsing/validation in the İkas source module. A minimal shared helper validates an absolute regular file and reads exact bytes; the İkas source consumes only persisted Job context during `collect(context)`, then Core persists the bytes before invoking the existing validator.

**Tech Stack:** TypeScript, React, Electron trusted IPC, Node filesystem promises, SQLite repository, deterministic sanitized XLSX fixtures.

**Spec:** `PROJECT_SPEC.md` sections 4.5, 5, 8-14; `ARCHITECTURE.md` FILE_IMPORT contract; `SOURCE_MODULE_GUIDE.md` İkas notes.

## Global Constraints

- Preserve the original XLSX bytes before parsing; never modify the selected file.
- A file extension is not proof of content validity; the existing parser/validator remains authoritative.
- Missing stock, sale price, and unavailable fields remain nullable.
- Renderer owns user intent only; filesystem reads remain in the main/source boundary.
- Manual Keyword Planner CSV is not implemented in this slice.
- Preserve the two historical untracked handoff files unchanged.

---

### Task 1: Reviewed İkas Job context

**Files:**
- Create: `src/main/sources/ikas/ikas-products-request.ts`
- Modify: `src/main/app/desktop-multisource-controller.ts`
- Test: `tests/integration/file-import/ikas-reviewed-file-import.integration.cjs`
- Test: `tests/integration/file-import/run-ikas-reviewed-file-import-test.sh`

**Interfaces:**
- Consumes: `{ included, task_id: 'ikas-products-import', file_path }`.
- Produces: exact Job context `{ task_id, source_id: 'ikas-products', source_mode: 'FILE_IMPORT', file_path }`.

- [x] Write a failing fixed-clock Review/Start/reopen test that asserts an immutable reviewed artifact and exact persisted path.
- [x] Verify RED because current İkas Review returns `reviewed_draft: null`.
- [x] Implement strict context creation, duplicate-free single Job planning, and reviewed artifact resolution.
- [x] Verify GREEN and malformed/relative/mismatched contexts produce zero Jobs and `can_start = false`.

### Task 2: Shared FILE_IMPORT evidence reader and dynamic source binding

**Files:**
- Create: `src/main/sources/file-import/file-import-evidence.ts`
- Modify: `src/main/sources/ikas/ikas-products-source.ts`
- Modify: `src/main/app/production-collection-runtime.ts`
- Modify: `tests/integration/sources/non-google-source-slices.integration.cjs`
- Test: `tests/integration/file-import/ikas-reviewed-file-import.integration.cjs`

**Interfaces:**
- Consumes: an absolute selected file path from validated Job context.
- Produces: exact bytes from a regular local file; rejects relative paths, directories, missing files, and non-files.

- [x] Add failing tests for dynamic per-call file binding, exact byte preservation, invalid context before file access, and non-file rejection.
- [x] Verify RED because `IkasProductsSource` still captures constructor state.
- [x] Implement the minimal shared evidence reader and context-bound `collect(context)`.
- [x] Update the old source fixture to the new Job-context contract and verify GREEN.

### Task 3: Production Core vertical and UI reviewed artifact

**Files:**
- Modify: `src/DesktopMultiSourceView.tsx`
- Modify: `tests/integration/app/desktop-ui-smoke.integration.cjs`
- Test: `tests/integration/file-import/ikas-reviewed-file-import.integration.cjs`

**Interfaces:**
- Consumes: the native dialog's exact selected `file_path`.
- Produces: Review display plus exact reviewed artifact forwarded to Start; Core stores an identical raw XLSX and validates it.

- [x] Extend the failing integration test through production runtime and assert accepted raw bytes equal the selected fixture after source-file mutation is excluded from the tested interval.
- [x] Add a failing UI assertion that İkas Start receives a non-null reviewed artifact carrying the exact selected path and FILE_IMPORT semantics.
- [x] Implement renderer task identity transport and reviewed-artifact display without renderer filesystem access.
- [x] Verify focused Core and UI suites GREEN.

### Task 4: Release gate and checkpoint

**Files:**
- Modify: `tests/integration/release/run-release-gate.sh`
- Modify: `PROJECT_HANDOFF.md` after the technical commit.

**Interfaces:**
- Produces: permanent deterministic regression coverage and exact project-state documentation.

- [x] Wire the focused FILE_IMPORT + İkas suite into the release gate.
- [x] Run focused source/file-access/desktop regressions, typecheck, lint, diff check, and the full deterministic release gate.
- [x] Inspect the full diff and commit technical changes as `feat(ikas): bind reviewed file import to Core`.
- [x] Document exact evidence, remaining manual CSV/live-file acceptance state, and next action in a separate docs commit.
- [x] Fast-forward local main and continue to the Keyword Planner manual CSV fallback audit.
