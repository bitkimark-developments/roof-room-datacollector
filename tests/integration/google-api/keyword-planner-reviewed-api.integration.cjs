const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build and work roots.');

const load = (file) => require(path.join(buildRoot, file));
const { DESKTOP_TASK_CATALOG } = load('desktop-task-catalog.js');
const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
const { createProductionCollectionRuntime } = load('main/app/production-collection-runtime.js');
const { GoogleApiRuntimeFactory } = load('main/sources/google-api/google-api-runtime.js');
const { initializeDatabase, getDatabasePath } = load('main/storage/database.js');
const { StateRepository } = load('main/storage/state-repository.js');

const SOURCE = 'google-keyword-planner';
const TASK = 'keyword-planner-historical-metrics';
const credentials = {
  readCredential: async () => JSON.stringify({
    client_id: 'fixture',
    refresh_token: 'fixture-refresh',
    developer_token: 'fixture-developer',
  }),
};

const groups = [
  {
    group_id: 'indoor-plants',
    group_name: 'Indoor plants',
    keywords: ['ficus', 'monstera deliciosa'],
  },
  {
    group_id: 'care-topics',
    group_name: 'Care topics',
    keywords: ['ficus bakımı', 'monstera bakımı'],
  },
];

const expectedContext = (group) => ({
  task_id: TASK,
  source_id: SOURCE,
  source_mode: 'OFFICIAL_API',
  group_id: group.group_id,
  group_name: group.group_name,
  keywords: group.keywords,
});

test('KEYWORD-PLANNER-SOURCE-CONTEXT-001: each collect call binds its explicit persisted group and rejects invalid context', async () => {
  const requests = [];
  const factory = new GoogleApiRuntimeFactory({
    getSourceConnection: () => ({
      source_id: SOURCE,
      credential_ref: 'fixture',
      safe_metadata: { customer_id: '123' },
    }),
  }, credentials, async (request) => {
    if (request.url === 'https://oauth2.googleapis.com/token') {
      return { status: 200, body: { access_token: 'fixture', expires_in: 3600 } };
    }
    requests.push(request);
    return {
      status: 200,
      body: request.body.keywords.map((keyword) => ({
        requested_keyword: keyword,
        metrics: { avg_monthly_searches: 10, monthly_search_volumes: [] },
      })),
    };
  });

  const source = factory.createKeywordPlannerSource({ workspace_id: 'fixture' });
  for (const group of groups) {
    const result = await source.collect({
      source_id: SOURCE,
      source_context: expectedContext(group),
    });
    assert.equal(result.result_type, 'ARTIFACT_PRODUCED');
    assert.match(result.preferred_filename, new RegExp(group.group_id));
  }

  assert.deepEqual(requests.map((request) => request.body.keywords), groups.map((group) => group.keywords));

  for (const invalid of [
    { ...expectedContext(groups[0]), task_id: 'other-task' },
    { ...expectedContext(groups[0]), source_id: 'google-ads-search-terms' },
    { ...expectedContext(groups[0]), source_mode: 'FILE_IMPORT' },
    { ...expectedContext(groups[0]), group_id: '' },
    { ...expectedContext(groups[0]), keywords: [] },
    { ...expectedContext(groups[0]), keywords: ['ficus', ''] },
    {},
  ]) {
    const result = await source.collect({ source_id: SOURCE, source_context: invalid });
    assert.equal(result.result_type, 'FAILED');
    assert.equal(result.error_code, 'SOURCE_CONFIGURATION_INVALID');
  }
  assert.equal(requests.length, 2, 'Invalid context must not reach the provider.');
});

test('KEYWORD-PLANNER-REVIEW-BOUND-001: Review persists exact groups and production Core sends one request per group', async (t) => {
  const root = path.join(workRoot, 'review-bound');
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(root, key)]),
  );
  directories.app_data_root = root;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');

  let repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'Keyword Planner test' });
  repository.upsertSourceConnection({
    workspace_id: workspace.workspace_id,
    source_id: SOURCE,
    credential_ref: 'fixture-credential',
    safe_metadata: { customer_id: '123-456-7890' },
  });

  let clock = new Date('2026-09-18T09:30:00.000Z');
  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    now: () => clock,
    readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) },
  });
  const task = DESKTOP_TASK_CATALOG.find((item) => item.task_id === TASK);
  assert.ok(task);
  const draft = controller.createDraft({
    workspace_id: workspace.workspace_id,
    origin: { kind: 'BLANK' },
  });
  draft.reusable_configuration = {
    sources: {
      [SOURCE]: {
        included: true,
        task_id: TASK,
        groups,
      },
    },
  };

  const invalidDraft = structuredClone(draft);
  invalidDraft.reusable_configuration.sources[SOURCE].groups = [
    groups[0],
    { ...groups[1], group_id: groups[0].group_id },
  ];
  const invalidReview = await controller.reviewDraft(invalidDraft);
  assert.equal(invalidReview.reviewed_draft, null);
  assert.equal(invalidReview.job_count, 0);
  assert.equal(invalidReview.can_start, false, 'Invalid or duplicate groups must fail closed during Review.');

  const review = await controller.reviewDraft(draft);
  assert.equal(review.can_start, true);
  assert.equal(review.job_count, 2);
  assert.ok(review.reviewed_draft, 'Keyword Planner Review must return a locked group artifact.');
  assert.deepEqual(review.reviewed_draft.resolved_configuration.sources[SOURCE].groups, groups.map(expectedContext));
  const reviewed = structuredClone(review.reviewed_draft);

  clock = new Date('2026-09-19T09:30:00.000Z');
  const started = await controller.startDraft(review.reviewed_draft);
  assert.deepEqual(review.reviewed_draft, reviewed, 'Start must not mutate or rebuild reviewed groups.');
  assert.deepEqual(started.jobs.map((job) => job.source_context), groups.map(expectedContext));
  assert.equal(started.run.configuration_snapshot.reference_date, '2026-09-18');
  assert.equal(started.run.configuration_snapshot.requested_date_start, null);
  assert.equal(started.run.configuration_snapshot.requested_date_end, null);

  repository.close();
  repository = new StateRepository(getDatabasePath(directories));
  assert.deepEqual(repository.listJobs(started.run.run_id).map((job) => job.source_context), groups.map(expectedContext));

  const providerRequests = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    }
    assert.equal(url, 'https://googleads.googleapis.com/v25/customers/1234567890:generateKeywordHistoricalMetrics');
    const request = { url, ...options, body: JSON.parse(options.body) };
    providerRequests.push(request);
    return Response.json(request.body.keywords.map((keyword) => ({
      requested_keyword: keyword,
      metrics: {
        avg_monthly_searches: 10,
        competition: 'LOW',
        competition_index: null,
        low_top_of_page_bid_micros: null,
        high_top_of_page_bid_micros: null,
        monthly_search_volumes: [{ year: 2026, month: 8, monthly_searches: 10 }],
      },
    })));
  };

  const runtime = createProductionCollectionRuntime({
    repository,
    directories,
    credentialStore: credentials,
    googleTrendsSource: { id: 'google-trends' },
  });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);
  assert.deepEqual(providerRequests.map((request) => request.body.keywords), groups.map((group) => group.keywords));
  assert.equal(repository.getRun(started.run.run_id).run_status, 'COMPLETED');
  assert.deepEqual(repository.listJobs(started.run.run_id).map((job) => job.execution_status), ['COMPLETED', 'COMPLETED']);

  const rawDirectory = path.join(directories.runs, started.run.run_id, SOURCE, 'raw');
  const rawFiles = fs.readdirSync(rawDirectory).filter((file) => file.endsWith('.json')).sort();
  assert.equal(rawFiles.length, 2, 'Each group must retain independent raw provider evidence.');
  assert.notEqual(rawFiles[0], rawFiles[1]);
});
