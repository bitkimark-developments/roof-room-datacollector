export const GOOGLE_ADS_CONFIGURATION_SOURCE_ID = 'google-ads-configuration';

export const GOOGLE_ADS_NEGATIVES_DATASET_TYPES = [
  'CAMPAIGN_NEGATIVE_KEYWORDS',
  'AD_GROUP_NEGATIVE_KEYWORDS',
  'SHARED_NEGATIVE_KEYWORDS',
  'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
  'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
] as const;

export const GOOGLE_ADS_CONVERSION_CONFIGURATION_DATASET_TYPES = [
  'CONVERSION_ACTIONS',
  'CUSTOMER_CONVERSION_GOALS',
  'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
  'CAMPAIGN_CONVERSION_GOALS',
  'CUSTOM_CONVERSION_GOALS',
  'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
] as const;

export const GOOGLE_ADS_CAMPAIGN_SETTINGS_DATASET_TYPES = [
  'CAMPAIGN_SETTINGS',
  'CAMPAIGN_BUDGETS',
  'CAMPAIGN_TARGETING_CRITERIA',
] as const;

export type GoogleAdsCampaignSettingsDatasetType =
  (typeof GOOGLE_ADS_CAMPAIGN_SETTINGS_DATASET_TYPES)[number];

export const GOOGLE_ADS_CONFIGURATION_DATASET_TYPES = [
  ...GOOGLE_ADS_NEGATIVES_DATASET_TYPES,
  ...GOOGLE_ADS_CONVERSION_CONFIGURATION_DATASET_TYPES,
  ...GOOGLE_ADS_CAMPAIGN_SETTINGS_DATASET_TYPES,
] as const;

export type GoogleAdsConfigurationDatasetType =
  (typeof GOOGLE_ADS_CONFIGURATION_DATASET_TYPES)[number];

export const GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET = {
  CAMPAIGN_NEGATIVE_KEYWORDS: 'CAMPAIGN_CRITERION',
  AD_GROUP_NEGATIVE_KEYWORDS: 'AD_GROUP_CRITERION',
  SHARED_NEGATIVE_KEYWORDS: 'SHARED_CRITERION',
  CAMPAIGN_NEGATIVE_KEYWORD_LISTS: 'CAMPAIGN_SHARED_SET',
  ACCOUNT_NEGATIVE_KEYWORD_LISTS: 'CUSTOMER_NEGATIVE_CRITERION',
  CONVERSION_ACTIONS: 'CONVERSION_ACTION',
  CUSTOMER_CONVERSION_GOALS: 'CUSTOMER_CONVERSION_GOAL',
  CONVERSION_GOAL_CAMPAIGN_CONFIGS: 'CONVERSION_GOAL_CAMPAIGN_CONFIG',
  CAMPAIGN_CONVERSION_GOALS: 'CAMPAIGN_CONVERSION_GOAL',
  CUSTOM_CONVERSION_GOALS: 'CUSTOM_CONVERSION_GOAL',
  CUSTOMER_CONVERSION_TRACKING_SETTINGS: 'CUSTOMER',
  CAMPAIGN_SETTINGS: 'CAMPAIGN',
  CAMPAIGN_BUDGETS: 'CAMPAIGN_BUDGET',
  CAMPAIGN_TARGETING_CRITERIA: 'CAMPAIGN_CRITERION',
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

export interface GoogleAdsConversionActionRow {
  conversion_action_resource_name: string;
  conversion_action_id: string;
  conversion_action_name: string | null;
  conversion_action_status: string;
  conversion_action_type: string;
  conversion_action_category: string;
  conversion_action_origin: string;
  owner_customer: string | null;
  counting_type: string | null;
  primary_for_goal: boolean;
  include_in_conversions_metric: boolean | null;
  click_through_lookback_window_days: string | null;
  view_through_lookback_window_days: string | null;
  attribution_model: string | null;
  data_driven_model_status: string | null;
  default_value: number | null;
  default_currency_code: string | null;
  always_use_default_value: boolean | null;
  google_analytics_4_property_id: string | null;
  google_analytics_4_event_name: string | null;
}

export interface GoogleAdsCustomerConversionGoalRow {
  resource_name: string;
  category: string;
  origin: string;
  biddable: boolean;
}

export interface GoogleAdsConversionGoalCampaignConfigRow {
  resource_name: string;
  campaign_resource_name: string;
  campaign_id: string;
  campaign_name: string | null;
  campaign_status: string;
  goal_config_level: string;
  custom_conversion_goal_resource_name: string | null;
}

export interface GoogleAdsCampaignConversionGoalRow {
  resource_name: string;
  campaign_resource_name: string;
  campaign_id: string;
  campaign_name: string | null;
  campaign_status: string;
  category: string;
  origin: string;
  biddable: boolean;
}

export interface GoogleAdsCustomConversionGoalRow {
  resource_name: string;
  id: string;
  name: string | null;
  status: string;
  conversion_action_resource_names: string[];
}

export interface GoogleAdsCustomerConversionTrackingSettingRow {
  customer_resource_name: string;
  customer_id: string;
  conversion_tracking_status: string;
  conversion_tracking_id: string | null;
  cross_account_conversion_tracking_id: string | null;
  google_ads_conversion_customer: string | null;
}

export interface GoogleAdsCampaignAssetAutomationSettingRow {
  asset_automation_type: string;
  asset_automation_status: string;
}

export interface GoogleAdsCampaignSettingsRow {
  campaign_resource_name: string;
  campaign_id: string;
  campaign_name: string | null;
  campaign_status: string;
  campaign_keyword_match_type: string;
  advertising_channel_type: string;
  advertising_channel_sub_type: string;
  start_date_time: string | null;
  end_date_time: string | null;
  campaign_budget_resource_name: string | null;
  bidding_strategy_type: string;
  bidding_strategy_resource_name: string | null;
  manual_cpc_enhanced_cpc_enabled: boolean | null;
  target_spend_cpc_bid_ceiling_micros: string | null;
  target_spend_target_spend_micros: string | null;
  maximize_conversions_target_cpa_micros: string | null;
  maximize_conversion_value_target_roas: number | null;
  target_cpa_target_cpa_micros: string | null;
  target_roas_target_roas: number | null;
  target_impression_share_location: string | null;
  target_impression_share_location_fraction_micros: string | null;
  target_impression_share_cpc_bid_ceiling_micros: string | null;
  target_google_search: boolean;
  target_search_network: boolean;
  target_content_network: boolean;
  target_partner_search_network: boolean;
  positive_geo_target_type: string;
  negative_geo_target_type: string;
  tracking_url: string | null;
  tracking_url_template: string | null;
  final_url_suffix: string | null;
  ai_max_enable_ai_max: boolean | null;
  ai_max_bundling_required: boolean | null;
  asset_automation_settings: GoogleAdsCampaignAssetAutomationSettingRow[];
}

export interface GoogleAdsCampaignBudgetRow {
  campaign_budget_resource_name: string;
  campaign_budget_id: string;
  campaign_budget_name: string | null;
  campaign_budget_status: string;
  amount_micros: string | null;
  delivery_method: string;
  explicitly_shared: boolean;
  reference_count: string;
  total_amount_micros: string | null;
  period: string;
  type: string;
}

export interface GoogleAdsCampaignTargetingCriterionRow {
  criterion_resource_name: string;
  campaign_resource_name: string;
  campaign_id: string;
  campaign_name: string | null;
  campaign_status: string;
  criterion_id: string;
  criterion_type: string;
  negative: boolean;
  criterion_status: string;
  location_geo_target_constant_resource_name: string | null;
  location_geo_target_constant_id: string | null;
  location_geo_target_constant_name: string | null;
  location_geo_target_constant_canonical_name: string | null;
  location_geo_target_constant_country_code: string | null;
  location_geo_target_constant_target_type: string | null;
  location_geo_target_constant_status: string | null;
  language_constant_resource_name: string | null;
  language_constant_id: string | null;
  language_constant_code: string | null;
  language_constant_name: string | null;
  language_constant_targetable: boolean | null;
  device_type: string | null;
  ad_schedule_day_of_week: string | null;
  ad_schedule_start_hour: number | null;
  ad_schedule_start_minute: string | null;
  ad_schedule_end_hour: number | null;
  ad_schedule_end_minute: string | null;
}

export type GoogleAdsConfigurationNormalizedRow =
  | GoogleAdsCampaignNegativeKeywordRow
  | GoogleAdsAdGroupNegativeKeywordRow
  | GoogleAdsSharedNegativeKeywordRow
  | GoogleAdsCampaignNegativeKeywordListRow
  | GoogleAdsAccountNegativeKeywordListRow
  | GoogleAdsConversionActionRow
  | GoogleAdsCustomerConversionGoalRow
  | GoogleAdsConversionGoalCampaignConfigRow
  | GoogleAdsCampaignConversionGoalRow
  | GoogleAdsCustomConversionGoalRow
  | GoogleAdsCustomerConversionTrackingSettingRow
  | GoogleAdsCampaignSettingsRow
  | GoogleAdsCampaignBudgetRow
  | GoogleAdsCampaignTargetingCriterionRow;
