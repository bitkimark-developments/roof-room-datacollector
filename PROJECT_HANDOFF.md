# RoofRoom Data Collector — Project Handoff

**Checkpoint date:** 2026-09-14

**Current milestone:** M5 — Desktop UX / Release 1.0 source-neutral operations workflow

**Current stage:** Source-neutral operations shell, Task Detail, native İkas XLSX input, run-specific readiness, and mandatory Quick Run Review implemented and committed

**Current goal:** Continue the approved UI redesign with explicit Review → Start Run → persisted Run Detail / Progress

---

## 1. Live repository state

Authoritative repository:

```text
/Users/furkan/Projects/roofroom-data-collector
```

Current branch:

```text
main
```

Technical HEAD recorded before this separate handoff documentation commit:

```text
26278fe09a1a609264e17c42165c94b16834cf4f
26278fe feat: add workspace run ownership
```

The technical checkpoint contains the approved plan, implementation, deterministic tests, gate wiring, and stable contract documentation. This handoff edit is intentionally separate.

## 2. Working tree and protected historical files

Immediately after technical commit `26278fe`, the tracked working tree was clean and only these pre-existing historical files remained untracked:

```text
?? CODEX_HANDOFF_CURRENT.md
?? PROJECT_HANDOFF.pre-20260820.md
```

Neither file was moved, deleted, staged, or rewritten during this slice.

Relevant closed checkpoints:

```text
9eb4595 feat: add source-neutral core job lifecycle
4384912 docs: close source-neutral core checkpoint
be081b6 feat: support multi-source jobs within one run
5a8edf0 docs: close multi-source run checkpoint
26278fe feat: add workspace run ownership
```

## 3. Product and scope boundary

RoofRoom Data Collector remains a local-first modular desktop collector:

```text
Collect → Preserve → Validate → Document → Export
```

Workspace is now a first-class Core identity for brand/business isolation. Every Run belongs to exactly one Workspace, while one Run may still contain independently source-keyed Jobs from multiple sources.

This checkpoint does not add Workspace UI or lifecycle screens, Presets, Last Run Settings, credential management, provider changes, multi-source application composition, generalized export, source-specific timeout work, or a new Cancel/Stop/Resume workflow.

Google Trends remains the reference browser source. GSC, Google Ads Search Terms, Keyword Planner, İkas, Bitkimark XML, and SERP retain approved feasibility paths; the İkas Products parser/validator now accepts and locks the verified production XLSX mapping. Semrush is not active Release 1.0 scope.

## 4. Implemented Workspace and Run contract

Status labels describe committed code at `26278fe`, not intended future architecture.

| Area | State | Verified contract |
|---|---|---|
| SQLite schema | COMPLETE | schema version 6 |
| Workspace identity | COMPLETE for Core persistence | `workspace_id`, non-empty `workspace_name`, and `created_at` |
| Run ownership | COMPLETE | every new and migrated Run has required `runs.workspace_id` with restricted Workspace FK |
| One-active-Run rule | COMPLETE | database partial unique index covers exactly `PENDING`, `RUNNING`, and `MANUAL_ACTION_REQUIRED` |
| Repository conflict mapping | COMPLETE | conflicts surface as `WorkspaceActiveRunError` / `WORKSPACE_ACTIVE_RUN_EXISTS` with Workspace and active Run identity |
| Retry-required state | COMPLETE | failed-but-retryable idle Runs aggregate to non-terminal, inactive `RETRY_REQUIRED` |
| Atomic retry | COMPLETE | Workspace reacquisition, Run transition, Job transition, and Attempt creation share one `BEGIN IMMEDIATE` transaction |
| Retry conflict rollback | COMPLETE | ownership conflict leaves Run, Job, attempt count, and history unchanged |
| Restart/reconciliation scope | COMPLETE | incomplete discovery and `planRun` require Workspace identity and cross-Workspace lookup fails closed |
| Multi-source Core compatibility | COMPLETE | source-keyed collection/validation, snapshots, sibling independence, and failed-only retry remain verified |
| Google Trends compatibility | COMPLETE | current Core/batch/controller/export and deterministic provider-boundary suites pass |
| Workspace product UI | NOT IMPLEMENTED | no selector, manager, settings, or renderer contract was added |
| Presets / Last Run Settings | NOT IMPLEMENTED | no persistence or UI was added |
| Credential/freshness lifecycle | NOT IMPLEMENTED | no credential, connection, freshness, or scheduler tables/workflows were added |

Current persisted contract facts:

```text
SQLite schema version: 6
tables: schema_migrations, workspaces, runs, jobs, attempts, artifacts, validations
runs.workspace_id: required FK to workspaces.workspace_id
active Run statuses: PENDING, RUNNING, MANUAL_ACTION_REQUIRED
inactive non-terminal retry status: RETRY_REQUIRED
active-slot index: ux_runs_one_active_per_workspace
job uniqueness: run_id + source_id + job_key
jobs.query_group_id: nullable; Google-Trends/legacy-specific
errors table: not implemented
credential/freshness tables: not implemented
```

## 5. Schema-v6 migration and compatibility

Schema v6 preserves schema-v5 multi-source data and adds Workspace ownership without changing legacy snapshot shapes.

Migration behavior proven by deterministic fixtures:

- creates strict `workspaces` storage;
- creates one deterministic `ws_development_migration` row;
- attaches every pre-v6 Run to that technical Workspace;
- preserves existing Run, Job, Attempt, Artifact, Validation, source, context, and snapshot evidence;
- maps an idle schema-v5 `RUNNING` Run with retry-eligible failed work to `RETRY_REQUIRED`;
- leaves genuinely pending, active, or manual work active;
- rejects multiple migrated active Runs before installing the unique index;
- rolls the entire migration back to schema v5 on that conflict;
- re-enables and verifies foreign-key integrity.

`ws_development_migration` is migration/runtime technical compatibility only. It is not a customer-facing default, a legacy mode, a nullable ownership exception, or a permanent product concept. New repository Run APIs require an explicit `workspace_id`.

Legacy Google Trends snapshots, generic single-source snapshots, and the schema-v5 multi-source `sources` snapshot remain readable unchanged.

## 6. Retry ownership and recovery behavior

The implemented lifecycle is:

```text
active Run completes all immediately executable work
→ retry-eligible failed Job remains
→ Run becomes RETRY_REQUIRED and releases the Workspace active slot
→ explicit retry begins one repository transaction
→ verify Run/Job eligibility and attempt limit
→ verify no other active Run owns the Workspace
→ Run becomes RUNNING
→ Job moves through RETRY_PENDING to RUNNING
→ next immutable Attempt is inserted
→ commit all changes together
```

If another Run owns the Workspace, the transaction rolls back without changing retry evidence. If the attempt limit is exhausted, no Attempt is created and the Run remains `RETRY_REQUIRED`.

Restart discovery is no longer global. `listIncompleteRuns(workspace_id)`, `discoverIncompleteRuns(workspace_id)`, and `planRun(workspace_id, run_id)` enforce the same ownership boundary. The Google Trends resume adapter loads the persisted Run first and scopes planning with its recorded Workspace.

## 7. Verification status

Focused RED evidence was observed before implementation, including:

```text
schema-v6 migration: expected schema 6, observed schema 5
Workspace persistence: shared Workspace contract missing
one-active-Run mapping: raw SQLite unique-constraint error instead of typed ownership error
Run lifecycle: retryable idle Run remained RUNNING instead of RETRY_REQUIRED
atomic retry: retry incorrectly started while another Run owned the Workspace
Workspace recovery: global discovery returned another Workspace's Run
```

Focused closure verification passed:

```text
npx tsc --noEmit
npm run lint
git diff --check
npm run test:m2:schema-v6
npm run test:m2:workspace-ownership
npm run test:m2:runs
npm run test:m2:reconcile
npm run test:m2:resume
npm run test:m2:multi-source-run
npm run test:m2:gate
```

Observed focused evidence includes:

```text
PASS DB-MIGRATION-006
PASS WORKSPACE-RUN-001
PASS RETRY-006: Workspace reacquisition, Job transition, and Attempt creation are atomic
PASS WORKSPACE-003: cross-Workspace resume planning fails closed
PASS MULTI-SOURCE-RUN-001
PASS M2-GATE-001..008 plus schema-v6, ownership, source-neutral, validator-registry, and multi-source checks
```

Full deterministic release gate:

```text
npm run test:release:gate
PASS RELEASE-GATE-001: deterministic Core, Google Trends, desktop file access, configuration, validation, and export gates completed
```

The first sandboxed release-gate attempt reached its deterministic localhost-server test and was denied with `listen EPERM 127.0.0.1`. The identical gate was rerun with local-loopback permission; it exited 0 and emitted the required final PASS line. This was an execution-environment permission boundary, not a product assertion failure.

No live-provider command ran and no provider quota was consumed. Live-provider verification is not claimed.

Not run or claimed:

```text
npm run package
npm run make
any confirmed m3:live-* command
any GSC/Google Ads/Keyword Planner/SerpApi/provider request
```

## 8. Remaining application/source boundaries

The following remain intentionally outside this checkpoint:

1. Workspace creation/selection/management in the desktop UI.
2. Saved Presets and Last Run Settings.
3. Connection profiles, credentials, OAuth/API-key lifecycle, and freshness.
4. Production composition of sources beyond Google Trends.
5. Generalized multi-source Run Setup, Review, Results, and export/package behavior.
6. Source-specific timeout policy, scheduling, and retention.
7. New user-facing Cancel/Stop/Resume behavior.
8. New provider adapters or live acceptance.

The current Google Trends desktop/runtime composition receives the technical compatibility Workspace internally. That wiring exposes no Workspace product behavior and must not be treated as the final Workspace selection model.

## 9. Completed areas that remain closed

Unless new failing evidence or explicit scope approval appears, do not reopen or rewrite:

- schema-v6 Workspace/Run ownership and the exact active status set;
- the partial unique active-Run index and typed repository conflict;
- `RETRY_REQUIRED` as non-terminal and inactive;
- atomic retry reacquisition and immutable Attempt history;
- Workspace-scoped restart discovery and reconciliation;
- source-keyed collection and fail-closed validator dispatch;
- generic `job_key`, nullable GT-specific `query_group_id`, and persisted `source_context`;
- raw-evidence immutability, missing-not-zero, and execution/validation separation;
- schema-v1/v2 metadata and legacy snapshot compatibility;
- Google Trends relative-interest and comparison-group semantics;
- current provider selector, wait, refresh/retry, navigation, browser-profile, and security behavior.

## 10. Exact recommended next action

No next implementation slice is approved by this checkpoint.

First review technical commit `26278fe` and this handoff commit. Then choose one bounded Release 1.0 application or source-adapter slice and perform a fresh read-only audit against `PROJECT_SPEC.md` and current repository evidence. Require explicit scope approval and a RED-first plan before changing code.

Do not infer authorization for Workspace UI, Presets, Last Run Settings, credentials, provider work, export generalization, or additional hardening from this checkpoint.

## 11. Epistemic checkpoint

### PROVEN FACT

- Technical commit `26278fe` implements schema-v6 first-class Workspace ownership.
- Every Run has a required Workspace FK.
- SQLite and repository transactions enforce one active Run per Workspace.
- `RETRY_REQUIRED` releases the active slot without becoming terminal.
- Explicit retry atomically reacquires ownership, transitions the Job, and creates the next Attempt.
- Retry conflicts roll back without partial state changes.
- Restart discovery and resume planning are Workspace-scoped and cross-Workspace lookup fails closed.
- Existing source-neutral, multi-source, Google Trends, desktop, and export deterministic contracts pass.
- TypeScript, lint, diff checks, focused gates, the integrated M2 gate, and the full deterministic release gate passed.
- No live-provider command ran.
- The two historical untracked files remain untouched.

### INFERENCE

- A future user-facing Workspace flow can build on this ownership contract without weakening the database invariant. This is architectural direction, not an implemented or approved slice.

### UNTESTED HYPOTHESIS

- The current technical compatibility Workspace can be retired cleanly when an explicitly designed Workspace selection/lifecycle flow exists.
- Future source adapters and generalized multi-source desktop/export composition will require no changes to the schema-v6 ownership contract.
- Unimplemented sources and live Google Trends configurations work against providers; no live acceptance was performed here.

## 12. Handoff discipline

Keep implementation, targeted deterministic verification, full release-gate verification, live-provider verification, and committed state as separate claims. This handoff authorizes no additional implementation or live call.

## 13. Schema-v7 Saved Presets / Last Run Settings checkpoint — 2026-09-10

Technical implementation commit:

`f954f57 feat: add workspace collection presets`

Implemented and verified:

- SQLite schema v7.
- Workspace-owned Saved Collection Presets.
- One Last Run Settings record per Workspace.
- Workspace-isolated preset/settings persistence.
- Temporary TypeScript-only RunDraft contract.
- Run-only overrides do not mutate Saved Presets.
- Effective reusable configuration is persisted as Last Run Settings.
- Immutable resolved Run Snapshot remains separate and supports reference_date.
- Run, Jobs, and Last Run Settings use the atomic reservation boundary with rollback on failed reservation.
- Google Trends remains compatible with reusable relative-period settings and resolved absolute Run dates.
- Repository reopen preserves the new relationships.
- Existing Workspace ownership, source-neutral Core, multi-source behavior, and Google Trends deterministic contracts remain compatible.

Verification passed:

- npm run lint
- focused M2/Core/Google Trends deterministic tests
- npm run test:m2:gate
- npm run test:release:gate
- git diff --check
- PASS RELEASE-GATE-001

No live-provider calls ran.

Next major MVP checkpoint: Workspace-owned Connection / Credential / Readiness boundary.

After that, implementation priority is driven by the locked BLOG-WEEK-2026-09-10 collection scope.

The two historical untracked files remain intentionally untouched.

## 18. Guarded Bitkimark sitemap live smoke — 2026-09-11

Added `scripts/m3/live-bitkimark-sitemap-smoke.ts` and `scripts/m3/run-live-bitkimark-sitemap-smoke.sh`, exposed as `npm run m3:live-bitkimark-sitemap-smoke`. The command requires `--confirm-live-collection --sitemap-url <https-url>`, rejects credentials/fragments/non-HTTPS and unsupported arguments before fetch, performs exactly one `BitkimarkSitemapSource` request with no retry, then uses the existing parser/validator and reports only status, byte size/hash, validation status, URL count, approved annotation counts, and raw-persistence state. The real live command was not executed.

`PASS BITKIMARK-LIVE-CMD-001`, `PASS NON-GOOGLE-SOURCES-001`, typecheck, lint, and diff checks passed. After wiring the Bitkimark live-command test into the release gate, the full gate was rerun and visibly completed with both `PASS BITKIMARK-LIVE-CMD-001` and `PASS RELEASE-GATE-001`. Technical implementation was committed as `917b7c6 feat: add bitkimark live sitemap smoke`. The real live Bitkimark request has still not been executed. Historical untracked files remain untouched.

## 14. Schema-v8 Workspace Connection / Readiness checkpoint — 2026-09-10

Technical implementation commit:

`03cee0b feat: add workspace source readiness`

Implemented and verified:

- SQLite schema v8 with Workspace-owned `workspace_source_connections`.
- One logical connection per Workspace/source pair.
- Required Workspace ownership and cross-Workspace isolation.
- Persisted connection metadata contains safe metadata and `credential_ref`, not credential secret values.
- Credential-store interface added with deterministic in-memory implementation for tests.
- Source-keyed readiness registry added.
- Supported readiness states:
  - READY
  - CONFIGURATION_REQUIRED
  - CONNECTION_REQUIRED
  - MANUAL_ACTION_REQUIRED
- Unsupported sources fail closed.
- Secret-like metadata is rejected at the new connection boundary.
- Existing Workspace ownership, Saved Presets, Last Run Settings, source-neutral Core, multi-source Runs, and Google Trends deterministic behavior remain compatible.

Verification passed:

- npm run lint
- focused migration/readiness/Core/Google Trends deterministic tests
- npm run test:m2:gate
- npm run test:release:gate
- git diff --check
- PASS RELEASE-GATE-001

No provider adapters, provider calls, OAuth flows, API-key flows, or new desktop UI were added.

No live-provider calls ran and no provider quota was consumed.

Next major MVP checkpoint: implement the first real non-Google provider/source slices required by the locked BLOG-WEEK-2026-09-10 acceptance scope, beginning with the lowest-risk file/HTTP sources before the Google API adapters.

The two historical untracked files remain intentionally untouched.

## 15. İkas Products + Bitkimark Sitemap/XML checkpoint — 2026-09-10

Technical implementation commit:

`1671e75 feat: add ikas and sitemap sources`

Implemented and deterministically verified:

- İkas Products XLSX source/parser/validator.
- Canonical raw XLSX byte preservation before parsing.
- Fail-closed unsupported/malformed workbook handling.
- Evidence-backed generic İkas mappings only; missing values remain missing.
- Bitkimark Sitemap/XML source/parser/validator.
- Canonical raw XML byte preservation.
- Full URL inventory preservation.
- Deterministic URL annotations for the approved blog-match strings without filtering the canonical inventory.
- Source-specific identities, validation, and Core-compatible artifact/provenance behavior.
- Release-gate integration and deterministic source tests.
- Existing Workspace, readiness, source-neutral Core, multi-source, and Google Trends contracts remain compatible.

Verification passed:

- TypeScript/typecheck
- npm run lint
- focused source tests
- relevant compatibility/Core gates
- npm run test:release:gate
- git diff --check
- PASS RELEASE-GATE-001

No live-provider calls ran.

Remaining acceptance work:

- Exact İkas production column mapping must be verified against the current real Products XLSX. No invented mapping is accepted.
- The old 2026-08-23 Products workbook must not be used for the BLOG-WEEK-2026-09-10 acceptance run.
- Bitkimark live sitemap acquisition smoke remains unexecuted and requires explicit live execution.
- Google API sources and SerpApi remain unimplemented.

Next major MVP checkpoint: Google API source integration for GSC, Google Ads Search Terms, and Keyword Planner, using the existing Workspace connection/readiness boundary.

The two historical untracked files remain intentionally untouched.

## 16. Google API adapters checkpoint — 2026-09-10

Technical implementation commit:

`252c6de feat: add google api source adapters`

Implemented and deterministically verified:

- Google Search Console Query × Page adapter.
- Bounded Search Console `startRow` pagination and raw-page preservation.
- Google Ads Search Terms adapter using the official SearchStream acquisition path.
- Google Keyword Planner historical-metrics adapter.
- Keyword Planner preserves group context, requested keyword context, monthly history, missing values, and deterministic monetary-micros conversion.
- Source-specific IDs, source classes, readiness seams, validators, and deterministic integration tests.
- Existing Workspace ownership, Saved Presets, Last Run Settings, readiness, source-neutral Core, multi-source behavior, Google Trends, İkas, and Bitkimark contracts remain compatible.

Official provider contracts were checked during implementation. No undocumented/private provider endpoints were introduced.

Verification passed:

- npm run test:m3:google-api-adapters
- npm run test:m2:gate
- npm run test:m2:multi-source-run
- npm run test:m3:gt-batch-core-runner
- npm run lint
- npx tsc --noEmit
- git diff --check
- npm run test:release:gate
- PASS RELEASE-GATE-001

No live provider calls ran and no provider quota was consumed.

Current limitation:

- The adapters use the existing credential/readiness boundary, but production credential acquisition and real request composition are not yet implemented.
- GSC, Google Ads Search Terms, and Keyword Planner are therefore not yet ready for explicit live acceptance.
- Provider-unavailable fields must remain missing rather than fabricated.

Next major MVP checkpoint: production Google credential/request composition for GSC and Google Ads, reusing the existing Workspace connection and credential boundaries without redesigning the adapters.

The two historical untracked files remain intentionally untouched.

## 17. Production Google credential/request composition checkpoint — 2026-09-10

Technical implementation commit:

`58c2ad9 feat: add production google credential composition`

Implemented and deterministically verified:

- Production Google credential composition using the existing Workspace connection and CredentialStore boundaries.
- Electron/macOS secure-storage-backed credential implementation.
- PKCE-based Google OAuth authorization/bootstrap components.
- OAuth token exchange and refresh-token flow.
- Short-lived access tokens remain memory-only.
- Authenticated Google Search Console request composition.
- Authenticated Google Ads request composition for Search Terms and Keyword Planner.
- Google Ads customer/login-customer metadata remains separate from secret credential material.
- Source readiness maps missing/unavailable credentials and reauthorization requirements fail-closed.
- No credential secret is persisted through SQLite, Presets, Last Run Settings, Run Snapshots, source context, logs, provenance, or exports.
- Existing GSC, Search Terms, and Keyword Planner adapters remain the normalization/validation layer rather than being duplicated.
- Deterministic guarded/live-entry seams were added for later explicit manual acceptance.
- Existing Workspace, Preset, readiness, source-neutral Core, multi-source, Google Trends, İkas, and Bitkimark behavior remains compatible.

Verification passed:

- focused Google credential/composition tests
- npm run test:m3:google-api-adapters
- relevant readiness/Core compatibility tests
- npx tsc --noEmit
- npm run lint
- git diff --check
- npm run test:release:gate
- PASS RELEASE-GATE-001

No real Google provider data requests were executed during this checkpoint.

Live acceptance still requires explicit user-authorized Google configuration/account setup and guarded execution against the intended Workspace/accounts.

Next major MVP checkpoint: SerpApi source adapter for the locked BLOG-WEEK-2026-09-10 query scope, with query-level quota-aware retry behavior.

After SerpApi, the remaining major product checkpoint is generalized desktop multi-source Run Setup / Review / Progress / Result / Data Package integration before the full real acceptance run.

The two historical untracked files remain intentionally untouched.

## 18. SerpApi source checkpoint — 2026-09-11

Technical implementation commit:

`0e34032 feat: add serpapi source`

Implemented and deterministically verified:

- Workspace-scoped SerpApi connection and credential composition.
- SerpApi Google Search acquisition for Türkiye / Turkish / Desktop scope.
- Query-level Job planning for independently retryable SERP requests.
- First 10 organic results normalization.
- People Also Ask / related-question normalization when returned by the provider.
- Canonical raw SerpApi JSON preservation before normalization.
- Source-specific validation and readiness integration.
- Missing configuration resolves fail-closed.
- Missing credential resolves through the existing connection/readiness boundary.
- Quota/provider failures do not trigger automatic retry.
- Failed SERP Jobs remain independently retryable without recollecting successful sibling queries.
- Guarded live SerpApi smoke command exists and rejects unconfirmed/unbounded execution before provider access.
- Existing Workspace, credential, source-neutral Core, multi-source, Google Trends, Google API, İkas, and Bitkimark behavior remains compatible.

Verification passed:

- npm run test:m3:serpapi
- npm run test:m3:live-serpapi-command
- relevant Google/non-Google compatibility tests
- npx tsc --noEmit
- npm run lint
- git diff --check
- npm run test:release:gate
- PASS SERPAPI-001
- PASS SERPAPI-LIVE-CMD-001
- PASS RELEASE-GATE-001

No live SerpApi request was executed during this checkpoint.

Live acceptance still requires the real Workspace SerpApi credential and explicit guarded execution.

The next and final major MVP implementation checkpoint is generalized Desktop multi-source Run Setup / Review / Progress / Result / Data Package integration for the locked BLOG-WEEK-2026-09-10 acceptance scope.

After that checkpoint, remaining work should move primarily to real provider setup, live acceptance, current İkas workbook mapping, Bitkimark live smoke, and targeted bug fixes rather than further Core architecture expansion.

The two historical untracked files remain intentionally untouched.

## 19. Generalized Desktop multi-source + Data Package checkpoint — 2026-09-11

Technical implementation commit:

`3ef48e9 feat: add multi-source desktop run flow`

Implemented and verified:

- Generalized Workspace-scoped desktop Run flow.
- HOME → SETUP → REVIEW → PROGRESS → RESULT workflow.
- Saved Preset / Last Run / Blank draft origins.
- Final readiness gating before Start.
- Immutable Run reservation with source-specific Job planning.
- Production shared-Core execution through `DesktopExecutionService` and `CollectionOrchestrator.runUntilBlocked(run_id)`.
- Production SourceRegistry composition for all seven R1 source modules:
  - google-trends
  - google-search-console-query-page
  - google-ads-search-terms
  - google-keyword-planner
  - ikas-products
  - bitkimark-sitemap
  - serpapi
- Source-specific validators registered in the production execution runtime.
- Asynchronous Run execution with per-run in-process duplicate-dispatch protection.
- Explicit Retry Failed through existing reconciliation/retry machinery, preserving accepted sibling Jobs.
- Physical Export All and Export Successful Only through main-process filesystem boundaries.
- Source-separated Data Package output with safe failure context and NULL preservation.
- Workspace-scoped Run history and minimal Preset/Workspace management surfaces.
- Typed preload/IPC boundaries with fail-closed payload validation.
- Credential-like configuration fields sanitized from renderer-facing and persisted snapshot/export boundaries.
- Existing Google Trends browser/runtime shutdown behavior preserved.
- No renderer-owned collection or retry loop.
- No cross-source row-level data joining.

Supported R1 source set is now production-composed for generalized desktop execution:

- Google Trends
- Google Search Console
- Google Ads Search Terms
- Google Ads Keyword Planner
- İkas Products XLSX
- Bitkimark Sitemap/XML
- SerpApi Google SERP

Verification passed:

- PASS PRODUCTION-SOURCE-COMPOSITION-001
- PASS DESKTOP-MULTISOURCE-001
- PASS DESKTOP-RETRY-EXPORT-001
- PASS DATA-PACKAGE-001
- existing source-neutral/multi-source Run lifecycle gates
- existing readiness and credential-boundary gates
- desktop UI smoke gates
- npx tsc --noEmit
- npm run lint
- git diff --check
- npm run test:release:gate
- PASS RELEASE-GATE-001

No live provider collection was executed during this checkpoint.

The major deterministic implementation phase is now complete enough to move into manual/live BLOG-WEEK-2026-09-10 acceptance.

Remaining work is acceptance/configuration focused rather than another Core architecture checkpoint:

- configure real Workspace source connections/credentials;
- provide and inspect the current İkas Products XLSX and lock its real production mapping;
- run Bitkimark live sitemap smoke;
- configure/authorize Google access as required;
- load the locked BLOG-WEEK Google Trends groups/date range;
- run guarded Google Trends acceptance;
- run GSC, Ads Search Terms, and Keyword Planner acceptance;
- configure SerpApi credential and run the locked 27-query acceptance;
- validate provenance/raw evidence/package exports;
- fix only concrete issues found during live acceptance.

All provider authentication, CAPTCHA, 2FA, quota, and rate-limit conditions remain fail-closed/manual-action boundaries.

The two historical untracked files remain intentionally untouched.

## 17. İkas production mapping checkpoint — 2026-09-11

The real read-only workbook `/Users/furkan/Downloads/ikas-urunler (1).xlsx` was verified as sheet `Ikas Excel File`, 40 headers, and 856 variant rows across 88 product groups. The parser now maps `Ürün Grup ID` → product ID, `Varyant ID` → variant ID, exact title/category/type/price/description/slug fields, keeps product URL `NULL`, and extracts plant height/pot type by label across all three variant slots. Blank sale price/stock and absent attributes remain nullable; image URL is never treated as product URL. Source-native activity/stock evidence is preserved with deterministic availability states.

Verification passed: `PASS NON-GOOGLE-SOURCES-001`, `npx tsc --noEmit`, `npm run lint`, and `git diff --check`. One `npm run test:release:gate` run was started, but the captured worker output was truncated before its final status line; `PASS RELEASE-GATE-001` is therefore not claimed. No live provider traffic ran and the real workbook is not stored in Git.

The technical commit and separate documentation commit could not be created because Git could not create `.git/index.lock` (`Operation not permitted`). Changes remain in the working tree for manual staging/commit. The two historical untracked files remain untouched.


---

## 20. UI redesign checkpoint — 2026-09-14

This section is the authoritative current-state update for the active UI redesign. Earlier next-action sections are historical.

Current technical checkpoints:
- 085d5a7 fix: complete desktop preset management
- 92f3298 feat: add source-neutral operations shell
- e3477cb feat: add task quick run review flow

Implemented:
- Source-neutral HOME / TASKS / RUNS / PRESETS / WORKSPACE shell.
- Dedicated Task Detail surfaces.
- Native trusted-IPC İkas Products XLSX selection.
- Run-specific source configuration participates in readiness.
- FILE_REQUIRED is a first-class readiness status.
- Selected İkas file is carried into the reviewed Run draft.
- Mandatory Quick Run Review exposes the exact selected input before execution.
- Opening Review does not start provider execution.
- Non-İkas Quick Runs remain disabled until their exact task-specific configuration builders exist.
- Existing Core/runtime/provider architecture remains unchanged.

Latest focused verification:
- npm run test:m5:desktop-ui — PASS
- npm run test:m5:desktop-multisource — PASS
- npm run test:m2:connection-readiness — PASS
- npx tsc --noEmit — PASS
- git diff --check — PASS

No live provider request was executed during these UI slices.

Exact next slice:
Review → explicit Start Run → startDesktopDraft(reviewed draft) → persisted run_id → dedicated Run Detail / Progress.

The renderer must not own collection execution loops. Run state must continue to come from the existing Core persistence/controller boundary.

Historical untracked files remain intentionally untouched:
- CODEX_HANDOFF_CURRENT.md
- PROJECT_HANDOFF.pre-20260820.md


---

## 21. Run Detail / Progress heartbeat checkpoint — 2026-09-14

Technical implementation commit:

f1de3e7 feat: add run detail progress heartbeat

Implemented and verified:

- Mandatory Review remains separate from provider execution.
- Start Run is an explicit user action.
- Start executes the exact reviewed DesktopRunDraft.
- The persisted run_id returned by startDesktopDraft becomes the Run Detail identity.
- Renderer does not execute collection work.
- Persisted Run state is refreshed through getDesktopRunState.
- PENDING and RUNNING use a 2-second local-state heartbeat.
- MANUAL_ACTION_REQUIRED uses a 5-second local-state heartbeat.
- RETRY_REQUIRED, COMPLETED, COMPLETED_WITH_WARNINGS, FAILED, and CANCELLED do not continue polling.
- Polling reads local persisted Core state only; it does not issue provider requests.

Verification passed:

- npm run test:m5:desktop-ui
- npx tsc --noEmit
- git diff --check

No live provider request was executed.

Exact next UI work must be chosen from current repository evidence rather than inferred. Likely boundaries are Run history / Run Detail job-level progress / explicit Retry Failed / result actions.

Historical untracked files remain intentionally untouched:
- CODEX_HANDOFF_CURRENT.md
- PROJECT_HANDOFF.pre-20260820.md


---

## 22. Run job progress / Retry Failed checkpoint — 2026-09-14

Technical implementation commit:

38fa0ee feat: add run job progress and retry

Implemented and verified:

- Run Detail renders persisted Job records from DesktopRunState.
- Each Job exposes source, job key, execution status, validation status, and attempt count.
- Run Detail exposes completed / total / failed progress.
- Run status is visually distinct from Job execution status.
- RETRY_REQUIRED with failed Jobs exposes an explicit Retry Failed action.
- Retry Failed calls the existing Core-backed retryDesktopFailed(run_id) boundary.
- The persisted DesktopRunState returned by retry becomes the authoritative active Run state.
- Existing heartbeat behavior resumes automatically when retry returns an active Run state.
- No renderer-owned retry or collection loop was added.

Verification passed:

- npm run test:m5:desktop-ui
- npx tsc --noEmit
- git diff --check

No live provider request was executed.

Next likely bounded UI slice: persisted Run History -> select Run -> existing Run Detail. Confirm the typed IPC/API seam before implementation.

Historical untracked files remain intentionally untouched:
- CODEX_HANDOFF_CURRENT.md
- PROJECT_HANDOFF.pre-20260820.md


---

## 23. Run export actions checkpoint — 2026-09-14

Technical implementation commit:

4783303 feat: add run export actions

Implemented and verified:

- Terminal Run Detail exposes Export All and Export Successful Only.
- Export actions use the exact persisted run_id.
- Export modes remain explicit: ALL and SUCCESSFUL_ONLY.
- Renderer calls the existing exportDesktopRun boundary only.
- Data Package construction remains outside the renderer.
- Completed export directory is shown in Run Detail.
- Dataset and failure counts returned by the export boundary are shown.
- Non-terminal Runs do not expose export actions.

Verification passed:

- npm run test:m5:desktop-ui
- npx tsc --noEmit
- git diff --check

No live provider request was executed.

The redesigned Run lifecycle now covers:
Review -> explicit Start -> persisted Run Detail -> heartbeat progress -> Job progress -> Retry Failed -> persisted Run History -> historical Run Detail -> terminal export actions.

The next major product gap is task configuration beyond the current İkas standalone Quick Run. Before enabling Google Trends, GSC, Ads Search Terms, Keyword Planner, Sitemap, or SerpApi Quick Runs, inspect and lock task-specific defaults, relative-date resolution, and Review snapshot semantics.

Historical untracked files remain intentionally untouched:
- CODEX_HANDOFF_CURRENT.md
- PROJECT_HANDOFF.pre-20260820.md

---

## 24. Reviewed GSC Current + Long Quick Run checkpoint — 2026-09-15

This section is the authoritative latest UI/task-resolution checkpoint. Earlier next-action sections are historical.

Previous technical checkpoint:

- `a6edc5d feat: add reviewed GSC current quick run`

Implemented in the current checkpoint:

- GSC Current and GSC Long remain separate task identities over the shared `google-search-console-query-page` source.
- GSC Current reusable date policy remains `TODAY_MINUS_90_TO_YESTERDAY`.
- GSC Long reusable date policy is `TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY`.
- GSC Long resolves from the local reference calendar date minus 16 calendar months through yesterday.
- Calendar-month subtraction clamps invalid target month-end dates instead of overflowing into the following month.
- Example locked behavior: reference date `2026-09-14` resolves GSC Long to `2025-05-14 → 2026-09-13`.
- Example month-end behavior: reference date `2026-10-31` resolves the start to `2025-06-30`.
- Review resolves relative date policy once into an exact reviewed artifact.
- Explicit Start consumes that reviewed artifact and does not recalculate dates, including when the local clock advances to the next day between Review and Start.
- Persisted Run planning therefore uses the exact reviewed `reference_date`, requested start/end dates, task identity, source identity, and date policy.
- The Task Detail renderer enables GSC Quick Run through the source + machine-readable date-policy capability instead of separate Current-only UI logic.
- Review displays the exact resolved reference date and requested range supplied by the controller.
- The existing generic reviewed-artifact IPC / Start boundary is reused unchanged.
- İkas Quick Run behavior remains supported.
- No universal date-policy DSL was introduced.
- No GSC provider request or other live-provider collection was executed during these UI/resolution slices.

Focused deterministic coverage includes:

- exact GSC Current 90-day resolution;
- exact GSC Long 16-calendar-month resolution;
- GSC Long month-end clamping;
- local-calendar reference-date behavior;
- Current Review → reviewed artifact;
- Long Review → reviewed artifact;
- midnight drift between Review and Start without re-resolution;
- exact resolved Job planning from the reviewed artifact;
- GSC Current Task Detail → Review → exact dates → Start;
- GSC Long Task Detail → Review → exact dates → Start;
- preservation of the existing source-neutral desktop shell and İkas Quick Run flow.

Checkpoint verification commands:

- `npm run test:m5:desktop-multisource`
- `npm run test:m5:desktop-ui`
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next grouped interface candidate:

- Google Trends — Interest Over Time Quick Run.
- First perform one bounded audit of the existing Google Trends reusable configuration and task defaults.
- Lock its rolling 24-calendar-month resolution and comparison-group context before enabling Review.
- Preserve Search Term semantics, Turkey / All Categories / Web Search defaults, and independent comparison-group normalization.
- Use the same interface-level RED → coherent GREEN batch → verification → commit workflow.
- Do not execute a live Google Trends provider request as part of that deterministic implementation slice.

## 25. Reviewed Google Trends Quick Run checkpoint — 2026-09-15

Previous Git checkpoint: a1b7163 — feat: add reviewed GSC long quick run.

Current checkpoint scope:

- Google Trends — Interest Over Time now participates in the generic reviewed Quick Run flow.
- Task identity remains google-trends-interest-over-time and source identity remains google-trends.
- Reusable configuration stores the relative policy TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY.
- reference_date is the computer local calendar date.
- Review resolves the exact window once: reference date minus 24 calendar months through yesterday.
- Calendar-month subtraction preserves day-of-month where possible and clamps invalid month-end dates.
- External Google Trends query groups are loaded during application bootstrap and injected into the generic desktop controller.
- Quick Run uses all configured Google Trends comparison groups; the renderer does not rebuild or hardcode query groups.
- Reviewed configuration materializes the fixed MVP semantics: Turkey, All Categories, Web Search, Search Term, Interest Over Time.
- selected_query_groups preserves group identity, group name, ordered queries, and duplicate query membership across independent comparison groups.
- Generic planning creates one independent Job per configured comparison group.
- Google Trends Job source context uses source_context.query_group, matching the production Google Trends source contract.
- Start consumes the exact reviewed artifact and does not recalculate dates or query groups after Review.
- Reviewed Start provenance supports direct source-level requested dates for Google Trends while retaining the existing GSC date_ranges fallback.
- Google Trends readiness for this Quick Run path is based on a READY external query configuration with at least one configured group.
- Existing GSC Current, GSC Long, legacy Google Trends desktop controller, and batch Core behavior remain covered by regression tests.
- No live Google Trends provider request was executed as part of this deterministic interface slice.
- Historical untracked files CODEX_HANDOFF_CURRENT.md and PROJECT_HANDOFF.pre-20260820.md remain untouched.

Verification for this checkpoint:

- test:m5:desktop-multisource
- test:m5:desktop-ui
- test:m3:gt-period
- test:m3:desktop-controller
- test:m3:gt-batch-core-runner
- TypeScript no-emit typecheck
- ESLint
- git diff --check

Next candidate interface:

- Continue the Release 1.0 task catalog with the next source/task Quick Run interface only after a bounded audit of its existing production seam.

## 26. Reviewed Google Trends Core execution checkpoint — 2026-09-15

Previous Git checkpoint: b9f13d9 — feat: add reviewed Google Trends quick run.

Current checkpoint scope:

- Reviewed Google Trends Quick Run is now covered end-to-end through the production Core execution seam.
- The deterministic vertical path exercises DesktopMultiSourceController → DesktopExecutionService → production runtime → CollectionOrchestrator → Google Trends source/validator → persisted Run/Jobs → getRunState Run Detail.
- No live Google Trends provider request is used by this acceptance test.
- Review continues to expose machine semantics WEB_SEARCH and SEARCH_TERM.
- At the reviewed Start persistence boundary, Google Trends snapshot semantics are normalized to the established Core requested-configuration contract: Web Search and Search Term.
- The Google Trends validator and legacy Core path remain strict; neither was relaxed.
- Exact dates resolved during Review are preserved through Start and Core execution.
- Multiple configured comparison groups execute as independent persisted Jobs in configured order.
- Query-group identity remains available through source_context.query_group.
- Completed Core execution is readable through the same getRunState contract used by Run Detail.
- Raw artifact immutability remains fail-closed; StorageManager collision behavior was not changed.
- The deterministic fixture now uses query-group-aware filenames so multi-group tests model distinct source artifacts rather than colliding on a fixed GT01 filename.
- The core persistence runner compile harness includes the desktop controller, execution service, and production runtime entrypoints required by the vertical acceptance test.
- Historical untracked files CODEX_HANDOFF_CURRENT.md and PROJECT_HANDOFF.pre-20260820.md remain untouched.

Verification for this checkpoint:

- test:m3:gt-core-runner
- test:m5:desktop-multisource
- test:m5:desktop-ui
- test:m3:gt-period
- test:m3:desktop-controller
- test:m3:gt-batch-core-runner
- TypeScript no-emit typecheck
- ESLint
- git diff --check

Exact next action:

- Choose the next bounded Google Trends MVP interface only after this checkpoint is committed; do not expand into a new source module while the Google Trends base path is still being hardened.

## 27. Reviewed Google Trends failed-job retry checkpoint — 2026-09-15

Previous Git checkpoint: 1f43949 — feat: complete reviewed Google Trends core run path.

Current checkpoint scope:

- Reviewed Google Trends Quick Run partial-failure retry is covered through the production Core execution path.
- Deterministic acceptance flow: GT01 completes, GT02 fails, Run becomes RETRY_REQUIRED, explicit Retry Failed retries only GT02, and the same persisted Run becomes COMPLETED.
- GT01 accepted evidence is preserved and GT01 is not recollected during retry.
- Attempt counts remain GT01 = 1 and GT02 = 2 after successful retry.
- DesktopMultiSourceController now receives a source-neutral execute_retry dependency for already-started explicit retry attempts.
- DesktopExecutionService executes the already-started retry attempt first, then continues the same Run through runUntilBlocked.
- This mirrors the established Core retry ownership pattern used by the working Google Trends batch runner.
- Normal run scheduling remains fail-closed for unexpected persisted RUNNING or VALIDATING jobs; that reconciliation protection was not weakened.
- RunManager, Google Trends source behavior, validator behavior, and renderer retry semantics were not broadened in this slice.
- The acceptance test uses deterministic fixtures only and makes no live Google Trends provider call.
- Multi-failed-job retry policy expansion is outside this bounded checkpoint.
- Historical untracked files CODEX_HANDOFF_CURRENT.md and PROJECT_HANDOFF.pre-20260820.md remain untouched.

Verification required for this checkpoint:

- test:m3:gt-core-runner
- test:m5:desktop-multisource
- test:m5:desktop-ui
- test:m3:gt-batch-core-runner
- test:m3:desktop-controller
- test:m3:gt-period
- TypeScript no-emit typecheck
- ESLint
- git diff --check

Exact next action:

- Select the next bounded Google Trends MVP reliability interface after this checkpoint is committed.

## 28. Reviewed Google Trends manual-action continuation checkpoint — 2026-09-16

Previous Git checkpoint: ad65ae1 — fix: execute Google Trends failed-job retries through Core.

Current checkpoint scope:

- Reviewed Google Trends Quick Run now supports explicit continuation after MANUAL_ACTION_REQUIRED through the generic desktop Run Detail flow.
- Deterministic acceptance flow: GT01 enters MANUAL_ACTION_REQUIRED, GT02 remains PENDING, and no later comparison group starts before explicit continuation.
- Continue reuses the same persisted Run and the same interrupted GT01 attempt; it does not create a retry attempt.
- After continuation, GT01 completes first and the existing Core execution loop advances to GT02 as its initial attempt.
- Final deterministic state is COMPLETED with GT01 attempt count = 1 and GT02 attempt count = 1.
- DesktopMultiSourceController now exposes a source-neutral continueManual operation and execute_continue execution seam.
- Manual continuation follows the existing ResumePlanner BLOCKED_MANUAL_ACTION semantics and refreshes persisted Run status through RunManager.
- Production continuation executes through DesktopExecutionService.executeStartedAttemptAndContinue.
- Trusted desktop IPC now exposes DESKTOP_CONTINUE_MANUAL through the typed RoofRoomApi and preload bridge.
- Run Detail exposes Continue Run only while the persisted Run status is MANUAL_ACTION_REQUIRED.
- Renderer continuation sends the exact persisted run_id and adopts the returned persisted DesktopRunState; renderer does not own provider execution.
- Existing Retry Failed behavior remains separate; the retry/export regression fixture was updated to provide the explicit execute_retry dependency required by the current controller contract.
- One explicit Continue action resumes one currently blocked manual-action Job; subsequent manual-action stops remain explicit user actions.
- No live Google Trends or other provider request was executed during this deterministic slice.
- Historical untracked files CODEX_HANDOFF_CURRENT.md and PROJECT_HANDOFF.pre-20260820.md remain untouched.

Verification required for this checkpoint:

- npm run test:release:gate
- npx tsc --noEmit
- npm run lint
- git diff --check
- git diff --cached --check

Exact next action:

- After this checkpoint is committed, select the next bounded Google Trends MVP reliability/interface slice from current repository evidence.
- Do not expand into a new provider module until the Google Trends base MVP reliability path is intentionally closed.

## 29. Explicit interrupted Run recovery checkpoint — 2026-09-16

Previous Git checkpoint: `487267e` — feat: add explicit manual run continuation.

Current checkpoint scope:

- Reviewed Google Trends Quick Run now supports explicit recovery of persisted interrupted work after application/process restart through the generic Run Detail flow.
- Recovery preserves the existing persisted `run_id`; no replacement Run is created.
- Accepted sibling Jobs remain accepted and are not recollected.
- Deterministic acceptance flow preserves GT01 as accepted attempt 1 while GT02 is persisted as interrupted RUNNING attempt 1 with no candidate artifact.
- `Resume Run` performs reconciliation only; it does not call the provider and does not automatically create a retry attempt.
- Interrupted GT02 attempt 1 is preserved as failed historical evidence with `INTERRUPTED_ATTEMPT`.
- The reconciled GT02 Job becomes `RETRY_PENDING` and the Run becomes `RETRY_REQUIRED`.
- The existing explicit `Retry Failed` action then creates GT02 attempt 2 and completes the same persisted Run.
- Final deterministic attempt counts are GT01 = 1 and GT02 = 2.
- `DesktopExecutionService` exposes source-neutral active-Run ownership through `isActive(run_id)`.
- Recovery refuses a Run still owned by active execution in the current process.
- Candidate-artifact interruption remains fail-closed and is not recollected automatically.
- `DesktopRunState` now exposes authoritative `can_resume` and `can_retry` action state.
- Trusted desktop IPC exposes `DESKTOP_RESUME_INTERRUPTED` through the typed `RoofRoomApi` and preload bridge.
- Run Detail exposes `Resume Run` only when persisted state is safely resumable, then adopts the returned persisted state.
- Renderer remains presentation-only and never owns provider execution or reconciliation loops.
- No automatic resume occurs during application startup.
- Cancellation behavior was not expanded in this slice.
- No live Google Trends or other provider request was executed during this deterministic checkpoint.
- Historical untracked files `CODEX_HANDOFF_CURRENT.md` and `PROJECT_HANDOFF.pre-20260820.md` remain untouched.

TDD evidence:

- `DESKTOP-RESUME-001` first failed because `resumeInterrupted` did not exist.
- The Core behavior then passed after implementing explicit restart reconciliation.
- `RESTART-RESUME-UI-001` first failed because persisted interrupted Run Detail had no `Resume Run` action.
- The UI behavior then passed after wiring authoritative recovery state, trusted IPC/preload, and Run Detail action handling.

Verification for this checkpoint:

- `npm run test:m5:desktop-retry-export`
- `npm run test:m5:desktop-ui`
- `npm run test:m5:desktop-multisource`
- `npm run test:release:gate`
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`
- `git diff --cached --check`

Exact next action:

- After this checkpoint is committed, select the next bounded Google Trends MVP reliability/interface slice from current repository evidence.
- Keep restart/recovery, manual continuation, and explicit failed-job retry as separate user intents.
- Do not expand into a new provider module until the Google Trends base MVP reliability path is intentionally closed.
