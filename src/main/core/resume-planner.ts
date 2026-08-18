import type { ArtifactRecord } from '../../shared/artifact';
import type { AttemptRecord } from '../../shared/attempt';
import type {
  JobRecord,
  RunRecord,
} from '../../shared/run-job';
import type {
  ResumeJobPlan,
  ResumeRunPlan,
} from '../../shared/resume';

export interface ResumeStateStore {
  listIncompleteRuns(): RunRecord[];
  listJobs(runId: string): JobRecord[];
  listAttempts(jobId: string): AttemptRecord[];
  getArtifact(artifactId: string): ArtifactRecord | null;
}

const getLatestAttempt = (
  attempts: readonly AttemptRecord[],
): AttemptRecord | null => {
  if (attempts.length === 0) {
    return null;
  }

  return attempts.reduce((latest, attempt) =>
    attempt.attempt_number > latest.attempt_number
      ? attempt
      : latest,
  );
};

const requireJobArtifact = (
  store: ResumeStateStore,
  job: JobRecord,
  artifactId: string,
  context: string,
): ArtifactRecord => {
  const artifact = store.getArtifact(artifactId);

  if (!artifact) {
    throw new Error(
      `${context} references missing artifact ${artifactId}.`,
    );
  }

  if (
    artifact.job_id !== job.job_id ||
    artifact.run_id !== job.run_id ||
    artifact.source_id !== job.source_id
  ) {
    throw new Error(
      `${context} artifact context does not match job ${job.job_id}.`,
    );
  }

  return artifact;
};

const resolveAcceptedArtifact = (
  store: ResumeStateStore,
  job: JobRecord,
): ArtifactRecord | null => {
  if (job.accepted_artifact_id === null) {
    return null;
  }

  const artifact = requireJobArtifact(
    store,
    job,
    job.accepted_artifact_id,
    'accepted_artifact_id',
  );

  if (
    artifact.artifact_state !== 'ACCEPTED' &&
    artifact.artifact_state !==
      'ACCEPTED_WITH_WARNING'
  ) {
    throw new Error(
      `accepted_artifact_id for job ${job.job_id} is not in an accepted artifact state.`,
    );
  }

  return artifact;
};

const resolveCandidateArtifact = (
  store: ResumeStateStore,
  job: JobRecord,
  latestAttempt: AttemptRecord | null,
): ArtifactRecord | null => {
  if (
    latestAttempt === null ||
    latestAttempt.candidate_artifact_id === null
  ) {
    return null;
  }

  return requireJobArtifact(
    store,
    job,
    latestAttempt.candidate_artifact_id,
    'candidate_artifact_id',
  );
};

const planJob = (
  store: ResumeStateStore,
  job: JobRecord,
): ResumeJobPlan => {
  const attempts = store.listAttempts(job.job_id);
  const latestAttempt = getLatestAttempt(attempts);
  const acceptedArtifact =
    resolveAcceptedArtifact(store, job);
  const candidateArtifact =
    resolveCandidateArtifact(
      store,
      job,
      latestAttempt,
    );

  if (
    job.execution_status === 'COMPLETED' &&
    acceptedArtifact !== null
  ) {
    return {
      job,
      action: 'SKIP_ACCEPTED',
      latest_attempt: latestAttempt,
      candidate_artifact: candidateArtifact,
      accepted_artifact: acceptedArtifact,
      reason:
        'Job is completed with a persisted accepted artifact; normal resume must not recollect it.',
    };
  }

  switch (job.execution_status) {
    case 'PENDING':
      return {
        job,
        action: 'PENDING',
        latest_attempt: latestAttempt,
        candidate_artifact: candidateArtifact,
        accepted_artifact: acceptedArtifact,
        reason:
          'Job has not started and remains pending.',
      };

    case 'FAILED':
    case 'RETRY_PENDING':
      return {
        job,
        action: 'RETRY_CANDIDATE',
        latest_attempt: latestAttempt,
        candidate_artifact: candidateArtifact,
        accepted_artifact: acceptedArtifact,
        reason:
          'Persisted job state is retry-eligible for later orchestration policy.',
      };

    case 'MANUAL_ACTION_REQUIRED':
      return {
        job,
        action: 'BLOCKED_MANUAL_ACTION',
        latest_attempt: latestAttempt,
        candidate_artifact: candidateArtifact,
        accepted_artifact: acceptedArtifact,
        reason:
          'Job requires explicit manual action before safe progress.',
      };

    case 'RUNNING':
    case 'VALIDATING':
      return {
        job,
        action: 'RECONCILE_REQUIRED',
        latest_attempt: latestAttempt,
        candidate_artifact: candidateArtifact,
        accepted_artifact: acceptedArtifact,
        reason:
          candidateArtifact === null
            ? 'Interrupted active job has no candidate artifact; reconcile the incomplete attempt before retry.'
            : 'Interrupted active job has candidate evidence; reconcile/validate it before recollection.',
      };

    case 'COMPLETED':
      return {
        job,
        action: 'RECONCILE_REQUIRED',
        latest_attempt: latestAttempt,
        candidate_artifact: candidateArtifact,
        accepted_artifact: acceptedArtifact,
        reason:
          'Completed job has no accepted artifact reference and requires reconciliation.',
      };

    case 'CANCELLED':
      return {
        job,
        action: 'RECONCILE_REQUIRED',
        latest_attempt: latestAttempt,
        candidate_artifact: candidateArtifact,
        accepted_artifact: acceptedArtifact,
        reason:
          'Cancelled job exists inside a non-terminal run and requires reconciliation.',
      };
  }
};

export class ResumePlanner {
  constructor(private readonly store: ResumeStateStore) {}

  discoverIncompleteRuns(): ResumeRunPlan[] {
    return this.store
      .listIncompleteRuns()
      .map((run) => ({
        run,
        jobs: this.store
          .listJobs(run.run_id)
          .map((job) => planJob(this.store, job)),
      }));
  }

  planRun(runId: string): ResumeRunPlan | null {
    return (
      this.discoverIncompleteRuns().find(
        (plan) => plan.run.run_id === runId,
      ) ?? null
    );
  }
}
