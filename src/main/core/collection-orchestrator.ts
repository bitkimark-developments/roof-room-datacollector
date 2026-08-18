import type {
  ArtifactRecord,
} from '../../shared/artifact';
import type {
  AttemptRecord,
} from '../../shared/attempt';
import {
  isCollectingDataSourceModule,
  type CollectionValidator,
} from '../../shared/collection';
import type {
  OrchestrationRunResult,
  OrchestrationStepOutcome,
  OrchestrationStepResult,
} from '../../shared/orchestration';
import type {
  ExecutionStatus,
  JobRecord,
  RunRecord,
  ValidationStatus,
} from '../../shared/run-job';
import type {
  SourceRegistry,
} from './source-registry';
import type {
  RunManager,
} from './run-manager';

interface CandidateArtifactInput {
  attempt_id: string;
  filename: string;
  relative_path: string;
  media_type: string;
  byte_size: number;
  sha256: string | null;
}

interface ValidationSummaryInput {
  attempt_id: string;
  artifact_id: string;
  validation_status: Exclude<
    ValidationStatus,
    'NOT_RUN'
  >;
  checks_total: number;
  checks_passed: number;
  checks_warning: number;
  checks_failed: number;
  validation_json_path: string | null;
}

export interface CollectionOrchestratorStateStore {
  getRun(runId: string): RunRecord | null;
  getJob(jobId: string): JobRecord | null;
  listJobs(runId: string): JobRecord[];
  startAttempt(jobId: string): AttemptRecord;
  registerCandidateArtifact(
    input: CandidateArtifactInput,
  ): ArtifactRecord;
  recordValidationSummary(
    input: ValidationSummaryInput,
  ): unknown;
  transitionJobExecution(
    jobId: string,
    nextStatus: ExecutionStatus,
    options?: {
      validation_status?: ValidationStatus;
      error_code?: string | null;
    },
  ): JobRecord;
}

export interface CollectionOrchestratorStorage {
  persistRawArtifact(input: {
    run_id: string;
    source_id: string;
    attempt_number: number;
    preferred_filename: string;
    media_type: string;
    bytes: Uint8Array;
  }): Promise<{
    filename: string;
    relative_path: string;
    absolute_path: string;
    media_type: string;
    byte_size: number;
    sha256: string;
  }>;
}

const ACCEPTED_VALIDATION = new Set<
  Exclude<ValidationStatus, 'NOT_RUN'>
>([
  'VALID',
  'LOW_DATA',
  'NO_DATA',
]);

const step = (
  outcome: OrchestrationStepOutcome,
  message: string,
  job: JobRecord | null = null,
  attempt: AttemptRecord | null = null,
  artifact: ArtifactRecord | null = null,
): OrchestrationStepResult => ({
  outcome,
  job,
  attempt,
  artifact,
  message,
});

const requireNonEmptyErrorCode = (
  value: string,
): string => {
  if (value.trim().length === 0) {
    throw new Error(
      'Source failure error_code must be non-empty.',
    );
  }

  return value;
};

const getQueryGroup = (
  run: RunRecord,
  job: JobRecord,
) => {
  const group =
    run.configuration_snapshot
      .selected_query_groups
      .find(
        (candidate) =>
          candidate.query_group_id ===
          job.query_group_id,
      );

  if (!group) {
    throw new Error(
      `Run snapshot does not contain query group ${job.query_group_id} for job ${job.job_id}.`,
    );
  }

  return {
    query_group_id: group.query_group_id,
    query_group_name: group.query_group_name,
    queries: [...group.queries],
  };
};

export class CollectionOrchestrator {
  constructor(
    private readonly store:
      CollectionOrchestratorStateStore,
    private readonly storage:
      CollectionOrchestratorStorage,
    private readonly registry: SourceRegistry,
    private readonly validator:
      CollectionValidator,
    private readonly runManager: RunManager,
  ) {}

  async runNext(
    runId: string,
  ): Promise<OrchestrationStepResult> {
    let run = this.store.getRun(runId);

    if (!run) {
      throw new Error(`Unknown run: ${runId}`);
    }

    if (
      run.run_status === 'COMPLETED' ||
      run.run_status ===
        'COMPLETED_WITH_WARNINGS'
    ) {
      return step(
        'RUN_COMPLETED',
        `Run ${runId} is already complete.`,
      );
    }

    if (
      run.run_status === 'FAILED' ||
      run.run_status === 'CANCELLED'
    ) {
      return step(
        'NO_ELIGIBLE_JOB',
        `Run ${runId} is terminal: ${run.run_status}.`,
      );
    }

    if (run.run_status === 'PENDING') {
      run = this.runManager.startRun(runId);
    }

    const jobs = this.store.listJobs(runId);

    const manual = jobs.find(
      (job) =>
        job.execution_status ===
        'MANUAL_ACTION_REQUIRED',
    );

    if (manual) {
      this.runManager.refreshRunStatus(runId);

      return step(
        'MANUAL_ACTION_REQUIRED',
        `Job ${manual.job_id} requires manual action; no later job was started.`,
        manual,
      );
    }

    const active = jobs.filter(
      (job) =>
        job.execution_status === 'RUNNING' ||
        job.execution_status ===
          'VALIDATING',
    );

    if (active.length > 0) {
      const activeJob = active[0];

      return step(
        'RECONCILIATION_REQUIRED',
        active.length === 1
          ? `Persisted active job ${activeJob.job_id} must be reconciled or explicitly continued; normal scheduling will not recollect it.`
          : `Run ${runId} has ${active.length} active jobs; sequential invariant requires reconciliation.`,
        activeJob,
      );
    }

    const nextPending = jobs.find(
      (job) =>
        job.execution_status === 'PENDING',
    );

    if (nextPending) {
      const attempt =
        this.store.startAttempt(
          nextPending.job_id,
        );

      return this.executeStartedAttempt(
        runId,
        nextPending.job_id,
        attempt,
      );
    }

    const refreshed =
      this.runManager.refreshRunStatus(
        runId,
      );

    if (
      refreshed.run_status === 'COMPLETED' ||
      refreshed.run_status ===
        'COMPLETED_WITH_WARNINGS'
    ) {
      return step(
        'RUN_COMPLETED',
        `Run ${runId} completed after all accepted jobs were preserved.`,
      );
    }

    const retryable = jobs.find(
      (job) =>
        job.execution_status === 'FAILED' ||
        job.execution_status ===
          'RETRY_PENDING',
    );

    if (retryable) {
      return step(
        'RETRY_REQUIRED',
        `Job ${retryable.job_id} requires explicit retry policy before another attempt.`,
        retryable,
      );
    }

    return step(
      'NO_ELIGIBLE_JOB',
      `Run ${runId} has no schedulable pending job.`,
    );
  }

  async runUntilBlocked(
    runId: string,
  ): Promise<OrchestrationRunResult> {
    const steps: OrchestrationStepResult[] =
      [];

    const initialJobs =
      this.store.listJobs(runId);

    const safetyLimit =
      Math.max(
        1,
        initialJobs.length + 2,
      );

    for (
      let index = 0;
      index < safetyLimit;
      index += 1
    ) {
      const current =
        await this.runNext(runId);

      steps.push(current);

      if (
        current.outcome ===
          'JOB_COMPLETED' ||
        current.outcome === 'JOB_FAILED'
      ) {
        continue;
      }

      return {
        steps,
        stopped_because: current.outcome,
      };
    }

    throw new Error(
      `Sequential orchestration exceeded safety limit for run ${runId}.`,
    );
  }

  async executeStartedAttempt(
    runId: string,
    jobId: string,
    attempt: AttemptRecord,
  ): Promise<OrchestrationStepResult> {
    const run = this.store.getRun(runId);
    const job = this.store.getJob(jobId);

    if (!run) {
      throw new Error(`Unknown run: ${runId}`);
    }

    if (!job) {
      throw new Error(`Unknown job: ${jobId}`);
    }

    if (job.run_id !== runId) {
      throw new Error(
        `Job ${jobId} does not belong to run ${runId}.`,
      );
    }

    if (
      job.execution_status !== 'RUNNING'
    ) {
      throw new Error(
        `Job ${jobId} must be RUNNING before source collection; found ${job.execution_status}.`,
      );
    }

    if (
      attempt.job_id !== jobId ||
      attempt.execution_status !== 'RUNNING' ||
      attempt.attempt_number !==
        job.attempt_count
    ) {
      throw new Error(
        `Attempt ${attempt.attempt_id} is not the current RUNNING attempt for job ${jobId}.`,
      );
    }

    const source = this.registry.get(
      job.source_id,
    );

    if (!isCollectingDataSourceModule(source)) {
      throw new Error(
        `Source ${source.id} does not implement the collection contract.`,
      );
    }

    const readiness =
      await source.checkReadiness({
        query_config_ready: true,
      });

    if (
      readiness.readiness_status !== 'READY'
    ) {
      if (
        readiness.readiness_status ===
          'MANUAL_ACTION_REQUIRED' ||
        readiness.readiness_status ===
          'AUTHENTICATION_REQUIRED'
      ) {
        const blocked =
          this.store.transitionJobExecution(
            jobId,
            'MANUAL_ACTION_REQUIRED',
          );

        this.runManager.refreshRunStatus(
          runId,
        );

        return step(
          'MANUAL_ACTION_REQUIRED',
          readiness.message ??
            `Source ${source.id} requires manual action.`,
          blocked,
          attempt,
        );
      }

      this.store.transitionJobExecution(
        jobId,
        'FAILED',
        {
          error_code:
            'SOURCE_NOT_READY',
        },
      );

      this.runManager.refreshRunStatus(
        runId,
      );

      return step(
        'SOURCE_NOT_READY',
        readiness.message ??
          `Source ${source.id} is not ready.`,
        this.store.getJob(jobId),
        attempt,
      );
    }

    const collection =
      await source.collect({
        run_id: runId,
        job_id: jobId,
        attempt_id: attempt.attempt_id,
        attempt_number:
          attempt.attempt_number,
        source_id: job.source_id,
        job_key: job.job_key,
        requested_configuration:
          run.requested_configuration,
        query_group: getQueryGroup(
          run,
          job,
        ),
      });

    if (
      collection.result_type === 'FAILED' ||
      collection.result_type ===
        'NO_ARTIFACT'
    ) {
      const failed =
        this.store.transitionJobExecution(
          jobId,
          'FAILED',
          {
            error_code:
              requireNonEmptyErrorCode(
                collection.error_code,
              ),
          },
        );

      this.runManager.refreshRunStatus(
        runId,
      );

      return step(
        'JOB_FAILED',
        collection.message ??
          `Source ${source.id} did not produce an artifact.`,
        failed,
        attempt,
      );
    }

    if (
      collection.result_type ===
      'MANUAL_ACTION_REQUIRED'
    ) {
      const blocked =
        this.store.transitionJobExecution(
          jobId,
          'MANUAL_ACTION_REQUIRED',
        );

      this.runManager.refreshRunStatus(
        runId,
      );

      return step(
        'MANUAL_ACTION_REQUIRED',
        collection.message ??
          `Source ${source.id} requires manual action.`,
        blocked,
        attempt,
      );
    }

    const persisted =
      await this.storage.persistRawArtifact({
        run_id: runId,
        source_id: job.source_id,
        attempt_number:
          attempt.attempt_number,
        preferred_filename:
          collection.preferred_filename,
        media_type:
          collection.media_type,
        bytes: collection.bytes,
      });

    const artifact =
      this.store.registerCandidateArtifact({
        attempt_id: attempt.attempt_id,
        filename: persisted.filename,
        relative_path:
          persisted.relative_path,
        media_type: persisted.media_type,
        byte_size: persisted.byte_size,
        sha256: persisted.sha256,
      });

    this.store.transitionJobExecution(
      jobId,
      'VALIDATING',
    );

    const validatingJob =
      this.store.getJob(jobId);

    if (!validatingJob) {
      throw new Error(
        `Job ${jobId} disappeared before validation.`,
      );
    }

    const validation =
      await this.validator.validate({
        job: validatingJob,
        attempt,
        artifact,
        absolute_path:
          persisted.absolute_path,
      });

    this.store.recordValidationSummary({
      attempt_id: attempt.attempt_id,
      artifact_id: artifact.artifact_id,
      validation_status:
        validation.validation_status,
      checks_total:
        validation.checks_total,
      checks_passed:
        validation.checks_passed,
      checks_warning:
        validation.checks_warning,
      checks_failed:
        validation.checks_failed,
      validation_json_path: null,
    });

    if (
      ACCEPTED_VALIDATION.has(
        validation.validation_status,
      )
    ) {
      const completed =
        this.store.transitionJobExecution(
          jobId,
          'COMPLETED',
          {
            validation_status:
              validation.validation_status,
          },
        );

      this.runManager.refreshRunStatus(
        runId,
      );

      return step(
        'JOB_COMPLETED',
        `Job ${jobId} completed with ${validation.validation_status}.`,
        completed,
        attempt,
        artifact,
      );
    }

    const rejected =
      this.store.transitionJobExecution(
        jobId,
        'FAILED',
        {
          error_code:
            'VALIDATION_REJECTED',
        },
      );

    this.runManager.refreshRunStatus(
      runId,
    );

    return step(
      'JOB_FAILED',
      `Job ${jobId} validation rejected the candidate with ${validation.validation_status}.`,
      rejected,
      attempt,
      artifact,
    );
  }
}
