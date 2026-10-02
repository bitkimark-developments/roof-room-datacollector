import type {
  LastRunSettingsRecord,
  RunDraft,
  RunDraftOrigin,
  ReusableCollectionConfiguration,
  SavedCollectionPresetRecord,
} from './collection-configuration';
import type {
  JobPlan,
  JobRecord,
  RunRecord,
} from './run-job';
import type {
  WorkspaceRecord,
} from './workspace';
import type { FreshnessStatus } from './freshness';
import type { ArtifactRecord } from './artifact';
import type { AttemptRecord } from './attempt';

export const SUPPORTED_DESKTOP_SOURCE_IDS = [
  'google-trends',
  'google-search-console-query',
  'google-search-console-query-page',
  'google-ads-search-terms',
  'google-keyword-planner',
  'google-analytics-4',
  'google-keyword-planner-csv',
  'ikas-products',
  'bitkimark-sitemap',
  'serpapi',
] as const;

export type DesktopSourceId = (typeof SUPPORTED_DESKTOP_SOURCE_IDS)[number];

export type DesktopReadinessStatus =
  | 'READY'
  | 'CONFIGURATION_REQUIRED'
  | 'CONNECTION_REQUIRED'
  | 'FILE_REQUIRED'
  | 'MANUAL_ACTION_REQUIRED';

export const DESKTOP_CREDENTIAL_MANAGED_SOURCE_IDS = [
  'google-search-console-query-page',
  'google-ads-search-terms',
  'google-keyword-planner',
  'google-analytics-4',
  'serpapi',
] as const;

export type DesktopCredentialManagedSourceId =
  (typeof DESKTOP_CREDENTIAL_MANAGED_SOURCE_IDS)[number];

export type DesktopCredentialStatus =
  | 'NOT_CONFIGURED'
  | 'AVAILABLE'
  | 'MISSING';

export interface DesktopWorkspaceConnectionView {
  source_id: DesktopCredentialManagedSourceId;
  credential_status: DesktopCredentialStatus;
  readiness_status: DesktopReadinessStatus;
}

export type DesktopReadinessRemediation =
  | {
      kind: 'CONFIGURE_SOURCE';
      label: string;
    }
  | {
      kind: 'CONNECT_SOURCE';
      label: string;
    }
  | {
      kind: 'SELECT_FILE';
      label: string;
    }
  | {
      kind: 'MANUAL_ACTION';
      label: string;
    };

export interface DesktopSourceCard {
  source_id: string;
  source_name: string;
  included: boolean;
  readiness_status: DesktopReadinessStatus;
  readiness_reason: string | null;
  readiness_remediation: DesktopReadinessRemediation | null;
  freshness_status: FreshnessStatus;
  last_successful_at: string | null;
  next_due_at: string | null;
  configuration_summary: string;
}

export interface DesktopRunDraft extends RunDraft {
  source_cards: DesktopSourceCard[];
}

export interface DesktopReviewedRunDraft {
  workspace_id: string;
  task_id: string;
  source_id: string;
  reference_date: string;
  resolved_at: string;
  reusable_configuration:
    ReusableCollectionConfiguration;
  resolved_configuration:
    ReusableCollectionConfiguration;
}

export interface DesktopReview {
  workspace: WorkspaceRecord;
  origin: RunDraftOrigin;
  included_sources: string[];
  source_cards: DesktopSourceCard[];
  job_count: number;
  can_start: boolean;
  blocking_sources: string[];
  reviewed_draft:
    DesktopReviewedRunDraft | null;
}

export interface DesktopRunState {
  run: RunRecord;
  jobs: JobRecord[];
  job_attempts?: Array<Pick<
    AttemptRecord,
    | 'job_id'
    | 'attempt_number'
    | 'execution_status'
    | 'error_code'
    | 'started_at'
    | 'completed_at'
  >>;
  completed_jobs: number;
  failed_jobs: number;
  can_resume: boolean;
  can_retry: boolean;
  can_cancel: boolean;
}

export interface DesktopPresetView {
  workspace_id: string;
  presets: SavedCollectionPresetRecord[];
}

export interface DesktopWorkspaceView {
  workspaces: WorkspaceRecord[];
  selected_workspace_id: string | null;
  connections: Array<{ source_id: string; configured: boolean }>;
}

export interface DesktopStartResult {
  state: DesktopRunState;
  job_plans: JobPlan[];
  last_run_settings: ReusableCollectionConfiguration;
}

export interface DesktopMultiSourceRepository {
  listWorkspaces(): WorkspaceRecord[];
  getWorkspace(workspace_id: string): WorkspaceRecord | null;
  listSavedCollectionPresets(workspace_id: string): SavedCollectionPresetRecord[];
  getSavedCollectionPreset(workspace_id: string, preset_id: string): SavedCollectionPresetRecord | null;
  createSavedCollectionPreset(input: {
    workspace_id: string;
    preset_name: string;
    reusable_configuration: ReusableCollectionConfiguration;
  }): SavedCollectionPresetRecord;
  updateSavedCollectionPreset(input: {
    workspace_id: string;
    preset_id: string;
    preset_name: string;
    reusable_configuration: ReusableCollectionConfiguration;
  }): SavedCollectionPresetRecord;
  deleteSavedCollectionPreset(
    workspace_id: string,
    preset_id: string,
  ): void;
  getLastRunSettings(workspace_id: string): LastRunSettingsRecord | null;
  listSourceConnections(workspace_id: string): Array<{ source_id: string; credential_ref: string | null }>;
  reserveRunFromJobPlans(input: {
    workspace_id: string;
    application_version: string;
    configuration_snapshot: Record<string, unknown>;
    reusable_configuration: ReusableCollectionConfiguration;
    job_plans: JobPlan[];
  }): { run: RunRecord; jobs: JobRecord[] };
  listJobs(run_id: string): JobRecord[];
  listAttempts?(job_id: string): AttemptRecord[];
  getRun(run_id: string): RunRecord | null;
  getArtifact(artifact_id: string): ArtifactRecord | null;
  listRuns?(workspace_id: string): RunRecord[];
}

export const isDesktopReviewedRunDraft = (
  value: unknown,
): value is DesktopReviewedRunDraft => {
  if (
    typeof value !== 'object'
    || value === null
  ) {
    return false;
  }

  const draft =
    value as Partial<DesktopReviewedRunDraft>;

  return typeof draft.workspace_id === 'string'
    && draft.workspace_id.trim().length > 0
    && typeof draft.task_id === 'string'
    && draft.task_id.trim().length > 0
    && typeof draft.source_id === 'string'
    && draft.source_id.trim().length > 0
    && typeof draft.reference_date === 'string'
    && draft.reference_date.trim().length > 0
    && typeof draft.resolved_at === 'string'
    && draft.resolved_at.trim().length > 0
    && typeof draft.reusable_configuration === 'object'
    && draft.reusable_configuration !== null
    && Array.isArray(
      draft.reusable_configuration,
    ) === false
    && typeof draft.resolved_configuration === 'object'
    && draft.resolved_configuration !== null
    && Array.isArray(
      draft.resolved_configuration,
    ) === false;
};

export const isDesktopRunDraft = (value: unknown): value is DesktopRunDraft => {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<DesktopRunDraft>;
  return typeof draft.workspace_id === 'string'
    && draft.workspace_id.trim().length > 0
    && typeof draft.reusable_configuration === 'object'
    && draft.reusable_configuration !== null
    && !Array.isArray(draft.reusable_configuration)
    && Array.isArray(draft.source_cards)
    && typeof draft.origin === 'object'
    && draft.origin !== null;
};
