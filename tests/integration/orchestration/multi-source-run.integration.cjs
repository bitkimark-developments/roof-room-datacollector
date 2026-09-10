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

const main = async () => {
  const root = path.join(
    workRoot,
    'multi-source-run',
  );
  const directories = {
    app_data_root: root,
    config: path.join(root, 'config'),
    data: path.join(root, 'data'),
    runs: path.join(root, 'data', 'runs'),
    database: path.join(root, 'database'),
    browser_profiles: path.join(
      root,
      'browser-profiles',
    ),
    logs: path.join(root, 'logs'),
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
  assert.equal(bootstrap.schema_version, 8);

  if (bootstrap.status !== 'READY') {
    throw new Error(bootstrap.error);
  }

  const contexts = {
    alpha: {
      dataset_type: 'FAKE_ALPHA',
      request: {
        source_marker: 'a-alpha',
      },
    },
    gamma: {
      dataset_type: 'FAKE_GAMMA',
      request: {
        source_marker: 'b-gamma',
      },
    },
    beta: {
      dataset_type: 'FAKE_BETA',
      request: {
        source_marker: 'a-beta',
      },
    },
  };
  const collectionEvents = [];
  const validationEvents = [];

  class FakeSource {
    constructor(id, sourceMode, jobKeys) {
      this.id = id;
      this.name = `Deterministic ${id}`;
      this.sourceMode = sourceMode;
      this.datasetTypes = ['DETERMINISTIC_JSON'];
      this.jobKeys = new Set(jobKeys);
    }

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
        checked_at:
          '2026-09-10T00:00:00.000Z',
        message: null,
      };
    }

    async collect(context) {
      assert.equal(context.source_id, this.id);
      assert.equal(
        this.jobKeys.has(context.job_key),
        true,
      );
      assert.deepEqual(
        context.source_context,
        contexts[context.job_key],
      );
      assert.equal(context.query_group_id, null);
      assert.equal(
        context.requested_configuration,
        null,
      );

      collectionEvents.push(
        `${this.id}:${context.job_key}:attempt_${context.attempt_number}`,
      );

      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename:
          `${context.job_key}.json`,
        media_type: 'application/json',
        bytes: Buffer.from(
          JSON.stringify({
            source_id: this.id,
            job_key: context.job_key,
            attempt_number:
              context.attempt_number,
            source_marker:
              context.source_context
                .request.source_marker,
          }),
          'utf8',
        ),
      };
    }
  }

  const makeValidator = (
    sourceId,
    sourceMode,
  ) => ({
    async validate(context) {
      if (
        context.job.source_id !== sourceId ||
        context.artifact.source_id !== sourceId
      ) {
        throw new Error(
          `${sourceId} validator rejected evidence from another source.`,
        );
      }

      assert.deepEqual(
        context.source_context,
        contexts[context.job.job_key],
      );

      const document = JSON.parse(
        await fsp.readFile(
          context.absolute_path,
          'utf8',
        ),
      );

      assert.deepEqual(document, {
        source_id: sourceId,
        job_key: context.job.job_key,
        attempt_number:
          context.attempt.attempt_number,
        source_marker:
          context.source_context
            .request.source_marker,
      });

      validationEvents.push(
        `${sourceId}:${context.job.job_key}:attempt_${context.attempt.attempt_number}`,
      );

      const rejected =
        sourceId === 'fake-source-b' &&
        sourceMode === 'FAKE_SOURCE_B' &&
        context.job.job_key === 'gamma' &&
        context.attempt.attempt_number === 1;

      return {
        validation_status:
          rejected ? 'INVALID_SCHEMA' : 'VALID',
        checks_total: 1,
        checks_passed: rejected ? 0 : 1,
        checks_warning: 0,
        checks_failed: rejected ? 1 : 0,
        findings: [
          {
            check_id:
              `${sourceId.toUpperCase().replaceAll('-', '_')}_IDENTITY`,
            severity: 'ERROR',
            passed: !rejected,
            message: rejected
              ? 'Gamma attempt one is rejected deterministically.'
              : 'Source-specific identity is valid.',
            expected: {
              source_id: sourceId,
              accepted: true,
            },
            actual: {
              source_id: document.source_id,
              accepted: !rejected,
            },
          },
        ],
      };
    },
  });

  const sourceA = new FakeSource(
    'fake-source-a',
    'FAKE_SOURCE_A',
    ['alpha', 'beta'],
  );
  const sourceB = new FakeSource(
    'fake-source-b',
    'FAKE_SOURCE_B',
    ['gamma'],
  );
  const validatorA = makeValidator(
    sourceA.id,
    sourceA.sourceMode,
  );
  const validatorB = makeValidator(
    sourceB.id,
    sourceB.sourceMode,
  );
  const sources = new SourceRegistry();
  const validators =
    new CollectionValidatorRegistry();

  sources.register(sourceA);
  sources.register(sourceB);
  validators.register(sourceA.id, validatorA);
  validators.register(sourceB.id, validatorB);

  const databasePath =
    getDatabasePath(directories);
  const storage =
    new StorageManager(directories);
  const repositoryA =
    new StateRepository(databasePath);
  const workspace = repositoryA.createWorkspace({
    workspace_name: 'Multi Source Run Workspace',
  });
  const orchestratorA =
    new CollectionOrchestrator(
      repositoryA,
      storage,
      sources,
      validators,
      new RunManager(repositoryA),
    );
  const configurationSnapshot = {
    schema_version: 1,
    sources: [
      {
        source_id: sourceA.id,
        requested_context: {
          batch_label: 'primary',
        },
      },
      {
        source_id: sourceB.id,
        requested_context: {
          batch_label: 'secondary',
        },
      },
    ],
  };
  const created =
    repositoryA.createRunFromJobPlans({
      workspace_id: workspace.workspace_id,
      application_version: '1.0.0',
      configuration_snapshot:
        configurationSnapshot,
      job_plans: [
        {
          source_id: sourceA.id,
          job_key: 'alpha',
          query_group_id: null,
          source_context: contexts.alpha,
        },
        {
          source_id: sourceB.id,
          job_key: 'gamma',
          query_group_id: null,
          source_context: contexts.gamma,
        },
        {
          source_id: sourceA.id,
          job_key: 'beta',
          query_group_id: null,
          source_context: contexts.beta,
        },
      ],
    });

  assert.deepEqual(
    created.run.selected_sources,
    ['fake-source-a', 'fake-source-b'],
  );
  assert.deepEqual(
    created.run.configuration_snapshot,
    configurationSnapshot,
  );
  assert.deepEqual(
    created.jobs.map((job) => ({
      source_id: job.source_id,
      job_key: job.job_key,
      source_context: job.source_context,
    })),
    [
      {
        source_id: 'fake-source-a',
        job_key: 'alpha',
        source_context: contexts.alpha,
      },
      {
        source_id: 'fake-source-b',
        job_key: 'gamma',
        source_context: contexts.gamma,
      },
      {
        source_id: 'fake-source-a',
        job_key: 'beta',
        source_context: contexts.beta,
      },
    ],
  );

  const initial =
    await orchestratorA.runUntilBlocked(
      created.run.run_id,
    );

  assert.equal(
    initial.stopped_because,
    'RETRY_REQUIRED',
  );
  assert.deepEqual(collectionEvents, [
    'fake-source-a:alpha:attempt_1',
    'fake-source-b:gamma:attempt_1',
    'fake-source-a:beta:attempt_1',
  ]);
  assert.deepEqual(validationEvents, [
    'fake-source-a:alpha:attempt_1',
    'fake-source-b:gamma:attempt_1',
    'fake-source-a:beta:attempt_1',
  ]);

  const initialJobs = new Map(
    repositoryA
      .listJobs(created.run.run_id)
      .map((job) => [job.job_key, job]),
  );
  const alpha = initialJobs.get('alpha');
  const gamma = initialJobs.get('gamma');
  const beta = initialJobs.get('beta');

  assert.equal(alpha.execution_status, 'COMPLETED');
  assert.equal(alpha.validation_status, 'VALID');
  assert.equal(alpha.attempt_count, 1);
  assert.ok(alpha.accepted_artifact_id);
  assert.equal(gamma.execution_status, 'FAILED');
  assert.equal(
    gamma.validation_status,
    'INVALID_SCHEMA',
  );
  assert.equal(gamma.attempt_count, 1);
  assert.equal(gamma.accepted_artifact_id, null);
  assert.equal(beta.execution_status, 'COMPLETED');
  assert.equal(beta.validation_status, 'VALID');
  assert.equal(beta.attempt_count, 1);
  assert.ok(beta.accepted_artifact_id);

  const gammaAttempt1 =
    repositoryA.listAttempts(gamma.job_id)[0];
  const gammaArtifact1 =
    repositoryA.listArtifacts(gamma.job_id)[0];

  assert.equal(
    gammaAttempt1.execution_status,
    'FAILED',
  );
  assert.equal(
    gammaAttempt1.error_code,
    'VALIDATION_REJECTED',
  );
  assert.equal(
    gammaArtifact1.artifact_state,
    'REJECTED',
  );

  await assert.rejects(
    () =>
      validatorA.validate({
        run: repositoryA.getRun(
          created.run.run_id,
        ),
        job: gamma,
        attempt: gammaAttempt1,
        artifact: gammaArtifact1,
        source_context: gamma.source_context,
        absolute_path:
          storage.resolveRunRelativePath(
            created.run.run_id,
            gammaArtifact1.relative_path,
          ),
      }),
    /rejected evidence from another source/u,
  );

  const alphaMetadata = JSON.parse(
    await fsp.readFile(
      storage.resolveRunRelativePath(
        created.run.run_id,
        'fake-source-a/metadata/alpha.metadata.json',
      ),
      'utf8',
    ),
  );
  const gammaMetadata1 = JSON.parse(
    await fsp.readFile(
      storage.resolveRunRelativePath(
        created.run.run_id,
        'fake-source-b/metadata/gamma.metadata.json',
      ),
      'utf8',
    ),
  );
  const gammaValidation1 = JSON.parse(
    await fsp.readFile(
      storage.resolveRunRelativePath(
        created.run.run_id,
        'fake-source-b/validation/gamma.validation.json',
      ),
      'utf8',
    ),
  );

  assert.deepEqual(
    {
      run_id: alphaMetadata.run_id,
      job_id: alphaMetadata.job_id,
      attempt_id: alphaMetadata.attempt_id,
      attempt_number:
        alphaMetadata.attempt_number,
      source_id: alphaMetadata.source_id,
      source_mode: alphaMetadata.source_mode,
      job_key: alphaMetadata.job_key,
      source_context:
        alphaMetadata.source_context,
      raw_artifact_id:
        alphaMetadata.raw_artifact_id,
      validation_status:
        alphaMetadata.validation_status,
    },
    {
      run_id: created.run.run_id,
      job_id: alpha.job_id,
      attempt_id:
        `${alpha.job_id}__attempt_1`,
      attempt_number: 1,
      source_id: 'fake-source-a',
      source_mode: 'FAKE_SOURCE_A',
      job_key: 'alpha',
      source_context: contexts.alpha,
      raw_artifact_id:
        alpha.accepted_artifact_id,
      validation_status: 'VALID',
    },
  );
  assert.deepEqual(
    {
      run_id: gammaMetadata1.run_id,
      job_id: gammaMetadata1.job_id,
      attempt_id: gammaMetadata1.attempt_id,
      attempt_number:
        gammaMetadata1.attempt_number,
      source_id: gammaMetadata1.source_id,
      source_mode: gammaMetadata1.source_mode,
      job_key: gammaMetadata1.job_key,
      source_context:
        gammaMetadata1.source_context,
      raw_artifact_id:
        gammaMetadata1.raw_artifact_id,
      validation_status:
        gammaMetadata1.validation_status,
    },
    {
      run_id: created.run.run_id,
      job_id: gamma.job_id,
      attempt_id:
        `${gamma.job_id}__attempt_1`,
      attempt_number: 1,
      source_id: 'fake-source-b',
      source_mode: 'FAKE_SOURCE_B',
      job_key: 'gamma',
      source_context: contexts.gamma,
      raw_artifact_id:
        gammaArtifact1.artifact_id,
      validation_status: 'INVALID_SCHEMA',
    },
  );
  assert.equal(
    gammaValidation1.run_id,
    created.run.run_id,
  );
  assert.equal(
    gammaValidation1.job_id,
    gamma.job_id,
  );
  assert.equal(
    gammaValidation1.artifact_id,
    gammaArtifact1.artifact_id,
  );
  assert.equal(
    gammaValidation1.validation_status,
    'INVALID_SCHEMA',
  );
  assert.deepEqual(
    gammaValidation1.findings,
    [
      {
        check_id:
          'FAKE_SOURCE_B_IDENTITY',
        severity: 'ERROR',
        passed: false,
        message:
          'Gamma attempt one is rejected deterministically.',
        expected: {
          source_id: 'fake-source-b',
          accepted: true,
        },
        actual: {
          source_id: 'fake-source-b',
          accepted: false,
        },
      },
    ],
  );

  const runId = created.run.run_id;
  const alphaJobId = alpha.job_id;
  const gammaJobId = gamma.job_id;
  const betaJobId = beta.job_id;

  repositoryA.close();

  const repositoryB =
    new StateRepository(databasePath);
  const reopenedRun = repositoryB.getRun(runId);
  const resumePlan =
    new ResumePlanner(repositoryB).planRun(
      workspace.workspace_id,
      runId,
    );

  assert.ok(reopenedRun);
  assert.deepEqual(
    reopenedRun.selected_sources,
    ['fake-source-a', 'fake-source-b'],
  );
  assert.deepEqual(
    reopenedRun.configuration_snapshot,
    configurationSnapshot,
  );
  assert.ok(resumePlan);

  const resumeByKey = new Map(
    resumePlan.jobs.map((plan) => [
      plan.job.job_key,
      plan,
    ]),
  );

  assert.equal(
    resumeByKey.get('alpha').action,
    'SKIP_ACCEPTED',
  );
  assert.equal(
    resumeByKey.get('gamma').action,
    'RETRY_CANDIDATE',
  );
  assert.equal(
    resumeByKey.get('beta').action,
    'SKIP_ACCEPTED',
  );
  assert.deepEqual(
    resumeByKey.get('gamma').job.source_context,
    contexts.gamma,
  );
  assert.equal(
    resumeByKey.get('alpha')
      .accepted_artifact.artifact_id,
    alpha.accepted_artifact_id,
  );
  assert.equal(
    resumeByKey.get('beta')
      .accepted_artifact.artifact_id,
    beta.accepted_artifact_id,
  );

  const retry =
    new ReconciliationCoordinator(
      repositoryB,
      new RetryPolicy({
        max_attempts: 2,
      }),
    ).apply(resumeByKey.get('gamma'));

  assert.equal(retry.outcome, 'RETRY_STARTED');
  assert.equal(retry.attempt.attempt_number, 2);

  const retryResult =
    await new CollectionOrchestrator(
      repositoryB,
      storage,
      sources,
      validators,
      new RunManager(repositoryB),
    ).executeStartedAttempt(
      runId,
      gammaJobId,
      retry.attempt,
    );

  assert.equal(
    retryResult.outcome,
    'JOB_COMPLETED',
  );
  assert.deepEqual(collectionEvents, [
    'fake-source-a:alpha:attempt_1',
    'fake-source-b:gamma:attempt_1',
    'fake-source-a:beta:attempt_1',
    'fake-source-b:gamma:attempt_2',
  ]);
  assert.deepEqual(validationEvents, [
    'fake-source-a:alpha:attempt_1',
    'fake-source-b:gamma:attempt_1',
    'fake-source-a:beta:attempt_1',
    'fake-source-b:gamma:attempt_2',
  ]);

  const finalAlpha =
    repositoryB.getJob(alphaJobId);
  const finalGamma =
    repositoryB.getJob(gammaJobId);
  const finalBeta =
    repositoryB.getJob(betaJobId);
  const gammaAttempts =
    repositoryB.listAttempts(gammaJobId);
  const gammaArtifacts =
    repositoryB.listArtifacts(gammaJobId);
  const gammaValidations =
    repositoryB.listValidationSummaries(
      gammaJobId,
    );

  assert.equal(finalAlpha.attempt_count, 1);
  assert.equal(finalBeta.attempt_count, 1);
  assert.equal(finalGamma.attempt_count, 2);
  assert.equal(
    finalGamma.execution_status,
    'COMPLETED',
  );
  assert.equal(finalGamma.validation_status, 'VALID');
  assert.equal(gammaAttempts.length, 2);
  assert.equal(
    gammaAttempts[0].execution_status,
    'FAILED',
  );
  assert.equal(
    gammaAttempts[1].execution_status,
    'COMPLETED',
  );
  assert.equal(gammaArtifacts.length, 2);
  assert.equal(
    gammaArtifacts[0].artifact_state,
    'REJECTED',
  );
  assert.equal(
    gammaArtifacts[1].artifact_state,
    'ACCEPTED',
  );
  assert.notEqual(
    gammaArtifacts[0].artifact_id,
    gammaArtifacts[1].artifact_id,
  );
  assert.equal(gammaValidations.length, 2);
  assert.equal(
    gammaValidations[0].validation_status,
    'INVALID_SCHEMA',
  );
  assert.equal(
    gammaValidations[1].validation_status,
    'VALID',
  );
  assert.equal(
    repositoryB.getRun(runId).run_status,
    'COMPLETED',
  );

  const gammaMetadata2 = JSON.parse(
    await fsp.readFile(
      storage.resolveRunRelativePath(
        runId,
        'fake-source-b/metadata/gamma.attempt_2.metadata.json',
      ),
      'utf8',
    ),
  );
  const gammaValidation2 = JSON.parse(
    await fsp.readFile(
      storage.resolveRunRelativePath(
        runId,
        'fake-source-b/validation/gamma.attempt_2.validation.json',
      ),
      'utf8',
    ),
  );
  const preservedGammaValidation1 =
    JSON.parse(
      await fsp.readFile(
        storage.resolveRunRelativePath(
          runId,
          'fake-source-b/validation/gamma.validation.json',
        ),
        'utf8',
      ),
    );

  assert.deepEqual(
    preservedGammaValidation1,
    gammaValidation1,
  );

  assert.deepEqual(
    {
      run_id: gammaMetadata2.run_id,
      job_id: gammaMetadata2.job_id,
      attempt_id: gammaMetadata2.attempt_id,
      attempt_number:
        gammaMetadata2.attempt_number,
      source_id: gammaMetadata2.source_id,
      source_mode: gammaMetadata2.source_mode,
      job_key: gammaMetadata2.job_key,
      source_context:
        gammaMetadata2.source_context,
      raw_artifact_id:
        gammaMetadata2.raw_artifact_id,
      validation_status:
        gammaMetadata2.validation_status,
    },
    {
      run_id: runId,
      job_id: gammaJobId,
      attempt_id:
        `${gammaJobId}__attempt_2`,
      attempt_number: 2,
      source_id: 'fake-source-b',
      source_mode: 'FAKE_SOURCE_B',
      job_key: 'gamma',
      source_context: contexts.gamma,
      raw_artifact_id:
        gammaArtifacts[1].artifact_id,
      validation_status: 'VALID',
    },
  );
  assert.equal(gammaValidation2.run_id, runId);
  assert.equal(
    gammaValidation2.job_id,
    gammaJobId,
  );
  assert.equal(
    gammaValidation2.artifact_id,
    gammaArtifacts[1].artifact_id,
  );
  assert.equal(
    gammaValidation2.validation_status,
    'VALID',
  );

  repositoryB.close();

  console.log(
    'PASS MULTI-SOURCE-RUN-001: one Run preserves per-source dispatch, failure independence, failed-only retry, restart, and provenance',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
