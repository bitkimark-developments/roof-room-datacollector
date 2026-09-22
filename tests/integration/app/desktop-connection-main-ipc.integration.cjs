const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) {
  throw new Error('Expected compiled build root argument.');
}

const {
  createDesktopWorkspaceConnectionsHandler,
} = require(
  path.join(
    buildRoot,
    'main',
    'app',
    'desktop-connection-ipc.js',
  ),
);

const calls = [];
const safeResult = [
  {
    source_id: 'serpapi',
    credential_status: 'AVAILABLE',
    readiness_status: 'READY',
  },
];

const handler = createDesktopWorkspaceConnectionsHandler({
  assertTrustedSender: (event) => {
    calls.push(['trusted', event.marker]);
  },
  getWorkspaceConnections: async (workspaceId) => {
    calls.push(['controller', workspaceId]);
    return safeResult;
  },
});

async function main() {
  const event = { marker: 'trusted-fixture' };

  const result = await handler(event, 'ws_fixture');

  assert.deepEqual(
    calls,
    [
      ['trusted', 'trusted-fixture'],
      ['controller', 'ws_fixture'],
    ],
    'Handler must validate the sender before delegating to the safe controller read seam.',
  );

  assert.deepEqual(result, safeResult);

  await assert.rejects(
    async () => handler(event, '   '),
    /workspace_id must be a non-empty string/i,
    'Blank Workspace ID must fail closed before controller delegation.',
  );

  await assert.rejects(
    async () => handler(event, null),
    /workspace_id must be a non-empty string/i,
    'Non-string Workspace ID must fail closed.',
  );

  console.log(
    'PASS DESKTOP-CONNECTION-MAIN-IPC-001: trusted handler validates Workspace ID and delegates only to the safe read seam',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
