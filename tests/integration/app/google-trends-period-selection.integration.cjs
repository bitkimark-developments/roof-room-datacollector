const assert = require(
  'node:assert/strict',
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
  GOOGLE_TRENDS_PERIOD_PRESETS,
  deriveGoogleTrendsRequestedDateRange,
  normalizeGoogleTrendsCollectionStartRequest,
  normalizeGoogleTrendsPeriodSelection,
} = require(
  path.join(
    buildRoot,
    'src',
    'shared',
    'google-trends-period.js',
  ),
);

assert.deepEqual(
  GOOGLE_TRENDS_PERIOD_PRESETS,
  [
    '1W',
    '1M',
    '6M',
    '12M',
    '24M',
    '36M',
  ],
);

const establishedEnd =
  '2026-08-17';

const expectedRanges = {
  '1W': {
    requested_date_start:
      '2026-08-11',
    requested_date_end:
      establishedEnd,
  },
  '1M': {
    requested_date_start:
      '2026-07-18',
    requested_date_end:
      establishedEnd,
  },
  '6M': {
    requested_date_start:
      '2026-02-18',
    requested_date_end:
      establishedEnd,
  },
  '12M': {
    requested_date_start:
      '2025-08-18',
    requested_date_end:
      establishedEnd,
  },
  '24M': {
    requested_date_start:
      '2024-08-18',
    requested_date_end:
      establishedEnd,
  },
  '36M': {
    requested_date_start:
      '2023-08-18',
    requested_date_end:
      establishedEnd,
  },
};

for (
  const periodPreset of
    GOOGLE_TRENDS_PERIOD_PRESETS
) {
  assert.deepEqual(
    deriveGoogleTrendsRequestedDateRange({
      period_preset:
        periodPreset,
      reference_date:
        establishedEnd,
    }),
    expectedRanges[
      periodPreset
    ],
  );
}

console.log(
  'PASS GT-PERIOD-001: every approved preset derives an exact inclusive requested date window',
);

assert.deepEqual(
  deriveGoogleTrendsRequestedDateRange({
    period_preset:
      '24M',
    reference_date:
      '2026-08-17',
  }),
  {
    requested_date_start:
      '2024-08-18',
    requested_date_end:
      '2026-08-17',
  },
);

console.log(
  'PASS GT-PERIOD-002: 24M preserves the established Google Trends baseline window',
);

assert.deepEqual(
  deriveGoogleTrendsRequestedDateRange({
    period_preset:
      '1M',
    reference_date:
      '2026-02-28',
  }),
  {
    requested_date_start:
      '2026-02-01',
    requested_date_end:
      '2026-02-28',
  },
);

assert.deepEqual(
  deriveGoogleTrendsRequestedDateRange({
    period_preset:
      '12M',
    reference_date:
      '2024-02-29',
  }),
  {
    requested_date_start:
      '2023-03-01',
    requested_date_end:
      '2024-02-29',
  },
);

console.log(
  'PASS GT-PERIOD-003: calendar-month arithmetic handles month-end and leap-year boundaries deterministically',
);

assert.throws(
  () =>
    normalizeGoogleTrendsPeriodSelection({
      period_preset:
        '2W',
      reference_date:
        '2026-08-17',
    }),
  /Unsupported Google Trends period preset/,
);

assert.throws(
  () =>
    normalizeGoogleTrendsPeriodSelection({
      period_preset:
        '1M',
      reference_date:
        '2026-02-30',
    }),
  /real calendar date/,
);

assert.throws(
  () =>
    normalizeGoogleTrendsPeriodSelection({
      period_preset:
        '1M',
      reference_date:
        '17-08-2026',
    }),
  /YYYY-MM-DD/,
);

console.log(
  'PASS GT-PERIOD-004: unsupported presets and invalid calendar dates fail closed',
);

const normalizedStartRequest =
  normalizeGoogleTrendsCollectionStartRequest({
    query_group_ids: [
      'GT01',
      'GT02',
    ],
    period: {
      period_preset:
        '6M',
      reference_date:
        '2026-08-17',
    },
  });

assert.deepEqual(
  normalizedStartRequest,
  {
    query_group_ids: [
      'GT01',
      'GT02',
    ],
    period: {
      period_preset:
        '6M',
      reference_date:
        '2026-08-17',
    },
  },
);

assert.throws(
  () =>
    normalizeGoogleTrendsCollectionStartRequest({
      query_group_ids: [
        'GT01',
        'GT01',
      ],
      period: {
        period_preset:
          '24M',
        reference_date:
          '2026-08-17',
      },
    }),
  /unique query group IDs/,
);

assert.throws(
  () =>
    normalizeGoogleTrendsCollectionStartRequest({
      query_group_ids: [
        'GT01',
      ],
      period: {
        period_preset:
          '2W',
        reference_date:
          '2026-08-17',
      },
    }),
  /Unsupported Google Trends period preset/,
);

console.log(
  'PASS GT-PERIOD-005: collection start requests normalize query groups and period selection through one fail-closed IPC contract',
);
