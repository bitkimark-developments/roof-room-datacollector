const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) {
  throw new Error('Expected compiled build root argument.');
}

global.__roofroomInvocations = [];
global.__roofroomExposed = null;

const applicationInfo = require(
  path.join(buildRoot, 'shared', 'application-info.js'),
);

assert.equal(
  applicationInfo.IPC_CHANNELS.DESKTOP_CONNECTIONS,
  'desktop:connections',
  'UXH2-B requires a dedicated read-only desktop connections IPC channel.',
);

require(path.join(buildRoot, 'preload.js'));

assert.equal(
  global.__roofroomExposed?.name,
  'roofroom',
  'Preload must expose the RoofRoom API through the existing contextBridge boundary.',
);

const api = global.__roofroomExposed?.api;

assert.equal(
  typeof api?.getDesktopWorkspaceConnections,
  'function',
  'Preload must expose a read-only Workspace connection method.',
);

(async () => {
  const result = await api.getDesktopWorkspaceConnections('ws_fixture');

  assert.deepEqual(
    global.__roofroomInvocations,
    [
      [
        'desktop:connections',
        'ws_fixture',
      ],
    ],
    'Preload must invoke only the dedicated connections channel with the selected Workspace ID.',
  );

  assert.deepEqual(
    result,
    [
      {
        source_id: 'serpapi',
        credential_status: 'AVAILABLE',
        readiness_status: 'READY',
      },
    ],
  );

  console.log(
    'PASS DESKTOP-CONNECTION-IPC-001: preload exposes the dedicated safe Workspace connection read channel',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
