import type { AttemptRecord } from './attempt';

export const RECONCILIATION_OUTCOMES = [
  'SKIPPED_ACCEPTED',
  'READY_FOR_INITIAL_ATTEMPT',
  'RETRY_PENDING',
  'RETRY_STARTED',
  'RETRY_EXHAUSTED',
  'CANDIDATE_REQUIRES_RECONCILIATION',
  'BLOCKED_MANUAL_ACTION',
  'MANUAL_REVIEW_REQUIRED',
] as const;

export type ReconciliationOutcome =
  (typeof RECONCILIATION_OUTCOMES)[number];

export interface ReconciliationResult {
  outcome: ReconciliationOutcome;
  job_id: string;
  attempt: AttemptRecord | null;
  reason: string;
}
