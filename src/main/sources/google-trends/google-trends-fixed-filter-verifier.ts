import type {
  ManagedBrowserLocator,
  ManagedBrowserPage,
} from '../../browser/browser-manager';

const CATEGORY_PICKER_SELECTOR =
  'hierarchy-picker[track-name="CategoryPicker"]';

const SEARCH_PROPERTY_PICKER_SELECTOR =
  'md-select[track*="Search property picker"]';

const SELECT_VALUE_SELECTOR =
  'md-select-value';

const EXPECTED_CATEGORY_LABEL =
  'All categories';

const EXPECTED_SEARCH_PROPERTY_LABEL =
  'Web Search';

const DEFAULT_UI_READ_TIMEOUT_MS =
  10_000;

export const GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS = {
  CATEGORY_PICKER:
    'CATEGORY_PICKER',
  CATEGORY_PICKER_BUTTON:
    'CATEGORY_PICKER_BUTTON',
  CATEGORY_LABEL:
    'CATEGORY_LABEL',
  SEARCH_PROPERTY_PICKER:
    'SEARCH_PROPERTY_PICKER',
  SEARCH_PROPERTY_SELECTED_VALUE:
    'SEARCH_PROPERTY_SELECTED_VALUE',
  SEARCH_PROPERTY_LABEL:
    'SEARCH_PROPERTY_LABEL',
} as const;

export type GoogleTrendsFixedFilterDiagnosticControl =
  (typeof GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS)[
    keyof typeof GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
  ];

export interface GoogleTrendsFixedFilterDiagnosticContext {
  control:
    GoogleTrendsFixedFilterDiagnosticControl;
  observed_count: number;
}

export class GoogleTrendsFixedFilterContractError
  extends Error
{
  readonly diagnostic_context:
    GoogleTrendsFixedFilterDiagnosticContext | null;

  constructor(
    message: string,
    diagnosticContext:
      GoogleTrendsFixedFilterDiagnosticContext | null =
      null,
  ) {
    super(message);
    this.name =
      'GoogleTrendsFixedFilterContractError';
    this.diagnostic_context =
      diagnosticContext;
  }
}

export interface VerifyGoogleTrendsFixedFiltersInput {
  page: ManagedBrowserPage;
  ui_read_timeout_ms?: number;
}

const requirePositiveTimeout = (
  value: number | undefined,
): number => {
  if (value === undefined) {
    return DEFAULT_UI_READ_TIMEOUT_MS;
  }

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new GoogleTrendsFixedFilterContractError(
      'ui_read_timeout_ms must be a positive integer.',
    );
  }

  return value;
};

const requireExactlyOne = async (
  locator: ManagedBrowserLocator,
  description: string,
  control:
    GoogleTrendsFixedFilterDiagnosticControl,
): Promise<void> => {
  const count =
    await locator.count();

  if (count !== 1) {
    throw new GoogleTrendsFixedFilterContractError(
      `Expected exactly one ${description}; found ${count}.`,
      {
        control,
        observed_count:
          count,
      },
    );
  }
};

const waitForExactlyOne = async (
  locator: ManagedBrowserLocator,
  description: string,
  timeout: number,
  control:
    GoogleTrendsFixedFilterDiagnosticControl,
): Promise<void> => {
  const initialCount =
    await locator.count();

  if (initialCount > 1) {
    throw new GoogleTrendsFixedFilterContractError(
      `Expected at most one ${description} while waiting for it to become available; found ${initialCount}.`,
      {
        control,
        observed_count:
          initialCount,
      },
    );
  }

  if (initialCount === 0) {
    try {
      await locator.innerText({
        timeout,
      });
    } catch {
      const finalCount =
        await locator.count();

      throw new GoogleTrendsFixedFilterContractError(
        `Fixed-filter readiness failed with ${finalCount} matching controls.`,
        {
          control,
          observed_count:
            finalCount,
        },
      );
    }
  }

  await requireExactlyOne(
    locator,
    description,
    control,
  );
};

const readNormalizedText = async (
  locator: ManagedBrowserLocator,
  timeout: number,
  control:
    GoogleTrendsFixedFilterDiagnosticControl,
): Promise<string> => {
  try {
    return (
      await locator.innerText({
        timeout,
      })
    )
      .replace(
        /\s+/gu,
        ' ',
      )
      .trim();
  } catch {
    const finalCount =
      await locator.count();

    throw new GoogleTrendsFixedFilterContractError(
      `Fixed-filter label read failed with ${finalCount} matching controls.`,
      {
        control,
        observed_count:
          finalCount,
      },
    );
  }
};

/**
 * Verifies the two fixed Google Trends MVP filters before export:
 *
 * - Category: All categories
 * - Search property: Web Search
 *
 * DOM evidence from the classic Explore UI:
 *
 * - Category uses hierarchy-picker[track-name="CategoryPicker"]
 * - Search property uses an md-select tracked as "Search property picker"
 *
 * This slice is intentionally verification-only. The first collector
 * vertical slice must never silently export a non-MVP category/property.
 * If either fixed value is not already applied, collection fails closed
 * instead of guessing an unverified mutation path.
 */
export const verifyGoogleTrendsFixedFilters =
  async (
    input:
      VerifyGoogleTrendsFixedFiltersInput,
  ): Promise<void> => {
    const timeout =
      requirePositiveTimeout(
        input.ui_read_timeout_ms,
      );

    const categoryPicker =
      input.page.locator(
        CATEGORY_PICKER_SELECTOR,
      );

    await waitForExactlyOne(
      categoryPicker,
      'Google Trends category picker',
      timeout,
      GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
        .CATEGORY_PICKER,
    );

    const categoryButton =
      categoryPicker.getByRole(
        'button',
      );

    await waitForExactlyOne(
      categoryButton,
      'category picker button',
      timeout,
      GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
        .CATEGORY_PICKER_BUTTON,
    );

    const categoryLabel =
      await readNormalizedText(
        categoryButton,
        timeout,
        GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
          .CATEGORY_LABEL,
      );

    if (
      categoryLabel !==
      EXPECTED_CATEGORY_LABEL
    ) {
      throw new GoogleTrendsFixedFilterContractError(
        `Expected Google Trends category "${EXPECTED_CATEGORY_LABEL}"; found "${categoryLabel}".`,
        {
          control:
            GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
              .CATEGORY_LABEL,
          observed_count:
            0,
        },
      );
    }

    const searchPropertyPicker =
      input.page.locator(
        SEARCH_PROPERTY_PICKER_SELECTOR,
      );

    await waitForExactlyOne(
      searchPropertyPicker,
      'Google Trends search-property picker',
      timeout,
      GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
        .SEARCH_PROPERTY_PICKER,
    );

    const selectedValue =
      searchPropertyPicker.locator(
        SELECT_VALUE_SELECTOR,
      );

    await waitForExactlyOne(
      selectedValue,
      'search-property selected value',
      timeout,
      GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
        .SEARCH_PROPERTY_SELECTED_VALUE,
    );

    const searchPropertyLabel =
      await readNormalizedText(
        selectedValue,
        timeout,
        GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
          .SEARCH_PROPERTY_LABEL,
      );

    if (
      searchPropertyLabel !==
      EXPECTED_SEARCH_PROPERTY_LABEL
    ) {
      throw new GoogleTrendsFixedFilterContractError(
        `Expected Google Trends search property "${EXPECTED_SEARCH_PROPERTY_LABEL}"; found "${searchPropertyLabel}".`,
        {
          control:
            GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
              .SEARCH_PROPERTY_LABEL,
          observed_count:
            0,
        },
      );
    }
  };
