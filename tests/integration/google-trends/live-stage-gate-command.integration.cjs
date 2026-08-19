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
  sanitizeDownloadReadinessRows,
} = require(
  path.join(
    buildRoot,
    'scripts',
    'm3',
    'live-google-trends-stage-gate.js',
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
    inspect_download_readiness:
      false,
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
    inspect_download_readiness:
      false,
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

assert.deepEqual(
  requireLiveStageGateConfirmation([
    '--stage=FIXED_FILTERS',
    '--inspect-download-readiness',
    LIVE_STAGE_GATE_CONFIRMATION_FLAG,
  ]),
  {
    help:
      false,
    confirmed:
      true,
    inspect_download_readiness:
      true,
    target_stage:
      'FIXED_FILTERS',
  },
);

assert.throws(
  () =>
    requireLiveStageGateConfirmation([
      '--stage=DATE_RANGE',
      '--inspect-download-readiness',
      LIVE_STAGE_GATE_CONFIRMATION_FLAG,
    ]),
  /requires --stage=FIXED_FILTERS/u,
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

const fixedFilterFailure =
  safeStageGateFailure(
    'FIXED_FILTERS',
    'FIXED_FILTERS',
    [
      'QUERY_GROUP',
      'GEOGRAPHY',
      'DATE_RANGE',
    ],
    new GoogleTrendsFixedFilterContractError(
      'SENSITIVE_LABEL_MUST_NOT_ESCAPE',
      {
        control:
          GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
            .SEARCH_PROPERTY_PICKER,
        observed_count:
          0,
      },
    ),
  );

assert.deepEqual(
  fixedFilterFailure,
  {
    result_type:
      'STAGE_GATE_FAILED',
    target_stage:
      'FIXED_FILTERS',
    current_stage:
      'FIXED_FILTERS',
    completed_stages: [
      'QUERY_GROUP',
      'GEOGRAPHY',
      'DATE_RANGE',
    ],
    error_class:
      'GoogleTrendsFixedFilterContractError',
    control:
      'SEARCH_PROPERTY_PICKER',
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

const safeRows =
  sanitizeDownloadReadinessRows(
    [
      {
        tag:
          'h2',
        role:
          'heading',
        aria_label:
          'Interest for CANLI BİTKİ',
        title:
          null,
        class_name:
          'chart canlı bitki',
        text:
          'CANLI BİTKİ interest over time',
      },
    ],
    [
      'canlı bitki',
    ],
  );

assert.equal(
  JSON.stringify(
    safeRows,
  ).toLocaleLowerCase(
    'tr-TR',
  ).includes(
    'canlı bitki',
  ),
  false,
);

assert.equal(
  safeRows[0].text,
  '<QUERY> interest over time',
);

console.log(
  'PASS GT-LIVE-STAGE-CMD-005: bounded download-readiness structure redacts configured queries without emitting HTML, URLs, or session state',
);
