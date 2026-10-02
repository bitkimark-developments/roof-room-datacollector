const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const desktop = require(
  path.join(buildRoot, 'shared/desktop-multisource.js'),
);
const connections = require(
  path.join(buildRoot, 'shared/workspace-connection-management.js'),
);

assert.ok(
  desktop.SUPPORTED_DESKTOP_SOURCE_IDS.includes('google-analytics-4'),
  'GA4 must be a supported desktop source',
);

const ga4ModulePath = path.join(
  buildRoot,
  'shared/google-analytics-4.js',
);

assert.ok(
  fs.existsSync(ga4ModulePath),
  'the shared GA4 contract module must exist',
);

const ga4 = require(ga4ModulePath);

assert.equal(
  ga4.GOOGLE_ANALYTICS_4_SOURCE_ID,
  'google-analytics-4',
);

assert.deepEqual(
  ga4.GA4_DATASET_TYPES,
  [
    'GA4_CONTENT_PERFORMANCE',
    'GA4_PAID_FUNNEL',
  ],
);

assert.equal(
  new Set(ga4.GA4_DATASET_TYPES).size,
  2,
  'the two approved GA4 datasets must remain independently identifiable',
);

console.log(
  'PASS GA4-CONTRACT-001: source identity, desktop registration, and dataset identities are exact',
);
