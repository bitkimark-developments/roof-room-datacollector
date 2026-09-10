import type { RunStatus } from '../../shared/run-job';

const ALLOWED_TRANSITIONS: Record<
  RunStatus,
  readonly RunStatus[]
> = {
  PENDING: ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING: [
    'MANUAL_ACTION_REQUIRED',
    'RETRY_REQUIRED',
    'COMPLETED',
    'COMPLETED_WITH_WARNINGS',
    'FAILED',
    'CANCELLED',
  ],
  MANUAL_ACTION_REQUIRED: [
    'RUNNING',
    'FAILED',
    'CANCELLED',
  ],
  RETRY_REQUIRED: [
    'RUNNING',
    'FAILED',
    'CANCELLED',
  ],
  COMPLETED: [],
  COMPLETED_WITH_WARNINGS: [],
  FAILED: [],
  CANCELLED: [],
};

export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  'COMPLETED',
  'COMPLETED_WITH_WARNINGS',
  'FAILED',
  'CANCELLED',
];

export const isTerminalRunStatus = (
  status: RunStatus,
): boolean => TERMINAL_RUN_STATUSES.includes(status);

export class RunStatusTransitionError extends Error {
  constructor(
    public readonly from: RunStatus,
    public readonly to: RunStatus,
  ) {
    super(`Illegal run status transition: ${from} -> ${to}`);
    this.name = 'RunStatusTransitionError';
  }
}

export const assertRunStatusTransition = (
  from: RunStatus,
  to: RunStatus,
): void => {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new RunStatusTransitionError(from, to);
  }
};
