# RoofRoom Data Collector — Repository Instructions

These instructions apply to repository work in addition to the Project-level RoofRoom instructions.

## Authority

Start from the current task and live repository evidence.

Use `PROJECT_HANDOFF.md` for current state / next action, then read only the canonical authority or approved task-specific spec/plan needed by the task.

Do not preload all project documents.

If an approved design or implementation plan exists under `docs/superpowers/specs/` or `docs/superpowers/plans/`, use it as the primary task contract.

For substantial multi-step work, follow `.agent/PLANS.md`. Do not create a parallel planning system.

## Repository discipline

Inspect Git state only when needed to establish current truth, protect existing work, create a checkpoint, or satisfy the task.

Preserve unrelated user/WIP changes.

Do not use destructive reset or stash as routine cleanup.

Do not repeatedly re-read unchanged files, re-check unchanged Git state, or rerun unchanged gates merely for reassurance.

Live code, current persistence, and tests override stale implementation assumptions.

## Implementation

Prefer the smallest reliable change:

```text
existing working code
→ existing/native capability
→ small local helper
→ minimum new abstraction
```

Do not generalize provider-specific behavior into Core.

Do not fabricate provider values or placeholders to satisfy a shared contract.

Use focused deterministic TDD for production behavior/bug fixes where practical.

Verification depth is governed by `TEST_STRATEGY.md`.

Normal automated tests must not call live providers.

## Evidence claims

Do not claim implemented, fixed, passing, packaged, merged, pushed, or live-tested without evidence for that exact claim.

Keep feasibility, deterministic verification, packaged/runtime acceptance, and live-provider acceptance distinct.

## Documentation

`PROJECT_HANDOFF.md` is current-state routing, not a historical changelog.

Update stable product/architecture/data/validation/test rules in their owning canonical documents.

Keep historical detail in Git or completed specs/plans rather than accumulating it in active guidance.

## macOS shell compatibility

Existing helper scripts that target macOS system Bash must remain Bash 3.2-compatible unless the script explicitly selects and documents another shell/runtime.

Do not introduce unsupported Bash features such as `mapfile`, `readarray`, or associative arrays into Bash-3.2-targeted scripts.
