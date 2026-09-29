export type DesktopDatePolicy =
  | 'TODAY_MINUS_17_TO_YESTERDAY'
  | 'TODAY_MINUS_28_TO_YESTERDAY'
  | 'TODAY_MINUS_56_TO_TODAY_MINUS_29'
  | 'TODAY_MINUS_90_TO_YESTERDAY'
  | 'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY'
  | 'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY';

export interface DesktopResolvedDateRange {
  reference_date: string;
  date_policy: DesktopDatePolicy;
  requested_date_start: string;
  requested_date_end: string;
}

const DATE_ONLY_PATTERN =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

const parseDateOnly = (
  value: string,
): Date => {
  const match =
    DATE_ONLY_PATTERN.exec(value);

  if (match === null) {
    throw new Error(
      'reference_date must use YYYY-MM-DD.',
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(
      'reference_date must be a valid calendar date.',
    );
  }

  return date;
};

const formatDateOnly = (
  value: Date,
): string => {
  const year =
    value.getUTCFullYear();
  const month =
    String(value.getUTCMonth() + 1)
      .padStart(2, '0');
  const day =
    String(value.getUTCDate())
      .padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const addCalendarDays = (
  value: Date,
  days: number,
): Date => {
  const result = new Date(value);
  result.setUTCDate(
    result.getUTCDate() + days,
  );
  return result;
};

const subtractCalendarMonthsClamped = (
  value: Date,
  months: number,
): Date => {
  const targetMonthStart =
    new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth() - months,
        1,
      ),
    );

  const targetYear =
    targetMonthStart.getUTCFullYear();

  const targetMonth =
    targetMonthStart.getUTCMonth();

  const lastDayOfTargetMonth =
    new Date(
      Date.UTC(
        targetYear,
        targetMonth + 1,
        0,
      ),
    ).getUTCDate();

  const targetDay =
    Math.min(
      value.getUTCDate(),
      lastDayOfTargetMonth,
    );

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
    ),
  );
};

export const formatLocalReferenceDate = (
  now: Date,
): string => {
  if (
    Number.isNaN(
      now.getTime(),
    )
  ) {
    throw new Error(
      'Reference clock must be a valid Date.',
    );
  }

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1,
    ).padStart(
      2,
      '0',
    );

  const day =
    String(
      now.getDate(),
    ).padStart(
      2,
      '0',
    );

  return `${year}-${month}-${day}`;
};

export const resolveDesktopDatePolicy = (
  policy: DesktopDatePolicy,
  referenceDate: string,
): DesktopResolvedDateRange => {
  const reference =
    parseDateOnly(referenceDate);

  if (
    policy
    === 'TODAY_MINUS_56_TO_TODAY_MINUS_29'
  ) {
    return {
      reference_date:
        referenceDate,
      date_policy:
        policy,
      requested_date_start:
        formatDateOnly(
          addCalendarDays(
            reference,
            -56,
          ),
        ),
      requested_date_end:
        formatDateOnly(
          addCalendarDays(
            reference,
            -29,
          ),
        ),
    };
  }

  if (
    policy
    === 'TODAY_MINUS_90_TO_YESTERDAY'
    || policy === 'TODAY_MINUS_28_TO_YESTERDAY'
    || policy === 'TODAY_MINUS_17_TO_YESTERDAY'
  ) {
    return {
      reference_date:
        referenceDate,
      date_policy:
        policy,
      requested_date_start:
        formatDateOnly(
          addCalendarDays(
            reference,
            policy === 'TODAY_MINUS_17_TO_YESTERDAY'
              ? -17
              : policy === 'TODAY_MINUS_28_TO_YESTERDAY'
                ? -28
                : -90,
          ),
        ),
      requested_date_end:
        formatDateOnly(
          addCalendarDays(
            reference,
            -1,
          ),
        ),
    };
  }

  if (
    policy
    === 'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY'
  ) {
    return {
      reference_date:
        referenceDate,
      date_policy:
        policy,
      requested_date_start:
        formatDateOnly(
          subtractCalendarMonthsClamped(
            reference,
            16,
          ),
        ),
      requested_date_end:
        formatDateOnly(
          addCalendarDays(
            reference,
            -1,
          ),
        ),
    };
  }

  if (
    policy
    === 'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY'
  ) {
    return {
      reference_date:
        referenceDate,
      date_policy:
        policy,
      requested_date_start:
        formatDateOnly(
          subtractCalendarMonthsClamped(
            reference,
            24,
          ),
        ),
      requested_date_end:
        formatDateOnly(
          addCalendarDays(
            reference,
            -1,
          ),
        ),
    };
  }

  throw new Error(
    'Unsupported desktop date policy: '
    + policy,
  );
};
