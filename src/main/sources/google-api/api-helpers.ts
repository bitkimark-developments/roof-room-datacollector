export interface ApiResponse { status: number; body: unknown; raw_body?: Uint8Array; }
export type ApiRequester = (request: { url: string; method: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> }) => Promise<ApiResponse>;

export type GoogleOAuthProviderErrorCode =
  | 'access_denied'
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_request'
  | 'invalid_scope'
  | 'unauthorized_client'
  | 'unsupported_grant_type';

export type GoogleOAuthProviderErrorDescriptionClass =
  | 'CODE_VERIFIER_REJECTED'
  | 'REDIRECT_URI_REJECTED'
  | 'CLIENT_REJECTED'
  | 'AUTHORIZATION_CODE_REJECTED'
  | 'MISSING_PARAMETER'
  | 'OTHER';

const googleOAuthProviderErrorCodes:
readonly GoogleOAuthProviderErrorCode[] = [
  'access_denied',
  'invalid_client',
  'invalid_grant',
  'invalid_request',
  'invalid_scope',
  'unauthorized_client',
  'unsupported_grant_type',
];

export const safeGoogleOAuthProviderErrorCode = (
  value: unknown,
): GoogleOAuthProviderErrorCode | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = (value as { error?: unknown }).error;
  return typeof candidate === 'string'
    && (googleOAuthProviderErrorCodes as readonly string[]).includes(candidate)
    ? candidate as GoogleOAuthProviderErrorCode
    : undefined;
};

export const safeGoogleOAuthProviderErrorDescriptionClass = (
  value: unknown,
): GoogleOAuthProviderErrorDescriptionClass => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'OTHER';
  }
  const candidate = (value as { error_description?: unknown })
    .error_description;
  if (typeof candidate !== 'string') return 'OTHER';
  const normalized = candidate.toLowerCase();
  if (normalized.includes('code_verifier')) return 'CODE_VERIFIER_REJECTED';
  if (normalized.includes('redirect_uri')) return 'REDIRECT_URI_REJECTED';
  if (normalized.includes('client')) return 'CLIENT_REJECTED';
  if (normalized.includes('authorization code')) {
    return 'AUTHORIZATION_CODE_REJECTED';
  }
  if (normalized.includes('missing') || normalized.includes('required')) {
    return 'MISSING_PARAMETER';
  }
  return 'OTHER';
};

export class GoogleApiTransportError extends Error {
  constructor(
    public readonly code: 'PROVIDER_AUTHORIZATION_FAILED' | 'RATE_OR_QUOTA_FAILED' | 'NETWORK_OR_PROVIDER_FAILED' | 'REQUEST_TIMEOUT',
    message: string,
    public readonly provider_code?: GoogleOAuthProviderErrorCode,
    public readonly http_status?: number,
    public readonly provider_error_description_class?:
      GoogleOAuthProviderErrorDescriptionClass,
  ) {
    super(message);
    this.name = 'GoogleApiTransportError';
  }
}

export const createFetchApiRequester = (
  fetchImplementation: typeof fetch = fetch,
  timeoutMs = 60_000,
): ApiRequester => async (request) => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  let response: Response;
  let body: unknown;
  let rawBody: Uint8Array;
  try {
    response = await fetchImplementation(request.url, {
      method: request.method,
      headers: request.headers,
      signal: abortController.signal,
      body: request.body === undefined
        ? undefined
        : typeof request.body === 'string'
          ? request.body
          : JSON.stringify(request.body),
    });
    const contentType = response.headers.get('content-type') ?? '';
    rawBody = new Uint8Array(await response.arrayBuffer());
    const textBody = new TextDecoder().decode(rawBody);
    body = contentType.includes('application/json')
      ? (() => {
          try { return JSON.parse(textBody) as unknown; } catch { return textBody; }
        })()
      : textBody;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GoogleApiTransportError(
        'REQUEST_TIMEOUT',
        'Google API request timed out.',
      );
    }
    throw new GoogleApiTransportError(
      'NETWORK_OR_PROVIDER_FAILED',
      'Google API network request failed.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
      throw new GoogleApiTransportError(
        'PROVIDER_AUTHORIZATION_FAILED',
        `Google API authorization failed with HTTP ${response.status}.`,
        safeGoogleOAuthProviderErrorCode(body),
        response.status,
        safeGoogleOAuthProviderErrorDescriptionClass(body),
      );
  }
  if (response.status === 429) {
    throw new GoogleApiTransportError(
      'RATE_OR_QUOTA_FAILED',
      'Google API rate or quota limit returned HTTP 429.',
    );
  }
  if (response.status >= 500) {
    throw new GoogleApiTransportError(
      'NETWORK_OR_PROVIDER_FAILED',
      `Google API provider failed with HTTP ${response.status}.`,
    );
  }

  return { status: response.status, body, raw_body: rawBody };
};

export const requireApiObject = (value: unknown, context: string): Record<string, unknown> => { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${context} must be an object.`); return value as Record<string, unknown>; };
export const requireNumberOrNull = (value: unknown, context: string): number | null => { if (value === null || value === undefined || value === '') return null; const n = typeof value === 'number' ? value : Number(value); if (!Number.isFinite(n)) throw new Error(`${context} must be numeric or null.`); return n; };
export const requireArray = (value: unknown, context: string): unknown[] => { if (!Array.isArray(value)) throw new Error(`${context} must be an array.`); return value; };
