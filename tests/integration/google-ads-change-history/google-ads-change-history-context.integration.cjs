const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const requestModule = require(
  path.join(
    buildRoot,
    'main/sources/google-ads/google-ads-change-history-request.js',
  ),
);

const {
  createGoogleAdsChangeHistoryJobContext,
} = requestModule;

const context = createGoogleAdsChangeHistoryJobContext({
  source_id: 'google-ads-change-history',
  dataset_type: 'CHANGE_HISTORY',
  customer_id: '1234567890',
  requested_date_start: '2026-01-01',
  requested_date_end: '2026-01-31',
  dataset_schema_version: 1,
});

assert.deepEqual(
  context,
  {
    source_id: 'google-ads-change-history',
    dataset_type: 'CHANGE_HISTORY',
    customer_id: '1234567890',
    requested_date_start: '2026-01-01',
    requested_date_end: '2026-01-31',
    dataset_schema_version: 1,
  },
);

assert.throws(
  () => createGoogleAdsChangeHistoryJobContext({
    source_id: 'google-ads-change-history',
    dataset_type: 'CHANGE_HISTORY',
    customer_id: 'abc',
    requested_date_start: '2026-01-01',
    requested_date_end: '2026-01-31',
    dataset_schema_version: 1,
  }),
);

assert.throws(
  () => createGoogleAdsChangeHistoryJobContext({
    source_id: 'google-ads-change-history',
    dataset_type: 'CHANGE_HISTORY',
    customer_id: '1234567890',
    requested_date_start: '2026-02-01',
    requested_date_end: '2026-01-31',
    dataset_schema_version: 1,
  }),
);

console.log(
  'PASS GOOGLE-ADS-CHANGE-HISTORY-CONTEXT-001: reviewed job context validation is exact',
);
