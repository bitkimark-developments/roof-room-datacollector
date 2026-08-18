import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { assertJobExecutionTransition } from '../core/job-execution-state-machine';
import type { AttemptRecord } from '../../shared/attempt';
import type { QueryConfig } from '../../shared/query-config';
import {
  isExecutionStatus,
  isRunStatus,
  isValidationStatus,
  type ExecutionStatus,
  type JobRecord,
  type RequestedCollectionConfiguration,
  type RunConfigurationSnapshot,
  type RunRecord,
  type ValidationStatus,
} from '../../shared/run-job';

const REQUIRED_SCHEMA_VERSION = 3;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RUN_ID_PATTERN =
  /^rr_\d{8}T\d{9}Z_[0-9a-f]{6}$/;

type SqliteRow = Record<string, unknown>;

export interface CreateRunInput {
  query_config: QueryConfig;
  application_version: string;
  requested_configuration: RequestedCollectionConfiguration;
}

export interface StateCounts {
  runs: number;
  jobs: number;
}

export interface TransitionJobExecutionOptions {
  validation_status?: ValidationStatus;
  error_code?: string | null;
}

const requireRecord = (
  value: unknown,
  context: string,
): SqliteRow => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`${context} must be an object.`);
  }

  return value as SqliteRow;
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

const requireNullableString = (
  row: SqliteRow,
  field: string,
  context: string,
): string | null => {
  const value = row[field];

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `${context}.${field} must be a string or null.`,
    );
  }

  return value;
};

const requireInteger = (
  row: SqliteRow,
  field: string,
  context: string,
): number => {
  const value = row[field];

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value)
  ) {
    throw new Error(
      `${context}.${field} must be an integer.`,
    );
  }

  return value;
};

const requireUtcTimestamp = (
  value: string,
  context: string,
): string => {
  if (
    !value.endsWith('Z') ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error(
      `${context} must be a parseable UTC ISO 8601 timestamp.`,
    );
  }

  return value;
};

const requireDateOnly = (
  value: string,
  context: string,
): string => {
  if (
    !ISO_DATE_PATTERN.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  ) {
    throw new Error(
      `${context} must use YYYY-MM-DD.`,
    );
  }

  return value;
};

const requireNonEmpty = (
  value: string,
  context: string,
): string => {
  if (value.trim().length === 0) {
    throw new Error(`${context} must be non-empty.`);
  }

  return value;
};

const parseJson = (
  value: string,
  context: string,
): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${context} is not valid JSON.`);
  }
};

const parseSelectedSources = (
  value: string,
): string[] => {
  const parsed = parseJson(value, 'selected_sources_json');

  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every(
      (sourceId) =>
        typeof sourceId === 'string' &&
        sourceId.length > 0,
    )
  ) {
    throw new Error(
      'selected_sources_json must be a non-empty string array.',
    );
  }

  return [...parsed];
};

const parseConfigurationSnapshot = (
  value: string,
): RunConfigurationSnapshot => {
  const parsed = requireRecord(
    parseJson(value, 'configuration_snapshot_json'),
    'configuration_snapshot',
  );

  const selectedGroups = parsed.selected_query_groups;

  if (!Array.isArray(selectedGroups)) {
    throw new Error(
      'configuration_snapshot.selected_query_groups must be an array.',
    );
  }

  const normalizedGroups = selectedGroups.map(
    (rawGroup, index) => {
      const group = requireRecord(
        rawGroup,
        `selected_query_groups[${index}]`,
      );

      const queries = group.queries;

      if (
        !Array.isArray(queries) ||
        queries.length === 0 ||
        !queries.every(
          (query) =>
            typeof query === 'string' &&
            query.length > 0,
        )
      ) {
        throw new Error(
          `selected_query_groups[${index}].queries must be a non-empty string array.`,
        );
      }

      return {
        query_group_id: requireString(
          group,
          'query_group_id',
          `selected_query_groups[${index}]`,
        ),
        query_group_name: requireString(
          group,
          'query_group_name',
          `selected_query_groups[${index}]`,
        ),
        queries: [...queries],
      };
    },
  );

  const configVersion = requireInteger(
    parsed,
    'config_version',
    'configuration_snapshot',
  );

  const requireNullableConfigString = (
    rawValue: unknown,
    context: string,
  ): string | null => {
    if (rawValue === null) {
      return null;
    }

    if (
      typeof rawValue !== 'string' ||
      rawValue.length === 0
    ) {
      throw new Error(
        `${context} must be a string or null.`,
      );
    }

    return rawValue;
  };

  const languageCode = requireNullableConfigString(
    parsed.language_code,
    'configuration_snapshot.language_code',
  );

  const categoryId = requireNullableConfigString(
    parsed.category_id,
    'configuration_snapshot.category_id',
  );

  return {
    config_version: configVersion,
    source_id: requireString(
      parsed,
      'source_id',
      'configuration_snapshot',
    ),
    source_mode: requireString(
      parsed,
      'source_mode',
      'configuration_snapshot',
    ),
    country_code: requireString(
      parsed,
      'country_code',
      'configuration_snapshot',
    ),
    language_code: languageCode,
    requested_date_start: requireDateOnly(
      requireString(
        parsed,
        'requested_date_start',
        'configuration_snapshot',
      ),
      'configuration_snapshot.requested_date_start',
    ),
    requested_date_end: requireDateOnly(
      requireString(
        parsed,
        'requested_date_end',
        'configuration_snapshot',
      ),
      'configuration_snapshot.requested_date_end',
    ),
    category_id: categoryId,
    category_name: requireString(
      parsed,
      'category_name',
      'configuration_snapshot',
    ),
    search_type: requireString(
      parsed,
      'search_type',
      'configuration_snapshot',
    ),
    selection_type: requireString(
      parsed,
      'selection_type',
      'configuration_snapshot',
    ),
    dataset_type: requireString(
      parsed,
      'dataset_type',
      'configuration_snapshot',
    ),
    selected_query_groups: normalizedGroups,
  };
};

const extractRequestedConfiguration = (
  snapshot: RunConfigurationSnapshot,
): RequestedCollectionConfiguration => ({
  source_mode: snapshot.source_mode,
  country_code: snapshot.country_code,
  language_code: snapshot.language_code,
  requested_date_start: snapshot.requested_date_start,
  requested_date_end: snapshot.requested_date_end,
  category_id: snapshot.category_id,
  category_name: snapshot.category_name,
  search_type: snapshot.search_type,
  selection_type: snapshot.selection_type,
  dataset_type: snapshot.dataset_type,
});

const mapRunRow = (rawRow: unknown): RunRecord => {
  const row = requireRecord(rawRow, 'run');

  const runStatus = row.run_status;

  if (!isRunStatus(runStatus)) {
    throw new Error(
      `Persisted run_status is invalid: ${String(runStatus)}`,
    );
  }

  const snapshot = parseConfigurationSnapshot(
    requireString(
      row,
      'configuration_snapshot_json',
      'run',
    ),
  );

  return {
    run_id: requireString(row, 'run_id', 'run'),
    run_status: runStatus,
    created_at: requireUtcTimestamp(
      requireString(row, 'created_at', 'run'),
      'run.created_at',
    ),
    started_at: (() => {
      const value = requireNullableString(
        row,
        'started_at',
        'run',
      );

      return value === null
        ? null
        : requireUtcTimestamp(value, 'run.started_at');
    })(),
    completed_at: (() => {
      const value = requireNullableString(
        row,
        'completed_at',
        'run',
      );

      return value === null
        ? null
        : requireUtcTimestamp(value, 'run.completed_at');
    })(),
    application_version: requireString(
      row,
      'application_version',
      'run',
    ),
    selected_sources: parseSelectedSources(
      requireString(
        row,
        'selected_sources_json',
        'run',
      ),
    ),
    requested_configuration:
      extractRequestedConfiguration(snapshot),
    configuration_snapshot: snapshot,
  };
};

const mapJobRow = (rawRow: unknown): JobRecord => {
  const row = requireRecord(rawRow, 'job');

  const executionStatus = row.execution_status;
  const validationStatus = row.validation_status;

  if (!isExecutionStatus(executionStatus)) {
    throw new Error(
      `Persisted execution_status is invalid: ${String(executionStatus)}`,
    );
  }

  if (!isValidationStatus(validationStatus)) {
    throw new Error(
      `Persisted validation_status is invalid: ${String(validationStatus)}`,
    );
  }

  return {
    job_id: requireString(row, 'job_id', 'job'),
    run_id: requireString(row, 'run_id', 'job'),
    source_id: requireString(row, 'source_id', 'job'),
    job_key: requireString(row, 'job_key', 'job'),
    query_group_id: requireString(
      row,
      'query_group_id',
      'job',
    ),
    job_order: requireInteger(
      row,
      'job_order',
      'job',
    ),
    execution_status: executionStatus,
    validation_status: validationStatus,
    attempt_count: requireInteger(
      row,
      'attempt_count',
      'job',
    ),
    accepted_artifact_id: requireNullableString(
      row,
      'accepted_artifact_id',
      'job',
    ),
    created_at: requireUtcTimestamp(
      requireString(row, 'created_at', 'job'),
      'job.created_at',
    ),
    started_at: (() => {
      const value = requireNullableString(
        row,
        'started_at',
        'job',
      );

      return value === null
        ? null
        : requireUtcTimestamp(value, 'job.started_at');
    })(),
    completed_at: (() => {
      const value = requireNullableString(
        row,
        'completed_at',
        'job',
      );

      return value === null
        ? null
        : requireUtcTimestamp(value, 'job.completed_at');
    })(),
  };
};

const mapAttemptRow = (
  rawRow: unknown,
): AttemptRecord => {
  const row = requireRecord(rawRow, 'attempt');
  const executionStatus = row.execution_status;

  if (!isExecutionStatus(executionStatus)) {
    throw new Error(
      `Persisted attempt execution_status is invalid: ${String(executionStatus)}`,
    );
  }

  return {
    attempt_id: requireString(
      row,
      'attempt_id',
      'attempt',
    ),
    job_id: requireString(row, 'job_id', 'attempt'),
    attempt_number: requireInteger(
      row,
      'attempt_number',
      'attempt',
    ),
    execution_status: executionStatus,
    candidate_artifact_id: requireNullableString(
      row,
      'candidate_artifact_id',
      'attempt',
    ),
    validation_id: requireNullableString(
      row,
      'validation_id',
      'attempt',
    ),
    error_code: requireNullableString(
      row,
      'error_code',
      'attempt',
    ),
    started_at: requireUtcTimestamp(
      requireString(
        row,
        'started_at',
        'attempt',
      ),
      'attempt.started_at',
    ),
    completed_at: (() => {
      const value = requireNullableString(
        row,
        'completed_at',
        'attempt',
      );

      return value === null
        ? null
        : requireUtcTimestamp(
            value,
            'attempt.completed_at',
          );
    })(),
  };
};

export const createRunId = (): string => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.]/g, '');

  const suffix = randomBytes(3).toString('hex');

  const runId = `rr_${timestamp}_${suffix}`;

  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      `Generated run_id does not match canonical pattern: ${runId}`,
    );
  }

  return runId;
};

const createJobId = (
  runId: string,
  sourceId: string,
  jobKey: string,
): string =>
  `${runId}__${sourceId}__${jobKey}`;

const createAttemptId = (
  jobId: string,
  attemptNumber: number,
): string =>
  `${jobId}__attempt_${attemptNumber}`;

const validateCreateRunInput = (
  input: CreateRunInput,
): void => {
  requireNonEmpty(
    input.application_version,
    'application_version',
  );

  requireNonEmpty(
    input.query_config.source_id,
    'query_config.source_id',
  );

  if (input.query_config.groups.length === 0) {
    throw new Error(
      'query_config.groups must contain at least one group.',
    );
  }

  requireDateOnly(
    input.requested_configuration.requested_date_start,
    'requested_configuration.requested_date_start',
  );

  requireDateOnly(
    input.requested_configuration.requested_date_end,
    'requested_configuration.requested_date_end',
  );

  if (
    input.requested_configuration.requested_date_start >
    input.requested_configuration.requested_date_end
  ) {
    throw new Error(
      'requested date start must not be after requested date end.',
    );
  }

  const ids = input.query_config.groups.map(
    (group) => group.query_group_id,
  );

  if (new Set(ids).size !== ids.length) {
    throw new Error(
      'query_config contains duplicate query_group_id values.',
    );
  }
};

const buildSnapshot = (
  input: CreateRunInput,
): RunConfigurationSnapshot => ({
  config_version: input.query_config.config_version,
  source_id: input.query_config.source_id,
  ...input.requested_configuration,
  selected_query_groups: input.query_config.groups.map(
    (group) => ({
      query_group_id: group.query_group_id,
      query_group_name: group.query_group_name,
      queries: [...group.queries],
    }),
  ),
});

const requireErrorCode = (
  errorCode: unknown,
): string => {
  if (
    typeof errorCode !== 'string' ||
    errorCode.trim().length === 0
  ) {
    throw new Error(
      'FAILED transition requires a non-empty error_code.',
    );
  }

  return errorCode;
};

export class StateRepository {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys = ON');

    const row = requireRecord(
      this.database.prepare('PRAGMA user_version').get(),
      'PRAGMA user_version',
    );

    const schemaVersion = requireInteger(
      row,
      'user_version',
      'PRAGMA user_version',
    );

    if (schemaVersion !== REQUIRED_SCHEMA_VERSION) {
      this.database.close();
      this.closed = true;

      throw new Error(
        `StateRepository requires schema version ${REQUIRED_SCHEMA_VERSION}; received ${schemaVersion}.`,
      );
    }
  }

  close(): void {
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }

  createRunFromQueryConfig(
    input: CreateRunInput,
  ): {
    run: RunRecord;
    jobs: JobRecord[];
  } {
    validateCreateRunInput(input);

    const runId = createRunId();
    const createdAt = new Date().toISOString();
    const snapshot = buildSnapshot(input);
    const selectedSources = [input.query_config.source_id];

    this.database.exec('BEGIN IMMEDIATE');

    try {
      this.database
        .prepare(`
          INSERT INTO runs (
            run_id,
            run_status,
            created_at,
            started_at,
            completed_at,
            application_version,
            selected_sources_json,
            configuration_snapshot_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          runId,
          'PENDING',
          createdAt,
          null,
          null,
          input.application_version,
          JSON.stringify(selectedSources),
          JSON.stringify(snapshot),
        );

      const insertJob = this.database.prepare(`
        INSERT INTO jobs (
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
          created_at,
          started_at,
          completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      input.query_config.groups.forEach(
        (group, jobOrder) => {
          insertJob.run(
            createJobId(
              runId,
              input.query_config.source_id,
              group.query_group_id,
            ),
            runId,
            input.query_config.source_id,
            group.query_group_id,
            group.query_group_id,
            jobOrder,
            'PENDING',
            'NOT_RUN',
            0,
            null,
            createdAt,
            null,
            null,
          );
        },
      );

      this.database.exec('COMMIT');
    } catch (error: unknown) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original persistence failure.
      }

      throw error;
    }

    const run = this.getRun(runId);

    if (!run) {
      throw new Error(
        `Run ${runId} was not readable after creation.`,
      );
    }

    return {
      run,
      jobs: this.listJobs(runId),
    };
  }

  startAttempt(jobId: string): AttemptRecord {
    this.database.exec('BEGIN IMMEDIATE');

    try {
      const rawJob = this.database
        .prepare(`
          SELECT
            job_id,
            execution_status,
            attempt_count
          FROM jobs
          WHERE job_id = ?
        `)
        .get(jobId);

      if (rawJob === undefined) {
        throw new Error(`Unknown job: ${jobId}`);
      }

      const job = requireRecord(rawJob, 'job');
      const currentStatus = job.execution_status;

      if (!isExecutionStatus(currentStatus)) {
        throw new Error(
          `Persisted execution_status is invalid: ${String(currentStatus)}`,
        );
      }

      if (
        currentStatus !== 'PENDING' &&
        currentStatus !== 'RETRY_PENDING'
      ) {
        throw new Error(
          `Cannot start an attempt while job is ${currentStatus}.`,
        );
      }

      assertJobExecutionTransition(
        currentStatus,
        'RUNNING',
      );

      const attemptNumber =
        requireInteger(
          job,
          'attempt_count',
          'job',
        ) + 1;

      const attemptId = createAttemptId(
        jobId,
        attemptNumber,
      );
      const startedAt = new Date().toISOString();

      this.database
        .prepare(`
          INSERT INTO attempts (
            attempt_id,
            job_id,
            attempt_number,
            execution_status,
            candidate_artifact_id,
            validation_id,
            error_code,
            started_at,
            completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          attemptId,
          jobId,
          attemptNumber,
          'RUNNING',
          null,
          null,
          null,
          startedAt,
          null,
        );

      this.database
        .prepare(`
          UPDATE jobs
          SET
            execution_status = 'RUNNING',
            validation_status = 'NOT_RUN',
            attempt_count = ?,
            started_at = COALESCE(started_at, ?),
            completed_at = NULL
          WHERE job_id = ?
        `)
        .run(
          attemptNumber,
          startedAt,
          jobId,
        );

      this.database.exec('COMMIT');

      const attempt = this.getAttempt(attemptId);

      if (!attempt) {
        throw new Error(
          `Attempt ${attemptId} was not readable after creation.`,
        );
      }

      return attempt;
    } catch (error: unknown) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original persistence failure.
      }

      throw error;
    }
  }

  transitionJobExecution(
    jobId: string,
    nextStatus: ExecutionStatus,
    options: TransitionJobExecutionOptions = {},
  ): JobRecord {
    this.database.exec('BEGIN IMMEDIATE');

    try {
      const rawJob = this.database
        .prepare(`
          SELECT
            job_id,
            execution_status,
            validation_status,
            attempt_count
          FROM jobs
          WHERE job_id = ?
        `)
        .get(jobId);

      if (rawJob === undefined) {
        throw new Error(`Unknown job: ${jobId}`);
      }

      const job = requireRecord(rawJob, 'job');
      const currentStatus = job.execution_status;

      if (!isExecutionStatus(currentStatus)) {
        throw new Error(
          `Persisted execution_status is invalid: ${String(currentStatus)}`,
        );
      }

      if (
        nextStatus === 'RUNNING' &&
        (currentStatus === 'PENDING' ||
          currentStatus === 'RETRY_PENDING')
      ) {
        throw new Error(
          `Use startAttempt() for ${currentStatus} -> RUNNING so attempt history is preserved.`,
        );
      }

      assertJobExecutionTransition(
        currentStatus,
        nextStatus,
      );

      const persistedValidationStatus =
        job.validation_status;

      if (!isValidationStatus(persistedValidationStatus)) {
        throw new Error(
          `Persisted validation_status is invalid: ${String(persistedValidationStatus)}`,
        );
      }

      let nextValidationStatus: ValidationStatus =
        persistedValidationStatus;

      let errorCode: string | null = null;

      if (nextStatus === 'COMPLETED') {
        const requestedValidation =
          options.validation_status;

        if (
          !isValidationStatus(requestedValidation) ||
          requestedValidation === 'NOT_RUN'
        ) {
          throw new Error(
            'COMPLETED transition requires a terminal validation_status.',
          );
        }

        nextValidationStatus =
          requestedValidation;
      } else if (
        options.validation_status !== undefined
      ) {
        throw new Error(
          'validation_status may only be supplied when transitioning to COMPLETED.',
        );
      }

      if (nextStatus === 'FAILED') {
        errorCode = requireErrorCode(
          options.error_code,
        );
      } else if (
        options.error_code !== undefined &&
        options.error_code !== null
      ) {
        throw new Error(
          'error_code may only be supplied when transitioning to FAILED.',
        );
      }

      const attemptCount = requireInteger(
        job,
        'attempt_count',
        'job',
      );

      const activeAttempt =
        attemptCount > 0
          ? this.database
              .prepare(`
                SELECT attempt_id
                FROM attempts
                WHERE job_id = ?
                  AND attempt_number = ?
              `)
              .get(jobId, attemptCount)
          : undefined;

      const transitionNeedsAttempt =
        currentStatus === 'RUNNING' ||
        currentStatus === 'VALIDATING' ||
        currentStatus ===
          'MANUAL_ACTION_REQUIRED';

      if (
        transitionNeedsAttempt &&
        activeAttempt === undefined
      ) {
        throw new Error(
          `Job ${jobId} has no persisted active attempt.`,
        );
      }

      const now = new Date().toISOString();
      const jobCompletedAt =
        nextStatus === 'COMPLETED' ||
        nextStatus === 'FAILED' ||
        nextStatus === 'CANCELLED'
          ? now
          : null;

      this.database
        .prepare(`
          UPDATE jobs
          SET
            execution_status = ?,
            validation_status = ?,
            completed_at = ?
          WHERE job_id = ?
        `)
        .run(
          nextStatus,
          nextValidationStatus,
          jobCompletedAt,
          jobId,
        );

      if (
        activeAttempt !== undefined &&
        nextStatus !== 'RETRY_PENDING'
      ) {
        const attempt = requireRecord(
          activeAttempt,
          'active attempt',
        );

        const attemptId = requireString(
          attempt,
          'attempt_id',
          'active attempt',
        );

        const attemptCompletedAt =
          nextStatus === 'COMPLETED' ||
          nextStatus === 'FAILED' ||
          nextStatus === 'CANCELLED'
            ? now
            : null;

        this.database
          .prepare(`
            UPDATE attempts
            SET
              execution_status = ?,
              error_code = ?,
              completed_at = ?
            WHERE attempt_id = ?
          `)
          .run(
            nextStatus,
            errorCode,
            attemptCompletedAt,
            attemptId,
          );
      }

      this.database.exec('COMMIT');

      const updatedJob = this.getJob(jobId);

      if (!updatedJob) {
        throw new Error(
          `Job ${jobId} was not readable after transition.`,
        );
      }

      return updatedJob;
    } catch (error: unknown) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original transition failure.
      }

      throw error;
    }
  }

  getRun(runId: string): RunRecord | null {
    const row = this.database
      .prepare(`
        SELECT
          run_id,
          run_status,
          created_at,
          started_at,
          completed_at,
          application_version,
          selected_sources_json,
          configuration_snapshot_json
        FROM runs
        WHERE run_id = ?
      `)
      .get(runId);

    return row === undefined ? null : mapRunRow(row);
  }

  getJob(jobId: string): JobRecord | null {
    const row = this.database
      .prepare(`
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
          created_at,
          started_at,
          completed_at
        FROM jobs
        WHERE job_id = ?
      `)
      .get(jobId);

    return row === undefined ? null : mapJobRow(row);
  }

  listJobs(runId: string): JobRecord[] {
    return this.database
      .prepare(`
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
          created_at,
          started_at,
          completed_at
        FROM jobs
        WHERE run_id = ?
        ORDER BY job_order ASC
      `)
      .all(runId)
      .map(mapJobRow);
  }

  getAttempt(
    attemptId: string,
  ): AttemptRecord | null {
    const row = this.database
      .prepare(`
        SELECT
          attempt_id,
          job_id,
          attempt_number,
          execution_status,
          candidate_artifact_id,
          validation_id,
          error_code,
          started_at,
          completed_at
        FROM attempts
        WHERE attempt_id = ?
      `)
      .get(attemptId);

    return row === undefined
      ? null
      : mapAttemptRow(row);
  }

  listAttempts(jobId: string): AttemptRecord[] {
    return this.database
      .prepare(`
        SELECT
          attempt_id,
          job_id,
          attempt_number,
          execution_status,
          candidate_artifact_id,
          validation_id,
          error_code,
          started_at,
          completed_at
        FROM attempts
        WHERE job_id = ?
        ORDER BY attempt_number ASC
      `)
      .all(jobId)
      .map(mapAttemptRow);
  }

  getCounts(): StateCounts {
    const runRow = requireRecord(
      this.database
        .prepare('SELECT COUNT(*) AS count FROM runs')
        .get(),
      'run count',
    );

    const jobRow = requireRecord(
      this.database
        .prepare('SELECT COUNT(*) AS count FROM jobs')
        .get(),
      'job count',
    );

    return {
      runs: requireInteger(runRow, 'count', 'run count'),
      jobs: requireInteger(jobRow, 'count', 'job count'),
    };
  }
}
