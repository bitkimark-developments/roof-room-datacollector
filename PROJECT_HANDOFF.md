# RoofRoom Data Collector — Project Handoff

**Current milestone:** Release 1.0 — Google Trends local MVP acceptance candidate
**Latest verified technical checkpoint:** `f2a9308 fix: improve output and keyword file access`
**Verified baseline date:** 2026-08-19

---

# 1. Repository State

Authoritative repository:

```text
~/Projects/roofroom-data-collector
```

Current branch:

```text
main
```

Latest technical checkpoints:

```text
f2a9308 fix: improve output and keyword file access
200fdfb feat: complete Google Trends desktop workflow
da84c09 feat: add representative Google Trends live batch
21d59d6 feat: add Google Trends batch Core runner
33a495f fix: use configured Google Trends Explore workflow
1645179 fix: wait for Google Trends fixed filters
0baabcc feat: add Google Trends fixed-filter diagnostics
4e75fda feat: add configured Google Trends URL diagnostic
```

The local desktop application, deterministic release gate, `darwin/arm64` package, and ZIP distributable have passed on the target Mac.

Verified environment:

```text
MacBook Air M1
macOS / arm64
Node 24.19.0
npm 11.17.0
Electron 43.4.0
Electron Forge 7.11.2
React 18.3.1
TypeScript 5.9.3
Playwright 1.62.1
SQLite through node:sqlite
```

---

# 2. Product Boundary

RoofRoom Data Collector is a local-first modular desktop data-collection application.

```text
Collect → Preserve → Validate → Document → Export
```

The application collects evidence. It does not produce SEO, marketing, advertising, merchandising, or commercial decisions.

Google Trends is the Release 1.0 source module and the proving ground for the shared Core. Planned later modules remain out of the current implementation boundary:

```text
Google Ads — Keyword Planner
Google Search Console
Semrush
Google Merchant Center
Google Analytics 4
Google Ads account/performance data
future source modules connected through the same Core
```

---

# 3. Milestone Status

```text
M0 — Product & Architecture Lock       COMPLETE
M1 — Application Skeleton             COMPLETE
M2 — Core Collector Engine            COMPLETE
M3 — Google Trends MVP Collector      COMPLETE
M4 — MVP Validation Engine            COMPLETE
M5 — Desktop UX                       COMPLETE
M6 — Data Package & Workbook          COMPLETE
M7 — Local Hardening / Release Gate   COMPLETE
```

This means the Google Trends MVP implementation is complete for externally configured query groups. It does not mean every planned future source module has been built.

The current real external configuration contains only:

```text
GT01 — generic_commercial
GT02 — indoor_terminology
```

The loader and desktop workflow support additional valid groups, but GT03–GT20 query content is not present in the current authoritative configuration. Missing groups must not be invented.

Locked Google Trends Release 1.0 scope:

```text
country: TR
category: All Categories
search type: Web Search
selection: Search Term
dataset: Interest Over Time
requested_date_start: 2024-08-18
requested_date_end: 2026-08-17
maximum queries per comparison group: 5
collection order: sequential
```

---

# 4. Verified Shared-Core Architecture

The implemented path is:

```text
external query configuration
→ desktop selection and explicit start
→ Google Trends source module
→ CollectionOrchestrator
→ run / job / attempt state in SQLite
→ StorageManager run-scoped raw evidence
→ Google Trends parser and validator
→ accepted artifact and validation state
→ structured CSV package and XLSX workbook
```

Verified Core capabilities include:

```text
run/job/attempt persistence and aggregation
immutable attempt history
accepted-artifact references
run-scoped raw storage with SHA-256 and byte-size evidence
metadata JSON, detailed validation JSON, and structured JSONL logs
sequential orchestration
resume with accepted-job skip
interrupted-state reconciliation
explicit one-job retry with a maximum of two attempts
manual-action continuation without creating an automatic retry
application-owned persistent browser profile
safe cancellation and browser shutdown
SQLite foreign-key and quick-check integrity
renderer/main privilege separation through typed IPC
```

Source modules continue to own source-specific collection, parsing, validation, and provider-error mapping. Core owns lifecycle, persistence, retry/resume, logging, storage, export coordination, and desktop integration.

---

# 5. Verified Real Google Trends Evidence

The earlier QUERY_GROUP, GEOGRAPHY, DATE_RANGE, FIXED_FILTERS, and DOWNLOAD blockers were resolved through bounded provider evidence and deterministic contracts. The production collector now opens one configured Google Trends Explore URL and preserves that configured state instead of rebuilding the page through a second navigation.

The complete waterfall is live-proven:

```text
QUERY_GROUP    DONE
GEOGRAPHY      DONE
DATE_RANGE     DONE
FIXED_FILTERS  DONE
DOWNLOAD       DONE
CORE ARTIFACT  DONE
VALIDATION     DONE
```

Accepted single-group proof:

```text
run_id: rr_20260819T054011956Z_a95467
group: GT01
run_status: COMPLETED
job_execution_status: COMPLETED
validation_status: VALID
checks: 13 passed / 13 total
attempt_number: 1
actual_date_start: 2024-08-18
actual_date_end: 2026-08-16
```

Accepted representative multi-group proof:

```text
run_id: rr_20260819T054830064Z_966b8a
run_status: COMPLETED

GT01: COMPLETED / VALID / 13 of 13 checks passed / attempt 1
GT02: COMPLETED / VALID / 13 of 13 checks passed / attempt 1
```

Both runs persisted provider bytes directly through Core into canonical run-scoped storage. No Downloads copy was used as the authoritative input. SQLite `PRAGMA quick_check` returned `ok` after the successful runs.

These live results prove execution, identity, date coverage, storage, validation, and multi-group sequencing. Exact live relative-interest values were not used as assertions and must not be interpreted as absolute search volume.

---

# 6. Current Google Trends Provider Contract

The currently verified query-control model is:

```text
initial query input:
role=searchbox, name="Add a search term"

Search Term suggestion:
role=button, name="<query> Search term"

first comparison:
provider-created .term-not-selected slot and nested searchbox

later comparisons:
role=button, name="Add a search term for comparison"
followed by the new provider-created empty slot
```

All Angular autocomplete inputs use bounded sequential key events. Critical provider controls fail closed on missing or ambiguous structure. No positional `.first()` / `.nth()` fallback is used for critical selection.

Structured diagnostics expose only allowlisted evidence such as:

```text
stage
error class
control
observed_count
query_index
```

They do not expose configured query text, page HTML, cookies, authorization data, or raw provider content.

---

# 7. Desktop Workflow

The Turkish desktop dashboard now provides:

```text
configured query-group selection
select all / clear selection
explicit collection start
live current-group and completed-group progress
safe cancellation
resume for recoverable runs
explicit retry for one failed job
manual-action continuation
VALID, LOW_DATA, NO_DATA, failure, and manual-action status separation
automatic structured export after an accepted completed run
separate collection and export failure states
open canonical data folder
open configuration folder
```

Human-facing file access does not require navigating opaque run IDs:

```text
Son Veri Paketini Aç
→ finds the latest valid run-scoped workbook
→ skips newer failed/incomplete runs without an export
→ selects the XLSX directly in Finder

Teknik Çalışma Arşivini Aç
→ opens data/runs only for provenance and diagnostics

Keyword Dosyasını Düzenle
→ opens the single authoritative query-groups configuration file
```

The group selector displays every configured keyword, and the summary keyword count reflects selected groups rather than the entire configuration. Configuration edits take effect after application restart.

Canonical `rr_<timestamp>_<opaque>` directory names remain immutable machine IDs linked to SQLite run/job/attempt provenance. They are deliberately not renamed for presentation.

The main process validates every selected group ID against the loaded configuration. Unknown, empty, or duplicate selections fail before provider work. Overlapping collection actions are rejected.

Application shutdown safely cancels an active run, waits for the operation boundary, and closes the application-owned browser.

---

# 8. Query Configuration

Release 1.0 accepts exactly one authoritative external configuration file in the application config directory:

```text
query-groups.yaml
query-groups.yml
query-groups.json
query-groups.csv
```

If no external file exists, the packaged YAML default is copied on first bootstrap. If multiple supported files exist, startup fails closed rather than guessing which is authoritative.

All adapters normalize to the same `QueryConfig` contract. CSV uses this exact header:

```text
version,source,group_id,group_name,query_order,query
```

CSV `query_order` must be positive and contiguous within each group. Source, version, group ID, group name, duplicate IDs, empty queries, and the five-query comparison limit are validated.

Configuration changes are loaded on the next application launch. Historical run evidence does not depend on later edits to the live configuration file.

---

# 9. Validation and Export

The validator currently enforces:

```text
real CSV rather than HTML/login/error content
expected query identity and order
weekly temporal structure
requested-versus-observed date coverage
relative-interest integer or null semantics
0..100 relative-interest range
no missing-to-zero coercion
no duplicate weekly periods
geography and category evidence where present
validated actual-date and country provenance
fail-closed source metadata
```

An accepted dataset with no positive signal across all values is classified visibly as `LOW_DATA`. All-zero and all-missing evidence remain distinguishable. No arbitrary non-zero density threshold was invented. `NO_DATA` remains reserved for a verified explicit provider no-data outcome and is not fabricated from parser failure, all-zero values, or missing values.

After a completed accepted run, ExportManager creates a run-scoped derived package under the application-owned run directory:

```text
exports/ROOFROOM_SEARCH_DEMAND_RAW_<YYYY-MM-DD>/
  RUN_METADATA.csv
  QUERY_UNIVERSE.csv
  GT_24M_RAW.csv
  VALIDATION_LOG.csv
  ERROR_LOG.csv
  README.txt

exports/ROOFROOM_SEARCH_DEMAND_RAW_<YYYY-MM-DD>.xlsx
```

Workbook sheets:

```text
README
RUN_METADATA
QUERY_UNIVERSE
GT_24M_RAW
VALIDATION_LOG
ERROR_LOG
```

Only accepted or accepted-with-warning artifacts become normalized data rows. Missing numeric values remain empty, true zero remains numeric `0`, `period_end` remains null where the provider does not prove an end boundary, and duplicate queries in different comparison groups remain separate. Export refuses to overwrite an existing derived package.

---

# 10. Storage Boundary

Canonical application state is rooted at:

```text
~/Library/Application Support/RoofRoom Data Collector/app-data/
```

Current owned areas include:

```text
database/
config/
data/runs/
logs/
browser-profiles/
```

For live collection, exact provider bytes flow directly into `data/runs/<run_id>/google-trends/raw/` through StorageManager. Metadata, validation, logs, and derived exports remain under the same run boundary.

Downloads is not the authoritative application datastore. Older discovery CSVs and development helper files in Downloads remain provenance-sensitive historical material and have not been deleted, moved, or rewritten. The completed application path does not consume a Downloads file as canonical raw evidence and does not create a pre-Core public copy.

User-visible copies in Downloads may be introduced later only as an explicit export behavior. Such a copy would remain downstream of canonical accepted evidence.

---

# 11. Deterministic Release Gate

`npm run test:release:gate` passed after `200fdfb`. It runs TypeScript, lint, the integrated M2 gate, configuration adapters, desktop controller, every deterministic Google Trends integration script, structured export tests, renderer smoke, and the final release assertion.

Preserved verified ranges include:

```text
M2-GATE-001..008
PIPELINE-001..004
STORAGE-BOUNDARY-001..002

GT-PROVIDER-001..006
GT-PROBE-001..009
GT-BROWSER-PROBE-001..006
GT-PARSE-001..004
GT-DATE-001..002
GT-VAL-001..010
GT-ADAPTER-001..007
GT-DOWNLOAD-001..013
GT-DATE-DIALOG-001..010
GT-DATE-RANGE-001..008
GT-QUERY-001..016
GT-GEO-001..008
GT-FILTER-001..007
GT-CONFIGURED-EXPORT-001..010
GT-SOURCE-001..003
GT-COLLECTOR-001..009
GT-RUNTIME-001..005
GT-PACKAGE-001
GT-MANUAL-001..006
GT-CORE-001..011
GT-BATCH-CORE-001..005
GT-DIAG-001..009

CFG-008..012
DESKTOP-CTRL-001..004
DESKTOP-FILES-001..003
EXPORT-001..006
DESKTOP-UI-001
RELEASE-GATE-001
```

The guarded live-command tests exercise authorization and safety boundaries without making a live request. The release gate itself made no Google Trends request.

Additional final verification:

```text
npm run test:release:gate  PASS
npm run package            PASS — darwin/arm64
npm run make               PASS — darwin/arm64 ZIP
npm audit --omit=dev       PASS — zero production dependency vulnerabilities
```

Local distributable:

```text
out/make/zip/darwin/arm64/RoofRoom Data Collector-darwin-arm64-1.0.0.zip
SHA-256: 1576e58faffbe604f6d0b863200f53337c51a0f03a96fcd88d4a274077ab14e3
```

The ZIP is a local unsigned build. Apple code signing and notarization require a distribution identity and are not claimed by this checkpoint. Development-tool audit findings in the Electron Forge/Vite dependency tree remain an explicit future upgrade-review item; no force fix or unverified downgrade was applied.

---

# 12. Remaining Open Boundaries

There is no current technical blocker in the Google Trends GT01/GT02 MVP chain.

Open boundaries are explicit:

```text
GT03–GT20 content is absent from the current external configuration
explicit provider NO_DATA behavior has not yet been observed live
non-zero LOW_DATA density calibration remains evidence-dependent
Apple signing/notarization is not configured
future source modules are not part of Release 1.0
legacy failed live attempts remain preserved as audit history
```

None of these permits invented data, silent provider behavior changes, or deletion of historical evidence.

---

# 13. Exact Next Action

For current GT01/GT02 user acceptance:

```text
npm start
→ confirm configuration and database readiness
→ select GT01 and/or GT02
→ start collection explicitly
→ observe sequential progress
→ verify accepted validation status
→ open the canonical run data folder
→ inspect the generated CSV/XLSX package
```

For GT01–GT20 rollout, first provide the real remaining query-group definitions in exactly one supported external configuration file. Then launch the application and select the desired configured groups. Do not fabricate missing group content.

Provider execution remains sequential. If `RATE_LIMITED` occurs, stop without refresh or immediate retry. If `MANUAL_ACTION_REQUIRED` occurs, complete only the requested action directly in the application-owned provider window and then use explicit continuation.

---

# 14. Safety and Data-Integrity Rules

Never:

```text
store passwords, 2FA codes, cookies, or tokens in normal metadata/logs
use the user's normal browser profile
automate or bypass CAPTCHA, 2FA, security challenges, or rate limits
use proxy rotation or CAPTCHA solvers
refresh or automatically retry after provider blocking
accept malformed or suspicious content as data
replace missing numeric values with zero
convert Trends relative interest to estimated search volume
erase run/job/attempt/artifact history to hide failure
```

`MANUAL_ACTION_REQUIRED` and `RATE_LIMITED` remain distinct fail-closed states.

---

# 15. Handoff Discipline

`PROJECT_HANDOFF.md` is the living technical-state document. Update it after meaningful blockers, milestone changes, or verified implementation slices.

`PROJECT_SPEC.md` remains the stable product and acceptance contract. Change it only when scope, architecture, data contracts, acceptance criteria, or locked decisions materially change.

Do not record unverified work as complete, and do not allow stale handoff text to override Git plus tested implementation evidence.
