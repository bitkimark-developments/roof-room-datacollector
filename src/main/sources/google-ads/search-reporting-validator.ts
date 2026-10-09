import { readFile } from 'node:fs/promises';
import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
} from '../../../shared/collection';
import {
  GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
  type GoogleAdsSearchReportingDatasetType,
  type GoogleAdsSearchReportingNormalizedRow,
} from '../../../shared/google-ads-search-reporting';
import { normalizeAdGroupPerformanceRows } from './ad-groups-adapter';
import { normalizeAdPerformanceRows } from './ads-adapter';
import { normalizeCampaignPerformanceRows } from './campaigns-adapter';
import { normalizeKeywordPerformanceRows } from './keywords-adapter';
import { normalizeRsaAssetPerformanceRows } from './rsa-assets-adapter';
import { requireGoogleAdsReportingJobContext } from './search-reporting-request';
import { normalizeSearchTermPerformanceRows } from './search-terms-adapter';
import { flattenGoogleAdsSearchStream } from './search-stream-response';

type FailureStatus =
  | 'INVALID_SCHEMA'
  | 'ERROR_NOT_DATA'
  | 'DATE_MISMATCH'
  | 'QUERY_MISMATCH';

const failure = (
  status: FailureStatus,
  message: string,
): CollectionValidationDecision => ({
  validation_status: status,
  checks_total: 1,
  checks_passed: 0,
  checks_warning: 0,
  checks_failed: 1,
  findings: [{
    check_id: 'GOOGLE_ADS_SEARCH_REPORTING_RESPONSE',
    severity: 'ERROR',
    passed: false,
    message,
    expected: 'Canonical Google Ads SEARCH SearchStream evidence matching the immutable Job',
    actual: 'Artifact did not satisfy the Google Ads SEARCH reporting contract',
  }],
});

const normalizeRows = (
  datasetType: GoogleAdsSearchReportingDatasetType,
  rows: Record<string, unknown>[],
  datasetSchemaVersion: 1 | 2 | 3,
): GoogleAdsSearchReportingNormalizedRow[] => {
  switch (datasetType) {
    case 'CAMPAIGN_PERFORMANCE':
      return normalizeCampaignPerformanceRows(rows, datasetSchemaVersion);
    case 'AD_GROUP_PERFORMANCE':
      return normalizeAdGroupPerformanceRows(rows, datasetSchemaVersion);
    case 'KEYWORD_PERFORMANCE':
      return normalizeKeywordPerformanceRows(rows, datasetSchemaVersion);
    case 'SEARCH_TERMS':
      return normalizeSearchTermPerformanceRows(rows);
    case 'AD_PERFORMANCE':
      return normalizeAdPerformanceRows(rows);
    case 'RSA_ASSET_PERFORMANCE':
      return normalizeRsaAssetPerformanceRows(rows);
  }
};

const hasResponsiveSearchAdIdentity = (
  row: GoogleAdsSearchReportingNormalizedRow,
): boolean => 'ad_type' in row && row.ad_type === 'RESPONSIVE_SEARCH_AD';

export class GoogleAdsSearchReportingValidator implements CollectionValidator {
  async validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    if (
      context.job.source_id !== GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID
      || context.artifact.source_id !== GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID
      || context.job.run_id !== context.run.run_id
      || context.attempt.job_id !== context.job.job_id
      || context.artifact.run_id !== context.run.run_id
      || context.artifact.job_id !== context.job.job_id
      || context.artifact.attempt_number !== context.attempt.attempt_number
    ) {
      return failure('INVALID_SCHEMA', 'Google Ads reporting evidence ownership is invalid.');
    }

    let jobContext;
    try {
      jobContext = requireGoogleAdsReportingJobContext(context.source_context);
      if (context.job.job_key !== jobContext.dataset_type) {
        throw new Error('Google Ads reporting Job key does not match the dataset.');
      }
    } catch (error) {
      return failure(
        'QUERY_MISMATCH',
        error instanceof Error ? error.message : 'Google Ads reporting Job context is invalid.',
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(
        new TextDecoder().decode(await readFile(context.absolute_path)),
      ) as unknown;
    } catch (error) {
      return failure(
        'ERROR_NOT_DATA',
        error instanceof Error ? error.message : 'Google Ads reporting artifact is unreadable.',
      );
    }

    let normalizedRows: GoogleAdsSearchReportingNormalizedRow[];
    try {
      normalizedRows = normalizeRows(
        jobContext.dataset_type,
        flattenGoogleAdsSearchStream(body),
        jobContext.dataset_schema_version,
      );
    } catch (error) {
      return failure(
        'INVALID_SCHEMA',
        error instanceof Error ? error.message : 'Google Ads reporting schema is invalid.',
      );
    }

    if (normalizedRows.length === 0) {
      return {
        validation_status: 'NO_DATA',
        checks_total: 6,
        checks_passed: 6,
        checks_warning: 0,
        checks_failed: 0,
        findings: [],
        validated_metadata: {
          actual_date_start: null,
          actual_date_end: null,
          country_name: null,
        },
      };
    }

    if (normalizedRows.some((row) => row.campaign_advertising_channel_type !== 'SEARCH')) {
      return failure('QUERY_MISMATCH', 'Google Ads reporting row is not a SEARCH campaign row.');
    }
    if (
      (jobContext.dataset_type === 'AD_PERFORMANCE'
        || jobContext.dataset_type === 'RSA_ASSET_PERFORMANCE')
      && normalizedRows.some((row) => !hasResponsiveSearchAdIdentity(row))
    ) {
      return failure('QUERY_MISMATCH', 'Google Ads reporting row is not a Responsive Search Ad row.');
    }

    const dates = normalizedRows.map((row) => row.performance_date);
    if (dates.some((date) => (
      date < jobContext.requested_date_start || date > jobContext.requested_date_end
    ))) {
      return failure('DATE_MISMATCH', 'Google Ads reporting row is outside the immutable Job date range.');
    }
    dates.sort();

    return {
      validation_status: 'VALID',
      checks_total: 6,
      checks_passed: 6,
      checks_warning: 0,
      checks_failed: 0,
      findings: [],
      validated_metadata: {
        actual_date_start: dates[0],
        actual_date_end: dates[dates.length - 1],
        country_name: null,
      },
    };
  }
}
