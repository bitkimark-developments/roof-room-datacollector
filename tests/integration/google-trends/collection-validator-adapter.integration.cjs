const assert = require(
  'node:assert/strict',
);
const fsp = require(
  'node:fs/promises',
);
const os = require(
  'node:os',
);
const path = require(
  'node:path',
);

const [
  buildRoot,
  fixturePath,
] = process.argv.slice(2);

if (!buildRoot || !fixturePath) {
  throw new Error(
    'Expected compiled build root and real Google Trends fixture path.',
  );
}

const {
  GoogleTrendsCollectionValidator,
  GoogleTrendsValidationContextError,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-collection-validator.js',
  ),
);

const queries = [
  'canlı bitki',
  'online bitki',
  'bitki satın al',
  'bitki siparişi',
  'saksılı bitki',
];

const requestedConfiguration = {
  source_mode:
    'GOOGLE_TRENDS_UI',
  country_code: 'TR',
  language_code: null,
  requested_date_start:
    '2024-08-18',
  requested_date_end:
    '2026-08-17',
  category_id: null,
  category_name:
    'All Categories',
  search_type:
    'Web Search',
  selection_type:
    'Search Term',
  dataset_type:
    'INTEREST_OVER_TIME',
};

const queryGroup = {
  query_group_id: 'GT01',
  query_group_name:
    'generic_commercial',
  queries,
};

const createRun = (
  overrides = {},
) => {
  const requested = {
    ...requestedConfiguration,
    ...(overrides
      .requested_configuration ??
      {}),
  };

  return {
    run_id: 'run-gt01',
    run_status: 'RUNNING',
    created_at:
      '2026-08-18T16:00:00.000Z',
    started_at:
      '2026-08-18T16:00:01.000Z',
    completed_at: null,
    application_version:
      '1.0.0',
    selected_sources: [
      'google-trends',
    ],
    requested_configuration:
      requested,
    configuration_snapshot: {
      ...requested,
      config_version: 1,
      source_id:
        'google-trends',
      selected_query_groups: [
        {
          query_group_id:
            queryGroup
              .query_group_id,
          query_group_name:
            queryGroup
              .query_group_name,
          queries: [
            ...queryGroup.queries,
          ],
        },
      ],
      ...(overrides
        .configuration_snapshot ??
        {}),
    },
    ...overrides,
    requested_configuration:
      requested,
  };
};

const createContext = (
  absolutePath,
  overrides = {},
) => {
  const run =
    overrides.run ??
    createRun();

  const job = {
    job_id: 'job-gt01',
    run_id: run.run_id,
    source_id:
      'google-trends',
    job_key: 'GT01',
    query_group_id:
      'GT01',
    job_order: 1,
    execution_status:
      'VALIDATING',
    validation_status:
      'NOT_RUN',
    attempt_count: 1,
    accepted_artifact_id:
      null,
    created_at:
      '2026-08-18T16:00:00.000Z',
    started_at:
      '2026-08-18T16:00:01.000Z',
    completed_at: null,
    ...(overrides.job ?? {}),
  };

  const attempt = {
    attempt_id:
      'attempt-gt01-1',
    job_id: job.job_id,
    attempt_number: 1,
    execution_status:
      'VALIDATING',
    error_code: null,
    started_at:
      '2026-08-18T16:00:01.000Z',
    completed_at: null,
    candidate_artifact_id:
      'artifact-gt01-1',
    ...(overrides.attempt ?? {}),
  };

  const artifact = {
    artifact_id:
      'artifact-gt01-1',
    run_id: run.run_id,
    job_id: job.job_id,
    attempt_number:
      attempt.attempt_number,
    source_id:
      'google-trends',
    artifact_kind:
      'RAW_SOURCE_FILE',
    artifact_state:
      'CANDIDATE',
    filename:
      'GT01_TR_2024-08-18_2026-08-17_interest_over_time.csv',
    relative_path:
      'google-trends/raw/GT01_TR_2024-08-18_2026-08-17_interest_over_time.csv',
    media_type:
      'text/csv',
    byte_size: 2467,
    sha256: null,
    created_at:
      '2026-08-18T16:00:02.000Z',
    ...(overrides.artifact ??
      {}),
  };

  return {
    run,
    job,
    attempt,
    artifact,
    query_group:
      overrides.query_group ?? {
        ...queryGroup,
        queries: [
          ...queryGroup.queries,
        ],
      },
    absolute_path:
      absolutePath,
  };
};

const main = async () => {
  const validator =
    new GoogleTrendsCollectionValidator();

  const valid =
    await validator.validate(
      createContext(
        fixturePath,
      ),
    );

  assert.equal(
    valid.validation_status,
    'VALID',
  );

  assert.equal(
    valid.findings.some(
      (finding) =>
        finding.check_id ===
          'GT_EXPECTED_QUERIES' &&
        finding.passed,
    ),
    true,
  );

  assert.equal(
    valid.findings.some(
      (finding) =>
        finding.check_id ===
          'GT_DATE_COVERAGE' &&
        finding.passed,
    ),
    true,
  );

  console.log(
    'PASS GT-ADAPTER-001: CollectionValidator adapter reads the persisted raw artifact and validates it against run/query-group evidence',
  );

  const mismatchedQueries =
    await validator.validate(
      createContext(
        fixturePath,
        {
          query_group: {
            ...queryGroup,
            queries: [
              ...queries.slice(
                0,
                -1,
              ),
              'yanlış sorgu',
            ],
          },
        },
      ),
    );

  assert.equal(
    mismatchedQueries
      .validation_status,
    'QUERY_MISMATCH',
  );

  console.log(
    'PASS GT-ADAPTER-002: requested query identity comes from the immutable validation context rather than filename or provider column position',
  );

  const wrongDateRun =
    createRun({
      requested_configuration: {
        requested_date_start:
          '2024-08-25',
      },
    });

  const wrongDate =
    await validator.validate(
      createContext(
        fixturePath,
        {
          run: wrongDateRun,
        },
      ),
    );

  assert.equal(
    wrongDate.validation_status,
    'DATE_MISMATCH',
  );

  console.log(
    'PASS GT-ADAPTER-003: requested date coverage comes from the run configuration and mismatches remain visible',
  );

  const temporaryRoot =
    await fsp.mkdtemp(
      path.join(
        os.tmpdir(),
        'roofroom-gt-validator-',
      ),
    );

  try {
    const htmlPath =
      path.join(
        temporaryRoot,
        'fake.csv',
      );

    await fsp.writeFile(
      htmlPath,
      '<!doctype html><html><body>Sign in</body></html>',
      'utf8',
    );

    const html =
      await validator.validate(
        createContext(
          htmlPath,
        ),
      );

    assert.equal(
      html.validation_status,
      'ERROR_NOT_DATA',
    );
  } finally {
    await fsp.rm(
      temporaryRoot,
      {
        recursive: true,
        force: true,
      },
    );
  }

  console.log(
    'PASS GT-ADAPTER-004: an HTML/login artifact is rejected through the same CollectionValidator boundary as ERROR_NOT_DATA',
  );

  const unsupportedCountryRun =
    createRun({
      requested_configuration: {
        country_code: 'US',
      },
    });

  await assert.rejects(
    () =>
      validator.validate(
        createContext(
          fixturePath,
          {
            run:
              unsupportedCountryRun,
          },
        ),
      ),
    (error) =>
      error instanceof
        GoogleTrendsValidationContextError &&
      /country_code/u.test(
        error.message,
      ),
  );

  console.log(
    'PASS GT-ADAPTER-005: the M3 adapter fails closed for unsupported country configuration instead of inventing provider-label mappings',
  );

  await assert.rejects(
    () =>
      validator.validate(
        createContext(
          fixturePath,
          {
            job: {
              source_id:
                'fake-source',
            },
          },
        ),
      ),
    (error) =>
      error instanceof
        GoogleTrendsValidationContextError,
  );

  console.log(
    'PASS GT-ADAPTER-006: the source-specific validator refuses artifacts/jobs from another source',
  );

  const inconsistentContext =
    createContext(
      fixturePath,
      {
        query_group: {
          ...queryGroup,
          query_group_id:
            'GT02',
        },
      },
    );

  await assert.rejects(
    () =>
      validator.validate(
        inconsistentContext,
      ),
    (error) =>
      error instanceof
        GoogleTrendsValidationContextError &&
      /query group/u.test(
        error.message,
      ),
  );

  console.log(
    'PASS GT-ADAPTER-007: inconsistent run/job/query-group validation evidence fails closed before artifact acceptance',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
