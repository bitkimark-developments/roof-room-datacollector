export const GOOGLE_TRENDS_PERIOD_PRESETS = [
  '1W',
  '1M',
  '6M',
  '12M',
  '24M',
] as const;

export type GoogleTrendsPeriodPreset =
  (typeof GOOGLE_TRENDS_PERIOD_PRESETS)[number];

export interface GoogleTrendsPeriodSelection {
  period_preset:
    GoogleTrendsPeriodPreset;
  reference_date:
    string;
}

export interface GoogleTrendsRequestedDateRange {
  requested_date_start:
    string;
  requested_date_end:
    string;
}

export interface GoogleTrendsCollectionStartRequest {
  query_group_ids:
    string[];
  period:
    GoogleTrendsPeriodSelection;
}

export const isGoogleTrendsPeriodPreset = (
  value: unknown,
): value is GoogleTrendsPeriodPreset =>
  typeof value === 'string' &&
  (
    GOOGLE_TRENDS_PERIOD_PRESETS as
      readonly string[]
  ).includes(
    value,
  );

const parseIsoCalendarDate = (
  value: unknown,
  fieldName: string,
): Date => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      `${fieldName} must use YYYY-MM-DD.`,
    );
  }

  const parsed =
    new Date(
      `${value}T00:00:00.000Z`,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(
        0,
        10,
      ) !== value
  ) {
    throw new Error(
      `${fieldName} must be a real calendar date.`,
    );
  }

  return parsed;
};

const formatIsoCalendarDate = (
  value: Date,
): string =>
  value
    .toISOString()
    .slice(
      0,
      10,
    );

const addUtcDays = (
  value: Date,
  days: number,
): Date => {
  const result =
    new Date(
      value.getTime(),
    );

  result.setUTCDate(
    result.getUTCDate() +
      days,
  );

  return result;
};

const shiftUtcMonths = (
  value: Date,
  months: number,
): Date => {
  const originalDay =
    value.getUTCDate();

  const result =
    new Date(
      value.getTime(),
    );

  result.setUTCDate(
    1,
  );
  result.setUTCMonth(
    result.getUTCMonth() +
      months,
  );

  const lastDay =
    new Date(
      result.getTime(),
    );

  lastDay.setUTCMonth(
    lastDay.getUTCMonth() +
      1,
  );
  lastDay.setUTCDate(
    0,
  );

  result.setUTCDate(
    Math.min(
      originalDay,
      lastDay.getUTCDate(),
    ),
  );

  return result;
};

const periodMonths = (
  preset:
    GoogleTrendsPeriodPreset,
): number | null => {
  switch (preset) {
    case '1W':
      return null;
    case '1M':
      return 1;
    case '6M':
      return 6;
    case '12M':
      return 12;
    case '24M':
      return 24;
  }
};

export const normalizeGoogleTrendsPeriodSelection = (
  value: unknown,
): GoogleTrendsPeriodSelection => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      'Google Trends period selection must be an object.',
    );
  }

  const candidate =
    value as Record<
      string,
      unknown
    >;

  if (
    !isGoogleTrendsPeriodPreset(
      candidate.period_preset,
    )
  ) {
    throw new Error(
      'Unsupported Google Trends period preset.',
    );
  }

  const referenceDate =
    parseIsoCalendarDate(
      candidate.reference_date,
      'reference_date',
    );

  return {
    period_preset:
      candidate.period_preset,
    reference_date:
      formatIsoCalendarDate(
        referenceDate,
      ),
  };
};

export const normalizeGoogleTrendsCollectionStartRequest = (
  value: unknown,
): GoogleTrendsCollectionStartRequest => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      'Google Trends collection start request must be an object.',
    );
  }

  const candidate =
    value as Record<
      string,
      unknown
    >;

  const queryGroupIds =
    candidate.query_group_ids;

  if (
    !Array.isArray(
      queryGroupIds,
    ) ||
    queryGroupIds.length < 1 ||
    !queryGroupIds.every(
      (groupId) =>
        typeof groupId ===
          'string' &&
        groupId.trim().length >
          0,
    ) ||
    new Set(
      queryGroupIds,
    ).size !==
      queryGroupIds.length
  ) {
    throw new Error(
      'Google Trends collection start requires one or more unique query group IDs.',
    );
  }

  return {
    query_group_ids: [
      ...queryGroupIds,
    ],
    period:
      normalizeGoogleTrendsPeriodSelection(
        candidate.period,
      ),
  };
};

export const deriveGoogleTrendsRequestedDateRange = (
  value: unknown,
): GoogleTrendsRequestedDateRange => {
  const selection =
    normalizeGoogleTrendsPeriodSelection(
      value,
    );

  const requestedEnd =
    parseIsoCalendarDate(
      selection.reference_date,
      'reference_date',
    );

  const exclusiveEnd =
    addUtcDays(
      requestedEnd,
      1,
    );

  const months =
    periodMonths(
      selection.period_preset,
    );

  const requestedStart =
    months === null
      ? addUtcDays(
          exclusiveEnd,
          -7,
        )
      : shiftUtcMonths(
          exclusiveEnd,
          -months,
        );

  return {
    requested_date_start:
      formatIsoCalendarDate(
        requestedStart,
      ),
    requested_date_end:
      formatIsoCalendarDate(
        requestedEnd,
      ),
  };
};
