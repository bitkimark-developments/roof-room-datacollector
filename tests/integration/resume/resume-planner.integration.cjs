const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);

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

const databaseDir = path.join(workRoot, 'database');
fs.mkdirSync(databaseDir, { recursive: true });

const directories = {
  app_data_root: workRoot,
  config: path.join(workRoot, 'config'),
  data: path.join(workRoot, 'data'),
  runs: path.join(workRoot, 'data', 'runs'),
  database: databaseDir,
  browser_profiles: path.join(
    workRoot,
    'browser-profiles',
  ),
  logs: path.join(workRoot, 'logs'),
};

const bootstrap = initializeDatabase(directories);

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

const makeConfig = (groupCount, prefix) => ({
  config_version: 1,
  source_id: 'google-trends',
  groups: Array.from(
    { length: groupCount },
    (_, index) => {
      const number = String(index + 1).padStart(2, '0');

      return {
        query_group_id: `${prefix}${number}`,
        query_group_name: `${prefix.toLowerCase()}_${number}`,
        queries: [`query ${prefix}${number}`],
      };
    },
  ),
});

const createRun = (
  repository,
  groupCount,
  prefix,
) =>
  repository.createRunFromQueryConfig({
    query_config: makeConfig(
      groupCount,
      prefix,
    ),
    application_version: '1.0.0',
    requested_configuration: requestedConfiguration,
  });

const registerArtifact = (
  repository,
  attempt,
  filename,
) =>
  repository.registerCandidateArtifact({
    attempt_id: attempt.attempt_id,
    filename,
    relative_path:
      `google-trends/raw/${filename}`,
    media_type: 'text/csv',
    byte_size: 123,
    sha256: null,
  });

const acceptJob = (
  repository,
  job,
  validationStatus = 'VALID',
) => {
  const attempt =
    repository.startAttempt(job.job_id);

  const artifact = registerArtifact(
    repository,
    attempt,
    `${job.query_group_id}.csv`,
  );

  repository.transitionJobExecution(
    job.job_id,
    'VALIDATING',
  );

  repository.recordValidationSummary({
    attempt_id: attempt.attempt_id,
    artifact_id: artifact.artifact_id,
    validation_status: validationStatus,
    checks_total: 1,
    checks_passed: 1,
    checks_warning: 0,
    checks_failed: 0,
    validation_json_path: null,
  });

  repository.transitionJobExecution(
    job.job_id,
    'COMPLETED',
    {
      validation_status: validationStatus,
    },
  );

  return artifact;
};

const databasePath = getDatabasePath(directories);
const repositoryA =
  new StateRepository(databasePath);
const runManagerA = new RunManager(repositoryA);

// One incomplete run containing every resume classification.
const interrupted = createRun(
  repositoryA,
  6,
  'RX',
);
runManagerA.startRun(interrupted.run.run_id);

const [
  acceptedJob,
  runningWithoutArtifactJob,
  runningWithArtifactJob,
  pendingJob,
  failedJob,
  manualJob,
] = interrupted.jobs;

// RESUME-001 / JOB-007 / RESUME-004.
const acceptedArtifact = acceptJob(
  repositoryA,
  acceptedJob,
);

// RESUME-002 foundation: interrupted RUNNING, no artifact.
// This read-only slice classifies it for reconciliation;
// it does not mutate it to FAILED/RETRY_PENDING yet.
repositoryA.startAttempt(
  runningWithoutArtifactJob.job_id,
);

// RESUME-003: interrupted RUNNING with candidate artifact.
const candidateAttempt =
  repositoryA.startAttempt(
    runningWithArtifactJob.job_id,
  );

const candidateArtifact =
  registerArtifact(
    repositoryA,
    candidateAttempt,
    `${runningWithArtifactJob.query_group_id}.csv`,
  );

// PENDING remains untouched.

// Retry candidate from FAILED.
repositoryA.startAttempt(failedJob.job_id);
repositoryA.transitionJobExecution(
  failedJob.job_id,
  'FAILED',
  {
    error_code: 'DOWNLOAD_FAILED',
  },
);

// Manual action remains blocked.
repositoryA.startAttempt(manualJob.job_id);
repositoryA.transitionJobExecution(
  manualJob.job_id,
  'MANUAL_ACTION_REQUIRED',
);

runManagerA.refreshRunStatus(
  interrupted.run.run_id,
);

// A second incomplete run proves multiple-run discovery.
const secondIncomplete = createRun(
  repositoryA,
  1,
  'RY',
);

// A fully completed run must not appear in discovery.
const completed = createRun(
  repositoryA,
  1,
  'RZ',
);
runManagerA.startRun(completed.run.run_id);
acceptJob(repositoryA, completed.jobs[0]);
runManagerA.refreshRunStatus(
  completed.run.run_id,
);

assert.equal(
  repositoryA.getRun(completed.run.run_id).run_status,
  'COMPLETED',
);

const plannerA = new ResumePlanner(repositoryA);
const initialPlans =
  plannerA.discoverIncompleteRuns();

assert.equal(initialPlans.length, 2);

const interruptedPlan = initialPlans.find(
  (plan) =>
    plan.run.run_id === interrupted.run.run_id,
);
const secondPlan = initialPlans.find(
  (plan) =>
    plan.run.run_id ===
    secondIncomplete.run.run_id,
);

assert.ok(interruptedPlan);
assert.ok(secondPlan);
assert.equal(
  initialPlans.some(
    (plan) =>
      plan.run.run_id === completed.run.run_id,
  ),
  false,
);

const actionByJobKey = new Map(
  interruptedPlan.jobs.map((plan) => [
    plan.job.job_key,
    plan,
  ]),
);

const acceptedPlan = actionByJobKey.get(
  acceptedJob.job_key,
);
const noArtifactPlan = actionByJobKey.get(
  runningWithoutArtifactJob.job_key,
);
const candidatePlan = actionByJobKey.get(
  runningWithArtifactJob.job_key,
);
const pendingPlan = actionByJobKey.get(
  pendingJob.job_key,
);
const failedPlan = actionByJobKey.get(
  failedJob.job_key,
);
const manualPlan = actionByJobKey.get(
  manualJob.job_key,
);

assert.ok(acceptedPlan);
assert.ok(noArtifactPlan);
assert.ok(candidatePlan);
assert.ok(pendingPlan);
assert.ok(failedPlan);
assert.ok(manualPlan);

// RESUME-001 / JOB-007.
assert.equal(
  acceptedPlan.action,
  'SKIP_ACCEPTED',
);
assert.equal(
  acceptedPlan.accepted_artifact.artifact_id,
  acceptedArtifact.artifact_id,
);

// RESUME-002 first-stage read-only classification.
assert.equal(
  noArtifactPlan.action,
  'RECONCILE_REQUIRED',
);
assert.equal(
  noArtifactPlan.candidate_artifact,
  null,
);

// RESUME-003.
assert.equal(
  candidatePlan.action,
  'RECONCILE_REQUIRED',
);
assert.equal(
  candidatePlan.candidate_artifact.artifact_id,
  candidateArtifact.artifact_id,
);

// PENDING remains pending.
assert.equal(
  pendingPlan.action,
  'PENDING',
);

// FAILED is a retry candidate; planner does not execute retry.
assert.equal(
  failedPlan.action,
  'RETRY_CANDIDATE',
);

// Manual action remains blocked, not auto-failed/retried.
assert.equal(
  manualPlan.action,
  'BLOCKED_MANUAL_ACTION',
);

// Second incomplete run has its untouched pending job.
assert.equal(secondPlan.jobs.length, 1);
assert.equal(
  secondPlan.jobs[0].action,
  'PENDING',
);

const interruptedRunId =
  interrupted.run.run_id;
const acceptedArtifactId =
  acceptedArtifact.artifact_id;
const candidateArtifactId =
  candidateArtifact.artifact_id;

repositoryA.close();

// Restart reconstruction must produce the same plan.
const repositoryB =
  new StateRepository(databasePath);
const plannerB = new ResumePlanner(repositoryB);

const restartedPlans =
  plannerB.discoverIncompleteRuns();

assert.equal(restartedPlans.length, 2);

const restartedInterrupted =
  plannerB.planRun(interruptedRunId);

assert.ok(restartedInterrupted);

const restartedByKey = new Map(
  restartedInterrupted.jobs.map((plan) => [
    plan.job.job_key,
    plan,
  ]),
);

assert.equal(
  restartedByKey.get(
    acceptedJob.job_key,
  ).action,
  'SKIP_ACCEPTED',
);
assert.equal(
  restartedByKey.get(
    acceptedJob.job_key,
  ).accepted_artifact.artifact_id,
  acceptedArtifactId,
);

assert.equal(
  restartedByKey.get(
    runningWithArtifactJob.job_key,
  ).action,
  'RECONCILE_REQUIRED',
);
assert.equal(
  restartedByKey.get(
    runningWithArtifactJob.job_key,
  ).candidate_artifact.artifact_id,
  candidateArtifactId,
);

assert.equal(
  restartedByKey.get(
    failedJob.job_key,
  ).action,
  'RETRY_CANDIDATE',
);

assert.equal(
  restartedByKey.get(
    manualJob.job_key,
  ).action,
  'BLOCKED_MANUAL_ACTION',
);

// Read-only planner must not mutate persisted job state.
assert.equal(
  repositoryB.getJob(
    runningWithoutArtifactJob.job_id,
  ).execution_status,
  'RUNNING',
);
assert.equal(
  repositoryB.getJob(
    runningWithArtifactJob.job_id,
  ).execution_status,
  'RUNNING',
);
assert.equal(
  repositoryB.getJob(
    failedJob.job_id,
  ).execution_status,
  'FAILED',
);

repositoryB.close();

console.log(
  'PASS DB-009: multiple incomplete runs are discovered while completed runs are excluded',
);
console.log(
  'PASS RESUME-001/JOB-007: completed accepted job is classified SKIP_ACCEPTED',
);
console.log(
  'PASS RESUME-002: interrupted RUNNING job without artifact requires reconciliation',
);
console.log(
  'PASS RESUME-003: interrupted job with candidate is reconciled before recollection',
);
console.log(
  'PASS RESUME-004: accepted artifact reference survives repository restart',
);
console.log(
  'PASS RESUME-005: multiple interrupted runs reconstruct independently',
);
console.log(
  'PASS: FAILED/RETRY_PENDING policy is represented as RETRY_CANDIDATE without auto-retry',
);
console.log(
  'PASS: MANUAL_ACTION_REQUIRED remains blocked and is not auto-retried',
);
console.log(
  'PASS: resume planning is read-only and does not rewrite persisted job states',
);
