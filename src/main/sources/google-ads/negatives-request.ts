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

const CAMPAIGN_NEGATIVE_KEYWORD_FIELDS = [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'campaign_criterion.resource_name',
  'campaign_criterion.criterion_id',
  'campaign_criterion.status',
  'campaign_criterion.type',
  'campaign_criterion.negative',
  'campaign_criterion.keyword.text',
  'campaign_criterion.keyword.match_type',
] as const;

export const buildCampaignNegativeKeywordsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(
    context,
    'CAMPAIGN_NEGATIVE_KEYWORDS',
    'CAMPAIGN_CRITERION',
  );

  return [
    `SELECT ${CAMPAIGN_NEGATIVE_KEYWORD_FIELDS.join(', ')}`,
    'FROM campaign_criterion',
    "WHERE campaign.advertising_channel_type = 'SEARCH'",
    "AND campaign_criterion.type = 'KEYWORD'",
    'AND campaign_criterion.negative = TRUE',
  ].join(' ');
};

const AD_GROUP_NEGATIVE_KEYWORD_FIELDS = [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'ad_group_criterion.resource_name',
  'ad_group_criterion.criterion_id',
  'ad_group_criterion.status',
  'ad_group_criterion.type',
  'ad_group_criterion.negative',
  'ad_group_criterion.keyword.text',
  'ad_group_criterion.keyword.match_type',
] as const;

export const buildAdGroupNegativeKeywordsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(
    context,
    'AD_GROUP_NEGATIVE_KEYWORDS',
    'AD_GROUP_CRITERION',
  );

  return [
    `SELECT ${AD_GROUP_NEGATIVE_KEYWORD_FIELDS.join(', ')}`,
    'FROM ad_group_criterion',
    "WHERE campaign.advertising_channel_type = 'SEARCH'",
    "AND ad_group_criterion.type = 'KEYWORD'",
    'AND ad_group_criterion.negative = TRUE',
  ].join(' ');
};

const SHARED_NEGATIVE_KEYWORD_FIELDS = [
  'shared_set.resource_name',
  'shared_set.id',
  'shared_set.name',
  'shared_set.status',
  'shared_set.type',
  'shared_criterion.resource_name',
  'shared_criterion.criterion_id',
  'shared_criterion.type',
  'shared_criterion.negative',
  'shared_criterion.keyword.text',
  'shared_criterion.keyword.match_type',
] as const;

export const buildSharedNegativeKeywordsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(
    context,
    'SHARED_NEGATIVE_KEYWORDS',
    'SHARED_CRITERION',
  );

  return [
    `SELECT ${SHARED_NEGATIVE_KEYWORD_FIELDS.join(', ')}`,
    'FROM shared_criterion',
    "WHERE shared_criterion.type = 'KEYWORD'",
    'AND shared_criterion.negative = TRUE',
    "AND shared_set.type IN ('NEGATIVE_KEYWORDS', 'ACCOUNT_LEVEL_NEGATIVE_KEYWORDS')",
  ].join(' ');
};

const CAMPAIGN_NEGATIVE_KEYWORD_LIST_FIELDS = [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'campaign_shared_set.resource_name',
  'campaign_shared_set.status',
  'shared_set.resource_name',
  'shared_set.id',
  'shared_set.name',
  'shared_set.status',
  'shared_set.type',
] as const;

export const buildCampaignNegativeKeywordListsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(
    context,
    'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
    'CAMPAIGN_SHARED_SET',
  );

  return [
    `SELECT ${CAMPAIGN_NEGATIVE_KEYWORD_LIST_FIELDS.join(', ')}`,
    'FROM campaign_shared_set',
    "WHERE campaign.advertising_channel_type = 'SEARCH'",
    "AND shared_set.type = 'NEGATIVE_KEYWORDS'",
  ].join(' ');
};

const ACCOUNT_NEGATIVE_KEYWORD_LIST_FIELDS = [
  'customer_negative_criterion.resource_name',
  'customer_negative_criterion.id',
  'customer_negative_criterion.type',
  'customer_negative_criterion.negative_keyword_list.shared_set',
  'shared_set.resource_name',
  'shared_set.id',
  'shared_set.name',
  'shared_set.status',
  'shared_set.type',
] as const;

export const buildAccountNegativeKeywordListsQuery = (
  context: GoogleAdsConfigurationJobContext,
): string => {
  assertDataset(
    context,
    'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
    'CUSTOMER_NEGATIVE_CRITERION',
  );

  return [
    `SELECT ${ACCOUNT_NEGATIVE_KEYWORD_LIST_FIELDS.join(', ')}`,
    'FROM customer_negative_criterion',
    "WHERE customer_negative_criterion.type = 'NEGATIVE_KEYWORD_LIST'",
  ].join(' ');
};
