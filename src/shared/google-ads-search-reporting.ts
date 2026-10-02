export const GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID = 'google-ads-search-reporting';

export const GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES = [
  'CAMPAIGN_PERFORMANCE',
  'AD_GROUP_PERFORMANCE',
  'KEYWORD_PERFORMANCE',
  'SEARCH_TERMS',
  'AD_PERFORMANCE',
  'RSA_ASSET_PERFORMANCE',
] as const;

export type GoogleAdsSearchReportingDatasetType =
  (typeof GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES)[number];

export const GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET = {
  CAMPAIGN_PERFORMANCE: 'campaign',
  AD_GROUP_PERFORMANCE: 'ad_group',
  KEYWORD_PERFORMANCE: 'keyword_view',
  SEARCH_TERMS: 'search_term_view',
  AD_PERFORMANCE: 'ad_group_ad',
  RSA_ASSET_PERFORMANCE: 'ad_group_ad_asset_view',
} as const satisfies Record<GoogleAdsSearchReportingDatasetType, string>;

export type GoogleAdsSearchReportingResourceMode =
  (typeof GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET)[GoogleAdsSearchReportingDatasetType];

export const GOOGLE_ADS_SEARCH_REPORTING_MONETARY_FIELDS = [
  'average_cpc_micros',
  'cost_micros',
  'campaign_budget_amount_micros',
  'cpc_bid_micros',
  'effective_cpc_bid_micros',
  'effective_target_cpa_micros',
] as const;

export interface GoogleAdsSearchReportingJobContext {
  source_id: typeof GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID;
  dataset_type: GoogleAdsSearchReportingDatasetType;
  resource_mode: GoogleAdsSearchReportingResourceMode;
  campaign_type: 'SEARCH';
  customer_id: string;
  requested_date_start: string;
  requested_date_end: string;
  dataset_schema_version: 1 | 2;
}

export interface GoogleAdsCommonPerformanceMetrics {
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  average_cpc_micros: number | null;
  cost_micros: number | null;
  conversions: number | null;
  conversions_value: number | null;
  all_conversions: number | null;
  all_conversions_value: number | null;
}

export interface GoogleAdsConversionEfficiencyMetrics {
  conversions_from_interactions_rate: number | null;
  cost_per_conversion: number | null;
  conversions_value_per_cost: number | null;
}

export interface GoogleAdsTopImpressionMetrics {
  top_impression_percentage: number | null;
  absolute_top_impression_percentage: number | null;
}

export interface GoogleAdsSearchShareMetrics extends GoogleAdsTopImpressionMetrics {
  search_impression_share: number | null;
  search_budget_lost_impression_share: number | null;
  search_rank_lost_impression_share: number | null;
  search_click_share: number | null;
  search_top_impression_share: number | null;
  search_absolute_top_impression_share: number | null;
}

export interface GoogleAdsCampaignPerformanceRow
  extends GoogleAdsCommonPerformanceMetrics,
    GoogleAdsConversionEfficiencyMetrics,
    GoogleAdsSearchShareMetrics {
  currency_code: string;
  time_zone: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  campaign_primary_status: string;
  campaign_advertising_channel_type: string;
  campaign_bidding_strategy_type: string;
  campaign_budget_id: string;
  campaign_budget_amount_micros: number | null;
  campaign_budget_period: string;
  campaign_budget_explicitly_shared: boolean;
  performance_date: string;
}

export interface GoogleAdsAdGroupPerformanceRow
  extends GoogleAdsCommonPerformanceMetrics,
    GoogleAdsConversionEfficiencyMetrics,
    GoogleAdsSearchShareMetrics {
  campaign_id: string;
  campaign_name: string;
  campaign_advertising_channel_type: string;
  ad_group_id: string;
  ad_group_name: string;
  ad_group_status: string;
  ad_group_primary_status: string;
  ad_group_type: string;
  cpc_bid_micros: number | null;
  effective_cpc_bid_micros: number | null;
  effective_target_cpa_micros: number | null;
  effective_target_roas: number | null;
  performance_date: string;
}

export interface GoogleAdsKeywordPerformanceRow
  extends GoogleAdsCommonPerformanceMetrics,
    GoogleAdsConversionEfficiencyMetrics,
    GoogleAdsSearchShareMetrics {
  campaign_id: string;
  campaign_name: string;
  campaign_advertising_channel_type: string;
  ad_group_id: string;
  ad_group_name: string;
  criterion_id: string;
  keyword_text: string;
  keyword_match_type: string;
  criterion_status: string;
  criterion_primary_status: string;
  system_serving_status: string;
  negative: boolean;
  cpc_bid_micros: number | null;
  effective_cpc_bid_micros: number | null;
  quality_score: number | null;
  creative_quality_score: string | null;
  post_click_quality_score: string | null;
  search_predicted_ctr: string | null;
  search_exact_match_impression_share: number | null;
  performance_date: string;
}

export interface GoogleAdsSearchTermPerformanceRow
  extends GoogleAdsCommonPerformanceMetrics,
    GoogleAdsTopImpressionMetrics {
  search_term: string;
  campaign_id: string;
  campaign_name: string;
  campaign_advertising_channel_type: string;
  ad_group_id: string;
  ad_group_name: string;
  keyword_resource_name: string | null;
  keyword_text: string | null;
  keyword_match_type: string | null;
  search_term_match_type: string;
  search_term_targeting_status: string;
  performance_date: string;
}

export interface GoogleAdsResponsiveSearchAdTextAsset {
  text: string;
  pinned_field: string | null;
  asset_performance_label: string | null;
}

export interface GoogleAdsAdPerformanceRow
  extends GoogleAdsCommonPerformanceMetrics,
    GoogleAdsTopImpressionMetrics {
  campaign_id: string;
  campaign_name: string;
  campaign_advertising_channel_type: string;
  ad_group_id: string;
  ad_group_name: string;
  ad_id: string;
  ad_type: string;
  ad_group_ad_status: string;
  ad_group_ad_primary_status: string;
  ad_strength: string;
  policy_approval_status: string;
  policy_review_status: string;
  final_urls: string[];
  headlines: GoogleAdsResponsiveSearchAdTextAsset[];
  descriptions: GoogleAdsResponsiveSearchAdTextAsset[];
  path1: string | null;
  path2: string | null;
  performance_date: string;
}

export interface GoogleAdsRsaAssetPerformanceRow extends GoogleAdsCommonPerformanceMetrics {
  campaign_id: string;
  campaign_name: string;
  campaign_advertising_channel_type: string;
  ad_group_id: string;
  ad_group_name: string;
  ad_id: string;
  ad_type: string;
  asset_view_resource_name: string;
  field_type: string;
  performance_label: string;
  pinned_field: string | null;
  enabled: boolean;
  source: string;
  asset_resource_name: string | null;
  asset_id: string | null;
  asset_name: string | null;
  asset_text: string | null;
  performance_date: string;
}

export type GoogleAdsSearchReportingNormalizedRow =
  | GoogleAdsCampaignPerformanceRow
  | GoogleAdsAdGroupPerformanceRow
  | GoogleAdsKeywordPerformanceRow
  | GoogleAdsSearchTermPerformanceRow
  | GoogleAdsAdPerformanceRow
  | GoogleAdsRsaAssetPerformanceRow;
