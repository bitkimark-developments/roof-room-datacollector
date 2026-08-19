import {
  access,
} from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  Page,
  Response,
} from 'playwright';

import {
  BrowserManager,
} from '../../src/main/browser/browser-manager';
import {
  PlaywrightChromiumLauncher,
} from '../../src/main/browser/playwright-browser-launcher';
import {
  loadQueryConfig,
} from '../../src/main/config/query-config-loader';
import {
  assessGoogleTrendsConfiguredExploreUrl,
  buildGoogleTrendsConfiguredExploreUrl,
  configuredExploreUrlAssessmentPasses,
  type GoogleTrendsConfiguredExploreUrlAssessment,
} from '../../src/main/sources/google-trends/google-trends-configured-explore-url';
import {
  verifyGoogleTrendsFixedFilters,
} from '../../src/main/sources/google-trends/google-trends-fixed-filter-verifier';
import {
  inspectGoogleTrendsInterestOverTimeDownloadReadiness,
  type GoogleTrendsDownloadReadiness,
} from '../../src/main/sources/google-trends/google-trends-interest-over-time-download';
import {
  GOOGLE_TRENDS_EXPLORE_URL,
  probeGoogleTrendsExplore,
  type GoogleTrendsProviderProbeResult,
} from '../../src/main/sources/google-trends/google-trends-provider-probe';
import type {
  ApplicationDirectories,
} from '../../src/shared/bootstrap-status';

export const LIVE_CONFIGURED_URL_DIAGNOSTIC_CONFIRMATION_FLAG =
  '--confirm-live-configured-url-diagnostic';

export const LIVE_CONFIGURED_URL_QUERY_GROUP_ID =
  'GT01';

export const LIVE_CONFIGURED_URL_REQUESTED_DATE_START =
  '2024-08-18';

export const LIVE_CONFIGURED_URL_REQUESTED_DATE_END =
  '2026-08-17';

const HELP_FLAG =
  '--help';

const GOOGLE_TRENDS_ORIGIN =
  new URL(
    GOOGLE_TRENDS_EXPLORE_URL,
  ).origin;

const SAFE_COMMAND_ERROR =
  /^(Refusing live Google Trends configured-URL diagnostic|Unsupported argument\(s\)|External query configuration|ROOFROOM_APP_DATA_ROOT)/u;

export interface LiveConfiguredUrlDiagnosticArguments {
  help: boolean;
  confirmed: boolean;
}

export type ConfiguredUrlDiagnosticStage =
  | 'PROVIDER_NAVIGATION'
  | 'CONFIGURED_URL_CONTRACT'
  | 'FIXED_FILTERS'
  | 'DOWNLOAD_READINESS';

export interface SafeConfiguredUrlDiagnosticFailure {
  result_type:
    'CONFIGURED_URL_DIAGNOSTIC_FAILED';
  stage:
    ConfiguredUrlDiagnosticStage;
  error_class: string;
}

export interface SafeConfiguredUrlDiagnosticSuccess {
  result_type:
    'CONFIGURED_URL_DIAGNOSTIC_COMPLETED';
  configured_url_contract:
    GoogleTrendsConfiguredExploreUrlAssessment;
  fixed_filters_verified: true;
  download_readiness:
    GoogleTrendsDownloadReadiness;
}

const usage = (): string =>
  [
    'Usage:',
    `  npm run m3:live-configured-url -- ${LIVE_CONFIGURED_URL_DIAGNOSTIC_CONFIRMATION_FLAG}`,
    '',
    'Scope:',
    '  - loads exactly GT01 from the external app-data query-groups.yaml',
    '  - makes exactly one normal Google Trends Explore navigation',
    '  - configures the exact date, TR geography, and ordered query group in that provider UI URL',
    '  - verifies the final URL contract, fixed filters, and all bounded download strategies',
    '',
    'Safety:',
    '  - uses the app-owned persistent google browser profile',
    '  - never types a query, clicks download, refreshes, retries, or writes an artifact',
    '  - stops on RATE_LIMITED or MANUAL_ACTION_REQUIRED',
    '  - never prints query strings, page text, HTML, URLs, cookies, or session state',
  ].join('\n');

export const parseLiveConfiguredUrlDiagnosticArguments = (
  args: readonly string[],
): LiveConfiguredUrlDiagnosticArguments => {
  const allowed =
    new Set([
      HELP_FLAG,
      LIVE_CONFIGURED_URL_DIAGNOSTIC_CONFIRMATION_FLAG,
    ]);

  const unexpected =
    args.filter(
      (argument) =>
        !allowed.has(
          argument,
        ),
    );

  if (unexpected.length > 0) {
    throw new Error(
      `Unsupported argument(s): ${unexpected.join(', ')}`,
    );
  }

  return {
    help:
      args.includes(
        HELP_FLAG,
      ),
    confirmed:
      args.includes(
        LIVE_CONFIGURED_URL_DIAGNOSTIC_CONFIRMATION_FLAG,
      ),
  };
};

export const requireLiveConfiguredUrlDiagnosticConfirmation = (
  args: readonly string[],
): LiveConfiguredUrlDiagnosticArguments => {
  const parsed =
    parseLiveConfiguredUrlDiagnosticArguments(
      args,
    );

  if (
    !parsed.help &&
    !parsed.confirmed
  ) {
    throw new Error(
      `Refusing live Google Trends configured-URL diagnostic without ${LIVE_CONFIGURED_URL_DIAGNOSTIC_CONFIRMATION_FLAG}.`,
    );
  }

  return parsed;
};

export const isConfiguredUrlDiagnosticRateLimitedResponse = (
  response: Pick<
    Response,
    'status' | 'url'
  >,
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

const SAFE_DIAGNOSTIC_ERROR_CLASSES =
  new Set([
    'GoogleTrendsConfiguredExploreUrlError',
    'GoogleTrendsFixedFilterContractError',
    'GoogleTrendsUiContractError',
  ]);

export const safeConfiguredUrlDiagnosticFailure = (
  stage:
    ConfiguredUrlDiagnosticStage,
  error: unknown,
): SafeConfiguredUrlDiagnosticFailure => ({
  result_type:
    'CONFIGURED_URL_DIAGNOSTIC_FAILED',
  stage,
  error_class:
    error instanceof Error &&
    SAFE_DIAGNOSTIC_ERROR_CLASSES.has(
      error.name,
    )
      ? error.name
      : 'UNKNOWN_DIAGNOSTIC_ERROR',
});

export const safeProviderBlockResult = (
  provider:
    GoogleTrendsProviderProbeResult,
): {
  result_type:
    'RATE_LIMITED' |
    'MANUAL_ACTION_REQUIRED';
  signals:
    GoogleTrendsProviderProbeResult['signals'];
} | null =>
  provider.provider_state ===
    'RATE_LIMITED' ||
  provider.provider_state ===
    'MANUAL_ACTION_REQUIRED'
    ? {
        result_type:
          provider.provider_state,
        signals:
          provider.signals,
      }
    : null;

const resolveAppDataRoot = (): string => {
  const override =
    process.env
      .ROOFROOM_APP_DATA_ROOT;

  if (
    override !== undefined &&
    override.trim().length > 0
  ) {
    return path.resolve(
      override,
    );
  }

  if (process.platform !== 'darwin') {
    throw new Error(
      'ROOFROOM_APP_DATA_ROOT is required outside macOS for the M3 live configured-URL diagnostic.',
    );
  }

  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'RoofRoom Data Collector',
    'app-data',
  );
};

const createDirectories = (
  appDataRoot: string,
): ApplicationDirectories => ({
  app_data_root:
    appDataRoot,
  config:
    path.join(
      appDataRoot,
      'config',
    ),
  data:
    path.join(
      appDataRoot,
      'data',
    ),
  runs:
    path.join(
      appDataRoot,
      'data',
      'runs',
    ),
  database:
    path.join(
      appDataRoot,
      'database',
    ),
  browser_profiles:
    path.join(
      appDataRoot,
      'browser-profiles',
    ),
  logs:
    path.join(
      appDataRoot,
      'logs',
    ),
  public_downloads:
    path.join(
      os.homedir(),
      'Downloads',
      'RoofRoom Data Collector',
    ),
});

const resolveExternalQueryConfigPath = (
  directories:
    ApplicationDirectories,
): string => {
  const override =
    process.env
      .ROOFROOM_QUERY_CONFIG_PATH;

  return override !== undefined &&
    override.trim().length > 0
    ? path.resolve(
        override,
      )
    : path.join(
        directories.config,
        'query-groups.yaml',
      );
};

const requireReadableFile = async (
  filePath: string,
): Promise<void> => {
  try {
    await access(
      filePath,
    );
  } catch {
    throw new Error(
      `External query configuration is not readable: ${filePath}`,
    );
  }
};

const main = async (): Promise<void> => {
  const parsed =
    requireLiveConfiguredUrlDiagnosticConfirmation(
      process.argv.slice(2),
    );

  if (parsed.help) {
    console.log(
      usage(),
    );
    return;
  }

  const directories =
    createDirectories(
      resolveAppDataRoot(),
    );

  const queryConfigPath =
    resolveExternalQueryConfigPath(
      directories,
    );

  await requireReadableFile(
    queryConfigPath,
  );

  const queryConfig =
    await loadQueryConfig(
      queryConfigPath,
    );

  const queryGroup =
    queryConfig.groups.find(
      (group) =>
        group.query_group_id ===
        LIVE_CONFIGURED_URL_QUERY_GROUP_ID,
    );

  if (queryGroup === undefined) {
    throw new Error(
      `External query configuration does not contain ${LIVE_CONFIGURED_URL_QUERY_GROUP_ID}.`,
    );
  }

  const expected = {
    queries:
      queryGroup.queries,
    requested_date_start:
      LIVE_CONFIGURED_URL_REQUESTED_DATE_START,
    requested_date_end:
      LIVE_CONFIGURED_URL_REQUESTED_DATE_END,
    country_code:
      'TR',
  } as const;

  const requestedUrl =
    buildGoogleTrendsConfiguredExploreUrl(
      expected,
    );

  const browserManager =
    new BrowserManager(
      directories,
      new PlaywrightChromiumLauncher(),
    );

  try {
    const session =
      await browserManager.openProfile(
        'google',
        {
          headless: false,
          accept_downloads: false,
        },
      );

    const page =
      await session.context.newPage() as Page;

    let rateLimitedResponseObserved =
      false;

    page.on(
      'response',
      (response): void => {
        if (
          rateLimitedResponseObserved ||
          !isConfiguredUrlDiagnosticRateLimitedResponse(
            response,
          )
        ) {
          return;
        }

        rateLimitedResponseObserved =
          true;

        void page.close().catch(
          (): void => undefined,
        );
      },
    );

    let stage:
      ConfiguredUrlDiagnosticStage =
      'PROVIDER_NAVIGATION';

    try {
      const provider =
        await probeGoogleTrendsExplore(
          page,
          {
            requested_url:
              requestedUrl,
          },
        );

      const providerBlock =
        safeProviderBlockResult(
          provider,
        );

      if (
        rateLimitedResponseObserved ||
        provider.provider_state ===
          'RATE_LIMITED'
      ) {
        console.log(
          JSON.stringify(
            providerBlock ?? {
              result_type:
                'RATE_LIMITED',
              signals: [
                'HTTP_STATUS_429',
              ],
            },
            null,
            2,
          ),
        );
        process.exitCode = 4;
        return;
      }

      if (providerBlock !== null) {
        console.log(
          JSON.stringify(
            providerBlock,
            null,
            2,
          ),
        );
        process.exitCode = 3;
        return;
      }

      stage =
        'CONFIGURED_URL_CONTRACT';

      const assessment =
        assessGoogleTrendsConfiguredExploreUrl(
          provider.final_url,
          expected,
        );

      if (
        !configuredExploreUrlAssessmentPasses(
          assessment,
        )
      ) {
        console.log(
          JSON.stringify(
            {
              result_type:
                'CONFIGURED_URL_CONTRACT_FAILED',
              configured_url_contract:
                assessment,
            },
            null,
            2,
          ),
        );
        process.exitCode = 2;
        return;
      }

      stage =
        'FIXED_FILTERS';

      await verifyGoogleTrendsFixedFilters({
        page,
      });

      if (rateLimitedResponseObserved) {
        console.log(
          JSON.stringify(
            {
              result_type:
                'RATE_LIMITED',
              signals: [
                'HTTP_STATUS_429',
              ],
            },
            null,
            2,
          ),
        );
        process.exitCode = 4;
        return;
      }

      stage =
        'DOWNLOAD_READINESS';

      const downloadReadiness =
        await inspectGoogleTrendsInterestOverTimeDownloadReadiness({
          page,
        });

      if (rateLimitedResponseObserved) {
        console.log(
          JSON.stringify(
            {
              result_type:
                'RATE_LIMITED',
              signals: [
                'HTTP_STATUS_429',
              ],
            },
            null,
            2,
          ),
        );
        process.exitCode = 4;
        return;
      }

      const result:
        SafeConfiguredUrlDiagnosticSuccess = {
          result_type:
            'CONFIGURED_URL_DIAGNOSTIC_COMPLETED',
          configured_url_contract:
            assessment,
          fixed_filters_verified:
            true,
          download_readiness:
            downloadReadiness,
        };

      console.log(
        JSON.stringify(
          result,
          null,
          2,
        ),
      );
    } catch (error: unknown) {
      if (rateLimitedResponseObserved) {
        console.log(
          JSON.stringify(
            {
              result_type:
                'RATE_LIMITED',
              signals: [
                'HTTP_STATUS_429',
              ],
            },
            null,
            2,
          ),
        );
        process.exitCode = 4;
        return;
      }

      console.log(
        JSON.stringify(
          safeConfiguredUrlDiagnosticFailure(
            stage,
            error,
          ),
          null,
          2,
        ),
      );
      process.exitCode = 2;
    }
  } finally {
    await browserManager.close();
  }
};

if (require.main === module) {
  main().catch(
    (error: unknown) => {
      const safeMessage =
        error instanceof Error &&
        SAFE_COMMAND_ERROR.test(
          error.message,
        )
          ? error.message
          : error instanceof Error
            ? error.name
            : 'UNKNOWN_CONFIGURED_URL_DIAGNOSTIC_ERROR';

      console.error(
        safeMessage,
      );
      process.exitCode = 1;
    },
  );
}
