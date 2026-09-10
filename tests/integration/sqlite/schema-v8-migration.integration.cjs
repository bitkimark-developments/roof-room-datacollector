const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build root and temporary work root.');
const { getDatabasePath, initializeDatabase } = require(path.join(buildRoot, 'main', 'storage', 'database.js'));
const directories = {
  app_data_root: workRoot,
  config: path.join(workRoot, 'config'), data: path.join(workRoot, 'data'),
  runs: path.join(workRoot, 'data', 'runs'), database: path.join(workRoot, 'database'),
  browser_profiles: path.join(workRoot, 'browser-profiles'), logs: path.join(workRoot, 'logs'),
};
fs.mkdirSync(directories.database, { recursive: true });
const databasePath = getDatabasePath(directories);
const v7 = new DatabaseSync(databasePath);
v7.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;
  CREATE TABLE workspaces (workspace_id TEXT PRIMARY KEY, workspace_name TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
  CREATE TABLE saved_collection_presets (preset_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, preset_name TEXT NOT NULL, reusable_configuration_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)) STRICT;
  CREATE TABLE workspace_last_run_settings (workspace_id TEXT PRIMARY KEY, reusable_configuration_json TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)) STRICT;
  CREATE TABLE runs (run_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, run_status TEXT NOT NULL, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, application_version TEXT NOT NULL, selected_sources_json TEXT NOT NULL, configuration_snapshot_json TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)) STRICT;
  INSERT INTO schema_migrations VALUES (1,'bootstrap_schema','2026-09-10T00:00:00.000Z'),(2,'run_job_persistence','2026-09-10T00:01:00.000Z'),(3,'attempt_persistence','2026-09-10T00:02:00.000Z'),(4,'artifact_validation_persistence','2026-09-10T00:03:00.000Z'),(5,'source_neutral_job_context','2026-09-10T00:04:00.000Z'),(6,'workspace_run_ownership','2026-09-10T00:05:00.000Z'),(7,'workspace_collection_settings','2026-09-10T00:06:00.000Z');
  INSERT INTO workspaces VALUES ('ws_a','A','2026-09-10T00:00:00.000Z');
  PRAGMA user_version = 7;
`);
v7.close();
const bootstrap = initializeDatabase(directories);
assert.equal(bootstrap.status, 'READY');
assert.equal(bootstrap.schema_version, 8);
const migrated = new DatabaseSync(databasePath);
migrated.exec('PRAGMA foreign_keys = ON');
assert.deepEqual(migrated.prepare(`SELECT "table" AS parent_table, "from" AS child_column FROM pragma_foreign_key_list('workspace_source_connections')`).all().map((row) => ({ ...row })), [{ parent_table: 'workspaces', child_column: 'workspace_id' }]);
const insert = migrated.prepare(`INSERT INTO workspace_source_connections (connection_id, workspace_id, source_id, credential_ref, safe_metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
insert.run('c1','ws_a','fake-source','cred:fake','{"account_ref":"a"}','2026-09-10T00:00:00.000Z','2026-09-10T00:00:00.000Z');
assert.throws(() => insert.run('c2','ws_a','fake-source','cred:other','{"account_ref":"b"}','2026-09-10T00:00:00.000Z','2026-09-10T00:00:00.000Z'), /UNIQUE|constraint/iu);
assert.equal(migrated.prepare('SELECT credential_ref, safe_metadata_json FROM workspace_source_connections WHERE connection_id = ?').get('c1').credential_ref, 'cred:fake');
assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM workspace_source_connections WHERE safe_metadata_json LIKE ?').get('%secret%').count, 0);
migrated.close();
console.log('PASS DB-MIGRATION-008: schema-v7 Workspace settings migrate to connection metadata boundary');
