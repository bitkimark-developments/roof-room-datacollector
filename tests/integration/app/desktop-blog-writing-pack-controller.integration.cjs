const assert = require('node:assert/strict');

const {
  DesktopBlogWritingPackController,
  DesktopBlogWritingPackControllerError,
} = require(`${process.argv[2]}/main/app/desktop-blog-writing-pack-controller.js`);

const run = (status = 'COMPLETED') => ({
  run_id: 'run_blog_desktop', workspace_id: 'ws_blog', run_status: status,
  created_at: '2026-10-01T10:00:00.000Z', started_at: '2026-10-01T10:01:00.000Z', completed_at: '2026-10-01T10:30:00.000Z',
  application_version: '1.0.0', selected_sources: ['google-search-console-query-page'], requested_configuration: null, configuration_snapshot: {},
});

const acceptedJob = {
  job_id: 'job_gsc', run_id: 'run_blog_desktop', source_id: 'google-search-console-query-page', job_key: 'GSC01', query_group_id: null,
  source_context: {}, job_order: 0, execution_status: 'COMPLETED', validation_status: 'VALID', attempt_count: 1,
  accepted_artifact_id: 'artifact_gsc', created_at: '2026-10-01T10:00:00.000Z', started_at: '2026-10-01T10:01:00.000Z', completed_at: '2026-10-01T10:02:00.000Z',
};

const acceptedDataset = {
  source_id: 'google-search-console-query-page', dataset_type: 'QUERY_PAGE', job_id: 'job_gsc', job_key: 'GSC01',
  rows: [{ query: 'ficus', page: '/ficus', clicks: 0, impressions: 10, ctr: 0, position: 1 }],
  provenance: { run_id: 'run_blog_desktop', workspace_id: 'ws_blog', job_id: 'job_gsc', job_key: 'GSC01', source_id: 'google-search-console-query-page', validation_status: 'VALID' },
};

const createHarness = ({ runRecord = run(), jobs = [acceptedJob], datasets = [acceptedDataset], broadLoadError = null } = {}) => {
  const calls = { getRun: 0, listJobs: 0, load: 0, loadedJobIds: [], publish: 0, assemblies: [] };
  let packageSequence = 0;
  const controller = new DesktopBlogWritingPackController({
    repository: {
      getRun: (runId) => { calls.getRun += 1; return runRecord?.run_id === runId ? structuredClone(runRecord) : null; },
      listJobs: (runId) => { calls.listJobs += 1; return runId === runRecord?.run_id ? structuredClone(jobs) : []; },
    },
    loader: {
      loadRunDatasets: async (runId) => {
        calls.load += 1;
        assert.equal(runId, runRecord.run_id);
        if (broadLoadError !== null) throw broadLoadError;
        return structuredClone(datasets);
      },
      loadAcceptedJobDataset: async (runId, jobId) => {
        calls.load += 1;
        calls.loadedJobIds.push(jobId);
        assert.equal(runId, runRecord.run_id);
        const dataset = datasets.find((candidate) => candidate.job_id === jobId);
        if (dataset === undefined) throw new Error(`Unexpected dataset load: ${jobId}`);
        return structuredClone(dataset);
      },
    },
    publish: async (assembly) => {
      calls.publish += 1;
      calls.assemblies.push(structuredClone(assembly));
      return { package_id: assembly.manifest.package_id, manifest: assembly.manifest };
    },
    now: () => '2026-10-01T13:00:00.000Z',
    application_version: '1.0.0',
    create_package_id: () => `blog_pkg_${++packageSequence}`,
  });
  return { controller, calls };
};

const expectCode = async (promise, code) => assert.rejects(promise, (error) => {
  assert.equal(error instanceof DesktopBlogWritingPackControllerError, true);
  assert.equal(error.code, code);
  return true;
});

(async () => {
  await expectCode(createHarness({ runRecord: null, jobs: [], datasets: [] }).controller.build('missing'), 'UNKNOWN_RUN');
  for (const status of ['PENDING', 'RUNNING', 'RETRY_REQUIRED']) {
    const harness = createHarness({ runRecord: run(status) });
    await expectCode(harness.controller.build('run_blog_desktop'), 'RUN_NOT_TERMINAL');
    assert.equal(harness.calls.load, 0);
    assert.equal(harness.calls.publish, 0);
  }

  const pendingJob = { ...acceptedJob, execution_status: 'PENDING', validation_status: 'NOT_RUN', accepted_artifact_id: null };
  const notReadyHarness = createHarness({ jobs: [pendingJob], datasets: [] });
  const notReady = await notReadyHarness.controller.build('run_blog_desktop');
  assert.equal(notReady.status, 'NOT_READY');
  assert.equal(notReady.run_id, 'run_blog_desktop');
  assert.equal(notReady.missing_datasets.length, 7);
  assert.equal(notReadyHarness.calls.publish, 0);

  for (const status of ['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED']) {
    const harness = createHarness({ runRecord: run(status) });
    const result = await harness.controller.build('run_blog_desktop');
    assert.equal(result.status, 'PACKAGE_PUBLISHED');
    assert.equal(result.package.run_id, 'run_blog_desktop');
    assert.equal(result.package.coverage_status, 'PARTIAL');
    assert.deepEqual(result.package.present_datasets, ['QUERY_PAGE']);
    assert.equal(harness.calls.publish, 1);
    assert.equal(harness.calls.assemblies[0].data_package.datasets[0].rows[0].clicks, 0);
  }

  const repeatedHarness = createHarness();
  const first = await repeatedHarness.controller.build('run_blog_desktop');
  const second = await repeatedHarness.controller.build('run_blog_desktop');
  assert.equal(first.status, 'PACKAGE_PUBLISHED');
  assert.equal(second.status, 'PACKAGE_PUBLISHED');
  assert.notEqual(first.package.package_id, second.package.package_id);
  assert.deepEqual(repeatedHarness.calls.assemblies.map(({ manifest }) => manifest.package_id), ['blog_pkg_1', 'blog_pkg_2']);
  assert.equal(repeatedHarness.calls.getRun, 2);
  assert.equal(repeatedHarness.calls.listJobs, 2);
  assert.equal(repeatedHarness.calls.load, 2);
  assert.equal(repeatedHarness.calls.publish, 2);

  const unrelatedAcceptedJob = {
    ...acceptedJob,
    job_id: 'job_unrelated',
    source_id: 'google-ads-search-reporting',
    job_key: 'CAMPAIGN_PERFORMANCE',
    accepted_artifact_id: 'artifact_unrelated',
  };
  const recipeFilteredHarness = createHarness({
    jobs: [acceptedJob, unrelatedAcceptedJob],
    broadLoadError: new Error('Unsupported unrelated accepted evidence'),
  });
  const recipeFiltered = await recipeFilteredHarness.controller.build('run_blog_desktop');
  assert.equal(recipeFiltered.status, 'PACKAGE_PUBLISHED');
  assert.deepEqual(recipeFilteredHarness.calls.loadedJobIds, ['job_gsc']);

  console.log('PASS DESKTOP-BLOG-CONTROLLER-001: terminal local evidence builds immutable snapshots without acquisition, retry, or Core mutation');
})().catch((error) => { console.error(error); process.exitCode = 1; });
