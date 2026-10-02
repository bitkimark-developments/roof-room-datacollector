const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const configuration = require(path.join(
  buildRoot,
  'shared/google-ads-configuration.js',
));
const googleApi = require(path.join(
  buildRoot,
  'shared/google-api.js',
));
const request = require(path.join(
  buildRoot,
  'main/sources/google-ads/configuration-request.js',
));
const negatives = require(path.join(
  buildRoot,
  'main/sources/google-ads/negatives-request.js',
));

const DATASET_TYPES = [
  'CAMPAIGN_NEGATIVE_KEYWORDS',
  'AD_GROUP_NEGATIVE_KEYWORDS',
  'SHARED_NEGATIVE_KEYWORDS',
  'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
  'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
];

const RESOURCE_MODES = {
  CAMPAIGN_NEGATIVE_KEYWORDS: 'CAMPAIGN_CRITERION',
  AD_GROUP_NEGATIVE_KEYWORDS: 'AD_GROUP_CRITERION',
  SHARED_NEGATIVE_KEYWORDS: 'SHARED_CRITERION',
  CAMPAIGN_NEGATIVE_KEYWORD_LISTS: 'CAMPAIGN_SHARED_SET',
  ACCOUNT_NEGATIVE_KEYWORD_LISTS: 'CUSTOMER_NEGATIVE_CRITERION',
};

assert.equal(
  configuration.GOOGLE_ADS_CONFIGURATION_SOURCE_ID,
  'google-ads-configuration',
);
assert.deepEqual(
  configuration.GOOGLE_ADS_NEGATIVES_DATASET_TYPES,
  DATASET_TYPES,
);
assert.equal(
  new Set(configuration.GOOGLE_ADS_NEGATIVES_DATASET_TYPES).size,
  5,
);
for (const datasetType of DATASET_TYPES) {
  assert.equal(
    configuration.GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET[datasetType],
    RESOURCE_MODES[datasetType],
  );
}
assert.equal(
  googleApi.GOOGLE_ADS_CONFIGURATION_SOURCE_ID,
  configuration.GOOGLE_ADS_CONFIGURATION_SOURCE_ID,
  'shared Google API barrel must expose the configuration source contract',
);

const contexts = Object.fromEntries(
  DATASET_TYPES.map((datasetType) => {
    const context = request.createGoogleAdsConfigurationJobContext({
      dataset_type: datasetType,
      customer_id: '1234567890',
    });

    assert.deepEqual(context, {
      source_id: 'google-ads-configuration',
      dataset_type: datasetType,
      resource_mode: RESOURCE_MODES[datasetType],
      customer_id: '1234567890',
      dataset_schema_version: 1,
    });
    assert.equal(Object.isFrozen(context), true);
    assert.equal('requested_date_start' in context, false);
    assert.equal('requested_date_end' in context, false);
    assert.equal('campaign_type' in context, false);

    return [datasetType, context];
  }),
);

const campaignContext =
  contexts.CAMPAIGN_NEGATIVE_KEYWORDS;

assert.deepEqual(
  request.requireGoogleAdsConfigurationJobContext(
    request.googleAdsConfigurationContextAsJson(campaignContext),
    '1234567890',
  ),
  campaignContext,
);

assert.throws(
  () => request.requireGoogleAdsConfigurationJobContext({
    ...campaignContext,
    dataset_schema_version: 2,
  }),
  /schema version/i,
);

assert.throws(
  () => request.requireGoogleAdsConfigurationJobContext({
    ...campaignContext,
    dataset_type: 'UNKNOWN_DATASET',
  }),
  /dataset type/i,
);

assert.throws(
  () => request.requireGoogleAdsConfigurationJobContext({
    ...campaignContext,
    resource_mode: 'AD_GROUP_CRITERION',
  }),
  /resource mode/i,
);

assert.throws(
  () => request.requireGoogleAdsConfigurationJobContext({
    ...campaignContext,
    customer_id: '',
  }),
  /customer ID/i,
);

assert.throws(
  () => request.requireGoogleAdsConfigurationJobContext(
    campaignContext,
    '9999999999',
  ),
  /does not match/i,
);

assert.throws(
  () => request.requireGoogleAdsConfigurationJobContext({
    ...campaignContext,
    requested_date_start: '2026-10-01',
  }),
  /unsupported fields/i,
);

const assertQuery = (
  query,
  expectedFragments,
) => {
  assert.equal(typeof query, 'string');
  assert.ok(query.trim().length > 0);

  for (const fragment of expectedFragments) {
    assert.ok(
      query.includes(fragment),
      `query must include: ${fragment}\n${query}`,
    );
  }

  assert.doesNotMatch(query, /segments\.date/u);
  assert.doesNotMatch(query, /\bBETWEEN\b/u);
};

assertQuery(
  negatives.buildCampaignNegativeKeywordsQuery(
    contexts.CAMPAIGN_NEGATIVE_KEYWORDS,
  ),
  [
    'FROM campaign_criterion',
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
    "campaign.advertising_channel_type = 'SEARCH'",
    "campaign_criterion.type = 'KEYWORD'",
    'campaign_criterion.negative = TRUE',
  ],
);

assertQuery(
  negatives.buildAdGroupNegativeKeywordsQuery(
    contexts.AD_GROUP_NEGATIVE_KEYWORDS,
  ),
  [
    'FROM ad_group_criterion',
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
    "campaign.advertising_channel_type = 'SEARCH'",
    "ad_group_criterion.type = 'KEYWORD'",
    'ad_group_criterion.negative = TRUE',
  ],
);

assertQuery(
  negatives.buildSharedNegativeKeywordsQuery(
    contexts.SHARED_NEGATIVE_KEYWORDS,
  ),
  [
    'FROM shared_criterion',
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
    "shared_criterion.type = 'KEYWORD'",
    'shared_criterion.negative = TRUE',
    "shared_set.type IN ('NEGATIVE_KEYWORDS', 'ACCOUNT_LEVEL_NEGATIVE_KEYWORDS')",
  ],
);

assertQuery(
  negatives.buildCampaignNegativeKeywordListsQuery(
    contexts.CAMPAIGN_NEGATIVE_KEYWORD_LISTS,
  ),
  [
    'FROM campaign_shared_set',
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
    "campaign.advertising_channel_type = 'SEARCH'",
    "shared_set.type = 'NEGATIVE_KEYWORDS'",
  ],
);

assertQuery(
  negatives.buildAccountNegativeKeywordListsQuery(
    contexts.ACCOUNT_NEGATIVE_KEYWORD_LISTS,
  ),
  [
    'FROM customer_negative_criterion',
    'customer_negative_criterion.resource_name',
    'customer_negative_criterion.id',
    'customer_negative_criterion.type',
    'customer_negative_criterion.negative_keyword_list.shared_set',
    'shared_set.resource_name',
    'shared_set.id',
    'shared_set.name',
    'shared_set.status',
    'shared_set.type',
    "customer_negative_criterion.type = 'NEGATIVE_KEYWORD_LIST'",
  ],
);

console.log(
  'PASS GOOGLE-ADS-NEGATIVES-CONTRACT-001: source, immutable schema-v1 contexts, five dataset/resource contracts, and exact keyword-negative GAQL are locked',
);
