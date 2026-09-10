const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const [buildRoot, workRoot] = process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error('Expected compiled build root and temporary work root.');
}

const {
  getDatabasePath,
  initializeDatabase,
} = require(path.join(buildRoot, 'main', 'storage', 'database.js'));

const directoriesFor = (name) => {
  const root = path.join(workRoot, name);
  const database = path.join(root, 'database');
  fs.mkdirSync(database, { recursive: true });
  return {
    app_data_root: root,
    config: path.join(root, 'config'),
    data: path.join(root, 'data'),
    runs: path.join(root, 'data', 'runs'),
    database,
    browser_profiles: path.join(root, 'browser-profiles'),
    logs: path.join(root, 'logs'),
    public_downloads: path.join(root, 'downloads'),
  };
};

const createV5Database = (directories, runRows, jobRows) => {
  const databasePath = getDatabasePath(directories);
  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE runs (
      run_id TEXT PRIMARY KEY,
      run_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      application_version TEXT NOT NULL,
      selected_sources_json TEXT NOT NULL,
      configuration_snapshot_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE jobs (
      job_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      job_key TEXT NOT NULL,
      query_group_id TEXT,
      source_context_json TEXT NOT NULL,
      job_order INTEGER NOT NULL,
      execution_status TEXT NOT NULL,
      validation_status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      accepted_artifact_id TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(run_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      UNIQUE (run_id, source_id, job_key),
      UNIQUE (run_id, job_order)
    ) STRICT;

    INSERT INTO schema_migrations VALUES
      (1, 'bootstrap_schema', '2026-08-18T00:00:00.000Z'),
      (2, 'run_job_persistence', '2026-08-18T00:01:00.000Z'),
      (3, 'attempt_persistence', '2026-08-18T00:02:00.000Z'),
      (4, 'artifact_validation_persistence', '2026-08-18T00:03:00.000Z'),
      (5, 'source_neutral_job_context', '2026-08-18T00:04:00.000Z');

    PRAGMA user_version = 5;
  `);

  const insertRun = database.prepare(`
    INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertJob = database.prepare(`
    INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const run of runRows) {
    insertRun.run(
      run.run_id,
      run.run_status,
      run.created_at,
      run.run_status === 'PENDING' ? null : run.created_at,
      null,
      '1.0.0',
      '["fake-source"]',
      '{"schema_version":1}',
    );
  }

  for (const job of jobRows) {
    insertJob.run(
      job.job_id,
      job.run_id,
      'fake-source',
      job.job_id,
      null,
      '{}',
      0,
      job.execution_status,
      'NOT_RUN',
      job.execution_status === 'PENDING' ? 0 : 1,
      null,
      job.created_at,
      job.execution_status === 'PENDING' ? null : job.created_at,
      job.execution_status === 'FAILED' ? job.created_at : null,
    );
  }

  database.close();
  return databasePath;
};

const retryDirectories = directoriesFor('retry-state');
const retryDatabasePath = createV5Database(
  retryDirectories,
  [{
    run_id: 'rr_retry_fixture',
    run_status: 'RUNNING',
    created_at: '2026-08-18T00:10:00.000Z',
  }],
  [{
    job_id: 'job_retry_fixture',
    run_id: 'rr_retry_fixture',
    execution_status: 'FAILED',
    created_at: '2026-08-18T00:10:00.000Z',
  }],
);

const retryBootstrap = initializeDatabase(retryDirectories);
assert.equal(retryBootstrap.status, 'READY');
assert.equal(retryBootstrap.schema_version, 8);

const retryDatabase = new DatabaseSync(retryDatabasePath);
retryDatabase.exec('PRAGMA foreign_keys = ON');

assert.deepEqual(
  { ...retryDatabase.prepare(`
    SELECT workspace_id, run_status, completed_at
    FROM runs
    WHERE run_id = 'rr_retry_fixture'
  `).get() },
  {
    workspace_id: 'ws_development_migration',
    run_status: 'RETRY_REQUIRED',
    completed_at: null,
  },
);
assert.deepEqual(
  retryDatabase.prepare('PRAGMA foreign_key_check').all(),
  [],
);
retryDatabase.close();

const conflictDirectories = directoriesFor('active-conflict');
const conflictDatabasePath = createV5Database(
  conflictDirectories,
  [
    {
      run_id: 'rr_pending_one',
      run_status: 'PENDING',
      created_at: '2026-08-18T00:20:00.000Z',
    },
    {
      run_id: 'rr_pending_two',
      run_status: 'PENDING',
      created_at: '2026-08-18T00:21:00.000Z',
    },
  ],
  [
    {
      job_id: 'job_pending_one',
      run_id: 'rr_pending_one',
      execution_status: 'PENDING',
      created_at: '2026-08-18T00:20:00.000Z',
    },
    {
      job_id: 'job_pending_two',
      run_id: 'rr_pending_two',
      execution_status: 'PENDING',
      created_at: '2026-08-18T00:21:00.000Z',
    },
  ],
);

const conflictBootstrap = initializeDatabase(conflictDirectories);
assert.equal(conflictBootstrap.status, 'ERROR');
assert.match(
  conflictBootstrap.error,
  /2 conflicting active development Runs/,
);

const conflictDatabase = new DatabaseSync(conflictDatabasePath);
assert.equal(
  conflictDatabase.prepare('PRAGMA user_version').get().user_version,
  5,
);
assert.equal(
  conflictDatabase.prepare(`
    SELECT COUNT(*) AS count
    FROM schema_migrations
    WHERE version = 6
  `).get().count,
  0,
);
assert.equal(
  conflictDatabase.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table' AND name = 'workspaces'
  `).get().count,
  0,
);
conflictDatabase.close();

console.log(
  'PASS DB-MIGRATION-006: schema-v5 retry state migrates deterministically and active conflicts roll back',
);
