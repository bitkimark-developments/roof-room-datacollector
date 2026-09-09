# RoofRoom Data Collector — Project Handoff

**Checkpoint date:** 2026-09-09

**Current milestone:** Release 1.0 multi-source foundation and source-adapter rollout

**Current stage:** Source-neutral Core job lifecycle checkpoint complete; Multi-Source Run contract awaits its separate approved slice

**Current goal:** Preserve the committed schema-v5/source-neutral Core baseline, then design and test one truthful persisted Run containing jobs from multiple source modules

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

Technical HEAD recorded before this separate handoff documentation commit:

```text
9eb4595c03dab4d37081b8fa7451053a19a93e76
9eb4595 feat: add source-neutral core job lifecycle
```

Branch relationship observed during this checkpoint:

```text
main: 11b897b1c3ba9b44ec7535a3a877a53fc900ae9e
feature branch before the pending handoff commit: 10 commits ahead of main, 0 behind
```

Latest committed technical checkpoint:

```text
9eb4595 feat: add source-neutral core job lifecycle
```

## 2. Working tree state

The source-neutral Core implementation, migration, compatibility changes, deterministic tests, and required stable-contract documentation were committed together as `9eb4595`.

Before this handoff edit, the fresh host repository audit showed no tracked changes and only these pre-existing untracked files:

```text
?? CODEX_HANDOFF_CURRENT.md
?? PROJECT_HANDOFF.pre-20260820.md
```

`CODEX_HANDOFF_CURRENT.md` is an earlier technical audit generated on 2026-08-19 and describes an older repository snapshot. It remains useful historical evidence but is not the canonical current-state document.

`PROJECT_HANDOFF.pre-20260820.md` is an untracked historical handoff snapshot. Neither historical file was moved, deleted, staged, or rewritten during this checkpoint.

Closed checkpoints:

```text
826a45c docs: reconcile multi-source release scope
ac1088e fix: remove unsupported Google Trends 36M preset
5727e4b docs: close Google Trends 36M cleanup checkpoint
9eb4595 feat: add source-neutral core job lifecycle
```

Only this live-state handoff update is pending as a separate documentation change.

## 3. Product and Release 1.0 boundary

RoofRoom Data Collector remains a local-first modular desktop collector:

```text
Collect → Preserve → Validate → Document → Export
```

It does not generate SEO, content, page-type, advertising, merchandising, SERP-intent, or commercial decisions. Those belong to a separate downstream analysis layer.

Release 1.0 is the verified multi-source scope. The following acquisition paths passed feasibility and are approved for implementation:

| Source | Approved acquisition | Feasibility | Implementation |
|---|---|---:|---:|
| Google Trends Interest Over Time | Playwright + provider CSV export | FINAL PASS | implemented reference source |
| Google Search Console | official Search Analytics API | FINAL PASS | NOT IMPLEMENTED |
| Google Ads Search Terms | official Ads API, verified `search_term_view`/SEARCH | FINAL PASS | NOT IMPLEMENTED |
| Keyword Planner historical metrics | official Ads API | FINAL PASS | NOT IMPLEMENTED |
| Keyword Planner fallback | manual UTF-16 tab-separated CSV import | FINAL PASS | NOT IMPLEMENTED |
| İkas Products | manual XLSX import | FINAL PASS | NOT IMPLEMENTED |
| Bitkimark public site | standard HTTP + sitemap/XML | FINAL PASS | NOT IMPLEMENTED |
| SERP | on-demand SerpApi | FINAL PASS | NOT IMPLEMENTED |

Semrush is not active Release 1.0 scope. Merchant Center, GA4, and other providers are extensibility examples only.

## 4. Actual Core implementation state

Status labels below describe live committed code, not intended architecture.

| Area | State | Evidence |
|---|---|---|
| Electron main/preload/React renderer boundary | COMPLETE for current GT desktop slice | trusted IPC bridge and deterministic desktop tests |
| Source registry/capability/readiness foundation | COMPLETE as generic foundation; PARTIAL for production composition | generic registry exists; only Google Trends is composed/registered in production |
| Run/job/attempt persistence | COMPLETE for single-source GT and source-neutral jobs | SQLite schema v5, generic job plans, state repository, state machines, deterministic gate |
| Sequential orchestration | COMPLETE for the current collecting-source contract | deterministic source-neutral fake JSON lifecycle and GT batch Core tests |
| Resume/reconciliation/job retry | COMPLETE for current single-source jobs | accepted jobs survive restart; failed work receives a new attempt without recollecting accepted siblings |
| Artifact lifecycle/storage/checksum | COMPLETE for current supported artifacts | run-scoped `StorageManager`, immutable candidate evidence, artifact/validation records, integrity tests |
| Metadata/provenance | COMPLETE for GT schema v1 and source-neutral schema v2 | GT output stays backward compatible; non-GT metadata records real source/job/attempt/context evidence |
| Validation coordination | COMPLETE as current Core/source boundary | Core carries source context without requiring a universal QueryGroup |
| Logging/redaction | COMPLETE for current Core | deterministic structured-log gate |
| Browser lifecycle | COMPLETE for current GT source | app-owned persistent profile and managed-page tests |
| Structured export | COMPLETE for current GT source | GT-specific CSV/XLSX export and export tests |
| Desktop coordination | COMPLETE for current GT workflow; PARTIAL for R1 multi-source | UI/controller/export remain intentionally Google-Trends-specific |
| Generic non-query-group job model | COMPLETE for the current single-source-run contract | nullable `query_group_id`, generic `job_key`, persisted JSON-compatible `source_context` |
| Multi-Source Run contract | NOT IMPLEMENTED | generic run creation still rejects job plans containing more than one `source_id` |
| Credential/access lifecycle | PARTIAL | app-owned browser session exists; secure OAuth/API-key Core lifecycle is not implemented |
| Freshness/due lifecycle | NOT IMPLEMENTED | no current freshness contract, persistence, scheduler, or UI state |

Current persisted contract facts:

```text
SQLite schema version: 5
tables: schema_migrations, runs, jobs, attempts, artifacts, validations
jobs.query_group_id: nullable; Google-Trends/legacy-specific
jobs.source_context_json: required JSON object
generic job identity: source_id + job_key within a run
errors table: not implemented
credential/freshness tables: not implemented
```

Schema-v4 Google Trends data migrates to schema v5 without changing existing IDs, relationships, or `query_group_id` values. Migration reconstructs each GT job's real query-group source context from its persisted run snapshot and fails closed if that context cannot be reconstructed.

The current generic run-creation API accepts multiple jobs for exactly one `source_id`. Mixed-source job plans remain deliberately rejected pending the next isolated Core contract slice.

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

The source-neutral slice did not rename persisted IDs, status values, or existing GT metadata fields.

## 5. Source-neutral compatibility checkpoint

The committed generic path now supports:

```text
generic JSON-compatible run snapshot
→ one or more same-source JobPlans
→ persisted job_key + nullable query_group_id + source_context
→ source collection without a universal QueryGroup
→ run-scoped raw application/json candidate evidence
→ source validation and accepted/rejected artifact lifecycle
→ source-neutral metadata schema v2
→ restart/reconciliation
→ explicit failed-job retry with immutable attempt history
```

The deterministic fake JSON source proves a real non-GT job with `query_group_id = NULL`; it is test-only and is not a placeholder production provider.

Creation fails closed for duplicate `source_id + job_key` identity, unsafe document keys, malformed JSON-compatible context, unreadable configuration snapshots, and mixed source IDs under the current single-source-run restriction.

Google Trends adapts generic Core context at its source boundary. It reconstructs and validates real QueryGroup semantics from persisted source context, requires `job_key === query_group_id`, and fails closed on invalid or missing GT context rather than fabricating provider data.

## 6. Storage and provenance state

Canonical application state remains rooted at:

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

Raw evidence remains run-scoped and immutable whenever practical. Source-neutral metadata schema v2 retains `run_id`, `job_id`, `attempt_id`, attempt number, `source_id`, `job_key`, `source_context`, raw artifact linkage, validation result, retrieval time, and application version.

Google Trends metadata remains schema v1 and preserves its existing query-group, country, category, search-type, selection-type, requested-date, actual-date, and raw-artifact fields.

Downloads remains outside canonical runtime storage. No Downloads content, credentials, cookies, sessions, or application-state files were inspected, moved, deleted, or rewritten during this checkpoint.

## 7. Test and build status

Authoritative post-commit host-terminal verification supplied for technical HEAD `9eb4595`:

```text
npm run test:release:gate
PASS RELEASE-GATE-001
```

The committed release-gate composition executes:

```text
npx tsc --noEmit
npm run lint
deterministic M2/Core gate
schema-v4 → v5 migration preservation
source-neutral persistence/reopen
source-neutral fake JSON lifecycle/restart/retry
configuration adapters
Google Trends desktop controller and period selection
Google Trends deterministic source/validation/Core/batch suites
Google Trends export regression
desktop UI smoke
```

The host-terminal result closes the earlier sandbox-only localhost limitation and establishes a full deterministic gate PASS for the committed source-neutral checkpoint.

No live provider request was made for this slice. No claim is made about fresh live acceptance for GT03–GT05, every supported GT period, or any unimplemented Release 1.0 source.

Not run or claimed for this checkpoint:

```text
npm run package
npm run make
any live Google Trends request
any GSC/Google Ads/Keyword Planner/SerpApi/provider request
```

## 8. Known issues supported by live evidence

1. `CODEX_HANDOFF_CURRENT.md` and `PROJECT_HANDOFF.pre-20260820.md` remain untracked historical snapshots; their repository disposition is not approved.
2. One persisted Run cannot yet contain jobs from multiple `source_id` values; `createRunFromJobPlans` rejects that shape explicitly.
3. Run aggregation, source dispatch, failure independence, retry, provenance, and restart have not yet been proven across multiple source modules inside one Run.
4. Secure OAuth/API-key lifecycle for API sources is not implemented.
5. Freshness/due/on-demand lifecycle is not implemented.
6. Workspace, presets, multi-source desktop setup/progress, and multi-source package export are not implemented.
7. Only Google Trends is registered/composed as a production source.
8. No source implementation exists for GSC, Ads Search Terms, Keyword Planner, İkas, Bitkimark XML, or SERP despite their feasibility PASS.
9. Fresh live acceptance for the current five GT groups and every supported period preset is not established by this checkpoint.

## 9. Open decisions that bound next work

The next architectural question is how one immutable generic Run snapshot truthfully represents one collection operation containing jobs from multiple source modules while preserving old GT snapshots and current single-source generic snapshots.

Repository evidence must identify every remaining `one run = one source` assumption. The explicit repository restriction is not proof that it is the only blocker; source dispatch, validator selection, aggregation, retry/reconciliation, provenance, export, and desktop boundaries require read-only audit before implementation.

Jobs already persist their own `source_id`, `job_key`, and `source_context`, so schema v6 must not be introduced unless deterministic repository evidence proves a physical schema change is required.

Credential lifecycle, request timeouts, Workspace ownership, presets, UI, and multi-source export remain later independent slices.

## 10. Completed areas that remain closed

Unless new failing evidence appears, do not reopen or rewrite:

- local-first one-application/multiple-module direction;
- Collector versus analysis separation;
- current run/job/attempt status values;
- schema-v4 → v5 source-neutral compatibility migration;
- generic `job_key`, nullable GT-specific `query_group_id`, and persisted `source_context` direction;
- raw-evidence immutability and missing-not-zero rules;
- execution status versus validation status separation;
- source-neutral metadata schema v2 and backward-compatible GT metadata schema v1;
- Google Trends QueryGroup adaptation at the GT source boundary;
- Google Trends relative-interest and comparison-group semantics;
- Playwright application-owned profile and provider-safety policy;
- current GT selector/wait/retry/refresh/navigation behavior;
- current GT desktop/export behavior as a prerequisite to the next Core slice.

## 11. Exact next action

After this handoff checkpoint is reviewed, begin the separately approved **Multi-Source Run Contract TDD vertical slice**.

Start read-only. Audit every remaining assumption that one Run has one source, including run snapshots, selected-source representation, source dispatch, validator selection, status aggregation, retry/reconciliation, provenance, GT adapters, export, and desktop compatibility.

Then use deterministic fake sources to prove:

```text
one persisted Run
→ jobs from at least two source_id values
→ per-job source dispatch and context
→ independent sibling success/failure
→ retry only failed eligible jobs with a new immutable attempt
→ restart/reconciliation without recollecting completed work
→ truthful provenance for every source/job/attempt
```

Do not implement a real provider adapter, Workspace, presets, desktop generalization, timeout policy, credential storage, or multi-source export in that slice. Do not create a schema migration unless the audit proves one is required. Do not make a live or quota-bearing provider call.

## 12. Epistemic checkpoint

### PROVEN FACT

- A fresh repository audit found branch `feat/google-trends-period-presets` at technical HEAD `9eb4595c03dab4d37081b8fa7451053a19a93e76` with no tracked WIP before this handoff edit.
- Commit `9eb4595` contains the schema-v5 migration, source-neutral contracts, GT compatibility adapters, and deterministic migration/persistence/fake-source tests described above.
- SQLite schema version 5 permits `query_group_id = NULL` and requires JSON-compatible job source context.
- The current generic creation contract still rejects mixed `source_id` values within one Run.
- The authoritative user-supplied host-terminal result for committed HEAD `9eb4595` is `PASS RELEASE-GATE-001`.
- Only the two named historical files were untracked before this handoff edit, and both remain untouched.
- No live provider request was made for the source-neutral slice.

### INFERENCE

- The Multi-Source Run contract is the smallest next Core slice required by the approved one-collection-operation/one-Run product journey.
- Because jobs already persist their own source identity and context, the next slice may require only contract/orchestration evolution rather than schema v6; this must be proven by audit and tests.

### UNTESTED HYPOTHESIS

- Removing the repository's single-source restriction is sufficient after all downstream dispatch, validator, aggregation, retry, reconciliation, and provenance assumptions are audited.
- The current generic snapshot shape can represent multi-source resolved configuration without a compatible type/schema evolution.
- The current five GT groups and every supported period preset work live against the provider on this branch.

## 13. Handoff discipline

`PROJECT_HANDOFF.md` is the living repository-state document. Update it only from Git, code, stored evidence, tests actually run, and explicitly attributed host evidence. Keep feasibility, implementation, deterministic verification, full release-gate verification, live-provider acceptance, and committed state as separate claims.

This handoff authorizes no live provider calls, provider adapter implementation, Workspace/Preset/UI work, credential changes, file deletion, or Multi-Source Run implementation without the next explicit approved stage.
