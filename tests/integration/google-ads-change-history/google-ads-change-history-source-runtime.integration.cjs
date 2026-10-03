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

assert.ok(
  runtimeModule.createProductionCollectionRuntime,
  'production runtime factory must exist',
);

const fakeRepository = {
  getRun() {
    return {
      run_id: 'run-test',
      workspace_id: 'workspace-test',
    };
  },
  getSourceConnection() {
    return null;
  },
  upsertSourceConnection() {},
};

const fakeCredentialStore = {};

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
  async collect() {
    throw new Error('not used');
  },
};

const runtime =
  runtimeModule.createProductionCollectionRuntime({
    repository: fakeRepository,
    credentialStore: fakeCredentialStore,
    directories: fakeDirectories,
    googleTrendsSource: fakeGoogleTrendsSource,
  });

assert.ok(
  runtime.source_registry,
  'runtime must expose source registry',
);

assert.ok(
  runtime.source_registry
    .list()
    .some(
      (source) =>
        source.id === 'google-ads-change-history',
    ),
  'Google Ads Change History must be registered in production runtime',
);

console.log(
  'PASS GOOGLE-ADS-CHANGE-HISTORY-SOURCE-RUNTIME-001: production runtime source registration is locked',
);
