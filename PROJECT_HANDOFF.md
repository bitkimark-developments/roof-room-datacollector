# RoofRoom Data Collector — Project Handoff

**Checkpoint date:** 2026-09-19

**Current milestone:** Release 1.0 — final local hardening and reality audit

**Current stage:** Local implementation, deterministic acceptance, target-Mac packaging, and all independently executable acceptance work complete

**Current goal:** Preserve the verified local Release 1.0 checkpoint; complete only provider-specific manual/live acceptance that requires credentials or external account setup

**Current-state authority:** Section 41 is the authoritative latest checkpoint. Earlier sections are retained as historical implementation checkpoints and their older “next action” statements are superseded where they conflict with Section 41.

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

---

## 30. Generic explicit Run cancellation checkpoint — 2026-09-17

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical.

Technical implementation commit:

`c0a43ee feat: add generic run cancellation`

Implementation scope:

- `DesktopRunState` now exposes authoritative `can_cancel`.
- Renderer cancellation eligibility is driven by persisted/controller state rather than inferred from Run status.
- Trusted desktop IPC exposes a dedicated `DESKTOP_CANCEL_RUN` channel through `RoofRoomApi.cancelDesktopRun(run_id)` and preload.
- Run Detail exposes `Cancel Run` only when `can_cancel === true`.
- Cancellation always targets the exact persisted `run_id`.
- Unknown or already-terminal Runs fail closed.
- Inactive non-terminal Runs may be terminal-cancelled without a live provider handle.
- Active Runs are cancellable only when `DesktopExecutionService` owns a safe physical cancellation capability.
- Completed Jobs and accepted sibling evidence remain preserved.
- Eligible unfinished Jobs become `CANCELLED`.
- An active unfinished Attempt becomes `CANCELLED`.
- Cancellation does not create a retry Attempt.
- The Run becomes terminal `CANCELLED`.
- A terminal cancelled Run exposes no Resume, Retry Failed, Continue Run, or Cancel Run action.
- `DesktopExecutionService.cancelActive(run_id)` invokes the physical cancellation handle and waits for active execution ownership to be released before reporting completion.
- Google Trends is the first production physical-stop implementation and uses the existing managed browser runtime shutdown boundary.
- The Google Trends physical cancellation primitive is protected by the shared cancellation domain `google-trends-browser`.
- Only one active Run may own that cancellation domain at a time.
- A second Run attempting to acquire an already-owned cancellation domain fails closed rather than sharing the same physical stop primitive.
- Cancellation-domain ownership is released after the owning execution finishes so a later Run can safely reuse the same domain.
- Retry and manual-continue execution paths preserve the same cancellation-domain ownership rule.
- No persisted `CANCELLING` state was introduced.
- Pause, undo, bulk cancellation, automatic restart, cancellation-reason taxonomy, and new provider-specific physical-stop implementations remain outside this slice.

TDD / regression evidence:

- `DESKTOP-EXECUTION-DOMAIN-001` was introduced RED-first.
- The RED run failed with `Missing expected exception: Two Runs must not share one physical cancellation domain at the same time.`
- After implementation, the same test passed and also proved ownership is released after completion.
- Existing generic cancellation, retry/export, UI, and legacy Google Trends controller behavior remained covered.

Focused verification after the ownership fix passed:

```text
PASS DESKTOP-EXECUTION-CANCEL-001
PASS DESKTOP-EXECUTION-DOMAIN-001
PASS DESKTOP-MULTISOURCE-001
PASS DESKTOP-RESUME-001
PASS DESKTOP-CANCEL-001
PASS DESKTOP-RETRY-EXPORT-001
PASS DESKTOP-UI-001
PASS DESKTOP-CTRL-001
PASS DESKTOP-CTRL-002
PASS DESKTOP-CTRL-003
PASS DESKTOP-CTRL-004

multisource_exit=0
retry_exit=0
ui_exit=0
legacy_exit=0
typecheck_exit=0
lint_exit=0
diffcheck_exit=0
```

Full deterministic release verification after the cancellation-domain fix passed:

```text
PASS DESKTOP-EXECUTION-CANCEL-001
PASS DESKTOP-EXECUTION-DOMAIN-001
PASS DESKTOP-CANCEL-001
PASS DESKTOP-UI-001
PASS RELEASE-GATE-001

release_exit=0
typecheck_exit=0
lint_exit=0
diffcheck_exit=0
```

No live provider request was executed during this cancellation checkpoint.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next action:

- Keep `c0a43ee` as the technical generic-cancellation commit.
- Correct the separate handoff/documentation commit so it preserves this full historical handoff and records this Section 30 checkpoint.
- After that documentation checkpoint is clean, do not start another implementation slice implicitly.
- Choose the next bounded Release 1.0 task only after reviewing current repository evidence and obtaining explicit scope approval.
- Do not reopen generic cancellation unless new failing evidence appears.

---

## 31. Google Ads Search Terms — Reviewed + Request-Bound Quick Run (WG1) checkpoint — 2026-09-18

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical.

Technical implementation commit:

`b5159a4 feat(google-ads): bind reviewed date range to search terms request`
(`b5159a4113848fb8a76e6898edae8c88be66057e`)

Implementation scope:

- Task identity `google-ads-search-terms` configured with date policy `TODAY_MINUS_17_TO_YESTERDAY` and summary in `DESKTOP_TASK_CATALOG`.
- Date policy `TODAY_MINUS_17_TO_YESTERDAY` resolves reference date minus 17 calendar days through reference date minus 1 calendar day (e.g., reference date `2026-09-17` resolves to `2026-08-31 → 2026-09-16`).
- Review resolves relative date policy once into an immutable reviewed artifact with absolute dates (`reviewed_draft.resolved_configuration`).
- Start consumes that exact reviewed artifact without recalculating dates, even if the local clock advances between Review and Start.
- Atomic reservation persists the exact reviewed dates and required source/task/mode context in SQLite:
  - `task_id`: `google-ads-search-terms`
  - `source_id`: `google-ads-search-terms`
  - `source_mode`: `search_term_view`
  - `campaign_type`: `SEARCH`
  - `reference_date`: `2026-09-17`
  - `date_policy`: `TODAY_MINUS_17_TO_YESTERDAY`
  - `requested_date_start`: `2026-08-31`
  - `requested_date_end`: `2026-09-16`
- Repository close and reopen preserves identical Job `source_context`.
- Source module `GoogleAdsSearchTermsSource.collect(context)` dynamically constructs GAQL query from Job `source_context` using `buildSearchTermsQuery` rather than relying on static constructor queries.
- Query construction strictly targets `FROM search_term_view` with `campaign.advertising_channel_type = 'SEARCH'` and absolute date bounds `segments.date BETWEEN 'start' AND 'end'`.
- Core transports approved Job context and does not learn GAQL semantics; the source module owns query formation.
- Unsupported scope (`PERFORMANCE_MAX`, `campaign_search_term_view`, mismatched task ID, reversed/invalid dates) fails closed before provider access.
- Production collection runtime passes Job context through `LazyWorkspaceSource` to the Ads source.
- UI smoke test verifies Ads task selection, review with date policy, and start forwarding exact reviewed artifact.
- Provider-bound assertion inspects actual mocked requester/client invocation: `https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream` receives GAQL query matching reviewed absolute dates.
- Verified invariant:
  `review.requested_date_start` = `job.source_context.requested_date_start` = `provider_request.requested_date_start`
  and
  `review.requested_date_end` = `job.source_context.requested_date_end` = `provider_request.requested_date_end`.

TDD / verification evidence:

- `ADS-REVIEW-DATE-001`: 17 calendar days crosses the month boundary exactly (`2026-09-17` → `2026-08-31` to `2026-09-16`).
- `ADS-REVIEW-BOUND-001`: Review → atomic persisted Job → production requester survives next-day Start and reopen. Mocked requester receives GAQL with exact date bounds.
- `ADS-SOURCE-CONTEXT-001`: source builds the provider request from explicit Job context and rejects unsupported scope before provider requests.
- `ADS-REVIEW-UI-001`: Ads task sends date policy to Review and Start forwards the exact reviewed artifact.
- `DESKTOP-UI-001`: Operations shell and existing GSC + Google Trends Quick Run flows verified.

Verification results:

- Focused WG1 test (`tests/integration/google-api/run-ads-reviewed-quick-run-test.sh`): PASS (3/3 tests)
- UI smoke test (`tests/integration/app/run-desktop-ui-smoke-test.sh`): PASS
- Typecheck (`npx tsc --noEmit`): exit 0
- Lint (`npm run lint`): exit 0
- Diff whitespace check (`git diff --check`): exit 0
- Regression suites:
  - `npm run test:m3:google-api-adapters`: PASS (`PASS GOOGLE-API-001`)
  - `npm run test:m3:google-credentials`: PASS (`PASS GOOGLE-CREDENTIAL-001`)
  - `npm run test:m5:desktop-multisource`: PASS (`PASS DESKTOP-EXECUTION-CANCEL-001`, `PASS DESKTOP-EXECUTION-DOMAIN-001`, `PASS DESKTOP-MULTISOURCE-001`)
  - `npm run test:m5:desktop-retry-export`: PASS (`PASS DESKTOP-RESUME-001`, `PASS DESKTOP-CANCEL-001`, `PASS DESKTOP-RETRY-EXPORT-001`)
  - `npm run test:m6:data-package`: PASS (`PASS DATA-PACKAGE-001`)
  - `npm run test:m3:gt-core-runner`: PASS (14 tests passed)
  - `npm run test:m3:gt-batch-core-runner`: PASS (5 tests passed)
  - `npm run test:m2:gate`: PASS (19 tests passed)
- Full release gate:
  - `npm run test:release:gate`: `PASS RELEASE-GATE-001` (exit 0)

Provider safety:

- No live provider request ran (no Google Ads, GSC, Google Trends, SerpApi, or Bitkimark live network traffic).
- No provider quota was consumed.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Unresolved backlog findings outside WG1:

1. **GSC production request-binding mismatch:**
   In `src/main/app/production-collection-runtime.ts` and `src/main/sources/google-api/google-api-runtime.ts`, Google Search Console adapter creation requires constructor-injected `start_date` and `end_date` rather than dynamically binding query parameters from Job `source_context` during `collect(context)`.
2. **Generic export / `load_datasets` gap:**
   Multi-source Data Package export lacks generalized dataset loader coverage for non-Google-Trends production sources.

Exact recommended next work group:

- **Next recommended bounded slice: Google Search Console (GSC) Query × Page Request-Binding.**
- Align GSC with the dynamic Job `source_context` request-binding pattern established in WG1, migrating `GoogleSearchConsoleQueryPageSource.collect()` to extract `start_date` and `end_date` dynamically from Job context, removing constructor-injected date coupling from `GoogleApiRuntimeFactory` and `production-collection-runtime.ts`, while preserving all GSC Current/Long date policies and pagination contracts.
- Obtain explicit user approval before starting implementation.

---

## 32. Google Search Console Query × Page — Reviewed + Request-Bound Execution checkpoint — 2026-09-18

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical. The standing Release 1.0 continuation authorization supersedes older intermediate approval gates for the remaining accepted roadmap.

Technical implementation commit:

`c745646 feat(gsc): bind reviewed date range to query page request`
(`c745646216f88bd93c4b8e7334b000bee8d8908a`)

Bounded implementation scope:

- `GoogleSearchConsoleSource.collect(context)` builds its request from the persisted Job `source_context` and calls `fetchGscQueryPage(request, this.requester)`.
- Absolute reviewed dates are read from `requested_date_start` and `requested_date_end`; constructor-level date coupling was removed.
- Production `LazyWorkspaceSource` composition no longer extracts or injects request dates while constructing the source.
- GSC Current and GSC Long remain distinct reviewed task modes over the existing Query × Page source.
- Current mode preserves `TODAY_MINUS_90_TO_YESTERDAY`; Long mode preserves `TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY`.
- Review resolves the requested date range once, Start consumes the exact reviewed artifact, and advancing the clock after Review does not recalculate the dates.
- Repository close/reopen preserves the reviewed Job context.
- Repeated explicit collection contexts do not leak stale dates.
- Missing, malformed, invalid, or reversed date context fails before provider execution.
- Query × Page dimensions and existing pagination semantics remain unchanged.
- No schema migration was required.
- Verified invariant:
  `what the user reviewed = what the Job persisted = what Start executed = what the GSC provider request requested`.

Accepted verification evidence for this already-verified feature commit:

- Focused GSC reviewed/request-bound suite: PASS.
- Google API adapter regression: PASS.
- Google credential composition regression: PASS.
- Google Ads reviewed/request-bound regression: PASS.
- Relevant desktop multi-source regression: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS.
- `npm run test:release:gate`: `PASS RELEASE-GATE-001`.
- `git diff --check`: PASS.
- The focused GSC suite is wired into `tests/integration/release/run-release-gate.sh`.

Provider safety:

- No live provider request ran and no provider quota was consumed.

Scope claims intentionally not made:

- Full GSC Release 1.0 Definition of Done is not claimed.
- Limited live GSC acceptance is not complete.
- Generic multi-source export completion is not claimed.
- Freshness lifecycle completion is not claimed.
- Release 1.0 completion is not claimed.

Known shared backlog:

- Generic Data Package/export abstractions exist.
- `DesktopMultiSourceController.exportRun` expects a `load_datasets` dependency.
- Current production `DesktopMultiSourceController` composition does not inject `load_datasets`, so non-Google-Trends production dataset loading through that generic path remains unwired.
- Generic export is therefore partially implemented, not absent and not complete.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next action:

- Integrate this completed GSC feature and documentation checkpoint into local `main` by fast-forward.
- Continue with the accepted bounded Release 1.0 sequence, beginning with a live-repository audit of the Google Ads Keyword Planner official API vertical.
- Determine the smallest remaining truthful gap before writing a focused failing test; do not bundle the manual CSV fallback into that official-API slice.

---

## 33. Google Ads Keyword Planner — Reviewed + Request-Bound Official API checkpoint — 2026-09-18

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical.

Technical implementation commit:

`79ca5a2 feat(keyword-planner): bind reviewed groups to API requests`

Bounded implementation scope:

- Task `keyword-planner-historical-metrics` now exposes an explicit named keyword-group input in the desktop Task Detail flow.
- The renderer accepts user-provided groups only; it does not choose, rank, infer, or recommend keywords.
- Each input line preserves an explicit lowercase `group_id`, human-readable `group_name`, and ordered keyword list.
- Review materializes one immutable official-API Job context per named group with:
  - `task_id`: `keyword-planner-historical-metrics`
  - `source_id`: `google-keyword-planner`
  - `source_mode`: `OFFICIAL_API`
  - `group_id`
  - `group_name`
  - ordered `keywords`
- Duplicate group IDs, missing group fields, empty keyword lists, blank keywords, source/task/mode mismatches, and malformed contexts fail closed before Start/provider access.
- `GoogleKeywordPlannerSource.collect(context)` now builds each request from the persisted Job `source_context`; constructor-captured keyword coupling was removed from `GoogleApiRuntimeFactory` and production composition.
- Repeated calls against one source instance bind only the context supplied for that call and do not leak stale keyword groups.
- The exact reviewed groups survive Start, SQLite persistence, and repository close/reopen unchanged.
- Production Core execution sends one bounded `GenerateKeywordHistoricalMetrics` request per reviewed group through the existing authenticated Google Ads request boundary.
- Each group receives a distinct deterministic raw JSON filename, preventing same-source multi-Job artifact collisions while preserving independent canonical evidence.
- Existing Keyword Planner normalization preserves nullable provider metrics, monthly rows, and monetary-micros conversion; the existing source-keyed validator and operational error mapping remain in use.
- The focused suite is wired into `tests/integration/release/run-release-gate.sh`.

TDD evidence:

- Initial `KEYWORD-PLANNER-SOURCE-CONTEXT-001` RED failed because `GoogleApiRuntimeFactory.createKeywordPlannerSource` required constructor keywords and ignored `collect(context)`.
- Initial `KEYWORD-PLANNER-REVIEW-BOUND-001` RED failed because Keyword Planner Review returned no reviewed artifact.
- A later fail-closed RED proved duplicate groups still produced two generic Jobs; the planner was tightened so malformed or duplicate reviewed groups produce zero Jobs and `can_start = false`.
- `KEYWORD-PLANNER-REVIEW-UI-001` proves explicit groups are required, transported to Review exactly, displayed before execution, and the exact reviewed artifact is sent to Start.

Fresh verification after the final fail-closed correction:

- Focused Keyword Planner suite: PASS (2/2 tests).
- `npm run test:m3:google-api-adapters`: PASS (`PASS GOOGLE-API-001`).
- `npm run test:m3:google-credentials`: PASS (`PASS GOOGLE-CREDENTIAL-001`).
- `npm run test:m5:desktop-multisource`: PASS.
- `npm run test:m5:desktop-retry-export`: PASS.
- `npm run test:m6:data-package`: PASS.
- Desktop UI smoke: `PASS KEYWORD-PLANNER-REVIEW-UI-001` and `PASS DESKTOP-UI-001`.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0.
- `git diff --check`: exit 0.
- `npm run test:release:gate`: `PASS RELEASE-GATE-001` (exit 0).

Provider safety and remaining acceptance:

- No live Google Ads/Keyword Planner or other provider request ran and no provider quota was consumed.
- Limited live Keyword Planner acceptance remains incomplete and requires a configured intended Workspace/account with safe bounded access.
- Keyword Planner manual CSV fallback remains a separate unimplemented/reality-audit slice and was not blended into this official-API checkpoint.
- This checkpoint does not claim the generic multi-source export loader gap, freshness lifecycle, or Release 1.0 as complete.

Stable documentation:

- No stable canonical document changed because the implementation conforms to the already-approved official-API, raw-preservation, group-context, and missing-value contracts.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next action:

- Commit this Section 33 documentation checkpoint separately and fast-forward the feature branch into local `main`.
- Continue with a bounded reality audit of the shared `FILE_IMPORT` boundary and the existing İkas Products vertical.
- Reuse the already-implemented native trusted-IPC file selection, reviewed file-path persistence, raw XLSX preservation, production parser mapping, and validator; write a focused RED only for the smallest remaining end-to-end gap proven by current repository evidence.
- If the shared `FILE_IMPORT` seam and İkas vertical cannot remain one coherent slice, split them without expanding the abstraction beyond current R1 consumers.

---

## 34. Shared FILE_IMPORT + İkas Products reviewed vertical checkpoint — 2026-09-18

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical.

Technical implementation commit:

`52eb497 feat(ikas): bind reviewed file import to Core`

Bounded implementation scope:

- The existing native trusted-IPC Products XLSX selection remains the user-intent boundary; the renderer does not read files.
- İkas Quick Run now sends task identity plus the exact selected absolute path to Review.
- Review produces a non-null immutable reviewed artifact with:
  - `task_id`: `ikas-products-import`
  - `source_id`: `ikas-products`
  - `source_mode`: `FILE_IMPORT`
  - exact selected `file_path`
- Start receives the exact reviewed artifact rather than falling back to the mutable draft.
- Older saved İkas configurations containing only `{ included, file_path }` are enriched into the current reviewed context; explicit mismatched task/source/mode values still fail closed.
- Relative, blank, malformed, missing, directory, and non-regular-file inputs do not become successful imported datasets.
- A minimal shared `FILE_IMPORT` evidence reader now validates an absolute regular local file and reads its exact bytes.
- File extension remains a UI affordance, not proof of content validity; unsupported/non-XLSX bytes are preserved as candidate evidence and rejected through the existing İkas parser/validator contract.
- `IkasProductsSource.collect(context)` now binds the persisted Job `source_context`; constructor-captured file-path coupling and production connection fallback were removed.
- The exact selected path survives Review, Start, SQLite persistence, and repository close/reopen.
- Production Core preserves an immutable raw XLSX copy before validation.
- Deterministic evidence proves the raw artifact bytes equal the selected fixture and the original selected file is not mutated.
- The existing production 40-column parser mapping, nullable values, source-native availability, image/product URL separation, and validator remain unchanged.
- The focused FILE_IMPORT + İkas suite is wired into `tests/integration/release/run-release-gate.sh`.

TDD evidence:

- Initial `IKAS-FILE-CONTEXT-001` RED failed because `IkasProductsSource` captured constructor state and ignored `collect(context)`.
- Initial `IKAS-REVIEW-CORE-001` RED proved a relative path still produced a generic Job and Review had no locked artifact.
- A compatibility RED proved saved pre-task İkas paths initially returned no reviewed artifact; the controller now enriches those paths without weakening explicit mismatch checks.
- `IKAS-FILE-REVIEW-UI-001` proves the selected XLSX path is reviewed and Start receives the exact locked FILE_IMPORT artifact.

Fresh verification:

- Focused FILE_IMPORT + İkas suite: PASS (2/2 tests).
- `npm run test:m3:non-google-sources`: PASS (`PASS NON-GOOGLE-SOURCES-001`).
- Production source composition: PASS (`PASS PRODUCTION-SOURCE-COMPOSITION-001`).
- `npm run test:m5:file-access`: PASS.
- `npm run test:m5:desktop-multisource`: PASS.
- `npm run test:m5:desktop-retry-export`: PASS.
- `npm run test:m6:data-package`: PASS.
- Desktop UI smoke: `PASS IKAS-FILE-REVIEW-UI-001` and `PASS DESKTOP-UI-001`.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0.
- `git diff --check`: exit 0.
- `npm run test:release:gate`: `PASS RELEASE-GATE-001` (exit 0).

Live/input acceptance state:

- No live provider request ran and no provider quota was consumed.
- This checkpoint used sanitized deterministic XLSX fixtures; it did not import a new current user-selected production workbook.
- The previously verified production mapping evidence remains the latest real workbook mapping checkpoint and was not reopened.
- A current acceptance workbook selection/import remains an explicit local acceptance action when that file is available.

Scope not included:

- Keyword Planner manual CSV parsing/import remains a separate FILE_IMPORT source-mode slice.
- Generic production multi-source dataset loading/export, freshness lifecycle, and Release 1.0 completion are not claimed.

Stable documentation:

- No stable canonical document changed because this implementation conforms to the approved FILE_IMPORT, raw-preservation, and İkas data contracts.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next action:

- Commit this Section 34 documentation checkpoint separately and fast-forward the feature branch into local `main`.
- Audit the existing repository for any Keyword Planner manual CSV fallback foundations and sanitized/real-shape fixture evidence.
- Implement the fallback as a distinct `FILE_IMPORT` acquisition/source mode using the shared evidence reader, preserving original UTF-16 tab-separated bytes and blank metrics as `NULL`.
- Do not blend manual-import provenance with the completed Keyword Planner official-API path.

---

## 35. Keyword Planner manual CSV reviewed FILE_IMPORT checkpoint — 2026-09-18

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical.

Implementation plan commit:

`ea1cb34 docs: plan Keyword Planner manual CSV fallback`

Technical implementation commit:

`9670b2d feat(keyword-planner): add reviewed manual CSV fallback`

Observed provider evidence:

- The read-only local provider export `Keyword Stats 2026-09-08 at 16_21_37.csv` was inspected before implementation.
- The file is UTF-16LE with a BOM and tab-delimited despite the `.csv` extension.
- It has two provider metadata lines, the observed 26-column header, two leading segmentation aggregate rows, Turkish localized competition labels, comma-decimal bid values, and 12 consecutive monthly search columns.
- The implemented parser was run directly against that unchanged file after the deterministic fixture suite passed.
- Real-evidence structural result: 43 keyword rows, 2 segmentation rows, 12 monthly columns, and 26 rows whose blank average monthly search value remained `NULL`.
- The raw user keywords and complete raw export were not copied into the repository; deterministic tests construct a sanitized derivative of the observed structure in memory.

Bounded implementation scope:

- A distinct desktop/Core source `google-keyword-planner-csv` now represents the manual fallback with `FILE_IMPORT` acquisition and the same logical `KEYWORD_HISTORICAL_METRICS` dataset family.
- The official API source `google-keyword-planner` remains unchanged and retains `OFFICIAL_API` provenance.
- Task `keyword-planner-manual-csv-import` exposes native trusted-IPC `.csv` selection and requires an explicit selected file before Review.
- Review produces a non-null immutable artifact with the exact absolute `file_path`, manual task/source identity, and `FILE_IMPORT` mode.
- Start persists that exact context into one Job; relative paths, task/source/mode mismatches, directories, missing files, malformed contexts, and non-regular files fail closed.
- Collection uses the shared FILE_IMPORT evidence reader and copies the original bytes unchanged into run-scoped evidence before parsing.
- Validation reads the stored artifact, not the source path, and accepts only the observed UTF-16LE+BOM, tab-delimited Keyword Stats shape.
- Required fixed headers and exactly 12 consecutive `Searches: Mon YYYY` columns are enforced.
- Provider metadata and leading segmentation rows are handled explicitly; segmentation rows after keyword data begins fail closed.
- Quoted tabular values, localized comma-decimal bids, percent values, competition/index values, and monthly history are normalized deterministically.
- Blank averages, bids, competition/index, percent changes, and monthly searches remain `NULL`; zero remains numeric zero.
- UTF-8 masquerading as the export, unrelated content, missing headers, malformed quoting, unsupported numeric cells, partial rows, and invalid segmentation placement fail closed.
- The exact selected raw bytes remain unchanged both in the original selected file and in the accepted Core artifact.
- The focused parser/source/Core suite is wired into `tests/integration/release/run-release-gate.sh` and exposed as `npm run test:m3:keyword-planner-csv`.

TDD evidence:

- Initial parser RED failed because `keyword-planner-csv-parser.ts` did not exist.
- The first negative-path run exposed an ineffective partial-row fixture mutation; the fixture was corrected before parser behavior was changed.
- Initial Core RED failed because the manual CSV source module did not exist.
- Initial UI RED failed because the manual CSV task card was absent.
- `KEYWORD-PLANNER-CSV-PARSER-001/002` prove observed-shape normalization, blank-to-NULL behavior, and fail-closed malformed/unrelated input handling.
- `KEYWORD-PLANNER-CSV-SOURCE-001` proves each collection binds only its explicit reviewed path and preserves exact bytes.
- `KEYWORD-PLANNER-CSV-CORE-001` proves Review → Start → SQLite → production Core validation with distinct FILE_IMPORT provenance.
- `KEYWORD-PLANNER-CSV-UI-001` proves explicit selection, missing-file gating, exact Review payload, visible reviewed filename, and unchanged Start artifact.

Fresh verification:

- Focused manual CSV suite: PASS (4/4 tests).
- Direct parser run against unchanged real provider evidence: PASS with structural counts recorded above.
- Desktop UI smoke: `PASS KEYWORD-PLANNER-CSV-UI-001` and existing UI checks.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0.
- `git diff --check`: exit 0.
- `npm run test:release:gate`: `PASS RELEASE-GATE-001` (exit 0).

Provider safety and remaining acceptance:

- No live Google Ads, Google Trends, GSC, SerpApi, Bitkimark, or other provider request ran; no provider quota was consumed.
- This is a real-file local parsing acceptance for the manual fallback, not a live provider/API acceptance.
- Limited live Keyword Planner API acceptance remains separately incomplete and requires a configured intended Workspace/account with explicit bounded access.

Scope not included:

- Generic production multi-source dataset loading/export remains incomplete.
- Freshness lifecycle completion remains incomplete.
- Release 1.0 completion is not claimed.

Stable documentation:

- No stable canonical document changed because this implementation follows the already-approved Keyword Planner fallback, FILE_IMPORT, raw-preservation, validation, provenance, and null-semantics contracts.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next action:

- Commit this Section 35 documentation checkpoint separately and fast-forward the feature branch into local `main`.
- Audit the existing Bitkimark `HTTP_XML` source, validator, live-smoke command guard, desktop Review/Start binding, and deterministic coverage against the Release 1.0 contract.
- Identify and implement only the smallest remaining truthful Bitkimark vertical gap, preserving the existing approved public sitemap/XML scope and avoiding live network access unless an explicit bounded acceptance is both required and authorized.

---

## 36. Bitkimark reviewed HTTP/XML vertical + limited live acceptance — 2026-09-18

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical.

Implementation plan commit:

`e581944 docs: plan Bitkimark reviewed HTTP XML vertical`

Technical implementation commit:

`123a8bd feat(bitkimark): complete reviewed HTTP XML vertical`

Bounded implementation scope:

- The existing source remains `bitkimark-sitemap` with `HTTP_XML` acquisition and `SITEMAP_URLS` dataset semantics.
- Desktop Task Detail exposes only the evidence-backed sitemap URLs:
  - `https://bitkimark.com/sitemap.xml`
  - `https://bitkimark.com/blogs.xml`
  - `https://bitkimark.com/pages.xml`
  - `https://bitkimark.com/products.xml`
  - `https://bitkimark.com/collections.xml`
- The user may review a bounded subset only when the root sitemap is first; arbitrary same-host XML paths and foreign URLs do not become reviewable Jobs.
- Review locks one immutable context per sitemap with task/source identity, `HTTP_XML` mode, requested URL, expected host, and nullable parent sitemap URL.
- Start persists one sequential Job per reviewed URL. `BitkimarkSitemapSource.collect(context)` now binds only that Job context; constructor-captured URL coupling was removed.
- Each Job makes exactly one standard HTTPS request with redirects followed by the platform fetch implementation. No retry or discovered-link recursion occurs inside the source.
- Multi-Job raw artifacts use URL-derived deterministic hashes in filenames, preventing same-source/attempt collisions.
- Successful collection preserves exact response bytes plus acquisition metadata: requested URL, final URL, HTTP status, and response content type.
- `SourceCollectionResult` and source-neutral metadata gained an optional JSON-safe `acquisition_metadata` field; sources that omit it retain their existing output shape.
- Validation receives acquisition metadata before artifact acceptance and rejects missing/mismatched requested URL, non-2xx status, non-XML content type, or a final URL outside the verified HTTPS host boundary.
- Parser/validator support both standard sitemap-index and URL-set documents, document kind, `loc`, nullable valid ISO `lastmod`, entry type, parent sitemap relationship, and the already-approved deterministic URL annotations.
- Malformed XML, HTML/DOCTYPE content, unsupported roots/namespaces, missing or duplicate `loc`, duplicate URLs, invalid dates, insecure/foreign URLs, and unverified child sitemap URLs fail closed.
- Sitemap-index parsing never fetches children. Reviewed children remain separate traceable Core Jobs.
- Production readiness is `READY` for this public fixed-scope source and does not require a credential/connection record.
- The guarded live command was migrated to the same strict Job context, parser, validator, and acquisition-metadata contract while retaining exact confirmation and one-request/no-retry behavior.
- The focused suite and production source composition regression are wired into `tests/integration/release/run-release-gate.sh`.

TDD and regression evidence:

- Initial `BITKIMARK-*` RED failed because the strict request-context module did not exist.
- The first implementation compile exposed and fixed an explicit missing-document-element/nullability path.
- Initial Core RED proved production still constructed the source with a URL and the validator still used the old parser signature.
- Initial UI RED proved the task exposed no bounded reviewed URL input.
- `BITKIMARK-PARSER-001/002` prove index/URL-set semantics and fail-closed malformed/unrelated/foreign/duplicate/date behavior.
- `BITKIMARK-SOURCE-CONTEXT-001` proves one request per explicit context, HTTP metadata capture, pre-fetch rejection, and no stale URL reuse.
- `BITKIMARK-VALIDATOR-001` proves parseable XML cannot hide missing or mismatched HTTP provenance.
- `BITKIMARK-REVIEW-CORE-001` proves Review → Start → SQLite → two sequential requests → distinct immutable artifacts → validation → source-neutral metadata.
- `BITKIMARK-REVIEW-UI-001` proves bounded URL editing, foreign-host rejection, exact Review display, and unchanged Start transport.
- Existing `PASS NON-GOOGLE-SOURCES-001`, `PASS BITKIMARK-LIVE-CMD-001`, source-neutral Core, multi-source Run, and production source composition regressions pass.
- A stale production-composition expectation omitted the already-merged Keyword Planner CSV source; the assertion was updated to match the verified production registry and now passes.

Fresh deterministic verification:

- Focused reviewed Bitkimark suite: PASS (5/5 tests).
- `npm run test:m3:non-google-sources`: PASS.
- Guarded command regression: `PASS BITKIMARK-LIVE-CMD-001`.
- Source-neutral Core: `PASS SOURCE-NEUTRAL-001`.
- Multi-source Run: `PASS MULTI-SOURCE-RUN-001`.
- Production source composition: `PASS PRODUCTION-SOURCE-COMPOSITION-001`.
- Desktop UI smoke: `PASS BITKIMARK-REVIEW-UI-001` and existing UI checks.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0.
- `git diff --check`: exit 0.
- `npm run test:release:gate`: `PASS RELEASE-GATE-001` (exit 0).

Limited live acceptance:

- Command executed exactly once with explicit confirmation:
  - `npm run m3:live-bitkimark-sitemap-smoke -- --confirm-live-collection --sitemap-url https://bitkimark.com/sitemap.xml`
- Result: `HTTP_SUCCESS`, 567 bytes, SHA-256 `0da8af1d104f0907ee1adcf94ea115e01a77fd77fb4b4b33b0eb4b99b2391355`, validation `VALID`, four sitemap-index entries, and no annotations at the index level.
- Exactly one public root-sitemap request ran. No child sitemap was fetched, no retry occurred, and raw XML was not printed.
- The acceptance command uses a temporary validation file and truthfully reports `raw_artifact_persisted: false`; production Core raw persistence is proven separately by deterministic integration.
- No credentialed provider request or quota-bearing request ran.

Scope not included:

- Broad crawling, arbitrary XML URLs, discovery-driven child collection, and non-sitemap content remain unsupported.
- Freshness lifecycle, generic production dataset loading/export, and Release 1.0 completion remain incomplete.

Stable documentation:

- No stable canonical document changed because the implementation conforms to the already-approved HTTP/XML, raw-preservation, acquisition-provenance, sitemap relationship, annotation, and validation contracts.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next action:

- Commit this Section 36 documentation checkpoint separately and fast-forward the feature branch into local `main`.
- Audit the existing SerpApi on-demand source, reviewed query input, credential/quota readiness, provider request binding, raw JSON/validation, guarded live command, and desktop/Core integration against the Release 1.0 contract.
- Implement only the smallest remaining truthful SerpApi vertical gaps. Do not add continuous tracking, automatic full-keyword refresh, intent classification, commercial-fit scoring, page-type recommendations, or any other analysis-layer output.

---

## 37. SerpApi reviewed on-demand vertical — 2026-09-18

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical.

Implementation plan commit:

`c090f88 docs: plan SerpApi reviewed on-demand vertical`

Technical implementation commit:

`c5e301e feat(serpapi): bind reviewed on-demand queries`

Bounded implementation scope:

- The existing `serpapi` source remains `THIRD_PARTY_API` acquisition with `GOOGLE_SERP` dataset semantics and Workspace-scoped encrypted credential resolution.
- Desktop Task Detail now accepts only an explicit on-demand batch in `query-id | query` form; it does not prefill or expand a keyword universe.
- Query IDs must be unique safe Job keys and queries must be non-empty bounded strings. Invalid or duplicate rows do not become reviewable.
- Review materializes one immutable strict context per query: task/source/mode/dataset identity, Job key, query, `TR`, `tr`, desktop, Google, first page, first-ten organic limit, and the Review-day local snapshot date.
- Start consumes the exact reviewed artifact without recalculating the snapshot date or query batch. Repository close/reopen preserves identical Job contexts.
- Production planning accepts only the strict reviewed context and creates one independently retryable sequential Job per explicit query.
- `SerpApiSource.collect(context)` verifies the persisted Job key and every locked identity/scope field before credential resolution or provider access.
- Production runtime supports deterministic requester injection for full Review → Start → SQLite → Core request-binding verification without live quota.
- Each accepted Job preserves independent raw provider JSON and validates the returned query, country, language, device, engine, and first-page offset against its reviewed request.
- Missing provider request context, wrong query/scope, invalid positions, malformed fields, and non-success/provider-error payloads fail closed.
- A successful response with zero organic results remains `NO_DATA`, distinct from provider/quota/transport failure.
- Quota/rate/authentication/provider/timeout outcomes retain existing one-attempt stop behavior; no source-level automatic retry or evasion was added.
- Review visibly lists exact query IDs/text and the fixed scope before Start.
- No intent, commercial-fit, page-type, action recommendation, continuous rank tracking, automatic refresh, or analysis-layer output was added.
- The guarded single-query live command now records its execution-day local snapshot date instead of the obsolete fixed development date while preserving its explicit confirmation/workspace guard.
- The focused Core suite is exposed as `npm run test:m3:serpapi-reviewed` and wired into the full release gate.

TDD and regression evidence:

- Initial source-contract RED failed because `serpapi-request.ts` did not exist.
- Initial reviewed Core RED proved the generic planner accepted duplicate arbitrary query objects and produced Jobs without a reviewed artifact.
- Initial desktop UI RED timed out because no SerpApi query input existed.
- A response-context RED proved missing `search_parameters` was silently tolerated; validation now requires and matches the full provider request context.
- `PASS SERPAPI-001` covers strict pre-request rejection, raw JSON, first-ten organic/PAA normalization, nullable fields, no-data distinction, readiness, quota stop, and strict Job planning.
- `SERPAPI-REVIEW-CORE-001` proves exact Review/Start persistence, repository reopen, one request per Job, fixed request URL scope, credential exclusion from snapshots, separate raw evidence, and valid Core completion.
- `SERPAPI-REVIEW-UI-001` proves missing-batch gating, exact named-query input, visible locked scope, and unchanged reviewed Start transport.
- `SERPAPI-LIVE-CMD-001` proves unconfirmed or unsupported live execution exits before Electron/provider activity.

Fresh deterministic verification:

- `npm run test:m3:serpapi`: PASS.
- `npm run test:m3:serpapi-reviewed`: PASS (1/1 Core integration test).
- `npm run test:m3:live-serpapi-command`: PASS.
- Desktop UI smoke: `PASS SERPAPI-REVIEW-UI-001` and all existing UI checks.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0.
- `git diff --check`: exit 0.
- `npm run test:release:gate`: `PASS RELEASE-GATE-001` (exit 0).

Live acceptance status:

- A read-only query of the actual RoofRoom application database found two Workspaces: `Development migration workspace` and `Bitkimark Production`.
- Neither Workspace has a `serpapi` connection row or credential reference.
- Therefore no guarded live request was run and no SerpApi quota was consumed. Live acceptance remains truthfully blocked on configuring the intended Workspace connection and encrypted API key.
- No secret value or credential reference was printed or copied into repository state.

Scope not included:

- No continuous scheduler, automatic entire-keyword refresh, rank-history analysis, or freshness inference was introduced.
- Freshness lifecycle completion and generic production dataset loading/export remain incomplete.
- Release 1.0 completion is not claimed.

Stable documentation:

- No stable canonical document changed because the implementation conforms to the approved on-demand, raw-preservation, validation, credential, quota-safety, and collection-only boundaries.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next action:

- Commit this Section 37 documentation checkpoint separately and fast-forward the feature branch into local `main`.
- Audit Work Group 11 freshness/due/import-needed/on-demand behavior against the now-implemented real source modes and current Core/desktop contracts.
- Implement only the smallest source-neutral freshness vertical supported by existing accepted evidence; do not infer unsupported provider schedules or conflate freshness with readiness, execution, or validation.

---

## 38. Source-neutral freshness lifecycle — 2026-09-19

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical.

Implementation plan commit:

`7d453dc docs: plan source-neutral freshness lifecycle`

Technical implementation commit:

`855de25 feat(core): add source-neutral freshness lifecycle`

Implemented and verified:

- Core now exposes the source-neutral freshness states `FRESH`, `DUE`, `STALE`, `IMPORT_NEEDED`, `ON_DEMAND`, and `UNKNOWN` independently from readiness, execution, and validation.
- Freshness policies are unknown, on demand, manual import, or an explicit bounded interval with separate due and stale thresholds.
- Last success is derived from the latest source Job that is completed, has an accepted artifact, and has validation status `VALID`, `LOW_DATA`, or `NO_DATA`. No new table or cached duplicate state was introduced; SQLite remains schema v8.
- Candidate persistence, rejected/failed validation, readiness, and provider access do not advance freshness.
- Clock-dependent evaluation uses an injected clock, exact canonical UTC timestamps, and exact due/stale boundaries. Invalid timestamps and unsafe interval configuration fail closed.
- SerpApi is always on demand and cannot be converted to periodic tracking through source configuration.
- İkas and Keyword Planner CSV default to manual-import semantics: `IMPORT_NEEDED` before the first accepted import and `FRESH` afterward.
- Other sources remain `UNKNOWN` unless safe source configuration carries an explicit bounded interval policy. No provider cadence was invented.
- Desktop source cards and Task Detail show readiness and freshness as separate labels, plus nullable last-success and next-due timestamps.
- Freshness is informational only. It does not schedule, start, retry, or block reviewed work.

TDD and regression evidence:

- Initial calculator RED failed because the freshness contract/evaluator did not exist.
- Initial accepted-history RED failed because the repository exposed no source-scoped accepted-completion query.
- Initial desktop RED failed because source cards had no freshness fields.
- Initial renderer RED failed because the UI did not show freshness separately from readiness.
- `FRESHNESS-CALCULATOR-001/002`, `FRESHNESS-ACCEPTANCE-001`, `FRESHNESS-REGISTRY-001`, and `FRESHNESS-DESKTOP-001` pass.
- Desktop UI smoke reports `PASS FRESHNESS-UI-001` alongside the existing source-specific checks.
- Relevant generalized desktop regressions pass.

Fresh deterministic verification:

- `npm run test:m4:freshness`: PASS.
- Desktop UI smoke: PASS.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0.
- `git diff --check`: exit 0.
- `npm run test:release:gate`: `PASS RELEASE-GATE-001` (exit 0).

Live-provider status:

- No live provider request ran. The freshness lifecycle is fully deterministic and derives state only from local accepted evidence and explicit safe policy.

Stable documentation:

- `ARCHITECTURE.md`, `DATA_CONTRACTS.md`, `TEST_STRATEGY.md`, and ADR-055 now record the implemented derived freshness contract and schema-v8 boundary.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next action:

- Commit this Section 38 documentation checkpoint separately and fast-forward the feature branch into local `main`.
- Audit the unified multi-source desktop workflow against Work Group 12 and implement only remaining truthful usability/visibility gaps without redesigning the application.
- Then bind generic production dataset loading to the already-defined source-separated Data Package exporter and perform the final Release 1.0 reality/hardening pass.

---

## 39. Unified desktop accepted-evidence action — 2026-09-19

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical.

Implementation plan commit:

`370c1a1 docs: plan unified desktop evidence action`

Technical implementation commit:

`3b136aa feat(desktop): open accepted run evidence`

Audit result and bounded scope:

- The existing desktop already verifies the unified source catalog, readiness/freshness distinction, source-specific reviewed Quick Runs, immutable Review → Start handoff, persisted progress, manual continuation, resume/retry/cancel, Run History, validation status, and terminal export actions.
- The remaining concrete Work Group 12 usability gap was opening canonical accepted evidence from a completed Job.
- Run Detail now exposes `Open Accepted Evidence` only when the persisted Job has an `accepted_artifact_id`.
- The renderer sends only exact `run_id` and `job_id`; it never receives or supplies an unrestricted filesystem path.
- Core verifies Run existence, Job membership, the exact linked artifact identity, matching source ownership, `RAW_SOURCE_FILE` kind, and accepted/accepted-with-warning state before delegating to the privileged opener.
- Production resolves the run-relative path through `StorageManager`, rejects missing files, directories, and symbolic links, and opens the canonical file through Electron.
- Cross-Run, missing-Job, missing-artifact, rejected/non-raw, and unavailable-opener cases fail closed.
- No application redesign, source behavior change, schema migration, scheduler, or provider request was introduced.

TDD and verification evidence:

- Controller RED: `openAcceptedArtifact` did not exist.
- Renderer RED: a completed historical Job exposed no accepted-evidence action.
- `PASS DESKTOP-ACCEPTED-EVIDENCE-001` proves exact Run/Job/artifact binding plus missing-evidence and cross-Run rejection.
- Desktop UI smoke proves the button appears only for accepted evidence and sends only the persisted Run/Job identity.
- Existing desktop resume, cancellation, retry/export, readiness/freshness, reviewed Quick Run, and source-specific UI smoke checks remain passing.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0.
- `git diff --check`: exit 0.
- `npm run test:release:gate`: `PASS RELEASE-GATE-001` (exit 0).

Provider safety:

- No live provider request ran and no provider quota was consumed.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next action:

- Commit this Section 39 documentation checkpoint separately and fast-forward the feature branch into local `main`.
- Implement the production generic multi-source dataset loader and provenance-preserving Data Package output for accepted Jobs across the implemented Release 1.0 source set.
- Then perform the final Release 1.0 reality audit, packaging/hardening verification, and truthfully separate deterministic completion from outstanding credentialed live acceptance.

---

## 40. Generic production multi-source Data Package export — 2026-09-19

This section is the authoritative latest repository-state update. Earlier current-stage and next-action sections are historical.

Implementation plan commit:

`819aa80 docs: plan generic data package export`

Technical implementation commit:

`9020117 feat(export): load accepted multi-source datasets`

Implemented production boundary:

- `DesktopMultiSourceController` production composition now receives a real `load_datasets` dependency instead of silently exporting an empty package.
- Export is privileged and terminal-Run-only even if IPC/UI gating is bypassed.
- `ProductionDataPackageLoader` considers only Jobs that are completed, have `VALID`, `LOW_DATA`, or `NO_DATA` validation, and link an accepted raw artifact.
- Every raw artifact is rechecked for exact Run/Job/source ownership, `RAW_SOURCE_FILE` kind, accepted state, regular non-symlink file, persisted byte size, and SHA-256 before parsing.
- The loader reuses the verified source parser/normalizer for all eight production source IDs:
  - Google Trends → `INTEREST_OVER_TIME`
  - Google Search Console Query × Page → `QUERY_PAGE`
  - Google Ads Search Terms → `SEARCH_TERMS`
  - Google Keyword Planner official API → `KEYWORD_HISTORICAL_METRICS`
  - Google Keyword Planner manual CSV → `KEYWORD_HISTORICAL_METRICS`
  - İkas Products XLSX → `PRODUCTS`
  - Bitkimark Sitemap/XML → `SITEMAP_URLS`
  - SerpApi → `GOOGLE_SERP`
- One accepted Job produces one source-native dataset. No cross-source row join or analysis output is introduced.
- Every dataset carries exact `job_id` and `job_key`; the physical filename includes both, preventing same-source/same-dataset overwrite.
- `DATASETS.json` persists each dataset filename, source/dataset/Job identity, row count, and provenance including raw artifact identity/checksum, validation status, acquisition time, and sanitized requested context.
- `MANIFEST.json` and `FAILURES.json` remain explicit. Export All retains safe failed/cancelled/validation-failure context; Successful Only omits it.
- Accepted normalized rows preserve source-native nulls, units, relative-interest semantics, query-group/Job identity, sitemap relationships, and provider-specific fields.
- Mismatched dataset identity, unknown source loaders, changed raw bytes, unsafe paths, non-terminal Runs, and unavailable production loading fail closed.

TDD and deterministic verification:

- Initial Data Package identity RED showed repeated same-source datasets had no Job identity and would share one filename; no provenance index was written.
- Initial production-loader RED failed because `production-data-package-loader.ts` did not exist.
- `PASS DATA-PACKAGE-IDENTITY-001` proves collision-safe repeated-Job files plus durable `DATASETS.json` provenance.
- `PASS PRODUCTION-DATA-PACKAGE-001` loads sanitized accepted artifacts for all eight sources, checks normalized semantics and NULL preservation, excludes local paths, and rejects same-size checksum tampering.
- `PASS DATA-PACKAGE-001` continues to prove mode/failure/NULL behavior and now covers date-mismatch/cancelled failure codes plus cross-Job identity rejection.
- `PASS DESKTOP-RETRY-EXPORT-001` covers privileged non-terminal rejection and the updated Job-keyed package files.
- The production loader suite is wired into `tests/integration/release/run-release-gate.sh`.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0.
- `git diff --check`: exit 0.
- `npm run test:release:gate`: `PASS RELEASE-GATE-001` (exit 0).

Provider safety:

- No live provider request ran and no provider quota was consumed.

Historical untracked files remain intentionally untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

Exact next action:

- Commit this Section 40 documentation checkpoint separately and fast-forward the feature branch into local `main`.
- Perform the final Release 1.0 reality audit against the specification, run packaging/build and deterministic release verification on the target Mac, inspect repository/worktree truth, and fix only concrete final hardening defects.
- Record deterministic implementation completion separately from provider-by-provider live acceptance that remains blocked on real Workspace configuration, credentials, inputs, or explicit quota-bearing execution.

---

## 41. FINAL Release 1.0 local hardening and reality audit — 2026-09-19

This section is the authoritative current repository state. Earlier current-stage and next-action statements are historical.

### A. Local implementation complete

Release 1.0 contains all eight approved production source identities and their source-native datasets:

| Source | Production mode | Dataset | Local implementation |
|---|---|---|---|
| `google-trends` | `GOOGLE_TRENDS_UI` / browser export | `INTEREST_OVER_TIME` | COMPLETE |
| `google-search-console-query-page` | `OFFICIAL_API` | `QUERY_PAGE` | COMPLETE |
| `google-ads-search-terms` | `OFFICIAL_API` (`search_term_view`, Search campaigns only) | `SEARCH_TERMS` | COMPLETE |
| `google-keyword-planner` | `OFFICIAL_API` | `KEYWORD_HISTORICAL_METRICS` | COMPLETE |
| `google-keyword-planner-csv` | `FILE_IMPORT` | `KEYWORD_HISTORICAL_METRICS` | COMPLETE |
| `ikas-products` | `FILE_IMPORT` | `PRODUCTS` | COMPLETE |
| `bitkimark-sitemap` | `HTTP_XML` | `SITEMAP_URLS` | COMPLETE |
| `serpapi` | `THIRD_PARTY_API` | `GOOGLE_SERP` | COMPLETE |

For every source, deterministic evidence covers task-catalog presence, explicit Review input, immutable Job context, production request/input binding, raw preservation, source-specific validation, operational-error separation, shared retry/resume behavior, desktop execution, accepted-evidence access, and production Data Package loading. Active physical cancellation is implemented only where a safe provider handle exists (currently the application-owned Google Trends browser); source-neutral inactive cancellation never fabricates provider interruption.

Freshness remains independent of readiness, execution, and validation. SerpApi is `ON_DEMAND`; İkas and manual Keyword Planner CSV default to manual-import semantics; other sources remain `UNKNOWN` unless an explicit bounded interval policy is configured.

### B. Deterministic verification complete

The final hardening branch and integrated local `main` were each verified with:

- `npx tsc --noEmit`: exit 0;
- `npm run lint`: exit 0;
- `npm run test:release:gate`: exit 0 with `PASS RELEASE-GATE-001`;
- `git diff --check`: exit 0.

The release gate includes the focused packaging-config regression (`GT-PACKAGE-001/002`), all source parsers/validators and reviewed production bindings, shared lifecycle/freshness/desktop behavior, the accepted-evidence action, generic Data Package identity, and the all-eight-source production loader fixture.

### C. Packaging complete for local Release 1.0

`npm run package` completes on the target Apple Silicon Mac and produces:

`out/RoofRoom Data Collector-darwin-arm64/RoofRoom Data Collector.app`

The audit found and fixed one concrete application packaging defect: Electron Forge's default Vite packaging allowlist omitted external Playwright runtime dependencies, and the inherited unsigned Electron bundle was not a valid final local signature. Commit `57f696c fix(package): include runtime dependencies` now keeps packaged Node runtime dependencies and applies fail-closed local ad-hoc signing with inherited hardened-runtime flags cleared for certificate-free local execution.

Fresh artifact verification proves:

- arm64 Mach-O application;
- `playwright` and `playwright-core` present in packaged `app.asar`;
- `codesign --verify --deep --strict` succeeds;
- an isolated copy outside the repository launches its main, renderer, GPU, and network utility processes, so repository `node_modules` cannot mask a missing packaged dependency.

Apple Developer ID signing and notarization require external Apple credentials and remain a separate distribution/release-channel action, not a blocker for the local Release 1.0 acceptance contract. No publish command ran.

### D. Live and real-input acceptance completed

- Google Trends: a fresh guarded `GT01` one-group collection completed on 2026-09-19 with `ARTIFACT_PRODUCED`, `VALID`, 15/15 checks, 2,692 preserved bytes, and SHA-256 `2bd5118dd4a06de1b482335f3d667f9f89cfaa2b82f83e203f99169a4438907c`. No refresh or retry ran.
- Google Search Console: a fresh guarded Current/90-day official-API collection completed for 2026-06-21 through 2026-09-18 with persisted Run/Job state, `VALID`, a 155,466-byte accepted raw artifact, and SHA-256 `9a8d2748967f16bb5ceb217e16617412ea8774f40c020c90a4a9137a625a9f0a`. No automatic retry ran.
- Keyword Planner manual CSV: the unchanged real provider export re-parsed as 43 keyword rows, two leading segmentation rows, 12 monthly columns, and 26 `NULL` average-monthly-search values; no keywords or raw provider rows were printed or copied into Git.
- İkas Products: the current real workbook re-parsed as sheet `Ikas Excel File`, 40 headers, 856 variant rows, 88 product groups, and zero parser issues; 16 missing sale prices, 41 missing stock values, and all 856 unavailable storefront URLs remained `NULL`.
- Bitkimark: the existing guarded one-request live root-sitemap acceptance from 2026-09-18 remains authoritative: HTTP success, 567 bytes, `VALID`, four root sitemap-index entries, zero child fetches, and no raw XML output. It was not repeated merely for duplication.

### E. Live acceptance still manual or blocked

The production database contains two Workspaces and exactly one configured source connection: the authorized Google Search Console connection used by the fresh acceptance above. No connection exists for Google Ads Search Terms, Keyword Planner official API, or SerpApi.

- Google Ads Search Terms: `MANUAL_ACTION_REQUIRED` — intended Google Ads customer/login-customer/developer-token-compatible connection is not configured.
- Keyword Planner official API: `MANUAL_ACTION_REQUIRED` — intended Google Ads account connection is not configured.
- SerpApi: `NOT CONFIGURED / MANUAL_ACTION_REQUIRED` — no Workspace connection or encrypted API key exists; no quota was spent.

These are provider/account acceptance blockers, not deterministic implementation failures. No credential was invented, no cookie/session was copied, and no CAPTCHA, 2FA, anti-bot, quota, or rate-limit control was bypassed.

### F. Explicitly deferred and out of Release 1.0

- Apple Developer ID signing, notarization, and remote publishing;
- Google Ads Performance Max or `campaign_search_term_view` collection;
- arbitrary spreadsheet imports, arbitrary website crawling, recursive live sitemap expansion, continuous SERP rank tracking, and unsupported Google Trends modes;
- Semrush, Merchant Center, GA4, and other sources that have not passed feasibility/scope gates;
- analysis, marketing, SEO, merchandising, ranking, or recommendation outputs.

### Audit discrepancy classification

Each discovered discrepancy received exactly one classification:

1. `IMPLEMENTATION DEFECT`: packaged external Playwright runtime omission and invalid local bundle signature — fixed by `57f696c`.
2. `TEST COVERAGE GAP`: packaging regression asserted Vite externalization but not Forge inclusion/signing behavior — fixed by `GT-PACKAGE-002`.
3. `DOCUMENTATION DRIFT`: `DATA_CONTRACTS.md` still named schema v6/a single source and `DECISIONS.md` indexed ADR-059 through ADR-065 without their bodies — corrected in the final documentation checkpoint.
4. `LIVE ACCEPTANCE BLOCKER`: absent Google Ads/Keyword Planner/SerpApi Workspace connections — recorded truthfully as manual/configuration work.
5. `EXPLICITLY DEFERRED / OUT OF R1`: distribution signing/notarization and unsupported modes/sources listed above.
6. `NO DEFECT — CONTRACT ALREADY SATISFIED`: all other audited R1 scope, acquisition, provenance, raw immutability, null semantics, validation, readiness/freshness, lifecycle, desktop privilege, accepted-evidence, and export contracts.

### Generic production Data Package reality check

Production composition injects `ProductionDataPackageLoader`. Fresh deterministic evidence proves accepted artifacts for all eight source identities are integrity-checked and parsed through source-native implementations; rejected/failed Jobs do not become successful datasets; Job identity prevents same-source overwrite; `NULL` stays missing; `DATASETS.json` preserves Run/Job/source/dataset/raw-checksum/request provenance; Export All retains unsuccessful Job accounting; raw files are not mutated; and the existing Google Trends exporter remains passing.

### Repository and security state

- Technical hardening commit: `57f696c fix(package): include runtime dependencies`.
- Final contract/handoff changes are committed separately and fast-forwarded into local `main`.
- Protected historical files remain untracked and unchanged:
  - `CODEX_HANDOFF_CURRENT.md`
  - `PROJECT_HANDOFF.pre-20260820.md`
- No credential, token, raw provider dataset, or user business record was added to Git.
- No remote push or publish occurred.

### Exact remaining Release 1.0 state

Release 1.0 local implementation, deterministic acceptance, target-Mac packaging, Google Trends/GSC/Bitkimark live acceptance, and real İkas/manual-Keyword-Planner input acceptance are complete. Provider-specific live acceptance remains `MANUAL_ACTION_REQUIRED` only for Google Ads Search Terms, Keyword Planner official API, and SerpApi because their intended Workspace connections/credentials are absent. There is no remaining local implementation blocker.

---

## 42. Post-R1 UX & Operations Hardening roadmap — 2026-09-22

This section is the authoritative current-state update for post-R1 product hardening. Earlier implementation checkpoints remain historical.

### Baseline

Release 1.0 local implementation remains complete at:

```text
f43ea48 docs: record final R1 local checkpoint
57f696c fix(package): include runtime dependencies
```

There is no reopened local R1 implementation blocker.

Google Ads Search Terms, Keyword Planner Official API, and SerpApi still require their intended external Workspace connections/credentials for limited live acceptance. Those external states do not invalidate the local R1 baseline.

### Approved UX hardening program

Packaged-application QA identified user-journey and usability gaps without disproving the verified Core/source architecture.

The active execution roadmap is `UX_OPERATIONS_HARDENING_PLAN.md`.

It defines UXH0 through UXH14 in three delivery waves:

```text
Wave A — UXH0–UXH6 — make tasks understandable and runnable
Wave B — UXH7–UXH11 — make collected work manageable
Wave C — UXH12–UXH14 — operational dashboard, polish, integrated hardening
```

Primary QA findings include:

- blocking readiness states without clear reason/remediation;
- incomplete user-facing Workspace connection management;
- developer-oriented primary editing flows for Keyword Planner and SerpApi;
- incomplete file-selection feedback;
- Bitkimark approved URLs exposed through free-form editing;
- operationally weak Run History presentation;
- task-level Recent Runs requiring binding verification;
- incomplete Preset editing lifecycle;
- editing/navigation safety requiring explicit verification;
- readiness, freshness, and application-health terminology creating avoidable cognitive ambiguity.

These findings authorize UX/product hardening only. Verified source adapters, Core lifecycle, persistence contracts, validation semantics, credential security, freshness semantics, and Data Package architecture remain closed unless new failing evidence requires a change.

### Development discipline

Every implementation slice continues to use:

```text
Repository audit
→ bounded plan
→ focused RED
→ intended failure
→ minimal implementation
→ focused GREEN
→ relevant regressions
→ typecheck / lint / diff check
→ full deterministic release gate
→ package/smoke when required
→ technical commit
→ handoff update
→ documentation commit
→ fast-forward local main
→ post-merge verification
```

### Exact next action

Start **UXH0 — UX Reality Lock**.

UXH0 is read-only/product-contract work:

1. inspect current live repository and packaged desktop behavior;
2. build the task-by-task capability matrix;
3. classify observed issues as functional bug, UX gap, integration gap, or polish;
4. identify already-correct behavior that must not be rewritten;
5. produce the bounded UXH1 Status & Remediation implementation plan.

Do not begin UXH1, Workspace Connections, or structured-editor implementation until UXH0 is complete.

Protected historical files remain untouched:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

## 43. UXH0 — UX Reality Lock closure — 2026-09-22

UXH0 is complete as a read-only product/repository reality audit. No feature code, tests, persistence schema, source adapter, provider request path, credential behavior, or validation contract was changed.

### Audit baseline

Audit baseline: `1173967 docs: plan post-r1 ux operations hardening`

The working tree remained clean except for the protected historical untracked files:

- `CODEX_HANDOFF_CURRENT.md`
- `PROJECT_HANDOFF.pre-20260820.md`

### Locked findings

- Desktop readiness exposes status but not a safe reason/remediation contract; Task Detail falls back to generic blocker copy.
- `SYSTEM READY` is a blanket renderer label and is not an adequate representation of application health, task readiness, freshness, execution, or validation.
- Workspace connection state is readable, but current desktop IPC/UI does not expose connect/manage/disconnect onboarding.
- Task Detail `Recent Runs` is placeholder copy; global Runs already reads persisted Workspace-scoped Core history.
- Presets currently support list/create/delete and preset selection for runs, but not inspect/edit/save/rename/duplicate. Current Create stores an empty `sources: {}` configuration.
- Keyword Planner and SerpApi use developer-oriented textarea mini-languages as primary editors.
- Bitkimark correctly enforces the verified sitemap allowlist, but the primary UI is a free-form textarea.
- Global Run History/Detail already exposes persisted run/job state, validation, attempts, accepted evidence, eligible resume/retry/manual/cancel actions, and export; presentation remains engineering-oriented.
- File-import selection and selected filename/path feedback already exist. UXH5 should add Replace/Remove and clearer state rather than reimplement file selection.
- No dirty-state functional defect was proven during UXH0; UXH10 remains a later safety-verification slice.
- No additional local Core/source functional defect was proven by UXH0.

### Protected behavior

UX hardening must preserve the shared Core run/job/attempt lifecycle, Workspace ownership, source-neutral persisted Job identity, readiness/freshness/execution/validation separation, exact reviewed-draft behavior before Start, persisted Core execution truth, Core-gated recovery/evidence/export actions, privileged file selection, renderer secret isolation, Bitkimark verified allowlist, immutable raw evidence, source validation/provenance, and the current persistence schema unless later failing evidence requires a contract change.

### Exact next action

Begin **UXH1 — Status & Remediation Contract**.

UXH1 should add a safe source-neutral readiness presentation contract with understandable reason/remediation information, keep freshness separate, replace generic blocker copy, make application-health labeling truthful, and provide safe remediation-routing intent without moving credentials or privileged provider operations into the renderer.

UXH1 must not yet implement Workspace credential onboarding (UXH2), task-detail connection workflows (UXH3), structured editors (UXH4), file-import Replace/Remove UX (UXH5), or the Bitkimark bounded selector (UXH6).

The first UXH1 implementation action is a bounded audit of the desktop readiness presentation seam followed by focused deterministic RED coverage proving that a blocking readiness state exposes safe reason/remediation information while readiness and freshness remain independent.
---

## 44. UXH1 — Status & Remediation Contract closure — 2026-09-22

UXH1 is complete. This slice changed only desktop readiness presentation and application-health presentation. It did not add provider onboarding, credential mutation, new source acquisition behavior, persistence migrations, validation semantics, or privileged provider actions in the renderer.

### Implemented contract

Desktop source cards now expose safe source-neutral readiness presentation fields:

```text
readiness_reason
readiness_remediation
```

Supported remediation presentation kinds are:

```text
CONFIGURE_SOURCE
CONNECT_SOURCE
SELECT_FILE
MANUAL_ACTION
```

A READY source exposes no readiness reason or remediation.

Blocking Task Detail states now show the safe source reason and a non-executing Next step label instead of relying only on the previous generic blocker message.

FILE_REQUIRED presentation is source-specific for the currently supported manual import tasks:

- İkas Products → Products XLSX;
- Keyword Planner manual import → Keyword Stats CSV.

Connection-required, configuration-required, and manual-action states expose safe generic presentation without moving secrets, authentication, provider requests, or privileged operations into the renderer.

### Readiness and freshness separation

Readiness presentation remains independent from freshness.

Deterministic coverage explicitly preserves:

- İkas Products: FILE_REQUIRED + IMPORT_NEEDED;
- Keyword Planner manual CSV: FILE_REQUIRED + IMPORT_NEEDED;
- SerpApi: CONNECTION_REQUIRED + ON_DEMAND;
- Google Trends: CONFIGURATION_REQUIRED + UNKNOWN;
- Google Search Console: MANUAL_ACTION_REQUIRED + UNKNOWN.

No freshness status was converted into a readiness status and no readiness remediation changes collection freshness.

### Application health presentation

The previous blanket renderer label:

```text
SYSTEM READY
```

was replaced with bootstrap-backed presentation using the existing safe preload contract.

The header now presents:

```text
SYSTEM CHECKING
SYSTEM READY
SYSTEM NOT READY
```

SYSTEM READY requires the existing bootstrap query configuration, source registry, and database statuses to be READY.

A bootstrap status reporting an ERROR produces SYSTEM NOT READY. A failed bootstrap read also fails closed to SYSTEM NOT READY instead of leaving the header indefinitely in SYSTEM CHECKING.

This is application bootstrap health only. It does not replace task readiness, freshness, execution, or validation state.

### Verification

Focused RED/GREEN coverage was added for:

- readiness reason presentation;
- safe remediation-label presentation;
- Keyword Planner CSV FILE_REQUIRED presentation;
- non-ready bootstrap status;
- bootstrap-read failure fail-closed behavior;
- readiness/freshness independence.

Fresh verification completed successfully:

```text
git diff --check
npm run lint
npx tsc --noEmit
bash tests/integration/app/run-desktop-multisource-flow-test.sh
bash tests/integration/app/run-desktop-ui-smoke-test.sh
npm run test:release:gate
```

The full deterministic gate completed with:

```text
PASS RELEASE-GATE-001
```

No live provider request was required or performed for this UX slice.

### Git checkpoint

Technical implementation commit:

```text
1c8d513 feat: add readiness remediation presentation
```

Protected historical files remain untracked and untouched:

- CODEX_HANDOFF_CURRENT.md
- PROJECT_HANDOFF.pre-20260820.md

### Scope intentionally not entered

UXH1 did not implement:

- Workspace connect/manage/disconnect onboarding;
- task-specific connection workflows;
- structured Keyword Planner or SerpApi editors;
- file-import Replace/Remove controls;
- Bitkimark bounded selector UX;
- Run History redesign;
- task-level Recent Runs;
- Preset editing lifecycle.

Verified Core lifecycle, source adapters, persistence, validation, freshness semantics, credential security, reviewed-draft behavior, and Data Package architecture remain closed unless new failing evidence requires a change.

### Exact next action

Begin **UXH2 — Workspace Connections**.

UXH2 should expose understandable Workspace-scoped connection management through the existing secure Core credential boundary. The implementation must preserve renderer secret isolation and must not store or expose passwords, OAuth refresh tokens, API keys, developer tokens, or equivalent credential material in ordinary renderer state, configuration, logs, exports, or documentation.

Start UXH2 with a bounded repository audit of the existing Workspace connection read model, credential boundary, preload/IPC contracts, and source-specific connection requirements before defining any write actions.
