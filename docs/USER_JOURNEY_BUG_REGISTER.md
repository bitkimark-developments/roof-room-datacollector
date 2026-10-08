# RoofRoom User Journey Bug Register

This is the living register for bugs and capability gaps discovered during real user journeys.

Priority:
- P0: run or evidence integrity blocker
- P1: execution completeness or important UX problem
- P2: provider/source capability gap

Status:
- OPEN
- IN PROGRESS
- DETERMINISTICALLY VERIFIED
- RUNTIME VERIFIED
- CLOSED

## Dependency order

P0-01 -> P0-02

P0-02 -> P0-03 -> P0-04
P0-02 -> P0-03 -> P1-08

P0-02 -> P0-05 -> P1-05
P0-05 -> P1-06
P0-05 -> P1-07
P0-05 -> P1-09

After backend execution integrity:
P1-01, P1-02, P1-03, P1-04

---

## P0 — Run and evidence integrity

### P0-01 — Included source could silently produce zero Jobs

Status: DETERMINISTICALLY VERIFIED

Observed:
A multi-source preset could contain multiple included READY sources while only a subset produced JobPlans. Review could still allow Start when the total Job count was greater than zero.

Expected:
Every included source must produce at least one JobPlan. Any included source producing zero Jobs must fail Review closed.

Resolution:
DesktopReview now separates:
- blocking_sources
- planning_blocking_sources

can_start requires both blocker collections to be empty and at least one JobPlan to exist.

Verification:
- RED reproduced can_start=true with one included source silently producing zero Jobs.
- Focused multi-source integration passed after the fix.
- Asset preset regressions passed.
- Desktop UI smoke passed.
- TypeScript compilation passed.
- git diff --check passed.

Commit:
74663c34dec761bab430e4b73f7549939dd27cee
fix: fail closed on incomplete preset planning

### P0-02 — Multi-source Review is not an immutable reviewed execution artifact

Status: DETERMINISTICALLY VERIFIED

Observed:
Normal multi-source preset Review leaves reviewed_draft null. Start can resolve execution context separately from what was reviewed.

Expected:
Review must produce one exact resolved multi-source execution artifact. Start must consume that same artifact. Saved Preset configuration remains reusable and separate.

Resolution:
DesktopReviewedRunDraft now supports a multi-source reviewed artifact with:
- null root task_id and source_id
- ordered included_sources
- one Review reference date and resolution clock
- reusable_configuration preserved separately from exact resolved_configuration

Review freezes the exact source-local execution context. Start consumes that reviewed artifact, rechecks readiness and planning coverage, and does not re-resolve dates or replace reviewed Run-scoped inputs.

Quick Run and Preset renderer Start paths now fail closed when reviewed_draft is null and no longer fall back to an unresolved draft.

Verification:
- Multi-source preset Review/Start integration passed.
- Asset preset window and approved preset regressions passed.
- Desktop multi-source integration passed.
- RED reproduced a startable renderer Review with reviewed_draft null while Start remained enabled.
- GREEN requires reviewed_draft before Quick Run or Preset Start and removes unresolved Start fallback.
- Desktop UI smoke passed.
- TypeScript compilation passed.
- reviewed_draft unresolved-fallback audit returned no matches.
- git diff --check passed.

Commits:
14d6d10 refactor: generalize reviewed run artifact identity
9ba218f feat: freeze multisource review artifact
8983e68 fix: start exact reviewed multisource configuration
cdd9645 fix: require reviewed artifact before desktop start

Dependencies:
P0-01

Unblocks:
P0-03, P0-04, P0-05

### P0-03 — Blog preset advertises seven sources but does not plan all seven

Status: DETERMINISTICALLY VERIFIED

Observed:
Blog preset contains seven evidence families, but runtime Review was observed producing only two Jobs.

Expected:
Blog Run may start only when every included evidence family has valid source-local execution context and at least one JobPlan.

Resolution:
Multi-source Review now composes every included source through its existing source-local reviewed-resolution path instead of limiting composition to Google Search Console and Google Ads Search Terms.

Provider-specific resolution remains owned by the existing source-local paths. Multi-source composition does not invent missing provider inputs or generic replacement semantics.

With valid source-local inputs, Blog Review now plans Google Trends, Google Search Console, Google Ads Search Terms, Google Keyword Planner, SerpApi, and Bitkimark Sitemap. İkas remains fail-closed until its run-scoped XLSX input is bound, which is tracked separately by P0-04.

Verification:
- RED reproduced Google Trends remaining in planning_blocking_sources during a Google Trends + GSC multi-source Review even though its existing source-local resolver had configured query groups available.
- GREEN removed the hardcoded GSC/Ads-only multi-source composition whitelist and reused the existing source-local reviewed-resolution path for every included source.
- Seven-family Blog 7 acceptance produced six JobPlans when all non-file source inputs were valid.
- İkas was the only remaining planning blocker with file_path unset.
- Planning-incomplete Blog Review remained can_start=false and reviewed_draft=null.
- Asset preset multi-source regression passed.
- Blog 7/14/30 preset regressions passed.
- Desktop multi-source integration passed.
- Desktop UI smoke passed.
- TypeScript compilation passed.
- git diff --check passed.

Commit:
7483594 fix: compose all reviewed preset sources

Dependencies:
P0-02

### P0-04 — Ikas XLSX is not bound into Preset Run

Status: DETERMINISTICALLY VERIFIED

Observed:
Selecting an Ikas Products XLSX could complete a Quick Run, but Preset Review still reported ikas-products: FILE REQUIRED because the selected file was not carried as one-Run input.

Expected:
Preset Review must accept the XLSX as a run-scoped input and bind that exact reviewed file path into the resolved Run configuration. The reusable Saved Preset must not persist the current file as source evidence.

Resolution:
DesktopRunDraft now has a source-neutral optional run_scoped_inputs envelope. P0-04 interprets only ikas-products.file_path at the existing İkas source-local Review boundary.

Preset Review overlays the selected XLSX only for readiness and reviewed resolution. The Saved Preset reusable configuration remains unchanged and does not persist the selected file path. The reviewed resolved configuration freezes the exact selected path, and Start consumes that reviewed artifact unchanged.

The desktop Preset editor now exposes native Products XLSX selection for an included İkas task and clears the consumed transient file after a successful reviewed Preset Run.

Verification:
- RED reproduced Preset Review can_start=false when the reusable preset had no file_path even though the current Run supplied an İkas file.
- GREEN made the run-scoped path participate in readiness and source-local İkas reviewed resolution while keeping reusable_configuration.file_path absent.
- Reviewed Start planned the exact frozen XLSX path.
- Desktop multi-source integration passed.
- Desktop UI smoke passed, including the İkas Preset file selection, Review, exact Start, and existing preset lifecycle regression.
- TypeScript compilation passed.
- git diff --check passed.
- No live-provider or packaged-runtime verification was performed.

Commits:
577679e fix: bind Ikas preset run-scoped input
7d711f7 fix: bind Ikas preset file in desktop review

Dependencies:
P0-02

### P0-05 — Google Ads Growth can show READY sources with zero Jobs

Status: DETERMINISTICALLY VERIFIED

Observed:
Google Ads Growth was observed as 4 sources · 0 jobs while included sources showed READY.

Expected:
Required Workspace metadata and exact execution dates must be resolved during Review. Provider readiness and planning readiness remain distinct.

Resolution:
- Google Ads Growth reusable intent now carries a relative 30-complete-day policy while preserving null run-specific absolute dates and account identity.
- Review hydrates the canonical Google Ads customer ID from the Workspace `google-ads-search-terms` connection safe metadata.
- Review resolves one exact 30-complete-local-day window from the single Review clock and freezes provider-facing dates only into the reviewed resolved configuration.
- Google Ads Configuration Review resolves all configured datasets instead of assuming a single dataset.
- Google Ads Change History Review supplies its required source identity and schema version.
- GA4 planning honors the preset's explicit dataset selection so Growth produces only `GA4_PAID_FUNNEL`.
- Missing canonical Ads customer metadata remains a planning blocker while provider readiness remains independently READY.

Verification:
- RED reproduced the real failure as `0 !== 22` Jobs with all four included Growth sources READY.
- Focused multi-source preset regression passes with 22 Jobs, no planning blockers, and a startable reviewed artifact.
- Start consumes the frozen reviewed artifact and preserves the same 22 JobPlans.
- Missing canonical Ads customer metadata deterministically fails closed through `planning_blocking_sources` without being misreported as a provider-readiness blocker.
- Saved Preset seed reconciliation passes and updates an existing Growth preset to the canonical reusable configuration without changing its identity.
- Growth preset/catalog regressions pass.
- Google Analytics 4 deterministic gate passes.
- TypeScript compilation and `git diff --check` pass.

No packaged-runtime or live-provider verification is claimed.

Dependencies:
P0-02

---

## P1 — Execution completeness and UX

### P1-01 — READY plus zero Jobs is misleading
Status: DETERMINISTICALLY VERIFIED

Observed:

An included source could report READY but produce zero planned Jobs. Start was disabled without a visible explanation of the separate planning blocker.

Resolution:

The existing DesktopReview contract already separates provider-readiness blockers (blocking_sources) from execution-planning blockers (planning_blocking_sources).

Both Quick Run Review and Saved Preset Review now display planning-blocked source identities separately from readiness. The source remains truthfully READY when provider readiness succeeds but execution planning is incomplete.

Start remains disabled when Review cannot start or does not contain an accepted reviewed execution artifact. No missing Jobs or provider evidence are fabricated.

Verification:

- RED desktop UI regression reproduced READY plus zero Jobs without a visible planning explanation.
- GREEN Saved Preset Review regression displays the planning blocker and keeps Start Preset Run disabled.
- GREEN Quick Run Review regression displays the planning blocker and keeps Start Run disabled.
- Removing the simulated planning blocker preserves the existing reviewed Start workflow.
- Desktop UI smoke suite passed.
- TypeScript compilation passed.
- git diff --check passed.

This establishes deterministic UI verification only. Packaged desktop runtime and live-provider verification were not performed.

### P1-02 — Unsaved changes warning conflates Run input and preset edits
Status: OPEN

Run-scoped file selection should not be presented as an unsaved Saved Preset mutation.

### P1-03 — Previous completed Ikas Run semantics are unclear
Status: OPEN

A completed Ikas Quick Run correctly does not automatically satisfy a later Blog Run, but the UI does not explain that a new reviewed file input is required.

### P1-04 — HOME Saved Preset selector has no Review or Run action
Status: OPEN

Desired path:
HOME -> select preset -> Review Preset -> Start Preset Run

### P1-05 — Approved Google Ads Growth A-scope is not implemented
Status: DETERMINISTICALLY VERIFIED

Immediate supported scope:
- Google Ads Search Reporting
- Google Ads Search Terms 30D
- Google Ads Change History
- Google Ads Configuration
- Google Analytics 4 Paid Funnel
- GSC Queries Current + Previous 28D
- GSC Query x Page 28D, 90D, 16M
- Google Trends Interest Over Time 24M
- Keyword Planner Historical Metrics

Resolution:
The canonical `Google Ads Growth` reusable preset now declares the complete approved nine-source A-scope while preserving source-local task identities and relative request policies. The three approved GSC Query x Page windows are represented as reusable task intent under one real source identity; exact one-source multi-job Review resolution remains P1-07.

Verification:
- RED proved the existing Growth preset declared only four of the nine approved source families.
- The canonical preset regression now locks the complete nine-source A-scope and exact reusable task/policy configuration.
- Saved Preset seed reconciliation passes, so existing Growth preset identity is updated in place to the canonical reusable configuration.
- TypeScript compilation and `git diff --check` pass.

This checkpoint verifies approved reusable scope composition only. P1-06, P1-07 and P1-09 remain separate execution-completeness work and are not claimed complete here. Unsupported Orders and Economics sources remain outside this slice.

### P1-06 — Growth sources do not share one exact 30D execution window
Status: DETERMINISTICALLY VERIFIED

Ads Search Reporting, Search Terms 30D and GA4 Paid Funnel must use the same exact 30 complete local calendar days.

Resolution:
The existing reviewed multi-source execution path already satisfies this contract after P0-05 and P1-05. Review captures one clock, resolves the shared `TODAY_MINUS_30_TO_YESTERDAY` policy from that boundary, and freezes the same absolute range into the reviewed configuration for Google Ads Search Reporting, Google Ads Search Terms 30D, and GA4 Paid Funnel. Start consumes that frozen reviewed artifact without resolving a new window.

Verification:
- A focused multi-source regression uses a clock that deliberately returns a different date after its first call and proves Review captures the execution boundary exactly once.
- All three sources resolve to `2026-09-04` through `2026-10-03`.
- Review is planning-complete and produces three Jobs with no planning blockers.
- Start preserves the same exact range in all three JobPlans from the frozen reviewed artifact.
- `run-presets-gate.sh multisource` and `git diff --check` pass.

No new production behavior was required for this checkpoint. No packaged-runtime or live-provider verification is claimed.

### P1-07 — Multiple GSC Query t Page windows need one-source multi-job planning
Status: DETERMINISTICALLY VERIFIED

Growth needs 28D, 90D and 16M request ranges under the same source identity without inventing duplicate sources.

Resolution:
- The reusable `google-search-console-query-page` configuration preserves the three canonical task/date-policy intents under one real source identity.
- Review validates the approved task/policy pairs and resolves all three from the same Review reference date into exact `date_ranges`.
- Each resolved range preserves its canonical task ID as both `task_id` and `job_key`.
- A single-source multi-task reviewed artifact preserves the real `source_id` and uses `task_id: null` at the root because no truthful singular task identity exists.
- Start consumes the frozen reviewed configuration and reserves three Jobs under the same real source without inventing duplicate or synthetic source/task identities.

Verification:
- RED reproduced the gap as `0 !== 3` Jobs before the production resolver change.
- With reference date `2026-10-04`, Review freezes:
  - 28D: `2026-09-06` → `2026-10-03`
  - 90D: `2026-07-06` → `2026-10-03`
  - 16M: `2025-06-04` → `2026-10-03`
- The focused multisource gate proves three Jobs are planned and preserved through Start under `google-search-console-query-page`.
- The preset catalog gate, TypeScript compilation, and `git diff --check` pass.

No packaged-runtime or live-provider verification is claimed.

### P1-08 — Blog KWP, Sitemap and SerpApi inputs are not execution-ready
Status: OPEN

Empty reusable groups or requests must become explicit reviewed Run inputs before Start.

### P1-09 — Workspace account metadata is not hydrated into Growth execution

Status: DETERMINISTICALLY VERIFIED

Observed:

Connection readiness alone was insufficient. Growth Review could be READY while required provider-target identity was absent from resolved execution context, and several sources still depended on current Workspace connection metadata at execution time.

Expected:

Required provider target identity must be frozen during Review, persisted into every relevant immutable Job source_context, and validated against the active Workspace connection before provider interaction. Missing target metadata must fail Growth Review closed.

Resolution:

Growth Review now hydrates provider-target identity from canonical Workspace connection metadata into resolved execution configuration:

- Google Ads Search Reporting, Search Terms, Change History, Configuration, and Keyword Planner use customer_id.
- Google Analytics 4 uses property_id.
- Google Search Console Query and Query x Page use site_url.

Growth planning fails closed when an included API source is missing its required provider target.

Start persists the frozen provider target into each relevant Job source_context.

Search Terms, Keyword Planner, GA4, GSC Query, GSC Query x Page, and Change History now reject reviewed-target versus active-connection mismatches before provider interaction and use the reviewed target for the provider request when present.

Verification:

- RED reproduced missing provider targets in Growth resolved execution configuration.
- RED reproduced missing provider targets in persisted Growth Job source_context.
- RED reproduced silent provider retargeting when Workspace metadata changed after Review.
- Compact reviewed-provider-target integrity regression passed for Search Terms, Keyword Planner, GA4, both GSC sources, and Change History.
- Google Ads reviewed quick-run integration passed.
- Keyword Planner reviewed API integration passed.
- GSC reviewed quick-run integration passed.
- GA4 source-runtime integration passed.
- Google Ads Change History source-collect integration passed.
- Multi-source preset integration passed.
- Asset preset catalog regression passed.
- TypeScript compilation passed.
- git diff --check passed.

This establishes deterministic verification only. Packaged/runtime and live-provider verification were not performed.

### P1-10 — PROJECT_HANDOFF overstates current Growth completeness
Status: DETERMINISTICALLY VERIFIED

Resolution:

`PROJECT_HANDOFF.md` now distinguishes approved Growth preset/evidence-source configuration completeness from execution and acceptance status. It records the deterministically verified provider-target execution contract introduced by `0bc9156`: Review hydrates required Workspace target identity, Start persists it into relevant immutable Job context, missing targets block planning, and post-Review target drift fails closed before provider interaction.

The handoff also records the current branch/checkpoint and explicitly states that packaged/runtime and live-provider acceptance were not performed for this checkpoint.

Verification:

- handoff wording no longer upgrades preset/configuration completeness into broader execution or live-provider completeness;
- the current repository checkpoint is recorded as `0bc9156`;
- documentation-only diff passes `git diff --check`.

---

## P2 — Provider and source capability gaps

### P2-01 — GSC country=TUR request filter gap
Status: OPEN

### P2-02 — Ads conversion-date metric variants are not supported
Status: OPEN

### P2-03 — GA4 event-grain raw dataset gap
Status: OPEN

### P2-04 — Orders and economics evidence sources are not implemented
Status: OPEN

---

## Newly discovered issues

For every new user-journey issue record:
- reproduction path
- observed behavior
- expected behavior
- affected source, preset or Run
- screenshot or log evidence
- dependency on existing IDs
- verification boundary required for closure
