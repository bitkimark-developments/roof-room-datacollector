const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const adapter = require(path.join(
  buildRoot,
  'main/sources/google-ads/campaign-settings-adapter.js',
));

const configurationNormalizer = require(path.join(
  buildRoot,
  'main/sources/google-ads/configuration-normalizer.js',
));

const campaignRow = {
  campaign: {
    resourceName: 'customers/123/campaigns/1001',
    id: '1001',
    name: 'TR Search',
    status: 'REMOVED',
    advertisingChannelType: 'SEARCH',
    advertisingChannelSubType: 'SEARCH_STANDARD',
    startDateTime: '2026-01-01 00:00:00',
    endDateTime: '2026-12-31 23:59:59',
    campaignBudget: 'customers/123/campaignBudgets/2001',
    keywordMatchType: 'BROAD',
    biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
    biddingStrategy: 'customers/123/biddingStrategies/3001',
    manualCpc: {
      enhancedCpcEnabled: false,
    },
    targetSpend: {
      cpcBidCeilingMicros: '2500000',
      targetSpendMicros: '5000000',
    },
    maximizeConversions: {
      targetCpaMicros: '8000000',
    },
    maximizeConversionValue: {
      targetRoas: 1.75,
    },
    targetCpa: {
      targetCpaMicros: '9000000',
    },
    targetRoas: {
      targetRoas: 2.25,
    },
    targetImpressionShare: {
      location: 'TOP_OF_PAGE',
      locationFractionMicros: '750000',
      cpcBidCeilingMicros: '3500000',
    },
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: false,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: true,
    },
    geoTargetTypeSetting: {
      positiveGeoTargetType: 'PRESENCE',
      negativeGeoTargetType: 'PRESENCE',
    },
    trackingSetting: {
      trackingUrl: 'https://tracker.example/click',
    },
    trackingUrlTemplate: '{lpurl}?source=ads',
    finalUrlSuffix: 'utm_source=google',
    aiMaxSetting: {
      enableAiMax: false,
      bundlingRequired: 'NOT_REQUIRED',
    },
    assetAutomationSettings: [
      {
        assetAutomationType: 'TEXT_ASSET_AUTOMATION',
        assetAutomationStatus: 'OPTED_OUT',
      },
      {
        assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION',
        assetAutomationStatus: 'OPTED_IN',
      },
    ],
  },
};

const rows = adapter.normalizeGoogleAdsCampaignSettingsRows(
  'CAMPAIGN_SETTINGS',
  [campaignRow],
);

assert.equal(rows.length, 1);

assert.deepEqual(rows[0], {
  campaign_resource_name: 'customers/123/campaigns/1001',
  campaign_id: '1001',
  campaign_name: 'TR Search',
  campaign_status: 'REMOVED',
  campaign_keyword_match_type: 'BROAD',
  advertising_channel_type: 'SEARCH',
  advertising_channel_sub_type: 'SEARCH_STANDARD',
  start_date_time: '2026-01-01 00:00:00',
  end_date_time: '2026-12-31 23:59:59',
  campaign_budget_resource_name: 'customers/123/campaignBudgets/2001',
  bidding_strategy_type: 'MAXIMIZE_CONVERSIONS',
  bidding_strategy_resource_name: 'customers/123/biddingStrategies/3001',
  manual_cpc_enhanced_cpc_enabled: false,
  target_spend_cpc_bid_ceiling_micros: '2500000',
  target_spend_target_spend_micros: '5000000',
  maximize_conversions_target_cpa_micros: '8000000',
  maximize_conversion_value_target_roas: 1.75,
  target_cpa_target_cpa_micros: '9000000',
  target_roas_target_roas: 2.25,
  target_impression_share_location: 'TOP_OF_PAGE',
  target_impression_share_location_fraction_micros: '750000',
  target_impression_share_cpc_bid_ceiling_micros: '3500000',
  target_google_search: true,
  target_search_network: false,
  target_content_network: false,
  target_partner_search_network: true,
  positive_geo_target_type: 'PRESENCE',
  negative_geo_target_type: 'PRESENCE',
  tracking_url: 'https://tracker.example/click',
  tracking_url_template: '{lpurl}?source=ads',
  final_url_suffix: 'utm_source=google',
  ai_max_enable_ai_max: false,
  ai_max_bundling_required: 'NOT_REQUIRED',
  asset_automation_settings: [
    {
      asset_automation_type: 'TEXT_ASSET_AUTOMATION',
      asset_automation_status: 'OPTED_OUT',
    },
    {
      asset_automation_type: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION',
      asset_automation_status: 'OPTED_IN',
    },
  ],
});

assert.equal(
  Object.hasOwn(rows[0], 'portfolio_strategy_config_complete'),
  false,
  'Portfolio assignment evidence must not invent portfolio completeness.',
);

assert.equal(
  rows[0].campaign_status,
  'REMOVED',
  'Provider REMOVED lifecycle evidence must be preserved.',
);

const sparseCampaignRow = JSON.parse(JSON.stringify(campaignRow));

delete sparseCampaignRow.campaign.status;
delete sparseCampaignRow.campaign.keywordMatchType;
delete sparseCampaignRow.campaign.advertisingChannelSubType;
delete sparseCampaignRow.campaign.biddingStrategyType;
delete sparseCampaignRow.campaign.manualCpc.enhancedCpcEnabled;
delete sparseCampaignRow.campaign.networkSettings;
delete sparseCampaignRow.campaign.geoTargetTypeSetting;
delete sparseCampaignRow.campaign.aiMaxSetting.enableAiMax;
delete sparseCampaignRow.campaign.aiMaxSetting.bundlingRequired;

sparseCampaignRow.campaign.maximizeConversions = {};
sparseCampaignRow.campaign.maximizeConversionValue = {};
sparseCampaignRow.campaign.targetImpressionShare = {};
sparseCampaignRow.campaign.assetAutomationSettings = [];

const sparse = adapter.normalizeGoogleAdsCampaignSettingsRows(
  'CAMPAIGN_SETTINGS',
  [sparseCampaignRow],
)[0];

assert.equal(
  sparse.advertising_channel_sub_type,
  'UNSPECIFIED',
  'Implicit-presence enum omission must preserve the Proto3 default.',
);

assert.equal(
  sparse.bidding_strategy_type,
  'UNSPECIFIED',
  'Implicit-presence bidding enum omission must preserve the Proto3 default.',
);

assert.equal(
  sparse.campaign_status,
  'UNSPECIFIED',
  'Implicit-presence campaign status omission must preserve the Proto3 enum default.',
);

assert.equal(
  sparse.campaign_keyword_match_type,
  'UNSPECIFIED',
  'Implicit-presence keyword-match omission must preserve the Proto3 enum default.',
);

assert.equal(
  sparse.target_google_search,
  null,
  'Unset optional network bool must remain null.',
);

assert.equal(sparse.target_search_network, null);
assert.equal(sparse.target_content_network, null);
assert.equal(sparse.target_partner_search_network, null);

assert.equal(sparse.positive_geo_target_type, 'UNSPECIFIED');
assert.equal(sparse.negative_geo_target_type, 'UNSPECIFIED');

assert.equal(
  sparse.target_impression_share_location,
  'UNSPECIFIED',
  'Active implicit-presence Target Impression Share enum must preserve its default.',
);
assert.equal(
  sparse.target_impression_share_location_fraction_micros,
  null,
);
assert.equal(
  sparse.target_impression_share_cpc_bid_ceiling_micros,
  null,
);

assert.equal(
  sparse.manual_cpc_enhanced_cpc_enabled,
  null,
  'Explicit-presence optional bool omission must remain null.',
);

assert.equal(
  sparse.maximize_conversions_target_cpa_micros,
  '0',
  'Active implicit-presence int64 omission must preserve the Proto3 zero default.',
);

assert.equal(
  sparse.maximize_conversion_value_target_roas,
  0,
  'Active implicit-presence double omission must preserve the Proto3 zero default.',
);

assert.equal(
  sparse.ai_max_enable_ai_max,
  null,
  'Unset optional AI Max bool must remain null.',
);

assert.equal(
  sparse.ai_max_bundling_required,
  null,
  'Unset optional AI Max enum must remain null.',
);

assert.deepEqual(
  sparse.asset_automation_settings,
  [],
  'Repeated selected evidence with no elements must normalize to [].',
);

const inactiveBiddingRow = JSON.parse(JSON.stringify(campaignRow));
delete inactiveBiddingRow.campaign.maximizeConversions;
delete inactiveBiddingRow.campaign.maximizeConversionValue;
delete inactiveBiddingRow.campaign.targetCpa;
delete inactiveBiddingRow.campaign.targetRoas;
delete inactiveBiddingRow.campaign.targetImpressionShare;
delete inactiveBiddingRow.campaign.targetSpend;

const inactive = adapter.normalizeGoogleAdsCampaignSettingsRows(
  'CAMPAIGN_SETTINGS',
  [inactiveBiddingRow],
)[0];

assert.equal(inactive.maximize_conversions_target_cpa_micros, null);
assert.equal(inactive.maximize_conversion_value_target_roas, null);
assert.equal(inactive.target_cpa_target_cpa_micros, null);
assert.equal(inactive.target_roas_target_roas, null);
assert.equal(inactive.target_impression_share_location, null);
assert.equal(inactive.target_spend_target_spend_micros, null);

const budgetRow = {
  campaignBudget: {
    resourceName: 'customers/123/campaignBudgets/2001',
    id: '2001',
    name: 'Shared Search Budget',
    status: 'ENABLED',
    amountMicros: '15000000',
    deliveryMethod: 'STANDARD',
    explicitlyShared: true,
    referenceCount: '2',
    period: 'DAILY',
    type: 'STANDARD',
  },
};

const normalizedBudget = adapter.normalizeGoogleAdsCampaignSettingsRows(
  'CAMPAIGN_BUDGETS',
  [budgetRow],
)[0];

assert.deepEqual(normalizedBudget, {
  campaign_budget_resource_name: 'customers/123/campaignBudgets/2001',
  campaign_budget_id: '2001',
  campaign_budget_name: 'Shared Search Budget',
  campaign_budget_status: 'ENABLED',
  amount_micros: '15000000',
  delivery_method: 'STANDARD',
  explicitly_shared: true,
  reference_count: '2',
  total_amount_micros: null,
  period: 'DAILY',
  type: 'STANDARD',
});

assert.equal(
  Object.hasOwn(normalizedBudget, 'campaign_resource_name'),
  false,
  'Budget resource snapshot must not become a campaign association table.',
);

assert.equal(
  Object.hasOwn(normalizedBudget, 'budget_campaign_association_status'),
  false,
  'Budget resource snapshot must not emit association segmentation.',
);

const customPeriodBudget = JSON.parse(JSON.stringify(budgetRow));
delete customPeriodBudget.campaignBudget.amountMicros;
customPeriodBudget.campaignBudget.totalAmountMicros = '120000000';
customPeriodBudget.campaignBudget.period = 'CUSTOM_PERIOD';

const normalizedCustomPeriod =
  adapter.normalizeGoogleAdsCampaignSettingsRows(
    'CAMPAIGN_BUDGETS',
    [customPeriodBudget],
  )[0];

assert.equal(
  normalizedCustomPeriod.amount_micros,
  null,
  'Mutually exclusive unavailable daily amount must remain null.',
);

assert.equal(
  normalizedCustomPeriod.total_amount_micros,
  '120000000',
);

const sparseBudget = JSON.parse(JSON.stringify(budgetRow));
delete sparseBudget.campaignBudget.status;
delete sparseBudget.campaignBudget.deliveryMethod;
delete sparseBudget.campaignBudget.explicitlyShared;
delete sparseBudget.campaignBudget.referenceCount;
delete sparseBudget.campaignBudget.period;
delete sparseBudget.campaignBudget.type;

const normalizedSparseBudget =
  adapter.normalizeGoogleAdsCampaignSettingsRows(
    'CAMPAIGN_BUDGETS',
    [sparseBudget],
  )[0];

assert.equal(normalizedSparseBudget.campaign_budget_status, 'UNSPECIFIED');
assert.equal(normalizedSparseBudget.delivery_method, 'UNSPECIFIED');
assert.equal(normalizedSparseBudget.explicitly_shared, null);
assert.equal(normalizedSparseBudget.reference_count, null);
assert.equal(normalizedSparseBudget.period, 'UNSPECIFIED');
assert.equal(normalizedSparseBudget.type, 'UNSPECIFIED');

const targetingRows = [
  {
    campaign: {
      resourceName: 'customers/123/campaigns/1001',
      id: '1001',
      name: 'TR Search',
      status: 'ENABLED',
      advertisingChannelType: 'SEARCH',
    },
    campaignCriterion: {
      resourceName: 'customers/123/campaignCriteria/1001~4001',
      campaign: 'customers/123/campaigns/1001',
      criterionId: '4001',
      type: 'LOCATION',
      negative: false,
      status: 'ENABLED',
      location: {
        geoTargetConstant: 'geoTargetConstants/2392',
      },
    },
  },
  {
    campaign: {
      resourceName: 'customers/123/campaigns/1001',
      id: '1001',
      name: 'TR Search',
      status: 'ENABLED',
      advertisingChannelType: 'SEARCH',
    },
    campaignCriterion: {
      resourceName: 'customers/123/campaignCriteria/1001~4002',
      campaign: 'customers/123/campaigns/1001',
      criterionId: '4002',
      type: 'LOCATION',
      negative: true,
      status: 'REMOVED',
      location: {
        geoTargetConstant: 'geoTargetConstants/2124',
      },
    },
  },
  {
    campaign: {
      resourceName: 'customers/123/campaigns/1001',
      id: '1001',
      name: 'TR Search',
      status: 'ENABLED',
      advertisingChannelType: 'SEARCH',
    },
    campaignCriterion: {
      resourceName: 'customers/123/campaignCriteria/1001~4003',
      campaign: 'customers/123/campaigns/1001',
      criterionId: '4003',
      type: 'LANGUAGE',
      negative: false,
      status: 'ENABLED',
      language: {
        languageConstant: 'languageConstants/1037',
      },
    },
    languageConstant: {
      resourceName: 'languageConstants/1037',
      id: '1037',
      code: 'tr',
      name: 'Turkish',
      targetable: true,
    },
  },
  {
    campaign: {
      resourceName: 'customers/123/campaigns/1001',
      id: '1001',
      name: 'TR Search',
      status: 'ENABLED',
      advertisingChannelType: 'SEARCH',
    },
    campaignCriterion: {
      resourceName: 'customers/123/campaignCriteria/1001~4004',
      campaign: 'customers/123/campaigns/1001',
      criterionId: '4004',
      type: 'DEVICE',
      negative: false,
      status: 'ENABLED',
      device: {
        type: 'MOBILE',
      },
    },
  },
  {
    campaign: {
      resourceName: 'customers/123/campaigns/1001',
      id: '1001',
      name: 'TR Search',
      status: 'ENABLED',
      advertisingChannelType: 'SEARCH',
    },
    campaignCriterion: {
      resourceName: 'customers/123/campaignCriteria/1001~4005',
      campaign: 'customers/123/campaigns/1001',
      criterionId: '4005',
      type: 'AD_SCHEDULE',
      negative: false,
      status: 'ENABLED',
      adSchedule: {
        dayOfWeek: 'MONDAY',
        startHour: 9,
        startMinute: 'ZERO',
        endHour: 18,
        endMinute: 'THIRTY',
      },
    },
  },
];

const geoTargetConstants = new Map([
  [
    'geoTargetConstants/2392',
    {
      resource_name: 'geoTargetConstants/2392',
      id: '2392',
      name: 'Turkey',
      canonical_name: 'Turkey',
      country_code: 'TR',
      target_type: 'Country',
      status: 'ENABLED',
    },
  ],
  [
    'geoTargetConstants/2124',
    {
      resource_name: 'geoTargetConstants/2124',
      id: '2124',
      name: 'Canada',
      canonical_name: 'Canada',
      country_code: 'CA',
      target_type: 'Country',
      status: 'ENABLED',
    },
  ],
]);

const normalizedTargeting =
  adapter.normalizeGoogleAdsCampaignSettingsRows(
    'CAMPAIGN_TARGETING_CRITERIA',
    targetingRows,
    {
      geo_target_constants: geoTargetConstants,
    },
  );

assert.equal(normalizedTargeting.length, 5);

assert.deepEqual(normalizedTargeting[0], {
  criterion_resource_name:
    'customers/123/campaignCriteria/1001~4001',
  campaign_resource_name: 'customers/123/campaigns/1001',
  campaign_id: '1001',
  campaign_name: 'TR Search',
  campaign_status: 'ENABLED',
  criterion_id: '4001',
  criterion_type: 'LOCATION',
  negative: false,
  criterion_status: 'ENABLED',
  location_geo_target_constant_resource_name: 'geoTargetConstants/2392',
  location_geo_target_constant_id: '2392',
  location_geo_target_constant_name: 'Turkey',
  location_geo_target_constant_canonical_name: 'Turkey',
  location_geo_target_constant_country_code: 'TR',
  location_geo_target_constant_target_type: 'Country',
  location_geo_target_constant_status: 'ENABLED',
  language_constant_resource_name: null,
  language_constant_id: null,
  language_constant_code: null,
  language_constant_name: null,
  language_constant_targetable: null,
  device_type: null,
  ad_schedule_day_of_week: null,
  ad_schedule_start_hour: null,
  ad_schedule_start_minute: null,
  ad_schedule_end_hour: null,
  ad_schedule_end_minute: null,
});

assert.equal(
  normalizedTargeting[1].negative,
  true,
  'Negative LOCATION provider evidence must be preserved.',
);
assert.equal(normalizedTargeting[1].criterion_status, 'REMOVED');
assert.equal(
  normalizedTargeting[1].location_geo_target_constant_name,
  'Canada',
  'Observed human geo evidence must come from the resolver map.',
);

assert.deepEqual(
  {
    resource_name:
      normalizedTargeting[2].language_constant_resource_name,
    id: normalizedTargeting[2].language_constant_id,
    code: normalizedTargeting[2].language_constant_code,
    name: normalizedTargeting[2].language_constant_name,
    targetable: normalizedTargeting[2].language_constant_targetable,
  },
  {
    resource_name: 'languageConstants/1037',
    id: '1037',
    code: 'tr',
    name: 'Turkish',
    targetable: true,
  },
);

assert.equal(
  normalizedTargeting[2].location_geo_target_constant_resource_name,
  null,
);
assert.equal(normalizedTargeting[2].device_type, null);
assert.equal(normalizedTargeting[2].ad_schedule_day_of_week, null);

assert.equal(normalizedTargeting[3].criterion_type, 'DEVICE');
assert.equal(normalizedTargeting[3].device_type, 'MOBILE');
assert.equal(
  normalizedTargeting[3].language_constant_resource_name,
  null,
);

assert.equal(normalizedTargeting[4].criterion_type, 'AD_SCHEDULE');
assert.equal(normalizedTargeting[4].ad_schedule_day_of_week, 'MONDAY');
assert.equal(normalizedTargeting[4].ad_schedule_start_hour, 9);
assert.equal(normalizedTargeting[4].ad_schedule_start_minute, 'ZERO');
assert.equal(normalizedTargeting[4].ad_schedule_end_hour, 18);
assert.equal(normalizedTargeting[4].ad_schedule_end_minute, 'THIRTY');
assert.equal(normalizedTargeting[4].device_type, null);

const sparseDeviceCriterion = JSON.parse(
  JSON.stringify(targetingRows[3]),
);
delete sparseDeviceCriterion.campaign.status;
delete sparseDeviceCriterion.campaignCriterion.status;
delete sparseDeviceCriterion.campaignCriterion.negative;
delete sparseDeviceCriterion.campaignCriterion.device.type;

const normalizedSparseDevice =
  adapter.normalizeGoogleAdsCampaignSettingsRows(
    'CAMPAIGN_TARGETING_CRITERIA',
    [sparseDeviceCriterion],
  )[0];

assert.equal(normalizedSparseDevice.campaign_status, 'UNSPECIFIED');
assert.equal(normalizedSparseDevice.criterion_status, 'UNSPECIFIED');
assert.equal(
  normalizedSparseDevice.negative,
  null,
  'Unset optional CampaignCriterion.negative must remain null.',
);
assert.equal(
  normalizedSparseDevice.device_type,
  'UNSPECIFIED',
  'Active implicit-presence device enum must preserve its Proto3 default.',
);

const noResolverFabrication = JSON.parse(
  JSON.stringify(targetingRows[0]),
);

assert.throws(
  () => adapter.normalizeGoogleAdsCampaignSettingsRows(
    'CAMPAIGN_TARGETING_CRITERIA',
    [noResolverFabrication],
    {
      geo_target_constants: new Map(),
    },
  ),
  /geo target/i,
  'LOCATION normalization must not fabricate human geo fields without resolver evidence.',
);

assert.deepEqual(
  configurationNormalizer.normalizeGoogleAdsConfigurationRows(
    'CAMPAIGN_SETTINGS',
    [campaignRow],
  ),
  adapter.normalizeGoogleAdsCampaignSettingsRows(
    'CAMPAIGN_SETTINGS',
    [campaignRow],
  ),
  'Shared configuration normalizer must dispatch CAMPAIGN_SETTINGS.',
);

assert.deepEqual(
  configurationNormalizer.normalizeGoogleAdsConfigurationRows(
    'CAMPAIGN_BUDGETS',
    [budgetRow],
  ),
  adapter.normalizeGoogleAdsCampaignSettingsRows(
    'CAMPAIGN_BUDGETS',
    [budgetRow],
  ),
  'Shared configuration normalizer must dispatch CAMPAIGN_BUDGETS.',
);

assert.deepEqual(
  configurationNormalizer.normalizeGoogleAdsConfigurationRows(
    'CAMPAIGN_TARGETING_CRITERIA',
    targetingRows,
    {
      geo_target_constants: geoTargetConstants,
    },
  ),
  adapter.normalizeGoogleAdsCampaignSettingsRows(
    'CAMPAIGN_TARGETING_CRITERIA',
    targetingRows,
    {
      geo_target_constants: geoTargetConstants,
    },
  ),
  'Shared configuration normalizer must dispatch targeting with resolver evidence.',
);

const targetingSearchStreamBody = [
  {
    results: targetingRows,
  },
  {},
];

assert.deepEqual(
  adapter.extractGoogleAdsCampaignTargetingGeoResourceNames(
    targetingSearchStreamBody,
  ),
  [
    'geoTargetConstants/2392',
    'geoTargetConstants/2124',
  ],
  'Targeting helper must derive LOCATION refs only from observed provider rows.',
);

const searchStreamRaw = Buffer.from(
  '[{"results":[{"campaignCriterion":{"type":"LOCATION","location":{"geoTargetConstant":"geoTargetConstants/2392"}}}]}]',
);

const resolverRaw = Buffer.from(
  '{"geoTargetConstantSuggestions":[{"geoTargetConstant":{"resourceName":"geoTargetConstants/2392","id":"2392","name":"Turkey","canonicalName":"Turkey","countryCode":"TR","targetType":"Country","status":"ENABLED"}}]}',
);

const bundleBytes =
  adapter.buildGoogleAdsCampaignTargetingEvidenceBundleBytes({
    search_stream_raw_bytes: searchStreamRaw,
    geo_target_suggestions: {
      requested_resource_names: ['geoTargetConstants/2392'],
      raw_bytes: resolverRaw,
    },
  });

const bundleJson = JSON.parse(Buffer.from(bundleBytes).toString('utf8'));
const parsedBundle =
  adapter.parseGoogleAdsCampaignTargetingEvidenceBundle(bundleJson);

assert.equal(parsedBundle.bundle_schema_version, 1);
assert.equal(parsedBundle.parts.length, 2);

assert.deepEqual(parsedBundle.parts[0], {
  kind: 'CAMPAIGN_CRITERIA_SEARCH_STREAM',
  raw_body_base64: searchStreamRaw.toString('base64'),
});

assert.deepEqual(parsedBundle.parts[1], {
  kind: 'GEO_TARGET_CONSTANT_SUGGESTIONS',
  requested_resource_names: ['geoTargetConstants/2392'],
  raw_body_base64: resolverRaw.toString('base64'),
});

assert.deepEqual(
  Buffer.from(parsedBundle.parts[0].raw_body_base64, 'base64'),
  searchStreamRaw,
  'SearchStream raw provider bytes must survive bundle roundtrip exactly.',
);

assert.deepEqual(
  Buffer.from(parsedBundle.parts[1].raw_body_base64, 'base64'),
  resolverRaw,
  'Geo resolver raw provider bytes must survive bundle roundtrip exactly.',
);

console.log(
  'PASS GOOGLE-ADS-CAMPAIGN-SETTINGS-NORMALIZATION-001: campaign, budget, targeting, ProtoJSON defaults, shared dispatch, and evidence-bundle helpers preserve provider-native evidence',
);
