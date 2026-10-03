const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const validatorModule = require(
  path.join(
    buildRoot,
    'main/sources/google-ads/google-ads-change-history-validator.js',
  ),
);

const {
  validateGoogleAdsChangeHistoryEvidence,
} = validatorModule;

const result =
  validateGoogleAdsChangeHistoryEvidence({
    source_id: 'google-ads-change-history',
    dataset_type: 'CHANGE_HISTORY',
    request_context: {
      customer_id: '1234567890',
      requested_date_start: '2026-01-01',
      requested_date_end: '2026-01-31',
    },
    raw_artifact: {
      kind: 'GOOGLE_ADS_SEARCH_STREAM',
    },
    rows: [
      {
        change_date_time: '2026-01-01T10:00:00Z',
        user_email: 'user@example.com',
        client_type: 'GOOGLE_ADS_WEB_CLIENT',
        change_resource_type: 'CAMPAIGN',
        change_resource_name: 'customers/123/campaigns/456',
        resource_change_operation: 'UPDATE',
      },
    ],
  });

assert.equal(
  result.status,
  'ACCEPTED',
);

assert.throws(
  () =>
    validateGoogleAdsChangeHistoryEvidence({
      source_id: 'wrong-source',
    }),
);

console.log(
  'PASS GOOGLE-ADS-CHANGE-HISTORY-VALIDATION-001: ownership and evidence semantics are fail closed',
);
