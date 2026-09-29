const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const load = (modulePath) => require(path.join(buildRoot, modulePath));
const {
  buildKeywordPerformanceQuery,
} = load('main/sources/google-ads/keywords-request.js');
const {
  normalizeKeywordPerformanceRows,
} = load('main/sources/google-ads/keywords-adapter.js');
const {
  buildSearchTermPerformanceQuery,
} = load('main/sources/google-ads/search-terms-request.js');
const {
  normalizeSearchTermPerformanceRows,
} = load('main/sources/google-ads/search-terms-adapter.js');
const {
  GoogleAdsSearchReportingSource,
} = load('main/sources/google-ads/search-reporting-source.js');
const {
  createGoogleAdsReportingJobContext,
} = load('main/sources/google-ads/search-reporting-request.js');

const keywordContext = createGoogleAdsReportingJobContext({
  dataset_type: 'KEYWORD_PERFORMANCE',
  customer_id: '1234567890',
  requested_date_start: '2026-09-01',
  requested_date_end: '2026-09-07',
});
const keywordQuery = buildKeywordPerformanceQuery(keywordContext);
for (const field of [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'ad_group_criterion.criterion_id',
  'ad_group_criterion.keyword.text',
  'ad_group_criterion.keyword.match_type',
  'ad_group_criterion.status',
  'ad_group_criterion.primary_status',
  'ad_group_criterion.system_serving_status',
  'ad_group_criterion.negative',
  'ad_group_criterion.cpc_bid_micros',
  'ad_group_criterion.effective_cpc_bid_micros',
  'ad_group_criterion.quality_info.quality_score',
  'ad_group_criterion.quality_info.creative_quality_score',
  'ad_group_criterion.quality_info.post_click_quality_score',
  'ad_group_criterion.quality_info.search_predicted_ctr',
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
  'metrics.search_impression_share',
  'metrics.search_exact_match_impression_share',
  'metrics.search_budget_lost_impression_share',
  'metrics.search_rank_lost_impression_share',
  'metrics.search_click_share',
  'metrics.top_impression_percentage',
  'metrics.absolute_top_impression_percentage',
]) {
  assert.match(keywordQuery, new RegExp(`\\b${field.replaceAll('.', '\\.')}\\b`, 'u'));
}
assert.match(keywordQuery, /FROM keyword_view\b/u);
assert.match(keywordQuery, /campaign\.advertising_channel_type = 'SEARCH'/u);
assert.match(keywordQuery, /segments\.date BETWEEN '2026-09-01' AND '2026-09-07'/u);
assert.doesNotMatch(keywordQuery, /LAST_|TODAY|YESTERDAY/u);

// Official-schema-shaped development mocks. These are not live-provider fixtures.
const keywordRows = normalizeKeywordPerformanceRows([
  {
    campaign: { id: '101', name: 'Search Campaign', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Ficus' },
    adGroupCriterion: {
      criterionId: '301',
      keyword: { text: 'ficus plant', matchType: 'PHRASE' },
      status: 'ENABLED',
      primaryStatus: 'ELIGIBLE',
      systemServingStatus: 'ELIGIBLE',
      negative: false,
      cpcBidMicros: '0',
      effectiveCpcBidMicros: null,
      qualityInfo: {
        qualityScore: '7',
        creativeQualityScore: null,
        postClickQualityScore: 'AVERAGE',
        searchPredictedCtr: undefined,
      },
    },
    segments: { date: '2026-09-02' },
    metrics: {
      impressions: '0',
      clicks: 0,
      ctr: '0',
      averageCpc: '0',
      costMicros: '0',
      conversions: null,
      conversionsValue: undefined,
      allConversions: '0',
      allConversionsValue: '0',
      searchImpressionShare: null,
      searchExactMatchImpressionShare: '0',
      searchBudgetLostImpressionShare: '0.25',
      searchRankLostImpressionShare: '0',
      searchClickShare: undefined,
      topImpressionPercentage: '0.5',
      absoluteTopImpressionPercentage: '0.1',
    },
  },
]);
assert.deepEqual(keywordRows[0], {
  campaign_id: '101',
  campaign_name: 'Search Campaign',
  campaign_advertising_channel_type: 'SEARCH',
  ad_group_id: '201',
  ad_group_name: 'Ficus',
  criterion_id: '301',
  keyword_text: 'ficus plant',
  keyword_match_type: 'PHRASE',
  criterion_status: 'ENABLED',
  criterion_primary_status: 'ELIGIBLE',
  system_serving_status: 'ELIGIBLE',
  negative: false,
  cpc_bid_micros: 0,
  effective_cpc_bid_micros: null,
  quality_score: 7,
  creative_quality_score: null,
  post_click_quality_score: 'AVERAGE',
  search_predicted_ctr: null,
  search_exact_match_impression_share: 0,
  performance_date: '2026-09-02',
  impressions: 0,
  clicks: 0,
  ctr: 0,
  average_cpc_micros: 0,
  cost_micros: 0,
  conversions: null,
  conversions_value: null,
  all_conversions: 0,
  all_conversions_value: 0,
  search_impression_share: null,
  search_budget_lost_impression_share: 0.25,
  search_rank_lost_impression_share: 0,
  search_click_share: null,
  top_impression_percentage: 0.5,
  absolute_top_impression_percentage: 0.1,
});

const searchTermContext = createGoogleAdsReportingJobContext({
  dataset_type: 'SEARCH_TERMS',
  customer_id: '1234567890',
  requested_date_start: '2026-09-01',
  requested_date_end: '2026-09-07',
});
const searchTermQuery = buildSearchTermPerformanceQuery(searchTermContext);
for (const field of [
  'search_term_view.search_term',
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'segments.keyword.ad_group_criterion',
  'segments.keyword.info.text',
  'segments.keyword.info.match_type',
  'segments.search_term_match_type',
  'segments.search_term_targeting_status',
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
  'metrics.top_impression_percentage',
  'metrics.absolute_top_impression_percentage',
]) {
  assert.match(searchTermQuery, new RegExp(`\\b${field.replaceAll('.', '\\.')}\\b`, 'u'));
}
assert.match(searchTermQuery, /FROM search_term_view\b/u);
assert.match(searchTermQuery, /campaign\.advertising_channel_type = 'SEARCH'/u);
assert.match(searchTermQuery, /segments\.date BETWEEN '2026-09-01' AND '2026-09-07'/u);
assert.doesNotMatch(searchTermQuery, /LAST_|TODAY|YESTERDAY/u);

const searchTermRows = normalizeSearchTermPerformanceRows([
  {
    searchTermView: { searchTerm: 'buy ficus' },
    campaign: { id: '101', name: 'Search Campaign', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Ficus' },
    segments: {
      keyword: {
        adGroupCriterion: 'customers/123/adGroupCriteria/201~301',
        info: { text: 'ficus plant', matchType: 'PHRASE' },
      },
      searchTermMatchType: 'NEAR_PHRASE',
      searchTermTargetingStatus: 'NONE',
      date: '2026-09-03',
    },
    metrics: {
      impressions: '4',
      clicks: '0',
      ctr: '0',
      averageCpc: null,
      costMicros: '0',
      conversions: '0',
      conversionsValue: null,
      allConversions: '0',
      allConversionsValue: undefined,
      topImpressionPercentage: '0.75',
      absoluteTopImpressionPercentage: null,
    },
  },
]);
assert.deepEqual(searchTermRows[0], {
  search_term: 'buy ficus',
  campaign_id: '101',
  campaign_name: 'Search Campaign',
  campaign_advertising_channel_type: 'SEARCH',
  ad_group_id: '201',
  ad_group_name: 'Ficus',
  keyword_resource_name: 'customers/123/adGroupCriteria/201~301',
  keyword_text: 'ficus plant',
  keyword_match_type: 'PHRASE',
  search_term_match_type: 'NEAR_PHRASE',
  search_term_targeting_status: 'NONE',
  performance_date: '2026-09-03',
  impressions: 4,
  clicks: 0,
  ctr: 0,
  average_cpc_micros: null,
  cost_micros: 0,
  conversions: 0,
  conversions_value: null,
  all_conversions: 0,
  all_conversions_value: null,
  top_impression_percentage: 0.75,
  absolute_top_impression_percentage: null,
});

const searchTermWithoutKeyword = normalizeSearchTermPerformanceRows([
  {
    searchTermView: { searchTerm: 'automated query' },
    campaign: { id: '101', name: 'Search Campaign', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Ficus' },
    segments: {
      keyword: null,
      searchTermMatchType: 'UNKNOWN',
      searchTermTargetingStatus: 'NONE',
      date: '2026-09-04',
    },
    metrics: {},
  },
]);
assert.equal(searchTermWithoutKeyword[0].keyword_resource_name, null);
assert.equal(searchTermWithoutKeyword[0].keyword_text, null);
assert.equal(searchTermWithoutKeyword[0].keyword_match_type, null);

assert.throws(
  () => normalizeKeywordPerformanceRows([{
    campaign: { id: '1', name: 'Search', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '2', name: 'Group' },
    adGroupCriterion: {
      keyword: { text: 'missing criterion id', matchType: 'BROAD' },
      status: 'ENABLED',
      primaryStatus: 'ELIGIBLE',
      systemServingStatus: 'ELIGIBLE',
      negative: false,
    },
    segments: { date: '2026-09-01' },
    metrics: {},
  }]),
  /criterionId/u,
);
assert.throws(
  () => normalizeSearchTermPerformanceRows([{
    searchTermView: { searchTerm: 'bad numeric' },
    campaign: { id: '1', name: 'Search', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '2', name: 'Group' },
    segments: {
      searchTermMatchType: 'BROAD',
      searchTermTargetingStatus: 'NONE',
      date: '2026-09-01',
    },
    metrics: { clicks: 'not-a-number' },
  }]),
  /metrics.clicks/u,
);

(async () => {
  const requests = [];
  const source = new GoogleAdsSearchReportingSource(
    '1234567890',
    async (request) => {
      requests.push(request);
      return { status: 200, body: [] };
    },
  );
  for (const [jobKey, sourceContext] of [
    ['KEYWORD_PERFORMANCE', keywordContext],
    ['SEARCH_TERMS', searchTermContext],
  ]) {
    const result = await source.collect({
      source_id: 'google-ads-search-reporting',
      job_key: jobKey,
      source_context: sourceContext,
    });
    assert.equal(result.result_type, 'ARTIFACT_PRODUCED');
  }
  assert.equal(requests.length, 2, 'Keyword and Search Terms descriptors must be registered');

  console.log(
    'PASS GOOGLE-ADS-KEYWORD-SEARCH-TERM-001: exact SEARCH GAQL and canonical nested normalization preserve keyword/search-term evidence, native micros, nulls, and true zeros',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
