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

export const SUPPORTED_DESKTOP_SOURCE_IDS = [
  'google-trends',
  'google-search-console-query-page',
  'google-ads-search-terms',
  'google-keyword-planner',
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

export interface DesktopSourceCard {
  source_id: string;
  source_name: string;
  included: boolean;
  readiness_status: DesktopReadinessStatus;
  configuration_summary: string;
}

export interface DesktopRunDraft extends RunDraft {
  source_cards: DesktopSourceCard[];
}

export interface DesktopReview {
  workspace: WorkspaceRecord;
  origin: RunDraftOrigin;
  included_sources: string[];
  source_cards: DesktopSourceCard[];
  job_count: number;
  can_start: boolean;
  blocking_sources: string[];
}

export interface DesktopRunState {
  run: RunRecord;
  jobs: JobRecord[];
  completed_jobs: number;
  failed_jobs: number;
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
  getRun(run_id: string): RunRecord | null;
  listRuns?(workspace_id: string): RunRecord[];
}

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
