# RoofRoom Data Collector — Planning Contract

Use the existing planning locations:

```text
docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
docs/superpowers/plans/YYYY-MM-DD-<topic>.md
```

Do not create a second planning tree.

## When a design/spec is needed

Use a design before implementation when a task materially changes:

- persisted schema/migrations;
- shared Core/public contracts;
- source/dataset/source-mode semantics;
- credential/security boundaries;
- validation/package/export eligibility;
- desktop IPC/public contracts;
- provider acquisition behavior not already locked.

Small fixes inside an already-approved contract may use a short focused plan.

## Plan content

A plan should contain only what is needed to execute safely:

1. goal;
2. inspected current evidence;
3. scope / out of scope;
4. exact affected files/interfaces;
5. failing deterministic test or verification entry point where applicable;
6. minimal implementation steps;
7. relevant verification;
8. acceptance criteria;
9. documentation/Git checkpoint only when required.

Use real inspected paths/commands. Do not invent files, provider behavior, contracts, or test commands.

## Task sizing

Prefer the smallest independently reviewable vertical slice.

Do not combine unrelated cleanup, architecture generalization, provider acceptance, or release work into the same plan.

Verification depth belongs in `TEST_STRATEGY.md`.

Provider/live-test safety belongs in the Project instructions and source contracts.

## Completion

A plan is not implementation evidence.

Update `PROJECT_HANDOFF.md` only from verified repository state and actual results, and only when the current checkpoint/next action materially changes.
