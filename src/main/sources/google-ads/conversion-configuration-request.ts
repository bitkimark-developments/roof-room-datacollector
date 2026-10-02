import type {
  GoogleAdsConfigurationDatasetType,
  GoogleAdsConfigurationJobContext,
  GoogleAdsConfigurationResourceMode,
} from '../../../shared/google-ads-configuration';

const assertDataset = (
  context: GoogleAdsConfigurationJobContext,
  datasetType: GoogleAdsConfigurationDatasetType,
  resourceMode: GoogleAdsConfigurationResourceMode,
): void => {
  if (
    context.dataset_type !== datasetType
    || context.resource_mode !== resourceMode
  ) {
    throw new Error(
      `Google Ads configuration requires ${datasetType} with ${resourceMode}.`,
    );
  }
};

const CONVERSION_ACTION_FIELDS = [
  'conversion_action.resource_name',
  'conversion_action.id',
  'conversion_action.name',
  'conversion_action.status',
  'conversion_action.type',
  'conversion_action.category',
  'conversion_action.origin',
  'conversion_action.owner_customer',
  'conversion_action.counting_type',
  'conversion_action.primary_for_goal',
  'conversion_action.include_in_conversions_metric',
  'conversion_action.click_through_lookback_window_days',
  'conversion_action.view_through_lookback_window_days',
  'conversion_action.attribution_model_settings.attribution_model',
  'conversion_action.attribution_model_settings.data_driven_model_status',
  'conversion_action.value_settings.default_value',
  'conversion_action.value_settings.default_currency_code',
  'conversion_action.value_settings.always_use_default_value',
  'conversion_action.google_analytics_4_settings.property_id',
  'conversion_action.google_analytics_4_settings.event_name',
] as const;

export const buildConversionActionsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(context, 'CONVERSION_ACTIONS', 'CONVERSION_ACTION');

  return [
    `SELECT ${CONVERSION_ACTION_FIELDS.join(', ')}`,
    'FROM conversion_action',
  ].join(' ');
};

const CUSTOMER_CONVERSION_GOAL_FIELDS = [
  'customer_conversion_goal.resource_name',
  'customer_conversion_goal.category',
  'customer_conversion_goal.origin',
  'customer_conversion_goal.biddable',
] as const;

export const buildCustomerConversionGoalsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(
    context,
    'CUSTOMER_CONVERSION_GOALS',
    'CUSTOMER_CONVERSION_GOAL',
  );

  return [
    `SELECT ${CUSTOMER_CONVERSION_GOAL_FIELDS.join(', ')}`,
    'FROM customer_conversion_goal',
  ].join(' ');
};

const CONVERSION_GOAL_CAMPAIGN_CONFIG_FIELDS = [
  'conversion_goal_campaign_config.resource_name',
  'conversion_goal_campaign_config.campaign',
  'conversion_goal_campaign_config.goal_config_level',
  'conversion_goal_campaign_config.custom_conversion_goal',
  'campaign.id',
  'campaign.name',
  'campaign.status',
] as const;

export const buildConversionGoalCampaignConfigsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(
    context,
    'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
    'CONVERSION_GOAL_CAMPAIGN_CONFIG',
  );

  return [
    `SELECT ${CONVERSION_GOAL_CAMPAIGN_CONFIG_FIELDS.join(', ')}`,
    'FROM conversion_goal_campaign_config',
  ].join(' ');
};

const CAMPAIGN_CONVERSION_GOAL_FIELDS = [
  'campaign_conversion_goal.resource_name',
  'campaign_conversion_goal.campaign',
  'campaign_conversion_goal.category',
  'campaign_conversion_goal.origin',
  'campaign_conversion_goal.biddable',
  'campaign.id',
  'campaign.name',
  'campaign.status',
] as const;

export const buildCampaignConversionGoalsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(
    context,
    'CAMPAIGN_CONVERSION_GOALS',
    'CAMPAIGN_CONVERSION_GOAL',
  );

  return [
    `SELECT ${CAMPAIGN_CONVERSION_GOAL_FIELDS.join(', ')}`,
    'FROM campaign_conversion_goal',
  ].join(' ');
};

const CUSTOM_CONVERSION_GOAL_FIELDS = [
  'custom_conversion_goal.resource_name',
  'custom_conversion_goal.id',
  'custom_conversion_goal.name',
  'custom_conversion_goal.status',
  'custom_conversion_goal.conversion_actions',
] as const;

export const buildCustomConversionGoalsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(
    context,
    'CUSTOM_CONVERSION_GOALS',
    'CUSTOM_CONVERSION_GOAL',
  );

  return [
    `SELECT ${CUSTOM_CONVERSION_GOAL_FIELDS.join(', ')}`,
    'FROM custom_conversion_goal',
  ].join(' ');
};

const CUSTOMER_CONVERSION_TRACKING_SETTING_FIELDS = [
  'customer.resource_name',
  'customer.id',
  'customer.conversion_tracking_setting.conversion_tracking_status',
  'customer.conversion_tracking_setting.conversion_tracking_id',
  'customer.conversion_tracking_setting.cross_account_conversion_tracking_id',
  'customer.conversion_tracking_setting.google_ads_conversion_customer',
] as const;

export const buildCustomerConversionTrackingSettingsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(
    context,
    'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
    'CUSTOMER',
  );

  return [
    `SELECT ${CUSTOMER_CONVERSION_TRACKING_SETTING_FIELDS.join(', ')}`,
    'FROM customer',
  ].join(' ');
};
