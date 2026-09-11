const assert = require('node:assert/strict');
const { buildDataPackage } = require(`${process.argv[2]}/main/export/data-package-exporter.js`);

const run = { run_id: 'rr_test', workspace_id: 'ws_a', run_status: 'COMPLETED_WITH_WARNINGS', selected_sources: ['google-trends', 'serpapi'] };
const jobs = [
  { job_id: 'job_gt', source_id: 'google-trends', job_key: 'GT-01', execution_status: 'COMPLETED', validation_status: 'VALID', accepted_artifact_id: 'art_gt' },
  { job_id: 'job_serp', source_id: 'serpapi', job_key: 'q-1', execution_status: 'FAILED', validation_status: 'ERROR_NOT_DATA', accepted_artifact_id: null },
];
const datasets = [
  { source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', rows: [{ query: 'ficus', relative_interest: null }] },
  { source_id: 'serpapi', dataset_type: 'GOOGLE_SERP', rows: null, failure: { code: 'ERROR_NOT_DATA' } },
];

const all = buildDataPackage({ run, jobs, datasets, mode: 'ALL' });
assert.deepEqual(all.datasets.map((dataset) => dataset.source_id), ['google-trends']);
assert.equal(all.manifest.run_id, 'rr_test');
assert.equal(all.manifest.failed_jobs, 1);
assert.equal(all.datasets[0].rows[0].relative_interest, null);
assert.deepEqual(all.failures, [{ source_id: 'serpapi', job_key: 'q-1', code: 'ERROR_NOT_DATA' }]);

const successful = buildDataPackage({ run, jobs, datasets, mode: 'SUCCESSFUL_ONLY' });
assert.deepEqual(successful.datasets.map((dataset) => dataset.source_id), ['google-trends']);
assert.equal(successful.failures.length, 0);
assert.notEqual(successful.datasets, all.datasets);

console.log('PASS DATA-PACKAGE-001: separate source datasets, provenance manifest, failed-source omission, and NULL preservation are deterministic');

