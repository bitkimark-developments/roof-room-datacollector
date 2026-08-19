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
  LIVE_GT01_CONFIRMATION_FLAG,
  LIVE_GT01_QUERY_GROUP_ID,
  LIVE_GT01_REQUESTED_DATE_START,
  LIVE_GT01_REQUESTED_DATE_END,
  parseLiveGt01Arguments,
  requireLiveGt01Confirmation,
  safeCoreStateSummary,
} = require(
  path.join(
    buildRoot,
    'scripts',
    'm3',
    'live-google-trends-gt01-collection.js',
  ),
);

assert.equal(
  LIVE_GT01_QUERY_GROUP_ID,
  'GT01',
);

assert.equal(
  LIVE_GT01_REQUESTED_DATE_START,
  '2024-08-18',
);

assert.equal(
  LIVE_GT01_REQUESTED_DATE_END,
  '2026-08-17',
);

console.log(
  'PASS GT-LIVE-GT01-CMD-001: live vertical slice is deliberately locked to the established GT01 exact-date test window',
);

assert.deepEqual(
  parseLiveGt01Arguments([]),
  {
    help:
      false,
    confirmed:
      false,
  },
);

assert.deepEqual(
  parseLiveGt01Arguments([
    '--help',
  ]),
  {
    help:
      true,
    confirmed:
      false,
  },
);

assert.deepEqual(
  requireLiveGt01Confirmation([
    LIVE_GT01_CONFIRMATION_FLAG,
  ]),
  {
    help:
      false,
    confirmed:
      true,
  },
);

assert.throws(
  () =>
    requireLiveGt01Confirmation(
      [],
    ),
  /Refusing live Google Trends GT01 collection/u,
);

console.log(
  'PASS GT-LIVE-GT01-CMD-002: live GT01 collection requires a separate explicit confirmation flag',
);

for (
  const forbidden of [
    '--retry',
    '--refresh',
    '--all-groups',
    '--gt02',
  ]
) {
  assert.throws(
    () =>
      parseLiveGt01Arguments([
        forbidden,
      ]),
    /Unsupported argument/u,
  );
}

console.log(
  'PASS GT-LIVE-GT01-CMD-003: retry/refresh/broader-group arguments are rejected rather than silently expanding live scope',
);

assert.deepEqual(
  safeCoreStateSummary({
    run: {
      run_id:
        'rr_20260819T000000000Z_abcdef',
      run_status:
        'COMPLETED',
    },
    job: {
      execution_status:
        'COMPLETED',
    },
    attempt: {
      attempt_number:
        1,
    },
    artifact: {
      artifact_state:
        'ACCEPTED',
      relative_path:
        'google-trends/raw/GT01.csv',
      media_type:
        'text/csv',
      byte_size:
        123,
      sha256:
        'a'.repeat(64),
    },
    validation: {
      validation_status:
        'VALID',
      checks_total:
        3,
      checks_passed:
        3,
      checks_warning:
        0,
      checks_failed:
        0,
      validation_json_path:
        'google-trends/validation/GT01.validation.json',
    },
  }),
  {
    run_id:
      'rr_20260819T000000000Z_abcdef',
    run_status:
      'COMPLETED',
    job_execution_status:
      'COMPLETED',
    attempt_number:
      1,
    validation_status:
      'VALID',
    run_scoped_artifact: {
      artifact_state:
        'ACCEPTED',
      relative_path:
        'google-trends/raw/GT01.csv',
      media_type:
        'text/csv',
      byte_size:
        123,
      sha256:
        'a'.repeat(64),
    },
    validation: {
      checks_total:
        3,
      checks_passed:
        3,
      checks_warning:
        0,
      checks_failed:
        0,
      validation_json_path:
        'google-trends/validation/GT01.validation.json',
    },
  },
);

console.log(
  'PASS GT-LIVE-GT01-CMD-005: live output exposes only bounded Core persistence and validation evidence',
);
