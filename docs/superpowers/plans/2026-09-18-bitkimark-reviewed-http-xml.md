# Bitkimark Reviewed HTTP/XML Implementation Plan

**Goal:** Complete the existing Bitkimark sitemap source as a reviewed, request-bound Release 1.0 vertical with source-faithful HTTP provenance, sitemap-index/URL-set validation, and no broad crawler behavior.

**Existing verified foundation:** `BitkimarkSitemapSource`, raw XML storage, URL-set parsing, deterministic annotations, a source validator, production registration, and a confirmation/HTTPS-guarded one-request live-smoke command already pass the release gate. The real live command remains unexecuted.

**Architecture:** Review locks an explicit list of the five evidence-backed Bitkimark sitemap URLs. Core creates one Job and exactly one HTTP request per URL. Each Job context records requested URL, expected host, and nullable parent sitemap URL. The source binds only persisted Job context and returns exact response bytes plus optional acquisition metadata. Core writes that metadata into the source-neutral metadata document. The parser validates one document at a time; it never follows discovered URLs.

**Spec:** `PROJECT_SPEC.md` section 4.6; `ARCHITECTURE.md` Bitkimark notes; `DATA_CONTRACTS.md` sections 17/19; `VALIDATION_SPEC.md` section 12; `TEST_STRATEGY.md` Bitkimark coverage; Work Group 9 in `ROOFROOM_CODEX_DO_LIST.md`.

## Task 1: Lock the strict HTTP/XML and parser contracts

- Add focused tests for URL-set and sitemap-index documents from sanitized evidence.
- Assert `loc`, nullable valid `lastmod`, document kind, and parent/child context.
- Assert malformed XML, HTML, foreign/non-HTTPS URLs, duplicate URLs, invalid `lastmod`, missing `loc`, and unexpected root types fail closed.
- Assert one explicit context produces exactly one request, and two calls on one source instance never leak URLs.
- Run RED before implementation.

## Task 2: Bind Review → Job → request

- Add strict task/source/mode/requested-URL/expected-host/parent context helpers.
- Replace constructor-captured production URL with `collect(context)` request binding.
- Create one Job for each explicit reviewed URL and reject duplicates or unsupported host/protocol before request.
- Add a desktop URL-list input initialized to the five verified paths; Review displays the exact locked list and Start forwards it unchanged.

## Task 3: Preserve HTTP acquisition metadata

- Extend successful collection results with optional JSON-safe acquisition metadata without changing existing sources.
- Persist status, response content type, requested URL, and final URL in source-neutral metadata JSON alongside immutable raw evidence.
- Pass acquisition metadata into validation so HTTP success/content type/final-host mismatches cannot be hidden by parseable bytes.
- Prove existing sources remain compatible through deterministic Core gates.

## Task 4: Complete validation without crawling

- Parse exactly one sitemap-index or URL-set document per artifact.
- Validate expected-site HTTPS locations, nullable valid `lastmod`, duplicates, document type, and parent/child context.
- Preserve approved deterministic annotations only for URL-set entries; do not filter canonical inventory.
- Do not request child links discovered during parsing; reviewed child URLs are separate sequential Jobs.

## Task 5: Verify and checkpoint

- Update the guarded live-smoke test and implementation for the context-bound source while preserving exact confirmation, one-request/no-retry behavior, and safe summary output.
- Run focused source/Core/UI/live-command-guard tests, TypeScript, lint, and the full release gate without a live request.
- Review the diff locally for crawler expansion, unsafe redirects, missing provenance, raw-byte mutation, and contract drift.
- Commit the technical checkpoint, update `PROJECT_HANDOFF.md`, commit the documentation checkpoint, fast-forward local `main`, and rerun the release gate on merged `main`.

