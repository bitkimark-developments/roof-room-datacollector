# Google Ads Developer Token Sunset Compatibility Design

**Date:** 2026-09-28
**Status:** Approved
**Scope:** RoofRoom Data Collector Google provider configuration/runtime compatibility

## Problem

RoofRoom currently treats Google Ads Developer Token as an active requirement across provider configuration, readiness, secure ingress, OAuth credential composition, request headers, desktop UI, and deterministic tests.

The adopted provider model no longer requires Developer Token for Google Ads API readiness or request authorization. RoofRoom must stop treating it as active without breaking previously stored secure JSON that may still contain `developer_token`.

## Locked decision

Use a compatibility migration:

**Developer Token becomes legacy-tolerated but runtime-inactive.**

Legacy stored `developer_token` may remain parseable temporarily, but RoofRoom must stop requesting it, requiring it, surfacing it, copying it into new credentials, or sending it to Google Ads API.

## Active contract after migration

Google provider configuration actively requires only:

- `client_id`
- `client_secret`

Google Ads Search Terms and Keyword Planner connection/readiness continue through the existing OAuth/provider connection path plus safe metadata such as Customer ID and, where applicable, login-customer-id.

RoofRoom must not invent or display a Google Cloud access-level status because the application does not currently query a verified source for that fact.

## Required changes

### Shared/provider configuration
- remove renderer-facing `ads_developer_token_status`;
- remove `ADS_DEVELOPER_TOKEN` from active configure intents/components;
- make `isReadyForSource()` depend on OAuth application configuration, not Developer Token;
- remove the Developer Token secret-ingress configuration path;
- keep legacy parser tolerance for stored `developer_token` in provider-configuration JSON during this slice;
- do not surface that tolerated legacy value through active status, readiness, configure, or renderer contracts.

### OAuth/request runtime
- access-token results must no longer carry Developer Token;
- remove `developer_token` from active OAuth application configuration/bootstrap inputs while retaining legacy credential-bundle parse compatibility;
- newly acquired OAuth credentials must not copy Developer Token;
- legacy Google credential bundles containing `developer_token` remain parse-compatible, but `readApplicationConfiguration()` must not republish that legacy value into active application configuration;
- preserve the existing acquisition persistence behavior that writes only refresh-token/scopes rather than Developer Token;
- authenticated Google Ads requests must not emit `developer-token`;
- keep existing `login-customer-id` behavior unchanged.

### Desktop UI
Remove Developer Token status and Configure/Replace Developer Token controls. Do not replace them with an inferred Cloud access-level indicator.

### Secure ingress
Remove Developer Token as an active secret-ingress purpose only after current runtime references are removed. Preserve unrelated secret-ingress behavior.

## Non-goals

This slice does not:
- add Google Cloud access-level discovery or Cloud Console integration;
- change Customer ID/login-customer-id semantics;
- redesign OAuth;
- make live provider requests;
- destructively rewrite existing secure credentials;
- change Keyword Planner collection/export semantics;
- broaden source scope.

## TDD requirements

Use red-green TDD. Minimum regressions:

1. Ads/KWP readiness works with valid OAuth application configuration and no Developer Token.
2. Shared/renderer provider configuration no longer exposes Developer Token status/configure intent.
3. Desktop UI no longer shows Configure/Replace Developer Token.
4. Google Ads requests never emit `developer-token`, even if legacy stored data contains one.
5. Legacy provider-configuration JSON containing `developer_token` remains readable without activating it.
6. Legacy Google credential-bundle JSON containing `developer_token` remains readable, but the value is not republished into active application configuration.
7. New OAuth credential acquisition continues to persist credentials without Developer Token.

Verification after targeted tests:

- `npx tsc --noEmit`
- relevant deterministic integration suites
- `npm run test:release:gate`
- `npm run package`
- `git diff --check`

No live provider calls are permitted.

## Acceptance criteria

Complete when:
- no active UI/setup path asks for Developer Token;
- no readiness path requires it;
- no new Google Ads request sends it;
- both legacy provider-configuration JSON and legacy Google credential-bundle JSON containing `developer_token` remain parse-compatible without activating or propagating the value;
- OAuth + safe Customer ID metadata continue to support existing connection flows;
- full deterministic release gate passes;
- macOS arm64 packaging passes;
- `PROJECT_HANDOFF.md` records this compatibility contract and supersedes older Developer Token next-action text.

## Risk controls

- Preserve legacy parser tolerance to avoid stored credential breakage.
- Change only the Developer Token readiness condition; keep OAuth checks intact.
- Add focused regressions before production changes.
- Do not expose Cloud access state without verified application evidence.
