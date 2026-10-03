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
  buildGoogleAdsChangeHistoryQuery,
} = requestModule;

const query = buildGoogleAdsChangeHistoryQuery({
  requested_date_start: '2026-01-01',
  requested_date_end: '2026-01-31',
});

assert.equal(
  query,
  [
    'SELECT',
    'change_event.change_date_time,',
    'change_event.user_email,',
    'change_event.client_type,',
    'change_event.change_resource_type,',
    'change_event.change_resource_name,',
    'change_event.resource_change_operation',
    'FROM change_event',
    "WHERE change_event.change_date_time >= '2026-01-01'",
    "AND change_event.change_date_time <= '2026-01-31'",
  ].join(' '),
);

console.log(
  'PASS GOOGLE-ADS-CHANGE-HISTORY-REQUEST-001: exact GAQL shape is locked',
);
