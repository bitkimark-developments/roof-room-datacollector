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
const repository = {
  getRun: () => ({ workspace_id: 'ws-test' }),
  getSourceConnection: () => null,
};
const credentialStore = {
  hasCredential: async () => false,
  readCredential: async () => '',
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
  'google-ads-search-terms',
  'google-keyword-planner',
  'google-search-console-query-page',
  'google-trends',
  'ikas-products',
  'serpapi',
]);
for (const id of ids) assert.doesNotThrow(() => runtime.validator_registry.get(id));
assert.equal(typeof runtime.orchestrator.runUntilBlocked, 'function');
;(async () => {
const context = { run_id: 'run-test', job_id: 'job-test', attempt_id: 'attempt-test', attempt_number: 1, source_id: 'google-trends', job_key: 'group-1', query_group_id: 'group-1', requested_configuration: null, source_context: {} };
await runtime.source_registry.get('google-trends').collect(context);
const fixture = '/tmp/production-composition-ikas.xlsx';
fs.writeFileSync(fixture, Buffer.from('not-a-real-workbook'));
const ikasResult = await runtime.source_registry.get('ikas-products').collect({ ...context, source_id: 'ikas-products', source_context: { file_path: fixture } });
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

console.log('PASS PRODUCTION-SOURCE-COMPOSITION-001');
})().catch((error) => { console.error(error); process.exitCode = 1; });
