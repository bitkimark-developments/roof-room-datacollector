import {
  DESKTOP_CREDENTIAL_MANAGED_SOURCE_IDS,
  type DesktopCredentialManagedSourceId,
} from '../../shared/desktop-multisource';
import {
  DESKTOP_GOOGLE_CONNECTION_SOURCE_IDS,
  type ConnectGoogleWorkspaceConnectionIntent,
  type DesktopGoogleConnectionSourceId,
  type DisconnectWorkspaceConnectionIntent,
  type GoogleAdsConnectionMetadata,
  type GoogleConnectionMetadataIntent,
  type GoogleSearchConsoleConnectionMetadata,
  type ManageWorkspaceConnectionIntent,
  type ReconnectGoogleWorkspaceConnectionIntent,
} from '../../shared/workspace-connection-management';

type UnknownRecord = Record<string, unknown>;

export class WorkspaceConnectionIntentValidationError extends Error {
  readonly code = 'INVALID_CONNECTION_INTENT' as const;

  constructor() {
    super('Workspace connection intent is invalid.');
    this.name = 'WorkspaceConnectionIntentValidationError';
  }
}

const invalidIntent = (): never => {
  throw new WorkspaceConnectionIntentValidationError();
};

const requirePlainRecord = (value: unknown): UnknownRecord => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    return invalidIntent();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalidIntent();
  }
  return value as UnknownRecord;
};

const requireExactKeys = (
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): void => {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (
    !required.every((key) => Object.hasOwn(value, key))
    || keys.some((key) => !allowed.has(key))
  ) {
    invalidIntent();
  }
};

const requireTrimmedString = (value: unknown): string => {
  if (typeof value !== 'string') return invalidIntent();
  const normalized = value.trim();
  if (normalized.length === 0) return invalidIntent();
  return normalized;
};

const isGoogleSourceId = (
  value: unknown,
): value is DesktopGoogleConnectionSourceId => (
  typeof value === 'string'
  && (DESKTOP_GOOGLE_CONNECTION_SOURCE_IDS as readonly string[]).includes(value)
);

const isCredentialManagedSourceId = (
  value: unknown,
): value is DesktopCredentialManagedSourceId => (
  typeof value === 'string'
  && (DESKTOP_CREDENTIAL_MANAGED_SOURCE_IDS as readonly string[]).includes(value)
);

const normalizeGoogleMetadata = (
  sourceId: DesktopGoogleConnectionSourceId,
  value: unknown,
): GoogleConnectionMetadataIntent['metadata'] => {
  const metadata = requirePlainRecord(value);
  if (sourceId === 'google-search-console-query-page') {
    requireExactKeys(metadata, ['site_url']);
    const normalized: GoogleSearchConsoleConnectionMetadata = {
      site_url: requireTrimmedString(metadata.site_url),
    };
    return normalized;
  }

  requireExactKeys(metadata, ['customer_id'], ['login_customer_id']);
  const normalized: GoogleAdsConnectionMetadata = {
    customer_id: requireTrimmedString(metadata.customer_id),
  };
  if (Object.hasOwn(metadata, 'login_customer_id')) {
    if (typeof metadata.login_customer_id !== 'string') return invalidIntent();
    const loginCustomerId = metadata.login_customer_id.trim();
    if (loginCustomerId.length > 0) {
      normalized.login_customer_id = loginCustomerId;
    }
  }
  return normalized;
};

const normalizeRequiredGoogleIntent = (
  value: unknown,
): {
  workspace_id: string;
} & GoogleConnectionMetadataIntent => {
  const intent = requirePlainRecord(value);
  requireExactKeys(intent, ['workspace_id', 'source_id', 'metadata']);
  if (!isGoogleSourceId(intent.source_id)) return invalidIntent();
  const workspaceId = requireTrimmedString(intent.workspace_id);
  const metadata = normalizeGoogleMetadata(intent.source_id, intent.metadata);
  if (intent.source_id === 'google-search-console-query-page') {
    return {
      workspace_id: workspaceId,
      source_id: intent.source_id,
      metadata: metadata as GoogleSearchConsoleConnectionMetadata,
    };
  }
  return {
    workspace_id: workspaceId,
    source_id: intent.source_id,
    metadata: metadata as GoogleAdsConnectionMetadata,
  };
};

export const normalizeManageWorkspaceConnectionIntent = (
  value: unknown,
): ManageWorkspaceConnectionIntent => normalizeRequiredGoogleIntent(value);

export const normalizeConnectGoogleWorkspaceConnectionIntent = (
  value: unknown,
): ConnectGoogleWorkspaceConnectionIntent => normalizeRequiredGoogleIntent(value);

export const normalizeReconnectGoogleWorkspaceConnectionIntent = (
  value: unknown,
): ReconnectGoogleWorkspaceConnectionIntent => {
  const intent = requirePlainRecord(value);
  requireExactKeys(intent, ['workspace_id', 'source_id'], ['metadata']);
  if (!isGoogleSourceId(intent.source_id)) return invalidIntent();
  const workspaceId = requireTrimmedString(intent.workspace_id);
  if (!Object.hasOwn(intent, 'metadata')) {
    return {
      workspace_id: workspaceId,
      source_id: intent.source_id,
    };
  }
  const metadata = normalizeGoogleMetadata(intent.source_id, intent.metadata);
  if (intent.source_id === 'google-search-console-query-page') {
    return {
      workspace_id: workspaceId,
      source_id: intent.source_id,
      metadata: metadata as GoogleSearchConsoleConnectionMetadata,
    };
  }
  return {
    workspace_id: workspaceId,
    source_id: intent.source_id,
    metadata: metadata as GoogleAdsConnectionMetadata,
  };
};

export const normalizeDisconnectWorkspaceConnectionIntent = (
  value: unknown,
): DisconnectWorkspaceConnectionIntent => {
  const intent = requirePlainRecord(value);
  requireExactKeys(intent, ['workspace_id', 'source_id']);
  if (!isCredentialManagedSourceId(intent.source_id)) return invalidIntent();
  return {
    workspace_id: requireTrimmedString(intent.workspace_id),
    source_id: intent.source_id,
  };
};
