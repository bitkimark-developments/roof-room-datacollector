const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const runtimeModule = require(
  path.join(
    buildRoot,
    'main/app/production-collection-runtime.js',
  ),
);

const fakeRepository = {
  getRun() {
    return {
      run_id: 'rr_20260101T000000000_abcdef',
      workspace_id: 'workspace-test',
    };
  },
  getSourceConnection() {
    return null;
  },
  upsertSourceConnection() {},
};

const fakeCredentialStore = {};

const fakeGoogleTrendsSource = {
  id: 'google-trends',
  name: 'Google Trends',
  sourceMode: 'GOOGLE_TRENDS_UI',
  datasetTypes: ['INTEREST_OVER_TIME'],
  getCapabilities() {
    return {};
  },
  async checkReadiness() {
    return {
      source_id: 'google-trends',
      readiness_status: 'READY',
      checked_at: new Date().toISOString(),
      message: null,
    };
  },
};

const fakeDirectories = {
  app_data_root: '/tmp/roofroom-test',
  config: '/tmp/roofroom-test/config',
  data: '/tmp/roofroom-test/data',
  runs: '/tmp/roofroom-test/data/runs',
  database: '/tmp/roofroom-test/data/database/database.sqlite',
  browser_profiles: '/tmp/roofroom-test/browser-profiles',
  logs: '/tmp/roofroom-test/data/logs',
  public_downloads: '/tmp/roofroom-test/downloads',
};

const runtime =
  runtimeModule.createProductionCollectionRuntime({
    repository: fakeRepository,
    credentialStore: fakeCredentialStore,
    directories: fakeDirectories,
    googleTrendsSource: fakeGoogleTrendsSource,
  });

assert.ok(
  runtime.validator_registry,
);

assert.ok(
  runtime.validator_registry.get(
    'google-ads-change-history',
  ),
  'Google Ads Change History validator must be registered',
);

console.log(
  'PASS GOOGLE-ADS-CHANGE-HISTORY-RUNTIME-VALIDATOR-001: validator registration is locked',
);
