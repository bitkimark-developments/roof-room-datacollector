import type {
  ManagedBrowserLocator,
  ManagedBrowserPage,
} from '../../browser/browser-manager';

const ARCHIVE_DIALOG_LABEL =
  'ARCHIVE';

const START_DATE_SELECTOR =
  '.custom-date-picker-dialog-range-from input';

const END_DATE_SELECTOR =
  '.custom-date-picker-dialog-range-to input';

const DEFAULT_UI_ACTION_TIMEOUT_MS =
  10_000;

export class GoogleTrendsDateDialogContractError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsDateDialogContractError';
  }
}

export interface ApplyGoogleTrendsCustomDateFieldsInput {
  page: ManagedBrowserPage;
  requested_date_start: string;
  requested_date_end: string;
  ui_action_timeout_ms?: number;
}

const requirePositiveTimeout = (
  value: number | undefined,
): number => {
  if (value === undefined) {
    return DEFAULT_UI_ACTION_TIMEOUT_MS;
  }

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new GoogleTrendsDateDialogContractError(
      'ui_action_timeout_ms must be a positive integer.',
    );
  }

  return value;
};

const parseIsoDate = (
  value: string,
  fieldName: string,
): {
  year: number;
  month: number;
  day: number;
} => {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/u.exec(
      value,
    );

  if (!match) {
    throw new GoogleTrendsDateDialogContractError(
      `${fieldName} must use YYYY-MM-DD.`,
    );
  }

  const year =
    Number.parseInt(
      match[1],
      10,
    );

  const month =
    Number.parseInt(
      match[2],
      10,
    );

  const day =
    Number.parseInt(
      match[3],
      10,
    );

  const candidate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    candidate.getUTCFullYear() !==
      year ||
    candidate.getUTCMonth() !==
      month - 1 ||
    candidate.getUTCDate() !==
      day
  ) {
    throw new GoogleTrendsDateDialogContractError(
      `${fieldName} is not a valid calendar date.`,
    );
  }

  return {
    year,
    month,
    day,
  };
};

const formatGoogleTrendsDateInput = (
  value: string,
  fieldName: string,
): string => {
  const parsed =
    parseIsoDate(
      value,
      fieldName,
    );

  return (
    `${parsed.month}/${parsed.day}/${parsed.year}`
  );
};

const requireExactlyOne = async (
  locator: ManagedBrowserLocator,
  description: string,
): Promise<void> => {
  const count =
    await locator.count();

  if (count !== 1) {
    throw new GoogleTrendsDateDialogContractError(
      `Expected exactly one ${description}; found ${count}.`,
    );
  }
};

/**
 * Applies only the two date input fields inside the already-open
 * Google Trends classic "Custom time range" ARCHIVE dialog.
 *
 * Live selector evidence captured on 2026-08-18:
 *
 *   getByLabel('ARCHIVE')
 *     .locator('.custom-date-picker-dialog-range-from input')
 *
 *   getByLabel('ARCHIVE')
 *     .locator('.custom-date-picker-dialog-range-to input')
 *
 * Submitting the dialog is deliberately outside this slice until the
 * OK control is separately verified. Unknown/ambiguous UI fails closed.
 */
export const applyGoogleTrendsCustomDateFields =
  async (
    input: ApplyGoogleTrendsCustomDateFieldsInput,
  ): Promise<void> => {
    const timeout =
      requirePositiveTimeout(
        input.ui_action_timeout_ms,
      );

    const startDate =
      parseIsoDate(
        input.requested_date_start,
        'requested_date_start',
      );

    const endDate =
      parseIsoDate(
        input.requested_date_end,
        'requested_date_end',
      );

    const startEpoch =
      Date.UTC(
        startDate.year,
        startDate.month - 1,
        startDate.day,
      );

    const endEpoch =
      Date.UTC(
        endDate.year,
        endDate.month - 1,
        endDate.day,
      );

    if (startEpoch > endEpoch) {
      throw new GoogleTrendsDateDialogContractError(
        'requested_date_start must not be after requested_date_end.',
      );
    }

    const archiveDialog =
      input.page.getByLabel(
        ARCHIVE_DIALOG_LABEL,
        {
          exact: true,
        },
      );

    await requireExactlyOne(
      archiveDialog,
      '"ARCHIVE" custom-date dialog',
    );

    const startInput =
      archiveDialog.locator(
        START_DATE_SELECTOR,
      );

    const endInput =
      archiveDialog.locator(
        END_DATE_SELECTOR,
      );

    await requireExactlyOne(
      startInput,
      'custom-date From input',
    );

    await requireExactlyOne(
      endInput,
      'custom-date To input',
    );

    await startInput.fill(
      formatGoogleTrendsDateInput(
        input.requested_date_start,
        'requested_date_start',
      ),
      {
        timeout,
      },
    );

    await endInput.fill(
      formatGoogleTrendsDateInput(
        input.requested_date_end,
        'requested_date_end',
      ),
      {
        timeout,
      },
    );
  };
