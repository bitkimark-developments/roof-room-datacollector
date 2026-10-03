const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const modulePath = path.join(
  buildRoot,
  'shared/google-ads-change-history.js',
);

assert.ok(
  fs.existsSync(modulePath),
  'the shared Google Ads Change History contract module must exist',
);

const changeHistory = require(modulePath);

assert.equal(
  changeHistory.GOOGLE_ADS_CHANGE_HISTORY_SOURCE_ID,
  'google-ads-change-history',
);

assert.deepEqual(
  changeHistory.GOOGLE_ADS_CHANGE_HISTORY_DATASET_TYPES,
  [
    'CHANGE_HISTORY',
  ],
);

console.log(
  'PASS GOOGLE-ADS-CHANGE-HISTORY-CONTRACT-001: source identity and dataset identity are exact',
);
