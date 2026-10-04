const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const [
  buildRoot,
  homeRoot,
] = process.argv.slice(2);

if (!buildRoot || !homeRoot) {
  throw new Error(
    'Expected compiled build root and temporary HOME.',
  );
}

const {
  initializeDatabase,
  getDatabasePath,
} = require(path.join(
  buildRoot,
  'src',
  'main',
  'storage',
  'database.js',
));

const {
  StateRepository,
} = require(path.join(
  buildRoot,
  'src',
  'main',
  'storage',
  'state-repository.js',
));

const {
  createGoogleAdsGrowthRebuildPreset,
} = require(path.join(
  buildRoot,
  'src',
  'main',
  'presets',
  'google-ads-growth-rebuild-preset.js',
));

const {
  createBlogAgenticContentPreset,
} = require(path.join(
  buildRoot,
  'src',
  'main',
  'presets',
  'blog-agentic-content-preset.js',
));

const scriptPath = path.join(
  buildRoot,
  'scripts',
  'create-asset-presets.js',
);

const appDataRoot = path.join(
  homeRoot,
  'Library',
  'Application Support',
  'RoofRoom Data Collector',
  'app-data',
);

const directories = {
  app_data_root:
    appDataRoot,
  config:
    path.join(appDataRoot, 'config'),
  data:
    path.join(appDataRoot, 'data'),
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
      homeRoot,
      'Downloads',
      'RoofRoom Data Collector',
    ),
};

for (
  const directory
  of Object.values(directories)
) {
  fs.mkdirSync(
    directory,
    {
      recursive: true,
    },
  );
}

const bootstrap =
  initializeDatabase(
    directories,
  );

assert.equal(
  bootstrap.status,
  'READY',
  bootstrap.status === 'ERROR'
    ? bootstrap.error
    : undefined,
);

const databasePath =
  getDatabasePath(
    directories,
  );

let repository =
  new StateRepository(
    databasePath,
  );

const workspace =
  repository.createWorkspace({
    workspace_name:
      'Asset Preset Seed Test',
  });

const legacyGrowth =
  repository.createSavedCollectionPreset({
    workspace_id:
      workspace.workspace_id,
    preset_name:
      'Google Ads Growth Rebuild',
    reusable_configuration: {
      sources: {
        legacy: {
          included: true,
        },
      },
    },
  });

const legacyBlog =
  repository.createSavedCollectionPreset({
    workspace_id:
      workspace.workspace_id,
    preset_name:
      'Blog Agentic Content Research',
    reusable_configuration: {
      sources: {
        legacy: {
          included: true,
        },
      },
    },
  });

repository.close();

const runSeed = () => {
  const result =
    spawnSync(
      process.execPath,
      [
        scriptPath,
        `--workspace-id=${workspace.workspace_id}`,
      ],
      {
        env: {
          ...process.env,
          HOME:
            homeRoot,
        },
        encoding:
          'utf8',
      },
    );

  assert.equal(
    result.status,
    0,
    [
      'Seed script failed.',
      result.stdout,
      result.stderr,
    ].join('\n'),
  );
};

const TARGET_NAMES = [
  'Blog - 7 Day',
  'Blog - 14 Day',
  'Blog - 30 Day',
  'Google Ads Growth',
];

const readPresetState = () => {
  const repo =
    new StateRepository(
      databasePath,
    );

  try {
    const rows =
      repo.listSavedCollectionPresets(
        workspace.workspace_id,
      );

    return rows;
  } finally {
    repo.close();
  }
};

runSeed();

const first =
  readPresetState();

assert.equal(
  first.length,
  4,
  'First reconciliation must leave exactly four asset presets.',
);

assert.deepEqual(
  first
    .map(
      (preset) =>
        preset.preset_name,
    )
    .sort(),
  [...TARGET_NAMES].sort(),
  'Legacy names must be migrated and 7/14/30 Blog presets must all exist.',
);

const firstByName =
  new Map(
    first.map(
      (preset) => [
        preset.preset_name,
        preset,
      ],
    ),
  );

assert.equal(
  firstByName
    .get('Google Ads Growth')
    .preset_id,
  legacyGrowth.preset_id,
  'Growth migration must preserve the existing preset_id.',
);

assert.equal(
  firstByName
    .get('Google Ads Growth')
    .created_at,
  legacyGrowth.created_at,
  'Growth migration must preserve created_at.',
);

assert.equal(
  firstByName
    .get('Blog - 30 Day')
    .preset_id,
  legacyBlog.preset_id,
  'Legacy Blog preset must become Blog - 30 Day without replacing its identity.',
);

assert.equal(
  firstByName
    .get('Blog - 30 Day')
    .created_at,
  legacyBlog.created_at,
  'Blog 30 migration must preserve created_at.',
);

assert.deepEqual(
  firstByName
    .get('Google Ads Growth')
    .reusable_configuration,
  createGoogleAdsGrowthRebuildPreset(),
);

for (
  const windowDays
  of [7, 14, 30]
) {
  assert.deepEqual(
    firstByName
      .get(`Blog - ${windowDays} Day`)
      .reusable_configuration,
    createBlogAgenticContentPreset(
      windowDays,
    ),
    `Blog - ${windowDays} Day must use the exact canonical reusable configuration.`,
  );
}

const firstIds =
  Object.fromEntries(
    TARGET_NAMES.map(
      (name) => [
        name,
        firstByName
          .get(name)
          .preset_id,
      ],
    ),
  );

runSeed();

const second =
  readPresetState();

assert.equal(
  second.length,
  4,
  'Second reconciliation must not create duplicates.',
);

assert.deepEqual(
  second
    .map(
      (preset) =>
        preset.preset_name,
    )
    .sort(),
  [...TARGET_NAMES].sort(),
);

const secondByName =
  new Map(
    second.map(
      (preset) => [
        preset.preset_name,
        preset,
      ],
    ),
  );

const secondIds =
  Object.fromEntries(
    TARGET_NAMES.map(
      (name) => [
        name,
        secondByName
          .get(name)
          .preset_id,
      ],
    ),
  );

assert.deepEqual(
  secondIds,
  firstIds,
  'Repeated seed execution must preserve all four preset identities.',
);

for (
  const legacyName
  of [
    'Google Ads Growth Rebuild',
    'Blog Agentic Content Research',
  ]
) {
  assert.equal(
    secondByName.has(
      legacyName,
    ),
    false,
    `Legacy preset name must not remain: ${legacyName}`,
  );
}

console.log(
  'PASS ASSET-PRESET-SEED-001: seed migrates legacy presets, creates the 7/14/30 catalog, and remains duplicate-free across repeated execution',
);
