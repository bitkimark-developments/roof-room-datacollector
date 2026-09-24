import type { JsonObject } from '../../../shared/run-job';
import type { DesktopGoogleConnectionSourceId } from '../../../shared/workspace-connection-management';
import type { WorkspaceSourceConnectionRecord } from '../../../shared/workspace-connection';
import type { CredentialStore } from '../../core/credential-store';
import type { StateRepository } from '../../storage/state-repository';
import {
  GoogleApiTransportError,
  type ApiRequester,
  type ApiResponse,
} from './api-helpers';
import {
  MainProcessGoogleOAuthCredentialAcquirer,
  parseGoogleCredentialBundle,
  type GoogleCredentialBundle,
  type GoogleOAuthLoopback,
} from './google-oauth-credential-acquirer';
import { readGoogleProviderConfiguration } from './google-provider-configuration';

export {
  GOOGLE_ADS_SCOPE,
  GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
  createGoogleOAuthAuthorization,
  exchangeGoogleAuthorizationCode,
  startGoogleOAuthLoopback,
} from './google-oauth-credential-acquirer';
export type {
  GoogleOAuthAuthorization,
  GoogleOAuthLoopback,
} from './google-oauth-credential-acquirer';
export const GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION =
  'I UNDERSTAND THIS WILL CALL GOOGLE';

export const assertGoogleLiveAcceptanceConfirmation = (
  confirmation: string | undefined,
): void => {
  if (confirmation !== GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION) {
    throw new Error(
      `Live Google acceptance requires explicit confirmation: ${GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION}`,
    );
  }
};

export class GoogleCredentialError extends Error {
  constructor(
    public readonly code:
      | 'MISSING_SECURE_CREDENTIAL'
      | 'INTERACTIVE_AUTHORIZATION_REQUIRED'
      | 'OAUTH_TOKEN_REFRESH_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'GoogleCredentialError';
  }
}

const parseBundle = (value: string): GoogleCredentialBundle => {
  try {
    return parseGoogleCredentialBundle(value);
  } catch {
    throw new GoogleCredentialError(
      'MISSING_SECURE_CREDENTIAL',
      'Stored Google credential is unreadable.',
    );
  }
};

const encodeTokenRequest = (
  values: Record<string, string | undefined>,
): string => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) body.set(key, value);
  }
  return body.toString();
};

export class GoogleOAuthClient {
  private cachedCredential: {
    access_token: string;
    developer_token: string | null;
    expires_at: number;
  } | null = null;

  constructor(
    private readonly store: CredentialStore,
    private readonly credentialRef: string,
    private readonly requester: ApiRequester,
    private readonly onInteractiveAuthorizationRequired?: () =>
      Promise<void> | void,
  ) {}

  private async requireInteractiveAuthorization(
    message: string,
  ): Promise<never> {
    await this.onInteractiveAuthorizationRequired?.();
    throw new GoogleCredentialError(
      'INTERACTIVE_AUTHORIZATION_REQUIRED',
      message,
    );
  }

  async getAccessToken(): Promise<{
    access_token: string;
    developer_token: string | null;
  }> {
    if (
      this.cachedCredential &&
      this.cachedCredential.expires_at - 60_000 > Date.now()
    ) {
      return this.cachedCredential;
    }

    let bundle: GoogleCredentialBundle;
    try {
      bundle = parseBundle(await this.store.readCredential(this.credentialRef));
    } catch (error) {
      if (error instanceof GoogleCredentialError) throw error;
      throw new GoogleCredentialError(
        'MISSING_SECURE_CREDENTIAL',
        'Google credential is unavailable from secure storage.',
      );
    }

    const providerConfiguration = await readGoogleProviderConfiguration(
      this.store,
    );
    const providerOAuthReady =
      providerConfiguration?.client_id !== undefined
      && providerConfiguration.client_secret !== undefined;
    const clientId = providerOAuthReady
      ? providerConfiguration.client_id
      : bundle.client_id;
    const clientSecret = providerOAuthReady
      ? providerConfiguration.client_secret
      : bundle.client_secret;
    if (clientId === undefined) {
      throw new GoogleCredentialError(
        'MISSING_SECURE_CREDENTIAL',
        'Google provider configuration is unavailable from secure storage.',
      );
    }

    let response: ApiResponse;
    try {
      response = await this.requester({
        url: 'https://oauth2.googleapis.com/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: encodeTokenRequest({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: bundle.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
    } catch (error) {
      if (
        error instanceof GoogleApiTransportError &&
        error.code === 'PROVIDER_AUTHORIZATION_FAILED'
      ) {
        return this.requireInteractiveAuthorization(
          'Google OAuth credential requires interactive authorization.',
        );
      }
      throw new GoogleCredentialError(
        'OAUTH_TOKEN_REFRESH_FAILED',
        'Google OAuth token refresh request failed.',
      );
    }

    if (response.status === 400 || response.status === 401) {
      return this.requireInteractiveAuthorization(
        'Google OAuth credential requires interactive authorization.',
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new GoogleCredentialError(
        'OAUTH_TOKEN_REFRESH_FAILED',
        `Google OAuth token refresh failed with HTTP ${response.status}.`,
      );
    }
    const body = response.body as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof body.access_token !== 'string' || !body.access_token) {
      throw new GoogleCredentialError(
        'OAUTH_TOKEN_REFRESH_FAILED',
        'Google OAuth refresh response omitted access_token.',
      );
    }
    const expiresIn = typeof body.expires_in === 'number'
      ? body.expires_in
      : 3600;
    this.cachedCredential = {
      access_token: body.access_token,
      developer_token:
        providerConfiguration?.developer_token
        ?? bundle.developer_token
        ?? null,
      expires_at: Date.now() + (Math.max(0, expiresIn) * 1000),
    };
    return this.cachedCredential;
  }
}

export const createAuthenticatedRequester = (
  oauth: GoogleOAuthClient,
  requester: ApiRequester,
  options: {
    google_ads?: boolean;
    login_customer_id?: string | null;
  } = {},
): ApiRequester => async (request): Promise<ApiResponse> => {
  const credential = await oauth.getAccessToken();
  const headers: Record<string, string> = {
    ...(request.headers ?? {}),
    Authorization: `Bearer ${credential.access_token}`,
    'Content-Type': 'application/json',
  };
  if (options.google_ads) {
    if (credential.developer_token) {
      headers['developer-token'] = credential.developer_token;
    }
    if (options.login_customer_id) {
      headers['login-customer-id'] = options.login_customer_id;
    }
  }
  return requester({ ...request, headers });
};

export interface BootstrapGoogleOAuthDependencies {
  store: CredentialStore;
  repository: Pick<
    StateRepository,
    | 'getSourceConnection'
    | 'upsertSourceConnection'
    | 'countSourceConnectionsByCredentialRef'
  >;
  requester: ApiRequester;
  openExternal: (url: string) => Promise<void>;
  startLoopback?: (expectedState: string) => Promise<GoogleOAuthLoopback>;
  recordCleanupWarning?: (event: {
    code: 'OBSOLETE_CREDENTIAL_CLEANUP_FAILED';
    workspace_id: string;
    source_id: DesktopGoogleConnectionSourceId;
  }) => void;
}

export const bootstrapGoogleOAuth = async (
  input: {
    workspace_id: string;
    source_id: DesktopGoogleConnectionSourceId;
    confirmation: string | undefined;
    client_id: string;
    client_secret?: string;
    developer_token?: string;
    scopes: string[];
    safe_metadata: JsonObject;
  },
  dependencies: BootstrapGoogleOAuthDependencies,
): Promise<WorkspaceSourceConnectionRecord> => {
  assertGoogleLiveAcceptanceConfirmation(input.confirmation);
  const previous = dependencies.repository.getSourceConnection(
    input.workspace_id,
    input.source_id,
  );
  const acquirer = new MainProcessGoogleOAuthCredentialAcquirer({
    store: dependencies.store,
    requester: dependencies.requester,
    openExternal: dependencies.openExternal,
    startLoopback: dependencies.startLoopback,
  });
  const acquired = await acquirer.acquire({
    workspace_id: input.workspace_id,
    source_id: input.source_id,
    application_configuration: {
      client_id: input.client_id,
      ...(input.client_secret === undefined
        ? {}
        : { client_secret: input.client_secret }),
      ...(input.developer_token === undefined
        ? {}
        : { developer_token: input.developer_token }),
    },
  });

  try {
    const connection = dependencies.repository.upsertSourceConnection({
      workspace_id: input.workspace_id,
      source_id: input.source_id,
      credential_ref: acquired.credential_ref,
      safe_metadata: {
        ...input.safe_metadata,
        authorization_state: 'AUTHORIZED',
      },
    });
    if (
      previous?.credential_ref &&
      previous.credential_ref !== acquired.credential_ref
    ) {
      try {
        if (
          dependencies.repository.countSourceConnectionsByCredentialRef(
            previous.credential_ref,
          ) === 0
        ) {
          await dependencies.store.deleteCredential(
            previous.credential_ref,
          );
        }
      } catch {
        dependencies.recordCleanupWarning?.({
          code: 'OBSOLETE_CREDENTIAL_CLEANUP_FAILED',
          workspace_id: input.workspace_id,
          source_id: input.source_id,
        });
      }
    }
    return connection;
  } catch (error) {
    await dependencies.store.deleteCredential(acquired.credential_ref)
      .catch((): undefined => undefined);
    throw error;
  }
};
