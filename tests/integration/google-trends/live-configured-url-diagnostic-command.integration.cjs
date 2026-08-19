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
  LIVE_CONFIGURED_URL_DIAGNOSTIC_CONFIRMATION_FLAG,
  LIVE_CONFIGURED_URL_QUERY_GROUP_ID,
  LIVE_CONFIGURED_URL_REQUESTED_DATE_END,
  LIVE_CONFIGURED_URL_REQUESTED_DATE_START,
  isConfiguredUrlDiagnosticRateLimitedResponse,
  parseLiveConfiguredUrlDiagnosticArguments,
  requireLiveConfiguredUrlDiagnosticConfirmation,
  safeConfiguredUrlDiagnosticFailure,
  safeProviderBlockResult,
} = require(
  path.join(
    buildRoot,
    'scripts',
    'm3',
    'live-google-trends-configured-url-diagnostic.js',
  ),
);

const {
  GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS,
  GoogleTrendsFixedFilterContractError,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-fixed-filter-verifier.js',
  ),
);

assert.equal(
  LIVE_CONFIGURED_URL_QUERY_GROUP_ID,
  'GT01',
);
assert.equal(
  LIVE_CONFIGURED_URL_REQUESTED_DATE_START,
  '2024-08-18',
);
assert.equal(
  LIVE_CONFIGURED_URL_REQUESTED_DATE_END,
  '2026-08-17',
);

assert.deepEqual(
  requireLiveConfiguredUrlDiagnosticConfirmation([
    LIVE_CONFIGURED_URL_DIAGNOSTIC_CONFIRMATION_FLAG,
  ]),
  {
    help:
      false,
    confirmed:
      true,
  },
);

assert.deepEqual(
  parseLiveConfiguredUrlDiagnosticArguments([
    '--help',
  ]),
  {
    help:
      true,
    confirmed:
      false,
  },
);

assert.throws(
  () =>
    requireLiveConfiguredUrlDiagnosticConfirmation([]),
  /Refusing live Google Trends configured-URL diagnostic/u,
);

for (const forbidden of [
  '--retry',
  '--refresh',
  '--download',
  '--all-groups',
]) {
  assert.throws(
    () =>
      parseLiveConfiguredUrlDiagnosticArguments([
        forbidden,
      ]),
    /Unsupported argument/u,
  );
}

console.log(
  'PASS GT-LIVE-CONFIG-URL-CMD-001: exact GT01/date scope requires explicit confirmation and rejects retry, refresh, download, or broader groups',
);

const response = (
  status,
  url,
) => ({
  status: () =>
    status,
  url: () =>
    url,
});

assert.equal(
  isConfiguredUrlDiagnosticRateLimitedResponse(
    response(
      429,
      'https://trends.google.com/trends/api/widgetdata/multiline',
    ),
  ),
  true,
);
assert.equal(
  isConfiguredUrlDiagnosticRateLimitedResponse(
    response(
      429,
      'https://example.test/rate-limited',
    ),
  ),
  false,
);

console.log(
  'PASS GT-LIVE-CONFIG-URL-CMD-002: same-origin HTTP 429 is an immediate provider stop signal',
);

const sensitiveError =
  new Error(
    'SENSITIVE_QUERY_URL_HTML_MUST_NOT_ESCAPE',
  );
sensitiveError.name =
  'GoogleTrendsFixedFilterContractError';

const safeFailure =
  safeConfiguredUrlDiagnosticFailure(
    'FIXED_FILTERS',
    sensitiveError,
  );

assert.deepEqual(
  safeFailure,
  {
    result_type:
      'CONFIGURED_URL_DIAGNOSTIC_FAILED',
    stage:
      'FIXED_FILTERS',
    error_class:
      'GoogleTrendsFixedFilterContractError',
  },
);
assert.equal(
  JSON.stringify(
    safeFailure,
  ).includes(
    sensitiveError.message,
  ),
  false,
);

console.log(
  'PASS GT-LIVE-CONFIG-URL-CMD-003: diagnostic failures expose only stage and allowlisted error class',
);

const fixedFilterFailure =
  safeConfiguredUrlDiagnosticFailure(
    'FIXED_FILTERS',
    new GoogleTrendsFixedFilterContractError(
      'SENSITIVE_LABEL_MUST_NOT_ESCAPE',
      {
        control:
          GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
            .CATEGORY_PICKER,
        observed_count:
          0,
      },
    ),
  );

assert.deepEqual(
  fixedFilterFailure,
  {
    result_type:
      'CONFIGURED_URL_DIAGNOSTIC_FAILED',
    stage:
      'FIXED_FILTERS',
    error_class:
      'GoogleTrendsFixedFilterContractError',
    control:
      'CATEGORY_PICKER',
    observed_count:
      0,
  },
);
assert.equal(
  JSON.stringify(
    fixedFilterFailure,
  ).includes(
    'SENSITIVE',
  ),
  false,
);

console.log(
  'PASS GT-LIVE-CONFIG-URL-CMD-006: fixed-filter failures include only allowlisted control cardinality without provider labels',
);

const providerBlock =
  safeProviderBlockResult({
    provider_state:
      'MANUAL_ACTION_REQUIRED',
    error_code:
      'MANUAL_ACTION_REQUIRED',
    retry_after:
      null,
    signals: [
      'AUTH_URL_ACCOUNTS_GOOGLE',
    ],
    requested_url:
      'SENSITIVE_REQUESTED_URL',
    final_url:
      'SENSITIVE_FINAL_URL',
    response_status:
      200,
  });

assert.deepEqual(
  providerBlock,
  {
    result_type:
      'MANUAL_ACTION_REQUIRED',
    signals: [
      'AUTH_URL_ACCOUNTS_GOOGLE',
    ],
  },
);
assert.equal(
  JSON.stringify(
    providerBlock,
  ).includes(
    'SENSITIVE',
  ),
  false,
);

console.log(
  'PASS GT-LIVE-CONFIG-URL-CMD-004: provider blocks expose only state and fixed signals without URLs or page content',
);
