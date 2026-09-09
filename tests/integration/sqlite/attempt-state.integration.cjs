const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

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

assert.equal(bootstrap.schema_version, 5);
assert.equal(bootstrap.migrations_applied, 5);

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

const databasePath = getDatabasePath(directories);
const repositoryA = new StateRepository(databasePath);

const created = repositoryA.createRunFromQueryConfig({
  query_config: queryConfig,
  application_version: '1.0.0',
  requested_configuration: requestedConfiguration,
});

const [successJob, retryJob] = created.jobs;

// JOB-001 + ATTEMPT-001 + ID-004
const successAttempt =
  repositoryA.startAttempt(successJob.job_id);

assert.equal(successAttempt.attempt_number, 1);
assert.equal(
  successAttempt.execution_status,
  'RUNNING',
);

let updatedSuccessJob =
  repositoryA.getJob(successJob.job_id);

assert.ok(updatedSuccessJob);
assert.equal(
  updatedSuccessJob.execution_status,
  'RUNNING',
);
assert.equal(updatedSuccessJob.attempt_count, 1);

// JOB-002
updatedSuccessJob =
  repositoryA.transitionJobExecution(
    successJob.job_id,
    'VALIDATING',
  );

assert.equal(
  updatedSuccessJob.execution_status,
  'VALIDATING',
);

// JOB-003
updatedSuccessJob =
  repositoryA.transitionJobExecution(
    successJob.job_id,
    'COMPLETED',
    {
      validation_status: 'VALID',
    },
  );

assert.equal(
  updatedSuccessJob.execution_status,
  'COMPLETED',
);
assert.equal(
  updatedSuccessJob.validation_status,
  'VALID',
);
assert.ok(updatedSuccessJob.completed_at);

const completedAttempts =
  repositoryA.listAttempts(successJob.job_id);

assert.equal(completedAttempts.length, 1);
assert.equal(
  completedAttempts[0].execution_status,
  'COMPLETED',
);
assert.ok(completedAttempts[0].completed_at);

assert.throws(
  () =>
    repositoryA.transitionJobExecution(
      successJob.job_id,
      'RUNNING',
    ),
  /Illegal job execution transition/,
);

// JOB-004 + attempt error preservation
const failedAttempt =
  repositoryA.startAttempt(retryJob.job_id);

assert.equal(failedAttempt.attempt_number, 1);

let updatedRetryJob =
  repositoryA.transitionJobExecution(
    retryJob.job_id,
    'FAILED',
    {
      error_code: 'DOWNLOAD_FAILED',
    },
  );

assert.equal(
  updatedRetryJob.execution_status,
  'FAILED',
);
assert.equal(
  updatedRetryJob.validation_status,
  'NOT_RUN',
);

let retryAttempts =
  repositoryA.listAttempts(retryJob.job_id);

assert.equal(retryAttempts.length, 1);
assert.equal(
  retryAttempts[0].execution_status,
  'FAILED',
);
assert.equal(
  retryAttempts[0].error_code,
  'DOWNLOAD_FAILED',
);
assert.ok(retryAttempts[0].completed_at);

// JOB-005
updatedRetryJob =
  repositoryA.transitionJobExecution(
    retryJob.job_id,
    'RETRY_PENDING',
  );

assert.equal(
  updatedRetryJob.execution_status,
  'RETRY_PENDING',
);

// Direct RETRY_PENDING -> RUNNING must not bypass attempt creation.
assert.throws(
  () =>
    repositoryA.transitionJobExecution(
      retryJob.job_id,
      'RUNNING',
    ),
  /Use startAttempt/,
);

// ATTEMPT-002 / ID-005
const secondAttempt =
  repositoryA.startAttempt(retryJob.job_id);

assert.equal(secondAttempt.attempt_number, 2);
assert.equal(
  secondAttempt.execution_status,
  'RUNNING',
);

updatedRetryJob =
  repositoryA.getJob(retryJob.job_id);

assert.ok(updatedRetryJob);
assert.equal(updatedRetryJob.attempt_count, 2);
assert.equal(
  updatedRetryJob.execution_status,
  'RUNNING',
);

// ATTEMPT-003 previous failure remains intact.
retryAttempts =
  repositoryA.listAttempts(retryJob.job_id);

assert.equal(retryAttempts.length, 2);
assert.equal(retryAttempts[0].attempt_number, 1);
assert.equal(
  retryAttempts[0].execution_status,
  'FAILED',
);
assert.equal(
  retryAttempts[0].error_code,
  'DOWNLOAD_FAILED',
);
assert.equal(retryAttempts[1].attempt_number, 2);
assert.equal(
  retryAttempts[1].execution_status,
  'RUNNING',
);
assert.equal(retryAttempts[1].error_code, null);

// JOB-006 manual action remains distinct from failure.
updatedRetryJob =
  repositoryA.transitionJobExecution(
    retryJob.job_id,
    'MANUAL_ACTION_REQUIRED',
  );

assert.equal(
  updatedRetryJob.execution_status,
  'MANUAL_ACTION_REQUIRED',
);
assert.equal(
  updatedRetryJob.validation_status,
  'NOT_RUN',
);

updatedRetryJob =
  repositoryA.transitionJobExecution(
    retryJob.job_id,
    'RUNNING',
  );

assert.equal(
  updatedRetryJob.execution_status,
  'RUNNING',
);

updatedRetryJob =
  repositoryA.transitionJobExecution(
    retryJob.job_id,
    'VALIDATING',
  );

updatedRetryJob =
  repositoryA.transitionJobExecution(
    retryJob.job_id,
    'COMPLETED',
    {
      validation_status: 'VALID',
    },
  );

assert.equal(
  updatedRetryJob.execution_status,
  'COMPLETED',
);
assert.equal(
  updatedRetryJob.validation_status,
  'VALID',
);

const runId = created.run.run_id;
repositoryA.close();

// DB-004 + DB-008: attempts survive repository restart.
const repositoryB = new StateRepository(databasePath);

const reloadedJobs = repositoryB.listJobs(runId);
const reloadedRetryAttempts =
  repositoryB.listAttempts(retryJob.job_id);

assert.equal(reloadedJobs.length, 2);
assert.equal(reloadedRetryAttempts.length, 2);

assert.equal(
  reloadedRetryAttempts[0].error_code,
  'DOWNLOAD_FAILED',
);
assert.equal(
  reloadedRetryAttempts[0].execution_status,
  'FAILED',
);
assert.equal(
  reloadedRetryAttempts[1].execution_status,
  'COMPLETED',
);

repositoryB.close();

// Database constraints remain fail-closed.
const direct = new DatabaseSync(databasePath);
direct.exec('PRAGMA foreign_keys = ON');

assert.throws(
  () =>
    direct
      .prepare(`
        UPDATE attempts
        SET execution_status = 'NOT_A_STATUS'
        WHERE attempt_id = ?
      `)
      .run(reloadedRetryAttempts[0].attempt_id),
);

assert.throws(
  () =>
    direct
      .prepare(`
        INSERT INTO attempts (
          attempt_id,
          job_id,
          attempt_number,
          execution_status,
          candidate_artifact_id,
          validation_id,
          error_code,
          started_at,
          completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        `${retryJob.job_id}__attempt_duplicate`,
        retryJob.job_id,
        1,
        'RUNNING',
        null,
        null,
        null,
        new Date().toISOString(),
        null,
      ),
);

assert.deepEqual(
  direct.prepare('PRAGMA foreign_key_check').all(),
  [],
);

direct.close();

console.log(
  'PASS ID-004: first attempt starts at attempt_number 1',
);
console.log(
  'PASS ID-005: retry creates attempt_number 2',
);
console.log(
  'PASS JOB-001: PENDING -> RUNNING via startAttempt',
);
console.log(
  'PASS JOB-002: RUNNING -> VALIDATING',
);
console.log(
  'PASS JOB-003: VALIDATING -> COMPLETED + VALID',
);
console.log(
  'PASS JOB-004: RUNNING -> FAILED with error_code',
);
console.log(
  'PASS JOB-005: FAILED -> RETRY_PENDING',
);
console.log(
  'PASS JOB-006: MANUAL_ACTION_REQUIRED stays distinct from FAILED',
);
console.log(
  'PASS ATTEMPT-001: first attempt persisted',
);
console.log(
  'PASS ATTEMPT-002: retry appends a new attempt',
);
console.log(
  'PASS ATTEMPT-003: prior failed attempt evidence preserved',
);
console.log(
  'PASS DB-004/DB-008: attempts survive repository restart',
);
console.log(
  'PASS: illegal transitions and invalid attempt states fail closed',
);
