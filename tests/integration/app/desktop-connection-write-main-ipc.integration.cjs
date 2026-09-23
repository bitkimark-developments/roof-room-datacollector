const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const { IPC_CHANNELS } = require(
  path.join(buildRoot, 'shared', 'application-info.js'),
);
const {
  createDesktopConnectionWriteHandlers,
} = require(
  path.join(buildRoot, 'main', 'app', 'desktop-connection-write-ipc.js'),
);

const expectedChannels = {
  DESKTOP_CONNECTION_MANAGE: 'desktop:connection:manage',
  DESKTOP_CONNECTION_DISCONNECT: 'desktop:connection:disconnect',
  DESKTOP_CONNECTION_CONNECT_GOOGLE: 'desktop:connection:connect-google',
  DESKTOP_CONNECTION_RECONNECT_GOOGLE: 'desktop:connection:reconnect-google',
};

for (const [name, channel] of Object.entries(expectedChannels)) {
  assert.equal(IPC_CHANNELS[name], channel);
}

const calls = [];
const service = {};
for (const method of ['manage', 'disconnect', 'connectGoogle', 'reconnectGoogle']) {
  service[method] = async (intent) => {
    calls.push(['service', method, structuredClone(intent)]);
    const action = {
      manage: 'MANAGE_METADATA',
      disconnect: 'DISCONNECT',
      connectGoogle: 'CONNECT_GOOGLE',
      reconnectGoogle: 'RECONNECT_GOOGLE',
    }[method];
    return {
      ok: true,
      result: {
        source_id: intent.source_id,
        action,
        outcome: 'SUCCEEDED',
      },
    };
  };
}

const handlers = createDesktopConnectionWriteHandlers({
  assertTrustedSender: (event) => {
    calls.push(['trusted', event.marker]);
    if (event.marker !== 'trusted') throw new Error('Untrusted IPC sender.');
  },
  service,
});

const valid = {
  manage: {
    workspace_id: ' ws ',
    source_id: 'google-search-console-query-page',
    metadata: { site_url: ' sc-domain:example.com ' },
  },
  disconnect: {
    workspace_id: ' ws ',
    source_id: 'serpapi',
  },
  connectGoogle: {
    workspace_id: ' ws ',
    source_id: 'google-ads-search-terms',
    metadata: { customer_id: ' 123 ' },
  },
  reconnectGoogle: {
    workspace_id: ' ws ',
    source_id: 'google-keyword-planner',
  },
};

async function main() {
  for (const [name, handler] of Object.entries(handlers)) {
    const callsBefore = calls.length;
    await assert.rejects(
      () => handler(
        { marker: 'untrusted' },
        { credential_ref: 'cred:sentinel-secret' },
      ),
      /untrusted ipc sender/i,
    );
    assert.deepEqual(
      calls.slice(callsBefore),
      [['trusted', 'untrusted']],
      name + ' must verify trust before parsing input or invoking the service.',
    );
  }

  const invalidByHandler = {
    manage: [
      { workspace_id: 'ws', source_id: 'serpapi', metadata: {} },
      { ...valid.manage, credential_ref: 'cred:sentinel-secret' },
      { ...valid.manage, metadata: { ...valid.manage.metadata, api_key: 'sentinel-secret' } },
    ],
    disconnect: [
      { ...valid.disconnect, credential_ref: 'cred:sentinel-secret' },
      { ...valid.disconnect, api_key: 'sentinel-secret' },
    ],
    connectGoogle: [
      { workspace_id: 'ws', source_id: 'serpapi', metadata: {} },
      { ...valid.connectGoogle, oauth_refresh_token: 'sentinel-secret' },
      { ...valid.connectGoogle, metadata: { ...valid.connectGoogle.metadata, developer_token: 'sentinel-secret' } },
    ],
    reconnectGoogle: [
      { workspace_id: 'ws', source_id: 'serpapi' },
      { ...valid.reconnectGoogle, client_secret: 'sentinel-secret' },
    ],
  };

  for (const [name, invalidIntents] of Object.entries(invalidByHandler)) {
    for (const intent of invalidIntents) {
      const serviceCallsBefore = calls.filter(([kind]) => kind === 'service').length;
      const result = await handlers[name]({ marker: 'trusted' }, intent);
      assert.deepEqual(result, {
        ok: false,
        error: { code: 'INVALID_CONNECTION_INTENT', retryable: false },
      });
      assert.equal(
        calls.filter(([kind]) => kind === 'service').length,
        serviceCallsBefore,
        name + ' must reject unknown or secret-shaped fields before delegation.',
      );
    }
  }

  for (const [name, intent] of Object.entries(valid)) {
    const result = await handlers[name]({ marker: 'trusted' }, intent);
    assert.equal(result.ok, true);
    assert.equal(JSON.stringify(result).includes('sentinel-secret'), false);
  }
  assert.deepEqual(
    calls.filter(([kind]) => kind === 'service').map((entry) => entry.slice(1)),
    [
      ['manage', {
        workspace_id: 'ws',
        source_id: 'google-search-console-query-page',
        metadata: { site_url: 'sc-domain:example.com' },
      }],
      ['disconnect', { workspace_id: 'ws', source_id: 'serpapi' }],
      ['connectGoogle', {
        workspace_id: 'ws',
        source_id: 'google-ads-search-terms',
        metadata: { customer_id: '123' },
      }],
      ['reconnectGoogle', {
        workspace_id: 'ws',
        source_id: 'google-keyword-planner',
      }],
    ],
  );

  const unsafeHandlers = createDesktopConnectionWriteHandlers({
    assertTrustedSender: () => undefined,
    service: {
      manage: async () => ({
        ok: false,
        error: {
          code: 'OAUTH_ACQUISITION_FAILED',
          retryable: true,
          provider_error: 'sentinel-secret',
        },
      }),
      disconnect: service.disconnect,
      connectGoogle: service.connectGoogle,
      reconnectGoogle: service.reconnectGoogle,
    },
  });
  await assert.rejects(
    () => unsafeHandlers.manage({ marker: 'trusted' }, valid.manage),
    (error) => {
      assert.equal(String(error).includes('sentinel-secret'), false);
      assert.equal(String(error.stack).includes('sentinel-secret'), false);
      return /invalid response/i.test(String(error));
    },
  );

  console.log(
    'PASS DESKTOP-CONNECTION-WRITE-MAIN-IPC-001: trusted write handlers validate safe intents before delegation and reject unsafe service output',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
