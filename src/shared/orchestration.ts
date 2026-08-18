import type { ArtifactRecord } from './artifact';
import type { AttemptRecord } from './attempt';
import type { JobRecord } from './run-job';

export const ORCHESTRATION_STEP_OUTCOMES = [
  'JOB_COMPLETED',
  'JOB_FAILED',
  'MANUAL_ACTION_REQUIRED',
  'SOURCE_NOT_READY',
  'RECONCILIATION_REQUIRED',
  'RETRY_REQUIRED',
  'RUN_COMPLETED',
  'NO_ELIGIBLE_JOB',
] as const;

export type OrchestrationStepOutcome =
  (typeof ORCHESTRATION_STEP_OUTCOMES)[number];

export interface OrchestrationStepResult {
  outcome: OrchestrationStepOutcome;
  job: JobRecord | null;
  attempt: AttemptRecord | null;
  artifact: ArtifactRecord | null;
  message: string;
}

export interface OrchestrationRunResult {
  steps: OrchestrationStepResult[];
  stopped_because: OrchestrationStepOutcome;
}
