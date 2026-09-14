export type DesktopDatePolicy =
  | 'TODAY_MINUS_90_TO_YESTERDAY';

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
    policy !==
    'TODAY_MINUS_90_TO_YESTERDAY'
  ) {
    throw new Error(
      `Unsupported desktop date policy: ${policy}`,
    );
  }

  return {
    reference_date: referenceDate,
    date_policy: policy,
    requested_date_start:
      formatDateOnly(
        addCalendarDays(reference, -90),
      ),
    requested_date_end:
      formatDateOnly(
        addCalendarDays(reference, -1),
      ),
  };
};
