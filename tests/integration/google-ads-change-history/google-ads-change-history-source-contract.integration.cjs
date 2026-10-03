const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const sourceModule = require(
  path.join(
    buildRoot,
    'main/sources/google-ads/google-ads-change-history-source.js',
  ),
);

assert.ok(
  sourceModule.GoogleAdsChangeHistorySource,
  'Google Ads Change History source class must exist',
);

console.log(
  'PASS GOOGLE-ADS-CHANGE-HISTORY-SOURCE-CONTRACT-001: source class exists',
);
