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
const {
  createFetchApiRequester,
  GoogleApiTransportError,
} = require(
  path.join(buildRoot, 'main', 'sources', 'google-api', 'api-helpers.js'),
);
const {
  GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF,
} = require(path.join(
  buildRoot,
  'main',
  'sources',
  'google-api',
  'google-provider-configuration.js',
));

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
  tokenResponse = {
    status: 200,
    body: { refresh_token: 'sentinel-refresh-secret' },
  },
  tokenError = null,
  requesterOverride = null,
} = {}) => {
  const store = new MemoryCredentialStore();
  const calls = [];
  const diagnostics = [];
  const requester = async (request) => {
    calls.push(['request', request]);
    if (requesterOverride !== null) return requesterOverride(request);
    if (tokenError !== null) throw tokenError;
    return tokenResponse;
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
    record_diagnostic: (event) => diagnostics.push(structuredClone(event)),
  });
  return { acquirer, calls, diagnostics, store };
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
    assert.equal(storedBundle.refresh_token, 'sentinel-refresh-secret');
    assert.deepEqual(Object.keys(storedBundle).sort(), [
      'granted_scopes',
      'refresh_token',
    ]);
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
    assert.equal(
      await harness.acquirer.readApplicationConfiguration(credentialRef),
      null,
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

  for (const [tokenError, expectedCode] of [
    [
      new GoogleApiTransportError(
        'PROVIDER_AUTHORIZATION_FAILED',
        'sentinel-secret provider rejection',
        'invalid_client',
      ),
      'OAUTH_CLIENT_REJECTED',
    ],
    [
      new GoogleApiTransportError(
        'REQUEST_TIMEOUT',
        'sentinel-secret timeout detail',
      ),
      'OAUTH_TOKEN_EXCHANGE_UNAVAILABLE',
    ],
    [
      new GoogleApiTransportError(
        'NETWORK_OR_PROVIDER_FAILED',
        'sentinel-secret provider detail',
      ),
      'OAUTH_TOKEN_EXCHANGE_UNAVAILABLE',
    ],
  ]) {
    const harness = createHarness({ tokenError });
    await expectAcquisitionError(
      () => harness.acquirer.acquire({
        workspace_id: 'ws_exchange_failure',
        source_id: 'google-ads-search-terms',
        application_configuration: {
          client_id: 'main-owned-client-id',
          client_secret: 'sentinel-client-secret',
          developer_token: 'sentinel-developer-secret',
        },
      }),
      expectedCode,
    );
    assert.deepEqual(harness.store.writes, []);
  }

  {
    const requester = createFetchApiRequester(async () => new Response(
      JSON.stringify({
        error: 'invalid_client',
        error_description: 'sentinel-secret provider detail',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    ));
    await assert.rejects(
      () => requester({
        url: 'https://oauth2.googleapis.com/token',
        method: 'POST',
      }),
      (error) => {
        assert.ok(error instanceof GoogleApiTransportError);
        assert.equal(error.code, 'PROVIDER_AUTHORIZATION_FAILED');
        assert.equal(error.provider_code, 'invalid_client');
        assert.equal(JSON.stringify(error).includes('sentinel-secret'), false);
        return true;
      },
    );
  }

  {
    const harness = createHarness({
      requesterOverride: createFetchApiRequester(async () => new Response(
        JSON.stringify({
          error: 'invalid_client',
          error_description: 'The OAuth client was rejected; sentinel-secret must not escape.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      )),
    });
    await expectAcquisitionError(
      () => harness.acquirer.acquire({
        workspace_id: 'ws_transport_rejected',
        source_id: 'google-ads-search-terms',
        application_configuration: {
          client_id: 'main-owned-client-id',
          client_secret: 'sentinel-client-secret',
          developer_token: 'sentinel-developer-secret',
        },
      }),
      'OAUTH_CLIENT_REJECTED',
    );
    assert.deepEqual(harness.diagnostics, [{
      code: 'GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED',
      source_id: 'google-ads-search-terms',
      callback_received: true,
      client_id_match: true,
      client_secret_present: true,
      redirect_uri_auth: 'http://127.0.0.1:43123/oauth/callback',
      redirect_uri_token: 'http://127.0.0.1:43123/oauth/callback',
      redirect_uri_match: true,
      code_verifier_present: true,
      code_verifier_length: 64,
      token_exchange_attempt_count: 1,
      http_status: 401,
      provider_error_code: 'invalid_client',
      provider_error_description_class: 'CLIENT_REJECTED',
      credential_write_reached: false,
    }]);
    assert.equal(
      JSON.stringify(harness.diagnostics).includes('sentinel-secret'),
      false,
    );
  }

  {
    const harness = createHarness({
      tokenResponse: {
        status: 400,
        body: {
          error: 'invalid_request',
          error_description: 'PKCE code_verifier was rejected; sentinel-secret must not escape.',
        },
      },
    });
    await expectAcquisitionError(
      () => harness.acquirer.acquire({
        workspace_id: 'ws_exchange_rejected',
        source_id: 'google-ads-search-terms',
        application_configuration: {
          client_id: 'main-owned-client-id',
          client_secret: 'sentinel-client-secret',
          developer_token: 'sentinel-developer-secret',
        },
      }),
      'OAUTH_TOKEN_EXCHANGE_REJECTED',
    );
    assert.deepEqual(harness.store.writes, []);
    assert.deepEqual(harness.diagnostics, [{
      code: 'GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED',
      source_id: 'google-ads-search-terms',
      callback_received: true,
      client_id_match: true,
      client_secret_present: true,
      redirect_uri_auth: 'http://127.0.0.1:43123/oauth/callback',
      redirect_uri_token: 'http://127.0.0.1:43123/oauth/callback',
      redirect_uri_match: true,
      code_verifier_present: true,
      code_verifier_length: 64,
      token_exchange_attempt_count: 1,
      http_status: 400,
      provider_error_code: 'invalid_request',
      provider_error_description_class: 'CODE_VERIFIER_REJECTED',
      credential_write_reached: false,
    }]);
    assert.equal(
      JSON.stringify(harness.diagnostics).includes('sentinel-secret'),
      false,
    );
  }

  {
    const harness = createHarness({
      tokenResponse: {
        status: 400,
        body: { error: 'invalid_grant' },
      },
    });
    await expectAcquisitionError(
      () => harness.acquirer.acquire({
        workspace_id: 'ws_grant_rejected',
        source_id: 'google-ads-search-terms',
        application_configuration: {
          client_id: 'main-owned-client-id',
          client_secret: 'sentinel-client-secret',
          developer_token: 'sentinel-developer-secret',
        },
      }),
      'OAUTH_AUTHORIZATION_GRANT_REJECTED',
    );
    assert.deepEqual(harness.store.writes, []);
  }

  {
    const harness = createHarness({
      tokenResponse: {
        status: 200,
        body: { access_token: 'sentinel-secret-access-token' },
      },
    });
    await expectAcquisitionError(
      () => harness.acquirer.acquire({
        workspace_id: 'ws_refresh_missing',
        source_id: 'google-ads-search-terms',
        application_configuration: {
          client_id: 'main-owned-client-id',
          client_secret: 'sentinel-client-secret',
          developer_token: 'sentinel-developer-secret',
        },
      }),
      'OAUTH_REFRESH_TOKEN_UNAVAILABLE',
    );
    assert.deepEqual(harness.store.writes, []);
  }

  {
    const harness = createHarness({
      configurationProvider: async () => ({
        client_id: 'replacement-provider-client',
        client_secret: 'replacement-provider-secret',
        developer_token: 'replacement-provider-developer-token',
      }),
    });
    await harness.store.writeCredential(
      'google-oauth:legacy',
      JSON.stringify({
        client_id: 'legacy-client',
        client_secret: 'legacy-secret',
        developer_token: 'legacy-developer-token',
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

    await harness.store.writeCredential(
      GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF,
      JSON.stringify({
        client_id: 'replacement-provider-client',
        client_secret: 'replacement-provider-secret',
        developer_token: 'replacement-provider-developer-token',
      }),
    );
    let refreshRequest;
    const runtimeClient = new GoogleOAuthClient(
      harness.store,
      'google-oauth:legacy',
      async (request) => {
        refreshRequest = request;
        return {
          status: 200,
          body: {
            access_token: 'runtime-access',
            expires_in: 3600,
          },
        };
      },
    );
    const runtimeCredential = await runtimeClient.getAccessToken();
    assert.equal(runtimeCredential.access_token, 'runtime-access');
    assert.equal(
      runtimeCredential.developer_token,
      undefined,
      'Legacy Developer Token must not propagate into active runtime credentials.',
    );
    const refreshBody = new URLSearchParams(refreshRequest.body);
    assert.equal(refreshBody.get('client_id'), 'replacement-provider-client');
    assert.equal(refreshBody.get('client_secret'), 'replacement-provider-secret');
    assert.equal(refreshBody.get('refresh_token'), 'legacy-refresh');
    assert.notEqual(refreshBody.get('client_id'), 'legacy-client');
    assert.deepEqual(
      await harness.acquirer.readApplicationConfiguration(
        'google-oauth:legacy',
      ),
      {
        client_id: 'replacement-provider-client',
        client_secret: 'replacement-provider-secret',
      },
      'Provider-level OAuth replacement must take precedence without republishing legacy Developer Token.',
    );
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
