# Repository Reduction Pass 1 Implementation Plan

**Goal:** Reduce active repository surface without changing production behavior, persisted contracts, provider semantics, evidence rules, or deterministic acceptance coverage.

## Verified starting point

- Cleanup worktree branch: `chore/repository-reduction-pass-1`
- Base before cleanup: `f0808ea`
- Historical-plan cleanup checkpoint: `e5e7f09`
- 30 superseded implementation plans removed.
- 9,593 historical-plan lines removed.
- Repository reference scan after deletion: `BROKEN_REFERENCES=0`.

## Constraints

- Preserve production behavior.
- Preserve every deterministic acceptance boundary.
- Do not delete integration `.cjs` tests merely to reduce file count.
- Do not call live providers.
- Do not mix P0-04 or P0-05 implementation into this branch.
- Keep security/feasibility records and currently active specs/plans.
- Prefer consolidation of test execution boilerplate over removal of test assertions.
- Keep macOS system Bash compatibility where Bash remains.
- Do not push without explicit approval.

## Task 1 — Historical planning cleanup

Completed at `e5e7f09`.

Acceptance:
- old implementation plans through 2026-10-02 removed;
- newer active plans retained;
- no remaining text reference points at a removed plan.

## Task 2 — Test runner audit and consolidation

Inspect all `tests/integration/**/run-*.sh` wrappers and classify:

- KEEP — runner has materially unique orchestration or safety behavior;
- CONSOLIDATE — wrapper only repeats compile-and-run boilerplate that can move to one shared helper;
- DELETE — wrapper is unreferenced and adds no behavior beyond an equivalent maintained entry point.

Do not infer equivalence from filenames alone. Compare actual compile inputs, environment setup, work-directory setup, and node arguments.

Start with one bounded family before any repo-wide migration.

Acceptance:
- underlying `.integration.cjs` assertions remain unchanged unless a failing test proves a required harness correction;
- focused tests for the migrated family execute through the consolidated path;
- no release/package script points at a deleted runner.

## Task 3 — Active documentation surface

After runner cleanup, inspect remaining specs and keep security/architecture decisions that are not duplicated by canonical documents. Remove only documents proven to be historical implementation detail with no active authority role.

## Verification

For documentation-only cleanup:
- reference scan;
- `git diff --check`.

For test-harness cleanup:
- run the exact migrated family tests before and after consolidation;
- run `npx tsc --noEmit` only if TypeScript-affecting harness behavior changes;
- run `git diff --check`.

No broad release gate unless a changed runner is part of release-gate orchestration.

## Completion evidence

Record separately:
- files removed;
- bytes/lines reduced;
- tests preserved;
- focused deterministic verification results.

Do not claim packaged-runtime or live-provider verification.
