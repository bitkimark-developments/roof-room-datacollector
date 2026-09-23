const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const buildRoot = process.argv[2];
const projectRoot = process.argv[3];
if (!buildRoot || !projectRoot) {
  throw new Error('Expected compiled build root and project root arguments.');
}

global.__roofroomInvocations = [];
global.__roofroomExposed = null;

const { IPC_CHANNELS } = require(
  path.join(buildRoot, 'shared', 'application-info.js'),
);
require(path.join(buildRoot, 'preload.js'));

const api = global.__roofroomExposed?.api;
const methods = [
  ['manageDesktopWorkspaceConnection', 'DESKTOP_CONNECTION_MANAGE'],
  ['disconnectDesktopWorkspaceConnection', 'DESKTOP_CONNECTION_DISCONNECT'],
  ['connectGoogleDesktopWorkspaceConnection', 'DESKTOP_CONNECTION_CONNECT_GOOGLE'],
  ['reconnectGoogleDesktopWorkspaceConnection', 'DESKTOP_CONNECTION_RECONNECT_GOOGLE'],
  ['provisionSerpApiDesktopWorkspaceConnection', 'DESKTOP_CONNECTION_PROVISION_SERPAPI'],
];

for (const [method] of methods) {
  assert.equal(typeof api?.[method], 'function', method + ' must be exposed.');
}
assert.equal(typeof api?.getDesktopWorkspaceConnections, 'function');
assert.equal('invoke' in api, false, 'No generic invoke method may cross preload.');
assert.equal('channel' in api, false, 'No generic channel field may cross preload.');

async function main() {
  const intents = [
    {
      workspace_id: 'ws',
      source_id: 'google-search-console-query-page',
      metadata: { site_url: 'sc-domain:example.com' },
    },
    { workspace_id: 'ws', source_id: 'serpapi' },
    {
      workspace_id: 'ws',
      source_id: 'google-ads-search-terms',
      metadata: { customer_id: '123' },
    },
    { workspace_id: 'ws', source_id: 'google-keyword-planner' },
    { workspace_id: 'ws', source_id: 'serpapi' },
  ];
  for (let index = 0; index < methods.length; index += 1) {
    await api[methods[index][0]](intents[index]);
  }
  await api.getDesktopWorkspaceConnections('ws');

  assert.deepEqual(
    global.__roofroomInvocations,
    [
      ...methods.map(([, channelName], index) => [
        IPC_CHANNELS[channelName],
        intents[index],
      ]),
      [IPC_CHANNELS.DESKTOP_CONNECTIONS, 'ws'],
    ],
  );

  const preloadSource = fs.readFileSync(
    path.join(projectRoot, 'src', 'preload.ts'),
    'utf8',
  );
  const apiSource = fs.readFileSync(
    path.join(projectRoot, 'src', 'shared', 'application-info.ts'),
    'utf8',
  );
  const writeIpcSource = fs.readFileSync(
    path.join(projectRoot, 'src', 'main', 'app', 'desktop-connection-write-ipc.ts'),
    'utf8',
  );
  const writeBoundarySource = preloadSource + apiSource + writeIpcSource;
  assert.equal(/clipboard/i.test(writeBoundarySource), false);
  assert.equal(/credential_ref/i.test(preloadSource + apiSource), false);
  assert.equal(/api_key|refresh_token|developer_token|client_secret/i.test(
    preloadSource + apiSource,
  ), false);

  console.log(
    'PASS DESKTOP-CONNECTION-WRITE-IPC-001: preload exposes only typed safe mutation methods and preserves the Workspace connection read method',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
