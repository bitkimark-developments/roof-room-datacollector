# RoofRoom Data Collector — Validation Specification

**Status:** Canonical multi-source validation contract
**Boundary:** Dataset trust is separate from acquisition/execution success

---

## 1. Governing principle

> **No acquired or imported artifact becomes canonical data until source-appropriate validation accepts it.**

An HTTP 200, API response, browser action, download event, readable file, or successful parse is not sufficient by itself.

## 2. Responsibility split

### Core validation coordination

Core owns:

- invoking validation at the correct lifecycle boundary;
- generic artifact safety checks;
- deterministic status resolution;
- persisting summaries and detailed findings;
- applying candidate/accepted/warned/rejected artifact state;
- preventing rejected evidence from normal exports.

### Source validator

Each source owns:

- provider schema and content checks;
- dataset identity and dimensions;
- source-mode semantics;
- requested-versus-observed context checks;
- metric type/range/null behavior;
- provider-specific completeness limitations;
- source-specific finding codes.

Operational authentication, access, quota, rate-limit, network, provider, browser, download, and import failures are handled before or alongside validation as operational outcomes. They must not be mislabeled as dataset quality.

## 3. Current implemented validation contract

The current persisted validation statuses are:

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

This reconciliation does not rename or expand that persisted enum.

Current finding severity:

```text
INFO
WARNING
ERROR
```

Current findings preserve `check_id`, `passed`, `message`, `expected`, and `actual`. New source-specific problems should normally be represented with structured findings and operational error codes rather than an uncontrolled global enum expansion.

## 4. Status semantics

- `NOT_RUN`: no dataset validation decision exists.
- `VALID`: every required check passed with no warning affecting acceptance.
- `LOW_DATA`: structure and identity are trustworthy, but the source evidence has explicitly defined low-signal characteristics.
- `NO_DATA`: a verified provider/dataset outcome proves no rows/data; it is not inferred from parse failure, all-zero values, or blank metrics.
- `INVALID_SCHEMA`: content is data-like but does not satisfy the supported structural contract.
- `ERROR_NOT_DATA`: the artifact is an error/login/HTML/non-data response rather than the expected dataset.
- `DATE_MISMATCH`: proven returned temporal coverage conflicts materially with the request.
- `QUERY_MISMATCH`: returned query/dimension identity conflicts with the requested job.

Operational failures such as `DOWNLOAD_FAILED`, authentication required, rate limited, quota exhausted, access denied, import failed, provider error, or unsupported mode do not become validation statuses merely for convenience.

## 5. Deterministic resolution and artifact policy

Validation must resolve deterministically when multiple findings exist. Source-specific rules may refine precedence, but error/non-data, schema, identity, and requested-context failures prevent acceptance.

| Outcome | Artifact state | Normal export eligibility |
|---|---|---|
| `VALID` | `ACCEPTED` | yes |
| `LOW_DATA` | `ACCEPTED_WITH_WARNING` | yes, warning retained |
| `NO_DATA` | source policy, normally warning/accepted no-data record | no invented rows |
| schema/content/context mismatch | `REJECTED` | no |
| operational failure before artifact | no accepted artifact | no |

Rejected raw evidence remains available for audit when practical.

## 6. Generic checks

Every implemented source applies relevant generic checks:

1. artifact exists and is readable;
2. non-empty byte content when a file/response is expected;
3. media/content signature is plausible;
4. login pages, HTML errors, rate-limit pages, or provider errors are not parsed as data;
5. decoding and parsing succeed under an evidence-based format contract;
6. required fields/columns/dimensions exist;
7. unexpected schema change fails visibly;
8. numeric values parse without missing-to-zero coercion;
9. duplicate semantics are checked where uniqueness is required;
10. raw artifact linkage and required provenance exist;
11. requested and observed context are not conflated;
12. normalized output does not mutate raw evidence.

## 7. Google Trends — Interest Over Time

The implemented validator checks, as applicable:

- real CSV rather than HTML/login/error content;
- source and dataset identity;
- expected query identity and order;
- query-group comparison context;
- supported temporal dimension and cadence;
- requested-versus-observed boundary coverage;
- integer-or-null relative interest;
- `0..100` range;
- no missing-to-zero coercion;
- duplicate period rejection;
- geography/category/search/selection evidence where present;
- fail-closed handling of unknown schema.

All-zero and all-missing evidence remain distinct and currently resolve visibly as `LOW_DATA` when otherwise structurally valid. `NO_DATA` remains reserved for verified provider evidence. Live numeric values are never stable test assertions.

## 8. Google Search Console

Required validator families for implementation:

- expected API response rather than OAuth/error payload;
- requested property and search-type provenance;
- exact requested dataset dimensions: query, query+page, or date+query;
- row key cardinality matches the dimension contract;
- clicks/impressions are non-negative provider-native numbers;
- CTR and position are nullable/provider-native numeric values, not zero-filled;
- returned dates stay within justified provider/request boundaries;
- pagination/row collection is internally consistent;
- privacy filtering, row limits, latency, and partial-return limitations are recorded rather than interpreted as complete market data;
- empty response is distinguished from access failure and malformed response.

## 9. Google Ads Search Terms

Required validator families:

- official API response shape and customer/request provenance;
- verified source mode is `search_term_view` for the currently proven SEARCH path;
- search term and requested segment fields are present where rows exist;
- campaign/ad-group identifiers and metric types are source-faithful;
- dates are inside the requested range;
- missing values remain null;
- empty rows are distinguished from unsupported campaign mode or access failure;
- Performance Max or another unverified mode cannot be reported as a complete Search Terms dataset without a separately verified contract.

## 10. Keyword Planner historical metrics

### Official API

Validate:

- `GenerateKeywordHistoricalMetrics` response identity;
- keyword result mapping;
- nullable average monthly searches;
- competition and competition index types/domains where returned;
- monthly rows with valid year/month and nullable search volume;
- requested/returned keyword identity;
- missing bid or volume metrics remain null;
- operational API/auth/quota failures remain outside dataset validation.

### Manual CSV fallback

Validate:

- original bytes are preserved before parsing;
- observed encoding is supported, including verified UTF-16;
- delimiter is detected/verified as tab even with `.csv` extension;
- provider metadata and segmentation rows are handled explicitly before keyword rows;
- required keyword header/columns exist;
- blank metrics remain null;
- the import is labeled `FILE_IMPORT` provenance rather than API acquisition;
- malformed, unrelated, or partially decoded files fail closed.

## 11. İkas Products XLSX

Required validator families:

- original workbook is preserved;
- workbook/package is structurally readable;
- the expected sheet/header contract comes from a sanitized real fixture;
- required provider identifiers are present;
- product/variant rows are distinguished correctly;
- numeric/date fields are type-checked without zero substitution;
- blank stock remains null;
- corrupt workbook, missing required field, or unsupported schema fails visibly;
- normalized rows remain traceable to the original workbook and row/sheet context where practical.

## 12. Bitkimark public site HTTP/XML

Validate:

- bounded HTTP result and source URL metadata;
- non-empty XML content rather than HTML/error content;
- well-formed sitemap index or URL-set XML;
- recognized parent/child sitemap relationship;
- `loc` is a valid expected-site URL;
- `lastmod` is nullable and parsed only when present/valid;
- duplicate URLs and unexpected document types are reported;
- missing `lastmod` does not become a fabricated date;
- HTTP success does not override malformed content.

## 13. SERP / SerpApi

Required validator families:

- provider success/error identity and raw JSON preservation;
- query, country, language, device, and retrieval context;
- organic positions are valid positive positions where returned;
- title/URL/domain/snippet remain nullable according to provider evidence;
- fewer results or no organic results are distinguished from quota/provider errors;
- provider feature data remains provider-labeled;
- quota/plan metadata is operational metadata;
- no validation step derives intent, commercial fit, recommended page type, or marketing action.

## 14. Retry guidance

Validation does not authorize hidden provider retries.

- deterministic parse/schema errors normally require code/contract review, not repeated provider calls;
- query/date mismatch requires evidence review before recollection;
- low/no-data results are not retried automatically merely to seek different numbers;
- authentication and manual action wait for explicit user resolution;
- rate-limit and quota outcomes stop without evasion or immediate automatic retry;
- a permitted retry creates a new attempt and preserves the old artifact/finding history.

## 15. Fixtures

Fixtures must be sanitized from real observed provider behavior. Required families should include:

```text
generic: zero-byte, HTML/login, malformed JSON/XML, corrupt XLSX
google-trends: valid periods, mismatch, low-data, all-zero/all-missing
gsc: query, query-page, date-query, no-data, malformed dimensions
google-ads-search-terms: valid search_term_view, empty, wrong schema/mode
keyword-planner: API valid/missing metric, UTF-16 tab CSV, leading metadata
ikas-products: valid, blank stock, missing required field, corrupt workbook
bitkimark-public-site: sitemap index, child sitemap, malformed XML, HTML error
serp: organic success, fewer results, no organic, provider/quota error
```

Exact fixture content is locked from sanitized provider evidence during each implementation slice. Invented schemas are not accepted as provider proof.

## 16. Automated and live validation tests

Normal validation tests use fixtures, mocks, fake sources, and local dependencies. They make no live provider calls.

Live smoke tests are explicit, limited, manual/separately invoked, and quota-aware. They validate access, shape, parsing, and provenance, not exact changing metrics. Automated regression must not spend SerpApi quota or repeatedly call Google Ads, GSC, Keyword Planner, or Google Trends.

## 17. Multi-source Release 1.0 validation gate

Each implemented Release 1.0 source must have:

- real/sanitized source fixtures;
- parser coverage;
- valid, empty/no-data, malformed/non-data, and missing/null behavior;
- source-semantic checks;
- operational failure separation;
- deterministic acceptance mapping;
- rejected-artifact protection;
- provenance validation;
- explicit limited live smoke evidence.

Implementation complete and validation gate complete are separate claims.

## 18. Governing validation rule

When evidence is suspicious, incomplete, semantically mismatched, or unsupported, fail visibly and preserve the evidence; never manufacture a valid dataset.
