import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

import type {
  DesktopGoogleConnectionSourceId,
} from '../../../shared/workspace-connection-management';
import type { CredentialStore } from '../../core/credential-store';
import type {
  ApiRequester,
} from './api-helpers';

export const GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/webmasters.readonly';
export const GOOGLE_ADS_SCOPE =
  'https://www.googleapis.com/auth/adwords';

export interface GoogleOAuthApplicationConfiguration {
  client_id: string;
  client_secret?: string;
  developer_token?: string;
}

export interface GoogleOAuthAcquisitionInput {
  workspace_id: string;
  source_id: DesktopGoogleConnectionSourceId;
  application_configuration: GoogleOAuthApplicationConfiguration;
}

export interface AcquiredGoogleCredential {
  credential_ref: string;
  granted_scopes: readonly string[];
}

export interface GoogleOAuthCredentialAcquirer {
  acquire(
    input: GoogleOAuthAcquisitionInput,
  ): Promise<AcquiredGoogleCredential>;
  readApplicationConfiguration(
    existing_credential_ref?: string,
  ): Promise<GoogleOAuthApplicationConfiguration | null>;
  isCompatible(
    credential_ref: string,
    required_scopes: readonly string[],
  ): Promise<boolean>;
}

export interface GoogleCredentialBundle {
  client_id: string;
  client_secret?: string;
  refresh_token: string;
  developer_token?: string;
  granted_scopes?: string[];
}

export interface GoogleOAuthAuthorization {
  url: string;
  state: string;
  code_verifier: string;
}

export interface GoogleOAuthLoopback {
  redirect_uri: string;
  waitForCode: () => Promise<string>;
  close: () => void;
}

export class GoogleOAuthAcquisitionError extends Error {
  constructor(
    public readonly code:
      | 'CONNECTION_CONFIGURATION_UNAVAILABLE'
      | 'OAUTH_MANUAL_ACTION_REQUIRED'
      | 'OAUTH_ACQUISITION_FAILED'
      | 'CREDENTIAL_PERSISTENCE_FAILED',
  ) {
    super('Google OAuth credential acquisition failed.');
    this.name = 'GoogleOAuthAcquisitionError';
  }
}

export const parseGoogleCredentialBundle = (
  value: string,
): GoogleCredentialBundle => {
  const raw = JSON.parse(value) as Partial<GoogleCredentialBundle>;
  if (
    typeof raw.client_id !== 'string'
    || raw.client_id.length === 0
    || typeof raw.refresh_token !== 'string'
    || raw.refresh_token.length === 0
    || (
      raw.granted_scopes !== undefined
      && (
        !Array.isArray(raw.granted_scopes)
        || !raw.granted_scopes.every(
          (scope) => typeof scope === 'string' && scope.length > 0,
        )
      )
    )
  ) {
    throw new Error('Stored Google credential bundle is invalid.');
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

const normalizeApplicationConfiguration = (
  value: unknown,
): GoogleOAuthApplicationConfiguration | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.client_id !== 'string' || raw.client_id.trim().length === 0) {
    return null;
  }
  const normalized: GoogleOAuthApplicationConfiguration = {
    client_id: raw.client_id.trim(),
  };
  for (const key of ['client_secret', 'developer_token'] as const) {
    const candidate = raw[key];
    if (candidate === undefined) continue;
    if (typeof candidate !== 'string' || candidate.length === 0) return null;
    normalized[key] = candidate;
  }
  return normalized;
};

const requiredScopesForSource = (
  sourceId: DesktopGoogleConnectionSourceId,
): readonly string[] => (
  sourceId === 'google-search-console-query-page'
    ? [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE]
    : [GOOGLE_ADS_SCOPE]
);

export const createGoogleOAuthAuthorization = (input: {
  client_id: string;
  redirect_uri: string;
  scopes: readonly string[];
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
  return {
    url: url.toString(),
    state,
    code_verifier: codeVerifier,
  };
};

const requestGoogleRefreshToken = async (
  input: {
    code: string;
    code_verifier: string;
    redirect_uri: string;
    client_id: string;
    client_secret?: string;
  },
  requester: ApiRequester,
): Promise<string> => {
  let response;
  try {
    response = await requester({
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
  } catch {
    throw new GoogleOAuthAcquisitionError('OAUTH_ACQUISITION_FAILED');
  }
  if (response.status < 200 || response.status >= 300) {
    throw new GoogleOAuthAcquisitionError(
      'OAUTH_MANUAL_ACTION_REQUIRED',
    );
  }
  const body = response.body as { refresh_token?: unknown };
  if (
    typeof body.refresh_token !== 'string'
    || body.refresh_token.length === 0
  ) {
    throw new GoogleOAuthAcquisitionError(
      'OAUTH_MANUAL_ACTION_REQUIRED',
    );
  }
  return body.refresh_token;
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
    granted_scopes?: readonly string[];
  },
  requester: ApiRequester,
  store: CredentialStore,
): Promise<void> => {
  const refreshToken = await requestGoogleRefreshToken(input, requester);
  await store.writeCredential(input.credential_ref, JSON.stringify({
    client_id: input.client_id,
    client_secret: input.client_secret,
    refresh_token: refreshToken,
    developer_token: input.developer_token,
    granted_scopes: input.granted_scopes === undefined
      ? undefined
      : [...input.granted_scopes],
  }));
};

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
      parsed.pathname !== '/oauth/callback'
      || providerError !== null
      || !code
      || parsed.searchParams.get('state') !== expectedState
    ) {
      response.writeHead(400).end(
        'Authorization failed. Return to RoofRoom.',
      );
      if (!settled) {
        settled = true;
        rejectCode(new GoogleOAuthAcquisitionError(
          'OAUTH_MANUAL_ACTION_REQUIRED',
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
    throw new GoogleOAuthAcquisitionError('OAUTH_ACQUISITION_FAILED');
  }
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectCode(new GoogleOAuthAcquisitionError(
        'OAUTH_MANUAL_ACTION_REQUIRED',
      ));
    }
    server.close();
  }, timeoutMs);
  return {
    redirect_uri:
      `http://127.0.0.1:${address.port}/oauth/callback`,
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

export interface MainProcessGoogleOAuthCredentialAcquirerDependencies {
  store: CredentialStore;
  requester: ApiRequester;
  openExternal: (url: string) => Promise<void>;
  startLoopback?: (
    expectedState: string,
  ) => Promise<GoogleOAuthLoopback>;
  application_configuration_provider?: () =>
    Promise<GoogleOAuthApplicationConfiguration | null>;
  credential_ref_factory?: () => string;
}

export class MainProcessGoogleOAuthCredentialAcquirer
implements GoogleOAuthCredentialAcquirer {
  constructor(
    private readonly dependencies:
      MainProcessGoogleOAuthCredentialAcquirerDependencies,
  ) {}

  async acquire(
    input: GoogleOAuthAcquisitionInput,
  ): Promise<AcquiredGoogleCredential> {
    const configuration = normalizeApplicationConfiguration(
      input.application_configuration,
    );
    if (!configuration) {
      throw new GoogleOAuthAcquisitionError(
        'CONNECTION_CONFIGURATION_UNAVAILABLE',
      );
    }
    const scopes = requiredScopesForSource(input.source_id);
    const state = base64url(randomBytes(24));
    const codeVerifier = base64url(randomBytes(48));
    let loopback: GoogleOAuthLoopback;
    try {
      loopback = await (
        this.dependencies.startLoopback ?? startGoogleOAuthLoopback
      )(state);
    } catch (error) {
      if (error instanceof GoogleOAuthAcquisitionError) throw error;
      throw new GoogleOAuthAcquisitionError('OAUTH_ACQUISITION_FAILED');
    }
    const authorization = createGoogleOAuthAuthorization({
      client_id: configuration.client_id,
      redirect_uri: loopback.redirect_uri,
      scopes,
      state,
      code_verifier: codeVerifier,
    });

    let code: string;
    try {
      await this.dependencies.openExternal(authorization.url);
      code = await loopback.waitForCode();
    } catch (error) {
      if (error instanceof GoogleOAuthAcquisitionError) throw error;
      throw new GoogleOAuthAcquisitionError(
        'OAUTH_MANUAL_ACTION_REQUIRED',
      );
    } finally {
      loopback.close();
    }

    const refreshToken = await requestGoogleRefreshToken({
      code,
      code_verifier: authorization.code_verifier,
      redirect_uri: loopback.redirect_uri,
      client_id: configuration.client_id,
      client_secret: configuration.client_secret,
    }, this.dependencies.requester);
    const credentialRef = (
      this.dependencies.credential_ref_factory
      ?? (() => `google-oauth:${base64url(randomBytes(24))}`)
    )();
    try {
      await this.dependencies.store.writeCredential(
        credentialRef,
        JSON.stringify({
          client_id: configuration.client_id,
          client_secret: configuration.client_secret,
          refresh_token: refreshToken,
          developer_token: configuration.developer_token,
          granted_scopes: [...scopes],
        } satisfies GoogleCredentialBundle),
      );
    } catch {
      throw new GoogleOAuthAcquisitionError(
        'CREDENTIAL_PERSISTENCE_FAILED',
      );
    }
    return {
      credential_ref: credentialRef,
      granted_scopes: [...scopes],
    };
  }

  async readApplicationConfiguration(
    existingCredentialRef?: string,
  ): Promise<GoogleOAuthApplicationConfiguration | null> {
    if (existingCredentialRef !== undefined) {
      try {
        const bundle = parseGoogleCredentialBundle(
          await this.dependencies.store.readCredential(
            existingCredentialRef,
          ),
        );
        return {
          client_id: bundle.client_id,
          ...(bundle.client_secret === undefined
            ? {}
            : { client_secret: bundle.client_secret }),
          ...(bundle.developer_token === undefined
            ? {}
            : { developer_token: bundle.developer_token }),
        };
      } catch {
        // Fall through to the main-owned provider.
      }
    }
    const provided = await (
      this.dependencies.application_configuration_provider
      ?? (async () => null)
    )();
    return normalizeApplicationConfiguration(provided);
  }

  async isCompatible(
    credentialRef: string,
    requiredScopes: readonly string[],
  ): Promise<boolean> {
    try {
      const bundle = parseGoogleCredentialBundle(
        await this.dependencies.store.readCredential(credentialRef),
      );
      return (
        bundle.granted_scopes !== undefined
        && requiredScopes.every(
          (scope) => bundle.granted_scopes?.includes(scope) === true,
        )
      );
    } catch {
      return false;
    }
  }
}
