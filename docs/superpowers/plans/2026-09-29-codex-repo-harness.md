# Codex Repository Harness Refinement Plan

**Goal:** Strengthen the existing RoofRoom repository instructions so Codex can spend less context rediscovering project boundaries and more time implementing approved vertical slices safely.

**Repository evidence:** The repository already contains a root `AGENTS.md`, active `docs/superpowers/specs/` and `docs/superpowers/plans/` history, a source-neutral Core, and a real `src/main/sources/google-ads/` module. Therefore this checkpoint refines the existing harness rather than creating a second planning system.

**Scope:**
- minimally refine root `AGENTS.md`;
- add `.agent/PLANS.md` as the planning policy that points to the existing Superpowers directories;
- add scoped Core instructions;
- add scoped Google Ads source instructions.

**Out of scope:**
- product/source implementation changes;
- Ads Optimization dataset implementation;
- SQLite/schema changes;
- package-script changes;
- provider calls;
- changes to unrelated working-tree WIP;
- handoff changes that cannot be proven from this documentation-only checkpoint.

**Protected existing WIP from the supplied repository audit:**
- `src/shared/desktop-run-resolution.ts`;
- `tests/integration/google-api/gsc-reviewed-quick-run.integration.cjs`;
- existing untracked historical/audit files.

## Tasks

- [x] Preserve the existing planning locations instead of adding `docs/exec-plans/`.
- [x] Add `.agent/PLANS.md` with plan, verification, dirty-tree, provider, and documentation rules.
- [x] Add `src/main/core/AGENTS.md` with the source-neutral Core boundary.
- [x] Add `src/main/sources/google-ads/AGENTS.md` with verified-source, evidence-integrity, credential, and test boundaries.
- [x] Update root `AGENTS.md` only to point to the planning contract and explicitly prohibit arithmetic fabrication of provider metrics.

## Verification

Documentation-only/static checks for this snapshot:

- confirm no product source/test files were modified by this harness checkpoint;
- confirm the three instruction files exist at their intended scopes;
- confirm root `AGENTS.md` points to the existing planning system;
- run whitespace/diff checks where Git metadata is available in the live repository.

The supplied snapshot intentionally excludes `.git` and `node_modules`, so executable repository gates are deferred to the live working tree. No live provider call is required or permitted for this checkpoint.

## Acceptance criteria

- one planning system remains authoritative: `docs/superpowers/specs/` + `docs/superpowers/plans/`;
- Core and Google Ads have concise scoped instructions;
- provider-data fabrication is explicitly prohibited;
- existing user WIP remains untouched;
- no Ads Optimization implementation begins in this checkpoint.
