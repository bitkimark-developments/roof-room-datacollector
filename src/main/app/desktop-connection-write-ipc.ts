import {
  DESKTOP_CREDENTIAL_MANAGED_SOURCE_IDS,
  type DesktopCredentialManagedSourceId,
} from '../../shared/desktop-multisource';
import {
  type ConnectGoogleWorkspaceConnectionIntent,
  type DisconnectWorkspaceConnectionIntent,
  type ManageWorkspaceConnectionIntent,
  type ProvisionSerpApiWorkspaceConnectionIntent,
  type ReconnectGoogleWorkspaceConnectionIntent,
  type WorkspaceConnectionMutationAction,
  type WorkspaceConnectionMutationErrorCode,
  type WorkspaceConnectionMutationResponse,
} from '../../shared/workspace-connection-management';
import {
  normalizeConnectGoogleWorkspaceConnectionIntent,
  normalizeDisconnectWorkspaceConnectionIntent,
  normalizeManageWorkspaceConnectionIntent,
  normalizeProvisionSerpApiWorkspaceConnectionIntent,
  normalizeReconnectGoogleWorkspaceConnectionIntent,
} from './workspace-connection-metadata';

type ConnectionWriteService = {
  manage: (
    intent: ManageWorkspaceConnectionIntent,
  ) => Promise<WorkspaceConnectionMutationResponse>;
  disconnect: (
    intent: DisconnectWorkspaceConnectionIntent,
  ) => Promise<WorkspaceConnectionMutationResponse>;
  connectGoogle: (
    intent: ConnectGoogleWorkspaceConnectionIntent,
  ) => Promise<WorkspaceConnectionMutationResponse>;
  reconnectGoogle: (
    intent: ReconnectGoogleWorkspaceConnectionIntent,
  ) => Promise<WorkspaceConnectionMutationResponse>;
  provisionSerpApi: (
    intent: ProvisionSerpApiWorkspaceConnectionIntent,
  ) => Promise<WorkspaceConnectionMutationResponse>;
};

export interface DesktopConnectionWriteHandlerDependencies<Event> {
  assertTrustedSender: (event: Event) => void;
  service: ConnectionWriteService;
}

const mutationErrorCodes: readonly WorkspaceConnectionMutationErrorCode[] = [
  'INVALID_CONNECTION_INTENT',
  'CONNECTION_NOT_FOUND',
  'CONNECTION_ALREADY_EXISTS',
  'CONNECTION_CONFIGURATION_UNAVAILABLE',
  'OAUTH_MANUAL_ACTION_REQUIRED',
  'OAUTH_ACQUISITION_FAILED',
  'SECRET_INGRESS_CANCELLED',
  'SECRET_INGRESS_FAILED',
  'SECRET_INPUT_INVALID',
  'CREDENTIAL_PERSISTENCE_FAILED',
  'CONNECTION_PERSISTENCE_FAILED',
  'CONNECTION_REBIND_FAILED',
  'DISCONNECT_CREDENTIAL_DELETE_FAILED',
  'DISCONNECT_COMPENSATION_FAILED',
];

const invalidIntent = (): WorkspaceConnectionMutationResponse => ({
  ok: false,
  error: {
    code: 'INVALID_CONNECTION_INTENT',
    retryable: false,
  },
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && (
    Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null
  )
);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => allowed.has(key));
};

const isSourceId = (
  value: unknown,
): value is DesktopCredentialManagedSourceId => (
  typeof value === 'string'
  && (DESKTOP_CREDENTIAL_MANAGED_SOURCE_IDS as readonly string[]).includes(value)
);

const requireSafeMutationResponse = (
  value: unknown,
  expectedSourceId: DesktopCredentialManagedSourceId,
  expectedAction: WorkspaceConnectionMutationAction,
): WorkspaceConnectionMutationResponse => {
  if (!isPlainRecord(value) || typeof value.ok !== 'boolean') {
    throw new Error('Workspace connection mutation service returned an invalid response.');
  }
  if (value.ok) {
    if (!hasExactKeys(value, ['ok', 'result']) || !isPlainRecord(value.result)) {
      throw new Error('Workspace connection mutation service returned an invalid response.');
    }
    const result = value.result;
    if (
      !hasExactKeys(result, ['source_id', 'action', 'outcome'])
      || result.source_id !== expectedSourceId
      || result.action !== expectedAction
      || (
        result.outcome !== 'SUCCEEDED'
        && result.outcome !== 'SUCCEEDED_WITH_CLEANUP_WARNING'
      )
    ) {
      throw new Error('Workspace connection mutation service returned an invalid response.');
    }
    return {
      ok: true,
      result: {
        source_id: expectedSourceId,
        action: expectedAction,
        outcome: result.outcome === 'SUCCEEDED'
          ? 'SUCCEEDED'
          : 'SUCCEEDED_WITH_CLEANUP_WARNING',
      },
    };
  }

  if (!hasExactKeys(value, ['ok', 'error']) || !isPlainRecord(value.error)) {
    throw new Error('Workspace connection mutation service returned an invalid response.');
  }
  const error = value.error;
  if (
    !hasExactKeys(error, ['code', 'retryable'], ['source_id'])
    || typeof error.code !== 'string'
    || !mutationErrorCodes.includes(error.code as WorkspaceConnectionMutationErrorCode)
    || typeof error.retryable !== 'boolean'
    || (
      Object.hasOwn(error, 'source_id')
      && error.source_id !== expectedSourceId
    )
  ) {
    throw new Error('Workspace connection mutation service returned an invalid response.');
  }
  return {
    ok: false,
    error: {
      code: error.code as WorkspaceConnectionMutationErrorCode,
      ...(isSourceId(error.source_id)
        ? { source_id: error.source_id }
        : {}),
      retryable: error.retryable,
    },
  };
};

const normalizeOrInvalid = <Intent>(
  value: unknown,
  normalize: (candidate: unknown) => Intent,
): { ok: true; intent: Intent } | { ok: false } => {
  try {
    return { ok: true, intent: normalize(value) };
  } catch {
    return { ok: false };
  }
};

export const createDesktopConnectionWriteHandlers = <Event>(
  dependencies: DesktopConnectionWriteHandlerDependencies<Event>,
) => ({
  manage: async (
    event: Event,
    value: unknown,
  ): Promise<WorkspaceConnectionMutationResponse> => {
    dependencies.assertTrustedSender(event);
    const normalized = normalizeOrInvalid(
      value,
      normalizeManageWorkspaceConnectionIntent,
    );
    if (!normalized.ok) return invalidIntent();
    const response = await dependencies.service.manage(normalized.intent);
    return requireSafeMutationResponse(
      response,
      normalized.intent.source_id,
      'MANAGE_METADATA',
    );
  },
  disconnect: async (
    event: Event,
    value: unknown,
  ): Promise<WorkspaceConnectionMutationResponse> => {
    dependencies.assertTrustedSender(event);
    const normalized = normalizeOrInvalid(
      value,
      normalizeDisconnectWorkspaceConnectionIntent,
    );
    if (!normalized.ok) return invalidIntent();
    const response = await dependencies.service.disconnect(normalized.intent);
    return requireSafeMutationResponse(
      response,
      normalized.intent.source_id,
      'DISCONNECT',
    );
  },
  connectGoogle: async (
    event: Event,
    value: unknown,
  ): Promise<WorkspaceConnectionMutationResponse> => {
    dependencies.assertTrustedSender(event);
    const normalized = normalizeOrInvalid(
      value,
      normalizeConnectGoogleWorkspaceConnectionIntent,
    );
    if (!normalized.ok) return invalidIntent();
    const response = await dependencies.service.connectGoogle(normalized.intent);
    return requireSafeMutationResponse(
      response,
      normalized.intent.source_id,
      'CONNECT_GOOGLE',
    );
  },
  reconnectGoogle: async (
    event: Event,
    value: unknown,
  ): Promise<WorkspaceConnectionMutationResponse> => {
    dependencies.assertTrustedSender(event);
    const normalized = normalizeOrInvalid(
      value,
      normalizeReconnectGoogleWorkspaceConnectionIntent,
    );
    if (!normalized.ok) return invalidIntent();
    const response = await dependencies.service.reconnectGoogle(normalized.intent);
    return requireSafeMutationResponse(
      response,
      normalized.intent.source_id,
      'RECONNECT_GOOGLE',
    );
  },
  provisionSerpApi: async (
    event: Event,
    value: unknown,
  ): Promise<WorkspaceConnectionMutationResponse> => {
    dependencies.assertTrustedSender(event);
    const normalized = normalizeOrInvalid(
      value,
      normalizeProvisionSerpApiWorkspaceConnectionIntent,
    );
    if (!normalized.ok) return invalidIntent();
    const response = await dependencies.service.provisionSerpApi(
      normalized.intent,
    );
    return requireSafeMutationResponse(
      response,
      normalized.intent.source_id,
      'PROVISION_SERPAPI',
    );
  },
});
