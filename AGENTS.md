# RoofRoom Data Collector — Codex Instructions

## Project authority

Before starting implementation work:

1. Read `PROJECT_HANDOFF.md` for the current verified project state and exact next action.
2. Read `PROJECT_SPEC.md` before making scope, architecture, acceptance-criteria, or product-boundary decisions.
3. Read the relevant supporting documents when the task touches their domain:
   - `ARCHITECTURE.md`
   - `DATA_CONTRACTS.md`
   - `VALIDATION_SPEC.md`
   - `TEST_STRATEGY.md`
   - `DECISIONS.md`
   - `SOURCE_MODULE_GUIDE.md`

Do not infer current project state from old commits or old documentation when `PROJECT_HANDOFF.md` contains newer verified evidence.

## Product purpose

RoofRoom Data Collector is a local-first modular desktop data collection application.

Core philosophy:

Collect → Preserve → Validate → Document → Export

The collector does not make marketing, SEO, advertising, merchandising, or commercial decisions.

Analysis belongs to a separate future layer.

## Release scope discipline

Release 1.0 is the verified multi-source scope defined in `PROJECT_SPEC.md`.

Feasibility approval, repository implementation, deterministic verification, and live-provider acceptance are separate claims. Read `PROJECT_HANDOFF.md` before deciding what is actually implemented or what action is next.

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

- begin read-only
- read `AGENTS.md`
- read `PROJECT_HANDOFF.md`
- inspect current Git status and recent commits
- inspect only the files relevant to the exact next action
- do not modify code until the current state has been reconstructed from repository evidence

When reporting reasoning, explicitly separate:

- proven fact
- inference
- untested hypothesis
