const assert = require(
  'node:assert/strict',
);
const fsp = require(
  'node:fs/promises',
);
const path = require(
  'node:path',
);

const [
  buildRoot,
  fixtureRoot,
] = process.argv.slice(2);

if (!buildRoot || !fixtureRoot) {
  throw new Error(
    'Expected compiled build root and fixture root.',
  );
}

const {
  detectGoogleTrendsProviderState,
  GOOGLE_TRENDS_RATE_LIMIT_ERROR_CODE,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-provider-state.js',
  ),
);

const readFixture = async (
  filename,
) =>
  fsp.readFile(
    path.join(
      fixtureRoot,
      filename,
    ),
    'utf8',
  );

const htmlToText = (
  html,
) =>
  html
    .replace(
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      ' ',
    )
    .replace(
      /<style\b[^>]*>[\s\S]*?<\/style>/gi,
      ' ',
    )
    .replace(
      /<[^>]+>/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();

const extractTitle = (
  html,
) => {
  const match =
    html.match(
      /<title>([\s\S]*?)<\/title>/i,
    );

  return match
    ? match[1]
        .replace(/\s+/g, ' ')
        .trim()
    : null;
};

const main = async () => {
  const rateLimitHtml =
    await readFixture(
      '429-too-many-requests.html',
    );

  const status429 =
    detectGoogleTrendsProviderState({
      url:
        'https://trends.google.com/trends/explore',
      response_status: 429,
      response_headers: {
        'content-type':
          'text/html; charset=UTF-8',
        'retry-after': '120',
      },
      page_title:
        extractTitle(
          rateLimitHtml,
        ),
      page_text:
        htmlToText(
          rateLimitHtml,
        ),
    });

  assert.equal(
    status429.provider_state,
    'RATE_LIMITED',
  );
  assert.equal(
    status429.error_code,
    GOOGLE_TRENDS_RATE_LIMIT_ERROR_CODE,
  );
  assert.equal(
    status429.retry_after,
    '120',
  );
  assert.deepEqual(
    status429.signals,
    [
      'HTTP_STATUS_429',
      'PAGE_TITLE_429',
      'PAGE_TEXT_TOO_MANY_REQUESTS',
    ],
  );

  const bodyOnly =
    detectGoogleTrendsProviderState({
      url:
        'https://trends.google.com/trends/explore',
      response_status: 200,
      response_headers: null,
      page_title:
        extractTitle(
          rateLimitHtml,
        ),
      page_text:
        htmlToText(
          rateLimitHtml,
        ),
    });

  assert.equal(
    bodyOnly.provider_state,
    'RATE_LIMITED',
  );
  assert.equal(
    bodyOnly.error_code,
    'RATE_LIMITED',
  );
  assert.equal(
    bodyOnly.retry_after,
    null,
  );
  assert.deepEqual(
    bodyOnly.signals,
    [
      'PAGE_TITLE_429',
      'PAGE_TEXT_TOO_MANY_REQUESTS',
    ],
  );

  const normalHtml =
    await readFixture(
      'normal-explore-shell.html',
    );

  const normal =
    detectGoogleTrendsProviderState({
      url:
        'https://trends.google.com/trends/explore',
      response_status: 200,
      response_headers: {
        'content-type':
          'text/html; charset=UTF-8',
      },
      page_title:
        extractTitle(
          normalHtml,
        ),
      page_text:
        htmlToText(
          normalHtml,
        ),
    });

  assert.deepEqual(
    normal,
    {
      provider_state:
        'NO_RATE_LIMIT_SIGNAL',
      error_code: null,
      retry_after: null,
      signals: [],
    },
  );

  const ambiguousHtml =
    await readFixture(
      'ambiguous-error.html',
    );

  const ambiguous =
    detectGoogleTrendsProviderState({
      url:
        'https://trends.google.com/trends/explore',
      response_status: 503,
      response_headers: null,
      page_title:
        extractTitle(
          ambiguousHtml,
        ),
      page_text:
        htmlToText(
          ambiguousHtml,
        ),
    });

  assert.deepEqual(
    ambiguous,
    {
      provider_state:
        'NO_RATE_LIMIT_SIGNAL',
      error_code: null,
      retry_after: null,
      signals: [],
    },
  );

  const mixedCaseHeader =
    detectGoogleTrendsProviderState({
      url:
        'https://trends.google.com/trends/explore',
      response_status: 429,
      response_headers: {
        'Retry-After':
          'Wed, 19 Aug 2026 12:00:00 GMT',
      },
      page_title: null,
      page_text: null,
    });

  assert.equal(
    mixedCaseHeader.provider_state,
    'RATE_LIMITED',
  );
  assert.equal(
    mixedCaseHeader.retry_after,
    'Wed, 19 Aug 2026 12:00:00 GMT',
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      status429,
      'page_text',
    ),
    false,
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      status429,
      'response_headers',
    ),
    false,
  );

  console.log(
    'PASS GT-PROVIDER-001: HTTP 429 maps to RATE_LIMITED',
  );
  console.log(
    'PASS GT-PROVIDER-002: known Google 429 page text maps to RATE_LIMITED even when response status is unavailable',
  );
  console.log(
    'PASS GT-PROVIDER-003: Retry-After is preserved as evidence when supplied',
  );
  console.log(
    'PASS GT-PROVIDER-004: normal Explore-like HTML is not falsely classified as rate limited',
  );
  console.log(
    'PASS GT-PROVIDER-005: generic temporary errors are not mislabeled RATE_LIMITED',
  );
  console.log(
    'PASS GT-PROVIDER-006: detector returns signals only and does not echo raw page/header content',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
