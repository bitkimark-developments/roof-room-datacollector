# Generic Run Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add source-neutral explicit Run cancellation while preserving accepted evidence, attempt history, and provider-specific interruption boundaries.

**Architecture:** DesktopRunState exposes authoritative can_cancel. DesktopMultiSourceController owns the user intent, DesktopExecutionService owns active execution plus an optional cancellation handle, Core owns persisted Run/Job/Attempt terminalization, and each source/runtime owns physical interruption. Google Trends is the first production cancellation implementation.

**Tech Stack:** TypeScript, Electron, React, Playwright, SQLite, deterministic Node integration tests.

**Spec:** docs/superpowers/specs/2026-09-16-generic-run-cancellation-design.md

## Global constraints

- CANCELLED is terminal, not pause.
- Same run_id cannot Resume, Retry, or Continue after cancellation.
- Accepted artifacts and historical completed/failed evidence are preserved.
- Cancellation creates no new Attempt.
- Renderer uses can_cancel and does not infer capability from Run status.
- Provider/browser cancellation remains source/runtime-specific.
- Active cancellation is exposed only when safe physical interruption exists.
- Restart-interrupted inactive Runs may be cancelled without provider recollection.
- No persisted CANCELLING status.
- No normal test calls a live provider.
- Existing Continue, Resume, Retry, Export, and legacy GT cancellation behavior remain green.
- Do not touch CODEX_HANDOFF_CURRENT.md or PROJECT_HANDOFF.pre-20260820.md.

---

### Task 1: Generic explicit Run cancellation vertical slice

This is one coherent interface task. Button, IPC, controller, execution ownership, Core persistence, GT physical stop, and deterministic acceptance belong to the same RED/GREEN slice.

**Expected files to inspect or modify**

- src/shared/desktop-multisource.ts
- src/shared/application-info.ts
- src/preload.ts
- src/main.ts
- src/main/app/desktop-execution-service.ts
- src/main/app/desktop-multisource-controller.ts
- src/DesktopMultiSourceView.tsx
- existing Core Run/Job/Attempt persistence files identified by repository audit
- existing Google Trends runtime/browser ownership file identified by repository audit
- tests/integration/app/desktop-retry-export.integration.cjs
- tests/integration/app/desktop-ui-smoke.integration.cjs
- existing GT desktop-controller cancellation regression test

**Required interfaces**

DesktopRunState adds:

    can_cancel: boolean

Renderer API adds:

    cancelDesktopRun(run_id: string): Promise<DesktopRunState>

Controller adds:

    cancelRun(run_id: string): Promise<DesktopRunState>

DesktopExecutionService provides behavior equivalent to:

    isActive(run_id: string): boolean
    canCancel(run_id: string): boolean
    cancelActive(run_id: string): Promise<void>

Active execution ownership stores execution settlement plus an optional cancellation callback.

- [ ] Step 1 — Perform one bounded read-only implementation audit.

Confirm the exact existing Run cancellation method, Job/Attempt transition methods, active execution ownership, GT browser stop ownership, relevant test files, and package scripts. Do not edit production code during this audit.

- [ ] Step 2 — Write one feature-level failing acceptance test.

Build a deterministic Run with:
- GT01 COMPLETED, VALID, attempt 1, accepted artifact.
- GT02 RUNNING, attempt 1 RUNNING.
- GT03 PENDING.
- active execution owns a cancellation callback.

Before cancel:
- can_cancel is true.

After cancel:
- same run_id is CANCELLED;
- GT01 is unchanged and accepted evidence survives;
- GT02 Job and attempt 1 are CANCELLED;
- GT03 is CANCELLED and never executes;
- cancellation callback ran once;
- no attempt 2 exists;
- can_cancel, can_resume, and can_retry are false.

Also prove an active Run without a cancellation callback has can_cancel false.

Add a restart-interrupted RUNNING case with no current-process ownership. Explicit Cancel must terminalize it without provider recollection, RETRY_PENDING reconciliation, or new attempt creation.

Run the focused test and observe genuine RED before production edits.

- [ ] Step 3 — Make DesktopExecutionService cancellation-aware.

Preserve existing isActive behavior. Store optional cancellation ownership per Run. Add canCancel and cancelActive semantics. Cancellation must target only the matching Run, create no second executor, and keep active ownership until execution settles.

Run the focused acceptance until this boundary is GREEN.

- [ ] Step 4 — Implement source-neutral persisted cancellation.

Reuse existing legal state transitions.

Preserve:
- COMPLETED Jobs;
- FAILED historical Jobs;
- already CANCELLED Jobs;
- accepted artifact references;
- existing attempts.

Terminalize eligible unfinished PENDING, RUNNING, VALIDATING, MANUAL_ACTION_REQUIRED, and RETRY_PENDING work where legal.

No new attempt may be created.

Inactive restart-interrupted cancellation is persistence-only and makes no provider call.

Active cancellation must prevent later Job scheduling and must not report successful cancellation while the Run execution is still owned.

- [ ] Step 5 — Connect Google Trends physical interruption.

Reuse the existing safe GT Playwright/browser shutdown behavior through the generic execution cancellation handle.

Do not put Playwright selectors or browser-specific logic in DesktopMultiSourceController.

A cancellation-caused browser interruption must not later overwrite the Run with FAILED or RETRY_REQUIRED.

- [ ] Step 6 — Wire authoritative state, IPC, and preload.

Add can_cancel explicitly to every DesktopRunState constructor/fixture.

Add the typed cancelDesktopRun boundary through:
- shared IPC contract;
- preload;
- trusted main IPC handler;
- DesktopMultiSourceController.cancelRun.

Reject empty run_id.

Keep legacy cancelCollection separate.

- [ ] Step 7 — Add Run Detail UI RED then GREEN.

Create a UI fixture with:
- run_id rr_fixture_cancel_001;
- status RUNNING;
- can_cancel true;
- can_resume false;
- can_retry false.

Observe RED because Cancel Run is absent.

Then render Cancel Run only from activeRunState.can_cancel.

The click must send the exact persisted run_id and adopt the returned DesktopRunState.

After CANCELLED:
- Cancel Run absent;
- Resume Run absent;
- Continue Run absent;
- Retry Failed absent;
- Run Status: CANCELLED visible.

Existing terminal export behavior remains unchanged.

- [ ] Step 8 — Run focused deterministic verification.

Run:

    npm run test:m5:desktop-retry-export
    npm run test:m5:desktop-ui
    npm run test:m5:desktop-multisource
    npx tsc --noEmit
    npm run lint
    /usr/bin/git diff --check

Also run the existing deterministic Google Trends desktop-controller cancellation suite discovered from package.json.

Do not run m3:live-* or another live-provider command.

- [ ] Step 9 — Review the bounded diff.

Block completion if:
- renderer infers cancel solely from status;
- active Run advertises cancel without a physical cancellation handle;
- cancellation creates an Attempt;
- accepted evidence changes;
- cancelled execution can schedule another Job;
- restart-interrupted cancellation invokes provider;
- cancellation reports success while execution is still owned;
- terminal Run exposes Cancel/Resume/Retry/Continue;
- GT provider logic leaks into the generic controller;
- existing Continue/Resume/Retry behavior regresses;
- historical untracked files are touched.

- [ ] Step 10 — Run full deterministic release verification.

Run:

    npm run test:release:gate
    npx tsc --noEmit
    npm run lint
    /usr/bin/git diff --check

All commands must exit zero. No live-provider call.

- [ ] Step 11 — Close PROJECT_HANDOFF.md and commit.

Record:
- generic can_cancel;
- active cancellation ownership;
- persisted inactive cancellation;
- GT physical-stop implementation;
- accepted-evidence preservation;
- no new attempt;
- CANCELLED terminal semantics;
- RED/GREEN evidence;
- verification commands;
- no live provider request;
- exact next action.

Stage only intended cancellation files and PROJECT_HANDOFF.md.

Verify:

    /usr/bin/git diff --cached --check
    /usr/bin/git diff --cached --name-only

Commit:

    git commit -m "feat: add generic run cancellation"

Final worktree must contain only the two pre-existing historical untracked files unless deterministic tests create a separately verified disposable fixture.