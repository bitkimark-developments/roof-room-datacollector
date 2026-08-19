import {
  BrowserDownloadCaptureError,
} from '../../browser/browser-download-capture';
import {
  BrowserManagerError,
  type BrowserManager,
  type ManagedBrowserPage,
  type ManagedBrowserResponse,
} from '../../browser/browser-manager';
import type {
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../../shared/collection';

import {
  exportConfiguredGoogleTrendsPage,
  GoogleTrendsConfiguredPageExportError,
  type ExportConfiguredGoogleTrendsPageInput,
  type GoogleTrendsConfiguredPageExportResult,
  type GoogleTrendsConfiguredPageStage,
} from './google-trends-configured-page-export';
import {
  GOOGLE_TRENDS_DATE_DIALOG_DIAGNOSTIC_CONTROLS,
  GoogleTrendsDateDialogContractError,
} from './google-trends-custom-date-dialog';
import {
  GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS,
  GoogleTrendsDateRangeUiContractError,
} from './google-trends-custom-date-range';
import {
  GoogleTrendsFixedFilterContractError,
} from './google-trends-fixed-filter-verifier';
import {
  GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS,
  GoogleTrendsGeographyUiContractError,
} from './google-trends-geography-ui';
import {
  GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS,
  GoogleTrendsUiContractError,
} from './google-trends-interest-over-time-download';
import {
  GOOGLE_TRENDS_EXPLORE_URL,
  probeGoogleTrendsExplore,
  type GoogleTrendsProviderProbeResult,
} from './google-trends-provider-probe';
import {
  GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS,
  GoogleTrendsQueryGroupUiContractError,
} from './google-trends-query-group-ui';

const GOOGLE_TRENDS_SOURCE_ID =
  'google-trends';

const GOOGLE_TRENDS_SOURCE_MODE =
  'GOOGLE_TRENDS_UI';

const GOOGLE_TRENDS_DATASET_TYPE =
  'INTEREST_OVER_TIME';

const GOOGLE_TRENDS_MVP_COUNTRY_CODE =
  'TR';

const GOOGLE_TRENDS_MVP_CATEGORY_NAME =
  'All Categories';

const GOOGLE_TRENDS_MVP_SEARCH_TYPE =
  'Web Search';

const GOOGLE_TRENDS_MVP_SELECTION_TYPE =
  'Search Term';

const GOOGLE_TRENDS_PROFILE_ID =
  'google';

const RAW_FILENAME_SUFFIX =
  '_TR_24M_interest_over_time.csv';

const GOOGLE_TRENDS_ORIGIN =
  new URL(
    GOOGLE_TRENDS_EXPLORE_URL,
  ).origin;

export const GOOGLE_TRENDS_COLLECTION_ERROR_CODES = {
  UNSUPPORTED_CONFIGURATION:
    'UNSUPPORTED_CONFIGURATION',
  RATE_LIMITED:
    'RATE_LIMITED',
  BROWSER_LAUNCH_FAILED:
    'BROWSER_LAUNCH_FAILED',
  BROWSER_SESSION_FAILED:
    'BROWSER_SESSION_FAILED',
  UI_CONTRACT_ERROR:
    'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
  DOWNLOAD_FAILED:
    'DOWNLOAD_FAILED',
  PROVIDER_PROBE_FAILED:
    'GOOGLE_TRENDS_PROVIDER_PROBE_FAILED',
  COLLECTION_FAILED:
    'GOOGLE_TRENDS_COLLECTION_FAILED',
} as const;

export type GoogleTrendsCollectionErrorCode =
  (typeof GOOGLE_TRENDS_COLLECTION_ERROR_CODES)[
    keyof typeof GOOGLE_TRENDS_COLLECTION_ERROR_CODES
  ];

export class GoogleTrendsCollectionContextError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsCollectionContextError';
  }
}

export interface GoogleTrendsCollectorDependencies {
  browser_manager: BrowserManager;
  probe_provider?: (
    page: ManagedBrowserPage,
  ) => Promise<GoogleTrendsProviderProbeResult>;
  export_configured_page?: (
    input: ExportConfiguredGoogleTrendsPageInput,
  ) => Promise<GoogleTrendsConfiguredPageExportResult>;
}

const requireEqual = (
  actual: string,
  expected: string,
  fieldName: string,
): void => {
  if (actual !== expected) {
    throw new GoogleTrendsCollectionContextError(
      `Unsupported Google Trends collection context: ${fieldName} must equal "${expected}", found "${actual}".`,
    );
  }
};

const assertSupportedContext = (
  context: SourceCollectionContext,
): void => {
  requireEqual(
    context.source_id,
    GOOGLE_TRENDS_SOURCE_ID,
    'source_id',
  );

  requireEqual(
    context.requested_configuration
      .source_mode,
    GOOGLE_TRENDS_SOURCE_MODE,
    'source_mode',
  );

  requireEqual(
    context.requested_configuration
      .dataset_type,
    GOOGLE_TRENDS_DATASET_TYPE,
    'dataset_type',
  );

  requireEqual(
    context.requested_configuration
      .country_code,
    GOOGLE_TRENDS_MVP_COUNTRY_CODE,
    'country_code',
  );

  requireEqual(
    context.requested_configuration
      .category_name,
    GOOGLE_TRENDS_MVP_CATEGORY_NAME,
    'category_name',
  );

  requireEqual(
    context.requested_configuration
      .search_type,
    GOOGLE_TRENDS_MVP_SEARCH_TYPE,
    'search_type',
  );

  requireEqual(
    context.requested_configuration
      .selection_type,
    GOOGLE_TRENDS_MVP_SELECTION_TYPE,
    'selection_type',
  );

  requireEqual(
    context.query_group
      .query_group_id,
    context.job_key,
    'query_group_id/job_key',
  );
};

const rawFilename = (
  context: SourceCollectionContext,
): string =>
  `${context.query_group.query_group_id}${RAW_FILENAME_SUFFIX}`;

const errorMessage = (
  error: unknown,
): string =>
  error instanceof Error
    ? error.message
    : 'Unknown Google Trends collection failure.';

const isUiContractError = (
  error: unknown,
): boolean =>
  error instanceof
    GoogleTrendsQueryGroupUiContractError ||
  error instanceof
    GoogleTrendsGeographyUiContractError ||
  error instanceof
    GoogleTrendsDateDialogContractError ||
  error instanceof
    GoogleTrendsDateRangeUiContractError ||
  error instanceof
    GoogleTrendsFixedFilterContractError ||
  error instanceof
    GoogleTrendsUiContractError;

const failed = (
  errorCode:
    GoogleTrendsCollectionErrorCode,
  message: string | null,
): SourceCollectionResult => ({
  result_type:
    'FAILED',
  error_code:
    errorCode,
  message,
});

const isGoogleTrendsRateLimitedResponse = (
  response:
    ManagedBrowserResponse,
): boolean => {
  try {
    return (
      response.status() === 429 &&
      new URL(
        response.url(),
      ).origin ===
        GOOGLE_TRENDS_ORIGIN
    );
  } catch {
    return false;
  }
};

const rateLimitedDuringCollection =
  (): SourceCollectionResult =>
    failed(
      GOOGLE_TRENDS_COLLECTION_ERROR_CODES
        .RATE_LIMITED,
      'Google Trends returned HTTP 429 during collection. Collection stopped without refresh or retry.',
    );

const QUERY_GROUP_DIAGNOSTIC_CONTROL_VALUES =
  new Set<string>(
    Object.values(
      GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS,
    ),
  );

const GEOGRAPHY_DIAGNOSTIC_CONTROL_VALUES =
  new Set<string>(
    Object.values(
      GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS,
    ),
  );

const DATE_RANGE_DIAGNOSTIC_CONTROL_VALUES =
  new Set<string>(
    Object.values(
      GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS,
    ),
  );

const DATE_DIALOG_DIAGNOSTIC_CONTROL_VALUES =
  new Set<string>(
    Object.values(
      GOOGLE_TRENDS_DATE_DIALOG_DIAGNOSTIC_CONTROLS,
    ),
  );

const DOWNLOAD_DIAGNOSTIC_CONTROL_VALUES =
  new Set<string>(
    Object.values(
      GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS,
    ),
  );

const formatQueryGroupDiagnostic = (
  stage:
    GoogleTrendsConfiguredPageStage | null,
  error: unknown,
): string | null => {
  if (
    stage !==
      'QUERY_GROUP' ||
    !(error instanceof
      GoogleTrendsQueryGroupUiContractError)
  ) {
    return null;
  }

  const diagnostic =
    error.diagnostic_context;

  if (
    diagnostic === null ||
    !QUERY_GROUP_DIAGNOSTIC_CONTROL_VALUES.has(
      diagnostic.control,
    ) ||
    !Number.isSafeInteger(
      diagnostic.observed_count,
    ) ||
    diagnostic.observed_count < 0 ||
    !Number.isSafeInteger(
      diagnostic.query_index,
    ) ||
    diagnostic.query_index < 0
  ) {
    return null;
  }

  return `Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError; control=${diagnostic.control}; observed_count=${diagnostic.observed_count}; query_index=${diagnostic.query_index}).`;
};

const formatGeographyDiagnostic = (
  stage:
    GoogleTrendsConfiguredPageStage | null,
  error: unknown,
): string | null => {
  if (
    stage !==
      'GEOGRAPHY' ||
    !(error instanceof
      GoogleTrendsGeographyUiContractError)
  ) {
    return null;
  }

  const diagnostic =
    error.diagnostic_context;

  if (
    diagnostic === null ||
    !GEOGRAPHY_DIAGNOSTIC_CONTROL_VALUES.has(
      diagnostic.control,
    ) ||
    !Number.isSafeInteger(
      diagnostic.observed_count,
    ) ||
    diagnostic.observed_count < 0
  ) {
    return null;
  }

  return `Google Trends UI contract failed during GEOGRAPHY (GoogleTrendsGeographyUiContractError; control=${diagnostic.control}; observed_count=${diagnostic.observed_count}).`;
};

const formatDateRangeDiagnostic = (
  stage:
    GoogleTrendsConfiguredPageStage | null,
  error: unknown,
): string | null => {
  if (
    stage !==
      'DATE_RANGE'
  ) {
    return null;
  }

  const diagnostic =
    error instanceof
      GoogleTrendsDateRangeUiContractError
      ? error.diagnostic_context
      : error instanceof
          GoogleTrendsDateDialogContractError
        ? error.diagnostic_context
        : null;

  const controlValues =
    error instanceof
      GoogleTrendsDateRangeUiContractError
      ? DATE_RANGE_DIAGNOSTIC_CONTROL_VALUES
      : error instanceof
          GoogleTrendsDateDialogContractError
        ? DATE_DIALOG_DIAGNOSTIC_CONTROL_VALUES
        : null;

  if (
    diagnostic === null ||
    controlValues === null ||
    !controlValues.has(
      diagnostic.control,
    ) ||
    !Number.isSafeInteger(
      diagnostic.observed_count,
    ) ||
    diagnostic.observed_count < 0
  ) {
    return null;
  }

  const errorName =
    error instanceof
      GoogleTrendsDateRangeUiContractError
      ? 'GoogleTrendsDateRangeUiContractError'
      : 'GoogleTrendsDateDialogContractError';

  return `Google Trends UI contract failed during DATE_RANGE (${errorName}; control=${diagnostic.control}; observed_count=${diagnostic.observed_count}).`;
};

const formatDownloadDiagnostic = (
  stage:
    GoogleTrendsConfiguredPageStage | null,
  error: unknown,
): string | null => {
  if (
    stage !== 'DOWNLOAD' ||
    !(error instanceof
      GoogleTrendsUiContractError)
  ) {
    return null;
  }

  const diagnostic =
    error.diagnostic_context;

  if (
    diagnostic === null ||
    !DOWNLOAD_DIAGNOSTIC_CONTROL_VALUES.has(
      diagnostic.control,
    ) ||
    !Number.isSafeInteger(
      diagnostic.observed_count,
    ) ||
    diagnostic.observed_count < 0
  ) {
    return null;
  }

  return `Google Trends UI contract failed during DOWNLOAD (GoogleTrendsUiContractError; control=${diagnostic.control}; observed_count=${diagnostic.observed_count}).`;
};

export class GoogleTrendsCollector {
  private readonly probeProvider:
    (
      page: ManagedBrowserPage,
    ) =>
      Promise<GoogleTrendsProviderProbeResult>;

  private readonly exportConfiguredPage:
    (
      input:
        ExportConfiguredGoogleTrendsPageInput,
    ) =>
      Promise<GoogleTrendsConfiguredPageExportResult>;

  constructor(
    private readonly dependencies:
      GoogleTrendsCollectorDependencies,
  ) {
    this.probeProvider =
      dependencies.probe_provider ??
      ((page) =>
        probeGoogleTrendsExplore(
          page,
        ));

    this.exportConfiguredPage =
      dependencies.export_configured_page ??
      exportConfiguredGoogleTrendsPage;
  }

  async collect(
    context: SourceCollectionContext,
  ): Promise<SourceCollectionResult> {
    try {
      assertSupportedContext(
        context,
      );
    } catch (error: unknown) {
      return failed(
        GOOGLE_TRENDS_COLLECTION_ERROR_CODES
          .UNSUPPORTED_CONFIGURATION,
        errorMessage(error),
      );
    }

    let page:
      ManagedBrowserPage | null =
      null;

    let keepPageOpenForManualAction =
      false;

    let rateLimitedResponseObserved =
      false;

    const observeProviderResponse = (
      response:
        ManagedBrowserResponse,
    ): void => {
      if (
        isGoogleTrendsRateLimitedResponse(
          response,
        )
      ) {
        rateLimitedResponseObserved =
          true;
      }
    };

    let exportStage:
      GoogleTrendsConfiguredPageStage | null =
      null;

    let phase:
      | 'OPEN_BROWSER'
      | 'PROBE_PROVIDER'
      | 'EXPORT'
      = 'OPEN_BROWSER';

    try {
      const session =
        await this.dependencies
          .browser_manager
          .openProfile(
            GOOGLE_TRENDS_PROFILE_ID,
            {
              headless: false,
              accept_downloads: true,
            },
          );

      page =
        await session.context
          .newPage();

      page.on?.(
        'response',
        observeProviderResponse,
      );

      phase =
        'PROBE_PROVIDER';

      const provider =
        await this.probeProvider(
          page,
        );

      if (
        provider.provider_state ===
        'RATE_LIMITED'
      ) {
        return failed(
          GOOGLE_TRENDS_COLLECTION_ERROR_CODES
            .RATE_LIMITED,
          provider.retry_after === null
            ? 'Google Trends reported rate limiting. Collection stopped without refresh or retry.'
            : `Google Trends reported rate limiting (Retry-After: ${provider.retry_after}). Collection stopped without refresh or retry.`,
        );
      }

      if (
        provider.provider_state ===
        'MANUAL_ACTION_REQUIRED'
      ) {
        keepPageOpenForManualAction =
          true;

        return {
          result_type:
            'MANUAL_ACTION_REQUIRED',
          message:
            'Google requires manual authentication or security confirmation in the opened provider window. Complete it directly with Google; RoofRoom Data Collector will not automate passwords, CAPTCHA, 2FA, or security challenges.',
        };
      }

      phase =
        'EXPORT';

      const filename =
        rawFilename(
          context,
        );

      const exported =
        await this.exportConfiguredPage({
          page,
          queries:
            context.query_group
              .queries,
          requested_date_start:
            context
              .requested_configuration
              .requested_date_start,
          requested_date_end:
            context
              .requested_configuration
              .requested_date_end,
          on_stage:
            (stage): void => {
              if (
                rateLimitedResponseObserved
              ) {
                throw new Error(
                  'Google Trends rate-limit response was observed before the next provider stage.',
                );
              }

              exportStage =
                stage;
            },
        });

      if (
        rateLimitedResponseObserved
      ) {
        return rateLimitedDuringCollection();
      }

      return {
        result_type:
          'ARTIFACT_PRODUCED',
        preferred_filename:
          filename,
        media_type:
          exported.media_type,
        bytes:
          exported.bytes,
      };
    } catch (error: unknown) {
      if (
        rateLimitedResponseObserved
      ) {
        return rateLimitedDuringCollection();
      }

      if (
        error instanceof
          BrowserManagerError
      ) {
        return failed(
          error.code ===
            'LAUNCH_FAILED'
            ? GOOGLE_TRENDS_COLLECTION_ERROR_CODES
                .BROWSER_LAUNCH_FAILED
            : GOOGLE_TRENDS_COLLECTION_ERROR_CODES
                .BROWSER_SESSION_FAILED,
          error.message,
        );
      }

      if (
        phase ===
        'PROBE_PROVIDER'
      ) {
        return failed(
          GOOGLE_TRENDS_COLLECTION_ERROR_CODES
            .PROVIDER_PROBE_FAILED,
          errorMessage(error),
        );
      }

      if (
        error instanceof
          BrowserDownloadCaptureError ||
        error instanceof
          GoogleTrendsConfiguredPageExportError
      ) {
        return failed(
          GOOGLE_TRENDS_COLLECTION_ERROR_CODES
            .DOWNLOAD_FAILED,
          errorMessage(error),
        );
      }

      if (
        isUiContractError(
          error,
        )
      ) {
        const safeStage =
          exportStage ??
          'UNKNOWN_EXPORT_STAGE';

        const safeErrorName =
          error instanceof Error
            ? error.name
            : 'UnknownUiContractError';

        const queryGroupDiagnostic =
          formatQueryGroupDiagnostic(
            exportStage,
            error,
          );

        const geographyDiagnostic =
          formatGeographyDiagnostic(
            exportStage,
            error,
          );

        const dateRangeDiagnostic =
          formatDateRangeDiagnostic(
            exportStage,
            error,
          );

        const downloadDiagnostic =
          formatDownloadDiagnostic(
            exportStage,
            error,
          );

        return failed(
          GOOGLE_TRENDS_COLLECTION_ERROR_CODES
            .UI_CONTRACT_ERROR,
          queryGroupDiagnostic ??
            geographyDiagnostic ??
            dateRangeDiagnostic ??
            downloadDiagnostic ??
            `Google Trends UI contract failed during ${safeStage} (${safeErrorName}).`,
        );
      }

      return failed(
        GOOGLE_TRENDS_COLLECTION_ERROR_CODES
          .COLLECTION_FAILED,
        errorMessage(error),
      );
    } finally {
      if (
        page !== null &&
        !keepPageOpenForManualAction
      ) {
        try {
          page.off?.(
            'response',
            observeProviderResponse,
          );
        } catch {
          // Observability cleanup must not prevent page cleanup.
        }

        try {
          await page.close();
        } catch {
          // Preserve the collection result/failure.
          // BrowserManager owns the persistent context lifecycle.
        }
      }
    }
  }

  getExploreUrl(): string {
    return GOOGLE_TRENDS_EXPLORE_URL;
  }
}
