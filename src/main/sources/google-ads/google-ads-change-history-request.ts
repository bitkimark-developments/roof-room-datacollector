import {
  GOOGLE_ADS_CHANGE_HISTORY_DATASET_TYPES,
  GOOGLE_ADS_CHANGE_HISTORY_SOURCE_ID,
  type GoogleAdsChangeHistoryDatasetType,
} from '../../../shared/google-ads-change-history';

export interface GoogleAdsChangeHistoryJobContext {
  source_id: typeof GOOGLE_ADS_CHANGE_HISTORY_SOURCE_ID;
  dataset_type: GoogleAdsChangeHistoryDatasetType;
  customer_id: string;
  requested_date_start: string;
  requested_date_end: string;
  dataset_schema_version: 1;
}

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/u;

const requireDatasetType = (
  value: unknown,
): GoogleAdsChangeHistoryDatasetType => {
  if (
    typeof value !== 'string'
    || !GOOGLE_ADS_CHANGE_HISTORY_DATASET_TYPES.includes(
      value as GoogleAdsChangeHistoryDatasetType,
    )
  ) {
    throw new Error(
      'Google Ads Change History dataset type is unsupported.',
    );
  }

  return value as GoogleAdsChangeHistoryDatasetType;
};

const requireCustomerId = (
  value: unknown,
): string => {
  if (
    typeof value !== 'string'
    || !/^\d+$/u.test(value)
  ) {
    throw new Error(
      'Google Ads Change History customer ID must contain digits only.',
    );
  }

  return value;
};

const requireDate = (
  value: unknown,
  field: string,
): string => {
  if (
    typeof value !== 'string'
    || !ISO_DATE_PATTERN.test(value)
  ) {
    throw new Error(
      `Google Ads Change History ${field} must use YYYY-MM-DD.`,
    );
  }

  return value;
};

export const createGoogleAdsChangeHistoryJobContext = (
  value: unknown,
): GoogleAdsChangeHistoryJobContext => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(
      'Google Ads Change History Job context must be an object.',
    );
  }

  const context =
    value as Record<string, unknown>;

  if (
    context.source_id
      !== GOOGLE_ADS_CHANGE_HISTORY_SOURCE_ID
  ) {
    throw new Error(
      'Google Ads Change History source identity is invalid.',
    );
  }

  const datasetType =
    requireDatasetType(context.dataset_type);

  const start =
    requireDate(
      context.requested_date_start,
      'requested_date_start',
    );

  const end =
    requireDate(
      context.requested_date_end,
      'requested_date_end',
    );

  if (start > end) {
    throw new Error(
      'Google Ads Change History date range is reversed.',
    );
  }

  if (context.dataset_schema_version !== 1) {
    throw new Error(
      'Google Ads Change History schema version is unsupported.',
    );
  }

  return {
    source_id:
      GOOGLE_ADS_CHANGE_HISTORY_SOURCE_ID,
    dataset_type:
      datasetType,
    customer_id:
      requireCustomerId(context.customer_id),
    requested_date_start: start,
    requested_date_end: end,
    dataset_schema_version: 1,
  };
};

export interface GoogleAdsChangeHistoryQueryDateRange {
  requested_date_start: string;
  requested_date_end: string;
}

export const buildGoogleAdsChangeHistoryQuery = (
  input: GoogleAdsChangeHistoryQueryDateRange,
): string => {
  return [
    'SELECT',
    'change_event.change_date_time,',
    'change_event.user_email,',
    'change_event.client_type,',
    'change_event.change_resource_type,',
    'change_event.change_resource_name,',
    'change_event.resource_change_operation',
    'FROM change_event',
    `WHERE change_event.change_date_time >= '${input.requested_date_start}'`,
    `AND change_event.change_date_time <= '${input.requested_date_end}'`,
  ].join(' ');
};

import type { ApiRequester } from '../google-api/api-helpers';

export const requestGoogleAdsChangeHistoryRaw = async (
  input: {
    customer_id: string;
    query: string;
  },
  requester: ApiRequester,
): Promise<{
  body: unknown;
  raw_bytes: Uint8Array;
}> => {
  const response = await requester({
    url:
      `https://googleads.googleapis.com/v25/customers/${input.customer_id}/googleAds:searchStream`,
    method: 'POST',
    body: {
      query: input.query,
    },
  });

  if (
    response.status < 200
    || response.status >= 300
  ) {
    throw new Error(
      `Google Ads Change History provider error HTTP ${response.status}.`,
    );
  }

  return {
    body: response.body,
    raw_bytes:
      response.raw_body
      ?? new TextEncoder().encode(
        JSON.stringify(response.body),
      ),
  };
};
