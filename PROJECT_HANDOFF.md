# RoofRoom Data Collector — Project Handoff

**Checkpoint date:** 2026-09-10

**Current milestone:** Release 1.0 multi-source foundation and source-adapter rollout

**Current stage:** Multi-Source Run Core contract implemented, deterministically verified, and technically committed

**Current goal:** Preserve the verified multi-source Core checkpoint; choose and approve the next bounded application-foundation slice before further implementation

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
be081b6e56f52e8bb2cebdee839d4d9c1c5625f8
be081b6 feat: support multi-source jobs within one run
```

Observed branch relationship before this handoff commit:

```text
main: 0 commits ahead of feature branch
feature branch: 12 commits ahead of main
```

The technical checkpoint contains the plan/design, implementation, deterministic tests, gate wiring, and stable contract documentation. This handoff edit is intentionally separate.

## 2. Working tree and protected historical files

Immediately after technical commit `be081b6`, the tracked working tree was clean and only these pre-existing historical files remained untracked:

```text
?? CODEX_HANDOFF_CURRENT.md
?? PROJECT_HANDOFF.pre-20260820.md
```

Neither file was read as current authority, moved, deleted, staged, or rewritten during this slice.

Relevant closed checkpoints:

```text
9eb4595 feat: add source-neutral core job lifecycle
4384912 docs: close source-neutral core checkpoint
be081b6 feat: support multi-source jobs within one run
```

## 3. Product and Release 1.0 boundary

RoofRoom Data Collector remains a local-first modular desktop collector:

```text
Collect → Preserve → Validate → Document → Export
```

One user collection operation can now be represented truthfully in Core as one persisted Run containing independently source-keyed Jobs. This is package-level coordination of source-native datasets, not cross-source analysis or row-level joining.

Google Trends remains the only implemented production source. GSC, Google Ads Search Terms, Keyword Planner, İkas, Bitkimark XML, and SERP have approved feasibility paths but no source implementation. Semrush is not active Release 1.0 scope.

Workspace, Connection Profile, credentials, Saved Presets, Last Run Settings, Run Setup/Review/Result UI, source-specific timeout policy, freshness, multi-source export, package retention, and additional provider adapters remain outside this checkpoint.

## 4. Implemented Core contract

Status labels describe committed code at `be081b6`, not intended future architecture.

| Area | State | Evidence |
|---|---|---|
| Schema-v5 Run/Job/Attempt persistence | COMPLETE for mixed-source Core Runs | one Run persists Jobs from two source IDs and reopens without migration |
| Selected-source membership | COMPLETE | ordered unique membership is derived from real Job plans |
| Job identity | COMPLETE | identity remains `run_id + source_id + job_key`; the same key is valid across distinct sources |
| Collection dispatch | COMPLETE | `SourceRegistry` resolves from each persisted Job's `source_id` |
| Validation dispatch | COMPLETE | source-keyed `CollectionValidatorRegistry` resolves from each persisted Job's `source_id` |
| Validator composition failures | COMPLETE | invalid/duplicate registrations and unknown lookups fail closed with typed codes |
| Independent execution/failure | COMPLETE for sequential Core orchestration | a rejected middle Job does not prevent a later sibling Job from completing |
| Retry/reconciliation | COMPLETE for explicit eligible Job retry | only the failed Job receives attempt 2; accepted siblings are not recollected |
| Restart safety | COMPLETE for the deterministic mixed-source lifecycle | selected sources, contexts, attempts, artifacts, findings, and resume actions survive reopen |
| Storage and provenance | COMPLETE for the tested source-neutral contract | evidence remains run/source/job/attempt-correct and rejected attempt-1 evidence is immutable |
| Source-neutral metadata | COMPLETE for generic metadata schema v2 | non-GT Jobs require no fabricated QueryGroup |
| Google Trends compatibility | COMPLETE for existing behavior | GT production runner registers its existing validator; Core/batch/desktop/export regressions pass |
| Multi-source production application composition | NOT IMPLEMENTED | production runner, desktop controller/UI, and exporter remain GT-specific |
| Multi-source package export | NOT IMPLEMENTED | current structured exporter remains Google-Trends-specific |
| Credential/access lifecycle | PARTIAL | app-owned GT browser session exists; OAuth/API-key Core lifecycle is not implemented |
| Freshness/due lifecycle | NOT IMPLEMENTED | no freshness persistence, scheduler, or UI state exists |

Current persisted contract facts:

```text
SQLite schema version: 5 (unchanged)
tables: schema_migrations, runs, jobs, attempts, artifacts, validations
runs.selected_sources_json: ordered non-empty source membership array
jobs.query_group_id: nullable; Google-Trends/legacy-specific
jobs.source_context_json: required JSON object
job uniqueness: run_id + source_id + job_key
errors table: not implemented
credential/freshness tables: not implemented
```

## 5. Snapshot and migration compatibility decision

No schema v6 migration was added. Existing schema v5 already carries selected-source membership, per-Job source identity/context, composite Job uniqueness, source-scoped artifact relationships, and immutable attempts/validations.

Snapshot compatibility is deliberately additive:

```text
legacy Google Trends snapshot
→ unchanged and still parsed through its existing GT contract

legacy generic single-source snapshot
→ unchanged and still read as an opaque JSON object

new generic multi-source snapshot
→ real `sources` array
→ no copied first-source root `source_id`
→ no fabricated `multi-source` provider identity
```

`runs.selected_sources_json` remains the canonical Run membership field. The generic configuration snapshot preserves the resolved request evidence supplied by its caller; this slice does not introduce a universal snapshot schema or rewrite old records.

Schema-v4 Google Trends lifecycle data still migrates to schema v5 with IDs, relationships, and query-group context preserved. `PASS DB-MIGRATION-005` was observed after this change.

## 6. Deterministic multi-source lifecycle proven

The new vertical slice uses two independent fake sources and validators in one real schema-v5 repository/storage lifecycle:

```text
fake-source-a / alpha / attempt 1 → VALID
fake-source-b / gamma / attempt 1 → INVALID_SCHEMA
fake-source-a / beta  / attempt 1 → VALID
restart
fake-source-b / gamma / attempt 2 → VALID
```

Proven behavior:

- selected sources persist as `fake-source-a`, then `fake-source-b`;
- each Job retains its own `source_id`, `job_key`, and `source_context`;
- collector and validator event order follows the persisted Jobs;
- gamma attempt 1 does not stop beta;
- alpha and beta remain accepted with one attempt and one source call;
- only gamma becomes `RETRY_CANDIDATE` and receives attempt 2;
- gamma's rejected artifact, failed attempt, validation status, and literal finding remain readable after retry;
- attempt-2 evidence is distinct and accepted;
- metadata documents retain correct Run, Job, Attempt, source, mode, context, and raw-artifact links;
- validation documents retain correct Run, Job, artifact, validation status, and findings;
- the final Run reaches `COMPLETED` after explicit retry.

## 7. Verification status

RED-first evidence was observed before implementation:

```text
source-neutral persistence RED:
job_plans must contain jobs from exactly one source_id in this release.

validator registry RED:
collection-validator-registry.ts not found

multi-source orchestration RED:
TypeError: this.validator.validate is not a function
```

Focused deterministic verification on the completed technical tree:

```text
PASS DB-011
PASS VALIDATOR-REGISTRY-001
PASS MULTI-SOURCE-RUN-001
PASS SOURCE-NEUTRAL-001
PASS DB-MIGRATION-005
PASS orchestration/source-gate/pipeline/retry/resume suites
PASS reconciliation suite
PASS GT Core suite
PASS GT-BATCH-CORE-001..005
PASS DESKTOP-CTRL-001..004
PASS EXPORT-001..006
PASS M2-GATE-001..008 and added source-neutral/multi-source checks
npx tsc --noEmit: exit 0
npm run lint: exit 0
git diff --check: exit 0
```

Full deterministic release gate:

```text
npm run test:release:gate
PASS RELEASE-GATE-001
```

The first sandboxed release-gate attempt reached a deterministic localhost-server test and failed with `listen EPERM 127.0.0.1`. The identical gate was rerun with loopback binding permission; it exited 0 and emitted the final release-gate PASS line. This was an execution-environment permission issue, not a test assertion failure.

No live-provider command ran. No provider quota was consumed. `LIVE PROVIDER VERIFIED` is therefore not claimed for this slice.

Not run or claimed:

```text
npm run package
npm run make
any m3:live-* command
any GSC/Google Ads/Keyword Planner/SerpApi/provider request
```

## 8. Remaining single-source/source-specific assumptions

No known Core persistence or `CollectionOrchestrator` restriction still requires one Run to contain only one source. The remaining limitations are application/source boundaries intentionally excluded from this slice:

1. Google Trends production run creation builds GT query-group Jobs and a singular GT snapshot.
2. Google Trends source-context reconstruction and validation require GT requested configuration and QueryGroup semantics; they do not consume the new generic `sources` snapshot.
3. Google Trends metadata schema v1 remains query-group-specific; generic non-query-group Jobs use metadata schema v2.
4. The production source composition registers only Google Trends and its validator.
5. The desktop controller/factory and typed UI bridge remain Google-Trends/query-group-specific.
6. The current exporter requires a Google Trends snapshot and treats exportable Jobs as GT datasets.
7. The GT resume wrapper remains a GT-specific compatibility API even though Core retry/reconciliation is Job-scoped.
8. Readiness has not been generalized into the approved future all-included-sources final readiness gate.
9. No multi-source package/result/export policy exists yet.
10. Existing single-source APIs and snapshots remain intentionally supported compatibility surfaces, not Core restrictions.

## 9. Completed areas that remain closed

Unless new failing evidence appears, do not reopen or rewrite:

- schema v5 or persisted status values;
- generic `job_key`, nullable GT-specific `query_group_id`, and persisted `source_context`;
- source-keyed collection/validator dispatch;
- explicit Job-scoped retry and immutable attempt evidence;
- raw-evidence immutability and missing-not-zero behavior;
- execution status versus validation status separation;
- source-neutral metadata schema v2 and backward-compatible GT metadata schema v1;
- Google Trends QueryGroup adaptation at the GT source boundary;
- Google Trends relative-interest and comparison-group semantics;
- application-owned Playwright profile and provider-safety policy;
- current GT selector/wait/retry/refresh/navigation behavior;
- current GT desktop/export/runtime behavior until a separate slice explicitly generalizes it.

## 10. Exact recommended next action

No next implementation slice is approved by this checkpoint.

First review commits `be081b6` and this handoff checkpoint. Then open a separate read-only design/audit task for the next application-foundation boundary: determine how Workspace identity and one active Run ownership should compose with the now-verified multi-source Run contract, without implementing Workspace, presets, credentials, frontend screens, provider adapters, timeouts, or export behavior during the audit.

Require an explicit scope approval and a new RED-first vertical-slice plan before editing code. Do not start additional provider or frontend work from this handoff alone.

## 11. Epistemic checkpoint

### PROVEN FACT

- Technical commit `be081b6` implements one schema-v5 Run with Jobs from multiple source IDs.
- Collection and validator lookup both use the persisted Job's source identity.
- Schema v5 and legacy snapshots remain compatible; no migration was added.
- The two-source deterministic lifecycle proves middle-Job failure independence, failed-only retry, restart, immutable rejected evidence, and source-correct provenance.
- Focused tests, TypeScript, lint, diff check, M2 gate, GT regressions, desktop/export regressions, and the full deterministic release gate passed.
- The final release-gate line `PASS RELEASE-GATE-001` was observed after allowing its deterministic loopback test server.
- No live-provider command ran.
- The two historical untracked files remain untouched.

### INFERENCE

- Workspace identity/Run ownership is the smallest likely next application-foundation question because the approved journey scopes settings, history, credentials, and one active Run to a Workspace. This is a recommendation, not an approved implementation task.

### UNTESTED HYPOTHESIS

- The current multi-source Core contract will require no further change when a future source-neutral desktop composition creates real mixed-source Runs.
- A future Workspace contract can be added without changing existing Run identity or schema-v5 lifecycle semantics.
- Unimplemented sources and the current supported Google Trends configurations work against live providers; no such live acceptance was performed here.

## 12. Handoff discipline

Keep implementation, targeted deterministic verification, full release-gate verification, live-provider verification, and committed state as separate claims. This handoff authorizes no live calls, provider adapter, Workspace/Preset/UI, timeout, credential, freshness, or multi-source export implementation.
