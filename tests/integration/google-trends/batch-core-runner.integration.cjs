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
] = process.argv.slice(2);

if (
  !buildRoot ||
  !tempRoot
) {
  throw new Error(
    'Expected compiled build root and temp root.',
  );
}

const {
  resumeGoogleTrendsThroughCore,
  runGoogleTrendsBatchThroughCore,
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

const makeDirectories = (
  name,
) => {
  const appDataRoot =
    path.join(
      tempRoot,
      name,
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
        name,
        'public-downloads',
      ),
  };

  for (const directory of
    Object.values(
      directories,
    )) {
    fs.mkdirSync(
      directory,
      {
        recursive:
          true,
      },
    );
  }

  return directories;
};

const groups = [
  {
    query_group_id:
      'GT01',
    query_group_name:
      'first-group',
    queries: [
      'first one',
      'first two',
    ],
  },
  {
    query_group_id:
      'GT02',
    query_group_name:
      'second-group',
    queries: [
      'second one',
      'second two',
    ],
  },
];

const queryConfig = {
  config_version:
    1,
  source_id:
    'google-trends',
  groups,
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

class BatchFixtureSource {
  id = 'google-trends';
  name = 'Google Trends Batch Fixture';
  sourceMode =
    'GOOGLE_TRENDS_UI';
  datasetTypes = [
    'INTEREST_OVER_TIME',
  ];
  collectCalls = [];

  constructor(
    failGroupId = null,
  ) {
    this.failGroupId =
      failGroupId;
  }

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

    if (
      context.query_group
        .query_group_id ===
      this.failGroupId
    ) {
      return {
        result_type:
          'FAILED',
        error_code:
          'DETERMINISTIC_GROUP_FAILURE',
        message:
          'Safe deterministic batch failure.',
      };
    }

    return {
      result_type:
        'ARTIFACT_PRODUCED',
      preferred_filename:
        `${context.query_group.query_group_id}.csv`,
      media_type:
        'text/csv',
      bytes:
        Buffer.from(
          `fixture:${context.query_group.query_group_id}`,
          'utf8',
        ),
    };
  }
}

class ManualFixtureSource extends BatchFixtureSource {
  async collect(context) {
    this.collectCalls.push(
      context,
    );

    return {
      result_type:
        'MANUAL_ACTION_REQUIRED',
      message:
        'Safe deterministic manual action fixture.',
    };
  }
}

const validator = {
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
      findings: [],
      validated_metadata: {
        actual_date_start:
          '2024-08-18',
        actual_date_end:
          '2026-08-16',
        country_name:
          'Turkey',
      },
    };
  },
};

const runBatch = (
  directories,
  source,
) =>
  runGoogleTrendsBatchThroughCore({
    directories,
    query_config:
      queryConfig,
    requested_configuration:
      requestedConfiguration,
    application_version:
      '1.0.0-test',
    source,
    validator,
    logger:
      null,
  });

const main = async () => {
  const successDirectories =
    makeDirectories(
      'success',
    );
  const successSource =
    new BatchFixtureSource();

  const success =
    await runBatch(
      successDirectories,
      successSource,
    );

  assert.deepEqual(
    successSource.collectCalls.map(
      (context) =>
        context.query_group
          .query_group_id,
    ),
    [
      'GT01',
      'GT02',
    ],
  );
  assert.equal(
    success.run.run_status,
    'COMPLETED',
  );
  assert.equal(
    success.orchestration
      .stopped_because,
    'RUN_COMPLETED',
  );
  assert.equal(
    success.jobs.length,
    2,
  );
  assert.equal(
    success.jobs.every(
      (entry) =>
        entry.job
          .execution_status ===
          'COMPLETED' &&
        entry.job
          .validation_status ===
          'VALID' &&
        entry.attempt
          ?.attempt_number === 1 &&
        entry.artifact
          ?.artifact_state ===
          'ACCEPTED' &&
        entry.validation
          ?.validation_status ===
          'VALID' &&
        entry.source_result
          ?.result_type ===
          'ARTIFACT_PRODUCED',
    ),
    true,
  );

  console.log(
    'PASS GT-BATCH-CORE-001: two query groups execute sequentially in configured order and complete one shared Core run',
  );

  for (const entry of
    success.jobs) {
    const absolutePath =
      path.join(
        successDirectories.runs,
        success.run.run_id,
        entry.artifact
          .relative_path,
      );

    assert.equal(
      fs.existsSync(
        absolutePath,
      ),
      true,
    );
    assert.equal(
      fs.readFileSync(
        absolutePath,
        'utf8',
      ),
      `fixture:${entry.job.query_group_id}`,
    );
  }
  assert.deepEqual(
    fs.readdirSync(
      successDirectories
        .public_downloads,
    ),
    [],
  );

  console.log(
    'PASS GT-BATCH-CORE-002: every group keeps independent run-scoped artifact/validation evidence and Downloads remains outside canonical storage',
  );

  const failureDirectories =
    makeDirectories(
      'failure',
    );
  const failureSource =
    new BatchFixtureSource(
      'GT02',
    );

  const partial =
    await runBatch(
      failureDirectories,
      failureSource,
    );

  assert.equal(
    partial.run.run_status,
    'RUNNING',
  );
  assert.equal(
    partial.orchestration
      .stopped_because,
    'RETRY_REQUIRED',
  );
  assert.equal(
    partial.jobs[0]
      .job.execution_status,
    'COMPLETED',
  );
  assert.equal(
    partial.jobs[0]
      .artifact.artifact_state,
    'ACCEPTED',
  );
  assert.equal(
    partial.jobs[1]
      .job.execution_status,
    'FAILED',
  );
  assert.equal(
    partial.jobs[1]
      .attempt.error_code,
    'DETERMINISTIC_GROUP_FAILURE',
  );
  assert.equal(
    partial.jobs[1]
      .artifact,
    null,
  );

  console.log(
    'PASS GT-BATCH-CORE-003: a later group failure preserves the earlier accepted group and exposes explicit retry-required state',
  );

  const retrySource =
    new BatchFixtureSource();

  const retried =
    await resumeGoogleTrendsThroughCore({
      directories:
        failureDirectories,
      run_id:
        partial.run.run_id,
      source:
        retrySource,
      retry_failed:
        true,
      max_attempts:
        2,
      validator,
      logger:
        null,
    });

  assert.deepEqual(
    retrySource.collectCalls.map(
      (context) =>
        context.query_group
          .query_group_id,
    ),
    [
      'GT02',
    ],
  );
  assert.equal(
    retried.run.run_status,
    'COMPLETED',
  );
  assert.equal(
    retried.jobs[0]
      .attempt.attempt_number,
    1,
  );
  assert.equal(
    retried.jobs[0]
      .source_result,
    null,
  );
  assert.equal(
    retried.jobs[1]
      .attempt.attempt_number,
    2,
  );
  assert.equal(
    retried.jobs.every(
      (entry) =>
        entry.job
          .execution_status ===
          'COMPLETED' &&
        entry.artifact
          ?.artifact_state ===
          'ACCEPTED',
    ),
    true,
  );

  console.log(
    'PASS GT-BATCH-CORE-004: explicit retry recollects only the failed group as attempt 2 and preserves the earlier accepted group without a new source call',
  );

  const manualDirectories =
    makeDirectories(
      'manual',
    );
  const manualSource =
    new ManualFixtureSource();

  const blocked =
    await runBatch(
      manualDirectories,
      manualSource,
    );

  assert.equal(
    blocked.run.run_status,
    'MANUAL_ACTION_REQUIRED',
  );
  assert.equal(
    blocked.jobs[0]
      .job.execution_status,
    'MANUAL_ACTION_REQUIRED',
  );
  assert.equal(
    blocked.jobs[0]
      .attempt.attempt_number,
    1,
  );
  assert.equal(
    blocked.jobs[1]
      .job.execution_status,
    'PENDING',
  );

  const continuedSource =
    new BatchFixtureSource();

  const continued =
    await resumeGoogleTrendsThroughCore({
      directories:
        manualDirectories,
      run_id:
        blocked.run.run_id,
      source:
        continuedSource,
      retry_failed:
        false,
      validator,
      logger:
        null,
    });

  assert.deepEqual(
    continuedSource.collectCalls.map(
      (context) =>
        context.query_group
          .query_group_id,
    ),
    [
      'GT01',
      'GT02',
    ],
  );
  assert.equal(
    continued.run.run_status,
    'COMPLETED',
  );
  assert.equal(
    continued.jobs[0]
      .attempt.attempt_number,
    1,
  );
  assert.equal(
    continued.jobs[1]
      .attempt.attempt_number,
    1,
  );

  console.log(
    'PASS GT-BATCH-CORE-005: explicit continuation after manual action reuses the interrupted attempt and then advances to pending groups without automatic retry',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
