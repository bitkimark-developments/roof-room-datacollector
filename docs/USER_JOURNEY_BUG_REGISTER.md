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

Status: OPEN

Observed:
Selecting an Ikas Products XLSX can complete a Quick Run, but Blog Preset Review still reports ikas-products: FILE REQUIRED.

Expected:
Preset Review must accept the XLSX as a run-scoped input and bind that exact reviewed file path into the resolved Run configuration. The reusable Saved Preset must not persist the current file as source evidence.

Dependencies:
P0-02

### P0-05 — Google Ads Growth can show READY sources with zero Jobs

Status: OPEN

Observed:
Google Ads Growth was observed as 4 sources · 0 jobs while included sources showed READY.

Expected:
Required Workspace metadata and exact execution dates must be resolved during Review. Provider readiness and planning readiness remain distinct.

Dependencies:
P0-02

---

## P1 — Execution completeness and UX

### P1-01 — READY plus zero Jobs is misleading
Status: OPEN

Review should separately expose planning blockers rather than showing READY without explaining why Start is disabled.

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
Status: OPEN

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

Unsupported Orders and Economics sources remain outside this slice.

### P1-06 — Growth sources do not share one exact 30D execution window
Status: OPEN

Ads Search Reporting, Search Terms 30D and GA4 Paid Funnel must use the same exact 30 complete local calendar days.

### P1-07 — Multiple GSC Query x Page windows need one-source multi-job planning
Status: OPEN

Growth needs 28D, 90D and 16M request ranges under the same source identity without inventing duplicate sources.

### P1-08 — Blog KWP, Sitemap and SerpApi inputs are not execution-ready
Status: OPEN

Empty reusable groups or requests must become explicit reviewed Run inputs before Start.

### P1-09 — Workspace account metadata is not hydrated into Growth execution
Status: OPEN

Connection readiness alone is insufficient. Required account identity must be resolved safely into execution context.

### P1-10 — PROJECT_HANDOFF overstates current Growth completeness
Status: OPEN

The handoff must be corrected after the new Growth execution contract is implemented and verified.

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
