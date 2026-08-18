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
  publicDownloadOverrides = {},
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

  const publicDownload = {
    filename:
      'multiTimeline.csv',
    absolute_path:
      '/public/google-trends/multiTimeline.csv',
    byte_size:
      artifactBytes.byteLength,
    sha256:
      hash(
        artifactBytes,
      ),
    ...publicDownloadOverrides,
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

      return publicDownload;
    },

    async read_public_download(absolutePath) {
      trace.push({
        step:
          'reread-public-copy',
        absolutePath,
      });

      return new Uint8Array(
        artifactBytes,
      );
    },
  };

  return {
    trace,
    dependencies,
    artifactBytes:
      new Uint8Array(
        artifactBytes,
      ),
    publicDownload,
  };
};

const makeInput = () => ({
  page: {
    marker:
      'managed-page',
  },
  store: {
    marker:
      'download-store',
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
  public_preferred_filename:
    'GT01__interest-over-time.csv',
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
      'reread-public-copy',
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
      .preferred_filename,
    'GT01__interest-over-time.csv',
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
    'PASS GT-CONFIGURED-EXPORT-002: query/date/timeout/public-filename evidence crosses the composed service boundary unchanged',
  );

  assert.equal(
    first.trace[5]
      .absolutePath,
    first.publicDownload
      .absolute_path,
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
  assert.deepEqual(
    result.public_download,
    first.publicDownload,
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-003: exact persisted public CSV bytes are reread and returned for later canonical run-scoped storage',
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
      publicDownloadOverrides: {
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
    'PASS GT-CONFIGURED-EXPORT-005: reread public bytes must match the persisted byte-size evidence',
  );

  const wrongHash =
    makeDependencies({
      publicDownloadOverrides: {
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
    'PASS GT-CONFIGURED-EXPORT-006: reread public bytes must match the persisted SHA-256 evidence before crossing into core storage',
  );

  const noOptional =
    makeDependencies();

  const minimalInput =
    makeInput();

  delete minimalInput
    .public_preferred_filename;
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
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      noOptional.trace[4]
        .input,
      'preferred_filename',
    ),
    false,
  );

  console.log(
    'PASS GT-CONFIGURED-EXPORT-007: optional UI/download settings remain absent so lower-level verified defaults stay authoritative',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
