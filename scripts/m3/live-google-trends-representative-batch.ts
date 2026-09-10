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
  MIGRATION_COMPATIBILITY_WORKSPACE_ID,
} from '../../src/main/storage/database';
import {
  runGoogleTrendsBatchThroughCore,
  type GoogleTrendsCoreBatchRunResult,
  type GoogleTrendsCoreJobResult,
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

export const LIVE_REPRESENTATIVE_BATCH_CONFIRMATION_FLAG =
  '--confirm-live-representative-batch';

export const LIVE_REPRESENTATIVE_BATCH_GROUP_IDS = [
  'GT01',
  'GT02',
] as const;

export const LIVE_REPRESENTATIVE_BATCH_REQUESTED_DATE_START =
  '2024-08-18';

export const LIVE_REPRESENTATIVE_BATCH_REQUESTED_DATE_END =
  '2026-08-17';

const HELP_FLAG =
  '--help';

const usage = (): string =>
  [
    'Usage:',
    `  npm run m3:live-batch -- ${LIVE_REPRESENTATIVE_BATCH_CONFIRMATION_FLAG}`,
    '',
    'Scope:',
    '  - loads exactly GT01 then GT02 from external app-data query-groups.yaml',
    `  - requests ${LIVE_REPRESENTATIVE_BATCH_REQUESTED_DATE_START} through ${LIVE_REPRESENTATIVE_BATCH_REQUESTED_DATE_END}`,
    '  - Türkiye / All Categories / Web Search / Search Term',
    '  - executes sequentially through one shared Core run',
    '  - persists and validates each Interest over time artifact independently',
    '',
    'Safety:',
    '  - uses the app-owned persistent google browser profile',
    '  - makes no automatic refresh or retry',
    '  - stops on RATE_LIMITED or MANUAL_ACTION_REQUIRED',
    '  - never prints raw CSV, query strings, page HTML, URLs, cookies, or session state',
  ].join('\n');

export interface LiveRepresentativeBatchArguments {
  help: boolean;
  confirmed: boolean;
}

export const parseLiveRepresentativeBatchArguments = (
  args: readonly string[],
): LiveRepresentativeBatchArguments => {
  const allowed =
    new Set([
      HELP_FLAG,
      LIVE_REPRESENTATIVE_BATCH_CONFIRMATION_FLAG,
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
        LIVE_REPRESENTATIVE_BATCH_CONFIRMATION_FLAG,
      ),
  };
};

export const requireLiveRepresentativeBatchConfirmation = (
  args: readonly string[],
): LiveRepresentativeBatchArguments => {
  const parsed =
    parseLiveRepresentativeBatchArguments(
      args,
    );

  if (
    !parsed.help &&
    !parsed.confirmed
  ) {
    throw new Error(
      `Refusing representative Google Trends batch without ${LIVE_REPRESENTATIVE_BATCH_CONFIRMATION_FLAG}.`,
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
    override.trim().length > 0
  ) {
    return path.resolve(
      override,
    );
  }

  if (process.platform !== 'darwin') {
    throw new Error(
      'ROOFROOM_APP_DATA_ROOT is required outside macOS for the representative Google Trends batch.',
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

const makeRequestedConfiguration =
  (): RequestedCollectionConfiguration => ({
    source_mode:
      'GOOGLE_TRENDS_UI',
    country_code:
      'TR',
    language_code:
      null,
    requested_date_start:
      LIVE_REPRESENTATIVE_BATCH_REQUESTED_DATE_START,
    requested_date_end:
      LIVE_REPRESENTATIVE_BATCH_REQUESTED_DATE_END,
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

export const safeRepresentativeSourceSummary = (
  result:
    SourceCollectionResult | null,
): Record<string, unknown> | null => {
  if (result === null) {
    return null;
  }

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

  return {
    result_type:
      result.result_type,
    error_code:
      result.error_code,
  };
};

export const safeRepresentativeJobSummary = (
  result:
    GoogleTrendsCoreJobResult,
): Record<string, unknown> => ({
  query_group_id:
    result.job.query_group_id,
  execution_status:
    result.job.execution_status,
  validation_status:
    result.job.validation_status,
  attempt_number:
    result.attempt
      ?.attempt_number ??
      null,
  source_result:
    safeRepresentativeSourceSummary(
      result.source_result,
    ),
  artifact:
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
          validation_status:
            result.validation
              .validation_status,
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

export const safeRepresentativeBatchSummary = (
  result:
    GoogleTrendsCoreBatchRunResult,
): Record<string, unknown> => ({
  run_id:
    result.run.run_id,
  run_status:
    result.run.run_status,
  stopped_because:
    result.orchestration
      .stopped_because,
  jobs:
    result.jobs.map(
      safeRepresentativeJobSummary,
    ),
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
      'Complete the required Google authentication/security step in the opened browser window, then press Enter here. Collection is not resumed automatically.',
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

const main = async (): Promise<void> => {
  const parsed =
    requireLiveRepresentativeBatchConfirmation(
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

  const groups =
    LIVE_REPRESENTATIVE_BATCH_GROUP_IDS.map(
      (groupId) => {
        const group =
          queryConfig.groups.find(
            (candidate) =>
              candidate.query_group_id ===
              groupId,
          );

        if (group === undefined) {
          throw new Error(
            `External query configuration does not contain ${groupId}.`,
          );
        }

        return {
          query_group_id:
            group.query_group_id,
          query_group_name:
            group.query_group_name,
          queries:
            [...group.queries],
        };
      },
    );

  const runtime =
    createGoogleTrendsRuntime(
      directories,
    );

  let manualAction =
    false;

  try {
    const result =
      await runGoogleTrendsBatchThroughCore({
        workspace_id:
          MIGRATION_COMPATIBILITY_WORKSPACE_ID,
        directories,
        query_config: {
          config_version:
            queryConfig.config_version,
          source_id:
            queryConfig.source_id,
          groups,
        },
        requested_configuration:
          makeRequestedConfiguration(),
        application_version:
          process.env
            .npm_package_version ??
          '1.0.0',
        source:
          runtime.source,
      });

    console.log(
      JSON.stringify(
        {
          live_scope:
            [...LIVE_REPRESENTATIVE_BATCH_GROUP_IDS],
          requested_date_start:
            LIVE_REPRESENTATIVE_BATCH_REQUESTED_DATE_START,
          requested_date_end:
            LIVE_REPRESENTATIVE_BATCH_REQUESTED_DATE_END,
          core:
            safeRepresentativeBatchSummary(
              result,
            ),
        },
        null,
        2,
      ),
    );

    const manual =
      result.jobs.some(
        (entry) =>
          entry.source_result
            ?.result_type ===
            'MANUAL_ACTION_REQUIRED',
      );

    if (manual) {
      manualAction =
        true;
      await waitForManualActionExit();
      process.exitCode = 3;
      return;
    }

    const rateLimited =
      result.jobs.some(
        (entry) =>
          entry.source_result !==
            null &&
          entry.source_result
            .result_type ===
            'FAILED' &&
          entry.source_result
            .error_code ===
            'RATE_LIMITED',
      );

    if (rateLimited) {
      console.error(
        'Google Trends rate limiting detected. The representative batch stopped without refresh or retry.',
      );
      process.exitCode = 4;
      return;
    }

    const accepted =
      result.run.run_status ===
        'COMPLETED' &&
      result.jobs.every(
        (entry) =>
          entry.job
            .execution_status ===
            'COMPLETED' &&
          entry.artifact
            ?.artifact_state ===
            'ACCEPTED' &&
          entry.validation !==
            null,
      );

    if (!accepted) {
      console.error(
        'Representative batch did not reach fully accepted Core state. No automatic retry was attempted.',
      );
      process.exitCode = 2;
      return;
    }

    console.error(
      'Representative GT01+GT02 batch completed with accepted validation states. No retry or refresh was attempted.',
    );
  } finally {
    await runtime.browser_manager
      .close();

    if (manualAction) {
      console.error(
        'The app-owned browser context is now closed. Rerun the explicit command after manual provider work is complete.',
      );
    }
  }
};

if (require.main === module) {
  main().catch(
    (error: unknown) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Unknown representative Google Trends batch error.',
      );
      process.exitCode = 1;
    },
  );
}
