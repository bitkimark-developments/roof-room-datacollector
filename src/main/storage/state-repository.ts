import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { assertJobExecutionTransition } from '../core/job-execution-state-machine';
import {
  assertRunStatusTransition,
  isTerminalRunStatus,
} from '../core/run-execution-state-machine';
import type { AttemptRecord } from '../../shared/attempt';
import {
  isArtifactKind,
  isArtifactState,
  type ArtifactRecord,
  type ArtifactState,
} from '../../shared/artifact';
import type { QueryConfig } from '../../shared/query-config';
import {
  isExecutionStatus,
  isRunStatus,
  isValidationStatus,
  type ExecutionStatus,
  type JobPlan,
  type JobRecord,
  type JsonObject,
  type JsonValue,
  type QueryGroupRunConfigurationSnapshot,
  type RequestedCollectionConfiguration,
  type RunConfigurationSnapshot,
  type RunRecord,
  type RunStatus,
  type ValidationStatus,
} from '../../shared/run-job';
import type { ValidationSummaryRecord } from '../../shared/validation-summary';
import type {
  CreateWorkspaceInput,
  WorkspaceRecord,
} from '../../shared/workspace';
import type {
  LastRunSettingsRecord,
  ReusableCollectionConfiguration,
  SavedCollectionPresetRecord,
} from '../../shared/collection-configuration';
import type {
  RebindWorkspaceSourceConnectionsInput,
  UpsertWorkspaceSourceConnectionInput,
  WorkspaceSourceConnectionRecord,
} from '../../shared/workspace-connection';

const REQUIRED_SCHEMA_VERSION = 8;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DOCUMENT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RUN_ID_PATTERN =
  /^rr_\d{8}T\d{9}Z_[0-9a-f]{6}$/;
const WORKSPACE_ID_PATTERN =
  /^ws_\d{8}T\d{9}Z_[0-9a-f]{6}$/;
const PRESET_ID_PATTERN =
  /^sp_\d{8}T\d{9}Z_[0-9a-f]{6}$/;

type SqliteRow = Record<string, unknown>;

export interface CreateRunInput {
  workspace_id: string;
  query_config: QueryConfig;
  application_version: string;
  requested_configuration: RequestedCollectionConfiguration;
}

export interface ReserveRunFromQueryConfigInput extends CreateRunInput {
  reusable_configuration: ReusableCollectionConfiguration;
  reference_date?: string;
}

export interface CreateRunFromJobPlansInput {
  workspace_id: string;
  application_version: string;
  configuration_snapshot: JsonObject;
  job_plans: JobPlan[];
}

export interface ReserveRunFromJobPlansInput extends CreateRunFromJobPlansInput {
  reusable_configuration: ReusableCollectionConfiguration;
}

export interface CreateSavedCollectionPresetInput {
  workspace_id: string;
  preset_name: string;
  reusable_configuration: ReusableCollectionConfiguration;
}

export interface UpdateSavedCollectionPresetInput {
  workspace_id: string;
  preset_id: string;
  preset_name: string;
  reusable_configuration: ReusableCollectionConfiguration;
}

export interface StateCounts {
  runs: number;
  jobs: number;
}

export interface TransitionJobExecutionOptions {
  validation_status?: ValidationStatus;
  error_code?: string | null;
}

export interface StartRetryAttemptInput {
  job_id: string;
  max_attempts: number;
}

export class WorkspaceActiveRunError extends Error {
  readonly code = 'WORKSPACE_ACTIVE_RUN_EXISTS' as const;

  constructor(
    public readonly workspace_id: string,
    public readonly active_run_id: string,
  ) {
    super(
      `Workspace ${workspace_id} already has active Run ${active_run_id}.`,
    );
    this.name = 'WorkspaceActiveRunError';
  }
}

export interface RegisterCandidateArtifactInput {
  attempt_id: string;
  filename: string;
  relative_path: string;
  media_type: string;
  byte_size: number;
  sha256: string | null;
}

export interface RecordValidationSummaryInput {
  attempt_id: string;
  artifact_id: string;
  validation_status: Exclude<
    ValidationStatus,
    'NOT_RUN'
  >;
  checks_total: number;
  checks_passed: number;
  checks_warning: number;
  checks_failed: number;
  validation_json_path: string | null;
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

const requireNonNegativeInteger = (
  value: unknown,
  context: string,
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${context} must be a non-negative integer.`,
    );
  }

  return value;
};

const requireSha256 = (
  value: string | null,
): string | null => {
  if (value === null) {
    return null;
  }

  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(
      'sha256 must be 64 lowercase hexadecimal characters or null.',
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

const requireJsonValue = (
  value: unknown,
  context: string,
): JsonValue => {
  if (value === null) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      requireJsonValue(
        entry,
        `${context}[${index}]`,
      ),
    );
  }

  if (typeof value === 'object') {
    const record = requireRecord(value, context);

    return Object.fromEntries(
      Object.entries(record).map(
        ([key, entry]) => [
          key,
          requireJsonValue(
            entry,
            `${context}.${key}`,
          ),
        ],
      ),
    );
  }

  throw new Error(
    `${context} must contain only JSON-compatible values.`,
  );
};

const requireJsonObject = (
  value: unknown,
  context: string,
): JsonObject => {
  const normalized = requireJsonValue(value, context);

  if (
    typeof normalized !== 'object' ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
    throw new Error(`${context} must be a JSON object.`);
  }

  return normalized;
};

const assertSafeConnectionMetadata = (value: JsonObject): JsonObject => {
  const forbidden = /(password|passwd|token|secret|api[_-]?key|cookie|oauth|refresh)/iu;
  const visit = (candidate: JsonValue, path: string): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (typeof candidate !== 'object' || candidate === null) return;
    Object.entries(candidate).forEach(([key, entry]) => {
      if (forbidden.test(key)) throw new Error(`${path}.${key} contains a forbidden credential-like field.`);
      visit(entry, `${path}.${key}`);
    });
  };
  visit(value, 'safe_metadata');
  return value;
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

const parseQueryGroupConfigurationSnapshot = (
  value: string,
): QueryGroupRunConfigurationSnapshot => {
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

  const referenceDate = parsed.reference_date === undefined
    ? undefined
    : requireDateOnly(
        requireString(parsed, 'reference_date', 'configuration_snapshot'),
        'configuration_snapshot.reference_date',
      );

  return {
    config_version: configVersion,
    source_id: requireString(
      parsed,
      'source_id',
      'configuration_snapshot',
    ),
    ...(referenceDate === undefined ? {} : { reference_date: referenceDate }),
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
  snapshot: QueryGroupRunConfigurationSnapshot,
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

const parseRunConfigurationSnapshot = (
  value: string,
): {
  snapshot: RunConfigurationSnapshot;
  requested_configuration:
    RequestedCollectionConfiguration | null;
} => {
  const parsed = requireJsonObject(
    parseJson(value, 'configuration_snapshot_json'),
    'configuration_snapshot',
  );

  const legacyKeys = [
    'config_version',
    'source_id',
    'source_mode',
    'country_code',
    'language_code',
    'requested_date_start',
    'requested_date_end',
    'category_id',
    'category_name',
    'search_type',
    'selection_type',
    'dataset_type',
    'selected_query_groups',
  ] as const;

  const isLegacyQueryGroupSnapshot = legacyKeys.every(
    (key) => Object.hasOwn(parsed, key),
  );

  if (!isLegacyQueryGroupSnapshot) {
    return {
      snapshot: parsed,
      requested_configuration: null,
    };
  }

  const snapshot =
    parseQueryGroupConfigurationSnapshot(value);

  return {
    snapshot,
    requested_configuration:
      extractRequestedConfiguration(snapshot),
  };
};

const mapRunRow = (rawRow: unknown): RunRecord => {
  const row = requireRecord(rawRow, 'run');

  const runStatus = row.run_status;

  if (!isRunStatus(runStatus)) {
    throw new Error(
      `Persisted run_status is invalid: ${String(runStatus)}`,
    );
  }

  const parsedSnapshot = parseRunConfigurationSnapshot(
    requireString(
      row,
      'configuration_snapshot_json',
      'run',
    ),
  );

  return {
    run_id: requireString(row, 'run_id', 'run'),
    workspace_id: requireString(
      row,
      'workspace_id',
      'run',
    ),
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
      parsedSnapshot.requested_configuration,
    configuration_snapshot:
      parsedSnapshot.snapshot,
  };
};

const mapWorkspaceRow = (
  rawRow: unknown,
): WorkspaceRecord => {
  const row = requireRecord(rawRow, 'workspace');

  return {
    workspace_id: requireString(
      row,
      'workspace_id',
      'workspace',
    ),
    workspace_name: requireString(
      row,
      'workspace_name',
      'workspace',
    ),
    created_at: requireUtcTimestamp(
      requireString(row, 'created_at', 'workspace'),
      'workspace.created_at',
    ),
  };
};

const mapSavedCollectionPresetRow = (
  rawRow: unknown,
): SavedCollectionPresetRecord => {
  const row = requireRecord(rawRow, 'saved collection preset');
  const presetId = requireString(row, 'preset_id', 'saved collection preset');
  if (!PRESET_ID_PATTERN.test(presetId)) {
    throw new Error(`Persisted preset_id is invalid: ${presetId}`);
  }
  return {
    preset_id: presetId,
    workspace_id: requireString(row, 'workspace_id', 'saved collection preset'),
    preset_name: requireString(row, 'preset_name', 'saved collection preset'),
    reusable_configuration: requireJsonObject(
      parseJson(requireString(row, 'reusable_configuration_json', 'saved collection preset'), 'reusable_configuration_json'),
      'saved_collection_preset.reusable_configuration',
    ),
    created_at: requireUtcTimestamp(requireString(row, 'created_at', 'saved collection preset'), 'saved_collection_preset.created_at'),
    updated_at: requireUtcTimestamp(requireString(row, 'updated_at', 'saved collection preset'), 'saved_collection_preset.updated_at'),
  };
};

const mapLastRunSettingsRow = (rawRow: unknown): LastRunSettingsRecord => {
  const row = requireRecord(rawRow, 'last run settings');
  return {
    workspace_id: requireString(row, 'workspace_id', 'last run settings'),
    reusable_configuration: requireJsonObject(
      parseJson(requireString(row, 'reusable_configuration_json', 'last run settings'), 'reusable_configuration_json'),
      'last_run_settings.reusable_configuration',
    ),
    updated_at: requireUtcTimestamp(requireString(row, 'updated_at', 'last run settings'), 'last_run_settings.updated_at'),
  };
};

const mapWorkspaceSourceConnectionRow = (rawRow: unknown): WorkspaceSourceConnectionRecord => {
  const row = requireRecord(rawRow, 'workspace source connection');
  const credentialRef = requireNullableString(row, 'credential_ref', 'workspace source connection');
  return {
    connection_id: requireString(row, 'connection_id', 'workspace source connection'),
    workspace_id: requireString(row, 'workspace_id', 'workspace source connection'),
    source_id: requireString(row, 'source_id', 'workspace source connection'),
    credential_ref: credentialRef,
    safe_metadata: assertSafeConnectionMetadata(requireJsonObject(
      parseJson(requireString(row, 'safe_metadata_json', 'workspace source connection'), 'safe_metadata_json'),
      'workspace_source_connection.safe_metadata',
    )),
    created_at: requireUtcTimestamp(requireString(row, 'created_at', 'workspace source connection'), 'workspace_source_connection.created_at'),
    updated_at: requireUtcTimestamp(requireString(row, 'updated_at', 'workspace source connection'), 'workspace_source_connection.updated_at'),
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
    query_group_id: requireNullableString(
      row,
      'query_group_id',
      'job',
    ),
    source_context: requireJsonObject(
      parseJson(
        requireString(
          row,
          'source_context_json',
          'job',
        ),
        'source_context_json',
      ),
      'job.source_context',
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

const mapArtifactRow = (
  rawRow: unknown,
): ArtifactRecord => {
  const row = requireRecord(rawRow, 'artifact');

  const artifactKind = row.artifact_kind;
  const artifactState = row.artifact_state;

  if (!isArtifactKind(artifactKind)) {
    throw new Error(
      `Persisted artifact_kind is invalid: ${String(artifactKind)}`,
    );
  }

  if (!isArtifactState(artifactState)) {
    throw new Error(
      `Persisted artifact_state is invalid: ${String(artifactState)}`,
    );
  }

  const byteSize = requireInteger(
    row,
    'byte_size',
    'artifact',
  );

  if (byteSize < 0) {
    throw new Error(
      'artifact.byte_size must be non-negative.',
    );
  }

  const sha256 = requireNullableString(
    row,
    'sha256',
    'artifact',
  );

  if (
    sha256 !== null &&
    !/^[0-9a-f]{64}$/.test(sha256)
  ) {
    throw new Error(
      'artifact.sha256 must be 64 lowercase hexadecimal characters or null.',
    );
  }

  return {
    artifact_id: requireString(
      row,
      'artifact_id',
      'artifact',
    ),
    run_id: requireString(row, 'run_id', 'artifact'),
    job_id: requireString(row, 'job_id', 'artifact'),
    attempt_number: requireInteger(
      row,
      'attempt_number',
      'artifact',
    ),
    source_id: requireString(
      row,
      'source_id',
      'artifact',
    ),
    artifact_kind: artifactKind,
    artifact_state: artifactState,
    filename: requireString(
      row,
      'filename',
      'artifact',
    ),
    relative_path: requireString(
      row,
      'relative_path',
      'artifact',
    ),
    media_type: requireString(
      row,
      'media_type',
      'artifact',
    ),
    byte_size: byteSize,
    sha256,
    created_at: requireUtcTimestamp(
      requireString(
        row,
        'created_at',
        'artifact',
      ),
      'artifact.created_at',
    ),
  };
};

const mapValidationSummaryRow = (
  rawRow: unknown,
): ValidationSummaryRecord => {
  const row = requireRecord(
    rawRow,
    'validation summary',
  );

  const validationStatus = row.validation_status;

  if (
    !isValidationStatus(validationStatus) ||
    validationStatus === 'NOT_RUN'
  ) {
    throw new Error(
      `Persisted validation_status is invalid for a validation record: ${String(validationStatus)}`,
    );
  }

  const checksTotal = requireInteger(
    row,
    'checks_total',
    'validation summary',
  );
  const checksPassed = requireInteger(
    row,
    'checks_passed',
    'validation summary',
  );
  const checksWarning = requireInteger(
    row,
    'checks_warning',
    'validation summary',
  );
  const checksFailed = requireInteger(
    row,
    'checks_failed',
    'validation summary',
  );

  if (
    checksTotal < 0 ||
    checksPassed < 0 ||
    checksWarning < 0 ||
    checksFailed < 0 ||
    checksTotal !==
      checksPassed +
        checksWarning +
        checksFailed
  ) {
    throw new Error(
      'Persisted validation check counts are inconsistent.',
    );
  }

  return {
    validation_id: requireString(
      row,
      'validation_id',
      'validation summary',
    ),
    run_id: requireString(
      row,
      'run_id',
      'validation summary',
    ),
    job_id: requireString(
      row,
      'job_id',
      'validation summary',
    ),
    artifact_id: requireString(
      row,
      'artifact_id',
      'validation summary',
    ),
    validation_status: validationStatus,
    checks_total: checksTotal,
    checks_passed: checksPassed,
    checks_warning: checksWarning,
    checks_failed: checksFailed,
    validated_at: requireUtcTimestamp(
      requireString(
        row,
        'validated_at',
        'validation summary',
      ),
      'validation_summary.validated_at',
    ),
    validation_json_path: requireNullableString(
      row,
      'validation_json_path',
      'validation summary',
    ),
  };
};

const mapValidationStatusToArtifactState = (
  validationStatus: Exclude<
    ValidationStatus,
    'NOT_RUN'
  >,
): ArtifactState => {
  switch (validationStatus) {
    case 'VALID':
      return 'ACCEPTED';
    case 'LOW_DATA':
    case 'NO_DATA':
      return 'ACCEPTED_WITH_WARNING';
    case 'INVALID_SCHEMA':
    case 'ERROR_NOT_DATA':
    case 'DATE_MISMATCH':
    case 'QUERY_MISMATCH':
      return 'REJECTED';
  }
};

const createOpaqueId = (
  prefix: 'artifact' | 'validation',
): string => `${prefix}_${randomBytes(8).toString('hex')}`;

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

const createWorkspaceId = (): string => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.]/g, '');
  const suffix = randomBytes(3).toString('hex');
  const workspaceId = `ws_${timestamp}_${suffix}`;

  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new Error(
      `Generated workspace_id does not match canonical pattern: ${workspaceId}`,
    );
  }

  return workspaceId;
};

const createPresetId = (): string => {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
  const presetId = `sp_${timestamp}_${randomBytes(3).toString('hex')}`;
  if (!PRESET_ID_PATTERN.test(presetId)) {
    throw new Error(`Generated preset_id does not match canonical pattern: ${presetId}`);
  }
  return presetId;
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
  requireNonEmpty(input.workspace_id, 'workspace_id');

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
  referenceDate?: string,
): QueryGroupRunConfigurationSnapshot => ({
  config_version: input.query_config.config_version,
  source_id: input.query_config.source_id,
  ...(referenceDate === undefined ? {} : { reference_date: requireDateOnly(referenceDate, 'reference_date') }),
  ...input.requested_configuration,
  selected_query_groups: input.query_config.groups.map(
    (group) => ({
      query_group_id: group.query_group_id,
      query_group_name: group.query_group_name,
      queries: [...group.queries],
    }),
  ),
});

const normalizeCreateRunFromJobPlansInput = (
  input: CreateRunFromJobPlansInput,
): CreateRunFromJobPlansInput => {
  const workspaceId = requireNonEmpty(
    input.workspace_id,
    'workspace_id',
  );
  const applicationVersion = requireNonEmpty(
    input.application_version,
    'application_version',
  );

  if (input.job_plans.length === 0) {
    throw new Error(
      'job_plans must contain at least one job.',
    );
  }

  const seenJobs = new Set<string>();
  const normalizedPlans = input.job_plans.map(
    (plan, index) => {
      const sourceId = requireNonEmpty(
        plan.source_id,
        `job_plans[${index}].source_id`,
      );
      const jobKey = requireNonEmpty(
        plan.job_key,
        `job_plans[${index}].job_key`,
      );

      if (!DOCUMENT_KEY_PATTERN.test(jobKey)) {
        throw new Error(
          `job_plans[${index}].job_key must be filesystem-safe for persisted JSON documents.`,
        );
      }
      const identity = `${sourceId}\0${jobKey}`;

      if (seenJobs.has(identity)) {
        throw new Error(
          `job_plans contains duplicate source_id/job_key: ${sourceId}/${jobKey}.`,
        );
      }

      seenJobs.add(identity);

      if (
        plan.query_group_id !== null &&
        plan.query_group_id.trim().length === 0
      ) {
        throw new Error(
          `job_plans[${index}].query_group_id must be non-empty or null.`,
        );
      }

      return {
        source_id: sourceId,
        job_key: jobKey,
        query_group_id: plan.query_group_id,
        source_context: requireJsonObject(
          plan.source_context,
          `job_plans[${index}].source_context`,
        ),
      };
    },
  );

  const configurationSnapshot = requireJsonObject(
    input.configuration_snapshot,
    'configuration_snapshot',
  );

  parseRunConfigurationSnapshot(
    JSON.stringify(configurationSnapshot),
  );

  return {
    workspace_id: workspaceId,
    application_version: applicationVersion,
    configuration_snapshot: configurationSnapshot,
    job_plans: normalizedPlans,
  };
};

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

  createWorkspace(
    input: CreateWorkspaceInput,
  ): WorkspaceRecord {
    const workspaceName = requireNonEmpty(
      input.workspace_name,
      'workspace_name',
    ).trim();
    const workspaceId = createWorkspaceId();
    const createdAt = new Date().toISOString();

    this.database.exec('BEGIN IMMEDIATE');

    try {
      this.database
        .prepare(`
          INSERT INTO workspaces (
            workspace_id,
            workspace_name,
            created_at
          ) VALUES (?, ?, ?)
        `)
        .run(workspaceId, workspaceName, createdAt);

      this.database.exec('COMMIT');
    } catch (error: unknown) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original persistence failure.
      }

      throw error;
    }

    const workspace = this.getWorkspace(workspaceId);

    if (!workspace) {
      throw new Error(
        `Workspace ${workspaceId} was not readable after creation.`,
      );
    }

    return workspace;
  }

  getWorkspace(
    workspaceId: string,
  ): WorkspaceRecord | null {
    requireNonEmpty(workspaceId, 'workspace_id');

    const row = this.database
      .prepare(`
        SELECT
          workspace_id,
          workspace_name,
          created_at
        FROM workspaces
        WHERE workspace_id = ?
      `)
      .get(workspaceId);

    return row === undefined
      ? null
      : mapWorkspaceRow(row);
  }

  listWorkspaces(): WorkspaceRecord[] {
    return this.database
      .prepare(`
        SELECT
          workspace_id,
          workspace_name,
          created_at
        FROM workspaces
        ORDER BY created_at ASC, workspace_id ASC
      `)
      .all()
      .map(mapWorkspaceRow);
  }

  createSavedCollectionPreset(
    input: CreateSavedCollectionPresetInput,
  ): SavedCollectionPresetRecord {
    const workspaceId = requireNonEmpty(input.workspace_id, 'workspace_id');
    const presetName = requireNonEmpty(input.preset_name, 'preset_name').trim();
    const configuration = requireJsonObject(input.reusable_configuration, 'reusable_configuration');
    const presetId = createPresetId();
    const timestamp = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT INTO saved_collection_presets (
          preset_id, workspace_id, preset_name,
          reusable_configuration_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(presetId, workspaceId, presetName, JSON.stringify(configuration), timestamp, timestamp);
      this.database.exec('COMMIT');
    } catch (error: unknown) {
      try { this.database.exec('ROLLBACK'); } catch { /* preserve original */ }
      throw error;
    }
    const preset = this.getSavedCollectionPreset(workspaceId, presetId);
    if (!preset) throw new Error(`Saved Collection Preset ${presetId} was not readable after creation.`);
    return preset;
  }

  getSavedCollectionPreset(workspaceId: string, presetId: string): SavedCollectionPresetRecord | null {
    requireNonEmpty(workspaceId, 'workspace_id');
    requireNonEmpty(presetId, 'preset_id');
    const row = this.database.prepare(`
      SELECT preset_id, workspace_id, preset_name, reusable_configuration_json, created_at, updated_at
      FROM saved_collection_presets WHERE workspace_id = ? AND preset_id = ?
    `).get(workspaceId, presetId);
    return row === undefined ? null : mapSavedCollectionPresetRow(row);
  }

  listSavedCollectionPresets(workspaceId: string): SavedCollectionPresetRecord[] {
    requireNonEmpty(workspaceId, 'workspace_id');
    return this.database.prepare(`
      SELECT preset_id, workspace_id, preset_name, reusable_configuration_json, created_at, updated_at
      FROM saved_collection_presets WHERE workspace_id = ?
      ORDER BY created_at ASC, preset_id ASC
    `).all(workspaceId).map(mapSavedCollectionPresetRow);
  }

  updateSavedCollectionPreset(
    input: UpdateSavedCollectionPresetInput,
  ): SavedCollectionPresetRecord {
    const workspaceId = requireNonEmpty(input.workspace_id, 'workspace_id');
    const presetId = requireNonEmpty(input.preset_id, 'preset_id');
    const presetName = requireNonEmpty(input.preset_name, 'preset_name').trim();
    const configuration = requireJsonObject(input.reusable_configuration, 'reusable_configuration');
    const updatedAt = new Date().toISOString();
    const result = this.database.prepare(`
      UPDATE saved_collection_presets
      SET preset_name = ?, reusable_configuration_json = ?, updated_at = ?
      WHERE workspace_id = ? AND preset_id = ?
    `).run(presetName, JSON.stringify(configuration), updatedAt, workspaceId, presetId);
    if (Number(result.changes) !== 1) {
      throw new Error(`Saved Collection Preset ${presetId} was not found in Workspace ${workspaceId}.`);
    }
    const preset = this.getSavedCollectionPreset(workspaceId, presetId);
    if (!preset) throw new Error(`Saved Collection Preset ${presetId} was not readable after update.`);
    return preset;
  }

  deleteSavedCollectionPreset(workspaceId: string, presetId: string): void {
    requireNonEmpty(workspaceId, 'workspace_id');
    requireNonEmpty(presetId, 'preset_id');
    const result = this.database.prepare(`
      DELETE FROM saved_collection_presets
      WHERE workspace_id = ? AND preset_id = ?
    `).run(workspaceId, presetId);
    if (Number(result.changes) !== 1) {
      throw new Error(`Saved Collection Preset ${presetId} was not found in Workspace ${workspaceId}.`);
    }
  }

  getLastRunSettings(workspaceId: string): LastRunSettingsRecord | null {
    requireNonEmpty(workspaceId, 'workspace_id');
    const row = this.database.prepare(`
      SELECT workspace_id, reusable_configuration_json, updated_at
      FROM workspace_last_run_settings WHERE workspace_id = ?
    `).get(workspaceId);
    return row === undefined ? null : mapLastRunSettingsRow(row);
  }

  upsertSourceConnection(
    input: UpsertWorkspaceSourceConnectionInput,
  ): WorkspaceSourceConnectionRecord {
    const workspaceId = requireNonEmpty(input.workspace_id, 'workspace_id');
    const sourceId = requireNonEmpty(input.source_id, 'source_id');
    const credentialRef = input.credential_ref === null
      ? null
      : requireNonEmpty(input.credential_ref, 'credential_ref');
    const safeMetadata = assertSafeConnectionMetadata(requireJsonObject(input.safe_metadata, 'safe_metadata'));
    const existing = this.getSourceConnection(workspaceId, sourceId);
    const connectionId = existing?.connection_id ?? `conn_${randomBytes(8).toString('hex')}`;
    const timestamp = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT INTO workspace_source_connections (
          connection_id, workspace_id, source_id, credential_ref,
          safe_metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, source_id) DO UPDATE SET
          credential_ref = excluded.credential_ref,
          safe_metadata_json = excluded.safe_metadata_json,
          updated_at = excluded.updated_at
      `).run(connectionId, workspaceId, sourceId, credentialRef, JSON.stringify(safeMetadata), existing?.created_at ?? timestamp, timestamp);
      this.database.exec('COMMIT');
    } catch (error: unknown) {
      try { this.database.exec('ROLLBACK'); } catch { /* preserve original */ }
      throw error;
    }
    const connection = this.getSourceConnection(workspaceId, sourceId);
    if (!connection) throw new Error(`Connection for ${sourceId} was not readable after persistence.`);
    return connection;
  }

  getSourceConnection(workspaceId: string, sourceId: string): WorkspaceSourceConnectionRecord | null {
    requireNonEmpty(workspaceId, 'workspace_id');
    requireNonEmpty(sourceId, 'source_id');
    const row = this.database.prepare(`
      SELECT connection_id, workspace_id, source_id, credential_ref,
        safe_metadata_json, created_at, updated_at
      FROM workspace_source_connections
      WHERE workspace_id = ? AND source_id = ?
    `).get(workspaceId, sourceId);
    return row === undefined ? null : mapWorkspaceSourceConnectionRow(row);
  }

  listSourceConnections(workspaceId: string): WorkspaceSourceConnectionRecord[] {
    requireNonEmpty(workspaceId, 'workspace_id');
    return this.database.prepare(`
      SELECT connection_id, workspace_id, source_id, credential_ref,
        safe_metadata_json, created_at, updated_at
      FROM workspace_source_connections
      WHERE workspace_id = ? ORDER BY source_id ASC
    `).all(workspaceId).map(mapWorkspaceSourceConnectionRow);
  }

  deleteSourceConnection(
    workspaceId: string,
    sourceId: string,
  ): WorkspaceSourceConnectionRecord | null {
    const normalizedWorkspaceId = requireNonEmpty(workspaceId, 'workspace_id');
    const normalizedSourceId = requireNonEmpty(sourceId, 'source_id');
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const row = this.database.prepare(`
        SELECT connection_id, workspace_id, source_id, credential_ref,
          safe_metadata_json, created_at, updated_at
        FROM workspace_source_connections
        WHERE workspace_id = ? AND source_id = ?
      `).get(normalizedWorkspaceId, normalizedSourceId);
      if (row === undefined) {
        this.database.exec('COMMIT');
        return null;
      }
      const removed = mapWorkspaceSourceConnectionRow(row);
      const result = this.database.prepare(`
        DELETE FROM workspace_source_connections
        WHERE workspace_id = ? AND source_id = ?
      `).run(normalizedWorkspaceId, normalizedSourceId);
      if (Number(result.changes) !== 1) {
        throw new Error(`Connection for ${normalizedSourceId} was not deleted.`);
      }
      this.database.exec('COMMIT');
      return removed;
    } catch (error: unknown) {
      try { this.database.exec('ROLLBACK'); } catch { /* preserve original */ }
      throw error;
    }
  }

  restoreSourceConnection(
    record: WorkspaceSourceConnectionRecord,
  ): WorkspaceSourceConnectionRecord {
    const connectionId = requireNonEmpty(record.connection_id, 'connection_id');
    const workspaceId = requireNonEmpty(record.workspace_id, 'workspace_id');
    const sourceId = requireNonEmpty(record.source_id, 'source_id');
    const credentialRef = record.credential_ref === null
      ? null
      : requireNonEmpty(record.credential_ref, 'credential_ref');
    const safeMetadata = assertSafeConnectionMetadata(
      requireJsonObject(record.safe_metadata, 'safe_metadata'),
    );
    const createdAt = requireUtcTimestamp(record.created_at, 'created_at');
    const updatedAt = requireUtcTimestamp(record.updated_at, 'updated_at');
    if (this.getSourceConnection(workspaceId, sourceId) !== null) {
      throw new Error(`Cannot restore connection for ${sourceId}: a row already exists.`);
    }
    this.database.prepare(`
      INSERT INTO workspace_source_connections (
        connection_id, workspace_id, source_id, credential_ref,
        safe_metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      connectionId,
      workspaceId,
      sourceId,
      credentialRef,
      JSON.stringify(safeMetadata),
      createdAt,
      updatedAt,
    );
    const restored = this.getSourceConnection(workspaceId, sourceId);
    if (!restored) throw new Error(`Connection for ${sourceId} was not readable after restore.`);
    return restored;
  }

  countSourceConnectionsByCredentialRef(credentialRef: string): number {
    const normalizedCredentialRef = requireNonEmpty(credentialRef, 'credential_ref');
    const row = requireRecord(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM workspace_source_connections
      WHERE credential_ref = ?
    `).get(normalizedCredentialRef), 'workspace source connection count');
    const count = row.count;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Workspace source connection count is invalid.');
    }
    return count;
  }

  rebindSourceConnections(
    input: RebindWorkspaceSourceConnectionsInput,
  ): readonly WorkspaceSourceConnectionRecord[] {
    const workspaceId = requireNonEmpty(input.workspace_id, 'workspace_id');
    const sourceIds = input.source_ids.map((sourceId) => requireNonEmpty(sourceId, 'source_id'));
    if (sourceIds.length === 0 || new Set(sourceIds).size !== sourceIds.length) {
      throw new Error('source_ids must contain at least one unique source identity.');
    }
    const expectedCredentialRef = requireNonEmpty(
      input.expected_credential_ref,
      'expected_credential_ref',
    );
    const replacementCredentialRef = requireNonEmpty(
      input.replacement_credential_ref,
      'replacement_credential_ref',
    );
    const safeMetadataUpdates = new Map<string, JsonObject>();
    for (const update of input.safe_metadata_updates ?? []) {
      const sourceId = requireNonEmpty(update.source_id, 'safe_metadata_update.source_id');
      if (!sourceIds.includes(sourceId) || safeMetadataUpdates.has(sourceId)) {
        throw new Error('safe_metadata_updates must target unique rebound source identities.');
      }
      safeMetadataUpdates.set(
        sourceId,
        assertSafeConnectionMetadata(
          requireJsonObject(
            update.safe_metadata,
            'safe_metadata_update.safe_metadata',
          ),
        ),
      );
    }
    const updatedAt = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const currentConnections = new Map<string, WorkspaceSourceConnectionRecord>();
      for (const sourceId of sourceIds) {
        const current = this.getSourceConnection(workspaceId, sourceId);
        if (!current) {
          throw new Error(`Connection for ${sourceId} was not found for rebind.`);
        }
        if (current.credential_ref !== expectedCredentialRef) {
          throw new Error(`Connection for ${sourceId} does not reference the expected credential.`);
        }
        currentConnections.set(sourceId, current);
      }
      for (const sourceId of sourceIds) {
        const current = currentConnections.get(sourceId);
        if (!current) throw new Error(`Connection for ${sourceId} was not retained for rebind.`);
        const result = this.database.prepare(`
          UPDATE workspace_source_connections
          SET credential_ref = ?, safe_metadata_json = ?, updated_at = ?
          WHERE workspace_id = ? AND source_id = ? AND credential_ref = ?
        `).run(
          replacementCredentialRef,
          JSON.stringify(
            safeMetadataUpdates.get(sourceId) ?? current.safe_metadata,
          ),
          updatedAt,
          workspaceId,
          sourceId,
          expectedCredentialRef,
        );
        if (Number(result.changes) !== 1) {
          throw new Error(`Connection for ${sourceId} changed before rebind completed.`);
        }
      }
      const rebound = sourceIds.map((sourceId) => {
        const connection = this.getSourceConnection(workspaceId, sourceId);
        if (!connection) throw new Error(`Connection for ${sourceId} was not readable after rebind.`);
        return connection;
      });
      this.database.exec('COMMIT');
      return rebound;
    } catch (error: unknown) {
      try { this.database.exec('ROLLBACK'); } catch { /* preserve original */ }
      throw error;
    }
  }

  createRunFromQueryConfig(
    input: CreateRunInput,
  ): {
    run: RunRecord;
    jobs: JobRecord[];
  } {
    validateCreateRunInput(input);

    return this.createRunFromJobPlans({
      workspace_id: input.workspace_id,
      application_version:
        input.application_version,
      configuration_snapshot:
        requireJsonObject(
          buildSnapshot(input),
          'configuration_snapshot',
        ),
      job_plans:
        input.query_config.groups.map(
          (group) => ({
            source_id:
              input.query_config.source_id,
            job_key:
              group.query_group_id,
            query_group_id:
              group.query_group_id,
            source_context: {
              query_group: {
                query_group_id:
                  group.query_group_id,
                query_group_name:
                  group.query_group_name,
                queries: [...group.queries],
              },
            },
          }),
        ),
    });
  }

  reserveRunFromQueryConfig(
    input: ReserveRunFromQueryConfigInput,
  ): { run: RunRecord; jobs: JobRecord[] } {
    validateCreateRunInput(input);
    const reusableConfiguration = requireJsonObject(
      input.reusable_configuration,
      'reusable_configuration',
    );
    return this.reserveRunFromJobPlans({
      workspace_id: input.workspace_id,
      application_version: input.application_version,
      reusable_configuration: reusableConfiguration,
      configuration_snapshot: requireJsonObject(
        buildSnapshot(input, input.reference_date),
        'configuration_snapshot',
      ),
      job_plans: input.query_config.groups.map((group) => ({
        source_id: input.query_config.source_id,
        job_key: group.query_group_id,
        query_group_id: group.query_group_id,
        source_context: {
          query_group: {
            query_group_id: group.query_group_id,
            query_group_name: group.query_group_name,
            queries: [...group.queries],
          },
        },
      })),
    });
  }

  createRunFromJobPlans(
    rawInput: CreateRunFromJobPlansInput,
  ): {
    run: RunRecord;
    jobs: JobRecord[];
  } {
    return this.persistRunAndJobs(rawInput, null);
  }

  reserveRunFromJobPlans(
    rawInput: ReserveRunFromJobPlansInput,
  ): {
    run: RunRecord;
    jobs: JobRecord[];
  } {
    const reusableConfiguration = requireJsonObject(
      rawInput.reusable_configuration,
      'reusable_configuration',
    );
    return this.persistRunAndJobs(
      {
        workspace_id: rawInput.workspace_id,
        application_version: rawInput.application_version,
        configuration_snapshot: rawInput.configuration_snapshot,
        job_plans: rawInput.job_plans,
      },
      reusableConfiguration,
    );
  }

  private persistRunAndJobs(
    rawInput: CreateRunFromJobPlansInput,
    lastRunSettings: ReusableCollectionConfiguration | null,
  ): {
    run: RunRecord;
    jobs: JobRecord[];
  } {
    const input =
      normalizeCreateRunFromJobPlansInput(rawInput);

    const runId = createRunId();
    const createdAt = new Date().toISOString();
    const selectedSources = [
      ...new Set(
        input.job_plans.map(
          (plan) => plan.source_id,
        ),
      ),
    ];

    this.database.exec('BEGIN IMMEDIATE');

    try {
      const activeRun = this.database
        .prepare(`
          SELECT run_id
          FROM runs
          WHERE workspace_id = ?
            AND run_status IN (
              'PENDING',
              'RUNNING',
              'MANUAL_ACTION_REQUIRED'
            )
          ORDER BY created_at ASC, run_id ASC
          LIMIT 1
        `)
        .get(input.workspace_id);

      if (activeRun !== undefined) {
        const active = requireRecord(
          activeRun,
          'active Workspace Run',
        );

        throw new WorkspaceActiveRunError(
          input.workspace_id,
          requireString(
            active,
            'run_id',
            'active Workspace Run',
          ),
        );
      }

      this.database
        .prepare(`
          INSERT INTO runs (
            run_id,
            workspace_id,
            run_status,
            created_at,
            started_at,
            completed_at,
            application_version,
            selected_sources_json,
            configuration_snapshot_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          runId,
          input.workspace_id,
          'PENDING',
          createdAt,
          null,
          null,
          input.application_version,
          JSON.stringify(selectedSources),
          JSON.stringify(
            input.configuration_snapshot,
          ),
        );

      const insertJob = this.database.prepare(`
        INSERT INTO jobs (
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      input.job_plans.forEach(
        (plan, jobOrder) => {
          insertJob.run(
            createJobId(
              runId,
              plan.source_id,
              plan.job_key,
            ),
            runId,
            plan.source_id,
            plan.job_key,
            plan.query_group_id,
            JSON.stringify(
              plan.source_context,
            ),
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

      if (lastRunSettings !== null) {
        this.database.prepare(`
          INSERT INTO workspace_last_run_settings (
            workspace_id, reusable_configuration_json, updated_at
          ) VALUES (?, ?, ?)
          ON CONFLICT(workspace_id) DO UPDATE SET
            reusable_configuration_json = excluded.reusable_configuration_json,
            updated_at = excluded.updated_at
        `).run(
          input.workspace_id,
          JSON.stringify(lastRunSettings),
          new Date().toISOString(),
        );
      }

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

  reacquireRunAndStartRetryAttempt(
    input: StartRetryAttemptInput,
  ): AttemptRecord | null {
    requireNonEmpty(input.job_id, 'job_id');

    if (
      !Number.isInteger(input.max_attempts) ||
      input.max_attempts < 1
    ) {
      throw new Error(
        'max_attempts must be an integer >= 1.',
      );
    }

    this.database.exec('BEGIN IMMEDIATE');

    try {
      const rawContext = this.database
        .prepare(`
          SELECT
            job.job_id,
            job.run_id,
            job.execution_status,
            job.attempt_count,
            run.workspace_id,
            run.run_status,
            run.started_at
          FROM jobs AS job
          INNER JOIN runs AS run
            ON run.run_id = job.run_id
          WHERE job.job_id = ?
        `)
        .get(input.job_id);

      if (rawContext === undefined) {
        throw new Error(`Unknown job: ${input.job_id}`);
      }

      const context = requireRecord(
        rawContext,
        'retry attempt context',
      );
      const runId = requireString(
        context,
        'run_id',
        'retry attempt context',
      );
      const workspaceId = requireString(
        context,
        'workspace_id',
        'retry attempt context',
      );
      const runStatus = context.run_status;
      const jobStatus = context.execution_status;

      if (!isRunStatus(runStatus)) {
        throw new Error(
          `Persisted run_status is invalid: ${String(runStatus)}`,
        );
      }

      if (runStatus !== 'RETRY_REQUIRED') {
        throw new Error(
          `Run ${runId} cannot reacquire retry ownership from ${runStatus}.`,
        );
      }

      if (!isExecutionStatus(jobStatus)) {
        throw new Error(
          `Persisted execution_status is invalid: ${String(jobStatus)}`,
        );
      }

      if (
        jobStatus !== 'FAILED' &&
        jobStatus !== 'RETRY_PENDING'
      ) {
        throw new Error(
          `Job ${input.job_id} cannot start a retry from ${jobStatus}.`,
        );
      }

      const attemptCount = requireInteger(
        context,
        'attempt_count',
        'retry attempt context',
      );

      if (attemptCount >= input.max_attempts) {
        this.database.exec('COMMIT');
        return null;
      }

      const rawActiveRun = this.database
        .prepare(`
          SELECT run_id
          FROM runs
          WHERE workspace_id = ?
            AND run_id <> ?
            AND run_status IN (
              'PENDING',
              'RUNNING',
              'MANUAL_ACTION_REQUIRED'
            )
          ORDER BY created_at ASC, run_id ASC
          LIMIT 1
        `)
        .get(workspaceId, runId);

      if (rawActiveRun !== undefined) {
        const activeRun = requireRecord(
          rawActiveRun,
          'active Workspace Run',
        );

        throw new WorkspaceActiveRunError(
          workspaceId,
          requireString(
            activeRun,
            'run_id',
            'active Workspace Run',
          ),
        );
      }

      assertRunStatusTransition(
        runStatus,
        'RUNNING',
      );

      const now = new Date().toISOString();

      this.database
        .prepare(`
          UPDATE runs
          SET
            run_status = 'RUNNING',
            started_at = COALESCE(started_at, ?),
            completed_at = NULL
          WHERE run_id = ?
        `)
        .run(now, runId);

      if (jobStatus === 'FAILED') {
        assertJobExecutionTransition(
          jobStatus,
          'RETRY_PENDING',
        );

        this.database
          .prepare(`
            UPDATE jobs
            SET
              execution_status = 'RETRY_PENDING',
              completed_at = NULL
            WHERE job_id = ?
          `)
          .run(input.job_id);
      }

      assertJobExecutionTransition(
        'RETRY_PENDING',
        'RUNNING',
      );

      const attemptNumber = attemptCount + 1;
      const attemptId = createAttemptId(
        input.job_id,
        attemptNumber,
      );

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
          input.job_id,
          attemptNumber,
          'RUNNING',
          null,
          null,
          null,
          now,
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
        .run(attemptNumber, now, input.job_id);

      this.database.exec('COMMIT');

      const attempt = this.getAttempt(attemptId);

      if (!attempt) {
        throw new Error(
          `Attempt ${attemptId} was not readable after retry creation.`,
        );
      }

      return attempt;
    } catch (error: unknown) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original retry failure.
      }

      throw error;
    }
  }

  registerCandidateArtifact(
    input: RegisterCandidateArtifactInput,
  ): ArtifactRecord {
    requireNonEmpty(
      input.attempt_id,
      'attempt_id',
    );
    requireNonEmpty(
      input.filename,
      'filename',
    );
    requireNonEmpty(
      input.relative_path,
      'relative_path',
    );
    requireNonEmpty(
      input.media_type,
      'media_type',
    );

    const byteSize = requireNonNegativeInteger(
      input.byte_size,
      'byte_size',
    );
    const sha256 = requireSha256(input.sha256);

    this.database.exec('BEGIN IMMEDIATE');

    try {
      const rawContext = this.database
        .prepare(`
          SELECT
            a.attempt_id,
            a.job_id,
            a.attempt_number,
            a.execution_status AS attempt_execution_status,
            a.candidate_artifact_id,
            a.validation_id,
            j.run_id,
            j.source_id,
            j.execution_status AS job_execution_status
          FROM attempts AS a
          INNER JOIN jobs AS j
            ON j.job_id = a.job_id
          WHERE a.attempt_id = ?
        `)
        .get(input.attempt_id);

      if (rawContext === undefined) {
        throw new Error(
          `Unknown attempt: ${input.attempt_id}`,
        );
      }

      const context = requireRecord(
        rawContext,
        'artifact attempt context',
      );

      const attemptStatus =
        context.attempt_execution_status;
      const jobStatus = context.job_execution_status;

      if (
        !isExecutionStatus(attemptStatus) ||
        !isExecutionStatus(jobStatus)
      ) {
        throw new Error(
          'Persisted execution status is invalid while registering artifact.',
        );
      }

      if (
        attemptStatus !== 'RUNNING' ||
        jobStatus !== 'RUNNING'
      ) {
        throw new Error(
          'Candidate artifact may only be registered for a RUNNING attempt/job.',
        );
      }

      if (context.candidate_artifact_id !== null) {
        throw new Error(
          `Attempt ${input.attempt_id} already has a candidate artifact.`,
        );
      }

      if (context.validation_id !== null) {
        throw new Error(
          `Attempt ${input.attempt_id} already has validation evidence.`,
        );
      }

      const artifactId = createOpaqueId('artifact');
      const createdAt = new Date().toISOString();
      const jobId = requireString(
        context,
        'job_id',
        'artifact attempt context',
      );
      const runId = requireString(
        context,
        'run_id',
        'artifact attempt context',
      );
      const sourceId = requireString(
        context,
        'source_id',
        'artifact attempt context',
      );
      const attemptNumber = requireInteger(
        context,
        'attempt_number',
        'artifact attempt context',
      );

      this.database
        .prepare(`
          INSERT INTO artifacts (
            artifact_id,
            run_id,
            job_id,
            attempt_number,
            source_id,
            artifact_kind,
            artifact_state,
            filename,
            relative_path,
            media_type,
            byte_size,
            sha256,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          artifactId,
          runId,
          jobId,
          attemptNumber,
          sourceId,
          'RAW_SOURCE_FILE',
          'CANDIDATE',
          input.filename,
          input.relative_path,
          input.media_type,
          byteSize,
          sha256,
          createdAt,
        );

      this.database
        .prepare(`
          UPDATE attempts
          SET candidate_artifact_id = ?
          WHERE attempt_id = ?
        `)
        .run(
          artifactId,
          input.attempt_id,
        );

      this.database.exec('COMMIT');

      const artifact = this.getArtifact(artifactId);

      if (!artifact) {
        throw new Error(
          `Artifact ${artifactId} was not readable after creation.`,
        );
      }

      return artifact;
    } catch (error: unknown) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original persistence failure.
      }

      throw error;
    }
  }

  recordValidationSummary(
    input: RecordValidationSummaryInput,
  ): ValidationSummaryRecord {
    requireNonEmpty(
      input.attempt_id,
      'attempt_id',
    );
    requireNonEmpty(
      input.artifact_id,
      'artifact_id',
    );

    const requestedValidationStatus: unknown =
      input.validation_status;

    if (
      !isValidationStatus(requestedValidationStatus) ||
      requestedValidationStatus === 'NOT_RUN'
    ) {
      throw new Error(
        'validation_status must be a terminal dataset validation status.',
      );
    }

    const checksTotal = requireNonNegativeInteger(
      input.checks_total,
      'checks_total',
    );
    const checksPassed = requireNonNegativeInteger(
      input.checks_passed,
      'checks_passed',
    );
    const checksWarning = requireNonNegativeInteger(
      input.checks_warning,
      'checks_warning',
    );
    const checksFailed = requireNonNegativeInteger(
      input.checks_failed,
      'checks_failed',
    );

    if (
      checksTotal !==
      checksPassed +
        checksWarning +
        checksFailed
    ) {
      throw new Error(
        'Validation check counts must add up to checks_total.',
      );
    }

    if (
      input.validation_json_path !== null
    ) {
      requireNonEmpty(
        input.validation_json_path,
        'validation_json_path',
      );
    }

    const artifactState =
      mapValidationStatusToArtifactState(
        input.validation_status,
      );

    this.database.exec('BEGIN IMMEDIATE');

    try {
      const rawContext = this.database
        .prepare(`
          SELECT
            a.job_id,
            a.attempt_number,
            a.execution_status AS attempt_execution_status,
            a.candidate_artifact_id,
            a.validation_id,
            j.run_id,
            j.execution_status AS job_execution_status,
            j.accepted_artifact_id
          FROM attempts AS a
          INNER JOIN jobs AS j
            ON j.job_id = a.job_id
          WHERE a.attempt_id = ?
        `)
        .get(input.attempt_id);

      if (rawContext === undefined) {
        throw new Error(
          `Unknown attempt: ${input.attempt_id}`,
        );
      }

      const context = requireRecord(
        rawContext,
        'validation attempt context',
      );

      const attemptStatus =
        context.attempt_execution_status;
      const jobStatus = context.job_execution_status;

      if (
        attemptStatus !== 'VALIDATING' ||
        jobStatus !== 'VALIDATING'
      ) {
        throw new Error(
          'Validation summary may only be recorded while attempt/job is VALIDATING.',
        );
      }

      if (
        context.candidate_artifact_id !==
        input.artifact_id
      ) {
        throw new Error(
          'Validation artifact does not match the attempt candidate artifact.',
        );
      }

      if (context.validation_id !== null) {
        throw new Error(
          `Attempt ${input.attempt_id} already has a validation result.`,
        );
      }

      const rawArtifact = this.database
        .prepare(`
          SELECT
            artifact_id,
            run_id,
            job_id,
            attempt_number,
            artifact_state
          FROM artifacts
          WHERE artifact_id = ?
        `)
        .get(input.artifact_id);

      if (rawArtifact === undefined) {
        throw new Error(
          `Unknown artifact: ${input.artifact_id}`,
        );
      }

      const artifact = requireRecord(
        rawArtifact,
        'validation artifact',
      );

      const persistedArtifactState =
        artifact.artifact_state;

      if (
        !isArtifactState(persistedArtifactState) ||
        persistedArtifactState !== 'CANDIDATE'
      ) {
        throw new Error(
          'Validation may only finalize a CANDIDATE artifact.',
        );
      }

      const jobId = requireString(
        context,
        'job_id',
        'validation attempt context',
      );
      const runId = requireString(
        context,
        'run_id',
        'validation attempt context',
      );
      const attemptNumber = requireInteger(
        context,
        'attempt_number',
        'validation attempt context',
      );

      if (
        requireString(
          artifact,
          'job_id',
          'validation artifact',
        ) !== jobId ||
        requireString(
          artifact,
          'run_id',
          'validation artifact',
        ) !== runId ||
        requireInteger(
          artifact,
          'attempt_number',
          'validation artifact',
        ) !== attemptNumber
      ) {
        throw new Error(
          'Artifact run/job/attempt context does not match validation attempt.',
        );
      }

      const validationId =
        createOpaqueId('validation');
      const validatedAt = new Date().toISOString();

      this.database
        .prepare(`
          INSERT INTO validations (
            validation_id,
            run_id,
            job_id,
            artifact_id,
            validation_status,
            checks_total,
            checks_passed,
            checks_warning,
            checks_failed,
            validated_at,
            validation_json_path
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          validationId,
          runId,
          jobId,
          input.artifact_id,
          input.validation_status,
          checksTotal,
          checksPassed,
          checksWarning,
          checksFailed,
          validatedAt,
          input.validation_json_path,
        );

      const previousAcceptedArtifactId =
        context.accepted_artifact_id;

      if (
        artifactState === 'ACCEPTED' ||
        artifactState ===
          'ACCEPTED_WITH_WARNING'
      ) {
        if (
          previousAcceptedArtifactId !== null &&
          previousAcceptedArtifactId !==
            input.artifact_id
        ) {
          if (
            typeof previousAcceptedArtifactId !==
            'string'
          ) {
            throw new Error(
              'Persisted accepted_artifact_id is invalid.',
            );
          }

          const previous = this.database
            .prepare(`
              SELECT artifact_state
              FROM artifacts
              WHERE artifact_id = ?
                AND job_id = ?
            `)
            .get(
              previousAcceptedArtifactId,
              jobId,
            );

          if (previous === undefined) {
            throw new Error(
              'Persisted accepted_artifact_id does not reference a job artifact.',
            );
          }

          const previousRow = requireRecord(
            previous,
            'previous accepted artifact',
          );
          const previousState =
            previousRow.artifact_state;

          if (
            previousState !== 'ACCEPTED' &&
            previousState !==
              'ACCEPTED_WITH_WARNING'
          ) {
            throw new Error(
              'Previous accepted artifact is not in an accepted state.',
            );
          }

          this.database
            .prepare(`
              UPDATE artifacts
              SET artifact_state = 'SUPERSEDED'
              WHERE artifact_id = ?
            `)
            .run(previousAcceptedArtifactId);
        }

        this.database
          .prepare(`
            UPDATE jobs
            SET
              validation_status = ?,
              accepted_artifact_id = ?
            WHERE job_id = ?
          `)
          .run(
            input.validation_status,
            input.artifact_id,
            jobId,
          );
      } else {
        this.database
          .prepare(`
            UPDATE jobs
            SET validation_status = ?
            WHERE job_id = ?
          `)
          .run(
            input.validation_status,
            jobId,
          );
      }

      this.database
        .prepare(`
          UPDATE artifacts
          SET artifact_state = ?
          WHERE artifact_id = ?
        `)
        .run(
          artifactState,
          input.artifact_id,
        );

      this.database
        .prepare(`
          UPDATE attempts
          SET validation_id = ?
          WHERE attempt_id = ?
        `)
        .run(
          validationId,
          input.attempt_id,
        );

      this.database.exec('COMMIT');

      const validation =
        this.getValidationSummary(validationId);

      if (!validation) {
        throw new Error(
          `Validation ${validationId} was not readable after creation.`,
        );
      }

      return validation;
    } catch (error: unknown) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original persistence failure.
      }

      throw error;
    }
  }

  setValidationJsonPath(
    validationId: string,
    validationJsonPath: string,
  ): ValidationSummaryRecord {
    if (
      validationJsonPath.trim().length === 0 ||
      validationJsonPath.startsWith('/') ||
      validationJsonPath.includes('\\') ||
      validationJsonPath.includes('\0') ||
      validationJsonPath
        .split('/')
        .includes('..')
    ) {
      throw new Error(
        'validation_json_path must be a safe run-relative portable path.',
      );
    }

    this.database.exec('BEGIN IMMEDIATE');

    try {
      const rawValidation = this.database
        .prepare(`
          SELECT validation_json_path
          FROM validations
          WHERE validation_id = ?
        `)
        .get(validationId);

      if (rawValidation === undefined) {
        throw new Error(
          `Unknown validation: ${validationId}`,
        );
      }

      const validation = requireRecord(
        rawValidation,
        'validation',
      );

      const currentPath =
        validation.validation_json_path;

      if (
        currentPath !== null &&
        typeof currentPath !== 'string'
      ) {
        throw new Error(
          'Persisted validation_json_path is invalid.',
        );
      }

      if (
        currentPath !== null &&
        currentPath !== validationJsonPath
      ) {
        throw new Error(
          `Validation ${validationId} already references a different JSON path.`,
        );
      }

      if (currentPath === null) {
        this.database
          .prepare(`
            UPDATE validations
            SET validation_json_path = ?
            WHERE validation_id = ?
          `)
          .run(
            validationJsonPath,
            validationId,
          );
      }

      this.database.exec('COMMIT');

      const updated =
        this.getValidationSummary(
          validationId,
        );

      if (!updated) {
        throw new Error(
          `Validation ${validationId} was not readable after JSON-path update.`,
        );
      }

      return updated;
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

  transitionRunStatus(
    runId: string,
    nextStatus: RunStatus,
  ): RunRecord {
    this.database.exec('BEGIN IMMEDIATE');

    try {
      const rawRun = this.database
        .prepare(`
          SELECT
            run_status,
            started_at,
            completed_at
          FROM runs
          WHERE run_id = ?
        `)
        .get(runId);

      if (rawRun === undefined) {
        throw new Error(`Unknown run: ${runId}`);
      }

      const run = requireRecord(rawRun, 'run');
      const currentStatus = run.run_status;

      if (!isRunStatus(currentStatus)) {
        throw new Error(
          `Persisted run_status is invalid: ${String(currentStatus)}`,
        );
      }

      assertRunStatusTransition(
        currentStatus,
        nextStatus,
      );

      const persistedStartedAt = requireNullableString(
        run,
        'started_at',
        'run',
      );

      const now = new Date().toISOString();

      const startedAt =
        nextStatus === 'RUNNING' &&
        persistedStartedAt === null
          ? now
          : persistedStartedAt;

      const completedAt = isTerminalRunStatus(nextStatus)
        ? now
        : null;

      this.database
        .prepare(`
          UPDATE runs
          SET
            run_status = ?,
            started_at = ?,
            completed_at = ?
          WHERE run_id = ?
        `)
        .run(
          nextStatus,
          startedAt,
          completedAt,
          runId,
        );

      this.database.exec('COMMIT');

      const updatedRun = this.getRun(runId);

      if (!updatedRun) {
        throw new Error(
          `Run ${runId} was not readable after transition.`,
        );
      }

      return updatedRun;
    } catch (error: unknown) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original transition failure.
      }

      throw error;
    }
  }

  listIncompleteRuns(workspaceId: string): RunRecord[] {
    requireNonEmpty(workspaceId, 'workspace_id');

    return this.database
      .prepare(`
        SELECT
          run_id,
          workspace_id,
          run_status,
          created_at,
          started_at,
          completed_at,
          application_version,
          selected_sources_json,
          configuration_snapshot_json
        FROM runs
        WHERE workspace_id = ?
          AND run_status IN (
          'PENDING',
          'RUNNING',
          'MANUAL_ACTION_REQUIRED',
          'RETRY_REQUIRED'
        )
        ORDER BY created_at ASC, run_id ASC
      `)
      .all(workspaceId)
      .map(mapRunRow);
  }

  listRuns(workspaceId: string): RunRecord[] {
    requireNonEmpty(workspaceId, 'workspace_id');
    return this.database.prepare(`
      SELECT run_id, workspace_id, run_status, created_at, started_at,
        completed_at, application_version, selected_sources_json,
        configuration_snapshot_json
      FROM runs WHERE workspace_id = ?
      ORDER BY created_at DESC, run_id DESC
    `).all(workspaceId).map(mapRunRow);
  }

  getLatestAcceptedSourceCompletion(
    workspaceId: string,
    sourceId: string,
  ): string | null {
    requireNonEmpty(workspaceId, 'workspace_id');
    requireNonEmpty(sourceId, 'source_id');
    const row = this.database.prepare(`
      SELECT j.completed_at
      FROM jobs AS j
      INNER JOIN runs AS r
        ON r.run_id = j.run_id
      INNER JOIN artifacts AS a
        ON a.artifact_id = j.accepted_artifact_id
      WHERE r.workspace_id = ?
        AND j.source_id = ?
        AND j.execution_status = 'COMPLETED'
        AND j.validation_status IN ('VALID', 'LOW_DATA', 'NO_DATA')
        AND j.completed_at IS NOT NULL
        AND a.artifact_state IN ('ACCEPTED', 'ACCEPTED_WITH_WARNING')
      ORDER BY j.completed_at DESC, j.job_id DESC
      LIMIT 1
    `).get(workspaceId, sourceId);
    if (row === undefined) return null;
    const record = requireRecord(
      row,
      'latest accepted source completion',
    );
    return requireUtcTimestamp(
      requireString(
        record,
        'completed_at',
        'latest accepted source completion',
      ),
      'latest accepted source completion.completed_at',
    );
  }

  getRun(runId: string): RunRecord | null {
    const row = this.database
      .prepare(`
        SELECT
          run_id,
          workspace_id,
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
          source_context_json,
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
          source_context_json,
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

  getArtifact(
    artifactId: string,
  ): ArtifactRecord | null {
    const row = this.database
      .prepare(`
        SELECT
          artifact_id,
          run_id,
          job_id,
          attempt_number,
          source_id,
          artifact_kind,
          artifact_state,
          filename,
          relative_path,
          media_type,
          byte_size,
          sha256,
          created_at
        FROM artifacts
        WHERE artifact_id = ?
      `)
      .get(artifactId);

    return row === undefined
      ? null
      : mapArtifactRow(row);
  }

  listArtifacts(jobId: string): ArtifactRecord[] {
    return this.database
      .prepare(`
        SELECT
          artifact_id,
          run_id,
          job_id,
          attempt_number,
          source_id,
          artifact_kind,
          artifact_state,
          filename,
          relative_path,
          media_type,
          byte_size,
          sha256,
          created_at
        FROM artifacts
        WHERE job_id = ?
        ORDER BY attempt_number ASC, created_at ASC
      `)
      .all(jobId)
      .map(mapArtifactRow);
  }

  getValidationSummary(
    validationId: string,
  ): ValidationSummaryRecord | null {
    const row = this.database
      .prepare(`
        SELECT
          validation_id,
          run_id,
          job_id,
          artifact_id,
          validation_status,
          checks_total,
          checks_passed,
          checks_warning,
          checks_failed,
          validated_at,
          validation_json_path
        FROM validations
        WHERE validation_id = ?
      `)
      .get(validationId);

    return row === undefined
      ? null
      : mapValidationSummaryRow(row);
  }

  listValidationSummaries(
    jobId: string,
  ): ValidationSummaryRecord[] {
    return this.database
      .prepare(`
        SELECT
          validation_id,
          run_id,
          job_id,
          artifact_id,
          validation_status,
          checks_total,
          checks_passed,
          checks_warning,
          checks_failed,
          validated_at,
          validation_json_path
        FROM validations
        WHERE job_id = ?
        ORDER BY validated_at ASC
      `)
      .all(jobId)
      .map(mapValidationSummaryRow);
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
