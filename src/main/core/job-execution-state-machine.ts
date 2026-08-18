import type { ExecutionStatus } from '../../shared/run-job';

const ALLOWED_TRANSITIONS: Record<
  ExecutionStatus,
  readonly ExecutionStatus[]
> = {
  PENDING: ['RUNNING', 'CANCELLED'],
  RUNNING: [
    'VALIDATING',
    'FAILED',
    'CANCELLED',
    'MANUAL_ACTION_REQUIRED',
  ],
  VALIDATING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: ['RETRY_PENDING'],
  CANCELLED: [],
  MANUAL_ACTION_REQUIRED: ['RUNNING', 'CANCELLED'],
  RETRY_PENDING: ['RUNNING', 'CANCELLED'],
};

export class JobExecutionTransitionError extends Error {
  constructor(
    public readonly from: ExecutionStatus,
    public readonly to: ExecutionStatus,
  ) {
    super(
      `Illegal job execution transition: ${from} -> ${to}`,
    );
    this.name = 'JobExecutionTransitionError';
  }
}

export const assertJobExecutionTransition = (
  from: ExecutionStatus,
  to: ExecutionStatus,
): void => {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new JobExecutionTransitionError(from, to);
  }
};
