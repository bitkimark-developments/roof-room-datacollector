const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const { createProductionCollectionRuntime } = require(path.join(
  buildRoot,
  'main',
  'app',
  'production-collection-runtime.js',
));

let trendsDispatches = 0;
const requestedConnectionSourceIds = [];
let credentialReads = 0;

const repository = {
  getRun: () => ({ workspace_id: 'ws-test' }),
  getSourceConnection: (workspaceId, sourceId) => {
    assert.equal(workspaceId, 'ws-test');
    requestedConnectionSourceIds.push(sourceId);

    if (sourceId !== 'google-ads-search-terms') {
      return null;
    }

    return {
      connection_id: 'existing-google-ads-connection',
      workspace_id: workspaceId,
      source_id: 'google-ads-search-terms',
      credential_ref: 'existing-google-ads-credential',
      safe_metadata: {
        customer_id: '123-456-7890',
        login_customer_id: '987-654-3210',
      },
      created_at: '2026-10-02T00:00:00.000Z',
      updated_at: '2026-10-02T00:00:00.000Z',
    };
  },
};

const credentialStore = {
  hasCredential: async () => false,
  readCredential: async () => {
    credentialReads += 1;
    return '';
  },
  writeCredential: async () => {},
  deleteCredential: async () => {},
};

const runtime = createProductionCollectionRuntime({
  repository,
  credentialStore,
  directories: {
    app_data_root: '/tmp', config: '/tmp', data: '/tmp', runs: '/tmp', database: '/tmp',
    browser_profiles: '/tmp', logs: '/tmp', public_downloads: '/tmp',
  },
  googleTrendsSource: {
    id: 'google-trends',
    name: 'Google Trends',
    sourceMode: 'GOOGLE_TRENDS_UI',
    datasetTypes: ['INTEREST_OVER_TIME'],
    getCapabilities: () => ({
      requires_browser: true,
      requires_oauth: false,
      may_require_manual_login: true,
      supports_custom_date_range: true,
      supports_direct_export: true,
      supports_api: false,
      supports_resume: false,
      max_concurrency: 1,
    }),
    checkReadiness: async () => ({
      source_id: 'google-trends',
      readiness_status: 'READY',
      checked_at: new Date().toISOString(),
      message: null,
    }),
    collect: async () => { trendsDispatches += 1; return {
      result_type: 'FAILED',
      error_code: 'TEST_ONLY',
      message: null,
    }; },
  },
});

const ids = runtime.source_registry.list().map((source) => source.id).sort();
assert.deepEqual(ids, [
  'bitkimark-sitemap',
  'google-ads-configuration',
  'google-ads-search-reporting',
  'google-ads-search-terms',
  'google-keyword-planner',
  'google-keyword-planner-csv',
  'google-search-console-query',
  'google-search-console-query-page',
  'google-trends',
  'ikas-products',
  'serpapi',
]);
const gscQuerySource =
  runtime.source_registry.get('google-search-console-query');

assert.equal(
  gscQuerySource.sourceMode,
  'OFFICIAL_API',
);

assert.deepEqual(
  [...gscQuerySource.datasetTypes],
  ['QUERY'],
);

const configurationSource =
  runtime.source_registry.get('google-ads-configuration');

assert.equal(
  configurationSource.sourceMode,
  'OFFICIAL_API',
);

assert.deepEqual(
  [...configurationSource.datasetTypes],
  [
    'CAMPAIGN_NEGATIVE_KEYWORDS',
    'AD_GROUP_NEGATIVE_KEYWORDS',
    'SHARED_NEGATIVE_KEYWORDS',
    'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
    'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
    'CONVERSION_ACTIONS',
    'CUSTOMER_CONVERSION_GOALS',
    'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
    'CAMPAIGN_CONVERSION_GOALS',
    'CUSTOM_CONVERSION_GOALS',
    'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
    'CAMPAIGN_SETTINGS',
    'CAMPAIGN_BUDGETS',
    'CAMPAIGN_TARGETING_CRITERIA',
  ],
);

assert.equal(
  configurationSource.datasetTypes.length,
  14,
  'Google Ads configuration must expose exactly fourteen datasets.',
);

assert.equal(
  new Set(configurationSource.datasetTypes).size,
  14,
  'Google Ads configuration dataset IDs must be unique.',
);

assert.equal(
  configurationSource.getCapabilities().supports_custom_date_range,
  false,
  'Google Ads configuration snapshots must not advertise custom date ranges.',
);

assert.equal(
  configurationSource.getCapabilities().supports_api,
  true,
  'Google Ads configuration must remain an OFFICIAL_API source.',
);

assert.equal(
  runtime.source_registry
    .get('google-ads-search-reporting')
    .getCapabilities()
    .supports_custom_date_range,
  true,
  'Existing OFFICIAL_API sources must retain the current custom-date default.',
);

assert.equal(
  runtime.validator_registry
    .get('google-ads-configuration')
    .constructor.name,
  'GoogleAdsConfigurationValidator',
);

for (const id of ids) assert.doesNotThrow(() => runtime.validator_registry.get(id));
assert.equal(typeof runtime.orchestrator.runUntilBlocked, 'function');
;(async () => {
const context = { run_id: 'run-test', job_id: 'job-test', attempt_id: 'attempt-test', attempt_number: 1, source_id: 'google-trends', job_key: 'group-1', query_group_id: 'group-1', requested_configuration: null, source_context: {} };
await runtime.source_registry.get('google-trends').collect(context);

const configurationResolution = await configurationSource.collect({
  ...context,
  source_id: 'google-ads-configuration',
  job_key: 'CONVERSION_ACTIONS',
  source_context: {},
});

assert.equal(
  configurationResolution.result_type,
  'FAILED',
);

assert.equal(
  configurationResolution.error_code,
  'SOURCE_CONFIGURATION_INVALID',
  'Configuration source must resolve through the existing Ads connection before its own immutable-context validation.',
);

assert.deepEqual(
  requestedConnectionSourceIds,
  ['google-ads-search-terms'],
  'Google Ads configuration must reuse only the existing Google Ads Workspace connection boundary.',
);

assert.equal(
  credentialReads,
  0,
  'Resolving Google Ads configuration must not introduce an eager new credential read or credential type.',
);

const fixture = '/tmp/production-composition-ikas.xlsx';
fs.writeFileSync(fixture, Buffer.from('not-a-real-workbook'));
const ikasResult = await runtime.source_registry.get('ikas-products').collect({
  ...context,
  source_id: 'ikas-products',
  source_context: {
    task_id: 'ikas-products-import',
    source_id: 'ikas-products',
    source_mode: 'FILE_IMPORT',
    file_path: fixture,
  },
});
assert.equal(trendsDispatches, 1);
assert.equal(ikasResult.result_type, 'ARTIFACT_PRODUCED');
fs.unlinkSync(fixture);

const gscArtifact = '/tmp/production-composition-gsc.json';
fs.writeFileSync(gscArtifact, JSON.stringify([
  {
    rows: [
      {
        keys: ['ficus', 'https://bitkimark.com/ficus'],
        clicks: 1,
        impressions: 2,
        ctr: 0.5,
        position: 3,
      },
    ],
  },
]));

const gscValidation = await runtime.validator_registry
  .get('google-search-console-query-page')
  .validate({
    job: {
      source_id: 'google-search-console-query-page',
    },
    artifact: {
      source_id: 'google-search-console-query-page',
    },
    absolute_path: gscArtifact,
    source_context: {
      start_date: '2026-06-12',
      end_date: '2026-09-09',
    },
  });

assert.equal(
  gscValidation.validation_status,
  'VALID',
  'GSC validator must accept the raw_pages array artifact emitted by GoogleSearchConsoleSource',
);

fs.unlinkSync(gscArtifact);

const gscQueryArtifact =
  '/tmp/production-composition-gsc-query.json';

fs.writeFileSync(
  gscQueryArtifact,
  JSON.stringify([
    {
      rows: [
        {
          keys: ['ficus'],
          clicks: 3,
          impressions: 10,
          ctr: 0.3,
          position: 2.5,
        },
      ],
    },
  ]),
);

const gscQueryValidation =
  await runtime.validator_registry
    .get('google-search-console-query')
    .validate({
      job: {
        source_id: 'google-search-console-query',
      },
      artifact: {
        source_id: 'google-search-console-query',
      },
      absolute_path: gscQueryArtifact,
      source_context: {
        requested_date_start: '2026-08-20',
        requested_date_end: '2026-09-16',
      },
    });

assert.equal(
  gscQueryValidation.validation_status,
  'VALID',
  'GSC Query validator must accept raw query-only pages.',
);

fs.unlinkSync(gscQueryArtifact);

console.log('PASS PRODUCTION-SOURCE-COMPOSITION-001');
})().catch((error) => { console.error(error); process.exitCode = 1; });
