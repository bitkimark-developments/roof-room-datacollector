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

const SOURCE = 'google-search-console-query-page';
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
