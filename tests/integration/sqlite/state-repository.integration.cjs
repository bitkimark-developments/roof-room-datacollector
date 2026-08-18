const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const [buildRoot, workRoot] = process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error(
    'Expected compiled build root and temporary work root.',
  );
}

const {
  getDatabasePath,
  initializeDatabase,
} = require(
  path.join(
    buildRoot,
    'main',
    'storage',
    'database.js',
  ),
);

const {
  StateRepository,
  createRunId,
} = require(
  path.join(
    buildRoot,
    'main',
    'storage',
    'state-repository.js',
  ),
);

const makeDirectories = (name) => {
  const root = path.join(workRoot, name);
  const database = path.join(root, 'database');

  fs.mkdirSync(database, { recursive: true });

  return {
    app_data_root: root,
    config: path.join(root, 'config'),
    data: path.join(root, 'data'),
    runs: path.join(root, 'data', 'runs'),
    database,
    browser_profiles: path.join(
      root,
      'browser-profiles',
    ),
    logs: path.join(root, 'logs'),
  };
};

const assertRejected = (operation, label) => {
  let rejected = false;

  try {
    operation();
  } catch {
    rejected = true;
  }

  assert.equal(
    rejected,
    true,
    `${label} should have been rejected`,
  );
};

const queryConfig = {
  config_version: 1,
  source_id: 'google-trends',
  groups: [
    {
      query_group_id: 'GT01',
      query_group_name: 'generic_commercial',
      queries: [
        'canlı bitki',
        'online bitki',
        'bitki satın al',
      ],
    },
    {
      query_group_id: 'GT02',
      query_group_name: 'indoor_terminology',
      queries: [
        'salon bitkisi',
        'salon bitkileri',
      ],
    },
  ],
};

const requestedConfiguration = {
  source_mode: 'GOOGLE_TRENDS_UI',
  country_code: 'TR',
  language_code: null,
  requested_date_start: '2024-08-18',
  requested_date_end: '2026-08-17',
  category_id: null,
  category_name: 'All Categories',
  search_type: 'WEB_SEARCH',
  selection_type: 'SEARCH_TERM',
  dataset_type: 'INTEREST_OVER_TIME',
};

// ID-001 / ID-002
const generatedIds = new Set();

for (let index = 0; index < 100; index += 1) {
  const runId = createRunId();

  assert.match(
    runId,
    /^rr_\d{8}T\d{9}Z_[0-9a-f]{6}$/,
  );

  generatedIds.add(runId);
}

assert.equal(generatedIds.size, 100);

// DB-001 + explicit legacy M1 -> M2 migration
const legacyDirectories = makeDirectories('legacy-v1');
const legacyDatabasePath =
  getDatabasePath(legacyDirectories);

const legacyDatabase = new DatabaseSync(
  legacyDatabasePath,
);

legacyDatabase.exec(`
  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT;

  INSERT INTO schema_migrations (
    version,
    name,
    applied_at
  ) VALUES (
    1,
    'bootstrap_schema',
    '2026-08-18T00:00:00.000Z'
  );

  PRAGMA user_version = 1;
`);

legacyDatabase.close();

const upgraded = initializeDatabase(
  legacyDirectories,
);

assert.equal(upgraded.status, 'READY');

if (upgraded.status !== 'READY') {
  throw new Error(upgraded.error);
}

assert.equal(upgraded.schema_version, 2);
assert.equal(upgraded.migrations_applied, 2);

// DB-001 fresh database path
const directories = makeDirectories('state-repository');
const bootstrap = initializeDatabase(directories);

assert.equal(bootstrap.status, 'READY');

if (bootstrap.status !== 'READY') {
  throw new Error(bootstrap.error);
}

assert.equal(bootstrap.schema_version, 2);
assert.equal(bootstrap.migrations_applied, 2);

const databasePath = getDatabasePath(directories);

// DB-002 / DB-003
const repositoryA = new StateRepository(databasePath);

const created = repositoryA.createRunFromQueryConfig({
  query_config: queryConfig,
  application_version: '1.0.0',
  requested_configuration: requestedConfiguration,
});

assert.equal(created.run.run_status, 'PENDING');
assert.deepEqual(
  created.run.selected_sources,
  ['google-trends'],
);
assert.deepEqual(
  created.run.requested_configuration,
  requestedConfiguration,
);

assert.deepEqual(
  created.run.configuration_snapshot
    .selected_query_groups,
  queryConfig.groups,
);

assert.equal(created.jobs.length, 2);

assert.deepEqual(
  created.jobs.map((job) => job.query_group_id),
  ['GT01', 'GT02'],
);

assert.deepEqual(
  created.jobs.map((job) => job.job_order),
  [0, 1],
);

for (const job of created.jobs) {
  assert.equal(job.execution_status, 'PENDING');
  assert.equal(job.validation_status, 'NOT_RUN');
  assert.equal(job.attempt_count, 0);
  assert.equal(job.accepted_artifact_id, null);
  assert.equal(job.run_id, created.run.run_id);
}

assert.deepEqual(repositoryA.getCounts(), {
  runs: 1,
  jobs: 2,
});

const runId = created.run.run_id;
repositoryA.close();

// DB-008 restart / new repository instance
const repositoryB = new StateRepository(databasePath);

const reloadedRun = repositoryB.getRun(runId);
const reloadedJobs = repositoryB.listJobs(runId);

assert.ok(reloadedRun);
assert.equal(reloadedRun.run_id, runId);
assert.equal(reloadedRun.run_status, 'PENDING');

assert.deepEqual(
  reloadedRun.configuration_snapshot
    .selected_query_groups,
  queryConfig.groups,
);

assert.deepEqual(
  reloadedJobs.map((job) => job.query_group_id),
  ['GT01', 'GT02'],
);

assert.deepEqual(repositoryB.getCounts(), {
  runs: 1,
  jobs: 2,
});

repositoryB.close();

// Database-level fail-closed status constraints + DB-010
const direct = new DatabaseSync(databasePath);
direct.exec('PRAGMA foreign_keys = ON');

assertRejected(
  () =>
    direct
      .prepare(
        `UPDATE runs
         SET run_status = 'NOT_A_STATUS'
         WHERE run_id = ?`,
      )
      .run(runId),
  'invalid run_status',
);

assertRejected(
  () =>
    direct
      .prepare(
        `UPDATE jobs
         SET execution_status = 'DOWNLOAD_FAILED'
         WHERE run_id = ?`,
      )
      .run(runId),
  'invalid execution_status',
);

assertRejected(
  () =>
    direct
      .prepare(
        `UPDATE jobs
         SET validation_status = 'MANUAL_ACTION_REQUIRED'
         WHERE run_id = ?`,
      )
      .run(runId),
  'operational value in validation_status',
);

assertRejected(
  () =>
    direct
      .prepare(
        `UPDATE jobs
         SET run_id = 'missing-run'
         WHERE job_id = ?`,
      )
      .run(reloadedJobs[0].job_id),
  'foreign-key violation',
);

const foreignKeyProblems = direct
  .prepare('PRAGMA foreign_key_check')
  .all();

assert.deepEqual(foreignKeyProblems, []);

const migrationRows = direct
  .prepare(`
    SELECT version, name
    FROM schema_migrations
    ORDER BY version
  `)
  .all();

assert.deepEqual(
  migrationRows.map((row) => [
    row.version,
    row.name,
  ]),
  [
    [1, 'bootstrap_schema'],
    [2, 'run_job_persistence'],
  ],
);

direct.close();

console.log(
  'PASS ID-001: run_id is filesystem-safe',
);
console.log(
  'PASS ID-002: rapid run_id generation remained unique',
);
console.log(
  'PASS DB-001: legacy schema v1 upgrades to v2',
);
console.log(
  'PASS DB-002: run persisted as PENDING',
);
console.log(
  'PASS DB-003: ordered jobs persisted independently',
);
console.log(
  'PASS DB-008: run/jobs survive repository restart',
);
console.log(
  'PASS DB-010: foreign-key integrity remains valid',
);
console.log(
  'PASS: invalid persisted status values fail closed',
);
console.log(
  'PASS: configuration snapshot survives restart',
);
