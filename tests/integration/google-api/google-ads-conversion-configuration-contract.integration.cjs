const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const configuration = require(path.join(
  buildRoot,
  'shared/google-ads-configuration.js',
));

const request = require(path.join(
  buildRoot,
  'main/sources/google-ads/configuration-request.js',
));

const conversion = require(path.join(
  buildRoot,
  'main/sources/google-ads/conversion-configuration-request.js',
));

const NEGATIVE_DATASET_TYPES = [
  'CAMPAIGN_NEGATIVE_KEYWORDS',
  'AD_GROUP_NEGATIVE_KEYWORDS',
  'SHARED_NEGATIVE_KEYWORDS',
  'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
  'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
];

const CONVERSION_DATASET_TYPES = [
  'CONVERSION_ACTIONS',
  'CUSTOMER_CONVERSION_GOALS',
  'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
  'CAMPAIGN_CONVERSION_GOALS',
  'CUSTOM_CONVERSION_GOALS',
  'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
];

const CONVERSION_RESOURCE_MODES = {
  CONVERSION_ACTIONS: 'CONVERSION_ACTION',
  CUSTOMER_CONVERSION_GOALS: 'CUSTOMER_CONVERSION_GOAL',
  CONVERSION_GOAL_CAMPAIGN_CONFIGS: 'CONVERSION_GOAL_CAMPAIGN_CONFIG',
  CAMPAIGN_CONVERSION_GOALS: 'CAMPAIGN_CONVERSION_GOAL',
  CUSTOM_CONVERSION_GOALS: 'CUSTOM_CONVERSION_GOAL',
  CUSTOMER_CONVERSION_TRACKING_SETTINGS: 'CUSTOMER',
};

assert.deepEqual(
  configuration.GOOGLE_ADS_NEGATIVES_DATASET_TYPES,
  NEGATIVE_DATASET_TYPES,
);

assert.deepEqual(
  configuration.GOOGLE_ADS_CONVERSION_CONFIGURATION_DATASET_TYPES,
  CONVERSION_DATASET_TYPES,
);

assert.deepEqual(
  configuration.GOOGLE_ADS_CONFIGURATION_DATASET_TYPES,
  [...NEGATIVE_DATASET_TYPES, ...CONVERSION_DATASET_TYPES],
);

assert.equal(
  new Set(configuration.GOOGLE_ADS_CONFIGURATION_DATASET_TYPES).size,
  11,
);

for (const [datasetType, resourceMode] of Object.entries(CONVERSION_RESOURCE_MODES)) {
  assert.equal(
    configuration.GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET[datasetType],
    resourceMode,
  );

  const context = request.createGoogleAdsConfigurationJobContext({
    dataset_type: datasetType,
    customer_id: '1234567890',
  });

  assert.deepEqual(context, {
    source_id: 'google-ads-configuration',
    dataset_type: datasetType,
    resource_mode: resourceMode,
    customer_id: '1234567890',
    dataset_schema_version: 1,
  });

  assert.equal(Object.isFrozen(context), true);
  assert.equal('requested_date_start' in context, false);
  assert.equal('requested_date_end' in context, false);
}

const contexts = Object.fromEntries(
  CONVERSION_DATASET_TYPES.map((datasetType) => [
    datasetType,
    request.createGoogleAdsConfigurationJobContext({
      dataset_type: datasetType,
      customer_id: '1234567890',
    }),
  ]),
);

const normalizeQuery = (value) => value.replace(/\s+/gu, ' ').trim();

const assertExactQuery = (actual, expected) => {
  assert.equal(normalizeQuery(actual), normalizeQuery(expected));
  assert.doesNotMatch(actual, /\bmetrics\./u);
  assert.doesNotMatch(actual, /\bsegments\./u);
  assert.doesNotMatch(actual, /\bBETWEEN\b/u);
};

assertExactQuery(
  conversion.buildConversionActionsQuery(contexts.CONVERSION_ACTIONS),
  `
    SELECT
      conversion_action.resource_name,
      conversion_action.id,
      conversion_action.name,
      conversion_action.status,
      conversion_action.type,
      conversion_action.category,
      conversion_action.origin,
      conversion_action.owner_customer,
      conversion_action.counting_type,
      conversion_action.primary_for_goal,
      conversion_action.include_in_conversions_metric,
      conversion_action.click_through_lookback_window_days,
      conversion_action.view_through_lookback_window_days,
      conversion_action.attribution_model_settings.attribution_model,
      conversion_action.attribution_model_settings.data_driven_model_status,
      conversion_action.value_settings.default_value,
      conversion_action.value_settings.default_currency_code,
      conversion_action.value_settings.always_use_default_value,
      conversion_action.google_analytics_4_settings.property_id,
      conversion_action.google_analytics_4_settings.event_name
    FROM conversion_action
  `,
);

assertExactQuery(
  conversion.buildCustomerConversionGoalsQuery(contexts.CUSTOMER_CONVERSION_GOALS),
  `
    SELECT
      customer_conversion_goal.resource_name,
      customer_conversion_goal.category,
      customer_conversion_goal.origin,
      customer_conversion_goal.biddable
    FROM customer_conversion_goal
  `,
);

const campaignConfigQuery =
  conversion.buildConversionGoalCampaignConfigsQuery(
    contexts.CONVERSION_GOAL_CAMPAIGN_CONFIGS,
  );

assertExactQuery(
  campaignConfigQuery,
  `
    SELECT
      conversion_goal_campaign_config.resource_name,
      conversion_goal_campaign_config.campaign,
      conversion_goal_campaign_config.goal_config_level,
      conversion_goal_campaign_config.custom_conversion_goal,
      campaign.id,
      campaign.name,
      campaign.status
    FROM conversion_goal_campaign_config
  `,
);
assert.match(campaignConfigQuery, /\bcampaign\.status\b/u);

const campaignGoalQuery =
  conversion.buildCampaignConversionGoalsQuery(
    contexts.CAMPAIGN_CONVERSION_GOALS,
  );

assertExactQuery(
  campaignGoalQuery,
  `
    SELECT
      campaign_conversion_goal.resource_name,
      campaign_conversion_goal.campaign,
      campaign_conversion_goal.category,
      campaign_conversion_goal.origin,
      campaign_conversion_goal.biddable,
      campaign.id,
      campaign.name,
      campaign.status
    FROM campaign_conversion_goal
  `,
);
assert.match(campaignGoalQuery, /\bcampaign\.status\b/u);

assertExactQuery(
  conversion.buildCustomConversionGoalsQuery(contexts.CUSTOM_CONVERSION_GOALS),
  `
    SELECT
      custom_conversion_goal.resource_name,
      custom_conversion_goal.id,
      custom_conversion_goal.name,
      custom_conversion_goal.status,
      custom_conversion_goal.conversion_actions
    FROM custom_conversion_goal
  `,
);

assertExactQuery(
  conversion.buildCustomerConversionTrackingSettingsQuery(
    contexts.CUSTOMER_CONVERSION_TRACKING_SETTINGS,
  ),
  `
    SELECT
      customer.resource_name,
      customer.id,
      customer.conversion_tracking_setting.conversion_tracking_status,
      customer.conversion_tracking_setting.conversion_tracking_id,
      customer.conversion_tracking_setting.cross_account_conversion_tracking_id,
      customer.conversion_tracking_setting.google_ads_conversion_customer
    FROM customer
  `,
);

console.log(
  'PASS GOOGLE-ADS-CONVERSION-CONFIGURATION-CONTRACT-001: six dataset/resource contracts, immutable schema-v1 contexts, and exact conversion configuration GAQL are locked',
);
