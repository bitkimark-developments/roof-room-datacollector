# Generalized Desktop Multi-Source UX and Data Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the existing Google-Trends desktop surface into a compact Workspace-scoped multi-source run journey and export separate-source data packages through existing Core persistence.

**Architecture:** Keep Core, source adapters, credentials, and raw storage authoritative. Add a typed main-process desktop facade that reads/writes existing repository contracts, resolves source-specific plans, gates Start on readiness, and delegates reservation/orchestration/retry/export. The renderer consumes only sanitized view models through context-isolated IPC and renders compact Home, Setup, Review, Progress, Result, Runs, Presets, and Workspace views.

**Tech Stack:** TypeScript, Electron main/preload, React renderer, existing SQLite StateRepository, deterministic shell/CJS integration tests, existing CSV/XLSX export libraries.

**Spec:** User-supplied “Implement Generalized Desktop Multi-Source UX + Data Package Integration” request.

## Global Constraints

- Supported sources are Google Trends, Google Search Console, Google Ads Search Terms, Google Ads Keyword Planner, İkas Products XLSX, Bitkimark Sitemap/XML, and SerpApi Google SERP; Semrush and future providers stay excluded.
- No live provider requests, real workbook inspection, OAuth/API-key setup, or live BLOG-WEEK acceptance during this checkpoint.
- Use existing Workspace ownership, Saved Presets, Last Run Settings, immutable Run Snapshots, readiness, reservation, retry, reconciliation, artifact, provenance, validation, and export contracts; do not create a second persistence path.
- Renderer receives no credentials, credential references, raw provider payloads, unrestricted filesystem access, or shell execution.
- Excluded unhealthy sources do not block Start; included non-ready sources block Start without reserving a Run or making provider requests.
- No normal Pause/Stop/Resume controls; retain backend recovery APIs.
- Separate source datasets in packages; never semantically join sources or fabricate failed-source rows; preserve NULL/missing values and source semantics.
- Keep only the two historical untracked files untouched.

### Task 1: RED desktop facade contract

**Files:**
- Create: `src/shared/desktop-multisource.ts`
- Create: `src/main/app/desktop-multisource-controller.ts`
- Test: `tests/integration/app/desktop-multisource-flow.integration.cjs`
- Test runner: `tests/integration/app/run-desktop-multisource-flow-test.sh`

- [ ] Write a deterministic integration test proving Workspace + base configuration + heterogeneous source selection produces a draft/review and reserves one Run with source-specific Jobs, while a non-ready included source blocks Start without reservation/provider calls.
- [ ] Run the focused test and observe failure because the shared contracts/controller do not exist.
- [ ] Define sanitized request/response types for Workspace selection, source cards, draft/review, progress/result, and export actions; include source IDs and readiness only, never secrets.
- [ ] Implement the controller against injected repository/readiness/source/orchestration/export dependencies. Build source-specific JobPlans using existing adapters/helpers, reserve with `reserveRunFromJobPlans`, update Last Run through that path, and expose retry/result summaries from persisted Core state.
- [ ] Run the focused test until it passes and verify excluded unhealthy sources do not block and no provider call occurs on blocked Start.

### Task 2: Typed IPC and main-process composition

**Files:**
- Modify: `src/shared/application-info.ts`
- Modify: `src/preload.ts`
- Modify: `src/global.d.ts`
- Modify: `src/main.ts`
- Create/modify: `src/main/app/desktop-multisource-composition.ts`
- Test: `tests/integration/app/desktop-ipc-boundary.integration.cjs`

- [ ] Add IPC channels and typed `RoofRoomApi` methods for sanitized Workspace/preset/settings reads and writes, source readiness, draft/review/start/state/retry, run history/result, and Export All/Successful Only.
- [ ] Add main handlers that assert trusted senders, validate payloads fail-closed, and delegate to the desktop facade; keep filesystem opening in main only.
- [ ] Compose existing database, CredentialStore, source/readiness registries, and source runtimes for all seven supported sources without exposing credential material.
- [ ] Add a deterministic boundary test that rejects malformed payloads and asserts returned objects and export manifests contain no secret or credential reference.
- [ ] Run TypeScript and the boundary test.

### Task 3: Generalized renderer journey

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Test: `tests/integration/app/desktop-ui-smoke.integration.cjs` or a new controller/view-model test under `tests/integration/app/`

- [ ] Replace the GT-only state machine and controls with compact navigation and views for HOME, RUNS, PRESETS, WORKSPACE, SETUP, REVIEW, PROGRESS, and RESULT.
- [ ] Render Workspace/base-choice selection, source cards with inclusion/readiness/config summaries, review proofing, aggregate progress, mixed-result rollup, Retry Failed, and Export All/Successful Only actions.
- [ ] Remove normal Cancel/Resume controls from product UI while preserving backend IPC compatibility for recovery internals; never render secrets, credential refs, raw JSON, or giant query dumps.
- [ ] Keep the BLOG-WEEK configuration representable through source-owned configuration summaries without hard-coding live execution.
- [ ] Run the deterministic desktop smoke/controller checks and lint.

### Task 4: Multi-source Data Package exporter

**Files:**
- Create: `src/main/export/data-package-exporter.ts`
- Create: `src/shared/data-package.ts`
- Modify: existing export/app file-access composition only where required
- Test: `tests/integration/export/data-package-exporter.integration.cjs`
- Test runner: `tests/integration/export/run-data-package-exporter-test.sh`

- [ ] Write a mixed-run package test covering Export All and Export Successful Only with separate source datasets, manifest/provenance, raw evidence immutability, NULL preservation, and no fabricated failed rows.
- [ ] Run the package test and observe the expected missing exporter failure.
- [ ] Implement a source-keyed package manifest and deterministic CSV/XLSX/JSON files using existing storage/export helpers; include failed/rejected context only in Export All and omit failed normalized datasets from Successful Only.
- [ ] Add natural latest-two-exportable-run retention only if existing directory/repository boundaries support it without deleting raw artifacts; otherwise report the exact deferred cleanup gap.
- [ ] Run the package test and existing Google Trends export test.

### Task 5: Verification, documentation, and checkpoint closure

**Files:**
- Modify: `ARCHITECTURE.md`, `DATA_CONTRACTS.md`, `DECISIONS.md`, `TEST_STRATEGY.md`
- Modify after technical commit only: `PROJECT_HANDOFF.md`
- Modify: `tests/integration/release/run-release-gate.sh`, `package.json`

- [ ] Run focused desktop-flow, IPC-boundary, package, source-neutral/multi-source/retry/readiness/credential checks, `npx tsc --noEmit`, `npm run lint`, and `git diff --check`.
- [ ] Invoke `npm run test:release:gate` exactly once and require visible `PASS RELEASE-GATE-001` before claiming release verification.
- [ ] Stage only technical files (excluding the two historical files and handoff) and commit `feat: add multi-source desktop run flow`; if `.git/index.lock` cannot be created, stop without retrying and do not edit handoff.
- [ ] Update `PROJECT_HANDOFF.md` with exact verified state and remaining manual/live steps, then commit separately as `docs: close desktop data package checkpoint`.

