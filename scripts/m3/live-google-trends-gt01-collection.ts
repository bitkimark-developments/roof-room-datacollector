import {
  access,
} from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createInterface,
} from 'node:readline/promises';

import {
  loadQueryConfig,
} from '../../src/main/config/query-config-loader';
import {
  runGoogleTrendsThroughCore,
  type GoogleTrendsCoreRunResult,
} from '../../src/main/sources/google-trends/google-trends-core-runner';
import {
  createGoogleTrendsRuntime,
} from '../../src/main/sources/google-trends/google-trends-runtime';
import type {
  ApplicationDirectories,
} from '../../src/shared/bootstrap-status';
import type {
  SourceCollectionResult,
} from '../../src/shared/collection';
import type {
  RequestedCollectionConfiguration,
} from '../../src/shared/run-job';

export const LIVE_GT01_CONFIRMATION_FLAG =
  '--confirm-live-collection';

const HELP_FLAG =
  '--help';

export const LIVE_GT01_QUERY_GROUP_ID =
  'GT01';

export const LIVE_GT01_REQUESTED_DATE_START =
  '2024-08-18';

export const LIVE_GT01_REQUESTED_DATE_END =
  '2026-08-17';

const usage = (): string =>
  [
    'Usage:',
    '  npm run m3:live-gt01 -- --confirm-live-collection',
    '',
    'Scope:',
    '  - loads GT01 from the external app-data query-groups.yaml',
    `  - requests ${LIVE_GT01_REQUESTED_DATE_START} through ${LIVE_GT01_REQUESTED_DATE_END}`,
    '  - Türkiye / All Categories / Web Search / Search Term',
    '  - exports only Interest over time CSV',
    '  - persists and validates through CollectionOrchestrator before reporting success',
    '  - keeps canonical raw/metadata/validation/log evidence under app-data/data/runs',
    '',
    'Safety:',
    '  - uses the app-owned persistent google browser profile',
    '  - makes no automatic refresh or retry',
    '  - stops on RATE_LIMITED',
    '  - stops on authentication/security challenge as MANUAL_ACTION_REQUIRED',
    '  - never automates passwords, CAPTCHA, 2FA, or security challenges',
    '  - never prints raw CSV, page HTML, cookies, auth headers, or session state',
  ].join('\n');

export interface LiveGt01Arguments {
  help: boolean;
  confirmed: boolean;
}

export const parseLiveGt01Arguments = (
  args: readonly string[],
): LiveGt01Arguments => {
  const allowed =
    new Set([
      HELP_FLAG,
      LIVE_GT01_CONFIRMATION_FLAG,
    ]);

  const unexpected =
    args.filter(
      (argument) =>
        !allowed.has(
          argument,
        ),
    );

  if (
    unexpected.length >
    0
  ) {
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
        LIVE_GT01_CONFIRMATION_FLAG,
      ),
  };
};

export const requireLiveGt01Confirmation = (
  args: readonly string[],
): LiveGt01Arguments => {
  const parsed =
    parseLiveGt01Arguments(
      args,
    );

  if (
    parsed.help
  ) {
    return parsed;
  }

  if (
    !parsed.confirmed
  ) {
    throw new Error(
      `Refusing live Google Trends GT01 collection without ${LIVE_GT01_CONFIRMATION_FLAG}.`,
    );
  }

  return parsed;
};

const resolveAppDataRoot = (): string => {
  const override =
    process.env
      .ROOFROOM_APP_DATA_ROOT;

  if (
    override !== undefined &&
    override.trim().length >
      0
  ) {
    return path.resolve(
      override,
    );
  }

  if (
    process.platform !==
    'darwin'
  ) {
    throw new Error(
      'ROOFROOM_APP_DATA_ROOT is required outside macOS for the M3 live GT01 collection.',
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

  if (
    override !== undefined &&
    override.trim().length >
      0
  ) {
    return path.resolve(
      override,
    );
  }

  return path.join(
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

const makeRequestedConfiguration =
  (): RequestedCollectionConfiguration => ({
    source_mode:
      'GOOGLE_TRENDS_UI',
    country_code:
      'TR',
    language_code:
      null,
    requested_date_start:
      LIVE_GT01_REQUESTED_DATE_START,
    requested_date_end:
      LIVE_GT01_REQUESTED_DATE_END,
    category_id:
      null,
    category_name:
      'All Categories',
    search_type:
      'Web Search',
    selection_type:
      'Search Term',
    dataset_type:
      'INTEREST_OVER_TIME',
  });

const waitForManualActionExit =
  async (): Promise<void> => {
    if (
      !process.stdin.isTTY ||
      !process.stdout.isTTY
    ) {
      console.error(
        'Manual action is required, but this process is not attached to an interactive terminal. The provider window will close when this command exits.',
      );
      return;
    }

    console.error(
      'Complete the required Google authentication/security step in the opened browser window.',
    );
    console.error(
      'After finishing, press Enter here to close this live command. Then rerun the same explicit command; collection is not resumed automatically.',
    );

    const readline =
      createInterface({
        input:
          process.stdin,
        output:
          process.stdout,
      });

    try {
      await readline.question(
        '',
      );
    } finally {
      readline.close();
    }
  };

const GENERIC_UI_DIAGNOSTIC_PATTERN =
  /^Google Trends UI contract failed during (QUERY_GROUP|GEOGRAPHY|DATE_RANGE|FIXED_FILTERS|DOWNLOAD|UNKNOWN_EXPORT_STAGE) \(GoogleTrends[A-Za-z]+Error\)\.$/u;

const QUERY_GROUP_UI_DIAGNOSTIC_PATTERN =
  /^Google Trends UI contract failed during QUERY_GROUP \(GoogleTrendsQueryGroupUiContractError; control=(INITIAL_QUERY_INPUT|SEARCH_TERM_SUGGESTION|ADD_COMPARISON|EMPTY_COMPARISON_SLOT|COMPARISON_QUERY_INPUT); observed_count=[0-9]+; query_index=[0-9]+\)\.$/u;

const GEOGRAPHY_UI_DIAGNOSTIC_PATTERN =
  /^Google Trends UI contract failed during GEOGRAPHY \(GoogleTrendsGeographyUiContractError; control=(GEOGRAPHY_PICKER|GEOGRAPHY_PICKER_BUTTON|GEOGRAPHY_SEARCH_INPUT|TURKEY_RESULT|APPLIED_GEOGRAPHY_LABEL); observed_count=[0-9]+\)\.$/u;

const DATE_RANGE_UI_DIAGNOSTIC_PATTERN =
  /^Google Trends UI contract failed during DATE_RANGE \(GoogleTrendsDateRangeUiContractError; control=(DATE_FILTER|CUSTOM_TIME_RANGE_OPTION|OK_BUTTON); observed_count=[0-9]+\)\.$/u;

const DATE_DIALOG_UI_DIAGNOSTIC_PATTERN =
  /^Google Trends UI contract failed during DATE_RANGE \(GoogleTrendsDateDialogContractError; control=(ARCHIVE_DIALOG|START_DATE_INPUT|END_DATE_INPUT); observed_count=[0-9]+\)\.$/u;

const DOWNLOAD_UI_DIAGNOSTIC_PATTERN =
  /^Google Trends UI contract failed during DOWNLOAD \(GoogleTrendsUiContractError; control=(INTEREST_OVER_TIME_HEADING|DOWNLOAD_BUTTON); observed_count=[0-9]+\)\.$/u;

export const safeResultSummary = (
  result:
    SourceCollectionResult,
): Record<string, unknown> => {
  if (
    result.result_type ===
    'ARTIFACT_PRODUCED'
  ) {
    return {
      result_type:
        result.result_type,
      preferred_filename:
        result.preferred_filename,
      media_type:
        result.media_type,
      byte_size:
        result.bytes.byteLength,
    };
  }

  if (
    result.result_type ===
    'MANUAL_ACTION_REQUIRED'
  ) {
    return {
      result_type:
        result.result_type,
    };
  }

  if (
    result.error_code ===
      'GOOGLE_TRENDS_UI_CONTRACT_ERROR' &&
    result.message !==
      null &&
    (
      GENERIC_UI_DIAGNOSTIC_PATTERN.test(
        result.message,
      ) ||
      QUERY_GROUP_UI_DIAGNOSTIC_PATTERN.test(
        result.message,
      ) ||
      GEOGRAPHY_UI_DIAGNOSTIC_PATTERN.test(
        result.message,
      ) ||
      DATE_RANGE_UI_DIAGNOSTIC_PATTERN.test(
        result.message,
      ) ||
      DATE_DIALOG_UI_DIAGNOSTIC_PATTERN.test(
        result.message,
      ) ||
      DOWNLOAD_UI_DIAGNOSTIC_PATTERN.test(
        result.message,
      )
    )
  ) {
    return {
      result_type:
        result.result_type,
      error_code:
        result.error_code,
      diagnostic:
        result.message,
    };
  }

  return {
    result_type:
      result.result_type,
    error_code:
      result.error_code,
  };
};

export const safeCoreStateSummary = (
  result:
    GoogleTrendsCoreRunResult,
): Record<string, unknown> => ({
  run_id:
    result.run.run_id,
  run_status:
    result.run.run_status,
  job_execution_status:
    result.job.execution_status,
  attempt_number:
    result.attempt
      ?.attempt_number ??
      null,
  validation_status:
    result.validation
      ?.validation_status ??
      'NOT_RUN',
  run_scoped_artifact:
    result.artifact === null
      ? null
      : {
          artifact_state:
            result.artifact
              .artifact_state,
          relative_path:
            result.artifact
              .relative_path,
          media_type:
            result.artifact
              .media_type,
          byte_size:
            result.artifact
              .byte_size,
          sha256:
            result.artifact
              .sha256,
        },
  validation:
    result.validation === null
      ? null
      : {
          checks_total:
            result.validation
              .checks_total,
          checks_passed:
            result.validation
              .checks_passed,
          checks_warning:
            result.validation
              .checks_warning,
          checks_failed:
            result.validation
              .checks_failed,
          validation_json_path:
            result.validation
              .validation_json_path,
        },
});

const main = async (): Promise<void> => {
  const parsed =
    requireLiveGt01Confirmation(
      process.argv.slice(2),
    );

  if (
    parsed.help
  ) {
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

  // Fail before browser creation and before any live provider request.
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
        LIVE_GT01_QUERY_GROUP_ID,
    );

  if (
    queryGroup ===
    undefined
  ) {
    throw new Error(
      `External query configuration does not contain ${LIVE_GT01_QUERY_GROUP_ID}.`,
    );
  }

  const gt01QueryConfig = {
    config_version:
      queryConfig.config_version,
    source_id:
      queryConfig.source_id,
    groups: [
      {
        query_group_id:
          queryGroup.query_group_id,
        query_group_name:
          queryGroup.query_group_name,
        queries:
          [...queryGroup.queries],
      },
    ],
  };

  const runtime =
    createGoogleTrendsRuntime(
      directories,
    );

  let manualAction =
    false;

  try {
    const coreResult =
      await runGoogleTrendsThroughCore({
        directories,
        query_config:
          gt01QueryConfig,
        requested_configuration:
          makeRequestedConfiguration(),
        application_version:
          process.env
            .npm_package_version ??
          '1.0.0',
        source:
          runtime.source,
      });

    const result =
      coreResult.source_result;

    if (result === null) {
      throw new Error(
        'Google Trends Core run completed without invoking the source collector.',
      );
    }

    console.log(
      JSON.stringify(
        {
          live_scope:
            'GT01',
          query_group_name:
            queryGroup.query_group_name,
          query_count:
            queryGroup.queries.length,
          requested_date_start:
            LIVE_GT01_REQUESTED_DATE_START,
          requested_date_end:
            LIVE_GT01_REQUESTED_DATE_END,
          ...safeResultSummary(
            result,
          ),
          core:
            safeCoreStateSummary(
              coreResult,
            ),
        },
        null,
        2,
      ),
    );

    if (
      result.result_type ===
      'MANUAL_ACTION_REQUIRED'
    ) {
      manualAction =
        true;

      await waitForManualActionExit();

      process.exitCode =
        3;
      return;
    }

    if (
      result.result_type !==
      'ARTIFACT_PRODUCED'
    ) {
      process.exitCode =
        2;
      return;
    }

    if (
      coreResult.job
        .execution_status !==
        'COMPLETED' ||
      coreResult.artifact ===
        null ||
      coreResult.validation ===
        null
    ) {
      console.error(
        'Live GT01 provider bytes were preserved as a Core candidate, but validation did not accept them. Treat the artifact as suspicious and do not silently use it.',
      );
      process.exitCode =
        2;
      return;
    }

    console.error(
      'Live GT01 vertical slice completed with an accepted validation status. No retry or refresh was attempted.',
    );
  } finally {
    // MANUAL_ACTION_REQUIRED intentionally keeps the provider page alive
    // only until the user acknowledges the terminal prompt above.
    await runtime.browser_manager
      .close();

    if (
      manualAction
    ) {
      console.error(
        'The app-owned browser context is now closed. Rerun the explicit command after manual authentication/security work is complete.',
      );
    }
  }
};

if (
  require.main ===
  module
) {
  main().catch(
    (error: unknown) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Unknown live GT01 collection error.',
      );
      process.exitCode =
        1;
    },
  );
}
