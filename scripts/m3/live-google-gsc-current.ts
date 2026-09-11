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

export const LIVE_GSC_CURRENT_START_DATE =
  '2026-06-12';

export const LIVE_GSC_CURRENT_END_DATE =
  '2026-09-09';

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
const WORKSPACE_NAME_PREFIX = '--workspace-name=';

export interface LiveGscCurrentArguments {
  help: boolean;
  confirmed: boolean;
  workspace_name: string;
}

export const parseLiveGscCurrentArguments = (
  args: readonly string[],
): LiveGscCurrentArguments => {
  const workspaceArguments = args.filter(
    (argument) =>
      argument.startsWith(WORKSPACE_NAME_PREFIX),
  );

  const allowed = new Set([
    HELP_FLAG,
    LIVE_GSC_CURRENT_CONFIRMATION_FLAG,
    ...workspaceArguments,
  ]);

  const unexpected = args.filter(
    (argument) => !allowed.has(argument),
  );

  if (
    unexpected.length > 0 ||
    workspaceArguments.length > 1
  ) {
    throw new Error(
      `Unsupported argument(s): ${[
        ...unexpected,
        ...workspaceArguments.slice(1),
      ].join(', ')}`,
    );
  }

  const workspaceName =
    workspaceArguments[0]
      ?.slice(WORKSPACE_NAME_PREFIX.length)
      .trim() ?? '';

  if (
    workspaceArguments.length === 1 &&
    !workspaceName
  ) {
    throw new Error(
      'GSC live CURRENT workspace name must be non-empty.',
    );
  }

  return {
    help: args.includes(HELP_FLAG),
    confirmed:
      args.includes(LIVE_GSC_CURRENT_CONFIRMATION_FLAG),
    workspace_name: workspaceName,
  };
};

export const requireLiveGscCurrentConfirmation = (
  args: readonly string[],
): LiveGscCurrentArguments => {
  const parsed = parseLiveGscCurrentArguments(args);

  if (parsed.help) return parsed;

  if (!parsed.confirmed) {
    throw new Error(
      `Refusing live GSC request without ${LIVE_GSC_CURRENT_CONFIRMATION_FLAG}.`,
    );
  }

  if (!parsed.workspace_name) {
    throw new Error(
      'GSC live CURRENT requires --workspace-name=<name>.',
    );
  }

  return parsed;
};

const usage = (): string => [
  'Usage:',
  '  bash scripts/m3/run-live-google-gsc-current.sh \\',
  `    ${LIVE_GSC_CURRENT_CONFIRMATION_FLAG} \\`,
  '    --workspace-name="Bitkimark Production"',
  '',
  'Fixed acceptance scope:',
  `  start_date: ${LIVE_GSC_CURRENT_START_DATE}`,
  `  end_date:   ${LIVE_GSC_CURRENT_END_DATE}`,
  '  dataset:    Query × Page',
  '  source:     Google Search Console official API',
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
          LIVE_GSC_CURRENT_START_DATE,
        end_date:
          LIVE_GSC_CURRENT_END_DATE,
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
          site_url: siteUrl,
          start_date:
            LIVE_GSC_CURRENT_START_DATE,
          end_date:
            LIVE_GSC_CURRENT_END_DATE,
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
              'GSC-CURRENT-001',
            query_group_id: null,
            source_context: {
              start_date:
                LIVE_GSC_CURRENT_START_DATE,
              end_date:
                LIVE_GSC_CURRENT_END_DATE,
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
      start_date:
        LIVE_GSC_CURRENT_START_DATE,
      end_date:
        LIVE_GSC_CURRENT_END_DATE,
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
