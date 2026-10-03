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
  createBlogAgenticContentPreset,
  BLOG_AGENTIC_CONTENT_PRESET_NAME,
} from '../src/main/presets/blog-agentic-content-preset';

const WORKSPACE_PREFIX = '--workspace-id=';

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
    const adsPreset =
      repository.createSavedCollectionPreset({
        workspace_id: workspaceId,
        preset_name:
          GOOGLE_ADS_GROWTH_REBUILD_PRESET_NAME,
        reusable_configuration:
          createGoogleAdsGrowthRebuildPreset(),
      });

    const blogPreset =
      repository.createSavedCollectionPreset({
        workspace_id: workspaceId,
        preset_name:
          BLOG_AGENTIC_CONTENT_PRESET_NAME,
        reusable_configuration:
          createBlogAgenticContentPreset(),
      });

    console.log(
      JSON.stringify(
        {
          created: [
            adsPreset.preset_name,
            blogPreset.preset_name,
          ],
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
