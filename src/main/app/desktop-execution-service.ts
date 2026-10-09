import type { AttemptRecord } from '../../shared/attempt';
import type { OrchestrationRunResult } from '../../shared/orchestration';

export interface SharedCoreRunExecutor {
  runUntilBlocked(
    run_id: string,
  ): Promise<OrchestrationRunResult>;

  requestCancellation?(
    run_id: string,
  ): void;

  clearCancellationRequest?(
    run_id: string,
  ): void;

  executeStartedAttempt(
    run_id: string,
    job_id: string,
    attempt: AttemptRecord,
  ): Promise<unknown>;
}

export type DesktopExecutionCancellation =
  () => Promise<void>;

interface ActiveExecution {
  promise: Promise<OrchestrationRunResult>;
  cancel?: DesktopExecutionCancellation;
  cancellation_domain?: string;
}

export class DesktopExecutionService {
  private readonly active =
    new Map<
      string,
      ActiveExecution
    >();

  private readonly cancellationDomainOwners =
    new Map<
      string,
      string
    >();

  constructor(
    private readonly executor:
      SharedCoreRunExecutor,
  ) {}

  isActive(
    run_id: string,
  ): boolean {
    return this.active.has(
      run_id,
    );
  }

  canCancel(
    run_id: string,
  ): boolean {
    return (
      this.active.get(
        run_id,
      )?.cancel !== undefined
    );
  }

  async cancelActive(
    run_id: string,
  ): Promise<void> {
    const active =
      this.active.get(
        run_id,
      );

    if (!active) {
      throw new Error(
        `Run ${run_id} is not owned by active in-process execution.`,
      );
    }

    if (!active.cancel) {
      throw new Error(
        `Run ${run_id} has no active cancellation capability.`,
      );
    }

    this.executor.requestCancellation?.(
      run_id,
    );

    await active.cancel();

    try {
      await active.promise;
    } catch {
      // Physical cancellation commonly causes the in-flight
      // provider operation to reject. Persisted Core state is
      // authoritative after explicit cancellation.
    }
  }

  execute(
    run_id: string,
    cancel?: DesktopExecutionCancellation,
    cancellation_domain?: string,
  ): Promise<OrchestrationRunResult> {
    const existing =
      this.active.get(
        run_id,
      );

    if (existing) {
      return existing.promise;
    }

    this.claimCancellationDomain(
      run_id,
      cancellation_domain,
    );

    let operation:
      Promise<OrchestrationRunResult>;

    try {
      operation =
        this.executor
          .runUntilBlocked(
            run_id,
          )
          .catch(
            (
              error: unknown,
            ) => {
              throw error
                instanceof Error
                ? error
                : new Error(
                    'Core execution failed.',
                  );
            },
          )
          .finally(() => {
            const active =
              this.active.get(
                run_id,
              );

            if (
              active?.promise
                === operation
            ) {
              this.active.delete(
                run_id,
              );

              this.releaseCancellationDomain(
                run_id,
                cancellation_domain,
              );
            }
          });
    } catch (error) {
      this.releaseCancellationDomain(
        run_id,
        cancellation_domain,
      );
      throw error;
    }

    this.active.set(
      run_id,
      {
        promise:
          operation,
        cancel,
        cancellation_domain,
      },
    );

    return operation;
  }

  executeStartedAttemptAndContinue(
    run_id: string,
    job_id: string,
    attempt: AttemptRecord,
    cancel?: DesktopExecutionCancellation,
    cancellation_domain?: string,
  ): Promise<OrchestrationRunResult> {
    const existing =
      this.active.get(
        run_id,
      );

    if (existing) {
      return existing.promise;
    }

    this.claimCancellationDomain(
      run_id,
      cancellation_domain,
    );

    let operation:
      Promise<OrchestrationRunResult>;

    try {
      operation =
        this.executor
          .executeStartedAttempt(
            run_id,
            job_id,
            attempt,
          )
          .then(() =>
            this.executor
              .runUntilBlocked(
                run_id,
              ),
          )
          .catch(
            (
              error: unknown,
            ) => {
              throw error
                instanceof Error
                ? error
                : new Error(
                    'Core retry execution failed.',
                  );
            },
          )
          .finally(() => {
            this.executor.clearCancellationRequest?.(
              run_id,
            );

            const active =
              this.active.get(
                run_id,
              );

            if (
              active?.promise
                === operation
            ) {
              this.active.delete(
                run_id,
              );

              this.releaseCancellationDomain(
                run_id,
                cancellation_domain,
              );
            }
          });
    } catch (error) {
      this.releaseCancellationDomain(
        run_id,
        cancellation_domain,
      );
      throw error;
    }

    this.active.set(
      run_id,
      {
        promise:
          operation,
        cancel,
        cancellation_domain,
      },
    );

    return operation;
  }

  private claimCancellationDomain(
    run_id: string,
    cancellation_domain?: string,
  ): void {
    if (!cancellation_domain) {
      return;
    }

    const owner =
      this.cancellationDomainOwners.get(
        cancellation_domain,
      );

    if (
      owner !== undefined
      && owner !== run_id
    ) {
      throw new Error(
        `Cancellation domain ${cancellation_domain} is already owned by Run ${owner}.`,
      );
    }

    this.cancellationDomainOwners.set(
      cancellation_domain,
      run_id,
    );
  }

  private releaseCancellationDomain(
    run_id: string,
    cancellation_domain?: string,
  ): void {
    if (!cancellation_domain) {
      return;
    }

    if (
      this.cancellationDomainOwners.get(
        cancellation_domain,
      ) === run_id
    ) {
      this.cancellationDomainOwners.delete(
        cancellation_domain,
      );
    }
  }
}
