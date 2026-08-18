import type {
  ManagedBrowserLocator,
  ManagedBrowserPage,
} from '../../browser/browser-manager';
import {
  captureAndPersistBrowserDownload,
  type BrowserDownloadStore,
} from '../../browser/browser-download-capture';
import type {
  PersistedPublicDownload,
} from '../../browser/persistent-download-store';

const GOOGLE_TRENDS_SOURCE_ID =
  'google-trends';

const INTEREST_OVER_TIME_HEADING =
  'Interest over time';

const DOWNLOAD_ACCESSIBLE_NAME =
  'file_download';

const DEFAULT_UI_ACTION_TIMEOUT_MS =
  10_000;

export class GoogleTrendsUiContractError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsUiContractError';
  }
}

export interface DownloadGoogleTrendsInterestOverTimeInput {
  page: ManagedBrowserPage;
  store: BrowserDownloadStore;
  preferred_filename?: string;
  download_timeout_ms?: number;
  ui_action_timeout_ms?: number;
}

const requirePositiveTimeout = (
  value: number | undefined,
  fallback: number,
  fieldName: string,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new GoogleTrendsUiContractError(
      `${fieldName} must be a positive integer.`,
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
    throw new GoogleTrendsUiContractError(
      `Expected exactly one ${description}; found ${count}.`,
    );
  }
};

/**
 * Downloads only the CSV export belonging to the Google Trends
 * "Interest over time" card.
 *
 * This selector contract was discovered against the live classic
 * Google Trends Explore UI on 2026-08-18:
 *
 *   getByText('Interest over time')
 *     .locator('..')
 *     .getByRole('button', { name: 'file_download' })
 *
 * The service deliberately does not use `.first()` or page-global
 * file_download selection because other cards expose their own
 * download buttons (for example Related queries).
 *
 * UI drift fails closed before a download is accepted.
 */
export const downloadGoogleTrendsInterestOverTime =
  async (
    input: DownloadGoogleTrendsInterestOverTimeInput,
  ): Promise<PersistedPublicDownload> => {
    const uiActionTimeout =
      requirePositiveTimeout(
        input.ui_action_timeout_ms,
        DEFAULT_UI_ACTION_TIMEOUT_MS,
        'ui_action_timeout_ms',
      );

    const heading =
      input.page.getByText(
        INTEREST_OVER_TIME_HEADING,
        {
          exact: true,
        },
      );

    await requireExactlyOne(
      heading,
      '"Interest over time" heading',
    );

    const cardHeader =
      heading.locator('..');

    const downloadButton =
      cardHeader.getByRole(
        'button',
        {
          name:
            DOWNLOAD_ACCESSIBLE_NAME,
        },
      );

    await requireExactlyOne(
      downloadButton,
      '"Interest over time" download button',
    );

    return captureAndPersistBrowserDownload({
      page:
        input.page,
      store:
        input.store,
      source_id:
        GOOGLE_TRENDS_SOURCE_ID,
      trigger_download:
        () =>
          downloadButton.click({
            timeout:
              uiActionTimeout,
          }),
      ...(input.preferred_filename ===
      undefined
        ? {}
        : {
            preferred_filename:
              input.preferred_filename,
          }),
      ...(input.download_timeout_ms ===
      undefined
        ? {}
        : {
            timeout_ms:
              input.download_timeout_ms,
          }),
    });
  };
