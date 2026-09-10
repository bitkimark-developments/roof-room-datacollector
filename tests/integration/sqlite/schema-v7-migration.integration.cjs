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

const directories = {
  app_data_root: workRoot,
  config: path.join(workRoot, 'config'),
  data: path.join(workRoot, 'data'),
  runs: path.join(workRoot, 'data', 'runs'),
  database: path.join(workRoot, 'database'),
  browser_profiles: path.join(workRoot, 'browser-profiles'),
  logs: path.join(workRoot, 'logs'),
};

fs.mkdirSync(directories.database, { recursive: true });

const databasePath = getDatabasePath(directories);
const v6 = new DatabaseSync(databasePath);

v6.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE workspaces (
    workspace_id TEXT PRIMARY KEY,
    workspace_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE runs (
    run_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    run_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    application_version TEXT NOT NULL,
    selected_sources_json TEXT NOT NULL,
    configuration_snapshot_json TEXT NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
  ) STRICT;

  INSERT INTO schema_migrations VALUES
    (1, 'bootstrap_schema', '2026-08-18T00:00:00.000Z'),
    (2, 'run_job_persistence', '2026-08-18T00:01:00.000Z'),
    (3, 'attempt_persistence', '2026-08-18T00:02:00.000Z'),
    (4, 'artifact_validation_persistence', '2026-08-18T00:03:00.000Z'),
    (5, 'source_neutral_job_context', '2026-08-18T00:04:00.000Z'),
    (6, 'workspace_run_ownership', '2026-08-18T00:05:00.000Z');

  INSERT INTO workspaces VALUES (
    'ws_existing',
    'Existing Workspace',
    '2026-08-18T00:06:00.000Z'
  );

  INSERT INTO runs VALUES (
    'rr_existing',
    'ws_existing',
    'COMPLETED',
    '2026-08-18T00:07:00.000Z',
    '2026-08-18T00:07:01.000Z',
    '2026-08-18T00:07:02.000Z',
    '1.0.0',
    '["fake-source"]',
    '{"schema_version":1,"reference_date":"2026-08-17"}'
  );

  PRAGMA user_version = 6;
`);

v6.close();

const bootstrap = initializeDatabase(directories);

assert.equal(bootstrap.status, 'READY');
assert.equal(bootstrap.schema_version, 8);
assert.equal(bootstrap.migrations_applied, 8);

const migrated = new DatabaseSync(databasePath);
migrated.exec('PRAGMA foreign_keys = ON');

assert.deepEqual(
  { ...migrated.prepare(`
    SELECT workspace_id, configuration_snapshot_json
    FROM runs
    WHERE run_id = 'rr_existing'
  `).get() },
  {
    workspace_id: 'ws_existing',
    configuration_snapshot_json:
      '{"schema_version":1,"reference_date":"2026-08-17"}',
  },
);

assert.equal(
  migrated.prepare('SELECT COUNT(*) AS count FROM saved_collection_presets')
    .get().count,
  0,
);
assert.equal(
  migrated.prepare('SELECT COUNT(*) AS count FROM workspace_last_run_settings')
    .get().count,
  0,
);

assert.deepEqual(
  migrated.prepare(`
    SELECT "table" AS parent_table, "from" AS child_column
    FROM pragma_foreign_key_list('saved_collection_presets')
  `).all().map((row) => ({ ...row })),
  [{ parent_table: 'workspaces', child_column: 'workspace_id' }],
);
assert.deepEqual(
  migrated.prepare(`
    SELECT "table" AS parent_table, "from" AS child_column
    FROM pragma_foreign_key_list('workspace_last_run_settings')
  `).all().map((row) => ({ ...row })),
  [{ parent_table: 'workspaces', child_column: 'workspace_id' }],
);

assert.throws(
  () => migrated.prepare(`
    INSERT INTO saved_collection_presets (
      preset_id,
      workspace_id,
      preset_name,
      reusable_configuration_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'preset_invalid',
    'ws_existing',
    'Invalid JSON Shape',
    '[]',
    '2026-08-18T00:08:00.000Z',
    '2026-08-18T00:08:00.000Z',
  ),
  /CHECK constraint failed/u,
);

assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(), []);
migrated.close();

console.log(
  'PASS DB-MIGRATION-007: schema-v6 ownership survives and Workspace preset/settings stores start empty',
);
