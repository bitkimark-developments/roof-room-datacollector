import type {
  ManagedBrowserLocator,
  ManagedBrowserPage,
} from '../../browser/browser-manager';

const GEOGRAPHY_PICKER_SELECTOR =
  'hierarchy-picker[track-name="geoPicker"]';

const TURKEY_PROVIDER_LABEL =
  'Türkiye';

const DEFAULT_UI_ACTION_TIMEOUT_MS =
  10_000;

export const GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS = {
  GEOGRAPHY_PICKER:
    'GEOGRAPHY_PICKER',
  GEOGRAPHY_PICKER_BUTTON:
    'GEOGRAPHY_PICKER_BUTTON',
  GEOGRAPHY_SEARCH_INPUT:
    'GEOGRAPHY_SEARCH_INPUT',
  TURKEY_RESULT:
    'TURKEY_RESULT',
  APPLIED_GEOGRAPHY_LABEL:
    'APPLIED_GEOGRAPHY_LABEL',
} as const;

export type GoogleTrendsGeographyDiagnosticControl =
  (typeof GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS)[
    keyof typeof GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
  ];

export interface GoogleTrendsGeographyDiagnosticContext {
  control:
    GoogleTrendsGeographyDiagnosticControl;
  observed_count: number;
}

export class GoogleTrendsGeographyUiContractError
  extends Error
{
  readonly diagnostic_context:
    GoogleTrendsGeographyDiagnosticContext | null;

  constructor(
    message: string,
    diagnosticContext:
      GoogleTrendsGeographyDiagnosticContext | null =
      null,
  ) {
    super(message);
    this.name =
      'GoogleTrendsGeographyUiContractError';
    this.diagnostic_context =
      diagnosticContext;
  }
}

export interface ApplyGoogleTrendsTurkeyGeographyInput {
  page: ManagedBrowserPage;
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
    throw new GoogleTrendsGeographyUiContractError(
      'ui_action_timeout_ms must be a positive integer.',
    );
  }

  return value;
};

const requireExactlyOne = async (
  locator: ManagedBrowserLocator,
  description: string,
  control:
    GoogleTrendsGeographyDiagnosticControl,
): Promise<void> => {
  const count =
    await locator.count();

  if (count !== 1) {
    throw new GoogleTrendsGeographyUiContractError(
      `Expected exactly one ${description}; found ${count}.`,
      {
        control,
        observed_count:
          count,
      },
    );
  }
};

const readTrimmedText = async (
  locator: ManagedBrowserLocator,
  timeout: number,
  control:
    GoogleTrendsGeographyDiagnosticControl,
): Promise<string> => {
  try {
    return (
      await locator.innerText({
        timeout,
      })
    ).trim();
  } catch {
    const finalCount =
      await locator.count();

    throw new GoogleTrendsGeographyUiContractError(
      `Geography label read failed with ${finalCount} matching controls.`,
      {
        control,
        observed_count:
          finalCount,
      },
    );
  }
};

const runLocatorAction = async (
  locator: ManagedBrowserLocator,
  control:
    GoogleTrendsGeographyDiagnosticControl,
  action: () => Promise<void>,
): Promise<void> => {
  try {
    await action();
  } catch {
    const finalCount =
      await locator.count();

    throw new GoogleTrendsGeographyUiContractError(
      `Geography action failed with ${finalCount} matching controls.`,
      {
        control,
        observed_count:
          finalCount,
      },
    );
  }
};

/**
 * Applies the fixed Google Trends MVP geography: Türkiye.
 *
 * The provider DOM exposes two hierarchy-picker instances:
 * track-name="geoPicker" for geography and
 * track-name="CategoryPicker" for category.
 *
 * We scope to geoPicker explicitly, so no dynamic #input-* ID and no
 * provider result-count text ("There are N matches") participates in
 * selection.
 */
export const applyGoogleTrendsTurkeyGeography =
  async (
    input:
      ApplyGoogleTrendsTurkeyGeographyInput,
  ): Promise<void> => {
    const timeout =
      requirePositiveTimeout(
        input.ui_action_timeout_ms,
      );

    const geographyPicker =
      input.page.locator(
        GEOGRAPHY_PICKER_SELECTOR,
      );

    await requireExactlyOne(
      geographyPicker,
      'Google Trends geography picker',
      GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
        .GEOGRAPHY_PICKER,
    );

    const opener =
      geographyPicker.getByRole(
        'button',
      );

    await requireExactlyOne(
      opener,
      'geography picker button',
      GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
        .GEOGRAPHY_PICKER_BUTTON,
    );

    const currentLabel =
      await readTrimmedText(
        opener,
        timeout,
        GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
          .GEOGRAPHY_PICKER_BUTTON,
      );

    if (
      currentLabel ===
      TURKEY_PROVIDER_LABEL
    ) {
      return;
    }

    await runLocatorAction(
      opener,
      GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
        .GEOGRAPHY_PICKER_BUTTON,
      () =>
        opener.click({
          timeout,
        }),
    );

    const geographySearch =
      geographyPicker.getByRole(
        'searchbox',
      );

    await requireExactlyOne(
      geographySearch,
      'geography searchbox',
      GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
        .GEOGRAPHY_SEARCH_INPUT,
    );

    await runLocatorAction(
      geographySearch,
      GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
        .GEOGRAPHY_SEARCH_INPUT,
      () =>
        geographySearch.fill(
          TURKEY_PROVIDER_LABEL,
          {
            timeout,
          },
        ),
    );

    const turkeyResult =
      input.page.getByRole(
        'button',
        {
          name:
            TURKEY_PROVIDER_LABEL,
        },
      );

    await runLocatorAction(
      turkeyResult,
      GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
        .TURKEY_RESULT,
      () =>
        turkeyResult.click({
          timeout,
        }),
    );

    const appliedLabel =
      await readTrimmedText(
        opener,
        timeout,
        GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
          .APPLIED_GEOGRAPHY_LABEL,
      );

    if (
      appliedLabel !==
      TURKEY_PROVIDER_LABEL
    ) {
      throw new GoogleTrendsGeographyUiContractError(
        `Google Trends geography did not resolve to "${TURKEY_PROVIDER_LABEL}" after selection; found "${appliedLabel}".`,
        {
          control:
            GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
              .APPLIED_GEOGRAPHY_LABEL,
          observed_count:
            0,
        },
      );
    }
  };
