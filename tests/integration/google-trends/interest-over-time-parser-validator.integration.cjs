const assert = require(
  'node:assert/strict',
);
const {
  createHash,
} = require(
  'node:crypto',
);
const fs = require(
  'node:fs',
);
const path = require(
  'node:path',
);

const [
  buildRoot,
  fixturePath,
  dailyFixturePath,
] = process.argv.slice(2);

if (
  !buildRoot ||
  !fixturePath ||
  !dailyFixturePath
) {
  throw new Error(
    'Expected compiled build root plus real weekly and daily Google Trends fixture paths.',
  );
}

const dailyFixtureBytes =
  fs.readFileSync(
    dailyFixturePath,
  );

const {
  GoogleTrendsCsvParseError,
  parseGoogleTrendsInterestOverTimeCsv,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-interest-over-time-parser.js',
  ),
);

const {
  validateGoogleTrendsInterestOverTimeCsv,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-interest-over-time-validator.js',
  ),
);

const EXPECTED_QUERIES = [
  'canlı bitki',
  'online bitki',
  'bitki satın al',
  'bitki siparişi',
  'saksılı bitki',
];

const EXPECTED_SHA256 =
  '9bd0f03d00dd803932f8207e2c74326619874af05b5509cf6aeefc2369aad883';

const EXPECTED_DAY_SHA256 =
  '2416979c25a062ab603275aa6e6aba2990ed080bb5457f87d80325bb8c3a7d08';

const sha256 = (
  bytes,
) =>
  createHash('sha256')
    .update(bytes)
    .digest('hex');

const validate = (
  bytes,
  overrides = {},
) =>
  validateGoogleTrendsInterestOverTimeCsv({
    bytes,
    expected_queries:
      EXPECTED_QUERIES,
    requested_date_start:
      '2024-08-18',
    requested_date_end:
      '2026-08-17',
    expected_category_label:
      'All categories',
    expected_geography_label:
      'Türkiye',
    ...overrides,
  });

const reorderSeries = (
  bytes,
) => {
  const lines =
    bytes
      .toString('utf8')
      .split('\n');

  const order = [
    0,
    2,
    1,
    3,
    4,
    5,
  ];

  for (
    let index = 2;
    index < lines.length;
    index += 1
  ) {
    if (
      lines[index].length === 0
    ) {
      continue;
    }

    const columns =
      lines[index].split(',');

    assert.equal(
      columns.length,
      6,
    );

    lines[index] =
      order
        .map(
          (columnIndex) =>
            columns[
              columnIndex
            ],
        )
        .join(',');
  }

  return Buffer.from(
    lines.join('\n'),
    'utf8',
  );
};

const removeLastSeries = (
  bytes,
) => {
  const lines =
    bytes
      .toString('utf8')
      .split('\n');

  for (
    let index = 2;
    index < lines.length;
    index += 1
  ) {
    if (
      lines[index].length === 0
    ) {
      continue;
    }

    const columns =
      lines[index].split(',');

    columns.pop();

    lines[index] =
      columns.join(',');
  }

  return Buffer.from(
    lines.join('\n'),
    'utf8',
  );
};

const duplicateFirstDataRow = (
  bytes,
) => {
  const lines =
    bytes
      .toString('utf8')
      .split('\n');

  lines.splice(
    4,
    0,
    lines[3],
  );

  return Buffer.from(
    lines.join('\n'),
    'utf8',
  );
};

const replaceAllDataValues = (
  bytes,
  replacement,
) => {
  const lines =
    bytes
      .toString('utf8')
      .split('\n');

  for (
    let index = 3;
    index < lines.length;
    index += 1
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2},/u.test(
        lines[index],
      )
    ) {
      continue;
    }

    const columns =
      lines[index].split(',');

    lines[index] = [
      columns[0],
      ...columns
        .slice(1)
        .map(
          () => replacement,
        ),
    ].join(',');
  }

  return Buffer.from(
    lines.join('\n'),
    'utf8',
  );
};

const main = () => {
  const fixtureBytes =
    fs.readFileSync(
      fixturePath,
    );

  assert.equal(
    fixtureBytes.length,
    2467,
  );

  assert.equal(
    sha256(fixtureBytes),
    EXPECTED_SHA256,
  );

  const hashBefore =
    sha256(fixtureBytes);

  const parsed =
    parseGoogleTrendsInterestOverTimeCsv(
      fixtureBytes,
    );

  assert.equal(
    sha256(fixtureBytes),
    hashBefore,
  );

  assert.equal(
    parsed.category_label,
    'All categories',
  );

  assert.equal(
    parsed.temporal_dimension,
    'Week',
  );

  assert.deepEqual(
    parsed.series.map(
      (series) =>
        series.query,
    ),
    EXPECTED_QUERIES,
  );

  assert.deepEqual(
    [
      ...new Set(
        parsed.series.map(
          (series) =>
            series.geography_label,
        ),
      ),
    ],
    ['Türkiye'],
  );

  assert.equal(
    parsed.rows.length,
    105,
  );

  assert.equal(
    parsed.rows[0]
      .period_start,
    '2024-08-18',
  );

  assert.deepEqual(
    parsed.rows[0]
      .values.map(
        (value) =>
          value.relative_interest,
      ),
    [30, 0, 0, 0, 0],
  );

  assert.equal(
    parsed.rows[
      parsed.rows.length - 1
    ].period_start,
    '2026-08-16',
  );

  const validDecision =
    validate(
      fixtureBytes,
    );

  assert.equal(
    validDecision
      .validation_status,
    'VALID',
  );

  assert.equal(
    validDecision
      .checks_failed,
    0,
  );

  const dateFinding =
    validDecision.findings.find(
      (finding) =>
        finding.check_id ===
        'GT_DATE_COVERAGE',
    );

  assert.ok(dateFinding);

  assert.equal(
    dateFinding.passed,
    true,
  );

  assert.equal(
    dateFinding.expected
      .expected_last_bucket,
    '2026-08-16',
  );

  assert.deepEqual(
    validDecision
      .validated_metadata,
    {
      actual_date_start:
        '2024-08-18',
      actual_date_end:
        '2026-08-16',
      country_name:
        null,
    },
  );

  console.log(
    'PASS GT-VAL-008: parsed weekly bucket boundaries become validated actual-date metadata without extending the provider evidence',
  );

  console.log(
    'PASS GT-PARSE-001: exact real GT01 provider fixture parses without mutating raw bytes',
  );

  const reorderedBytes =
    reorderSeries(
      fixtureBytes,
    );

  const reorderedParsed =
    parseGoogleTrendsInterestOverTimeCsv(
      reorderedBytes,
    );

  assert.deepEqual(
    reorderedParsed.series.map(
      (series) =>
        series.query,
    ),
    [
      'online bitki',
      'canlı bitki',
      'bitki satın al',
      'bitki siparişi',
      'saksılı bitki',
    ],
  );

  assert.deepEqual(
    reorderedParsed.rows[0]
      .values.map(
        (value) => [
          value.query,
          value.relative_interest,
        ],
      ),
    [
      ['online bitki', 0],
      ['canlı bitki', 30],
      ['bitki satın al', 0],
      ['bitki siparişi', 0],
      ['saksılı bitki', 0],
    ],
  );

  assert.equal(
    validate(
      reorderedBytes,
    ).validation_status,
    'VALID',
  );

  console.log(
    'PASS GT-PARSE-002: reordered provider query columns map by header identity rather than fixed position',
  );

  const missingQuery =
    validate(
      removeLastSeries(
        fixtureBytes,
      ),
    );

  assert.equal(
    missingQuery
      .validation_status,
    'QUERY_MISMATCH',
  );

  assert.equal(
    missingQuery.findings.find(
      (finding) =>
        finding.check_id ===
        'GT_EXPECTED_QUERIES',
    ).passed,
    false,
  );

  console.log(
    'PASS GT-PARSE-003: missing requested series resolves to QUERY_MISMATCH',
  );


  assert.equal(
    sha256(
      dailyFixtureBytes,
    ),
    EXPECTED_DAY_SHA256,
  );

  const dailyHashBefore =
    sha256(
      dailyFixtureBytes,
    );

  const dailyParsed =
    parseGoogleTrendsInterestOverTimeCsv(
      dailyFixtureBytes,
    );

  assert.equal(
    sha256(
      dailyFixtureBytes,
    ),
    dailyHashBefore,
  );

  assert.equal(
    dailyParsed.temporal_dimension,
    'Day',
  );

  assert.equal(
    dailyParsed.rows.length,
    7,
  );

  assert.equal(
    dailyParsed.rows[0]
      .period_start,
    '2026-08-11',
  );

  assert.equal(
    dailyParsed.rows[
      dailyParsed.rows.length - 1
    ].period_start,
    '2026-08-17',
  );

  assert.deepEqual(
    dailyParsed.rows[0]
      .values.map(
        (value) =>
          value.relative_interest,
      ),
    [100, 0, 0, 0, 0],
  );

  const dailyDecision =
    validate(
      dailyFixtureBytes,
      {
        requested_date_start:
          '2026-08-11',
        requested_date_end:
          '2026-08-17',
      },
    );

  assert.equal(
    dailyDecision.validation_status,
    'VALID',
  );

  const dailyDateFinding =
    dailyDecision.findings.find(
      (finding) =>
        finding.check_id ===
        'GT_DATE_COVERAGE',
    );

  assert.ok(
    dailyDateFinding,
  );

  assert.equal(
    dailyDateFinding.passed,
    true,
  );

  assert.equal(
    dailyDateFinding.expected
      .expected_last_bucket,
    '2026-08-17',
  );

  assert.equal(
    dailyDateFinding.expected
      .cadence_days,
    1,
  );

  assert.deepEqual(
    dailyDecision
      .validated_metadata,
    {
      actual_date_start:
        '2026-08-11',
      actual_date_end:
        '2026-08-17',
      country_name:
        null,
    },
  );

  console.log(
    'PASS GT-PARSE-005: exact real 1W provider fixture parses as Day without mutating raw bytes',
  );

  console.log(
    'PASS GT-DATE-003: observed Day buckets exactly cover the requested inclusive 1W range',
  );

  const dailyGapBytes =
    Buffer.from(
      dailyFixtureBytes
        .toString('utf8')
        .split('\n')
        .filter(
          (line) =>
            !line.startsWith(
              '2026-08-12,',
            ),
        )
        .join('\n'),
      'utf8',
    );

  assert.equal(
    validate(
      dailyGapBytes,
      {
        requested_date_start:
          '2026-08-11',
        requested_date_end:
          '2026-08-17',
      },
    ).validation_status,
    'DATE_MISMATCH',
  );

  console.log(
    'PASS GT-DATE-004: a gap in observed Day cadence fails visibly as DATE_MISMATCH',
  );

  const unknownSchema =
    Buffer.from(
      fixtureBytes
        .toString('utf8')
        .replace(
          '\nWeek,',
          '\nMonth,',
        ),
      'utf8',
    );

  assert.throws(
    () =>
      parseGoogleTrendsInterestOverTimeCsv(
        unknownSchema,
      ),
    (error) =>
      error instanceof
        GoogleTrendsCsvParseError &&
      error.check_id ===
        'GT_TEMPORAL_DIMENSION',
  );

  assert.equal(
    validate(
      unknownSchema,
    ).validation_status,
    'INVALID_SCHEMA',
  );

  console.log(
    'PASS GT-PARSE-004: unknown temporal schema fails visibly as INVALID_SCHEMA',
  );

  const htmlBytes =
    Buffer.from(
      '<!doctype html><html><body>Sign in</body></html>',
      'utf8',
    );

  assert.equal(
    validate(
      htmlBytes,
    ).validation_status,
    'ERROR_NOT_DATA',
  );

  console.log(
    'PASS GT-VAL-001: HTML masquerading as CSV resolves to ERROR_NOT_DATA',
  );

  const wrongDate =
    validate(
      fixtureBytes,
      {
        requested_date_start:
          '2024-08-25',
      },
    );

  assert.equal(
    wrongDate.validation_status,
    'DATE_MISMATCH',
  );

  assert.deepEqual(
    wrongDate.validated_metadata,
    {
      actual_date_start:
        '2024-08-18',
      actual_date_end:
        '2026-08-16',
      country_name:
        null,
    },
  );

  console.log(
    'PASS GT-DATE-001: materially wrong requested period resolves to DATE_MISMATCH',
  );

  assert.equal(
    validDecision
      .validation_status,
    'VALID',
  );

  console.log(
    'PASS GT-DATE-002: requested end 2026-08-17 accepts observed final weekly bucket 2026-08-16',
  );

  const invalidNumeric =
    Buffer.from(
      fixtureBytes
        .toString('utf8')
        .replace(
          '2024-08-18,30,0,0,0,0',
          '2024-08-18,not-a-number,0,0,0,0',
        ),
      'utf8',
    );

  const invalidNumericDecision =
    validate(
      invalidNumeric,
    );

  assert.equal(
    invalidNumericDecision
      .validation_status,
    'INVALID_SCHEMA',
  );

  assert.equal(
    invalidNumericDecision
      .findings.some(
        (finding) =>
          finding.check_id ===
            'GT_RELATIVE_INTEREST_PARSE' &&
          !finding.passed,
      ),
    true,
  );

  console.log(
    'PASS GT-VAL-002: invalid relative-interest text is rejected without zero coercion',
  );

  const outOfRange =
    Buffer.from(
      fixtureBytes
        .toString('utf8')
        .replace(
          '2024-08-18,30,0,0,0,0',
          '2024-08-18,101,0,0,0,0',
        ),
      'utf8',
    );

  const outOfRangeDecision =
    validate(
      outOfRange,
    );

  assert.equal(
    outOfRangeDecision
      .validation_status,
    'INVALID_SCHEMA',
  );

  assert.equal(
    outOfRangeDecision
      .findings.find(
        (finding) =>
          finding.check_id ===
          'GT_RELATIVE_INTEREST_RANGE',
      ).passed,
    false,
  );

  console.log(
    'PASS GT-VAL-003: values outside the Google Trends 0-100 scale are rejected',
  );

  const duplicatePeriodDecision =
    validate(
      duplicateFirstDataRow(
        fixtureBytes,
      ),
    );

  assert.equal(
    duplicatePeriodDecision
      .validation_status,
    'INVALID_SCHEMA',
  );

  assert.equal(
    duplicatePeriodDecision
      .findings.find(
        (finding) =>
          finding.check_id ===
          'GT_DUPLICATE_PERIODS',
      ).passed,
    false,
  );

  console.log(
    'PASS GT-VAL-004: duplicate weekly periods are rejected',
  );

  const wrongGeography =
    Buffer.from(
      fixtureBytes
        .toString('utf8')
        .replaceAll(
          '(Türkiye)',
          '(United States)',
        ),
      'utf8',
    );

  const wrongGeographyDecision =
    validate(
      wrongGeography,
    );

  assert.equal(
    wrongGeographyDecision
      .validation_status,
    'INVALID_SCHEMA',
  );

  assert.equal(
    wrongGeographyDecision
      .findings.find(
        (finding) =>
          finding.check_id ===
          'GT_GEOGRAPHY',
      ).passed,
    false,
  );

  assert.equal(
    wrongGeographyDecision
      .validated_metadata
      .country_name,
    null,
  );

  console.log(
    'PASS GT-VAL-005: observed provider geography-label mismatch is rejected without inventing a country-code mapping',
  );

  const wrongCategoryDecision =
    validate(
      fixtureBytes,
      {
        expected_category_label:
          'Plants',
      },
    );

  assert.equal(
    wrongCategoryDecision
      .validation_status,
    'INVALID_SCHEMA',
  );

  console.log(
    'PASS GT-VAL-006: provider category-preamble mismatch is rejected',
  );

  const missingValue =
    Buffer.from(
      fixtureBytes
        .toString('utf8')
        .replace(
          '2024-08-18,30,0,0,0,0',
          '2024-08-18,30,,0,0,0',
        ),
      'utf8',
    );

  const missingParsed =
    parseGoogleTrendsInterestOverTimeCsv(
      missingValue,
    );

  assert.equal(
    missingParsed.rows[0]
      .values[1]
      .relative_interest,
    null,
  );

  assert.notEqual(
    missingParsed.rows[0]
      .values[1]
      .relative_interest,
    0,
  );

  console.log(
    'PASS GT-VAL-007: empty relative-interest cells remain null and are never coerced to zero',
  );

  const allZeroDecision =
    validate(
      replaceAllDataValues(
        fixtureBytes,
        '0',
      ),
    );

  assert.equal(
    allZeroDecision
      .validation_status,
    'LOW_DATA',
  );
  assert.equal(
    allZeroDecision
      .findings.some(
        (finding) =>
          finding.check_id ===
            'GT_ALL_ZERO' &&
          finding.severity ===
            'WARNING' &&
          !finding.passed,
      ),
    true,
  );
  assert.equal(
    allZeroDecision
      .checks_failed,
    0,
  );

  console.log(
    'PASS GT-VAL-009: structurally valid all-zero evidence resolves to visible LOW_DATA rather than silently VALID or fabricated NO_DATA',
  );

  const allMissingDecision =
    validate(
      replaceAllDataValues(
        fixtureBytes,
        '',
      ),
    );

  assert.equal(
    allMissingDecision
      .validation_status,
    'LOW_DATA',
  );
  assert.equal(
    allMissingDecision
      .findings.find(
        (finding) =>
          finding.check_id ===
          'GT_SIGNAL_DENSITY',
      ).severity,
    'WARNING',
  );
  assert.equal(
    allMissingDecision
      .findings.find(
        (finding) =>
          finding.check_id ===
          'GT_ALL_ZERO',
      ).passed,
    true,
  );

  console.log(
    'PASS GT-VAL-010: all-missing relative-interest evidence remains null and LOW_DATA without being mislabeled as all-zero or NO_DATA',
  );
};

main();
