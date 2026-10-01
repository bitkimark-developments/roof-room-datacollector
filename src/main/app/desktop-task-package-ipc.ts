import type {
  DesktopTaskPackageErrorCode,
  DesktopTaskPackageResponse,
  DesktopTaskPackageReview,
  DesktopTaskPackageReviewIntent,
  DesktopTaskPackageStartIntent,
  DesktopTaskPackageStartResult,
} from '../../shared/desktop-task-package';
import {
  isDesktopTaskPackageReviewIntent,
  isDesktopTaskPackageStartIntent,
} from '../../shared/desktop-task-package';
import { countCalendarDays } from '../task-packages/task-package-window';
import { DesktopTaskPackageControllerError } from './desktop-task-package-controller';
import {
  isExecutionStatus,
  isRunStatus,
  isValidationStatus,
} from '../../shared/run-job';
import {
  GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET,
  type GoogleAdsSearchReportingDatasetType,
} from '../../shared/google-ads-search-reporting';

type Controller = {
  review(intent: DesktopTaskPackageReviewIntent): Promise<unknown>;
  start(intent: DesktopTaskPackageStartIntent): Promise<unknown>;
};

const ERROR_CODES = new Set<DesktopTaskPackageErrorCode>([
  'INVALID_INTENT', 'UNKNOWN_WORKSPACE', 'UNKNOWN_RECIPE', 'CONFIGURATION_REQUIRED',
  'CONNECTION_REQUIRED', 'STALE_REVIEW', 'ACTIVE_MATCHING_COLLECTION',
  'PACKAGE_NOT_FOUND', 'PACKAGE_INVALID', 'CORE_START_FAILED',
  'PUBLICATION_FAILED', 'LOCAL_REVIEW_FAILED',
]);

const REVIEW_STATUSES = new Set([
  'NOT_READY', 'INITIAL_BASELINE', 'COMPARISON', 'EXISTING_PACKAGE',
]);
const REQUIREMENT_STATUSES = new Set([
  'REUSE_EXACT', 'REUSE_FILTERED', 'NO_DATA', 'COLLECT_REQUIRED', 'BLOCKED',
]);
const REASON_CODES = new Set([
  'CONFIGURATION_REQUIRED', 'CONNECTION_REQUIRED', 'FILE_REQUIRED',
  'MANUAL_ACTION_REQUIRED', 'NO_COMPATIBLE_EVIDENCE',
  'NO_DATA_REQUIRES_EXACT_WINDOW', 'INCOMPATIBLE_CONTEXT',
  'INCOMPATIBLE_WINDOW', 'INCOMPATIBLE_WORKSPACE', 'INELIGIBLE_VALIDATION',
  'MISSING_ACCEPTED_ARTIFACT', 'ARTIFACT_INELIGIBLE', 'DATASET_LOAD_FAILED',
  'DATASET_IDENTITY_MISMATCH', 'DAILY_ROWS_REQUIRED', 'INVALID_ROW_DATE',
  'NO_RESOLUTION', 'RESOLUTION_REQUIREMENT_MISMATCH', 'EVIDENCE_UNAVAILABLE',
]);
const REQUIRED_DATASETS = new Set([
  'CAMPAIGN_PERFORMANCE', 'AD_GROUP_PERFORMANCE', 'KEYWORD_PERFORMANCE',
  'SEARCH_TERMS', 'AD_PERFORMANCE', 'RSA_ASSET_PERFORMANCE',
]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && (
    Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null
  )
);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => allowed.has(key));
};

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isSafeIdentifier = (value: unknown): value is string => (
  typeof value === 'string'
  && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u.test(value)
);

const isIsoTimestamp = (value: unknown): value is string => (
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  && !Number.isNaN(Date.parse(value))
);

const isNullableTimestamp = (value: unknown): boolean => (
  value === null || isIsoTimestamp(value)
);

const isSafeErrorCode = (value: unknown): boolean => (
  value === null
  || (typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value))
);

const isSafePackageId = (value: unknown): value is string => (
  typeof value === 'string'
  && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value)
  && value !== '.'
  && value !== '..'
);

const isWindow = (value: unknown): boolean => {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['start', 'end'])) return false;
  try {
    return countCalendarDays({ start: String(value.start), end: String(value.end) }) === 7;
  } catch {
    return false;
  }
};

const isAccount = (
  value: unknown,
): value is { field: 'customer_id'; value: string } => (
  isPlainRecord(value)
  && hasExactKeys(value, ['field', 'value'])
  && value.field === 'customer_id'
  && isNonEmptyString(value.value)
);

const containsForbiddenKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isPlainRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => (
    /(credential|token|secret|password|api[_-]?key|path|raw|rows|provider[_-]?body)/iu.test(key)
    || containsForbiddenKey(nested)
  ));
};

const isRequirement = (value: unknown): boolean => (
  isPlainRecord(value)
  && hasExactKeys(value, ['requirement_id', 'dataset_type', 'status', 'reason_codes'])
  && isNonEmptyString(value.requirement_id)
  && isNonEmptyString(value.dataset_type)
  && typeof value.status === 'string'
  && REQUIREMENT_STATUSES.has(value.status)
  && Array.isArray(value.reason_codes)
  && value.reason_codes.every((code) => typeof code === 'string' && REASON_CODES.has(code))
);

const requireSafeReview = (value: unknown): DesktopTaskPackageReview => {
  if (
    !isPlainRecord(value)
    || !hasExactKeys(value, [
      'recipe_id', 'recipe_version', 'recipe_label', 'workspace_id', 'account_identity',
      'customer_id', 'reference_date', 'current_window', 'status', 'can_start',
      'can_open', 'collection_run_id', 'requirements',
    ], ['previous_package_id', 'previous_window', 'gap_days', 'existing_package_id'])
    || value.recipe_id !== 'ADS_OPTIMIZATION_PACK'
    || value.recipe_version !== 1
    || !isNonEmptyString(value.recipe_label)
    || !isNonEmptyString(value.workspace_id)
    || !isAccount(value.account_identity)
    || value.customer_id !== value.account_identity.value
    || !/^\d{4}-\d{2}-\d{2}$/u.test(String(value.reference_date))
    || !isWindow(value.current_window)
    || typeof value.status !== 'string'
    || !REVIEW_STATUSES.has(value.status)
    || typeof value.can_start !== 'boolean'
    || typeof value.can_open !== 'boolean'
    || !(value.collection_run_id === null || isNonEmptyString(value.collection_run_id))
    || !Array.isArray(value.requirements)
    || value.requirements.length !== 6
    || !value.requirements.every(isRequirement)
    || new Set(value.requirements.map((requirement) => requirement.requirement_id)).size !== 6
    || value.requirements.some((requirement) => (
      requirement.requirement_id !== requirement.dataset_type
      || !REQUIRED_DATASETS.has(requirement.dataset_type)
    ))
    || (Object.hasOwn(value, 'previous_package_id') && !isSafePackageId(value.previous_package_id))
    || (Object.hasOwn(value, 'previous_window') && !isWindow(value.previous_window))
    || (Object.hasOwn(value, 'gap_days') && (!Number.isInteger(value.gap_days) || (value.gap_days as number) < 0))
    || (Object.hasOwn(value, 'existing_package_id') && !isSafePackageId(value.existing_package_id))
    || containsForbiddenKey(value)
  ) {
    throw new Error('Desktop Task Package review response is invalid.');
  }
  return JSON.parse(JSON.stringify(value)) as DesktopTaskPackageReview;
};

const isRunState = (value: unknown): boolean => {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    'run', 'jobs', 'completed_jobs', 'failed_jobs', 'can_resume', 'can_retry', 'can_cancel',
  ], ['job_attempts'])) return false;
  if (!isPlainRecord(value.run) || !hasExactKeys(value.run, [
    'run_id', 'workspace_id', 'run_status', 'created_at', 'started_at', 'completed_at',
    'application_version', 'selected_sources', 'requested_configuration', 'configuration_snapshot',
  ])) return false;
  const run = value.run;
  if (
    !isSafeIdentifier(run.run_id)
    || !isSafeIdentifier(run.workspace_id)
    || !isRunStatus(run.run_status)
    || !isIsoTimestamp(run.created_at)
    || !isNullableTimestamp(run.started_at)
    || !isNullableTimestamp(run.completed_at)
    || typeof run.application_version !== 'string'
    || !/^[a-zA-Z0-9][a-zA-Z0-9.+_-]*$/u.test(run.application_version)
    || !Array.isArray(run.selected_sources)
    || run.selected_sources.length !== 1
    || run.selected_sources[0] !== 'google-ads-search-reporting'
    || run.requested_configuration !== null
    || !isPlainRecord(run.configuration_snapshot)
    || !hasExactKeys(run.configuration_snapshot, ['task_package'])
    || !isPlainRecord(run.configuration_snapshot.task_package)
  ) return false;
  const taskPackage = run.configuration_snapshot.task_package;
  const accountIdentity = taskPackage.account_identity;
  const currentWindow = taskPackage.current_window;
  if (
    !hasExactKeys(taskPackage, [
      'recipe_id', 'recipe_version', 'workspace_id', 'account_identity', 'current_window',
    ])
    || taskPackage.recipe_id !== 'ADS_OPTIMIZATION_PACK'
    || taskPackage.recipe_version !== 1
    || taskPackage.workspace_id !== run.workspace_id
    || !isAccount(accountIdentity)
    || !isPlainRecord(currentWindow)
    || !isWindow(currentWindow)
  ) return false;
  const jobs = value.jobs;
  if (!Array.isArray(jobs) || !jobs.every((job) => {
    if (!isPlainRecord(job) || !hasExactKeys(job, [
      'job_id', 'run_id', 'source_id', 'job_key', 'query_group_id', 'source_context',
      'job_order', 'execution_status', 'validation_status', 'attempt_count',
      'accepted_artifact_id', 'created_at', 'started_at', 'completed_at',
    ])) return false;
    const context = job.source_context;
    const datasetType = job.job_key as GoogleAdsSearchReportingDatasetType;
    return isSafeIdentifier(job.job_id)
      && job.run_id === run.run_id
      && job.source_id === 'google-ads-search-reporting'
      && typeof job.job_key === 'string'
      && REQUIRED_DATASETS.has(job.job_key)
      && job.query_group_id === null
      && isPlainRecord(context)
      && hasExactKeys(context, [
        'source_id', 'dataset_type', 'resource_mode', 'campaign_type', 'customer_id',
        'requested_date_start', 'requested_date_end', 'dataset_schema_version',
      ])
      && context.source_id === job.source_id
      && context.dataset_type === job.job_key
      && context.resource_mode === GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET[datasetType]
      && context.campaign_type === 'SEARCH'
      && context.customer_id === accountIdentity.value
      && isNonEmptyString(context.customer_id)
      && context.requested_date_start === currentWindow.start
      && context.requested_date_end === currentWindow.end
      && context.dataset_schema_version === 1
      && Number.isInteger(job.job_order)
      && (job.job_order as number) >= 0
      && isExecutionStatus(job.execution_status)
      && isValidationStatus(job.validation_status)
      && Number.isInteger(job.attempt_count)
      && (job.attempt_count as number) >= 0
      && (job.accepted_artifact_id === null || isSafeIdentifier(job.accepted_artifact_id))
      && isIsoTimestamp(job.created_at)
      && isNullableTimestamp(job.started_at)
      && isNullableTimestamp(job.completed_at);
  })) return false;
  if (Object.hasOwn(value, 'job_attempts') && (
    !Array.isArray(value.job_attempts)
    || !value.job_attempts.every((attempt) => (
      isPlainRecord(attempt)
      && hasExactKeys(attempt, [
        'job_id', 'attempt_number', 'execution_status', 'error_code',
        'started_at', 'completed_at',
      ])
      && jobs.some((job) => isPlainRecord(job) && job.job_id === attempt.job_id)
      && Number.isInteger(attempt.attempt_number)
      && (attempt.attempt_number as number) > 0
      && isExecutionStatus(attempt.execution_status)
      && isSafeErrorCode(attempt.error_code)
      && isIsoTimestamp(attempt.started_at)
      && isNullableTimestamp(attempt.completed_at)
    ))
  )) return false;
  return Number.isInteger(value.completed_jobs)
    && (value.completed_jobs as number) >= 0
    && Number.isInteger(value.failed_jobs)
    && (value.failed_jobs as number) >= 0
    && typeof value.can_resume === 'boolean'
    && typeof value.can_retry === 'boolean'
    && typeof value.can_cancel === 'boolean'
    && !containsForbiddenKey(value);
};

const isPackageSummary = (value: unknown): boolean => (
  isPlainRecord(value)
  && hasExactKeys(value, ['package_id', 'package_kind', 'current_window'], [
    'previous_package_id', 'previous_window', 'gap_days',
  ])
  && isSafePackageId(value.package_id)
  && (value.package_kind === 'INITIAL_BASELINE' || value.package_kind === 'COMPARISON')
  && isWindow(value.current_window)
  && (!Object.hasOwn(value, 'previous_package_id') || isSafePackageId(value.previous_package_id))
  && (!Object.hasOwn(value, 'previous_window') || isWindow(value.previous_window))
  && (!Object.hasOwn(value, 'gap_days') || (Number.isInteger(value.gap_days) && (value.gap_days as number) >= 0))
);

const requireSafeStartResult = (value: unknown): DesktopTaskPackageStartResult => {
  if (!isPlainRecord(value) || containsForbiddenKey(value)) {
    throw new Error('Desktop Task Package start response is invalid.');
  }
  if (
    (value.status === 'PACKAGE_PUBLISHED' || value.status === 'EXISTING_PACKAGE')
    && hasExactKeys(value, ['status', 'package'])
    && isPackageSummary(value.package)
  ) return JSON.parse(JSON.stringify(value)) as DesktopTaskPackageStartResult;
  if (
    value.status === 'COLLECTION_STARTED'
    && hasExactKeys(value, ['status', 'run_state'])
    && isRunState(value.run_state)
  ) return JSON.parse(JSON.stringify(value)) as DesktopTaskPackageStartResult;
  throw new Error('Desktop Task Package start response is invalid.');
};

const failure = <T>(
  code: DesktopTaskPackageErrorCode,
  retryable = false,
): DesktopTaskPackageResponse<T> => ({ ok: false, error: { code, retryable } });

const controllerFailure = <T>(
  error: unknown,
  fallback: DesktopTaskPackageErrorCode,
): DesktopTaskPackageResponse<T> => (
  error instanceof DesktopTaskPackageControllerError && ERROR_CODES.has(error.code)
    ? failure(error.code, false)
    : failure(fallback, false)
);

export const createDesktopTaskPackageHandlers = <Event>(dependencies: {
  assertTrustedSender: (event: Event) => void;
  controller: Controller;
  open_package: (package_id: string) => Promise<void>;
}) => ({
  review: async (
    event: Event,
    value: unknown,
  ): Promise<DesktopTaskPackageResponse<DesktopTaskPackageReview>> => {
    dependencies.assertTrustedSender(event);
    if (!isDesktopTaskPackageReviewIntent(value) || value.recipe_id !== 'ADS_OPTIMIZATION_PACK') {
      return failure('INVALID_INTENT');
    }
    try {
      return { ok: true, result: requireSafeReview(await dependencies.controller.review(value)) };
    } catch (error: unknown) {
      return controllerFailure(error, 'LOCAL_REVIEW_FAILED');
    }
  },
  start: async (
    event: Event,
    value: unknown,
  ): Promise<DesktopTaskPackageResponse<DesktopTaskPackageStartResult>> => {
    dependencies.assertTrustedSender(event);
    if (
      !isDesktopTaskPackageStartIntent(value)
      || value.recipe_id !== 'ADS_OPTIMIZATION_PACK'
      || value.recipe_version !== 1
      || value.account_identity.field !== 'customer_id'
      || !isWindow(value.current_window)
    ) return failure('INVALID_INTENT');
    let result: unknown;
    try {
      result = await dependencies.controller.start(value);
    } catch (error: unknown) {
      return controllerFailure(error, 'CORE_START_FAILED');
    }
    try {
      return { ok: true, result: requireSafeStartResult(result) };
    } catch {
      return failure('LOCAL_REVIEW_FAILED');
    }
  },
  open: async (
    event: Event,
    value: unknown,
  ): Promise<DesktopTaskPackageResponse<{ package_id: string }>> => {
    dependencies.assertTrustedSender(event);
    if (
      !isPlainRecord(value)
      || !hasExactKeys(value, ['package_id'])
      || !isSafePackageId(value.package_id)
    ) return failure('INVALID_INTENT');
    try {
      await dependencies.open_package(value.package_id);
      return { ok: true, result: { package_id: value.package_id } };
    } catch {
      return failure('PACKAGE_INVALID');
    }
  },
});
