const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build and work roots.');
const { evaluateFreshness } = require(path.join(buildRoot, 'main/core/freshness.js'));
const { initializeDatabase, getDatabasePath } = require(path.join(buildRoot, 'main/storage/database.js'));
const { StateRepository } = require(path.join(buildRoot, 'main/storage/state-repository.js'));
const {
  FreshnessRegistry,
  FreshnessRegistryError,
  resolveConfiguredIntervalPolicy,
} = require(path.join(buildRoot, 'main/core/freshness-registry.js'));
const { DesktopMultiSourceController } = require(path.join(buildRoot, 'main/app/desktop-multisource-controller.js'));

const NOW = '2026-09-18T12:00:00.000Z';
const interval = {
  kind: 'INTERVAL',
  fresh_for_ms: 24 * 60 * 60 * 1000,
  stale_after_ms: 72 * 60 * 60 * 1000,
};

test('FRESHNESS-CALCULATOR-001: all states and exact interval boundaries are deterministic', () => {
  assert.deepEqual(evaluateFreshness({ kind: 'UNKNOWN' }, null, NOW), {
    freshness_status: 'UNKNOWN',
    evaluated_at: NOW,
    last_successful_at: null,
    next_due_at: null,
  });
  assert.equal(evaluateFreshness({ kind: 'ON_DEMAND' }, null, NOW).freshness_status, 'ON_DEMAND');
  assert.equal(evaluateFreshness({ kind: 'ON_DEMAND' }, '2026-09-18T10:00:00.000Z', NOW).freshness_status, 'ON_DEMAND');
  assert.equal(evaluateFreshness({ kind: 'MANUAL_IMPORT' }, null, NOW).freshness_status, 'IMPORT_NEEDED');
  assert.equal(evaluateFreshness({ kind: 'MANUAL_IMPORT' }, '2026-09-18T10:00:00.000Z', NOW).freshness_status, 'FRESH');

  const fresh = evaluateFreshness(interval, '2026-09-17T12:00:00.001Z', NOW);
  assert.equal(fresh.freshness_status, 'FRESH');
  assert.equal(fresh.next_due_at, '2026-09-18T12:00:00.001Z');
  assert.equal(evaluateFreshness(interval, '2026-09-17T12:00:00.000Z', NOW).freshness_status, 'DUE');
  assert.equal(evaluateFreshness(interval, '2026-09-15T12:00:00.001Z', NOW).freshness_status, 'DUE');
  assert.equal(evaluateFreshness(interval, '2026-09-15T12:00:00.000Z', NOW).freshness_status, 'STALE');
  assert.equal(evaluateFreshness(interval, null, NOW).freshness_status, 'DUE');
});

test('FRESHNESS-CALCULATOR-002: invalid policy/timestamps fail closed', () => {
  for (const policy of [
    { kind: 'INTERVAL', fresh_for_ms: 0, stale_after_ms: 1 },
    { kind: 'INTERVAL', fresh_for_ms: 1000, stale_after_ms: 999 },
    { kind: 'OTHER' },
  ]) {
    assert.throws(() => evaluateFreshness(policy, null, NOW));
  }
  assert.throws(() => evaluateFreshness(interval, '2026-09-18', NOW));
  assert.throws(() => evaluateFreshness(interval, '2026-09-19T12:00:00.000Z', NOW));
  assert.throws(() => evaluateFreshness(interval, null, 'invalid'));
});

test('FRESHNESS-ACCEPTANCE-001: only accepted completed Jobs advance source success history', (t) => {
  const root = path.join(workRoot, 'acceptance');
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
  const workspace = repository.createWorkspace({ workspace_name: 'Freshness acceptance' });
  const otherWorkspace = repository.createWorkspace({ workspace_name: 'Freshness isolation' });
  const created = repository.createRunFromJobPlans({
    workspace_id: workspace.workspace_id,
    application_version: 'test',
    configuration_snapshot: { source_id: 'google-search-console-query-page' },
    job_plans: [
      { source_id: 'google-search-console-query-page', job_key: 'accepted', query_group_id: null, source_context: {} },
      { source_id: 'google-search-console-query-page', job_key: 'rejected', query_group_id: null, source_context: {} },
    ],
  });
  assert.equal(repository.getLatestAcceptedSourceCompletion(workspace.workspace_id, 'google-search-console-query-page'), null);

  const acceptedAttempt = repository.startAttempt(created.jobs[0].job_id);
  const acceptedArtifact = repository.registerCandidateArtifact({
    attempt_id: acceptedAttempt.attempt_id,
    filename: 'accepted.json', relative_path: 'gsc/raw/accepted.json',
    media_type: 'application/json', byte_size: 2, sha256: null,
  });
  repository.transitionJobExecution(created.jobs[0].job_id, 'VALIDATING');
  repository.recordValidationSummary({
    attempt_id: acceptedAttempt.attempt_id, artifact_id: acceptedArtifact.artifact_id,
    validation_status: 'VALID', checks_total: 1, checks_passed: 1,
    checks_warning: 0, checks_failed: 0, validation_json_path: null,
  });
  assert.equal(repository.getLatestAcceptedSourceCompletion(workspace.workspace_id, 'google-search-console-query-page'), null, 'Accepted artifact alone is not a completed acquisition.');
  repository.transitionJobExecution(created.jobs[0].job_id, 'COMPLETED', { validation_status: 'VALID' });
  const acceptedJob = repository.getJob(created.jobs[0].job_id);
  assert.ok(acceptedJob?.completed_at);
  assert.equal(
    repository.getLatestAcceptedSourceCompletion(workspace.workspace_id, 'google-search-console-query-page'),
    acceptedJob.completed_at,
  );

  const rejectedAttempt = repository.startAttempt(created.jobs[1].job_id);
  const rejectedArtifact = repository.registerCandidateArtifact({
    attempt_id: rejectedAttempt.attempt_id,
    filename: 'rejected.json', relative_path: 'gsc/raw/rejected.json',
    media_type: 'application/json', byte_size: 2, sha256: null,
  });
  repository.transitionJobExecution(created.jobs[1].job_id, 'VALIDATING');
  repository.recordValidationSummary({
    attempt_id: rejectedAttempt.attempt_id, artifact_id: rejectedArtifact.artifact_id,
    validation_status: 'INVALID_SCHEMA', checks_total: 1, checks_passed: 0,
    checks_warning: 0, checks_failed: 1, validation_json_path: null,
  });
  repository.transitionJobExecution(created.jobs[1].job_id, 'FAILED', { error_code: 'VALIDATION_REJECTED' });
  assert.equal(
    repository.getLatestAcceptedSourceCompletion(workspace.workspace_id, 'google-search-console-query-page'),
    acceptedJob.completed_at,
  );
  assert.equal(repository.getLatestAcceptedSourceCompletion(otherWorkspace.workspace_id, 'google-search-console-query-page'), null);
  assert.equal(repository.getLatestAcceptedSourceCompletion(workspace.workspace_id, 'serpapi'), null);

  repository.close();
  repository = new StateRepository(getDatabasePath(directories));
  assert.equal(
    repository.getLatestAcceptedSourceCompletion(workspace.workspace_id, 'google-search-console-query-page'),
    acceptedJob.completed_at,
  );
});

test('FRESHNESS-REGISTRY-001: approved defaults and explicit interval policies remain independent of readiness', () => {
  const completions = new Map([
    ['ws-a:serpapi', '2025-01-01T00:00:00.000Z'],
    ['ws-a:ikas-products', '2026-09-18T10:00:00.000Z'],
  ]);
  const registry = new FreshnessRegistry({
    getLatestAcceptedSourceCompletion: (workspaceId, sourceId) =>
      completions.get(`${workspaceId}:${sourceId}`) ?? null,
  }, () => new Date(NOW));
  registry.register('serpapi', () => ({ kind: 'ON_DEMAND' }));
  registry.register('ikas-products', (context) =>
    resolveConfiguredIntervalPolicy(context.source_config, { kind: 'MANUAL_IMPORT' }));
  registry.register('google-search-console-query-page', (context) =>
    resolveConfiguredIntervalPolicy(context.source_config, { kind: 'UNKNOWN' }));
  registry.register('google-ads-search-terms', (context) =>
    resolveConfiguredIntervalPolicy(context.source_config, { kind: 'UNKNOWN' }));

  const serp = registry.getFreshness('ws-a', 'serpapi', {
    freshness_policy: { kind: 'INTERVAL', fresh_for_hours: 1, stale_after_hours: 2 },
  });
  assert.equal(serp.freshness_status, 'ON_DEMAND', 'SerpApi must ignore scheduling configuration.');
  assert.equal(serp.last_successful_at, '2025-01-01T00:00:00.000Z');
  assert.equal(registry.getFreshness('ws-a', 'ikas-products').freshness_status, 'FRESH');
  assert.equal(registry.getFreshness('ws-b', 'ikas-products').freshness_status, 'IMPORT_NEEDED');
  assert.equal(registry.getFreshness('ws-a', 'google-search-console-query-page').freshness_status, 'UNKNOWN');

  const intervalConfig = {
    freshness_policy: { kind: 'INTERVAL', fresh_for_hours: 24, stale_after_hours: 72 },
  };
  const gsc = registry.getFreshness('ws-a', 'google-search-console-query-page', intervalConfig);
  assert.equal(gsc.freshness_status, 'DUE');
  const gscReadiness = 'READY';
  assert.deepEqual([gscReadiness, gsc.freshness_status], ['READY', 'DUE']);
  const ads = registry.getFreshness('ws-a', 'google-ads-search-terms', intervalConfig);
  const adsReadiness = 'CONNECTION_REQUIRED';
  assert.deepEqual([adsReadiness, ads.freshness_status], ['CONNECTION_REQUIRED', 'DUE']);

  assert.throws(
    () => registry.getFreshness('ws-a', 'unknown-source'),
    (error) => error instanceof FreshnessRegistryError && error.code === 'UNKNOWN_SOURCE_ID',
  );
  assert.throws(() => registry.getFreshness('ws-a', 'google-search-console-query-page', {
    freshness_policy: { kind: 'INTERVAL', fresh_for_hours: 24, stale_after_hours: 12 },
  }));
});

test('FRESHNESS-DESKTOP-001: desktop cards expose freshness separately and DUE does not block a ready Review', async (t) => {
  const root = path.join(workRoot, 'desktop');
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(root, key)]),
  );
  directories.app_data_root = root;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  const repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'Fresh desktop' });
  const freshness = new FreshnessRegistry(repository, () => new Date(NOW));
  freshness.register('serpapi', () => ({ kind: 'ON_DEMAND' }));
  freshness.register('ikas-products', (context) => resolveConfiguredIntervalPolicy(context.source_config, { kind: 'MANUAL_IMPORT' }));
  freshness.register('google-search-console-query-page', (context) => resolveConfiguredIntervalPolicy(context.source_config, { kind: 'UNKNOWN' }));
  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    now: () => new Date(NOW),
    source_order: ['google-search-console-query-page', 'ikas-products', 'serpapi'],
    readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) },
    freshness,
  });

  const draft = controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  assert.deepEqual(draft.source_cards.map((card) => [card.source_id, card.freshness_status]), [
    ['google-search-console-query-page', 'UNKNOWN'],
    ['ikas-products', 'IMPORT_NEEDED'],
    ['serpapi', 'ON_DEMAND'],
  ]);
  assert.ok(draft.source_cards.every((card) => card.last_successful_at === null && card.next_due_at === null));

  draft.reusable_configuration = {
    sources: {
      'google-search-console-query-page': {
        included: true,
        task_id: 'gsc-current-90-days',
        date_policy: 'TODAY_MINUS_90_TO_YESTERDAY',
        freshness_policy: { kind: 'INTERVAL', fresh_for_hours: 24, stale_after_hours: 72 },
      },
    },
  };
  const review = await controller.reviewDraft(draft);
  const gscCard = review.source_cards.find((card) => card.source_id === 'google-search-console-query-page');
  assert.equal(gscCard.readiness_status, 'READY');
  assert.equal(gscCard.freshness_status, 'DUE');
  assert.equal(review.can_start, true, 'DUE freshness is informative and must not block a ready explicit Run.');
});
