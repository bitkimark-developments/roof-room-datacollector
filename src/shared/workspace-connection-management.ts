import type {
  GoogleAnalytics4ConnectionMetadata,
} from './google-analytics-4';
import type {
  DesktopCredentialManagedSourceId,
} from './desktop-multisource';

export const DESKTOP_GOOGLE_CONNECTION_SOURCE_IDS = [
  'google-search-console-query-page',
  'google-ads-search-terms',
  'google-keyword-planner',
  'google-analytics-4',
] as const;

export type DesktopGoogleConnectionSourceId =
  (typeof DESKTOP_GOOGLE_CONNECTION_SOURCE_IDS)[number];

export type WorkspaceConnectionMutationOutcome =
  | 'SUCCEEDED'
  | 'SUCCEEDED_WITH_CLEANUP_WARNING';

export type WorkspaceConnectionMutationAction =
  | 'MANAGE_METADATA'
  | 'DISCONNECT'
  | 'CONNECT_GOOGLE'
  | 'RECONNECT_GOOGLE'
  | 'PROVISION_SERPAPI';

export type WorkspaceConnectionMutationErrorCode =
  | 'INVALID_CONNECTION_INTENT'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_ALREADY_EXISTS'
  | 'CONNECTION_CONFIGURATION_UNAVAILABLE'
  | 'OAUTH_MANUAL_ACTION_REQUIRED'
  | 'OAUTH_ACQUISITION_FAILED'
  | 'OAUTH_TOKEN_EXCHANGE_REJECTED'
  | 'OAUTH_TOKEN_EXCHANGE_UNAVAILABLE'
  | 'OAUTH_REFRESH_TOKEN_UNAVAILABLE'
  | 'OAUTH_CLIENT_REJECTED'
  | 'OAUTH_AUTHORIZATION_GRANT_REJECTED'
  | 'SECRET_INGRESS_CANCELLED'
  | 'SECRET_INGRESS_FAILED'
  | 'SECRET_INPUT_INVALID'
  | 'CREDENTIAL_PERSISTENCE_FAILED'
  | 'CONNECTION_PERSISTENCE_FAILED'
  | 'CONNECTION_REBIND_FAILED'
  | 'DISCONNECT_CREDENTIAL_DELETE_FAILED'
  | 'DISCONNECT_COMPENSATION_FAILED';

export interface WorkspaceConnectionMutationResult {
  source_id: DesktopCredentialManagedSourceId;
  action: WorkspaceConnectionMutationAction;
  outcome: WorkspaceConnectionMutationOutcome;
}

export interface GoogleSearchConsoleConnectionMetadata {
  site_url: string;
}

export interface GoogleAdsConnectionMetadata {
  customer_id: string;
  login_customer_id?: string;
}

export type GoogleConnectionMetadataIntent =
  | {
    source_id: 'google-search-console-query-page';
    metadata: GoogleSearchConsoleConnectionMetadata;
  }
  | {
    source_id:
      | 'google-ads-search-terms'
      | 'google-keyword-planner';
    metadata: GoogleAdsConnectionMetadata;
  }
  | {
    source_id: 'google-analytics-4';
    metadata: GoogleAnalytics4ConnectionMetadata;
  };

export type ManageWorkspaceConnectionIntent = {
  workspace_id: string;
} & GoogleConnectionMetadataIntent;

export interface DisconnectWorkspaceConnectionIntent {
  workspace_id: string;
  source_id: DesktopCredentialManagedSourceId;
}

export interface ProvisionSerpApiWorkspaceConnectionIntent {
  workspace_id: string;
  source_id: 'serpapi';
}

export type ConnectGoogleWorkspaceConnectionIntent = {
  workspace_id: string;
} & GoogleConnectionMetadataIntent;

export type ReconnectGoogleWorkspaceConnectionIntent = {
  workspace_id: string;
} & (
  | {
    source_id: 'google-search-console-query-page';
    metadata?: GoogleSearchConsoleConnectionMetadata;
  }
  | {
    source_id:
      | 'google-ads-search-terms'
      | 'google-keyword-planner';
    metadata?: GoogleAdsConnectionMetadata;
  }
  | {
    source_id: 'google-analytics-4';
    metadata?: GoogleAnalytics4ConnectionMetadata;
  }
);

export interface WorkspaceConnectionMutationError {
  code: WorkspaceConnectionMutationErrorCode;
  source_id?: DesktopCredentialManagedSourceId;
  retryable: boolean;
}

export type WorkspaceConnectionMutationResponse =
  | {
    ok: true;
    result: WorkspaceConnectionMutationResult;
  }
  | {
    ok: false;
    error: WorkspaceConnectionMutationError;
  };
