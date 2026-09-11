import type { OrchestrationRunResult } from '../../shared/orchestration';

export interface SharedCoreRunExecutor {
  runUntilBlocked(run_id: string): Promise<OrchestrationRunResult>;
}

export class DesktopExecutionService {
  private readonly active = new Map<string, Promise<OrchestrationRunResult>>();
  constructor(private readonly executor: SharedCoreRunExecutor) {}

  execute(run_id: string): Promise<OrchestrationRunResult> {
    const existing = this.active.get(run_id);
    if (existing) return existing;
    const operation = this.executor.runUntilBlocked(run_id)
      .catch((error: unknown) => { throw error instanceof Error ? error : new Error('Core execution failed.'); })
      .finally(() => { this.active.delete(run_id); });
    this.active.set(run_id, operation);
    return operation;
  }
}
