# RoofRoom Data Collector — Project Handoff

**Document:** `PROJECT_HANDOFF.md`
**Product:** RoofRoom Data Collector
**Last Updated:** 2026-08-20
**Current Phase:** Google Trends 1.0 stable baseline maintenance and controlled expansion
**Repository:** `~/Projects/roofroom-data-collector`
**Branch:** `main`
**Latest observed Git checkpoint:** `e83984c docs: record user-facing file access`

---

# 1. Purpose

`PROJECT_HANDOFF.md` is the living project-state document for RoofRoom Data Collector.

It records:

- the current verified repository state,
- what is implemented,
- what has actually been verified,
- known limitations,
- external dependencies,
- approved next development work,
- the exact next action.

Stable product requirements belong in `PROJECT_SPEC.md`.

Architecture details belong in `ARCHITECTURE.md`.

Canonical data contracts belong in `DATA_CONTRACTS.md`.

Validation semantics belong in `VALIDATION_SPEC.md`.

Testing policy belongs in `TEST_STRATEGY.md`.

Architectural rationale belongs in `DECISIONS.md`.

Source onboarding rules belong in `SOURCE_MODULE_GUIDE.md`.

---

# 2. Current Repository Snapshot

Latest read-only snapshot:

```text
2026-08-19 23:21 +03:00
```

Repository:

```text
/Users/furkan/Projects/roofroom-data-collector
```

Branch:

```text
main
```

Observed HEAD:

```text
e83984c docs: record user-facing file access
```

Observed working tree:

```text
?? CODEX_HANDOFF_CURRENT.md
```

No tracked source-code modification was reported by the read-only check.

Runtime observed:

```text
Node.js  v24.19.0
npm      11.17.0
package  roofroom-data-collector@1.0.0
```

Recent observed commits:

```text
e83984c docs: record user-facing file access
f2a9308 fix: improve output and keyword file access
54108cd docs: record Google Trends MVP completion
200fdfb feat: complete Google Trends desktop workflow
da84c09 feat: add representative Google Trends live batch
21d59d6 feat: add Google Trends batch Core runner
33a495f fix: use configured Google Trends Explore workflow
1645179 fix: wait for Google Trends fixed filters
```

---

# 3. Current Product State

RoofRoom Data Collector is no longer in the bootstrap/planning state described by the old handoff.

The current repository contains a working Electron/React/TypeScript application with a substantial Google Trends implementation and the shared Core infrastructure required by the architecture.

The application remains:

- local-first,
- modular,
- validation-first,
- raw-data preserving,
- provenance-aware,
- resume/retry capable,
- designed for multiple future source modules.

Core philosophy remains:

> **Collect → Preserve → Validate → Document → Export**

The collector does not make marketing, SEO, advertising, merchandising, or commercial decisions.

---

# 4. Implemented / Present Repository Areas

The current repository exposes test and implementation surfaces for the following areas.

## Core / M2

Present test coverage includes:

- SQLite state repository
- attempts
- runs
- artifacts and validation summaries
- filesystem storage
- resume planning
- reconciliation
- sequential orchestration
- generated metadata/validation documents
- structured logging
- BrowserManager
- integrated M2 gate

This indicates that the shared Core is implemented rather than merely planned.

## Google Trends / M3

Present implementation/test surfaces include:

- provider-state detection
- provider probe
- configured Explore URL
- browser probe
- Interest Over Time CSV parser/validator
- collection validator adapter
- browser download capture
- application storage boundary
- Interest Over Time download selection
- custom-date dialog
- custom-date range
- query-group selection
- Turkey geography application
- fixed-filter verification
- configured page export
- collecting source composition
- runtime composition
- packaging/runtime configuration
- manual-action detection
- live GT01 command
- representative live batch command
- UI-stage diagnostics
- query DOM diagnostics
- Core persistence runner
- batch Core runner

## Desktop / M5

Present test surfaces include:

- desktop controller
- user-facing file access
- desktop UI smoke test

## Configuration / M1-M5

Present test surface includes:

- YAML/JSON/CSV query-config adapters

## Export / M6

Present test surface includes:

- Google Trends export manager

## Release / M7

A release gate script exists:

```text
npm run test:release:gate
```

A fresh release-gate execution has not yet been recorded in this handoff update.

---

# 5. Current Google Trends Functional Baseline

Current source identity remains:

```text
source_id    = google-trends
source_mode  = GOOGLE_TRENDS_UI
dataset_type = INTEREST_OVER_TIME
```

Current intended collection context:

```text
Geography      = Turkey
Category       = All Categories
Search Type    = Web Search
Selection      = Search Term
Query Groups   = external configuration
```

The working collection path is designed around:

```text
query group
↓
Google Trends UI
↓
exact requested date range
↓
fixed filter verification
↓
Interest Over Time export
↓
raw artifact preservation
↓
parse
↓
validation
↓
metadata/provenance
↓
Core persistence
↓
structured export
```

Existing architectural invariants remain unchanged:

- raw source files are evidence and should remain immutable,
- missing values must not become zero,
- Google Trends 0–100 values remain relative interest,
- comparison-group context is preserved,
- Search Term and Topic remain separate,
- suspicious/invalid artifacts must fail closed,
- already accepted jobs should not be recollected unnecessarily,
- retries preserve attempt history.

---

# 6. Known Current Limitation — Desktop Date Range

The Google Trends source layer already contains reusable exact custom-date support.

Observed source files include:

```text
src/main/sources/google-trends/google-trends-custom-date-dialog.ts
src/main/sources/google-trends/google-trends-custom-date-range.ts
```

These components already accept:

```text
requested_date_start
requested_date_end
```

and validate:

- `YYYY-MM-DD` format,
- real calendar dates,
- start date not after end date.

However, the desktop controller factory currently hard-codes:

```text
REQUESTED_DATE_START = 2024-08-18
REQUESTED_DATE_END   = 2026-08-17
```

Therefore the current limitation is primarily at the desktop request/configuration boundary, not in the underlying Google Trends date-application mechanism.

Do not redesign the working collector to solve this limitation.

---

# 7. Approved Next Google Trends UX Direction

The next date-range feature should use bounded period presets rather than immediately exposing an unrestricted free-form range.

Approved initial presets:

```text
1 Week
1 Month
6 Months
12 Months
24 Months
36 Months
```

Turkish UI labels:

```text
1 Hafta
1 Ay
6 Ay
12 Ay
24 Ay
36 Ay
```

The feature is **approved but not implemented**.

Important implementation requirement:

The preset must define the **duration**, while the user must also be able to anchor that duration to a chosen historical date/window.

A rolling-only design such as:

```text
1 Week = last 7 days only
```

would not satisfy event-specific research such as Mother's Day or a historical wedding-season window.

Preferred UX direction to validate during implementation:

```text
Period
[ 1 Hafta | 1 Ay | 6 Ay | 12 Ay | 24 Ay | 36 Ay ]

Reference / End Date
[ YYYY-MM-DD ]

Default reference date:
last complete day
```

The application derives the requested start date deterministically from the selected preset and reference date.

Alternative start-date anchoring may be adopted if it produces a clearer UI, but only one deterministic rule should be used.

Persisted provenance must continue to store the exact resulting:

```text
requested_date_start
requested_date_end
```

rather than only the human-readable preset.

---

# 8. Date-Range Implementation Risk

Do not assume every requested duration returns the same Google Trends temporal granularity.

The current parser/validator behavior was built around real observed source behavior from the existing MVP.

Before enabling all six presets as release-ready, verify representative real exports for:

```text
1 Week
1 Month
6 Months
12 Months
24 Months
36 Months
```

For each preset observe and document:

- temporal column/header,
- row granularity,
- actual start/end coverage,
- provider boundary rounding,
- missing/no-data behavior,
- CSV schema stability.

If Google Trends returns different temporal structures for different durations, generalize the parser/validator from real evidence rather than inventing a schema.

Raw files and requested/actual date ranges must remain distinct.

---

# 9. External Source Status

Google Trends remains the only active source module in the current working baseline.

Planned future sources remain modular and source-separated.

## Google Ads Keyword Planner

Direction:

```text
official Google Ads API
```

Current implementation status:

```text
not started
```

External access/setup work is being handled before implementation so coding is not performed against incomplete or untestable credentials/access.

## Google Search Console

Preferred long-term direction:

```text
official Search Console API
```

A browser/UI export vertical slice may be evaluated separately only if it is compliant, stable, and materially useful.

## Meta / TikTok / Other Public Research Sources

Do not add a new browser collector merely because data is visible in a public UI.

Every new source must first pass:

```text
source value
↓
official API/export availability
↓
automation / terms / permission review
↓
manual live discovery
↓
raw contract
↓
parser
↓
validator
↓
one-job vertical slice
```

No undocumented/private endpoint or protection-bypass architecture should be introduced.

---

# 10. Codex Usage Constraint

The current working Google Trends baseline should not be reworked through broad Codex sessions while external requirements or live-test conditions are incomplete.

Preferred development mode for the immediate small changes:

```text
inspect
↓
small bounded patch
↓
targeted deterministic tests
↓
live verification where required
↓
release gate
↓
Git checkpoint
↓
handoff update
```

Use Codex later only when the task is sufficiently specified and can be tested end-to-end without wasting implementation cycles on missing external access.

---

# 11. Backup / Stability Rule

Before changing the current working baseline:

1. update this handoff,
2. verify the current repository state,
3. create a full local backup,
4. preserve Git history,
5. preserve application runtime data,
6. preserve public RoofRoom output files where needed,
7. verify the backup can identify the same Git HEAD,
8. only then begin feature work on a separate branch or working copy.

The backup must include more than source code because local application state and the application-owned browser profile may be operationally valuable.

Do not publish runtime/browser-profile backups to a public repository.

---

# 12. Planned Development Sequence

The next development sequence is:

```text
A. Update PROJECT_HANDOFF.md
↓
B. Create and verify stable backup
↓
C. Run fresh baseline lint + release gate
↓
D. Create feature branch / isolated working copy
↓
E. Implement date-period request contract
↓
F. Add desktop UI period controls
↓
G. Wire renderer → preload → IPC → controller → requested configuration
↓
H. Keep existing Google Trends collector/date adapter intact
↓
I. Add deterministic tests for all six presets
↓
J. Perform representative live Google Trends tests
↓
K. Generalize temporal parser only if real provider evidence requires it
↓
L. Run release regression gate
↓
M. Git checkpoint
↓
N. Update PROJECT_HANDOFF.md
↓
O. Evaluate next Google Trends dataset / compliant external source
```

Do not combine the first date-range change with a large source-module refactor.

---

# 13. Immediate Test Requirements for Date Presets

Before the feature is considered complete, deterministic tests should prove at minimum:

```text
1W preset produces the intended exact requested start/end dates
1M preset produces the intended exact requested start/end dates
6M preset produces the intended exact requested start/end dates
12M preset produces the intended exact requested start/end dates
24M preset preserves the current supported behavior
36M preset produces the intended exact requested start/end dates

invalid reference date is rejected
future/incomplete-day policy is enforced
derived start never exceeds end
requested dates cross IPC unchanged
requested dates reach RequestedCollectionConfiguration unchanged
metadata persists exact requested range
resume uses persisted run configuration rather than recalculating a new period
```

Live-source tests should validate source behavior, not exact numeric Trends values.

---

# 14. Documentation Follow-Up

The date-preset feature changes the previous stable assumption that the primary Google Trends period is fixed at exact 24 months.

Do not silently rewrite that historical decision.

After the implementation behavior is proven:

- update `PROJECT_SPEC.md` to describe the supported period presets,
- add/supersede the relevant date-period decision in `DECISIONS.md`,
- update `TEST_STRATEGY.md` if new temporal-granularity gates are required,
- update `DATA_CONTRACTS.md` only if the persisted contract changes,
- update `PROJECT_HANDOFF.md` with the actual verified implementation result.

Until then, this handoff records the change as an approved next direction, not as completed behavior.

---

# 15. Current Verification Status

Verified from the latest read-only repository snapshot:

```text
repository exists
branch = main
HEAD = e83984c
package version = 1.0.0
broad Core / Google Trends / Desktop / Export test scripts exist
custom-date source support exists
desktop factory still hard-codes the current requested date range
```

Not freshly verified during this handoff update:

```text
npm run lint
npm run test:release:gate
fresh live GT01 collection
fresh representative batch
fresh packaged application smoke test
backup integrity
```

Do not mark these as current PASS until they are run again.

---

# 16. Exact Next Action

The immediate next action is:

> **Replace the stale repository `PROJECT_HANDOFF.md` with this current handoff, then create and verify a full local stable backup before changing application code.**

After the backup exists:

```text
fresh lint
+
fresh release gate
```

must run against the untouched baseline.

Only after those pass should the date-preset feature branch be created.

---

# 17. Current Handoff Summary

```text
Project:
RoofRoom Data Collector

Repository:
~/Projects/roofroom-data-collector

Branch:
main

Latest observed HEAD:
e83984c

Package:
1.0.0

Current phase:
Google Trends 1.0 stable baseline maintenance and controlled expansion

Google Trends:
working implementation present

Current known limitation:
desktop date range hard-coded to 2024-08-18 → 2026-08-17

Approved next feature:
1 Week / 1 Month / 6 Months / 12 Months / 24 Months / 36 Months period presets,
anchored to an explicit historical date/window

Fresh release verification:
PENDING

Backup:
PENDING

Exact next action:
install this updated PROJECT_HANDOFF.md into the repository, then create/verify the stable backup
```

---

# 18. Handoff Discipline

At the end of every meaningful implementation session:

1. verify actual working behavior,
2. record tests that actually ran,
3. record known failures,
4. update the current phase/milestone,
5. record the latest verified Git commit,
6. record the exact next action.

Do not write unverified implementation work as completed.

Do not use `PROJECT_HANDOFF.md` as a substitute for Git checkpoints or backups.
