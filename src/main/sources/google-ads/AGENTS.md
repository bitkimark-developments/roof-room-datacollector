# Google Ads Source Module — Codex Instructions

These instructions apply to `src/main/sources/google-ads/**` in addition to the repository root `AGENTS.md`.

## Scope boundary

Use supported official Google Ads API behavior. Keep provider-specific request construction, response parsing/normalization, semantic validation inputs, and operational error mapping inside the source boundary.

Do not move Google Ads resource semantics into shared Core.

The collector provides trustworthy evidence for downstream analysis. It does not make optimization decisions, bid/budget recommendations, pause/enable recommendations, winner/loser judgments, or marketing strategy.

## Current verified source semantics

Treat currently verified contracts narrowly.

- Search Terms uses the reviewed `search_term_view` / SEARCH contract.
- Do not silently generalize that proof to Performance Max or another materially different campaign/resource mode.
- Keyword Planner API and manual CSV acquisition must retain distinct acquisition provenance even when they represent one logical dataset family.

Any additional Google Ads resource/dataset (for example campaign, ad group, keyword, ad/RSA, asset, or a materially different Search Terms mode) requires its own reviewed source contract before being presented as supported/complete.

## Authentication and request safety

Use the existing shared Google OAuth/provider composition boundary.

The Google Ads Developer Token is legacy-parse-compatible only where current compatibility code requires it; it is not an active readiness, UI, credential, or request-header requirement. Do not reintroduce it.

Preserve Customer ID and optional login-customer-id semantics according to the current verified shared contract.

Never log or export OAuth tokens, client secrets, API secrets, or other credentials.

## Evidence integrity

Preserve provider response evidence before normalization/transformation according to the shared artifact lifecycle.

Missing provider numeric values remain null/empty according to the target representation. Real zero remains zero only when returned by the provider.

Never create missing provider metrics by arithmetic estimation, interpolation, proportional allocation, or inference and then treat them as source evidence.

A wider accepted dataset may be deterministically filtered to a narrower requested window only when source-native rows contain the required date dimension and the requested rows are actually present. Otherwise recollect through the approved source path rather than fabricate coverage.

Keep requested versus observed context distinct. Do not copy requested values into observed fields without provider evidence.

## Validation and tests

For every new Google Ads dataset/resource, require evidence appropriate to the existing source-onboarding rules, including:

- sanitized observed fixtures or equivalent verified provider evidence;
- request/adapter tests;
- null/zero behavior;
- malformed/non-data behavior;
- source-semantic validation;
- raw/provenance preservation;
- Core vertical-slice integration;
- export eligibility;
- explicit limited live smoke only when separately authorized.

Ordinary tests and the release gate must not make live Google Ads requests.
