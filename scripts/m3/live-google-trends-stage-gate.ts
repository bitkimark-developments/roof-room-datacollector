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
  applyGoogleTrendsConfiguredPageThroughStage,
  GOOGLE_TRENDS_PRE_DOWNLOAD_STAGES,
  type GoogleTrendsPreDownloadStage,
} from '../../src/main/sources/google-trends/google-trends-configured-page-export';
import {
  GOOGLE_TRENDS_DATE_DIALOG_DIAGNOSTIC_CONTROLS,
  GoogleTrendsDateDialogContractError,
} from '../../src/main/sources/google-trends/google-trends-custom-date-dialog';
import {
  GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS,
  GoogleTrendsDateRangeUiContractError,
} from '../../src/main/sources/google-trends/google-trends-custom-date-range';
import {
  GoogleTrendsFixedFilterContractError,
} from '../../src/main/sources/google-trends/google-trends-fixed-filter-verifier';
import {
  GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS,
  GoogleTrendsGeographyUiContractError,
} from '../../src/main/sources/google-trends/google-trends-geography-ui';
import {
  GOOGLE_TRENDS_EXPLORE_URL,
  probeGoogleTrendsExplore,
} from '../../src/main/sources/google-trends/google-trends-provider-probe';
import {
  GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS,
  GoogleTrendsQueryGroupUiContractError,
} from '../../src/main/sources/google-trends/google-trends-query-group-ui';
import type {
  ApplicationDirectories,
} from '../../src/shared/bootstrap-status';

export const LIVE_STAGE_GATE_CONFIRMATION_FLAG =
  '--confirm-live-stage';

const HELP_FLAG =
  '--help';

const STAGE_ARGUMENT_PREFIX =
  '--stage=';

const QUERY_GROUP_ID =
  'GT01';

const REQUESTED_DATE_START =
  '2024-08-18';

const REQUESTED_DATE_END =
  '2026-08-17';

const GOOGLE_TRENDS_ORIGIN =
  new URL(
    GOOGLE_TRENDS_EXPLORE_URL,
  ).origin;

const SAFE_COMMAND_ERROR =
  /^(Refusing live Google Trends stage gate|Live Google Trends stage gate requires|Unsupported argument\(s\)|External query configuration|ROOFROOM_APP_DATA_ROOT)/u;

const QUERY_CONTROLS =
  new Set<string>(
    Object.values(
      GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS,
    ),
  );

const GEOGRAPHY_CONTROLS =
  new Set<string>(
    Object.values(
      GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS,
    ),
  );

const DATE_RANGE_CONTROLS =
  new Set<string>(
    Object.values(
      GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS,
    ),
  );

const DATE_DIALOG_CONTROLS =
  new Set<string>(
    Object.values(
      GOOGLE_TRENDS_DATE_DIALOG_DIAGNOSTIC_CONTROLS,
    ),
  );

export interface LiveStageGateArguments {
  help: boolean;
  confirmed: boolean;
  target_stage:
    GoogleTrendsPreDownloadStage | null;
}

export interface SafeStageGateFailure {
  result_type:
    'STAGE_GATE_FAILED';
  target_stage:
    GoogleTrendsPreDownloadStage;
  current_stage:
    GoogleTrendsPreDownloadStage | null;
  completed_stages:
    readonly GoogleTrendsPreDownloadStage[];
  error_class: string;
  control?: string;
  observed_count?: number;
  query_index?: number;
}

const usage = (): string =>
  [
    'Usage:',
    '  npm run m3:live-stage -- --stage=DATE_RANGE --confirm-live-stage',
    '',
    'Allowed pre-download gates:',
    `  ${GOOGLE_TRENDS_PRE_DOWNLOAD_STAGES.join(', ')}`,
    '',
    'Scope:',
    '  - loads GT01 from the external app-data query-groups.yaml',
    '  - executes the production modules only through the requested gate',
    '  - reports only fixed stage identifiers and structured cardinality evidence',
    '',
    'Safety:',
    '  - makes one controlled Google Trends Explore navigation',
    '  - uses the app-owned persistent google browser profile',
    '  - never triggers download, refresh, retry, or broader query groups',
    '  - stops on RATE_LIMITED or MANUAL_ACTION_REQUIRED',
    '  - never prints query strings, page text, HTML, URLs, cookies, or session state',
  ].join('\n');

const parseTargetStage = (
  value: string,
): GoogleTrendsPreDownloadStage | null =>
  GOOGLE_TRENDS_PRE_DOWNLOAD_STAGES.find(
    (stage) =>
      stage === value,
  ) ?? null;

export const parseLiveStageGateArguments = (
  args: readonly string[],
): LiveStageGateArguments => {
  const stageArguments =
    args.filter(
      (argument) =>
        argument.startsWith(
          STAGE_ARGUMENT_PREFIX,
        ),
    );

  const allowedArguments =
    new Set([
      HELP_FLAG,
      LIVE_STAGE_GATE_CONFIRMATION_FLAG,
      ...stageArguments,
    ]);

  const unexpected =
    args.filter(
      (argument) =>
        !allowedArguments.has(
          argument,
        ),
    );

  const stageValue =
    stageArguments.length === 1
      ? stageArguments[0].slice(
          STAGE_ARGUMENT_PREFIX.length,
        )
      : null;

  const targetStage =
    stageValue === null
      ? null
      : parseTargetStage(
          stageValue,
        );

  if (
    unexpected.length > 0 ||
    stageArguments.length > 1 ||
    (stageValue !== null &&
      targetStage === null)
  ) {
    const invalid = [
      ...unexpected,
      ...(stageArguments.length > 1
        ? stageArguments
        : []),
      ...(stageValue !== null &&
      targetStage === null
        ? stageArguments
        : []),
    ];

    throw new Error(
      `Unsupported argument(s): ${[
        ...new Set(
          invalid,
        ),
      ].join(', ')}`,
    );
  }

  return {
    help:
      args.includes(
        HELP_FLAG,
      ),
    confirmed:
      args.includes(
        LIVE_STAGE_GATE_CONFIRMATION_FLAG,
      ),
    target_stage:
      targetStage,
  };
};

export const requireLiveStageGateConfirmation = (
  args: readonly string[],
): LiveStageGateArguments => {
  const parsed =
    parseLiveStageGateArguments(
      args,
    );

  if (parsed.help) {
    return parsed;
  }

  if (!parsed.confirmed) {
    throw new Error(
      `Refusing live Google Trends stage gate without ${LIVE_STAGE_GATE_CONFIRMATION_FLAG}.`,
    );
  }

  if (parsed.target_stage === null) {
    throw new Error(
      'Live Google Trends stage gate requires exactly one explicit --stage=<PRE_DOWNLOAD_STAGE> target.',
    );
  }

  return parsed;
};

const validObservedCount = (
  value: number,
): boolean =>
  Number.isSafeInteger(
    value,
  ) && value >= 0;

const validQueryIndex = (
  value: number,
): boolean =>
  Number.isSafeInteger(
    value,
  ) && value >= 0;

export const safeStageGateFailure = (
  targetStage:
    GoogleTrendsPreDownloadStage,
  currentStage:
    GoogleTrendsPreDownloadStage | null,
  completedStages:
    readonly GoogleTrendsPreDownloadStage[],
  error: unknown,
): SafeStageGateFailure => {
  const base: SafeStageGateFailure = {
    result_type:
      'STAGE_GATE_FAILED',
    target_stage:
      targetStage,
    current_stage:
      currentStage,
    completed_stages: [
      ...completedStages,
    ],
    error_class:
      'UNKNOWN_STAGE_ERROR',
  };

  if (
    currentStage === 'QUERY_GROUP' &&
    error instanceof
      GoogleTrendsQueryGroupUiContractError
  ) {
    const diagnostic =
      error.diagnostic_context;

    const result = {
      ...base,
      error_class:
        'GoogleTrendsQueryGroupUiContractError',
    };

    return diagnostic !== null &&
      QUERY_CONTROLS.has(
        diagnostic.control,
      ) &&
      validObservedCount(
        diagnostic.observed_count,
      ) &&
      validQueryIndex(
        diagnostic.query_index,
      )
      ? {
          ...result,
          control:
            diagnostic.control,
          observed_count:
            diagnostic.observed_count,
          query_index:
            diagnostic.query_index,
        }
      : result;
  }

  if (
    currentStage === 'GEOGRAPHY' &&
    error instanceof
      GoogleTrendsGeographyUiContractError
  ) {
    const diagnostic =
      error.diagnostic_context;

    const result = {
      ...base,
      error_class:
        'GoogleTrendsGeographyUiContractError',
    };

    return diagnostic !== null &&
      GEOGRAPHY_CONTROLS.has(
        diagnostic.control,
      ) &&
      validObservedCount(
        diagnostic.observed_count,
      )
      ? {
          ...result,
          control:
            diagnostic.control,
          observed_count:
            diagnostic.observed_count,
        }
      : result;
  }

  if (
    currentStage === 'DATE_RANGE' &&
    error instanceof
      GoogleTrendsDateRangeUiContractError
  ) {
    const diagnostic =
      error.diagnostic_context;

    const result = {
      ...base,
      error_class:
        'GoogleTrendsDateRangeUiContractError',
    };

    return diagnostic !== null &&
      DATE_RANGE_CONTROLS.has(
        diagnostic.control,
      ) &&
      validObservedCount(
        diagnostic.observed_count,
      )
      ? {
          ...result,
          control:
            diagnostic.control,
          observed_count:
            diagnostic.observed_count,
        }
      : result;
  }

  if (
    currentStage === 'DATE_RANGE' &&
    error instanceof
      GoogleTrendsDateDialogContractError
  ) {
    const diagnostic =
      error.diagnostic_context;

    const result = {
      ...base,
      error_class:
        'GoogleTrendsDateDialogContractError',
    };

    return diagnostic !== null &&
      DATE_DIALOG_CONTROLS.has(
        diagnostic.control,
      ) &&
      validObservedCount(
        diagnostic.observed_count,
      )
      ? {
          ...result,
          control:
            diagnostic.control,
          observed_count:
            diagnostic.observed_count,
        }
      : result;
  }

  if (
    currentStage === 'FIXED_FILTERS' &&
    error instanceof
      GoogleTrendsFixedFilterContractError
  ) {
    return {
      ...base,
      error_class:
        'GoogleTrendsFixedFilterContractError',
    };
  }

  return base;
};

export const isGoogleTrendsStageRateLimitedResponse = (
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
      'ROOFROOM_APP_DATA_ROOT is required outside macOS for the M3 live stage gate.',
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
    requireLiveStageGateConfirmation(
      process.argv.slice(2),
    );

  if (parsed.help) {
    console.log(
      usage(),
    );
    return;
  }

  const targetStage =
    parsed.target_stage;

  if (targetStage === null) {
    throw new Error(
      'Live Google Trends stage gate requires an explicit target.',
    );
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
        QUERY_GROUP_ID,
    );

  if (queryGroup === undefined) {
    throw new Error(
      `External query configuration does not contain ${QUERY_GROUP_ID}.`,
    );
  }

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
          isGoogleTrendsStageRateLimitedResponse(
            response,
          )
        ) {
          rateLimitedResponseObserved =
            true;
        }
      },
    );

    const provider =
      await probeGoogleTrendsExplore(
        page,
      );

    if (
      provider.provider_state !==
        'NO_RATE_LIMIT_SIGNAL'
    ) {
      console.log(
        JSON.stringify(
          {
            result_type:
              provider.provider_state,
            signals:
              provider.signals,
          },
          null,
          2,
        ),
      );

      process.exitCode =
        provider.provider_state ===
          'RATE_LIMITED'
          ? 4
          : 3;
      return;
    }

    let currentStage:
      GoogleTrendsPreDownloadStage | null =
      null;

    const completedStages:
      GoogleTrendsPreDownloadStage[] = [];

    try {
      await applyGoogleTrendsConfiguredPageThroughStage({
        page,
        queries:
          queryGroup.queries,
        requested_date_start:
          REQUESTED_DATE_START,
        requested_date_end:
          REQUESTED_DATE_END,
        through_stage:
          targetStage,
        on_stage(stage): void {
          if (
            rateLimitedResponseObserved
          ) {
            throw new Error(
              'RATE_LIMITED_DURING_STAGE_GATE',
            );
          }

          if (stage === 'DOWNLOAD') {
            throw new Error(
              'UNEXPECTED_DOWNLOAD_STAGE',
            );
          }

          currentStage =
            stage;
        },
        on_stage_completed(stage): void {
          completedStages.push(
            stage,
          );
        },
      });

      if (
        rateLimitedResponseObserved
      ) {
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
          {
            result_type:
              'STAGE_GATE_COMPLETED',
            target_stage:
              targetStage,
            completed_stages:
              completedStages,
          },
          null,
          2,
        ),
      );
    } catch (error: unknown) {
      if (
        rateLimitedResponseObserved
      ) {
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
          safeStageGateFailure(
            targetStage,
            currentStage,
            completedStages,
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
            : 'UNKNOWN_STAGE_GATE_ERROR';

      console.error(
        safeMessage,
      );
      process.exitCode = 1;
    },
  );
}
