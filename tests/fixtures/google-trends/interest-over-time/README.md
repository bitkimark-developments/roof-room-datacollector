# Google Trends Interest Over Time fixtures

## gt01-valid-5-queries.csv

- derived_from: real Google Trends UI CSV export
- source_id: google-trends
- source_mode: GOOGLE_TRENDS_UI
- dataset_type: INTEREST_OVER_TIME
- collected_on: 2026-08-18
- requested_country: TR
- observed_series_header_geography_label: Türkiye
- requested_date_start: 2024-08-18
- requested_date_end: 2026-08-17
- observed_first_week: 2024-08-18
- observed_last_week: 2026-08-16
- observed_temporal_dimension: Week
- query_group_id: GT01
- query_count: 5
- byte_size: 2467
- sha256: 9bd0f03d00dd803932f8207e2c74326619874af05b5509cf6aeefc2369aad883
- byte_preservation: exact provider-export bytes captured during M3 discovery
- sensitive_content_review: no account, cookie, authorization, password, or session content is present

Purpose: deterministic parser and minimum Google Trends source-validator tests.

The fixture intentionally preserves provider semantics. Google Trends values remain
relative-interest values on the provider's 0-100 scale and must never be treated as
absolute search volume.

