# Unified Desktop Accepted-Evidence Action Plan

## Goal

Close the remaining bounded Work Group 12 usability gap by allowing a user to open a completed Job's canonical accepted raw artifact from Run Detail without exposing filesystem paths or general file access to the renderer.

## Scope

- Add a Job-scoped Core/controller action that requires the exact `run_id` and `job_id`.
- Resolve only the Job's persisted `accepted_artifact_id`, verify Run/Job/artifact ownership and accepted state, and delegate opening to a privileged dependency.
- In production, resolve the persisted run-relative artifact path through `StorageManager`, verify that it is an existing regular file, and open it with Electron `shell.openPath`.
- Expose one strictly validated IPC/preload method and one Run Detail button for Jobs with accepted evidence.
- Preserve the existing navigation and Run Detail design. Do not add a file browser, reveal canonical paths to the renderer, or change source execution/export behavior.

## Test-first sequence

1. Extend the desktop controller integration test with RED cases for exact accepted evidence opening and rejection of cross-Run, missing, or non-accepted evidence.
2. Extend the renderer smoke test with a RED assertion that only a Job with `accepted_artifact_id` exposes the action and sends the exact Run/Job identity.
3. Implement shared API, controller, IPC/preload, production storage/opening composition, and minimal renderer action.
4. Run the focused desktop controller/UI suites, typecheck, lint, whitespace check, and full release gate.

## Acceptance

- The renderer never receives an unrestricted or canonical filesystem path.
- A request cannot open evidence owned by another Run or Job.
- Only `ACCEPTED` or `ACCEPTED_WITH_WARNING` raw evidence linked through the Job's `accepted_artifact_id` can be opened.
- Existing readiness, freshness, Review/Start, progress, manual continuation, resume/retry/cancel, history, and export behavior remains unchanged.
