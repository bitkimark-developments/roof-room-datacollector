# Generic Production Data Package Export Plan

## Goal

Bind terminal desktop Run export to accepted raw artifacts for every implemented Release 1.0 source, reusing each source's verified parser/normalizer and writing collision-safe source-native datasets with durable provenance.

## Design

- Add a production dataset loader that reads only completed Jobs with accepted validation and their exact linked `RAW_SOURCE_FILE` artifact.
- Re-resolve every raw path through `StorageManager`, reject symbolic links/non-files, and verify persisted byte size and SHA-256 before parsing.
- Reuse the existing verified source parser/normalizer for Google Trends, GSC Query × Page, Google Ads Search Terms, Keyword Planner official API, Keyword Planner manual CSV, İkas Products, Bitkimark Sitemap, and SerpApi.
- Emit one dataset per accepted Job. Carry `job_id` and `job_key` in the dataset descriptor so repeated Jobs for the same source/dataset cannot overwrite one another.
- Persist a package dataset index containing the exact output filename, Job/source/dataset identity, row count, and provenance. Keep raw evidence outside the derived package and never cross-source join rows.
- Wire the loader into production `DesktopMultiSourceController` composition. Existing Google Trends workbook export remains unchanged.

## Fail-closed boundaries

- Unknown sources, mismatched artifact ownership, non-raw/non-accepted artifacts, changed bytes/checksum, invalid accepted content, and unsafe paths fail export visibly.
- Failed/rejected Jobs create no normalized rows. `ALL` retains safe failure entries; `SUCCESSFUL_ONLY` omits them.
- Package provenance contains no credentials, secrets, unrestricted source paths, or copied raw payloads.
- Missing numeric values remain `null`; Google Trends remains relative interest only; source datasets remain separate.

## Test-first sequence

1. Extend Data Package tests with RED coverage for two same-source Jobs, collision-safe filenames, and persisted provenance index.
2. Add a RED production loader integration covering all eight source IDs from sanitized raw fixtures, exact normalized semantics, checksums, and rejected/tampered evidence.
3. Implement dataset identity/index changes, the source-neutral production loader, and production composition.
4. Add the focused loader suite to the release gate and run focused regressions, typecheck, lint, whitespace check, package/build verification, and the full release gate.

## Acceptance

- A terminal generalized desktop Run can export accepted datasets without an injected test-only loader.
- Every dataset file maps unambiguously to one Run/Job/source/raw artifact and is listed with provenance.
- Multiple Jobs for the same source/dataset produce distinct files.
- All automated tests remain deterministic and make no live provider request.
