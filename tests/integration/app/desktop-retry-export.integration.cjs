const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DesktopMultiSourceController } = require(`${process.argv[2]}/main/app/desktop-multisource-controller.js`);

async function main() {
  const run = { run_id: 'rr_retry', workspace_id: 'ws_a', run_status: 'RETRY_REQUIRED', selected_sources: ['google-trends', 'serpapi'] };
  const failed = { job_id: 'job_failed', run_id: run.run_id, source_id: 'serpapi', job_key: 'q-2', execution_status: 'FAILED', validation_status: 'ERROR_NOT_DATA', attempt_count: 1, accepted_artifact_id: null };
  const accepted = { job_id: 'job_ok', run_id: run.run_id, source_id: 'google-trends', job_key: 'GT-01', execution_status: 'COMPLETED', validation_status: 'VALID', attempt_count: 1, accepted_artifact_id: 'art_ok' };
  const repository = {
    getRun: () => run,
    listJobs: () => [failed, accepted],
    listIncompleteRuns: () => [run],
    listAttempts: () => [],
    getArtifact: (id) => id === 'art_ok' ? { artifact_id: id, job_id: accepted.job_id, run_id: run.run_id, source_id: accepted.source_id, artifact_state: 'ACCEPTED' } : null,
    getJob: (id) => id === failed.job_id ? failed : accepted,
    reacquireRunAndStartRetryAttempt: () => { failed.execution_status = 'RUNNING'; failed.attempt_count = 2; return { attempt_id: 'att_2', attempt_number: 2 }; },
    reserveRunFromJobPlans: () => { throw new Error('unused'); },
  };
  const root = path.join(process.cwd(), '.tmp-desktop-package-fixture');
  fs.rmSync(root, { recursive: true, force: true });
  const controller = new DesktopMultiSourceController({ repository, readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) }, application_version: 'test', execute_run: async () => {}, execute_retry: async () => {}, package_directory: root, load_datasets: async () => [{ source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', rows: [{ query: 'ficus', value: null }] }, { source_id: 'serpapi', dataset_type: 'GOOGLE_SERP', rows: null, failure: { code: 'ERROR_NOT_DATA' } }] });
  const retried = await controller.retryFailed(run.run_id);
  assert.equal(retried.jobs.find((job) => job.job_id === failed.job_id).attempt_count, 2);
  assert.equal(retried.jobs.find((job) => job.job_id === accepted.job_id).attempt_count, 1);
  const all = await controller.exportRun(run.run_id, 'ALL');
  assert.equal(fs.existsSync(path.join(all.export_directory, 'MANIFEST.json')), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(all.export_directory, 'FAILURES.json'), 'utf8')).length, 1);
  const successful = await controller.exportRun(run.run_id, 'SUCCESSFUL_ONLY');
  assert.equal(fs.existsSync(path.join(successful.export_directory, 'serpapi_google_serp.json')), false);
  assert.equal(fs.existsSync(path.join(successful.export_directory, 'google-trends_interest_over_time.json')), true);

  // DESKTOP-ACCEPTED-EVIDENCE-001
  const openedEvidence = [];
  const evidenceController = new DesktopMultiSourceController({
    repository: {
      getRun: (runId) => runId === run.run_id ? run : null,
      listJobs: (runId) => runId === run.run_id ? [failed, accepted] : [],
      getArtifact: (artifactId) => artifactId === 'art_ok'
        ? {
            artifact_id: 'art_ok',
            run_id: run.run_id,
            job_id: accepted.job_id,
            source_id: accepted.source_id,
            artifact_kind: 'RAW_SOURCE_FILE',
            artifact_state: 'ACCEPTED',
          }
        : null,
      reserveRunFromJobPlans: () => { throw new Error('unused'); },
    },
    readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) },
    application_version: 'test',
    open_accepted_artifact: async (artifact) => openedEvidence.push(artifact.artifact_id),
  });

  await evidenceController.openAcceptedArtifact(run.run_id, accepted.job_id);
  assert.deepEqual(openedEvidence, ['art_ok'], 'Accepted evidence action must resolve the exact persisted artifact through Core.');
  await assert.rejects(
    () => evidenceController.openAcceptedArtifact(run.run_id, failed.job_id),
    /accepted artifact/i,
    'A failed Job without accepted evidence must not open a file.',
  );
  await assert.rejects(
    () => evidenceController.openAcceptedArtifact('rr_other', accepted.job_id),
    /unknown run/i,
    'Cross-Run evidence requests must fail closed.',
  );

  console.log('PASS DESKTOP-ACCEPTED-EVIDENCE-001: Run Detail evidence opening is bound to exact accepted Run/Job/artifact identity');

  // DESKTOP-RESUME-001
  // Persisted RUNNING work from a previous process must
  // reconcile before explicit retry. Accepted sibling
  // Jobs must remain untouched.

  const resumedRun = {
    run_id: "rr_resume",
    workspace_id: "ws_resume",
    run_status: "RUNNING",
    selected_sources: [
      "google-trends",
    ],
  };

  const resumedAccepted = {
    job_id: "job_resume_gt01",
    run_id: resumedRun.run_id,
    source_id: "google-trends",
    job_key: "GT01",
    execution_status: "COMPLETED",
    validation_status: "VALID",
    attempt_count: 1,
    accepted_artifact_id:
      "art_resume_gt01",
  };

  const resumedInterrupted = {
    job_id: "job_resume_gt02",
    run_id: resumedRun.run_id,
    source_id: "google-trends",
    job_key: "GT02",
    execution_status: "RUNNING",
    validation_status: "NOT_RUN",
    attempt_count: 1,
    accepted_artifact_id: null,
  };

  const interruptedAttempt = {
    attempt_id: "att_resume_gt02_1",
    job_id: resumedInterrupted.job_id,
    run_id: resumedRun.run_id,
    source_id: "google-trends",
    attempt_number: 1,
    execution_status: "RUNNING",
    candidate_artifact_id: null,
    error_code: null,
  };

  const resumedAttempts = [
    interruptedAttempt,
  ];

  const resumedArtifacts =
    new Map([
      [
        "art_resume_gt01",
        {
          artifact_id:
            "art_resume_gt01",
          job_id:
            resumedAccepted.job_id,
          run_id:
            resumedRun.run_id,
          source_id:
            resumedAccepted.source_id,
          artifact_state:
            "ACCEPTED",
        },
      ],
    ]);

  const retryExecutions = [];

  const resumeRepository = {
    getRun:
      (runId) =>
        runId === resumedRun.run_id
          ? resumedRun
          : null,

    listRuns:
      () => [
        resumedRun,
      ],

    listIncompleteRuns:
      () =>
        resumedRun.run_status ===
          "COMPLETED"
          ? []
          : [
              resumedRun,
            ],

    listJobs:
      () => [
        resumedAccepted,
        resumedInterrupted,
      ],

    listAttempts:
      (jobId) =>
        jobId ===
          resumedInterrupted.job_id
          ? resumedAttempts
          : [],

    getArtifact:
      (artifactId) =>
        resumedArtifacts.get(
          artifactId,
        ) ?? null,

    getJob:
      (jobId) =>
        jobId ===
          resumedAccepted.job_id
          ? resumedAccepted
          : jobId ===
              resumedInterrupted.job_id
            ? resumedInterrupted
            : null,

    transitionRunStatus:
      (
        runId,
        nextStatus,
      ) => {
        assert.equal(
          runId,
          resumedRun.run_id,
        );

        resumedRun.run_status =
          nextStatus;

        return resumedRun;
      },

    transitionJobExecution:
      (
        jobId,
        nextStatus,
        options = {},
      ) => {
        assert.equal(
          jobId,
          resumedInterrupted.job_id,
        );

        resumedInterrupted
          .execution_status =
            nextStatus;

        if (
          nextStatus === "FAILED"
        ) {
          interruptedAttempt
            .execution_status =
              "FAILED";

          interruptedAttempt
            .error_code =
              options.error_code
              ?? null;
        }

        return resumedInterrupted;
      },

    reacquireRunAndStartRetryAttempt:
      () => {
        assert.equal(
          resumedInterrupted
            .execution_status,
          "RETRY_PENDING",
        );

        resumedRun.run_status =
          "RUNNING";

        resumedInterrupted
          .execution_status =
            "RUNNING";

        resumedInterrupted
          .attempt_count =
            2;

        const attempt2 = {
          attempt_id:
            "att_resume_gt02_2",
          job_id:
            resumedInterrupted.job_id,
          run_id:
            resumedRun.run_id,
          source_id:
            "google-trends",
          attempt_number: 2,
          execution_status:
            "RUNNING",
          candidate_artifact_id:
            null,
          error_code: null,
        };

        resumedAttempts.push(
          attempt2,
        );

        return attempt2;
      },

    reserveRunFromJobPlans:
      () => {
        throw new Error(
          "unused",
        );
      },
  };

  const activeProcessController =
    new DesktopMultiSourceController({
      repository:
        resumeRepository,
      readiness: {
        getReadiness:
          async () => ({
            readiness_status:
              "READY",
          }),
      },
      application_version:
        "test",
      execute_run:
        async () => {},
      execute_retry:
        async () => {},
      is_run_active:
        () => true,
    });

  const restartedController =
    new DesktopMultiSourceController({
      repository:
        resumeRepository,
      readiness: {
        getReadiness:
          async () => ({
            readiness_status:
              "READY",
          }),
      },
      application_version:
        "test",
      execute_run:
        async () => {},
      execute_retry:
        async (
          runId,
          jobId,
          attempt,
        ) => {
          retryExecutions.push({
            run_id:
              runId,
            job_id:
              jobId,
            attempt_number:
              attempt.attempt_number,
          });

          resumedInterrupted
            .execution_status =
              "COMPLETED";

          resumedInterrupted
            .validation_status =
              "VALID";

          resumedInterrupted
            .accepted_artifact_id =
              "art_resume_gt02";

          resumedAttempts[
            resumedAttempts.length - 1
          ].execution_status =
            "COMPLETED";

          resumedArtifacts.set(
            "art_resume_gt02",
            {
              artifact_id:
                "art_resume_gt02",
              job_id:
                resumedInterrupted.job_id,
              run_id:
                resumedRun.run_id,
              source_id:
                "google-trends",
              artifact_state:
                "ACCEPTED",
            },
          );

          resumedRun.run_status =
            "COMPLETED";
        },
      is_run_active:
        () => false,
    });

  assert.equal(
    typeof restartedController
      .resumeInterrupted,
    "function",
    "Persisted interrupted Runs must expose an explicit source-neutral resume operation.",
  );

  await assert.rejects(
    () =>
      activeProcessController
        .resumeInterrupted(
          resumedRun.run_id,
        ),
    /active|running|owned/i,
    "Resume must refuse a Run still owned by active in-process execution.",
  );

  const reconciled =
    await restartedController
      .resumeInterrupted(
        resumedRun.run_id,
      );

  assert.equal(
    reconciled.run.run_id,
    "rr_resume",
    "Resume must preserve the persisted run_id.",
  );

  assert.equal(
    reconciled.run.run_status,
    "RETRY_REQUIRED",
    "Interrupted RUNNING work without candidate evidence must reconcile to explicit retry-required state.",
  );

  assert.equal(
    resumedAccepted.attempt_count,
    1,
    "Accepted GT01 must not be recollected during restart reconciliation.",
  );

  assert.equal(
    resumedInterrupted.attempt_count,
    1,
    "Resume reconciliation must not create a retry attempt automatically.",
  );

  assert.equal(
    resumedInterrupted
      .execution_status,
    "RETRY_PENDING",
  );

  assert.equal(
    interruptedAttempt
      .execution_status,
    "FAILED",
    "Interrupted attempt 1 must remain preserved as failed historical evidence.",
  );

  assert.equal(
    interruptedAttempt.error_code,
    "INTERRUPTED_ATTEMPT",
  );

  assert.deepEqual(
    retryExecutions,
    [],
    "Resume reconciliation must not call the provider or start retry automatically.",
  );

  await restartedController
    .retryFailed(
      resumedRun.run_id,
    );

  assert.deepEqual(
    retryExecutions,
    [
      {
        run_id:
          "rr_resume",
        job_id:
          "job_resume_gt02",
        attempt_number: 2,
      },
    ],
    "Explicit Retry Failed must target only interrupted GT02 as attempt 2.",
  );

  assert.equal(
    resumedRun.run_status,
    "COMPLETED",
  );

  assert.equal(
    resumedAccepted.attempt_count,
    1,
  );

  assert.equal(
    resumedInterrupted.attempt_count,
    2,
  );

  assert.equal(
    resumedAttempts.length,
    2,
    "Attempt 1 must remain preserved when explicit retry creates attempt 2.",
  );

  console.log(
    "PASS DESKTOP-RESUME-001: restart reconciliation preserves accepted GT01, marks interrupted GT02 retry-pending, and requires explicit attempt-2 retry",
  );

  fs.rmSync(root, { recursive: true, force: true });
  const cancellationRun = {
    run_id: 'rr_cancel',
    workspace_id: 'ws_cancel',
    run_status: 'RUNNING',
    selected_sources: ['google-trends'],
  };

  const cancellationAcceptedJob = {
    job_id: 'job_cancel_gt01',
    run_id: cancellationRun.run_id,
    source_id: 'google-trends',
    job_key: 'GT01',
    query_group_id: 'GT01',
    execution_status: 'COMPLETED',
    validation_status: 'VALID',
    attempt_count: 1,
    accepted_artifact_id: 'art_cancel_gt01',
  };

  const cancellationActiveJob = {
    job_id: 'job_cancel_gt02',
    run_id: cancellationRun.run_id,
    source_id: 'google-trends',
    job_key: 'GT02',
    query_group_id: 'GT02',
    execution_status: 'RUNNING',
    validation_status: 'NOT_RUN',
    attempt_count: 1,
    accepted_artifact_id: null,
  };

  const cancellationPendingJob = {
    job_id: 'job_cancel_gt03',
    run_id: cancellationRun.run_id,
    source_id: 'google-trends',
    job_key: 'GT03',
    query_group_id: 'GT03',
    execution_status: 'PENDING',
    validation_status: 'NOT_RUN',
    attempt_count: 0,
    accepted_artifact_id: null,
  };

  const cancellationAttempt = {
  attempt_id: 'att_cancel_gt02_1',
  job_id: cancellationActiveJob.job_id,
  run_id: cancellationRun.run_id,
  attempt_number: 1,
  execution_status: 'RUNNING',
  candidate_artifact_id: null,
  error_code: null,
  error_message: null,
};

  const cancellationJobs = [
    cancellationAcceptedJob,
    cancellationActiveJob,
    cancellationPendingJob,
  ];

  const cancellationAttempts = [
    cancellationAttempt,
  ];

  const cancelledExecutionCalls = [];

  const cancellationRepository = {
    getRun: (runId) =>
      runId === cancellationRun.run_id
        ? cancellationRun
        : null,

    listRuns: () => [
      cancellationRun,
    ],

    listIncompleteRuns: (
  workspaceId,
) =>
  workspaceId ===
    cancellationRun.workspace_id
  && ![
    'COMPLETED',
    'COMPLETED_WITH_WARNINGS',
    'FAILED',
    'CANCELLED',
  ].includes(
    cancellationRun.run_status,
  )
    ? [
        cancellationRun,
      ]
    : [],

    listJobs: (runId) =>
      runId === cancellationRun.run_id
        ? cancellationJobs
        : [],

listAttempts: (jobId) =>
  cancellationAttempts.filter(
    (attempt) =>
      attempt.job_id === jobId,
  ),

getArtifact: (
  artifactId,
) =>
  artifactId ===
    'art_cancel_gt01'
    ? {
        artifact_id:
          'art_cancel_gt01',
        job_id:
          cancellationAcceptedJob
            .job_id,
        run_id:
          cancellationRun.run_id,
        source_id:
          'google-trends',
        artifact_state:
          'ACCEPTED',
      }
    : null,

listArtifactsForJob: () => [],

    getAcceptedArtifact: (jobId) =>
      jobId === cancellationAcceptedJob.job_id
        ? {
            artifact_id: 'art_cancel_gt01',
            job_id: cancellationAcceptedJob.job_id,
            run_id: cancellationRun.run_id,
            source_id: 'google-trends',
          }
        : null,

    transitionRunStatus: (
      runId,
      nextStatus,
    ) => {
      assert.equal(
        runId,
        cancellationRun.run_id,
      );

      cancellationRun.run_status =
        nextStatus;

      return cancellationRun;
    },

    transitionJobExecution: (
      jobId,
      nextStatus,
    ) => {
      const job =
        cancellationJobs.find(
          (candidate) =>
            candidate.job_id === jobId,
        );

      assert.ok(
        job,
        `Unknown cancellation fixture Job: ${jobId}`,
      );

      job.execution_status =
        nextStatus;

      const activeAttempt =
        cancellationAttempts.find(
          (attempt) =>
            attempt.job_id === jobId
            && (
              attempt.execution_status === 'RUNNING'
              || attempt.execution_status === 'VALIDATING'
              || attempt.execution_status === 'MANUAL_ACTION_REQUIRED'
            ),
        );

      if (
        activeAttempt
        && nextStatus === 'CANCELLED'
      ) {
        activeAttempt.execution_status =
          'CANCELLED';
        activeAttempt.error_code =
          'USER_CANCELLED';
        activeAttempt.error_message =
          'Run cancelled by user.';
      }

      return job;
    },
  };

  const cancellationController =
    new DesktopMultiSourceController({
      repository:
        cancellationRepository,
      readiness: {
        getReadiness:
          async () => ({
            readiness_status:
              'READY',
          }),
      },
      application_version:
        'test',
      is_run_active:
        (runId) =>
          runId ===
          cancellationRun.run_id,
      can_cancel_run:
        (runId) =>
          runId ===
          cancellationRun.run_id,
      cancel_active_run:
        async (runId) => {
          cancelledExecutionCalls.push(
            runId,
          );
        },
    });

  const cancellableState =
    cancellationController
      .getRunState(
        cancellationRun.run_id,
      );

  assert.equal(
    cancellableState.can_cancel,
    true,
    'An actively owned Run with a cancellation handle must expose can_cancel.',
  );

  assert.equal(
    typeof cancellationController
      .cancelRun,
    'function',
    'DesktopMultiSourceController must expose generic explicit Run cancellation.',
  );

  const cancelledState =
    await cancellationController
      .cancelRun(
        cancellationRun.run_id,
      );

  assert.equal(
    cancelledState.run.run_id,
    'rr_cancel',
    'Cancellation must preserve the exact persisted Run identity.',
  );

  assert.equal(
    cancelledState.run.run_status,
    'CANCELLED',
    'Explicit cancellation must terminalize the same Run.',
  );

  assert.equal(
    cancellationAcceptedJob
      .execution_status,
    'COMPLETED',
    'Accepted completed sibling evidence must remain completed.',
  );

  assert.equal(
    cancellationAcceptedJob
      .accepted_artifact_id,
    'art_cancel_gt01',
    'Accepted artifact identity must survive cancellation.',
  );

  assert.equal(
    cancellationAcceptedJob
      .attempt_count,
    1,
    'Accepted sibling attempt history must not change.',
  );

  assert.equal(
    cancellationActiveJob
      .execution_status,
    'CANCELLED',
    'Active unfinished Job must become CANCELLED.',
  );

  assert.equal(
    cancellationAttempt
      .execution_status,
    'CANCELLED',
    'The existing active Attempt must become CANCELLED.',
  );

  assert.equal(
    cancellationActiveJob
      .attempt_count,
    1,
    'Cancellation must not create attempt 2.',
  );

  assert.equal(
    cancellationPendingJob
      .execution_status,
    'CANCELLED',
    'Pending later work must be cancelled instead of executed.',
  );

  assert.deepEqual(
    cancelledExecutionCalls,
    [
      'rr_cancel',
    ],
    'Physical cancellation must target the exact owning Run once.',
  );

  assert.equal(
    cancelledState.can_cancel,
    false,
    'Terminal CANCELLED Run must not remain cancellable.',
  );

  assert.equal(
    cancelledState.can_resume,
    false,
    'Terminal CANCELLED Run must not be resumable.',
  );

  assert.equal(
    cancelledState.can_retry,
    false,
    'Terminal CANCELLED Run must not be retryable.',
  );

  console.log(
    'PASS DESKTOP-CANCEL-001: generic explicit cancellation preserves accepted evidence, cancels unfinished work, and creates no retry attempt',
  );
  console.log('PASS DESKTOP-RETRY-EXPORT-001: generalized retry targets failed Job only and physical package modes remain source-separated');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
