import type {
  GoogleAdsCampaignConversionGoalRow,
  GoogleAdsConfigurationDatasetType,
  GoogleAdsConfigurationNormalizedRow,
  GoogleAdsConversionActionRow,
  GoogleAdsConversionGoalCampaignConfigRow,
  GoogleAdsCustomerConversionGoalRow,
  GoogleAdsCustomerConversionTrackingSettingRow,
  GoogleAdsCustomConversionGoalRow,
} from '../../../shared/google-ads-configuration';

type ProviderRecord = Record<string, unknown>;

const requireRecord = (
  value: unknown,
  field: string,
): ProviderRecord => {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    throw new Error(
      `Google Ads configuration ${field} must be an object.`,
    );
  }

  return value as ProviderRecord;
};

const optionalRecord = (
  value: unknown,
  field: string,
): ProviderRecord | null => {
  if (value === null || value === undefined) return null;
  return requireRecord(value, field);
};

const requireRows = (
  value: Record<string, unknown>[],
  label: string,
): ProviderRecord[] => {
  if (!Array.isArray(value)) {
    throw new Error(
      `Google Ads configuration ${label} must be an array.`,
    );
  }

  return value.map((candidate, index) => (
    requireRecord(candidate, `${label}[${String(index)}]`)
  ));
};

const requireText = (
  value: unknown,
  field: string,
): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Google Ads configuration ${field} must be a non-empty string.`,
    );
  }

  return value;
};

const optionalText = (
  value: unknown,
  field: string,
): string | null => (
  value === null || value === undefined
    ? null
    : requireText(value, field)
);

const requireBoolean = (
  value: unknown,
  field: string,
): boolean => {
  if (typeof value !== 'boolean') {
    throw new Error(
      `Google Ads configuration ${field} must be a boolean.`,
    );
  }

  return value;
};

const optionalBoolean = (
  value: unknown,
  field: string,
): boolean | null => (
  value === null || value === undefined
    ? null
    : requireBoolean(value, field)
);

const requireNumber = (
  value: unknown,
  field: string,
): number => {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
  ) {
    throw new Error(
      `Google Ads configuration ${field} must be a finite number.`,
    );
  }

  return value;
};

const optionalNumber = (
  value: unknown,
  field: string,
): number | null => (
  value === null || value === undefined
    ? null
    : requireNumber(value, field)
);

const requireTextArray = (
  value: unknown,
  field: string,
): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(
      `Google Ads configuration ${field} must be an array.`,
    );
  }

  return value.map((candidate, index) => (
    requireText(candidate, `${field}[${String(index)}]`)
  ));
};

export const normalizeConversionActionRows = (
  rows: Record<string, unknown>[],
): GoogleAdsConversionActionRow[] => (
  requireRows(rows, 'conversion action rows').map((row) => {
    const action = requireRecord(
      row.conversionAction,
      'conversionAction',
    );

    const attribution = optionalRecord(
      action.attributionModelSettings,
      'conversionAction.attributionModelSettings',
    );

    const valueSettings = optionalRecord(
      action.valueSettings,
      'conversionAction.valueSettings',
    );

    const ga4 = optionalRecord(
      action.googleAnalytics4Settings,
      'conversionAction.googleAnalytics4Settings',
    );

    return {
      conversion_action_resource_name: requireText(
        action.resourceName,
        'conversionAction.resourceName',
      ),
      conversion_action_id: requireText(
        action.id,
        'conversionAction.id',
      ),
      conversion_action_name: optionalText(
        action.name,
        'conversionAction.name',
      ),
      conversion_action_status: requireText(
        action.status,
        'conversionAction.status',
      ),
      conversion_action_type: requireText(
        action.type,
        'conversionAction.type',
      ),
      conversion_action_category: requireText(
        action.category,
        'conversionAction.category',
      ),
      conversion_action_origin: requireText(
        action.origin,
        'conversionAction.origin',
      ),
      owner_customer: optionalText(
        action.ownerCustomer,
        'conversionAction.ownerCustomer',
      ),
      counting_type: optionalText(
        action.countingType,
        'conversionAction.countingType',
      ),
      primary_for_goal: requireBoolean(
        action.primaryForGoal,
        'conversionAction.primaryForGoal',
      ),
      include_in_conversions_metric: optionalBoolean(
        action.includeInConversionsMetric,
        'conversionAction.includeInConversionsMetric',
      ),
      click_through_lookback_window_days: optionalText(
        action.clickThroughLookbackWindowDays,
        'conversionAction.clickThroughLookbackWindowDays',
      ),
      view_through_lookback_window_days: optionalText(
        action.viewThroughLookbackWindowDays,
        'conversionAction.viewThroughLookbackWindowDays',
      ),
      attribution_model: attribution === null
        ? null
        : optionalText(
          attribution.attributionModel,
          'conversionAction.attributionModelSettings.attributionModel',
        ),
      data_driven_model_status: attribution === null
        ? null
        : optionalText(
          attribution.dataDrivenModelStatus,
          'conversionAction.attributionModelSettings.dataDrivenModelStatus',
        ),
      default_value: valueSettings === null
        ? null
        : optionalNumber(
          valueSettings.defaultValue,
          'conversionAction.valueSettings.defaultValue',
        ),
      default_currency_code: valueSettings === null
        ? null
        : optionalText(
          valueSettings.defaultCurrencyCode,
          'conversionAction.valueSettings.defaultCurrencyCode',
        ),
      always_use_default_value: valueSettings === null
        ? null
        : optionalBoolean(
          valueSettings.alwaysUseDefaultValue,
          'conversionAction.valueSettings.alwaysUseDefaultValue',
        ),
      google_analytics_4_property_id: ga4 === null
        ? null
        : optionalText(
          ga4.propertyId,
          'conversionAction.googleAnalytics4Settings.propertyId',
        ),
      google_analytics_4_event_name: ga4 === null
        ? null
        : optionalText(
          ga4.eventName,
          'conversionAction.googleAnalytics4Settings.eventName',
        ),
    };
  })
);

export const normalizeCustomerConversionGoalRows = (
  rows: Record<string, unknown>[],
): GoogleAdsCustomerConversionGoalRow[] => (
  requireRows(rows, 'customer conversion goal rows').map((row) => {
    const goal = requireRecord(
      row.customerConversionGoal,
      'customerConversionGoal',
    );

    return {
      resource_name: requireText(
        goal.resourceName,
        'customerConversionGoal.resourceName',
      ),
      category: requireText(
        goal.category,
        'customerConversionGoal.category',
      ),
      origin: requireText(
        goal.origin,
        'customerConversionGoal.origin',
      ),
      biddable: requireBoolean(
        goal.biddable,
        'customerConversionGoal.biddable',
      ),
    };
  })
);

export const normalizeConversionGoalCampaignConfigRows = (
  rows: Record<string, unknown>[],
): GoogleAdsConversionGoalCampaignConfigRow[] => (
  requireRows(rows, 'conversion goal campaign config rows').map((row) => {
    const config = requireRecord(
      row.conversionGoalCampaignConfig,
      'conversionGoalCampaignConfig',
    );
    const campaign = requireRecord(row.campaign, 'campaign');

    return {
      resource_name: requireText(
        config.resourceName,
        'conversionGoalCampaignConfig.resourceName',
      ),
      campaign_resource_name: requireText(
        config.campaign,
        'conversionGoalCampaignConfig.campaign',
      ),
      campaign_id: requireText(
        campaign.id,
        'campaign.id',
      ),
      campaign_name: optionalText(
        campaign.name,
        'campaign.name',
      ),
      campaign_status: requireText(
        campaign.status,
        'campaign.status',
      ),
      goal_config_level: requireText(
        config.goalConfigLevel,
        'conversionGoalCampaignConfig.goalConfigLevel',
      ),
      custom_conversion_goal_resource_name: optionalText(
        config.customConversionGoal,
        'conversionGoalCampaignConfig.customConversionGoal',
      ),
    };
  })
);

export const normalizeCampaignConversionGoalRows = (
  rows: Record<string, unknown>[],
): GoogleAdsCampaignConversionGoalRow[] => (
  requireRows(rows, 'campaign conversion goal rows').map((row) => {
    const goal = requireRecord(
      row.campaignConversionGoal,
      'campaignConversionGoal',
    );
    const campaign = requireRecord(row.campaign, 'campaign');

    return {
      resource_name: requireText(
        goal.resourceName,
        'campaignConversionGoal.resourceName',
      ),
      campaign_resource_name: requireText(
        goal.campaign,
        'campaignConversionGoal.campaign',
      ),
      campaign_id: requireText(
        campaign.id,
        'campaign.id',
      ),
      campaign_name: optionalText(
        campaign.name,
        'campaign.name',
      ),
      campaign_status: requireText(
        campaign.status,
        'campaign.status',
      ),
      category: requireText(
        goal.category,
        'campaignConversionGoal.category',
      ),
      origin: requireText(
        goal.origin,
        'campaignConversionGoal.origin',
      ),
      biddable: requireBoolean(
        goal.biddable,
        'campaignConversionGoal.biddable',
      ),
    };
  })
);

export const normalizeCustomConversionGoalRows = (
  rows: Record<string, unknown>[],
): GoogleAdsCustomConversionGoalRow[] => (
  requireRows(rows, 'custom conversion goal rows').map((row) => {
    const goal = requireRecord(
      row.customConversionGoal,
      'customConversionGoal',
    );

    return {
      resource_name: requireText(
        goal.resourceName,
        'customConversionGoal.resourceName',
      ),
      id: requireText(
        goal.id,
        'customConversionGoal.id',
      ),
      name: optionalText(
        goal.name,
        'customConversionGoal.name',
      ),
      status: requireText(
        goal.status,
        'customConversionGoal.status',
      ),
      conversion_action_resource_names: requireTextArray(
        goal.conversionActions,
        'customConversionGoal.conversionActions',
      ),
    };
  })
);

export const normalizeCustomerConversionTrackingSettingRows = (
  rows: Record<string, unknown>[],
): GoogleAdsCustomerConversionTrackingSettingRow[] => (
  requireRows(rows, 'customer conversion tracking setting rows').map((row) => {
    const customer = requireRecord(row.customer, 'customer');
    const settings = requireRecord(
      customer.conversionTrackingSetting,
      'customer.conversionTrackingSetting',
    );

    return {
      customer_resource_name: requireText(
        customer.resourceName,
        'customer.resourceName',
      ),
      customer_id: requireText(
        customer.id,
        'customer.id',
      ),
      conversion_tracking_status: requireText(
        settings.conversionTrackingStatus,
        'customer.conversionTrackingSetting.conversionTrackingStatus',
      ),
      conversion_tracking_id: optionalText(
        settings.conversionTrackingId,
        'customer.conversionTrackingSetting.conversionTrackingId',
      ),
      cross_account_conversion_tracking_id: optionalText(
        settings.crossAccountConversionTrackingId,
        'customer.conversionTrackingSetting.crossAccountConversionTrackingId',
      ),
      google_ads_conversion_customer: optionalText(
        settings.googleAdsConversionCustomer,
        'customer.conversionTrackingSetting.googleAdsConversionCustomer',
      ),
    };
  })
);

export const normalizeGoogleAdsConversionConfigurationRows = (
  datasetType: GoogleAdsConfigurationDatasetType,
  rows: Record<string, unknown>[],
): GoogleAdsConfigurationNormalizedRow[] => {
  switch (datasetType) {
    case 'CONVERSION_ACTIONS':
      return normalizeConversionActionRows(rows);

    case 'CUSTOMER_CONVERSION_GOALS':
      return normalizeCustomerConversionGoalRows(rows);

    case 'CONVERSION_GOAL_CAMPAIGN_CONFIGS':
      return normalizeConversionGoalCampaignConfigRows(rows);

    case 'CAMPAIGN_CONVERSION_GOALS':
      return normalizeCampaignConversionGoalRows(rows);

    case 'CUSTOM_CONVERSION_GOALS':
      return normalizeCustomConversionGoalRows(rows);

    case 'CUSTOMER_CONVERSION_TRACKING_SETTINGS':
      return normalizeCustomerConversionTrackingSettingRows(rows);

    default:
      throw new Error(
        `Unsupported Google Ads conversion configuration dataset: ${String(datasetType)}.`,
      );
  }
};
