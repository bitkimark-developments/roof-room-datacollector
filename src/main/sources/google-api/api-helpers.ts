export interface ApiResponse { status: number; body: unknown; raw_body?: Uint8Array; }
export type ApiRequester = (request: { url: string; method: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> }) => Promise<ApiResponse>;

export class GoogleApiTransportError extends Error {
  constructor(
    public readonly code: 'PROVIDER_AUTHORIZATION_FAILED' | 'RATE_OR_QUOTA_FAILED' | 'NETWORK_OR_PROVIDER_FAILED' | 'REQUEST_TIMEOUT',
    message: string,
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
