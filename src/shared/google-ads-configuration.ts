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

export interface GoogleAdsCampaignNegativeKeywordRow {
  campaign_id: string;
  campaign_name: string | null;
  campaign_advertising_channel_type: string;
  campaign_criterion_resource_name: string;
  campaign_criterion_id: string;
  campaign_criterion_status: string | null;
  campaign_criterion_type: string;
  campaign_criterion_negative: boolean;
  keyword_text: string;
  keyword_match_type: string;
}

export interface GoogleAdsAdGroupNegativeKeywordRow {
  campaign_id: string;
  campaign_name: string | null;
  campaign_advertising_channel_type: string;
  ad_group_id: string;
  ad_group_name: string | null;
  ad_group_criterion_resource_name: string;
  ad_group_criterion_id: string;
  ad_group_criterion_status: string | null;
  ad_group_criterion_type: string;
  ad_group_criterion_negative: boolean;
  keyword_text: string;
  keyword_match_type: string;
}

export interface GoogleAdsSharedNegativeKeywordRow {
  shared_set_resource_name: string;
  shared_set_id: string;
  shared_set_name: string | null;
  shared_set_status: string | null;
  shared_set_type: string;
  shared_criterion_resource_name: string;
  shared_criterion_id: string;
  shared_criterion_type: string;
  shared_criterion_negative: boolean;
  keyword_text: string;
  keyword_match_type: string;
}

export interface GoogleAdsCampaignNegativeKeywordListRow {
  campaign_id: string;
  campaign_name: string | null;
  campaign_advertising_channel_type: string;
  campaign_shared_set_resource_name: string;
  campaign_shared_set_status: string | null;
  shared_set_resource_name: string;
  shared_set_id: string;
  shared_set_name: string | null;
  shared_set_status: string | null;
  shared_set_type: string;
}

export interface GoogleAdsAccountNegativeKeywordListRow {
  customer_negative_criterion_resource_name: string;
  customer_negative_criterion_id: string;
  customer_negative_criterion_type: string;
  negative_keyword_list_shared_set: string;
  shared_set_resource_name: string | null;
  shared_set_id: string | null;
  shared_set_name: string | null;
  shared_set_status: string | null;
  shared_set_type: string | null;
}

export type GoogleAdsConfigurationNormalizedRow =
  | GoogleAdsCampaignNegativeKeywordRow
  | GoogleAdsAdGroupNegativeKeywordRow
  | GoogleAdsSharedNegativeKeywordRow
  | GoogleAdsCampaignNegativeKeywordListRow
  | GoogleAdsAccountNegativeKeywordListRow;
