export const IPC_CHANNELS = {
  GET_APPLICATION_INFO: 'app:get-application-info',
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
}
