import * as os from 'node:os';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

import {
  CollectionOrchestrator,
} from '../../src/main/core/collection-orchestrator';
import {
  RunManager,
} from '../../src/main/core/run-manager';
import {
  SourceRegistry,
} from '../../src/main/core/source-registry';
import {
  initializeDatabase,
  getDatabasePath,
} from '../../src/main/storage/database';
import {
  StateRepository,
} from '../../src/main/storage/state-repository';
import {
  StorageManager,
} from '../../src/main/storage/storage-manager';
import {
  GoogleApiRuntimeFactory,
} from '../../src/main/sources/google-api/google-api-runtime';
import {
  GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
} from '../../src/main/sources/google-api/google-auth';
import {
  createProductionCollectionRuntime,
} from '../../src/main/app/production-collection-runtime';
import {
  GSC_QUERY_PAGE_SOURCE_ID,
} from '../../src/shared/google-api';
import type {
  CollectingDataSourceModule,
} from '../../src/shared/collection';
import type {
  ApplicationDirectories,
} from '../../src/shared/bootstrap-status';

export const LIVE_GSC_CURRENT_CONFIRMATION_FLAG =
  '--confirm-live-gsc';

export type LiveGscPeriod =
  | 'current'
  | 'long';

export type LiveGscDatePolicy =
  | 'LAST_90_COMPLETE_DAYS'
  | 'LAST_16_MONTHS_TO_YESTERDAY';

export interface LiveGscResolvedDateRange {
  period: LiveGscPeriod;
  date_policy: LiveGscDatePolicy;
  reference_date: string;
  start_date: string;
  end_date: string;
  job_key: 'GSC-CURRENT-001' | 'GSC-LONG-001';
}

const ISO_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/u;

const parseIsoDate = (
  value: string,
): {
  year: number;
  month: number;
  day: number;
} => {
  const match = ISO_DATE_PATTERN.exec(value);

  if (!match) {
    throw new Error(`Invalid ISO date: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const candidate = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid ISO date: ${value}`);
  }

  return { year, month, day };
};

const formatIsoDate = (
  year: number,
  month: number,
  day: number,
): string =>
  [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');

const subtractDays = (
  value: string,
  days: number,
): string => {
  const parsed = parseIsoDate(value);

  const date = new Date(
    Date.UTC(
      parsed.year,
      parsed.month - 1,
      parsed.day,
    ),
  );

  date.setUTCDate(
    date.getUTCDate() - days,
  );

  return formatIsoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
};

const subtractCalendarMonthsClamped = (
  value: string,
  months: number,
): string => {
  const parsed = parseIsoDate(value);

  const absoluteMonth =
    parsed.year * 12 +
    (parsed.month - 1) -
    months;

  const targetYear =
    Math.floor(absoluteMonth / 12);

  const targetMonthIndex =
    ((absoluteMonth % 12) + 12) % 12;

  const lastDay =
    new Date(
      Date.UTC(
        targetYear,
        targetMonthIndex + 1,
        0,
      ),
    ).getUTCDate();

  return formatIsoDate(
    targetYear,
    targetMonthIndex + 1,
    Math.min(parsed.day, lastDay),
  );
};

export const resolveLiveGscReferenceDate = (
  now: Date = new Date(),
): string =>
  formatIsoDate(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
  );

export const resolveLiveGscDateRange = (
  period: LiveGscPeriod,
  referenceDate: string,
): LiveGscResolvedDateRange => {
  parseIsoDate(referenceDate);

  const endDate =
    subtractDays(referenceDate, 1);

  if (period === 'current') {
    return {
      period,
      date_policy:
        'LAST_90_COMPLETE_DAYS',
      reference_date:
        referenceDate,
      start_date:
        subtractDays(referenceDate, 90),
      end_date:
        endDate,
      job_key:
          'GSC-CURRENT-001',
    };
  }

  return {
    period,
    date_policy:
      'LAST_16_MONTHS_TO_YESTERDAY',
    reference_date:
      referenceDate,
    start_date:
      subtractCalendarMonthsClamped(
        referenceDate,
        16,
      ),
    end_date:
      endDate,
    job_key:
      'GSC-LONG-001',
  };
};

export const resolveLiveGscApplicationVersion = (): string => {
  const packageJsonPath = path.join(
    process.cwd(),
    'package.json',
  );

  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as { version?: unknown };

  if (
    typeof packageJson.version !== 'string' ||
    !packageJson.version.trim()
  ) {
    throw new Error(
      'RoofRoom package version is unavailable.',
    );
  }

  return packageJson.version;
};

const HELP_FLAG = '--help';
const WORKSPACE_NAME_PREFIX =
  '--workspace-name=';
const PERIOD_PREFIX =
  '--period=';
const REFERENCE_DATE_PREFIX =
  '--reference-date=';

export interface LiveGscCurrentArguments {
  help: boolean;
  confirmed: boolean;
  workspace_name: string;
  period: LiveGscPeriod | null;
  reference_date: string | null;
}

export const parseLiveGscCurrentArguments = (
  args: readonly string[],
): LiveGscCurrentArguments => {
  const workspaceArguments =
    args.filter(
      (argument) =>
        argument.startsWith(
          WORKSPACE_NAME_PREFIX,
        ),
    );

  const periodArguments =
    args.filter(
      (argument) =>
        argument.startsWith(
          PERIOD_PREFIX,
        ),
    );

  const referenceDateArguments =
    args.filter(
      (argument) =>
        argument.startsWith(
          REFERENCE_DATE_PREFIX,
        ),
    );

  const allowed = new Set([
    HELP_FLAG,
    LIVE_GSC_CURRENT_CONFIRMATION_FLAG,
    ...workspaceArguments,
    ...periodArguments,
    ...referenceDateArguments,
  ]);

  const unexpected =
    args.filter(
      (argument) =>
        !allowed.has(argument),
    );

  if (
    unexpected.length > 0 ||
    workspaceArguments.length > 1 ||
    periodArguments.length > 1 ||
    referenceDateArguments.length > 1
  ) {
    throw new Error(
      `Unsupported argument(s): ${[
        ...unexpected,
        ...workspaceArguments.slice(1),
        ...periodArguments.slice(1),
        ...referenceDateArguments.slice(1),
      ].join(', ')}`,
    );
  }

  const workspaceName =
    workspaceArguments[0]
      ?.slice(
        WORKSPACE_NAME_PREFIX.length,
      )
      .trim() ?? '';

  if (
    workspaceArguments.length === 1 &&
    !workspaceName
  ) {
    throw new Error(
      'GSC live workspace name must be non-empty.',
    );
  }

  const rawPeriod =
    periodArguments[0]
      ?.slice(PERIOD_PREFIX.length)
      .trim() ?? '';

  if (
    rawPeriod &&
    rawPeriod !== 'current' &&
    rawPeriod !== 'long'
  ) {
    throw new Error(
      `Unsupported GSC period: ${rawPeriod}`,
    );
  }

  const referenceDate =
    referenceDateArguments[0]
      ?.slice(
        REFERENCE_DATE_PREFIX.length,
      )
      .trim() ?? '';

  if (referenceDate) {
    parseIsoDate(referenceDate);
  }

  return {
    help:
      args.includes(HELP_FLAG),
    confirmed:
      args.includes(
        LIVE_GSC_CURRENT_CONFIRMATION_FLAG,
      ),
    workspace_name:
      workspaceName,
    period:
      rawPeriod
        ? rawPeriod as LiveGscPeriod
        : null,
    reference_date:
      referenceDate || null,
  };
};

export const requireLiveGscCurrentConfirmation = (
  args: readonly string[],
): LiveGscCurrentArguments => {
  const parsed =
    parseLiveGscCurrentArguments(args);

  if (parsed.help) return parsed;

  if (!parsed.confirmed) {
    throw new Error(
      `Refusing live GSC request without ${LIVE_GSC_CURRENT_CONFIRMATION_FLAG}.`,
    );
  }

  if (!parsed.workspace_name) {
    throw new Error(
      'GSC live request requires --workspace-name=<name>.',
    );
  }

  if (!parsed.period) {
    throw new Error(
      'GSC live request requires --period=current|long.',
    );
  }

  return parsed;
};

const usage = (): string => [
  'Usage:',
  '  bash scripts/m3/run-live-google-gsc-current.sh \\',
  `    ${LIVE_GSC_CURRENT_CONFIRMATION_FLAG} \\`,
  '    --workspace-name="Bitkimark Production" \\',
  '    --period=current|long \\',
  '    [--reference-date=YYYY-MM-DD]',
  '',
  'Dynamic date policies:',
  '  current: last 90 complete days ending yesterday',
  '  long: reference date minus 16 calendar months through yesterday',
  '  reference date defaults to the local execution date',
  '',
  'Dataset: Query × Page',
  'Source: Google Search Console official API',
  '',
  'Safety:',
  '  - uses the existing encrypted Workspace credential',
  '  - performs one explicitly confirmed live GSC collection',
  '  - no automatic provider retry',
  '  - persists through Core Run/Job/Attempt/artifact/validation',
  '  - never prints OAuth tokens, client secrets, or raw provider JSON',
].join('\n');

const createDirectories = (
  appDataRoot: string,
): ApplicationDirectories => ({
  app_data_root: appDataRoot,
  config: path.join(appDataRoot, 'config'),
  data: path.join(appDataRoot, 'data'),
  runs: path.join(appDataRoot, 'data', 'runs'),
  database: path.join(appDataRoot, 'database'),
  browser_profiles: path.join(
    appDataRoot,
    'browser-profiles',
  ),
  logs: path.join(appDataRoot, 'logs'),
  public_downloads: path.join(
    os.homedir(),
    'Downloads',
    'RoofRoom Data Collector',
  ),
});

const inertGoogleTrendsSource = {
  id: 'google-trends',
  name: 'Google Trends',
  sourceMode: 'GOOGLE_TRENDS_UI',
  datasetTypes: ['INTEREST_OVER_TIME'],
  getCapabilities: () => ({
    requires_browser: true,
    requires_oauth: false,
    may_require_manual_login: true,
    supports_custom_date_range: true,
    supports_direct_export: true,
    supports_api: false,
    supports_resume: false,
    max_concurrency: 1,
  }),
  checkReadiness: async () => ({
    source_id: 'google-trends',
    readiness_status: 'READY',
    checked_at: new Date().toISOString(),
    message: null,
  }),
  collect: async () => ({
    result_type: 'FAILED',
    error_code: 'NOT_USED_BY_GSC_LIVE_HARNESS',
    message: 'Google Trends is not used by the GSC live harness.',
  }),
} as CollectingDataSourceModule;

const main = async (): Promise<void> => {
  const parsed =
    requireLiveGscCurrentConfirmation(
      process.argv.slice(2),
    );

  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }

  if (parsed.period === null) {
    throw new Error(
      'GSC period is unavailable after confirmation.',
    );
  }

  const referenceDate =
    parsed.reference_date ??
    resolveLiveGscReferenceDate();

  const dateRange =
    resolveLiveGscDateRange(
      parsed.period,
      referenceDate,
    );

  const { app } = await import('electron');

  app.setPath(
    'userData',
    path.join(
      app.getPath('appData'),
      'RoofRoom Data Collector',
    ),
  );

  await app.whenReady();

  const directories = createDirectories(
    path.join(
      app.getPath('userData'),
      'app-data',
    ),
  );

  await Promise.all([
    directories.database,
    directories.data,
    directories.runs,
    directories.logs,
    path.join(
      directories.app_data_root,
      'credentials',
    ),
  ].map((directory) =>
    mkdir(directory, { recursive: true }),
  ));

  const bootstrap =
    initializeDatabase(directories);

  if (bootstrap.status !== 'READY') {
    throw new Error(bootstrap.error);
  }

  const repository = new StateRepository(
    getDatabasePath(directories),
  );

  try {
    const matches = repository
      .listWorkspaces()
      .filter(
        (workspace) =>
          workspace.workspace_name ===
          parsed.workspace_name,
      );

    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? `Unknown Workspace: ${parsed.workspace_name}`
          : `Multiple Workspaces share the name: ${parsed.workspace_name}`,
      );
    }

    const workspace = matches[0];

    const connection =
      repository.getSourceConnection(
        workspace.workspace_id,
        GSC_QUERY_PAGE_SOURCE_ID,
      );

    if (!connection) {
      throw new Error(
        'Google Search Console connection is not configured.',
      );
    }

    if (!connection.credential_ref) {
      throw new Error(
        'Google Search Console credential is not configured.',
      );
    }

    if (
      connection.safe_metadata
        .authorization_state !== 'AUTHORIZED'
    ) {
      throw new Error(
        'Google Search Console connection is not AUTHORIZED.',
      );
    }

    const siteUrl =
      typeof connection.safe_metadata.site_url ===
        'string'
        ? connection.safe_metadata.site_url
        : null;

    if (!siteUrl) {
      throw new Error(
        'Google Search Console site_url is missing.',
      );
    }

    const {
      ElectronSafeStorageCredentialStore,
    } = await import(
      '../../src/main/core/electron-safe-storage-credential-store'
    );

    const credentialStore =
      new ElectronSafeStorageCredentialStore(
        path.join(
          directories.app_data_root,
          'credentials',
        ),
      );

    const googleApi =
      new GoogleApiRuntimeFactory(
        repository,
        credentialStore,
      );

    const liveSource =
      googleApi.createLiveSearchConsoleSmokeSource({
        workspace_id: workspace.workspace_id,
        start_date:
          dateRange.start_date,
        end_date:
          dateRange.end_date,
        confirmation:
          GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
      });

    const productionRuntime =
      createProductionCollectionRuntime({
        repository,
        credentialStore,
        directories,
        googleTrendsSource:
          inertGoogleTrendsSource,
      });

    const sourceRegistry =
      new SourceRegistry();

    sourceRegistry.register(liveSource);

    const planned =
      repository.createRunFromJobPlans({
        workspace_id: workspace.workspace_id,
        application_version:
          resolveLiveGscApplicationVersion(),
        configuration_snapshot: {
          source_id:
            GSC_QUERY_PAGE_SOURCE_ID,
          source_mode: 'OFFICIAL_API',
          dataset_type: 'QUERY_PAGE',
      period:
        dateRange.period,
      date_policy:
        dateRange.date_policy,
      reference_date:
        dateRange.reference_date,
      site_url: siteUrl,
          start_date:
          dateRange.start_date,
          end_date:
          dateRange.end_date,
          dimensions: [
            'query',
            'page',
          ],
        },
        job_plans: [
          {
            source_id:
              GSC_QUERY_PAGE_SOURCE_ID,
            job_key:
              dateRange.job_key,
            query_group_id: null,
            source_context: {
          period:
            dateRange.period,
          date_policy:
            dateRange.date_policy,
          reference_date:
            dateRange.reference_date,
          start_date:
          dateRange.start_date,
              end_date:
          dateRange.end_date,
            },
          },
        ],
      });

    const orchestrator =
      new CollectionOrchestrator(
        repository,
        new StorageManager(directories),
        sourceRegistry,
        productionRuntime.validator_registry,
        new RunManager(repository),
      );

    const result =
      await orchestrator.runUntilBlocked(
        planned.run.run_id,
      );

    console.log(JSON.stringify({
      workspace_id:
        workspace.workspace_id,
      workspace_name:
        workspace.workspace_name,
      source_id:
        GSC_QUERY_PAGE_SOURCE_ID,
      site_url:
    siteUrl,
  period:
    dateRange.period,
  date_policy:
    dateRange.date_policy,
  reference_date:
    dateRange.reference_date,
  start_date:
          dateRange.start_date,
      end_date:
          dateRange.end_date,
      run_id:
        planned.run.run_id,
      job_id:
        planned.jobs[0]?.job_id ?? null,
      stopped_because:
        result.stopped_because,
      step_outcomes:
        result.steps.map(
          (step) => step.outcome,
        ),
    }, null, 2));
  } finally {
    repository.close();
    app.quit();
  }
};

if (
  typeof process.versions.electron ===
  'string'
) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Google GSC CURRENT live collection failed.',
    );
    process.exitCode = 1;
  });
}
