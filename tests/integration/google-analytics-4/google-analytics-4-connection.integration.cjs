const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const oauth = require(path.join(
  buildRoot,
  'main',
  'sources',
  'google-api',
  'google-oauth-credential-acquirer.js',
));

const desktop = require(path.join(
  buildRoot,
  'shared',
  'desktop-multisource.js',
));

const connectionContracts = require(path.join(
  buildRoot,
  'shared',
  'workspace-connection-management.js',
));

assert.ok(
  desktop.DESKTOP_CREDENTIAL_MANAGED_SOURCE_IDS.includes('google-analytics-4'),
  'GA4 must be credential-managed',
);

assert.ok(
  connectionContracts.DESKTOP_GOOGLE_CONNECTION_SOURCE_IDS.includes(
    'google-analytics-4',
  ),
  'GA4 must use the Google Workspace connection boundary',
);

const {
  WorkspaceConnectionIntentValidationError,
  normalizeConnectGoogleWorkspaceConnectionIntent,
  normalizeManageWorkspaceConnectionIntent,
  normalizeReconnectGoogleWorkspaceConnectionIntent,
} = require(path.join(
  buildRoot,
  'main',
  'app',
  'workspace-connection-metadata.js',
));

assert.equal(
  oauth.GOOGLE_ANALYTICS_READONLY_SCOPE,
  'https://www.googleapis.com/auth/analytics.readonly',
  'GA4 must have its own Analytics readonly OAuth scope',
);

class MemoryCredentialStore {
  constructor() {
    this.values = new Map();
  }

  async hasCredential(reference) {
    return this.values.has(reference);
  }

  async readCredential(reference) {
    if (!this.values.has(reference)) throw new Error('credential missing');
    return this.values.get(reference);
  }

  async writeCredential(reference, value) {
    this.values.set(reference, value);
  }

  async deleteCredential(reference) {
    this.values.delete(reference);
  }
}

const calls = [];
const store = new MemoryCredentialStore();

const acquirer = new oauth.MainProcessGoogleOAuthCredentialAcquirer({
  store,
  requester: async (request) => {
    calls.push(['request', request]);
    return {
      status: 200,
      body: { refresh_token: 'sentinel-refresh-secret' },
    };
  },
  openExternal: async (url) => {
    calls.push(['open', url]);
  },
  startLoopback: async (state) => ({
    redirect_uri: 'http://127.0.0.1:43123/oauth/callback',
    waitForCode: async () => 'authorization-code',
    close: () => undefined,
  }),
  credential_ref_factory: () => 'google-oauth:ga4-fixture',
});

const expectInvalid = (operation, label) => {
  assert.throws(
    operation,
    (error) => {
      assert.ok(
        error instanceof WorkspaceConnectionIntentValidationError,
        label,
      );
      assert.equal(error.code, 'INVALID_CONNECTION_INTENT', label);
      return true;
    },
  );
};

async function main() {
  const acquired = await acquirer.acquire({
    workspace_id: 'ws_ga4',
    source_id: 'google-analytics-4',
    application_configuration: {
      client_id: 'main-owned-client-id',
      client_secret: 'sentinel-client-secret',
    },
  });

  assert.deepEqual(acquired, {
    credential_ref: 'google-oauth:ga4-fixture',
    granted_scopes: [oauth.GOOGLE_ANALYTICS_READONLY_SCOPE],
  });

  const openedUrl = new URL(
    calls.find(([kind]) => kind === 'open')[1],
  );

  assert.deepEqual(
    openedUrl.searchParams.get('scope').split(' '),
    [oauth.GOOGLE_ANALYTICS_READONLY_SCOPE],
    'GA4 authorization must not silently request the Ads scope',
  );

  assert.deepEqual(
    normalizeManageWorkspaceConnectionIntent({
      workspace_id: ' ws_ga4 ',
      source_id: 'google-analytics-4',
      metadata: {
        property_id: ' 123456789 ',
      },
    }),
    {
      workspace_id: 'ws_ga4',
      source_id: 'google-analytics-4',
      metadata: {
        property_id: '123456789',
      },
    },
  );

  assert.deepEqual(
    normalizeConnectGoogleWorkspaceConnectionIntent({
      workspace_id: 'ws_ga4',
      source_id: 'google-analytics-4',
      metadata: {
        property_id: '987654321',
      },
    }),
    {
      workspace_id: 'ws_ga4',
      source_id: 'google-analytics-4',
      metadata: {
        property_id: '987654321',
      },
    },
  );

  assert.deepEqual(
    normalizeReconnectGoogleWorkspaceConnectionIntent({
      workspace_id: 'ws_ga4',
      source_id: 'google-analytics-4',
    }),
    {
      workspace_id: 'ws_ga4',
      source_id: 'google-analytics-4',
    },
  );

  for (const propertyId of [
    '',
    '   ',
    'properties/123456789',
    'G-ABC123',
    '12-34',
    'abc',
  ]) {
    expectInvalid(
      () => normalizeManageWorkspaceConnectionIntent({
        workspace_id: 'ws_ga4',
        source_id: 'google-analytics-4',
        metadata: {
          property_id: propertyId,
        },
      }),
      `GA4 must reject invalid property_id ${JSON.stringify(propertyId)}`,
    );
  }

  expectInvalid(
    () => normalizeManageWorkspaceConnectionIntent({
      workspace_id: 'ws_ga4',
      source_id: 'google-analytics-4',
      metadata: {
        property_id: '123456789',
        measurement_id: 'G-SENTINEL',
      },
    }),
    'GA4 safe metadata must reject Measurement ID',
  );

  expectInvalid(
    () => normalizeManageWorkspaceConnectionIntent({
      workspace_id: 'ws_ga4',
      source_id: 'google-analytics-4',
      metadata: {
        property_id: '123456789',
        api_key: 'sentinel-secret',
      },
    }),
    'GA4 safe metadata must reject API keys',
  );

  console.log(
    'PASS GA4-CONNECTION-001: Analytics OAuth scope and digits-only Property ID metadata are exact',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
