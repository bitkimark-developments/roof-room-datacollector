import type { JobRecord } from '../../shared/run-job';

export interface RetryPolicyOptions {
  max_attempts: number;
}

export class RetryPolicy {
  readonly max_attempts: number;

  constructor(options: RetryPolicyOptions) {
    if (
      !Number.isInteger(options.max_attempts) ||
      options.max_attempts < 1
    ) {
      throw new Error(
        'RetryPolicy max_attempts must be an integer >= 1.',
      );
    }

    this.max_attempts = options.max_attempts;
  }

  canStartAnotherAttempt(job: JobRecord): boolean {
    return job.attempt_count < this.max_attempts;
  }
}
