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

export class GoogleTrendsFixedFilterContractError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsFixedFilterContractError';
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
): Promise<void> => {
  const count =
    await locator.count();

  if (count !== 1) {
    throw new GoogleTrendsFixedFilterContractError(
      `Expected exactly one ${description}; found ${count}.`,
    );
  }
};

const readNormalizedText = async (
  locator: ManagedBrowserLocator,
  timeout: number,
): Promise<string> =>
  (
    await locator.innerText({
      timeout,
    })
  )
    .replace(
      /\s+/gu,
      ' ',
    )
    .trim();

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

    await requireExactlyOne(
      categoryPicker,
      'Google Trends category picker',
    );

    const categoryButton =
      categoryPicker.getByRole(
        'button',
      );

    await requireExactlyOne(
      categoryButton,
      'category picker button',
    );

    const categoryLabel =
      await readNormalizedText(
        categoryButton,
        timeout,
      );

    if (
      categoryLabel !==
      EXPECTED_CATEGORY_LABEL
    ) {
      throw new GoogleTrendsFixedFilterContractError(
        `Expected Google Trends category "${EXPECTED_CATEGORY_LABEL}"; found "${categoryLabel}".`,
      );
    }

    const searchPropertyPicker =
      input.page.locator(
        SEARCH_PROPERTY_PICKER_SELECTOR,
      );

    await requireExactlyOne(
      searchPropertyPicker,
      'Google Trends search-property picker',
    );

    const selectedValue =
      searchPropertyPicker.locator(
        SELECT_VALUE_SELECTOR,
      );

    await requireExactlyOne(
      selectedValue,
      'search-property selected value',
    );

    const searchPropertyLabel =
      await readNormalizedText(
        selectedValue,
        timeout,
      );

    if (
      searchPropertyLabel !==
      EXPECTED_SEARCH_PROPERTY_LABEL
    ) {
      throw new GoogleTrendsFixedFilterContractError(
        `Expected Google Trends search property "${EXPECTED_SEARCH_PROPERTY_LABEL}"; found "${searchPropertyLabel}".`,
      );
    }
  };
