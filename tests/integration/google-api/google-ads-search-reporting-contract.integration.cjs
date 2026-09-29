const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const reporting = require(path.join(buildRoot, 'shared/google-ads-search-reporting.js'));
const googleApi = require(path.join(buildRoot, 'shared/google-api.js'));

assert.equal(
  reporting.GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
  'google-ads-search-reporting',
  'the reporting family must use the approved source identity',
);

assert.deepEqual(reporting.GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES, [
  'CAMPAIGN_PERFORMANCE',
  'AD_GROUP_PERFORMANCE',
  'KEYWORD_PERFORMANCE',
  'SEARCH_TERMS',
  'AD_PERFORMANCE',
  'RSA_ASSET_PERFORMANCE',
]);
assert.equal(
  new Set(reporting.GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES).size,
  6,
  'all six approved datasets must be independently identifiable',
);

assert.deepEqual(reporting.GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET, {
  CAMPAIGN_PERFORMANCE: 'campaign',
  AD_GROUP_PERFORMANCE: 'ad_group',
  KEYWORD_PERFORMANCE: 'keyword_view',
  SEARCH_TERMS: 'search_term_view',
  AD_PERFORMANCE: 'ad_group_ad',
  RSA_ASSET_PERFORMANCE: 'ad_group_ad_asset_view',
});

assert.equal(
  googleApi.GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
  'google-ads-search-terms',
  'the existing Search Terms quick-run identity must remain unchanged',
);
assert.equal(
  googleApi.GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
  reporting.GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
  'the existing shared Google API boundary must expose the new family contract',
);

assert.deepEqual(reporting.GOOGLE_ADS_SEARCH_REPORTING_MONETARY_FIELDS, [
  'average_cpc_micros',
  'cost_micros',
  'campaign_budget_amount_micros',
  'cpc_bid_micros',
  'effective_cpc_bid_micros',
  'effective_target_cpa_micros',
]);
assert.ok(
  reporting.GOOGLE_ADS_SEARCH_REPORTING_MONETARY_FIELDS.every((field) => field.endsWith('_micros')),
  'provider monetary units must stay explicit in canonical field names',
);

console.log(
  'PASS GOOGLE-ADS-SEARCH-REPORTING-CONTRACT-001: source, dataset, resource-mode, compatibility, and provider-native micros contracts are exact',
);
