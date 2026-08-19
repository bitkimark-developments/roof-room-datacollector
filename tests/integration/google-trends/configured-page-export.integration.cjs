const assert = require(
  'node:assert/strict',
);
const {
  createHash,
} = require(
  'node:crypto',
);
const path = require(
  'node:path',
);

const [buildRoot] =
  process.argv.slice(2);

if (!buildRoot) {
  throw new Error(
    'Expected compiled build root.',
  );
}

const {
  applyGoogleTrendsConfiguredPageThroughStage,
  exportConfiguredGoogleTrendsPage,
  GoogleTrendsConfiguredPageExportError,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-configured-page-export.js',
  ),
);

const hash = (
  bytes,
) =>
  createHash(
    'sha256',
  )
    .update(bytes)
    .digest('hex');

const makeDependencies = ({
  bytes,
  capturedDownloadOverrides = {},
  verifyError = null,
} = {}) => {
  const trace = [];

  const artifactBytes =
    bytes ??
    Buffer.from(
      [
        'Category: All categories',
        '',
        'Week,canlı bitki: (Türkiye)',
        '2024-08-18,50',
        '',
      ].join('\n'),
      'utf8',
    );

  const capturedDownload = {
    suggested_filename:
      'multiTimeline.csv',
    bytes:
      new Uint8Array(
        artifactBytes,
      ),
    byte_size:
      artifactBytes.byteLength,
    sha256:
      hash(
        artifactBytes,
      ),
    ...capturedDownloadOverrides,
  };

  const dependencies = {
    async apply_query_group(input) {
      trace.push({
        step:
          'query-group',
        input,
      });
    },

    async apply_turkey_geography(input) {
      trace.push({
        step:
          'geography',
        input,
      });
    },

    async apply_custom_date_range(input) {
      trace.push({
        step:
          'date-range',
        input,
      });
    },

    async verify_fixed_filters(input) {
      trace.push({
        step:
          'fixed-filters',
        input,
      });

      if (verifyError) {
        throw verifyError;
      }
    },

    async download_interest_over_time(input) {
      trace.push({
        step:
          'download',
        input,
      });

      return capturedDownload;
    },
  };

  return {
    trace,
    dependencies,
    artifactBytes:
      new Uint8Array(
        artifactBytes,
      ),
    capturedDownload,
  };
};

const makeInput = () => ({
  page: {
    marker:
      'managed-page',
  },
  queries: [
    'canlı bitki',
    'online bitki',
    'bitki satın al',
    'bitki siparişi',
    'saksılı bitki',
  ],
  requested_date_start:
    '2024-08-18',
  requested_date_end:
    '2026-08-17',
  ui_action_timeout_ms:
    4_000,
  download_timeout_ms:
    30_000,
});

const main = async () => {
  const first =
    makeDependencies();

  const input =
    makeInput();

  const result =
    await exportConfiguredGoogleTrendsPage(
      input,
      first.dependencies,
    );

  assert.deepEqual(
    first.trace.map(
      (entry) =>
        entry.step,
    ),
    [
      'query-group',
      'geography',
      'date-range',
      'fixed-filters',
      'download',
    ],
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-001: query group → Türkiye → exact date → fixed-filter verification → Interest over time download executes in deterministic order',
  );

  assert.deepEqual(
    first.trace[0]
      .input.queries,
    input.queries,
  );
  assert.equal(
    first.trace[2]
      .input
      .requested_date_start,
    '2024-08-18',
  );
  assert.equal(
    first.trace[2]
      .input
      .requested_date_end,
    '2026-08-17',
  );
  assert.equal(
    first.trace[4]
      .input
      .download_timeout_ms,
    30_000,
  );
  assert.equal(
    first.trace[4]
      .input
      .ui_action_timeout_ms,
    4_000,
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-002: query/date/timeout evidence crosses the composed service boundary unchanged',
  );
  assert.equal(
    result.media_type,
    'text/csv',
  );
  assert.deepEqual(
    Array.from(
      result.bytes,
    ),
    Array.from(
      first.artifactBytes,
    ),
  );
  assert.equal(
    result.provider_filename,
    'multiTimeline.csv',
  );
  assert.equal(
    result.byte_size,
    first.artifactBytes.byteLength,
  );
  assert.equal(
    result.sha256,
    hash(
      first.artifactBytes,
    ),
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-003: exact captured provider bytes and integrity evidence are returned for canonical run-scoped storage',
  );

  const blocked =
    makeDependencies({
      verifyError:
        new Error(
          'wrong fixed filter',
        ),
    });

  await assert.rejects(
    () =>
      exportConfiguredGoogleTrendsPage(
        makeInput(),
        blocked.dependencies,
      ),
    /wrong fixed filter/u,
  );

  assert.deepEqual(
    blocked.trace.map(
      (entry) =>
        entry.step,
    ),
    [
      'query-group',
      'geography',
      'date-range',
      'fixed-filters',
    ],
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-004: failed All categories/Web Search verification blocks download instead of accepting suspicious provider state',
  );

  const wrongSize =
    makeDependencies({
      capturedDownloadOverrides: {
        byte_size:
          999_999,
      },
    });

  await assert.rejects(
    () =>
      exportConfiguredGoogleTrendsPage(
        makeInput(),
        wrongSize.dependencies,
      ),
    (error) =>
      error instanceof
        GoogleTrendsConfiguredPageExportError &&
      /byte-size mismatch/u.test(
        error.message,
      ),
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-005: captured bytes must match their byte-size evidence',
  );

  const wrongHash =
    makeDependencies({
      capturedDownloadOverrides: {
        sha256:
          '0'.repeat(
            64,
          ),
      },
    });

  await assert.rejects(
    () =>
      exportConfiguredGoogleTrendsPage(
        makeInput(),
        wrongHash.dependencies,
      ),
    (error) =>
      error instanceof
        GoogleTrendsConfiguredPageExportError &&
      /SHA-256 mismatch/u.test(
        error.message,
      ),
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-006: captured bytes must match their SHA-256 evidence before crossing into core storage',
  );

  const noOptional =
    makeDependencies();

  const minimalInput =
    makeInput();

  delete minimalInput
    .ui_action_timeout_ms;
  delete minimalInput
    .download_timeout_ms;

  await exportConfiguredGoogleTrendsPage(
    minimalInput,
    noOptional.dependencies,
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      noOptional.trace[0]
        .input,
      'ui_action_timeout_ms',
    ),
    false,
  );
  console.log(
    'PASS GT-CONFIGURED-EXPORT-007: optional UI/download settings remain absent so lower-level verified defaults stay authoritative',
  );

  const staged =
    makeDependencies();

  const stagedEvents = [];

  const stagedResult =
    await applyGoogleTrendsConfiguredPageThroughStage(
      {
        ...makeInput(),
        through_stage:
          'DATE_RANGE',
        on_stage(stage) {
          stagedEvents.push(
            `started:${stage}`,
          );
        },
        on_stage_completed(stage) {
          stagedEvents.push(
            `completed:${stage}`,
          );
        },
      },
      staged.dependencies,
    );

  assert.deepEqual(
    staged.trace.map(
      (entry) =>
        entry.step,
    ),
    [
      'query-group',
      'geography',
      'date-range',
    ],
  );

  assert.deepEqual(
    stagedResult.completed_stages,
    [
      'QUERY_GROUP',
      'GEOGRAPHY',
      'DATE_RANGE',
    ],
  );

  assert.deepEqual(
    stagedEvents,
    [
      'started:QUERY_GROUP',
      'completed:QUERY_GROUP',
      'started:GEOGRAPHY',
      'completed:GEOGRAPHY',
      'started:DATE_RANGE',
      'completed:DATE_RANGE',
    ],
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-008: staged execution stops exactly after the requested module and reports only successfully completed acceptance gates',
  );

  const failedStage =
    makeDependencies({
      verifyError:
        new Error(
          'fixed-filter gate failed',
        ),
    });

  const failedStageCompletions = [];

  await assert.rejects(
    () =>
      applyGoogleTrendsConfiguredPageThroughStage(
        {
          ...makeInput(),
          through_stage:
            'FIXED_FILTERS',
          on_stage_completed(stage) {
            failedStageCompletions.push(
              stage,
            );
          },
        },
        failedStage.dependencies,
      ),
    /fixed-filter gate failed/u,
  );

  assert.deepEqual(
    failedStageCompletions,
    [
      'QUERY_GROUP',
      'GEOGRAPHY',
      'DATE_RANGE',
    ],
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-009: a failed module is never marked complete and later modules are never executed',
  );

  const invalidStage =
    makeDependencies();

  await assert.rejects(
    () =>
      applyGoogleTrendsConfiguredPageThroughStage(
        {
          ...makeInput(),
          through_stage:
            'DOWNLOAD',
        },
        invalidStage.dependencies,
      ),
    /Unsupported Google Trends pre-download stage/u,
  );

  assert.deepEqual(
    invalidStage.trace,
    [],
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-010: staged diagnostics cannot trigger download or provider interaction through an invalid target gate',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
