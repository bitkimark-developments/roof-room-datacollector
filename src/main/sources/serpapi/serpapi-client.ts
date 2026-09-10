import {
  SERPAPI_TIMEOUT_MS,
  type SerpApiRequestContext,
} from '../../../shared/serpapi';
import type { CredentialStore } from '../../core/credential-store';
import {
  createFetchApiRequester,
  GoogleApiTransportError,
  type ApiRequester,
  type ApiResponse,
} from '../google-api/api-helpers';

export { SERPAPI_TIMEOUT_MS } from '../../../shared/serpapi';

export type SerpApiErrorCode =
  | 'CONNECTION_REQUIRED'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'REQUEST_TIMEOUT';

export class SerpApiError extends Error {
  constructor(
    public readonly code: SerpApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SerpApiError';
  }
}

const classifyRateOrQuota = (
  body: unknown,
): 'RATE_LIMITED' | 'QUOTA_EXCEEDED' => {
  const message = isRecord(body) && typeof body.error === 'string'
    ? body.error
    : '';
  return /rate|throughput|hourly/iu.test(message)
    ? 'RATE_LIMITED'
    : 'QUOTA_EXCEEDED';
};

const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class SerpApiClient {
  private readonly requester: ApiRequester;

  constructor(
    private readonly credentialStore: CredentialStore,
    private readonly credentialRef: string,
    requester?: ApiRequester,
  ) {
    this.requester = requester ?? createFetchApiRequester(
      fetch,
      SERPAPI_TIMEOUT_MS,
    );
  }

  async hasCredential(): Promise<boolean> {
    return this.credentialStore.hasCredential(this.credentialRef);
  }

  async search(context: SerpApiRequestContext): Promise<{
    raw: unknown;
    raw_bytes?: Uint8Array;
  }> {
    let apiKey: string;
    try {
      apiKey = await this.credentialStore.readCredential(this.credentialRef);
    } catch {
      throw new SerpApiError(
        'CONNECTION_REQUIRED',
        'SerpApi API key is unavailable from secure storage.',
      );
    }
    if (!apiKey) {
      throw new SerpApiError(
        'CONNECTION_REQUIRED',
        'SerpApi API key is unavailable from secure storage.',
      );
    }

    const query = new URLSearchParams({
      engine: context.engine,
      q: context.query,
      gl: 'tr',
      hl: 'tr',
      device: 'desktop',
      start: '0',
      output: 'json',
      api_key: apiKey,
    });

    let response: ApiResponse;
    try {
      response = await this.requester({
        url: `https://serpapi.com/search?${query.toString()}`,
        method: 'GET',
      });
    } catch (error) {
      if (error instanceof GoogleApiTransportError) {
        if (error.code === 'REQUEST_TIMEOUT') {
          throw new SerpApiError(
            'REQUEST_TIMEOUT',
            'SerpApi request timed out after the bounded source timeout.',
          );
        }
        if (error.code === 'RATE_OR_QUOTA_FAILED') {
          throw new SerpApiError(
            'QUOTA_EXCEEDED',
            'SerpApi quota or rate limit stopped the request.',
          );
        }
        if (error.code === 'PROVIDER_AUTHORIZATION_FAILED') {
          throw new SerpApiError(
            'AUTHENTICATION_FAILED',
            'SerpApi authentication failed.',
          );
        }
        throw new SerpApiError(
          'NETWORK_ERROR',
          'SerpApi network request failed.',
        );
      }
      throw new SerpApiError(
        'NETWORK_ERROR',
        'SerpApi network request failed.',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new SerpApiError(
        'AUTHENTICATION_FAILED',
        'SerpApi authentication failed.',
      );
    }
    if (response.status === 429) {
      throw new SerpApiError(
        classifyRateOrQuota(response.body),
        'SerpApi quota or rate limit stopped the request.',
      );
    }
    if (response.status >= 500) {
      throw new SerpApiError(
        'PROVIDER_ERROR',
        `SerpApi provider failed with HTTP ${response.status}.`,
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new SerpApiError(
        'PROVIDER_ERROR',
        `SerpApi request failed with HTTP ${response.status}.`,
      );
    }
    if (isRecord(response.body)) {
      if (typeof response.body.error === 'string') {
        throw new SerpApiError('PROVIDER_ERROR', 'SerpApi returned an error response.');
      }
      const metadata = response.body.search_metadata;
      if (
        isRecord(metadata) &&
        metadata.status !== undefined &&
        metadata.status !== 'Success'
      ) {
        throw new SerpApiError('PROVIDER_ERROR', 'SerpApi returned a non-success response.');
      }
    }
    return {
      raw: response.body,
      raw_bytes: 'raw_body' in response ? response.raw_body : undefined,
    };
  }
}
