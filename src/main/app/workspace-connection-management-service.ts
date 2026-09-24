import type { CredentialStore } from '../core/credential-store';
import type {
  DesktopCredentialManagedSourceId,
} from '../../shared/desktop-multisource';
import type {
  WorkspaceConnectionMutationRepository,
  WorkspaceSourceConnectionRecord,
} from '../../shared/workspace-connection';
import type {
  ConnectGoogleWorkspaceConnectionIntent,
  DesktopGoogleConnectionSourceId,
  ManageWorkspaceConnectionIntent,
  ProvisionSerpApiWorkspaceConnectionIntent,
  ReconnectGoogleWorkspaceConnectionIntent,
  WorkspaceConnectionMutationAction,
  WorkspaceConnectionMutationErrorCode,
  WorkspaceConnectionMutationOutcome,
  WorkspaceConnectionMutationResponse,
} from '../../shared/workspace-connection-management';
import {
  normalizeConnectGoogleWorkspaceConnectionIntent,
  normalizeDisconnectWorkspaceConnectionIntent,
  normalizeManageWorkspaceConnectionIntent,
  normalizeProvisionSerpApiWorkspaceConnectionIntent,
  normalizeReconnectGoogleWorkspaceConnectionIntent,
} from './workspace-connection-metadata';
import {
  GOOGLE_ADS_SCOPE,
  type GoogleOAuthCredentialAcquirer,
} from '../sources/google-api/google-oauth-credential-acquirer';
import type {
  SerpApiCredentialAcquirer,
} from '../sources/serpapi/serpapi-credential-acquirer';

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
    source_id: DesktopCredentialManagedSourceId;
  }
  | {
    code: 'SERPAPI_SECRET_INGRESS_FAILED';
    workspace_id: string;
    source_id: 'serpapi';
  }
  | {
    code: 'SAFE_STATE_REFRESH_FAILED';
    workspace_id: string;
    source_id: DesktopCredentialManagedSourceId;
  };

export interface WorkspaceConnectionManagementDependencies {
  repository: WorkspaceConnectionMutationRepository;
  credential_store: CredentialStore;
  google_credential_acquirer: GoogleOAuthCredentialAcquirer;
  serpapi_credential_acquirer: SerpApiCredentialAcquirer;
  refresh_safe_state: (workspace_id: string) => Promise<void>;
  record_diagnostic: (event: WorkspaceConnectionDiagnosticEvent) => void;
}

const success = (
  sourceId: DesktopCredentialManagedSourceId,
  action: WorkspaceConnectionMutationAction,
  outcome: WorkspaceConnectionMutationOutcome = 'SUCCEEDED',
): WorkspaceConnectionMutationResponse => ({
  ok: true,
  result: {
    source_id: sourceId,
    action,
    outcome,
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

  connectGoogle(value: unknown): Promise<WorkspaceConnectionMutationResponse> {
    let intent: ConnectGoogleWorkspaceConnectionIntent;
    try {
      intent = normalizeConnectGoogleWorkspaceConnectionIntent(value);
    } catch {
      return Promise.resolve(failure('INVALID_CONNECTION_INTENT', false));
    }
    return this.serialize(() => this.connectGoogleNormalized(intent));
  }

  reconnectGoogle(value: unknown): Promise<WorkspaceConnectionMutationResponse> {
    let intent: ReconnectGoogleWorkspaceConnectionIntent;
    try {
      intent = normalizeReconnectGoogleWorkspaceConnectionIntent(value);
    } catch {
      return Promise.resolve(failure('INVALID_CONNECTION_INTENT', false));
    }
    return this.serialize(() => this.reconnectGoogleNormalized(intent));
  }

  provisionSerpApi(value: unknown): Promise<WorkspaceConnectionMutationResponse> {
    let intent: ProvisionSerpApiWorkspaceConnectionIntent;
    try {
      intent = normalizeProvisionSerpApiWorkspaceConnectionIntent(value);
    } catch {
      return Promise.resolve(failure('INVALID_CONNECTION_INTENT', false));
    }
    return this.serialize(() => this.provisionSerpApiNormalized(intent));
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

  private async provisionSerpApiNormalized(
    intent: ProvisionSerpApiWorkspaceConnectionIntent,
  ): Promise<WorkspaceConnectionMutationResponse> {
    let existing: WorkspaceSourceConnectionRecord | null;
    try {
      existing = this.dependencies.repository.getSourceConnection(
        intent.workspace_id,
        intent.source_id,
      );
    } catch {
      return failure('CONNECTION_PERSISTENCE_FAILED', true, intent.source_id);
    }

    let acquiredCredentialRef: string;
    try {
      const acquired = await this.dependencies.serpapi_credential_acquirer
        .acquire();
      if (acquired.status === 'CANCELLED') {
        return failure('SECRET_INGRESS_CANCELLED', false, intent.source_id);
      }
      acquiredCredentialRef = acquired.credential_ref;
    } catch (error) {
      return this.serpApiAcquisitionFailure(error, intent);
    }

    if (existing?.credential_ref === null || existing === null) {
      try {
        this.dependencies.repository.upsertSourceConnection({
          workspace_id: intent.workspace_id,
          source_id: intent.source_id,
          credential_ref: acquiredCredentialRef,
          safe_metadata: {},
        });
      } catch {
        await this.compensateFreshCredential(
          acquiredCredentialRef,
          intent.workspace_id,
          intent.source_id,
        );
        await this.refreshSafeState(intent.workspace_id, intent.source_id);
        return failure(
          'CONNECTION_PERSISTENCE_FAILED',
          true,
          intent.source_id,
        );
      }
      await this.refreshSafeState(intent.workspace_id, intent.source_id);
      return success(intent.source_id, 'PROVISION_SERPAPI');
    }

    try {
      this.dependencies.repository.rebindSourceConnections({
        workspace_id: intent.workspace_id,
        source_ids: [intent.source_id],
        expected_credential_ref: existing.credential_ref,
        replacement_credential_ref: acquiredCredentialRef,
      });
    } catch {
      await this.compensateFreshCredential(
        acquiredCredentialRef,
        intent.workspace_id,
        intent.source_id,
      );
      await this.refreshSafeState(intent.workspace_id, intent.source_id);
      return failure('CONNECTION_REBIND_FAILED', true, intent.source_id);
    }

    let outcome: WorkspaceConnectionMutationOutcome = 'SUCCEEDED';
    try {
      const remainingReferences =
        this.dependencies.repository.countSourceConnectionsByCredentialRef(
          existing.credential_ref,
        );
      if (remainingReferences === 0) {
        await this.dependencies.credential_store.deleteCredential(
          existing.credential_ref,
        );
      }
    } catch {
      outcome = 'SUCCEEDED_WITH_CLEANUP_WARNING';
      this.recordDiagnostic({
        code: 'OBSOLETE_CREDENTIAL_CLEANUP_FAILED',
        workspace_id: intent.workspace_id,
        source_id: intent.source_id,
      });
    }

    await this.refreshSafeState(intent.workspace_id, intent.source_id);
    return success(intent.source_id, 'PROVISION_SERPAPI', outcome);
  }

  private async connectGoogleNormalized(
    intent: ConnectGoogleWorkspaceConnectionIntent,
  ): Promise<WorkspaceConnectionMutationResponse> {
    try {
      if (this.dependencies.repository.getSourceConnection(
        intent.workspace_id,
        intent.source_id,
      )) {
        return failure('CONNECTION_ALREADY_EXISTS', false, intent.source_id);
      }
    } catch {
      return failure('CONNECTION_PERSISTENCE_FAILED', true, intent.source_id);
    }

    let reusableCredentialRef: string | null;
    try {
      reusableCredentialRef = await this.findReusableAdsCredential(intent);
    } catch {
      return failure('CONNECTION_PERSISTENCE_FAILED', true, intent.source_id);
    }
    if (reusableCredentialRef !== null) {
      try {
        this.dependencies.repository.upsertSourceConnection({
          workspace_id: intent.workspace_id,
          source_id: intent.source_id,
          credential_ref: reusableCredentialRef,
          safe_metadata: { ...intent.metadata },
        });
      } catch {
        await this.refreshSafeState(intent.workspace_id, intent.source_id);
        return failure('CONNECTION_PERSISTENCE_FAILED', true, intent.source_id);
      }
      await this.refreshSafeState(intent.workspace_id, intent.source_id);
      return success(intent.source_id, 'CONNECT_GOOGLE');
    }

    const configuration = await this.readGoogleConfiguration(
      intent.source_id,
    );
    if ('response' in configuration) return configuration.response;

    let acquiredCredentialRef: string;
    try {
      const acquired = await this.dependencies.google_credential_acquirer.acquire({
        workspace_id: intent.workspace_id,
        source_id: intent.source_id,
        application_configuration: configuration.value,
      });
      acquiredCredentialRef = acquired.credential_ref;
    } catch (error) {
      return this.googleAcquisitionFailure(error, intent.source_id);
    }

    try {
      this.dependencies.repository.upsertSourceConnection({
        workspace_id: intent.workspace_id,
        source_id: intent.source_id,
        credential_ref: acquiredCredentialRef,
        safe_metadata: { ...intent.metadata },
      });
    } catch {
      await this.compensateFreshCredential(
        acquiredCredentialRef,
        intent.workspace_id,
        intent.source_id,
      );
      await this.refreshSafeState(intent.workspace_id, intent.source_id);
      return failure('CONNECTION_PERSISTENCE_FAILED', true, intent.source_id);
    }

    await this.refreshSafeState(intent.workspace_id, intent.source_id);
    return success(intent.source_id, 'CONNECT_GOOGLE');
  }

  private async reconnectGoogleNormalized(
    intent: ReconnectGoogleWorkspaceConnectionIntent,
  ): Promise<WorkspaceConnectionMutationResponse> {
    let existing: WorkspaceSourceConnectionRecord | null;
    try {
      existing = this.dependencies.repository.getSourceConnection(
        intent.workspace_id,
        intent.source_id,
      );
    } catch {
      return failure('CONNECTION_PERSISTENCE_FAILED', true, intent.source_id);
    }
    if (!existing) {
      return failure('CONNECTION_NOT_FOUND', false, intent.source_id);
    }
    if (existing.credential_ref === null) {
      return failure(
        'CONNECTION_CONFIGURATION_UNAVAILABLE',
        false,
        intent.source_id,
      );
    }

    let sourceIds: DesktopGoogleConnectionSourceId[];
    try {
      sourceIds = this.googleRebindSourceIds(
        intent,
        existing.credential_ref,
      );
    } catch {
      return failure('CONNECTION_PERSISTENCE_FAILED', true, intent.source_id);
    }

    const configuration = await this.readGoogleConfiguration(
      intent.source_id,
      existing.credential_ref,
    );
    if ('response' in configuration) return configuration.response;

    let acquiredCredentialRef: string;
    try {
      const acquired = await this.dependencies.google_credential_acquirer.acquire({
        workspace_id: intent.workspace_id,
        source_id: intent.source_id,
        application_configuration: configuration.value,
      });
      acquiredCredentialRef = acquired.credential_ref;
    } catch (error) {
      return this.googleAcquisitionFailure(error, intent.source_id);
    }

    try {
      this.dependencies.repository.rebindSourceConnections({
        workspace_id: intent.workspace_id,
        source_ids: sourceIds,
        expected_credential_ref: existing.credential_ref,
        replacement_credential_ref: acquiredCredentialRef,
        ...(intent.metadata === undefined
          ? {}
          : {
            safe_metadata_updates: [{
              source_id: intent.source_id,
              safe_metadata: { ...intent.metadata },
            }],
          }),
      });
    } catch {
      await this.compensateFreshCredential(
        acquiredCredentialRef,
        intent.workspace_id,
        intent.source_id,
      );
      await this.refreshSafeState(intent.workspace_id, intent.source_id);
      return failure('CONNECTION_REBIND_FAILED', true, intent.source_id);
    }

    let outcome: WorkspaceConnectionMutationOutcome = 'SUCCEEDED';
    try {
      const remainingReferences =
        this.dependencies.repository.countSourceConnectionsByCredentialRef(
          existing.credential_ref,
        );
      if (remainingReferences === 0) {
        await this.dependencies.credential_store.deleteCredential(
          existing.credential_ref,
        );
      }
    } catch {
      outcome = 'SUCCEEDED_WITH_CLEANUP_WARNING';
      this.recordDiagnostic({
        code: 'OBSOLETE_CREDENTIAL_CLEANUP_FAILED',
        workspace_id: intent.workspace_id,
        source_id: intent.source_id,
      });
    }

    await this.refreshSafeState(intent.workspace_id, intent.source_id);
    return success(intent.source_id, 'RECONNECT_GOOGLE', outcome);
  }

  private async findReusableAdsCredential(
    intent: ConnectGoogleWorkspaceConnectionIntent,
  ): Promise<string | null> {
    if (intent.source_id === 'google-search-console-query-page') return null;
    const siblingSourceId = intent.source_id === 'google-ads-search-terms'
      ? 'google-keyword-planner'
      : 'google-ads-search-terms';
    const sibling = this.dependencies.repository.getSourceConnection(
      intent.workspace_id,
      siblingSourceId,
    );
    if (sibling?.credential_ref === null || sibling === null) return null;
    try {
      const compatible =
        await this.dependencies.google_credential_acquirer.isCompatible(
          sibling.credential_ref,
          [GOOGLE_ADS_SCOPE],
        );
      return compatible ? sibling.credential_ref : null;
    } catch {
      return null;
    }
  }

  private googleRebindSourceIds(
    intent: ReconnectGoogleWorkspaceConnectionIntent,
    expectedCredentialRef: string,
  ): DesktopGoogleConnectionSourceId[] {
    if (intent.source_id === 'google-search-console-query-page') {
      return [intent.source_id];
    }
    const siblingSourceId = intent.source_id === 'google-ads-search-terms'
      ? 'google-keyword-planner'
      : 'google-ads-search-terms';
    const sibling = this.dependencies.repository.getSourceConnection(
      intent.workspace_id,
      siblingSourceId,
    );
    return sibling?.credential_ref === expectedCredentialRef
      ? [intent.source_id, siblingSourceId]
      : [intent.source_id];
  }

  private async readGoogleConfiguration(
    sourceId: DesktopGoogleConnectionSourceId,
    existingCredentialRef?: string,
  ): Promise<
    | {
      ok: true;
      value: NonNullable<Awaited<ReturnType<
        GoogleOAuthCredentialAcquirer['readApplicationConfiguration']
      >>>;
    }
    | { ok: false; response: WorkspaceConnectionMutationResponse }
  > {
    try {
      const configuration =
        await this.dependencies.google_credential_acquirer
          .readApplicationConfiguration(existingCredentialRef);
      if (
        configuration !== null
        && configuration.client_secret !== undefined
        && (
          sourceId === 'google-search-console-query-page'
          || configuration.developer_token !== undefined
        )
      ) return { ok: true, value: configuration };
    } catch {
      // Configuration access fails closed with a safe error code.
    }
    return {
      ok: false,
      response: failure(
        'CONNECTION_CONFIGURATION_UNAVAILABLE',
        false,
        sourceId,
      ),
    };
  }

  private googleAcquisitionFailure(
    error: unknown,
    sourceId: DesktopGoogleConnectionSourceId,
  ): WorkspaceConnectionMutationResponse {
    const candidate = typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
    const supportedCodes: readonly WorkspaceConnectionMutationErrorCode[] = [
      'CONNECTION_CONFIGURATION_UNAVAILABLE',
      'OAUTH_MANUAL_ACTION_REQUIRED',
      'OAUTH_ACQUISITION_FAILED',
      'CREDENTIAL_PERSISTENCE_FAILED',
    ];
    const code = typeof candidate === 'string'
      && supportedCodes.includes(candidate as WorkspaceConnectionMutationErrorCode)
      ? candidate as WorkspaceConnectionMutationErrorCode
      : 'OAUTH_ACQUISITION_FAILED';
    return failure(
      code,
      code === 'OAUTH_ACQUISITION_FAILED'
        || code === 'CREDENTIAL_PERSISTENCE_FAILED',
      sourceId,
    );
  }

  private serpApiAcquisitionFailure(
    error: unknown,
    intent: ProvisionSerpApiWorkspaceConnectionIntent,
  ): WorkspaceConnectionMutationResponse {
    const candidate = typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
    const supportedCodes: readonly WorkspaceConnectionMutationErrorCode[] = [
      'SECRET_INGRESS_FAILED',
      'SECRET_INPUT_INVALID',
      'CREDENTIAL_PERSISTENCE_FAILED',
    ];
    const code = typeof candidate === 'string'
      && supportedCodes.includes(candidate as WorkspaceConnectionMutationErrorCode)
      ? candidate as WorkspaceConnectionMutationErrorCode
      : 'SECRET_INGRESS_FAILED';
    if (code === 'SECRET_INGRESS_FAILED') {
      this.recordDiagnostic({
        code: 'SERPAPI_SECRET_INGRESS_FAILED',
        workspace_id: intent.workspace_id,
        source_id: intent.source_id,
      });
    }
    return failure(
      code,
      code !== 'SECRET_INPUT_INVALID',
      intent.source_id,
    );
  }

  private async compensateFreshCredential(
    credentialRef: string,
    workspaceId: string,
    sourceId: DesktopCredentialManagedSourceId,
  ): Promise<void> {
    try {
      const referenceCount =
        this.dependencies.repository.countSourceConnectionsByCredentialRef(
          credentialRef,
        );
      if (referenceCount === 0) {
        await this.dependencies.credential_store.deleteCredential(credentialRef);
      }
    } catch {
      this.recordDiagnostic({
        code: 'NEW_CREDENTIAL_COMPENSATION_FAILED',
        workspace_id: workspaceId,
        source_id: sourceId,
      });
    }
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
