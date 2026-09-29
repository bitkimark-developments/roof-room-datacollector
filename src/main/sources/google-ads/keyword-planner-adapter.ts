import type {
  KeywordPlannerRow,
} from '../../../shared/google-api';
import {
  requireApiObject,
  requireArray,
  type ApiRequester,
} from '../google-api/api-helpers';

const GOOGLE_ADS_TURKEY_GEO_TARGET =
  'geoTargetConstants/2792';

const GOOGLE_ADS_TURKISH_LANGUAGE =
  'languageConstants/1037';

const MONTH_NUMBER: Record<string, number> = {
  JANUARY: 1,
  FEBRUARY: 2,
  MARCH: 3,
  APRIL: 4,
  MAY: 5,
  JUNE: 6,
  JULY: 7,
  AUGUST: 8,
  SEPTEMBER: 9,
  OCTOBER: 10,
  NOVEMBER: 11,
  DECEMBER: 12,
};

const MONTH_NAME = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const;

const providerNumberOrNull = (
  value: unknown,
  field: string,
): number | null => {
  if (
    value === null
    || value === undefined
  ) {
    return null;
  }

  if (
    typeof value === 'number'
    && Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === 'string'
    && value.trim().length > 0
  ) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(
    `Keyword Planner ${field} must be numeric or null.`,
  );
};

const providerInteger = (
  value: unknown,
  field: string,
): number => {
  const parsed =
    providerNumberOrNull(
      value,
      field,
    );

  if (
    parsed === null
    || !Number.isInteger(parsed)
  ) {
    throw new Error(
      `Keyword Planner ${field} must be an integer.`,
    );
  }

  return parsed;
};

const providerMonth = (
  value: unknown,
): number => {
  if (
    typeof value !== 'string'
    || MONTH_NUMBER[value] === undefined
  ) {
    throw new Error(
      'Keyword Planner month must be a supported MonthOfYear value.',
    );
  }

  return MONTH_NUMBER[value];
};

const requireProviderText = (
  value: unknown,
  field: string,
): string => {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
  ) {
    throw new Error(
      `Keyword Planner ${field} must be a non-empty string.`,
    );
  }

  return value;
};

const readCloseVariants = (
  value: unknown,
): string[] => {
  if (
    value === null
    || value === undefined
  ) {
    return [];
  }

  return requireArray(
    value,
    'Keyword Planner closeVariants',
  ).map(
    (item, index) =>
      requireProviderText(
        item,
        `closeVariants[${String(index)}]`,
      ),
  );
};

const resolveRequestedKeyword = (
  returnedKeyword: string,
  closeVariants: string[],
  requestedKeywords: string[],
): string => {
  // Prefer explicit provider text when it is literally one of
  // the reviewed requested keywords.
  if (
    requestedKeywords.includes(
      returnedKeyword,
    )
  ) {
    return returnedKeyword;
  }

  const matchingRequested =
    requestedKeywords.filter(
      (keyword) =>
        closeVariants.includes(keyword),
    );

  if (matchingRequested.length === 1) {
    return matchingRequested[0];
  }

  throw new Error(
    'Keyword Planner returned keyword cannot be mapped unambiguously to reviewed requested keywords.',
  );
};

export const normalizeKeywordPlanner = (
  body: unknown,
  groupId: string,
  requestedKeywords: string[],
): KeywordPlannerRow[] => {
  const response =
    requireApiObject(
      body,
      'Keyword Planner response',
    );

  const results =
    requireArray(
      response.results,
      'Keyword Planner results',
    );

  return results.map(
    (entry, index) => {
      const row =
        requireApiObject(
          entry,
          `Keyword Planner results[${String(index)}]`,
        );

      const returnedKeyword =
        requireProviderText(
          row.text,
          `results[${String(index)}].text`,
        );

      const closeVariants =
        readCloseVariants(
          row.closeVariants,
        );

      const requestedKeyword =
        resolveRequestedKeyword(
          returnedKeyword,
          closeVariants,
          requestedKeywords,
        );

      const matchedRequestedKeywords =
        requestedKeywords.filter(
          (keyword) =>
            keyword === returnedKeyword
            || closeVariants.includes(keyword),
        );

      const metrics =
        row.keywordMetrics === null
        || row.keywordMetrics === undefined
          ? {}
          : requireApiObject(
            row.keywordMetrics,
            `Keyword Planner results[${String(index)}].keywordMetrics`,
          );

      const monthly =
        (
          metrics.monthlySearchVolumes === null
          || metrics.monthlySearchVolumes === undefined
            ? []
            : requireArray(
              metrics.monthlySearchVolumes,
              'Keyword Planner monthlySearchVolumes',
            )
        ).map(
          (value, monthlyIndex) => {
            const item =
              requireApiObject(
                value,
                `Keyword Planner monthlySearchVolumes[${String(monthlyIndex)}]`,
              );

            return {
              year:
                providerInteger(
                  item.year,
                  'monthlySearchVolumes.year',
                ),
              month:
                providerMonth(
                  item.month,
                ),
              searches:
                providerNumberOrNull(
                  item.monthlySearches,
                  'monthlySearchVolumes.monthlySearches',
                ),
            };
          },
        );

      const latestMonth =
        monthly.reduce<
          (typeof monthly)[number] | null
        >(
          (latest, item) => {
            if (latest === null) return item;

            const latestKey =
              latest.year * 12 + latest.month;
            const itemKey =
              item.year * 12 + item.month;

            return itemKey > latestKey
              ? item
              : latest;
          },
          null,
        );

      const threeMonthBaseline =
        latestMonth === null
          ? null
          : monthly.find(
              (item) =>
                item.year * 12 + item.month
                === latestMonth.year * 12
                  + latestMonth.month
                  - 2,
            ) ?? null;

      const change3Month =
        latestMonth?.searches === null
        || latestMonth?.searches === undefined
        || threeMonthBaseline?.searches === null
        || threeMonthBaseline?.searches === undefined
        || threeMonthBaseline?.searches === 0
          ? null
          : (
              (
                latestMonth.searches
                - threeMonthBaseline.searches
              )
              / threeMonthBaseline.searches
            ) * 100;

      const yoyBaseline =
        latestMonth === null
          ? null
          : monthly.find(
              (item) =>
                item.year === latestMonth.year - 1
                && item.month === latestMonth.month,
            ) ?? null;

      const changeYoy =
        latestMonth?.searches === null
        || latestMonth?.searches === undefined
        || yoyBaseline?.searches === null
        || yoyBaseline?.searches === undefined
        || yoyBaseline?.searches === 0
          ? null
          : (
              (
                latestMonth.searches
                - yoyBaseline.searches
              )
              / yoyBaseline.searches
            ) * 100;

      const bidLow =
        providerNumberOrNull(
          metrics.lowTopOfPageBidMicros,
          'lowTopOfPageBidMicros',
        );

      const bidHigh =
        providerNumberOrNull(
          metrics.highTopOfPageBidMicros,
          'highTopOfPageBidMicros',
        );

      return {
        requested_keyword:
          requestedKeyword,
        returned_keyword:
          returnedKeyword,
        close_variants:
          closeVariants,
        matched_requested_keywords:
          matchedRequestedKeywords,
        group_id:
          groupId,
        avg_monthly_searches:
          providerNumberOrNull(
            metrics.avgMonthlySearches,
            'avgMonthlySearches',
          ),
        competition:
          metrics.competition === null
          || metrics.competition === undefined
            ? null
            : requireProviderText(
              metrics.competition,
              'competition',
            ),
        competition_index:
          providerNumberOrNull(
            metrics.competitionIndex,
            'competitionIndex',
          ),
        top_of_page_bid_low:
          bidLow === null
            ? null
            : bidLow / 1_000_000,
        top_of_page_bid_high:
          bidHigh === null
            ? null
            : bidHigh / 1_000_000,
        change_3_month:
          change3Month,
        change_yoy:
          changeYoy,
        monthly_history:
          monthly,
      };
    },
  );
};

export interface KeywordPlannerApiRequest {
  customer_id: string;
  group_id: string;
  keywords: string[];
  requested_date_start: string;
  requested_date_end: string;
  country_code: 'TR';
  language_code: 'tr';
  keyword_plan_network: 'GOOGLE_SEARCH';
}

const yearMonthFromDate = (
  value: string,
  field: string,
): {
  year: number;
  month: typeof MONTH_NAME[number];
} => {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/u.exec(
      value,
    );

  if (!match) {
    throw new Error(
      `Keyword Planner ${field} must use YYYY-MM-DD.`,
    );
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  if (
    !Number.isInteger(year)
    || month < 1
    || month > 12
  ) {
    throw new Error(
      `Keyword Planner ${field} has an invalid year/month.`,
    );
  }

  return {
    year,
    month:
      MONTH_NAME[month - 1],
  };
};

export const requestKeywordPlannerRaw = async (
  request: KeywordPlannerApiRequest,
  requester: ApiRequester,
): Promise<{ raw: unknown }> => {
  if (
    request.country_code !== 'TR'
    || request.language_code !== 'tr'
    || request.keyword_plan_network !== 'GOOGLE_SEARCH'
  ) {
    throw new Error(
      'Keyword Planner API request scope is unsupported.',
    );
  }

  const start =
    yearMonthFromDate(
      request.requested_date_start,
      'requested_date_start',
    );

  const end =
    yearMonthFromDate(
      request.requested_date_end,
      'requested_date_end',
    );

  const response =
    await requester({
      url:
        `https://googleads.googleapis.com/v25/customers/${request.customer_id}:generateKeywordHistoricalMetrics`,
      method:
        'POST',
      body: {
        keywords:
          request.keywords,
        language:
          GOOGLE_ADS_TURKISH_LANGUAGE,
        geoTargetConstants: [
          GOOGLE_ADS_TURKEY_GEO_TARGET,
        ],
        keywordPlanNetwork:
          'GOOGLE_SEARCH',
        historicalMetricsOptions: {
          yearMonthRange: {
            start,
            end,
          },
        },
      },
    });

  if (
    response.status < 200
    || response.status >= 300
  ) {
    throw new Error(
      `Google Ads provider error HTTP ${response.status}.`,
    );
  }

  return {
    raw:
      response.body,
  };
};

// Keep the combined helper for deterministic adapter callers,
// but production collection preserves raw provider evidence first.
export const fetchKeywordPlanner = async (
  request: KeywordPlannerApiRequest,
  requester: ApiRequester,
): Promise<{
  raw: unknown;
  rows: KeywordPlannerRow[];
}> => {
  const result =
    await requestKeywordPlannerRaw(
      request,
      requester,
    );

  return {
    raw:
      result.raw,
    rows:
      normalizeKeywordPlanner(
        result.raw,
        request.group_id,
        request.keywords,
      ),
  };
};
