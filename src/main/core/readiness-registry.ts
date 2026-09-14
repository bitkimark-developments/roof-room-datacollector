import type { StateRepository } from '../storage/state-repository';
import type { WorkspaceSourceConnectionRecord } from '../../shared/workspace-connection';
import type { WorkspaceReadinessResult, WorkspaceReadinessStatus } from '../../shared/readiness';
import type { CredentialStore } from './credential-store';

export interface SourceReadinessEvaluationContext {
  workspace_id: string;
  source_id: string;
  source_config: Record<string, unknown>;
  connection: WorkspaceSourceConnectionRecord | null;
  credential_available: boolean;
}

export type SourceReadinessEvaluator = (
  context: SourceReadinessEvaluationContext,
) => WorkspaceReadinessStatus;

export class ReadinessRegistryError extends Error {
  constructor(public readonly code: 'UNKNOWN_SOURCE_ID') {
    super(`No readiness evaluator is registered for source: ${code}`);
    this.name = 'ReadinessRegistryError';
  }
}

export class ReadinessRegistry {
  private readonly evaluators = new Map<string, SourceReadinessEvaluator>();

  constructor(
    private readonly repository: StateRepository,
    private readonly credentialStore: CredentialStore,
  ) {}

  register(sourceId: string, evaluator: SourceReadinessEvaluator): void {
    if (this.evaluators.has(sourceId)) throw new Error(`Readiness evaluator already registered: ${sourceId}`);
    this.evaluators.set(sourceId, evaluator);
  }

  async getReadiness(
    workspaceId: string,
    sourceId: string,
    sourceConfig: Record<string, unknown> = {},
  ): Promise<WorkspaceReadinessResult> {
    const evaluator = this.evaluators.get(sourceId);
    if (!evaluator) throw new ReadinessRegistryError('UNKNOWN_SOURCE_ID');
    const connection = this.repository.getSourceConnection(workspaceId, sourceId);
    const credentialAvailable = connection?.credential_ref === null || connection?.credential_ref === undefined
      ? false
      : await this.credentialStore.hasCredential(connection.credential_ref);
    const status = evaluator({
      workspace_id: workspaceId,
      source_id: sourceId,
      source_config: sourceConfig,
      connection,
      credential_available: credentialAvailable,
    });
    return { workspace_id: workspaceId, source_id: sourceId, readiness_status: status, checked_at: new Date().toISOString(), message: null };
  }
}
