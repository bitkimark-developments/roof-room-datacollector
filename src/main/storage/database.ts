import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';

import type {
  ApplicationDirectories,
  DatabaseBootstrapStatus,
} from '../../shared/bootstrap-status';

const DATABASE_FILENAME = 'roofroom.sqlite';
const CURRENT_SCHEMA_VERSION = 8;

export const MIGRATION_COMPATIBILITY_WORKSPACE_ID =
  'ws_development_migration';

const MIGRATION_COMPATIBILITY_WORKSPACE_NAME =
  'Development migration workspace';

const MIGRATION_COMPATIBILITY_WORKSPACE_CREATED_AT =
  '1970-01-01T00:00:00.000Z';

type SqliteRow = Record<string, unknown>;

const requireRow = (
  row: unknown,
  context: string,
): SqliteRow => {
  if (
    typeof row !== 'object' ||
    row === null ||
    Array.isArray(row)
  ) {
    throw new Error(`${context} did not return a row.`);
  }

  return row as SqliteRow;
};

const requireNumber = (
  row: SqliteRow,
  field: string,
  context: string,
): number => {
  const value = row[field];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `${context}.${field} must be a finite number.`,
    );
  }

  return value;
};

const requireString = (
  row: SqliteRow,
  field: string,
  context: string,
): string => {
  const value = row[field];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `${context}.${field} must be a non-empty string.`,
    );
  }

  return value;
};

const readUserVersion = (database: DatabaseSync): number => {
  const row = requireRow(
    database.prepare('PRAGMA user_version').get(),
    'PRAGMA user_version',
  );

  return requireNumber(
    row,
    'user_version',
    'PRAGMA user_version',
  );
};

const migrateToVersion1 = (database: DatabaseSync): void => {
  database.exec('BEGIN IMMEDIATE');

  try {
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);

    database
      .prepare(`
        INSERT INTO schema_migrations (
          version,
          name,
          applied_at
        ) VALUES (?, ?, ?)
      `)
      .run(
        1,
        'bootstrap_schema',
        new Date().toISOString(),
      );

    database.exec('PRAGMA user_version = 1');
    database.exec('COMMIT');
  } catch (error: unknown) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original migration failure.
    }

    throw error;
  }
};

const migrateToVersion2 = (database: DatabaseSync): void => {
  database.exec('BEGIN IMMEDIATE');

  try {
    database.exec(`
      CREATE TABLE runs (
        run_id TEXT PRIMARY KEY,
        run_status TEXT NOT NULL
          CHECK (
            run_status IN (
              'PENDING',
              'RUNNING',
              'MANUAL_ACTION_REQUIRED',
              'COMPLETED',
              'COMPLETED_WITH_WARNINGS',
              'FAILED',
              'CANCELLED'
            )
          ),
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        application_version TEXT NOT NULL,
        selected_sources_json TEXT NOT NULL
          CHECK (json_valid(selected_sources_json))
          CHECK (json_type(selected_sources_json) = 'array'),
        configuration_snapshot_json TEXT NOT NULL
          CHECK (json_valid(configuration_snapshot_json))
          CHECK (json_type(configuration_snapshot_json) = 'object')
      ) STRICT;

      CREATE TABLE jobs (
        job_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        job_key TEXT NOT NULL,
        query_group_id TEXT NOT NULL,
        job_order INTEGER NOT NULL
          CHECK (job_order >= 0),
        execution_status TEXT NOT NULL
          CHECK (
            execution_status IN (
              'PENDING',
              'RUNNING',
              'VALIDATING',
              'COMPLETED',
              'FAILED',
              'CANCELLED',
              'MANUAL_ACTION_REQUIRED',
              'RETRY_PENDING'
            )
          ),
        validation_status TEXT NOT NULL
          CHECK (
            validation_status IN (
              'NOT_RUN',
              'VALID',
              'LOW_DATA',
              'NO_DATA',
              'INVALID_SCHEMA',
              'ERROR_NOT_DATA',
              'DATE_MISMATCH',
              'QUERY_MISMATCH'
            )
          ),
        attempt_count INTEGER NOT NULL DEFAULT 0
          CHECK (attempt_count >= 0),
        accepted_artifact_id TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        FOREIGN KEY (run_id)
          REFERENCES runs(run_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        UNIQUE (run_id, source_id, job_key),
        UNIQUE (run_id, job_order)
      ) STRICT;

      CREATE INDEX idx_jobs_run_order
        ON jobs(run_id, job_order);
    `);

    database
      .prepare(`
        INSERT INTO schema_migrations (
          version,
          name,
          applied_at
        ) VALUES (?, ?, ?)
      `)
      .run(
        2,
        'run_job_persistence',
        new Date().toISOString(),
      );

    database.exec('PRAGMA user_version = 2');
    database.exec('COMMIT');
  } catch (error: unknown) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original migration failure.
    }

    throw error;
  }
};

const migrateToVersion3 = (database: DatabaseSync): void => {
  database.exec('BEGIN IMMEDIATE');

  try {
    database.exec(`
      CREATE TABLE attempts (
        attempt_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL
          CHECK (attempt_number >= 1),
        execution_status TEXT NOT NULL
          CHECK (
            execution_status IN (
              'PENDING',
              'RUNNING',
              'VALIDATING',
              'COMPLETED',
              'FAILED',
              'CANCELLED',
              'MANUAL_ACTION_REQUIRED',
              'RETRY_PENDING'
            )
          ),
        candidate_artifact_id TEXT,
        validation_id TEXT,
        error_code TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (job_id)
          REFERENCES jobs(job_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        UNIQUE (job_id, attempt_number)
      ) STRICT;

      CREATE INDEX idx_attempts_job_number
        ON attempts(job_id, attempt_number);
    `);

    database
      .prepare(`
        INSERT INTO schema_migrations (
          version,
          name,
          applied_at
        ) VALUES (?, ?, ?)
      `)
      .run(
        3,
        'attempt_persistence',
        new Date().toISOString(),
      );

    database.exec('PRAGMA user_version = 3');
    database.exec('COMMIT');
  } catch (error: unknown) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original migration failure.
    }

    throw error;
  }
};


const migrateToVersion4 = (database: DatabaseSync): void => {
  database.exec('BEGIN IMMEDIATE');

  try {
    database.exec(`
      CREATE TABLE artifacts (
        artifact_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL
          CHECK (attempt_number >= 1),
        source_id TEXT NOT NULL,
        artifact_kind TEXT NOT NULL
          CHECK (
            artifact_kind IN (
              'RAW_SOURCE_FILE',
              'METADATA_JSON',
              'VALIDATION_JSON',
              'NORMALIZED_CSV',
              'EXPORT_XLSX',
              'LOG_FILE'
            )
          ),
        artifact_state TEXT NOT NULL
          CHECK (
            artifact_state IN (
              'CANDIDATE',
              'ACCEPTED',
              'ACCEPTED_WITH_WARNING',
              'REJECTED',
              'SUPERSEDED'
            )
          ),
        filename TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        media_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL
          CHECK (byte_size >= 0),
        sha256 TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id)
          REFERENCES runs(run_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        FOREIGN KEY (job_id)
          REFERENCES jobs(job_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        FOREIGN KEY (job_id, attempt_number)
          REFERENCES attempts(job_id, attempt_number)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
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
        validation_status TEXT NOT NULL
          CHECK (
            validation_status IN (
              'VALID',
              'LOW_DATA',
              'NO_DATA',
              'INVALID_SCHEMA',
              'ERROR_NOT_DATA',
              'DATE_MISMATCH',
              'QUERY_MISMATCH'
            )
          ),
        checks_total INTEGER NOT NULL
          CHECK (checks_total >= 0),
        checks_passed INTEGER NOT NULL
          CHECK (checks_passed >= 0),
        checks_warning INTEGER NOT NULL
          CHECK (checks_warning >= 0),
        checks_failed INTEGER NOT NULL
          CHECK (checks_failed >= 0),
        validated_at TEXT NOT NULL,
        validation_json_path TEXT,
        CHECK (
          checks_total =
            checks_passed +
            checks_warning +
            checks_failed
        ),
        FOREIGN KEY (run_id)
          REFERENCES runs(run_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        FOREIGN KEY (job_id)
          REFERENCES jobs(job_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        FOREIGN KEY (artifact_id)
          REFERENCES artifacts(artifact_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      ) STRICT;

      CREATE INDEX idx_validations_job
        ON validations(job_id);

      CREATE INDEX idx_validations_artifact
        ON validations(artifact_id);
    `);

    database
      .prepare(`
        INSERT INTO schema_migrations (
          version,
          name,
          applied_at
        ) VALUES (?, ?, ?)
      `)
      .run(
        4,
        'artifact_validation_persistence',
        new Date().toISOString(),
      );

    database.exec('PRAGMA user_version = 4');
    database.exec('COMMIT');
  } catch (error: unknown) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original migration failure.
    }

    throw error;
  }
};

const migrateToVersion5 = (database: DatabaseSync): void => {
  const unmatchedContextRow = requireRow(
    database
      .prepare(`
        SELECT COUNT(*) AS unmatched_count
        FROM jobs AS job
        INNER JOIN runs AS run
          ON run.run_id = job.run_id
        WHERE NOT EXISTS (
          SELECT 1
          FROM json_each(
            run.configuration_snapshot_json,
            '$.selected_query_groups'
          ) AS query_group
          WHERE json_extract(
            query_group.value,
            '$.query_group_id'
          ) = job.query_group_id
        )
      `)
      .get(),
    'schema-v5 query-group context preflight',
  );

  const unmatchedContextCount = requireNumber(
    unmatchedContextRow,
    'unmatched_count',
    'schema-v5 query-group context preflight',
  );

  if (unmatchedContextCount !== 0) {
    throw new Error(
      `Schema-v5 migration cannot reconstruct ${unmatchedContextCount} persisted job source context(s).`,
    );
  }

  database.exec('PRAGMA foreign_keys = OFF');
  database.exec('BEGIN IMMEDIATE');

  try {
    database.exec(`
      CREATE TABLE jobs_v5 (
        job_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        job_key TEXT NOT NULL,
        query_group_id TEXT,
        source_context_json TEXT NOT NULL
          CHECK (json_valid(source_context_json))
          CHECK (json_type(source_context_json) = 'object'),
        job_order INTEGER NOT NULL
          CHECK (job_order >= 0),
        execution_status TEXT NOT NULL
          CHECK (
            execution_status IN (
              'PENDING',
              'RUNNING',
              'VALIDATING',
              'COMPLETED',
              'FAILED',
              'CANCELLED',
              'MANUAL_ACTION_REQUIRED',
              'RETRY_PENDING'
            )
          ),
        validation_status TEXT NOT NULL
          CHECK (
            validation_status IN (
              'NOT_RUN',
              'VALID',
              'LOW_DATA',
              'NO_DATA',
              'INVALID_SCHEMA',
              'ERROR_NOT_DATA',
              'DATE_MISMATCH',
              'QUERY_MISMATCH'
            )
          ),
        attempt_count INTEGER NOT NULL DEFAULT 0
          CHECK (attempt_count >= 0),
        accepted_artifact_id TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        FOREIGN KEY (run_id)
          REFERENCES runs(run_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        UNIQUE (run_id, source_id, job_key),
        UNIQUE (run_id, job_order)
      ) STRICT;

      INSERT INTO jobs_v5 (
        job_id,
        run_id,
        source_id,
        job_key,
        query_group_id,
        source_context_json,
        job_order,
        execution_status,
        validation_status,
        attempt_count,
        accepted_artifact_id,
        created_at,
        started_at,
        completed_at
      )
      SELECT
        job.job_id,
        job.run_id,
        job.source_id,
        job.job_key,
        job.query_group_id,
        json_object(
          'query_group',
          json((
            SELECT query_group.value
            FROM json_each(
              run.configuration_snapshot_json,
              '$.selected_query_groups'
            ) AS query_group
            WHERE json_extract(
              query_group.value,
              '$.query_group_id'
            ) = job.query_group_id
            LIMIT 1
          ))
        ),
        job.job_order,
        job.execution_status,
        job.validation_status,
        job.attempt_count,
        job.accepted_artifact_id,
        job.created_at,
        job.started_at,
        job.completed_at
      FROM jobs AS job
      INNER JOIN runs AS run
        ON run.run_id = job.run_id;

      DROP TABLE jobs;
      ALTER TABLE jobs_v5 RENAME TO jobs;

      CREATE INDEX idx_jobs_run_order
        ON jobs(run_id, job_order);
    `);

    const foreignKeyProblems = database
      .prepare('PRAGMA foreign_key_check')
      .all();

    if (foreignKeyProblems.length !== 0) {
      throw new Error(
        'Schema-v5 migration would leave invalid foreign-key relationships.',
      );
    }

    database
      .prepare(`
        INSERT INTO schema_migrations (
          version,
          name,
          applied_at
        ) VALUES (?, ?, ?)
      `)
      .run(
        5,
        'source_neutral_job_context',
        new Date().toISOString(),
      );

    database.exec('PRAGMA user_version = 5');
    database.exec('COMMIT');
  } catch (error: unknown) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original migration failure.
    }

    throw error;
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
};

const migrateToVersion6 = (database: DatabaseSync): void => {
  database.exec('PRAGMA foreign_keys = OFF');
  database.exec('BEGIN IMMEDIATE');

  try {
    database.exec(`
      CREATE TABLE workspaces (
        workspace_id TEXT PRIMARY KEY,
        workspace_name TEXT NOT NULL
          CHECK (length(trim(workspace_name)) > 0),
        created_at TEXT NOT NULL
      ) STRICT;
    `);

    database
      .prepare(`
        INSERT INTO workspaces (
          workspace_id,
          workspace_name,
          created_at
        ) VALUES (?, ?, ?)
      `)
      .run(
        MIGRATION_COMPATIBILITY_WORKSPACE_ID,
        MIGRATION_COMPATIBILITY_WORKSPACE_NAME,
        MIGRATION_COMPATIBILITY_WORKSPACE_CREATED_AT,
      );

    database.exec(`
      CREATE TABLE runs_v6 (
        run_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        run_status TEXT NOT NULL
          CHECK (
            run_status IN (
              'PENDING',
              'RUNNING',
              'MANUAL_ACTION_REQUIRED',
              'RETRY_REQUIRED',
              'COMPLETED',
              'COMPLETED_WITH_WARNINGS',
              'FAILED',
              'CANCELLED'
            )
          ),
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        application_version TEXT NOT NULL,
        selected_sources_json TEXT NOT NULL
          CHECK (json_valid(selected_sources_json))
          CHECK (json_type(selected_sources_json) = 'array'),
        configuration_snapshot_json TEXT NOT NULL
          CHECK (json_valid(configuration_snapshot_json))
          CHECK (json_type(configuration_snapshot_json) = 'object'),
        FOREIGN KEY (workspace_id)
          REFERENCES workspaces(workspace_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      ) STRICT;

      INSERT INTO runs_v6 (
        run_id,
        workspace_id,
        run_status,
        created_at,
        started_at,
        completed_at,
        application_version,
        selected_sources_json,
        configuration_snapshot_json
      )
      SELECT
        run.run_id,
        '${MIGRATION_COMPATIBILITY_WORKSPACE_ID}',
        CASE
          WHEN run.run_status = 'RUNNING'
            AND EXISTS (
              SELECT 1
              FROM jobs AS retry_job
              WHERE retry_job.run_id = run.run_id
                AND retry_job.execution_status IN (
                  'FAILED',
                  'RETRY_PENDING'
                )
            )
            AND NOT EXISTS (
              SELECT 1
              FROM jobs AS active_job
              WHERE active_job.run_id = run.run_id
                AND active_job.execution_status IN (
                  'PENDING',
                  'RUNNING',
                  'VALIDATING',
                  'MANUAL_ACTION_REQUIRED'
                )
            )
          THEN 'RETRY_REQUIRED'
          ELSE run.run_status
        END,
        run.created_at,
        run.started_at,
        run.completed_at,
        run.application_version,
        run.selected_sources_json,
        run.configuration_snapshot_json
      FROM runs AS run;

      DROP TABLE runs;
      ALTER TABLE runs_v6 RENAME TO runs;
    `);

    const conflictingActiveRun = database
      .prepare(`
        SELECT workspace_id, COUNT(*) AS active_count
        FROM runs
        WHERE run_status IN (
          'PENDING',
          'RUNNING',
          'MANUAL_ACTION_REQUIRED'
        )
        GROUP BY workspace_id
        HAVING COUNT(*) > 1
        LIMIT 1
      `)
      .get();

    if (conflictingActiveRun !== undefined) {
      const conflict = requireRow(
        conflictingActiveRun,
        'schema-v6 active Run preflight',
      );
      const activeCount = requireNumber(
        conflict,
        'active_count',
        'schema-v6 active Run preflight',
      );

      throw new Error(
        `Schema-v6 migration found ${activeCount} conflicting active development Runs; rebuild the development database before retrying.`,
      );
    }

    database.exec(`
      CREATE UNIQUE INDEX ux_runs_one_active_per_workspace
        ON runs(workspace_id)
        WHERE run_status IN (
          'PENDING',
          'RUNNING',
          'MANUAL_ACTION_REQUIRED'
        );
    `);

    const foreignKeyProblems = database
      .prepare('PRAGMA foreign_key_check')
      .all();

    if (foreignKeyProblems.length !== 0) {
      throw new Error(
        'Schema-v6 migration would leave invalid foreign-key relationships.',
      );
    }

    database
      .prepare(`
        INSERT INTO schema_migrations (
          version,
          name,
          applied_at
        ) VALUES (?, ?, ?)
      `)
      .run(
        6,
        'workspace_run_ownership',
        new Date().toISOString(),
      );

    database.exec('PRAGMA user_version = 6');
    database.exec('COMMIT');
  } catch (error: unknown) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original migration failure.
    }

    throw error;
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
};

const migrateToVersion7 = (database: DatabaseSync): void => {
  database.exec('BEGIN IMMEDIATE');

  try {
    database.exec(`
      CREATE TABLE saved_collection_presets (
        preset_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        preset_name TEXT NOT NULL
          CHECK (length(trim(preset_name)) > 0),
        reusable_configuration_json TEXT NOT NULL
          CHECK (json_valid(reusable_configuration_json))
          CHECK (json_type(reusable_configuration_json) = 'object'),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id)
          REFERENCES workspaces(workspace_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      ) STRICT;

      CREATE INDEX ix_saved_collection_presets_workspace
        ON saved_collection_presets(
          workspace_id,
          created_at,
          preset_id
        );

      CREATE TABLE workspace_last_run_settings (
        workspace_id TEXT PRIMARY KEY,
        reusable_configuration_json TEXT NOT NULL
          CHECK (json_valid(reusable_configuration_json))
          CHECK (json_type(reusable_configuration_json) = 'object'),
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id)
          REFERENCES workspaces(workspace_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      ) STRICT;
    `);

    database
      .prepare(`
        INSERT INTO schema_migrations (
          version,
          name,
          applied_at
        ) VALUES (?, ?, ?)
      `)
      .run(
        7,
        'workspace_collection_settings',
        new Date().toISOString(),
      );

    database.exec('PRAGMA user_version = 7');
    database.exec('COMMIT');
  } catch (error: unknown) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original migration failure.
    }

    throw error;
  }
};

const migrateToVersion8 = (database: DatabaseSync): void => {
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(`
      CREATE TABLE workspace_source_connections (
        connection_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        credential_ref TEXT,
        safe_metadata_json TEXT NOT NULL
          CHECK (json_valid(safe_metadata_json))
          CHECK (json_type(safe_metadata_json) = 'object'),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id)
          REFERENCES workspaces(workspace_id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        UNIQUE (workspace_id, source_id)
      ) STRICT;
      CREATE INDEX ix_workspace_source_connections_workspace
        ON workspace_source_connections(workspace_id, source_id);
    `);
    database.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(8, 'workspace_source_connections', new Date().toISOString());
    database.exec('PRAGMA user_version = 8');
    database.exec('COMMIT');
  } catch (error: unknown) {
    try { database.exec('ROLLBACK'); } catch { /* preserve original */ }
    throw error;
  }
};

const applyMigrations = (database: DatabaseSync): number => {
  let schemaVersion = readUserVersion(database);

  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${schemaVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}.`,
    );
  }

  if (schemaVersion < 1) {
    migrateToVersion1(database);
    schemaVersion = readUserVersion(database);
  }

  if (schemaVersion < 2) {
    migrateToVersion2(database);
    schemaVersion = readUserVersion(database);
  }

  if (schemaVersion < 3) {
    migrateToVersion3(database);
    schemaVersion = readUserVersion(database);
  }

  if (schemaVersion < 4) {
    migrateToVersion4(database);
    schemaVersion = readUserVersion(database);
  }

  if (schemaVersion < 5) {
    migrateToVersion5(database);
    schemaVersion = readUserVersion(database);
  }

  if (schemaVersion < 6) {
    migrateToVersion6(database);
    schemaVersion = readUserVersion(database);
  }

  if (schemaVersion < 7) {
    migrateToVersion7(database);
    schemaVersion = readUserVersion(database);
  }

  if (schemaVersion < 8) {
    migrateToVersion8(database);
    schemaVersion = readUserVersion(database);
  }

  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database migration ended at schema version ${schemaVersion}; expected ${CURRENT_SCHEMA_VERSION}.`,
    );
  }

  return schemaVersion;
};

const validateMigrationHistory = (
  database: DatabaseSync,
): number => {
  const row = requireRow(
    database
      .prepare(`
        SELECT COUNT(*) AS migration_count
        FROM schema_migrations
      `)
      .get(),
    'schema migration count',
  );

  const migrationCount = requireNumber(
    row,
    'migration_count',
    'schema migration count',
  );

  if (migrationCount !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Expected ${CURRENT_SCHEMA_VERSION} migration record(s), found ${migrationCount}.`,
    );
  }

  const latest = requireRow(
    database
      .prepare(`
        SELECT version, name, applied_at
        FROM schema_migrations
        ORDER BY version DESC
        LIMIT 1
      `)
      .get(),
    'latest schema migration',
  );

  const latestVersion = requireNumber(
    latest,
    'version',
    'latest schema migration',
  );

  if (latestVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Latest migration version ${latestVersion} does not match schema version ${CURRENT_SCHEMA_VERSION}.`,
    );
  }

  requireString(
    latest,
    'name',
    'latest schema migration',
  );

  const appliedAt = requireString(
    latest,
    'applied_at',
    'latest schema migration',
  );

  if (
    !appliedAt.endsWith('Z') ||
    Number.isNaN(Date.parse(appliedAt))
  ) {
    throw new Error(
      'Schema migration timestamp must be parseable UTC ISO 8601.',
    );
  }

  return migrationCount;
};

const configureAndVerifyDatabase = (
  database: DatabaseSync,
): {
  sqliteVersion: string;
  journalMode: string;
  foreignKeys: boolean;
  quickCheck: 'ok';
} => {
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA journal_mode = WAL');

  const sqliteVersionRow = requireRow(
    database
      .prepare('SELECT sqlite_version() AS sqlite_version')
      .get(),
    'SQLite version',
  );

  const sqliteVersion = requireString(
    sqliteVersionRow,
    'sqlite_version',
    'SQLite version',
  );

  const journalModeRow = requireRow(
    database.prepare('PRAGMA journal_mode').get(),
    'PRAGMA journal_mode',
  );

  const journalMode = requireString(
    journalModeRow,
    'journal_mode',
    'PRAGMA journal_mode',
  );

  if (journalMode.toLowerCase() !== 'wal') {
    throw new Error(
      `Expected SQLite journal_mode WAL, received ${journalMode}.`,
    );
  }

  const foreignKeysRow = requireRow(
    database.prepare('PRAGMA foreign_keys').get(),
    'PRAGMA foreign_keys',
  );

  const foreignKeysValue = requireNumber(
    foreignKeysRow,
    'foreign_keys',
    'PRAGMA foreign_keys',
  );

  if (foreignKeysValue !== 1) {
    throw new Error(
      'SQLite foreign-key enforcement is not enabled.',
    );
  }

  const quickCheckRow = requireRow(
    database.prepare('PRAGMA quick_check').get(),
    'PRAGMA quick_check',
  );

  const quickCheckValue = requireString(
    quickCheckRow,
    'quick_check',
    'PRAGMA quick_check',
  );

  if (quickCheckValue !== 'ok') {
    throw new Error(
      `SQLite quick_check failed: ${quickCheckValue}`,
    );
  }

  return {
    sqliteVersion,
    journalMode,
    foreignKeys: true,
    quickCheck: 'ok',
  };
};

export const getDatabasePath = (
  directories: ApplicationDirectories,
): string =>
  path.join(directories.database, DATABASE_FILENAME);

export const initializeDatabase = (
  directories: ApplicationDirectories,
): DatabaseBootstrapStatus => {
  const databasePath = getDatabasePath(directories);
  let database: DatabaseSync | null = null;

  try {
    database = new DatabaseSync(databasePath);

    const databaseHealth =
      configureAndVerifyDatabase(database);
    const schemaVersion = applyMigrations(database);
    const migrationsApplied =
      validateMigrationHistory(database);

    return {
      status: 'READY',
      database_path: databasePath,
      schema_version: schemaVersion,
      sqlite_version: databaseHealth.sqliteVersion,
      journal_mode: databaseHealth.journalMode,
      foreign_keys: databaseHealth.foreignKeys,
      migrations_applied: migrationsApplied,
      quick_check: databaseHealth.quickCheck,
    };
  } catch (error: unknown) {
    return {
      status: 'ERROR',
      database_path: databasePath,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown SQLite initialization error.',
    };
  } finally {
    database?.close();
  }
};
