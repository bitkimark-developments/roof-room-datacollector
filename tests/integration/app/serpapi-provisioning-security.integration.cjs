const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const {
  createDesktopConnectionWriteHandlers,
} = require(
  path.join(buildRoot, 'main', 'app', 'desktop-connection-write-ipc.js'),
);
const {
  WorkspaceConnectionManagementService,
} = require(
  path.join(
    buildRoot,
    'main',
    'app',
    'workspace-connection-management-service.js',
  ),
);
const {
  MainProcessSerpApiCredentialAcquirer,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'serpapi',
    'serpapi-credential-acquirer.js',
  ),
);

const syntheticKey = [
  'rr', 'test', 'only', 'provisioning', 'key',
].join('_');
const credentialRef = 'serpapi:security-fixture';
const ordinaryConfigWrites = [];
const exportWrites = [];
const capturedLogs = [];
const diagnostics = [];
const credentialWrites = [];
const ingressCalls = [];
const records = new Map();

const repository = {
  getSourceConnection: (workspaceId, sourceId) => (
    records.get(`${workspaceId}::${sourceId}`) ?? null
  ),
  upsertSourceConnection: (input) => {
    const record = {
      connection_id: 'conn_security_fixture',
      workspace_id: input.workspace_id,
      source_id: input.source_id,
      credential_ref: input.credential_ref,
      safe_metadata: structuredClone(input.safe_metadata),
      created_at: '2026-09-23T00:00:00.000Z',
      updated_at: '2026-09-23T00:00:00.000Z',
    };
    records.set(`${input.workspace_id}::${input.source_id}`, record);
    return structuredClone(record);
  },
  deleteSourceConnection: () => null,
  restoreSourceConnection: () => {
    throw new Error('Not used by the provisioning security fixture.');
  },
  countSourceConnectionsByCredentialRef: () => 0,
  rebindSourceConnections: () => {
    throw new Error('Not used by the new-connection security fixture.');
  },
};

const credentialStore = {
  hasCredential: async () => true,
  readCredential: async () => null,
  writeCredential: async (reference, value) => {
    credentialWrites.push([reference, value]);
  },
  deleteCredential: async () => undefined,
};

const acquirer = new MainProcessSerpApiCredentialAcquirer({
  secret_ingress: {
    requestSecret: async (request) => {
      ingressCalls.push(structuredClone(request));
      return { status: 'SUBMITTED', secret: syntheticKey };
    },
  },
  credential_store: credentialStore,
  credential_ref_factory: () => credentialRef,
});

const service = new WorkspaceConnectionManagementService({
  repository,
  credential_store: credentialStore,
  google_credential_acquirer: {
    acquire: async () => {
      throw new Error('Google acquisition is outside this fixture.');
    },
  },
  serpapi_credential_acquirer: acquirer,
  refresh_safe_state: async () => undefined,
  record_diagnostic: (event) => diagnostics.push(structuredClone(event)),
});

const handlers = createDesktopConnectionWriteHandlers({
  assertTrustedSender: (event) => {
    if (event.trusted !== true) throw new Error('Untrusted IPC sender.');
  },
  service: {
    manage: (intent) => service.manage(intent),
    disconnect: (intent) => service.disconnect(intent),
    connectGoogle: (intent) => service.connectGoogle(intent),
    reconnectGoogle: (intent) => service.reconnectGoogle(intent),
    provisionSerpApi: (intent) => service.provisionSerpApi(intent),
  },
});

async function main() {
  const rendererIntent = {
    workspace_id: 'ws_security_fixture',
    source_id: 'serpapi',
  };
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  for (const method of Object.keys(originalConsole)) {
    console[method] = (...args) => {
      capturedLogs.push([method, ...structuredClone(args)]);
    };
  }

  let handlerResponse;
  try {
    handlerResponse = await handlers.provisionSerpApi(
      { trusted: true },
      rendererIntent,
    );
  } finally {
    Object.assign(console, originalConsole);
  }

  assert.deepEqual(ingressCalls, [{ purpose: 'SERPAPI_API_KEY' }]);
  assert.deepEqual(credentialWrites, [[credentialRef, syntheticKey]]);
  assert.deepEqual(handlerResponse, {
    ok: true,
    result: {
      source_id: 'serpapi',
      action: 'PROVISION_SERPAPI',
      outcome: 'SUCCEEDED',
    },
  });

  const safeReadFixture = [{
    source_id: 'serpapi',
    credential_status: 'AVAILABLE',
    readiness_status: 'READY',
  }];
  const rendererSafeSurfaces = JSON.stringify({
    rendererIntent,
    handlerResponse,
    diagnostics,
    capturedLogs,
    ordinaryConfigWrites,
    exportWrites,
    safeReadFixture,
  });
  assert.equal(rendererSafeSurfaces.includes(syntheticKey), false);
  assert.equal(rendererSafeSurfaces.includes(credentialRef), false);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(capturedLogs, []);
  assert.deepEqual(ordinaryConfigWrites, []);
  assert.deepEqual(exportWrites, []);

  originalConsole.log('PASS SERPAPI-PROVISIONING-SECURITY-001');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
