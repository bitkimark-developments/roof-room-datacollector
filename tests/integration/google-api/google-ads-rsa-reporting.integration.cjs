const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const load = (modulePath) => require(path.join(buildRoot, modulePath));
const { buildAdPerformanceQuery } = load('main/sources/google-ads/ads-request.js');
const { normalizeAdPerformanceRows } = load('main/sources/google-ads/ads-adapter.js');
const { buildRsaAssetPerformanceQuery } = load('main/sources/google-ads/rsa-assets-request.js');
const { normalizeRsaAssetPerformanceRows } = load('main/sources/google-ads/rsa-assets-adapter.js');
const {
  GoogleAdsSearchReportingSource,
} = load('main/sources/google-ads/search-reporting-source.js');
const {
  createGoogleAdsReportingJobContext,
} = load('main/sources/google-ads/search-reporting-request.js');

const adContext = createGoogleAdsReportingJobContext({
  dataset_type: 'AD_PERFORMANCE',
  customer_id: '1234567890',
  requested_date_start: '2026-09-01',
  requested_date_end: '2026-09-07',
});
const adQuery = buildAdPerformanceQuery(adContext);
for (const field of [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'ad_group_ad.ad.id',
  'ad_group_ad.ad.type',
  'ad_group_ad.status',
  'ad_group_ad.primary_status',
  'ad_group_ad.ad_strength',
  'ad_group_ad.policy_summary.approval_status',
  'ad_group_ad.policy_summary.review_status',
  'ad_group_ad.ad.final_urls',
  'ad_group_ad.ad.responsive_search_ad.headlines',
  'ad_group_ad.ad.responsive_search_ad.descriptions',
  'ad_group_ad.ad.responsive_search_ad.path1',
  'ad_group_ad.ad.responsive_search_ad.path2',
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
  assert.match(adQuery, new RegExp(`\\b${field.replaceAll('.', '\\.')}\\b`, 'u'));
}
assert.match(adQuery, /FROM ad_group_ad\b/u);
assert.match(adQuery, /campaign\.advertising_channel_type = 'SEARCH'/u);
assert.match(adQuery, /ad_group_ad\.ad\.type = 'RESPONSIVE_SEARCH_AD'/u);
assert.match(adQuery, /segments\.date BETWEEN '2026-09-01' AND '2026-09-07'/u);
assert.doesNotMatch(adQuery, /LAST_|TODAY|YESTERDAY/u);

// Official-schema-shaped development mocks. These are not live-provider fixtures.
const adRows = normalizeAdPerformanceRows([
  {
    campaign: { id: '101', name: 'Search Campaign', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Ficus' },
    adGroupAd: {
      ad: {
        id: '401',
        type: 'RESPONSIVE_SEARCH_AD',
        finalUrls: ['https://example.com/ficus', 'https://example.com/plants'],
        responsiveSearchAd: {
          headlines: [
            { text: 'Buy Ficus', pinnedField: 'HEADLINE_1', assetPerformanceLabel: 'BEST' },
            { text: 'Indoor Plants' },
          ],
          descriptions: [
            { text: 'Healthy plants delivered.', pinnedField: null, assetPerformanceLabel: 'GOOD' },
          ],
          path1: 'plants',
          path2: null,
        },
      },
      status: 'ENABLED',
      primaryStatus: 'ELIGIBLE',
      adStrength: 'GOOD',
      policySummary: { approvalStatus: 'APPROVED', reviewStatus: 'REVIEWED' },
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
      topImpressionPercentage: '0.5',
      absoluteTopImpressionPercentage: null,
    },
  },
]);
assert.deepEqual(adRows[0], {
  campaign_id: '101',
  campaign_name: 'Search Campaign',
  campaign_advertising_channel_type: 'SEARCH',
  ad_group_id: '201',
  ad_group_name: 'Ficus',
  ad_id: '401',
  ad_type: 'RESPONSIVE_SEARCH_AD',
  ad_group_ad_status: 'ENABLED',
  ad_group_ad_primary_status: 'ELIGIBLE',
  ad_strength: 'GOOD',
  policy_approval_status: 'APPROVED',
  policy_review_status: 'REVIEWED',
  final_urls: ['https://example.com/ficus', 'https://example.com/plants'],
  headlines: [
    { text: 'Buy Ficus', pinned_field: 'HEADLINE_1', asset_performance_label: 'BEST' },
    { text: 'Indoor Plants', pinned_field: null, asset_performance_label: null },
  ],
  descriptions: [
    { text: 'Healthy plants delivered.', pinned_field: null, asset_performance_label: 'GOOD' },
  ],
  path1: 'plants',
  path2: null,
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
  top_impression_percentage: 0.5,
  absolute_top_impression_percentage: null,
});

const assetContext = createGoogleAdsReportingJobContext({
  dataset_type: 'RSA_ASSET_PERFORMANCE',
  customer_id: '1234567890',
  requested_date_start: '2026-09-01',
  requested_date_end: '2026-09-07',
});
const assetQuery = buildRsaAssetPerformanceQuery(assetContext);
for (const field of [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'ad_group_ad.ad.id',
  'ad_group_ad.ad.type',
  'ad_group_ad_asset_view.resource_name',
  'ad_group_ad_asset_view.field_type',
  'ad_group_ad_asset_view.performance_label',
  'ad_group_ad_asset_view.pinned_field',
  'ad_group_ad_asset_view.enabled',
  'ad_group_ad_asset_view.source',
  'ad_group_ad_asset_view.asset',
  'asset.resource_name',
  'asset.id',
  'asset.name',
  'asset.text_asset.text',
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
]) {
  assert.match(assetQuery, new RegExp(`\\b${field.replaceAll('.', '\\.')}\\b`, 'u'));
}
assert.match(assetQuery, /FROM ad_group_ad_asset_view\b/u);
assert.match(assetQuery, /campaign\.advertising_channel_type = 'SEARCH'/u);
assert.match(assetQuery, /ad_group_ad\.ad\.type = 'RESPONSIVE_SEARCH_AD'/u);
assert.match(assetQuery, /segments\.date BETWEEN '2026-09-01' AND '2026-09-07'/u);
assert.doesNotMatch(assetQuery, /LAST_|TODAY|YESTERDAY/u);

const assetRows = normalizeRsaAssetPerformanceRows([
  {
    campaign: { id: '101', name: 'Search Campaign', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Ficus' },
    adGroupAd: { ad: { id: '401', type: 'RESPONSIVE_SEARCH_AD' } },
    adGroupAdAssetView: {
      resourceName: 'customers/123/adGroupAdAssetViews/201~401~501~HEADLINE',
      fieldType: 'HEADLINE',
      performanceLabel: 'BEST',
      pinnedField: null,
      enabled: false,
      source: 'ADVERTISER',
      asset: 'customers/123/assets/501',
    },
    asset: {
      resourceName: 'customers/123/assets/501',
      id: '501',
      name: null,
      textAsset: { text: 'Buy Ficus' },
    },
    segments: { date: '2026-09-03' },
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
    },
  },
]);
assert.deepEqual(assetRows[0], {
  campaign_id: '101',
  campaign_name: 'Search Campaign',
  campaign_advertising_channel_type: 'SEARCH',
  ad_group_id: '201',
  ad_group_name: 'Ficus',
  ad_id: '401',
  ad_type: 'RESPONSIVE_SEARCH_AD',
  asset_view_resource_name: 'customers/123/adGroupAdAssetViews/201~401~501~HEADLINE',
  field_type: 'HEADLINE',
  performance_label: 'BEST',
  pinned_field: null,
  enabled: false,
  source: 'ADVERTISER',
  asset_resource_name: 'customers/123/assets/501',
  asset_id: '501',
  asset_name: null,
  asset_text: 'Buy Ficus',
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
});

assert.throws(
  () => normalizeAdPerformanceRows([{
    campaign: { id: '1', name: 'Search', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '2', name: 'Group' },
    adGroupAd: {
      ad: { id: '3', type: 'RESPONSIVE_SEARCH_AD', finalUrls: 'not-an-array', responsiveSearchAd: { headlines: [], descriptions: [] } },
      status: 'ENABLED', primaryStatus: 'ELIGIBLE', adStrength: 'GOOD',
      policySummary: { approvalStatus: 'APPROVED', reviewStatus: 'REVIEWED' },
    },
    segments: { date: '2026-09-01' }, metrics: {},
  }]),
  /finalUrls/u,
);
assert.throws(
  () => normalizeRsaAssetPerformanceRows([{
    campaign: { id: '1', name: 'Search', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '2', name: 'Group' },
    adGroupAd: { ad: { id: '3', type: 'RESPONSIVE_SEARCH_AD' } },
    adGroupAdAssetView: {
      fieldType: 'HEADLINE', performanceLabel: 'GOOD', enabled: true, source: 'ADVERTISER',
    },
    segments: { date: '2026-09-01' }, metrics: {},
  }]),
  /resourceName/u,
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
    ['AD_PERFORMANCE', adContext],
    ['RSA_ASSET_PERFORMANCE', assetContext],
  ]) {
    const result = await source.collect({
      source_id: 'google-ads-search-reporting',
      job_key: jobKey,
      source_context: sourceContext,
    });
    assert.equal(result.result_type, 'ARTIFACT_PRODUCED');
  }
  assert.equal(requests.length, 2, 'Ad and RSA asset descriptors must be registered');

  console.log(
    'PASS GOOGLE-ADS-RSA-001: exact SEARCH/RSA GAQL and canonical normalization preserve ad arrays, asset labels, native micros, nulls, and true zeros',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
