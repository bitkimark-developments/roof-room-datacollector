export const GOOGLE_TRENDS_RATE_LIMIT_ERROR_CODE =
  'RATE_LIMITED' as const;

export const GOOGLE_TRENDS_PROVIDER_STATES = [
  'NO_RATE_LIMIT_SIGNAL',
  'RATE_LIMITED',
] as const;

export type GoogleTrendsProviderState =
  (typeof GOOGLE_TRENDS_PROVIDER_STATES)[number];

export type GoogleTrendsRateLimitSignal =
  | 'HTTP_STATUS_429'
  | 'PAGE_TITLE_429'
  | 'PAGE_TEXT_TOO_MANY_REQUESTS';

export interface GoogleTrendsProviderSnapshot {
  url: string;
  response_status: number | null;
  response_headers:
    | Record<string, string | undefined>
    | null;
  page_title: string | null;
  page_text: string | null;
}

export interface GoogleTrendsProviderStateDecision {
  provider_state: GoogleTrendsProviderState;
  error_code:
    | typeof GOOGLE_TRENDS_RATE_LIMIT_ERROR_CODE
    | null;
  retry_after: string | null;
  signals: GoogleTrendsRateLimitSignal[];
}

const TITLE_429_PATTERN =
  /\b429\b|too many requests/i;

const PAGE_TEXT_RATE_LIMIT_PATTERNS = [
  /\b429\b/,
  /too many requests/i,
  /sent too many requests/i,
  /please try again later/i,
] as const;

const getHeader = (
  headers:
    | Record<string, string | undefined>
    | null,
  targetName: string,
): string | null => {
  if (!headers) {
    return null;
  }

  const normalizedTarget =
    targetName.toLowerCase();

  for (const [
    name,
    value,
  ] of Object.entries(headers)) {
    if (
      name.toLowerCase() ===
        normalizedTarget &&
      typeof value === 'string' &&
      value.trim().length > 0
    ) {
      return value.trim();
    }
  }

  return null;
};

const hasRateLimitText = (
  pageText: string | null,
): boolean => {
  if (!pageText) {
    return false;
  }

  return PAGE_TEXT_RATE_LIMIT_PATTERNS.every(
    (pattern) =>
      pattern.test(pageText),
  );
};

export const detectGoogleTrendsProviderState = (
  snapshot: GoogleTrendsProviderSnapshot,
): GoogleTrendsProviderStateDecision => {
  const signals:
    GoogleTrendsRateLimitSignal[] = [];

  if (
    snapshot.response_status === 429
  ) {
    signals.push(
      'HTTP_STATUS_429',
    );
  }

  if (
    snapshot.page_title !== null &&
    TITLE_429_PATTERN.test(
      snapshot.page_title,
    )
  ) {
    signals.push(
      'PAGE_TITLE_429',
    );
  }

  if (
    hasRateLimitText(
      snapshot.page_text,
    )
  ) {
    signals.push(
      'PAGE_TEXT_TOO_MANY_REQUESTS',
    );
  }

  if (signals.length === 0) {
    return {
      provider_state:
        'NO_RATE_LIMIT_SIGNAL',
      error_code: null,
      retry_after: null,
      signals: [],
    };
  }

  return {
    provider_state: 'RATE_LIMITED',
    error_code:
      GOOGLE_TRENDS_RATE_LIMIT_ERROR_CODE,
    retry_after: getHeader(
      snapshot.response_headers,
      'retry-after',
    ),
    signals,
  };
};
