import type { ExecutionStatus } from './run-job';

export interface AttemptRecord {
  attempt_id: string;
  job_id: string;
  attempt_number: number;
  execution_status: ExecutionStatus;
  candidate_artifact_id: string | null;
  validation_id: string | null;
  error_code: string | null;
  started_at: string;
  completed_at: string | null;
}
