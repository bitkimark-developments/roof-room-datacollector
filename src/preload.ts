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
    (queryGroupIds) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.START_COLLECTION,
      queryGroupIds,
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
};

contextBridge.exposeInMainWorld('roofroom', roofroomApi);
