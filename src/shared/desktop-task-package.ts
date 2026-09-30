import type { DesktopRunState } from './desktop-multisource';
import type { JobPlan } from './run-job';
import type {
  AssembledTaskPackage,
  TaskEvidenceRequirement,
  TaskPackageAccountIdentity,
  TaskPackageRecipe,
  TaskPackageWindow,
} from './task-package';

export const DESKTOP_TASK_PACKAGE_RECIPE_ID = 'ADS_OPTIMIZATION_PACK' as const;

export interface DesktopTaskPackageReviewIntent {
  workspace_id: string;
  recipe_id: string;
}

export type DesktopTaskPackageRequirementStatus =
  | 'REUSE_EXACT'
  | 'REUSE_FILTERED'
  | 'NO_DATA'
  | 'COLLECT_REQUIRED'
  | 'BLOCKED';

export type DesktopTaskPackageReasonCode =
  | 'CONFIGURATION_REQUIRED'
  | 'CONNECTION_REQUIRED'
  | 'FILE_REQUIRED'
  | 'MANUAL_ACTION_REQUIRED'
  | 'NO_COMPATIBLE_EVIDENCE'
  | 'NO_DATA_REQUIRES_EXACT_WINDOW'
  | 'INCOMPATIBLE_CONTEXT'
  | 'INCOMPATIBLE_WINDOW'
  | 'INCOMPATIBLE_WORKSPACE'
  | 'INELIGIBLE_VALIDATION'
  | 'MISSING_ACCEPTED_ARTIFACT'
  | 'ARTIFACT_INELIGIBLE'
  | 'DATASET_LOAD_FAILED'
  | 'DATASET_IDENTITY_MISMATCH'
  | 'DAILY_ROWS_REQUIRED'
  | 'INVALID_ROW_DATE'
  | 'NO_RESOLUTION'
  | 'RESOLUTION_REQUIREMENT_MISMATCH'
  | 'EVIDENCE_UNAVAILABLE';

export interface DesktopTaskPackageRequirementView {
  requirement_id: string;
  dataset_type: string;
  status: DesktopTaskPackageRequirementStatus;
  reason_codes: DesktopTaskPackageReasonCode[];
}

export type DesktopTaskPackageReviewStatus =
  | 'NOT_READY'
  | 'INITIAL_BASELINE'
  | 'COMPARISON'
  | 'EXISTING_PACKAGE';

export interface DesktopTaskPackageReview {
  recipe_id: string;
  recipe_version: number;
  recipe_label: string;
  workspace_id: string;
  account_identity: TaskPackageAccountIdentity;
  customer_id: string;
  reference_date: string;
  current_window: TaskPackageWindow;
  status: DesktopTaskPackageReviewStatus;
  can_start: boolean;
  can_open: boolean;
  collection_run_id: string | null;
  requirements: DesktopTaskPackageRequirementView[];
  previous_package_id?: string;
  previous_window?: TaskPackageWindow;
  gap_days?: number;
  existing_package_id?: string;
}

export interface DesktopTaskPackageStartIntent {
  workspace_id: string;
  recipe_id: string;
  recipe_version: number;
  reference_date: string;
  current_window: TaskPackageWindow;
  account_identity: TaskPackageAccountIdentity;
}

export interface DesktopTaskPackageSummary {
  package_id: string;
  package_kind: 'INITIAL_BASELINE' | 'COMPARISON';
  current_window: TaskPackageWindow;
  previous_package_id?: string;
  previous_window?: TaskPackageWindow;
  gap_days?: number;
}

export type DesktopTaskPackageStartResult =
  | {
      status: 'PACKAGE_PUBLISHED' | 'EXISTING_PACKAGE';
      package: DesktopTaskPackageSummary;
    }
  | {
      status: 'COLLECTION_STARTED';
      run_state: DesktopRunState;
    };

export type DesktopTaskPackageErrorCode =
  | 'INVALID_INTENT'
  | 'UNKNOWN_WORKSPACE'
  | 'UNKNOWN_RECIPE'
  | 'CONFIGURATION_REQUIRED'
  | 'CONNECTION_REQUIRED'
  | 'STALE_REVIEW'
  | 'ACTIVE_MATCHING_COLLECTION'
  | 'PACKAGE_NOT_FOUND'
  | 'PACKAGE_INVALID'
  | 'CORE_START_FAILED'
  | 'PUBLICATION_FAILED'
  | 'LOCAL_REVIEW_FAILED';

export type DesktopTaskPackageResponse<T> =
  | { ok: true; result: T }
  | {
      ok: false;
      error: {
        code: DesktopTaskPackageErrorCode;
        retryable: boolean;
      };
    };

export interface DesktopTaskPackageDefinition {
  recipe: TaskPackageRecipe;
  connection_source_id: string;
  normalize_account_identity: (safe_metadata: Record<string, unknown>) => TaskPackageAccountIdentity;
  build_job_plan: (input: {
    requirement: TaskEvidenceRequirement;
    account_identity: TaskPackageAccountIdentity;
    current_window: TaskPackageWindow;
  }) => JobPlan;
  publish_package: (taskPackage: AssembledTaskPackage) => Promise<{ package_id: string }>;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const isDesktopTaskPackageReviewIntent = (
  value: unknown,
): value is DesktopTaskPackageReviewIntent => {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 2
    && keys[0] === 'recipe_id'
    && keys[1] === 'workspace_id'
    && typeof value.workspace_id === 'string'
    && value.workspace_id.trim().length > 0
    && typeof value.recipe_id === 'string'
    && value.recipe_id.trim().length > 0;
};

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
};

const nonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

export const isDesktopTaskPackageStartIntent = (
  value: unknown,
): value is DesktopTaskPackageStartIntent => {
  if (!isPlainRecord(value) || !exactKeys(value, [
    'workspace_id', 'recipe_id', 'recipe_version', 'reference_date',
    'current_window', 'account_identity',
  ])) return false;
  if (!isPlainRecord(value.current_window) || !exactKeys(value.current_window, ['start', 'end'])) {
    return false;
  }
  if (!isPlainRecord(value.account_identity) || !exactKeys(value.account_identity, ['field', 'value'])) {
    return false;
  }
  return nonEmptyString(value.workspace_id)
    && nonEmptyString(value.recipe_id)
    && Number.isInteger(value.recipe_version)
    && (value.recipe_version as number) > 0
    && /^\d{4}-\d{2}-\d{2}$/u.test(String(value.reference_date))
    && /^\d{4}-\d{2}-\d{2}$/u.test(String(value.current_window.start))
    && /^\d{4}-\d{2}-\d{2}$/u.test(String(value.current_window.end))
    && nonEmptyString(value.account_identity.field)
    && nonEmptyString(value.account_identity.value);
};
