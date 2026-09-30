# RoofRoom Data Collector — Codex Instructions

## Project authority

Before starting implementation work:

1. Read `AGENTS.md`.
2. Inspect current Git branch, HEAD, status, and only the recent commits needed to establish the active checkpoint.
3. Read only the latest relevant checkpoint / exact-next-action section of `PROJECT_HANDOFF.md`; do not read the entire file by default.
4. If an approved task-specific design or implementation plan exists under `docs/superpowers/specs/` or `docs/superpowers/plans/`, treat it as the primary task contract.
5. Read only the relevant sections of `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `DATA_CONTRACTS.md`, `VALIDATION_SPEC.md`, `TEST_STRATEGY.md`, `DECISIONS.md`, or `SOURCE_MODULE_GUIDE.md` when the current task actually requires them.

Do not preload all canonical documents merely because implementation work is starting.

Do not infer current project state from old commits or historical documentation when a newer verified handoff checkpoint exists.

For substantial architectural or multi-step work, follow `.agent/PLANS.md` and the existing `docs/superpowers/specs/` + `docs/superpowers/plans/` workflow. Do not create a parallel planning directory or duplicate planning system.

## Product purpose

RoofRoom Data Collector is a local-first modular desktop data collection application.

Core philosophy:

Collect → Preserve → Validate → Document → Export

The collector does not make marketing, SEO, advertising, merchandising, or commercial decisions.

Analysis belongs to a separate future layer.

## Release scope discipline

Release 1.0 is the verified multi-source scope defined in `PROJECT_SPEC.md`.

Feasibility approval, repository implementation, deterministic verification, and live-provider acceptance are separate claims. Use the latest relevant verified checkpoint in `PROJECT_HANDOFF.md` when deciding what is actually implemented or what action is next; do not read the entire handoff by default.

Google Trends is the first implemented/reference browser-export source module. Do not reopen its working Core/provider behavior without new failing evidence or an explicitly approved scope.

Add another source only through:

Feasibility/acquisition proof → source contract → implementation permission → vertical slice → deterministic regression → limited explicit live acceptance.

Semrush is not an active Release 1.0 requirement. Merchant Center, GA4, and other future providers remain extensibility examples until they pass their own feasibility and scope gates.

## Architecture

Design and preserve:

One application with multiple independent source modules.

Shared Core owns reusable concerns such as:

- run/job/attempt state
- resume/retry
- browser lifecycle
- storage
- metadata/provenance
- validation coordination
- logging
- export
- desktop integration

Source modules own only source-specific collection, parsing, validation, and error mapping.

Do not unnecessarily rewrite working architecture.

## Data integrity

Never invent unavailable data.

Never silently replace missing values with zero.

Never estimate, interpolate, proportionally allocate, or otherwise invent missing provider metrics and then treat the result as source evidence.

Preserve raw source files as immutable evidence whenever practical.

Create separate normalized/derived representations when transformation is required.

Every dataset must remain traceable to its run, job, attempt, source, and raw artifact.

Google Trends 0–100 values are relative interest only.

Never convert Google Trends values into estimated search counts.

Different comparison groups are independently normalized and must not automatically be treated as globally comparable.

Preserve query-group context for duplicate queries.

Search Term and Topic datasets remain separate.

## Validation-first behavior

A successful browser action or download is not automatically a successful collection.

Fail closed on suspicious provider state, unexpected UI state, invalid schema, mismatched queries, mismatched dates, or non-data content.

Do not silently accept suspicious artifacts.

Keep execution state and validation status separate.

## Browser / provider safety

Prefer supported official APIs when suitable.

When browser automation is required, prefer Playwright.

Use the application-owned persistent browser profile.

Never:

- store user passwords
- use the user's normal Chrome profile
- copy cookies or sessions without explicit consent
- bypass CAPTCHA
- bypass 2FA
- bypass anti-bot protections
- bypass rate limits
- use CAPTCHA solvers
- use proxy rotation for evasion

Authentication/security intervention must surface as `MANUAL_ACTION_REQUIRED`.

If rate limiting is detected:

- stop
- do not refresh
- do not immediately retry
- do not evade the restriction

Live Google requests must be explicit and limited.

## Development discipline

Use:

Plan → Implement → Test → Verify → Git Commit → Document → Next Milestone

Before implementation:

1. inspect `git status`
2. inspect the relevant existing files
3. understand the current contract/tests
4. distinguish:
   - proven fact
   - inference
   - untested hypothesis

Do not implement a hypothesis as though it were a proven provider fact.

Prefer small verified vertical slices.

## Git discipline

Do not layer new work on an unexplained dirty working tree.

Preserve unrelated user changes and keep technical checkpoints narrowly scoped.

Do not commit unverified work.

Do not use `git reset --hard` as a normal recovery mechanism.

Do not use stash as the default way to hide unresolved work.

## Testing

Prefer deterministic tests over live-provider tests.

Live Google Trends tests must be separately explicit and must not be used as routine regression tests.

Do not assert exact live Google Trends numeric values.

Before a technical checkpoint, run the relevant deterministic tests and type/lint/build checks.

Before milestone boundaries, use the milestone acceptance gate defined by the project.

Do not record a test as PASS unless it actually ran successfully.

## macOS environment

Primary development environment:

- MacBook Air M1
- macOS
- Apple Silicon
- VS Code / Codex local project

Helper shell scripts must remain compatible with macOS system Bash 3.2 unless a script explicitly selects another installed shell.

Do not rely on Bash features such as:

- `mapfile`
- `readarray`
- associative arrays

without explicitly changing and documenting the shell/runtime requirement.

## Documentation discipline

`PROJECT_SPEC.md` is relatively stable.

Change it only when product scope, architecture, data contracts, acceptance criteria, or locked technical decisions materially change.

`PROJECT_HANDOFF.md` is the living project-state document.

Update it when:

- ending a meaningful session / long pause
- crossing a milestone boundary
- completing multiple meaningful slices
- discovering an important blocker
- materially changing the exact next action

Do not update the handoff after every small commit.

Use Git commits for technical checkpoints.

Never write unverified implementation work as completed.

## Thread-start audit discipline

At the start of a new Codex thread:

- begin read-only;
- read `AGENTS.md`;
- inspect current branch, HEAD, Git status, and only the recent commits needed for the task;
- read the latest relevant `PROJECT_HANDOFF.md` checkpoint or exact-next-action section, not the whole file by default;
- if the prompt identifies an approved design/spec, read that task-specific artifact first;
- if an approved implementation plan exists, execution should primarily follow that plan;
- inspect only repository files needed for the exact next action;
- do not reread large unchanged documents whose relevant facts are already established in the current thread;
- do not modify code until the necessary current state has been reconstructed from repository evidence.

A thread-start audit should establish enough evidence to work safely, not maximize context consumption.

When reporting reasoning, explicitly separate:

- proven fact
- inference
- untested hypothesis

## Codex Context Efficiency

Context and token efficiency are project quality requirements.

### Canonical documentation is the source of truth

Do not duplicate authoritative repository documentation inside Codex prompts.

If a design, specification, implementation plan, handoff, contract, architecture rule, or acceptance criterion already exists in the repository, reference the exact file or section instead of restating its contents in the prompt.

Before adding repository context to a prompt, ask:

> Is this information already recorded authoritatively in the repository?

If yes, reference it rather than copying it.

### Read only what the current task requires

Do not preload every canonical document by default.

Prefer the smallest relevant set of files and sections needed for the current task.

In particular:

- do not read all of `PROJECT_HANDOFF.md` when only its latest checkpoint or one section is needed;
- do not reread all canonical architecture documents when an approved design/spec already contains the required contract;
- use targeted sections/ranges when a large document contains the relevant information;
- do not repeat a full repository audit in the same thread unless repository state may have materially changed.

When an approved design exists, treat that design as the primary task contract and inspect other canonical documents only where needed to resolve a real dependency or contradiction.

When an approved implementation plan exists, execution should primarily follow that plan plus the files it explicitly requires.

### Separate planning from execution

Planning prompts must be minimal and planning-only.

Execution prompts should reference the approved design and implementation plan rather than restating them.

Do not copy the complete design, architecture, acceptance criteria, and repository history into an execution prompt when those already exist as repository files.

### Reasoning-effort discipline

For routine implementation, TDD, and plan execution, prefer Medium reasoning effort.

Escalate to High only when there is concrete evidence that the task requires it, such as:

- architectural ambiguity;
- conflicting repository contracts;
- difficult debugging after systematic investigation;
- a complex migration or compatibility problem;
- a failure that cannot be explained with the existing plan and evidence.

Do not use High reasoning merely because a task is long.

### Avoid redundant context

Do not make the prompt a second copy of the repository.

Avoid this pattern:

repository docs
→ duplicated into a large prompt
→ reread again by Codex from the repository

Prefer:

short prompt
→ exact authoritative file references
→ targeted repository inspection

A longer context is not assumed to be a better context.

### Thread continuity

Within an active Codex thread, reuse already established repository facts unless:

- HEAD changed;
- branch changed;
- files relevant to those facts changed;
- the user asks for re-verification;
- a verification gate requires fresh evidence.

Do not reread large unchanged documents simply to reconfirm facts already established in the same thread.

### Prompt review gate

Before sending or recommending a Codex prompt, check:

1. Does the prompt repeat material already present in a repository spec, plan, handoff, or contract?
2. Can repeated material be replaced by an exact file/section reference?
3. Is Codex being asked to read more canonical documents than the task actually requires?
4. Are planning and implementation being unnecessarily combined?
5. Is High reasoning actually justified?
6. Is the prompt carrying historical context that is irrelevant to the next action?

If any answer indicates unnecessary context, reduce the prompt before using it.