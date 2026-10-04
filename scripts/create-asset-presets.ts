import * as os from 'node:os';
import * as path from 'node:path';
import { mkdir } from 'node:fs/promises';

import type {
  ApplicationDirectories,
} from '../src/shared/bootstrap-status';

import {
  initializeDatabase,
  getDatabasePath,
} from '../src/main/storage/database';

import {
  StateRepository,
} from '../src/main/storage/state-repository';

import {
  createGoogleAdsGrowthRebuildPreset,
  GOOGLE_ADS_GROWTH_REBUILD_PRESET_NAME,
} from '../src/main/presets/google-ads-growth-rebuild-preset';

import {
  BLOG_AGENTIC_CONTENT_PRESET_WINDOWS,
  createBlogAgenticContentPreset,
  getBlogAgenticContentPresetName,
} from '../src/main/presets/blog-agentic-content-preset';

import type {
  ReusableCollectionConfiguration,
  SavedCollectionPresetRecord,
} from '../src/shared/collection-configuration';

const WORKSPACE_PREFIX = '--workspace-id=';

const LEGACY_GOOGLE_ADS_GROWTH_PRESET_NAME =
  'Google Ads Growth Rebuild';

const LEGACY_BLOG_AGENTIC_CONTENT_PRESET_NAME =
  'Blog Agentic Content Research';

const valueFor = (
  args: readonly string[],
  prefix: string,
): string => {
  const value =
    args.find((arg) => arg.startsWith(prefix))
      ?.slice(prefix.length)
      .trim();

  if (!value) {
    throw new Error(`Missing required argument: ${prefix}<value>`);
  }

  return value;
};

const createDirectories = (
  root: string,
): ApplicationDirectories => ({
  app_data_root: root,
  config: path.join(root, 'config'),
  data: path.join(root, 'data'),
  runs: path.join(root, 'data', 'runs'),
  database: path.join(root, 'database'),
  browser_profiles: path.join(root, 'browser-profiles'),
  logs: path.join(root, 'logs'),
  public_downloads: path.join(
    os.homedir(),
    'Downloads',
    'RoofRoom Data Collector',
  ),
});

const reconcilePreset = (
  repository: StateRepository,
  workspaceId: string,
  input: {
    preset_name: string;
    legacy_names?: readonly string[];
    reusable_configuration:
      ReusableCollectionConfiguration;
  },
): SavedCollectionPresetRecord => {
  const candidateNames =
    new Set([
      input.preset_name,
      ...(input.legacy_names ?? []),
    ]);

  const matches =
    repository
      .listSavedCollectionPresets(
        workspaceId,
      )
      .filter(
        (preset) =>
          candidateNames.has(
            preset.preset_name,
          ),
      );

  if (matches.length > 1) {
    throw new Error(
      [
        'Saved Preset reconciliation conflict for',
        `"${input.preset_name}".`,
        'Found:',
        matches
          .map(
            (preset) =>
              `${preset.preset_name} (${preset.preset_id})`,
          )
          .join(', '),
      ].join(' '),
    );
  }

  const existing =
    matches[0];

  if (existing) {
    return repository
      .updateSavedCollectionPreset({
        workspace_id:
          workspaceId,
        preset_id:
          existing.preset_id,
        preset_name:
          input.preset_name,
        reusable_configuration:
          input.reusable_configuration,
      });
  }

  return repository
    .createSavedCollectionPreset({
      workspace_id:
        workspaceId,
      preset_name:
        input.preset_name,
      reusable_configuration:
        input.reusable_configuration,
    });
};

const main = async (): Promise<void> => {
  const workspaceId =
    valueFor(
      process.argv.slice(2),
      WORKSPACE_PREFIX,
    );

  const root =
    path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'RoofRoom Data Collector',
      'app-data',
    );

  const directories =
    createDirectories(root);

  await Promise.all(
    [
      directories.config,
      directories.data,
      directories.runs,
      directories.database,
      directories.browser_profiles,
      directories.logs,
      directories.public_downloads,
    ].map((directory) =>
      mkdir(directory, { recursive: true }),
    ),
  );

  initializeDatabase(directories);

  const repository =
    new StateRepository(
      getDatabasePath(directories),
    );

  try {
    if (
      repository.getWorkspace(
        workspaceId,
      ) === null
    ) {
      throw new Error(
        `Unknown Workspace: ${workspaceId}`,
      );
    }

    const reconciled = [
      reconcilePreset(
        repository,
        workspaceId,
        {
          preset_name:
            GOOGLE_ADS_GROWTH_REBUILD_PRESET_NAME,
          legacy_names: [
            LEGACY_GOOGLE_ADS_GROWTH_PRESET_NAME,
          ],
          reusable_configuration:
            createGoogleAdsGrowthRebuildPreset(),
        },
      ),

      ...BLOG_AGENTIC_CONTENT_PRESET_WINDOWS.map(
        (windowDays) =>
          reconcilePreset(
            repository,
            workspaceId,
            {
              preset_name:
                getBlogAgenticContentPresetName(
                  windowDays,
                ),
              legacy_names:
                windowDays === 30
                  ? [
                      LEGACY_BLOG_AGENTIC_CONTENT_PRESET_NAME,
                    ]
                  : [],
              reusable_configuration:
                createBlogAgenticContentPreset(
                  windowDays,
                ),
            },
          ),
      ),
    ];

    console.log(
      JSON.stringify(
        {
          reconciled:
            reconciled.map(
              (preset) => ({
                preset_id:
                  preset.preset_id,
                preset_name:
                  preset.preset_name,
              }),
            ),
        },
        null,
        2,
      ),
    );
  } finally {
    repository.close();
  }
};

void main();
