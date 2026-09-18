# Keyword Planner Manual CSV Fallback Implementation Plan

**Goal:** Add the verified Google Keyword Planner manual export as a reviewed `FILE_IMPORT` vertical while preserving exact raw bytes and keeping its provenance distinct from the official API.

**Observed evidence:** The read-only provider export `Keyword Stats 2026-09-08 at 16_21_37.csv` was inspected on 2026-09-18. It is UTF-16LE with a BOM, tab-delimited despite the `.csv` suffix, has two metadata lines before the header, segmentation aggregate rows before keyword rows, localized competition and comma-decimal bid values, twelve `Searches: Mon YYYY` columns, and blank metric cells. Repository fixtures must be sanitized derivatives of this observed structure and must not include the user's raw keywords.

**Architecture:** Register `google-keyword-planner-csv` as a separate desktop/Core source with `FILE_IMPORT` acquisition and the existing `KEYWORD_HISTORICAL_METRICS` dataset family. Review locks an absolute path; Start persists it in Job context; the source copies the original bytes unchanged into run evidence; the validator parses those stored bytes. The official API source remains unchanged.

**Spec:** `PROJECT_SPEC.md` section 4.4; `ARCHITECTURE.md` FILE_IMPORT boundary; `DATA_CONTRACTS.md` Keyword Planner contract; `VALIDATION_SPEC.md` section 10; `TEST_STRATEGY.md` Keyword Planner import coverage.

## Task 1: Lock the parser contract with sanitized observed-shape tests

- Add a focused integration suite that creates UTF-16LE+BOM tabular bytes from a sanitized observed-shape string.
- Assert metadata/header discovery, segmentation-row handling, twelve monthly columns, localized percent/bid parsing, and blank-to-`NULL` semantics.
- Assert unrelated UTF-16, UTF-8 masquerading as CSV, malformed quoting, missing required headers, malformed numeric cells, and partial rows fail closed.
- Run the test first and record the expected missing-module failure.

## Task 2: Implement the fail-closed parser and validator

- Add a quote-aware tabular decoder restricted to the verified UTF-16LE+BOM representation.
- Require the observed provider header family and valid monthly column labels.
- Skip explicit blank-keyword segmentation aggregate rows before the first keyword row; reject them after keyword data begins.
- Normalize provider metrics without manufacturing values; blank metric and month cells become `null`.
- Add a collection validator that parses the immutable artifact and returns `VALID`, `NO_DATA`, or `INVALID_SCHEMA` with a structured finding.

## Task 3: Bind Review → Job → Core raw evidence

- Add strict task/source/mode/path Job-context helpers.
- Add a collecting source that reads the reviewed absolute path through the shared FILE_IMPORT evidence reader and returns the exact bytes.
- Register the source and validator in production composition.
- Extend the controller planner and reviewed-draft resolver for the new source.
- Test that Review locks the path, Start persists it unchanged, Core preserves byte-for-byte evidence, validation succeeds, and API/import provenance identifiers differ.

## Task 4: Add the desktop file-selection flow

- Add a Keyword Planner CSV task card and file-selection kind/filter.
- Require an explicit selected export before Review.
- Show the selected filename/path in the task detail and the locked path in Review.
- Extend the desktop UI smoke test to cover selection, reviewed artifact, exact Start payload, and missing-file gating.

## Task 5: Verify and checkpoint

- Run focused parser/Core/UI tests, TypeScript, and lint.
- Add the focused suite to the deterministic release gate and run the full release gate.
- Review the diff locally for contract drift, raw-evidence mutation, secret leakage, and API/import provenance blending.
- Commit the technical checkpoint, update `PROJECT_HANDOFF.md` with evidence and the next exact action, commit the documentation checkpoint, fast-forward local `main`, and rerun the release gate on merged `main`.

