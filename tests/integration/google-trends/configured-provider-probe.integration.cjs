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
  buildGoogleTrendsConfiguredExploreUrl,
  GoogleTrendsConfiguredExploreUrlError,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-configured-explore-url.js',
  ),
);

const {
  probeConfiguredGoogleTrendsExplore,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-configured-provider-probe.js',
  ),
);

const expected = {
  queries: [
    'ilk sorgu',
    'ikinci sorgu',
    'üçüncü sorgu',
    'dördüncü sorgu',
    'beşinci sorgu',
  ],
  requested_date_start:
    '2024-08-18',
  requested_date_end:
    '2026-08-17',
  country_code:
    'TR',
};

const requestedUrl =
  buildGoogleTrendsConfiguredExploreUrl(
    expected,
  );

const normalProvider = {
  provider_state:
    'NO_RATE_LIMIT_SIGNAL',
  error_code:
    null,
  retry_after:
    null,
  signals: [],
  requested_url:
    requestedUrl,
  final_url:
    requestedUrl,
  response_status:
    200,
};

const main = async () => {
  const page = {
    marker:
      'managed-page',
  };
  const calls = [];

  const accepted =
    await probeConfiguredGoogleTrendsExplore(
      {
        page,
        requested_url:
          requestedUrl,
        expected,
      },
      {
        async probe_provider(
          receivedPage,
          options,
        ) {
          calls.push({
            receivedPage,
            options,
          });

          return normalProvider;
        },
      },
    );

  assert.equal(
    accepted,
    normalProvider,
  );
  assert.deepEqual(
    calls,
    [
      {
        receivedPage:
          page,
        options: {
          requested_url:
            requestedUrl,
        },
      },
    ],
  );

  console.log(
    'PASS GT-CONFIG-PROBE-001: production probe makes exactly one navigation through the exact configured Explore URL',
  );

  const driftedUrl =
    new URL(
      requestedUrl,
    );
  driftedUrl.searchParams.set(
    'geo',
    'US',
  );

  await assert.rejects(
    () =>
      probeConfiguredGoogleTrendsExplore(
        {
          page,
          requested_url:
            requestedUrl,
          expected,
        },
        {
          async probe_provider() {
            return {
              ...normalProvider,
              final_url:
                driftedUrl.toString(),
            };
          },
        },
      ),
    (error) =>
      error instanceof
        GoogleTrendsConfiguredExploreUrlError &&
      !error.message.includes(
        expected.queries[0],
      ) &&
      !error.message.includes(
        requestedUrl,
      ),
  );

  console.log(
    'PASS GT-CONFIG-PROBE-002: query/date/geography drift fails closed without exposing configured query text or URLs',
  );

  for (const blockingProvider of [
    {
      ...normalProvider,
      provider_state:
        'RATE_LIMITED',
      error_code:
        'RATE_LIMITED',
      signals: [
        'HTTP_STATUS_429',
      ],
      final_url:
        'https://trends.google.com/trends/explore',
      response_status:
        429,
    },
    {
      ...normalProvider,
      provider_state:
        'MANUAL_ACTION_REQUIRED',
      error_code:
        'MANUAL_ACTION_REQUIRED',
      signals: [
        'AUTH_URL_ACCOUNTS_GOOGLE',
      ],
      final_url:
        'https://accounts.google.com/',
    },
  ]) {
    const result =
      await probeConfiguredGoogleTrendsExplore(
        {
          page,
          requested_url:
            requestedUrl,
          expected,
        },
        {
          async probe_provider() {
            return blockingProvider;
          },
        },
      );

    assert.equal(
      result,
      blockingProvider,
    );
  }

  console.log(
    'PASS GT-CONFIG-PROBE-003: RATE_LIMITED and MANUAL_ACTION_REQUIRED retain priority without URL-contract fallback or retry',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
