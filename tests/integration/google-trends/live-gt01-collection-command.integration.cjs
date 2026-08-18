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
