const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] =
  process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error(
    'Expected compiled build root and temporary work root.',
  );
}

const {
  getDatabasePath,
  initializeDatabase,
} = require(
  path.join(
    buildRoot,
    'main',
    'storage',
    'database.js',
  ),
);

const {
  StateRepository,
} = require(
  path.join(
    buildRoot,
    'main',
    'storage',
    'state-repository.js',
  ),
);

const {
  RunManager,
} = require(
  path.join(
    buildRoot,
    'main',
    'core',
    'run-manager.js',
  ),
);

const {
  ResumePlanner,
} = require(
  path.join(
    buildRoot,
    'main',
    'core',
    'resume-planner.js',
  ),
);

const {
  RetryPolicy,
} = require(
  path.join(
    buildRoot,
    'main',
    'core',
    'retry-policy.js',
  ),
);

const {
  ReconciliationCoordinator,
} = require(
  path.join(
    buildRoot,
    'main',
    'core',
    'reconciliation-coordinator.js',
  ),
);

const databaseDir = path.join(
  workRoot,
  'database',
);
fs.mkdirSync(databaseDir, {
  recursive: true,
});

const directories = {
  app_data_root: workRoot,
  config: path.join(workRoot, 'config'),
  data: path.join(workRoot, 'data'),
  runs: path.join(
    workRoot,
    'data',
    'runs',
  ),
  database: databaseDir,
  browser_profiles: path.join(
    workRoot,
    'browser-profiles',
  ),
  logs: path.join(workRoot, 'logs'),
};

const bootstrap =
  initializeDatabase(directories);

assert.equal(bootstrap.status, 'READY');

if (bootstrap.status !== 'READY') {
  throw new Error(bootstrap.error);
}

assert.equal(bootstrap.schema_version, 4);

const requestedConfiguration = {
  source_mode: 'GOOGLE_TRENDS_UI',
  country_code: 'TR',
  language_code: null,
  requested_date_start: '2024-08-18',
  requested_date_end: '2026-08-17',
  category_id: null,
  category_name: 'All Categories',
  search_type: 'WEB_SEARCH',
  selection_type: 'SEARCH_TERM',
  dataset_type: 'INTEREST_OVER_TIME',
};

const queryConfig = {
  config_version: 1,
  source_id: 'google-trends',
  groups: Array.from(
    { length: 7 },
    (_, index) => {
      const number = String(
        index + 1,
      ).padStart(2, '0');

      return {
        query_group_id: `RC${number}`,
        query_group_name:
          `reconcile_${number}`,
        queries: [`query RC${number}`],
      };
    },
  ),
};

const repositoryA =
  new StateRepository(
    getDatabasePath(directories),
  );

const created =
  repositoryA.createRunFromQueryConfig({
    query_config: queryConfig,
    application_version: '1.0.0',
    requested_configuration:
      requestedConfiguration,
  });

const runManager =
  new RunManager(repositoryA);

runManager.startRun(created.run.run_id);

const [
  acceptedJob,
  interruptedNoArtifactJob,
  interruptedCandidateJob,
  failedRetryJob,
  manualJob,
  pendingJob,
  exhaustedJob,
] = created.jobs;

const registerArtifact = (
  job,
  attempt,
) =>
  repositoryA.registerCandidateArtifact({
    attempt_id: attempt.attempt_id,
    filename:
      `${job.query_group_id}.csv`,
    relative_path:
      `google-trends/raw/${job.query_group_id}.csv`,
    media_type: 'text/csv',
    byte_size: 10,
    sha256: null,
  });

const acceptJob = (job) => {
  const attempt =
    repositoryA.startAttempt(
      job.job_id,
    );

  const artifact =
    registerArtifact(job, attempt);

  repositoryA.transitionJobExecution(
    job.job_id,
    'VALIDATING',
  );

  repositoryA.recordValidationSummary({
    attempt_id: attempt.attempt_id,
    artifact_id: artifact.artifact_id,
    validation_status: 'VALID',
    checks_total: 1,
    checks_passed: 1,
    checks_warning: 0,
    checks_failed: 0,
    validation_json_path: null,
  });

  repositoryA.transitionJobExecution(
    job.job_id,
    'COMPLETED',
    {
      validation_status: 'VALID',
    },
  );

  return artifact;
};

const acceptedArtifact =
  acceptJob(acceptedJob);

const interruptedAttempt =
  repositoryA.startAttempt(
    interruptedNoArtifactJob.job_id,
  );

const candidateAttempt =
  repositoryA.startAttempt(
    interruptedCandidateJob.job_id,
  );
const candidateArtifact =
  registerArtifact(
    interruptedCandidateJob,
    candidateAttempt,
  );

repositoryA.startAttempt(
  failedRetryJob.job_id,
);
repositoryA.transitionJobExecution(
  failedRetryJob.job_id,
  'FAILED',
  {
    error_code: 'DOWNLOAD_FAILED',
  },
);

repositoryA.startAttempt(
  manualJob.job_id,
);
repositoryA.transitionJobExecution(
  manualJob.job_id,
  'MANUAL_ACTION_REQUIRED',
);

// pendingJob intentionally untouched.

repositoryA.startAttempt(
  exhaustedJob.job_id,
);
repositoryA.transitionJobExecution(
  exhaustedJob.job_id,
  'FAILED',
  {
    error_code: 'DOWNLOAD_FAILED',
  },
);

runManager.refreshRunStatus(
  created.run.run_id,
);

const planner =
  new ResumePlanner(repositoryA);

const buildPlans = () => {
  const plan = planner.planRun(
    created.run.run_id,
  );

  assert.ok(plan);

  return new Map(
    plan.jobs.map((jobPlan) => [
      jobPlan.job.job_id,
      jobPlan,
    ]),
  );
};

const coordinator =
  new ReconciliationCoordinator(
    repositoryA,
    new RetryPolicy({
      max_attempts: 2,
    }),
  );

const initialPlans = buildPlans();

// Accepted job: no mutation and no scheduling.
const acceptedBefore =
  repositoryA.getJob(
    acceptedJob.job_id,
  );

const acceptedResult =
  coordinator.apply(
    initialPlans.get(
      acceptedJob.job_id,
    ),
  );

assert.equal(
  acceptedResult.outcome,
  'SKIPPED_ACCEPTED',
);
assert.deepEqual(
  repositoryA.getJob(
    acceptedJob.job_id,
  ),
  acceptedBefore,
);
assert.equal(
  repositoryA.getJob(
    acceptedJob.job_id,
  ).accepted_artifact_id,
  acceptedArtifact.artifact_id,
);

// Pending job: eligible, but coordinator does not start it.
const pendingResult =
  coordinator.apply(
    initialPlans.get(
      pendingJob.job_id,
    ),
  );

assert.equal(
  pendingResult.outcome,
  'READY_FOR_INITIAL_ATTEMPT',
);
assert.equal(
  repositoryA.getJob(
    pendingJob.job_id,
  ).execution_status,
  'PENDING',
);
assert.equal(
  repositoryA.getJob(
    pendingJob.job_id,
  ).attempt_count,
  0,
);

// Manual action: never auto-failed or retried.
const manualBefore =
  repositoryA.getJob(
    manualJob.job_id,
  );

const manualResult =
  coordinator.apply(
    initialPlans.get(
      manualJob.job_id,
    ),
  );

assert.equal(
  manualResult.outcome,
  'BLOCKED_MANUAL_ACTION',
);
assert.deepEqual(
  repositoryA.getJob(
    manualJob.job_id,
  ),
  manualBefore,
);

// Candidate evidence: preserve and hand off; do not recollect.
const candidateBefore =
  repositoryA.getJob(
    interruptedCandidateJob.job_id,
  );

const candidateResult =
  coordinator.apply(
    initialPlans.get(
      interruptedCandidateJob.job_id,
    ),
  );

assert.equal(
  candidateResult.outcome,
  'CANDIDATE_REQUIRES_RECONCILIATION',
);
assert.deepEqual(
  repositoryA.getJob(
    interruptedCandidateJob.job_id,
  ),
  candidateBefore,
);
assert.equal(
  repositoryA.getArtifact(
    candidateArtifact.artifact_id,
  ).artifact_state,
  'CANDIDATE',
);

// Interrupted active attempt without artifact:
// preserve attempt failure then mark retry-pending.
const reconcileResult =
  coordinator.apply(
    initialPlans.get(
      interruptedNoArtifactJob.job_id,
    ),
  );

assert.equal(
  reconcileResult.outcome,
  'RETRY_PENDING',
);

const reconciledJob =
  repositoryA.getJob(
    interruptedNoArtifactJob.job_id,
  );

assert.equal(
  reconciledJob.execution_status,
  'RETRY_PENDING',
);
assert.equal(
  reconciledJob.attempt_count,
  1,
);

const reconciledAttempts =
  repositoryA.listAttempts(
    interruptedNoArtifactJob.job_id,
  );

assert.equal(
  reconciledAttempts.length,
  1,
);
assert.equal(
  reconciledAttempts[0].attempt_id,
  interruptedAttempt.attempt_id,
);
assert.equal(
  reconciledAttempts[0].execution_status,
  'FAILED',
);
assert.equal(
  reconciledAttempts[0].error_code,
  'INTERRUPTED_ATTEMPT',
);

// Re-plan before mutation: stale plans are intentionally rejected.
assert.throws(
  () =>
    coordinator.apply(
      initialPlans.get(
        interruptedNoArtifactJob.job_id,
      ),
    ),
  /stale/,
);

// RETRY_PENDING now becomes an explicit retry candidate.
const retryPlans = buildPlans();

assert.equal(
  retryPlans.get(
    interruptedNoArtifactJob.job_id,
  ).action,
  'RETRY_CANDIDATE',
);

const retryResult =
  coordinator.apply(
    retryPlans.get(
      interruptedNoArtifactJob.job_id,
    ),
  );

assert.equal(
  retryResult.outcome,
  'RETRY_STARTED',
);
assert.equal(
  retryResult.attempt.attempt_number,
  2,
);

const afterRetry =
  repositoryA.getJob(
    interruptedNoArtifactJob.job_id,
  );

assert.equal(
  afterRetry.execution_status,
  'RUNNING',
);
assert.equal(
  afterRetry.attempt_count,
  2,
);

const retryHistory =
  repositoryA.listAttempts(
    interruptedNoArtifactJob.job_id,
  );

assert.equal(retryHistory.length, 2);
assert.equal(
  retryHistory[0].execution_status,
  'FAILED',
);
assert.equal(
  retryHistory[0].error_code,
  'INTERRUPTED_ATTEMPT',
);
assert.equal(
  retryHistory[1].execution_status,
  'RUNNING',
);

// FAILED can also be explicitly retried.
const failedPlans = buildPlans();

assert.equal(
  failedPlans.get(
    failedRetryJob.job_id,
  ).action,
  'RETRY_CANDIDATE',
);

const failedRetryResult =
  coordinator.apply(
    failedPlans.get(
      failedRetryJob.job_id,
    ),
  );

assert.equal(
  failedRetryResult.outcome,
  'RETRY_STARTED',
);
assert.equal(
  failedRetryResult.attempt.attempt_number,
  2,
);
assert.equal(
  repositoryA.getJob(
    failedRetryJob.job_id,
  ).execution_status,
  'RUNNING',
);

// Explicit max-attempt policy can deny a retry without creating history.
const exhaustedPlans = buildPlans();

const strictCoordinator =
  new ReconciliationCoordinator(
    repositoryA,
    new RetryPolicy({
      max_attempts: 1,
    }),
  );

const exhaustedResult =
  strictCoordinator.apply(
    exhaustedPlans.get(
      exhaustedJob.job_id,
    ),
  );

assert.equal(
  exhaustedResult.outcome,
  'RETRY_EXHAUSTED',
);
assert.equal(
  repositoryA.getJob(
    exhaustedJob.job_id,
  ).execution_status,
  'FAILED',
);
assert.equal(
  repositoryA.getJob(
    exhaustedJob.job_id,
  ).attempt_count,
  1,
);
assert.equal(
  repositoryA.listAttempts(
    exhaustedJob.job_id,
  ).length,
  1,
);

const runId = created.run.run_id;
const acceptedArtifactId =
  acceptedArtifact.artifact_id;
const candidateArtifactId =
  candidateArtifact.artifact_id;

repositoryA.close();

// Restart: mutation results and historical evidence persist.
const repositoryB =
  new StateRepository(
    getDatabasePath(directories),
  );

assert.equal(
  repositoryB.getJob(
    acceptedJob.job_id,
  ).accepted_artifact_id,
  acceptedArtifactId,
);

assert.equal(
  repositoryB.getArtifact(
    candidateArtifactId,
  ).artifact_state,
  'CANDIDATE',
);

const restartedHistory =
  repositoryB.listAttempts(
    interruptedNoArtifactJob.job_id,
  );

assert.equal(restartedHistory.length, 2);
assert.equal(
  restartedHistory[0].execution_status,
  'FAILED',
);
assert.equal(
  restartedHistory[0].error_code,
  'INTERRUPTED_ATTEMPT',
);
assert.equal(
  restartedHistory[1].execution_status,
  'RUNNING',
);

const restartedPlanner =
  new ResumePlanner(repositoryB);

assert.ok(
  restartedPlanner.planRun(runId),
);

repositoryB.close();

console.log(
  'PASS RECONCILE-001: accepted job is skipped without mutation',
);
console.log(
  'PASS RECONCILE-002: pending job is initial-work eligible but not auto-started',
);
console.log(
  'PASS RECONCILE-003: manual-action job is never auto-failed or retried',
);
console.log(
  'PASS RECONCILE-004: candidate evidence is preserved before recollection',
);
console.log(
  'PASS RECONCILE-005: interrupted attempt without candidate becomes FAILED evidence then RETRY_PENDING',
);
console.log(
  'PASS RETRY-003: explicit retry creates attempt_number 2 and preserves attempt 1',
);
console.log(
  'PASS RETRY-004: FAILED job can be explicitly prepared and retried',
);
console.log(
  'PASS RETRY-005: max-attempt policy denies exhausted retry without creating history',
);
console.log(
  'PASS RECONCILE-006: stale resume plans fail closed before mutation',
);
console.log(
  'PASS RECONCILE-007: reconciliation/retry evidence survives repository restart',
);
