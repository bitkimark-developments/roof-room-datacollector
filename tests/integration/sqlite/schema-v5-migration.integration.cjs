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

const root = path.join(workRoot, 'schema-v4');
const databaseDirectory = path.join(root, 'database');

fs.mkdirSync(databaseDirectory, { recursive: true });

const directories = {
  app_data_root: root,
  config: path.join(root, 'config'),
  data: path.join(root, 'data'),
  runs: path.join(root, 'data', 'runs'),
  database: databaseDirectory,
  browser_profiles: path.join(root, 'browser-profiles'),
  logs: path.join(root, 'logs'),
};

const databasePath = getDatabasePath(directories);
const legacy = new DatabaseSync(databasePath);

legacy.exec(`
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
    query_group_id TEXT NOT NULL,
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

  CREATE INDEX idx_jobs_run_order
    ON jobs(run_id, job_order);

  CREATE TABLE attempts (
    attempt_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    execution_status TEXT NOT NULL,
    candidate_artifact_id TEXT,
    validation_id TEXT,
    error_code TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (job_id, attempt_number)
  ) STRICT;

  CREATE INDEX idx_attempts_job_number
    ON attempts(job_id, attempt_number);

  CREATE TABLE artifacts (
    artifact_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    source_id TEXT NOT NULL,
    artifact_kind TEXT NOT NULL,
    artifact_state TEXT NOT NULL,
    filename TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    media_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (job_id, attempt_number)
      REFERENCES attempts(job_id, attempt_number)
      ON UPDATE RESTRICT ON DELETE RESTRICT
  ) STRICT;

  CREATE INDEX idx_artifacts_job_attempt
    ON artifacts(job_id, attempt_number);
  CREATE INDEX idx_artifacts_run
    ON artifacts(run_id);

  CREATE TABLE validations (
    validation_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    checks_total INTEGER NOT NULL,
    checks_passed INTEGER NOT NULL,
    checks_warning INTEGER NOT NULL,
    checks_failed INTEGER NOT NULL,
    validated_at TEXT NOT NULL,
    validation_json_path TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (artifact_id) REFERENCES artifacts(artifact_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
  ) STRICT;

  CREATE INDEX idx_validations_job
    ON validations(job_id);
  CREATE INDEX idx_validations_artifact
    ON validations(artifact_id);

  INSERT INTO schema_migrations VALUES
    (1, 'bootstrap_schema', '2026-08-18T00:00:00.000Z'),
    (2, 'run_job_persistence', '2026-08-18T00:01:00.000Z'),
    (3, 'attempt_persistence', '2026-08-18T00:02:00.000Z'),
    (4, 'artifact_validation_persistence', '2026-08-18T00:03:00.000Z');

  INSERT INTO runs VALUES (
    'rr_20260818T000000000Z_abcdef',
    'COMPLETED',
    '2026-08-18T00:00:00.000Z',
    '2026-08-18T00:00:01.000Z',
    '2026-08-18T00:00:05.000Z',
    '1.0.0',
    '["google-trends"]',
    '{"config_version":1,"source_id":"google-trends","source_mode":"GOOGLE_TRENDS_UI","country_code":"TR","language_code":null,"requested_date_start":"2024-08-18","requested_date_end":"2026-08-17","category_id":null,"category_name":"All Categories","search_type":"WEB_SEARCH","selection_type":"SEARCH_TERM","dataset_type":"INTEREST_OVER_TIME","selected_query_groups":[{"query_group_id":"GT01","query_group_name":"generic_commercial","queries":["canlı bitki","online bitki"]}]}'
  );

  INSERT INTO jobs VALUES (
    'rr_20260818T000000000Z_abcdef__google-trends__GT01',
    'rr_20260818T000000000Z_abcdef',
    'google-trends',
    'GT01',
    'GT01',
    0,
    'COMPLETED',
    'VALID',
    1,
    'artifact_legacy',
    '2026-08-18T00:00:00.000Z',
    '2026-08-18T00:00:01.000Z',
    '2026-08-18T00:00:05.000Z'
  );

  INSERT INTO attempts VALUES (
    'rr_20260818T000000000Z_abcdef__google-trends__GT01__attempt_1',
    'rr_20260818T000000000Z_abcdef__google-trends__GT01',
    1,
    'COMPLETED',
    'artifact_legacy',
    'validation_legacy',
    NULL,
    '2026-08-18T00:00:01.000Z',
    '2026-08-18T00:00:05.000Z'
  );

  INSERT INTO artifacts VALUES (
    'artifact_legacy',
    'rr_20260818T000000000Z_abcdef',
    'rr_20260818T000000000Z_abcdef__google-trends__GT01',
    1,
    'google-trends',
    'RAW_SOURCE_FILE',
    'ACCEPTED',
    'GT01.csv',
    'google-trends/raw/GT01.csv',
    'text/csv',
    42,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '2026-08-18T00:00:03.000Z'
  );

  INSERT INTO validations VALUES (
    'validation_legacy',
    'rr_20260818T000000000Z_abcdef',
    'rr_20260818T000000000Z_abcdef__google-trends__GT01',
    'artifact_legacy',
    'VALID',
    1,
    1,
    0,
    0,
    '2026-08-18T00:00:04.000Z',
    'google-trends/validation/GT01.validation.json'
  );

  PRAGMA user_version = 4;
`);

legacy.close();

const bootstrap = initializeDatabase(directories);

assert.equal(bootstrap.status, 'READY');

if (bootstrap.status !== 'READY') {
  throw new Error(bootstrap.error);
}

assert.equal(bootstrap.schema_version, 6);
assert.equal(bootstrap.migrations_applied, 6);

const migrated = new DatabaseSync(databasePath);
migrated.exec('PRAGMA foreign_keys = ON');

assert.deepEqual(
  migrated.prepare('PRAGMA foreign_key_check').all(),
  [],
);

assert.equal(
  migrated.prepare('SELECT COUNT(*) AS count FROM runs').get().count,
  1,
);
assert.equal(
  migrated.prepare('SELECT COUNT(*) AS count FROM jobs').get().count,
  1,
);
assert.equal(
  migrated.prepare('SELECT COUNT(*) AS count FROM attempts').get().count,
  1,
);
assert.equal(
  migrated.prepare('SELECT COUNT(*) AS count FROM artifacts').get().count,
  1,
);
assert.equal(
  migrated.prepare('SELECT COUNT(*) AS count FROM validations').get().count,
  1,
);

assert.deepEqual(
  migrated.prepare(`
    SELECT workspace_id, workspace_name, created_at
    FROM workspaces
    ORDER BY workspace_id
  `).all().map((workspace) => ({ ...workspace })),
  [
    {
      workspace_id: 'ws_development_migration',
      workspace_name: 'Development migration workspace',
      created_at: '1970-01-01T00:00:00.000Z',
    },
  ],
);

const migratedRun = migrated.prepare(`
  SELECT workspace_id, run_status
  FROM runs
  WHERE run_id = 'rr_20260818T000000000Z_abcdef'
`).get();

assert.equal(
  migratedRun.workspace_id,
  'ws_development_migration',
);
assert.equal(migratedRun.run_status, 'COMPLETED');

const workspaceColumn = migrated.prepare(`
  SELECT "notnull" AS is_not_null
  FROM pragma_table_info('runs')
  WHERE name = 'workspace_id'
`).get();

assert.equal(workspaceColumn.is_not_null, 1);

const workspaceForeignKey = migrated.prepare(`
  SELECT "table", "from", "to", on_update, on_delete
  FROM pragma_foreign_key_list('runs')
  WHERE "from" = 'workspace_id'
`).get();

assert.deepEqual({ ...workspaceForeignKey }, {
  table: 'workspaces',
  from: 'workspace_id',
  to: 'workspace_id',
  on_update: 'RESTRICT',
  on_delete: 'RESTRICT',
});

assert.ok(
  migrated.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'index'
      AND name = 'ux_runs_one_active_per_workspace'
  `).get(),
);

const job = migrated.prepare(`
  SELECT
    job_id,
    run_id,
    source_id,
    job_key,
    query_group_id,
    job_order,
    execution_status,
    validation_status,
    attempt_count,
    accepted_artifact_id,
    source_context_json
  FROM jobs
`).get();

assert.deepEqual(
  {
    job_id: job.job_id,
    run_id: job.run_id,
    source_id: job.source_id,
    job_key: job.job_key,
    query_group_id: job.query_group_id,
    job_order: job.job_order,
    execution_status: job.execution_status,
    validation_status: job.validation_status,
    attempt_count: job.attempt_count,
    accepted_artifact_id: job.accepted_artifact_id,
  },
  {
    job_id: 'rr_20260818T000000000Z_abcdef__google-trends__GT01',
    run_id: 'rr_20260818T000000000Z_abcdef',
    source_id: 'google-trends',
    job_key: 'GT01',
    query_group_id: 'GT01',
    job_order: 0,
    execution_status: 'COMPLETED',
    validation_status: 'VALID',
    attempt_count: 1,
    accepted_artifact_id: 'artifact_legacy',
  },
);

assert.deepEqual(
  JSON.parse(job.source_context_json),
  {
    query_group: {
      query_group_id: 'GT01',
      query_group_name: 'generic_commercial',
      queries: ['canlı bitki', 'online bitki'],
    },
  },
);

assert.equal(
  migrated.prepare(`
    SELECT job_id FROM attempts WHERE attempt_id = 'rr_20260818T000000000Z_abcdef__google-trends__GT01__attempt_1'
  `).get().job_id,
  job.job_id,
);
assert.equal(
  migrated.prepare(`
    SELECT job_id FROM artifacts WHERE artifact_id = 'artifact_legacy'
  `).get().job_id,
  job.job_id,
);
const validationLink = migrated.prepare(`
    SELECT job_id, artifact_id FROM validations WHERE validation_id = 'validation_legacy'
  `).get();

assert.deepEqual(
  {
    job_id: validationLink.job_id,
    artifact_id: validationLink.artifact_id,
  },
  {
    job_id: job.job_id,
    artifact_id: 'artifact_legacy',
  },
);

const queryGroupColumn = migrated
  .prepare(`
    SELECT "notnull" AS is_not_null
    FROM pragma_table_info('jobs')
    WHERE name = 'query_group_id'
  `)
  .get();

assert.equal(queryGroupColumn.is_not_null, 0);

migrated.close();

console.log(
  'PASS DB-MIGRATION-005/006: schema-v4 GT lifecycle data survives chained schema-v5 and schema-v6 migrations',
);
