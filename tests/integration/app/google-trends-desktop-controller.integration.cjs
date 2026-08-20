const assert = require(
  'node:assert/strict',
);
const path = require(
  'node:path',
);

const [buildRoot] =
  process.argv.slice(2);

if (!buildRoot) {
  throw new Error(
    'Expected compiled build root.',
  );
}

const {
  GoogleTrendsDesktopController,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'app',
    'google-trends-desktop-controller.js',
  ),
);

const deferred = () => {
  let resolve;
  let reject;

  const promise = new Promise(
    (resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    },
  );

  return {
    promise,
    resolve,
    reject,
  };
};

const runRecord = (
  runStatus = 'COMPLETED',
) => ({
  run_id:
    'rr_desktop_test',
  run_status:
    runStatus,
  created_at:
    '2026-08-19T00:00:00.000Z',
  started_at:
    '2026-08-19T00:00:01.000Z',
  completed_at:
    runStatus === 'COMPLETED'
      ? '2026-08-19T00:00:02.000Z'
      : null,
  application_version:
    '1.0.0-test',
  selected_sources: [
    'google-trends',
  ],
  requested_configuration: {},
  configuration_snapshot: {},
});

const jobEntry = (
  groupId,
) => ({
  job: {
    job_id:
      `job_${groupId}`,
    run_id:
      'rr_desktop_test',
    source_id:
      'google-trends',
    job_key:
      groupId,
    query_group_id:
      groupId,
    job_order:
      groupId === 'GT01'
        ? 0
        : 1,
    execution_status:
      'COMPLETED',
    validation_status:
      'VALID',
    attempt_count:
      1,
    accepted_artifact_id:
      `artifact_${groupId}`,
    created_at:
      '2026-08-19T00:00:00.000Z',
    started_at:
      '2026-08-19T00:00:01.000Z',
    completed_at:
      '2026-08-19T00:00:02.000Z',
  },
  attempt: {
    attempt_number:
      1,
    error_code:
      null,
  },
  artifact: {
    artifact_state:
      'ACCEPTED',
  },
  validation: {
    validation_status:
      'VALID',
  },
  source_result: {
    result_type:
      'ARTIFACT_PRODUCED',
  },
});

const batchResult = () => ({
  run:
    runRecord(),
  jobs: [
    jobEntry('GT01'),
    jobEntry('GT02'),
  ],
  orchestration: {
    steps: [],
    stopped_because:
      'RUN_COMPLETED',
  },
});

const contextFor = (
  groupId,
) => ({
  query_group: {
    query_group_id:
      groupId,
    query_group_name:
      groupId,
    queries: [
      'redacted fixture query',
    ],
  },
});

const emptyRecovery = {
  run_id:
    null,
  can_resume:
    false,
  can_retry:
    false,
  manual_action_required:
  false,
};

const requestedPeriod = {
  period_preset:
    '24M',
  reference_date:
    '2026-08-17',
};

const exportResult = {
  export_directory:
    '/fixture/run/exports/package',
  workbook_path:
    '/fixture/run/exports/package.xlsx',
  normalized_row_count:
    8,
};

const main = async () => {
  const pending =
    deferred();
  let observedHooks;

  const controller =
    new GoogleTrendsDesktopController({
      total_groups:
        2,
      query_group_ids: [
        'GT01',
        'GT02',
      ],
      start_batch:
        (
          groupIds,
          periodSelection,
          hooks,
        ) => {
          assert.deepEqual(
            groupIds,
            [
              'GT01',
              'GT02',
            ],
          );
          assert.deepEqual(
            periodSelection,
            requestedPeriod,
          );
          observedHooks =
            hooks;
          return pending.promise;
        },
      resume_run:
        async () => batchResult(),
      discover_recovery:
        () => emptyRecovery,
      cancel_run:
        async () => {},
      close_browser:
        async () => {},
      export_run:
        async () =>
          exportResult,
      now:
        () =>
          new Date(
            '2026-08-19T00:00:00.000Z',
          ),
    });

  assert.throws(
    () =>
      controller.start([
        'GT99',
      ], requestedPeriod),
    /unique query group IDs/,
  );
  assert.equal(
    controller.getState().phase,
    'IDLE',
  );

  const started =
    controller.start([
      'GT01',
      'GT02',
    ], requestedPeriod);

  assert.equal(
    started.phase,
    'RUNNING',
  );
  assert.equal(
    started.operation,
    'START',
  );

  assert.throws(
    () =>
      controller.start([
        'GT01',
      ], requestedPeriod),
    /already active/,
  );

  observedHooks.on_run_available(
    runRecord('RUNNING'),
  );
  observedHooks.on_collection_started(
    contextFor('GT01'),
  );
  observedHooks.on_collection_result(
    contextFor('GT01'),
    {
      result_type:
        'ARTIFACT_PRODUCED',
    },
  );

  const progress =
    controller.getState();

  assert.equal(
    progress.run_id,
    'rr_desktop_test',
  );
  assert.equal(
    progress.current_group_id,
    'GT01',
  );
  assert.equal(
    progress.groups_started,
    1,
  );
  assert.equal(
    progress.groups_collected,
    1,
  );

  pending.resolve(
    batchResult(),
  );
  await controller.waitForIdle();

  const completed =
    controller.getState();

  assert.equal(
    completed.phase,
    'COMPLETED',
  );
  assert.equal(
    completed.jobs.length,
    2,
  );
  assert.equal(
    completed.export.status,
    'COMPLETED',
  );
  assert.equal(
    completed.export
      .normalized_row_count,
    8,
  );
  assert.equal(
    completed.jobs.every(
      (job) =>
        job.validation_status ===
          'VALID' &&
        job.artifact_state ===
          'ACCEPTED',
    ),
    true,
  );

  console.log(
    'PASS DESKTOP-CTRL-001: start is asynchronous, rejects overlap, reports safe progress, and publishes accepted job summaries',
  );

  const resumeCalls = [];
  let recovery = {
    run_id:
      'rr_recovery_test',
    can_resume:
      true,
    can_retry:
      false,
    manual_action_required:
      false,
  };

  const recoveryController =
    new GoogleTrendsDesktopController({
      total_groups:
        2,
      query_group_ids: [
        'GT01',
        'GT02',
      ],
      start_batch:
        async () => batchResult(),
      resume_run:
        async (
          runId,
          retryFailed,
        ) => {
          resumeCalls.push({
            runId,
            retryFailed,
          });
          return batchResult();
        },
      discover_recovery:
        () => recovery,
      cancel_run:
        async () => {},
      close_browser:
        async () => {},
      export_run:
        async () =>
          exportResult,
    });

  recoveryController.resume();
  await recoveryController.waitForIdle();

  recovery = {
    ...recovery,
    can_resume:
      false,
    can_retry:
      true,
  };

  recoveryController.retryFailed();
  await recoveryController.waitForIdle();

  assert.deepEqual(
    resumeCalls,
    [
      {
        runId:
          'rr_recovery_test',
        retryFailed:
          false,
      },
      {
        runId:
          'rr_recovery_test',
        retryFailed:
          true,
      },
    ],
  );

  console.log(
    'PASS DESKTOP-CTRL-002: resume and explicit retry use only the discovered persisted run and preserve distinct operations',
  );

  const cancellable =
    deferred();
  const cancelledRuns = [];
  let browserCloseCount =
    0;
  let cancelHooks;

  const cancelController =
    new GoogleTrendsDesktopController({
      total_groups:
        1,
      query_group_ids: [
        'GT01',
      ],
      start_batch:
        (
          _groupIds,
          _periodSelection,
          hooks,
        ) => {
          cancelHooks =
            hooks;
          return cancellable.promise;
        },
      resume_run:
        async () => batchResult(),
      discover_recovery:
        () => emptyRecovery,
      cancel_run:
        async (runId) => {
          cancelledRuns.push(
            runId,
          );
        },
      close_browser:
        async () => {
          browserCloseCount +=
            1;
        },
      export_run:
        async () =>
          exportResult,
    });

  cancelController.start([
    'GT01',
  ], requestedPeriod);
  cancelHooks.on_run_available(
    runRecord('RUNNING'),
  );

  const cancelling =
    await cancelController.cancel();

  assert.equal(
    cancelling.phase,
    'CANCELLING',
  );
  assert.deepEqual(
    cancelledRuns,
    [
      'rr_desktop_test',
    ],
  );
  assert.equal(
    browserCloseCount,
    1,
  );

  cancellable.reject(
    new Error(
      'fixture browser closed',
    ),
  );
  await cancelController.waitForIdle();

  assert.equal(
    cancelController.getState().phase,
    'CANCELLED',
  );

  console.log(
    'PASS DESKTOP-CTRL-003: cancel persists the active run, closes the provider browser, and resolves to CANCELLED without retry',
  );

  const exportFailureController =
    new GoogleTrendsDesktopController({
      total_groups:
        2,
      query_group_ids: [
        'GT01',
        'GT02',
      ],
      start_batch:
        async () => batchResult(),
      resume_run:
        async () => batchResult(),
      discover_recovery:
        () => emptyRecovery,
      cancel_run:
        async () => {},
      close_browser:
        async () => {},
      export_run:
        async () => {
          throw new Error(
            'deterministic export failure',
          );
        },
    });

  exportFailureController.start([
    'GT01',
    'GT02',
  ], requestedPeriod);
  await exportFailureController
    .waitForIdle();

  const exportFailure =
    exportFailureController
      .getState();

  assert.equal(
    exportFailure.phase,
    'EXPORT_FAILED',
  );
  assert.equal(
    exportFailure.run_status,
    'COMPLETED',
  );
  assert.equal(
    exportFailure.export.status,
    'FAILED',
  );
  assert.equal(
    exportFailure.jobs.every(
      (job) =>
        job.validation_status ===
        'VALID',
    ),
    true,
  );

  console.log(
    'PASS DESKTOP-CTRL-004: export failure remains distinct from an accepted completed collection run',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
