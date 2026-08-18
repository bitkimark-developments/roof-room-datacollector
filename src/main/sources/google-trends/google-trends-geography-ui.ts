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

export class GoogleTrendsGeographyUiContractError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsGeographyUiContractError';
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
): Promise<void> => {
  const count =
    await locator.count();

  if (count !== 1) {
    throw new GoogleTrendsGeographyUiContractError(
      `Expected exactly one ${description}; found ${count}.`,
    );
  }
};

const readTrimmedText = async (
  locator: ManagedBrowserLocator,
  timeout: number,
): Promise<string> =>
  (
    await locator.innerText({
      timeout,
    })
  ).trim();

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
    );

    const opener =
      geographyPicker.getByRole(
        'button',
      );

    await requireExactlyOne(
      opener,
      'geography picker button',
    );

    const currentLabel =
      await readTrimmedText(
        opener,
        timeout,
      );

    if (
      currentLabel ===
      TURKEY_PROVIDER_LABEL
    ) {
      return;
    }

    await opener.click({
      timeout,
    });

    const geographySearch =
      geographyPicker.getByRole(
        'searchbox',
      );

    await requireExactlyOne(
      geographySearch,
      'geography searchbox',
    );

    await geographySearch.fill(
      TURKEY_PROVIDER_LABEL,
      {
        timeout,
      },
    );

    const turkeyResult =
      input.page.getByRole(
        'button',
        {
          name:
            TURKEY_PROVIDER_LABEL,
        },
      );

    await turkeyResult.click({
      timeout,
    });

    const appliedLabel =
      await readTrimmedText(
        opener,
        timeout,
      );

    if (
      appliedLabel !==
      TURKEY_PROVIDER_LABEL
    ) {
      throw new GoogleTrendsGeographyUiContractError(
        `Google Trends geography did not resolve to "${TURKEY_PROVIDER_LABEL}" after selection; found "${appliedLabel}".`,
      );
    }
  };
