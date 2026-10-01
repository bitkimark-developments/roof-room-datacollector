import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_CHANNELS,
  type RoofRoomApi,
} from './shared/application-info';

const roofroomApi: RoofRoomApi = {
  getApplicationInfo: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_APPLICATION_INFO),

  getBootstrapStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BOOTSTRAP_STATUS),

  getCollectionState: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GET_COLLECTION_STATE,
    ),

  startCollection:
    (request) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.START_COLLECTION,
      request,
    ),

  resumeCollection: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.RESUME_COLLECTION,
    ),

  retryFailedCollection: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.RETRY_FAILED_COLLECTION,
    ),

  cancelCollection: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.CANCEL_COLLECTION,
    ),

  openDataFolder: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.OPEN_DATA_FOLDER,
    ),

  openLatestExport: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.OPEN_LATEST_EXPORT,
    ),

  openConfigFolder: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.OPEN_CONFIG_FOLDER,
    ),

  getDesktopWorkspaces: () => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_WORKSPACES),
  getDesktopWorkspaceConnections: (workspace_id) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_CONNECTIONS,
      workspace_id,
    ),
  manageDesktopWorkspaceConnection: (intent) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_CONNECTION_MANAGE,
      intent,
    ),
  disconnectDesktopWorkspaceConnection: (intent) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_CONNECTION_DISCONNECT,
      intent,
    ),
  connectGoogleDesktopWorkspaceConnection: (intent) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_CONNECTION_CONNECT_GOOGLE,
      intent,
    ),
  reconnectGoogleDesktopWorkspaceConnection: (intent) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_CONNECTION_RECONNECT_GOOGLE,
      intent,
    ),
  provisionSerpApiDesktopWorkspaceConnection: (intent) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_CONNECTION_PROVISION_SERPAPI,
      intent,
    ),
  getGoogleProviderConfigurationStatus: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GOOGLE_PROVIDER_CONFIGURATION,
    ),
  configureGoogleProvider: (intent) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GOOGLE_PROVIDER_CONFIGURE,
      intent,
    ),
  listDesktopRuns: (workspace_id) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_RUNS, workspace_id),
  getDesktopPresets: (workspace_id) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_PRESETS, workspace_id),
  createDesktopPreset: (input) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_CREATE_PRESET, input),
  updateDesktopPreset: (input) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_UPDATE_PRESET, input),
  deleteDesktopPreset: (input) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_DELETE_PRESET, input),
  createDesktopDraft: (input) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_CREATE_DRAFT, input),
  reviewDesktopDraft: (draft) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_REVIEW_DRAFT, draft),
  startDesktopDraft: (draft) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_START_DRAFT, draft),
  getDesktopRunState: (run_id) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_RUN_STATE, run_id),
  retryDesktopFailed: (run_id) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_RETRY_FAILED, run_id),
  resumeDesktopInterrupted: (run_id) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_RESUME_INTERRUPTED, run_id),
  continueDesktopManual: (run_id) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_CONTINUE_MANUAL, run_id),
  cancelDesktopRun: (run_id) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_CANCEL_RUN, run_id),
  openDesktopAcceptedEvidence: (input) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_OPEN_ACCEPTED_EVIDENCE,
      input,
    ),
  exportDesktopRun: (input) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_EXPORT, input),
  selectDesktopInputFile: (input) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_SELECT_INPUT_FILE,
      input,
    ),
  reviewDesktopTaskPackage: (intent) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_TASK_PACKAGE_REVIEW,
      intent,
    ),
  startDesktopTaskPackage: (intent) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_TASK_PACKAGE_START,
      intent,
    ),
  openDesktopTaskPackage: (input) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_TASK_PACKAGE_OPEN,
      input,
    ),
  buildBlogWritingPack: (run_id) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_BLOG_WRITING_PACK_BUILD,
      { run_id },
    ),
  openBlogWritingPack: (package_id) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_BLOG_WRITING_PACK_OPEN,
      { package_id },
    ),
  revealBlogWritingPack: (package_id) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.DESKTOP_BLOG_WRITING_PACK_REVEAL,
      { package_id },
    ),
};

contextBridge.exposeInMainWorld('roofroom', roofroomApi);
