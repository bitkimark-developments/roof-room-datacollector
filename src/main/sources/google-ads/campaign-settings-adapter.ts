import { Buffer } from 'node:buffer';

import type {
  GoogleAdsCampaignSettingsDatasetType,
  GoogleAdsCampaignSettingsRow,
  GoogleAdsCampaignTargetingCriterionRow,
  GoogleAdsConfigurationNormalizedRow,
} from '../../../shared/google-ads-configuration';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
);

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`Google Ads campaign settings ${label} is required.`);
  }
  return value;
};

const optionalRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> | null => {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    throw new Error(`Google Ads campaign settings ${label} is invalid.`);
  }
  return value;
};

const requireText = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Google Ads campaign settings ${label} is required.`);
  }
  return value;
};

const optionalText = (
  value: unknown,
  label: string,
): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Google Ads campaign settings ${label} is invalid.`);
  }
  return value;
};

const implicitBoolean = (
  value: unknown,
  label: string,
): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') {
    throw new Error(`Google Ads campaign settings ${label} is invalid.`);
  }
  return value;
};

const implicitEnum = (
  value: unknown,
  label: string,
): string => {
  if (value === undefined || value === null) return 'UNSPECIFIED';
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Google Ads campaign settings ${label} is invalid.`);
  }
  return value;
};

const implicitInt64Text = (
  value: unknown,
  label: string,
): string => {
  if (value === undefined || value === null) return '0';
  if (typeof value !== 'string' || !/^-?\d+$/u.test(value)) {
    throw new Error(`Google Ads campaign settings ${label} is invalid.`);
  }
  return value;
};

const implicitNumber = (
  value: unknown,
  label: string,
): number => {
  if (value === undefined || value === null) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Google Ads campaign settings ${label} is invalid.`);
  }
  return value;
};

const optionalBoolean = (
  value: unknown,
  label: string,
): boolean | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') {
    throw new Error(`Google Ads campaign settings ${label} is invalid.`);
  }
  return value;
};

const optionalNumber = (
  value: unknown,
  label: string,
): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Google Ads campaign settings ${label} is invalid.`);
  }
  return value;
};

const requireRows = (
  rows: Record<string, unknown>[],
  label: string,
): Record<string, unknown>[] => {
  if (!Array.isArray(rows)) {
    throw new Error(`Google Ads campaign settings ${label} are invalid.`);
  }
  return rows;
};

const normalizeAssetAutomationSettings = (
  value: unknown,
): GoogleAdsCampaignSettingsRow['asset_automation_settings'] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(
      'Google Ads campaign settings campaign.assetAutomationSettings is invalid.',
    );
  }

  return value.map((item, index) => {
    const setting = requireRecord(
      item,
      `campaign.assetAutomationSettings[${index}]`,
    );

    return {
      asset_automation_type: requireText(
        setting.assetAutomationType,
        `campaign.assetAutomationSettings[${index}].assetAutomationType`,
      ),
      asset_automation_status: requireText(
        setting.assetAutomationStatus,
        `campaign.assetAutomationSettings[${index}].assetAutomationStatus`,
      ),
    };
  });
};

export const normalizeCampaignSettingsRows = (
  rows: Record<string, unknown>[],
): GoogleAdsCampaignSettingsRow[] => (
  requireRows(rows, 'campaign rows').map((row) => {
    const campaign = requireRecord(row.campaign, 'campaign');

    const channelType = requireText(
      campaign.advertisingChannelType,
      'campaign.advertisingChannelType',
    );

    if (channelType !== 'SEARCH') {
      throw new Error(
        `Google Ads campaign settings campaign.advertisingChannelType is unsupported: ${channelType}.`,
      );
    }

    const manualCpc = optionalRecord(
      campaign.manualCpc,
      'campaign.manualCpc',
    );
    const targetSpend = optionalRecord(
      campaign.targetSpend,
      'campaign.targetSpend',
    );
    const maximizeConversions = optionalRecord(
      campaign.maximizeConversions,
      'campaign.maximizeConversions',
    );
    const maximizeConversionValue = optionalRecord(
      campaign.maximizeConversionValue,
      'campaign.maximizeConversionValue',
    );
    const targetCpa = optionalRecord(
      campaign.targetCpa,
      'campaign.targetCpa',
    );
    const targetRoas = optionalRecord(
      campaign.targetRoas,
      'campaign.targetRoas',
    );
    const targetImpressionShare = optionalRecord(
      campaign.targetImpressionShare,
      'campaign.targetImpressionShare',
    );
    const networkSettings = optionalRecord(
      campaign.networkSettings,
      'campaign.networkSettings',
    );
    const geoTargetTypeSetting = optionalRecord(
      campaign.geoTargetTypeSetting,
      'campaign.geoTargetTypeSetting',
    );
    const trackingSetting = optionalRecord(
      campaign.trackingSetting,
      'campaign.trackingSetting',
    );
    const aiMaxSetting = optionalRecord(
      campaign.aiMaxSetting,
      'campaign.aiMaxSetting',
    );

    return {
      campaign_resource_name: requireText(
        campaign.resourceName,
        'campaign.resourceName',
      ),
      campaign_id: requireText(campaign.id, 'campaign.id'),
      campaign_name: optionalText(campaign.name, 'campaign.name'),
      campaign_status: implicitEnum(
        campaign.status,
        'campaign.status',
      ),
      campaign_keyword_match_type: implicitEnum(
        campaign.keywordMatchType,
        'campaign.keywordMatchType',
      ),
      advertising_channel_type: channelType,
      advertising_channel_sub_type: implicitEnum(
        campaign.advertisingChannelSubType,
        'campaign.advertisingChannelSubType',
      ),
      start_date_time: optionalText(
        campaign.startDateTime,
        'campaign.startDateTime',
      ),
      end_date_time: optionalText(
        campaign.endDateTime,
        'campaign.endDateTime',
      ),
      campaign_budget_resource_name: optionalText(
        campaign.campaignBudget,
        'campaign.campaignBudget',
      ),
      bidding_strategy_type: implicitEnum(
        campaign.biddingStrategyType,
        'campaign.biddingStrategyType',
      ),
      bidding_strategy_resource_name: optionalText(
        campaign.biddingStrategy,
        'campaign.biddingStrategy',
      ),
      manual_cpc_enhanced_cpc_enabled: manualCpc === null
        ? null
        : optionalBoolean(
          manualCpc.enhancedCpcEnabled,
          'campaign.manualCpc.enhancedCpcEnabled',
        ),
      target_spend_cpc_bid_ceiling_micros: targetSpend === null
        ? null
        : optionalText(
          targetSpend.cpcBidCeilingMicros,
          'campaign.targetSpend.cpcBidCeilingMicros',
        ),
      target_spend_target_spend_micros: targetSpend === null
        ? null
        : optionalText(
          targetSpend.targetSpendMicros,
          'campaign.targetSpend.targetSpendMicros',
        ),
      maximize_conversions_target_cpa_micros: maximizeConversions === null
        ? null
        : implicitInt64Text(
          maximizeConversions.targetCpaMicros,
          'campaign.maximizeConversions.targetCpaMicros',
        ),
      maximize_conversion_value_target_roas: maximizeConversionValue === null
        ? null
        : implicitNumber(
          maximizeConversionValue.targetRoas,
          'campaign.maximizeConversionValue.targetRoas',
        ),
      target_cpa_target_cpa_micros: targetCpa === null
        ? null
        : optionalText(
          targetCpa.targetCpaMicros,
          'campaign.targetCpa.targetCpaMicros',
        ),
      target_roas_target_roas: targetRoas === null
        ? null
        : optionalNumber(
          targetRoas.targetRoas,
          'campaign.targetRoas.targetRoas',
        ),
      target_impression_share_location: targetImpressionShare === null
        ? null
        : implicitEnum(
          targetImpressionShare.location,
          'campaign.targetImpressionShare.location',
        ),
      target_impression_share_location_fraction_micros:
        targetImpressionShare === null
          ? null
          : optionalText(
            targetImpressionShare.locationFractionMicros,
            'campaign.targetImpressionShare.locationFractionMicros',
          ),
      target_impression_share_cpc_bid_ceiling_micros:
        targetImpressionShare === null
          ? null
          : optionalText(
            targetImpressionShare.cpcBidCeilingMicros,
            'campaign.targetImpressionShare.cpcBidCeilingMicros',
          ),
      target_google_search: networkSettings === null
        ? null
        : optionalBoolean(
          networkSettings.targetGoogleSearch,
          'campaign.networkSettings.targetGoogleSearch',
        ),
      target_search_network: networkSettings === null
        ? null
        : optionalBoolean(
          networkSettings.targetSearchNetwork,
          'campaign.networkSettings.targetSearchNetwork',
        ),
      target_content_network: networkSettings === null
        ? null
        : optionalBoolean(
          networkSettings.targetContentNetwork,
          'campaign.networkSettings.targetContentNetwork',
        ),
      target_partner_search_network: networkSettings === null
        ? null
        : optionalBoolean(
          networkSettings.targetPartnerSearchNetwork,
          'campaign.networkSettings.targetPartnerSearchNetwork',
        ),
      positive_geo_target_type: implicitEnum(
        geoTargetTypeSetting?.positiveGeoTargetType,
        'campaign.geoTargetTypeSetting.positiveGeoTargetType',
      ),
      negative_geo_target_type: implicitEnum(
        geoTargetTypeSetting?.negativeGeoTargetType,
        'campaign.geoTargetTypeSetting.negativeGeoTargetType',
      ),
      tracking_url: trackingSetting === null
        ? null
        : optionalText(
          trackingSetting.trackingUrl,
          'campaign.trackingSetting.trackingUrl',
        ),
      tracking_url_template: optionalText(
        campaign.trackingUrlTemplate,
        'campaign.trackingUrlTemplate',
      ),
      final_url_suffix: optionalText(
        campaign.finalUrlSuffix,
        'campaign.finalUrlSuffix',
      ),
      ai_max_enable_ai_max: aiMaxSetting === null
        ? null
        : optionalBoolean(
          aiMaxSetting.enableAiMax,
          'campaign.aiMaxSetting.enableAiMax',
        ),
      ai_max_bundling_required: aiMaxSetting === null
        ? null
        : optionalText(
          aiMaxSetting.bundlingRequired,
          'campaign.aiMaxSetting.bundlingRequired',
        ),
      asset_automation_settings: normalizeAssetAutomationSettings(
        campaign.assetAutomationSettings,
      ),
    };
  })
);

export const normalizeCampaignBudgetRows = (
  rows: Record<string, unknown>[],
): GoogleAdsConfigurationNormalizedRow[] => (
  requireRows(rows, 'campaign budget rows').map((row) => {
    const budget = requireRecord(row.campaignBudget, 'campaignBudget');

    return {
      campaign_budget_resource_name: requireText(
        budget.resourceName,
        'campaignBudget.resourceName',
      ),
      campaign_budget_id: requireText(
        budget.id,
        'campaignBudget.id',
      ),
      campaign_budget_name: optionalText(
        budget.name,
        'campaignBudget.name',
      ),
      campaign_budget_status: implicitEnum(
        budget.status,
        'campaignBudget.status',
      ),
      amount_micros: optionalText(
        budget.amountMicros,
        'campaignBudget.amountMicros',
      ),
      delivery_method: implicitEnum(
        budget.deliveryMethod,
        'campaignBudget.deliveryMethod',
      ),
      explicitly_shared: optionalBoolean(
        budget.explicitlyShared,
        'campaignBudget.explicitlyShared',
      ),
      reference_count: optionalText(
        budget.referenceCount,
        'campaignBudget.referenceCount',
      ),
      total_amount_micros: optionalText(
        budget.totalAmountMicros,
        'campaignBudget.totalAmountMicros',
      ),
      period: implicitEnum(
        budget.period,
        'campaignBudget.period',
      ),
      type: implicitEnum(
        budget.type,
        'campaignBudget.type',
      ),
    };
  })
);

export interface GoogleAdsCampaignTargetingSearchStreamEvidencePart {
  kind: 'CAMPAIGN_CRITERIA_SEARCH_STREAM';
  raw_body_base64: string;
}

export interface GoogleAdsCampaignTargetingGeoSuggestionEvidencePart {
  kind: 'GEO_TARGET_CONSTANT_SUGGESTIONS';
  requested_resource_names: string[];
  raw_body_base64: string;
}

export interface GoogleAdsCampaignTargetingEvidenceBundleV1 {
  bundle_schema_version: 1;
  parts: Array<
    | GoogleAdsCampaignTargetingSearchStreamEvidencePart
    | GoogleAdsCampaignTargetingGeoSuggestionEvidencePart
  >;
}

export interface GoogleAdsCampaignTargetingEvidenceBundleInput {
  search_stream_raw_bytes: Uint8Array;
  geo_target_suggestions?: {
    requested_resource_names: readonly string[];
    raw_bytes: Uint8Array;
  };
}

const requireBase64Text = (
  value: unknown,
  label: string,
): string => {
  const encoded = requireText(value, label);

  if (
    encoded.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)
  ) {
    throw new Error(
      `Google Ads campaign targeting evidence ${label} is not valid base64.`,
    );
  }

  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.toString('base64') !== encoded) {
    throw new Error(
      `Google Ads campaign targeting evidence ${label} is not canonical base64.`,
    );
  }

  return encoded;
};

export const extractGoogleAdsCampaignTargetingGeoResourceNames = (
  body: unknown,
): string[] => {
  if (!Array.isArray(body)) {
    throw new Error(
      'Google Ads campaign targeting SearchStream body must be an array.',
    );
  }

  const resourceNames: string[] = [];

  for (const [chunkIndex, chunkValue] of body.entries()) {
    const chunk = requireRecord(
      chunkValue,
      `SearchStream[${chunkIndex}]`,
    );

    if (chunk.results === undefined) continue;

    if (!Array.isArray(chunk.results)) {
      throw new Error(
        `Google Ads campaign targeting SearchStream[${chunkIndex}].results is invalid.`,
      );
    }

    for (const [rowIndex, rowValue] of chunk.results.entries()) {
      const row = requireRecord(
        rowValue,
        `SearchStream[${chunkIndex}].results[${rowIndex}]`,
      );
      const criterion = requireRecord(
        row.campaignCriterion,
        `SearchStream[${chunkIndex}].results[${rowIndex}].campaignCriterion`,
      );

      if (criterion.type !== 'LOCATION') continue;

      const location = requireRecord(
        criterion.location,
        `SearchStream[${chunkIndex}].results[${rowIndex}].campaignCriterion.location`,
      );

      resourceNames.push(
        requireText(
          location.geoTargetConstant,
          `SearchStream[${chunkIndex}].results[${rowIndex}].campaignCriterion.location.geoTargetConstant`,
        ),
      );
    }
  }

  return resourceNames;
};

export const buildGoogleAdsCampaignTargetingEvidenceBundleBytes = (
  input: GoogleAdsCampaignTargetingEvidenceBundleInput,
): Uint8Array => {
  const parts: GoogleAdsCampaignTargetingEvidenceBundleV1['parts'] = [
    {
      kind: 'CAMPAIGN_CRITERIA_SEARCH_STREAM',
      raw_body_base64: Buffer.from(
        input.search_stream_raw_bytes,
      ).toString('base64'),
    },
  ];

  if (input.geo_target_suggestions !== undefined) {
    if (input.geo_target_suggestions.requested_resource_names.length === 0) {
      throw new Error(
        'Google Ads campaign targeting geo suggestion evidence requires resource names.',
      );
    }

    parts.push({
      kind: 'GEO_TARGET_CONSTANT_SUGGESTIONS',
      requested_resource_names: [
        ...input.geo_target_suggestions.requested_resource_names,
      ],
      raw_body_base64: Buffer.from(
        input.geo_target_suggestions.raw_bytes,
      ).toString('base64'),
    });
  }

  return new TextEncoder().encode(JSON.stringify({
    bundle_schema_version: 1,
    parts,
  } satisfies GoogleAdsCampaignTargetingEvidenceBundleV1));
};

export const parseGoogleAdsCampaignTargetingEvidenceBundle = (
  value: unknown,
): GoogleAdsCampaignTargetingEvidenceBundleV1 => {
  const bundle = requireRecord(value, 'targeting evidence bundle');

  if (bundle.bundle_schema_version !== 1) {
    throw new Error(
      'Google Ads campaign targeting evidence bundle schema version is invalid.',
    );
  }

  if (!Array.isArray(bundle.parts) || bundle.parts.length < 1) {
    throw new Error(
      'Google Ads campaign targeting evidence bundle parts are required.',
    );
  }

  const parsedParts: GoogleAdsCampaignTargetingEvidenceBundleV1['parts'] = [];

  for (const [index, partValue] of bundle.parts.entries()) {
    const part = requireRecord(
      partValue,
      `targeting evidence bundle parts[${index}]`,
    );
    const kind = requireText(
      part.kind,
      `targeting evidence bundle parts[${index}].kind`,
    );

    if (kind === 'CAMPAIGN_CRITERIA_SEARCH_STREAM') {
      parsedParts.push({
        kind,
        raw_body_base64: requireBase64Text(
          part.raw_body_base64,
          `parts[${index}].raw_body_base64`,
        ),
      });
      continue;
    }

    if (kind === 'GEO_TARGET_CONSTANT_SUGGESTIONS') {
      if (
        !Array.isArray(part.requested_resource_names)
        || part.requested_resource_names.length === 0
      ) {
        throw new Error(
          'Google Ads campaign targeting geo suggestion requested resource names are required.',
        );
      }

      const requestedResourceNames =
        part.requested_resource_names.map((resourceName, resourceIndex) => (
          requireText(
            resourceName,
            `parts[${index}].requested_resource_names[${resourceIndex}]`,
          )
        ));

      parsedParts.push({
        kind,
        requested_resource_names: requestedResourceNames,
        raw_body_base64: requireBase64Text(
          part.raw_body_base64,
          `parts[${index}].raw_body_base64`,
        ),
      });
      continue;
    }

    throw new Error(
      `Google Ads campaign targeting evidence part kind is unsupported: ${kind}.`,
    );
  }

  if (
    parsedParts[0]?.kind !== 'CAMPAIGN_CRITERIA_SEARCH_STREAM'
    || parsedParts.filter(
      (part) => part.kind === 'CAMPAIGN_CRITERIA_SEARCH_STREAM',
    ).length !== 1
    || parsedParts.filter(
      (part) => part.kind === 'GEO_TARGET_CONSTANT_SUGGESTIONS',
    ).length > 1
  ) {
    throw new Error(
      'Google Ads campaign targeting evidence bundle part structure is invalid.',
    );
  }

  return {
    bundle_schema_version: 1,
    parts: parsedParts,
  };
};

export interface GoogleAdsGeoTargetConstantEvidence {
  resource_name: string;
  id: string;
  name: string;
  canonical_name: string;
  country_code: string;
  target_type: string;
  status: string;
}

export interface GoogleAdsCampaignSettingsNormalizationOptions {
  geo_target_constants?: ReadonlyMap<
    string,
    GoogleAdsGeoTargetConstantEvidence
  >;
}

type NullableTargetingFields = Omit<
  GoogleAdsCampaignTargetingCriterionRow,
  | 'criterion_resource_name'
  | 'campaign_resource_name'
  | 'campaign_id'
  | 'campaign_name'
  | 'campaign_status'
  | 'criterion_id'
  | 'criterion_type'
  | 'negative'
  | 'criterion_status'
>;

const nullableTargetingFields = (): NullableTargetingFields => ({
  location_geo_target_constant_resource_name: null,
  location_geo_target_constant_id: null,
  location_geo_target_constant_name: null,
  location_geo_target_constant_canonical_name: null,
  location_geo_target_constant_country_code: null,
  location_geo_target_constant_target_type: null,
  location_geo_target_constant_status: null,
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

export const normalizeCampaignTargetingCriterionRows = (
  rows: Record<string, unknown>[],
  options: GoogleAdsCampaignSettingsNormalizationOptions = {},
): GoogleAdsConfigurationNormalizedRow[] => (
  requireRows(rows, 'campaign targeting rows').map((row) => {
    const campaign = requireRecord(row.campaign, 'campaign');
    const criterion = requireRecord(
      row.campaignCriterion,
      'campaignCriterion',
    );

    const campaignChannelType = requireText(
      campaign.advertisingChannelType,
      'campaign.advertisingChannelType',
    );

    if (campaignChannelType !== 'SEARCH') {
      throw new Error(
        `Google Ads campaign targeting campaign.advertisingChannelType is unsupported: ${campaignChannelType}.`,
      );
    }

    const criterionType = requireText(
      criterion.type,
      'campaignCriterion.type',
    );

    if (
      criterionType !== 'LOCATION'
      && criterionType !== 'LANGUAGE'
      && criterionType !== 'DEVICE'
      && criterionType !== 'AD_SCHEDULE'
    ) {
      throw new Error(
        `Google Ads campaign targeting criterion type is unsupported: ${criterionType}.`,
      );
    }

    const base = {
      criterion_resource_name: requireText(
        criterion.resourceName,
        'campaignCriterion.resourceName',
      ),
      campaign_resource_name: requireText(
        criterion.campaign ?? campaign.resourceName,
        'campaignCriterion.campaign',
      ),
      campaign_id: requireText(
        campaign.id,
        'campaign.id',
      ),
      campaign_name: optionalText(
        campaign.name,
        'campaign.name',
      ),
      campaign_status: implicitEnum(
        campaign.status,
        'campaign.status',
      ),
      criterion_id: requireText(
        criterion.criterionId,
        'campaignCriterion.criterionId',
      ),
      criterion_type: criterionType,
      negative: optionalBoolean(
        criterion.negative,
        'campaignCriterion.negative',
      ),
      criterion_status: implicitEnum(
        criterion.status,
        'campaignCriterion.status',
      ),
      ...nullableTargetingFields(),
    };

    if (criterionType === 'LOCATION') {
      const location = requireRecord(
        criterion.location,
        'campaignCriterion.location',
      );
      const resourceName = requireText(
        location.geoTargetConstant,
        'campaignCriterion.location.geoTargetConstant',
      );
      const resolved = options.geo_target_constants?.get(resourceName);

      if (!resolved) {
        throw new Error(
          `Google Ads campaign targeting geo target resolver evidence is missing for ${resourceName}.`,
        );
      }

      return {
        ...base,
        location_geo_target_constant_resource_name: resourceName,
        location_geo_target_constant_id: requireText(
          resolved.id,
          'geoTargetConstant.id',
        ),
        location_geo_target_constant_name: requireText(
          resolved.name,
          'geoTargetConstant.name',
        ),
        location_geo_target_constant_canonical_name: requireText(
          resolved.canonical_name,
          'geoTargetConstant.canonical_name',
        ),
        location_geo_target_constant_country_code: requireText(
          resolved.country_code,
          'geoTargetConstant.country_code',
        ),
        location_geo_target_constant_target_type: requireText(
          resolved.target_type,
          'geoTargetConstant.target_type',
        ),
        location_geo_target_constant_status: requireText(
          resolved.status,
          'geoTargetConstant.status',
        ),
      };
    }

    if (criterionType === 'LANGUAGE') {
      const language = requireRecord(
        criterion.language,
        'campaignCriterion.language',
      );
      const languageConstant = requireRecord(
        row.languageConstant,
        'languageConstant',
      );
      const criterionResourceName = requireText(
        language.languageConstant,
        'campaignCriterion.language.languageConstant',
      );
      const attributedResourceName = requireText(
        languageConstant.resourceName,
        'languageConstant.resourceName',
      );

      if (criterionResourceName !== attributedResourceName) {
        throw new Error(
          'Google Ads campaign targeting language constant identity does not match criterion evidence.',
        );
      }

      return {
        ...base,
        language_constant_resource_name: attributedResourceName,
        language_constant_id: requireText(
          languageConstant.id,
          'languageConstant.id',
        ),
        language_constant_code: requireText(
          languageConstant.code,
          'languageConstant.code',
        ),
        language_constant_name: requireText(
          languageConstant.name,
          'languageConstant.name',
        ),
        language_constant_targetable: implicitBoolean(
          languageConstant.targetable,
          'languageConstant.targetable',
        ),
      };
    }

    if (criterionType === 'DEVICE') {
      const device = requireRecord(
        criterion.device,
        'campaignCriterion.device',
      );

      return {
        ...base,
        device_type: implicitEnum(
          device.type,
          'campaignCriterion.device.type',
        ),
      };
    }

    const adSchedule = requireRecord(
      criterion.adSchedule,
      'campaignCriterion.adSchedule',
    );

    return {
      ...base,
      ad_schedule_day_of_week: requireText(
        adSchedule.dayOfWeek,
        'campaignCriterion.adSchedule.dayOfWeek',
      ),
      ad_schedule_start_hour: implicitNumber(
        adSchedule.startHour,
        'campaignCriterion.adSchedule.startHour',
      ),
      ad_schedule_start_minute: implicitEnum(
        adSchedule.startMinute,
        'campaignCriterion.adSchedule.startMinute',
      ),
      ad_schedule_end_hour: implicitNumber(
        adSchedule.endHour,
        'campaignCriterion.adSchedule.endHour',
      ),
      ad_schedule_end_minute: implicitEnum(
        adSchedule.endMinute,
        'campaignCriterion.adSchedule.endMinute',
      ),
    };
  })
);

export const normalizeGoogleAdsCampaignSettingsRows = (
  datasetType: GoogleAdsCampaignSettingsDatasetType,
  rows: Record<string, unknown>[],
  options: GoogleAdsCampaignSettingsNormalizationOptions = {},
): GoogleAdsConfigurationNormalizedRow[] => {
  if (datasetType === 'CAMPAIGN_SETTINGS') {
    return normalizeCampaignSettingsRows(rows);
  }

  if (datasetType === 'CAMPAIGN_BUDGETS') {
    return normalizeCampaignBudgetRows(rows);
  }

  if (datasetType === 'CAMPAIGN_TARGETING_CRITERIA') {
    return normalizeCampaignTargetingCriterionRows(rows, options);
  }

  throw new Error(
    `Unsupported Google Ads campaign settings dataset: ${String(datasetType)}.`,
  );
};
