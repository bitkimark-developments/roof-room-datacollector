import type {
  CollectionValidationDecision,
} from '../../../shared/collection';
import type {
  ValidationFinding,
} from '../../../shared/validation-detail';

import {
  GoogleTrendsCsvParseError,
  parseGoogleTrendsInterestOverTimeCsv,
  type ParsedGoogleTrendsInterestOverTime,
} from './google-trends-interest-over-time-parser';

const DAY_MS =
  24 * 60 * 60 * 1000;

export interface GoogleTrendsInterestOverTimeValidationInput {
  bytes: Uint8Array;
  expected_queries: readonly string[];
  requested_date_start: string;
  requested_date_end: string;
  expected_category_label?: string;
  expected_geography_label?: string;
}

type FinalValidationStatus =
  CollectionValidationDecision['validation_status'];

const finding = (
  checkId: string,
  passed: boolean,
  message: string,
  expected:
    ValidationFinding['expected'],
  actual:
    ValidationFinding['actual'],
): ValidationFinding => ({
  check_id: checkId,
  severity:
    passed
      ? 'INFO'
      : 'ERROR',
  passed,
  message,
  expected,
  actual,
});

const warningFinding = (
  checkId: string,
  message: string,
  expected:
    ValidationFinding['expected'],
  actual:
    ValidationFinding['actual'],
): ValidationFinding => ({
  check_id:
    checkId,
  severity:
    'WARNING',
  passed:
    false,
  message,
  expected,
  actual,
});

const decision = (
  validationStatus:
    FinalValidationStatus,
  findings:
    readonly ValidationFinding[],
  validatedMetadata?:
    CollectionValidationDecision['validated_metadata'],
): CollectionValidationDecision => {
  const base = {
    validation_status:
      validationStatus,
    checks_total:
      findings.length,
    checks_passed:
      findings.filter(
        (item) => item.passed,
      ).length,
    checks_warning:
      findings.filter(
        (item) =>
          item.severity === 'WARNING',
      ).length,
    checks_failed:
      findings.filter(
        (item) =>
          !item.passed &&
          item.severity === 'ERROR',
      ).length,
    findings: findings.map(
      (item) => ({
        ...item,
      }),
    ),
  };

  if (
    validatedMetadata ===
    undefined
  ) {
    return base;
  }

  return {
    ...base,
    validated_metadata: {
      ...validatedMetadata,
    },
  };
};

const decodeForSignature = (
  bytes: Uint8Array,
): string =>
  new TextDecoder(
    'utf-8',
  ).decode(
    bytes.slice(
      0,
      4_096,
    ),
  );

const looksLikeHtml = (
  bytes: Uint8Array,
): boolean => {
  const prefix =
    decodeForSignature(bytes)
      .trimStart()
      .toLowerCase();

  return (
    /<!doctype\s+html\b/u.test(
      prefix,
    ) ||
    /<html\b/u.test(prefix) ||
    /<head\b/u.test(prefix) ||
    /<body\b/u.test(prefix)
  );
};

const normalizeForMultiset = (
  values: readonly string[],
): string[] =>
  [...values].sort();

const sameStringMultiset = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  const normalizedLeft =
    normalizeForMultiset(left);

  const normalizedRight =
    normalizeForMultiset(right);

  if (
    normalizedLeft.length !==
    normalizedRight.length
  ) {
    return false;
  }

  return normalizedLeft.every(
    (value, index) =>
      value ===
      normalizedRight[index],
  );
};

const parseIsoDate = (
  value: string,
): Date => {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/u.exec(
      value,
    );

  if (!match) {
    throw new Error(
      `Invalid validation date: ${value}`,
    );
  }

  const date =
    new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
      ),
    );

  if (
    date
      .toISOString()
      .slice(0, 10) !== value
  ) {
    throw new Error(
      `Invalid validation date: ${value}`,
    );
  }

  return date;
};

const toDayNumber = (
  value: string,
): number =>
  Math.floor(
    parseIsoDate(value).getTime() /
      DAY_MS,
  );

const formatIsoDate = (
  date: Date,
): string =>
  date
    .toISOString()
    .slice(0, 10);

const expectedWeeklyBucketBoundary = (
  requestedEnd: string,
): string => {
  const end =
    parseIsoDate(requestedEnd);

  const dayOfWeek =
    end.getUTCDay();

  end.setUTCDate(
    end.getUTCDate() -
      dayOfWeek,
  );

  return formatIsoDate(end);
};

const uniqueStrings = (
  values: readonly string[],
): string[] =>
  [...new Set(values)];

const hasDuplicatePeriods = (
  parsed:
    ParsedGoogleTrendsInterestOverTime,
): boolean => {
  const periods =
    parsed.rows.map(
      (row) => row.period_start,
    );

  return (
    new Set(periods).size !==
    periods.length
  );
};

const hasDailyCadence = (
  parsed:
    ParsedGoogleTrendsInterestOverTime,
): boolean => {
  const days =
    parsed.rows.map(
      (row) =>
        toDayNumber(
          row.period_start,
        ),
    );

  for (
    let index = 1;
    index < days.length;
    index += 1
  ) {
    if (
      days[index] -
        days[index - 1] !==
      1
    ) {
      return false;
    }
  }

  return true;
};

const hasWeeklyCadence = (
  parsed:
    ParsedGoogleTrendsInterestOverTime,
): boolean => {
  const days =
    parsed.rows.map(
      (row) =>
        toDayNumber(
          row.period_start,
        ),
    );

  const sundays =
    parsed.rows.every(
      (row) =>
        parseIsoDate(
          row.period_start,
        ).getUTCDay() === 0,
    );

  if (!sundays) {
    return false;
  }

  for (
    let index = 1;
    index < days.length;
    index += 1
  ) {
    if (
      days[index] -
        days[index - 1] !==
      7
    ) {
      return false;
    }
  }

  return true;
};

const expectedFirstBucket = (
  parsed:
    ParsedGoogleTrendsInterestOverTime,
  requestedStart: string,
): string =>
  parsed.temporal_dimension ===
    'Day'
    ? requestedStart
    : expectedWeeklyBucketBoundary(
        requestedStart,
      );

const expectedLastBucket = (
  parsed:
    ParsedGoogleTrendsInterestOverTime,
  requestedEnd: string,
): string =>
  parsed.temporal_dimension ===
    'Day'
    ? requestedEnd
    : expectedWeeklyBucketBoundary(
        requestedEnd,
      );

const temporalCadenceMatches = (
  parsed:
    ParsedGoogleTrendsInterestOverTime,
): boolean =>
  parsed.temporal_dimension ===
    'Day'
    ? hasDailyCadence(
        parsed,
      )
    : hasWeeklyCadence(
        parsed,
      );

const dateCoverageMatches = (
  parsed:
    ParsedGoogleTrendsInterestOverTime,
  requestedStart: string,
  requestedEnd: string,
): boolean => {
  const first =
    parsed.rows[0]
      .period_start;

  const last =
    parsed.rows[
      parsed.rows.length - 1
    ].period_start;

  return (
    first ===
      expectedFirstBucket(
        parsed,
        requestedStart,
      ) &&
    last ===
      expectedLastBucket(
        parsed,
        requestedEnd,
      ) &&
    temporalCadenceMatches(
      parsed,
    )
  );
};

const relativeInterestRangeIsValid = (
  parsed:
    ParsedGoogleTrendsInterestOverTime,
): boolean =>
  parsed.rows.every(
    (row) =>
      row.values.every(
        (value) =>
          value.relative_interest ===
            null ||
          (
            Number.isInteger(
              value.relative_interest,
            ) &&
            value.relative_interest >=
              0 &&
            value.relative_interest <=
              100
          ),
      ),
  );

const signalStatistics = (
  parsed:
    ParsedGoogleTrendsInterestOverTime,
) => {
  const values =
    parsed.rows.flatMap(
      (row) =>
        row.values.map(
          (value) =>
            value.relative_interest,
        ),
    );
  const nonMissing =
    values.filter(
      (value) =>
        value !== null,
    );
  const nonZero =
    nonMissing.filter(
      (value) =>
        value > 0,
    );
  const queriesWithSignal =
    parsed.series.filter(
      (series) =>
        parsed.rows.some(
          (row) =>
            row.values.some(
              (value) =>
                value.query ===
                  series.query &&
                value.relative_interest !==
                  null &&
                value.relative_interest >
                  0,
            ),
        ),
    ).length;

  return {
    total_value_cells:
      values.length,
    non_missing_cells:
      nonMissing.length,
    non_zero_cells:
      nonZero.length,
    queries_with_any_signal:
      queriesWithSignal,
    queries_total:
      parsed.series.length,
    all_values_are_zero:
      values.length > 0 &&
      nonMissing.length ===
        values.length &&
      nonZero.length === 0,
    has_no_positive_signal:
      nonZero.length === 0,
  };
};

const createParseFailureDecision = (
  baseFindings:
    ValidationFinding[],
  error:
    GoogleTrendsCsvParseError,
): CollectionValidationDecision => {
  const findings = [
    ...baseFindings,
    finding(
      'GEN_PARSEABLE',
      false,
      error.message,
      'parseable Google Trends Interest Over Time CSV',
      error.check_id,
    ),
  ];

  if (
    error.check_id !==
    'GEN_PARSEABLE'
  ) {
    findings.push(
      finding(
        error.check_id,
        false,
        error.message,
        error.expected,
        error.actual,
      ),
    );
  }

  return decision(
    'INVALID_SCHEMA',
    findings,
  );
};

export const validateGoogleTrendsInterestOverTimeCsv = (
  input:
    GoogleTrendsInterestOverTimeValidationInput,
): CollectionValidationDecision => {
  const findings:
    ValidationFinding[] = [];

  const effectiveText =
    decodeForSignature(
      input.bytes,
    ).trim();

  if (
    input.bytes.length === 0 ||
    effectiveText.length === 0
  ) {
    findings.push(
      finding(
        'GEN_NON_EMPTY_FILE',
        false,
        'Candidate artifact is empty or effectively empty.',
        'non-empty provider CSV',
        input.bytes.length,
      ),
    );

    return decision(
      'INVALID_SCHEMA',
      findings,
    );
  }

  findings.push(
    finding(
      'GEN_NON_EMPTY_FILE',
      true,
      'Candidate artifact contains provider bytes.',
      'non-empty provider CSV',
      input.bytes.length,
    ),
  );

  if (
    looksLikeHtml(
      input.bytes,
    )
  ) {
    findings.push(
      finding(
        'GEN_HTML_DETECTION',
        false,
        'Candidate resembles an HTML page rather than a Google Trends CSV export.',
        'CSV data',
        'HTML signature detected',
      ),
    );

    return decision(
      'ERROR_NOT_DATA',
      findings,
    );
  }

  findings.push(
    finding(
      'GEN_HTML_DETECTION',
      true,
      'No strong HTML document signature was detected.',
      'no HTML document signature',
      'none detected',
    ),
  );

  let parsed:
    ParsedGoogleTrendsInterestOverTime;

  try {
    parsed =
      parseGoogleTrendsInterestOverTimeCsv(
        input.bytes,
      );
  } catch (error: unknown) {
    if (
      error instanceof
      GoogleTrendsCsvParseError
    ) {
      return createParseFailureDecision(
        findings,
        error,
      );
    }

    throw error;
  }

  const validatedMetadata:
    NonNullable<
      CollectionValidationDecision['validated_metadata']
    > = {
      actual_date_start:
        parsed.rows[0]
          .period_start,
      actual_date_end:
        parsed.rows[
          parsed.rows.length - 1
        ].period_start,
      country_name:
        null,
    };

  findings.push(
    finding(
      'GEN_PARSEABLE',
      true,
      'Candidate parsed as the observed Google Trends Interest Over Time CSV shape.',
      'parseable Google Trends CSV',
      'parsed',
    ),
    finding(
      'GEN_REQUIRED_COLUMNS',
      true,
      'Observed CSV contains a supported temporal dimension and query-series columns.',
      'Day or Week plus query-series columns',
      [
        parsed.temporal_dimension,
        ...parsed.series.map(
          (series) =>
            series.provider_header,
        ),
      ],
    ),
    finding(
      'GT_DATASET_TYPE',
      true,
      'Observed provider structure matches Interest Over Time.',
      'INTEREST_OVER_TIME',
      `${parsed.temporal_dimension} time series`,
    ),
    finding(
      'GT_TEMPORAL_DIMENSION',
      true,
      `Observed temporal dimension is ${parsed.temporal_dimension}.`,
      'Day or Week',
      parsed.temporal_dimension,
    ),
    finding(
      'GT_RELATIVE_INTEREST_PARSE',
      true,
      'Relative-interest cells parsed as integers or preserved missing values.',
      'integer or null',
      'parsed without coercing missing values to zero',
    ),
  );

  const signal =
    signalStatistics(
      parsed,
    );

  findings.push(
    signal.all_values_are_zero
      ? warningFinding(
          'GT_ALL_ZERO',
          'Every parsed relative-interest cell is zero; the structurally valid artifact is retained with a visible low-data warning.',
          'at least one positive relative-interest cell',
          signal,
        )
      : finding(
          'GT_ALL_ZERO',
          true,
          'The dataset is not an all-zero time series.',
          'not all relative-interest cells equal zero',
          signal,
        ),
    signal.has_no_positive_signal
      ? warningFinding(
          'GT_SIGNAL_DENSITY',
          'No positive relative-interest signal was observed; no percentage threshold or search-volume meaning was inferred.',
          'at least one source-observed positive relative-interest value',
          signal,
        )
      : finding(
          'GT_SIGNAL_DENSITY',
          true,
          'At least one source-observed positive relative-interest value is present.',
          'positive source signal present',
          signal,
        ),
  );

  const actualQueries =
    parsed.series.map(
      (series) =>
        series.query,
    );

  const queriesMatch =
    sameStringMultiset(
      input.expected_queries,
      actualQueries,
    );

  findings.push(
    finding(
      'GT_EXPECTED_QUERIES',
      queriesMatch,
      queriesMatch
        ? 'Returned query identities match the requested comparison group; provider column order is not assumed.'
        : 'Returned query identities do not match the requested comparison group.',
      [...input.expected_queries],
      actualQueries,
    ),
  );

  let schemaMismatch = false;

  if (
    input.expected_category_label !==
    undefined
  ) {
    const categoryMatches =
      parsed.category_label ===
      input.expected_category_label;

    schemaMismatch ||= !categoryMatches;

    findings.push(
      finding(
        'GT_CATEGORY',
        categoryMatches,
        categoryMatches
          ? 'Provider category preamble matches the expected observed label.'
          : 'Provider category preamble does not match the expected observed label.',
        input.expected_category_label,
        parsed.category_label,
      ),
    );
  }

  if (
    input.expected_geography_label !==
    undefined
  ) {
    const geographyLabels =
      uniqueStrings(
        parsed.series.map(
          (series) =>
            series.geography_label,
        ),
      );

    const geographyMatches =
      geographyLabels.length === 1 &&
      geographyLabels[0] ===
        input.expected_geography_label;

    schemaMismatch ||=
      !geographyMatches;

    findings.push(
      finding(
        'GT_GEOGRAPHY',
        geographyMatches,
        geographyMatches
          ? 'Provider series headers expose the expected observed geography label.'
          : 'Provider series headers do not expose one consistent expected geography label.',
        input.expected_geography_label,
        geographyLabels,
      ),
    );
  }

  const duplicatePeriods =
    hasDuplicatePeriods(
      parsed,
    );

  schemaMismatch ||=
    duplicatePeriods;

  findings.push(
    finding(
      'GT_DUPLICATE_PERIODS',
      !duplicatePeriods,
      duplicatePeriods
        ? 'Duplicate temporal periods were found.'
        : 'Temporal period keys are unique.',
      'unique temporal periods',
      duplicatePeriods
        ? 'duplicates detected'
        : 'unique',
    ),
  );

  const rangeValid =
    relativeInterestRangeIsValid(
      parsed,
    );

  schemaMismatch ||=
    !rangeValid;

  findings.push(
    finding(
      'GT_RELATIVE_INTEREST_RANGE',
      rangeValid,
      rangeValid
        ? 'Relative-interest values stay within the observed 0-100 Google Trends scale; missing remains null.'
        : 'One or more relative-interest values fall outside the 0-100 Google Trends scale.',
      'integer 0-100 or null',
      rangeValid
        ? 'within range'
        : 'out-of-range value detected',
    ),
  );

  const coverageMatches =
    dateCoverageMatches(
      parsed,
      input.requested_date_start,
      input.requested_date_end,
    );

  const actualFirst =
    parsed.rows[0]
      .period_start;

  const actualLast =
    parsed.rows[
      parsed.rows.length - 1
    ].period_start;

  findings.push(
    finding(
      'GT_DATE_COVERAGE',
      coverageMatches,
      coverageMatches
        ? (
            parsed.temporal_dimension ===
              'Day'
              ? 'Daily source buckets exactly cover the requested inclusive date range.'
              : 'Weekly source buckets cover the requested range using the observed Sunday bucket boundary behavior.'
          )
        : (
            parsed.temporal_dimension ===
              'Day'
              ? 'Daily source bucket coverage does not match the requested inclusive date range.'
              : 'Weekly source bucket coverage does not match the requested range.'
          ),
      {
        requested_start:
          input.requested_date_start,
        requested_end:
          input.requested_date_end,
        expected_first_bucket:
          expectedFirstBucket(
            parsed,
            input.requested_date_start,
          ),
        expected_last_bucket:
          expectedLastBucket(
            parsed,
            input.requested_date_end,
          ),
        cadence_days:
          parsed.temporal_dimension ===
            'Day'
            ? 1
            : 7,
      },
      {
        actual_first_bucket:
          actualFirst,
        actual_last_bucket:
          actualLast,
        cadence_is_daily:
          hasDailyCadence(
            parsed,
          ),
        cadence_is_weekly:
          hasWeeklyCadence(
            parsed,
          ),
      },
    ),
  );

  if (schemaMismatch) {
    return decision(
      'INVALID_SCHEMA',
      findings,
      validatedMetadata,
    );
  }

  if (!queriesMatch) {
    return decision(
      'QUERY_MISMATCH',
      findings,
      validatedMetadata,
    );
  }

  if (!coverageMatches) {
    return decision(
      'DATE_MISMATCH',
      findings,
      validatedMetadata,
    );
  }

  if (
    signal.has_no_positive_signal
  ) {
    return decision(
      'LOW_DATA',
      findings,
      validatedMetadata,
    );
  }

  return decision(
    'VALID',
    findings,
    validatedMetadata,
  );
};
