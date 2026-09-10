export const RUN_STATUSES = [
  'PENDING',
  'RUNNING',
  'MANUAL_ACTION_REQUIRED',
  'RETRY_REQUIRED',
  'COMPLETED',
  'COMPLETED_WITH_WARNINGS',
  'FAILED',
  'CANCELLED',
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const EXECUTION_STATUSES = [
  'PENDING',
  'RUNNING',
  'VALIDATING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'MANUAL_ACTION_REQUIRED',
  'RETRY_PENDING',
] as const;

export type ExecutionStatus =
  (typeof EXECUTION_STATUSES)[number];

export const VALIDATION_STATUSES = [
  'NOT_RUN',
  'VALID',
  'LOW_DATA',
  'NO_DATA',
  'INVALID_SCHEMA',
  'ERROR_NOT_DATA',
  'DATE_MISMATCH',
  'QUERY_MISMATCH',
] as const;

export type ValidationStatus =
  (typeof VALIDATION_STATUSES)[number];

export type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = {
  [key: string]: JsonValue;
};

export interface RequestedCollectionConfiguration {
  source_mode: string;
  country_code: string;
  language_code: string | null;
  requested_date_start: string;
  requested_date_end: string;
  category_id: string | null;
  category_name: string;
  search_type: string;
  selection_type: string;
  dataset_type: string;
}

export interface QueryGroupRunConfigurationSnapshot
  extends RequestedCollectionConfiguration {
  config_version: number;
  source_id: string;
  reference_date?: string;
  selected_query_groups: Array<{
    query_group_id: string;
    query_group_name: string;
    queries: string[];
  }>;
}

export type RunConfigurationSnapshot =
  | QueryGroupRunConfigurationSnapshot
  | JsonObject;

export interface RunRecord {
  run_id: string;
  workspace_id: string;
  run_status: RunStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  application_version: string;
  selected_sources: string[];
  requested_configuration:
    RequestedCollectionConfiguration | null;
  configuration_snapshot: RunConfigurationSnapshot;
}

export interface JobPlan {
  source_id: string;
  job_key: string;
  query_group_id: string | null;
  source_context: JsonObject;
}

export interface JobRecord {
  job_id: string;
  run_id: string;
  source_id: string;
  job_key: string;
  query_group_id: string | null;
  source_context: JsonObject;
  job_order: number;
  execution_status: ExecutionStatus;
  validation_status: ValidationStatus;
  attempt_count: number;
  accepted_artifact_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export const isRunStatus = (
  value: unknown,
): value is RunStatus =>
  typeof value === 'string' &&
  (RUN_STATUSES as readonly string[]).includes(value);

export const isExecutionStatus = (
  value: unknown,
): value is ExecutionStatus =>
  typeof value === 'string' &&
  (EXECUTION_STATUSES as readonly string[]).includes(value);

export const isValidationStatus = (
  value: unknown,
): value is ValidationStatus =>
  typeof value === 'string' &&
  (VALIDATION_STATUSES as readonly string[]).includes(value);
