const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
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
  path.join(buildRoot, 'main', 'storage', 'database.js'),
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
  path.join(buildRoot, 'main', 'core', 'source-registry.js'),
);
const {
  RunManager,
} = require(
  path.join(buildRoot, 'main', 'core', 'run-manager.js'),
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
  ResumePlanner,
} = require(
  path.join(buildRoot, 'main', 'core', 'resume-planner.js'),
);
const {
  RetryPolicy,
} = require(
  path.join(buildRoot, 'main', 'core', 'retry-policy.js'),
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

const main = async () => {
  const root = path.join(workRoot, 'source-neutral-core');
  const directories = {
    app_data_root: root,
    config: path.join(root, 'config'),
    data: path.join(root, 'data'),
    runs: path.join(root, 'data', 'runs'),
    database: path.join(root, 'database'),
    browser_profiles: path.join(root, 'browser-profiles'),
    logs: path.join(root, 'logs'),
  };

  for (const directory of Object.values(directories)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const bootstrap = initializeDatabase(directories);

  assert.equal(bootstrap.status, 'READY');

  if (bootstrap.status !== 'READY') {
    throw new Error(bootstrap.error);
  }

  const contexts = {
    accepted: {
      dataset_type: 'DETERMINISTIC_JSON',
      acquisition_mode: 'FILE_IMPORT',
      fixture_id: 'accepted',
    },
    retry: {
      dataset_type: 'DETERMINISTIC_JSON',
      acquisition_mode: 'FILE_IMPORT',
      fixture_id: 'retry',
      nullable_evidence: null,
    },
  };

  class FakeJsonSource {
    id = 'fake-json';
    name = 'Deterministic JSON Source';
    sourceMode = 'FAKE_JSON_FILE_IMPORT';
    datasetTypes = ['DETERMINISTIC_JSON'];

    getCapabilities() {
      return {
        requires_browser: false,
        requires_oauth: false,
        may_require_manual_login: false,
        supports_custom_date_range: false,
        supports_direct_export: false,
        supports_api: false,
        supports_resume: true,
        max_concurrency: 1,
      };
    }

    async checkReadiness() {
      return {
        source_id: this.id,
        readiness_status: 'READY',
        checked_at: '2026-09-09T00:00:00.000Z',
        message: null,
      };
    }

    async collect(context) {
      assert.equal(
        Object.hasOwn(context, 'query_group'),
        false,
      );
      assert.equal(context.query_group_id, null);
      assert.deepEqual(
        context.source_context,
        context.job_key === 'accepted'
          ? contexts.accepted
          : contexts.retry,
      );

      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename: `${context.job_key}.json`,
        media_type: 'application/json',
        bytes: Buffer.from(
          JSON.stringify({
            job_key: context.job_key,
            attempt_number: context.attempt_number,
            value: context.attempt_number === 1 ? null : 0,
          }),
          'utf8',
        ),
      };
    }
  }

  const validator = {
    async validate(context) {
      assert.equal(
        Object.hasOwn(context, 'query_group'),
        false,
      );
      assert.deepEqual(
        context.source_context,
        context.job.job_key === 'accepted'
          ? contexts.accepted
          : contexts.retry,
      );

      const document = JSON.parse(
        await fsp.readFile(context.absolute_path, 'utf8'),
      );

      assert.equal(document.job_key, context.job.job_key);

      const rejected =
        context.job.job_key === 'retry' &&
        context.attempt.attempt_number === 1;

      return {
        validation_status: rejected ? 'INVALID_SCHEMA' : 'VALID',
        checks_total: 1,
        checks_passed: rejected ? 0 : 1,
        checks_warning: 0,
        checks_failed: rejected ? 1 : 0,
        findings: [
          {
            check_id: 'FAKE_JSON_SHAPE',
            severity: 'ERROR',
            passed: !rejected,
            message: rejected
              ? 'Attempt one is rejected deterministically.'
              : 'JSON shape is accepted.',
            expected: { accepted: true },
            actual: { accepted: !rejected },
          },
        ],
      };
    },
  };

  const databasePath = getDatabasePath(directories);
  const storage = new StorageManager(directories);
  const registry = new SourceRegistry();
  const source = new FakeJsonSource();
  const validators =
    new CollectionValidatorRegistry();

  registry.register(source);
  validators.register(source.id, validator);

  const repositoryA = new StateRepository(databasePath);
  const runManagerA = new RunManager(repositoryA);
  const orchestratorA = new CollectionOrchestrator(
    repositoryA,
    storage,
    registry,
    validators,
    runManagerA,
  );
  const created = repositoryA.createRunFromJobPlans({
    application_version: '1.0.0',
    configuration_snapshot: {
      schema_version: 1,
      source_id: 'fake-json',
    },
    job_plans: [
      {
        source_id: 'fake-json',
        job_key: 'accepted',
        query_group_id: null,
        source_context: contexts.accepted,
      },
      {
        source_id: 'fake-json',
        job_key: 'retry',
        query_group_id: null,
        source_context: contexts.retry,
      },
    ],
  });

  assert.equal(
    created.jobs.every((job) => job.query_group_id === null),
    true,
  );

  const initial = await orchestratorA.runUntilBlocked(
    created.run.run_id,
  );

  assert.equal(initial.stopped_because, 'RETRY_REQUIRED');

  const acceptedJob = repositoryA.getJob(created.jobs[0].job_id);
  const rejectedJob = repositoryA.getJob(created.jobs[1].job_id);

  assert.equal(acceptedJob.execution_status, 'COMPLETED');
  assert.equal(acceptedJob.validation_status, 'VALID');
  assert.equal(rejectedJob.execution_status, 'FAILED');
  assert.equal(rejectedJob.validation_status, 'INVALID_SCHEMA');

  const rejectedArtifact = repositoryA.listArtifacts(
    rejectedJob.job_id,
  )[0];

  assert.equal(rejectedArtifact.artifact_state, 'REJECTED');
  assert.equal(rejectedArtifact.media_type, 'application/json');
  assert.equal(
    fs.existsSync(
      storage.resolveRunRelativePath(
        created.run.run_id,
        rejectedArtifact.relative_path,
      ),
    ),
    true,
  );

  const acceptedMetadataPath = storage.resolveRunRelativePath(
    created.run.run_id,
    'fake-json/metadata/accepted.metadata.json',
  );
  const acceptedMetadata = JSON.parse(
    await fsp.readFile(acceptedMetadataPath, 'utf8'),
  );

  assert.deepEqual(
    {
      schema_version: acceptedMetadata.schema_version,
      run_id: acceptedMetadata.run_id,
      job_id: acceptedMetadata.job_id,
      attempt_id: acceptedMetadata.attempt_id,
      attempt_number: acceptedMetadata.attempt_number,
      source_id: acceptedMetadata.source_id,
      source_mode: acceptedMetadata.source_mode,
      job_key: acceptedMetadata.job_key,
      query_group_id: acceptedMetadata.query_group_id,
      source_context: acceptedMetadata.source_context,
      raw_artifact_id: acceptedMetadata.raw_artifact_id,
      validation_status: acceptedMetadata.validation_status,
    },
    {
      schema_version: 2,
      run_id: created.run.run_id,
      job_id: acceptedJob.job_id,
      attempt_id:
        `${acceptedJob.job_id}__attempt_1`,
      attempt_number: 1,
      source_id: 'fake-json',
      source_mode: 'FAKE_JSON_FILE_IMPORT',
      job_key: 'accepted',
      query_group_id: null,
      source_context: contexts.accepted,
      raw_artifact_id: acceptedJob.accepted_artifact_id,
      validation_status: 'VALID',
    },
  );

  const runId = created.run.run_id;
  const retryJobId = rejectedJob.job_id;

  repositoryA.close();

  const repositoryB = new StateRepository(databasePath);
  const resumePlan = new ResumePlanner(repositoryB).planRun(runId);

  assert.ok(resumePlan);

  const retryPlan = resumePlan.jobs.find(
    (plan) => plan.job.job_id === retryJobId,
  );

  assert.ok(retryPlan);
  assert.equal(retryPlan.action, 'RETRY_CANDIDATE');
  assert.deepEqual(retryPlan.job.source_context, contexts.retry);

  const retry = new ReconciliationCoordinator(
    repositoryB,
    new RetryPolicy({ max_attempts: 2 }),
  ).apply(retryPlan);

  assert.equal(retry.outcome, 'RETRY_STARTED');
  assert.equal(retry.attempt.attempt_number, 2);

  const retryResult = await new CollectionOrchestrator(
    repositoryB,
    storage,
    registry,
    validators,
    new RunManager(repositoryB),
  ).executeStartedAttempt(runId, retryJobId, retry.attempt);

  assert.equal(retryResult.outcome, 'JOB_COMPLETED');

  const retriedJob = repositoryB.getJob(retryJobId);
  const retryArtifacts = repositoryB.listArtifacts(retryJobId);
  const retryAttempts = repositoryB.listAttempts(retryJobId);

  assert.equal(retriedJob.query_group_id, null);
  assert.deepEqual(retriedJob.source_context, contexts.retry);
  assert.equal(retriedJob.attempt_count, 2);
  assert.equal(retriedJob.execution_status, 'COMPLETED');
  assert.equal(retriedJob.validation_status, 'VALID');
  assert.equal(retryAttempts.length, 2);
  assert.equal(retryAttempts[0].execution_status, 'FAILED');
  assert.equal(retryAttempts[1].execution_status, 'COMPLETED');
  assert.equal(retryArtifacts.length, 2);
  assert.equal(retryArtifacts[0].artifact_state, 'REJECTED');
  assert.equal(retryArtifacts[1].artifact_state, 'ACCEPTED');
  assert.equal(repositoryB.getRun(runId).run_status, 'COMPLETED');

  repositoryB.close();

  console.log(
    'PASS SOURCE-NEUTRAL-001: fake JSON source completes persistence, validation, rejection, provenance, restart, resume, and retry without QueryGroup',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
