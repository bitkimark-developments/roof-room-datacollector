import type {
  ExecutionStatus,
  RunStatus,
  ValidationStatus,
} from './run-job';

export const DESKTOP_COLLECTION_PHASES = [
  'IDLE',
  'RUNNING',
  'EXPORTING',
  'CANCELLING',
  'COMPLETED',
  'COMPLETED_WITH_WARNINGS',
  'FAILED',
  'EXPORT_FAILED',
  'MANUAL_ACTION_REQUIRED',
  'CANCELLED',
] as const;

export type DesktopCollectionPhase =
  (typeof DESKTOP_COLLECTION_PHASES)[number];

export type DesktopCollectionOperation =
  | 'START'
  | 'RESUME'
  | 'RETRY';

export interface DesktopCollectionJobSummary {
  query_group_id: string;
  execution_status:
    ExecutionStatus;
  validation_status:
    ValidationStatus;
  attempt_number: number | null;
  artifact_state:
    string | null;
  error_code:
    string | null;
}

export interface DesktopRecoveryState {
  run_id: string | null;
  can_resume: boolean;
  can_retry: boolean;
  manual_action_required:
    boolean;
}

export interface DesktopExportState {
  status:
    | 'NOT_RUN'
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED';
  export_directory:
    string | null;
  workbook_path:
    string | null;
  normalized_row_count:
    number | null;
  error:
    string | null;
}

export interface DesktopCollectionState {
  phase:
    DesktopCollectionPhase;
  operation:
    DesktopCollectionOperation | null;
  run_id: string | null;
  run_status:
    RunStatus | null;
  total_groups: number;
  groups_started: number;
  groups_collected: number;
  current_group_id:
    string | null;
  jobs:
    DesktopCollectionJobSummary[];
  recovery:
    DesktopRecoveryState;
  export:
    DesktopExportState;
  message: string | null;
  updated_at: string;
}
