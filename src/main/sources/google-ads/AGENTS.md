# Google Ads Source — Scoped Instructions

Applies to `src/main/sources/google-ads/**` in addition to root `AGENTS.md`.

Keep Google Ads request construction, GAQL/resource semantics, parsing/normalization, semantic validation, and provider error mapping inside the source boundary.

Current approved reporting contract is SEARCH-only.

The implemented `google-ads-search-reporting` family contains independent Jobs for campaign, ad group, keyword, search terms, ad, and RSA asset performance. Do not silently generalize this proof to Performance Max or materially different resources/modes.

The legacy `google-ads-search-terms` / `search_term_view` path remains backward-compatible.

Keyword Planner API and manual CSV evidence may share a logical dataset family but must retain distinct acquisition provenance.

The Google Ads Developer Token is retired from active behavior. Legacy fields are compatibility-only; do not restore it as readiness, UI, credential, or request-header behavior without a new approved contract.

Preserve raw provider evidence and requested/observed separation.

Do not reconstruct unavailable Google Ads metrics. Deterministic date filtering is allowed only when source-native dated rows actually prove the requested window.

Use the directly relevant source contracts/tests. Ordinary tests must not call live Google Ads.
