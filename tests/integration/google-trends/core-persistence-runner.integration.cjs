const assert = require(
  'node:assert/strict',
);
const fs = require(
  'node:fs',
);
const path = require(
  'node:path',
);

const [
  buildRoot,
  tempRoot,
  fixturePath,
] = process.argv.slice(2);

if (
  !buildRoot ||
  !tempRoot ||
  !fixturePath
) {
  throw new Error(
    'Expected compiled build root, temp root, and GT01 fixture path.',
  );
}

const {
  runGoogleTrendsThroughCore,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-core-runner.js',
  ),
);

const {
  getDatabasePath,
  initializeDatabase,
} = require(
  path.join(
    buildRoot,
    'src',
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
    'src',
    'main',
    'storage',
    'state-repository.js',
  ),
);

const {
  MetadataManager,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'core',
    'metadata-manager.js',
  ),
);

const {
  DesktopMultiSourceController,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'app',
    'desktop-multisource-controller.js',
  ),
);

const {
  DesktopExecutionService,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'app',
    'desktop-execution-service.js',
  ),
);

const {
  createProductionCollectionRuntime,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'app',
    'production-collection-runtime.js',
  ),
);

let workspaceNumber = 0;

const createWorkspaceId = () => {
  const bootstrap = initializeDatabase(directories);

  assert.equal(bootstrap.status, 'READY');

  const repository = new StateRepository(
    getDatabasePath(directories),
  );

  try {
    workspaceNumber += 1;
    return repository.createWorkspace({
      workspace_name: `GT Core Fixture ${workspaceNumber}`,
    }).workspace_id;
  } finally {
    repository.close();
  }
};

const appDataRoot =
  path.join(
    tempRoot,
    'app-data',
  );

const directories = {
  app_data_root:
    appDataRoot,
  config:
    path.join(
      appDataRoot,
      'config',
    ),
  data:
    path.join(
      appDataRoot,
      'data',
    ),
  runs:
    path.join(
      appDataRoot,
      'data',
      'runs',
    ),
  database:
    path.join(
      appDataRoot,
      'database',
    ),
  browser_profiles:
    path.join(
      appDataRoot,
      'browser-profiles',
    ),
  logs:
    path.join(
      appDataRoot,
      'logs',
    ),
  public_downloads:
    path.join(
      tempRoot,
      'public-downloads',
    ),
};

for (
  const directory of
    Object.values(
      directories,
    )
) {
  fs.mkdirSync(
    directory,
    {
      recursive: true,
    },
  );
}

const gt01 = {
  query_group_id:
    'GT01',
  query_group_name:
    'generic_commercial',
  queries: [
    'canlı bitki',
    'online bitki',
    'bitki satın al',
    'bitki siparişi',
    'saksılı bitki',
  ],
};

const queryConfig = {
  config_version:
    1,
  source_id:
    'google-trends',
  groups: [
    gt01,
  ],
};

const requestedConfiguration = {
  source_mode:
    'GOOGLE_TRENDS_UI',
  country_code:
    'TR',
  language_code:
    null,
  requested_date_start:
    '2024-08-18',
  requested_date_end:
    '2026-08-17',
  category_id:
    null,
  category_name:
    'All Categories',
  search_type:
    'Web Search',
  selection_type:
    'Search Term',
  dataset_type:
    'INTEREST_OVER_TIME',
};

class FixtureGoogleTrendsSource {
  id = 'google-trends';
  name = 'Google Trends Fixture';
  sourceMode =
    'GOOGLE_TRENDS_UI';
  datasetTypes = [
    'INTEREST_OVER_TIME',
  ];
  collectCalls = [];

  getCapabilities() {
    return {
      requires_browser:
        false,
      requires_oauth:
        false,
      may_require_manual_login:
        false,
      supports_custom_date_range:
        true,
      supports_direct_export:
        true,
      supports_api:
        false,
      supports_resume:
        false,
      max_concurrency:
        1,
    };
  }

  async checkReadiness() {
    return {
      source_id:
        this.id,
      readiness_status:
        'READY',
      checked_at:
        '2026-08-19T00:00:00.000Z',
      message:
        null,
    };
  }

  async collect(context) {
    this.collectCalls.push(
      context,
    );

    return {
      result_type:
        'ARTIFACT_PRODUCED',
      preferred_filename:
        context.source_context
          .query_group
          .query_group_id
          + '_TR_24M_interest_over_time.csv',
      media_type:
        'text/csv',
      bytes:
        fs.readFileSync(
          fixturePath,
        ),
    };
  }
}

class FixedResultGoogleTrendsSource
  extends FixtureGoogleTrendsSource {
  constructor(result) {
    super();
    this.result = result;
  }

  async collect(context) {
    this.collectCalls.push(
      context,
    );

    return this.result;
  }
}

const main = async () => {
  const source =
    new FixtureGoogleTrendsSource();

  const result =
    await runGoogleTrendsThroughCore({
      directories,
      workspace_id: createWorkspaceId(),
      query_config:
        queryConfig,
      requested_configuration:
        requestedConfiguration,
      application_version:
        '1.0.0-test',
      source,
    });

  assert.equal(
    source.collectCalls.length,
    1,
  );

  assert.match(
    source.collectCalls[0]
      .run_id,
    /^rr_\d{8}T\d{9}Z_[0-9a-f]{6}$/u,
  );

  assert.equal(
    result.orchestration
      .stopped_because,
    'RUN_COMPLETED',
  );

  assert.equal(
    result.run.run_status,
    'COMPLETED',
  );

  assert.equal(
    result.job.execution_status,
    'COMPLETED',
  );

  console.log(
    'PASS GT-CORE-001: one GT01 source call executes through the shared sequential CollectionOrchestrator and completes the run',
  );

  assert.ok(
    result.artifact,
  );

  assert.equal(
    result.artifact
      .artifact_state,
    'ACCEPTED',
  );

  const canonicalPath =
    path.join(
      directories.runs,
      result.run.run_id,
      result.artifact
        .relative_path,
    );

  assert.equal(
    fs.realpathSync(
      canonicalPath,
    ).startsWith(
      `${fs.realpathSync(
        directories.runs,
      )}${path.sep}`,
    ),
    true,
  );

  assert.deepEqual(
    fs.readFileSync(
      canonicalPath,
    ),
    fs.readFileSync(
      fixturePath,
    ),
  );

  assert.match(
    result.artifact.sha256,
    /^[0-9a-f]{64}$/u,
  );

  console.log(
    'PASS GT-CORE-002: exact source bytes become an immutable canonical raw artifact under app-owned run-scoped storage',
  );

  assert.equal(
    result.validation
      ?.validation_status,
    'VALID',
  );

  assert.equal(
    result.job
      .accepted_artifact_id,
    result.artifact
      .artifact_id,
  );

  const repository =
    new StateRepository(
      getDatabasePath(
        directories,
      ),
    );

  try {
    assert.deepEqual(
      repository.getCounts(),
      {
        runs:
          1,
        jobs:
          1,
      },
    );

    assert.equal(
      repository.listAttempts(
        result.job.job_id,
      ).length,
      1,
    );

    assert.equal(
      repository.listArtifacts(
        result.job.job_id,
      ).length,
      1,
    );

    assert.equal(
      repository.listValidationSummaries(
        result.job.job_id,
      ).length,
      1,
    );
  } finally {
    repository.close();
  }

  console.log(
    'PASS GT-CORE-003: SQLite links run, job, attempt, accepted raw artifact, and validation evidence',
  );

  const runRoot =
    path.join(
      directories.runs,
      result.run.run_id,
    );

  assert.equal(
    fs.existsSync(
      path.join(
        runRoot,
        'google-trends',
        'metadata',
        'GT01.metadata.json',
      ),
    ),
    true,
  );

  const metadataDocument =
    JSON.parse(
      fs.readFileSync(
        path.join(
          runRoot,
          'google-trends',
          'metadata',
          'GT01.metadata.json',
        ),
        'utf8',
      ),
    );

  assert.equal(
    metadataDocument
      .actual_date_start,
    '2024-08-18',
  );

  assert.equal(
    metadataDocument
      .actual_date_end,
    '2026-08-16',
  );

  assert.equal(
    metadataDocument
      .country_name,
    'Turkey',
  );

  console.log(
    'PASS GT-CORE-010: source-validated actual coverage and canonical country name persist in run-scoped metadata',
  );

  const metadataManager =
    new MetadataManager();

  const makeMetadataInput = (
    overrides,
  ) => ({
    run:
      result.run,
    job:
      result.job,
    attempt:
      result.attempt,
    raw_artifact:
      result.artifact,
    source: {
      source_id:
        'google-trends',
      source_name:
        'Google Trends',
      source_mode:
        'GOOGLE_TRENDS_UI',
    },
    source_context: {
      query_group:
        gt01,
    },
    validation_status:
      'VALID',
    actual_date_start:
      '2024-08-18',
    actual_date_end:
      '2026-08-16',
    country_name:
      'Turkey',
    ...overrides,
  });

  assert.throws(
    () =>
      metadataManager
        .createDatasetMetadata(
          makeMetadataInput({
            actual_date_start:
              '2024-02-30',
          }),
        ),
    /actual_date_start must be an ISO calendar date/u,
  );

  assert.throws(
    () =>
      metadataManager
        .createDatasetMetadata(
          makeMetadataInput({
            actual_date_start:
              '2026-08-16',
            actual_date_end:
              '2024-08-18',
          }),
        ),
    /actual_date_start must not be after actual_date_end/u,
  );

  assert.throws(
    () =>
      metadataManager
        .createDatasetMetadata(
          makeMetadataInput({
            country_name:
              '   ',
          }),
        ),
    /country_name must be non-empty or null/u,
  );

  console.log(
    'PASS GT-CORE-011: invalid validated date/country metadata fails closed before a provenance document can be created',
  );

  assert.equal(
    fs.existsSync(
      path.join(
        runRoot,
        'google-trends',
        'validation',
        'GT01.validation.json',
      ),
    ),
    true,
  );

  assert.equal(
    fs.existsSync(
      path.join(
        runRoot,
        'logs',
        'events.jsonl',
      ),
    ),
    true,
  );

  console.log(
    'PASS GT-CORE-004: metadata, validation detail, and structured log documents persist beside canonical run evidence',
  );

  assert.equal(
    result.source_result
      ?.result_type,
    'ARTIFACT_PRODUCED',
  );

  assert.deepEqual(
    fs.readdirSync(
      directories.public_downloads,
    ),
    [],
  );

  console.log(
    'PASS GT-CORE-005: Core persistence accepts source bytes without depending on Downloads as its datastore',
  );

  await assert.rejects(
    () =>
      runGoogleTrendsThroughCore({
        directories,
        workspace_id: createWorkspaceId(),
        query_config: {
          ...queryConfig,
          groups: [
            {
              ...gt01,
              query_group_id:
                'GT02',
            },
          ],
        },
        requested_configuration:
          requestedConfiguration,
        application_version:
          '1.0.0-test',
        source:
          new FixtureGoogleTrendsSource(),
      }),
    /Single Google Trends Core runner requires exactly one GT01/u,
  );

  console.log(
    'PASS GT-CORE-006: the backward-compatible single-run API remains locked to exactly GT01 while batch scope uses its dedicated API',
  );

  const failedSource =
    new FixedResultGoogleTrendsSource({
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      message:
        'Safe deterministic source failure.',
    });

  const failed =
    await runGoogleTrendsThroughCore({
      directories,
      workspace_id: createWorkspaceId(),
      query_config:
        queryConfig,
      requested_configuration:
        requestedConfiguration,
      application_version:
        '1.0.0-test',
      source:
        failedSource,
    });

  assert.equal(
    failed.orchestration
      .stopped_because,
    'RETRY_REQUIRED',
  );

  assert.equal(
    failed.run.run_status,
    'RETRY_REQUIRED',
  );

  assert.equal(
    failed.job.execution_status,
    'FAILED',
  );

  assert.equal(
    failed.attempt
      ?.execution_status,
    'FAILED',
  );

  assert.equal(
    failed.attempt
      ?.error_code,
    'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
  );

  assert.equal(
    failed.artifact,
    null,
  );

  assert.equal(
    failed.validation,
    null,
  );

  console.log(
    'PASS GT-CORE-007: source failure is persisted as a failed attempt/job and remains blocked behind explicit retry policy',
  );

  const manual =
    await runGoogleTrendsThroughCore({
      directories,
      workspace_id: createWorkspaceId(),
      query_config:
        queryConfig,
      requested_configuration:
        requestedConfiguration,
      application_version:
        '1.0.0-test',
      source:
        new FixedResultGoogleTrendsSource({
          result_type:
            'MANUAL_ACTION_REQUIRED',
          message:
            'Complete provider authentication manually.',
        }),
    });

  assert.equal(
    manual.orchestration
      .stopped_because,
    'MANUAL_ACTION_REQUIRED',
  );

  assert.equal(
    manual.run.run_status,
    'MANUAL_ACTION_REQUIRED',
  );

  assert.equal(
    manual.job.execution_status,
    'MANUAL_ACTION_REQUIRED',
  );

  assert.equal(
    manual.attempt
      ?.execution_status,
    'MANUAL_ACTION_REQUIRED',
  );

  assert.equal(
    manual.artifact,
    null,
  );

  assert.equal(
    manual.validation,
    null,
  );

  console.log(
    'PASS GT-CORE-008: manual action remains a distinct persisted blocking state without artifact creation or automatic retry',
  );

  const suspiciousBytes =
    Buffer.from(
      '<html><body>provider error</body></html>',
      'utf8',
    );

  const rejected =
    await runGoogleTrendsThroughCore({
      directories,
      workspace_id: createWorkspaceId(),
      query_config:
        queryConfig,
      requested_configuration:
        requestedConfiguration,
      application_version:
        '1.0.0-test',
      source:
        new FixedResultGoogleTrendsSource({
          result_type:
            'ARTIFACT_PRODUCED',
          preferred_filename:
            'suspicious.csv',
          media_type:
            'text/csv',
          bytes:
            suspiciousBytes,
        }),
    });

  assert.equal(
    rejected.orchestration
      .stopped_because,
    'RETRY_REQUIRED',
  );

  assert.equal(
    rejected.job.execution_status,
    'FAILED',
  );

  assert.equal(
    rejected.job.validation_status,
    'ERROR_NOT_DATA',
  );

  assert.equal(
    rejected.attempt
      ?.error_code,
    'VALIDATION_REJECTED',
  );

  assert.equal(
    rejected.artifact
      ?.artifact_state,
    'REJECTED',
  );

  assert.equal(
    rejected.validation
      ?.validation_status,
    'ERROR_NOT_DATA',
  );

  const rejectedPath =
    path.join(
      directories.runs,
      rejected.run.run_id,
      rejected.artifact
        .relative_path,
    );

  assert.deepEqual(
    fs.readFileSync(
      rejectedPath,
    ),
    suspiciousBytes,
  );

  console.log(
    'PASS GT-CORE-009: suspicious provider bytes are preserved unchanged as rejected evidence and never become an accepted artifact',
  );

  // ------------------------------------------------
  // GT-QUICK-RUN-CORE-001
  // Reviewed desktop Quick Run must execute through
  // the production Core seam and remain readable as
  // persisted Run Detail state.
  // ------------------------------------------------

  {
    const repository =
      new StateRepository(
        getDatabasePath(
          directories,
        ),
      );

    try {
      const workspace =
        repository.createWorkspace({
          workspace_name:
            'GT Quick Run Core',
        });

      const fixtureSource =
        new FixtureGoogleTrendsSource();

      const productionRuntime =
        createProductionCollectionRuntime({
          repository,
          credentialStore: {},
          directories,
          googleTrendsSource:
            fixtureSource,
        });

      const executionService =
        new DesktopExecutionService(
          productionRuntime.orchestrator,
        );

      let executionPromise =
        null;

      const controller =
        new DesktopMultiSourceController({
          repository,
          readiness: {
            getReadiness:
              async (
                workspace_id,
                source_id,
              ) => ({
                workspace_id,
                source_id,
                readiness_status:
                  'READY',
              }),
          },
          application_version:
            'integration-test',
          source_order: [
            'google-trends',
          ],
          google_trends_query_groups: [
            {
              ...gt01,
            },
            {
              ...gt01,
              query_group_id:
                'GT02',
              query_group_name:
                'generic_commercial_duplicate_context',
            },
          ],
          now:
            () =>
              new Date(
                '2026-08-18T12:00:00.000Z',
              ),
          execute_run:
            async (run_id) => {
              executionPromise =
                executionService.execute(
                  run_id,
                );

              await executionPromise;
            },
        });

      const draft =
        controller.createDraft({
          workspace_id:
            workspace.workspace_id,
          origin: {
            kind:
              'BLANK',
          },
        });

      draft
        .reusable_configuration
        .sources = {
          'google-trends': {
            included:
              true,
            task_id:
              'google-trends-interest-over-time',
            date_policy:
              'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
          },
        };

      const review =
        await controller.reviewDraft(
          draft,
        );

      assert.equal(
        review.can_start,
        true,
        'Reviewed Google Trends Quick Run must be startable.',
      );

      assert.ok(
        review.reviewed_draft,
        'Reviewed Google Trends Quick Run must materialize an exact artifact.',
      );

      assert.equal(
        review.job_count,
        2,
        'All configured comparison groups must become independent Jobs.',
      );

      const started =
        await controller.startDraft(
          review.reviewed_draft,
        );

      assert.equal(
        started.jobs.length,
        2,
      );

      assert.ok(
        executionPromise,
        'Start must hand the persisted Run to DesktopExecutionService.',
      );

      await executionPromise;

      const detail =
        controller.getRunState(
          started.run.run_id,
        );

      assert.equal(
        detail.run.run_status,
        'COMPLETED',
        'Production Core execution must persist a terminal completed Run.',
      );

      assert.equal(
        detail.completed_jobs,
        2,
        'Run Detail must report every configured comparison group as completed.',
      );

      assert.equal(
        detail.failed_jobs,
        0,
      );

      assert.deepEqual(
        detail.jobs.map(
          (job) => ({
            job_key:
              job.job_key,
            query_group_id:
              job.query_group_id,
            execution_status:
              job.execution_status,
            validation_status:
              job.validation_status,
            attempt_count:
              job.attempt_count,
          }),
        ),
        [
          {
            job_key:
              'GT01',
            query_group_id:
              'GT01',
            execution_status:
              'COMPLETED',
            validation_status:
              'VALID',
            attempt_count:
              1,
          },
          {
            job_key:
              'GT02',
            query_group_id:
              'GT02',
            execution_status:
              'COMPLETED',
            validation_status:
              'VALID',
            attempt_count:
              1,
          },
        ],
        'Run Detail must expose terminal persisted Job state in comparison-group order.',
      );

      assert.equal(
        fixtureSource.collectCalls.length,
        2,
        'Production Core must invoke the Google Trends source once per comparison group.',
      );

      assert.deepEqual(
        fixtureSource.collectCalls.map(
          (context) =>
            context.source_context
              .query_group
              .query_group_id,
        ),
        [
          'GT01',
          'GT02',
        ],
        'Core execution must preserve comparison-group identity through source_context.',
      );

      assert.deepEqual(
        fixtureSource.collectCalls.map(
          (context) => ({
            start:
              context
                .requested_configuration
                .requested_date_start,
            end:
              context
                .requested_configuration
                .requested_date_end,
          }),
        ),
        [
          {
            start:
              '2024-08-18',
            end:
              '2026-08-17',
          },
          {
            start:
              '2024-08-18',
            end:
              '2026-08-17',
          },
        ],
        'Core execution must use the exact dates resolved during Review.',
      );

      console.log(
        'PASS GT-QUICK-RUN-CORE-001: reviewed GT Quick Run executes through production Core and remains readable as persisted Run Detail state',
      );
    } finally {
      repository.close();
    }
  }


  // ------------------------------------------------
  // GT-QUICK-RUN-RETRY-001
  // Partial failure must remain retryable through the
  // reviewed desktop path without recollecting success.
  // ------------------------------------------------

  {
    class RetryOnceGoogleTrendsSource
      extends FixtureGoogleTrendsSource {
      failedGt02Once =
        false;

      async collect(context) {
        this.collectCalls.push(
          context,
        );

        const groupId =
          context.source_context
            .query_group
            .query_group_id;

        if (
          groupId === 'GT02'
          && this.failedGt02Once === false
        ) {
          this.failedGt02Once =
            true;

          return {
            result_type:
              'FAILED',
            error_code:
              'DETERMINISTIC_GT02_FAILURE',
            message:
              'Safe deterministic first-attempt GT02 failure.',
          };
        }

        return {
          result_type:
            'ARTIFACT_PRODUCED',
          preferred_filename:
            groupId
            + '_TR_24M_interest_over_time.csv',
          media_type:
            'text/csv',
          bytes:
            fs.readFileSync(
              fixturePath,
            ),
        };
      }
    }

    const repository =
      new StateRepository(
        getDatabasePath(
          directories,
        ),
      );

    try {
      const workspace =
        repository.createWorkspace({
          workspace_name:
            'GT Quick Run Retry',
        });

      const fixtureSource =
        new RetryOnceGoogleTrendsSource();

      const productionRuntime =
        createProductionCollectionRuntime({
          repository,
          credentialStore: {},
          directories,
          googleTrendsSource:
            fixtureSource,
        });

      const executionService =
        new DesktopExecutionService(
          productionRuntime.orchestrator,
        );

      let executionPromise =
        null;

      const controller =
        new DesktopMultiSourceController({
          repository,
          readiness: {
            getReadiness:
              async (
                workspace_id,
                source_id,
              ) => ({
                workspace_id,
                source_id,
                readiness_status:
                  'READY',
              }),
          },
          application_version:
            'integration-test',
          source_order: [
            'google-trends',
          ],
          google_trends_query_groups: [
            {
              ...gt01,
            },
            {
              ...gt01,
              query_group_id:
                'GT02',
              query_group_name:
                'retry-second-group',
            },
          ],
          now:
            () =>
              new Date(
                '2026-08-18T12:00:00.000Z',
              ),
          execute_run:
            async (run_id) => {
              executionPromise =
                executionService.execute(
                  run_id,
                );

              await executionPromise;
            },
          execute_retry:
            async (
              run_id,
              job_id,
              attempt,
            ) => {
              executionPromise =
                executionService
                  .executeStartedAttemptAndContinue(
                    run_id,
                    job_id,
                    attempt,
                  );

              await executionPromise;
            },
        });

      const draft =
        controller.createDraft({
          workspace_id:
            workspace.workspace_id,
          origin: {
            kind:
              'BLANK',
          },
        });

      draft
        .reusable_configuration
        .sources = {
          'google-trends': {
            included:
              true,
            task_id:
              'google-trends-interest-over-time',
            date_policy:
              'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
          },
        };

      const review =
        await controller.reviewDraft(
          draft,
        );

      assert.equal(
        review.can_start,
        true,
      );

      assert.ok(
        review.reviewed_draft,
      );

      await controller.startDraft(
        review.reviewed_draft,
      );

      assert.ok(
        executionPromise,
        'Start must dispatch the persisted Run to Core.',
      );

      await executionPromise;

      const firstDetail =
        controller.getRunState(
          repository.listRuns(
            workspace.workspace_id,
          )[0].run_id,
        );

      assert.equal(
        firstDetail.run.run_status,
        'RETRY_REQUIRED',
        'One completed group plus one failed group must persist RETRY_REQUIRED.',
      );

      assert.equal(
        firstDetail.completed_jobs,
        1,
      );

      assert.equal(
        firstDetail.failed_jobs,
        1,
      );

      assert.deepEqual(
        firstDetail.jobs.map(
          (job) => ({
            group:
              job.query_group_id,
            status:
              job.execution_status,
            attempts:
              job.attempt_count,
          }),
        ),
        [
          {
            group:
              'GT01',
            status:
              'COMPLETED',
            attempts:
              1,
          },
          {
            group:
              'GT02',
            status:
              'FAILED',
            attempts:
              1,
          },
        ],
        'Run Detail must preserve the successful group and expose only GT02 as failed.',
      );

      const gt01ArtifactId =
        firstDetail.jobs[0]
          .accepted_artifact_id;

      assert.ok(
        gt01ArtifactId,
        'GT01 must retain its accepted artifact before retry.',
      );

      assert.deepEqual(
        fixtureSource.collectCalls.map(
          (context) =>
            context.source_context
              .query_group
              .query_group_id,
        ),
        [
          'GT01',
          'GT02',
        ],
        'Initial execution must call each comparison group exactly once.',
      );

      executionPromise =
        null;

      await controller.retryFailed(
        firstDetail.run.run_id,
      );

      assert.ok(
        executionPromise,
        'Retry Failed must dispatch the same persisted Run back to Core.',
      );

      await executionPromise;

      const finalDetail =
        controller.getRunState(
          firstDetail.run.run_id,
        );

      assert.equal(
        finalDetail.run.run_status,
        'COMPLETED',
        'Successful retry of the only failed group must complete the existing Run.',
      );

      assert.equal(
        finalDetail.completed_jobs,
        2,
      );

      assert.equal(
        finalDetail.failed_jobs,
        0,
      );

      assert.deepEqual(
        finalDetail.jobs.map(
          (job) => ({
            group:
              job.query_group_id,
            status:
              job.execution_status,
            validation:
              job.validation_status,
            attempts:
              job.attempt_count,
          }),
        ),
        [
          {
            group:
              'GT01',
            status:
              'COMPLETED',
            validation:
              'VALID',
            attempts:
              1,
          },
          {
            group:
              'GT02',
            status:
              'COMPLETED',
            validation:
              'VALID',
            attempts:
              2,
          },
        ],
        'Run Detail must expose GT01 attempt 1 and retried GT02 attempt 2 as completed.',
      );

      assert.equal(
        finalDetail.jobs[0]
          .accepted_artifact_id,
        gt01ArtifactId,
        'Retry must preserve the already accepted GT01 artifact.',
      );

      assert.deepEqual(
        fixtureSource.collectCalls.map(
          (context) =>
            context.source_context
              .query_group
              .query_group_id,
        ),
        [
          'GT01',
          'GT02',
          'GT02',
        ],
        'Retry must recollect only GT02 and must never call GT01 again.',
      );

      console.log(
        'PASS GT-QUICK-RUN-RETRY-001: partial GT Quick Run retries only the failed comparison group and completes the same persisted Run',
      );
    } finally {
      repository.close();
    }
  }


  // ------------------------------------------------
  // GT-QUICK-RUN-MANUAL-001
  // Manual action must explicitly continue the same
  // persisted attempt before pending groups advance.
  // ------------------------------------------------

  {
    class ManualOnceGoogleTrendsSource
      extends FixtureGoogleTrendsSource {
      manualGt01Once =
        false;

      async collect(context) {
        this.collectCalls.push(
          context,
        );

        const groupId =
          context.source_context
            .query_group
            .query_group_id;

        if (
          groupId === 'GT01'
          && this.manualGt01Once === false
        ) {
          this.manualGt01Once =
            true;

          return {
            result_type:
              'MANUAL_ACTION_REQUIRED',
            message:
              'Safe deterministic GT01 manual action fixture.',
          };
        }

        return {
          result_type:
            'ARTIFACT_PRODUCED',
          preferred_filename:
            groupId
            + '_TR_24M_interest_over_time.csv',
          media_type:
            'text/csv',
          bytes:
            fs.readFileSync(
              fixturePath,
            ),
        };
      }
    }

    const repository =
      new StateRepository(
        getDatabasePath(
          directories,
        ),
      );

    try {
      const workspace =
        repository.createWorkspace({
          workspace_name:
            'GT Quick Run Manual Action',
        });

      const fixtureSource =
        new ManualOnceGoogleTrendsSource();

      const productionRuntime =
        createProductionCollectionRuntime({
          repository,
          credentialStore: {},
          directories,
          googleTrendsSource:
            fixtureSource,
        });

      const executionService =
        new DesktopExecutionService(
          productionRuntime.orchestrator,
        );

      let executionPromise =
        null;

      const controller =
        new DesktopMultiSourceController({
          repository,
          readiness: {
            getReadiness:
              async (
                workspace_id,
                source_id,
              ) => ({
                workspace_id,
                source_id,
                readiness_status:
                  'READY',
              }),
          },
          application_version:
            'integration-test',
          source_order: [
            'google-trends',
          ],
          google_trends_query_groups: [
            {
              ...gt01,
            },
            {
              ...gt01,
              query_group_id:
                'GT02',
              query_group_name:
                'manual-second-group',
            },
          ],
          now:
            () =>
              new Date(
                '2026-08-18T12:00:00.000Z',
              ),
          execute_run:
            async (run_id) => {
              executionPromise =
                executionService.execute(
                  run_id,
                );

              await executionPromise;
            },
          execute_continue:
            async (
              run_id,
              job_id,
              attempt,
            ) => {
              executionPromise =
                executionService
                  .executeStartedAttemptAndContinue(
                    run_id,
                    job_id,
                    attempt,
                  );

              await executionPromise;
            },
        });

      const draft =
        controller.createDraft({
          workspace_id:
            workspace.workspace_id,
          origin: {
            kind:
              'BLANK',
          },
        });

      draft
        .reusable_configuration
        .sources = {
          'google-trends': {
            included:
              true,
            task_id:
              'google-trends-interest-over-time',
            date_policy:
              'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
          },
        };

      const review =
        await controller.reviewDraft(
          draft,
        );

      assert.equal(
        review.can_start,
        true,
      );

      assert.ok(
        review.reviewed_draft,
      );

      await controller.startDraft(
        review.reviewed_draft,
      );

      assert.ok(
        executionPromise,
        'Start must dispatch the persisted Run to Core.',
      );

      await executionPromise;

      const firstDetail =
        controller.getRunState(
          repository.listRuns(
            workspace.workspace_id,
          )[0].run_id,
        );

      assert.equal(
        firstDetail.run.run_status,
        'MANUAL_ACTION_REQUIRED',
        'GT01 manual action must block the same persisted Run.',
      );

      assert.deepEqual(
        firstDetail.jobs.map(
          (job) => ({
            group:
              job.query_group_id,
            status:
              job.execution_status,
            attempts:
              job.attempt_count,
          }),
        ),
        [
          {
            group:
              'GT01',
            status:
              'MANUAL_ACTION_REQUIRED',
            attempts:
              1,
          },
          {
            group:
              'GT02',
            status:
              'PENDING',
            attempts:
              0,
          },
        ],
        'Run Detail must expose GT01 as manually blocked and leave GT02 pending.',
      );

      assert.deepEqual(
        fixtureSource.collectCalls.map(
          (context) =>
            context.source_context
              .query_group
              .query_group_id,
        ),
        [
          'GT01',
        ],
        'Pending GT02 must not start while GT01 requires manual action.',
      );

      const gt01AttemptsBefore =
        repository.listAttempts(
          firstDetail.jobs[0].job_id,
        );

      assert.equal(
        gt01AttemptsBefore.length,
        1,
        'Manual action must preserve exactly one GT01 attempt.',
      );

      assert.equal(
        gt01AttemptsBefore[0]
          .attempt_number,
        1,
      );

      const gt01AttemptId =
        gt01AttemptsBefore[0]
          .attempt_id;

      executionPromise =
        null;

      assert.equal(
        typeof controller.continueManual,
        'function',
        'Run Detail must expose an explicit manual-action Continue operation.',
      );

      await controller.continueManual(
        firstDetail.run.run_id,
      );

      assert.ok(
        executionPromise,
        'Continue must dispatch the same persisted Run back to Core.',
      );

      await executionPromise;

      const finalDetail =
        controller.getRunState(
          firstDetail.run.run_id,
        );

      assert.equal(
        finalDetail.run.run_id,
        firstDetail.run.run_id,
        'Continue must not create a replacement Run.',
      );

      assert.equal(
        finalDetail.run.run_status,
        'COMPLETED',
        'Explicit continuation must complete the same Run after manual action is satisfied.',
      );

      assert.deepEqual(
        finalDetail.jobs.map(
          (job) => ({
            group:
              job.query_group_id,
            status:
              job.execution_status,
            validation:
              job.validation_status,
            attempts:
              job.attempt_count,
          }),
        ),
        [
          {
            group:
              'GT01',
            status:
              'COMPLETED',
            validation:
              'VALID',
            attempts:
              1,
          },
          {
            group:
              'GT02',
            status:
              'COMPLETED',
            validation:
              'VALID',
            attempts:
              1,
          },
        ],
        'Continuation must reuse GT01 attempt 1 and run GT02 only as its initial attempt.',
      );

      const gt01AttemptsAfter =
        repository.listAttempts(
          finalDetail.jobs[0].job_id,
        );

      assert.equal(
        gt01AttemptsAfter.length,
        1,
        'Continue must not create a retry attempt for GT01.',
      );

      assert.equal(
        gt01AttemptsAfter[0]
          .attempt_id,
        gt01AttemptId,
        'Continue must execute the original interrupted GT01 attempt.',
      );

      assert.deepEqual(
        fixtureSource.collectCalls.map(
          (context) =>
            context.source_context
              .query_group
              .query_group_id,
        ),
        [
          'GT01',
          'GT01',
          'GT02',
        ],
        'Continue must resume GT01 first, then advance to pending GT02.',
      );

      console.log(
        'PASS GT-QUICK-RUN-MANUAL-001: explicit continuation reuses the blocked GT01 attempt and completes the same persisted Run',
      );
    } finally {
      repository.close();
    }
  }

};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
