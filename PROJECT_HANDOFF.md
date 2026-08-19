# RoofRoom Data Collector — Project Handoff

**Current Milestone:** M3 — Google Trends MVP Collector
**Previous Milestone:** M2 — Core Collector Engine — COMPLETE
**Latest verified technical checkpoint:** `f99a21c test: verify sequential Google Trends entry`
**Verified baseline date:** 2026-08-19

---

# 1. Current Repository State

Repository:

```text
~/Projects/roofroom-data-collector
```

Branch and latest verified checkpoints:

```text
main
f99a21c test: verify sequential Google Trends entry
5f4080d fix: enter initial Google Trends query sequentially
3f67f92 feat: compare initial Google Trends input methods
7676080 fix: enter Google Trends comparison queries sequentially
ff60b93 feat: compare Google Trends query input methods
d8b7ac7 feat: inspect initial Google Trends query state
f4fa7cd fix: add Google Trends download strategies
57e597b docs: record Google Trends waterfall gates
ffa8534 feat: inspect Google Trends download readiness
3799be1 fix: extend Google Trends card readiness
c47be4b fix: wait for Google Trends download controls
34810be feat: add Google Trends download diagnostics
27a43f8 feat: add Google Trends live stage gates
70ad27e refactor: add Google Trends stage gates
087a2ba fix: classify query diagnostic rate limits
50fd156 feat: diagnose Google Trends query input persistence
0f217fa fix: wait for Google Trends date dialog
7a5e4c3 docs: record storage provenance inventory
f5d380c docs: record Core-owned download storage
3142606 fix: route provider downloads through Core
f14440f docs: record validated metadata checkpoint
e1539dd feat: persist validated source metadata
339d287 docs: record live GT01 rate limit
cf56053 fix: detect Google Trends interaction rate limits
2bcb6ac docs: record GT01 Core persistence checkpoint
97f0afb feat: persist live GT01 through Core
dcc1915 docs: reconcile Google Trends live progress
42ebbe9 fix: wait for Google Trends custom date option
5e2d014 feat: add Google Trends date diagnostics
b7c43d1 fix: wait for Google Trends geography state
c21ba7f feat: add Google Trends geography diagnostics
4ad8abf fix: add later Google Trends comparisons
8101d6a fix: extend Google Trends query action readiness
a9f076c feat: inspect Google Trends comparison suggestion
667b36b fix: classify Google Trends query action failures
81d848e fix: use Google Trends provider-created comparison slot
03335d2 docs: record repeated Google Trends query failure
93e58a2 feat: add Google Trends query DOM diagnostic
6c74bf2 docs: reconcile M3 comparison readiness checkpoint
310cda6 fix: wait for Google Trends comparison control
b49770b docs: prepare repository development handoff
2fe1f70 feat: add Google Trends query diagnostics
```

The verified technical baseline is committed. The application packages successfully for `darwin/arm64`. The first restricted package attempt failed only because `github.com` DNS access was unavailable; the same command passed with network access.

Development environment currently verified:

```text
MacBook Air M1
macOS / arm64
Node v24.19.0
npm v11.17.0
system Bash 3.2.57
Electron + React + Vite + TypeScript
SQLite via node:sqlite
Playwright + Chromium
```

Helper scripts must remain compatible with macOS system Bash 3.2 unless another runtime is explicitly selected and documented.

---

# 2. Product Boundary

RoofRoom Data Collector is a local-first modular desktop data collection application.

```text
Collect → Preserve → Validate → Document → Export
```

The application collects source data. It does not make SEO, marketing, advertising, merchandising, or commercial decisions.

Google Trends is the first source module and the Release 1.0 proving ground for the shared Core. Later source modules remain intentionally deferred until the Google Trends base is reliable:

```text
Google Ads — Keyword Planner
Google Search Console
Semrush
Google Merchant Center
Google Analytics 4
Google Ads account/performance data
future source modules added through the same Core
```

Do not build those modules in parallel with the current M3 stabilization work.

---

# 3. Milestone Status

```text
M0 — Product & Architecture Lock       COMPLETE
M1 — Application Skeleton             COMPLETE
M2 — Core Collector Engine            COMPLETE
M3 — Google Trends MVP Collector      IN PROGRESS
M4 — Validation Engine                NOT STARTED
M5 — Desktop UX                       NOT STARTED
M6 — Data Package & Workbook          NOT STARTED
M7 — Hardening & Release 1.0          NOT STARTED
```

M3 must prove one trustworthy real query-group vertical slice before progressive expansion.

Locked first group:

```text
GT01
generic_commercial

canlı bitki
online bitki
bitki satın al
bitki siparişi
saksılı bitki
```

Locked live request:

```text
country: TR
category: All Categories
search type: Web Search
selection: Search Term
dataset: Interest Over Time
requested_date_start: 2024-08-18
requested_date_end: 2026-08-17
```

---

# 4. Verified Shared-Core Architecture

M2 remains complete. Its integrated deterministic gate was reconfirmed on 2026-08-19.

Verified shared-Core capabilities include:

```text
run/job persistence
attempt history
execution-state transitions and run aggregation
artifact and validation-summary persistence
accepted-artifact references
immutable run-scoped raw storage
SHA-256 and byte-size evidence
metadata JSON and detailed validation JSON
resume planning and accepted-job skip
candidate preservation and reconciliation
explicit retry policy
sequential source orchestration
structured JSONL logging and redaction
application-owned persistent browser profiles
SQLite foreign-key and quick-check integrity
```

The architecture remains one application with independent source modules and one shared Core. Source modules own source-specific collection, parsing, validation, and error mapping; Core owns run/job/attempt, persistence, retry/resume, logging, export coordination, and desktop integration.

---

# 5. Implemented M3 Google Trends Surfaces

Committed M3 surfaces include:

```text
rate-limit and manual-action detection
provider probe and app-owned BrowserManager integration
explicit guarded live commands
managed browser byte-stream download capture
real Interest Over Time CSV parser and validator
CollectionValidator adapter
Interest Over Time card-scoped download selection
custom-date dialog and full date workflow
ordered Search Term query-group adapter
Türkiye geography adapter
All categories / Web Search verification
configured-page export composition
shared pre-download stage runner with explicit acceptance gates
download-free live stage command for QUERY_GROUP / GEOGRAPHY / DATE_RANGE / FIXED_FILTERS
structured DOWNLOAD heading/button diagnostics
bounded download-card heading/button readiness
redacted download-readiness DOM diagnostic that cannot trigger download
five-strategy card-scoped DOWNLOAD readiness matrix
semantic TIMESERIES download selection with bounded compatibility contracts
safe initial/comparison query-input method diagnostics
sequential keyboard-event entry for dynamic comparison inputs
GoogleTrendsCollector and GoogleTrendsSource
main-process runtime composition and shutdown
safe stage diagnostics
structured query, geography, and date diagnostics
explicit safe structural query DOM diagnostic
safe query-input persistence diagnostics that do not emit configured query text
same-origin interaction HTTP 429 classification in the structural query diagnostic
real GT01 live command routed through CollectionOrchestrator / StorageManager / SQLite
bounded Core persistence and validation summary in live command output
same-origin HTTP 429 observation across provider UI interaction
source-validated actual date coverage and canonical country-name provenance
fail-closed metadata validation before candidate-artifact promotion
collection ingress that does not write a pre-Core Downloads copy
reserved user-visible export path excluded from eager application-state creation
```

Provider-facing behavior remains fail-closed. Critical controls do not fall back to positional `.first()` / `.nth()` selection.

---

# 6. Current QUERY_GROUP Contract and Live Evidence

Current provider contract:

```text
initial query input:
role=searchbox
name="Add a search term"

Search Term suggestion:
role=button
name="<query> Search term"

first comparison slot:
.compare-term-container .search-term-wrapper.term-not-selected
nested role=searchbox
name="Add a search term"

later comparison add control:
role=button
name="Add a search term for comparison"
```

The first comparison and later comparisons have different provider behavior:

```text
after the first query:
the provider creates the first empty comparison slot directly
the add-comparison control is absent

after the second and later selected queries:
the provider exposes the add-comparison control
the control must be activated before filling each next comparison slot
```

This hybrid behavior is implemented in `4ad8abf` and deterministically verified by `GT-QUERY-014..015`.

The live structural diagnostic executed after `a9f076c` established:

```text
initial_expected_suggestion_count: 0
suggestion_action: CLICKED
final_expected_suggestion_count: 1

autocomplete rows use li[role="button"]
the first comparison uses the provider-created term-not-selected slot
after the second query selection the add-comparison button exists
```

Configured query strings were redacted. The diagnostic did not emit page text, input values, HTML, cookies, headers, or session state.

Current structured QUERY_GROUP controls:

```text
INITIAL_QUERY_INPUT
SEARCH_TERM_SUGGESTION
ADD_COMPARISON
EMPTY_COMPARISON_SLOT
COMPARISON_QUERY_INPUT
```

Safe fields:

```text
control
observed_count
query_index
```

The default bounded QUERY_GROUP action timeout is now 30 seconds. Explicit `ui_action_timeout_ms` overrides remain supported. No sleep, refresh, automatic provider retry, or navigation change was added.

Later controlled evidence on 2026-08-19 established a different current provider state:

```text
one full GT01 collection from 0f217fa reached query_index=1
SEARCH_TERM_SUGGESTION observed_count remained 0 after the bounded action
the safe structural diagnostic reproduced that second-query timeout
all three autocomplete containers existed but were hidden and contained no accessible suggestion control
no rate-limit, CAPTCHA, or manual-action result was reported by that run
```

The structural diagnostic was extended in `50fd156` to report only safe boolean input-persistence state. The next live diagnostic did not reach the second input because the first Search Term suggestion timed out. That diagnostic predated `087a2ba`, so it did not classify same-origin interaction HTTP 429 separately. `087a2ba` now makes future structural diagnostics stop on such a signal and emits a structured first-suggestion failure instead of a generic timeout.

The same exact Search Term locator succeeded in earlier live structural evidence. The failures therefore did not prove selector drift or justify positional selection.

Later A/B evidence isolated an input-method difference for the provider-created comparison input:

```text
Playwright fill:
input_after_fill.is_empty=true
input_after_fill.matches_expected_query=false
expected Search Term suggestion remained absent

Playwright pressSequentially:
input_after_entry.is_empty=false
input_after_entry.matches_expected_query=true
six autocomplete role=button rows became available
the expected Search Term suggestion action completed
the term-not-selected slot disappeared
the add-comparison control appeared
```

`7676080` therefore keeps the earlier live-successful `fill` method for the initial input and uses bounded `pressSequentially` only for provider-created dynamic comparison inputs. It adds no delay, sleep, refresh, retry, or positional fallback. This is deterministically verified through `GT-QUERY-001..015`.

A production QUERY_GROUP gate after `7676080` stopped at the still-`fill`-based initial query with `SEARCH_TERM_SUGGESTION observed_count=0 query_index=0`. `3f67f92` can compare initial `fill` and `pressSequentially` safely, but its first live use encountered same-origin HTTP 429 before producing that comparison.

`5f4080d` applies the already live-successful, event-faithful `pressSequentially` contract to the initial Angular autocomplete input as well. `f99a21c` deterministically verifies that all five GT01 inputs use bounded sequential key events and that no production query input uses a single `fill` mutation. This initial-input extension remains pending live stage acceptance after the provider pause; it is not yet recorded as a proven live success.

The staged waterfall runner introduced in `70ad27e` and `27a43f8` later completed QUERY_GROUP in two consecutive targeted live acceptance runs. QUERY_GROUP is therefore a functionally completed prerequisite module. Intermittent autocomplete absence remains a provider-reliability/hardening concern; it no longer reopens the completed module unless deterministic or repeatable evidence proves a regression.

---

# 7. Geography and Date-Range State

The hybrid query-group flow first advanced the live GT01 attempt into `GEOGRAPHY` after `4ad8abf`.

Structured geography evidence then reported:

```text
control=APPLIED_GEOGRAPHY_LABEL
observed_count=0
```

The cause was an immediate read through the generic opener locator while the provider was still transitioning. `b7c43d1` verifies post-selection state through the expected Türkiye-labelled picker button using the existing bounded Playwright read. A controlled live run after that commit advanced past `GEOGRAPHY` into `DATE_RANGE`.

Current structured geography controls:

```text
GEOGRAPHY_PICKER
GEOGRAPHY_PICKER_BUTTON
GEOGRAPHY_SEARCH_INPUT
TURKEY_RESULT
APPLIED_GEOGRAPHY_LABEL
```

Structured date evidence subsequently reported:

```text
control=CUSTOM_TIME_RANGE_OPTION
observed_count=0
```

`42ebbe9` removes the premature exact-count requirement for that asynchronously exposed option. It still fails immediately on ambiguity and uses the existing bounded strict click action for zero-or-one initial matches. This correction is deterministically verified by `GT-DATE-RANGE-008`.

A controlled live run from `7a5e4c3` reached the next custom-date control and reported:

```text
control=ARCHIVE_DIALOG
observed_count=0
```

`0f217fa` replaces that premature dialog count check with a bounded exact-one wait using the existing locator and timeout. Ambiguous counts still fail closed. This is deterministically verified by `GT-DATE-DIALOG-010`.

The first targeted live DATE_RANGE gate after `27a43f8` completed:

```text
QUERY_GROUP
GEOGRAPHY
DATE_RANGE
```

The next targeted FIXED_FILTERS gate completed:

```text
QUERY_GROUP
GEOGRAPHY
DATE_RANGE
FIXED_FILTERS
```

This live evidence verifies the full `0f217fa` custom-date dialog path, including applying the requested start/end inputs and activating OK. QUERY_GROUP, GEOGRAPHY, DATE_RANGE, and FIXED_FILTERS are now locked completed pre-download modules.

Current structured date controls:

```text
DATE_FILTER
CUSTOM_TIME_RANGE_OPTION
OK_BUTTON
ARCHIVE_DIALOG
START_DATE_INPUT
END_DATE_INPUT
```

---

# 8. Current Live GT01 Status

The source-level GT01 vertical slice has not produced an accepted artifact through the current automation.

Current waterfall gate state:

```text
QUERY_GROUP    DONE — targeted live stage gate completed
GEOGRAPHY      DONE — targeted live stage gate completed
DATE_RANGE     DONE — targeted live stage gate completed
FIXED_FILTERS  DONE — targeted live stage gate completed
DOWNLOAD       IN PROGRESS — Interest over time heading not found
CORE ARTIFACT  PENDING — no provider bytes yet
VALIDATION     PENDING — no candidate artifact yet
```

The first full Core-integrated run after the four pre-download modules completed reached DOWNLOAD and persisted:

```text
run_id: rr_20260819T034449747Z_667f1b
run_status: RUNNING
job_execution_status: FAILED
attempt_number: 1
validation_status: NOT_RUN
error_code: GOOGLE_TRENDS_UI_CONTRACT_ERROR
artifact: null
validation: null
```

`34810be` added structured DOWNLOAD controls:

```text
INTEREST_OVER_TIME_HEADING
DOWNLOAD_BUTTON
```

`c47be4b` replaced premature heading/button cardinality checks with bounded readiness. `3799be1` aligned default download-card readiness with the existing 30-second download window. A subsequent full run completed every pre-download module but still reported:

```text
run_id: rr_20260819T035039561Z_72b4fa
run_status: RUNNING
job_execution_status: FAILED
attempt_number: 1
validation_status: NOT_RUN
error_code: GOOGLE_TRENDS_UI_CONTRACT_ERROR
control: INTEREST_OVER_TIME_HEADING
observed_count: 0
artifact: null
validation: null
```

This proves the current DOWNLOAD blocker is not a ten-second readiness race. Either the live card/heading contract has changed or the result card is not rendering. `ffa8534` adds a no-download structural diagnostic to distinguish those states. Its first controlled use stopped as `RATE_LIMITED` on same-origin HTTP 429, so no structural result was collected and provider work stopped without refresh/retry.

`f4fa7cd` implements and evaluates the complete bounded DOWNLOAD alternative matrix before choosing a strategy:

```text
TIMESERIES_FILE_DOWNLOAD      deterministic PASS — preferred semantic contract
TIMESERIES_DOWNLOAD           deterministic PASS — accessible-name alternative
TIMESERIES_CSV                deterministic PASS — accessible-name alternative
TIMESERIES_EXPORT_CONTROL     deterministic PASS — card-scoped class alternative
HEADING_PARENT_FILE_DOWNLOAD  deterministic PASS — previously live-proven compatibility contract
```

All five alternatives remain scoped to the Interest over time card. None uses a page-global download button, DOM position, refresh, retry, or navigation fallback. `GT-DOWNLOAD-011..013` prove that all candidates are assessed, every semantic alternative independently captures exact provider bytes, and the most specific available semantic strategy is selected only after assessment.

The first no-download readiness run from `f4fa7cd` did not reach DOWNLOAD because QUERY_GROUP reported `SEARCH_TERM_SUGGESTION observed_count=0 query_index=0`. This is not DOWNLOAD evidence. The live provider has therefore not yet reported which of the five DOWNLOAD strategies are present.

Last pre-monitor controlled live result after `42ebbe9`:

```json
{
  "live_scope": "GT01",
  "query_group_name": "generic_commercial",
  "query_count": 5,
  "requested_date_start": "2024-08-18",
  "requested_date_end": "2026-08-17",
  "result_type": "FAILED",
  "error_code": "GOOGLE_TRENDS_UI_CONTRACT_ERROR",
  "diagnostic": "Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError; control=SEARCH_TERM_SUGGESTION; observed_count=0; query_index=0)."
}
```

Controlled runs have observed `SEARCH_TERM_SUGGESTION` count zero at query indices 0, 1, and 2. The same exact suggestion locator succeeded inside the safe structural diagnostic when the provider result became available. This establishes intermittent provider autocomplete readiness; it does not establish selector drift or a safe retry strategy.

No `RATE_LIMITED` or `MANUAL_ACTION_REQUIRED` result occurred in those pre-`cf56053` controlled runs. No automatic retry or refresh was performed. Repeated immediate provider calls were stopped after the latest intermittent failure.

No new live artifact was produced by these runs, and live numeric values were not used as assertions.

A single controlled live request from `cf56053` detected a same-origin HTTP 429 during provider UI interaction and stopped as `RATE_LIMITED`. This proves the interaction-response monitor can distinguish a provider rate-limit signal that is not present in the initial navigation response. It does not prove that every earlier intermittent suggestion failure had the same cause.

The live Core result was:

```json
{
  "run_id": "rr_20260819T022005971Z_012389",
  "run_status": "RUNNING",
  "job_execution_status": "FAILED",
  "attempt_number": 1,
  "validation_status": "NOT_RUN",
  "run_scoped_artifact": null,
  "validation": null,
  "error_code": "RATE_LIMITED"
}
```

The run-scoped structured log records `collection_attempt_started` followed by one `collection_attempt_failed` event with `RATE_LIMITED`. SQLite records the same run/job/attempt chain, zero artifacts, zero validations, and `PRAGMA quick_check = ok`. The user-visible Google Trends download tree contains no file created by this attempt. No refresh or automatic retry occurred.

---

# 9. Real Provider and Data Evidence

Established real-source evidence includes:

```text
Google Trends Explore is reachable through the app-owned profile
provider probe has returned HTTP 200 without a navigation-level rate-limit signal
an earlier manual discovery session observed HTTP 429 and stopped without evasion
classic Explore UI controls were inspected
two real GT01 Interest Over Time CSV exports were preserved
the real CSV uses weekly rows for the locked 24-month request
the real exports contain the five canonical GT01 query series
live numeric values vary between exports
missing CSV values remain missing/null rather than becoming zero
```

Google Trends 0–100 values are relative interest only. They must never be converted into estimated search volume. Different comparison groups remain independently normalized and must retain query-group context.

---

# 10. Verified Deterministic Gate — 2026-08-19

The affected deterministic M3 surface, integrated M2 gate, lint, TypeScript, and package were rerun from the current `f99a21c` all-input sequential-entry baseline.

Current verified ranges:

```text
GT-PROVIDER-001..006 PASS
GT-PROBE-001..007 PASS
GT-BROWSER-PROBE-001..006 PASS
GT-LIVE-CMD-001..004 PASS
GT-PARSE-001..004 PASS
GT-DATE-001..002 PASS
GT-VAL-001..008 PASS
GT-ADAPTER-001..007 PASS
BROWSER-DOWNLOAD-001..007 PASS
GT-DOWNLOAD-001..013 PASS
GT-DATE-DIALOG-001..010 PASS
GT-DATE-RANGE-001..008 PASS
GT-QUERY-001..016 PASS
GT-GEO-001..008 PASS
GT-FILTER-001..007 PASS
GT-CONFIGURED-EXPORT-001..010 PASS
GT-SOURCE-001..003 PASS
GT-COLLECTOR-001..009 PASS
GT-RUNTIME-001..005 PASS
GT-PACKAGE-001 PASS
GT-MANUAL-001..006 PASS
GT-LIVE-GT01-CMD-001..005 PASS
GT-CORE-001..011 PASS
GT-DIAG-001..009 PASS
GT-LIVE-QUERY-DIAG-CMD-001..005 PASS
GT-LIVE-STAGE-CMD-001..005 PASS
M2-GATE-001..008 PASS
PIPELINE-001..004 PASS
STORAGE-BOUNDARY-001..002 PASS
```

Also verified:

```text
npm run lint PASS
npx tsc --noEmit PASS
npm run package PASS on darwin/arm64
git diff --check PASS before each checkpoint
```

After `97f0afb`, the affected storage/source/runtime/validator/manual-action suites, the sequential orchestrator suite, the integrated M2 gate, lint, TypeScript, and packaging were rerun successfully. After `cf56053`, provider-state/probe, collector, UI-diagnostic, live-command, Core-runner, BrowserManager, lint, TypeScript, and darwin/arm64 packaging checks also passed. After `e1539dd`, the Google Trends CSV validator, CollectionValidator adapter, Core persistence runner, sequential orchestrator, integrated M2 gate, lint, TypeScript, and darwin/arm64 packaging checks passed. After `3142606`, the full deterministic M3 surface, sequential orchestrator, integrated M2 gate, storage-boundary tests, lint, TypeScript, and darwin/arm64 packaging checks passed. The first package attempt was blocked only by sandboxed `github.com` DNS access; the same package command passed with network access.

After `0f217fa`, the custom-date-dialog, custom-date-range, UI-diagnostic, and collecting-source suites, lint, and TypeScript passed. After `50fd156` and `087a2ba`, the live-query-diagnostic command suite passed through `GT-LIVE-QUERY-DIAG-CMD-005`; the collecting-source suite, lint, TypeScript, and `git diff --check` also passed. After `ffa8534`, every current deterministic `test:m3:*` command, the integrated M2 gate, sequential orchestrator regression, lint, `npx tsc --noEmit`, and `npm run package` for `darwin/arm64` passed.

After `f4fa7cd`, DOWNLOAD strategies passed through `GT-DOWNLOAD-013`; live-stage command, configured export, collecting source, UI diagnostics, live command, Core runner, M2 integrated gate, lint, TypeScript, and darwin/arm64 packaging also passed. After `7676080` and `3f67f92`, QUERY_GROUP remained green through `GT-QUERY-015`; the live-query diagnostic command, BrowserManager, configured export, collecting source, live-stage command, DOWNLOAD strategies, UI diagnostics, Core runner, integrated M2 gate, lint, TypeScript, `git diff --check`, and darwin/arm64 packaging passed.

After `5f4080d` and `f99a21c`, QUERY_GROUP passed through `GT-QUERY-016`; configured export, collecting source, live-stage command, UI diagnostics, live GT01 command, Core runner, integrated M2 gate, lint, TypeScript, `git diff --check`, and darwin/arm64 packaging passed.

The Vite CJS Node API deprecation message remains a non-failing warning.

---

# 11. Data Integrity and Validation Boundary

Current guarantees include:

```text
raw source bytes remain unchanged
user-visible exports remain separate from canonical run-scoped raw evidence
HTML/login/error content is rejected as data
requested query identity is checked
weekly temporal structure is parsed
requested-versus-observed date coverage is checked
relative-interest values must be valid 0..100 values
empty source values remain null
duplicate periods are rejected
geography/category evidence is checked where represented
actual date coverage is derived from validated provider weekly buckets
canonical country name is emitted only when geography evidence passes
invalid source metadata fails before a candidate artifact can be accepted
```

`LOW_DATA`, `NO_DATA`, and all-zero calibration remain deferred until enough real provider behavior exists. A browser action, download, or parseable CSV is not automatically accepted collection success.

---

# 12. Storage Boundary and Remaining Live Proof

Collection and user-visible export storage are now separated:

```text
provider browser download stream
→ captured as exact byte evidence without a public copy
→ returned by GoogleTrendsSource to CollectionOrchestrator
→ persisted by StorageManager as run-scoped candidate raw evidence

reserved public_downloads path
→ downstream user-visible export destination only
→ not eagerly created as application runtime state
```

The implemented GT01 live command now follows this evidence path:

```text
real GoogleTrendsSource
→ CollectionOrchestrator
→ application-owned run/job/attempt state in SQLite
→ exact source bytes persisted as a run-scoped candidate artifact
→ Google Trends CollectionValidator
→ accepted/rejected artifact state
→ metadata JSON + validation JSON + structured run log
```

This path is deterministically verified by `GT-CORE-001..011` for accepted data, source failure, manual action, rejected non-data content, validated actual-date/country metadata, and fail-closed metadata checks. `BROWSER-DOWNLOAD-001..007`, `GT-DOWNLOAD-001..013`, and `STORAGE-BOUNDARY-001..002` verify direct byte capture, typed download failure, bounded multi-strategy card readiness, no pre-Core Downloads write, and no eager public-directory creation. The path is restricted to exactly one GT01 group and does not add provider retry, refresh, or navigation behavior.

Downloads is not the authoritative application datastore. Only an accepted artifact linked through the application-owned run/job/attempt/validation chain is canonical. A rejected run-scoped artifact remains immutable audit evidence but is not canonical data. User-visible CSV/XLSX packages remain a downstream ExportManager responsibility and may consume only validated accepted artifacts.

Both preserved discovery provider files, `multiTimeline.csv` and `multiTimeline__2.csv`, were rechecked read-only through the current validator after `f99a21c`. Each independently returned `VALID`, 13 total checks, zero failed checks, and validated weekly coverage from `2024-08-18` through `2026-08-16`. This does not make Downloads canonical; it proves the current parser/validator accepts both distinct real provider byte samples without rewriting them.

Do not delete, move, or rewrite existing provider evidence. First inventory provenance and determine whether another canonical copy exists. Developer helper files in Downloads are not application state.

Read-only provenance inventory on 2026-08-19 established:

```text
app-data SQLite:
7 runs / 7 jobs / 7 attempts
all runs remain RUNNING for explicit resume policy
all jobs and attempts are FAILED
attempt error-code counts: RATE_LIMITED=1, GOOGLE_TRENDS_UI_CONTRACT_ERROR=6
0 artifacts / 0 validations
PRAGMA quick_check = ok

Downloads/RoofRoom Data Collector/google-trends/discovery:
relatedQueries.csv        592 bytes   SHA-256 643c4ceab99069e4740052dc3c5a0df12378fe5678475116cc295f262870c80f
multiTimeline.csv        2467 bytes   SHA-256 87d81838abebe941f64460bfbab7dc3fea46a6188f07681786f5911617f49d53
multiTimeline__2.csv     2467 bytes   SHA-256 5dbb9079c11e91a34e2937265b873ecb7c81da61b5f7d97101bd01bf99608286

repository GT01 fixture:
gt01-valid-5-queries.csv  2467 bytes   SHA-256 9bd0f03d00dd803932f8207e2c74326619874af05b5509cf6aeefc2369aad883
```

Both `multiTimeline` files contain 108 lines, six columns, and weekly periods from 2024-08-18 through 2026-08-16, but their hashes differ from each other and from the repository fixture. No app-owned run-scoped raw copy currently exists. Therefore the three discovery CSV files are unique existing provider evidence and must be preserved in place until a deliberate provenance-preserving migration is designed.

The Downloads root separately contains 88 development helper shell scripts, one patch, six RoofRoom audit/diagnostic text files, and 12 copied project-state Markdown documents. These are developer working files, not application runtime state or canonical repository content. They were inventoried but not deleted, moved, or rewritten.

The remaining live proof must establish that a real provider artifact traverses the complete chain:

```text
run
job
attempt
canonical run-scoped raw artifact
metadata JSON
validation JSON
validation status
SQLite state
```

The `cf56053` live attempt proves that a real provider failure traverses Core into durable run/job/attempt/log evidence. No real artifact has yet traversed the integrated persistence/validation path, so M3 is not complete.

---

# 13. Current Blocker and Exact Next Action

Current live blocker:

```text
QUERY_GROUP, GEOGRAPHY, DATE_RANGE, and FIXED_FILTERS are live-complete modules
the latest advanced full GT01 run stopped only at DOWNLOAD
INTEREST_OVER_TIME_HEADING remained absent after the bounded 30-second readiness window
the DOWNLOAD module now has five deterministically successful card-scoped strategies
the exact live DOWNLOAD strategy/card state is still unknown
the first f4fa7cd no-download run stopped earlier at initial-query suggestion absence
comparison-input fill was then proven unreliable; pressSequentially succeeded and entered production
the updated production QUERY_GROUP gate again stopped at the still-fill-based initial input
the first initial-input A/B diagnostic encountered same-origin HTTP 429
all five production query inputs now use the sequential-entry contract
the initial-input extension is deterministically verified but not yet live accepted
provider work stopped immediately with no refresh, retry, download, artifact, or validation
```

The latest HTTP 429 applies only to the initial-input A/B diagnostic. It does not establish why the Interest over time heading was absent in earlier full runs or why every initial suggestion was absent.

Exact next provider action:

```text
make no immediate repeated Google Trends request
do not refresh, retry, or evade the provider restriction
after a deliberate provider pause, run exactly one no-download readiness gate from f99a21c or a later deterministically verified checkpoint:
npm run m3:live-stage -- --stage=FIXED_FILTERS --inspect-download-readiness --confirm-live-stage
```

Interpret that run as follows:

```text
if RATE_LIMITED occurs again
→ stop immediately with no refresh or retry

if QUERY_GROUP fails again
→ report only the structured control/count/index evidence and do not reopen unrelated modules

if QUERY_GROUP, GEOGRAPHY, DATE_RANGE, and FIXED_FILTERS complete
→ compare all five strategy results instead of stopping at the first match

after one live DOWNLOAD strategy is selected and verified
→ run exactly one Core-routed GT01 collection
→ preserve and validate the artifact without asserting exact live numeric values
```

Do not expand to GT02–GT20 until GT01 produces an accepted artifact and canonical Core persistence is proven.

---

# 14. Safety / Compliance Rules

Never:

```text
store passwords
use the user's normal browser profile
copy unauthorized cookies or sessions
automate CAPTCHA or 2FA
bypass anti-bot protections or rate limits
use CAPTCHA solvers or proxy rotation
refresh after provider blocking
blindly repeat provider requests
```

Authentication/security intervention maps to:

```text
MANUAL_ACTION_REQUIRED
```

Rate limiting maps to:

```text
RATE_LIMITED
stop provider requests
preserve evidence
do not refresh or immediately retry
```

---

# 15. M3 Success Sequence

```text
current deterministic f4fa7cd DOWNLOAD-strategy and f99a21c all-input sequential-entry baseline
↓
deliberate provider pause without refresh/retry/evasion
↓
one no-download pre-stage plus five-strategy DOWNLOAD-readiness diagnostic
↓
evidence-based DOWNLOAD-only correction if required
↓
one Core-routed GT01
↓
ARTIFACT_PRODUCED
↓
minimum M3 validation
↓
accepted real GT01 artifact
↓
canonical run/job/attempt/raw/metadata/validation proof
↓
small representative multi-group proof
↓
progressive GT01–GT20 expansion
```

---

# 16. Handoff Discipline

`PROJECT_HANDOFF.md` is the living technical-state document, not a substitute for Git checkpoints.

Update it after meaningful state changes, major blockers, milestone boundaries, or long pauses. Do not record unverified implementation work as complete.

`PROJECT_SPEC.md` changes only when product scope, architecture, data contracts, acceptance criteria, or locked technical decisions materially change.
