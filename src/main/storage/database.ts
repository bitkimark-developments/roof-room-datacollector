import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';

import type {
  ApplicationDirectories,
  DatabaseBootstrapStatus,
} from '../../shared/bootstrap-status';

const DATABASE_FILENAME = 'roofroom.sqlite';
const CURRENT_SCHEMA_VERSION = 3;

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
