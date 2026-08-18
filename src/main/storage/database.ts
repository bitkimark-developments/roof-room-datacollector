import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';

import type {
  ApplicationDirectories,
  DatabaseBootstrapStatus,
} from '../../shared/bootstrap-status';

const DATABASE_FILENAME = 'roofroom.sqlite';
const CURRENT_SCHEMA_VERSION = 1;

type SqliteRow = Record<string, unknown>;

const requireRow = (
  row: unknown,
  context: string,
): SqliteRow => {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
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

    const databaseHealth = configureAndVerifyDatabase(database);
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
