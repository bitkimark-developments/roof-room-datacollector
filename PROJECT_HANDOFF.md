# RoofRoom Data Collector — Project Handoff

**Current Milestone:** M3 — Google Trends MVP Collector
**Previous Milestone:** M2 — Core Collector Engine — COMPLETE
**Latest verified technical checkpoint:** `93e58a2 feat: add Google Trends query DOM diagnostic`
**Verified baseline date:** 2026-08-19

---

# 1. Current Repository State

Repository:

```text
~/Projects/roofroom-data-collector
```

Branch:

```text
main
```

Latest verified checkpoint:

```text
93e58a2 feat: add Google Trends query DOM diagnostic
6c74bf2 docs: reconcile M3 comparison readiness checkpoint
310cda6 fix: wait for Google Trends comparison control
b49770b docs: prepare repository development handoff
2fe1f70 feat: add Google Trends query diagnostics
1d6d0a1 docs: reconcile M3 project handoff
5024e66 fix: classify Google Trends date dialog errors
9979d70 feat: add Google Trends UI stage diagnostics
4ab8600 feat: add explicit live GT01 collection
6fe72a0 feat: detect Google Trends manual action
aac9d3b feat: compose Google Trends runtime
439b851 feat: add Google Trends collecting source
cfeab0d feat: compose Google Trends configured page export
b562f3c feat: verify Google Trends fixed filters
f1409e0 feat: apply Google Trends query group and geography
6f28744 feat: apply Google Trends custom date range
351f0ed feat: add Google Trends custom date dialog adapter
d47ff2a feat: scope Google Trends interest over time download
acc7d4d feat: add managed browser download capture
6d5b407 feat: wire Google Trends collection validator
2b65577 feat: parse and validate Google Trends CSV
7aa3900 feat: add persistent public download storage
7f62df5 feat: add explicit Google Trends live probe command
e06c2e7 feat: connect Google Trends probe to browser manager
7030b42 feat: add Google Trends provider probe
86d4c51 feat: detect Google Trends rate limiting
```

Verified committed technical baseline before this handoff update:

```text
main
93e58a2 feat: add Google Trends query DOM diagnostic
```

The abandoned/unverified broad QUERY_GROUP `waitFor()` experiment was removed from the worktree before the baseline gate. It must not be treated as implemented or accepted behavior.

One explicitly approved live GT01 request was made after `2fe1f70`. It produced safe structured evidence that `ADD_COMPARISON` had `observed_count=0` at `query_index=1`. No artifact was produced and no automatic retry was made.

`310cda6` applies the resulting narrow readiness fix. It does not add `waitFor()`, sleep/delay, a new timeout, retry, refresh, selector changes, navigation changes, or other provider-behavior changes. It lets the existing bounded strict Playwright click action wait for the temporarily missing `ADD_COMPARISON` control.

One controlled live GT01 request was made after `310cda6`. It again reported `ADD_COMPARISON`, `observed_count=0`, `query_index=1` after the existing bounded strict click action failed. No artifact was produced and no automatic retry was made. This disproved the hypothesis that the existing locator only needed to use Playwright action waiting.

`93e58a2` adds a separate explicit live structural diagnostic command. It is restricted to one Explore navigation, the first GT01 Search Term selection, one exercise of the existing comparison-add locator, and bounded tag/role/aria-label/class/count evidence. It rejects retry, refresh, download, and broader-group arguments; redacts configured query strings; and does not emit page text, input values, HTML, cookies, headers, or session state. The diagnostic command has not yet made a live request.

Development environment currently verified:

```text
MacBook Air M1
macOS / arm64
Node v24.19.0
npm v11.17.0
system Bash 3.2.57
Electron + React + Vite + TypeScript
SQLite via node:sqlite
Playwright + Chromium installed for M3 development
```

Development helper scripts must remain compatible with the target macOS environment. Do not assume newer GNU/Bash-only commands such as `mapfile`.

---

# 2. Product Boundary

RoofRoom Data Collector remains a local-first modular desktop data collection application.

Core philosophy:

```text
Collect → Preserve → Validate → Document → Export
```

The collector does not make SEO, marketing, advertising, merchandising, or commercial decisions.

Release 1.0 remains intentionally limited to the Google Trends MVP. Do not begin later source modules until the base Google Trends collector is stable.

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

M3 must first prove one trustworthy real query-group vertical slice before expansion.

Current first group:

```text
GT01
generic_commercial

canlı bitki
online bitki
bitki satın al
bitki siparişi
saksılı bitki
```

Current locked live test request:

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

# 4. M2 Core Baseline

M2 is complete and must not be reopened without evidence of a core regression.

Verified shared-core capabilities include:

```text
run persistence
job persistence
attempt history
execution-state transitions
run-state aggregation
artifact persistence
validation-summary persistence
accepted-artifact references
immutable raw filesystem storage
SHA-256 + byte-size evidence
metadata JSON persistence
detailed validation JSON persistence
resume planning
accepted-job skip
candidate preservation
reconciliation
explicit retry policy
retry-attempt history preservation
sequential source orchestration
structured JSONL logging
sensitive-value redaction
application-specific persistent browser-profile boundary
integrated deterministic M2 acceptance gate
```

The 2026-08-19 baseline verification reconfirmed all eight integrated M2 gate assertions.

---

# 5. Implemented M3 Google Trends Surfaces

The following M3 slices are committed and retained by the verified `93e58a2` baseline:

```text
rate-limit detection
provider probe
BrowserManager → provider probe integration
explicit live provider-probe command
persistent public download storage
real Google Trends Interest Over Time CSV parser
minimum M3 source-specific CSV validator
CollectionValidator adapter
managed browser download capture
Interest Over Time scoped download selection
custom-date dialog field adapter
full custom-date workflow
ordered Search Term query-group UI adapter
Türkiye geography adapter
All categories / Web Search verification
configured-page export composition
GoogleTrendsCollector
GoogleTrendsSource collecting integration
main-process Google Trends runtime composition
manual-action detection
explicit live GT01 collection command
safe configured-page stage diagnostics
nested date-dialog UI error classification
structured QUERY_GROUP control/count diagnostics
bounded strict-action readiness for the comparison-add control
explicit query DOM structural diagnostic command
```

The provider-facing workflow remains fail-closed. Critical controls do not use positional `.first()` / `.nth()` selection as a fallback.

---

# 6. Real Provider Evidence Established During M3

Real Google Trends behavior has been exercised. Earlier handoff statements saying otherwise are obsolete.

Verified real-source evidence includes:

```text
Google Trends Explore provider can be reached through the app-owned profile
provider probe has returned HTTP 200 with no rate-limit signal
one manual discovery session observed HTTP 429 and was stopped without refresh/evasion
classic Explore UI controls were manually inspected
a real GT01 Interest Over Time CSV was exported and preserved
a second real GT01 export confirmed the same structural schema while live numeric values varied
real CSV uses weekly rows for the locked 24-month request
real export contains the five canonical GT01 query series
missing CSV values remain missing/null rather than becoming zero
```

Live numeric values must never be asserted as exact stable values.

Google Trends 0–100 values remain relative interest only and must never be converted into estimated search counts.

---

# 7. Current Live GT01 Status

The source-level GT01 live vertical slice has **not** succeeded yet.

Latest verified live result:

```json
{
  "live_scope": "GT01",
  "query_group_name": "generic_commercial",
  "query_count": 5,
  "requested_date_start": "2024-08-18",
  "requested_date_end": "2026-08-17",
  "result_type": "FAILED",
  "error_code": "GOOGLE_TRENDS_UI_CONTRACT_ERROR",
  "diagnostic": "Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError; control=ADD_COMPARISON; observed_count=0; query_index=1)."
}
```

No accepted GT01 artifact was produced by that live attempt.

The first structured live attempt used the diagnostics committed in `2fe1f70`. It was followed by the narrow deterministic fix in `310cda6`. A second controlled live attempt using that fix produced the same safe diagnostic. Neither attempt retried automatically or produced an artifact.

This proves only:

```text
the provider was reached
collection entered configured-page export
the failure occurred during QUERY_GROUP
the exact failing control was ADD_COMPARISON
the immediate observed count was 0
the next query index was 1
the failure was a controlled structured GoogleTrendsQueryGroupUiContractError
the workflow failed closed
```

It does **not** yet prove:

```text
selector drift
a permanently missing control
a provider-language mismatch
the actual current comparison-container tag/role/aria-label/class contract
```

Do not add broader waits, sleeps, selector changes, retries, refreshes, or timeout changes without new live evidence.

---

# 8. QUERY_GROUP Contract at the Verified Baseline

The committed query-group adapter currently relies on these provider contracts:

```text
initial query input:
role=searchbox
name="Add a search term"

Search Term suggestion:
role=button
name="<query> Search term"

comparison add control:
role=button
name="Add a search term for comparison"

new/unselected comparison slot:
.compare-term-container .search-term-wrapper.term-not-selected

nested new-slot input:
role=searchbox
name="Add a search term"
```

For the initial input, empty comparison slot, and nested comparison input, the adapter calls `count()` and requires exactly one match before mutation.

For `ADD_COMPARISON`, the adapter first fails closed immediately when more than one match exists. When the initial count is zero or one, it uses the existing strict Playwright click action and existing bounded UI timeout. If the action fails and the final count is not one, it reports the final structured cardinality evidence. If the action fails while exactly one match exists, the original action failure remains visible to the collector boundary.

At `2fe1f70`, exact-cardinality failures carry structured, allowlisted diagnostic context for:

```text
INITIAL_QUERY_INPUT
ADD_COMPARISON
EMPTY_COMPARISON_SLOT
COMPARISON_QUERY_INPUT
```

The controlled diagnostic fields are:

```text
control
observed_count
query_index
```

Arbitrary provider text, query text, raw exception messages, HTML, cookies, authentication state, session material, and dynamic DOM IDs are not exposed by this diagnostic contract.

The committed baseline does **not** contain the abandoned `locator.waitFor()` experiment, any sleep/delay, or a new timeout.

The Search Term suggestion is selected using Playwright click action with the existing bounded UI timeout; Playwright action waiting is distinct from the explicit cardinality checks above.

---

# 9. Current Diagnostic Boundary

Configured-page export reports only fixed stages:

```text
QUERY_GROUP
GEOGRAPHY
DATE_RANGE
FIXED_FILTERS
DOWNLOAD
```

Collector UI-contract failures are converted into bounded diagnostics that expose:

```text
fixed stage
known internal error class
allowlisted QUERY_GROUP control/count/index context when available
```

Raw provider text, arbitrary exception messages, HTML, cookies, authentication state, or session data must not be surfaced by the live CLI.

The date-dialog classifier gap found during M3 was fixed in:

```text
5024e66 fix: classify Google Trends date dialog errors
```

The structured QUERY_GROUP diagnostic boundary was added in:

```text
2fe1f70 feat: add Google Trends query diagnostics
```

---

# 10. Verified Baseline Gate — 2026-08-19

The full deterministic checks below passed against the `310cda6` collector implementation during the 2026-08-19 verification:

```text
npm run lint
npx tsc --noEmit

npm run test:m3:gt-query-geo
npm run test:m3:gt-ui-diagnostics
npm run test:m3:provider-state
npm run test:m3:provider-probe
npm run test:m3:browser-probe
npm run test:m3:live-probe-command
npm run test:m3:downloads
npm run test:m3:gt-csv
npm run test:m3:gt-validator-adapter
npm run test:m3:browser-download
npm run test:m3:gt-download-selector
npm run test:m3:gt-date-dialog
npm run test:m3:gt-date-range
npm run test:m3:gt-fixed-filters
npm run test:m3:gt-configured-export
npm run test:m3:gt-collecting-source
npm run test:m3:live-gt01-command
npm run test:m3:gt-runtime
npm run test:m3:gt-runtime-package-config
npm run test:m3:gt-manual-action

npm run test:m2:gate
npm run package
```

Observed results:

```text
GT-QUERY-001..011 PASS
GT-GEO-001..006 PASS
GT-DIAG-001..006 PASS
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
GT-DATE-DIALOG-001..008 PASS
GT-DATE-RANGE-001..007 PASS
GT-FILTER-001..007 PASS
GT-CONFIGURED-EXPORT-001..007 PASS
GT-SOURCE-001..003 PASS
GT-COLLECTOR-001..005 PASS
GT-LIVE-GT01-CMD-001..004 PASS
GT-RUNTIME-001..005 PASS
GT-PACKAGE-001 PASS
GT-MANUAL-001..006 PASS
M2-GATE-001..008 PASS
Electron Forge package PASS on darwin arm64
```

After the diagnostic-only `93e58a2` addition, these checks were rerun and passed:

```text
npm run lint
npx tsc --noEmit
npm run test:m3:live-query-diagnostic-command
npm run test:m3:live-gt01-command
npm run test:m3:live-probe-command
npm run test:m3:gt-query-geo
npm run test:m3:provider-probe
npm run test:m3:gt-manual-action

GT-LIVE-QUERY-DIAG-CMD-001..003 PASS
```

The first package attempt in the restricted environment reached the production build and then failed only because `github.com` DNS access was unavailable. The same `npm run package` command completed successfully with network access; this was not a Google Trends request.

The Vite CJS Node API deprecation message remains a warning only; it is not currently a failing gate.

Verified committed technical checkpoint:

```text
93e58a2 feat: add Google Trends query DOM diagnostic
```

---

# 11. Current Safety / Compliance Rules

Do not:

```text
store passwords
copy the user's normal browser profile
copy cookies/sessions without explicit consent
automate CAPTCHA or 2FA
bypass anti-bot protections
bypass rate limits
use CAPTCHA solvers
use proxy rotation for evasion
auto-refresh after provider blocking
blindly auto-retry live provider failures
use undocumented/private endpoints when the supported UI/export path is sufficient
```

When authentication/security intervention is required:

```text
MANUAL_ACTION_REQUIRED
```

When rate limited:

```text
stop
preserve the controlled state/evidence
do not refresh/retry immediately
```

---

# 12. Current M3 Data / Validation Boundary

A real GT01 CSV structure has already been used to establish the minimum M3 parser/validator behavior.

Current important guarantees include:

```text
raw source bytes preserved
public provider download preserved separately
HTML/login/error content rejected as data
expected GT01 query identity checked
weekly temporal structure parsed
requested-vs-actual coverage checked
relative-interest numeric fields parsed
0..100 range checked
empty source values remain null
duplicate periods rejected
geography/category evidence checked where represented/observed
```

`LOW_DATA`, `NO_DATA`, and all-zero calibration remain intentionally deferred until enough real provider behavior exists. The reusable/hardened validation framework remains M4 work.

---

# 13. Current Storage Boundary

There are two intentional persistence concerns:

```text
PersistentDownloadStore
→ preserves the provider download in the user-visible Downloads tree

StorageManager / CollectionOrchestrator
→ owns canonical run-scoped raw artifact persistence and audit evidence
```

The source-level live GT01 command currently proves the provider-facing collection boundary. It does not by itself prove the full run/job/attempt/orchestrator persistence vertical slice.

Current open M3 storage integration issue:

```text
provider downloads are persisted first to the user-visible Downloads area
the verified bytes are then returned for later canonical run-scoped persistence
the live GT01 CLI calls the real source directly
the live GT01 CLI does not yet use CollectionOrchestrator / StorageManager / SQLite
```

Therefore a source-level live artifact may currently have its only durable copy in Downloads. Downloads is an intentional user-visible preservation area, but it must not be treated as the intended authoritative application datastore. Canonical application state and raw run evidence belong under the application-owned run/storage boundary. Existing provider evidence must not be deleted, moved, or rewritten until its provenance and canonical relationship are inspected.

After a source-level GT01 artifact becomes trustworthy, the next architectural M3 slice must run the real Google Trends source through the existing CollectionOrchestrator so real evidence includes:

```text
run
job
attempt
canonical run-scoped raw artifact
metadata JSON
validation JSON
validation status
SQLite state
public preserved provider copy
```

M3 must not be declared complete before this integration is proven.

---

# 14. Known Issues / Open Decisions

Current blocking issue:

```text
the latest live GT01 attempt failed during QUERY_GROUP at
ADD_COMPARISON with observed_count=0 and query_index=1
the same result occurred after the 310cda6 bounded strict-action fix
the current provider structural contract is not yet captured
```

Still unknown:

```text
which current tag/role/aria-label/class contract represents comparison-add
whether a structurally verified locator advances to the next control/stage
whether source-level GT01 can produce and validate an artifact
```

Other intentional deferrals:

```text
LOW_DATA calibration
NO_DATA calibration
all-zero policy calibration
GT02–GT20 expansion
real Google Trends source → CollectionOrchestrator vertical slice until source-level GT01 succeeds
release browser-binary distribution / fresh-install hardening until M7
```

---

# 15. Exact Next Action

Do **not** make another provider-behavior change before structural live evidence.

The safe structural diagnostic command is implemented, deterministically verified, committed, and present in `93e58a2`.

The exact next technical action is:

```text
make exactly one explicitly approved live query DOM diagnostic
using npm run m3:live-query-diagnostic -- --confirm-live-diagnostic
```

This diagnostic is deliberately restricted to:

```text
one Explore navigation
first GT01 Search Term selection only
one existing ADD_COMPARISON locator action
bounded structural counts and tag/role/aria-label/class evidence
configured-query redaction
no retry, refresh, download, or broader query group
```

Interpret the resulting evidence:

```text
expected accessible name is absent but one distinct structural add control exists
→ implement only that provider-evidenced contract with strict cardinality

multiple plausible structural controls exist
→ tighten scoping; do not choose by DOM position

container/state is absent
→ diagnose first-query selection state before changing the add locator
```

Do not revive the abandoned broad `waitFor()` experiment unless later live evidence justifies a separately scoped change.

---

# 16. M3 Success Sequence From Here

```text
verified 2fe1f70 diagnostic baseline
↓
one explicit live GT01 attempt
↓
ADD_COMPARISON observed_count=0 at query_index=1
↓
evidence-based minimal query-group fix in 310cda6
↓
deterministic full regression gate
↓
one explicit live GT01 attempt: same ADD_COMPARISON count=0
↓
safe structural diagnostic in 93e58a2
↓
one explicit live query DOM diagnostic
↓
provider-evidenced minimal query-group correction
↓
deterministic regression gate
↓
controlled live GT01 collection
↓
continue fail-closed through geography/date/filter/download if another stage fails
↓
ARTIFACT_PRODUCED
↓
minimum M3 validation
↓
VALID / acceptable real GT01 artifact
↓
real Google Trends source through CollectionOrchestrator
↓
run/job/attempt/raw/metadata/validation persistence proof
↓
small multi-group proof
↓
progressively expand toward GT01–GT20
```

Do not skip directly from the current QUERY_GROUP failure to broad GT01–GT20 automation.

---

# 17. Handoff Discipline

`PROJECT_HANDOFF.md` is not a Git save mechanism.

Update it when project state meaningfully changes, including:

```text
session end / long pause
several meaningful implementation slices
milestone boundary
important known issue
material change to the exact next action
```

Use Git commits for technical checkpoints.

Do not update this handoff after every small commit.

`PROJECT_SPEC.md` should change even less frequently: only for scope, architecture, data-contract, acceptance-criteria, or locked technical-decision changes.

Never record an unverified implementation state as completed.
