const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const parserModule = require(
  path.join(
    buildRoot,
    'main/sources/google-ads/google-ads-change-history-adapter.js',
  ),
);

const {
  normalizeGoogleAdsChangeHistoryRows,
} = parserModule;

const rows = normalizeGoogleAdsChangeHistoryRows([
  {
    change_event: {
      change_date_time: '2026-01-01T10:00:00Z',
      user_email: 'user@example.com',
      client_type: 'GOOGLE_ADS_WEB_CLIENT',
      change_resource_type: 'CAMPAIGN',
      change_resource_name: 'customers/123/campaigns/456',
      resource_change_operation: 'UPDATE',
    },
  },
]);

assert.deepEqual(
  rows,
  [
    {
      change_date_time: '2026-01-01T10:00:00Z',
      user_email: 'user@example.com',
      client_type: 'GOOGLE_ADS_WEB_CLIENT',
      change_resource_type: 'CAMPAIGN',
      change_resource_name: 'customers/123/campaigns/456',
      resource_change_operation: 'UPDATE',
    },
  ],
);

console.log(
  'PASS GOOGLE-ADS-CHANGE-HISTORY-PARSER-001: provider rows normalize without changing semantics',
);
