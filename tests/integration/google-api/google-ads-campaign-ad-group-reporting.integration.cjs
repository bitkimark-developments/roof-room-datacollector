const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const load = (modulePath) => require(path.join(buildRoot, modulePath));
const {
  buildCampaignPerformanceQuery,
} = load('main/sources/google-ads/campaigns-request.js');
const {
  normalizeCampaignPerformanceRows,
} = load('main/sources/google-ads/campaigns-adapter.js');
const {
  buildAdGroupPerformanceQuery,
} = load('main/sources/google-ads/ad-groups-request.js');
const {
  normalizeAdGroupPerformanceRows,
} = load('main/sources/google-ads/ad-groups-adapter.js');
const {
  GoogleAdsSearchReportingSource,
} = load('main/sources/google-ads/search-reporting-source.js');
const {
  createGoogleAdsReportingJobContext,
} = load('main/sources/google-ads/search-reporting-request.js');
const { normalizeConversionDateMetrics } = load('main/sources/google-ads/reporting-row-helpers.js');

assert.deepEqual(normalizeConversionDateMetrics({
  conversionsByConversionDate: '0',
  conversionsValueByConversionDate: null,
  allConversionsByConversionDate: '2.5',
  allConversionsValueByConversionDate: '42',
}), {
  conversions_by_conversion_date: 0,
  conversions_value_by_conversion_date: null,
  all_conversions_by_conversion_date: 2.5,
  all_conversions_value_by_conversion_date: 42,
});
assert.throws(() => normalizeConversionDateMetrics({
  conversionsByConversionDate: '0',
}), /allConversionsByConversionDate|conversionsValueByConversionDate/u);

const campaignContext = createGoogleAdsReportingJobContext({
  dataset_type: 'CAMPAIGN_PERFORMANCE',
  customer_id: '1234567890',
  requested_date_start: '2026-09-01',
  requested_date_end: '2026-09-07',
});
const campaignQuery = buildCampaignPerformanceQuery(campaignContext);
const legacy_campaignQuery = buildCampaignPerformanceQuery({
  ...campaignContext,
  dataset_schema_version: 2,
});
const conversionDate_campaignQuery = buildCampaignPerformanceQuery({
  ...campaignContext,
  dataset_schema_version: 3,
});
for (const field of [
  'metrics.conversions_by_conversion_date',
  'metrics.conversions_value_by_conversion_date',
  'metrics.all_conversions_by_conversion_date',
  'metrics.all_conversions_value_by_conversion_date',
]) {
  assert.equal(legacy_campaignQuery.includes(field), false,
    `Historical v2 must not silently acquire ${field}`);
  assert.ok(conversionDate_campaignQuery.includes(field),
    `Conversion-date v3 must select ${field}`);
}

for (const field of [
  'customer.currency_code',
  'customer.time_zone',
  'campaign.id',
  'campaign.name',
  'campaign.status',
  'campaign.primary_status',
  'campaign.advertising_channel_type',
  'campaign.bidding_strategy_type',
  'campaign_budget.id',
  'campaign_budget.amount_micros',
  'campaign_budget.period',
  'campaign_budget.explicitly_shared',
  'segments.date',
  'metrics.impressions',
  'metrics.clicks',
  'metrics.ctr',
  'metrics.average_cpc',
  'metrics.cost_micros',
  'metrics.conversions',
  'metrics.conversions_value',
  'metrics.all_conversions',
  'metrics.all_conversions_value',
  'metrics.conversions_from_interactions_rate',
  'metrics.cost_per_conversion',
  'metrics.conversions_value_per_cost',
  'metrics.search_impression_share',
  'metrics.search_budget_lost_impression_share',
  'metrics.search_rank_lost_impression_share',
  'metrics.search_click_share',
  'metrics.search_top_impression_share',
  'metrics.search_absolute_top_impression_share',
  'metrics.top_impression_percentage',
  'metrics.absolute_top_impression_percentage',
]) {
  assert.match(campaignQuery, new RegExp(`\\b${field.replaceAll('.', '\\.')}\\b`, 'u'));
}
assert.match(campaignQuery, /FROM campaign\b/u);
assert.match(campaignQuery, /campaign\.advertising_channel_type = 'SEARCH'/u);
assert.match(campaignQuery, /segments\.date BETWEEN '2026-09-01' AND '2026-09-07'/u);
assert.doesNotMatch(campaignQuery, /LAST_|TODAY|YESTERDAY/u);

const adGroupContext = createGoogleAdsReportingJobContext({
  dataset_type: 'AD_GROUP_PERFORMANCE',
  customer_id: '1234567890',
  requested_date_start: '2026-09-01',
  requested_date_end: '2026-09-07',
});
const adGroupQuery = buildAdGroupPerformanceQuery(adGroupContext);
const legacy_adGroupQuery = buildAdGroupPerformanceQuery({
  ...adGroupContext,
  dataset_schema_version: 2,
});
const conversionDate_adGroupQuery = buildAdGroupPerformanceQuery({
  ...adGroupContext,
  dataset_schema_version: 3,
});
for (const field of [
  'metrics.conversions_by_conversion_date',
  'metrics.conversions_value_by_conversion_date',
  'metrics.all_conversions_by_conversion_date',
  'metrics.all_conversions_value_by_conversion_date',
]) {
  assert.equal(legacy_adGroupQuery.includes(field), false,
    `Historical v2 must not silently acquire ${field}`);
  assert.ok(conversionDate_adGroupQuery.includes(field),
    `Conversion-date v3 must select ${field}`);
}

for (const field of [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'ad_group.status',
  'ad_group.primary_status',
  'ad_group.type',
  'ad_group.cpc_bid_micros',
  'ad_group.effective_cpc_bid_micros',
  'ad_group.effective_target_cpa_micros',
  'ad_group.effective_target_roas',
  'segments.date',
  'metrics.impressions',
  'metrics.clicks',
  'metrics.ctr',
  'metrics.average_cpc',
  'metrics.cost_micros',
  'metrics.conversions',
  'metrics.conversions_value',
  'metrics.all_conversions',
  'metrics.all_conversions_value',
  'metrics.conversions_from_interactions_rate',
  'metrics.cost_per_conversion',
  'metrics.conversions_value_per_cost',
  'metrics.search_impression_share',
  'metrics.search_budget_lost_impression_share',
  'metrics.search_rank_lost_impression_share',
  'metrics.search_click_share',
  'metrics.search_top_impression_share',
  'metrics.search_absolute_top_impression_share',
  'metrics.top_impression_percentage',
  'metrics.absolute_top_impression_percentage',
]) {
  assert.match(adGroupQuery, new RegExp(`\\b${field.replaceAll('.', '\\.')}\\b`, 'u'));
}
assert.match(adGroupQuery, /FROM ad_group\b/u);
assert.match(adGroupQuery, /campaign\.advertising_channel_type = 'SEARCH'/u);
assert.match(adGroupQuery, /segments\.date BETWEEN '2026-09-01' AND '2026-09-07'/u);
assert.doesNotMatch(adGroupQuery, /LAST_|TODAY|YESTERDAY/u);

// Official-schema-shaped development mocks. These are not live-provider fixtures.
const campaignRows = normalizeCampaignPerformanceRows([
  {
    customer: { currencyCode: 'TRY', timeZone: 'Europe/Istanbul' },
    campaign: {
      id: '101',
      name: 'Search Campaign',
      status: 'ENABLED',
      primaryStatus: 'ELIGIBLE',
      advertisingChannelType: 'SEARCH',
      biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
    },
    campaignBudget: {
      id: '501',
      amountMicros: '0',
      period: 'DAILY',
      explicitlyShared: false,
    },
    segments: { date: '2026-09-01' },
    metrics: {
      impressions: '0',
      clicks: 0,
      ctr: '0',
      averageCpc: '0',
      costMicros: '0',
      conversions: '0',
      conversionsValue: '0',
      allConversions: '0',
      allConversionsValue: '0',
      conversionsFromInteractionsRate: '0.125',
      costPerConversion: '2500000',
      conversionsValuePerCost: '3.5',
      searchImpressionShare: null,
      searchBudgetLostImpressionShare: '0.25',
      searchRankLostImpressionShare: '0',
      searchClickShare: undefined,
      searchTopImpressionShare: '0.4',
      searchAbsoluteTopImpressionShare: '0.2',
      topImpressionPercentage: '0.5',
      absoluteTopImpressionPercentage: '0.1',
    },
  },
]);
assert.deepEqual(campaignRows[0], {
  currency_code: 'TRY',
  time_zone: 'Europe/Istanbul',
  campaign_id: '101',
  campaign_name: 'Search Campaign',
  campaign_status: 'ENABLED',
  campaign_primary_status: 'ELIGIBLE',
  campaign_advertising_channel_type: 'SEARCH',
  campaign_bidding_strategy_type: 'MAXIMIZE_CONVERSIONS',
  campaign_budget_id: '501',
  campaign_budget_amount_micros: 0,
  campaign_budget_period: 'DAILY',
  campaign_budget_explicitly_shared: false,
  performance_date: '2026-09-01',
  impressions: 0,
  clicks: 0,
  ctr: 0,
  average_cpc_micros: 0,
  cost_micros: 0,
  conversions: 0,
  conversions_value: 0,
  all_conversions: 0,
  all_conversions_value: 0,
  conversions_from_interactions_rate: 0.125,
  cost_per_conversion: 2500000,
  conversions_value_per_cost: 3.5,
  search_impression_share: null,
  search_budget_lost_impression_share: 0.25,
  search_rank_lost_impression_share: 0,
  search_click_share: null,
  search_top_impression_share: 0.4,
  search_absolute_top_impression_share: 0.2,
  top_impression_percentage: 0.5,
  absolute_top_impression_percentage: 0.1,
});
assert.equal(Object.hasOwn(campaignRows[0], 'snapshot_observed_at'), false);

const adGroupRows = normalizeAdGroupPerformanceRows([
  {
    campaign: { id: '101', name: 'Search Campaign', advertisingChannelType: 'SEARCH' },
    adGroup: {
      id: '201',
      name: 'Ficus',
      status: 'ENABLED',
      primaryStatus: 'ELIGIBLE',
      type: 'SEARCH_STANDARD',
      cpcBidMicros: null,
      effectiveCpcBidMicros: '1250000',
      effectiveTargetCpaMicros: undefined,
      effectiveTargetRoas: '2.5',
    },
    segments: { date: '2026-09-02' },
    metrics: {
      impressions: '12',
      clicks: '1',
      ctr: '0.083333',
      averageCpc: '1250000',
      costMicros: '1250000',
      conversions: null,
      conversionsValue: undefined,
      allConversions: '0',
      allConversionsValue: '0',
      conversionsFromInteractionsRate: '0.2',
      costPerConversion: '1250000',
      conversionsValuePerCost: '2',
      searchImpressionShare: '0.8',
      searchBudgetLostImpressionShare: '0',
      searchRankLostImpressionShare: '0.2',
      searchClickShare: '0.75',
      searchTopImpressionShare: '0.7',
      searchAbsoluteTopImpressionShare: '0.4',
      topImpressionPercentage: '0.6',
      absoluteTopImpressionPercentage: '0.3',
    },
  },
]);
assert.equal(adGroupRows[0].ad_group_id, '201');
assert.equal(adGroupRows[0].effective_cpc_bid_micros, 1250000);
assert.equal(adGroupRows[0].effective_target_cpa_micros, null);
assert.equal(adGroupRows[0].effective_target_roas, 2.5);
assert.equal(adGroupRows[0].conversions, null);
assert.equal(adGroupRows[0].all_conversions, 0);
assert.equal(adGroupRows[0].conversions_from_interactions_rate, 0.2);
assert.equal(adGroupRows[0].cost_per_conversion, 1250000);
assert.equal(adGroupRows[0].conversions_value_per_cost, 2);
assert.equal(adGroupRows[0].search_top_impression_share, 0.7);
assert.equal(adGroupRows[0].search_absolute_top_impression_share, 0.4);

assert.throws(
  () => normalizeCampaignPerformanceRows([{
    customer: { currencyCode: 'TRY', timeZone: 'Europe/Istanbul' },
    campaign: { name: 'Missing id' },
    campaignBudget: { id: '1', explicitlyShared: false },
    segments: { date: '2026-09-01' },
    metrics: {},
  }]),
  /campaign.id/u,
);
assert.throws(
  () => normalizeAdGroupPerformanceRows([{
    campaign: { id: '1', name: 'Search', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '2', name: 'Group', status: 'ENABLED', primaryStatus: 'ELIGIBLE', type: 'SEARCH_STANDARD' },
    segments: { date: '2026-09-01' },
    metrics: { clicks: 'not-a-number' },
  }]),
  /metrics.clicks/u,
);

(async () => {
  const requests = [];
  const registeredSource = new GoogleAdsSearchReportingSource(
    '1234567890',
    async (request) => {
      requests.push(request);
      return { status: 200, body: [] };
    },
  );
  const result = await registeredSource.collect({
    source_id: 'google-ads-search-reporting',
    job_key: 'CAMPAIGN_PERFORMANCE',
    source_context: campaignContext,
  });
  assert.equal(result.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(requests.length, 1, 'Campaign descriptor must be registered in the source shell');

  console.log(
    'PASS GOOGLE-ADS-CAMPAIGN-AD-GROUP-001: exact SEARCH GAQL and canonical nested row normalization preserve IDs, micros, nulls, and true zeros',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
