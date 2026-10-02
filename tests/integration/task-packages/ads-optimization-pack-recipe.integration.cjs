const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const {
  ADS_OPTIMIZATION_PACK_V1_RECIPE,
  ADS_OPTIMIZATION_PACK_V2_RECIPE,
} = require(path.join(buildRoot, 'main/task-packages/ads-optimization-pack-recipe.js'));
const {
  countCalendarDays,
  gapDays,
  lastCompleteCalendarDays,
} = require(path.join(buildRoot, 'main/task-packages/task-package-window.js'));

const expectedModes = {
  CAMPAIGN_PERFORMANCE: 'campaign',
  AD_GROUP_PERFORMANCE: 'ad_group',
  KEYWORD_PERFORMANCE: 'keyword_view',
  SEARCH_TERMS: 'search_term_view',
  AD_PERFORMANCE: 'ad_group_ad',
  RSA_ASSET_PERFORMANCE: 'ad_group_ad_asset_view',
};

assert.equal(ADS_OPTIMIZATION_PACK_V1_RECIPE.recipe_id, 'ADS_OPTIMIZATION_PACK');
assert.equal(ADS_OPTIMIZATION_PACK_V1_RECIPE.recipe_version, 1);
assert.equal(
  ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.every(
    ({ dataset_schema_version }) => dataset_schema_version === 1,
  ),
  true,
  'historical v1 recipe must remain explicit',
);

assert.equal(ADS_OPTIMIZATION_PACK_V2_RECIPE.recipe_id, 'ADS_OPTIMIZATION_PACK');
assert.equal(ADS_OPTIMIZATION_PACK_V2_RECIPE.recipe_version, 2);
assert.equal(ADS_OPTIMIZATION_PACK_V2_RECIPE.label, 'Kampanya Gelişim');
assert.equal(ADS_OPTIMIZATION_PACK_V2_RECIPE.account_identity_field, 'customer_id');
assert.equal(ADS_OPTIMIZATION_PACK_V2_RECIPE.current_window_days, 7);
assert.equal(ADS_OPTIMIZATION_PACK_V2_RECIPE.required_evidence.length, 6);
assert.equal(new Set(ADS_OPTIMIZATION_PACK_V2_RECIPE.required_evidence.map(({ dataset_type }) => dataset_type)).size, 6);

for (const requirement of ADS_OPTIMIZATION_PACK_V2_RECIPE.required_evidence) {
  assert.equal(requirement.source_id, 'google-ads-search-reporting');
  assert.equal(requirement.resource_mode, expectedModes[requirement.dataset_type]);
  assert.equal(requirement.acquisition_mode, 'OFFICIAL_API');
  assert.equal(requirement.campaign_scope, 'SEARCH');
  assert.equal(requirement.dataset_schema_version, 2);
  assert.equal(requirement.row_date_field, 'performance_date');
}

const serialized = JSON.stringify(ADS_OPTIMIZATION_PACK_V2_RECIPE);
assert.equal(serialized.includes('google-ads-search-terms'), false);
assert.equal(serialized.includes('PERFORMANCE_MAX'), false);

const current = lastCompleteCalendarDays('2026-09-30', 7);
assert.deepEqual(current, { start: '2026-09-23', end: '2026-09-29' });
assert.equal(countCalendarDays(current), 7);
assert.equal(countCalendarDays({ start: '2024-02-23', end: '2024-02-29' }), 7);
assert.equal(
  gapDays(
    { start: '2026-09-08', end: '2026-09-14' },
    { start: '2026-09-23', end: '2026-09-29' },
  ),
  8,
);
assert.equal(
  gapDays(
    { start: '2026-09-16', end: '2026-09-22' },
    { start: '2026-09-23', end: '2026-09-29' },
  ),
  0,
);
assert.throws(
  () => gapDays(
    { start: '2026-09-20', end: '2026-09-26' },
    { start: '2026-09-23', end: '2026-09-29' },
  ),
  /overlap|before/i,
);
assert.throws(() => lastCompleteCalendarDays('2026-02-30', 7), /date/i);
assert.throws(() => lastCompleteCalendarDays('2026-09-30', 0), /day_count/i);

console.log('PASS ADS-OPTIMIZATION-PACK-RECIPE-001: recipe identity, six SEARCH requirements, and seven-day calendar windows are exact');
