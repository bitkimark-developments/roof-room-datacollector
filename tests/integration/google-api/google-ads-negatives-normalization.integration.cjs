const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const {
  normalizeCampaignNegativeKeywordRows,
  normalizeAdGroupNegativeKeywordRows,
  normalizeSharedNegativeKeywordRows,
  normalizeCampaignNegativeKeywordListRows,
  normalizeAccountNegativeKeywordListRows,
  normalizeGoogleAdsConfigurationRows,
} = require(path.join(
  buildRoot,
  'main/sources/google-ads/negatives-adapter.js',
));

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

const campaignNegativeRow = {
  campaign: {
    id: '1001',
    name: 'Search Campaign',
    advertisingChannelType: 'SEARCH',
  },
  campaignCriterion: {
    resourceName: 'customers/123/campaignCriteria/1001~2001',
    criterionId: '2001',
    status: 'REMOVED',
    type: 'KEYWORD',
    negative: true,
    keyword: {
      text: 'free',
      matchType: 'BROAD',
    },
  },
};

const adGroupNegativeRow = {
  campaign: {
    id: '1001',
    name: 'Search Campaign',
    advertisingChannelType: 'SEARCH',
  },
  adGroup: {
    id: '3001',
    name: 'Ficus Group',
  },
  adGroupCriterion: {
    resourceName: 'customers/123/adGroupCriteria/3001~4001',
    criterionId: '4001',
    status: 'ENABLED',
    type: 'KEYWORD',
    negative: true,
    keyword: {
      text: 'cheap',
      matchType: 'PHRASE',
    },
  },
};

const sharedNegativeRow = {
  sharedSet: {
    resourceName: 'customers/123/sharedSets/5001',
    id: '5001',
    name: 'Shared Negatives',
    status: 'ENABLED',
    type: 'NEGATIVE_KEYWORDS',
  },
  sharedCriterion: {
    resourceName: 'customers/123/sharedCriteria/5001~6001',
    criterionId: '6001',
    type: 'KEYWORD',
    negative: true,
    keyword: {
      text: 'jobs',
      matchType: 'EXACT',
    },
  },
};

const campaignListRow = {
  campaign: {
    id: '1001',
    name: 'Search Campaign',
    advertisingChannelType: 'SEARCH',
  },
  campaignSharedSet: {
    resourceName: 'customers/123/campaignSharedSets/1001~5001',
    status: 'ENABLED',
  },
  sharedSet: {
    resourceName: 'customers/123/sharedSets/5001',
    id: '5001',
    name: 'Campaign Negative List',
    status: 'ENABLED',
    type: 'NEGATIVE_KEYWORDS',
  },
};

const accountListRow = {
  customerNegativeCriterion: {
    resourceName: 'customers/123/customerNegativeCriteria/7001',
    id: '7001',
    type: 'NEGATIVE_KEYWORD_LIST',
    negativeKeywordList: {
      sharedSet: 'customers/123/sharedSets/8001',
    },
  },
  sharedSet: {
    resourceName: 'customers/123/sharedSets/8001',
    id: '8001',
    name: 'Account Negative List',
    status: 'ENABLED',
    type: 'ACCOUNT_LEVEL_NEGATIVE_KEYWORDS',
  },
};

/* Campaign direct negatives */
{
  const row = normalizeCampaignNegativeKeywordRows([campaignNegativeRow])[0];

  assert.equal(row.campaign_id, '1001');
  assert.equal(row.campaign_name, 'Search Campaign');
  assert.equal(row.campaign_advertising_channel_type, 'SEARCH');
  assert.equal(
    row.campaign_criterion_resource_name,
    'customers/123/campaignCriteria/1001~2001',
  );
  assert.equal(row.campaign_criterion_id, '2001');
  assert.equal(row.campaign_criterion_status, 'REMOVED');
  assert.equal(row.campaign_criterion_type, 'KEYWORD');
  assert.equal(row.campaign_criterion_negative, true);
  assert.equal(row.keyword_text, 'free');
  assert.equal(row.keyword_match_type, 'BROAD');

  assert.equal(
    row.campaign_criterion_status,
    'REMOVED',
    'Provider REMOVED status must be preserved exactly.',
  );

  const withoutStatus = clone(campaignNegativeRow);
  delete withoutStatus.campaignCriterion.status;
  assert.equal(
    normalizeCampaignNegativeKeywordRows([withoutStatus])[0]
      .campaign_criterion_status,
    null,
    'Absent optional criterion status must remain null.',
  );
}

/* Ad-group direct negatives */
{
  const row = normalizeAdGroupNegativeKeywordRows([adGroupNegativeRow])[0];

  assert.equal(row.campaign_id, '1001');
  assert.equal(row.campaign_name, 'Search Campaign');
  assert.equal(row.campaign_advertising_channel_type, 'SEARCH');
  assert.equal(row.ad_group_id, '3001');
  assert.equal(row.ad_group_name, 'Ficus Group');
  assert.equal(
    row.ad_group_criterion_resource_name,
    'customers/123/adGroupCriteria/3001~4001',
  );
  assert.equal(row.ad_group_criterion_id, '4001');
  assert.equal(row.ad_group_criterion_status, 'ENABLED');
  assert.equal(row.ad_group_criterion_type, 'KEYWORD');
  assert.equal(row.ad_group_criterion_negative, true);
  assert.equal(row.keyword_text, 'cheap');
  assert.equal(row.keyword_match_type, 'PHRASE');
}

/* Shared negative members */
{
  const row = normalizeSharedNegativeKeywordRows([sharedNegativeRow])[0];

  assert.equal(row.shared_set_resource_name, 'customers/123/sharedSets/5001');
  assert.equal(row.shared_set_id, '5001');
  assert.equal(row.shared_set_name, 'Shared Negatives');
  assert.equal(row.shared_set_status, 'ENABLED');
  assert.equal(row.shared_set_type, 'NEGATIVE_KEYWORDS');
  assert.equal(
    row.shared_criterion_resource_name,
    'customers/123/sharedCriteria/5001~6001',
  );
  assert.equal(row.shared_criterion_id, '6001');
  assert.equal(row.shared_criterion_type, 'KEYWORD');
  assert.equal(row.shared_criterion_negative, true);
  assert.equal(row.keyword_text, 'jobs');
  assert.equal(row.keyword_match_type, 'EXACT');

  const optionalMissing = clone(sharedNegativeRow);
  delete optionalMissing.sharedSet.name;
  delete optionalMissing.sharedSet.status;

  const optionalRow =
    normalizeSharedNegativeKeywordRows([optionalMissing])[0];

  assert.equal(optionalRow.shared_set_name, null);
  assert.equal(optionalRow.shared_set_status, null);

  const accountLevelMember = clone(sharedNegativeRow);
  accountLevelMember.sharedSet.type = 'ACCOUNT_LEVEL_NEGATIVE_KEYWORDS';

  assert.equal(
    normalizeSharedNegativeKeywordRows([accountLevelMember])[0]
      .shared_set_type,
    'ACCOUNT_LEVEL_NEGATIVE_KEYWORDS',
    'Account-level shared negative members are valid evidence.',
  );
}

/* Campaign negative-list associations */
{
  const row =
    normalizeCampaignNegativeKeywordListRows([campaignListRow])[0];

  assert.equal(row.campaign_id, '1001');
  assert.equal(row.campaign_name, 'Search Campaign');
  assert.equal(row.campaign_advertising_channel_type, 'SEARCH');
  assert.equal(
    row.campaign_shared_set_resource_name,
    'customers/123/campaignSharedSets/1001~5001',
  );
  assert.equal(row.campaign_shared_set_status, 'ENABLED');
  assert.equal(row.shared_set_resource_name, 'customers/123/sharedSets/5001');
  assert.equal(row.shared_set_id, '5001');
  assert.equal(row.shared_set_name, 'Campaign Negative List');
  assert.equal(row.shared_set_status, 'ENABLED');
  assert.equal(row.shared_set_type, 'NEGATIVE_KEYWORDS');

  const optionalMissing = clone(campaignListRow);
  delete optionalMissing.campaignSharedSet.status;
  delete optionalMissing.sharedSet.name;
  delete optionalMissing.sharedSet.status;

  const optionalRow =
    normalizeCampaignNegativeKeywordListRows([optionalMissing])[0];

  assert.equal(optionalRow.campaign_shared_set_status, null);
  assert.equal(optionalRow.shared_set_name, null);
  assert.equal(optionalRow.shared_set_status, null);
}

/* Account negative-list attachments */
{
  const row =
    normalizeAccountNegativeKeywordListRows([accountListRow])[0];

  assert.equal(
    row.customer_negative_criterion_resource_name,
    'customers/123/customerNegativeCriteria/7001',
  );
  assert.equal(row.customer_negative_criterion_id, '7001');
  assert.equal(
    row.customer_negative_criterion_type,
    'NEGATIVE_KEYWORD_LIST',
  );
  assert.equal(
    row.negative_keyword_list_shared_set,
    'customers/123/sharedSets/8001',
  );
  assert.equal(row.shared_set_resource_name, 'customers/123/sharedSets/8001');
  assert.equal(row.shared_set_id, '8001');
  assert.equal(row.shared_set_name, 'Account Negative List');
  assert.equal(row.shared_set_status, 'ENABLED');
  assert.equal(row.shared_set_type, 'ACCOUNT_LEVEL_NEGATIVE_KEYWORDS');

  const noAttributedSharedSet = clone(accountListRow);
  delete noAttributedSharedSet.sharedSet;

  const sparseRow =
    normalizeAccountNegativeKeywordListRows([noAttributedSharedSet])[0];

  assert.equal(sparseRow.shared_set_resource_name, null);
  assert.equal(sparseRow.shared_set_id, null);
  assert.equal(sparseRow.shared_set_name, null);
  assert.equal(sparseRow.shared_set_status, null);
  assert.equal(sparseRow.shared_set_type, null);
  assert.equal(
    sparseRow.negative_keyword_list_shared_set,
    'customers/123/sharedSets/8001',
    'Attachment evidence must survive without reconstructing attributed shared-set data.',
  );
}

/* Dispatcher */
assert.deepEqual(
  normalizeGoogleAdsConfigurationRows(
    'CAMPAIGN_NEGATIVE_KEYWORDS',
    [campaignNegativeRow],
  ),
  normalizeCampaignNegativeKeywordRows([campaignNegativeRow]),
);

assert.deepEqual(
  normalizeGoogleAdsConfigurationRows(
    'AD_GROUP_NEGATIVE_KEYWORDS',
    [adGroupNegativeRow],
  ),
  normalizeAdGroupNegativeKeywordRows([adGroupNegativeRow]),
);

assert.deepEqual(
  normalizeGoogleAdsConfigurationRows(
    'SHARED_NEGATIVE_KEYWORDS',
    [sharedNegativeRow],
  ),
  normalizeSharedNegativeKeywordRows([sharedNegativeRow]),
);

assert.deepEqual(
  normalizeGoogleAdsConfigurationRows(
    'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
    [campaignListRow],
  ),
  normalizeCampaignNegativeKeywordListRows([campaignListRow]),
);

assert.deepEqual(
  normalizeGoogleAdsConfigurationRows(
    'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
    [accountListRow],
  ),
  normalizeAccountNegativeKeywordListRows([accountListRow]),
);

/* Fail closed: direct campaign negatives */
{
  const wrongType = clone(campaignNegativeRow);
  wrongType.campaignCriterion.type = 'PLACEMENT';
  mustThrow(
    () => normalizeCampaignNegativeKeywordRows([wrongType]),
    'Campaign negative must reject non-KEYWORD criterion.',
  );

  const notNegative = clone(campaignNegativeRow);
  notNegative.campaignCriterion.negative = false;
  mustThrow(
    () => normalizeCampaignNegativeKeywordRows([notNegative]),
    'Campaign negative must reject negative=false.',
  );

  const nonSearch = clone(campaignNegativeRow);
  nonSearch.campaign.advertisingChannelType = 'DISPLAY';
  mustThrow(
    () => normalizeCampaignNegativeKeywordRows([nonSearch]),
    'Campaign negative must reject non-SEARCH campaign.',
  );

  const missingIdentity = clone(campaignNegativeRow);
  delete missingIdentity.campaignCriterion.resourceName;
  mustThrow(
    () => normalizeCampaignNegativeKeywordRows([missingIdentity]),
    'Campaign negative must reject missing criterion identity.',
  );

  const missingKeywordText = clone(campaignNegativeRow);
  delete missingKeywordText.campaignCriterion.keyword.text;
  mustThrow(
    () => normalizeCampaignNegativeKeywordRows([missingKeywordText]),
    'Campaign negative must reject missing keyword text.',
  );
}

/* Fail closed: ad-group direct negatives */
{
  const wrongType = clone(adGroupNegativeRow);
  wrongType.adGroupCriterion.type = 'PLACEMENT';
  mustThrow(
    () => normalizeAdGroupNegativeKeywordRows([wrongType]),
    'Ad-group negative must reject non-KEYWORD criterion.',
  );

  const notNegative = clone(adGroupNegativeRow);
  notNegative.adGroupCriterion.negative = false;
  mustThrow(
    () => normalizeAdGroupNegativeKeywordRows([notNegative]),
    'Ad-group negative must reject negative=false.',
  );

  const nonSearch = clone(adGroupNegativeRow);
  nonSearch.campaign.advertisingChannelType = 'DISPLAY';
  mustThrow(
    () => normalizeAdGroupNegativeKeywordRows([nonSearch]),
    'Ad-group negative must reject non-SEARCH campaign.',
  );

  const missingIdentity = clone(adGroupNegativeRow);
  delete missingIdentity.adGroup.id;
  mustThrow(
    () => normalizeAdGroupNegativeKeywordRows([missingIdentity]),
    'Ad-group negative must reject missing ad-group identity.',
  );

  const missingMatchType = clone(adGroupNegativeRow);
  delete missingMatchType.adGroupCriterion.keyword.matchType;
  mustThrow(
    () => normalizeAdGroupNegativeKeywordRows([missingMatchType]),
    'Ad-group negative must reject missing keyword match type.',
  );
}

/* Fail closed: shared members */
{
  const unsupportedSet = clone(sharedNegativeRow);
  unsupportedSet.sharedSet.type = 'PLACEMENT_EXCLUSION_LIST';
  mustThrow(
    () => normalizeSharedNegativeKeywordRows([unsupportedSet]),
    'Shared negative must reject unsupported shared-set type.',
  );

  const wrongType = clone(sharedNegativeRow);
  wrongType.sharedCriterion.type = 'PLACEMENT';
  mustThrow(
    () => normalizeSharedNegativeKeywordRows([wrongType]),
    'Shared negative must reject non-KEYWORD criterion.',
  );

  const notNegative = clone(sharedNegativeRow);
  notNegative.sharedCriterion.negative = false;
  mustThrow(
    () => normalizeSharedNegativeKeywordRows([notNegative]),
    'Shared negative must reject negative=false.',
  );

  const missingIdentity = clone(sharedNegativeRow);
  delete missingIdentity.sharedSet.id;
  mustThrow(
    () => normalizeSharedNegativeKeywordRows([missingIdentity]),
    'Shared negative must reject missing shared-set identity.',
  );

  const missingKeywordText = clone(sharedNegativeRow);
  delete missingKeywordText.sharedCriterion.keyword.text;
  mustThrow(
    () => normalizeSharedNegativeKeywordRows([missingKeywordText]),
    'Shared negative must reject missing keyword text.',
  );
}

/* Fail closed: campaign list */
{
  const accountLevel = clone(campaignListRow);
  accountLevel.sharedSet.type = 'ACCOUNT_LEVEL_NEGATIVE_KEYWORDS';
  mustThrow(
    () => normalizeCampaignNegativeKeywordListRows([accountLevel]),
    'Campaign list must reject ACCOUNT_LEVEL_NEGATIVE_KEYWORDS.',
  );

  const nonSearch = clone(campaignListRow);
  nonSearch.campaign.advertisingChannelType = 'DISPLAY';
  mustThrow(
    () => normalizeCampaignNegativeKeywordListRows([nonSearch]),
    'Campaign list must reject non-SEARCH campaign.',
  );

  const missingIdentity = clone(campaignListRow);
  delete missingIdentity.campaignSharedSet.resourceName;
  mustThrow(
    () => normalizeCampaignNegativeKeywordListRows([missingIdentity]),
    'Campaign list must reject missing campaign-shared-set identity.',
  );
}

/* Fail closed: account list */
{
  const wrongType = clone(accountListRow);
  wrongType.customerNegativeCriterion.type = 'KEYWORD';
  mustThrow(
    () => normalizeAccountNegativeKeywordListRows([wrongType]),
    'Account list must reject non-NEGATIVE_KEYWORD_LIST criterion.',
  );

  const missingIdentity = clone(accountListRow);
  delete missingIdentity.customerNegativeCriterion.id;
  mustThrow(
    () => normalizeAccountNegativeKeywordListRows([missingIdentity]),
    'Account list must reject missing customer-negative-criterion identity.',
  );

  const missingAttachment = clone(accountListRow);
  delete missingAttachment.customerNegativeCriterion.negativeKeywordList.sharedSet;
  mustThrow(
    () => normalizeAccountNegativeKeywordListRows([missingAttachment]),
    'Account list must reject missing provider shared-set attachment.',
  );
}

console.log(
  'PASS GOOGLE-ADS-NEGATIVES-NORMALIZATION-001: five provider-row normalization paths preserve identities/nulls/provider status and fail closed on semantic mismatches',
);
