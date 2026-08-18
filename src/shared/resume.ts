import type { ArtifactRecord } from './artifact';
import type { AttemptRecord } from './attempt';
import type {
  JobRecord,
  RunRecord,
} from './run-job';

export const RESUME_JOB_ACTIONS = [
  'SKIP_ACCEPTED',
  'PENDING',
  'RETRY_CANDIDATE',
  'BLOCKED_MANUAL_ACTION',
  'RECONCILE_REQUIRED',
] as const;

export type ResumeJobAction =
  (typeof RESUME_JOB_ACTIONS)[number];

export interface ResumeJobPlan {
  job: JobRecord;
  action: ResumeJobAction;
  latest_attempt: AttemptRecord | null;
  candidate_artifact: ArtifactRecord | null;
  accepted_artifact: ArtifactRecord | null;
  reason: string;
}

export interface ResumeRunPlan {
  run: RunRecord;
  jobs: ResumeJobPlan[];
}
