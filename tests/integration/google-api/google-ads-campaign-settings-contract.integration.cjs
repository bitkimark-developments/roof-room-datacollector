const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const buildRoot = process.argv[2];
assert.ok(buildRoot, 'Build root argument is required.');

const shared = require(
  path.join(buildRoot, 'shared/google-ads-configuration.js'),
);
const configurationRequest = require(
  path.join(
    buildRoot,
    'main/sources/google-ads/configuration-request.js',
  ),
);

const existingEleven = [
  'CAMPAIGN_NEGATIVE_KEYWORDS',
  'AD_GROUP_NEGATIVE_KEYWORDS',
  'SHARED_NEGATIVE_KEYWORDS',
  'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
  'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
  'CONVERSION_ACTIONS',
  'CUSTOMER_CONVERSION_GOALS',
  'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
  'CAMPAIGN_CONVERSION_GOALS',
  'CUSTOM_CONVERSION_GOALS',
  'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
];

const campaignSettingsDatasets = [
  'CAMPAIGN_SETTINGS',
  'CAMPAIGN_BUDGETS',
  'CAMPAIGN_TARGETING_CRITERIA',
];

assert.deepEqual(
  shared.GOOGLE_ADS_CAMPAIGN_SETTINGS_DATASET_TYPES,
  campaignSettingsDatasets,
  'Campaign Settings must define exactly three public datasets.',
);

assert.deepEqual(
  shared.GOOGLE_ADS_CONFIGURATION_DATASET_TYPES,
  [...existingEleven, ...campaignSettingsDatasets],
  'Campaign Settings datasets must extend the existing eleven without reordering them.',
);

assert.equal(
  shared.GOOGLE_ADS_CONFIGURATION_DATASET_TYPES.length,
  14,
);

assert.equal(
  new Set(shared.GOOGLE_ADS_CONFIGURATION_DATASET_TYPES).size,
  14,
);

assert.equal(
  shared.GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET
    .CAMPAIGN_SETTINGS,
  'CAMPAIGN',
);

assert.equal(
  shared.GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET
    .CAMPAIGN_BUDGETS,
  'CAMPAIGN_BUDGET',
);

assert.equal(
  shared.GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET
    .CAMPAIGN_TARGETING_CRITERIA,
  'CAMPAIGN_CRITERION',
);

const campaignContext =
  configurationRequest.createGoogleAdsConfigurationJobContext({
    dataset_type: 'CAMPAIGN_SETTINGS',
    customer_id: '1234567890',
  });

assert.deepEqual(campaignContext, {
  source_id: 'google-ads-configuration',
  dataset_type: 'CAMPAIGN_SETTINGS',
  resource_mode: 'CAMPAIGN',
  customer_id: '1234567890',
  dataset_schema_version: 1,
});

const campaignSettingsRequestPath = path.join(
  buildRoot,
  'main/sources/google-ads/campaign-settings-request.js',
);

assert.equal(
  fs.existsSync(campaignSettingsRequestPath),
  true,
  'Campaign Settings request module must exist.',
);

const requests = require(campaignSettingsRequestPath);

const expectedCampaignQuery = `SELECT
  campaign.resource_name,
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.advertising_channel_sub_type,
  campaign.start_date_time,
  campaign.end_date_time,
  campaign.campaign_budget,
  campaign.keyword_match_type,
  campaign.bidding_strategy_type,
  campaign.bidding_strategy,
  campaign.manual_cpc.enhanced_cpc_enabled,
  campaign.target_spend.cpc_bid_ceiling_micros,
  campaign.target_spend.target_spend_micros,
  campaign.maximize_conversions.target_cpa_micros,
  campaign.maximize_conversion_value.target_roas,
  campaign.target_cpa.target_cpa_micros,
  campaign.target_roas.target_roas,
  campaign.target_impression_share.location,
  campaign.target_impression_share.location_fraction_micros,
  campaign.target_impression_share.cpc_bid_ceiling_micros,
  campaign.network_settings.target_google_search,
  campaign.network_settings.target_search_network,
  campaign.network_settings.target_content_network,
  campaign.network_settings.target_partner_search_network,
  campaign.geo_target_type_setting.positive_geo_target_type,
  campaign.geo_target_type_setting.negative_geo_target_type,
  campaign.tracking_setting.tracking_url,
  campaign.tracking_url_template,
  campaign.final_url_suffix,
  campaign.ai_max_setting.enable_ai_max,
  campaign.ai_max_setting.bundling_required,
  campaign.asset_automation_settings
FROM campaign
WHERE campaign.advertising_channel_type = 'SEARCH'`;

const expectedBudgetQuery = `SELECT
  campaign_budget.resource_name,
  campaign_budget.id,
  campaign_budget.name,
  campaign_budget.status,
  campaign_budget.amount_micros,
  campaign_budget.delivery_method,
  campaign_budget.explicitly_shared,
  campaign_budget.reference_count,
  campaign_budget.total_amount_micros,
  campaign_budget.period,
  campaign_budget.type
FROM campaign_budget`;

const expectedTargetingQuery = `SELECT
  campaign_criterion.resource_name,
  campaign_criterion.campaign,
  campaign_criterion.criterion_id,
  campaign_criterion.type,
  campaign_criterion.negative,
  campaign_criterion.status,
  campaign_criterion.location.geo_target_constant,
  campaign_criterion.language.language_constant,
  language_constant.resource_name,
  language_constant.id,
  language_constant.code,
  language_constant.name,
  language_constant.targetable,
  campaign_criterion.device.type,
  campaign_criterion.ad_schedule.day_of_week,
  campaign_criterion.ad_schedule.start_hour,
  campaign_criterion.ad_schedule.start_minute,
  campaign_criterion.ad_schedule.end_hour,
  campaign_criterion.ad_schedule.end_minute,
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type
FROM campaign_criterion
WHERE campaign.advertising_channel_type = 'SEARCH'
  AND campaign_criterion.type IN (
    'LOCATION',
    'LANGUAGE',
    'DEVICE',
    'AD_SCHEDULE'
  )`;

assert.equal(
  requests.buildCampaignSettingsQuery(campaignContext),
  expectedCampaignQuery,
);

assert.equal(
  requests.buildCampaignBudgetsQuery(
    configurationRequest.createGoogleAdsConfigurationJobContext({
      dataset_type: 'CAMPAIGN_BUDGETS',
      customer_id: '1234567890',
    }),
  ),
  expectedBudgetQuery,
);

assert.equal(
  requests.buildCampaignTargetingCriteriaQuery(
    configurationRequest.createGoogleAdsConfigurationJobContext({
      dataset_type: 'CAMPAIGN_TARGETING_CRITERIA',
      customer_id: '1234567890',
    }),
  ),
  expectedTargetingQuery,
);

;(async () => {
  const observedRequests = [];
  const exactRawBytes = Buffer.from('{"geoTargetConstantSuggestions":[]}');

  const requester = async (request) => {
    observedRequests.push(request);
    return {
      status: 200,
      body: { geoTargetConstantSuggestions: [] },
      raw_body: exactRawBytes,
    };
  };

  const resolved = await requests.requestGoogleAdsGeoTargetConstantsRaw(
    {
      resource_names: [
        'geoTargetConstants/2392',
        'geoTargetConstants/1007396',
      ],
    },
    requester,
  );

  assert.equal(observedRequests.length, 1);
  assert.deepEqual(observedRequests[0], {
    url: 'https://googleads.googleapis.com/v25/geoTargetConstants:suggest',
    method: 'POST',
    body: {
      geoTargets: {
        geoTargetConstants: [
          'geoTargetConstants/2392',
          'geoTargetConstants/1007396',
        ],
      },
    },
  });

  assert.deepEqual(
    Array.from(resolved.raw_bytes),
    Array.from(exactRawBytes),
    'Resolver must preserve exact provider raw bytes.',
  );

  await assert.rejects(
    () => requests.requestGoogleAdsGeoTargetConstantsRaw(
      { resource_names: [] },
      requester,
    ),
    /resource name/i,
  );

  await assert.rejects(
    () => requests.requestGoogleAdsGeoTargetConstantsRaw(
      { resource_names: ['Turkey'] },
      requester,
    ),
    /geoTargetConstants/i,
  );

  await assert.rejects(
    () => requests.requestGoogleAdsGeoTargetConstantsRaw(
      { resource_names: ['geoTargetConstants/2392'] },
      async () => ({
        status: 429,
        body: { error: { status: 'RESOURCE_EXHAUSTED' } },
        raw_body: Buffer.from('{}'),
      }),
    ),
    /HTTP 429/i,
  );

  await assert.rejects(
    () => requests.requestGoogleAdsGeoTargetConstantsRaw(
      { resource_names: ['geoTargetConstants/2392'] },
      async () => ({
        status: 200,
        body: { geoTargetConstantSuggestions: [] },
      }),
    ),
    /raw/i,
  );

  console.log(
    'PASS GOOGLE-ADS-CAMPAIGN-SETTINGS-CONTRACT-001: three current-configuration datasets preserve exact provider-native v25 query and geo-resolver scope',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
