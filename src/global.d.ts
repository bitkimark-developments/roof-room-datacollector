import type { RoofRoomApi } from './shared/application-info';

declare global {
  interface Window {
    roofroom: RoofRoomApi;
  }
}

export {};
