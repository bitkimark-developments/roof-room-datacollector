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
  LIVE_REPRESENTATIVE_BATCH_CONFIRMATION_FLAG,
  LIVE_REPRESENTATIVE_BATCH_GROUP_IDS,
  parseLiveRepresentativeBatchArguments,
  requireLiveRepresentativeBatchConfirmation,
  safeRepresentativeSourceSummary,
} = require(
  path.join(
    buildRoot,
    'scripts',
    'm3',
    'live-google-trends-representative-batch.js',
  ),
);

assert.deepEqual(
  LIVE_REPRESENTATIVE_BATCH_GROUP_IDS,
  [
    'GT01',
    'GT02',
  ],
);
assert.deepEqual(
  requireLiveRepresentativeBatchConfirmation([
    LIVE_REPRESENTATIVE_BATCH_CONFIRMATION_FLAG,
  ]),
  {
    help:
      false,
    confirmed:
      true,
  },
);
assert.deepEqual(
  parseLiveRepresentativeBatchArguments([
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
    requireLiveRepresentativeBatchConfirmation([]),
  /Refusing representative Google Trends batch/u,
);

for (const forbidden of [
  '--retry',
  '--refresh',
  '--groups=GT01,GT02,GT03',
  '--all-groups',
]) {
  assert.throws(
    () =>
      parseLiveRepresentativeBatchArguments([
        forbidden,
      ]),
    /Unsupported argument/u,
  );
}

console.log(
  'PASS GT-LIVE-BATCH-CMD-001: representative live scope is exactly GT01+GT02 and rejects retry, refresh, or broader groups',
);

const sensitiveFailure =
  safeRepresentativeSourceSummary({
    result_type:
      'FAILED',
    error_code:
      'RATE_LIMITED',
    message:
      'SENSITIVE_QUERY_URL_HTML_MUST_NOT_ESCAPE',
  });

assert.deepEqual(
  sensitiveFailure,
  {
    result_type:
      'FAILED',
    error_code:
      'RATE_LIMITED',
  },
);
assert.equal(
  JSON.stringify(
    sensitiveFailure,
  ).includes(
    'SENSITIVE',
  ),
  false,
);

console.log(
  'PASS GT-LIVE-BATCH-CMD-002: safe batch source summaries exclude provider/error messages and raw content',
);
