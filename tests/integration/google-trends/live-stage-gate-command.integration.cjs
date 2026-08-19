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
  LIVE_STAGE_GATE_CONFIRMATION_FLAG,
  isGoogleTrendsStageRateLimitedResponse,
  parseLiveStageGateArguments,
  requireLiveStageGateConfirmation,
  safeStageGateFailure,
} = require(
  path.join(
    buildRoot,
    'scripts',
    'm3',
    'live-google-trends-stage-gate.js',
  ),
);

const {
  GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS,
  GoogleTrendsQueryGroupUiContractError,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-query-group-ui.js',
  ),
);

assert.deepEqual(
  parseLiveStageGateArguments([
    '--stage=DATE_RANGE',
    LIVE_STAGE_GATE_CONFIRMATION_FLAG,
  ]),
  {
    help:
      false,
    confirmed:
      true,
    target_stage:
      'DATE_RANGE',
  },
);

assert.deepEqual(
  requireLiveStageGateConfirmation([
    '--stage=FIXED_FILTERS',
    LIVE_STAGE_GATE_CONFIRMATION_FLAG,
  ]),
  {
    help:
      false,
    confirmed:
      true,
    target_stage:
      'FIXED_FILTERS',
  },
);

for (const args of [
  [],
  [
    '--stage=DATE_RANGE',
  ],
]) {
  assert.throws(
    () =>
      requireLiveStageGateConfirmation(
        args,
      ),
    /Refusing live Google Trends stage gate/u,
  );
}

assert.throws(
  () =>
    requireLiveStageGateConfirmation([
      LIVE_STAGE_GATE_CONFIRMATION_FLAG,
    ]),
  /requires exactly one explicit/u,
);

for (const forbidden of [
  '--stage=DOWNLOAD',
  '--stage=UNKNOWN',
  '--retry',
  '--refresh',
  '--all-groups',
]) {
  assert.throws(
    () =>
      parseLiveStageGateArguments([
        forbidden,
      ]),
    /Unsupported argument/u,
  );
}

console.log(
  'PASS GT-LIVE-STAGE-CMD-001: staged live evidence requires explicit confirmation and accepts only one pre-download gate',
);

const queryFailure =
  safeStageGateFailure(
    'DATE_RANGE',
    'QUERY_GROUP',
    [],
    new GoogleTrendsQueryGroupUiContractError(
      'SENSITIVE_QUERY_MUST_NOT_ESCAPE',
      {
        control:
          GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
            .SEARCH_TERM_SUGGESTION,
        observed_count:
          0,
        query_index:
          1,
      },
    ),
  );

assert.deepEqual(
  queryFailure,
  {
    result_type:
      'STAGE_GATE_FAILED',
    target_stage:
      'DATE_RANGE',
    current_stage:
      'QUERY_GROUP',
    completed_stages:
      [],
    error_class:
      'GoogleTrendsQueryGroupUiContractError',
    control:
      'SEARCH_TERM_SUGGESTION',
    observed_count:
      0,
    query_index:
      1,
  },
);

assert.equal(
  JSON.stringify(
    queryFailure,
  ).includes(
    'SENSITIVE_QUERY_MUST_NOT_ESCAPE',
  ),
  false,
);

console.log(
  'PASS GT-LIVE-STAGE-CMD-002: stage failures expose only target/current/completed gates and allowlisted cardinality evidence',
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
  isGoogleTrendsStageRateLimitedResponse(
    response(
      429,
      'https://trends.google.com/trends/api/widgetdata/multiline',
    ),
  ),
  true,
);

assert.equal(
  isGoogleTrendsStageRateLimitedResponse(
    response(
      429,
      'https://example.test/rate-limited',
    ),
  ),
  false,
);

console.log(
  'PASS GT-LIVE-STAGE-CMD-003: stage gates stop on same-origin interaction HTTP 429 without treating unrelated responses as provider limits',
);
