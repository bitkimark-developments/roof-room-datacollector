const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildDataPackage, writeDataPackage } = require(`${process.argv[2]}/main/export/data-package-exporter.js`);

const run = { run_id: 'rr_test', workspace_id: 'ws_a', run_status: 'COMPLETED_WITH_WARNINGS', selected_sources: ['google-trends', 'serpapi'] };
const jobs = [
  { job_id: 'job_gt', source_id: 'google-trends', job_key: 'GT-01', execution_status: 'COMPLETED', validation_status: 'VALID', accepted_artifact_id: 'art_gt' },
  { job_id: 'job_serp', source_id: 'serpapi', job_key: 'q-1', execution_status: 'FAILED', validation_status: 'ERROR_NOT_DATA', accepted_artifact_id: null },
];
const datasets = [
  { source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', job_id: 'job_gt', job_key: 'GT-01', rows: [{ query: 'ficus', relative_interest: null }] },
  { source_id: 'serpapi', dataset_type: 'GOOGLE_SERP', job_id: 'job_serp', job_key: 'q-1', rows: null, failure: { code: 'ERROR_NOT_DATA' } },
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

const failureMatrix = buildDataPackage({
  run: { ...run, run_status: 'FAILED' },
  jobs: [
    { job_id: 'job_date', source_id: 'google-trends', job_key: 'GT-DATE', execution_status: 'COMPLETED', validation_status: 'DATE_MISMATCH', accepted_artifact_id: null },
    { job_id: 'job_cancelled', source_id: 'ikas-products', job_key: 'ikas-cancelled', execution_status: 'CANCELLED', validation_status: 'NOT_RUN', accepted_artifact_id: null },
  ],
  datasets: [],
  mode: 'ALL',
});
assert.deepEqual(failureMatrix.failures, [
  { source_id: 'google-trends', job_key: 'GT-DATE', code: 'DATE_MISMATCH' },
  { source_id: 'ikas-products', job_key: 'ikas-cancelled', code: 'CANCELLED' },
]);
assert.throws(
  () => buildDataPackage({
    run,
    jobs,
    datasets: [{ source_id: 'serpapi', dataset_type: 'GOOGLE_SERP', job_id: 'job_gt', job_key: 'GT-01', rows: [] }],
    mode: 'ALL',
  }),
  /identity does not match/i,
  'A dataset must not borrow another Job identity or source.',
);

console.log('PASS DATA-PACKAGE-001: separate source datasets, provenance manifest, failed-source omission, and NULL preservation are deterministic');

const repeatedJobs = [
  { job_id: 'job_gt_01', source_id: 'google-trends', job_key: 'GT-01', execution_status: 'COMPLETED', validation_status: 'VALID', accepted_artifact_id: 'art_gt_01' },
  { job_id: 'job_gt_02', source_id: 'google-trends', job_key: 'GT-02', execution_status: 'COMPLETED', validation_status: 'LOW_DATA', accepted_artifact_id: 'art_gt_02' },
];
const repeated = buildDataPackage({
  run: { ...run, run_status: 'COMPLETED', selected_sources: ['google-trends'] },
  jobs: repeatedJobs,
  datasets: [
    { source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', job_id: 'job_gt_01', job_key: 'GT-01', rows: [{ query: 'ficus', relative_interest: 42 }], provenance: { raw_artifact_id: 'art_gt_01', sha256: 'a'.repeat(64) } },
    { source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', job_id: 'job_gt_02', job_key: 'GT-02', rows: [{ query: 'saksı', relative_interest: null }], provenance: { raw_artifact_id: 'art_gt_02', sha256: 'b'.repeat(64) } },
  ],
  mode: 'ALL',
});

assert.deepEqual(repeated.datasets.map((dataset) => dataset.job_key), ['GT-01', 'GT-02']);
const outputRoot = process.argv[3];
writeDataPackage(outputRoot, repeated).then(() => {
  const firstName = 'google-trends_interest_over_time_gt-01_job_gt_01.json';
  const secondName = 'google-trends_interest_over_time_gt-02_job_gt_02.json';
  assert.equal(fs.existsSync(path.join(outputRoot, firstName)), true);
  assert.equal(fs.existsSync(path.join(outputRoot, secondName)), true);
  const index = JSON.parse(fs.readFileSync(path.join(outputRoot, 'DATASETS.json'), 'utf8'));
  assert.deepEqual(index.map(({ filename, job_id, job_key, row_count, provenance }) => ({ filename, job_id, job_key, row_count, provenance })), [
    { filename: firstName, job_id: 'job_gt_01', job_key: 'GT-01', row_count: 1, provenance: { raw_artifact_id: 'art_gt_01', sha256: 'a'.repeat(64) } },
    { filename: secondName, job_id: 'job_gt_02', job_key: 'GT-02', row_count: 1, provenance: { raw_artifact_id: 'art_gt_02', sha256: 'b'.repeat(64) } },
  ]);
  console.log('PASS DATA-PACKAGE-IDENTITY-001: repeated source datasets use collision-safe Job filenames and persist provenance');
}).catch((error) => { console.error(error); process.exitCode = 1; });
