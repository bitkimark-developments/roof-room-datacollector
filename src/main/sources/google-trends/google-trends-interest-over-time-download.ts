import type {
  ManagedBrowserLocator,
  ManagedBrowserPage,
} from '../../browser/browser-manager';
import {
  captureBrowserDownload,
  type CapturedBrowserDownload,
} from '../../browser/browser-download-capture';

const INTEREST_OVER_TIME_HEADING =
  'Interest over time';

const DOWNLOAD_ACCESSIBLE_NAME =
  'file_download';

const DEFAULT_UI_ACTION_TIMEOUT_MS =
  30_000;

export const GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS = {
  INTEREST_OVER_TIME_HEADING:
    'INTEREST_OVER_TIME_HEADING',
  DOWNLOAD_BUTTON:
    'DOWNLOAD_BUTTON',
} as const;

export type GoogleTrendsDownloadDiagnosticControl =
  (typeof GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS)[
    keyof typeof GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS
  ];

export interface GoogleTrendsDownloadDiagnosticContext {
  control:
    GoogleTrendsDownloadDiagnosticControl;
  observed_count: number;
}

export class GoogleTrendsUiContractError
  extends Error
{
  readonly diagnostic_context:
    GoogleTrendsDownloadDiagnosticContext | null;

  constructor(
    message: string,
    diagnosticContext:
      GoogleTrendsDownloadDiagnosticContext | null =
      null,
  ) {
    super(message);
    this.name =
      'GoogleTrendsUiContractError';
    this.diagnostic_context =
      diagnosticContext;
  }
}

export interface DownloadGoogleTrendsInterestOverTimeInput {
  page: ManagedBrowserPage;
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
  control:
    GoogleTrendsDownloadDiagnosticControl,
): Promise<void> => {
  const count =
    await locator.count();

  if (count !== 1) {
    throw new GoogleTrendsUiContractError(
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
    GoogleTrendsDownloadDiagnosticControl,
): Promise<void> => {
  const initialCount =
    await locator.count();

  if (initialCount > 1) {
    throw new GoogleTrendsUiContractError(
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

      throw new GoogleTrendsUiContractError(
        `Download control readiness failed with ${finalCount} matching controls.`,
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
  ): Promise<CapturedBrowserDownload> => {
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

    await waitForExactlyOne(
      heading,
      '"Interest over time" heading',
      uiActionTimeout,
      GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS
        .INTEREST_OVER_TIME_HEADING,
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

    await waitForExactlyOne(
      downloadButton,
      '"Interest over time" download button',
      uiActionTimeout,
      GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS
        .DOWNLOAD_BUTTON,
    );

    return captureBrowserDownload({
      page:
        input.page,
      trigger_download:
        () =>
          downloadButton.click({
            timeout:
              uiActionTimeout,
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
