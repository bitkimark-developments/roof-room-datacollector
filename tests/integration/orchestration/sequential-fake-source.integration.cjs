const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
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
  StorageManager,
} = require(
  path.join(
    buildRoot,
    'main',
    'storage',
    'storage-manager.js',
  ),
);

const {
  SourceRegistry,
} = require(
  path.join(
    buildRoot,
    'main',
    'core',
    'source-registry.js',
  ),
);

const {
  CollectionValidatorRegistry,
} = require(
  path.join(
    buildRoot,
    'main',
    'core',
    'collection-validator-registry.js',
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

const {
  CollectionOrchestrator,
} = require(
  path.join(
    buildRoot,
    'main',
    'core',
    'collection-orchestrator.js',
  ),
);

const main = async () => {
const appDataRoot = path.join(
  workRoot,
  'app-data',
);

const directories = {
  app_data_root: appDataRoot,
  config: path.join(
    appDataRoot,
    'config',
  ),
  data: path.join(
    appDataRoot,
    'data',
  ),
  runs: path.join(
    appDataRoot,
    'data',
    'runs',
  ),
  database: path.join(
    appDataRoot,
    'database',
  ),
  browser_profiles: path.join(
    appDataRoot,
    'browser-profiles',
  ),
  logs: path.join(
    appDataRoot,
    'logs',
  ),
};

for (const directory of Object.values(
  directories,
)) {
  fs.mkdirSync(directory, {
    recursive: true,
  });
}

const bootstrap =
  initializeDatabase(directories);

assert.equal(bootstrap.status, 'READY');

if (bootstrap.status !== 'READY') {
  throw new Error(bootstrap.error);
}

assert.equal(bootstrap.schema_version, 5);

const requestedConfiguration = {
  source_mode: 'FAKE_TEST',
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

const makeQueryConfig = (
  count,
) => ({
  config_version: 1,
  source_id: 'fake-source',
  groups: Array.from(
    { length: count },
    (_, index) => {
      const number = String(
        index + 1,
      ).padStart(2, '0');

      return {
        query_group_id:
          `GT${number}`,
        query_group_name:
          `fake_gt_${number}`,
        queries: [
          `fake query ${number}`,
        ],
      };
    },
  ),
});

class FakeSourceModule {
  id = 'fake-source';
  name = 'Deterministic Fake Source';
  sourceMode = 'FAKE_TEST';
  datasetTypes = [
    'INTEREST_OVER_TIME',
  ];

  constructor() {
    this.events = [];
    this.active = 0;
    this.maxActive = 0;
    this.failGt02Attempt1 = true;
  }

  setFailGt02Attempt1(value) {
    this.failGt02Attempt1 = value;
  }

  resetEvents() {
    this.events.length = 0;
    this.active = 0;
    this.maxActive = 0;
  }

  getCapabilities() {
    return {
      requires_browser: false,
      requires_oauth: false,
      may_require_manual_login: false,
      supports_custom_date_range: true,
      supports_direct_export: true,
      supports_api: false,
      supports_resume: true,
      max_concurrency: 1,
    };
  }

  async checkReadiness(context) {
    return {
      source_id: this.id,
      readiness_status:
        context.query_config_ready
          ? 'READY'
          : 'NOT_CONFIGURED',
      checked_at:
        '2026-08-18T10:00:00.000Z',
      message: null,
    };
  }

  async collect(context) {
    assert.equal(
      context.source_id,
      this.id,
    );
    assert.equal(
      context.source_context.query_group.query_group_id,
      context.job_key,
    );
    assert.equal(
      context.requested_configuration
        .country_code,
      'TR',
    );

    this.active += 1;
    this.maxActive = Math.max(
      this.maxActive,
      this.active,
    );

    const eventPrefix =
      `${context.job_key}:attempt_${context.attempt_number}`;

    this.events.push(
      `start:${eventPrefix}`,
    );

    try {
      await new Promise((resolve) =>
        setTimeout(resolve, 3),
      );

      if (
        this.failGt02Attempt1 &&
        context.job_key === 'GT02' &&
        context.attempt_number === 1
      ) {
        this.events.push(
          `fail:${eventPrefix}`,
        );

        return {
          result_type: 'FAILED',
          error_code:
            'DOWNLOAD_FAILED',
          message:
            'Deterministic fake download failure.',
        };
      }

      const bytes = Buffer.from(
        [
          'Week,relative_interest',
          `2026-08-09,${40 + context.attempt_number}`,
          '',
        ].join('\n'),
        'utf8',
      );

      this.events.push(
        `success:${eventPrefix}`,
      );

      return {
        result_type:
          'ARTIFACT_PRODUCED',
        preferred_filename:
          `${context.job_key}_TR_24M_interest_over_time.csv`,
        media_type: 'text/csv',
        bytes,
      };
    } finally {
      this.active -= 1;
    }
  }
}

class DeterministicValidator {
  constructor() {
    this.events = [];
  }

  async validate(context) {
    assert.equal(
      fs.existsSync(
        context.absolute_path,
      ),
      true,
    );

    const bytes =
      await fsp.readFile(
        context.absolute_path,
      );

    assert.ok(bytes.length > 0);

    this.events.push(
      `validate:${context.job.job_key}:attempt_${context.attempt.attempt_number}`,
    );

    return {
      validation_status: 'VALID',
      checks_total: 1,
      checks_passed: 1,
      checks_warning: 0,
      checks_failed: 0,
      findings: [
        {
          check_id:
            'FAKE_ARTIFACT_READABLE',
          severity: 'ERROR',
          passed: true,
          message:
            'Deterministic fake artifact is readable.',
          expected: true,
          actual: true,
        },
      ],
    };
  }
}

const createValidatorRegistry = (
  sourceId,
  validator,
) => {
  const validators =
    new CollectionValidatorRegistry();

  validators.register(
    sourceId,
    validator,
  );

  return validators;
};

const registry =
  new SourceRegistry();
const fakeSource =
  new FakeSourceModule();

registry.register(fakeSource);

const summaries =
  await registry.getSummaries({
    query_config_ready: true,
  });

assert.equal(summaries.length, 1);
assert.equal(
  summaries[0].source_id,
  'fake-source',
);
assert.equal(
  summaries[0].readiness
    .readiness_status,
  'READY',
);
assert.equal(
  summaries[0].capabilities
    .max_concurrency,
  1,
);
assert.equal(
  summaries[0].capabilities
    .supports_resume,
  true,
);

const databasePath =
  getDatabasePath(directories);

const repositoryA =
  new StateRepository(databasePath);
const storage =
  new StorageManager(directories);
const validator =
  new DeterministicValidator();
const validators =
  createValidatorRegistry(
    fakeSource.id,
    validator,
  );
const runManagerA =
  new RunManager(repositoryA);
const orchestratorA =
  new CollectionOrchestrator(
    repositoryA,
    storage,
    registry,
    validators,
    runManagerA,
  );

// Main vertical slice: GT01 succeeds, GT02 fails,
// GT03 continues, then GT02 retries explicitly.
const mainRun =
  repositoryA.createRunFromQueryConfig({
    query_config:
      makeQueryConfig(3),
    application_version: '1.0.0',
    requested_configuration:
      requestedConfiguration,
  });

const initial =
  await orchestratorA.runUntilBlocked(
    mainRun.run.run_id,
  );

assert.equal(
  initial.stopped_because,
  'RETRY_REQUIRED',
);

assert.deepEqual(
  fakeSource.events,
  [
    'start:GT01:attempt_1',
    'success:GT01:attempt_1',
    'start:GT02:attempt_1',
    'fail:GT02:attempt_1',
    'start:GT03:attempt_1',
    'success:GT03:attempt_1',
  ],
);

assert.equal(
  fakeSource.maxActive,
  1,
);

const mainJobs =
  repositoryA.listJobs(
    mainRun.run.run_id,
  );

const gt01 = mainJobs[0];
const gt02 = mainJobs[1];
const gt03 = mainJobs[2];

assert.equal(
  gt01.execution_status,
  'COMPLETED',
);
assert.equal(
  gt01.validation_status,
  'VALID',
);
assert.ok(
  gt01.accepted_artifact_id,
);

assert.equal(
  gt02.execution_status,
  'FAILED',
);
assert.equal(
  gt02.attempt_count,
  1,
);

const gt02Attempt1 =
  repositoryA.listAttempts(
    gt02.job_id,
  )[0];

assert.equal(
  gt02Attempt1.error_code,
  'DOWNLOAD_FAILED',
);

assert.equal(
  gt03.execution_status,
  'COMPLETED',
);
assert.ok(
  gt03.accepted_artifact_id,
);

const resumePlannerA =
  new ResumePlanner(repositoryA);

const retryPlan =
  resumePlannerA.planRun(
    mainRun.run.run_id,
  );

assert.ok(retryPlan);

const byKey = new Map(
  retryPlan.jobs.map((plan) => [
    plan.job.job_key,
    plan,
  ]),
);

assert.equal(
  byKey.get('GT01').action,
  'SKIP_ACCEPTED',
);
assert.equal(
  byKey.get('GT02').action,
  'RETRY_CANDIDATE',
);
assert.equal(
  byKey.get('GT03').action,
  'SKIP_ACCEPTED',
);

const reconciler =
  new ReconciliationCoordinator(
    repositoryA,
    new RetryPolicy({
      max_attempts: 2,
    }),
  );

const retryStart =
  reconciler.apply(
    byKey.get('GT02'),
  );

assert.equal(
  retryStart.outcome,
  'RETRY_STARTED',
);
assert.equal(
  retryStart.attempt.attempt_number,
  2,
);

const retryStep =
  await orchestratorA
    .executeStartedAttempt(
      mainRun.run.run_id,
      gt02.job_id,
      retryStart.attempt,
    );

assert.equal(
  retryStep.outcome,
  'JOB_COMPLETED',
);

assert.deepEqual(
  fakeSource.events.slice(-2),
  [
    'start:GT02:attempt_2',
    'success:GT02:attempt_2',
  ],
);

const finalMainJobs =
  repositoryA.listJobs(
    mainRun.run.run_id,
  );

assert.equal(
  finalMainJobs.every(
    (job) =>
      job.execution_status ===
      'COMPLETED',
  ),
  true,
);

const finalGt02 =
  finalMainJobs[1];

assert.equal(
  finalGt02.attempt_count,
  2,
);
assert.ok(
  finalGt02.accepted_artifact_id,
);

const gt02Artifacts =
  repositoryA.listArtifacts(
    finalGt02.job_id,
  );

assert.equal(
  gt02Artifacts.length,
  1,
);
assert.equal(
  gt02Artifacts[0].attempt_number,
  2,
);
assert.equal(
  gt02Artifacts[0].artifact_state,
  'ACCEPTED',
);
assert.match(
  gt02Artifacts[0].filename,
  /__attempt_2\.csv$/,
);

assert.equal(
  repositoryA.getRun(
    mainRun.run.run_id,
  ).run_status,
  'COMPLETED',
);

const gt01MetadataPath =
  storage.resolveRunRelativePath(
    mainRun.run.run_id,
    'fake-source/metadata/GT01.metadata.json',
  );

const gt01Metadata = JSON.parse(
  await fsp.readFile(
    gt01MetadataPath,
    'utf8',
  ),
);

assert.equal(
  gt01Metadata.schema_version,
  1,
);
assert.equal(
  gt01Metadata.run_id,
  mainRun.run.run_id,
);
assert.equal(
  gt01Metadata.job_id,
  gt01.job_id,
);
assert.equal(
  gt01Metadata.raw_artifact_id,
  gt01.accepted_artifact_id,
);
assert.equal(
  gt01Metadata.validation_status,
  'VALID',
);
assert.equal(
  gt01Metadata.actual_date_start,
  null,
);
assert.equal(
  gt01Metadata.actual_date_end,
  null,
);

const gt01ValidationSummary =
  repositoryA.listValidationSummaries(
    gt01.job_id,
  )[0];

assert.equal(
  gt01ValidationSummary.validation_json_path,
  'fake-source/validation/GT01.validation.json',
);

const gt01ValidationDocument =
  JSON.parse(
    await fsp.readFile(
      storage.resolveRunRelativePath(
        mainRun.run.run_id,
        gt01ValidationSummary
          .validation_json_path,
      ),
      'utf8',
    ),
  );

assert.equal(
  gt01ValidationDocument.validation_id,
  gt01ValidationSummary.validation_id,
);
assert.equal(
  gt01ValidationDocument.artifact_id,
  gt01.accepted_artifact_id,
);
assert.equal(
  gt01ValidationDocument.findings.length,
  1,
);

const gt02ValidationSummary =
  repositoryA.listValidationSummaries(
    finalGt02.job_id,
  )[0];

assert.equal(
  gt02ValidationSummary.validation_json_path,
  'fake-source/validation/GT02.attempt_2.validation.json',
);

assert.equal(
  fs.existsSync(
    storage.resolveRunRelativePath(
      mainRun.run.run_id,
      'fake-source/metadata/GT02.attempt_2.metadata.json',
    ),
  ),
  true,
);

// Restart/resume scenario: isolate resume behavior from the
// intentional retry fault used by the main vertical-slice scenario.
fakeSource.setFailGt02Attempt1(false);
fakeSource.resetEvents();

const resumeRun =
  repositoryA.createRunFromQueryConfig({
    query_config:
      makeQueryConfig(2),
    application_version: '1.0.0',
    requested_configuration:
      requestedConfiguration,
  });

const firstResumeStep =
  await orchestratorA.runNext(
    resumeRun.run.run_id,
  );

assert.equal(
  firstResumeStep.outcome,
  'JOB_COMPLETED',
);
assert.equal(
  firstResumeStep.job.job_key,
  'GT01',
);

const resumeRunId =
  resumeRun.run.run_id;

repositoryA.close();

fakeSource.resetEvents();

const repositoryB =
  new StateRepository(databasePath);
const runManagerB =
  new RunManager(repositoryB);
const validatorB =
  new DeterministicValidator();
const validatorsB =
  createValidatorRegistry(
    fakeSource.id,
    validatorB,
  );
const orchestratorB =
  new CollectionOrchestrator(
    repositoryB,
    storage,
    registry,
    validatorsB,
    runManagerB,
  );
const resumePlannerB =
  new ResumePlanner(repositoryB);

const reconstructed =
  resumePlannerB.planRun(
    resumeRunId,
  );

assert.ok(reconstructed);

const reconstructedByKey =
  new Map(
    reconstructed.jobs.map(
      (plan) => [
        plan.job.job_key,
        plan,
      ],
    ),
  );

assert.equal(
  reconstructedByKey.get('GT01')
    .action,
  'SKIP_ACCEPTED',
);
assert.equal(
  reconstructedByKey.get('GT02')
    .action,
  'PENDING',
);

const resumed =
  await orchestratorB.runUntilBlocked(
    resumeRunId,
  );

assert.equal(
  resumed.stopped_because,
  'RUN_COMPLETED',
);

assert.deepEqual(
  fakeSource.events,
  [
    'start:GT02:attempt_1',
    'success:GT02:attempt_1',
  ],
);

const resumedJobs =
  repositoryB.listJobs(
    resumeRunId,
  );

assert.equal(
  resumedJobs[0].attempt_count,
  1,
);
assert.equal(
  resumedJobs[1].attempt_count,
  1,
);
assert.equal(
  resumedJobs.every(
    (job) =>
      job.execution_status ===
      'COMPLETED',
  ),
  true,
);

assert.equal(
  repositoryB.getRun(
    resumeRunId,
  ).run_status,
  'COMPLETED',
);

const invalidMetadataValidator = {
  async validate() {
    return {
      validation_status:
        'VALID',
      checks_total:
        1,
      checks_passed:
        1,
      checks_warning:
        0,
      checks_failed:
        0,
      findings: [
        {
          check_id:
            'FAKE_VALIDATED_METADATA',
          severity:
            'INFO',
          passed:
            true,
          message:
            'Fake validator returned metadata for fail-closed ordering coverage.',
          expected:
            true,
          actual:
            true,
        },
      ],
      validated_metadata: {
        actual_date_start:
          '2026-02-30',
        actual_date_end:
          '2026-08-16',
        country_name:
          'Turkey',
      },
    };
  },
};

const invalidMetadataRun =
  repositoryB.createRunFromQueryConfig({
    query_config:
      makeQueryConfig(1),
    application_version:
      '1.0.0-invalid-metadata-test',
    requested_configuration:
      requestedConfiguration,
  });

const invalidMetadataOrchestrator =
  new CollectionOrchestrator(
    repositoryB,
    storage,
    registry,
    createValidatorRegistry(
      fakeSource.id,
      invalidMetadataValidator,
    ),
    runManagerB,
  );

await assert.rejects(
  () =>
    invalidMetadataOrchestrator
      .runUntilBlocked(
        invalidMetadataRun
          .run.run_id,
      ),
  /actual_date_start must be an ISO calendar date/u,
);

const invalidMetadataJob =
  repositoryB.listJobs(
    invalidMetadataRun
      .run.run_id,
  )[0];

const invalidMetadataArtifacts =
  repositoryB.listArtifacts(
    invalidMetadataJob.job_id,
  );

assert.equal(
  invalidMetadataJob
    .execution_status,
  'VALIDATING',
);
assert.equal(
  invalidMetadataJob
    .accepted_artifact_id,
  null,
);
assert.equal(
  invalidMetadataArtifacts.length,
  1,
);
assert.equal(
  invalidMetadataArtifacts[0]
    .artifact_state,
  'CANDIDATE',
);
assert.equal(
  repositoryB
    .listValidationSummaries(
      invalidMetadataJob.job_id,
    ).length,
  0,
);

repositoryB.close();

console.log(
  'PASS SOURCE-GATE-001: fake source registers, exposes capabilities/readiness, and receives controlled job context',
);
console.log(
  'PASS ORCH-001: jobs execute sequentially with max active collection count 1',
);
console.log(
  'PASS ORCH-002: later pending job remains eligible after an earlier job failure',
);
console.log(
  'PASS PIPELINE-001: fake artifact passes through StorageManager, candidate registration, validation, and acceptance',
);
console.log(
  'PASS RETRY-006: failed fake job retries through attempt 2 and becomes canonical',
);
console.log(
  'PASS RETRY-007: attempt 1 DOWNLOAD_FAILED evidence remains preserved',
);
console.log(
  'PASS RESUME-006: restart skips accepted job and continues only remaining pending work',
);
console.log(
  'PASS SOURCE-GATE-002: deterministic fake source survives storage, validation, retry, and resume reconstruction',
);
console.log(
  'PASS PIPELINE-002: dataset metadata JSON persists canonical provenance with unknown actual dates left null',
);
console.log(
  'PASS PIPELINE-003: detailed validation JSON persists and SQLite stores its run-relative path',
);
console.log(
  'PASS PIPELINE-004: invalid validator metadata fails before candidate-to-accepted state promotion',
);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
