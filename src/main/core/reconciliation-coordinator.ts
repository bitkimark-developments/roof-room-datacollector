import type { AttemptRecord } from '../../shared/attempt';
import type {
  ReconciliationResult,
} from '../../shared/reconciliation';
import type {
  ExecutionStatus,
  JobRecord,
} from '../../shared/run-job';
import type { ResumeJobPlan } from '../../shared/resume';
import { RetryPolicy } from './retry-policy';

const INTERRUPTED_ATTEMPT_ERROR_CODE =
  'INTERRUPTED_ATTEMPT';

export interface ReconciliationStateStore {
  getJob(jobId: string): JobRecord | null;
  startAttempt(jobId: string): AttemptRecord;
  transitionJobExecution(
    jobId: string,
    nextStatus: ExecutionStatus,
    options?: {
      validation_status?: JobRecord['validation_status'];
      error_code?: string | null;
    },
  ): JobRecord;
}

const requireCurrentJob = (
  store: ReconciliationStateStore,
  plan: ResumeJobPlan,
): JobRecord => {
  const current = store.getJob(plan.job.job_id);

  if (!current) {
    throw new Error(
      `Unknown job during reconciliation: ${plan.job.job_id}`,
    );
  }

  if (
    current.run_id !== plan.job.run_id ||
    current.source_id !== plan.job.source_id ||
    current.job_key !== plan.job.job_key
  ) {
    throw new Error(
      `Resume plan context no longer matches job ${plan.job.job_id}.`,
    );
  }

  if (
    current.execution_status !==
      plan.job.execution_status ||
    current.attempt_count !== plan.job.attempt_count ||
    current.accepted_artifact_id !==
      plan.job.accepted_artifact_id
  ) {
    throw new Error(
      `Resume plan for job ${plan.job.job_id} is stale; rebuild the plan before mutating state.`,
    );
  }

  return current;
};

const result = (
  outcome: ReconciliationResult['outcome'],
  jobId: string,
  reason: string,
  attempt: AttemptRecord | null = null,
): ReconciliationResult => ({
  outcome,
  job_id: jobId,
  attempt,
  reason,
});

export class ReconciliationCoordinator {
  constructor(
    private readonly store: ReconciliationStateStore,
    private readonly retryPolicy: RetryPolicy,
  ) {}

  apply(
    plan: ResumeJobPlan,
  ): ReconciliationResult {
    const current = requireCurrentJob(
      this.store,
      plan,
    );

    switch (plan.action) {
      case 'SKIP_ACCEPTED':
        if (plan.accepted_artifact === null) {
          throw new Error(
            `SKIP_ACCEPTED job ${current.job_id} has no accepted artifact in its resume plan.`,
          );
        }

        return result(
          'SKIPPED_ACCEPTED',
          current.job_id,
          'Accepted completed evidence is preserved and the job is not scheduled again.',
        );

      case 'PENDING':
        return result(
          'READY_FOR_INITIAL_ATTEMPT',
          current.job_id,
          'Pending job is eligible for its first normal attempt; this coordinator does not start initial collection.',
        );

      case 'BLOCKED_MANUAL_ACTION':
        return result(
          'BLOCKED_MANUAL_ACTION',
          current.job_id,
          'Manual action remains a blocking state and is never converted into automatic retry.',
        );

      case 'RETRY_CANDIDATE':
        return this.startExplicitRetry(current);

      case 'RECONCILE_REQUIRED':
        return this.reconcileInterrupted(
          current,
          plan,
        );
    }
  }

  private startExplicitRetry(
    current: JobRecord,
  ): ReconciliationResult {
    if (
      current.execution_status !== 'FAILED' &&
      current.execution_status !==
        'RETRY_PENDING'
    ) {
      throw new Error(
        `Retry candidate ${current.job_id} is not in FAILED or RETRY_PENDING.`,
      );
    }

    if (
      !this.retryPolicy.canStartAnotherAttempt(
        current,
      )
    ) {
      return result(
        'RETRY_EXHAUSTED',
        current.job_id,
        `Retry limit ${this.retryPolicy.max_attempts} has been reached; no new attempt was created.`,
      );
    }

    if (current.execution_status === 'FAILED') {
      this.store.transitionJobExecution(
        current.job_id,
        'RETRY_PENDING',
      );
    }

    const attempt = this.store.startAttempt(
      current.job_id,
    );

    return result(
      'RETRY_STARTED',
      current.job_id,
      `Explicit retry started as attempt ${attempt.attempt_number}.`,
      attempt,
    );
  }

  private reconcileInterrupted(
    current: JobRecord,
    plan: ResumeJobPlan,
  ): ReconciliationResult {
    if (plan.candidate_artifact !== null) {
      return result(
        'CANDIDATE_REQUIRES_RECONCILIATION',
        current.job_id,
        'Persisted candidate evidence must be reconciled/validated before any recollection.',
      );
    }

    if (
      current.execution_status !== 'RUNNING' &&
      current.execution_status !== 'VALIDATING'
    ) {
      return result(
        'MANUAL_REVIEW_REQUIRED',
        current.job_id,
        `No automatic reconciliation mutation is defined for ${current.execution_status}.`,
      );
    }

    this.store.transitionJobExecution(
      current.job_id,
      'FAILED',
      {
        error_code:
          INTERRUPTED_ATTEMPT_ERROR_CODE,
      },
    );

    const failed = this.store.getJob(
      current.job_id,
    );

    if (!failed) {
      throw new Error(
        `Job ${current.job_id} disappeared after interrupted-attempt reconciliation.`,
      );
    }

    if (
      !this.retryPolicy.canStartAnotherAttempt(
        failed,
      )
    ) {
      return result(
        'RETRY_EXHAUSTED',
        current.job_id,
        `Interrupted attempt was preserved as FAILED and retry limit ${this.retryPolicy.max_attempts} is exhausted.`,
      );
    }

    this.store.transitionJobExecution(
      current.job_id,
      'RETRY_PENDING',
    );

    return result(
      'RETRY_PENDING',
      current.job_id,
      'Interrupted attempt was preserved as FAILED and the job is now explicitly retry-pending.',
    );
  }
}
