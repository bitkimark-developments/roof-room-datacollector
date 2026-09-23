import type { CredentialStore } from '../core/credential-store';
import type {
  DesktopCredentialManagedSourceId,
} from '../../shared/desktop-multisource';
import type {
  WorkspaceConnectionMutationRepository,
  WorkspaceSourceConnectionRecord,
} from '../../shared/workspace-connection';
import type {
  DesktopGoogleConnectionSourceId,
  ManageWorkspaceConnectionIntent,
  WorkspaceConnectionMutationAction,
  WorkspaceConnectionMutationErrorCode,
  WorkspaceConnectionMutationResponse,
} from '../../shared/workspace-connection-management';
import {
  normalizeDisconnectWorkspaceConnectionIntent,
  normalizeManageWorkspaceConnectionIntent,
} from './workspace-connection-metadata';

export type WorkspaceConnectionDiagnosticEvent =
  | {
    code: 'OBSOLETE_CREDENTIAL_CLEANUP_FAILED';
    workspace_id: string;
    source_id: DesktopCredentialManagedSourceId;
  }
  | {
    code: 'DISCONNECT_COMPENSATION_FAILED';
    workspace_id: string;
    source_id: DesktopCredentialManagedSourceId;
  }
  | {
    code: 'NEW_CREDENTIAL_COMPENSATION_FAILED';
    workspace_id: string;
    source_id: DesktopGoogleConnectionSourceId;
  }
  | {
    code: 'SAFE_STATE_REFRESH_FAILED';
    workspace_id: string;
    source_id: DesktopCredentialManagedSourceId;
  };

export interface WorkspaceConnectionManagementDependencies {
  repository: WorkspaceConnectionMutationRepository;
  credential_store: CredentialStore;
  refresh_safe_state: (workspace_id: string) => Promise<void>;
  record_diagnostic: (event: WorkspaceConnectionDiagnosticEvent) => void;
}

const success = (
  sourceId: DesktopCredentialManagedSourceId,
  action: WorkspaceConnectionMutationAction,
): WorkspaceConnectionMutationResponse => ({
  ok: true,
  result: {
    source_id: sourceId,
    action,
    outcome: 'SUCCEEDED',
  },
});

const failure = (
  code: WorkspaceConnectionMutationErrorCode,
  retryable: boolean,
  sourceId?: DesktopCredentialManagedSourceId,
): WorkspaceConnectionMutationResponse => ({
  ok: false,
  error: {
    code,
    ...(sourceId === undefined ? {} : { source_id: sourceId }),
    retryable,
  },
});

export class WorkspaceConnectionManagementService {
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly dependencies: WorkspaceConnectionManagementDependencies,
  ) {}

  manage(value: unknown): Promise<WorkspaceConnectionMutationResponse> {
    let intent: ManageWorkspaceConnectionIntent;
    try {
      intent = normalizeManageWorkspaceConnectionIntent(value);
    } catch {
      return Promise.resolve(failure('INVALID_CONNECTION_INTENT', false));
    }
    return this.serialize(() => this.manageNormalized(intent));
  }

  disconnect(value: unknown): Promise<WorkspaceConnectionMutationResponse> {
    let intent;
    try {
      intent = normalizeDisconnectWorkspaceConnectionIntent(value);
    } catch {
      return Promise.resolve(failure('INVALID_CONNECTION_INTENT', false));
    }
    return this.serialize(async () => {
      let existing: WorkspaceSourceConnectionRecord | null;
      try {
        existing = this.dependencies.repository.getSourceConnection(
          intent.workspace_id,
          intent.source_id,
        );
      } catch {
        return failure(
          'CONNECTION_PERSISTENCE_FAILED',
          true,
          intent.source_id,
        );
      }
      if (!existing) {
        return failure('CONNECTION_NOT_FOUND', false, intent.source_id);
      }

      let removed: WorkspaceSourceConnectionRecord | null;
      try {
        removed = this.dependencies.repository.deleteSourceConnection(
          intent.workspace_id,
          intent.source_id,
        );
      } catch {
        return failure(
          'CONNECTION_PERSISTENCE_FAILED',
          true,
          intent.source_id,
        );
      }
      if (!removed) {
        return failure(
          'CONNECTION_PERSISTENCE_FAILED',
          true,
          intent.source_id,
        );
      }

      let response: WorkspaceConnectionMutationResponse;
      if (removed.credential_ref === null) {
        response = success(intent.source_id, 'DISCONNECT');
      } else {
        let referenceCount: number;
        try {
          referenceCount =
            this.dependencies.repository
              .countSourceConnectionsByCredentialRef(
                removed.credential_ref,
              );
        } catch {
          response = this.restoreDisconnectedRow(
            removed,
            'CONNECTION_PERSISTENCE_FAILED',
            true,
          );
          await this.refreshSafeState(intent.workspace_id, intent.source_id);
          return response;
        }

        if (referenceCount > 0) {
          response = success(intent.source_id, 'DISCONNECT');
        } else {
          try {
            await this.dependencies.credential_store.deleteCredential(
              removed.credential_ref,
            );
            response = success(intent.source_id, 'DISCONNECT');
          } catch {
            response = this.restoreDisconnectedRow(
              removed,
              'DISCONNECT_CREDENTIAL_DELETE_FAILED',
              true,
            );
          }
        }
      }

      await this.refreshSafeState(intent.workspace_id, intent.source_id);
      return response;
    });
  }

  private async manageNormalized(
    intent: ManageWorkspaceConnectionIntent,
  ): Promise<WorkspaceConnectionMutationResponse> {
    let existing: WorkspaceSourceConnectionRecord | null;
    try {
      existing = this.dependencies.repository.getSourceConnection(
        intent.workspace_id,
        intent.source_id,
      );
    } catch {
      return failure(
        'CONNECTION_PERSISTENCE_FAILED',
        true,
        intent.source_id,
      );
    }
    if (!existing) {
      return failure('CONNECTION_NOT_FOUND', false, intent.source_id);
    }

    let response: WorkspaceConnectionMutationResponse;
    try {
      this.dependencies.repository.upsertSourceConnection({
        workspace_id: intent.workspace_id,
        source_id: intent.source_id,
        credential_ref: existing.credential_ref,
        safe_metadata: { ...intent.metadata },
      });
      response = success(intent.source_id, 'MANAGE_METADATA');
    } catch {
      response = failure(
        'CONNECTION_PERSISTENCE_FAILED',
        true,
        intent.source_id,
      );
    }
    await this.refreshSafeState(intent.workspace_id, intent.source_id);
    return response;
  }

  private restoreDisconnectedRow(
    removed: WorkspaceSourceConnectionRecord,
    primaryCode: WorkspaceConnectionMutationErrorCode,
    primaryRetryable: boolean,
  ): WorkspaceConnectionMutationResponse {
    try {
      this.dependencies.repository.restoreSourceConnection(removed);
      return failure(
        primaryCode,
        primaryRetryable,
        removed.source_id as DesktopCredentialManagedSourceId,
      );
    } catch {
      const sourceId = removed.source_id as DesktopCredentialManagedSourceId;
      this.recordDiagnostic({
        code: 'DISCONNECT_COMPENSATION_FAILED',
        workspace_id: removed.workspace_id,
        source_id: sourceId,
      });
      return failure(
        'DISCONNECT_COMPENSATION_FAILED',
        false,
        sourceId,
      );
    }
  }

  private async refreshSafeState(
    workspaceId: string,
    sourceId: DesktopCredentialManagedSourceId,
  ): Promise<void> {
    try {
      await this.dependencies.refresh_safe_state(workspaceId);
    } catch {
      this.recordDiagnostic({
        code: 'SAFE_STATE_REFRESH_FAILED',
        workspace_id: workspaceId,
        source_id: sourceId,
      });
    }
  }

  private recordDiagnostic(
    event: WorkspaceConnectionDiagnosticEvent,
  ): void {
    try {
      this.dependencies.record_diagnostic(event);
    } catch {
      // Diagnostics must not replace the primary mutation result.
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      (): void => undefined,
      (): void => undefined,
    );
    return result;
  }
}
