const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

global.__roofroomInvocations = [];
global.__roofroomExposed = null;

const { IPC_CHANNELS } = require(path.join(buildRoot, 'shared/application-info.js'));
const { createDesktopTaskPackageHandlers } = require(path.join(
  buildRoot, 'main/app/desktop-task-package-ipc.js',
));
require(path.join(buildRoot, 'preload.js'));

const intent = { workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' };
const startIntent = {
  ...intent,
  recipe_version: 1,
  reference_date: '2026-09-30',
  current_window: { start: '2026-09-23', end: '2026-09-29' },
  account_identity: { field: 'customer_id', value: '1234567890' },
};
const review = {
  recipe_id: 'ADS_OPTIMIZATION_PACK',
  recipe_version: 1,
  recipe_label: 'Kampanya Gelişim',
  workspace_id: 'ws_a',
  account_identity: { field: 'customer_id', value: '1234567890' },
  customer_id: '1234567890',
  reference_date: '2026-09-30',
  current_window: { start: '2026-09-23', end: '2026-09-29' },
  status: 'NOT_READY',
  can_start: true,
  can_open: false,
  collection_run_id: null,
  requirements: [
    'CAMPAIGN_PERFORMANCE', 'AD_GROUP_PERFORMANCE', 'KEYWORD_PERFORMANCE',
    'SEARCH_TERMS', 'AD_PERFORMANCE', 'RSA_ASSET_PERFORMANCE',
  ].map((dataset_type) => ({
    requirement_id: dataset_type,
    dataset_type,
    status: 'COLLECT_REQUIRED',
    reason_codes: ['NO_COMPATIBLE_EVIDENCE'],
  })),
};
const packageResult = {
  status: 'PACKAGE_PUBLISHED',
  package: {
    package_id: 'pkg_safe',
    package_kind: 'INITIAL_BASELINE',
    current_window: { start: '2026-09-23', end: '2026-09-29' },
  },
};
const runState = {
  run: {
    run_id: 'run_package_1', workspace_id: 'ws_a', run_status: 'RETRY_REQUIRED',
    created_at: '2026-09-30T08:00:00.000Z', started_at: '2026-09-30T08:00:01.000Z',
    completed_at: null, application_version: '1.0.0',
    selected_sources: ['google-ads-search-reporting'], requested_configuration: null,
    configuration_snapshot: {
      task_package: {
        recipe_id: 'ADS_OPTIMIZATION_PACK', recipe_version: 1, workspace_id: 'ws_a',
        account_identity: { field: 'customer_id', value: '1234567890' },
        current_window: { start: '2026-09-23', end: '2026-09-29' },
      },
    },
  },
  jobs: [{
    job_id: 'job_package_1', run_id: 'run_package_1', source_id: 'google-ads-search-reporting',
    job_key: 'AD_PERFORMANCE', query_group_id: null,
    source_context: {
      source_id: 'google-ads-search-reporting', dataset_type: 'AD_PERFORMANCE',
      resource_mode: 'ad_group_ad', campaign_type: 'SEARCH', customer_id: '1234567890',
      requested_date_start: '2026-09-23', requested_date_end: '2026-09-29',
      dataset_schema_version: 1,
    },
    job_order: 0, execution_status: 'FAILED', validation_status: 'ERROR_NOT_DATA',
    attempt_count: 1, accepted_artifact_id: null, created_at: '2026-09-30T08:00:00.000Z',
    started_at: '2026-09-30T08:00:01.000Z', completed_at: '2026-09-30T08:00:02.000Z',
  }],
  job_attempts: [{
    job_id: 'job_package_1', attempt_number: 1, execution_status: 'FAILED',
    error_code: 'PROVIDER_ERROR', started_at: '2026-09-30T08:00:01.000Z',
    completed_at: '2026-09-30T08:00:02.000Z',
  }],
  completed_jobs: 0, failed_jobs: 1, can_resume: false, can_retry: true, can_cancel: false,
};
const collectionResult = { status: 'COLLECTION_STARTED', run_state: runState };

const createHarness = ({ unsafe = false, throwService = false, startResult = packageResult } = {}) => {
  const calls = { trust: 0, review: 0, start: 0, open: 0 };
  const handlers = createDesktopTaskPackageHandlers({
    assertTrustedSender: (event) => {
      calls.trust += 1;
      if (event !== 'trusted') throw new Error('UNTRUSTED');
    },
    controller: {
      review: async () => {
        calls.review += 1;
        if (throwService) throw new Error('secret token /Users/private/provider-body');
        return unsafe ? { ...review, absolute_path: '/Users/private/package.xlsx' } : review;
      },
      start: async () => {
        calls.start += 1;
        if (throwService) throw new Error('secret token /Users/private/provider-body');
        return unsafe ? { ...packageResult, refresh_token: 'secret' } : startResult;
      },
    },
    open_package: async () => {
      calls.open += 1;
      if (throwService) throw new Error('secret token /Users/private/provider-body');
    },
  });
  return { handlers, calls };
};

const assertSafeFailure = (response, code) => {
  assert.deepEqual(response, { ok: false, error: { code, retryable: false } });
  assert.equal(/token|secret|provider|\/Users\//iu.test(JSON.stringify(response)), false);
};

async function main() {
  for (const operation of ['review', 'start', 'open']) {
    const harness = createHarness();
    await assert.rejects(
      harness.handlers[operation]('untrusted', operation === 'review' ? intent : operation === 'start' ? startIntent : { package_id: 'pkg_safe' }),
      /UNTRUSTED/,
    );
    assert.equal(harness.calls.trust, 1);
    assert.equal(harness.calls.review + harness.calls.start + harness.calls.open, 0);
  }

  const invalidReviewPayloads = [
    null, [], {}, { workspace_id: '', recipe_id: 'ADS_OPTIMIZATION_PACK' },
    { ...intent, path: '/tmp/x' }, { ...intent, recipe_id: 'WRONG' },
    { ...intent, workspace_id: ' ws_a ' },
  ];
  for (const payload of invalidReviewPayloads) {
    const harness = createHarness();
    assertSafeFailure(await harness.handlers.review('trusted', payload), 'INVALID_INTENT');
    assert.equal(harness.calls.review, 0);
  }
  const invalidStartPayloads = [
    null,
    { ...startIntent, recipe_version: 2 },
    { ...startIntent, reference_date: '09/30/2026' },
    { ...startIntent, current_window: { start: '2026-09-23', end: 'bad' } },
    { ...startIntent, account_identity: { field: 'customer_id', value: '' } },
    { ...startIntent, path: '/tmp/x' },
    { ...startIntent, workspace_id: ' ws_a ' },
  ];
  for (const payload of invalidStartPayloads) {
    const harness = createHarness();
    assertSafeFailure(await harness.handlers.start('trusted', payload), 'INVALID_INTENT');
    assert.equal(harness.calls.start, 0);
  }
  for (const payload of [null, {}, { package_id: '' }, { package_id: '../x' }, { package_id: 'pkg', path: '/tmp/x' }]) {
    const harness = createHarness();
    assertSafeFailure(await harness.handlers.open('trusted', payload), 'INVALID_INTENT');
    assert.equal(harness.calls.open, 0);
  }

  const validHarness = createHarness();
  assert.deepEqual(await validHarness.handlers.review('trusted', intent), { ok: true, result: review });
  assert.deepEqual(await validHarness.handlers.start('trusted', startIntent), { ok: true, result: packageResult });
  assert.deepEqual(await validHarness.handlers.open('trusted', { package_id: 'pkg_safe' }), {
    ok: true, result: { package_id: 'pkg_safe' },
  });
  const collectionHarness = createHarness({ startResult: collectionResult });
  assert.deepEqual(await collectionHarness.handlers.start('trusted', startIntent), {
    ok: true,
    result: collectionResult,
  });
  const unsafeNestedRunState = structuredClone(collectionResult);
  unsafeNestedRunState.run_state.job_attempts[0].error_code = 'FAILED /Users/private/token';
  assertSafeFailure(
    await createHarness({ startResult: unsafeNestedRunState }).handlers.start('trusted', startIntent),
    'LOCAL_REVIEW_FAILED',
  );

  const unsafeHarness = createHarness({ unsafe: true });
  assertSafeFailure(await unsafeHarness.handlers.review('trusted', intent), 'LOCAL_REVIEW_FAILED');
  assertSafeFailure(await unsafeHarness.handlers.start('trusted', startIntent), 'LOCAL_REVIEW_FAILED');
  const throwingHarness = createHarness({ throwService: true });
  assertSafeFailure(await throwingHarness.handlers.review('trusted', intent), 'LOCAL_REVIEW_FAILED');
  assertSafeFailure(await throwingHarness.handlers.start('trusted', startIntent), 'CORE_START_FAILED');
  assertSafeFailure(await throwingHarness.handlers.open('trusted', { package_id: 'pkg_safe' }), 'PACKAGE_INVALID');

  const api = global.__roofroomExposed?.api;
  assert.equal(typeof api?.reviewDesktopTaskPackage, 'function');
  assert.equal(typeof api?.startDesktopTaskPackage, 'function');
  assert.equal(typeof api?.openDesktopTaskPackage, 'function');
  await api.reviewDesktopTaskPackage(intent);
  await api.startDesktopTaskPackage(startIntent);
  await api.openDesktopTaskPackage({ package_id: 'pkg_safe' });
  assert.deepEqual(global.__roofroomInvocations.slice(-3), [
    [IPC_CHANNELS.DESKTOP_TASK_PACKAGE_REVIEW, intent],
    [IPC_CHANNELS.DESKTOP_TASK_PACKAGE_START, startIntent],
    [IPC_CHANNELS.DESKTOP_TASK_PACKAGE_OPEN, { package_id: 'pkg_safe' }],
  ]);

  console.log('PASS ADS-OPTIMIZATION-PACK-DESKTOP-IPC-001: trusted exact payloads and safe responses bound Review, Start, and Open to narrow preload channels');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
