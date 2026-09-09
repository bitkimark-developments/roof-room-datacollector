# RoofRoom Data Collector — Project Handoff

**Checkpoint date:** 2026-09-09

**Current milestone:** Release 1.0 multi-source foundation and source-adapter rollout

**Current stage:** Documentation reconciliation checkpoint; application implementation is paused pending review

**Current goal:** Preserve the proven Google Trends/Core baseline, finish the existing period-preset WIP as a separate checkpoint, then add approved Release 1.0 sources through independent vertical slices

---

## 1. Live repository state

Authoritative repository:

```text
/Users/furkan/Projects/roofroom-data-collector
```

Current branch:

```text
feat/google-trends-period-presets
```

Current HEAD:

```text
0259a3caa493f4b76636e7e82b053440a8503ac1
0259a3c config: add real Google Trends validation groups
```

Branch relationship observed during this checkpoint:

```text
main: 11b897b docs: refresh project handoff for current Google Trends baseline
feature branch: 6 commits ahead of main, 0 behind
```

Latest committed technical checkpoint verified by the current deterministic gate:

```text
0259a3c config: add real Google Trends validation groups
```

## 2. Working tree state

The working tree was already dirty before this documentation reconciliation.

Pre-existing uncommitted application/test WIP, preserved without modification by this documentation task:

```text
M  src/App.tsx
M  src/shared/google-trends-period.ts
M  tests/integration/app/google-trends-period-selection.integration.cjs
```

Observed WIP meaning:

```text
remove the 36M period preset from the renderer label map,
shared period contract/arithmetic,
and deterministic period-selection integration expectations
```

This is the previously suspected Google Trends 36M cleanup. It is real, uncommitted, internally consistent across the three changed files, and passed the current deterministic release gate. It has not been committed or mixed into documentation edits.

Pre-existing untracked files, preserved without modification:

```text
?? CODEX_HANDOFF_CURRENT.md
?? PROJECT_HANDOFF.pre-20260820.md
```

`CODEX_HANDOFF_CURRENT.md` is an earlier technical audit generated on 2026-08-19 and describes an older `main`/`e83984c` snapshot. It is useful historical evidence but is not the canonical current-state document.

`PROJECT_HANDOFF.pre-20260820.md` is an untracked historical handoff snapshot. There is no tracked file named `PROJECT_UPDATE_2026-08-20.md` in the live repository. No historical file was moved, deleted, or rewritten during this task.

Documentation changed by this reconciliation:

```text
M  AGENTS.md
M  PROJECT_SPEC.md
M  ARCHITECTURE.md
M  DATA_CONTRACTS.md
M  VALIDATION_SPEC.md
M  TEST_STRATEGY.md
M  SOURCE_MODULE_GUIDE.md
M  DECISIONS.md
M  PROJECT_HANDOFF.md
```

Nothing is staged. No commit was created.

## 3. Product and Release 1.0 boundary

RoofRoom Data Collector remains a local-first modular desktop collector:

```text
Collect → Preserve → Validate → Document → Export
```

It does not generate SEO, content, page-type, advertising, merchandising, SERP-intent, or commercial decisions. Those belong to a separate downstream analysis layer.

Release 1.0 is now the verified multi-source scope. The following acquisition paths passed feasibility and are approved for implementation:

| Source | Approved acquisition | Feasibility | Implementation |
|---|---|---:|---:|
| Google Trends Interest Over Time | Playwright + provider CSV export | FINAL PASS | implemented reference source; current period cleanup WIP |
| Google Search Console | official Search Analytics API | FINAL PASS | NOT IMPLEMENTED |
| Google Ads Search Terms | official Ads API, verified `search_term_view`/SEARCH | FINAL PASS | NOT IMPLEMENTED |
| Keyword Planner historical metrics | official Ads API | FINAL PASS | NOT IMPLEMENTED |
| Keyword Planner fallback | manual UTF-16 tab-separated CSV import | FINAL PASS | NOT IMPLEMENTED |
| İkas Products | manual XLSX import | FINAL PASS | NOT IMPLEMENTED |
| Bitkimark public site | standard HTTP + sitemap/XML | FINAL PASS | NOT IMPLEMENTED |
| SERP | on-demand SerpApi | FINAL PASS | NOT IMPLEMENTED |

Semrush is not active Release 1.0 scope. Merchant Center, GA4, and other providers are extensibility examples only.

## 4. Actual Core implementation state

Status labels below describe live code, not intended architecture.

| Area | State | Evidence |
|---|---|---|
| Electron main/preload/React renderer boundary | COMPLETE for current GT desktop slice | trusted IPC bridge and deterministic desktop tests |
| Source registry/capability/readiness foundation | COMPLETE as generic foundation; PARTIAL for multi-source composition | generic registry exists; only Google Trends is composed/registered |
| Run/job/attempt persistence | COMPLETE for current GT-shaped contract | SQLite schema v4, state repository, state machines, release gate |
| Sequential orchestration | COMPLETE for current collecting-source contract | fake-source and GT batch Core tests |
| Resume/reconciliation/job retry | COMPLETE for current GT jobs | deterministic persistence and desktop controller tests |
| Artifact lifecycle/storage/checksum | COMPLETE for current supported artifacts | run-scoped `StorageManager`, artifact/validation records, integrity tests |
| Metadata/provenance | COMPLETE for Google Trends; PARTIAL for multi-source | current metadata contract requires GT query/search fields |
| Validation coordination | COMPLETE as current Core/source boundary | structured summaries/findings and accepted/rejected transitions |
| Logging/redaction | COMPLETE for current Core | deterministic structured-log gate |
| Browser lifecycle | COMPLETE for current GT source | app-owned persistent profile and managed page tests |
| Structured export | COMPLETE for current GT source | GT-specific CSV/XLSX export and export tests |
| Desktop coordination | COMPLETE for current GT workflow; PARTIAL for R1 multi-source | UI/controller/export are Google-Trends-specific |
| Credential/access lifecycle | PARTIAL | app-owned browser session exists; secure OAuth/API-key Core lifecycle is not implemented |
| Freshness/due lifecycle | NOT IMPLEMENTED | no current freshness contract, persistence, scheduler, or UI state |
| Generic non-query-group job model | NOT IMPLEMENTED | current `JobRecord`/SQLite job requires `query_group_id`; collection context is GT-shaped |

Current persisted contract facts:

```text
SQLite schema version: 4
tables: schema_migrations, runs, jobs, attempts, artifacts, validations
errors table: not implemented
credential/freshness tables: not implemented
```

Current run statuses:

```text
PENDING
RUNNING
MANUAL_ACTION_REQUIRED
COMPLETED
COMPLETED_WITH_WARNINGS
FAILED
CANCELLED
```

Current execution statuses:

```text
PENDING
RUNNING
VALIDATING
COMPLETED
FAILED
CANCELLED
MANUAL_ACTION_REQUIRED
RETRY_PENDING
```

Current validation statuses:

```text
NOT_RUN
VALID
LOW_DATA
NO_DATA
INVALID_SCHEMA
ERROR_NOT_DATA
DATE_MISMATCH
QUERY_MISMATCH
```

No persisted ID, enum, schema, class, interface, or IPC contract was renamed during this documentation task.

## 5. Google Trends implementation state

The current implemented path is:

```text
external query configuration
→ desktop group and period selection
→ Google Trends source/runtime
→ Playwright application-owned profile
→ provider CSV byte capture
→ CollectionOrchestrator
→ run/job/attempt and artifact state in SQLite
→ run-scoped raw storage
→ parser and source validator
→ accepted/warned/rejected artifact state
→ metadata/validation/log evidence
→ run-scoped CSV/XLSX export
```

The provider waterfall, Core persistence, validation, and GT01/GT02 sequential collection have historical live PASS evidence from the completed Google Trends MVP checkpoints. Exact live numeric values were never used as assertions.

Current external configuration at HEAD contains five real groups:

```text
GT01
GT02
GT03
GT04
GT05
```

The committed period-preset work added 1W, 1M, 6M, 12M, 24M, and 36M. The current uncommitted WIP removes 36M consistently, leaving:

```text
1W
1M
6M
12M
24M
```

Deterministic fixtures currently prove daily parsing/coverage for 1W and weekly behavior for 12M/current long-range validation cases. The current gate proves period request normalization and UI propagation. A live provider collection was not run during this documentation checkpoint, and no claim is made that GT03–GT05 or every period preset has fresh live acceptance evidence on this HEAD/WIP.

## 6. Storage state

Canonical application state is rooted at:

```text
~/Library/Application Support/RoofRoom Data Collector/app-data/
```

Implemented application-owned areas include:

```text
config/
database/
data/runs/
logs/
browser-profiles/
```

Current GT provider bytes are captured directly into the Core artifact flow and persisted under run-scoped application storage. Deterministic tests assert that no pre-Core Downloads copy is used.

The application defines a user-visible Downloads root as a reserved downstream export destination but does not create or treat it as application-owned runtime state in the current directory bootstrap. Downloads must not become the canonical datastore. No existing Downloads, raw evidence, credentials, or application-state files were inspected, moved, deleted, or rewritten in this documentation task.

## 7. Test and build status

Commands run during this checkpoint:

```text
git diff --check
npm run test:release:gate
npm run test:release:gate   # repeated outside the restricted sandbox after a local-bind EPERM
```

Observed results:

1. The first `git diff --check` found trailing Markdown whitespace in the newly edited documents. Those documentation issues were corrected. Final verification is recorded below after this handoff rewrite.
2. The first deterministic release-gate run passed TypeScript, lint, Core, configuration, desktop-controller, Google Trends, validation, and export suites, then stopped at the local desktop UI test with:

```text
Error: listen EPERM: operation not permitted 127.0.0.1
```

This was a restricted-sandbox local socket permission failure, not a provider request or application assertion failure.
3. The complete gate was rerun with local execution permission and passed through:

```text
PASS DESKTOP-UI-001
PASS DESKTOP-UI-002
PASS RELEASE-GATE-001
```

The passing gate included the current uncommitted 36M-removal WIP and documentation changes. It made no live provider request.

Not run during this checkpoint:

```text
npm run package
npm run make
any live Google Trends request
any GSC/Google Ads/Keyword Planner/SerpApi/provider request
```

## 8. Known issues supported by live evidence

1. The 36M cleanup is valid-looking and deterministically passing but remains uncommitted WIP on the feature branch.
2. Documentation changes currently share the working tree with that unrelated application/test WIP and must be staged/committed separately.
3. `CODEX_HANDOFF_CURRENT.md` and `PROJECT_HANDOFF.pre-20260820.md` are useful but untracked historical snapshots; their intended repository disposition is not yet approved.
4. Core job/request/metadata contracts are still shaped around Google Trends query groups and cannot represent every new source honestly without compatible evolution.
5. Secure OAuth/API-key lifecycle for API sources is not implemented.
6. Freshness/due/on-demand lifecycle is not implemented.
7. Desktop source dashboard, import workflows, API source setup, and multi-source export are not implemented.
8. Only Google Trends is registered/composed as a production source.
9. No current-source implementation exists for GSC, Ads Search Terms, Keyword Planner, İkas, Bitkimark XML, or SERP despite their feasibility PASS.
10. Fresh live acceptance for the current five-group configuration and period-preset branch is not established by this documentation session.

## 9. Open decisions that block next work

No provider feasibility decision blocks implementation of the approved sources.

The immediate repository blocker is procedural: the documentation checkpoint and pre-existing 36M WIP must remain separate commits/reviews.

Before the first non-GT source slice, one compatible contract decision is required: how Core represents jobs and provenance that do not have a Google Trends `query_group_id`, without renaming existing statuses or corrupting schema-v4 data.

Before the first official/third-party API source, the secure desktop credential lifecycle and safe readiness contract must be designed against the current Electron boundary. Exact class/table/enum names are not yet locked.

The order of source implementation is not itself a technical blocker. The recommended order should minimize Core change while producing an auditable vertical slice.

## 10. Completed areas that remain closed

Unless new failing evidence appears, do not reopen or rewrite:

- local-first one-app/multi-module direction;
- Collector versus analysis separation;
- current run/job/attempt status values;
- raw-evidence immutability and missing-not-zero rules;
- execution versus validation separation;
- Google Trends relative-interest and comparison-group semantics;
- Playwright application-owned profile and provider-safety policy;
- current GT selector/wait/retry/refresh/navigation behavior;
- SQLite schema-v4 implementation merely to match conceptual document names;
- working Google Trends/Core architecture as a prerequisite to documentation alignment.

## 11. Exact next action

After this documentation checkpoint is reviewed:

1. stage and commit only the nine reconciled documentation/instruction files, leaving all pre-existing source/test WIP and untracked historical files untouched;
2. review and checkpoint the existing 36M-removal WIP separately using its targeted period test plus the deterministic release gate;
3. begin the first multi-source implementation slice by designing and testing a source-neutral job/provenance compatibility contract for work that has no `query_group_id`, including an explicit SQLite migration/compatibility plan if the stored schema must change;
4. do not implement a provider adapter until that contract slice is approved and passing.

The recommended first provider vertical slice after that foundation is the İkas Products `FILE_IMPORT` path: preserve one original XLSX as run-scoped raw evidence, parse one sanitized real-shape fixture, keep blank stock `NULL`, validate it, and persist provenance through the existing Core. This avoids introducing OAuth and quota behavior before the generic non-query-group lifecycle is proven.

No part of this next action was implemented during the documentation reconciliation.

## 12. Epistemic checkpoint

### KANITLANMIŞ GERÇEK

- Branch, HEAD, Git status, diffs, source tree, contracts, database schema, package scripts, and current tests were inspected directly.
- Only Google Trends has a production source implementation and composition.
- The full deterministic release gate passed in the permitted local environment.
- No live provider request was made.
- The listed feasibility results are locked external/provider evidence supplied by the approved project reconciliation context; they are not claims of repository implementation.

### ÇIKARIM

- A source-neutral non-query-group contract is the smallest safe Core-enabling slice before adding file/API/XML sources.
- İkas Products is the lowest-risk first provider slice after that foundation because it can prove multi-source integration without first adding OAuth or spending external quota.

### HENÜZ TEST EDİLMEMİŞ HİPOTEZ

- The exact schema/interface shape for generic jobs, credential state, and freshness can be selected without disrupting existing schema-v4 GT data.
- The current five GT groups and every supported period preset work live against the provider on this branch/WIP.
- The proposed İkas-first sequence will require fewer Core changes than an API-first source after detailed implementation design.

## 13. Handoff discipline

`PROJECT_HANDOFF.md` is the living repository-state document. Update it only from Git, code, stored evidence, and tests that actually ran. Keep feasibility, implementation, deterministic verification, and live-provider acceptance as separate claims.

Do not let this handoff authorize live provider calls, source implementation, WIP cleanup, file deletion, credential changes, or commits without the next explicit approved stage.
