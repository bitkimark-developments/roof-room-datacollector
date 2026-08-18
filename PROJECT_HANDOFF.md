# RoofRoom Data Collector — Project Handoff

**Current Milestone:** M3 — Google Trends MVP Collector
**Previous Milestone:** M2 — Core Collector Engine — COMPLETE
**Latest verified Git checkpoint:** `46bf794 feat: wire orchestration logging and add M2 gate`

---

# 1. Current Repository

Repository:

```text
~/Projects/roofroom-data-collector
```

Branch:

```text
main
```

Current verified checkpoint:

```text
46bf794 feat: wire orchestration logging and add M2 gate
527a156 feat: add browser manager foundation
75bdbb6 feat: add structured logging and redaction
bd1300b feat: persist metadata and validation documents
92378e9 feat: add sequential collection orchestration
e14c959 feat: add reconciliation and retry policy
38dc16a feat: add resume reconciliation planning
add43fa feat: add raw artifact storage manager
f9c6356 feat: persist artifacts and validation summaries
f7b7d46 feat: add run lifecycle aggregation
31f427d feat: add attempt persistence
996b34e feat: persist runs and jobs
```

Development environment:

```text
MacBook Air M1
macOS
VS Code
Node 24 via .nvmrc
Electron + React + Vite + TypeScript
SQLite via node:sqlite
Playwright library installed
```

Playwright browser binaries were intentionally not installed during M2.

---

# 2. Product Boundary

RoofRoom Data Collector is a local-first modular desktop data collection application.

Core philosophy:

```text
Collect → Preserve → Validate → Document → Export
```

The collector does not make SEO, marketing, advertising, merchandising, or commercial decisions.

One application contains multiple independent source modules. Google Trends is the first source module.

Release 1.0 remains intentionally limited to the Google Trends MVP.

---

# 3. M2 Completion Status

M2 — Core Collector Engine is complete.

Verified core capabilities:

```text
run persistence
job persistence
attempt history
execution state transitions
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
integrated deterministic acceptance gate
```

M2 did not implement real Google Trends collection.

---

# 4. M2 Integrated Acceptance Gate

The deterministic M2 gate passes end to end.

Verified flow:

```text
fake source
→ sequential orchestration
→ raw artifact persistence
→ metadata JSON
→ validation JSON
→ structured log events
→ intentional attempt-1 DOWNLOAD_FAILED
→ application/repository restart
→ accepted jobs reconstructed as SKIP_ACCEPTED
→ failed job reconstructed as RETRY_CANDIDATE
→ explicit retry attempt 2
→ canonical accepted artifact
→ final run COMPLETED
→ persistent browser-profile boundary survives reopen
→ SQLite integrity checks pass
```

Gate assertions:

```text
M2-GATE-001 sequential shared orchestration
M2-GATE-002 raw + metadata + validation evidence
M2-GATE-003 retry survives restart
M2-GATE-004 accepted jobs are not recollected
M2-GATE-005 orchestration logs persist and redact
M2-GATE-006 app-owned browser profile persists
M2-GATE-007 final run + history are preserved
M2-GATE-008 SQLite FK + quick_check integrity
```

---

# 5. Current Test Surface

Current M2 scripts:

```text
npm run test:m2:state
npm run test:m2:attempts
npm run test:m2:runs
npm run test:m2:artifacts
npm run test:m2:storage
npm run test:m2:resume
npm run test:m2:reconcile
npm run test:m2:documents
npm run test:m2:orchestrator
npm run test:m2:logging
npm run test:m2:browser
npm run test:m2:gate
```

All above passed at the M2 boundary.

Production package smoke also passed:

```text
npm run package
```

Verified target:

```text
darwin arm64
```

---

# 6. Current Storage / Evidence Model

Run-scoped filesystem structure:

```text
data/runs/<run_id>/
  <source_id>/
    raw/
    metadata/
    validation/
  exports/
  logs/
```

Raw source evidence is preserved exactly and never silently overwritten.

Retry attempts use attempt-specific filenames where needed.

Examples:

```text
GT01.metadata.json
GT01.validation.json

GT01.attempt_2.metadata.json
GT01.attempt_2.validation.json
```

Validation keeps:

```text
SQLite searchable summary
+
filesystem detailed validation JSON
```

`validation_json_path` is stored as a run-relative path.

Unknown source facts must remain unknown. For example, `actual_date_start` and `actual_date_end` remain `null` until verified from real source evidence.

---

# 7. Browser Foundation

BrowserManager exists as a provider-neutral M2 foundation.

Current guarantees:

```text
application-owned profile root
app-data/browser-profiles/<profile_id>

one managed persistent context
same-profile concurrent open is idempotent
different active profile fails closed
clean/idempotent close
profile directory survives reopen
headed mode default
downloads accepted by default
unsafe profile IDs rejected
unexpected close surfaced
launch failure surfaced
```

Do not use the user's normal Chrome profile.

Do not copy cookies or sessions from another profile.

Do not store passwords.

Do not bypass CAPTCHA, 2FA, anti-bot controls, or rate limits.

Manual authentication/security intervention must surface as:

```text
MANUAL_ACTION_REQUIRED
```

---

# 8. M3 Scope

M3 — Google Trends MVP Collector now begins.

M3 must remain narrow.

Target:

```text
Google Trends
Turkey
All Categories
Web Search
Search Term
exact 24-month requested range
Interest Over Time
provider CSV export when feasible
preserve original CSV
metadata/provenance
minimum source-specific validation
retry/resume through existing core
```

Do not expand M3 into:

```text
related queries
subregions
Topic datasets
Keyword Planner
Search Console
Semrush
Merchant Center
GA4
Google Ads
XLSX product polish
analysis/strategy
```

---

# 9. Google Trends Source Rules

Google Trends values are relative interest values from 0 to 100.

Never convert them into estimated search counts.

Different Google Trends comparison groups are independently normalized.

Do not automatically compare values across independently normalized groups as if they shared one global scale.

Preserve query-group context, including duplicate queries appearing in different groups.

Search Term and Topic datasets remain separate.

Release 1.0 M3 uses Search Term only.

The Google Trends UI source mode remains distinct from any future API source mode.

---

# 10. M3 First Vertical Slice

The first real M3 slice should make one Google Trends query group work reliably before expanding.

Preferred first group:

```text
GT01
```

Initial technical sequence:

```text
inspect current GoogleTrendsSource placeholder
inspect current source / collection contracts
inspect query config shape
inspect BrowserManager integration boundary
inspect current official Google Trends UI behavior
install Playwright Chromium only when the first live-browser test requires it
open app-specific persistent Google profile
surface manual login if required
navigate through supported Google Trends UI
configure Turkey / All Categories / Web Search / Search Term
apply exact requested 24-month range
request Interest Over Time CSV export
capture the downloaded provider CSV
preserve raw bytes through StorageManager
perform minimum M3 source-specific validation
persist metadata / validation evidence
complete the job through existing orchestrator
```

Do not build GT01–GT20 automation before GT01 is proven.

---

# 11. M3 Acceptance Criteria for the First Real Group

Before expanding beyond the first group, prove:

```text
real provider UI can be reached through the app-specific profile
manual auth can be completed without credential capture
requested query group is represented correctly
requested geography is Turkey
search type is Web Search
selection type is Search Term
requested range is exactly the intended 24 months
provider CSV download is captured
raw CSV remains byte-preserved
CSV is actually data, not HTML/login/error content
expected query columns are present
date coverage is checked
numeric interest values are parseable
all-zero / low-data cases are not silently accepted
metadata points to the raw artifact
validation result points to detailed validation JSON
job reaches the correct execution state
restart/resume does not recollect accepted evidence
```

M3 should use only the minimum validation necessary to trust the first live artifact.

Reusable/hardened validation remains M4.

---

# 12. Known Issues / Open Decisions

Current known boundary conditions:

```text
Playwright browser binaries are not yet installed.
Real Google Trends navigation has not yet been exercised.
Real provider authentication state has not yet been tested.
Exact current Google Trends UI selectors/workflow must be verified against the live provider before implementation.
Actual provider CSV schema must be inspected from a real export before locking source-specific parsing assumptions.
```

No private or undocumented Google Trends endpoint should be adopted when the supported UI/export path is sufficient.

If the provider requires manual authentication, pause cleanly rather than automating credentials.

---

# 13. Exact Next Action

Start M3 with inspection, not implementation-by-assumption.

Inspect the current repository surfaces relevant to the first Google Trends vertical slice:

```text
src/main/core/source-registry.ts
src/shared/source.ts
src/shared/collection.ts
GoogleTrendsSource implementation
query configuration loader/contracts
BrowserManager
Playwright launcher
CollectionOrchestrator
StorageManager
metadata / validation contracts
```

Then verify current official Playwright behavior and current Google Trends UI/export behavior before writing provider-specific automation.

The first provider-specific implementation target is:

```text
GT01 only
→ real Google Trends UI
→ real Interest Over Time CSV
→ preserved raw artifact
→ minimum trustworthy validation
→ completed job
```

---

# 14. Handoff Discipline

`PROJECT_HANDOFF.md` is not a Git save mechanism.

Update it only when project state meaningfully changes, including:

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
