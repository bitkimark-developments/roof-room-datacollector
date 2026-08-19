import {
  GOOGLE_TRENDS_EXPLORE_URL,
} from './google-trends-provider-probe';

const GOOGLE_TRENDS_COMPARISON_LIMIT =
  5;

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/u;

export interface GoogleTrendsConfiguredExploreUrlInput {
  queries: readonly string[];
  requested_date_start: string;
  requested_date_end: string;
  country_code: string;
}

export interface GoogleTrendsConfiguredExploreUrlAssessment {
  parameter_keys: readonly string[];
  parameter_count: number;
  query_count: number;
  queries_match_exact_order: boolean;
  geography_matches: boolean;
  date_range_matches: boolean;
  origin_matches: boolean;
  path_matches: boolean;
  credentials_absent: boolean;
  fragment_absent: boolean;
}

export class GoogleTrendsConfiguredExploreUrlError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsConfiguredExploreUrlError';
  }
}

const requireDate = (
  value: string,
  fieldName: string,
): string => {
  const parsed =
    new Date(
      `${value}T00:00:00.000Z`,
    );

  if (
    !ISO_DATE_PATTERN.test(
      value,
    ) ||
    Number.isNaN(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(0, 10) !== value
  ) {
    throw new GoogleTrendsConfiguredExploreUrlError(
      `${fieldName} must be an ISO calendar date.`,
    );
  }

  return value;
};

const requireInput = (
  input:
    GoogleTrendsConfiguredExploreUrlInput,
): void => {
  if (
    input.queries.length < 1 ||
    input.queries.length >
      GOOGLE_TRENDS_COMPARISON_LIMIT
  ) {
    throw new GoogleTrendsConfiguredExploreUrlError(
      `Configured Explore URLs require between 1 and ${GOOGLE_TRENDS_COMPARISON_LIMIT} queries.`,
    );
  }

  for (const query of input.queries) {
    if (
      query.length === 0 ||
      query.trim() !== query ||
      query.includes(',')
    ) {
      throw new GoogleTrendsConfiguredExploreUrlError(
        'Configured Explore URL queries must be normalized, non-empty, and comma-free.',
      );
    }
  }

  requireDate(
    input.requested_date_start,
    'requested_date_start',
  );

  requireDate(
    input.requested_date_end,
    'requested_date_end',
  );

  if (
    input.requested_date_start >
    input.requested_date_end
  ) {
    throw new GoogleTrendsConfiguredExploreUrlError(
      'Configured Explore URL start date must not be after its end date.',
    );
  }

  if (
    !/^[A-Z]{2}$/u.test(
      input.country_code,
    )
  ) {
    throw new GoogleTrendsConfiguredExploreUrlError(
      'Configured Explore URL country_code must be a two-letter uppercase code.',
    );
  }
};

/**
 * Builds the normal Google Trends Explore deep link produced by the
 * provider UI itself. Browser-profile history contains an exact GT01
 * precedent with only date, geo, and q parameters.
 *
 * This is a UI navigation contract, not a private provider API endpoint.
 */
export const buildGoogleTrendsConfiguredExploreUrl = (
  input:
    GoogleTrendsConfiguredExploreUrlInput,
): string => {
  requireInput(
    input,
  );

  const url =
    new URL(
      GOOGLE_TRENDS_EXPLORE_URL,
    );

  url.searchParams.set(
    'date',
    `${input.requested_date_start} ${input.requested_date_end}`,
  );

  url.searchParams.set(
    'geo',
    input.country_code,
  );

  url.searchParams.set(
    'q',
    input.queries.join(','),
  );

  return url.toString();
};

export const assessGoogleTrendsConfiguredExploreUrl = (
  actualUrl: string,
  expected:
    GoogleTrendsConfiguredExploreUrlInput,
): GoogleTrendsConfiguredExploreUrlAssessment => {
  requireInput(
    expected,
  );

  let actual: URL;

  try {
    actual =
      new URL(
        actualUrl,
      );
  } catch {
    throw new GoogleTrendsConfiguredExploreUrlError(
      'Provider final URL is not a valid absolute URL.',
    );
  }

  const canonical =
    new URL(
      GOOGLE_TRENDS_EXPLORE_URL,
    );

  const actualQueries =
    actual.searchParams
      .get('q')
      ?.split(',') ?? [];

  const expectedDate =
    `${expected.requested_date_start} ${expected.requested_date_end}`;

  return {
    parameter_keys: [
      ...new Set(
        actual.searchParams.keys(),
      ),
    ].sort(),
    parameter_count:
      [
        ...actual.searchParams,
      ].length,
    query_count:
      actualQueries.length,
    queries_match_exact_order:
      actualQueries.length ===
        expected.queries.length &&
      actualQueries.every(
        (query, index) =>
          query ===
          expected.queries[index],
      ),
    geography_matches:
      actual.searchParams.get(
        'geo',
      ) === expected.country_code,
    date_range_matches:
      actual.searchParams.get(
        'date',
      ) === expectedDate,
    origin_matches:
      actual.origin ===
      canonical.origin,
    path_matches:
      actual.pathname ===
      canonical.pathname,
    credentials_absent:
      actual.username.length === 0 &&
      actual.password.length === 0,
    fragment_absent:
      actual.hash.length === 0,
  };
};

export const configuredExploreUrlAssessmentPasses = (
  assessment:
    GoogleTrendsConfiguredExploreUrlAssessment,
): boolean =>
  assessment.queries_match_exact_order &&
  assessment.geography_matches &&
  assessment.date_range_matches &&
  assessment.origin_matches &&
  assessment.path_matches &&
  assessment.credentials_absent &&
  assessment.fragment_absent &&
  assessment.parameter_count === 3 &&
  assessment.parameter_keys.length === 3 &&
  assessment.parameter_keys.every(
    (key, index) =>
      key ===
      [
        'date',
        'geo',
        'q',
      ][index],
  );
