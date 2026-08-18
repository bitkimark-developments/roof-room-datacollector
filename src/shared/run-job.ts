export const RUN_STATUSES = [
  'PENDING',
  'RUNNING',
  'MANUAL_ACTION_REQUIRED',
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

export interface RunConfigurationSnapshot
  extends RequestedCollectionConfiguration {
  config_version: number;
  source_id: string;
  selected_query_groups: Array<{
    query_group_id: string;
    query_group_name: string;
    queries: string[];
  }>;
}

export interface RunRecord {
  run_id: string;
  run_status: RunStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  application_version: string;
  selected_sources: string[];
  requested_configuration: RequestedCollectionConfiguration;
  configuration_snapshot: RunConfigurationSnapshot;
}

export interface JobRecord {
  job_id: string;
  run_id: string;
  source_id: string;
  job_key: string;
  query_group_id: string;
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
