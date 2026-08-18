import {
  access,
} from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createInterface,
} from 'node:readline/promises';

import {
  BrowserManager,
} from '../../src/main/browser/browser-manager';
import {
  PersistentDownloadStore,
} from '../../src/main/browser/persistent-download-store';
import {
  PlaywrightChromiumLauncher,
} from '../../src/main/browser/playwright-browser-launcher';
import {
  loadQueryConfig,
} from '../../src/main/config/query-config-loader';
import {
  GoogleTrendsCollector,
} from '../../src/main/sources/google-trends/google-trends-collector';
import {
  validateGoogleTrendsInterestOverTimeCsv,
} from '../../src/main/sources/google-trends/google-trends-interest-over-time-validator';
import {
  GoogleTrendsSource,
} from '../../src/main/sources/google-trends/google-trends-source';
import type {
  ApplicationDirectories,
} from '../../src/shared/bootstrap-status';
import type {
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../src/shared/collection';

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

const ACCEPTED_VALIDATION_STATUSES =
  new Set([
    'VALID',
    'LOW_DATA',
    'NO_DATA',
  ] as const);

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
    '  - validates the returned bytes before reporting success',
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

const makeCollectionContext = (
  queryGroup: {
    query_group_id: string;
    query_group_name: string;
    queries: string[];
  },
): SourceCollectionContext => {
  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /[-:.]/gu,
        '',
      );

  const runId =
    `live_gt01_${timestamp}`;

  return {
    run_id:
      runId,
    job_id:
      `${runId}__google-trends__GT01`,
    attempt_id:
      `${runId}__attempt_1`,
    attempt_number:
      1,
    source_id:
      'google-trends',
    job_key:
      LIVE_GT01_QUERY_GROUP_ID,
    requested_configuration: {
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
    },
    query_group: {
      query_group_id:
        queryGroup.query_group_id,
      query_group_name:
        queryGroup.query_group_name,
      queries:
        [...queryGroup.queries],
    },
  };
};

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

const safeResultSummary = (
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

  return {
    result_type:
      result.result_type,
    error_code:
      result.error_code,
  };
};

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

  const context =
    makeCollectionContext(
      queryGroup,
    );

  const browserManager =
    new BrowserManager(
      directories,
      new PlaywrightChromiumLauncher(),
    );

  const collector =
    new GoogleTrendsCollector({
      browser_manager:
        browserManager,
      download_store:
        new PersistentDownloadStore(
          directories,
        ),
    });

  const source =
    new GoogleTrendsSource(
      collector,
    );

  let manualAction =
    false;

  try {
    const result =
      await source.collect(
        context,
      );

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

    const validation =
      validateGoogleTrendsInterestOverTimeCsv({
        bytes:
          result.bytes,
        expected_queries:
          queryGroup.queries,
        requested_date_start:
          LIVE_GT01_REQUESTED_DATE_START,
        requested_date_end:
          LIVE_GT01_REQUESTED_DATE_END,
        expected_category_label:
          'All categories',
        expected_geography_label:
          'Türkiye',
      });

    console.log(
      JSON.stringify(
        {
          validation_status:
            validation.validation_status,
          checks_total:
            validation.checks_total,
          checks_passed:
            validation.checks_passed,
          checks_warning:
            validation.checks_warning,
          checks_failed:
            validation.checks_failed,
          accepted:
            ACCEPTED_VALIDATION_STATUSES.has(
              validation.validation_status as
                | 'VALID'
                | 'LOW_DATA'
                | 'NO_DATA',
            ),
        },
        null,
        2,
      ),
    );

    if (
      !ACCEPTED_VALIDATION_STATUSES.has(
        validation.validation_status as
          | 'VALID'
          | 'LOW_DATA'
          | 'NO_DATA',
      )
    ) {
      console.error(
        'Live GT01 download was preserved but validation did not accept it. Treat the artifact as suspicious and do not silently use it.',
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
    await browserManager.close();

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
