# RoofRoom Data Collector — Validation Specification

**Status:** Canonical multi-source validation contract
**Scope:** Trust boundary, acceptance semantics, Core/source ownership, and source-specific evidence rules

---

## 1. Governing principle

> **No acquired or imported artifact becomes canonical data until source-appropriate validation accepts it.**

HTTP/API/browser/download/import/parse/write success is insufficient by itself.

---

## 2. Responsibility split

### Core

Core coordinates:

- generic artifact checks;
- validator resolution from persisted source identity;
- deterministic outcome persistence;
- artifact acceptance transitions;
- package/export eligibility.

### Source validator

Owns:

- provider schema;
- dataset/resource identity;
- dimensions/context;
- requested-versus-observed checks;
- provider-native types/ranges/null behavior;
- source-specific completeness limitations;
- source finding codes.

Authentication, configuration, quota, rate limit, network, provider, browser, download, import, or cancellation failures are operational outcomes, not dataset-quality results.

---

## 3. Persisted validation statuses

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

Do not add or rename statuses casually.

---

## 4. Acceptance policy

| Outcome | Artifact state | Normal package/export |
|---|---|---|
| `VALID` | `ACCEPTED` | eligible |
| `LOW_DATA` | `ACCEPTED_WITH_WARNING` | eligible with warning |
| verified `NO_DATA` | source-policy no-data outcome | no fabricated rows |
| schema/content/context mismatch | `REJECTED` | not eligible |
| operational failure before usable evidence | no accepted artifact | not eligible |

Preserve rejected raw evidence when practical.

---

## 5. Generic checks

Relevant generic checks include:

- artifact exists/readable;
- content/media signature is plausible;
- non-data HTML/login/error content is rejected;
- supported decoding/parsing succeeds;
- required structural fields exist;
- unknown schema fails visibly;
- numeric fields preserve null versus zero;
- source/dataset identity is consistent;
- requested and observed context remain distinct;
- required provenance exists;
- raw evidence is unchanged by parsing/normalization/package/export.

---

## 6. `NO_DATA`

`NO_DATA` requires positive provider or supported-contract evidence that no data exists for the exact relevant request.

Do not infer it from:

- empty/corrupt files;
- parser failure;
- all-zero metrics;
- all-missing metrics;
- auth/config failure;
- quota/rate-limit failure;
- unsupported mode;
- missing Job;
- interrupted execution.

---

## 7. Source trust rules

### Google Trends

Validate real dataset content, query/group identity, supported temporal context, requested/observed coverage, integer-or-null 0–100 values, duplicates, and fail-closed schema behavior.

Structurally valid no-positive-signal evidence follows the implemented `LOW_DATA` contract rather than fabricated `NO_DATA`.

### Google Search Console

Validate property/search type, requested dataset dimensions, key structure, date windows, native metric types, pagination/row handling, and raw response identity.

Keep query-only and Query × Page contracts distinct.

Empty data must remain distinguishable from access/provider/schema failure.

### Google Ads SEARCH reporting

Validate the expected source family, SEARCH-only context, dataset/resource identity, requested date/segment context, provider-native fields/units, and raw SearchStream structure.

The six reporting datasets remain independent Jobs.

Do not generalize legacy `search_term_view` live evidence to other resources or Performance Max.

### Google Ads configuration

Validate immutable source/dataset/resource/customer context, artifact ownership, raw SearchStream structure, and provider-native row semantics before accepting configuration evidence.

The five normal Conversion Configuration datasets:

- `CONVERSION_ACTIONS`
- `CUSTOMER_CONVERSION_GOALS`
- `CONVERSION_GOAL_CAMPAIGN_CONFIGS`
- `CAMPAIGN_CONVERSION_GOALS`
- `CUSTOM_CONVERSION_GOALS`

may validate a structurally valid, semantically valid zero-row SearchStream result as verified `NO_DATA`.

`CUSTOMER_CONVERSION_TRACKING_SETTINGS` has a stricter cardinality contract: exactly one normalized customer row is required. Zero rows or more than one row are `QUERY_MISMATCH`, never `NO_DATA`. One valid row whose provider status is `NOT_CONVERSION_TRACKED` is valid evidence.

Configuration evidence fails closed. Ownership mismatches are `INVALID_SCHEMA`; invalid immutable Job context, dataset/resource mismatch, or provider-row semantic/type mismatch are `QUERY_MISMATCH`; unreadable or non-JSON artifacts are `ERROR_NOT_DATA`; malformed SearchStream envelopes are `INVALID_SCHEMA`.

Missing evidence remains distinct from `false`, zero, empty string, or inferred values. Requested customer context must not be accepted as observed provider ownership without provider evidence.

Authentication, connection, quota, rate-limit, network, and other acquisition failures remain operational outcomes rather than configuration dataset-quality results.

Deterministic fixtures and gates establish contract behavior only. They do not constitute live-provider acceptance.

### Keyword Planner API

Validate keyword/request mapping, monthly year/month rows, nullable search metrics, competition/bid fields where returned, and raw provider evidence.

Derived 3-month/YoY fields are valid only when calculated from the required accepted monthly rows under the locked deterministic rules.

Missing comparison evidence or zero baseline yields null.

### Keyword Planner manual CSV

Validate preserved original bytes, observed encoding/delimiter/shape, provider metadata/segmentation handling, required keyword fields, and blank/null behavior.

Imported provider change fields remain source-native evidence.

### İkas

Validate the supported workbook/sheet/header contract, provider identifiers, production product/variant mapping, numeric/date handling, and blank stock/sale-price semantics.

### Bitkimark

Validate bounded URL provenance, actual XML, recognized sitemap structure, site-appropriate `loc`, nullable `lastmod`, and duplicate/unexpected document conditions.

### SerpApi

Validate provider success/error identity, request context, raw JSON, organic result structure, nullable provider fields, and no/fewer-result distinction from quota/provider failure.

Do not derive intent or recommendations.

---

## 8. Package validation

### Production Data Package

Load only completed Jobs with eligible accepted evidence.

Verify artifact ownership, kind/state, byte size/checksum where recorded, and source parser/normalizer compatibility.

### `ADS_OPTIMIZATION_PACK v1`

Before publication/open:

- validate exact recipe/version;
- validate source/dataset/account/window compatibility;
- verify accepted evidence or exact verified `NO_DATA`;
- reject unsafe relative paths/symlinks;
- verify row counts/checksums/manifests;
- reject reconstruction/inference;
- validate prior-package PREVIOUS provenance;
- reject analysis/recommendation fields.

Missing required evidence produces visible `NOT_READY`, not invented empty data.

### `BLOG_WRITING_PACK v1`

Validate:

- fixed recipe membership;
- truthful family coverage;
- package/data consistency;
- safe manifest/dataset paths;
- checksum and row-count integrity;
- workbook structural validity;
- trusted package identity for Open/Reveal.

Out-of-recipe evidence must not affect Blog coverage.

---

## 9. Retry relationship

Validation never authorizes hidden provider retry.

- deterministic schema/parse failures require contract/code review;
- mismatch evidence requires review before recollection;
- low/no-data is not retried merely to seek different numbers;
- auth/manual intervention waits for explicit resolution;
- quota/rate-limit stops without evasion;
- approved retry creates a new Attempt.

---

## 10. Fixture rule

Fixtures should be sanitized representations of observed provider behavior.

Hand-authored fixtures may test pure internal logic but must not be described as provider proof.

Normal automated validation tests never call live providers.

---

## 11. Authority routing

| Need | Authority |
|---|---|
| Persisted status/schema/null contracts | `DATA_CONTRACTS.md` |
| Current implementation state | `PROJECT_HANDOFF.md` |
| Core/source ownership | `ARCHITECTURE.md` |
| Test depth/fixtures | `TEST_STRATEGY.md` |
| Source onboarding | `SOURCE_MODULE_GUIDE.md` |

---

## 12. Governing validation rule

> **When evidence is unsupported, suspicious, mismatched, malformed, or unproven, fail visibly and preserve what was actually observed. Never manufacture a valid dataset.**
