import * as os from 'node:os';
import * as path from 'node:path';
import { mkdir } from 'node:fs/promises';

import {
  CollectionOrchestrator,
} from '../../src/main/core/collection-orchestrator';
import {
  CollectionValidatorRegistry,
} from '../../src/main/core/collection-validator-registry';
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
  createGuardedSerpApiLiveSmokeSource,
} from '../../src/main/sources/serpapi/serpapi-live-smoke';
import {
  SerpApiRuntimeFactory,
} from '../../src/main/sources/serpapi/serpapi-runtime';
import {
  SerpApiValidator,
} from '../../src/main/sources/serpapi/serpapi-validator';
import {
  createSerpApiJobPlans,
} from '../../src/main/sources/serpapi/serpapi-job-plans';
import {
  SERPAPI_SOURCE_ID,
} from '../../src/shared/serpapi';
import type {
  ApplicationDirectories,
} from '../../src/shared/bootstrap-status';

export const SERPAPI_LIVE_SMOKE_CONFIRMATION_FLAG =
  '--confirm-live-serpapi';
const HELP_FLAG = '--help';
const QUERY_PREFIX = '--query=';
const WORKSPACE_PREFIX = '--workspace=';
const DEFAULT_QUERY = 'ficus çeşitleri';

export interface SerpApiLiveSmokeArguments {
  help: boolean;
  confirmed: boolean;
  query: string;
  workspace_id: string | null;
}

export const parseSerpApiLiveSmokeArguments = (
  args: readonly string[],
): SerpApiLiveSmokeArguments => {
  const queryArguments = args.filter((argument) => argument.startsWith(QUERY_PREFIX));
  const workspaceArguments = args.filter((argument) => argument.startsWith(WORKSPACE_PREFIX));
  const allowed = new Set([HELP_FLAG, SERPAPI_LIVE_SMOKE_CONFIRMATION_FLAG, ...queryArguments, ...workspaceArguments]);
  const unexpected = args.filter((argument) => !allowed.has(argument));
  if (unexpected.length > 0 || queryArguments.length > 1 || workspaceArguments.length > 1) {
    throw new Error(`Unsupported argument(s): ${[...unexpected, ...queryArguments.slice(1), ...workspaceArguments.slice(1)].join(', ')}`);
  }
  const query = queryArguments[0]?.slice(QUERY_PREFIX.length) ?? DEFAULT_QUERY;
  if (!query.trim()) throw new Error('SerpApi live smoke query must be non-empty.');
  const workspaceId = workspaceArguments[0]?.slice(WORKSPACE_PREFIX.length) ?? null;
  if (workspaceArguments.length === 1 && !workspaceId?.trim()) throw new Error('SerpApi live smoke workspace must be non-empty.');
  return {
    help: args.includes(HELP_FLAG),
    confirmed: args.includes(SERPAPI_LIVE_SMOKE_CONFIRMATION_FLAG),
    query,
    workspace_id: workspaceId,
  };
};

export const requireSerpApiLiveSmokeConfirmation = (
  args: readonly string[],
): SerpApiLiveSmokeArguments => {
  const parsed = parseSerpApiLiveSmokeArguments(args);
  if (parsed.help) return parsed;
  if (!parsed.confirmed) {
    throw new Error(`Refusing live SerpApi request without ${SERPAPI_LIVE_SMOKE_CONFIRMATION_FLAG}.`);
  }
  if (!parsed.workspace_id) {
    throw new Error('SerpApi live smoke requires --workspace=<workspace_id>.');
  }
  return parsed;
};

const usage = (): string => [
  'Usage:',
  `  npm run m3:live-serpapi -- ${SERPAPI_LIVE_SMOKE_CONFIRMATION_FLAG} --workspace=<workspace_id>`,
  '',
  'Scope:',
  '  - one explicit Google SERP query, first page only',
  '  - Türkiye / Turkish / Desktop / Google',
  '  - persists through the existing Core Run/Job/Attempt/artifact/validation flow',
  '',
  'Safety:',
  '  - no automatic retry, second page, mobile, ads, shopping, or keyword expansion',
  '  - stops on authentication, quota, provider, network, or timeout failure',
  '  - reports only safe Run/Job/Attempt/Artifact/validation status',
  '  - never prints the API key or raw provider JSON',
].join('\n');

const createDirectories = (appDataRoot: string): ApplicationDirectories => ({
  app_data_root: appDataRoot,
  config: path.join(appDataRoot, 'config'),
  data: path.join(appDataRoot, 'data'),
  runs: path.join(appDataRoot, 'data', 'runs'),
  database: path.join(appDataRoot, 'database'),
  browser_profiles: path.join(appDataRoot, 'browser-profiles'),
  logs: path.join(appDataRoot, 'logs'),
  public_downloads: path.join(os.homedir(), 'Downloads', 'RoofRoom Data Collector'),
});

const main = async (): Promise<void> => {
  const parsed = requireSerpApiLiveSmokeConfirmation(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return;
  }

  const { app } = await import('electron');
  await app.whenReady();
  const directories = createDirectories(path.join(app.getPath('userData'), 'app-data'));
  await Promise.all([
    directories.database,
    directories.data,
    directories.runs,
    directories.logs,
  ].map((directory) => mkdir(directory, { recursive: true })));
  const bootstrap = initializeDatabase(directories);
  if (bootstrap.status !== 'READY') throw new Error(bootstrap.error);
  const repository = new StateRepository(getDatabasePath(directories));
  try {
    if (!repository.getWorkspace(parsed.workspace_id as string)) {
      throw new Error(`Unknown Workspace: ${parsed.workspace_id}`);
    }
    const { ElectronSafeStorageCredentialStore } = await import('../../src/main/core/electron-safe-storage-credential-store');
    const store = new ElectronSafeStorageCredentialStore(path.join(directories.app_data_root, 'credentials'));
    const runtime = new SerpApiRuntimeFactory(repository, store);
    const source = createGuardedSerpApiLiveSmokeSource(runtime, {
      workspace_id: parsed.workspace_id as string,
      confirmation: 'I UNDERSTAND THIS WILL CALL SERPAPI',
    });
    const context = {
      query: parsed.query,
      country_code: 'TR' as const,
      language_code: 'tr' as const,
      device: 'desktop' as const,
      engine: 'google' as const,
      organic_limit: 10 as const,
      snapshot_date: '2026-09-10',
    };
    const planned = repository.createRunFromJobPlans({
      workspace_id: parsed.workspace_id as string,
      application_version: app.getVersion(),
      configuration_snapshot: {
        source_id: SERPAPI_SOURCE_ID,
        dataset_type: 'GOOGLE_SERP',
        reference_date: context.snapshot_date,
      },
      job_plans: createSerpApiJobPlans([{
        job_key: 'SERP-LIVE-001',
        query: parsed.query,
      }], context),
    });
    const registry = new SourceRegistry();
    registry.register(source);
    const validators = new CollectionValidatorRegistry();
    validators.register(SERPAPI_SOURCE_ID, new SerpApiValidator());
    const orchestrator = new CollectionOrchestrator(
      repository,
      new StorageManager(directories),
      registry,
      validators,
      new RunManager(repository),
    );
    const result = await orchestrator.runUntilBlocked(planned.run.run_id);
    console.log(JSON.stringify({
      run_id: planned.run.run_id,
      job_count: planned.jobs.length,
      stopped_because: result.stopped_because,
      step_outcomes: result.steps.map((step) => step.outcome),
    }));
  } finally {
    repository.close();
    app.quit();
  }
};

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'SerpApi live smoke failed.');
    process.exitCode = 1;
  });
}
