# SerpApi Source Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-capable, Workspace-scoped SerpApi Google SERP source that preserves exact raw JSON, normalizes the first ten organic results plus provider-returned PAA, and participates in shared Core retry/validation behavior.

**Architecture:** A source-owned SerpApi client composes an opaque Workspace credential into one bounded GET request. A parser/validator keeps provider error handling separate from normalized SERP rows, while `SerpApiRuntimeFactory` and query-level Job-plan helpers reuse existing Core orchestration without introducing a SerpApi-specific lifecycle.

**Tech Stack:** TypeScript, Electron `safeStorage`/existing `CredentialStore`, Node `fetch`, SQLite Workspace connections, existing CollectionOrchestrator and validator registry, deterministic CommonJS integration tests.

**Spec:** User-provided SerpApi Source Adapter brief in `/Users/furkan/.codex/attachments/684bbfbb-a5da-43bf-b02d-4a3e95ccd771/pasted-text.txt`

## Global Constraints

- Source identity is `serpapi`, acquisition mode `THIRD_PARTY_API`, dataset `GOOGLE_SERP`.
- Every exact query is an independent Job; no automatic retry, quota evasion, or second-page/mobile/ads/shopping collection.
- Request context is Türkiye (`gl=tr`), Turkish (`hl=tr`), Desktop (`device=desktop`), Google (`engine=google`), first page only.
- API keys remain only behind `CredentialStore`; no secret enters SQLite, job context, metadata, logs, exports, renderer payloads, or stdout.
- Source timeout is 300 seconds from external request dispatch; timeout maps to `REQUEST_TIMEOUT` without automatic retry.
- Raw provider JSON is canonical evidence; normalization is a separate parser representation.
- PAA is represented as separate query-level normalized rows with `result_type: PAA` and no fabricated values.
- No live SerpApi request runs during implementation or release verification.

### Task 1: Establish the RED vertical-slice contract

**Files:**
- Create: `tests/integration/serpapi/serpapi-source.integration.cjs`
- Create: `tests/integration/serpapi/run-serpapi-source-test.sh`
- Modify: `package.json`

- [ ] Write deterministic fake-credential/fake-transport assertions for Workspace isolation, exact request parameters, raw preservation, first-ten organic parsing, PAA rows, missing fields, readiness transitions, provider/quota failure, and independent query Job plans.
- [ ] Run `npm run test:m3:serpapi` and confirm it fails because the SerpApi source contract is not implemented.

### Task 2: Add source contracts, query-level Job planning, and timeout-aware transport

**Files:**
- Create: `src/shared/serpapi.ts`
- Create: `src/main/sources/serpapi/serpapi-job-plans.ts`
- Create: `src/main/sources/serpapi/serpapi-client.ts`
- Modify: `src/main/sources/google-api/api-helpers.ts`

**Interfaces:**
- `SERPAPI_SOURCE_ID`, `SerpApiRequestContext`, and normalized row types.
- `createSerpApiJobPlans(entries)` returns one `JobPlan` with `query_group_id: null` and secret-free `source_context` per query.
- `SerpApiClient.search(context)` performs one authenticated request with the 300-second timeout.

- [ ] Implement only the documented `engine`, `q`, `gl`, `hl`, `device`, `start=0`, `output=json`, and secure `api_key` parameters.
- [ ] Map missing credentials, authentication, quota/rate, provider, network, and timeout outcomes to explicit operational errors without retries.
- [ ] Run the focused test and keep it RED until the source/parser/runtime tasks are complete.

### Task 3: Implement raw-to-normalized parsing and source validation

**Files:**
- Create: `src/main/sources/serpapi/serpapi-parser.ts`
- Create: `src/main/sources/serpapi/serpapi-validator.ts`

**Interfaces:**
- `parseSerpApiResponse(body, expectedContext)` returns normalized organic/PAA rows and observed provider context.
- `SerpApiValidator` reads the persisted raw artifact and returns shared validation statuses/findings.

- [ ] Reject HTML/non-JSON, provider error payloads, invalid positions, malformed URLs, and context/query mismatches visibly.
- [ ] Preserve nullable title/URL/domain/snippet values, derive domain only from valid returned URLs, slice only the first ten organic rows, and preserve provider-returned PAA questions/answers without fabrication.
- [ ] Treat fewer than ten organic rows as valid evidence and zero organic rows as distinct `NO_DATA` when the provider reports success.

### Task 4: Compose Workspace runtime, readiness, and guarded live-smoke seams

**Files:**
- Create: `src/main/sources/serpapi/serpapi-source.ts`
- Create: `src/main/sources/serpapi/serpapi-readiness.ts`
- Create: `src/main/sources/serpapi/serpapi-runtime.ts`
- Create: `src/main/sources/serpapi/serpapi-live-smoke.ts`
- Create: `src/main/app/serpapi-electron-composition.ts`

- [ ] Compose source instances from Workspace connection metadata and `CredentialStore` without exposing API keys.
- [ ] Register readiness semantics as configuration-required, connection-required, or ready without provider requests.
- [ ] Add a confirmation-gated source factory for later manual Core execution; unconfirmed calls must stop before credential/provider activity.
- [ ] Keep all result persistence in existing Core; do not add a SerpApi Run manager or UI.

### Task 5: GREEN, compatibility, and checkpoint closure

- [ ] Run `npm run test:m3:serpapi` and the directly relevant readiness, credential, source-neutral, multi-source, and retry tests.
- [ ] Run `npx tsc --noEmit`, `npm run lint`, and `git diff --check`.
- [ ] Add the focused SerpApi test to `tests/integration/release/run-release-gate.sh`.
- [ ] Run `npm run test:release:gate` exactly once; do not execute live provider commands.
- [ ] Commit technical work as `feat: add serpapi source`, update `PROJECT_HANDOFF.md` with verified state, then commit docs as `docs: close serpapi checkpoint` when repository Git writes are available.
