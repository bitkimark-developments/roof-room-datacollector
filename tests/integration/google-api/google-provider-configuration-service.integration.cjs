const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const {
  GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF,
  GoogleProviderConfigurationService,
  readGoogleProviderConfiguration,
} = require(path.join(
  buildRoot,
  'main',
  'sources',
  'google-api',
  'google-provider-configuration.js',
));

class MemoryCredentialStore {
  values = new Map();
  failNextWrite = false;

  async hasCredential(reference) {
    return this.values.has(reference);
  }

  async readCredential(reference) {
    if (!this.values.has(reference)) throw new Error('missing');
    return this.values.get(reference);
  }

  async writeCredential(reference, value) {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('synthetic write failure');
    }
    this.values.set(reference, value);
  }

  async deleteCredential(reference) {
    this.values.delete(reference);
  }
}

const submitted = (secret) => ({ status: 'SUBMITTED', secret });

const main = async () => {
  const store = new MemoryCredentialStore();
  const requests = [];
  const answers = [
    submitted('synthetic-client-id.apps.googleusercontent.com'),
    submitted('synthetic-client-secret'),
    submitted('synthetic-developer-token'),
  ];
  const service = new GoogleProviderConfigurationService({
    credential_store: store,
    secret_ingress: {
      requestSecret: async (input) => {
        requests.push(structuredClone(input));
        return answers.shift();
      },
    },
  });

  assert.deepEqual(await service.getStatus(), {
    oauth_application_status: 'NOT_CONFIGURED',
    ads_developer_token_status: 'NOT_CONFIGURED',
  });

  const oauthResult = await service.configure({
    component: 'OAUTH_APPLICATION',
  });
  assert.deepEqual(oauthResult, {
    ok: true,
    result: {
      component: 'OAUTH_APPLICATION',
      status: {
        oauth_application_status: 'AVAILABLE',
        ads_developer_token_status: 'NOT_CONFIGURED',
      },
    },
  });
  assert.deepEqual(requests, [
    { purpose: 'GOOGLE_OAUTH_CLIENT_ID' },
    { purpose: 'GOOGLE_OAUTH_CLIENT_SECRET' },
  ]);
  assert.equal(
    JSON.stringify(oauthResult).includes('synthetic-client'),
    false,
    'Safe provisioning results must not return submitted values.',
  );

  const oauthConfiguration = await readGoogleProviderConfiguration(store);
  assert.deepEqual(oauthConfiguration, {
    client_id: 'synthetic-client-id.apps.googleusercontent.com',
    client_secret: 'synthetic-client-secret',
  });

  const developerResult = await service.configure({
    component: 'ADS_DEVELOPER_TOKEN',
  });
  assert.equal(developerResult.ok, true);
  assert.deepEqual(requests[2], {
    purpose: 'GOOGLE_ADS_DEVELOPER_TOKEN',
  });
  assert.deepEqual(await service.getStatus(), {
    oauth_application_status: 'AVAILABLE',
    ads_developer_token_status: 'AVAILABLE',
  });
  assert.deepEqual(await readGoogleProviderConfiguration(store), {
    client_id: 'synthetic-client-id.apps.googleusercontent.com',
    client_secret: 'synthetic-client-secret',
    developer_token: 'synthetic-developer-token',
  });

  const beforeCancellation = await store.readCredential(
    GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF,
  );
  const cancellationService = new GoogleProviderConfigurationService({
    credential_store: store,
    secret_ingress: {
      requestSecret: async ({ purpose }) => (
        purpose === 'GOOGLE_OAUTH_CLIENT_ID'
          ? submitted('replacement-client-id.apps.googleusercontent.com')
          : { status: 'CANCELLED' }
      ),
    },
  });
  assert.deepEqual(
    await cancellationService.configure({ component: 'OAUTH_APPLICATION' }),
    {
      ok: false,
      error: {
        code: 'SECRET_INGRESS_CANCELLED',
        retryable: false,
      },
    },
  );
  assert.equal(
    await store.readCredential(GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF),
    beforeCancellation,
    'Cancelling the second prompt must preserve the complete prior configuration.',
  );

  const failedReplacementService = new GoogleProviderConfigurationService({
    credential_store: store,
    secret_ingress: {
      requestSecret: async ({ purpose }) => submitted(
        purpose === 'GOOGLE_OAUTH_CLIENT_ID'
          ? 'replacement-client-id.apps.googleusercontent.com'
          : 'replacement-client-secret',
      ),
    },
  });
  store.failNextWrite = true;
  assert.deepEqual(
    await failedReplacementService.configure({ component: 'OAUTH_APPLICATION' }),
    {
      ok: false,
      error: {
        code: 'CREDENTIAL_PERSISTENCE_FAILED',
        retryable: true,
      },
    },
  );
  assert.equal(
    await store.readCredential(GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF),
    beforeCancellation,
    'A failed replacement write must preserve the prior configuration.',
  );

  assert.equal(
    await service.isReadyForSource('google-search-console-query-page'),
    true,
  );
  assert.equal(
    await service.isReadyForSource('google-ads-search-terms'),
    true,
  );
  assert.equal(
    await service.isReadyForSource('google-keyword-planner'),
    true,
  );

  console.log(
    'PASS GOOGLE-PROVIDER-CONFIGURATION-001: main-only Google provider provisioning is shared, safe, readiness-aware, and preserves prior configuration on cancel or write failure',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
