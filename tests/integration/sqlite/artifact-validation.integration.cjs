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

assert.equal(bootstrap.schema_version, 6);
assert.equal(bootstrap.migrations_applied, 6);

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
const workspace = repositoryA.createWorkspace({
  workspace_name: 'Artifact Validation Workspace',
});

const created = repositoryA.createRunFromQueryConfig({
  workspace_id: workspace.workspace_id,
  query_config: queryConfig,
  application_version: '1.0.0',
  requested_configuration: requestedConfiguration,
});

const [validJob, retryJob] = created.jobs;

// Candidate must remain CANDIDATE before validation.
const validAttempt =
  repositoryA.startAttempt(validJob.job_id);

const validArtifact =
  repositoryA.registerCandidateArtifact({
    attempt_id: validAttempt.attempt_id,
    filename: 'GT01_TR_24M_interest_over_time.csv',
    relative_path:
      'google-trends/raw/GT01_TR_24M_interest_over_time.csv',
    media_type: 'text/csv',
    byte_size: 1234,
    sha256: null,
  });

assert.equal(
  validArtifact.artifact_kind,
  'RAW_SOURCE_FILE',
);
assert.equal(
  validArtifact.artifact_state,
  'CANDIDATE',
);

let linkedValidAttempt =
  repositoryA.getAttempt(validAttempt.attempt_id);

assert.ok(linkedValidAttempt);
assert.equal(
  linkedValidAttempt.candidate_artifact_id,
  validArtifact.artifact_id,
);
assert.equal(linkedValidAttempt.validation_id, null);

assert.throws(
  () =>
    repositoryA.registerCandidateArtifact({
      attempt_id: validAttempt.attempt_id,
      filename: 'duplicate.csv',
      relative_path:
        'google-trends/raw/duplicate.csv',
      media_type: 'text/csv',
      byte_size: 1,
      sha256: null,
    }),
  /already has a candidate artifact/,
);

repositoryA.transitionJobExecution(
  validJob.job_id,
  'VALIDATING',
);

const validValidation =
  repositoryA.recordValidationSummary({
    attempt_id: validAttempt.attempt_id,
    artifact_id: validArtifact.artifact_id,
    validation_status: 'VALID',
    checks_total: 3,
    checks_passed: 3,
    checks_warning: 0,
    checks_failed: 0,
    validation_json_path: null,
  });

assert.equal(
  validValidation.validation_status,
  'VALID',
);
assert.equal(
  validValidation.artifact_id,
  validArtifact.artifact_id,
);

const acceptedArtifact =
  repositoryA.getArtifact(validArtifact.artifact_id);
assert.ok(acceptedArtifact);
assert.equal(
  acceptedArtifact.artifact_state,
  'ACCEPTED',
);

linkedValidAttempt =
  repositoryA.getAttempt(validAttempt.attempt_id);
assert.ok(linkedValidAttempt);
assert.equal(
  linkedValidAttempt.validation_id,
  validValidation.validation_id,
);

let validJobAfterValidation =
  repositoryA.getJob(validJob.job_id);
assert.ok(validJobAfterValidation);
assert.equal(
  validJobAfterValidation.validation_status,
  'VALID',
);
assert.equal(
  validJobAfterValidation.accepted_artifact_id,
  validArtifact.artifact_id,
);

repositoryA.transitionJobExecution(
  validJob.job_id,
  'COMPLETED',
  {
    validation_status: 'VALID',
  },
);

// Rejected artifact stays traceable and cannot become canonical.
const rejectedAttempt =
  repositoryA.startAttempt(retryJob.job_id);

const rejectedArtifact =
  repositoryA.registerCandidateArtifact({
    attempt_id: rejectedAttempt.attempt_id,
    filename: 'GT02_TR_24M_interest_over_time.csv',
    relative_path:
      'google-trends/raw/GT02_TR_24M_interest_over_time.csv',
    media_type: 'text/csv',
    byte_size: 54,
    sha256:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });

repositoryA.transitionJobExecution(
  retryJob.job_id,
  'VALIDATING',
);

const rejectedValidation =
  repositoryA.recordValidationSummary({
    attempt_id: rejectedAttempt.attempt_id,
    artifact_id: rejectedArtifact.artifact_id,
    validation_status: 'INVALID_SCHEMA',
    checks_total: 3,
    checks_passed: 1,
    checks_warning: 0,
    checks_failed: 2,
    validation_json_path:
      'google-trends/validation/GT02.attempt_1.validation.json',
  });

assert.equal(
  rejectedValidation.validation_status,
  'INVALID_SCHEMA',
);

const rejectedAfterValidation =
  repositoryA.getArtifact(
    rejectedArtifact.artifact_id,
  );
assert.ok(rejectedAfterValidation);
assert.equal(
  rejectedAfterValidation.artifact_state,
  'REJECTED',
);

let retryJobAfterRejection =
  repositoryA.getJob(retryJob.job_id);
assert.ok(retryJobAfterRejection);
assert.equal(
  retryJobAfterRejection.validation_status,
  'INVALID_SCHEMA',
);
assert.equal(
  retryJobAfterRejection.accepted_artifact_id,
  null,
);

// Preserve rejected evidence, then retry the job.
repositoryA.transitionJobExecution(
  retryJob.job_id,
  'FAILED',
  {
    error_code: 'VALIDATION_REJECTED',
  },
);
repositoryA.transitionJobExecution(
  retryJob.job_id,
  'RETRY_PENDING',
);

const retryAttempt =
  repositoryA.startAttempt(retryJob.job_id);

assert.equal(retryAttempt.attempt_number, 2);

const retryArtifact =
  repositoryA.registerCandidateArtifact({
    attempt_id: retryAttempt.attempt_id,
    filename:
      'GT02_TR_24M_interest_over_time__attempt_2.csv',
    relative_path:
      'google-trends/raw/GT02_TR_24M_interest_over_time__attempt_2.csv',
    media_type: 'text/csv',
    byte_size: 998,
    sha256: null,
  });

repositoryA.transitionJobExecution(
  retryJob.job_id,
  'VALIDATING',
);

const retryValidation =
  repositoryA.recordValidationSummary({
    attempt_id: retryAttempt.attempt_id,
    artifact_id: retryArtifact.artifact_id,
    validation_status: 'LOW_DATA',
    checks_total: 4,
    checks_passed: 3,
    checks_warning: 1,
    checks_failed: 0,
    validation_json_path: null,
  });

const retryAcceptedArtifact =
  repositoryA.getArtifact(
    retryArtifact.artifact_id,
  );
assert.ok(retryAcceptedArtifact);
assert.equal(
  retryAcceptedArtifact.artifact_state,
  'ACCEPTED_WITH_WARNING',
);

retryJobAfterRejection =
  repositoryA.getJob(retryJob.job_id);
assert.ok(retryJobAfterRejection);
assert.equal(
  retryJobAfterRejection.validation_status,
  'LOW_DATA',
);
assert.equal(
  retryJobAfterRejection.accepted_artifact_id,
  retryArtifact.artifact_id,
);

repositoryA.transitionJobExecution(
  retryJob.job_id,
  'COMPLETED',
  {
    validation_status: 'LOW_DATA',
  },
);

// Historical evidence is append-only.
const retryArtifacts =
  repositoryA.listArtifacts(retryJob.job_id);
const retryValidations =
  repositoryA.listValidationSummaries(
    retryJob.job_id,
  );
const retryAttempts =
  repositoryA.listAttempts(retryJob.job_id);

assert.equal(retryArtifacts.length, 2);
assert.equal(retryValidations.length, 2);
assert.equal(retryAttempts.length, 2);

assert.equal(
  retryArtifacts[0].artifact_state,
  'REJECTED',
);
assert.equal(
  retryArtifacts[1].artifact_state,
  'ACCEPTED_WITH_WARNING',
);
assert.equal(
  retryValidations[0].validation_status,
  'INVALID_SCHEMA',
);
assert.equal(
  retryValidations[1].validation_status,
  'LOW_DATA',
);
assert.equal(
  retryAttempts[0].candidate_artifact_id,
  rejectedArtifact.artifact_id,
);
assert.equal(
  retryAttempts[0].validation_id,
  rejectedValidation.validation_id,
);
assert.equal(
  retryAttempts[1].candidate_artifact_id,
  retryArtifact.artifact_id,
);
assert.equal(
  retryAttempts[1].validation_id,
  retryValidation.validation_id,
);

// Invalid validation count combinations fail before persistence.
assert.throws(
  () =>
    repositoryA.recordValidationSummary({
      attempt_id: retryAttempt.attempt_id,
      artifact_id: retryArtifact.artifact_id,
      validation_status: 'VALID',
      checks_total: 2,
      checks_passed: 1,
      checks_warning: 0,
      checks_failed: 0,
      validation_json_path: null,
    }),
  /must add up/,
);

const runId = created.run.run_id;
repositoryA.close();

// Restart persistence.
const repositoryB = new StateRepository(databasePath);

const reloadedValidArtifact =
  repositoryB.getArtifact(validArtifact.artifact_id);
const reloadedValidValidation =
  repositoryB.getValidationSummary(
    validValidation.validation_id,
  );
const reloadedRetryArtifacts =
  repositoryB.listArtifacts(retryJob.job_id);
const reloadedRetryValidations =
  repositoryB.listValidationSummaries(
    retryJob.job_id,
  );
const reloadedRetryJob =
  repositoryB.getJob(retryJob.job_id);

assert.ok(reloadedValidArtifact);
assert.ok(reloadedValidValidation);
assert.ok(reloadedRetryJob);

assert.equal(
  reloadedValidArtifact.artifact_state,
  'ACCEPTED',
);
assert.equal(
  reloadedValidValidation.validation_status,
  'VALID',
);
assert.equal(reloadedRetryArtifacts.length, 2);
assert.equal(reloadedRetryValidations.length, 2);
assert.equal(
  reloadedRetryJob.accepted_artifact_id,
  retryArtifact.artifact_id,
);

repositoryB.close();

// DB constraints fail closed.
const direct = new DatabaseSync(databasePath);
direct.exec('PRAGMA foreign_keys = ON');

assert.throws(
  () =>
    direct
      .prepare(`
        UPDATE artifacts
        SET artifact_state = 'NOT_A_STATE'
        WHERE artifact_id = ?
      `)
      .run(validArtifact.artifact_id),
);

assert.throws(
  () =>
    direct
      .prepare(`
        INSERT INTO validations (
          validation_id,
          run_id,
          job_id,
          artifact_id,
          validation_status,
          checks_total,
          checks_passed,
          checks_warning,
          checks_failed,
          validated_at,
          validation_json_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        'validation_invalid_status',
        runId,
        validJob.job_id,
        validArtifact.artifact_id,
        'NOT_RUN',
        0,
        0,
        0,
        0,
        new Date().toISOString(),
        null,
      ),
);

assert.throws(
  () =>
    direct
      .prepare(`
        INSERT INTO validations (
          validation_id,
          run_id,
          job_id,
          artifact_id,
          validation_status,
          checks_total,
          checks_passed,
          checks_warning,
          checks_failed,
          validated_at,
          validation_json_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        'validation_bad_counts',
        runId,
        validJob.job_id,
        validArtifact.artifact_id,
        'VALID',
        2,
        1,
        0,
        0,
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
  'PASS ARTIFACT-001: candidate artifact persists before validation',
);
console.log(
  'PASS ARTIFACT-002: attempt links to one candidate artifact',
);
console.log(
  'PASS VALIDATION-001: VALID maps artifact to ACCEPTED',
);
console.log(
  'PASS VALIDATION-002: INVALID_SCHEMA maps artifact to REJECTED',
);
console.log(
  'PASS VALIDATION-003: LOW_DATA maps artifact to ACCEPTED_WITH_WARNING',
);
console.log(
  'PASS ACCEPT-001: accepted_artifact_id is set only after accepted validation',
);
console.log(
  'PASS RETRY-001: retry success becomes the job canonical artifact',
);
console.log(
  'PASS RETRY-002: rejected attempt/artifact/validation history is preserved',
);
console.log(
  'PASS DB-ARTIFACT-001: artifact/validation records survive restart',
);
console.log(
  'PASS: invalid artifact/validation persisted states fail closed',
);
