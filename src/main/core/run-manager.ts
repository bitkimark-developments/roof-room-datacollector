import type {
  JobRecord,
  RunRecord,
  RunStatus,
} from '../../shared/run-job';
import { isTerminalRunStatus } from './run-execution-state-machine';

export interface RunStateStore {
  getRun(runId: string): RunRecord | null;
  listJobs(runId: string): JobRecord[];
  transitionRunStatus(
    runId: string,
    nextStatus: RunStatus,
  ): RunRecord;
}

const ACCEPTABLE_TERMINAL_VALIDATION = new Set([
  'VALID',
  'LOW_DATA',
  'NO_DATA',
]);

const WARNING_VALIDATION = new Set([
  'LOW_DATA',
  'NO_DATA',
]);

export const deriveRunStatusFromJobs = (
  jobs: readonly JobRecord[],
): RunStatus => {
  if (jobs.length === 0) {
    throw new Error(
      'Run aggregation requires at least one persisted job.',
    );
  }

  if (
    jobs.some(
      (job) =>
        job.execution_status ===
        'MANUAL_ACTION_REQUIRED',
    )
  ) {
    return 'MANUAL_ACTION_REQUIRED';
  }

  const allCompleted = jobs.every(
    (job) => job.execution_status === 'COMPLETED',
  );

  if (allCompleted) {
    const allAcceptable = jobs.every((job) =>
      ACCEPTABLE_TERMINAL_VALIDATION.has(
        job.validation_status,
      ),
    );

    if (allAcceptable) {
      const hasWarning = jobs.some((job) =>
        WARNING_VALIDATION.has(job.validation_status),
      );

      return hasWarning
        ? 'COMPLETED_WITH_WARNINGS'
        : 'COMPLETED';
    }
  }

  // Failed jobs, hard validation outcomes, pending work,
  // active work, and retry-pending work remain non-terminal
  // here. Retry/final-failure policy is a later orchestration
  // responsibility and must not be inferred prematurely.
  return 'RUNNING';
};

export class RunManager {
  constructor(private readonly store: RunStateStore) {}

  startRun(runId: string): RunRecord {
    const run = this.requireRun(runId);

    if (run.run_status === 'RUNNING') {
      return run;
    }

    if (run.run_status !== 'PENDING') {
      throw new Error(
        `Run ${runId} cannot start from ${run.run_status}.`,
      );
    }

    return this.store.transitionRunStatus(
      runId,
      'RUNNING',
    );
  }

  refreshRunStatus(runId: string): RunRecord {
    const run = this.requireRun(runId);

    if (run.run_status === 'PENDING') {
      return run;
    }

    if (isTerminalRunStatus(run.run_status)) {
      return run;
    }

    const nextStatus = deriveRunStatusFromJobs(
      this.store.listJobs(runId),
    );

    if (nextStatus === run.run_status) {
      return run;
    }

    return this.store.transitionRunStatus(
      runId,
      nextStatus,
    );
  }

  cancelRun(runId: string): RunRecord {
    const run = this.requireRun(runId);

    if (run.run_status === 'CANCELLED') {
      return run;
    }

    if (isTerminalRunStatus(run.run_status)) {
      throw new Error(
        `Run ${runId} cannot be cancelled from ${run.run_status}.`,
      );
    }

    return this.store.transitionRunStatus(
      runId,
      'CANCELLED',
    );
  }

  private requireRun(runId: string): RunRecord {
    const run = this.store.getRun(runId);

    if (!run) {
      throw new Error(`Unknown run: ${runId}`);
    }

    return run;
  }
}
