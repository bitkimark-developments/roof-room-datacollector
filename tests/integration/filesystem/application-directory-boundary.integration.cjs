const assert = require(
  'node:assert/strict',
);
const path = require(
  'node:path',
);

const [buildRoot] =
  process.argv.slice(2);

if (!buildRoot) {
  throw new Error(
    'Expected compiled build root.',
  );
}

const {
  getApplicationOwnedDirectoryPaths,
} = require(
  path.join(
    buildRoot,
    'main',
    'app',
    'application-directories.js',
  ),
);

const appDataRoot =
  '/Application Support/RoofRoom Data Collector/app-data';

const directories = {
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
    '/Downloads/RoofRoom Data Collector',
};

const owned =
  getApplicationOwnedDirectoryPaths(
    directories,
  );

assert.deepEqual(
  owned,
  [
    directories.app_data_root,
    directories.config,
    directories.data,
    directories.runs,
    directories.database,
    directories.browser_profiles,
    directories.logs,
  ],
);

console.log(
  'PASS STORAGE-BOUNDARY-001: application initialization declares only app-data state directories for eager creation',
);

assert.equal(
  owned.includes(
    directories.public_downloads,
  ),
  false,
);

console.log(
  'PASS STORAGE-BOUNDARY-002: the reserved user-visible export path is not created or treated as application-owned state during initialization',
);
