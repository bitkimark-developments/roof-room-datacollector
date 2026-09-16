import type { BootstrapStatus } from './bootstrap-status';
import type {
  DesktopCollectionState,
} from './collection-control';
import type {
  GoogleTrendsCollectionStartRequest,
} from './google-trends-period';
import type {
  DesktopReview,
  DesktopReviewedRunDraft,
  DesktopRunDraft,
  DesktopRunState,
  DesktopWorkspaceView,
} from './desktop-multisource';
import type { RunDraftOrigin } from './collection-configuration';

export const IPC_CHANNELS = {
  GET_APPLICATION_INFO: 'app:get-application-info',
  GET_BOOTSTRAP_STATUS: 'app:get-bootstrap-status',
  GET_COLLECTION_STATE:
    'collection:get-state',
  START_COLLECTION:
    'collection:start',
  RESUME_COLLECTION:
    'collection:resume',
  RETRY_FAILED_COLLECTION:
    'collection:retry-failed',
  CANCEL_COLLECTION:
    'collection:cancel',
  OPEN_DATA_FOLDER:
    'collection:open-data-folder',
  OPEN_LATEST_EXPORT:
    'collection:open-latest-export',
  OPEN_CONFIG_FOLDER:
    'collection:open-config-folder',
  DESKTOP_WORKSPACES: 'desktop:workspaces',
  DESKTOP_RUNS: 'desktop:runs',
  DESKTOP_PRESETS: 'desktop:presets',
  DESKTOP_CREATE_PRESET: 'desktop:create-preset',
  DESKTOP_DELETE_PRESET: 'desktop:delete-preset',
  DESKTOP_CREATE_DRAFT: 'desktop:create-draft',
  DESKTOP_REVIEW_DRAFT: 'desktop:review-draft',
  DESKTOP_START_DRAFT: 'desktop:start-draft',
  DESKTOP_RUN_STATE: 'desktop:run-state',
  DESKTOP_RETRY_FAILED: 'desktop:retry-failed',
  DESKTOP_CONTINUE_MANUAL: 'desktop:continue-manual',
  DESKTOP_EXPORT: 'desktop:export',
  DESKTOP_SELECT_INPUT_FILE: 'desktop:select-input-file',
} as const;

export type DesktopInputFileKind =
  | 'IKAS_PRODUCTS_XLSX';

export interface DesktopInputFileSelectionRequest {
  input_kind: DesktopInputFileKind;
}

export interface DesktopInputFileSelectionResult {
  canceled: boolean;
  file_path: string | null;
  file_name: string | null;
}

export interface ApplicationInfo {
  name: string;
  version: string;
  platform: string;
  architecture: string;
  electronVersion: string;
}

export interface RoofRoomApi {
  getApplicationInfo: () => Promise<ApplicationInfo>;
  getBootstrapStatus: () => Promise<BootstrapStatus>;
  getCollectionState: () =>
    Promise<DesktopCollectionState>;
  startCollection: (
    request:
      GoogleTrendsCollectionStartRequest,
  ) =>
    Promise<DesktopCollectionState>;
  resumeCollection: () =>
    Promise<DesktopCollectionState>;
  retryFailedCollection: () =>
    Promise<DesktopCollectionState>;
  cancelCollection: () =>
    Promise<DesktopCollectionState>;
  openDataFolder: () => Promise<void>;
  openLatestExport: () => Promise<void>;
  openConfigFolder: () => Promise<void>;
  getDesktopWorkspaces: () => Promise<DesktopWorkspaceView>;
  listDesktopRuns: (
    workspace_id: string,
  ) => Promise<DesktopRunState['run'][]>;
  getDesktopPresets: (workspace_id: string) => Promise<import('./collection-configuration').SavedCollectionPresetRecord[]>;
  createDesktopPreset: (input: {
    workspace_id: string;
    preset_name: string;
    reusable_configuration: import('./collection-configuration').ReusableCollectionConfiguration;
  }) => Promise<import('./collection-configuration').SavedCollectionPresetRecord>;
  deleteDesktopPreset: (input: {
    workspace_id: string;
    preset_id: string;
  }) => Promise<void>;
  createDesktopDraft: (input: { workspace_id: string; origin: RunDraftOrigin }) => Promise<DesktopRunDraft>;
  reviewDesktopDraft: (draft: DesktopRunDraft) => Promise<DesktopReview>;
  startDesktopDraft: (
    draft:
      DesktopRunDraft
      | DesktopReviewedRunDraft,
  ) => Promise<DesktopRunState>;
  getDesktopRunState: (run_id: string) => Promise<DesktopRunState>;
  retryDesktopFailed: (run_id: string) => Promise<DesktopRunState>;
  continueDesktopManual: (run_id: string) => Promise<DesktopRunState>;
  exportDesktopRun: (input: { run_id: string; mode: 'ALL' | 'SUCCESSFUL_ONLY' }) => Promise<{ export_directory: string; dataset_count: number; failed_count: number }>;
  selectDesktopInputFile: (
    input: DesktopInputFileSelectionRequest,
  ) => Promise<DesktopInputFileSelectionResult>;
}
