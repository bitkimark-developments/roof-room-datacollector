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
  DesktopWorkspaceConnectionView,
  DesktopWorkspaceView,
} from './desktop-multisource';
import type { RunDraftOrigin } from './collection-configuration';
import type {
  ConnectGoogleWorkspaceConnectionIntent,
  DisconnectWorkspaceConnectionIntent,
  ManageWorkspaceConnectionIntent,
  ProvisionSerpApiWorkspaceConnectionIntent,
  ReconnectGoogleWorkspaceConnectionIntent,
  WorkspaceConnectionMutationResponse,
} from './workspace-connection-management';
import type {
  ConfigureGoogleProviderIntent,
  GoogleProviderConfigurationResponse,
  GoogleProviderConfigurationStatus,
} from './google-provider-configuration';
import type {
  DesktopTaskPackageResponse,
  DesktopTaskPackageReview,
  DesktopTaskPackageReviewIntent,
  DesktopTaskPackageStartIntent,
  DesktopTaskPackageStartResult,
} from './desktop-task-package';

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
  DESKTOP_CONNECTIONS: 'desktop:connections',
  DESKTOP_CONNECTION_MANAGE: 'desktop:connection:manage',
  DESKTOP_CONNECTION_DISCONNECT: 'desktop:connection:disconnect',
  DESKTOP_CONNECTION_CONNECT_GOOGLE: 'desktop:connection:connect-google',
  DESKTOP_CONNECTION_RECONNECT_GOOGLE: 'desktop:connection:reconnect-google',
  DESKTOP_CONNECTION_PROVISION_SERPAPI: 'desktop:connection:provision-serpapi',
  GOOGLE_PROVIDER_CONFIGURATION: 'desktop:google-provider:configuration',
  GOOGLE_PROVIDER_CONFIGURE: 'desktop:google-provider:configure',
  DESKTOP_RUNS: 'desktop:runs',
  DESKTOP_PRESETS: 'desktop:presets',
  DESKTOP_CREATE_PRESET: 'desktop:create-preset',
  DESKTOP_UPDATE_PRESET: 'desktop:update-preset',
  DESKTOP_DELETE_PRESET: 'desktop:delete-preset',
  DESKTOP_CREATE_DRAFT: 'desktop:create-draft',
  DESKTOP_REVIEW_DRAFT: 'desktop:review-draft',
  DESKTOP_START_DRAFT: 'desktop:start-draft',
  DESKTOP_RUN_STATE: 'desktop:run-state',
  DESKTOP_RETRY_FAILED: 'desktop:retry-failed',
  DESKTOP_RESUME_INTERRUPTED: 'desktop:resume-interrupted',
  DESKTOP_CONTINUE_MANUAL: 'desktop:continue-manual',
  DESKTOP_CANCEL_RUN: 'desktop:cancel-run',
  DESKTOP_OPEN_ACCEPTED_EVIDENCE: 'desktop:open-accepted-evidence',
  DESKTOP_EXPORT: 'desktop:export',
  DESKTOP_SELECT_INPUT_FILE: 'desktop:select-input-file',
  DESKTOP_TASK_PACKAGE_REVIEW: 'desktop:task-package:review',
  DESKTOP_TASK_PACKAGE_START: 'desktop:task-package:start',
  DESKTOP_TASK_PACKAGE_OPEN: 'desktop:task-package:open',
} as const;

export type DesktopInputFileKind =
  | 'IKAS_PRODUCTS_XLSX'
  | 'KEYWORD_PLANNER_CSV';

export interface DesktopInputFileSelectionRequest {
  input_kind: DesktopInputFileKind;
}

export interface DesktopInputFileSelectionResult {
  canceled: boolean;
  file_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  file_type: 'XLSX' | 'CSV' | null;
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
  getDesktopWorkspaceConnections: (
    workspace_id: string,
  ) => Promise<DesktopWorkspaceConnectionView[]>;
  manageDesktopWorkspaceConnection: (
    intent: ManageWorkspaceConnectionIntent,
  ) => Promise<WorkspaceConnectionMutationResponse>;
  disconnectDesktopWorkspaceConnection: (
    intent: DisconnectWorkspaceConnectionIntent,
  ) => Promise<WorkspaceConnectionMutationResponse>;
  connectGoogleDesktopWorkspaceConnection: (
    intent: ConnectGoogleWorkspaceConnectionIntent,
  ) => Promise<WorkspaceConnectionMutationResponse>;
  reconnectGoogleDesktopWorkspaceConnection: (
    intent: ReconnectGoogleWorkspaceConnectionIntent,
  ) => Promise<WorkspaceConnectionMutationResponse>;
  provisionSerpApiDesktopWorkspaceConnection: (
    intent: ProvisionSerpApiWorkspaceConnectionIntent,
  ) => Promise<WorkspaceConnectionMutationResponse>;
  getGoogleProviderConfigurationStatus: (
  ) => Promise<GoogleProviderConfigurationStatus>;
  configureGoogleProvider: (
    intent: ConfigureGoogleProviderIntent,
  ) => Promise<GoogleProviderConfigurationResponse>;
  listDesktopRuns: (
    workspace_id: string,
  ) => Promise<DesktopRunState['run'][]>;
  getDesktopPresets: (workspace_id: string) => Promise<import('./collection-configuration').SavedCollectionPresetRecord[]>;
  createDesktopPreset: (input: {
    workspace_id: string;
    preset_name: string;
    reusable_configuration: import('./collection-configuration').ReusableCollectionConfiguration;
  }) => Promise<import('./collection-configuration').SavedCollectionPresetRecord>;
  updateDesktopPreset: (input: {
    workspace_id: string;
    preset_id: string;
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
  resumeDesktopInterrupted: (run_id: string) => Promise<DesktopRunState>;
  continueDesktopManual: (run_id: string) => Promise<DesktopRunState>;
  cancelDesktopRun: (run_id: string) => Promise<DesktopRunState>;
  openDesktopAcceptedEvidence: (input: {
    run_id: string;
    job_id: string;
  }) => Promise<void>;
  exportDesktopRun: (input: { run_id: string; mode: 'ALL' | 'SUCCESSFUL_ONLY' }) => Promise<{ export_directory: string; dataset_count: number; failed_count: number }>;
  selectDesktopInputFile: (
    input: DesktopInputFileSelectionRequest,
  ) => Promise<DesktopInputFileSelectionResult>;
  reviewDesktopTaskPackage: (
    intent: DesktopTaskPackageReviewIntent,
  ) => Promise<DesktopTaskPackageResponse<DesktopTaskPackageReview>>;
  startDesktopTaskPackage: (
    intent: DesktopTaskPackageStartIntent,
  ) => Promise<DesktopTaskPackageResponse<DesktopTaskPackageStartResult>>;
  openDesktopTaskPackage: (
    input: { package_id: string },
  ) => Promise<DesktopTaskPackageResponse<{ package_id: string }>>;
}
