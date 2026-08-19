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

const DOWNLOAD_ACCESSIBLE_NAME_DOWNLOAD =
  'Download';

const DOWNLOAD_ACCESSIBLE_NAME_CSV =
  'CSV';

const TIMESERIES_WIDGET_SELECTOR =
  '[widget-name="TIMESERIES"]';

const EXPORT_CONTROL_SELECTOR =
  'button.widget-actions-item.export';

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

export const GOOGLE_TRENDS_DOWNLOAD_STRATEGY_IDS = {
  HEADING_PARENT_FILE_DOWNLOAD:
    'HEADING_PARENT_FILE_DOWNLOAD',
  TIMESERIES_FILE_DOWNLOAD:
    'TIMESERIES_FILE_DOWNLOAD',
  TIMESERIES_DOWNLOAD:
    'TIMESERIES_DOWNLOAD',
  TIMESERIES_CSV:
    'TIMESERIES_CSV',
  TIMESERIES_EXPORT_CONTROL:
    'TIMESERIES_EXPORT_CONTROL',
} as const;

export type GoogleTrendsDownloadStrategyId =
  (typeof GOOGLE_TRENDS_DOWNLOAD_STRATEGY_IDS)[
    keyof typeof GOOGLE_TRENDS_DOWNLOAD_STRATEGY_IDS
  ];

export interface GoogleTrendsDownloadStrategyAssessment {
  strategy_id:
    GoogleTrendsDownloadStrategyId;
  anchor_count: number;
  control_count: number;
  ready: boolean;
}

export interface GoogleTrendsDownloadReadiness {
  assessments:
    readonly GoogleTrendsDownloadStrategyAssessment[];
  successful_strategy_ids:
    readonly GoogleTrendsDownloadStrategyId[];
  selected_strategy_id:
    GoogleTrendsDownloadStrategyId | null;
}

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

interface GoogleTrendsDownloadStrategyCandidate {
  strategy_id:
    GoogleTrendsDownloadStrategyId;
  anchor:
    ManagedBrowserLocator;
  control:
    ManagedBrowserLocator;
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

const createStrategyCandidates = (
  page: ManagedBrowserPage,
): readonly GoogleTrendsDownloadStrategyCandidate[] => {
  const heading =
    page.getByText(
      INTEREST_OVER_TIME_HEADING,
      {
        exact: true,
      },
    );

  const headingParent =
    heading.locator('..');

  const timeseriesWidget =
    page.locator(
      TIMESERIES_WIDGET_SELECTOR,
    );

  return [
    {
      strategy_id:
        GOOGLE_TRENDS_DOWNLOAD_STRATEGY_IDS
          .TIMESERIES_FILE_DOWNLOAD,
      anchor:
        timeseriesWidget,
      control:
        timeseriesWidget.getByRole(
          'button',
          {
            name:
              DOWNLOAD_ACCESSIBLE_NAME,
          },
        ),
    },
    {
      strategy_id:
        GOOGLE_TRENDS_DOWNLOAD_STRATEGY_IDS
          .TIMESERIES_DOWNLOAD,
      anchor:
        timeseriesWidget,
      control:
        timeseriesWidget.getByRole(
          'button',
          {
            name:
              DOWNLOAD_ACCESSIBLE_NAME_DOWNLOAD,
          },
        ),
    },
    {
      strategy_id:
        GOOGLE_TRENDS_DOWNLOAD_STRATEGY_IDS
          .TIMESERIES_CSV,
      anchor:
        timeseriesWidget,
      control:
        timeseriesWidget.getByRole(
          'button',
          {
            name:
              DOWNLOAD_ACCESSIBLE_NAME_CSV,
          },
        ),
    },
    {
      strategy_id:
        GOOGLE_TRENDS_DOWNLOAD_STRATEGY_IDS
          .TIMESERIES_EXPORT_CONTROL,
      anchor:
        timeseriesWidget,
      control:
        timeseriesWidget.locator(
          EXPORT_CONTROL_SELECTOR,
        ),
    },
    {
      strategy_id:
        GOOGLE_TRENDS_DOWNLOAD_STRATEGY_IDS
          .HEADING_PARENT_FILE_DOWNLOAD,
      anchor:
        heading,
      control:
        headingParent.getByRole(
          'button',
          {
            name:
              DOWNLOAD_ACCESSIBLE_NAME,
          },
        ),
    },
  ];
};

const assessStrategyCandidates = async (
  candidates:
    readonly GoogleTrendsDownloadStrategyCandidate[],
): Promise<GoogleTrendsDownloadStrategyAssessment[]> =>
  Promise.all(
    candidates.map(
      async (candidate) => {
        const [
          anchorCount,
          controlCount,
        ] = await Promise.all([
          candidate.anchor.count(),
          candidate.control.count(),
        ]);

        return {
          strategy_id:
            candidate.strategy_id,
          anchor_count:
            anchorCount,
          control_count:
            controlCount,
          ready:
            anchorCount === 1 &&
            controlCount === 1,
        };
      },
    ),
  );

const readinessFromAssessments = (
  assessments:
    readonly GoogleTrendsDownloadStrategyAssessment[],
): GoogleTrendsDownloadReadiness => {
  const successfulStrategyIds =
    assessments
      .filter(
        (assessment) =>
          assessment.ready,
      )
      .map(
        (assessment) =>
          assessment.strategy_id,
      );

  return {
    assessments,
    successful_strategy_ids:
      successfulStrategyIds,
    selected_strategy_id:
      successfulStrategyIds[0] ??
      null,
  };
};

/**
 * Evaluates every bounded Interest over time download strategy before
 * selecting one. The strategy order is deliberate:
 *
 * 1. prefer the semantic TIMESERIES dataset boundary;
 * 2. prefer accessible button names inside that card;
 * 3. retain the provider's card-scoped export class;
 * 4. preserve the previously live-proven exact-heading contract as a
 *    bounded compatibility path.
 *
 * No strategy clicks, navigates, refreshes, retries, or downloads.
 */
export const inspectGoogleTrendsInterestOverTimeDownloadReadiness =
  async (
    input:
      DownloadGoogleTrendsInterestOverTimeInput,
  ): Promise<GoogleTrendsDownloadReadiness> => {
    const uiActionTimeout =
      requirePositiveTimeout(
        input.ui_action_timeout_ms,
        DEFAULT_UI_ACTION_TIMEOUT_MS,
        'ui_action_timeout_ms',
      );

    const candidates =
      createStrategyCandidates(
        input.page,
      );

    let assessments =
      await assessStrategyCandidates(
        candidates,
      );

    if (
      !assessments.some(
        (assessment) =>
          assessment.ready,
      )
    ) {
      try {
        await Promise.any(
          candidates.map(
            (candidate) =>
              candidate.control.innerText({
                timeout:
                  uiActionTimeout,
              }),
          ),
        );
      } catch {
        // The final assessment below is the stable diagnostic. A
        // readiness timeout never authorizes a click or fallback.
      }

      assessments =
        await assessStrategyCandidates(
          candidates,
        );
    }

    return readinessFromAssessments(
      assessments,
    );
  };

const requireSelectedStrategy = (
  candidates:
    readonly GoogleTrendsDownloadStrategyCandidate[],
  readiness:
    GoogleTrendsDownloadReadiness,
): GoogleTrendsDownloadStrategyCandidate => {
  if (
    readiness.selected_strategy_id !==
    null
  ) {
    const selected =
      candidates.find(
        (candidate) =>
          candidate.strategy_id ===
          readiness.selected_strategy_id,
      );

    if (selected !== undefined) {
      return selected;
    }
  }

  const maximumAnchorCount =
    Math.max(
      0,
      ...readiness.assessments.map(
        (assessment) =>
          assessment.anchor_count,
      ),
    );

  if (maximumAnchorCount === 0) {
    throw new GoogleTrendsUiContractError(
      'Interest over time heading/card readiness failed for every bounded semantic strategy.',
      {
        control:
          GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS
            .INTEREST_OVER_TIME_HEADING,
        observed_count:
          0,
      },
    );
  }

  const maximumControlCount =
    Math.max(
      0,
      ...readiness.assessments.map(
        (assessment) =>
          assessment.control_count,
      ),
    );

  throw new GoogleTrendsUiContractError(
    'Interest over time card was present but every bounded card-scoped download button strategy failed.',
    {
      control:
        GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS
          .DOWNLOAD_BUTTON,
      observed_count:
        maximumControlCount,
    },
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

    const candidates =
      createStrategyCandidates(
        input.page,
      );

    const readiness =
      await inspectGoogleTrendsInterestOverTimeDownloadReadiness({
        page:
          input.page,
        ui_action_timeout_ms:
          uiActionTimeout,
      });

    const selected =
      requireSelectedStrategy(
        candidates,
        readiness,
      );

    return captureBrowserDownload({
      page:
        input.page,
      trigger_download:
        () =>
          selected.control.click({
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
