import type {
  ManagedBrowserLocator,
  ManagedBrowserPage,
} from '../../browser/browser-manager';

import {
  applyGoogleTrendsCustomDateFields,
  validateGoogleTrendsRequestedDateRange,
} from './google-trends-custom-date-dialog';

const DATE_FILTER_SELECTOR =
  'custom-date-picker';

const CUSTOM_TIME_RANGE_OPTION =
  'Custom time range...';

const OK_BUTTON_NAME =
  'OK';

const DEFAULT_UI_ACTION_TIMEOUT_MS =
  10_000;

export class GoogleTrendsDateRangeUiContractError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsDateRangeUiContractError';
  }
}

export interface ApplyGoogleTrendsCustomDateRangeInput {
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
    throw new GoogleTrendsDateRangeUiContractError(
      'ui_action_timeout_ms must be a positive integer.',
    );
  }

  return value;
};

const requireExactlyOne = async (
  locator: ManagedBrowserLocator,
  description: string,
): Promise<void> => {
  const count =
    await locator.count();

  if (count !== 1) {
    throw new GoogleTrendsDateRangeUiContractError(
      `Expected exactly one ${description}; found ${count}.`,
    );
  }
};

export const applyGoogleTrendsCustomDateRange =
  async (
    input: ApplyGoogleTrendsCustomDateRangeInput,
  ): Promise<void> => {
    const timeout =
      requirePositiveTimeout(
        input.ui_action_timeout_ms,
      );

    validateGoogleTrendsRequestedDateRange(
      input.requested_date_start,
      input.requested_date_end,
    );

    const dateFilter =
      input.page.locator(
        DATE_FILTER_SELECTOR,
      );

    await requireExactlyOne(
      dateFilter,
      'Google Trends date filter',
    );

    await dateFilter.click({
      timeout,
    });

    const customRangeOption =
      input.page.getByRole(
        'option',
        {
          name:
            CUSTOM_TIME_RANGE_OPTION,
        },
      );

    await requireExactlyOne(
      customRangeOption,
      '"Custom time range..." option',
    );

    await customRangeOption.click({
      timeout,
    });

    await applyGoogleTrendsCustomDateFields({
      page:
        input.page,
      requested_date_start:
        input.requested_date_start,
      requested_date_end:
        input.requested_date_end,
      ui_action_timeout_ms:
        timeout,
    });

    const okButton =
      input.page.getByRole(
        'button',
        {
          name:
            OK_BUTTON_NAME,
        },
      );

    await requireExactlyOne(
      okButton,
      'custom-date OK button',
    );

    await okButton.click({
      timeout,
    });
  };
