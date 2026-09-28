const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) {
  throw new Error('Expected compiled build root and temporary work root.');
}

const {
  ElectronSafeStorageCredentialStore,
} = require(path.join(buildRoot, 'main/core/electron-safe-storage-credential-store.js'));
const {
  bootstrapGoogleOAuth,
} = require(path.join(buildRoot, 'main/sources/google-api/google-auth.js'));
const {
  GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF,
} = require(path.join(
  buildRoot,
  'main/sources/google-api/google-provider-configuration.js',
));
const {
  GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
  GoogleApiRuntimeFactory,
  assertGoogleLiveAcceptanceConfirmation,
} = require(path.join(buildRoot, 'main/sources/google-api/google-api-runtime.js'));
const {
  googleSearchConsoleReadiness,
} = require(path.join(buildRoot, 'main/sources/google-api/google-api-readiness.js'));
const {
  createFetchApiRequester,
} = require(path.join(buildRoot, 'main/sources/google-api/api-helpers.js'));
const {
  GSC_QUERY_PAGE_SOURCE_ID,
  GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
  GOOGLE_KEYWORD_PLANNER_SOURCE_ID,
} = require(path.join(buildRoot, 'shared/google-api.js'));

const credentialDirectory = path.join(workRoot, 'credentials');
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (plainText) => Buffer.from(
    `encrypted:${Buffer.from(plainText).toString('base64url')}`,
  ),
  decryptString: (encrypted) => Buffer.from(
    encrypted.toString().slice('encrypted:'.length),
    'base64url',
  ).toString(),
};

(async () => {
  const store = new ElectronSafeStorageCredentialStore(
    credentialDirectory,
    encryption,
  );
  const records = new Map();
  const repository = {
    getSourceConnection: (workspaceId, sourceId) =>
      records.get(`${workspaceId}:${sourceId}`) ?? null,
    upsertSourceConnection: (input) => {
      const record = {
        connection_id: `connection:${input.source_id}`,
        ...input,
        created_at: '2026-09-10T00:00:00.000Z',
        updated_at: '2026-09-10T00:00:00.000Z',
      };
      records.set(`${input.workspace_id}:${input.source_id}`, record);
      return record;
    },
    countSourceConnectionsByCredentialRef: (credentialRef) => (
      [...records.values()].filter(
        (record) => record.credential_ref === credentialRef,
      ).length
    ),
  };

  let expectedState;
  let openedAuthorizationUrl;
  let loopbackClosed = false;
  const tokenRequests = [];
  const providerRequests = [];
  const requester = async (request) => {
    if (request.url === 'https://oauth2.googleapis.com/token') {
      tokenRequests.push(request);
      if (new URLSearchParams(request.body).get('grant_type') === 'authorization_code') {
        return { status: 200, body: { refresh_token: 'refresh-secret' } };
      }
      return {
        status: 200,
        body: {
          access_token: 'access-secret',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      };
    }

    providerRequests.push(request);
    if (request.url.includes('/searchAnalytics/query')) {
      return {
        status: 200,
        body: {
          rows: [{
            keys: ['ficus', 'https://bitkimark.com/ficus'],
            clicks: 1,
            impressions: 2,
            ctr: 0.5,
            position: 3,
          }],
        },
      };
    }
    if (request.url.includes('googleAds:searchStream')) {
      return { status: 200, body: [{ search_term: 'ficus' }] };
    }
    if (request.url.includes('generateKeywordHistoricalMetrics')) {
      return {
        status: 200,
        body: [{ requested_keyword: 'ficus', metrics: {} }],
      };
    }
    throw new Error(`Unexpected request: ${request.url}`);
  };

  let unconfirmedOpened = false;
  let unconfirmedLoopbackStarted = false;
  await assert.rejects(() => bootstrapGoogleOAuth({
    workspace_id: 'workspace-a',
    source_id: GSC_QUERY_PAGE_SOURCE_ID,
    confirmation: undefined,
    client_id: 'client-id',
    scopes: [],
    safe_metadata: {},
  }, {
    store,
    repository,
    requester,
    openExternal: async () => { unconfirmedOpened = true; },
    startLoopback: async () => {
      unconfirmedLoopbackStarted = true;
      return {
        redirect_uri: 'http://127.0.0.1:43123/oauth/callback',
        waitForCode: async () => 'should-not-run',
        close: () => undefined,
      };
    },
  }), /explicit confirmation/u);
  assert.equal(unconfirmedOpened, false);
  assert.equal(unconfirmedLoopbackStarted, false);

  const sharedOldReference = 'google-oauth:shared-old';
  const sharedStore = new ElectronSafeStorageCredentialStore(
    path.join(workRoot, 'shared-credentials'),
    encryption,
  );
  await sharedStore.writeCredential(sharedOldReference, JSON.stringify({
    client_id: 'shared-client',
    refresh_token: 'shared-refresh',
  }));
  repository.upsertSourceConnection({
    workspace_id: 'workspace-shared-target',
    source_id: GSC_QUERY_PAGE_SOURCE_ID,
    credential_ref: sharedOldReference,
    safe_metadata: { site_url: 'sc-domain:shared.example' },
  });
  repository.upsertSourceConnection({
    workspace_id: 'workspace-shared-consumer',
    source_id: GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
    credential_ref: sharedOldReference,
    safe_metadata: { customer_id: 'shared-customer' },
  });
  await bootstrapGoogleOAuth({
    workspace_id: 'workspace-shared-target',
    source_id: GSC_QUERY_PAGE_SOURCE_ID,
    confirmation: GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
    client_id: 'client-id',
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    safe_metadata: { site_url: 'sc-domain:shared.example' },
  }, {
    store: sharedStore,
    repository,
    requester: async () => ({
      status: 200,
      body: { refresh_token: 'shared-new-refresh' },
    }),
    openExternal: async () => undefined,
    startLoopback: async () => ({
      redirect_uri: 'http://127.0.0.1:43124/oauth/callback',
      waitForCode: async () => 'shared-authorization-code',
      close: () => undefined,
    }),
  });
  assert.equal(
    await sharedStore.hasCredential(sharedOldReference),
    true,
    'bootstrap cleanup must retain a credential that another row still references',
  );

  const cleanupOldReference = 'google-oauth:cleanup-old';
  const cleanupInnerStore = new ElectronSafeStorageCredentialStore(
    path.join(workRoot, 'cleanup-credentials'),
    encryption,
  );
  await cleanupInnerStore.writeCredential(
    cleanupOldReference,
    JSON.stringify({
      client_id: 'cleanup-client',
      refresh_token: 'cleanup-refresh',
    }),
  );
  repository.upsertSourceConnection({
    workspace_id: 'workspace-cleanup-warning',
    source_id: GSC_QUERY_PAGE_SOURCE_ID,
    credential_ref: cleanupOldReference,
    safe_metadata: { site_url: 'sc-domain:cleanup.example' },
  });
  const cleanupStore = {
    hasCredential: (reference) => (
      cleanupInnerStore.hasCredential(reference)
    ),
    readCredential: (reference) => (
      cleanupInnerStore.readCredential(reference)
    ),
    writeCredential: (reference, value) => (
      cleanupInnerStore.writeCredential(reference, value)
    ),
    deleteCredential: async (reference) => {
      if (reference === cleanupOldReference) {
        throw new Error('sentinel cleanup failure');
      }
      await cleanupInnerStore.deleteCredential(reference);
    },
  };
  const cleanupWarnings = [];
  const cleanupConnection = await bootstrapGoogleOAuth({
    workspace_id: 'workspace-cleanup-warning',
    source_id: GSC_QUERY_PAGE_SOURCE_ID,
    confirmation: GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
    client_id: 'client-id',
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    safe_metadata: { site_url: 'sc-domain:cleanup.example' },
  }, {
    store: cleanupStore,
    repository,
    requester: async () => ({
      status: 200,
      body: { refresh_token: 'cleanup-new-refresh' },
    }),
    openExternal: async () => undefined,
    startLoopback: async () => ({
      redirect_uri: 'http://127.0.0.1:43125/oauth/callback',
      waitForCode: async () => 'cleanup-authorization-code',
      close: () => undefined,
    }),
    recordCleanupWarning: (event) => cleanupWarnings.push(event),
  });
  assert.notEqual(cleanupConnection.credential_ref, cleanupOldReference);
  assert.equal(
    await cleanupInnerStore.hasCredential(cleanupConnection.credential_ref),
    true,
  );
  assert.deepEqual(cleanupWarnings, [{
    code: 'OBSOLETE_CREDENTIAL_CLEANUP_FAILED',
    workspace_id: 'workspace-cleanup-warning',
    source_id: GSC_QUERY_PAGE_SOURCE_ID,
  }]);

  const gscConnection = await bootstrapGoogleOAuth({
    workspace_id: 'workspace-a',
    source_id: GSC_QUERY_PAGE_SOURCE_ID,
    confirmation: GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
    client_id: 'client-id',
    client_secret: 'client-secret',
    developer_token: 'developer-secret',
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    safe_metadata: { site_url: 'sc-domain:bitkimark.com' },
  }, {
    store,
    repository,
    requester,
    openExternal: async (url) => { openedAuthorizationUrl = url; },
    startLoopback: async (state) => {
      expectedState = state;
      return {
        redirect_uri: 'http://127.0.0.1:43123/oauth/callback',
        waitForCode: async () => 'authorization-code',
        close: () => { loopbackClosed = true; },
      };
    },
  });

  const authorization = new URL(openedAuthorizationUrl);
  assert.equal(authorization.searchParams.get('state'), expectedState);
  assert.equal(loopbackClosed, true);
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authorization.searchParams.get('code_challenge').length >= 43);
  const exchangeBody = new URLSearchParams(tokenRequests[0].body);
  assert.equal(exchangeBody.get('code'), 'authorization-code');
  assert.equal(exchangeBody.get('code_verifier').length >= 43, true);
  assert.equal(
    tokenRequests[0].headers['Content-Type'],
    'application/x-www-form-urlencoded',
  );
  assert.equal(gscConnection.safe_metadata.site_url, 'sc-domain:bitkimark.com');
  assert.equal(gscConnection.safe_metadata.authorization_state, 'AUTHORIZED');
  assert.equal(JSON.stringify(gscConnection).includes('refresh-secret'), false);
  assert.equal(JSON.stringify(gscConnection).includes('client-secret'), false);
  assert.equal(JSON.stringify(gscConnection).includes('developer-secret'), false);

  const encryptedFiles = fs.readdirSync(credentialDirectory);
  assert.equal(encryptedFiles.length, 1);
  const encryptedBytes = fs.readFileSync(
    path.join(credentialDirectory, encryptedFiles[0]),
  ).toString();
  assert.equal(encryptedBytes.includes('refresh-secret'), false);
  assert.equal(encryptedBytes.includes('client-secret'), false);
  assert.equal(encryptedBytes.includes('developer-secret'), false);

  await store.writeCredential(
    GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF,
    JSON.stringify({
      client_id: 'client-id',
      client_secret: 'client-secret',
      developer_token: 'developer-secret',
    }),
  );

  for (const sourceId of [
    GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
    GOOGLE_KEYWORD_PLANNER_SOURCE_ID,
  ]) {
    repository.upsertSourceConnection({
      workspace_id: 'workspace-a',
      source_id: sourceId,
      credential_ref: gscConnection.credential_ref,
      safe_metadata: {
        customer_id: '1234567890',
        login_customer_id: '9876543210',
        authorization_state: 'AUTHORIZED',
      },
    });
  }

  const runtime = new GoogleApiRuntimeFactory(repository, store, requester);
  assert.throws(() => runtime.createLiveSearchConsoleSmokeSource({
    workspace_id: 'workspace-a',
    confirmation: 'no',
  }), /explicit confirmation/u);
  assert.throws(() => runtime.createLiveSearchTermsSmokeSource({
    workspace_id: 'workspace-a',
    query: 'SELECT search_term_view.search_term FROM search_term_view',
    confirmation: undefined,
  }), /explicit confirmation/u);
  assert.throws(() => runtime.createLiveKeywordPlannerSmokeSource({
    workspace_id: 'workspace-a',
    confirmation: undefined,
  }), /explicit confirmation/u);
  const gscResult = await runtime.createSearchConsoleSource({
    workspace_id: 'workspace-a',
  }).collect({
    source_context: {
      requested_date_start: '2026-06-12',
      requested_date_end: '2026-09-09',
    }
  });
  const searchTermsResult = await runtime.createSearchTermsSource({
    workspace_id: 'workspace-a',
  }).collect({
    source_id: 'google-ads-search-terms',
    source_context: {
      source_id: 'google-ads-search-terms', task_id: 'google-ads-search-terms',
      source_mode: 'search_term_view', campaign_type: 'SEARCH',
      requested_date_start: '2026-08-31', requested_date_end: '2026-09-16',
    },
  });
  const plannerResult = await runtime.createKeywordPlannerSource({
    workspace_id: 'workspace-a',
  }).collect({
    source_id: 'google-keyword-planner',
    source_context: {
      task_id: 'keyword-planner-historical-metrics',
      source_id: 'google-keyword-planner',
      source_mode: 'OFFICIAL_API',
      group_id: 'credential-fixture',
      group_name: 'Credential fixture',
      keywords: ['ficus', 'ficus çeşitleri'],
      requested_date_start: '2025-09-01',
      requested_date_end: '2026-08-31',
      country_code: 'TR',
      language_code: 'tr',
      keyword_plan_network: 'GOOGLE_SEARCH',
    },
  });

  assert.equal(gscResult.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(searchTermsResult.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(plannerResult.result_type, 'ARTIFACT_PRODUCED');
  assert.deepEqual(providerRequests.map((request) => request.headers.Authorization), [
    'Bearer access-secret',
    'Bearer access-secret',
    'Bearer access-secret',
  ]);
  assert.equal(providerRequests[0].headers['developer-token'], undefined);
  assert.equal(providerRequests[1].headers['developer-token'], 'developer-secret');
  assert.equal(providerRequests[1].headers['login-customer-id'], '9876543210');
  assert.equal(providerRequests[2].headers['developer-token'], 'developer-secret');
  assert.deepEqual(providerRequests[2].body.keywords, [
    'ficus',
    'ficus çeşitleri',
  ]);
  assert.equal(
    JSON.stringify([gscResult, searchTermsResult, plannerResult])
      .includes('secret'),
    false,
  );

  assert.equal(googleSearchConsoleReadiness({
    connection: gscConnection,
    credential_available: true,
  }), 'READY');
  assert.equal(googleSearchConsoleReadiness({
    connection: gscConnection,
    credential_available: false,
  }), 'CONNECTION_REQUIRED');
  assert.equal(googleSearchConsoleReadiness({
    connection: {
      ...gscConnection,
      safe_metadata: { authorization_state: 'REAUTHORIZATION_REQUIRED' },
    },
    credential_available: true,
  }), 'MANUAL_ACTION_REQUIRED');

  const expiredRuntime = new GoogleApiRuntimeFactory(
    repository,
    store,
    async () => ({ status: 400, body: { error: 'invalid_grant' } }),
  );
  const expiredResult = await expiredRuntime.createSearchConsoleSource({
    workspace_id: 'workspace-a',
  }).collect({
    source_context: {
      requested_date_start: '2026-06-12',
      requested_date_end: '2026-09-09',
    }
  });
  assert.equal(expiredResult.result_type, 'MANUAL_ACTION_REQUIRED');
  assert.equal(
    repository.getSourceConnection(
      'workspace-a',
      GSC_QUERY_PAGE_SOURCE_ID,
    ).safe_metadata.authorization_state,
    'REAUTHORIZATION_REQUIRED',
  );

  assert.throws(() => assertGoogleLiveAcceptanceConfirmation('yes'));
  assert.doesNotThrow(() => assertGoogleLiveAcceptanceConfirmation(
    GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
  ));

  await store.deleteCredential(gscConnection.credential_ref);
  assert.equal(await store.hasCredential(gscConnection.credential_ref), false);
  const missingCredentialResult = await runtime.createSearchConsoleSource({
      workspace_id: 'workspace-a',
    }).collect({
      source_context: {
        requested_date_start: '2026-06-12',
        requested_date_end: '2026-09-09',
      }
    });
  assert.equal(missingCredentialResult.result_type, 'FAILED');
  assert.equal(missingCredentialResult.error_code, 'CONNECTION_REQUIRED');

  const unavailableStore = new ElectronSafeStorageCredentialStore(
    path.join(workRoot, 'unavailable'),
    {
      ...encryption,
      isEncryptionAvailable: () => false,
    },
  );
  await assert.rejects(
    () => unavailableStore.writeCredential('credential', 'secret'),
    /unavailable/u,
  );
  assert.equal(await unavailableStore.hasCredential('credential'), false);

  let fetchInit;
  const fetchRequester = createFetchApiRequester(async (_url, init) => {
    fetchInit = init;
    return new Response(JSON.stringify({ access_token: 'bounded' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  await fetchRequester({
    url: 'https://oauth2.googleapis.com/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token',
  });
  assert.equal(fetchInit.body, 'grant_type=refresh_token');

  console.log(
    'PASS GOOGLE-CREDENTIAL-001: OS-encrypted credential boundary, PKCE bootstrap, readiness, and authenticated GSC/Ads runtime composition remain secret-free outside request scope',
  );
})();
