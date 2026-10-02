import type { JsonObject } from '../../../shared/run-job';
import {
  GOOGLE_ADS_CONFIGURATION_DATASET_TYPES,
  GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET,
  GOOGLE_ADS_CONFIGURATION_SOURCE_ID,
  type GoogleAdsConfigurationDatasetType,
  type GoogleAdsConfigurationJobContext,
} from '../../../shared/google-ads-configuration';
import type { ApiRequester } from '../google-api/api-helpers';

export interface CreateGoogleAdsConfigurationJobContextInput {
  dataset_type: GoogleAdsConfigurationDatasetType;
  customer_id: string;
}

const CONTEXT_KEYS = new Set([
  'source_id',
  'dataset_type',
  'resource_mode',
  'customer_id',
  'dataset_schema_version',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
);

const requireDatasetType = (
  value: unknown,
): GoogleAdsConfigurationDatasetType => {
  if (
    typeof value !== 'string'
    || !(GOOGLE_ADS_CONFIGURATION_DATASET_TYPES as readonly string[])
      .includes(value)
  ) {
    throw new Error('Google Ads configuration dataset type is unsupported.');
  }

  return value as GoogleAdsConfigurationDatasetType;
};

const requireCustomerId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) {
    throw new Error(
      'Google Ads configuration customer ID must contain digits only.',
    );
  }

  return value;
};

export const requireGoogleAdsConfigurationJobContext = (
  value: unknown,
  expectedCustomerId?: string,
): GoogleAdsConfigurationJobContext => {
  if (!isRecord(value)) {
    throw new Error('Google Ads configuration source_context is required.');
  }

  if (Object.keys(value).some((key) => !CONTEXT_KEYS.has(key))) {
    throw new Error(
      'Google Ads configuration source_context contains unsupported fields.',
    );
  }

  if (value.source_id !== GOOGLE_ADS_CONFIGURATION_SOURCE_ID) {
    throw new Error('Google Ads configuration source identity is invalid.');
  }

  const datasetType = requireDatasetType(value.dataset_type);
  const resourceMode =
    GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET[datasetType];

  if (value.resource_mode !== resourceMode) {
    throw new Error(
      'Google Ads configuration resource mode does not match the dataset.',
    );
  }

  const customerId = requireCustomerId(value.customer_id);

  if (
    expectedCustomerId !== undefined
    && customerId !== expectedCustomerId
  ) {
    throw new Error(
      'Google Ads configuration customer ID does not match the configured connection.',
    );
  }

  if (value.dataset_schema_version !== 1) {
    throw new Error(
      'Google Ads configuration dataset schema version is unsupported.',
    );
  }

  return Object.freeze({
    source_id: GOOGLE_ADS_CONFIGURATION_SOURCE_ID,
    dataset_type: datasetType,
    resource_mode: resourceMode,
    customer_id: customerId,
    dataset_schema_version: 1,
  });
};

export const createGoogleAdsConfigurationJobContext = (
  input: CreateGoogleAdsConfigurationJobContextInput,
): Readonly<GoogleAdsConfigurationJobContext> => (
  requireGoogleAdsConfigurationJobContext({
    source_id: GOOGLE_ADS_CONFIGURATION_SOURCE_ID,
    dataset_type: input.dataset_type,
    resource_mode:
      GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET[input.dataset_type],
    customer_id: input.customer_id,
    dataset_schema_version: 1,
  })
);

export const googleAdsConfigurationContextAsJson = (
  context: GoogleAdsConfigurationJobContext,
): JsonObject => ({ ...context });

export const requestGoogleAdsConfigurationRaw = async (
  input: { customer_id: string; query: string },
  requester: ApiRequester,
): Promise<{ body: unknown; raw_bytes: Uint8Array }> => {
  const response = await requester({
    url: `https://googleads.googleapis.com/v25/customers/${input.customer_id}/googleAds:searchStream`,
    method: 'POST',
    body: { query: input.query },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Google Ads provider error HTTP ${response.status}.`,
    );
  }

  return {
    body: response.body,
    raw_bytes: response.raw_body
      ?? new TextEncoder().encode(JSON.stringify(response.body)),
  };
};
