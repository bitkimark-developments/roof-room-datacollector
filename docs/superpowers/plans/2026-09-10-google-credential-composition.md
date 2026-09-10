# Google Credential and Request Composition Plan

**Goal:** Make existing GSC and Google Ads adapters callable through secure main-process credentials without live provider calls.

1. RED: deterministic credential/request test for encrypted-at-rest storage, refresh exchange, GSC/Ads headers, and secret non-propagation.
2. GREEN: extend `CredentialStore`, add Electron `safeStorage` backend, OAuth PKCE/bootstrap primitives, token refresh, and authenticated request decorators.
3. Integrate Google readiness with connection metadata and secure credential availability.
4. Add guarded manual helper seams; run focused compatibility, type/lint/diff checks, then the release gate once.
5. Commit technical work, update `PROJECT_HANDOFF.md`, and commit handoff separately.
