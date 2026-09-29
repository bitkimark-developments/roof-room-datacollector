const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Missing buildRoot or workRoot');
const load = (file) => require(path.join(buildRoot, file));
const { resolveDesktopDatePolicy } = load('shared/desktop-run-resolution.js');
const { DESKTOP_TASK_CATALOG } = load('desktop-task-catalog.js');
const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
const { createProductionCollectionRuntime } = load('main/app/production-collection-runtime.js');
const { GoogleApiRuntimeFactory } = load('main/sources/google-api/google-api-runtime.js');
const { initializeDatabase, getDatabasePath } = load('main/storage/database.js');
const { StateRepository } = load('main/storage/state-repository.js');
const { fetchGscQuery } = load('main/sources/google-search-console/query-page-adapter.js');

const SOURCE = 'google-search-console-query-page';
const QUERY_SOURCE = 'google-search-console-query';
const POLICY_CURRENT = 'TODAY_MINUS_90_TO_YESTERDAY';
const POLICY_LONG = 'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY';

const expectedContextCurrent = {
  task_id: 'gsc-current-90-days', source_id: SOURCE,
  reference_date: '2026-09-17', date_policy: POLICY_CURRENT,
  requested_date_start: '2026-06-19', requested_date_end: '2026-09-16',
};

const credentials = {
  readCredential: async () => JSON.stringify({ client_id: 'fixture', refresh_token: 'fixture-refresh', developer_token: 'fixture-developer' }),
};

test('GSC-TASK-CATALOG-001: desktop catalog exposes the new 28-day GSC tasks', () => {
  const queryTask =
    DESKTOP_TASK_CATALOG.find(
      (task) =>
        task.task_id ===
        'gsc-query-current-previous-28-days',
    );

  assert.ok(
    queryTask,
    'GSC Query current + previous 28-day task must be present.',
  );
  assert.equal(
    queryTask.source_id,
    'google-search-console-query',
  );

  const queryPageTask =
    DESKTOP_TASK_CATALOG.find(
      (task) =>
        task.task_id ===
        'gsc-query-page-current-28-days',
    );

  assert.ok(
    queryPageTask,
    'GSC Query × Page current 28-day task must be present.',
  );
  assert.equal(
    queryPageTask.source_id,
    'google-search-console-query-page',
  );
  assert.equal(
    queryPageTask.date_policy,
    'TODAY_MINUS_28_TO_YESTERDAY',
  );
});

test('GSC-DATE-28-001: current 28 days resolves to exactly 28 complete days ending yesterday', () => {
  const range = resolveDesktopDatePolicy(
    'TODAY_MINUS_28_TO_YESTERDAY',
    '2026-09-17',
  );

  assert.deepEqual(range, {
    reference_date: '2026-09-17',
    date_policy: 'TODAY_MINUS_28_TO_YESTERDAY',
    requested_date_start: '2026-08-20',
    requested_date_end: '2026-09-16',
  });
});

test('GSC-DATE-28-002: previous 28 days immediately precedes the current 28-day window', () => {
  const range = resolveDesktopDatePolicy(
    'TODAY_MINUS_56_TO_TODAY_MINUS_29',
    '2026-09-17',
  );

  assert.deepEqual(range, {
    reference_date: '2026-09-17',
    date_policy: 'TODAY_MINUS_56_TO_TODAY_MINUS_29',
    requested_date_start: '2026-07-23',
    requested_date_end: '2026-08-19',
  });
});

test('GSC-QUERY-001: query-only adapter requests only the query dimension', async () => {
  const requests = [];

  const result = await fetchGscQuery(
    {
      site_url: 'sc-domain:bitkimark.com',
      start_date: '2026-08-20',
      end_date: '2026-09-16',
    },
    async (request) => {
      requests.push(request);
      return {
        status: 200,
        body: {
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
      };
    },
  );

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.dimensions, ['query']);
  assert.deepEqual(result.rows, [
    {
      query: 'ficus',
      clicks: 3,
      impressions: 10,
      ctr: 0.3,
      position: 2.5,
    },
  ]);
});

test('GSC-QUERY-SOURCE-001: query source reuses the existing GSC connection and produces query-only raw artifact', async () => {
  const requestedConnectionSourceIds = [];
  const requests = [];

  const factory = new GoogleApiRuntimeFactory(
    {
      getSourceConnection: (_workspaceId, sourceId) => {
        requestedConnectionSourceIds.push(sourceId);

        if (sourceId !== SOURCE) {
          return null;
        }

        return {
          workspace_id: 'workspace-1',
          source_id: SOURCE,
          credential_ref: 'fixture-credential',
          safe_metadata: {
            site_url: 'sc-domain:bitkimark.com',
          },
        };
      },
      upsertSourceConnection: () => {},
    },
    credentials,
    async (request) => {
      if (request.url === 'https://oauth2.googleapis.com/token') {
        return {
          status: 200,
          body: {
            access_token: 'fixture-access',
            expires_in: 3600,
          },
        };
      }

      requests.push(request);

      return {
        status: 200,
        body: {
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
      };
    },
  );

  const source = factory.createSearchConsoleQuerySource({
    workspace_id: 'workspace-1',
  });

  assert.equal(source.id, QUERY_SOURCE);
  assert.deepEqual(source.datasetTypes, ['QUERY']);

  const result = await source.collect({
    source_id: QUERY_SOURCE,
    source_context: {
      requested_date_start: '2026-08-20',
      requested_date_end: '2026-09-16',
    },
  });

  assert.deepEqual(
    requestedConnectionSourceIds,
    [SOURCE],
    'Query source must reuse the existing GSC Workspace connection.',
  );

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.dimensions, ['query']);

  assert.equal(result.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(result.preferred_filename, 'gsc-query.json');
});

test('GSC-QUERY-REVIEW-001: Query Review resolves current and previous 28-day windows as two jobs', async (t) => {
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(workRoot, `query-review-${key}`)]),
  );
  directories.app_data_root = path.join(workRoot, 'query-review');
  directories.runs = path.join(directories.data, 'runs');

  for (const directory of Object.values(directories)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  assert.equal(initializeDatabase(directories).status, 'READY');

  const repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());

  const workspace = repository.createWorkspace({
    workspace_name: 'GSC Query 28-day test',
  });

  let clock = new Date('2026-09-17T12:00:00.000Z');

  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    now: () => clock,
    readiness: {
      getReadiness: async () => ({
        readiness_status: 'READY',
      }),
    },
  });

  const draft = await controller.createDraft({
    workspace_id: workspace.workspace_id,
    origin: { kind: 'BLANK' },
  });

  draft.reusable_configuration = {
    sources: {
      [QUERY_SOURCE]: {
        included: true,
        task_id: 'gsc-query-current-previous-28-days',
      },
    },
  };

  const review = await controller.reviewDraft(draft);

  assert.ok(
    review.reviewed_draft,
    'GSC Query Review must produce an absolute-date reviewed draft.',
  );

  const reviewedSource =
    review.reviewed_draft.resolved_configuration.sources[QUERY_SOURCE];

  assert.deepEqual(reviewedSource.date_ranges, [
    {
      job_key: 'gsc-query-current-28',
      task_id: 'gsc-query-current-previous-28-days',
      period: 'CURRENT_28_DAYS',
      requested_date_start: '2026-08-20',
      requested_date_end: '2026-09-16',
    },
    {
      job_key: 'gsc-query-previous-28',
      task_id: 'gsc-query-current-previous-28-days',
      period: 'PREVIOUS_28_DAYS',
      requested_date_start: '2026-07-23',
      requested_date_end: '2026-08-19',
    },
  ]);

  assert.equal(review.job_count, 2);
  assert.equal(review.can_start, true);

  const started = await controller.startDraft(review.reviewed_draft);

  assert.equal(started.jobs.length, 2);
  assert.deepEqual(
    started.jobs.map((job) => job.job_key).sort(),
    ['gsc-query-current-28', 'gsc-query-previous-28'],
  );
});

test('GSC-QUERY-PAGE-28-001: Query × Page Review resolves current 28 complete days', async (t) => {
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(workRoot, `query-page-28-${key}`)]),
  );
  directories.app_data_root = path.join(workRoot, 'query-page-28');
  directories.runs = path.join(directories.data, 'runs');

  for (const directory of Object.values(directories)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  assert.equal(initializeDatabase(directories).status, 'READY');

  const repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());

  const workspace = repository.createWorkspace({
    workspace_name: 'GSC Query Page 28-day test',
  });

  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    now: () => new Date('2026-09-17T12:00:00.000Z'),
    readiness: {
      getReadiness: async () => ({
        readiness_status: 'READY',
      }),
    },
  });

  const draft = await controller.createDraft({
    workspace_id: workspace.workspace_id,
    origin: { kind: 'BLANK' },
  });

  draft.reusable_configuration = {
    sources: {
      [SOURCE]: {
        included: true,
        task_id: 'gsc-query-page-current-28-days',
        date_policy: 'TODAY_MINUS_28_TO_YESTERDAY',
      },
    },
  };

  const review = await controller.reviewDraft(draft);

  assert.ok(
    review.reviewed_draft,
    'GSC Query × Page 28-day Review must produce an absolute-date artifact.',
  );

  const reviewedSource =
    review.reviewed_draft.resolved_configuration.sources[SOURCE];

  assert.deepEqual(reviewedSource.date_ranges, [
    {
      job_key: 'gsc-query-page-current-28-days',
      task_id: 'gsc-query-page-current-28-days',
      requested_date_start: '2026-08-20',
      requested_date_end: '2026-09-16',
    },
  ]);

  assert.equal(review.job_count, 1);
  assert.equal(review.can_start, true);
});

test('GSC-REVIEW-BOUND-001: Review → atomic persisted Job → production requester survives next-day Start and reopen (Current 90 Days)', async (t) => {
  const directories = Object.fromEntries(['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads'].map(key => [key, path.join(workRoot, key)]));
  directories.app_data_root = workRoot;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  let repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'GSC test' });
  repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture-credential', safe_metadata: { site_url: 'sc-domain:bitkimark.com' } });

  let clock = new Date('2026-09-17T12:00:00.000Z');
  const controller = new DesktopMultiSourceController({ repository, application_version: 'test', now: () => clock, readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) } });

  const draft = await controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  draft.reusable_configuration = { sources: { [SOURCE]: { included: true, task_id: 'gsc-current-90-days', date_policy: POLICY_CURRENT } } };

  const review = await controller.reviewDraft(draft);
  assert.ok(review.reviewed_draft, 'GSC Review must return an absolute-date artifact');
  assert.equal(review.can_start, true);
  const reviewed = structuredClone(review.reviewed_draft);
  const reviewedSource = reviewed.resolved_configuration.sources[SOURCE];
  // 90 days before Sept 17 2026 is June 19 2026
  assert.equal(reviewedSource.date_ranges[0].requested_date_start, '2026-06-19');
  assert.equal(reviewedSource.date_ranges[0].requested_date_end, '2026-09-16');

  clock = new Date('2026-09-18T12:00:00.000Z');
  const started = await controller.startDraft(review.reviewed_draft);

  repository.close();
  repository = new StateRepository(getDatabasePath(directories));
  const jobs = repository.listJobs(started.run.run_id);
  assert.equal(jobs[0].source_context.requested_date_start, '2026-06-19');

  const requests = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    assert.match(url, /www\.googleapis\.com\/webmasters\/v3\/sites/);
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json({ rows: [{ keys: ['ficus', 'https://bitkimark.com/ficus'], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }] });
  };

  const runtime = createProductionCollectionRuntime({ repository, directories, credentialStore: credentials, googleTrendsSource: { id: 'google-trends' } });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);


  const body = requests[0].body;
  assert.equal(body.startDate, '2026-06-19', 'Actual GSC request must contain the exactly reviewed start date');
  assert.equal(body.endDate, '2026-09-16', 'Actual GSC request must contain the exactly reviewed end date');
  assert.deepEqual(body.dimensions, ['query', 'page'], 'Dimensions must remain unchanged');
});

test('GSC-SOURCE-CONTEXT-001: source uses explicit context and rejects unsupported scope', async () => {
  const requests = [];
  const factory = new GoogleApiRuntimeFactory({ getSourceConnection: () => ({ source_id: SOURCE, credential_ref: 'fixture', safe_metadata: { site_url: 'sc-domain:bitkimark.com' } }) }, credentials, async request => {
    if (request.url === 'https://oauth2.googleapis.com/token') return { status: 200, body: { access_token: 'fixture', expires_in: 3600 } };
    requests.push(request);
    return { status: 200, body: { rows: [] } };
  });

  const source = factory.createSearchConsoleSource({ workspace_id: 'fixture', start_date: '1999-01-01', end_date: '1999-01-02' });
  const context = { source_id: SOURCE, source_context: expectedContextCurrent };

  assert.equal((await source.collect(context)).result_type, 'ARTIFACT_PRODUCED');
  assert.equal(requests[0].body.startDate, '2026-06-19');
  assert.equal(requests[0].body.endDate, '2026-09-16');

  const second = { ...expectedContextCurrent, requested_date_start: '2026-09-01', requested_date_end: '2026-09-17' };
  await source.collect({ ...context, source_context: second });
  assert.equal(requests[1].body.startDate, '2026-09-01');
  assert.equal(requests[1].body.endDate, '2026-09-17');

  for (const invalid of [
    { ...expectedContextCurrent, requested_date_start: '2026-02-30' },
    { ...expectedContextCurrent, requested_date_start: '2026-09-18' },
    { ...expectedContextCurrent, requested_date_start: '2026-09-16', requested_date_end: '2026-09-10' }, // reversed
    {},
  ]) {
    assert.equal((await source.collect({ ...context, source_context: invalid })).result_type, 'FAILED');
  }
});

test('GSC-REVIEW-BOUND-002: Long 16 Months reviewed request binding', async (t) => {
  const directories = Object.fromEntries(['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads'].map(key => [key, path.join(workRoot, key)]));
  directories.app_data_root = workRoot;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  const repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'GSC test 2' });
  repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture-credential', safe_metadata: { site_url: 'sc-domain:bitkimark.com' } });

  let clock = new Date('2026-09-17T12:00:00.000Z');
  const controller = new DesktopMultiSourceController({ repository, application_version: 'test', now: () => clock, readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) } });

  const draft = await controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  draft.reusable_configuration = { sources: { [SOURCE]: { included: true, task_id: 'gsc-long-16-months', date_policy: POLICY_LONG } } };

  const review = await controller.reviewDraft(draft);
  const reviewedSource = review.reviewed_draft.resolved_configuration.sources[SOURCE];
  // 16 months before Sept 2026 is May 2025. Start of May 2025 to yesterday (Sept 16 2026)
  assert.equal(reviewedSource.date_ranges[0].requested_date_start, '2025-05-17');
  assert.equal(reviewedSource.date_ranges[0].requested_date_end, '2026-09-16');

  const started = await controller.startDraft(review.reviewed_draft);

  const requests = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json({ rows: [{ keys: ['long', 'https://bitkimark.com/long'], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }] });
  };

  const runtime = createProductionCollectionRuntime({ repository, directories, credentialStore: credentials, googleTrendsSource: { id: 'google-trends' } });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);

  assert.equal(requests.length, 1);
  const body = requests[0].body;
  assert.equal(body.startDate, '2025-05-17');
  assert.equal(body.endDate, '2026-09-16');
});
