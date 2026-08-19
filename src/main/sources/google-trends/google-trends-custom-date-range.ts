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

export const GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS = {
  DATE_FILTER:
    'DATE_FILTER',
  CUSTOM_TIME_RANGE_OPTION:
    'CUSTOM_TIME_RANGE_OPTION',
  OK_BUTTON:
    'OK_BUTTON',
} as const;

export type GoogleTrendsDateRangeDiagnosticControl =
  (typeof GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS)[
    keyof typeof GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
  ];

export interface GoogleTrendsDateRangeDiagnosticContext {
  control:
    GoogleTrendsDateRangeDiagnosticControl;
  observed_count: number;
}

export class GoogleTrendsDateRangeUiContractError
  extends Error
{
  readonly diagnostic_context:
    GoogleTrendsDateRangeDiagnosticContext | null;

  constructor(
    message: string,
    diagnosticContext:
      GoogleTrendsDateRangeDiagnosticContext | null =
      null,
  ) {
    super(message);
    this.name =
      'GoogleTrendsDateRangeUiContractError';
    this.diagnostic_context =
      diagnosticContext;
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
  control:
    GoogleTrendsDateRangeDiagnosticControl,
): Promise<void> => {
  const count =
    await locator.count();

  if (count !== 1) {
    throw new GoogleTrendsDateRangeUiContractError(
      `Expected exactly one ${description}; found ${count}.`,
      {
        control,
        observed_count:
          count,
      },
    );
  }
};

const runLocatorAction = async (
  locator: ManagedBrowserLocator,
  control:
    GoogleTrendsDateRangeDiagnosticControl,
  action: () => Promise<void>,
): Promise<void> => {
  try {
    await action();
  } catch {
    const finalCount =
      await locator.count();

    throw new GoogleTrendsDateRangeUiContractError(
      `Date-range action failed with ${finalCount} matching controls.`,
      {
        control,
        observed_count:
          finalCount,
      },
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
      GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
        .DATE_FILTER,
    );

    await runLocatorAction(
      dateFilter,
      GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
        .DATE_FILTER,
      () =>
        dateFilter.click({
          timeout,
        }),
    );

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
      GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
        .CUSTOM_TIME_RANGE_OPTION,
    );

    await runLocatorAction(
      customRangeOption,
      GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
        .CUSTOM_TIME_RANGE_OPTION,
      () =>
        customRangeOption.click({
          timeout,
        }),
    );

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
      GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
        .OK_BUTTON,
    );

    await runLocatorAction(
      okButton,
      GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
        .OK_BUTTON,
      () =>
        okButton.click({
          timeout,
        }),
    );
  };
