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
  LIVE_PROBE_CONFIRMATION_FLAG,
  parseLiveProbeArguments,
  requireLiveProbeConfirmation,
} = require(
  path.join(
    buildRoot,
    'scripts',
    'm3',
    'live-google-trends-provider-probe.js',
  ),
);

assert.deepEqual(
  parseLiveProbeArguments([]),
  {
    help: false,
    confirmed: false,
  },
);

assert.deepEqual(
  parseLiveProbeArguments([
    '--help',
  ]),
  {
    help: true,
    confirmed: false,
  },
);

assert.deepEqual(
  requireLiveProbeConfirmation([
    LIVE_PROBE_CONFIRMATION_FLAG,
  ]),
  {
    help: false,
    confirmed: true,
  },
);

assert.throws(
  () =>
    requireLiveProbeConfirmation(
      [],
    ),
  /Refusing live Google Trends request/,
);

assert.throws(
  () =>
    parseLiveProbeArguments([
      '--retry',
    ]),
  /Unsupported argument/,
);

console.log(
  'PASS GT-LIVE-CMD-001: live probe requires an explicit confirmation flag',
);
console.log(
  'PASS GT-LIVE-CMD-002: unsupported retry-like arguments fail closed',
);
console.log(
  'PASS GT-LIVE-CMD-003: help mode is available without authorizing a live request',
);
