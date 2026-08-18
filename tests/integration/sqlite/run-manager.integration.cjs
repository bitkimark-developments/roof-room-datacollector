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
  deriveRunStatusFromJobs,
} = require(
  path.join(
    buildRoot,
    'main',
    'core',
    'run-manager.js',
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

const queryConfig = {
  config_version: 1,
  source_id: 'google-trends',
  groups: [
    {
      query_group_id: 'GT01',
      query_group_name: 'generic_commercial',
      queries: ['canlı bitki'],
    },
    {
      query_group_id: 'GT02',
      query_group_name: 'indoor_terminology',
      queries: ['salon bitkisi'],
    },
  ],
};

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

const createRun = (repository) =>
  repository.createRunFromQueryConfig({
    query_config: queryConfig,
    application_version: '1.0.0',
    requested_configuration: requestedConfiguration,
  });

const completeJob = (
  repository,
  jobId,
  validationStatus,
) => {
  repository.startAttempt(jobId);
  repository.transitionJobExecution(
    jobId,
    'VALIDATING',
  );
  repository.transitionJobExecution(
    jobId,
    'COMPLETED',
    {
      validation_status: validationStatus,
    },
  );
};

const databasePath = getDatabasePath(directories);
const repositoryA = new StateRepository(databasePath);
const managerA = new RunManager(repositoryA);

// RUN-001 + RUN-002
const validRun = createRun(repositoryA);

assert.equal(validRun.run.run_status, 'PENDING');
assert.equal(validRun.run.started_at, null);
assert.equal(validRun.run.completed_at, null);

let persistedValidRun =
  managerA.startRun(validRun.run.run_id);

assert.equal(persistedValidRun.run_status, 'RUNNING');
assert.ok(persistedValidRun.started_at);
assert.equal(persistedValidRun.completed_at, null);

const firstStartedAt = persistedValidRun.started_at;

// RUN-006 manual action aggregation.
repositoryA.startAttempt(validRun.jobs[0].job_id);
repositoryA.transitionJobExecution(
  validRun.jobs[0].job_id,
  'MANUAL_ACTION_REQUIRED',
);

persistedValidRun =
  managerA.refreshRunStatus(validRun.run.run_id);

assert.equal(
  persistedValidRun.run_status,
  'MANUAL_ACTION_REQUIRED',
);
assert.equal(
  persistedValidRun.started_at,
  firstStartedAt,
);

repositoryA.transitionJobExecution(
  validRun.jobs[0].job_id,
  'RUNNING',
);

persistedValidRun =
  managerA.refreshRunStatus(validRun.run.run_id);

assert.equal(persistedValidRun.run_status, 'RUNNING');
assert.equal(
  persistedValidRun.started_at,
  firstStartedAt,
);

// Complete first job after returning from manual action.
repositoryA.transitionJobExecution(
  validRun.jobs[0].job_id,
  'VALIDATING',
);
repositoryA.transitionJobExecution(
  validRun.jobs[0].job_id,
  'COMPLETED',
  {
    validation_status: 'VALID',
  },
);

completeJob(
  repositoryA,
  validRun.jobs[1].job_id,
  'VALID',
);

// RUN-003
persistedValidRun =
  managerA.refreshRunStatus(validRun.run.run_id);

assert.equal(persistedValidRun.run_status, 'COMPLETED');
assert.ok(persistedValidRun.completed_at);
assert.equal(
  persistedValidRun.started_at,
  firstStartedAt,
);

// Terminal run cannot restart.
assert.throws(
  () => managerA.startRun(validRun.run.run_id),
  /cannot start from COMPLETED/,
);

assert.throws(
  () =>
    repositoryA.transitionRunStatus(
      validRun.run.run_id,
      'RUNNING',
    ),
  /Illegal run status transition/,
);

// RUN-004 LOW_DATA warning.
const lowDataRun = createRun(repositoryA);
managerA.startRun(lowDataRun.run.run_id);

completeJob(
  repositoryA,
  lowDataRun.jobs[0].job_id,
  'VALID',
);
completeJob(
  repositoryA,
  lowDataRun.jobs[1].job_id,
  'LOW_DATA',
);

const lowDataResult =
  managerA.refreshRunStatus(lowDataRun.run.run_id);

assert.equal(
  lowDataResult.run_status,
  'COMPLETED_WITH_WARNINGS',
);
assert.ok(lowDataResult.completed_at);

// RUN-005 NO_DATA warning.
const noDataRun = createRun(repositoryA);
managerA.startRun(noDataRun.run.run_id);

completeJob(
  repositoryA,
  noDataRun.jobs[0].job_id,
  'VALID',
);
completeJob(
  repositoryA,
  noDataRun.jobs[1].job_id,
  'NO_DATA',
);

const noDataResult =
  managerA.refreshRunStatus(noDataRun.run.run_id);

assert.equal(
  noDataResult.run_status,
  'COMPLETED_WITH_WARNINGS',
);

// Retryable failure must not force run FAILED.
const retryableRun = createRun(repositoryA);
managerA.startRun(retryableRun.run.run_id);

repositoryA.startAttempt(
  retryableRun.jobs[0].job_id,
);
repositoryA.transitionJobExecution(
  retryableRun.jobs[0].job_id,
  'FAILED',
  {
    error_code: 'DOWNLOAD_FAILED',
  },
);

const retryableResult =
  managerA.refreshRunStatus(
    retryableRun.run.run_id,
  );

assert.equal(retryableResult.run_status, 'RUNNING');

// Hard validation outcome also remains non-terminal until
// retry/final-failure policy is explicitly decided later.
const hardValidationRun = createRun(repositoryA);
managerA.startRun(hardValidationRun.run.run_id);

completeJob(
  repositoryA,
  hardValidationRun.jobs[0].job_id,
  'VALID',
);
completeJob(
  repositoryA,
  hardValidationRun.jobs[1].job_id,
  'INVALID_SCHEMA',
);

const hardValidationResult =
  managerA.refreshRunStatus(
    hardValidationRun.run.run_id,
  );

assert.equal(
  hardValidationResult.run_status,
  'RUNNING',
);

// RUN-007 explicit user cancellation.
// Cancellation does not silently rewrite individual job history.
const cancelledRun = createRun(repositoryA);
managerA.startRun(cancelledRun.run.run_id);

const jobsBeforeCancellation =
  repositoryA.listJobs(cancelledRun.run.run_id);

const cancelledResult =
  managerA.cancelRun(cancelledRun.run.run_id);

assert.equal(cancelledResult.run_status, 'CANCELLED');
assert.ok(cancelledResult.completed_at);

const jobsAfterCancellation =
  repositoryA.listJobs(cancelledRun.run.run_id);

assert.deepEqual(
  jobsAfterCancellation,
  jobsBeforeCancellation,
);

// Pure aggregation guard.
assert.throws(
  () => deriveRunStatusFromJobs([]),
  /at least one persisted job/,
);

const validRunId = validRun.run.run_id;
const lowDataRunId = lowDataRun.run.run_id;
const cancelledRunId = cancelledRun.run.run_id;

repositoryA.close();

// Restart persistence.
const repositoryB = new StateRepository(databasePath);
const managerB = new RunManager(repositoryB);

const reloadedValid = repositoryB.getRun(validRunId);
const reloadedLowData = repositoryB.getRun(lowDataRunId);
const reloadedCancelled =
  repositoryB.getRun(cancelledRunId);

assert.ok(reloadedValid);
assert.ok(reloadedLowData);
assert.ok(reloadedCancelled);

assert.equal(reloadedValid.run_status, 'COMPLETED');
assert.equal(
  reloadedLowData.run_status,
  'COMPLETED_WITH_WARNINGS',
);
assert.equal(
  reloadedCancelled.run_status,
  'CANCELLED',
);

assert.ok(reloadedValid.started_at);
assert.ok(reloadedValid.completed_at);
assert.ok(reloadedLowData.completed_at);
assert.ok(reloadedCancelled.completed_at);

// Refreshing terminal state is stable/idempotent.
assert.equal(
  managerB.refreshRunStatus(validRunId).run_status,
  'COMPLETED',
);

repositoryB.close();

console.log('PASS RUN-001: new run starts PENDING');
console.log(
  'PASS RUN-002: PENDING -> RUNNING and started_at is stable',
);
console.log(
  'PASS RUN-003: all VALID jobs aggregate to COMPLETED',
);
console.log(
  'PASS RUN-004: LOW_DATA aggregates to COMPLETED_WITH_WARNINGS',
);
console.log(
  'PASS RUN-005: NO_DATA aggregates to COMPLETED_WITH_WARNINGS',
);
console.log(
  'PASS RUN-006: blocking job aggregates to MANUAL_ACTION_REQUIRED',
);
console.log(
  'PASS RUN-007: explicit user cancellation persists CANCELLED',
);
console.log(
  'PASS: retryable job failure does not force run FAILED',
);
console.log(
  'PASS: hard validation outcome waits for later retry/failure policy',
);
console.log(
  'PASS: illegal run transitions fail closed',
);
console.log(
  'PASS: terminal run status and timestamps survive restart',
);
