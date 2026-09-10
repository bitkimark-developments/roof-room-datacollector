import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

import type { JsonObject } from '../../../shared/run-job';
import type { WorkspaceSourceConnectionRecord } from '../../../shared/workspace-connection';
import type { CredentialStore } from '../../core/credential-store';
import type { StateRepository } from '../../storage/state-repository';
import {
  GoogleApiTransportError,
  type ApiRequester,
  type ApiResponse,
} from './api-helpers';

interface GoogleCredentialBundle {
  client_id: string;
  client_secret?: string;
  refresh_token: string;
  developer_token?: string;
}

export const GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/webmasters.readonly';
export const GOOGLE_ADS_SCOPE =
  'https://www.googleapis.com/auth/adwords';
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
  let raw: Partial<GoogleCredentialBundle>;
  try {
    raw = JSON.parse(value) as Partial<GoogleCredentialBundle>;
  } catch {
    throw new GoogleCredentialError(
      'MISSING_SECURE_CREDENTIAL',
      'Stored Google credential is unreadable.',
    );
  }
  if (!raw.client_id || !raw.refresh_token) {
    throw new GoogleCredentialError(
      'MISSING_SECURE_CREDENTIAL',
      'Stored Google credential is incomplete.',
    );
  }
  return raw as GoogleCredentialBundle;
};

const base64url = (value: Uint8Array): string =>
  Buffer.from(value).toString('base64url');

const encodeTokenRequest = (
  values: Record<string, string | undefined>,
): string => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) body.set(key, value);
  }
  return body.toString();
};

export interface GoogleOAuthAuthorization {
  url: string;
  state: string;
  code_verifier: string;
}

export const createGoogleOAuthAuthorization = (input: {
  client_id: string;
  redirect_uri: string;
  scopes: string[];
  state?: string;
  code_verifier?: string;
}): GoogleOAuthAuthorization => {
  const state = input.state ?? base64url(randomBytes(24));
  const codeVerifier = input.code_verifier ?? base64url(randomBytes(48));
  const challenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: input.client_id,
    redirect_uri: input.redirect_uri,
    response_type: 'code',
    scope: input.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return { url: url.toString(), state, code_verifier: codeVerifier };
};

export const exchangeGoogleAuthorizationCode = async (
  input: {
    code: string;
    code_verifier: string;
    redirect_uri: string;
    client_id: string;
    client_secret?: string;
    credential_ref: string;
    developer_token?: string;
  },
  requester: ApiRequester,
  store: CredentialStore,
): Promise<void> => {
  const response = await requester({
    url: 'https://oauth2.googleapis.com/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeTokenRequest({
      code: input.code,
      code_verifier: input.code_verifier,
      client_id: input.client_id,
      client_secret: input.client_secret,
      redirect_uri: input.redirect_uri,
      grant_type: 'authorization_code',
    }),
  });
  if (response.status < 200 || response.status >= 300) {
    throw new GoogleCredentialError(
      'INTERACTIVE_AUTHORIZATION_REQUIRED',
      `Google OAuth code exchange failed with HTTP ${response.status}.`,
    );
  }
  const body = response.body as { refresh_token?: unknown };
  if (typeof body.refresh_token !== 'string' || !body.refresh_token) {
    throw new GoogleCredentialError(
      'INTERACTIVE_AUTHORIZATION_REQUIRED',
      'Google OAuth code exchange omitted refresh_token.',
    );
  }
  await store.writeCredential(input.credential_ref, JSON.stringify({
    client_id: input.client_id,
    client_secret: input.client_secret,
    refresh_token: body.refresh_token,
    developer_token: input.developer_token,
  }));
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

    let response: ApiResponse;
    try {
      response = await this.requester({
        url: 'https://oauth2.googleapis.com/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: encodeTokenRequest({
          client_id: bundle.client_id,
          client_secret: bundle.client_secret,
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
      developer_token: bundle.developer_token ?? null,
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

export interface GoogleOAuthLoopback {
  redirect_uri: string;
  waitForCode: () => Promise<string>;
  close: () => void;
}

export const startGoogleOAuthLoopback = async (
  expectedState: string,
  timeoutMs = 180_000,
): Promise<GoogleOAuthLoopback> => {
  let settled = false;
  let resolveCode: (code: string) => void = () => undefined;
  let rejectCode: (error: Error) => void = () => undefined;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = createServer((request, response) => {
    const parsed = new URL(request.url ?? '/', 'http://127.0.0.1');
    const code = parsed.searchParams.get('code');
    const providerError = parsed.searchParams.get('error');
    if (
      parsed.pathname !== '/oauth/callback' ||
      providerError !== null ||
      !code ||
      parsed.searchParams.get('state') !== expectedState
    ) {
      response.writeHead(400).end('Authorization failed. Return to RoofRoom.');
      if (!settled) {
        settled = true;
        rejectCode(new GoogleCredentialError(
          'INTERACTIVE_AUTHORIZATION_REQUIRED',
          'OAuth callback validation or authorization failed.',
        ));
      }
      server.close();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
    }).end('Authorization received. You may close this tab.');
    if (!settled) {
      settled = true;
      resolveCode(code);
    }
    server.close();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('OAuth loopback listener did not bind.');
  }
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectCode(new GoogleCredentialError(
        'INTERACTIVE_AUTHORIZATION_REQUIRED',
        'OAuth authorization timed out.',
      ));
    }
    server.close();
  }, timeoutMs);
  return {
    redirect_uri: `http://127.0.0.1:${address.port}/oauth/callback`,
    waitForCode: async () => {
      try {
        return await codePromise;
      } finally {
        clearTimeout(timer);
        server.close();
      }
    },
    close: () => {
      clearTimeout(timer);
      server.close();
    },
  };
};

export interface BootstrapGoogleOAuthDependencies {
  store: CredentialStore;
  repository: Pick<
    StateRepository,
    'getSourceConnection' | 'upsertSourceConnection'
  >;
  requester: ApiRequester;
  openExternal: (url: string) => Promise<void>;
  startLoopback?: (expectedState: string) => Promise<GoogleOAuthLoopback>;
}

export const bootstrapGoogleOAuth = async (
  input: {
    workspace_id: string;
    source_id: string;
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
  const state = base64url(randomBytes(24));
  const codeVerifier = base64url(randomBytes(48));
  const loopback = await (
    dependencies.startLoopback ?? startGoogleOAuthLoopback
  )(state);
  const authorization = createGoogleOAuthAuthorization({
    client_id: input.client_id,
    redirect_uri: loopback.redirect_uri,
    scopes: input.scopes,
    state,
    code_verifier: codeVerifier,
  });

  let code: string;
  try {
    await dependencies.openExternal(authorization.url);
    code = await loopback.waitForCode();
  } finally {
    loopback.close();
  }
  const credentialRef = `google-oauth:${base64url(randomBytes(24))}`;
  const previous = dependencies.repository.getSourceConnection(
    input.workspace_id,
    input.source_id,
  );

  await exchangeGoogleAuthorizationCode({
    code,
    code_verifier: authorization.code_verifier,
    redirect_uri: loopback.redirect_uri,
    client_id: input.client_id,
    client_secret: input.client_secret,
    credential_ref: credentialRef,
    developer_token: input.developer_token,
  }, dependencies.requester, dependencies.store);

  try {
    const connection = dependencies.repository.upsertSourceConnection({
      workspace_id: input.workspace_id,
      source_id: input.source_id,
      credential_ref: credentialRef,
      safe_metadata: {
        ...input.safe_metadata,
        authorization_state: 'AUTHORIZED',
      },
    });
    if (
      previous?.credential_ref &&
      previous.credential_ref !== credentialRef
    ) {
      await dependencies.store.deleteCredential(previous.credential_ref)
        .catch((): undefined => undefined);
    }
    return connection;
  } catch (error) {
    await dependencies.store.deleteCredential(credentialRef)
      .catch((): undefined => undefined);
    throw error;
  }
};
