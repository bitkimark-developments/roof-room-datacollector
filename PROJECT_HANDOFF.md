# RoofRoom Data Collector — Project Handoff

**Current Milestone:** M3 — Google Trends MVP Collector
**Previous Milestone:** M2 — Core Collector Engine — COMPLETE
**Latest verified technical checkpoint:** `42ebbe9 fix: wait for Google Trends custom date option`
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
public provider-download preservation
managed browser download capture
real Interest Over Time CSV parser and validator
CollectionValidator adapter
Interest Over Time card-scoped download selection
custom-date dialog and full date workflow
ordered Search Term query-group adapter
Türkiye geography adapter
All categories / Web Search verification
configured-page export composition
GoogleTrendsCollector and GoogleTrendsSource
main-process runtime composition and shutdown
safe stage diagnostics
structured query, geography, and date diagnostics
explicit safe structural query DOM diagnostic
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

The `42ebbe9` custom-date readiness correction has not yet been reached by a later live attempt: the next controlled run stopped earlier at the intermittent QUERY_GROUP suggestion boundary.

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

Most advanced verified live path:

```text
QUERY_GROUP passed all five queries
GEOGRAPHY passed after b7c43d1
DATE_RANGE reached
CUSTOM_TIME_RANGE_OPTION reported observed_count=0
no download or artifact was produced
```

Latest controlled live result after `42ebbe9`:

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

No `RATE_LIMITED` or `MANUAL_ACTION_REQUIRED` result occurred in these controlled runs. No automatic retry or refresh was performed. Repeated immediate provider calls were stopped after the latest intermittent failure.

No new live artifact was produced by these runs, and live numeric values were not used as assertions.

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

The complete deterministic M3 surface, integrated M2 gate, lint, TypeScript, and package were rerun after `42ebbe9`.

Current verified ranges:

```text
GT-PROVIDER-001..006 PASS
GT-PROBE-001..007 PASS
GT-BROWSER-PROBE-001..006 PASS
GT-LIVE-CMD-001..004 PASS
DOWNLOAD-001..006 PASS
GT-PARSE-001..004 PASS
GT-DATE-001..002 PASS
GT-VAL-001..007 PASS
GT-ADAPTER-001..007 PASS
BROWSER-DOWNLOAD-001..006 PASS
GT-DOWNLOAD-001..007 PASS
GT-DATE-DIALOG-001..009 PASS
GT-DATE-RANGE-001..008 PASS
GT-QUERY-001..015 PASS
GT-GEO-001..008 PASS
GT-FILTER-001..007 PASS
GT-CONFIGURED-EXPORT-001..007 PASS
GT-SOURCE-001..003 PASS
GT-COLLECTOR-001..005 PASS
GT-RUNTIME-001..005 PASS
GT-PACKAGE-001 PASS
GT-MANUAL-001..006 PASS
GT-LIVE-GT01-CMD-001..004 PASS
GT-DIAG-001..008 PASS
GT-LIVE-QUERY-DIAG-CMD-001..003 PASS
M2-GATE-001..008 PASS
```

Also verified:

```text
npm run lint PASS
npx tsc --noEmit PASS
npm run package PASS on darwin/arm64
git diff --check PASS before each checkpoint
```

The Vite CJS Node API deprecation message remains a non-failing warning.

---

# 11. Data Integrity and Validation Boundary

Current guarantees include:

```text
raw source bytes remain unchanged
public provider download is preserved separately
HTML/login/error content is rejected as data
requested query identity is checked
weekly temporal structure is parsed
requested-versus-observed date coverage is checked
relative-interest values must be valid 0..100 values
empty source values remain null
duplicate periods are rejected
geography/category evidence is checked where represented
```

`LOW_DATA`, `NO_DATA`, and all-zero calibration remain deferred until enough real provider behavior exists. A browser action, download, or parseable CSV is not automatically accepted collection success.

---

# 12. Storage Boundary and Open Integration Issue

Two persistence concerns currently exist:

```text
PersistentDownloadStore
→ preserves provider downloads under the user-visible Downloads tree

StorageManager / CollectionOrchestrator
→ owns intended canonical run-scoped raw artifacts and audit evidence
```

Current open M3 storage issue:

```text
provider downloads are persisted to the user-visible Downloads area before canonical run-scoped storage
the live GT01 CLI calls the real source directly
the live GT01 CLI does not yet pass the real source through CollectionOrchestrator / StorageManager / SQLite
```

Therefore Downloads must not be treated as the intended authoritative application datastore. Canonical application state and raw run evidence belong under the application-owned run/storage boundary.

Do not delete, move, or rewrite existing provider evidence. First inventory provenance and determine whether another canonical copy exists. Developer helper files in Downloads are not application state.

After a trustworthy source-level GT01 artifact exists, the real source must run through Core so the evidence chain includes:

```text
run
job
attempt
canonical run-scoped raw artifact
metadata JSON
validation JSON
validation status
SQLite state
public provider copy
```

M3 is not complete until that integration is proven.

---

# 13. Current Blocker and Exact Next Action

Current live blocker:

```text
Google Trends Search Term autocomplete readiness is intermittent
the expected exact suggestion locator sometimes remains at count zero for the full 30-second bounded action
the same locator succeeds in other controlled runs and in the structural diagnostic
the latest run stopped at query_index=0 before reaching the new date correction
```

Proven facts do not yet identify whether the intermittent absence is caused by provider request failure, a provider-side throttle not visible in the initial navigation probe, or another transient provider condition.

Exact next provider action:

```text
do not make another immediate live request
after a deliberate provider pause, run exactly one controlled live GT01 collection using 42ebbe9
stop on RATE_LIMITED or MANUAL_ACTION_REQUIRED
do not refresh or automatically retry
```

Interpret that run as follows:

```text
if QUERY_GROUP fails again at SEARCH_TERM_SUGGESTION
→ capture safe provider-response/rate-limit evidence before another UI behavior change

if DATE_RANGE is reached
→ verify whether 42ebbe9 advances past CUSTOM_TIME_RANGE_OPTION

if another structured control fails
→ make only the smallest evidence-based correction

if an artifact is produced
→ run the existing validator and do not infer anything from exact live numeric values
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
current deterministic 42ebbe9 baseline
↓
controlled live GT01 after provider pause
↓
stable five-query group
↓
Türkiye
↓
exact custom date range
↓
All categories + Web Search verification
↓
Interest Over Time provider export
↓
ARTIFACT_PRODUCED
↓
minimum M3 validation
↓
accepted real GT01 artifact
↓
real source through CollectionOrchestrator
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
