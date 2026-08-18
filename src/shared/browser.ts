export const BROWSER_MANAGER_STATUSES = [
  'IDLE',
  'OPENING',
  'OPEN',
] as const;

export type BrowserManagerStatus =
  (typeof BROWSER_MANAGER_STATUSES)[number];

export interface BrowserManagerState {
  status: BrowserManagerStatus;
  profile_id: string | null;
  user_data_dir: string | null;
}

export interface BrowserUnexpectedCloseEvent {
  profile_id: string;
  user_data_dir: string;
  occurred_at: string;
}
