# Multi-Source Reviewed Run Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a planning-complete multi-source Review produce one exact immutable reviewed execution artifact and make Start consume that exact artifact without re-resolving dates or run-scoped context.

**Architecture:** Preserve reusable Saved Preset intent separately from one-Run resolved execution context. Capture one Review clock, resolve source-local execution context at the application/controller boundary, and persist the exact reviewed resolved configuration without inventing a synthetic multi-source provider identity.

**Tech Stack:** TypeScript, Electron desktop application layer, Node.js integration tests, SQLite-backed Run reservation through the existing repository boundary.

**Spec:** `docs/superpowers/specs/2026-10-05-multisource-reviewed-run-artifact-design.md`

## Global Constraints

- No SQLite schema change.
- No synthetic `multi-source` provider, source, or task identity.
- Core remains source-neutral.
- Provider-specific resolution remains outside generic Core.
- Raw provider evidence authority is unchanged.
- Reusable Saved Preset configuration stays separate from resolved Run configuration.
- Review captures one `resolved_at` and one local `reference_date`.
- Start must not re-resolve date policies or replace reviewed run-scoped inputs.
- P0-01 remains authoritative: every included source must produce at least one JobPlan.
- No live provider request is required.
- Ikas file binding and Google Ads Growth hydration remain follow-on bugs, not hidden additions to this slice.

## Review Focus

1. Review before midnight and Start after midnight must preserve the exact reviewed windows.
2. A multi-source reviewed artifact must contain only real included source IDs and must not invent root provider identity.
3. A malformed or incomplete included-source plan must remain fail-closed at Review and at Start.
4. Reusable relative configuration must remain unchanged after Review and Start.
5. Existing single-source reviewed Quick Run behavior must remain compatible.

---

### Task 1: Generalize the reviewed-draft shared contract

**Files:**
- Modify: `src/shared/desktop-multisource.ts`
- Test: `tests/integration/app/desktop-multisource-flow.integration.cjs`

**Interfaces:**
- Consumes: existing `DesktopReviewedRunDraft` and `isDesktopReviewedRunDraft`.
- Produces: `DesktopReviewedRunDraft` with `task_id: string | null`, `source_id: string | null`, and ordered `included_sources: string[]`.

- [ ] **Step 1: Write the failing contract tests**

Add assertions proving:

- a valid multi-source reviewed artifact with `task_id: null`, `source_id: null`, and two real `included_sources` passes `isDesktopReviewedRunDraft`;
- a single-source artifact still accepts its real task/source IDs;
- missing, empty, or non-array `included_sources` is rejected.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

`bash tests/integration/app/run-desktop-multisource-flow-test.sh`

Expected: FAIL because the current reviewed-draft contract requires string task/source IDs and has no `included_sources` requirement.

- [ ] **Step 3: Implement the minimal shared-contract change**

Update:

`DesktopReviewedRunDraft`

to expose:

`task_id: string | null`
`source_id: string | null`
`included_sources: string[]`

Update `isDesktopReviewedRunDraft(value)` to validate the nullable identities and non-empty string source list without inventing a synthetic identity.

- [ ] **Step 4: Run the focused test and TypeScript**

Run:

`bash tests/integration/app/run-desktop-multisource-flow-test.sh`
`npx tsc --noEmit`

Expected: PASS / no TypeScript output.

- [ ] **Step 5: Commit**

Commit message:

`refactor: generalize reviewed run artifact identity`

---

### Task 2: Freeze one exact multi-source Review artifact

**Files:**
- Modify: `src/main/app/desktop-multisource-controller.ts`
- Modify: `tests/integration/presets/asset-preset-multisource-window.integration.cjs`

**Interfaces:**
- Consumes: generalized `DesktopReviewedRunDraft` from Task 1.
- Produces: multi-source `review.reviewed_draft` with one Review timestamp/reference date and exact `resolved_configuration`.

- [ ] **Step 1: Replace the old multi-source-null assertion with the RED contract**

In `asset-preset-multisource-window.integration.cjs`, use the existing GSC Query x Page + Ads Search Terms rolling fixture and assert after Review:

- `review.reviewed_draft !== null`;
- `task_id === null`;
- `source_id === null`;
- `included_sources` equals:
  `["google-search-console-query-page", "google-ads-search-terms"]`;
- `reference_date === "2026-10-04"`;
- `resolved_at` is the single captured Review instant;
- resolved GSC and Search Terms windows are exactly `2026-09-27 -> 2026-10-03`;
- reusable configuration remains relative and unchanged.

Use an injected clock whose call result can later be advanced for Task 3.

- [ ] **Step 2: Run the preset-focused test and verify RED**

Run:

`bash tests/integration/presets/run-presets-gate.sh multisource`

Expected: FAIL at the current `reviewed_draft === null` behavior.

- [ ] **Step 3: Make Review capture the clock once**

In `DesktopMultiSourceController.reviewDraft()`:

- capture `const resolvedAt = this.now()` once;
- derive one local `referenceDate`;
- pass that captured time into source resolution instead of allowing sibling source resolution to call `this.now()` independently.

Refactor the private resolution seam minimally so both single-source and multi-source Review can consume an explicit Review time.

Preferred existing-boundary signatures:

`resolveReviewedDraft(draft: DesktopRunDraft, resolvedAt: Date): DesktopReviewedRunDraft | null`

`resolveMultiSourceExecutionConfiguration(draft: DesktopRunDraft, resolvedAt: Date): ReusableCollectionConfiguration`

Do not create a generic provider-semantics abstraction.

- [ ] **Step 4: Construct the multi-source reviewed artifact only from Review-time data**

When more than one source is included:

- preserve ordered real `included_sources`;
- set `task_id` and `source_id` to `null`;
- store the one `reference_date` and `resolved_at`;
- preserve cloned reusable configuration;
- store the resolved execution configuration.

If any included source has zero planned Jobs, P0-01 remains fail-closed and Review must not expose a startable reviewed artifact.

- [ ] **Step 5: Run focused tests**

Run:

`bash tests/integration/presets/run-presets-gate.sh multisource`
`bash tests/integration/app/run-desktop-multisource-flow-test.sh`
`npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message:

`feat: freeze multisource review artifact`

---

### Task 3: Start exactly the reviewed multi-source artifact

**Files:**
- Modify: `src/main/app/desktop-multisource-controller.ts`
- Modify: `tests/integration/presets/asset-preset-multisource-window.integration.cjs`

**Interfaces:**
- Consumes: Task 2 `DesktopReviewedRunDraft`.
- Produces: Run reservation and JobPlans generated only from `reviewedDraft.resolved_configuration`.

- [ ] **Step 1: Write the clock-drift RED test**

After Review, advance the injected clock to the next local day.

Call:

`controller.startDraft(review.reviewed_draft)`

Do not call Start with the original unresolved draft.

Assert:

- Start planner inputs still contain `2026-09-27 -> 2026-10-03`;
- no date becomes `2026-09-28 -> 2026-10-04`;
- persisted snapshot `reference_date` remains `2026-10-04`;
- persisted `resolved_at` remains the Review instant;
- snapshot source configurations equal the reviewed resolved source configurations;
- reusable configuration still contains the original relative policies;
- root `source_id` and `task_id` are null, never `"multi-source"`.

- [ ] **Step 2: Run the focused preset test and verify RED**

Run:

`bash tests/integration/presets/run-presets-gate.sh multisource`

Expected: FAIL until multi-source `startReviewedDraft` can consume nullable root identity without re-resolution.

- [ ] **Step 3: Make `startReviewedDraft()` multi-source safe**

Keep current Start responsibilities:

- validate Workspace;
- re-check current readiness;
- build plans from `reviewedDraft.resolved_configuration`;
- reserve and execute.

Add per-source planning coverage at Start as a second fail-closed boundary: every `reviewedDraft.included_sources` entry must have at least one JobPlan.

Do not call `resolveMultiSourceExecutionConfiguration()` or `this.now()` from reviewed Start.

- [ ] **Step 4: Preserve truthful snapshot provenance**

For single-source reviewed artifacts, preserve existing root task/source/date-policy provenance behavior.

For multi-source reviewed artifacts:

- snapshot the exact resolved configuration;
- add `workspace_id`, `reference_date`, and `resolved_at`;
- keep singular `task_id` and `source_id` null or absent according to the approved shared artifact shape;
- do not derive a root date policy or root requested range from one arbitrary source.

Real source identity remains in Jobs and source-local configuration.

- [ ] **Step 5: Run focused verification**

Run:

`bash tests/integration/presets/run-presets-gate.sh multisource`
`bash tests/integration/app/run-desktop-multisource-flow-test.sh`
`npx tsc --noEmit`
`git diff --check`

Expected: all PASS / clean.

- [ ] **Step 6: Commit**

Commit message:

`fix: start exact reviewed multisource configuration`

---

### Task 4: Regression gate and bug-register evidence

**Files:**
- Modify: `docs/USER_JOURNEY_BUG_REGISTER.md`
- Verification only: existing test suites

**Interfaces:**
- Consumes: completed P0-02 implementation.
- Produces: deterministic evidence record for P0-02 and leaves P0-03/P0-04/P0-05 explicitly open.

- [ ] **Step 1: Run the affected regression gate**

Run:

`bash tests/integration/presets/run-presets-gate.sh multisource`

`bash tests/integration/presets/run-presets-gate.sh catalog`

`bash tests/integration/app/run-desktop-multisource-flow-test.sh`

`npm run test:m5:desktop-ui`

`npx tsc --noEmit`

`git diff --check`

Expected: all deterministic gates PASS.

- [ ] **Step 2: Update P0-02 evidence only**

In `docs/USER_JOURNEY_BUG_REGISTER.md`:

- set P0-02 to `DETERMINISTICALLY VERIFIED`;
- record the Review-clock freeze, exact reviewed Start, source identity, and regression evidence;
- keep P0-03, P0-04, and P0-05 OPEN;
- do not claim runtime or live-provider verification.

- [ ] **Step 3: Check repository scope**

Run:

`git status --short`
`git diff --check`

Expected: only intended P0-02 implementation/test/docs changes.

- [ ] **Step 4: Commit the evidence update**

Commit message:

`docs: record reviewed multisource verification`

- [ ] **Step 5: Push and verify local/remote equality**

Push the branch, compare `git rev-parse HEAD` with `git ls-remote --heads origin`, and require exact SHA equality.

## Self-review result

- Spec coverage: all 12 acceptance criteria are assigned to Tasks 1–4.
- P0-01 remains independently enforced at Review and is added to reviewed Start as defense against stale/malformed artifacts.
- Single-source compatibility is explicitly regression-tested.
- No Ikas, Growth, provider, Core, or persistence-schema scope is pulled forward.
- The existing controller boundary is reused; no new generic provider abstraction is introduced.
- Plan remains limited to contract, Review freezing, exact Start, and evidence recording.
