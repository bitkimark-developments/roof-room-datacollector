const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const [buildRoot, workRoot] = process.argv.slice(2);
const load = (file) => require(path.join(buildRoot, file));
const { resolveDesktopDatePolicy } = load('shared/desktop-run-resolution.js');
const { DESKTOP_TASK_CATALOG } = load('desktop-task-catalog.js');
const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
const { createProductionCollectionRuntime } = load('main/app/production-collection-runtime.js');
const { GoogleApiRuntimeFactory } = load('main/sources/google-api/google-api-runtime.js');
const { initializeDatabase, getDatabasePath } = load('main/storage/database.js');
const { StateRepository } = load('main/storage/state-repository.js');
const SOURCE = 'google-ads-search-terms';
const POLICY = 'TODAY_MINUS_17_TO_YESTERDAY';
const expectedContext = {
  task_id: SOURCE, source_id: SOURCE, source_mode: 'search_term_view', campaign_type: 'SEARCH',
  reference_date: '2026-09-17', date_policy: POLICY,
  requested_date_start: '2026-08-31', requested_date_end: '2026-09-16',
};
const credentials = {
  readCredential: async () => JSON.stringify({ client_id: 'fixture', refresh_token: 'fixture-refresh', developer_token: 'fixture-developer' }),
};

test('ADS-REVIEW-DATE-001: 17 calendar days crosses the month boundary exactly', () => {
  assert.deepEqual(resolveDesktopDatePolicy(POLICY, '2026-09-17'), {
    reference_date: '2026-09-17', date_policy: POLICY,
    requested_date_start: '2026-08-31', requested_date_end: '2026-09-16',
  });
});

test('ADS-REVIEW-BOUND-001: Review → atomic persisted Job → production requester survives next-day Start and reopen', async (t) => {
  const directories = Object.fromEntries(['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads'].map(key => [key, path.join(workRoot, key)]));
  directories.app_data_root = workRoot;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  let repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'Ads test' });
  repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture-credential', safe_metadata: { customer_id: '123-456-7890' } });
  let clock = new Date('2026-09-17T12:00:00.000Z');
  const controller = new DesktopMultiSourceController({ repository, application_version: 'test', now: () => clock, readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) } });
  const task = DESKTOP_TASK_CATALOG.find(task => task.task_id === SOURCE);
  const draft = await controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  draft.reusable_configuration = { sources: { [SOURCE]: { included: true, task_id: task.task_id, date_policy: task.date_policy } } };
  const review = await controller.reviewDraft(draft);
  assert.ok(review.reviewed_draft, 'Ads Review must return an absolute-date artifact');
  assert.equal(review.can_start, true);
  const reviewed = structuredClone(review.reviewed_draft);
  const reviewedSource = reviewed.resolved_configuration.sources[SOURCE];
  assert.equal(reviewedSource.requested_date_start, '2026-08-31');
  assert.equal(reviewedSource.requested_date_end, '2026-09-16');
  assert.equal(reviewed.reference_date, '2026-09-17');
  clock = new Date('2026-09-18T12:00:00.000Z');
  const started = await controller.startDraft(review.reviewed_draft);
  assert.deepEqual(review.reviewed_draft, reviewed, 'Start must not mutate Review');
  assert.deepEqual(started.jobs[0].source_context, expectedContext);
  assert.equal(started.run.configuration_snapshot.requested_date_start, '2026-08-31');
  assert.equal(started.run.configuration_snapshot.requested_date_end, '2026-09-16');
  assert.equal(started.run.configuration_snapshot.reference_date, '2026-09-17');
  assert.deepEqual(repository.getLastRunSettings(workspace.workspace_id).reusable_configuration, reviewed.reusable_configuration);
  await assert.rejects(() => controller.startDraft(reviewed), /active Run/i);
  assert.equal(repository.listRuns(workspace.workspace_id).length, 1);
  repository.close();
  repository = new StateRepository(getDatabasePath(directories));
  assert.deepEqual(repository.listJobs(started.run.run_id)[0].source_context, expectedContext);

  const requests = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    assert.equal(url, 'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream');
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    // Existing adapter fixture contract; not a claim of live response acceptance.
    return Response.json([{ search_term: 'ficus', impressions: 2, clicks: 1 }]);
  };
  const runtime = createProductionCollectionRuntime({ repository, directories, credentialStore: credentials, googleTrendsSource: { id: 'google-trends' } });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);
  assert.equal(requests.length, 1, 'Production orchestration must reach the mocked Ads requester');
  const query = requests[0].body.query;
  assert.match(query, /FROM search_term_view\b/);
  assert.match(query, /campaign\.advertising_channel_type\s*=\s*'SEARCH'/);
  const dates = query.match(/segments\.date BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
  assert.ok(dates, 'Actual GAQL must contain an absolute date restriction');
  assert.deepEqual(dates.slice(1), [reviewedSource.requested_date_start, reviewedSource.requested_date_end]);
  assert.equal(repository.listJobs(started.run.run_id)[0].execution_status, 'COMPLETED');
  assert.deepEqual(repository.listJobs(started.run.run_id)[0].source_context, expectedContext);
  console.log(`ADS MOCK REQUEST: ${query}`);
});

test('ADS-SOURCE-CONTEXT-001: source uses each explicit context and rejects unsupported scope before requests', async () => {
  const requests = [];
  const factory = new GoogleApiRuntimeFactory({ getSourceConnection: () => ({ source_id: SOURCE, credential_ref: 'fixture', safe_metadata: { customer_id: '123' } }) }, credentials, async request => {
    if (request.url === 'https://oauth2.googleapis.com/token') return { status: 200, body: { access_token: 'fixture', expires_in: 3600 } };
    requests.push(request);
    return { status: 200, body: [] };
  });
  const source = factory.createSearchTermsSource({ workspace_id: 'fixture', query: 'SELECT stale_constructor_query' });
  const context = { source_id: SOURCE, source_context: expectedContext };
  assert.equal((await source.collect(context)).result_type, 'ARTIFACT_PRODUCED');
  assert.match(requests[0].body.query, /segments\.date BETWEEN '2026-08-31' AND '2026-09-16'/);
  const second = { ...expectedContext, requested_date_start: '2026-09-01', requested_date_end: '2026-09-17' };
  await source.collect({ ...context, source_context: second });
  assert.match(requests[1].body.query, /segments\.date BETWEEN '2026-09-01' AND '2026-09-17'/);
  for (const invalid of [
    { ...expectedContext, campaign_type: 'PERFORMANCE_MAX' },
    { ...expectedContext, source_mode: 'campaign_search_term_view' },
    { ...expectedContext, task_id: 'other-task' },
    { ...expectedContext, requested_date_start: '2026-02-30' },
    { ...expectedContext, requested_date_start: '2026-09-18' },
    {},
  ]) {
    assert.equal((await source.collect({ ...context, source_context: invalid })).result_type, 'FAILED');
  }
  assert.equal(requests.length, 2, 'Invalid context must never reach the provider');
});
