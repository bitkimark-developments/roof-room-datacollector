import type { BootstrapStatus } from './bootstrap-status';
import type {
  DesktopCollectionState,
} from './collection-control';
import type {
  GoogleTrendsCollectionStartRequest,
} from './google-trends-period';

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
}
