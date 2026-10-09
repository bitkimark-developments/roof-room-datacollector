const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const { ADS_OPTIMIZATION_PACK_V1_RECIPE } = require(path.join(
  buildRoot,
  'main/task-packages/ads-optimization-pack-recipe.js',
));
const { TaskPackageEvidenceResolver } = require(path.join(
  buildRoot,
  'main/task-packages/task-package-evidence-resolver.js',
));

const requirement = {
  ...ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence[0],
  dataset_schema_version: 2,
};
const recipe = {
  ...ADS_OPTIMIZATION_PACK_V1_RECIPE,
  recipe_version: 2,
  required_evidence: [requirement],
};
const currentWindow = { start: '2026-09-23', end: '2026-09-29' };
const accountIdentity = { field: 'customer_id', value: '1234567890' };

const makeCandidate = ({
  id,
  start = currentWindow.start,
  end = currentWindow.end,
  validation = 'VALID',
  rows = [{ performance_date: currentWindow.start, clicks: 0, conversions: null }],
  acquiredAt = '2026-09-01T08:00:00.000Z',
  workspaceId = 'ws_a',
  context = {},
  job = {},
  artifact = {},
}) => {
  const runRecord = {
    run_id: `run_${id}`,
    workspace_id: workspaceId,
    run_status: 'COMPLETED',
    created_at: acquiredAt,
    started_at: acquiredAt,
    completed_at: acquiredAt,
    application_version: '1.0.0',
    selected_sources: ['google-ads-search-reporting'],
    requested_configuration: null,
    configuration_snapshot: {},
  };
  const jobRecord = {
    job_id: `job_${id}`,
    run_id: runRecord.run_id,
    source_id: 'google-ads-search-reporting',
    job_key: 'CAMPAIGN_PERFORMANCE',
    query_group_id: null,
    source_context: {
      source_id: 'google-ads-search-reporting',
      dataset_type: 'CAMPAIGN_PERFORMANCE',
      resource_mode: 'campaign',
      campaign_type: 'SEARCH',
      customer_id: '1234567890',
      requested_date_start: start,
      requested_date_end: end,
      dataset_schema_version: 2,
      ...context,
    },
    job_order: 1,
    execution_status: 'COMPLETED',
    validation_status: validation,
    attempt_count: 1,
    accepted_artifact_id: `artifact_${id}`,
    created_at: acquiredAt,
    started_at: acquiredAt,
    completed_at: acquiredAt,
    ...job,
  };
  const artifactRecord = {
    artifact_id: `artifact_${id}`,
    run_id: runRecord.run_id,
    job_id: jobRecord.job_id,
    attempt_number: 1,
    source_id: jobRecord.source_id,
    artifact_kind: 'RAW_SOURCE_FILE',
    artifact_state: validation === 'LOW_DATA' ? 'ACCEPTED_WITH_WARNING' : 'ACCEPTED',
    filename: `${id}.json`,
    relative_path: `google-ads-search-reporting/raw/${id}.json`,
    media_type: 'application/json',
    byte_size: 10,
    sha256: id.padEnd(64, 'a').slice(0, 64),
    created_at: acquiredAt,
    ...artifact,
  };
  return { run: runRecord, job: jobRecord, artifact: artifactRecord, rows };
};

const resolve = async (candidates, { reverse = false, loaderFailure = null } = {}) => {
  const ordered = reverse ? [...candidates].reverse() : [...candidates];
  const runs = ordered.map(({ run }) => run);
  const jobs = new Map(ordered.map(({ run, job }) => [run.run_id, [job]]));
  const artifacts = new Map(ordered.map(({ artifact }) => [artifact.artifact_id, artifact]));
  const datasets = new Map(ordered.map(({ job, rows }) => [job.job_id, {
    source_id: job.source_id,
    dataset_type: job.source_context.dataset_type,
    job_id: job.job_id,
    job_key: job.job_key,
    rows,
  }]));
  const repository = {
    listRuns: () => runs,
    listJobs: (runId) => jobs.get(runId) ?? [],
    getArtifact: (artifactId) => artifacts.get(artifactId) ?? null,
  };
  const loader = {
    loadAcceptedJobDataset: async (_runId, jobId) => {
      if (loaderFailure === jobId) throw new Error('synthetic loader failure');
      const dataset = datasets.get(jobId);
      if (!dataset) throw new Error(`Unknown fixture Job: ${jobId}`);
      return JSON.parse(JSON.stringify(dataset));
    },
  };
  return new TaskPackageEvidenceResolver(repository, loader).resolveCurrent({
    recipe,
    workspace_id: 'ws_a',
    account_identity: accountIdentity,
    current_window: currentWindow,
  });
};

async function main() {
  const oldExact = makeCandidate({
    id: 'old_exact',
    acquiredAt: '2026-08-01T08:00:00.000Z',
  });
  const [oldResolution] = await resolve([oldExact]);
  assert.equal(oldResolution.status, 'READY', 'Acquisition date must not be an eligibility filter.');
  assert.equal(oldResolution.evidence.disposition, 'REUSED_EXACT');
  assert.equal(oldResolution.evidence.origin.acquired_at, '2026-08-01T08:00:00.000Z');
  assert.equal(oldResolution.evidence.origin.snapshot_observed_at, '2026-08-01T08:00:00.000Z');
  assert.equal(oldResolution.rows[0].clicks, 0);
  assert.equal(oldResolution.rows[0].conversions, null);

  const widerNewer = makeCandidate({
    id: 'wider_newer',
    start: '2026-09-20',
    end: '2026-09-30',
    acquiredAt: '2026-09-30T12:00:00.000Z',
    rows: [
      { performance_date: '2026-09-22', clicks: 99 },
      { performance_date: '2026-09-23', clicks: 0, conversions: null },
      { performance_date: '2026-09-29', clicks: 3 },
      { performance_date: '2026-09-30', clicks: 88 },
    ],
  });
  const [exactPreferred] = await resolve([widerNewer, oldExact]);
  assert.equal(exactPreferred.evidence.origin.job_id, oldExact.job.job_id, 'Exact coverage wins over newer filtered coverage.');

  const narrow = makeCandidate({
    id: 'narrow', start: '2026-09-22', end: '2026-09-30', acquiredAt: '2026-09-02T00:00:00.000Z',
    rows: widerNewer.rows,
  });
  const wide = makeCandidate({
    id: 'wide', start: '2026-09-01', end: '2026-09-30', acquiredAt: '2026-09-29T00:00:00.000Z',
    rows: widerNewer.rows,
  });
  const [narrowest] = await resolve([wide, narrow]);
  assert.equal(narrowest.evidence.origin.job_id, narrow.job.job_id, 'Narrowest containing range wins.');

  const sameRangeOlder = makeCandidate({
    id: 'same_old', start: '2026-09-22', end: '2026-09-30', acquiredAt: '2026-08-01T00:00:00.000Z', rows: widerNewer.rows,
  });
  const sameRangeNewer = makeCandidate({
    id: 'same_new', start: '2026-09-22', end: '2026-09-30', acquiredAt: '2026-08-02T00:00:00.000Z', rows: widerNewer.rows,
  });
  const [newest] = await resolve([sameRangeOlder, sameRangeNewer]);
  const [newestReversed] = await resolve([sameRangeOlder, sameRangeNewer], { reverse: true });
  assert.equal(newest.evidence.origin.job_id, sameRangeNewer.job.job_id);
  assert.equal(newestReversed.evidence.origin.job_id, sameRangeNewer.job.job_id);

  const [filtered] = await resolve([widerNewer]);
  assert.equal(filtered.status, 'READY');
  assert.equal(filtered.evidence.disposition, 'REUSED_FILTERED');
  assert.deepEqual(filtered.rows.map(({ performance_date }) => performance_date), ['2026-09-23', '2026-09-29']);
  assert.equal(filtered.rows[0].clicks, 0);
  assert.equal(filtered.rows[0].conversions, null);
  assert.deepEqual(filtered.evidence.transformation, {
    kind: 'DATE_FILTER',
    row_date_field: 'performance_date',
    input_window: { start: '2026-09-20', end: '2026-09-30' },
    output_window: currentWindow,
    input_row_count: 4,
    output_row_count: 2,
  });

  const exactNoData = makeCandidate({ id: 'exact_no_data', validation: 'NO_DATA', rows: [] });
  const [exactNoDataResolution] = await resolve([exactNoData]);
  assert.equal(exactNoDataResolution.status, 'READY');
  assert.equal(exactNoDataResolution.evidence.disposition, 'NO_DATA');
  assert.deepEqual(exactNoDataResolution.rows, []);

  const broadNoData = makeCandidate({
    id: 'broad_no_data', start: '2026-09-20', end: '2026-09-30', validation: 'NO_DATA', rows: [],
  });
  const [broadNoDataResolution] = await resolve([broadNoData]);
  assert.equal(broadNoDataResolution.status, 'MISSING');
  assert.ok(broadNoDataResolution.reason_codes.includes('NO_DATA_REQUIRES_EXACT_WINDOW'));

  const aggregate = makeCandidate({
    id: 'aggregate', start: '2026-09-20', end: '2026-09-30', rows: [{ clicks: 10 }],
  });
  const [aggregateResolution] = await resolve([aggregate]);
  assert.equal(aggregateResolution.status, 'MISSING');
  assert.ok(aggregateResolution.reason_codes.includes('DAILY_ROWS_REQUIRED'));

  const invalidDate = makeCandidate({
    id: 'invalid_date', start: '2026-09-20', end: '2026-09-30', rows: [{ performance_date: '2026-02-30' }],
  });
  const [invalidDateResolution] = await resolve([invalidDate]);
  assert.equal(invalidDateResolution.status, 'MISSING');
  assert.ok(invalidDateResolution.reason_codes.includes('INVALID_ROW_DATE'));

  const partial = makeCandidate({ id: 'partial', start: '2026-09-24', end: '2026-09-30' });
  const [partialResolution] = await resolve([partial]);
  assert.equal(partialResolution.status, 'MISSING');
  assert.ok(partialResolution.reason_codes.includes('INCOMPATIBLE_WINDOW'));

  const incompatibleCases = [
    makeCandidate({ id: 'wrong_workspace', workspaceId: 'ws_b' }),
    makeCandidate({ id: 'wrong_customer', context: { customer_id: '999' } }),
    makeCandidate({ id: 'wrong_source', context: { source_id: 'google-ads-search-terms' }, job: { source_id: 'google-ads-search-terms' } }),
    makeCandidate({ id: 'wrong_dataset', context: { dataset_type: 'SEARCH_TERMS' } }),
    makeCandidate({ id: 'wrong_mode', context: { resource_mode: 'search_term_view' } }),
    makeCandidate({ id: 'historical_v1_schema', context: { dataset_schema_version: 1 } }),
    makeCandidate({ id: 'conversion_date_v3_schema', context: { dataset_schema_version: 3 } }),
    makeCandidate({ id: 'wrong_scope', context: { campaign_type: 'PERFORMANCE_MAX' } }),
    makeCandidate({ id: 'invalid_validation', validation: 'INVALID_SCHEMA', artifact: { artifact_state: 'REJECTED' } }),
    makeCandidate({ id: 'missing_artifact', job: { accepted_artifact_id: null } }),
  ];
  for (const candidate of incompatibleCases) {
    const [resolution] = await resolve([candidate]);
    assert.equal(resolution.status, 'MISSING', `Expected ${candidate.job.job_id} to be rejected.`);
  }

  const loaderFailure = makeCandidate({ id: 'loader_failure' });
  const [loaderFailureResolution] = await resolve([loaderFailure], { loaderFailure: loaderFailure.job.job_id });
  assert.equal(loaderFailureResolution.status, 'MISSING');
  assert.ok(loaderFailureResolution.reason_codes.includes('DATASET_LOAD_FAILED'));

  assert.deepEqual(oldExact.rows, [{ performance_date: currentWindow.start, clicks: 0, conversions: null }]);
  console.log('PASS TASK-PACKAGE-EVIDENCE-001: exact reuse, exact-window NO_DATA, daily filtering, incompatibility, provenance, and deterministic ordering are enforced locally');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
