import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_CHANNELS,
  type RoofRoomApi,
} from './shared/application-info';

const roofroomApi: RoofRoomApi = {
  getApplicationInfo: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_APPLICATION_INFO),
};

contextBridge.exposeInMainWorld('roofroom', roofroomApi);
