const assert = require(
  'node:assert/strict',
);
const path = require(
  'node:path',
);

const [buildRoot] =
  process.argv.slice(2);

if (!buildRoot) {
  throw new Error(
    'Expected compiled build root.',
  );
}

const {
  GOOGLE_TRENDS_EXPLORE_URL,
  probeGoogleTrendsExplore,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-provider-probe.js',
  ),
);

class FakeResponse {
  constructor(
    status,
    headers = {},
  ) {
    this.statusCode = status;
    this.headers = headers;
    this.requestedHeaders = [];
  }

  status() {
    return this.statusCode;
  }

  async headerValue(name) {
    this.requestedHeaders.push(
      name,
    );

    const target =
      name.toLowerCase();

    for (const [
      key,
      value,
    ] of Object.entries(
      this.headers,
    )) {
      if (
        key.toLowerCase() ===
        target
      ) {
        return value;
      }
    }

    return null;
  }
}

class FakeLocator {
  constructor(
    text,
    shouldThrow = false,
  ) {
    this.text = text;
    this.shouldThrow =
      shouldThrow;
    this.calls = [];
  }

  async innerText(options) {
    this.calls.push(options);

    if (this.shouldThrow) {
      throw new Error(
        'body unavailable',
      );
    }

    return this.text;
  }
}

class FakePage {
  constructor({
    response,
    title,
    bodyText,
    currentUrl,
    titleThrows = false,
    bodyThrows = false,
  }) {
    this.response = response;
    this.titleValue = title;
    this.titleThrows =
      titleThrows;
    this.body =
      new FakeLocator(
        bodyText,
        bodyThrows,
      );
    this.currentUrl =
      currentUrl;
    this.gotoCalls = [];
    this.locatorCalls = [];
  }

  async goto(url, options) {
    this.gotoCalls.push({
      url,
      options,
    });

    return this.response;
  }

  async title() {
    if (this.titleThrows) {
      throw new Error(
        'title unavailable',
      );
    }

    return this.titleValue;
  }

  url() {
    return this.currentUrl ??
      this.gotoCalls.at(-1)?.url ??
      '';
  }

  locator(selector) {
    this.locatorCalls.push(
      selector,
    );

    return this.body;
  }
}

const rateLimitBody = [
  "429. That's an error.",
  "We're sorry, but you have sent too many requests to us recently.",
  'Please try again later.',
].join(' ');

const main = async () => {
  const response429 =
    new FakeResponse(
      429,
      {
        'Retry-After':
          '120',
        'Set-Cookie':
          'SID=must-not-be-read',
        Authorization:
          'Bearer must-not-be-read',
      },
    );

  const page429 =
    new FakePage({
      response:
        response429,
      title:
        'Error 429 (Too Many Requests)',
      bodyText:
        rateLimitBody,
    });

  const detected =
    await probeGoogleTrendsExplore(
      page429,
    );

  assert.equal(
    detected.provider_state,
    'RATE_LIMITED',
  );
  assert.equal(
    detected.error_code,
    'RATE_LIMITED',
  );
  assert.equal(
    detected.retry_after,
    '120',
  );
  assert.equal(
    detected.response_status,
    429,
  );
  assert.equal(
    detected.requested_url,
    GOOGLE_TRENDS_EXPLORE_URL,
  );
  assert.deepEqual(
    response429.requestedHeaders,
    [
      'retry-after',
    ],
  );

  assert.deepEqual(
    page429.gotoCalls,
    [
      {
        url:
          GOOGLE_TRENDS_EXPLORE_URL,
        options: {
          waitUntil:
            'domcontentloaded',
          timeout: 30_000,
        },
      },
    ],
  );

  assert.deepEqual(
    page429.locatorCalls,
    [
      'body',
    ],
  );

  assert.deepEqual(
    page429.body.calls,
    [
      {
        timeout: 5_000,
      },
    ],
  );

  const normalPage =
    new FakePage({
      response:
        new FakeResponse(
          200,
        ),
      title:
        'Google Trends',
      bodyText:
        'Explore Interest over time',
    });

  const normal =
    await probeGoogleTrendsExplore(
      normalPage,
      {
        navigation_timeout_ms:
          12_345,
        page_signal_timeout_ms:
          2_345,
      },
    );

  assert.equal(
    normal.provider_state,
    'NO_RATE_LIMIT_SIGNAL',
  );
  assert.equal(
    normal.error_code,
    null,
  );
  assert.equal(
    normal.response_status,
    200,
  );

  assert.deepEqual(
    normalPage.gotoCalls[0]
      .options,
    {
      waitUntil:
        'domcontentloaded',
      timeout: 12_345,
    },
  );

  assert.deepEqual(
    normalPage.body.calls[0],
    {
      timeout: 2_345,
    },
  );

  const degradedPage =
    new FakePage({
      response:
        new FakeResponse(
          429,
        ),
      title: '',
      bodyText: '',
      titleThrows: true,
      bodyThrows: true,
    });

  const degraded =
    await probeGoogleTrendsExplore(
      degradedPage,
    );

  assert.equal(
    degraded.provider_state,
    'RATE_LIMITED',
  );
  assert.deepEqual(
    degraded.signals,
    [
      'HTTP_STATUS_429',
    ],
  );

  const noResponsePage =
    new FakePage({
      response: null,
      title:
        'Error 429 (Too Many Requests)',
      bodyText:
        rateLimitBody,
    });

  const noResponse =
    await probeGoogleTrendsExplore(
      noResponsePage,
    );

  assert.equal(
    noResponse.provider_state,
    'RATE_LIMITED',
  );
  assert.equal(
    noResponse.response_status,
    null,
  );

  for (const invalid of [
    0,
    -1,
    1.5,
  ]) {
    await assert.rejects(
      () =>
        probeGoogleTrendsExplore(
          normalPage,
          {
            navigation_timeout_ms:
              invalid,
          },
        ),
      /navigation_timeout_ms must be a positive integer/,
    );
  }

  const configuredUrl =
    `${GOOGLE_TRENDS_EXPLORE_URL}?date=2024-08-18+2026-08-17&geo=TR&q=redacted-one%2Credacted-two`;

  const configuredPage =
    new FakePage({
      response:
        new FakeResponse(
          200,
        ),
      title:
        'Google Trends',
      bodyText:
        'Explore Interest over time',
      currentUrl:
        configuredUrl,
    });

  const configured =
    await probeGoogleTrendsExplore(
      configuredPage,
      {
        requested_url:
          configuredUrl,
      },
    );

  assert.equal(
    configured.requested_url,
    configuredUrl,
  );
  assert.equal(
    configured.final_url,
    configuredUrl,
  );
  assert.equal(
    configuredPage.gotoCalls[0].url,
    configuredUrl,
  );

  for (const requestedUrl of [
    'not-an-absolute-url',
    'https://example.test/trends/explore',
    'https://trends.google.com/trends/other',
    'https://user:password@trends.google.com/trends/explore',
    `${GOOGLE_TRENDS_EXPLORE_URL}#fragment`,
  ]) {
    const rejectedPage =
      new FakePage({
        response:
          new FakeResponse(
            200,
          ),
        title:
          'Google Trends',
        bodyText:
          'Explore',
      });

    await assert.rejects(
      () =>
        probeGoogleTrendsExplore(
          rejectedPage,
          {
            requested_url:
              requestedUrl,
          },
        ),
      /must (?:be a valid Explore URL|stay inside the canonical Explore page)/u,
    );

    assert.equal(
      rejectedPage.gotoCalls.length,
      0,
    );
  }

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      detected,
      'page_text',
    ),
    false,
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      detected,
      'response_headers',
    ),
    false,
  );

  console.log(
    'PASS GT-PROBE-001: navigation response status is fed into provider-state detection',
  );
  console.log(
    'PASS GT-PROBE-002: probe reads only Retry-After and never requests cookie/authorization headers',
  );
  console.log(
    'PASS GT-PROBE-003: known 429 page signals still classify when response is unavailable',
  );
  console.log(
    'PASS GT-PROBE-004: HTTP 429 remains detectable when page title/body inspection fails',
  );
  console.log(
    'PASS GT-PROBE-005: normal Explore-like page is not falsely classified as rate limited',
  );
  console.log(
    'PASS GT-PROBE-006: probe uses bounded deterministic navigation/page-signal timeouts',
  );
  console.log(
    'PASS GT-PROBE-007: raw page text and response headers are not exposed by the probe result',
  );
  console.log(
    'PASS GT-PROBE-008: an exact same-origin configured Explore URL is navigated once and preserved as probe evidence',
  );
  console.log(
    'PASS GT-PROBE-009: invalid, foreign, credentialed, fragmented, or non-Explore URLs fail before navigation',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
