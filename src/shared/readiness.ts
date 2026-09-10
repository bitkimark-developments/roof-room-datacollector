export const WORKSPACE_READINESS_STATUSES = [
  'READY',
  'CONFIGURATION_REQUIRED',
  'CONNECTION_REQUIRED',
  'MANUAL_ACTION_REQUIRED',
] as const;

export type WorkspaceReadinessStatus = (typeof WORKSPACE_READINESS_STATUSES)[number];

export interface WorkspaceReadinessResult {
  workspace_id: string;
  source_id: string;
  readiness_status: WorkspaceReadinessStatus;
  checked_at: string;
  message: string | null;
}
