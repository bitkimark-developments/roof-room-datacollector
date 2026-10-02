import type {
  GoogleAdsAccountNegativeKeywordListRow,
  GoogleAdsAdGroupNegativeKeywordRow,
  GoogleAdsCampaignNegativeKeywordListRow,
  GoogleAdsCampaignNegativeKeywordRow,
  GoogleAdsConfigurationDatasetType,
  GoogleAdsConfigurationNormalizedRow,
  GoogleAdsSharedNegativeKeywordRow,
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
    throw new Error(`Google Ads configuration ${field} must be an object.`);
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

const requireText = (
  value: unknown,
  field: string,
): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Google Ads configuration ${field} must be a non-empty string.`);
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
    throw new Error(`Google Ads configuration ${field} must be a boolean.`);
  }
  return value;
};

const requireRows = (
  value: Record<string, unknown>[],
  label: string,
): ProviderRecord[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Google Ads configuration ${label} must be an array.`);
  }
  return value.map((candidate, index) => (
    requireRecord(candidate, `${label}[${String(index)}]`)
  ));
};

const requireExactText = (
  value: unknown,
  field: string,
  expected: string,
): string => {
  const actual = requireText(value, field);
  if (actual !== expected) {
    throw new Error(
      `Google Ads configuration ${field} must be ${expected}; received ${actual}.`,
    );
  }
  return actual;
};

const requireNegative = (
  value: unknown,
  field: string,
): true => {
  const actual = requireBoolean(value, field);
  if (actual !== true) {
    throw new Error(`Google Ads configuration ${field} must be true.`);
  }
  return true;
};

const requireSearchCampaign = (
  campaign: ProviderRecord,
): string => (
  requireExactText(
    campaign.advertisingChannelType,
    'campaign.advertisingChannelType',
    'SEARCH',
  )
);

export const normalizeCampaignNegativeKeywordRows = (
  rows: Record<string, unknown>[],
): GoogleAdsCampaignNegativeKeywordRow[] => (
  requireRows(rows, 'campaign negative keyword rows').map((row) => {
    const campaign = requireRecord(row.campaign, 'campaign');
    const criterion = requireRecord(
      row.campaignCriterion,
      'campaignCriterion',
    );
    const keyword = requireRecord(
      criterion.keyword,
      'campaignCriterion.keyword',
    );

    return {
      campaign_id: requireText(campaign.id, 'campaign.id'),
      campaign_name: optionalText(campaign.name, 'campaign.name'),
      campaign_advertising_channel_type: requireSearchCampaign(campaign),
      campaign_criterion_resource_name: requireText(
        criterion.resourceName,
        'campaignCriterion.resourceName',
      ),
      campaign_criterion_id: requireText(
        criterion.criterionId,
        'campaignCriterion.criterionId',
      ),
      campaign_criterion_status: optionalText(
        criterion.status,
        'campaignCriterion.status',
      ),
      campaign_criterion_type: requireExactText(
        criterion.type,
        'campaignCriterion.type',
        'KEYWORD',
      ),
      campaign_criterion_negative: requireNegative(
        criterion.negative,
        'campaignCriterion.negative',
      ),
      keyword_text: requireText(
        keyword.text,
        'campaignCriterion.keyword.text',
      ),
      keyword_match_type: requireText(
        keyword.matchType,
        'campaignCriterion.keyword.matchType',
      ),
    };
  })
);

export const normalizeAdGroupNegativeKeywordRows = (
  rows: Record<string, unknown>[],
): GoogleAdsAdGroupNegativeKeywordRow[] => (
  requireRows(rows, 'ad group negative keyword rows').map((row) => {
    const campaign = requireRecord(row.campaign, 'campaign');
    const adGroup = requireRecord(row.adGroup, 'adGroup');
    const criterion = requireRecord(
      row.adGroupCriterion,
      'adGroupCriterion',
    );
    const keyword = requireRecord(
      criterion.keyword,
      'adGroupCriterion.keyword',
    );

    return {
      campaign_id: requireText(campaign.id, 'campaign.id'),
      campaign_name: optionalText(campaign.name, 'campaign.name'),
      campaign_advertising_channel_type: requireSearchCampaign(campaign),
      ad_group_id: requireText(adGroup.id, 'adGroup.id'),
      ad_group_name: optionalText(adGroup.name, 'adGroup.name'),
      ad_group_criterion_resource_name: requireText(
        criterion.resourceName,
        'adGroupCriterion.resourceName',
      ),
      ad_group_criterion_id: requireText(
        criterion.criterionId,
        'adGroupCriterion.criterionId',
      ),
      ad_group_criterion_status: optionalText(
        criterion.status,
        'adGroupCriterion.status',
      ),
      ad_group_criterion_type: requireExactText(
        criterion.type,
        'adGroupCriterion.type',
        'KEYWORD',
      ),
      ad_group_criterion_negative: requireNegative(
        criterion.negative,
        'adGroupCriterion.negative',
      ),
      keyword_text: requireText(
        keyword.text,
        'adGroupCriterion.keyword.text',
      ),
      keyword_match_type: requireText(
        keyword.matchType,
        'adGroupCriterion.keyword.matchType',
      ),
    };
  })
);

export const normalizeSharedNegativeKeywordRows = (
  rows: Record<string, unknown>[],
): GoogleAdsSharedNegativeKeywordRow[] => (
  requireRows(rows, 'shared negative keyword rows').map((row) => {
    const sharedSet = requireRecord(row.sharedSet, 'sharedSet');
    const criterion = requireRecord(
      row.sharedCriterion,
      'sharedCriterion',
    );
    const keyword = requireRecord(
      criterion.keyword,
      'sharedCriterion.keyword',
    );

    const sharedSetType = requireText(
      sharedSet.type,
      'sharedSet.type',
    );

    if (
      sharedSetType !== 'NEGATIVE_KEYWORDS'
      && sharedSetType !== 'ACCOUNT_LEVEL_NEGATIVE_KEYWORDS'
    ) {
      throw new Error(
        `Google Ads configuration sharedSet.type is unsupported: ${sharedSetType}.`,
      );
    }

    return {
      shared_set_resource_name: requireText(
        sharedSet.resourceName,
        'sharedSet.resourceName',
      ),
      shared_set_id: requireText(sharedSet.id, 'sharedSet.id'),
      shared_set_name: optionalText(sharedSet.name, 'sharedSet.name'),
      shared_set_status: optionalText(sharedSet.status, 'sharedSet.status'),
      shared_set_type: sharedSetType,
      shared_criterion_resource_name: requireText(
        criterion.resourceName,
        'sharedCriterion.resourceName',
      ),
      shared_criterion_id: requireText(
        criterion.criterionId,
        'sharedCriterion.criterionId',
      ),
      shared_criterion_type: requireExactText(
        criterion.type,
        'sharedCriterion.type',
        'KEYWORD',
      ),
      shared_criterion_negative: requireNegative(
        criterion.negative,
        'sharedCriterion.negative',
      ),
      keyword_text: requireText(
        keyword.text,
        'sharedCriterion.keyword.text',
      ),
      keyword_match_type: requireText(
        keyword.matchType,
        'sharedCriterion.keyword.matchType',
      ),
    };
  })
);

export const normalizeCampaignNegativeKeywordListRows = (
  rows: Record<string, unknown>[],
): GoogleAdsCampaignNegativeKeywordListRow[] => (
  requireRows(rows, 'campaign negative keyword list rows').map((row) => {
    const campaign = requireRecord(row.campaign, 'campaign');
    const campaignSharedSet = requireRecord(
      row.campaignSharedSet,
      'campaignSharedSet',
    );
    const sharedSet = requireRecord(row.sharedSet, 'sharedSet');

    return {
      campaign_id: requireText(campaign.id, 'campaign.id'),
      campaign_name: optionalText(campaign.name, 'campaign.name'),
      campaign_advertising_channel_type: requireSearchCampaign(campaign),
      campaign_shared_set_resource_name: requireText(
        campaignSharedSet.resourceName,
        'campaignSharedSet.resourceName',
      ),
      campaign_shared_set_status: optionalText(
        campaignSharedSet.status,
        'campaignSharedSet.status',
      ),
      shared_set_resource_name: requireText(
        sharedSet.resourceName,
        'sharedSet.resourceName',
      ),
      shared_set_id: requireText(sharedSet.id, 'sharedSet.id'),
      shared_set_name: optionalText(sharedSet.name, 'sharedSet.name'),
      shared_set_status: optionalText(sharedSet.status, 'sharedSet.status'),
      shared_set_type: requireExactText(
        sharedSet.type,
        'sharedSet.type',
        'NEGATIVE_KEYWORDS',
      ),
    };
  })
);

export const normalizeAccountNegativeKeywordListRows = (
  rows: Record<string, unknown>[],
): GoogleAdsAccountNegativeKeywordListRow[] => (
  requireRows(rows, 'account negative keyword list rows').map((row) => {
    const criterion = requireRecord(
      row.customerNegativeCriterion,
      'customerNegativeCriterion',
    );
    const negativeKeywordList = requireRecord(
      criterion.negativeKeywordList,
      'customerNegativeCriterion.negativeKeywordList',
    );
    const sharedSet = optionalRecord(row.sharedSet, 'sharedSet');

    return {
      customer_negative_criterion_resource_name: requireText(
        criterion.resourceName,
        'customerNegativeCriterion.resourceName',
      ),
      customer_negative_criterion_id: requireText(
        criterion.id,
        'customerNegativeCriterion.id',
      ),
      customer_negative_criterion_type: requireExactText(
        criterion.type,
        'customerNegativeCriterion.type',
        'NEGATIVE_KEYWORD_LIST',
      ),
      negative_keyword_list_shared_set: requireText(
        negativeKeywordList.sharedSet,
        'customerNegativeCriterion.negativeKeywordList.sharedSet',
      ),
      shared_set_resource_name: sharedSet === null
        ? null
        : requireText(sharedSet.resourceName, 'sharedSet.resourceName'),
      shared_set_id: sharedSet === null
        ? null
        : requireText(sharedSet.id, 'sharedSet.id'),
      shared_set_name: sharedSet === null
        ? null
        : optionalText(sharedSet.name, 'sharedSet.name'),
      shared_set_status: sharedSet === null
        ? null
        : optionalText(sharedSet.status, 'sharedSet.status'),
      shared_set_type: sharedSet === null
        ? null
        : requireText(sharedSet.type, 'sharedSet.type'),
    };
  })
);

export const normalizeGoogleAdsConfigurationRows = (
  datasetType: GoogleAdsConfigurationDatasetType,
  rows: Record<string, unknown>[],
): GoogleAdsConfigurationNormalizedRow[] => {
  switch (datasetType) {
    case 'CAMPAIGN_NEGATIVE_KEYWORDS':
      return normalizeCampaignNegativeKeywordRows(rows);
    case 'AD_GROUP_NEGATIVE_KEYWORDS':
      return normalizeAdGroupNegativeKeywordRows(rows);
    case 'SHARED_NEGATIVE_KEYWORDS':
      return normalizeSharedNegativeKeywordRows(rows);
    case 'CAMPAIGN_NEGATIVE_KEYWORD_LISTS':
      return normalizeCampaignNegativeKeywordListRows(rows);
    case 'ACCOUNT_NEGATIVE_KEYWORD_LISTS':
      return normalizeAccountNegativeKeywordListRows(rows);
    default:
      throw new Error(
        `Unsupported Google Ads configuration dataset: ${String(datasetType)}.`,
      );
  }
};
