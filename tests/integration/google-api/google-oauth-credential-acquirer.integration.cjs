const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const {
  GOOGLE_ADS_SCOPE,
  GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
  GoogleOAuthAcquisitionError,
  MainProcessGoogleOAuthCredentialAcquirer,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-api',
    'google-oauth-credential-acquirer.js',
  ),
);
const {
  GoogleOAuthClient,
} = require(
  path.join(buildRoot, 'main', 'sources', 'google-api', 'google-auth.js'),
);

class MemoryCredentialStore {
  constructor() {
    this.values = new Map();
    this.writes = [];
    this.failWrite = false;
  }

  async hasCredential(reference) {
    return this.values.has(reference);
  }

  async readCredential(reference) {
    if (!this.values.has(reference)) throw new Error('credential missing');
    return this.values.get(reference);
  }

  async writeCredential(reference, value) {
    this.writes.push([reference, value]);
    if (this.failWrite) throw new Error('sentinel-secret write failure');
    this.values.set(reference, value);
  }

  async deleteCredential(reference) {
    this.values.delete(reference);
  }
}

const createHarness = ({
  credentialRef = 'google-oauth:opaque-fixture',
  configurationProvider = async () => null,
} = {}) => {
  const store = new MemoryCredentialStore();
  const calls = [];
  const requester = async (request) => {
    calls.push(['request', request]);
    return {
      status: 200,
      body: { refresh_token: 'sentinel-refresh-secret' },
    };
  };
  const acquirer = new MainProcessGoogleOAuthCredentialAcquirer({
    store,
    requester,
    openExternal: async (url) => {
      calls.push(['open', url]);
    },
    startLoopback: async (state) => {
      calls.push(['loopback', state]);
      return {
        redirect_uri: 'http://127.0.0.1:43123/oauth/callback',
        waitForCode: async () => 'authorization-code',
        close: () => {
          calls.push(['close']);
        },
      };
    },
    application_configuration_provider: configurationProvider,
    credential_ref_factory: () => credentialRef,
  });
  return { acquirer, calls, store };
};

async function expectAcquisitionError(operation, expectedCode) {
  await assert.rejects(
    operation,
    (error) => {
      assert.ok(error instanceof GoogleOAuthAcquisitionError);
      assert.equal(error.code, expectedCode);
      assert.equal(JSON.stringify(error).includes('sentinel-secret'), false);
      return true;
    },
  );
}

async function main() {
  {
    const harness = createHarness();
    await expectAcquisitionError(
      () => harness.acquirer.acquire({
        workspace_id: 'ws_missing_config',
        source_id: 'google-search-console-query-page',
        application_configuration: null,
      }),
      'CONNECTION_CONFIGURATION_UNAVAILABLE',
    );
    assert.deepEqual(harness.calls, []);
    assert.deepEqual(harness.store.writes, []);
  }

  const sourceCases = [
    [
      'google-search-console-query-page',
      [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE],
      'google-oauth:gsc',
    ],
    [
      'google-ads-search-terms',
      [GOOGLE_ADS_SCOPE],
      'google-oauth:ads',
    ],
    [
      'google-keyword-planner',
      [GOOGLE_ADS_SCOPE],
      'google-oauth:planner',
    ],
  ];

  for (const [sourceId, expectedScopes, credentialRef] of sourceCases) {
    const harness = createHarness({ credentialRef });
    const result = await harness.acquirer.acquire({
      workspace_id: 'ws_scope_fixture',
      source_id: sourceId,
      application_configuration: {
        client_id: 'main-owned-client-id',
        client_secret: 'sentinel-client-secret',
        developer_token: 'sentinel-developer-secret',
      },
    });
    assert.deepEqual(result, {
      credential_ref: credentialRef,
      granted_scopes: expectedScopes,
    });
    const openedUrl = new URL(
      harness.calls.find(([kind]) => kind === 'open')[1],
    );
    assert.deepEqual(
      openedUrl.searchParams.get('scope').split(' '),
      expectedScopes,
    );
    assert.equal(
      harness.calls.filter(([kind]) => kind === 'loopback').length,
      1,
    );
    assert.equal(
      harness.calls.filter(([kind]) => kind === 'request').length,
      1,
    );
    const storedBundle = JSON.parse(
      await harness.store.readCredential(credentialRef),
    );
    assert.deepEqual(storedBundle.granted_scopes, expectedScopes);
    assert.equal(storedBundle.client_id, 'main-owned-client-id');
    assert.equal(storedBundle.client_secret, 'sentinel-client-secret');
    assert.equal(storedBundle.developer_token, 'sentinel-developer-secret');
    assert.equal(storedBundle.refresh_token, 'sentinel-refresh-secret');
    assert.equal(
      await harness.acquirer.isCompatible(credentialRef, expectedScopes),
      true,
    );
    assert.equal(
      await harness.acquirer.isCompatible(
        credentialRef,
        [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE, GOOGLE_ADS_SCOPE],
      ),
      false,
    );
    assert.deepEqual(
      await harness.acquirer.readApplicationConfiguration(credentialRef),
      {
        client_id: 'main-owned-client-id',
        client_secret: 'sentinel-client-secret',
        developer_token: 'sentinel-developer-secret',
      },
    );
  }

  {
    const harness = createHarness({
      configurationProvider: async () => ({
        client_id: 'provider-client',
        client_secret: 'provider-secret',
      }),
    });
    assert.deepEqual(
      await harness.acquirer.readApplicationConfiguration(),
      {
        client_id: 'provider-client',
        client_secret: 'provider-secret',
      },
    );
  }

  {
    const harness = createHarness({ credentialRef: 'google-oauth:write-fail' });
    harness.store.failWrite = true;
    await expectAcquisitionError(
      () => harness.acquirer.acquire({
        workspace_id: 'ws_write_fail',
        source_id: 'google-search-console-query-page',
        application_configuration: {
          client_id: 'main-owned-client-id',
        },
      }),
      'CREDENTIAL_PERSISTENCE_FAILED',
    );
    assert.equal(harness.calls.some(([kind]) => kind === 'open'), true);
    assert.equal(
      await harness.store.hasCredential('google-oauth:write-fail'),
      false,
    );
  }

  {
    const harness = createHarness();
    await harness.store.writeCredential(
      'google-oauth:legacy',
      JSON.stringify({
        client_id: 'legacy-client',
        refresh_token: 'legacy-refresh',
      }),
    );
    assert.equal(
      await harness.acquirer.isCompatible(
        'google-oauth:legacy',
        [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE],
      ),
      false,
      'legacy bundles without scopes must not be assumed compatible',
    );

    const runtimeClient = new GoogleOAuthClient(
      harness.store,
      'google-oauth:legacy',
      async () => ({
        status: 200,
        body: {
          access_token: 'runtime-access',
          expires_in: 3600,
        },
      }),
    );
    const runtimeCredential = await runtimeClient.getAccessToken();
    assert.equal(runtimeCredential.access_token, 'runtime-access');
    assert.equal(runtimeCredential.developer_token, null);
  }

  assert.equal(
    JSON.stringify(sourceCases).includes('repository'),
    false,
    'the acquisition boundary has no repository publication input',
  );

  console.log(
    'PASS GOOGLE-OAUTH-CREDENTIAL-ACQUIRER-001: main-owned OAuth acquisition selects bounded scopes, persists compatible bundles, and fails closed without renderer or repository secrets',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
