const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {
  DatabaseSync,
} = require('node:sqlite');

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
  StructuredLogger,
} = require(
  path.join(
    buildRoot,
    'main',
    'logging',
    'structured-logger.js',
  ),
);

const {
  BrowserManager,
} = require(
  path.join(
    buildRoot,
    'main',
    'browser',
    'browser-manager.js',
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
  MetadataManager,
} = require(
  path.join(
    buildRoot,
    'main',
    'core',
    'metadata-manager.js',
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
  fs.mkdirSync(
    directory,
    {
      recursive: true,
    },
  );
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

const queryConfig = {
  config_version: 1,
  source_id: 'fake-source',
  groups: [
    {
      query_group_id: 'GT01',
      query_group_name:
        'gate_gt01',
      queries: [
        'fake query 01',
      ],
    },
    {
      query_group_id: 'GT02',
      query_group_name:
        'gate_gt02',
      queries: [
        'fake query 02',
      ],
    },
    {
      query_group_id: 'GT03',
      query_group_name:
        'gate_gt03',
      queries: [
        'fake query 03',
      ],
    },
  ],
};

class GateFakeSource {
  id = 'fake-source';
  name = 'M2 Gate Fake Source';
  sourceMode = 'FAKE_TEST';
  datasetTypes = [
    'INTEREST_OVER_TIME',
  ];

  constructor() {
    this.events = [];
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

  async checkReadiness() {
    return {
      source_id: this.id,
      readiness_status: 'READY',
      checked_at:
        '2026-08-18T13:00:00.000Z',
      message: null,
    };
  }

  async collect(context) {
    this.active += 1;
    this.maxActive = Math.max(
      this.maxActive,
      this.active,
    );

    const marker =
      `${context.job_key}:attempt_${context.attempt_number}`;

    this.events.push(
      `start:${marker}`,
    );

    try {
      await new Promise((resolve) =>
        setTimeout(resolve, 2),
      );

      if (
        context.job_key === 'GT02' &&
        context.attempt_number === 1
      ) {
        this.events.push(
          `fail:${marker}`,
        );

        return {
          result_type: 'FAILED',
          error_code:
            'DOWNLOAD_FAILED',
          message:
            'Authorization: Bearer gate-secret-token',
        };
      }

      const bytes = Buffer.from(
        [
          'Week,relative_interest',
          `2026-08-09,${50 + context.attempt_number}`,
          '',
        ].join('\n'),
        'utf8',
      );

      this.events.push(
        `success:${marker}`,
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

class GateValidator {
  async validate(context) {
    const bytes =
      await fsp.readFile(
        context.absolute_path,
      );

    assert.ok(bytes.length > 0);

    return {
      validation_status: 'VALID',
      checks_total: 1,
      checks_passed: 1,
      checks_warning: 0,
      checks_failed: 0,
      findings: [
        {
          check_id:
            'GATE_ARTIFACT_READABLE',
          severity: 'ERROR',
          passed: true,
          message:
            'Gate artifact is readable.',
          expected: true,
          actual: true,
        },
      ],
    };
  }
}

class FakePersistentContext
  extends EventEmitter
{
  async close() {
    this.emit('close');
  }
}

class GateBrowserLauncher {
  constructor() {
    this.calls = [];
  }

  async launchPersistentContext(
    userDataDir,
    options,
  ) {
    this.calls.push({
      userDataDir,
      options: {
        ...options,
      },
    });

    return new FakePersistentContext();
  }
}

const createRegistry = (
  source,
) => {
  const registry =
    new SourceRegistry();

  registry.register(source);

  return registry;
};

const readJsonl = async (
  filePath,
) => {
  const content =
    await fsp.readFile(
      filePath,
      'utf8',
    );

  return content
    .trimEnd()
    .split('\n')
    .map((line) =>
      JSON.parse(line),
    );
};

const main = async () => {
  const databasePath =
    getDatabasePath(directories);

  const storage =
    new StorageManager(directories);

  const fakeSourceA =
    new GateFakeSource();

  const repositoryA =
    new StateRepository(
      databasePath,
    );

  const runManagerA =
    new RunManager(repositoryA);

  let timestampCounter = 0;

  const loggerA =
    new StructuredLogger(
      directories,
      {
        now: () =>
          new Date(
            Date.UTC(
              2026,
              7,
              18,
              13,
              0,
              timestampCounter++,
            ),
          ),
      },
    );

  const orchestratorA =
    new CollectionOrchestrator(
      repositoryA,
      storage,
      createRegistry(
        fakeSourceA,
      ),
      new GateValidator(),
      runManagerA,
      new MetadataManager(),
      loggerA,
    );

  const created =
    repositoryA.createRunFromQueryConfig({
      query_config: queryConfig,
      application_version: '1.0.0',
      requested_configuration:
        requestedConfiguration,
    });

  const runId =
    created.run.run_id;

  const initial =
    await orchestratorA.runUntilBlocked(
      runId,
    );

  assert.equal(
    initial.stopped_because,
    'RETRY_REQUIRED',
  );

  assert.equal(
    fakeSourceA.maxActive,
    1,
  );

  assert.deepEqual(
    fakeSourceA.events,
    [
      'start:GT01:attempt_1',
      'success:GT01:attempt_1',
      'start:GT02:attempt_1',
      'fail:GT02:attempt_1',
      'start:GT03:attempt_1',
      'success:GT03:attempt_1',
    ],
  );

  const beforeRestartJobs =
    repositoryA.listJobs(runId);

  assert.equal(
    beforeRestartJobs[0]
      .execution_status,
    'COMPLETED',
  );
  assert.equal(
    beforeRestartJobs[1]
      .execution_status,
    'FAILED',
  );
  assert.equal(
    beforeRestartJobs[2]
      .execution_status,
    'COMPLETED',
  );

  const logPath =
    loggerA.getRunLogPath(
      runId,
    );

  const logsBeforeRestart =
    await readJsonl(logPath);

  assert.equal(
    logsBeforeRestart.length,
    10,
  );

  assert.equal(
    logsBeforeRestart.some(
      (record) =>
        record.event ===
          'collection_attempt_failed' &&
        record.context.error_code ===
          'DOWNLOAD_FAILED',
    ),
    true,
  );

  const rawLogBeforeRestart =
    await fsp.readFile(
      logPath,
      'utf8',
    );

  assert.equal(
    rawLogBeforeRestart.includes(
      'gate-secret-token',
    ),
    false,
  );

  assert.equal(
    rawLogBeforeRestart.includes(
      '[REDACTED]',
    ),
    true,
  );

  repositoryA.close();

  // Simulated application restart.
  const repositoryB =
    new StateRepository(
      databasePath,
    );

  const runManagerB =
    new RunManager(repositoryB);

  const fakeSourceB =
    new GateFakeSource();

  const loggerB =
    new StructuredLogger(
      directories,
      {
        now: () =>
          new Date(
            Date.UTC(
              2026,
              7,
              18,
              14,
              0,
              timestampCounter++,
            ),
          ),
      },
    );

  const orchestratorB =
    new CollectionOrchestrator(
      repositoryB,
      storage,
      createRegistry(
        fakeSourceB,
      ),
      new GateValidator(),
      runManagerB,
      new MetadataManager(),
      loggerB,
    );

  const resumePlanner =
    new ResumePlanner(
      repositoryB,
    );

  const resumePlan =
    resumePlanner.planRun(
      runId,
    );

  assert.ok(resumePlan);

  const planByKey =
    new Map(
      resumePlan.jobs.map(
        (plan) => [
          plan.job.job_key,
          plan,
        ],
      ),
    );

  assert.equal(
    planByKey.get('GT01')
      .action,
    'SKIP_ACCEPTED',
  );

  assert.equal(
    planByKey.get('GT02')
      .action,
    'RETRY_CANDIDATE',
  );

  assert.equal(
    planByKey.get('GT03')
      .action,
    'SKIP_ACCEPTED',
  );

  const reconciler =
    new ReconciliationCoordinator(
      repositoryB,
      new RetryPolicy({
        max_attempts: 2,
      }),
    );

  const retryStart =
    reconciler.apply(
      planByKey.get('GT02'),
    );

  assert.equal(
    retryStart.outcome,
    'RETRY_STARTED',
  );

  assert.equal(
    retryStart.attempt
      .attempt_number,
    2,
  );

  const retryStep =
    await orchestratorB
      .executeStartedAttempt(
        runId,
        planByKey.get('GT02')
          .job.job_id,
        retryStart.attempt,
      );

  assert.equal(
    retryStep.outcome,
    'JOB_COMPLETED',
  );

  assert.deepEqual(
    fakeSourceB.events,
    [
      'start:GT02:attempt_2',
      'success:GT02:attempt_2',
    ],
  );

  const completedStep =
    await orchestratorB.runNext(
      runId,
    );

  assert.equal(
    completedStep.outcome,
    'RUN_COMPLETED',
  );

  const finalRun =
    repositoryB.getRun(
      runId,
    );

  assert.equal(
    finalRun.run_status,
    'COMPLETED',
  );

  const finalJobs =
    repositoryB.listJobs(
      runId,
    );

  assert.equal(
    finalJobs.every(
      (job) =>
        job.execution_status ===
        'COMPLETED',
    ),
    true,
  );

  assert.deepEqual(
    finalJobs.map(
      (job) => job.attempt_count,
    ),
    [1, 2, 1],
  );

  const gt02 =
    finalJobs[1];

  const gt02Attempts =
    repositoryB.listAttempts(
      gt02.job_id,
    );

  assert.equal(
    gt02Attempts.length,
    2,
  );

  assert.equal(
    gt02Attempts[0].error_code,
    'DOWNLOAD_FAILED',
  );

  assert.equal(
    gt02Attempts[1]
      .execution_status,
    'COMPLETED',
  );

  const gt02Artifacts =
    repositoryB.listArtifacts(
      gt02.job_id,
    );

  assert.equal(
    gt02Artifacts.length,
    1,
  );

  assert.equal(
    gt02Artifacts[0]
      .attempt_number,
    2,
  );

  assert.equal(
    gt02Artifacts[0]
      .artifact_state,
    'ACCEPTED',
  );

  assert.equal(
    gt02.accepted_artifact_id,
    gt02Artifacts[0]
      .artifact_id,
  );

  const expectedEvidence = [
    'fake-source/raw/GT01_TR_24M_interest_over_time.csv',
    'fake-source/metadata/GT01.metadata.json',
    'fake-source/validation/GT01.validation.json',
    'fake-source/raw/GT02_TR_24M_interest_over_time__attempt_2.csv',
    'fake-source/metadata/GT02.attempt_2.metadata.json',
    'fake-source/validation/GT02.attempt_2.validation.json',
    'fake-source/raw/GT03_TR_24M_interest_over_time.csv',
    'fake-source/metadata/GT03.metadata.json',
    'fake-source/validation/GT03.validation.json',
  ];

  for (const relativePath of expectedEvidence) {
    const absolutePath =
      storage.resolveRunRelativePath(
        runId,
        relativePath,
      );

    assert.equal(
      fs.statSync(
        absolutePath,
      ).isFile(),
      true,
    );
  }

  for (const job of finalJobs) {
    const summaries =
      repositoryB.listValidationSummaries(
        job.job_id,
      );

    assert.equal(
      summaries.length,
      1,
    );

    assert.equal(
      typeof summaries[0]
        .validation_json_path,
      'string',
    );

    assert.equal(
      fs.existsSync(
        storage.resolveRunRelativePath(
          runId,
          summaries[0]
            .validation_json_path,
        ),
      ),
      true,
    );
  }

  const logsAfterRestart =
    await readJsonl(logPath);

  assert.equal(
    logsAfterRestart.length,
    14,
  );

  assert.equal(
    logsAfterRestart
      .filter(
        (record) =>
          record.event ===
          'collection_attempt_started',
      )
      .length,
    4,
  );

  assert.equal(
    logsAfterRestart.some(
      (record) =>
        record.event ===
          'collection_attempt_completed' &&
        record.job_id ===
          gt02.job_id &&
        record.context
          .validation_status ===
          'VALID',
    ),
    true,
  );

  // BrowserManager boundary smoke using only a fake launcher.
  // No browser binary, provider navigation, auth automation,
  // cookie copying, or normal Chrome profile is used.
  const browserLauncherA =
    new GateBrowserLauncher();

  const browserManagerA =
    new BrowserManager(
      directories,
      browserLauncherA,
    );

  const browserSessionA =
    await browserManagerA
      .openProfile('google');

  assert.equal(
    browserSessionA.user_data_dir,
    path.join(
      directories.browser_profiles,
      'google',
    ),
  );

  const browserMarkerPath =
    path.join(
      browserSessionA.user_data_dir,
      'm2-gate.marker',
    );

  await fsp.writeFile(
    browserMarkerPath,
    'persistent-profile-boundary',
    'utf8',
  );

  await browserManagerA.close();

  const browserLauncherB =
    new GateBrowserLauncher();

  const browserManagerB =
    new BrowserManager(
      directories,
      browserLauncherB,
    );

  await browserManagerB
    .openProfile('google');

  assert.equal(
    await fsp.readFile(
      browserMarkerPath,
      'utf8',
    ),
    'persistent-profile-boundary',
  );

  await browserManagerB.close();

  assert.equal(
    browserLauncherA.calls[0]
      .userDataDir,
    browserLauncherB.calls[0]
      .userDataDir,
  );

  repositoryB.close();

  // Final SQLite integrity gate.
  const db =
    new DatabaseSync(
      databasePath,
    );

  const foreignKeys =
    db.prepare(
      'PRAGMA foreign_key_check',
    ).all();

  assert.deepEqual(
    foreignKeys,
    [],
  );

  const quickCheck =
    db.prepare(
      'PRAGMA quick_check',
    ).get();

  assert.equal(
    quickCheck.quick_check,
    'ok',
  );

  const counts = {
    runs:
      db.prepare(
        'SELECT COUNT(*) AS count FROM runs',
      ).get().count,
    jobs:
      db.prepare(
        'SELECT COUNT(*) AS count FROM jobs',
      ).get().count,
    attempts:
      db.prepare(
        'SELECT COUNT(*) AS count FROM attempts',
      ).get().count,
    artifacts:
      db.prepare(
        'SELECT COUNT(*) AS count FROM artifacts',
      ).get().count,
    validations:
      db.prepare(
        'SELECT COUNT(*) AS count FROM validations',
      ).get().count,
  };

  assert.deepEqual(
    counts,
    {
      runs: 1,
      jobs: 3,
      attempts: 4,
      artifacts: 3,
      validations: 3,
    },
  );

  db.close();

  console.log(
    'PASS M2-GATE-001: deterministic source executes jobs sequentially through the shared orchestrator',
  );
  console.log(
    'PASS M2-GATE-002: raw artifacts, metadata JSON, and validation JSON persist as run-scoped evidence',
  );
  console.log(
    'PASS M2-GATE-003: intentional attempt-1 failure survives restart and retries as attempt 2',
  );
  console.log(
    'PASS M2-GATE-004: accepted jobs reconstruct as SKIP_ACCEPTED and are not recollected',
  );
  console.log(
    'PASS M2-GATE-005: structured orchestration logs append across restart and redact sensitive values',
  );
  console.log(
    'PASS M2-GATE-006: application-specific persistent browser-profile boundary survives reopen',
  );
  console.log(
    'PASS M2-GATE-007: final run reaches COMPLETED with preserved attempt/artifact/validation history',
  );
  console.log(
    'PASS M2-GATE-008: SQLite foreign-key and quick-check integrity remain valid',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
