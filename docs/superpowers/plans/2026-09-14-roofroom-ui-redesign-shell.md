# RoofRoom Operations Shell Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using TDD.

**Goal:** Replace the global Google-Trends-centric renderer with the first working source-neutral RoofRoom Operations Shell.

**Architecture:** Preserve preload → IPC → DesktopMultiSourceController → production runtime → Core. App.tsx becomes a thin renderer root. DesktopMultiSourceView owns the first-slice product shell. Product task identity remains separate from provider/source identity.

**Tech Stack:** TypeScript, React, Electron, Vite, Playwright, existing RoofRoom IPC contracts.

**Spec:** docs/superpowers/specs/2026-09-14-roofroom-ui-redesign-design.md

## Global Constraints

- Preserve Core collection, validation, storage, provenance and credential behavior.
- Do not expose credentials or secrets to the renderer.
- Google Trends receives no special global UI status.
- HOME and TASKS expose all eight Release 1.0 tasks.
- Automated UI tests make no live provider calls.
- Use deep navy / near-black / white, purple primary, turquoise positive, orange warning and limited red critical.
- Do not add CODEX_HANDOFF_CURRENT.md or PROJECT_HANDOFF.pre-20260820.md.
- Use targeted tests during the slice; full release gate only at checkpoint closure.

## Task 1 — Source-neutral task catalog

Files:
- Create src/desktop-task-catalog.ts
- Modify src/DesktopMultiSourceView.tsx
- Test tests/integration/app/desktop-ui-smoke.integration.cjs

Interface:
- DesktopTaskDefinition has task_id, source_id, task_name, description, group and default_summary.
- DESKTOP_TASK_CATALOG contains exactly eight Release 1.0 tasks.
- Both GSC tasks map to google-search-console-query-page.

Steps:
- [ ] Confirm npm run test:m5:desktop-ui is RED on missing Collection Operations.
- [ ] Create the eight task definitions.
- [ ] Render eight HOME cards and eight TASKS cards with data-testid="task-card".
- [ ] Derive readiness from existing source cards when available.
- [ ] Use NOT_YET_AVAILABLE only as a product presentation fallback; never invent provider readiness.
- [ ] Re-run npm run test:m5:desktop-ui.

## Task 2 — Operations AppShell

Files:
- Modify src/App.tsx
- Modify src/DesktopMultiSourceView.tsx
- Modify src/index.css
- Test tests/integration/app/desktop-ui-smoke.integration.cjs

Steps:
- [ ] Remove the global GT hero, period controls, query pool, GT job cards and legacy global GT collection surface from App.tsx.
- [ ] Add persistent Sidebar: HOME / TASKS / RUNS / PRESETS / WORKSPACE.
- [ ] Add ContextBar with RoofRoom identity, active Workspace and safe system status.
- [ ] HOME heading is exactly Collection Operations.
- [ ] Preserve persisted Workspace loading through getDesktopWorkspaces().
- [ ] Preserve persisted preset loading through getDesktopPresets(workspaceId).
- [ ] Preserve current preset create/delete behavior under PRESETS.
- [ ] Apply semantic CSS variables for navy, black, surface, purple, turquoise, orange and danger.
- [ ] Run npm run test:m5:desktop-ui.
- [ ] Run npx tsc --noEmit.
- [ ] Run git diff --check.

## Task 3 — Real desktop verification

- [ ] Run npm start.
- [ ] Verify persistent sidebar and source-neutral HOME.
- [ ] Verify all eight HOME task cards.
- [ ] Verify all eight TASKS task cards.
- [ ] Verify Workspace and preset context remain visible.
- [ ] Verify GOOGLE TRENDS MVP and global GT branding are absent.
- [ ] Verify Google Trends has equal visual weight with other tasks.
- [ ] Verify approved navy / purple / turquoise / orange visual system.
- [ ] Verify approximately 1100x900 remains comfortable.
- [ ] Fix only defects inside this slice.

## Task 4 — Checkpoint

- [ ] Inspect git --no-pager diff --stat and git --no-pager diff.
- [ ] Run npm run test:m5:desktop-ui.
- [ ] Run npm run test:m5:desktop-multisource.
- [ ] Run npx tsc --noEmit.
- [ ] Run git diff --check.
- [ ] Stage only redesign files plus design/plan docs.
- [ ] Commit as feat: add source-neutral operations shell.
