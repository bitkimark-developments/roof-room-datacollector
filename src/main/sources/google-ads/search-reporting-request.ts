import type { JsonObject } from '../../../shared/run-job';
import {
  GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES,
  GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET,
  GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
  type GoogleAdsSearchReportingDatasetType,
  type GoogleAdsSearchReportingJobContext,
} from '../../../shared/google-ads-search-reporting';
import type { ApiRequester } from '../google-api/api-helpers';

export interface CreateGoogleAdsReportingJobContextInput {
  dataset_type: GoogleAdsSearchReportingDatasetType;
  customer_id: string;
  requested_date_start: string;
  requested_date_end: string;
  dataset_schema_version?: 2 | 3;
}

const CONTEXT_KEYS = new Set([
  'source_id',
  'dataset_type',
  'resource_mode',
  'campaign_type',
  'customer_id',
  'requested_date_start',
  'requested_date_end',
  'dataset_schema_version',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const requireIsoDate = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error('Google Ads reporting requires absolute calendar dates.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error('Google Ads reporting requires valid calendar dates.');
  }
  return value;
};

const requireDatasetType = (value: unknown): GoogleAdsSearchReportingDatasetType => {
  if (
    typeof value !== 'string'
    || !(GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES as readonly string[]).includes(value)
  ) {
    throw new Error('Google Ads reporting dataset type is unsupported.');
  }
  return value as GoogleAdsSearchReportingDatasetType;
};

const requireCustomerId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) {
    throw new Error('Google Ads reporting customer ID must contain digits only.');
  }
  return value;
};

export const requireGoogleAdsReportingJobContext = (
  value: unknown,
  expectedCustomerId?: string,
): GoogleAdsSearchReportingJobContext => {
  if (!isRecord(value)) {
    throw new Error('Google Ads reporting source_context is required.');
  }
  if (Object.keys(value).some((key) => !CONTEXT_KEYS.has(key))) {
    throw new Error('Google Ads reporting source_context contains unsupported fields.');
  }
  if (value.source_id !== GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID) {
    throw new Error('Google Ads reporting source identity is invalid.');
  }
  const datasetType = requireDatasetType(value.dataset_type);
  const resourceMode = GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET[datasetType];
  if (value.resource_mode !== resourceMode) {
    throw new Error('Google Ads reporting resource mode does not match the dataset.');
  }
  if (value.campaign_type !== 'SEARCH') {
    throw new Error('Google Ads reporting supports SEARCH campaigns only.');
  }
  const customerId = requireCustomerId(value.customer_id);
  if (expectedCustomerId !== undefined && customerId !== expectedCustomerId) {
    throw new Error('Google Ads reporting customer ID does not match the configured connection.');
  }
  const requestedDateStart = requireIsoDate(value.requested_date_start);
  const requestedDateEnd = requireIsoDate(value.requested_date_end);
  if (requestedDateStart > requestedDateEnd) {
    throw new Error('Google Ads reporting date range is reversed.');
  }
  if (
    value.dataset_schema_version !== 1
    && value.dataset_schema_version !== 2
    && value.dataset_schema_version !== 3
  ) {
    throw new Error('Google Ads reporting dataset schema version is unsupported.');
  }
  if (value.dataset_schema_version === 3 && ![
    'CAMPAIGN_PERFORMANCE', 'AD_GROUP_PERFORMANCE', 'KEYWORD_PERFORMANCE',
  ].includes(datasetType)) {
    throw new Error('Google Ads conversion-date schema v3 does not support this dataset.');
  }

  return Object.freeze({
    source_id: GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
    dataset_type: datasetType,
    resource_mode: resourceMode,
    campaign_type: 'SEARCH',
    customer_id: customerId,
    requested_date_start: requestedDateStart,
    requested_date_end: requestedDateEnd,
    dataset_schema_version: value.dataset_schema_version,
  });
};

export const createGoogleAdsReportingJobContext = (
  input: CreateGoogleAdsReportingJobContextInput,
): GoogleAdsSearchReportingJobContext => requireGoogleAdsReportingJobContext({
  source_id: GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
  dataset_type: input.dataset_type,
  resource_mode: GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET[input.dataset_type],
  campaign_type: 'SEARCH',
  customer_id: input.customer_id,
  requested_date_start: input.requested_date_start,
  requested_date_end: input.requested_date_end,
  dataset_schema_version: input.dataset_schema_version ?? 2,
});

export const googleAdsReportingContextAsJson = (
  context: GoogleAdsSearchReportingJobContext,
): JsonObject => ({ ...context });

export const requestGoogleAdsSearchReportingRaw = async (
  input: { customer_id: string; query: string },
  requester: ApiRequester,
): Promise<{ body: unknown; raw_bytes: Uint8Array }> => {
  const response = await requester({
    url: `https://googleads.googleapis.com/v25/customers/${input.customer_id}/googleAds:searchStream`,
    method: 'POST',
    body: { query: input.query },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Google Ads provider error HTTP ${response.status}.`);
  }
  return {
    body: response.body,
    raw_bytes: response.raw_body
      ?? new TextEncoder().encode(JSON.stringify(response.body)),
  };
};
