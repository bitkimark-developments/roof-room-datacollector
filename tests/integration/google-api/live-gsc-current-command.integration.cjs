const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);

if (!buildRoot) {
  throw new Error('Expected compiled build root.');
}

const {
  parseLiveGscCurrentArguments,
  requireLiveGscCurrentConfirmation,
  LIVE_GSC_CURRENT_CONFIRMATION_FLAG,
  resolveLiveGscApplicationVersion,
  resolveLiveGscReferenceDate,
  resolveLiveGscDateRange,
} = require(path.join(
  buildRoot,
  'scripts',
  'm3',
  'live-google-gsc-current.js',
));

assert.equal(
  LIVE_GSC_CURRENT_CONFIRMATION_FLAG,
  '--confirm-live-gsc',
);

assert.equal(
  resolveLiveGscApplicationVersion(),
  require(path.join(process.cwd(), 'package.json')).version,
);

assert.equal(
  resolveLiveGscReferenceDate(
    new Date(2026, 8, 11, 12, 0, 0),
  ),
  '2026-09-11',
);

assert.deepEqual(
  resolveLiveGscDateRange(
    'current',
    '2026-09-11',
  ),
  {
    period: 'current',
    date_policy: 'LAST_90_COMPLETE_DAYS',
    reference_date: '2026-09-11',
    start_date: '2026-06-13',
    end_date: '2026-09-10',
    job_key: 'GSC-CURRENT-001',
  },
);

assert.deepEqual(
  resolveLiveGscDateRange(
    'long',
    '2026-09-11',
  ),
  {
    period: 'long',
    date_policy: 'LAST_16_MONTHS_TO_YESTERDAY',
    reference_date: '2026-09-11',
    start_date: '2025-05-11',
    end_date: '2026-09-10',
    job_key: 'GSC-LONG-001',
  },
);

assert.deepEqual(
  resolveLiveGscDateRange(
    'long',
    '2026-03-31',
  ),
  {
    period: 'long',
    date_policy: 'LAST_16_MONTHS_TO_YESTERDAY',
    reference_date: '2026-03-31',
    start_date: '2024-11-30',
    end_date: '2026-03-30',
    job_key: 'GSC-LONG-001',
  },
);

assert.throws(
  () =>
    resolveLiveGscDateRange(
      'current',
      '2026-02-30',
    ),
  /Invalid ISO date/u,
);

assert.deepEqual(
  parseLiveGscCurrentArguments([
    '--workspace-name=Bitkimark Production',
    '--period=long',
    '--reference-date=2026-09-11',
  ]),
  {
    help: false,
    confirmed: false,
    workspace_name: 'Bitkimark Production',
    period: 'long',
    reference_date: '2026-09-11',
  },
);

assert.throws(
  () =>
    requireLiveGscCurrentConfirmation([
      '--workspace-name=Bitkimark Production',
      '--period=current',
    ]),
  /Refusing live GSC request without --confirm-live-gsc/u,
);

assert.throws(
  () =>
    requireLiveGscCurrentConfirmation([
      '--confirm-live-gsc',
      '--workspace-name=Bitkimark Production',
    ]),
  /requires --period=current\|long/u,
);

assert.deepEqual(
  requireLiveGscCurrentConfirmation([
    '--confirm-live-gsc',
    '--workspace-name=Bitkimark Production',
    '--period=long',
  ]),
  {
    help: false,
    confirmed: true,
    workspace_name: 'Bitkimark Production',
    period: 'long',
    reference_date: null,
  },
);

assert.throws(
  () =>
    parseLiveGscCurrentArguments([
      '--confirm-live-gsc',
      '--workspace-name=Bitkimark Production',
      '--period=forever',
    ]),
  /Unsupported GSC period/u,
);

console.log('PASS LIVE-GSC-CURRENT-COMMAND-001');
