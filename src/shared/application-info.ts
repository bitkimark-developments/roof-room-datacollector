import type { BootstrapStatus } from './bootstrap-status';

export const IPC_CHANNELS = {
  GET_APPLICATION_INFO: 'app:get-application-info',
  GET_BOOTSTRAP_STATUS: 'app:get-bootstrap-status',
} as const;

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
}
