export const GOOGLE_ADS_CONFIGURATION_SOURCE_ID = 'google-ads-configuration';

export const GOOGLE_ADS_CONFIGURATION_DATASET_TYPES = [
  'CAMPAIGN_NEGATIVE_KEYWORDS',
  'AD_GROUP_NEGATIVE_KEYWORDS',
  'SHARED_NEGATIVE_KEYWORDS',
  'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
  'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
] as const;

export type GoogleAdsConfigurationDatasetType =
  (typeof GOOGLE_ADS_CONFIGURATION_DATASET_TYPES)[number];

export const GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET = {
  CAMPAIGN_NEGATIVE_KEYWORDS: 'CAMPAIGN_CRITERION',
  AD_GROUP_NEGATIVE_KEYWORDS: 'AD_GROUP_CRITERION',
  SHARED_NEGATIVE_KEYWORDS: 'SHARED_CRITERION',
  CAMPAIGN_NEGATIVE_KEYWORD_LISTS: 'CAMPAIGN_SHARED_SET',
  ACCOUNT_NEGATIVE_KEYWORD_LISTS: 'CUSTOMER_NEGATIVE_CRITERION',
} as const satisfies Record<GoogleAdsConfigurationDatasetType, string>;

export type GoogleAdsConfigurationResourceMode =
  (typeof GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET)[GoogleAdsConfigurationDatasetType];

export interface GoogleAdsConfigurationJobContext {
  source_id: typeof GOOGLE_ADS_CONFIGURATION_SOURCE_ID;
  dataset_type: GoogleAdsConfigurationDatasetType;
  resource_mode: GoogleAdsConfigurationResourceMode;
  customer_id: string;
  dataset_schema_version: 1;
}
