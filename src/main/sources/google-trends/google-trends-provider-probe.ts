import type {
  Locator,
  Page,
  Response,
} from 'playwright';

import {
  detectGoogleTrendsProviderState,
  type GoogleTrendsProviderStateDecision,
} from './google-trends-provider-state';

export const GOOGLE_TRENDS_EXPLORE_URL =
  'https://trends.google.com/trends/explore';

const DEFAULT_NAVIGATION_TIMEOUT_MS =
  30_000;

const DEFAULT_PAGE_SIGNAL_TIMEOUT_MS =
  5_000;

const MAX_PAGE_SIGNAL_TEXT_LENGTH =
  20_000;

export interface GoogleTrendsProbeResponse {
  status(): number;

  headerValue(
    name: string,
  ): Promise<string | null>;
}

export interface GoogleTrendsProbeLocator {
  innerText(
    options?: {
      timeout?: number;
    },
  ): Promise<string>;
}

export interface GoogleTrendsProbePage {
  goto(
    url: string,
    options: {
      waitUntil: 'domcontentloaded';
      timeout: number;
    },
  ): Promise<
    GoogleTrendsProbeResponse | null
  >;

  title(): Promise<string>;

  /**
   * Optional for deterministic test doubles and managed-page adapters.
   * Real Playwright pages expose this synchronously.
   */
  url?(): string;

  locator(
    selector: 'body',
  ): GoogleTrendsProbeLocator;
}

export interface GoogleTrendsProviderProbeOptions {
  navigation_timeout_ms?: number;
  page_signal_timeout_ms?: number;
}

export interface GoogleTrendsProviderProbeResult
  extends GoogleTrendsProviderStateDecision {
  requested_url: string;
  final_url: string;
  response_status: number | null;
}

const requirePositiveTimeout = (
  value: number | undefined,
  fallback: number,
  fieldName: string,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${fieldName} must be a positive integer.`,
    );
  }

  return value;
};

const readPageTitleSafely = async (
  page: GoogleTrendsProbePage,
): Promise<string | null> => {
  try {
    const title =
      await page.title();

    const trimmed = title.trim();

    return trimmed.length > 0
      ? trimmed
      : null;
  } catch {
    return null;
  }
};

const readPageTextSafely = async (
  page: GoogleTrendsProbePage,
  timeout: number,
): Promise<string | null> => {
  try {
    const text =
      await page
        .locator('body')
        .innerText({
          timeout,
        });

    if (text.length === 0) {
      return null;
    }

    return text.slice(
      0,
      MAX_PAGE_SIGNAL_TEXT_LENGTH,
    );
  } catch {
    return null;
  }
};

const readPageUrlSafely = (
  page: GoogleTrendsProbePage,
): string => {
  try {
    const currentUrl =
      page.url?.();

    if (
      typeof currentUrl ===
        'string' &&
      currentUrl.trim().length >
        0
    ) {
      return currentUrl.trim();
    }
  } catch {
    // Fall through to the requested Explore URL.
  }

  return GOOGLE_TRENDS_EXPLORE_URL;
};

const readRetryAfterSafely = async (
  response:
    | GoogleTrendsProbeResponse
    | null,
): Promise<string | null> => {
  if (response === null) {
    return null;
  }

  try {
    const value =
      await response.headerValue(
        'retry-after',
      );

    if (
      value === null ||
      value.trim().length === 0
    ) {
      return null;
    }

    return value.trim();
  } catch {
    return null;
  }
};

export const probeGoogleTrendsExplore = async (
  page: GoogleTrendsProbePage,
  options:
    GoogleTrendsProviderProbeOptions = {},
): Promise<GoogleTrendsProviderProbeResult> => {
  const navigationTimeout =
    requirePositiveTimeout(
      options.navigation_timeout_ms,
      DEFAULT_NAVIGATION_TIMEOUT_MS,
      'navigation_timeout_ms',
    );

  const pageSignalTimeout =
    requirePositiveTimeout(
      options.page_signal_timeout_ms,
      DEFAULT_PAGE_SIGNAL_TIMEOUT_MS,
      'page_signal_timeout_ms',
    );

  const response =
    await page.goto(
      GOOGLE_TRENDS_EXPLORE_URL,
      {
        waitUntil:
          'domcontentloaded',
        timeout:
          navigationTimeout,
      },
    );

  const responseStatus =
    response?.status() ?? null;

  const [
    retryAfter,
    pageTitle,
    pageText,
  ] = await Promise.all([
    readRetryAfterSafely(
      response,
    ),
    readPageTitleSafely(
      page,
    ),
    readPageTextSafely(
      page,
      pageSignalTimeout,
    ),
  ]);

  const finalUrl =
    readPageUrlSafely(
      page,
    );

  const decision =
    detectGoogleTrendsProviderState({
      url:
        finalUrl,
      response_status:
        responseStatus,
      response_headers:
        retryAfter === null
          ? null
          : {
              'retry-after':
                retryAfter,
            },
      page_title:
        pageTitle,
      page_text:
        pageText,
    });

  return {
    ...decision,
    requested_url:
      GOOGLE_TRENDS_EXPLORE_URL,
    final_url:
      finalUrl,
    response_status:
      responseStatus,
  };
};

/**
 * Compile-time adapter for a real Playwright Page.
 *
 * Kept separate from the provider detector so deterministic
 * tests can exercise the probe without launching a browser or
 * making network requests.
 */
export const asGoogleTrendsProbePage = (
  page: Page,
): GoogleTrendsProbePage => ({
  goto: async (
    url,
    options,
  ) => {
    const response:
      | Response
      | null =
      await page.goto(
        url,
        options,
      );

    return response;
  },

  title: () =>
    page.title(),

  url: () =>
    page.url(),

  locator: () => {
    const body:
      Locator =
      page.locator('body');

    return {
      innerText: (options) =>
        body.innerText(
          options,
        ),
    };
  },
});
