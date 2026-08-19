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
        'GT01_TR_24M_interest_over_time.csv',
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
    /restricted to exactly one GT01/u,
  );

  console.log(
    'PASS GT-CORE-006: the current live Core runner fails before persistence when scope expands beyond exactly one GT01 group',
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
    'RUNNING',
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
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
