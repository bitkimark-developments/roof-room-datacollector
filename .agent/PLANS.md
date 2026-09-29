# RoofRoom Data Collector — Planning Contract

This file defines how substantial implementation work is planned in this repository.

## Existing planning system

Do not create a second planning tree.

Use the existing Superpowers locations:

- approved architectural/product designs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- implementation plans: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`

`PROJECT_HANDOFF.md` is not an implementation-plan backlog. It records verified current state and the exact next action.

## When a design/spec is required

Use a design/spec before implementation when work changes or adds one or more of:

- persisted schema or migrations;
- shared Core contracts;
- source/dataset/source-mode semantics;
- credential or security boundaries;
- validation/export eligibility rules;
- desktop IPC/public contracts;
- task/package assembly behavior;
- provider acquisition behavior that has not already been verified.

Small bug fixes with an already-locked contract may proceed directly to a focused implementation plan when repository evidence supports that scope.

## Implementation-plan structure

Plans should be executable by a fresh engineer or agent and should contain, as applicable:

1. Goal
2. Current repository evidence
3. Scope
4. Out of scope
5. Architecture / contract impact
6. Exact files
7. Interfaces produced/consumed
8. Tests first
9. Implementation steps
10. Verification commands
11. Documentation updates
12. Git checkpoint
13. Acceptance criteria

Use exact repository paths after inspection. Do not invent files, interfaces, source IDs, persisted fields, provider behavior, or test commands.

## Task sizing

Prefer the smallest vertical slice that can be independently reviewed and verified.

For behavior changes, use red-green TDD unless the approved design explicitly establishes another verification method.

Each meaningful task should end with:

- targeted deterministic verification;
- relevant type/lint/build checks;
- `git diff --check`;
- a narrow commit when the working tree permits an isolated checkpoint.

Run the full deterministic release gate at milestone/checkpoint boundaries or when the change can affect shared behavior.

## Provider and live-test rule

Ordinary tests and CI must not call live providers.

A live smoke/acceptance action must be:

- explicitly named;
- separately invoked;
- bounded and quota-aware;
- authorized independently from deterministic verification.

Do not use live provider calls to debug deterministic code or tests.

## Dirty working tree

Before edits, inspect `git status --short`.

Unrelated user/WIP changes are protected:

- do not overwrite them;
- do not reset them;
- do not hide them with stash by default;
- do not include them in a checkpoint commit.

If an isolated commit cannot be made safely, leave the work uncommitted and report the exact conflict.

## Documentation completion rule

Do not claim planned work as implemented.

Update `PROJECT_HANDOFF.md` only from verified repository evidence and actual commands/results. Stable product/architecture/contract changes belong in their canonical documents, not only in the handoff.
