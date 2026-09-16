# RoofRoom Data Collector — Generic Run Cancellation Design

**Date:** 2026-09-16
**Status:** Approved design, pending implementation
**Scope:** Source-neutral explicit Run cancellation through the reviewed desktop Run lifecycle

## 1. Purpose

Add explicit cancellation to the generic desktop Run lifecycle without turning cancellation into Google-Trends-specific behavior.

The governing boundary is:

> Cancellation is a shared Core lifecycle intent with capability-based exposure; physical interruption remains acquisition/runtime-specific.

This design extends the existing generic lifecycle:

Start → Progress → Manual Continue → Restart Resume/Reconcile → Retry Failed → Export

with:

Start / active or blocked Run → explicit Cancel Run → terminal CANCELLED

Cancellation is not pause.

A cancelled Run never resumes or retries under the same run_id.

## 2. Product constraints

The implementation must preserve the existing RoofRoom principles:

- Collect → Preserve → Validate → Document → Export.
- Raw and accepted evidence is never deleted because a Run is cancelled.
- Existing attempt history is never overwritten.
- Cancellation never creates a retry attempt.
- Renderer never owns provider execution, browser control, or persistence transitions.
- Provider-specific interruption remains outside generic UI logic.
- Unsupported cancellation capability must fail visibly rather than being implied.
- No live provider request is required by deterministic cancellation tests.

## 3. Locked terminal semantics

`CANCELLED` is a terminal Run state.

After a Run reaches CANCELLED:

- `Resume Run` is unavailable.
- `Retry Failed` is unavailable.
- `Continue Run` is unavailable.
- no scheduler or startup behavior automatically restarts it;
- recollection requires creation of a new Run;
- accepted artifacts and completed Job evidence remain available;
- export eligibility continues to use existing accepted-evidence rules.

Cancellation must not be implemented as a hidden pause mechanism.

## 4. Capability model

Desktop Run state gains an authoritative:

`can_cancel: boolean`

Renderer must not infer cancellation eligibility solely from `run_status`.

Capability rules:

### Terminal Run

For:

- COMPLETED
- COMPLETED_WITH_WARNINGS
- FAILED
- CANCELLED

`can_cancel = false`.

### In-process active Run

For a Run currently owned by `DesktopExecutionService`:

`can_cancel = true` only when the active execution has a registered cancellation handle.

If the runtime cannot safely interrupt the active operation:

`can_cancel = false`.

### Persisted non-active non-terminal Run

A non-terminal Run that is not owned by live execution in the current process may be cancelled through persistence-only reconciliation.

This includes safe cases such as:

- persisted PENDING;
- MANUAL_ACTION_REQUIRED;
- RETRY_REQUIRED;
- restart-interrupted RUNNING / VALIDATING state where no current process owns execution.

This allows the user to choose terminal cancellation instead of Resume, Retry, or Continue.

### Coexisting actions

`can_cancel` does not need to be mutually exclusive with:

- `can_resume`;
- `can_retry`;
- manual continuation eligibility.

For example, an interrupted Run may expose both Resume Run and Cancel Run. The user chooses the intent.

## 5. Architecture

The generic cancellation path is:

Renderer
→ trusted IPC
→ DesktopMultiSourceController
→ DesktopExecutionService ownership/cancellation boundary
→ Core cancellation persistence
→ source/runtime physical interruption
→ persisted Run state refresh
→ Renderer

### Renderer

Responsibilities:

- render `Cancel Run` only when `can_cancel === true`;
- send exact persisted `run_id`;
- show local busy/cancelling feedback;
- adopt returned persisted `DesktopRunState`;
- show errors without fabricating success.

Renderer must not:

- close Playwright;
- abort HTTP directly;
- modify Run/Job/Attempt status;
- infer provider cancellation capability.

### Trusted IPC / preload

Add one typed generic desktop cancellation operation.

Conceptual API:

`cancelDesktopRun(run_id): Promise<DesktopRunState>`

The Main process validates trusted sender identity and non-empty Run identity before delegating to the generic controller.

Legacy `cancelCollection` remains separate during migration unless later cleanup explicitly removes it.

### DesktopMultiSourceController

The controller owns user intent validation.

It must:

1. require an existing Run;
2. reject terminal Runs except idempotent handling of an already CANCELLED Run if explicitly chosen by implementation;
3. inspect authoritative execution ownership;
4. require runtime cancellation capability when live execution is active;
5. invoke Core cancellation persistence;
6. invoke or coordinate physical interruption when required;
7. return freshly read persisted state;
8. never create a retry attempt.

### DesktopExecutionService

Current execution ownership stores only a Promise per run_id.

It must evolve to an active-operation record that can represent cancellation capability.

Conceptually:

`run_id → { promise, cancel? }`

The exact internal type may differ, but the contract must provide:

- `isActive(run_id)`;
- whether the current active operation can be cancelled;
- an awaited cancellation request for the active operation;
- cleanup of active ownership when execution settles.

Cancellation must not start a second executor for the same Run.

### Core cancellation persistence

Shared Core owns terminal lifecycle persistence.

Cancellation persistence must:

- preserve COMPLETED Jobs;
- preserve FAILED historical Jobs;
- preserve already CANCELLED Jobs;
- preserve accepted artifact references;
- transition eligible non-terminal Jobs to CANCELLED;
- close their active persisted attempts as CANCELLED where required by repository transition rules;
- transition the Run to CANCELLED;
- create no new Attempt.

Eligible Job states are those already allowed by the Job execution state machine, including:

- PENDING;
- RUNNING;
- VALIDATING;
- MANUAL_ACTION_REQUIRED;
- RETRY_PENDING.

A Run cancelled from RETRY_REQUIRED may therefore preserve an already FAILED Job as FAILED while the Run itself becomes CANCELLED. Historical truth takes priority over making every Job share the Run status.

## 6. Physical interruption boundary

Physical interruption is acquisition/runtime-specific.

The generic Core must not know Playwright selectors, Google HTTP clients, API request details, file parser internals, or source credentials.

Examples:

- Google Trends: stop the owned Playwright/browser acquisition safely.
- API sources: use their supported request/loop abort boundary when implemented.
- file imports: use cooperative cancellation only if there is meaningful active work to interrupt.
- SerpApi: stop further requested work and abort active HTTP work where supported.

A source that cannot safely interrupt an active operation must not advertise active cancellation capability.

## 7. Google Trends reference implementation

Google Trends is the first production implementation of the generic cancellation runtime boundary.

The existing legacy controller already proves that browser closure can interrupt active collection.

The generic path must reuse the safe runtime capability without moving Google Trends provider logic into `DesktopMultiSourceController`.

Reference deterministic scenario:

1. one reviewed Google Trends Run exists;
2. GT01 completed VALID with accepted artifact on attempt 1;
3. GT02 is actively RUNNING on attempt 1;
4. Run Detail exposes Cancel Run;
5. user explicitly cancels;
6. GT01 remains COMPLETED / VALID / accepted / attempt_count 1;
7. GT02 attempt 1 becomes CANCELLED;
8. GT02 Job becomes CANCELLED;
9. later pending work does not start;
10. Run becomes CANCELLED;
11. no new attempt is created;
12. provider execution is stopped;
13. Resume, Retry, and Continue are unavailable;
14. accepted GT01 evidence remains exportable under existing export rules.

## 8. Ordering and race safety

Cancellation spans persistent state and an external runtime, so it cannot be a single database transaction across both boundaries.

The implementation must fail closed.

Required behavior:

- once explicit cancellation is accepted, Core state must prevent further scheduling and accepted-evidence mutation for cancelled work;
- physical interruption must be requested through the active execution owner;
- the desktop cancellation call must not report successful completion until active execution ownership has been released or the Run was already inactive;
- a runtime interruption failure must be surfaced and logged rather than silently treated as success;
- accepted artifacts created before cancellation remain immutable;
- evidence produced after cancellation must not be silently accepted into a cancelled attempt;
- process crash during cancellation falls back to persisted restart/reconciliation rules rather than automatic recollection.

No new persisted `CANCELLING` Run status is introduced in this slice.

The renderer may use temporary local busy/cancelling presentation state.

## 9. Restart-interrupted cancellation

A persisted Run may appear RUNNING or VALIDATING after application restart even though no current process owns it.

The user must be allowed to choose:

- Resume Run, when `can_resume` permits it; or
- Cancel Run, when persistence can safely terminalize the interrupted work.

Choosing Cancel:

- does not run the provider;
- does not first reconcile into RETRY_PENDING;
- closes eligible interrupted Job/Attempt state as CANCELLED;
- transitions the same Run to CANCELLED;
- permanently ends that Run.

## 10. Manual-action and retry-required cancellation

MANUAL_ACTION_REQUIRED:

- Continue Run may remain available;
- Cancel Run may also be available;
- cancellation ends the Run without continuing provider work.

RETRY_REQUIRED:

- Retry Failed may remain available;
- Cancel Run may also be available;
- cancellation creates no attempt 2.

The two actions represent different explicit user intents and must not be conflated.

## 11. UI behavior

Run Detail adds a secondary destructive/terminal action:

`Cancel Run`

It is shown only when `activeRunState.can_cancel === true`.

The first implementation does not require a new multi-step cancellation wizard.

While the action is in flight:

- duplicate Run actions are disabled through existing busy behavior;
- the UI may display cancelling feedback;
- persisted state remains authoritative.

After successful cancellation:

`Run Status: CANCELLED`

Run Detail must not expose Resume, Retry Failed, or Continue Run.

Existing terminal export controls remain governed by accepted evidence and current export rules.

## 12. Error handling

The cancellation boundary must distinguish:

- unknown Run;
- terminal non-cancellable Run;
- live Run with no supported physical cancellation capability;
- provider/runtime stop failure;
- persistence transition failure;
- race where execution already completed before cancellation acquired control.

No error may be converted into a false successful CANCELLED response.

If execution crosses into a valid terminal completion before cancellation wins the race, persisted terminal truth wins and illegal status rewriting is rejected.

## 13. Deterministic TDD package

Implementation is one coherent interface / vertical slice.

### Core/controller RED

Add a deterministic cancellation acceptance test proving:

- exact run_id is preserved;
- accepted GT01 is unchanged;
- active GT02 attempt 1 is cancelled;
- no attempt 2 exists;
- pending later work does not execute;
- Run is CANCELLED;
- physical cancellation callback is invoked exactly as expected;
- retry/resume capability becomes false.

### Execution ownership RED

Prove:

- active cancellable operation advertises cancellation;
- active non-cancellable operation does not;
- cancellation is routed only to the owning operation;
- duplicate executor is not created;
- ownership clears when cancellation settles.

### UI RED

Add a Run Detail scenario proving:

- `Cancel Run` appears only for `can_cancel === true`;
- exact persisted run_id crosses the desktop API boundary;
- returned CANCELLED state is adopted;
- Resume / Continue / Retry actions disappear;
- terminal export behavior remains available under current rules.

### Regression

Preserve:

- manual continuation;
- interrupted Run Resume;
- explicit failed-job Retry;
- export;
- legacy Google Trends cancellation behavior;
- existing release gate.

No normal test may call a live provider.

## 14. Out of scope

This slice does not add:

- pause/resume semantics for cancelled Runs;
- undo cancellation;
- automatic Run restart;
- cancellation reason taxonomy;
- persisted CANCELLING status;
- cancellation timeout policy shared across every future provider;
- bulk cancellation of multiple Runs;
- Workspace-wide Stop All;
- cancellation scheduling;
- new provider adapters;
- freshness behavior;
- redesign of existing retry/resume semantics.

## 15. Acceptance criteria

The slice is complete when:

1. generic DesktopRunState exposes authoritative `can_cancel`;
2. Run Detail exposes explicit Cancel Run only when allowed;
3. trusted typed IPC/preload supports exact-run cancellation;
4. active execution ownership supports a source/runtime cancellation handle;
5. Google Trends provides the first production physical-stop implementation;
6. accepted evidence survives cancellation unchanged;
7. eligible non-terminal Job/Attempt state is terminalized safely;
8. no retry attempt is created by cancellation;
9. the Run becomes terminal CANCELLED;
10. restart-interrupted Runs can be explicitly cancelled without provider recollection;
11. cancellation success is not reported while owned execution remains active;
12. deterministic acceptance, UI, typecheck, lint, diff check, and release gate pass;
13. no live provider call is made by normal verification;
14. PROJECT_HANDOFF.md records actual implementation after the code checkpoint.

## 16. Implementation discipline

Implementation follows:

feature-level RED
→ coherent Core/runtime/IPC/UI GREEN batch
→ focused deterministic verification
→ bounded diff review
→ full release gate
→ PROJECT_HANDOFF checkpoint
→ Git commit

The slice remains one coherent cancellation interface task rather than separate micro-tasks for button, IPC, Core, and runtime seams.
