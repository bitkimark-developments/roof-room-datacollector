# BLOG_WRITING_PACK v1 — Design

**Status:** Draft for approval
**Date:** 2026-10-01
**Product:** RoofRoom Data Collector
**Scope:** User-facing Blog Writing evidence package built from one existing Run

## 1. Purpose

`BLOG_WRITING_PACK v1` packages already collected, validated, accepted RoofRoom evidence into:

1. a user-facing XLSX workbook; and
2. a structured evidence/provenance package.

The package exists to make accepted source evidence convenient for a downstream writing or analysis layer.

RoofRoom itself does not perform SEO strategy, topic selection, search-intent classification, commercial prioritization, recommendation, scoring, or writing decisions.

The governing boundary remains:

    RoofRoom:
    COLLECT → PRESERVE → VALIDATE → NORMALIZE where deterministic
    → ASSEMBLE/PACKAGE → EXPORT

    Downstream:
    UNDERSTAND → COMPARE → ANALYZE → CRITIQUE
    → RECOMMEND → DECIDE → WRITE

## 2. Architectural approach

`BLOG_WRITING_PACK v1` is a thin specialization above the existing generalized Data Package flow.

It reuses existing:

- Run / Job / Attempt / Artifact lifecycle;
- source-specific acquisition, parsing, and validation;
- accepted-artifact policy;
- `ProductionDataPackageLoader`;
- generalized Data Package construction;
- provenance and integrity verification;
- desktop main-process file/open security boundary.

The Blog pack layer does not:

- authenticate with providers;
- call providers;
- launch collection;
- retry acquisition;
- alter Run state;
- duplicate source parsers;
- create a parallel collection architecture;
- perform analytical cross-source joins;
- require Ads Task Package refactoring.

## 3. Run boundary

One Blog Writing Pack is assembled from exactly one existing `run_id`.

    one Run
      ↓
    accepted evidence from that Run
      ↓
    BLOG_WRITING_PACK v1

v1 does not:

- search previous Runs for missing evidence;
- merge evidence across Runs;
- perform cross-run freshness reconciliation;
- interpolate values;
- estimate missing evidence.

## 4. Expected logical datasets

The seven expected logical dataset families are:

| Logical dataset | Source | Dataset type |
|---|---|---|
| Google Trends Interest Over Time | `google-trends` | `INTEREST_OVER_TIME` |
| Google Search Console Query × Page | `google-search-console-query-page` | `QUERY_PAGE` |
| Google Ads Search Terms | `google-ads-search-terms` | `SEARCH_TERMS` |
| Keyword Planner Historical Metrics | `google-keyword-planner` and/or `google-keyword-planner-csv` | `KEYWORD_HISTORICAL_METRICS` |
| İkas Products | `ikas-products` | `PRODUCTS` |
| Bitkimark Sitemap | `bitkimark-sitemap` | `SITEMAP_URLS` |
| SerpApi Google SERP | `serpapi` | `GOOGLE_SERP` |

The six-dataset Google Ads SEARCH reporting family used by `ADS_OPTIMIZATION_PACK` is not required for Blog Writing Pack v1.

Keyword Planner API and manual-import provenance remain distinct and source-faithful.

For Blog coverage, `google-keyword-planner` and `google-keyword-planner-csv`
are two acquisition paths for the same logical dataset family.

Rules:

- either accepted path may satisfy `KEYWORD_HISTORICAL_METRICS` coverage;
- if both paths have eligible accepted evidence in the same Run, both are
  preserved in the Blog package;
- one path does not override, suppress, or deduplicate the other;
- `source_id`, Job identity, validation status, and acquisition provenance
  keep rows distinguishable;
- manual-import evidence remains identifiable as file-import provenance
  rather than API acquisition.

### Blog recipe inclusion filter

Blog v1 consumes only Jobs belonging to the approved Blog recipe.

The in-scope source-to-dataset mappings are:

    google-trends
      → INTEREST_OVER_TIME

    google-search-console-query-page
      → QUERY_PAGE

    google-ads-search-terms
      → SEARCH_TERMS

    google-keyword-planner
      → KEYWORD_HISTORICAL_METRICS

    google-keyword-planner-csv
      → KEYWORD_HISTORICAL_METRICS

    ikas-products
      → PRODUCTS

    bitkimark-sitemap
      → SITEMAP_URLS

    serpapi
      → GOOGLE_SERP

Jobs from other source IDs or dataset families in the same Run are outside
the Blog recipe.

Out-of-recipe Jobs must not affect:

- Blog workbook rows;
- Blog source-separated dataset files;
- Blog coverage state;
- Blog failure counts;
- Blog `FAILURES.json`.

Examples of accepted Run evidence that remains outside Blog v1 include:

- GSC `QUERY`;
- the six-dataset `google-ads-search-reporting` family;
- future datasets added to the Run for another package recipe.

Selection is fail-closed: an in-scope source that loads as an unexpected
dataset type is a Blog package consistency error rather than permission to
silently include it.

## 5. Publish eligibility and coverage

Publication is partial-but-explicit.

If zero eligible accepted datasets exist:

    NOT_READY

and no package is published.

If at least one eligible accepted dataset exists, a package may be published with:

    COMPLETE
    PARTIAL

`COMPLETE` means all seven expected logical dataset families have trusted accepted outcomes for the Run.

`PARTIAL` means at least one expected logical dataset family lacks an eligible accepted outcome.

Coverage is evidence completeness only. It is not a score, recommendation, performance grade, or marketing judgment.

## 6. Validation and NO_DATA semantics

Existing Core validation remains authoritative.

- `VALID` → eligible accepted evidence.
- `LOW_DATA` → eligible accepted-with-warning evidence.
- verified `NO_DATA` → valid provider empty outcome.
- rejected schema/content/context evidence → not exportable as normal rows.
- operational failure before accepted evidence → not exportable as normal rows.

`NO_DATA` is not failure, missing evidence, zero, or permission to fabricate rows.

The package distinguishes:

    present_datasets
    no_data_datasets
    incomplete_datasets
    missing_datasets

A verified `NO_DATA` outcome may satisfy logical coverage without creating fabricated dataset rows.

Logical-family coverage is also represented explicitly as
`coverage_by_dataset`.

For each of the seven logical dataset families, the coverage entry records
at least:

    status: COVERED | PARTIAL | MISSING
    total_jobs
    accepted_jobs
    no_data_jobs
    incomplete_jobs

The counts refer only to in-recipe Jobs in the selected Run.

Definitions:

- `COVERED`: one or more in-recipe Jobs exist and every such Job has an
  eligible accepted outcome.
- `PARTIAL`: one or more in-recipe Jobs have eligible accepted outcomes,
  but at least one sibling in-recipe Job does not.
- `MISSING`: no eligible accepted outcome exists for that logical family,
  including the case where the Run contains no Job for the family.

`present_datasets` means the family has at least one accepted populated or
accepted-with-warning dataset.

`no_data_datasets` means the family has at least one accepted verified
`NO_DATA` outcome.

`incomplete_datasets` identifies families whose coverage status is
`PARTIAL`.

`missing_datasets` identifies families whose coverage status is `MISSING`.

These summary arrays are allowed to overlap where semantics require it.
For example, a family may be both present and incomplete when one sibling
Job succeeded and another failed.

## 7. Multi-Job behavior

Some logical dataset families may contain multiple Jobs in one Run, including multiple Google Trends groups and SerpApi queries.

Successful sibling Jobs remain exportable when another sibling Job fails.

A failed Job must not suppress accepted sibling evidence.

Failures remain independently visible and Job identity/provenance must not be erased by aggregation.

### Multi-Job completeness rule

Coverage is evaluated at Job granularity before it is summarized at
logical-dataset level.

For a logical dataset family with one or more in-recipe Jobs:

- every Job must resolve to an eligible accepted outcome for the family to
  be `COVERED`;
- an eligible accepted outcome means the existing Core export-eligibility
  boundary is satisfied: completed execution, accepted raw Artifact, and
  validation status `VALID`, `LOW_DATA`, or verified `NO_DATA`;
- if some Jobs are accepted but another sibling is failed, cancelled,
  rejected, pending, running, manual-action-required, or otherwise lacks
  eligible accepted evidence, the family is `PARTIAL`;
- if no Job has eligible accepted evidence, the family is `MISSING`;
- accepted sibling evidence remains exportable even when the family is
  `PARTIAL`.

Therefore:

    GT01 accepted
    GT02 accepted
    GT03 accepted
    GT04 accepted
    GT05 failed

produces usable `GT_INTEREST` rows from GT01–GT04, but
`INTEREST_OVER_TIME` coverage is `PARTIAL`, and the Blog package overall
cannot be `COMPLETE`.

The same rule applies to multi-query SerpApi work, multiple Keyword Planner
Jobs, and any other Blog-recipe family with multiple Jobs.

Job-backed terminal failures remain represented in the generalized
`FAILURES.json` when they satisfy its existing failure contract.

A completely absent logical family has no real Job identity to report.
The Blog package must not invent a synthetic Job or fake failure row for
it. Such absence is represented truthfully as `MISSING` in
`BLOG_PACKAGE.json`, `coverage_by_dataset`, and `RUN_METADATA`.

A non-terminal in-recipe Job that prevents completeness is likewise
represented through Blog coverage metadata unless the generalized Data
Package failure contract independently classifies it as a failure.

## 8. User-facing workbook

The user-facing workbook filename is:

    BLOG_WRITING_PACK.xlsx

The v1 worksheet contract is:

    README
    RUN_METADATA
    GT_INTEREST
    GSC_QUERY_PAGE
    ADS_SEARCH_TERMS
    KWP_METRICS
    KWP_MONTHLY
    PRODUCTS
    SITEMAP_URLS
    SERP_RESULTS
    FAILURES
    PROVENANCE

The workbook remains source-separated.

It must not derive:

- estimated search counts from Google Trends;
- cross-source scores;
- keyword recommendations;
- search-intent classifications;
- recommended page types;
- content priorities;
- SEO recommendations;
- commercial recommendations;
- marketing actions.

Missing values remain missing.

A data worksheet may be header-only when no rows exist. Coverage metadata must distinguish verified `NO_DATA` from missing or failed evidence.

### README

Contains:

- package purpose;
- Collector versus downstream-analysis boundary;
- evidence semantics;
- coverage definitions;
- `NO_DATA` semantics;
- warning that source-separated evidence is not an analytical conclusion.

### RUN_METADATA

Contains package-level identity and coverage metadata, including:

- `package_id`;
- `recipe_id`;
- `recipe_version`;
- `run_id`;
- `workspace_id`;
- `created_at`;
- application version;
- coverage status;
- expected logical datasets;
- present logical datasets;
- verified no-data logical datasets;
- missing logical datasets.

### GT_INTEREST

Contains Google Trends Interest Over Time evidence.

It preserves:

- query-group identity/context;
- query identity;
- temporal evidence;
- geography/context already supported by normalized output;
- nullable relative interest.

Relative interest remains Google Trends relative 0–100 evidence.

Different independently normalized comparison groups must not be represented as globally comparable.

### GSC_QUERY_PAGE

Contains accepted Google Search Console Query × Page evidence.

Provider-native metrics remain source-faithful, including:

- query;
- page;
- clicks;
- impressions;
- CTR;
- position.

Missing provider evidence remains missing.

### ADS_SEARCH_TERMS

Contains accepted Google Ads Search Terms evidence from the existing Blog-relevant source path.

No Ads optimization interpretation is added.

### KWP_METRICS

Contains keyword-level Keyword Planner historical metrics.

Provider-returned missing values remain missing.

API and manual-import acquisition provenance remain distinguishable.

### KWP_MONTHLY

Contains deterministic row expansion of provider-returned monthly history.

No missing month or volume value is interpolated or estimated.

### PRODUCTS

Contains accepted normalized İkas product and variant evidence.

Missing product fields remain missing.

### SITEMAP_URLS

Contains the canonical sitemap URL inventory and existing deterministic source annotations.

The Blog pack must not filter the canonical inventory based on inferred SEO value.

### SERP_RESULTS

Contains accepted SerpApi evidence.

Provider result types such as `ORGANIC` and `PAA` remain explicitly labeled.

The package does not derive intent, commercial fit, page type, or recommended action.

### FAILURES

Contains safe Job-level failure information sufficient to explain unavailable evidence.

It must not expose:

- secrets;
- credential references intended only for Core;
- raw provider error bodies;
- native stack traces;
- unsafe internal filesystem paths.

### PROVENANCE

Contains traceability fields available from the existing evidence lifecycle, including where available:

- Run identity;
- Job identity and key;
- source identity;
- dataset identity;
- Attempt number;
- validation status;
- accepted raw Artifact identity;
- raw Artifact filename;
- raw Artifact media type;
- raw Artifact byte size;
- SHA-256;
- acquisition time;
- sanitized requested context.

Raw evidence remains authoritative outside the workbook.

### Stable v1 workbook column contracts

Every source-evidence data sheet begins with this common identity prefix:

    source_id
    job_id
    job_key
    validation_status

These values are taken from Data Package dataset identity and provenance.
They are workbook presentation fields only; underlying normalized Data
Package rows are not mutated.

The fixed v1 columns are:

`README`

    section
    value

`RUN_METADATA`

    package_id
    recipe_id
    recipe_version
    run_id
    workspace_id
    created_at
    application_version
    coverage_status
    expected_datasets
    present_datasets
    no_data_datasets
    incomplete_datasets
    missing_datasets
    coverage_by_dataset

`GT_INTEREST`

    source_id
    job_id
    job_key
    validation_status
    query_group_id
    period_start
    temporal_dimension
    category_label
    query
    geography_label
    relative_interest

`query_group_id` is resolved from trusted Google Trends Job/requested
context and must remain consistent with that Job's group identity. If the
accepted evidence cannot preserve this identity, Blog package publication
fails closed rather than emitting context-free Trends rows.

`GSC_QUERY_PAGE`

    source_id
    job_id
    job_key
    validation_status
    query
    page
    clicks
    impressions
    ctr
    position

`ADS_SEARCH_TERMS`

    source_id
    job_id
    job_key
    validation_status
    search_term
    keyword
    match_type
    campaign
    ad_group
    impressions
    clicks
    ctr
    average_cpc
    cost
    conversions
    conversion_value

`KWP_METRICS`

    source_id
    job_id
    job_key
    validation_status
    group_id
    requested_keyword
    returned_keyword
    close_variants
    matched_requested_keywords
    currency
    avg_monthly_searches
    competition
    competition_index
    top_of_page_bid_low
    top_of_page_bid_high
    change_3_month
    change_yoy

`currency` remains empty when the accepted acquisition path does not
provide it.

Array-valued Keyword Planner identity fields such as `close_variants` and
`matched_requested_keywords` are serialized deterministically for XLSX
display without changing the underlying normalized evidence.

`KWP_MONTHLY`

    source_id
    job_id
    job_key
    validation_status
    group_id
    requested_keyword
    returned_keyword
    currency
    year
    month
    searches

One workbook row is emitted for each provider-returned monthly-history
entry. Missing months or volumes are never synthesized.

`PRODUCTS`

    source_id
    job_id
    job_key
    validation_status
    product_title
    product_id
    variant_id
    url
    categories_product_type
    categories
    product_type
    availability
    price
    sale_price
    description
    slug
    image_url
    plant_height
    pot_type
    stock
    deleted
    variant_active
    continue_selling
    sales_channel_lower
    sales_channel_upper

`SITEMAP_URLS`

    source_id
    job_id
    job_key
    validation_status
    loc
    lastmod
    document_kind
    source_url
    parent_sitemap_url
    retrieved_at

`SERP_RESULTS`

    source_id
    job_id
    job_key
    validation_status
    query
    position
    title
    url
    domain
    snippet
    paa
    result_type

`FAILURES`

    source_id
    job_key
    code

`PROVENANCE`

    source_id
    dataset_type
    job_id
    job_key
    run_id
    workspace_id
    attempt_number
    validation_status
    raw_artifact_id
    raw_artifact_filename
    raw_artifact_media_type
    raw_artifact_byte_size
    raw_artifact_sha256
    acquired_at
    requested_context

`requested_context` is a deterministic sanitized representation of the
already-sanitized Data Package requested context. It must not reintroduce
secret/path-shaped fields removed by the production loader.

## 9. Evidence package layout

Blog Writing Pack uses a separate canonical package area rather than reusing the Ads Task Package store.

Canonical v1 storage is:

    ApplicationDirectories.data/
    └── blog-writing-packs/
        └── <package_id>/
            ├── BLOG_WRITING_PACK.xlsx
            ├── BLOG_PACKAGE.json
            ├── MANIFEST.json
            ├── DATASETS.json
            ├── FAILURES.json
            └── <source-separated dataset files>

Existing raw source Artifacts remain in canonical Run-scoped storage.

Raw Artifacts are not copied into the Blog pack merely for convenience.

The package maintains traceability to raw evidence through stable provenance identifiers and checksums.

## 10. BLOG_PACKAGE.json

Blog-specific package metadata is stored separately in:

    BLOG_PACKAGE.json

The generalized Data Package `MANIFEST.json` contract is not expanded merely to carry Blog-specific semantics.

Conceptual Blog metadata is:

    package_id
    recipe_id: BLOG_WRITING_PACK
    recipe_version: 1

    run_id
    workspace_id
    created_at
    application_version

    coverage_status: COMPLETE | PARTIAL

    expected_datasets
    present_datasets
    no_data_datasets
    incomplete_datasets
    missing_datasets
    coverage_by_dataset

    workbook_filename

    data_package:
      manifest_filename
      datasets_index_filename
      failures_filename

Exact TypeScript field shapes are locked during implementation planning from existing repository conventions while preserving these semantics.

`BLOG_PACKAGE.json` must not contain:

- passwords;
- API keys;
- OAuth access or refresh tokens;
- client secrets;
- developer tokens;
- Core-only credential references;
- raw provider error bodies;
- unsafe absolute internal paths.

## 11. Package identity and immutable snapshots

Every explicit successful Build Blog Writing Pack action creates a new opaque unique `package_id`.

The same `run_id` may therefore produce multiple immutable package snapshots.

Example:

    Run R1
    ├── Blog Pack P1 → PARTIAL
    ├── Retry Failed
    └── Blog Pack P2 → COMPLETE

P1 remains immutable and is not overwritten by P2.

v1 does not require package deduplication.

Rebuilding the same Run intentionally produces another immutable snapshot.

## 12. Publication lifecycle

Publication uses a private staging directory followed by atomic final publication.

The intended flow is:

    create private staging directory
            ↓
    load accepted Run evidence
            ↓
    re-verify accepted raw evidence integrity
            ↓
    build generalized Data Package
            ↓
    write source-separated package files
            ↓
    write BLOG_WRITING_PACK.xlsx
            ↓
    write BLOG_PACKAGE.json
            ↓
    validate package consistency
            ↓
    atomic rename to final <package_id>

Rules:

- final package directories are never overwritten;
- incomplete staging output is not published;
- failed publication does not damage an earlier package;
- staging cleanup is bounded and safe;
- final publication happens only after generated package consistency checks pass.

A new SQLite package table is not required for v1 unless implementation planning proves filesystem identity is insufficient for the approved desktop behavior.

Such a finding requires an explicit design ruling rather than silent schema expansion.

## 13. Desktop behavior

Blog Writing Pack is exposed from the existing Run Detail context.

Conceptual terminal Run actions are:

    Export All
    Export Successful Only
    Build Blog Writing Pack

`Build Blog Writing Pack`:

1. accepts an existing trusted `run_id`;
2. resolves authoritative Run state in the main process;
3. performs no provider request;
4. performs no retry;
5. loads only eligible accepted evidence;
6. returns `NOT_READY` when zero eligible accepted datasets exist;
7. otherwise builds and publishes a new immutable package;
8. returns only safe package/result metadata to the renderer.

The renderer must not receive:

- credential material;
- raw provider bodies;
- native stack traces;
- arbitrary internal absolute paths.

Open/Reveal actions accept trusted package identity and resolve the actual filesystem location in the main process.

The renderer must not provide an arbitrary path for package open/reveal operations.

## 14. Retry behavior

Blog package assembly does not own retry.

When evidence is missing because Jobs failed, retry remains an existing Core / Run Detail responsibility.

After retry:

    existing Run
      ↓
    new Job/Attempt evidence
      ↓
    user explicitly builds another Blog Pack
      ↓
    new immutable package snapshot

The previous package remains unchanged.

Blog package assembly must never trigger provider recollection automatically.

## 15. Failure behavior

Package assembly fails closed when required local evidence or package-integrity assumptions are violated.

Examples include:

- accepted Artifact ownership mismatch;
- accepted Artifact file missing;
- accepted Artifact is not a regular file;
- raw Artifact byte-size mismatch;
- raw Artifact SHA-256 mismatch;
- malformed accepted evidence that cannot be normalized under the existing source contract;
- package identity collision;
- final destination already exists;
- generated workbook or package metadata is internally inconsistent.

A local package failure must not:

- trigger provider recollection;
- silently omit corrupted accepted evidence and claim completeness;
- overwrite an existing package;
- fabricate replacement rows;
- expose native stack traces or unsafe paths to the renderer.

## 16. Non-goals for v1

The following are explicitly outside `BLOG_WRITING_PACK v1`:

- new source adapters;
- new provider acquisition modes;
- provider calls from the package layer;
- cross-run evidence reuse;
- automatic freshness reconciliation;
- cross-source analytical joins;
- keyword scoring;
- search-intent classification;
- topic recommendation;
- blog-topic generation;
- recommended page type;
- SEO prioritization;
- commercial scoring;
- automatic writing;
- Performance Max support;
- Ads Task Package refactoring;
- generic editable recipe DSL;
- automatic provider retry;
- new package database schema unless implementation audit proves it necessary and a separate design ruling approves it.

## 17. Deterministic acceptance criteria

`BLOG_WRITING_PACK v1` implementation is not complete until deterministic tests prove at least the following.

1. The seven expected logical dataset families are defined.
2. Zero eligible accepted datasets returns `NOT_READY`.
3. `NOT_READY` publishes no final package directory.
4. One or more eligible accepted datasets permits publication.
5. All expected logical coverage resolves `COMPLETE`.
6. Incomplete accepted coverage resolves `PARTIAL`.
7. Verified `NO_DATA` remains distinct from missing evidence.
8. Verified `NO_DATA` creates no fabricated rows.
9. Failed sibling Jobs do not suppress successful sibling evidence.
10. Rejected evidence never enters normal workbook or dataset rows.
11. NULL and missing values are not converted to zero.
12. Source identity remains visible.
13. Dataset identity remains visible.
14. Job identity remains traceable where the source is multi-Job.
15. Provenance remains traceable to Run, Job, Attempt, accepted Artifact, checksum, acquisition time, and validation outcome where available.
16. Accepted raw Artifact integrity is rechecked before package consumption.
17. Artifact integrity failure stops publication fail-closed.
18. The workbook has the fixed v1 worksheet contract.
19. Workbook semantics remain source-separated and non-analytical.
20. Google Trends comparison-group context remains preserved.
21. Google Trends relative interest is never converted into estimated search volume.
22. Keyword Planner missing metrics remain missing.
23. Keyword Planner monthly history is not interpolated.
24. Sitemap canonical inventory is not filtered by inferred SEO value.
25. SERP evidence receives no derived intent or recommended action.
26. `BLOG_PACKAGE.json` and generalized Data Package metadata agree on Run identity.
27. Workbook metadata agrees with package identity and coverage state.
28. Two explicit builds from one Run create two different `package_id` values.
29. A prior PARTIAL package survives creation of a later package.
30. Retry remains outside Blog package assembly.
31. Blog package assembly performs no provider call.
32. Incomplete staging output is never treated as published.
33. Final package directories are never overwritten.
34. Package identity collision fails closed.
35. Renderer-visible responses contain no credentials or secrets.
36. Renderer-visible responses contain no raw provider error body.
37. Renderer-visible responses contain no native stack trace.
38. Renderer-visible responses contain no arbitrary internal absolute path.
39. Package open/reveal resolves trusted package identity in the main process.
40. Ordinary automated Blog package tests consume no live-provider quota.
41. Accepted API and manual-CSV Keyword Planner evidence in the same Run
    are both preserved and remain distinguishable by source and provenance.
42. Either accepted Keyword Planner acquisition path can satisfy the
    logical Keyword Planner coverage requirement.
43. Blog publication does not emit the existing separate Keyword Planner
    CSV/XLSX user-export files.
44. Existing generalized Data Package callers retain their current
    Keyword Planner user-export behavior by default.
45. Every workbook sheet conforms to the fixed v1 column contract.
46. Every source-evidence workbook row retains `source_id`, `job_id`,
    `job_key`, and `validation_status`.
47. Google Trends workbook rows explicitly preserve `query_group_id` and
    `job_id`; duplicate queries in different comparison groups remain
    distinct.
48. Only the approved Blog source/dataset mappings may enter Blog package
    datasets, workbook rows, coverage, or Blog failure accounting.
49. Accepted out-of-recipe evidence in the same Run is ignored by Blog
    assembly without being mutated or deleted.
50. An in-scope source resolving to an unexpected dataset type fails Blog
    package assembly closed.
51. A logical family with all in-recipe Jobs accepted resolves `COVERED`.
52. A logical family with at least one accepted Job and at least one
    non-accepted sibling resolves `PARTIAL`.
53. A logical family with no eligible accepted outcome resolves `MISSING`.
54. A multi-Job family with accepted siblings and one failed sibling
    preserves accepted rows but prevents overall package `COMPLETE`.
55. Missing logical families never create synthetic Jobs or fabricated
    failure rows; absence is expressed through Blog coverage metadata.

## 18. Packaged application acceptance

After deterministic implementation gates pass, packaged desktop acceptance must verify the real packaged application can:

- locate an eligible persisted Run;
- build a Blog Writing Pack without provider traffic;
- report `COMPLETE` or `PARTIAL` truthfully;
- expose `NOT_READY` when zero eligible accepted datasets exist;
- publish the workbook and structured evidence package;
- open or reveal the produced package through a trusted main-process boundary;
- preserve an earlier immutable package snapshot;
- create another immutable snapshot from the same Run;
- expose safe failure information without credentials, raw provider bodies, native stack traces, or arbitrary internal paths.

Live provider acceptance remains a separate source-acquisition concern.

A Blog Pack build must never be used as justification to spend provider quota.

## 19. Relationship to generalized Data Package

The generalized Data Package remains the evidence/export foundation.

Blog Writing Pack adds:

- versioned Blog package semantics;
- logical Blog evidence coverage;
- `BLOG_PACKAGE.json`;
- the user-facing XLSX workbook;
- immutable Blog package publication;
- safe desktop Build/Open/Reveal behavior.

The existing generalized Data Package writer currently also emits
Keyword Planner user-facing CSV/XLSX exports. Blog Writing Pack does not
include those additional files in its canonical package layout.

Implementation therefore introduces the smallest backward-compatible
base-evidence write seam needed to write:

    MANIFEST.json
    FAILURES.json
    DATASETS.json
    source-separated dataset JSON files

without automatically invoking the separate Keyword Planner user-export
writer.

Existing generalized Data Package callers retain their current default
behavior. Blog uses the base-evidence-only path. The generalized writer is
not duplicated into a Blog-specific copy.

It does not replace generalized Run export.

Existing actions remain valid independently:

    Export All
    Export Successful Only

Blog adds a separate explicit action:

    Build Blog Writing Pack

## 20. Relationship to ADS_OPTIMIZATION_PACK

`BLOG_WRITING_PACK v1` and `ADS_OPTIMIZATION_PACK v1` are separate user-facing package products that share RoofRoom's collection, validation, preservation, and provenance philosophy.

Blog v1 deliberately does not inherit Ads-specific assumptions such as:

- `customer_id`;
- `campaign_scope`;
- CURRENT/PREVIOUS performance windows;
- prior-package baseline selection;
- Ads comparison semantics.

Any future source-neutralization or generalization of Task Package internals must be justified by real reuse pressure and handled separately from Blog v1 delivery.

## 21. Storage and persistence ruling

The v1 canonical package identity is the immutable package directory plus `BLOG_PACKAGE.json`.

No new SQLite table is part of the approved v1 design.

During implementation planning, repository inspection must verify that filesystem-backed identity is sufficient for:

- safe package creation;
- package lookup by trusted ID;
- open/reveal;
- immutable snapshot preservation;
- packaged application behavior.

If that inspection proves a persisted package index is technically required, implementation must stop and return to design review before adding a migration or new database table.

## 22. Testing strategy

Normal tests are deterministic and make no live provider calls.

Required coverage includes:

- contract tests for Blog package metadata;
- recipe/coverage-policy tests;
- workbook exporter tests;
- publisher/staging/atomic-publication tests;
- evidence-integrity failure tests;
- partial/complete/no-data coverage tests;
- sibling Job success/failure tests;
- desktop controller and IPC tests;
- renderer smoke tests where UI is exposed;
- package open/reveal security tests;
- adjacent generalized Data Package regressions;
- adjacent Run retry/export regressions;
- full deterministic release gate.

Packaged-app acceptance is performed only after deterministic gates are green.

## 23. Implementation discipline

Implementation follows the repository workflow:

    Plan
    → Ponytail FULL implementation
    → TDD
    → focused verification
    → @ponytail-review
    → simplification fixes or explicit rulings
    → separate correctness review
    → focused regression gates
    → full release gate
    → packaged acceptance
    → documentation
    → merge and push

Ponytail FULL is the default implementation mode.

`@ponytail-review` is a separate mandatory simplification and overengineering gate before completion.

A separate correctness review follows the Ponytail review.

No completion claim is made without fresh verification evidence.

## 24. Protected historical files

The following historical untracked files are not part of this work and must remain untouched:

    CODEX_HANDOFF_CURRENT.md
    PROJECT_HANDOFF.pre-20260820.md

They must not be edited, staged, deleted, or committed.

## 25. Locked design decisions

The approved `BLOG_WRITING_PACK v1` decisions are:

1. Deliver both a user-facing XLSX workbook and a structured evidence/provenance package.
2. Implement Blog Pack as a thin specialization above the existing generalized Data Package flow.
3. Keep workbook datasets source-separated and non-analytical.
4. Use the seven defined Blog logical dataset families.
5. Permit partial-but-explicit publication when at least one eligible accepted dataset exists.
6. Return `NOT_READY` and publish nothing when zero eligible accepted datasets exist.
7. Treat `COMPLETE` and `PARTIAL` only as evidence-coverage states.
8. Keep verified `NO_DATA` distinct from missing evidence and failure.
9. Allow verified `NO_DATA` to satisfy logical coverage without fabricated rows.
10. Restrict each Blog Pack build to exactly one Run.
11. Perform no cross-run evidence reuse or merge in v1.
12. Preserve successful sibling Job evidence when another sibling Job fails.
13. Produce the fixed v1 workbook sheet contract.
14. Preserve raw Artifacts outside the Blog package in canonical Run storage.
15. Store Blog-specific metadata in separate `BLOG_PACKAGE.json`.
16. Do not alter the generalized Data Package manifest merely for Blog-specific semantics.
17. Create a new immutable `package_id` for every explicit successful build.
18. Permit multiple immutable Blog Pack snapshots for the same Run.
19. Preserve older PARTIAL snapshots after retry or later builds.
20. Keep retry outside Blog package assembly.
21. Use separate canonical `data/blog-writing-packs/<package_id>/` storage.
22. Publish through private staging, package validation, and atomic rename.
23. Never overwrite a final package directory.
24. Add no package database table in v1 unless implementation audit proves it necessary and design is reopened.
25. Expose Build/Open/Reveal through trusted main-process boundaries.
26. Never allow renderer-controlled arbitrary package filesystem paths.
27. Perform no provider calls during package assembly.
28. Perform no analysis, scoring, recommendation, SEO strategy, or writing inside RoofRoom.
29. Do not refactor Ads Task Package internals as part of Blog v1.
30. Keep ordinary regression completely free of live-provider requests.
31. Treat official API and manual CSV Keyword Planner acquisition as two
    source-faithful paths for one logical Blog dataset family.
32. If both Keyword Planner paths are accepted in one Run, preserve both;
    apply no precedence, silent override, or cross-source deduplication.
33. Allow either accepted Keyword Planner path to satisfy logical coverage.
34. Use a backward-compatible base-evidence Data Package writer seam so
    Blog does not emit the existing separate Keyword Planner CSV/XLSX
    exports.
35. Keep existing generalized Data Package caller behavior unchanged by
    default.
36. Use the fixed v1 workbook column contracts defined in this design.
37. Prefix every source-evidence data row with stable dataset/Job identity
    fields.
38. Preserve explicit `query_group_id` on Google Trends workbook rows.
39. Filter Run evidence through the exact Blog recipe source/dataset
    allowlist before Blog coverage and publication.
40. Exclude out-of-recipe Jobs from Blog datasets, workbook output,
    coverage, and Blog failure accounting.
41. Evaluate completeness at in-recipe Job granularity before summarizing
    logical dataset coverage.
42. Treat accepted-sibling plus non-accepted-sibling evidence as
    `PARTIAL`, never `COMPLETE`.
43. Add `coverage_by_dataset` plus `incomplete_datasets` so multi-Job
    partial coverage remains explicit.
44. Never invent synthetic Jobs or failure rows for a logical family that
    is absent from the Run.

## 26. Approval boundary

Approval of this design authorizes creation of the implementation plan.

It does not by itself authorize implementation.

Implementation begins only after:

1. this written design is reviewed and approved;
2. a repository-grounded implementation plan is written;
3. that plan is reviewed;
4. the execution method is selected.
