# Google Ads Developer Token Sunset Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Google Ads Developer Token legacy-parse-compatible but fully runtime-inactive across provider setup, readiness, OAuth composition, requests, and desktop UI.

**Architecture:** Preserve `developer_token` only at legacy secure-JSON parser boundaries. Remove it from active shared/provider setup contracts, OAuth application/bootstrap inputs, readiness decisions, renderer state, secret ingress, and Google Ads request headers. Keep OAuth, Customer ID, `login-customer-id`, credential isolation, and existing connection semantics unchanged.

**Tech Stack:** TypeScript, Electron, React, Node.js integration tests, Playwright desktop UI smoke tests, SQLite-backed connection state, macOS native secret ingress.

**Spec:** `docs/superpowers/specs/2026-09-28-google-ads-developer-token-sunset-design.md`

## Global Constraints

- No live provider calls.
- Preserve legacy parser tolerance for stored `developer_token` in provider-configuration JSON and Google credential-bundle JSON.
- Do not activate, propagate, surface, request, or send the legacy value.
- Do not change Customer ID or `login-customer-id` semantics.
- Do not redesign OAuth or Keyword Planner collection/export behavior.
- Do not infer or display Google Cloud access level.
- Preserve renderer secret isolation and existing fixed safe error boundaries.
- Keep `CODEX_HANDOFF_CURRENT.md` and `PROJECT_HANDOFF.pre-20260820.md` untracked and untouched.
- Follow red-green TDD; diagnose only the first failing assertion/compile error.

## Review Focus

1. Legacy provider configuration containing valid OAuth fields plus `developer_token` remains readable, while returned status contains only OAuth availability and Ads/KWP readiness is OAuth-driven.
2. A provider configuration containing only legacy `developer_token` must not become READY; OAuth application configuration is still required.
3. Legacy Google credential bundles containing `developer_token` remain parseable, but `readApplicationConfiguration()` returns only active OAuth application fields and never republishes the token.
4. Google Ads and Keyword Planner requests preserve `login-customer-id` while never emitting `developer-token`, including when legacy stored data contains one.
5. Retired `ADS_DEVELOPER_TOKEN` renderer/main-process intents are rejected safely and must not invoke native secret ingress.

---

### Task 1: Retire Developer Token from active provider setup and readiness

**Files:**
- Modify: `src/shared/google-provider-configuration.ts`
- Modify: `src/main/sources/google-api/google-provider-configuration.ts`
- Modify: `src/main/app/google-provider-configuration-ipc.ts`
- Modify: `src/DesktopMultiSourceView.tsx`
- Test: `tests/integration/google-api/google-provider-configuration-service.integration.cjs`
- Test: `tests/integration/app/google-provider-configuration-main-ipc.integration.cjs`
- Test: `tests/integration/app/desktop-ui-smoke.integration.cjs`

**Interfaces:**
- Produces: `GoogleProviderConfigurationStatus` with only `oauth_application_status`.
- Produces: `GoogleProviderConfigurationComponent = 'OAUTH_APPLICATION'`.
- Preserves internally: `GoogleProviderConfiguration.developer_token?: string` only for legacy stored provider-configuration parse compatibility.
- Produces: `GoogleProviderConfigurationService.isReadyForSource(sourceId)` requiring OAuth application availability for GSC, Google Ads Search Terms, and Keyword Planner.
- Retires: active `ADS_DEVELOPER_TOKEN` configure intent.

- [ ] **Step 1: Write failing provider-configuration tests**

Update `google-provider-configuration-service.integration.cjs` so it asserts:
- initial status is `{ oauth_application_status: 'NOT_CONFIGURED' }`;
- OAuth configuration produces `{ oauth_application_status: 'AVAILABLE' }`;
- Ads and Keyword Planner are ready after OAuth configuration with no Developer Token;
- stored provider JSON containing `developer_token` still parses and returns the legacy field from `readGoogleProviderConfiguration()`;
- a configuration containing only `developer_token` does not satisfy readiness;
- `{ component: 'ADS_DEVELOPER_TOKEN' }` returns `INVALID_PROVIDER_CONFIGURATION_INTENT` and does not call secret ingress.

- [ ] **Step 2: Run the provider test and verify RED**

Run:
`bash tests/integration/google-api/run-google-provider-configuration-service-test.sh`

Expected: FAIL because the current status/readiness/configure contract still exposes and accepts Developer Token.

- [ ] **Step 3: Implement the provider contract**

Change:
- `GoogleProviderConfigurationStatus` to contain only `oauth_application_status`;
- `GoogleProviderConfigurationComponent` to only `'OAUTH_APPLICATION'`;
- `statusFor()` to omit Developer Token status;
- `isIntent()` to accept only `OAUTH_APPLICATION`;
- `configureNormalized()` to request only `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`;
- `isReadyForSource()` to require OAuth application availability for every current Google source;
- keep provider-config parsing of legacy `developer_token` unchanged.

Update IPC sanitization/validation to the new status/component shape.

- [ ] **Step 4: Write failing renderer/UI regression**

Update `desktop-ui-smoke.integration.cjs` to assert:
- only `OAuth application: ...` appears in Application / Provider Credentials;
- no Developer Token status text exists;
- no Configure/Replace Developer Token button exists;
- configuring OAuth sends only `{ component: 'OAUTH_APPLICATION' }`;
- Ads/KWP provider readiness no longer waits for Developer Token, while workspace metadata requirements remain unchanged.

Update `google-provider-configuration-main-ipc.integration.cjs` so the retired component is rejected and never crosses as a valid configure request.

- [ ] **Step 5: Run app-side tests and verify RED**

Run:
`bash tests/integration/app/run-google-provider-configuration-main-ipc-test.sh`

Then:
`npm run test:m5:desktop-ui`

Expected: FAIL on old status/button/intent behavior.

- [ ] **Step 6: Remove the retired UI/setup surface**

Update `DesktopMultiSourceView.tsx` and `google-provider-configuration-ipc.ts` to:
- render only OAuth application provider status/control;
- remove Developer Token status/control/callback;
- use OAuth application availability as the provider-setup condition for Google Ads and Keyword Planner;
- preserve existing metadata gating and secret isolation.

- [ ] **Step 7: Verify Task 1 GREEN**

Run:
`bash tests/integration/google-api/run-google-provider-configuration-service-test.sh`

Run:
`bash tests/integration/app/run-google-provider-configuration-main-ipc-test.sh`

Run:
`npm run test:m5:desktop-ui`

Run:
`npx tsc --noEmit`

Expected: all PASS.

- [ ] **Step 8: Commit Task 1**

Stage only Task 1 files and commit:

`git commit -m "fix: retire developer token provider setup"`

---

### Task 2: Remove Developer Token from active OAuth and Google Ads request runtime

**Files:**
- Modify: `src/main/sources/google-api/google-auth.ts`
- Modify: `src/main/sources/google-api/google-oauth-credential-acquirer.ts`
- Modify: `src/main/app/google-api-electron-composition.ts`
- Modify: `src/main/app/workspace-connection-management-service.ts`
- Test: `tests/integration/google-api/google-credential-composition.integration.cjs`
- Test: `tests/integration/google-api/google-oauth-credential-acquirer.integration.cjs`
- Test: `tests/integration/google-api/ads-reviewed-quick-run.integration.cjs`
- Test: `tests/integration/google-api/keyword-planner-reviewed-api.integration.cjs`
- Test: `tests/integration/google-api/gsc-reviewed-quick-run.integration.cjs`
- Test: `tests/integration/app/desktop-connection-write-composition.integration.cjs`

**Interfaces:**
- `GoogleOAuthApplicationConfiguration` becomes `{ client_id: string; client_secret?: string }`.
- `GoogleCredentialBundle` keeps `developer_token?: string` only for legacy bundle parse compatibility.
- `GoogleOAuthClient.getAccessToken()` returns active access-token data without Developer Token.
- `bootstrapGoogleOAuth(...)` active input removes `developer_token?: string`.
- `createAuthenticatedRequester(...)` keeps `google_ads` and `login_customer_id` options but never sets `developer-token`.

- [ ] **Step 1: Write failing legacy-bundle and request-header regressions**

Update `google-oauth-credential-acquirer.integration.cjs` to assert:
- a stored credential bundle containing legacy `developer_token` still parses;
- `readApplicationConfiguration(existingCredentialRef)` returns `client_id`/`client_secret` only and does not return `developer_token`;
- newly persisted OAuth credentials continue to contain refresh token/scopes only.

Update `google-credential-composition.integration.cjs` so a legacy provider/bundle token is present in fixtures but:
- GSC, Ads, and Keyword Planner requests all have `headers['developer-token'] === undefined`;
- Ads/KWP still preserve `login-customer-id`;
- result/connection objects do not expose secrets.

- [ ] **Step 2: Run focused runtime tests and verify RED**

Run:
`npm run test:m3:google-oauth-acquirer`

Run:
`npm run test:m3:google-credentials`

Expected: FAIL because current active configuration/access-token/request composition still propagates Developer Token.

- [ ] **Step 3: Implement runtime deactivation**

In `google-oauth-credential-acquirer.ts`:
- remove `developer_token` from `GoogleOAuthApplicationConfiguration`;
- keep it in `GoogleCredentialBundle`;
- make application-configuration normalization copy only `client_id` and `client_secret`;
- make `readApplicationConfiguration()` ignore legacy bundle `developer_token`;
- preserve current refresh-token/scopes credential persistence.

In `google-auth.ts`:
- remove Developer Token from cached/access-token result shapes;
- remove provider/bundle Developer Token selection;
- remove `developer-token` header emission;
- remove `developer_token` from `bootstrapGoogleOAuth` input/acquirer composition;
- preserve `login-customer-id`.

In `google-api-electron-composition.ts` and `workspace-connection-management-service.ts`:
- stop accepting/forwarding Developer Token into active OAuth/bootstrap configuration;
- preserve OAuth client fields, scopes, Customer ID, login-customer-id, and safe metadata behavior.

- [ ] **Step 4: Align deterministic source fixtures with the active contract**

Remove active Developer Token requirements from Ads/KWP/GSC quick-run and connection-composition fixtures. Keep one or more dedicated legacy fixtures only where they prove parser compatibility/non-propagation.

- [ ] **Step 5: Verify Task 2 GREEN**

Run:
`npm run test:m3:google-oauth-acquirer`

Run:
`npm run test:m3:google-credentials`

Run:
`bash tests/integration/google-api/run-ads-reviewed-quick-run-test.sh`

Run:
`bash tests/integration/google-api/run-keyword-planner-reviewed-api-test.sh`

Run:
`bash tests/integration/google-api/run-gsc-reviewed-quick-run-test.sh`

Run:
`npm run test:m5:connection-write-composition`

Run:
`npx tsc --noEmit`

Expected: all PASS; no live calls.

- [ ] **Step 6: Commit Task 2**

Stage only Task 2 files and commit:

`git commit -m "fix: stop sending google ads developer token"`

---

### Task 3: Remove dead Developer Token secret-ingress and residual active references

**Files:**
- Modify: `src/main/core/secret-ingress.ts`
- Modify: `src/main/app/macos-osascript-secret-ingress.ts`
- Test: `tests/integration/app/macos-osascript-secret-ingress.integration.cjs`
- Modify only if still referenced after Task 2: `src/main/app/google-api-electron-composition.ts`
- Modify only if still referenced after Task 2: `src/main/app/workspace-connection-management-service.ts`
- Modify only if stale active fixtures remain: relevant Google/app integration tests identified by the residual grep.

**Interfaces:**
- `SecretIngressPurpose` no longer contains `GOOGLE_ADS_DEVELOPER_TOKEN`.
- macOS secret ingress retains OAuth client ID/secret and unrelated provider purposes unchanged.
- Allowed source-level `developer_token` references after this task are only legacy parser-compatibility boundaries, not active setup/runtime paths.

- [ ] **Step 1: Write the failing secret-ingress regression**

Update `macos-osascript-secret-ingress.integration.cjs` so Developer Token is no longer an accepted/prompted purpose while existing OAuth secret prompts remain covered.

- [ ] **Step 2: Run secret-ingress test and verify RED**

Run:
`bash tests/integration/app/run-macos-osascript-secret-ingress-test.sh`

Expected: FAIL because the current purpose/label still exists.

- [ ] **Step 3: Remove the dead ingress purpose**

Remove `GOOGLE_ADS_DEVELOPER_TOKEN` from `SecretIngressPurpose` and its macOS prompt mapping. Do not change unrelated prompt masking, focus, argv, timeout, cancellation, or error behavior.

- [ ] **Step 4: Audit residual source/test references**

Run:

`grep -Rni --include='*.ts' --include='*.tsx' -E 'ADS_DEVELOPER_TOKEN|GOOGLE_ADS_DEVELOPER_TOKEN|ads_developer_token_status|developer-token|developer_token|developerToken' src`

Run:

`grep -Rni --include="*.cjs" --include="*.sh" -E "ADS_DEVELOPER_TOKEN|GOOGLE_ADS_DEVELOPER_TOKEN|ads_developer_token_status|developer-token|developer_token|developerToken" tests/integration`

Classify each remaining hit:
- **allowed:** legacy provider-config parser field or legacy Google credential-bundle parser/test evidence;
- **remove/update:** active readiness, UI, bootstrap, header, secret ingress, composition, fixture requirement.

Do not delete legacy parser evidence merely to make grep empty.

- [ ] **Step 5: Run affected app connection tests**

Run:
`npm run test:m5:connection-write-main-ipc`

Run:
`npm run test:m5:connection-write-ipc`

Run:
`npm run test:m5:connection-write-composition`

Run:
`bash tests/integration/app/run-macos-osascript-secret-ingress-test.sh`

Run:
`npx tsc --noEmit`

Expected: all PASS.

- [ ] **Step 6: Commit Task 3**

Stage only Task 3 cleanup/test files and commit:

`git commit -m "chore: remove retired developer token ingress"`

---

### Task 4: Release verification and project handoff closure

**Files:**
- Modify: `PROJECT_HANDOFF.md`
- Modify only if an active Developer Token requirement is found there: `PROJECT_SPEC.md`, `DATA_CONTRACTS.md`, `ARCHITECTURE.md`, `SOURCE_MODULE_GUIDE.md`, `VALIDATION_SPEC.md`, `DECISIONS.md`, `TEST_STRATEGY.md`

**Interfaces:**
- Documentation records Developer Token as retired from active Google Ads setup/runtime and legacy-tolerated only at secure parser boundaries.
- Latest next action must no longer instruct the user to enter a Google Ads Developer Token.

- [ ] **Step 1: Check documentation for active obsolete requirements**

Run:
`grep -Rni -E 'developer[-_ ]?token|developerToken|Google Ads Developer Token' PROJECT_HANDOFF.md PROJECT_SPEC.md DATA_CONTRACTS.md ARCHITECTURE.md SOURCE_MODULE_GUIDE.md VALIDATION_SPEC.md DECISIONS.md TEST_STRATEGY.md`

Update only authoritative/current requirements or next-action text. Historical checkpoint text may remain if clearly historical and superseded.

- [ ] **Step 2: Run deterministic release gate**

Run:
`npm run test:release:gate`

Expected final marker:
`PASS RELEASE-GATE-001: deterministic Core, Google Trends, desktop file access, configuration, validation, and export gates completed`

Stop at the first failure and fix only that failure before rerunning.

- [ ] **Step 3: Package macOS arm64 application**

Run:
`npm run package`

Expected: Electron Forge production bundles and `darwin arm64` packaging complete successfully.

- [ ] **Step 4: Final static verification**

Run:
`git diff --check`

Run:
`npx tsc --noEmit`

Run:
`git status --short`

Expected: only intended tracked changes plus the two protected untracked files.

- [ ] **Step 5: Update `PROJECT_HANDOFF.md`**

Record:
- design spec commit `0cfa610`;
- Developer Token retirement behavior;
- legacy parser compatibility boundary;
- targeted test results;
- full release-gate result;
- package result;
- no live provider request made;
- exact next action after this compatibility slice.

- [ ] **Step 6: Verify documentation change**

Run:
`git diff --check`

Run:
`git --no-pager diff -- PROJECT_HANDOFF.md PROJECT_SPEC.md DATA_CONTRACTS.md ARCHITECTURE.md SOURCE_MODULE_GUIDE.md VALIDATION_SPEC.md DECISIONS.md TEST_STRATEGY.md`

Expected: only intentional current-contract/documentation changes; historical checkpoint text may remain when clearly superseded.

- [ ] **Step 7: Commit documentation checkpoint**

Stage only intended documentation and commit:

`git commit -m "docs: record developer token sunset compatibility"`

- [ ] **Step 8: Final repository check**

Run:
`git status --short`

Expected only:
- `?? CODEX_HANDOFF_CURRENT.md`
- `?? PROJECT_HANDOFF.pre-20260820.md`
