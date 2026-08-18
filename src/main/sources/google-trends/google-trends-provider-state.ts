export const GOOGLE_TRENDS_RATE_LIMIT_ERROR_CODE =
  'RATE_LIMITED' as const;

export const GOOGLE_TRENDS_MANUAL_ACTION_ERROR_CODE =
  'MANUAL_ACTION_REQUIRED' as const;

export const GOOGLE_TRENDS_PROVIDER_STATES = [
  'NO_RATE_LIMIT_SIGNAL',
  'RATE_LIMITED',
  'MANUAL_ACTION_REQUIRED',
] as const;

export type GoogleTrendsProviderState =
  (typeof GOOGLE_TRENDS_PROVIDER_STATES)[number];

export type GoogleTrendsRateLimitSignal =
  | 'HTTP_STATUS_429'
  | 'PAGE_TITLE_429'
  | 'PAGE_TEXT_TOO_MANY_REQUESTS';

export type GoogleTrendsManualActionSignal =
  | 'AUTH_URL_ACCOUNTS_GOOGLE'
  | 'PAGE_TITLE_SECURITY_CHALLENGE'
  | 'PAGE_TEXT_SECURITY_CHALLENGE';

export type GoogleTrendsProviderSignal =
  | GoogleTrendsRateLimitSignal
  | GoogleTrendsManualActionSignal;

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
    | typeof GOOGLE_TRENDS_MANUAL_ACTION_ERROR_CODE
    | null;
  retry_after: string | null;
  signals: GoogleTrendsProviderSignal[];
}

const TITLE_429_PATTERN =
  /\b429\b|too many requests/i;

const PAGE_TEXT_RATE_LIMIT_PATTERNS = [
  /\b429\b/,
  /too many requests/i,
  /sent too many requests/i,
  /please try again later/i,
] as const;

const SECURITY_CHALLENGE_TITLE_PATTERNS = [
  /verify it'?s you/i,
  /2-step verification/i,
  /security check/i,
] as const;

const SECURITY_CHALLENGE_TEXT_PATTERNS = [
  /verify it'?s you/i,
  /confirm it'?s you/i,
  /2-step verification/i,
  /complete the captcha/i,
  /i'?m not a robot/i,
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

const isAccountsGoogleUrl = (
  url: string,
): boolean => {
  try {
    const parsed =
      new URL(
        url,
      );

    return (
      parsed.protocol ===
        'https:' &&
      parsed.hostname ===
        'accounts.google.com'
    );
  } catch {
    return false;
  }
};

const matchesAny = (
  text: string | null,
  patterns:
    readonly RegExp[],
): boolean => {
  if (text === null) {
    return false;
  }

  return patterns.some(
    (pattern) =>
      pattern.test(text),
  );
};

export const detectGoogleTrendsProviderState = (
  snapshot: GoogleTrendsProviderSnapshot,
): GoogleTrendsProviderStateDecision => {
  const rateLimitSignals:
    GoogleTrendsRateLimitSignal[] = [];

  if (
    snapshot.response_status ===
    429
  ) {
    rateLimitSignals.push(
      'HTTP_STATUS_429',
    );
  }

  if (
    snapshot.page_title !== null &&
    TITLE_429_PATTERN.test(
      snapshot.page_title,
    )
  ) {
    rateLimitSignals.push(
      'PAGE_TITLE_429',
    );
  }

  if (
    hasRateLimitText(
      snapshot.page_text,
    )
  ) {
    rateLimitSignals.push(
      'PAGE_TEXT_TOO_MANY_REQUESTS',
    );
  }

  // Rate limiting has priority because collection must stop immediately
  // and must never retry/refresh around a provider rate-limit boundary.
  if (
    rateLimitSignals.length >
    0
  ) {
    return {
      provider_state:
        'RATE_LIMITED',
      error_code:
        GOOGLE_TRENDS_RATE_LIMIT_ERROR_CODE,
      retry_after:
        getHeader(
          snapshot.response_headers,
          'retry-after',
        ),
      signals:
        rateLimitSignals,
    };
  }

  const manualSignals:
    GoogleTrendsManualActionSignal[] = [];

  if (
    isAccountsGoogleUrl(
      snapshot.url,
    )
  ) {
    manualSignals.push(
      'AUTH_URL_ACCOUNTS_GOOGLE',
    );
  }

  if (
    matchesAny(
      snapshot.page_title,
      SECURITY_CHALLENGE_TITLE_PATTERNS,
    )
  ) {
    manualSignals.push(
      'PAGE_TITLE_SECURITY_CHALLENGE',
    );
  }

  if (
    matchesAny(
      snapshot.page_text,
      SECURITY_CHALLENGE_TEXT_PATTERNS,
    )
  ) {
    manualSignals.push(
      'PAGE_TEXT_SECURITY_CHALLENGE',
    );
  }

  if (
    manualSignals.length >
    0
  ) {
    return {
      provider_state:
        'MANUAL_ACTION_REQUIRED',
      error_code:
        GOOGLE_TRENDS_MANUAL_ACTION_ERROR_CODE,
      retry_after:
        null,
      signals:
        manualSignals,
    };
  }

  return {
    provider_state:
      'NO_RATE_LIMIT_SIGNAL',
    error_code:
      null,
    retry_after:
      null,
    signals: [],
  };
};
