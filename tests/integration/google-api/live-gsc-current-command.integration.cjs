const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const {
  parseLiveGscCurrentArguments,
  requireLiveGscCurrentConfirmation,
  LIVE_GSC_CURRENT_CONFIRMATION_FLAG,
  LIVE_GSC_CURRENT_START_DATE,
  LIVE_GSC_CURRENT_END_DATE,
  resolveLiveGscApplicationVersion,
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
  LIVE_GSC_CURRENT_START_DATE,
  '2026-06-12',
);

assert.equal(
  LIVE_GSC_CURRENT_END_DATE,
  '2026-09-09',
);

assert.equal(
  resolveLiveGscApplicationVersion(),
  require(path.join(process.cwd(), 'package.json')).version,
  'Live GSC provenance must use the RoofRoom package version, not the Electron runtime version',
);

assert.deepEqual(
  parseLiveGscCurrentArguments([
    '--workspace-name=Bitkimark Production',
  ]),
  {
    help: false,
    confirmed: false,
    workspace_name: 'Bitkimark Production',
  },
);

assert.throws(
  () => requireLiveGscCurrentConfirmation([
    '--workspace-name=Bitkimark Production',
  ]),
  /Refusing live GSC request without --confirm-live-gsc/u,
);

assert.deepEqual(
  requireLiveGscCurrentConfirmation([
    '--confirm-live-gsc',
    '--workspace-name=Bitkimark Production',
  ]),
  {
    help: false,
    confirmed: true,
    workspace_name: 'Bitkimark Production',
  },
);

assert.throws(
  () => parseLiveGscCurrentArguments([
    '--confirm-live-gsc',
    '--workspace-name=Bitkimark Production',
    '--unexpected',
  ]),
  /Unsupported argument/u,
);

console.log('PASS LIVE-GSC-CURRENT-COMMAND-001');
