const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const conversion = require(path.join(
  buildRoot,
  'main/sources/google-ads/conversion-configuration-adapter.js',
));

const {
  normalizeConversionActionRows,
  normalizeCustomerConversionGoalRows,
  normalizeConversionGoalCampaignConfigRows,
  normalizeCampaignConversionGoalRows,
  normalizeCustomConversionGoalRows,
  normalizeCustomerConversionTrackingSettingRows,
  normalizeGoogleAdsConversionConfigurationRows,
} = conversion;

const clone = (value) => JSON.parse(JSON.stringify(value));

const mustThrow = (fn, label) => {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert.equal(threw, true, label);
};

const conversionActionRow = {
  conversionAction: {
    resourceName: 'customers/123/conversionActions/1001',
    id: '1001',
    name: 'Purchase',
    status: 'ENABLED',
    type: 'WEBPAGE',
    category: 'PURCHASE',
    origin: 'WEBSITE',
    ownerCustomer: 'customers/456',
    countingType: 'ONE_PER_CLICK',
    primaryForGoal: true,
    includeInConversionsMetric: false,
    clickThroughLookbackWindowDays: '30',
    viewThroughLookbackWindowDays: '1',
    attributionModelSettings: {
      attributionModel: 'GOOGLE_SEARCH_ATTRIBUTION_DATA_DRIVEN',
      dataDrivenModelStatus: 'AVAILABLE',
    },
    valueSettings: {
      defaultValue: 0,
      defaultCurrencyCode: 'TRY',
      alwaysUseDefaultValue: false,
    },
    googleAnalytics4Settings: {
      propertyId: '987654321',
      eventName: 'purchase',
    },
  },
};

const customerConversionGoalRow = {
  customerConversionGoal: {
    resourceName: 'customers/123/customerConversionGoals/PURCHASE~WEBSITE',
    category: 'PURCHASE',
    origin: 'WEBSITE',
    biddable: false,
  },
};

const conversionGoalCampaignConfigRow = {
  conversionGoalCampaignConfig: {
    resourceName: 'customers/123/conversionGoalCampaignConfigs/2001',
    campaign: 'customers/123/campaigns/2001',
    goalConfigLevel: 'CAMPAIGN',
    customConversionGoal: 'customers/123/customConversionGoals/3001',
  },
  campaign: {
    id: '2001',
    name: 'Legacy Search',
    status: 'REMOVED',
  },
};

const campaignConversionGoalRow = {
  campaignConversionGoal: {
    resourceName: 'customers/123/campaignConversionGoals/2001~PURCHASE~WEBSITE',
    campaign: 'customers/123/campaigns/2001',
    category: 'PURCHASE',
    origin: 'WEBSITE',
    biddable: true,
  },
  campaign: {
    id: '2001',
    name: 'Legacy Search',
    status: 'REMOVED',
  },
};

const customConversionGoalRow = {
  customConversionGoal: {
    resourceName: 'customers/123/customConversionGoals/3001',
    id: '3001',
    name: 'Primary Store Goal',
    status: 'ENABLED',
    conversionActions: [
      'customers/123/conversionActions/1001',
      'customers/123/conversionActions/1002',
    ],
  },
};

const customerTrackingRow = {
  customer: {
    resourceName: 'customers/123',
    id: '123',
    conversionTrackingSetting: {
      conversionTrackingStatus: 'CONVERSION_TRACKING_MANAGED_BY_THIS_CUSTOMER',
      conversionTrackingId: '123',
      crossAccountConversionTrackingId: '456',
      googleAdsConversionCustomer: 'customers/456',
    },
  },
};

/* Conversion action */
{
  const row = normalizeConversionActionRows([conversionActionRow])[0];

  assert.deepEqual(row, {
    conversion_action_resource_name: 'customers/123/conversionActions/1001',
    conversion_action_id: '1001',
    conversion_action_name: 'Purchase',
    conversion_action_status: 'ENABLED',
    conversion_action_type: 'WEBPAGE',
    conversion_action_category: 'PURCHASE',
    conversion_action_origin: 'WEBSITE',
    owner_customer: 'customers/456',
    counting_type: 'ONE_PER_CLICK',
    primary_for_goal: true,
    include_in_conversions_metric: false,
    click_through_lookback_window_days: '30',
    view_through_lookback_window_days: '1',
    attribution_model: 'GOOGLE_SEARCH_ATTRIBUTION_DATA_DRIVEN',
    data_driven_model_status: 'AVAILABLE',
    default_value: 0,
    default_currency_code: 'TRY',
    always_use_default_value: false,
    google_analytics_4_property_id: '987654321',
    google_analytics_4_event_name: 'purchase',
  });

  const sparse = clone(conversionActionRow);
  delete sparse.conversionAction.ownerCustomer;
  delete sparse.conversionAction.attributionModelSettings;
  delete sparse.conversionAction.valueSettings;
  delete sparse.conversionAction.googleAnalytics4Settings;
  sparse.requestedCustomerId = '9999999999';

  const sparseNormalized = normalizeConversionActionRows([sparse])[0];

  assert.equal(sparseNormalized.owner_customer, null);
  assert.equal(sparseNormalized.attribution_model, null);
  assert.equal(sparseNormalized.data_driven_model_status, null);
  assert.equal(sparseNormalized.default_value, null);
  assert.equal(sparseNormalized.default_currency_code, null);
  assert.equal(sparseNormalized.always_use_default_value, null);
  assert.equal(sparseNormalized.google_analytics_4_property_id, null);
  assert.equal(sparseNormalized.google_analytics_4_event_name, null);
  assert.equal(
    sparseNormalized.owner_customer,
    null,
    'Requested customer context must never fabricate observed owner evidence.',
  );

  assert.equal(normalizeConversionActionRows.length, 1);
}

/* Customer conversion goal */
{
  const row = normalizeCustomerConversionGoalRows([customerConversionGoalRow])[0];

  assert.deepEqual(row, {
    resource_name: 'customers/123/customerConversionGoals/PURCHASE~WEBSITE',
    category: 'PURCHASE',
    origin: 'WEBSITE',
    biddable: false,
  });
}

/* Campaign goal configuration */
{
  const row =
    normalizeConversionGoalCampaignConfigRows([conversionGoalCampaignConfigRow])[0];

  assert.deepEqual(row, {
    resource_name: 'customers/123/conversionGoalCampaignConfigs/2001',
    campaign_resource_name: 'customers/123/campaigns/2001',
    campaign_id: '2001',
    campaign_name: 'Legacy Search',
    campaign_status: 'REMOVED',
    goal_config_level: 'CAMPAIGN',
    custom_conversion_goal_resource_name:
      'customers/123/customConversionGoals/3001',
  });

  const withoutOptional = clone(conversionGoalCampaignConfigRow);
  delete withoutOptional.conversionGoalCampaignConfig.customConversionGoal;
  delete withoutOptional.campaign.name;

  const sparse =
    normalizeConversionGoalCampaignConfigRows([withoutOptional])[0];

  assert.equal(sparse.custom_conversion_goal_resource_name, null);
  assert.equal(sparse.campaign_name, null);
  assert.equal(
    row.campaign_status,
    'REMOVED',
    'Provider campaign lifecycle evidence must be preserved.',
  );
}

/* Campaign conversion goal */
{
  const row = normalizeCampaignConversionGoalRows([campaignConversionGoalRow])[0];

  assert.deepEqual(row, {
    resource_name:
      'customers/123/campaignConversionGoals/2001~PURCHASE~WEBSITE',
    campaign_resource_name: 'customers/123/campaigns/2001',
    campaign_id: '2001',
    campaign_name: 'Legacy Search',
    campaign_status: 'REMOVED',
    category: 'PURCHASE',
    origin: 'WEBSITE',
    biddable: true,
  });

  assert.equal(row.campaign_status, 'REMOVED');
}

/* Custom conversion goal */
{
  const row = normalizeCustomConversionGoalRows([customConversionGoalRow])[0];

  assert.deepEqual(row, {
    resource_name: 'customers/123/customConversionGoals/3001',
    id: '3001',
    name: 'Primary Store Goal',
    status: 'ENABLED',
    conversion_action_resource_names: [
      'customers/123/conversionActions/1001',
      'customers/123/conversionActions/1002',
    ],
  });

  const explicitEmpty = clone(customConversionGoalRow);
  explicitEmpty.customConversionGoal.conversionActions = [];

  assert.deepEqual(
    normalizeCustomConversionGoalRows([explicitEmpty])[0]
      .conversion_action_resource_names,
    [],
    'Provider-returned empty membership must remain an empty array.',
  );

  const withoutName = clone(customConversionGoalRow);
  delete withoutName.customConversionGoal.name;

  assert.equal(
    normalizeCustomConversionGoalRows([withoutName])[0].name,
    null,
  );
}

/* Customer conversion tracking settings */
{
  const row =
    normalizeCustomerConversionTrackingSettingRows([customerTrackingRow])[0];

  assert.deepEqual(row, {
    customer_resource_name: 'customers/123',
    customer_id: '123',
    conversion_tracking_status:
      'CONVERSION_TRACKING_MANAGED_BY_THIS_CUSTOMER',
    conversion_tracking_id: '123',
    cross_account_conversion_tracking_id: '456',
    google_ads_conversion_customer: 'customers/456',
  });

  const sparse = clone(customerTrackingRow);
  delete sparse.customer.conversionTrackingSetting.conversionTrackingId;
  delete sparse.customer.conversionTrackingSetting.crossAccountConversionTrackingId;
  delete sparse.customer.conversionTrackingSetting.googleAdsConversionCustomer;

  const sparseNormalized =
    normalizeCustomerConversionTrackingSettingRows([sparse])[0];

  assert.equal(sparseNormalized.conversion_tracking_id, null);
  assert.equal(sparseNormalized.cross_account_conversion_tracking_id, null);
  assert.equal(sparseNormalized.google_ads_conversion_customer, null);
}

/* Conversion-family dispatcher */
const dispatcherCases = [
  [
    'CONVERSION_ACTIONS',
    conversionActionRow,
    normalizeConversionActionRows,
  ],
  [
    'CUSTOMER_CONVERSION_GOALS',
    customerConversionGoalRow,
    normalizeCustomerConversionGoalRows,
  ],
  [
    'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
    conversionGoalCampaignConfigRow,
    normalizeConversionGoalCampaignConfigRows,
  ],
  [
    'CAMPAIGN_CONVERSION_GOALS',
    campaignConversionGoalRow,
    normalizeCampaignConversionGoalRows,
  ],
  [
    'CUSTOM_CONVERSION_GOALS',
    customConversionGoalRow,
    normalizeCustomConversionGoalRows,
  ],
  [
    'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
    customerTrackingRow,
    normalizeCustomerConversionTrackingSettingRows,
  ],
];

for (const [datasetType, providerRow, directNormalizer] of dispatcherCases) {
  assert.deepEqual(
    normalizeGoogleAdsConversionConfigurationRows(
      datasetType,
      [providerRow],
    ),
    directNormalizer([providerRow]),
  );
}

assert.equal(normalizeGoogleAdsConversionConfigurationRows.length, 2);

mustThrow(
  () => normalizeGoogleAdsConversionConfigurationRows(
    'CAMPAIGN_NEGATIVE_KEYWORDS',
    [],
  ),
  'Conversion dispatcher must reject a dataset outside its family.',
);

/* Fail closed: conversion action required semantics */
{
  for (const field of [
    'resourceName',
    'id',
    'status',
    'type',
    'category',
    'origin',
    'primaryForGoal',
  ]) {
    const invalid = clone(conversionActionRow);
    delete invalid.conversionAction[field];

    mustThrow(
      () => normalizeConversionActionRows([invalid]),
      `Conversion action must reject missing ${field}.`,
    );
  }

  const invalidBoolean = clone(conversionActionRow);
  invalidBoolean.conversionAction.primaryForGoal = 'true';

  mustThrow(
    () => normalizeConversionActionRows([invalidBoolean]),
    'Conversion action must reject non-boolean primaryForGoal.',
  );
}

/* Fail closed: customer goal required semantics */
{
  const missingCategory = clone(customerConversionGoalRow);
  delete missingCategory.customerConversionGoal.category;

  mustThrow(
    () => normalizeCustomerConversionGoalRows([missingCategory]),
    'Customer conversion goal must reject missing category.',
  );

  const missingBiddable = clone(customerConversionGoalRow);
  delete missingBiddable.customerConversionGoal.biddable;

  mustThrow(
    () => normalizeCustomerConversionGoalRows([missingBiddable]),
    'Customer conversion goal must reject missing biddable.',
  );
}

/* Fail closed: campaign goal-config required semantics */
{
  const missingCampaign = clone(conversionGoalCampaignConfigRow);
  delete missingCampaign.conversionGoalCampaignConfig.campaign;

  mustThrow(
    () => normalizeConversionGoalCampaignConfigRows([missingCampaign]),
    'Goal campaign config must reject missing campaign resource identity.',
  );

  const missingCampaignId = clone(conversionGoalCampaignConfigRow);
  delete missingCampaignId.campaign.id;

  mustThrow(
    () => normalizeConversionGoalCampaignConfigRows([missingCampaignId]),
    'Goal campaign config must reject missing campaign id.',
  );

  const missingCampaignStatus = clone(conversionGoalCampaignConfigRow);
  delete missingCampaignStatus.campaign.status;

  mustThrow(
    () => normalizeConversionGoalCampaignConfigRows([missingCampaignStatus]),
    'Goal campaign config must reject missing campaign status.',
  );

  const missingLevel = clone(conversionGoalCampaignConfigRow);
  delete missingLevel.conversionGoalCampaignConfig.goalConfigLevel;

  mustThrow(
    () => normalizeConversionGoalCampaignConfigRows([missingLevel]),
    'Goal campaign config must reject missing goal config level.',
  );
}

/* Fail closed: campaign conversion goal required semantics */
{
  const missingCampaign = clone(campaignConversionGoalRow);
  delete missingCampaign.campaignConversionGoal.campaign;

  mustThrow(
    () => normalizeCampaignConversionGoalRows([missingCampaign]),
    'Campaign conversion goal must reject missing campaign resource identity.',
  );

  const missingId = clone(campaignConversionGoalRow);
  delete missingId.campaign.id;

  mustThrow(
    () => normalizeCampaignConversionGoalRows([missingId]),
    'Campaign conversion goal must reject missing campaign id.',
  );

  const missingStatus = clone(campaignConversionGoalRow);
  delete missingStatus.campaign.status;

  mustThrow(
    () => normalizeCampaignConversionGoalRows([missingStatus]),
    'Campaign conversion goal must reject missing campaign status.',
  );

  const missingBiddable = clone(campaignConversionGoalRow);
  delete missingBiddable.campaignConversionGoal.biddable;

  mustThrow(
    () => normalizeCampaignConversionGoalRows([missingBiddable]),
    'Campaign conversion goal must reject missing biddable.',
  );
}

/* Fail closed: custom-goal membership and identity */
{
  const missingResource = clone(customConversionGoalRow);
  delete missingResource.customConversionGoal.resourceName;

  mustThrow(
    () => normalizeCustomConversionGoalRows([missingResource]),
    'Custom conversion goal must reject missing resource identity.',
  );

  const missingId = clone(customConversionGoalRow);
  delete missingId.customConversionGoal.id;

  mustThrow(
    () => normalizeCustomConversionGoalRows([missingId]),
    'Custom conversion goal must reject missing id.',
  );

  const missingStatus = clone(customConversionGoalRow);
  delete missingStatus.customConversionGoal.status;

  mustThrow(
    () => normalizeCustomConversionGoalRows([missingStatus]),
    'Custom conversion goal must reject missing status.',
  );

  const missingMembership = clone(customConversionGoalRow);
  delete missingMembership.customConversionGoal.conversionActions;

  mustThrow(
    () => normalizeCustomConversionGoalRows([missingMembership]),
    'Missing custom-goal membership must not be manufactured as [].',
  );

  const malformedMembership = clone(customConversionGoalRow);
  malformedMembership.customConversionGoal.conversionActions = [
    'customers/123/conversionActions/1001',
    null,
  ];

  mustThrow(
    () => normalizeCustomConversionGoalRows([malformedMembership]),
    'Custom-goal membership must contain only provider resource names.',
  );
}

/* Fail closed: tracking settings required semantics */
{
  const missingCustomerResource = clone(customerTrackingRow);
  delete missingCustomerResource.customer.resourceName;

  mustThrow(
    () => normalizeCustomerConversionTrackingSettingRows([missingCustomerResource]),
    'Tracking settings must reject missing customer resource identity.',
  );

  const missingCustomerId = clone(customerTrackingRow);
  delete missingCustomerId.customer.id;

  mustThrow(
    () => normalizeCustomerConversionTrackingSettingRows([missingCustomerId]),
    'Tracking settings must reject missing customer id.',
  );

  const missingStatus = clone(customerTrackingRow);
  delete missingStatus.customer.conversionTrackingSetting.conversionTrackingStatus;

  mustThrow(
    () => normalizeCustomerConversionTrackingSettingRows([missingStatus]),
    'Tracking settings must reject missing conversion tracking status.',
  );
}

console.log(
  'PASS GOOGLE-ADS-CONVERSION-CONFIGURATION-NORMALIZATION-001: six provider-row normalization paths preserve identities/nulls/false/zero/lifecycle/membership evidence and fail closed on semantic mismatches',
);
