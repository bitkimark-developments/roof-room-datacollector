const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const {
  WorkspaceConnectionManagementService,
} = require(
  path.join(buildRoot, 'main', 'app', 'workspace-connection-management-service.js'),
);
const {
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
  googleAdsSearchTermsReadiness,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-api',
    'google-api-readiness.js',
  ),
);

const clone = (value) => structuredClone(value);
const keyOf = (workspaceId, sourceId) => workspaceId + '::' + sourceId;
const record = (
  workspaceId,
  sourceId,
  credentialRef,
  safeMetadata,
) => ({
  connection_id: 'conn:' + workspaceId + ':' + sourceId,
  workspace_id: workspaceId,
  source_id: sourceId,
  credential_ref: credentialRef,
  safe_metadata: clone(safeMetadata),
  created_at: '2026-09-22T10:00:00.000Z',
  updated_at: '2026-09-22T11:00:00.000Z',
});

class FakeRepository {
  constructor(records = []) {
    this.records = new Map(
      records.map((entry) => [
        keyOf(entry.workspace_id, entry.source_id),
        clone(entry),
      ]),
    );
    this.upserts = [];
    this.rebinds = [];
    this.failUpsert = false;
    this.failRebind = false;
    this.failGetFor = new Set();
  }

  getSourceConnection(workspaceId, sourceId) {
    if (this.failGetFor.has(keyOf(workspaceId, sourceId))) {
      throw new Error('sentinel-secret repository lookup failure');
    }
    const found = this.records.get(keyOf(workspaceId, sourceId));
    return found ? clone(found) : null;
  }

  upsertSourceConnection(input) {
    this.upserts.push(clone(input));
    if (this.failUpsert) throw new Error('sentinel-secret upsert failure');
    const key = keyOf(input.workspace_id, input.source_id);
    const current = this.records.get(key);
    const next = {
      connection_id: current?.connection_id ?? 'conn:new:' + input.source_id,
      workspace_id: input.workspace_id,
      source_id: input.source_id,
      credential_ref: input.credential_ref,
      safe_metadata: clone(input.safe_metadata),
      created_at: current?.created_at ?? '2026-09-23T00:00:00.000Z',
      updated_at: '2026-09-23T01:00:00.000Z',
    };
    this.records.set(key, next);
    return clone(next);
  }

  countSourceConnectionsByCredentialRef(credentialRef) {
    return [...this.records.values()].filter(
      (entry) => entry.credential_ref === credentialRef,
    ).length;
  }

  rebindSourceConnections(input) {
    this.rebinds.push(clone(input));
    if (this.failRebind) throw new Error('sentinel-secret rebind failure');
    for (const sourceId of input.source_ids) {
      const key = keyOf(input.workspace_id, sourceId);
      const current = this.records.get(key);
      if (!current || current.credential_ref !== input.expected_credential_ref) {
        throw new Error('expected credential mismatch');
      }
    }
    const updates = new Map(
      (input.safe_metadata_updates ?? []).map((update) => [
        update.source_id,
        update.safe_metadata,
      ]),
    );
    return input.source_ids.map((sourceId) => {
      const key = keyOf(input.workspace_id, sourceId);
      const current = this.records.get(key);
      const next = {
        ...current,
        credential_ref: input.replacement_credential_ref,
        safe_metadata: clone(updates.get(sourceId) ?? current.safe_metadata),
        updated_at: '2026-09-23T02:00:00.000Z',
      };
      this.records.set(key, next);
      return clone(next);
    });
  }

  deleteSourceConnection() {
    throw new Error('not used in Google tests');
  }

  restoreSourceConnection() {
    throw new Error('not used in Google tests');
  }
}

class VerticalMemoryCredentialStore {
  constructor(entries = []) {
    this.values = new Map(entries);
    this.writes = [];
    this.deletes = [];
  }

  async hasCredential(reference) {
    return this.values.has(reference);
  }

  async readCredential(reference) {
    if (!this.values.has(reference)) throw new Error('credential missing');
    return this.values.get(reference);
  }

  async writeCredential(reference, value) {
    this.writes.push(reference);
    this.values.set(reference, value);
  }

  async deleteCredential(reference) {
    this.deletes.push(reference);
    this.values.delete(reference);
  }
}

const createVerticalGoogleAdsHarness = ({
  records = [],
  credentialRef = 'google-oauth:vertical-ads',
} = {}) => {
  const repository = new FakeRepository(records);
  const credentialStore = new VerticalMemoryCredentialStore();
  const lifecycle = [];
  const safeStates = [];
  const acquirer = new MainProcessGoogleOAuthCredentialAcquirer({
    store: credentialStore,
    requester: async (request) => {
      lifecycle.push('token_exchange');
      assert.equal(request.url, 'https://oauth2.googleapis.com/token');
      return {
        status: 200,
        body: { refresh_token: 'sentinel-refresh-secret' },
      };
    },
    openExternal: async () => {
      lifecycle.push('browser_opened');
    },
    startLoopback: async () => ({
      redirect_uri: 'http://127.0.0.1:43123/oauth/callback',
      waitForCode: async () => {
        lifecycle.push('callback_received');
        return 'sentinel-authorization-code';
      },
      close: () => undefined,
    }),
    application_configuration_provider: async () => ({
      client_id: 'main-owned-client-id',
      client_secret: 'sentinel-client-secret',
      developer_token: 'sentinel-developer-token',
    }),
    credential_ref_factory: () => credentialRef,
  });
  const service = new WorkspaceConnectionManagementService({
    repository,
    credential_store: credentialStore,
    google_credential_acquirer: acquirer,
    serpapi_credential_acquirer: {
      acquire: async () => {
        throw new Error('not used in Google vertical test');
      },
    },
    refresh_safe_state: async (workspaceId) => {
      const connection = repository.getSourceConnection(
        workspaceId,
        'google-ads-search-terms',
      );
      const credentialAvailable = connection?.credential_ref !== null
        && connection !== null
        && await credentialStore.hasCredential(connection.credential_ref);
      safeStates.push({
        source_id: 'google-ads-search-terms',
        credential_status: connection === null
          ? 'NOT_CONFIGURED'
          : credentialAvailable
            ? 'AVAILABLE'
            : 'MISSING',
        readiness_status: googleAdsSearchTermsReadiness({
          connection,
          credential_available: credentialAvailable,
        }),
      });
    },
    record_diagnostic: () => undefined,
  });
  return {
    credentialStore,
    lifecycle,
    repository,
    safeStates,
    service,
  };
};

const createHarness = (records = []) => {
  const repository = new FakeRepository(records);
  const diagnostics = [];
  const refreshes = [];
  const deletedCredentials = [];
  const deleteFailures = new Set();
  const compatible = new Map();
  const acquirer = {
    configurations: new Map(),
    defaultConfiguration: {
      client_id: 'main-owned-client',
      client_secret: 'sentinel-client-secret',
      developer_token: 'sentinel-developer-token',
    },
    acquiredReferences: [],
    acquisitionError: null,
    calls: [],
    async readApplicationConfiguration(existingReference) {
      this.calls.push(['configuration', existingReference]);
      if (existingReference !== undefined && this.configurations.has(existingReference)) {
        return this.configurations.get(existingReference);
      }
      return this.defaultConfiguration;
    },
    async isCompatible(reference, scopes) {
      this.calls.push(['compatible', reference, clone(scopes)]);
      return compatible.get(reference) === true;
    },
    async acquire(input) {
      this.calls.push(['acquire', clone(input)]);
      if (this.acquisitionError !== null) throw this.acquisitionError;
      const credentialReference = this.acquiredReferences.shift();
      if (!credentialReference) throw new Error('missing acquired reference fixture');
      return {
        credential_ref: credentialReference,
        granted_scopes: ['fixture-scope'],
      };
    },
  };
  const credentialStore = {
    hasCredential: async () => true,
    readCredential: async () => 'sentinel-secret',
    writeCredential: async () => undefined,
    deleteCredential: async (reference) => {
      deletedCredentials.push(reference);
      if (deleteFailures.has(reference)) {
        throw new Error('sentinel-secret credential cleanup failure');
      }
    },
  };
  const service = new WorkspaceConnectionManagementService({
    repository,
    credential_store: credentialStore,
    google_credential_acquirer: acquirer,
    refresh_safe_state: async (workspaceId) => {
      refreshes.push(workspaceId);
    },
    record_diagnostic: (event) => diagnostics.push(clone(event)),
  });
  return {
    acquirer,
    compatible,
    deleteFailures,
    deletedCredentials,
    diagnostics,
    refreshes,
    repository,
    service,
  };
};

async function main() {
  {
    const harness = createVerticalGoogleAdsHarness();
    const result = await harness.service.connectGoogle({
      workspace_id: 'ws_vertical_ads',
      source_id: 'google-ads-search-terms',
      metadata: { customer_id: '1234567890' },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(harness.lifecycle, [
      'browser_opened',
      'callback_received',
      'token_exchange',
    ]);
    assert.deepEqual(harness.credentialStore.writes, [
      'google-oauth:vertical-ads',
    ]);
    const connection = harness.repository.getSourceConnection(
      'ws_vertical_ads',
      'google-ads-search-terms',
    );
    assert.equal(connection.credential_ref, 'google-oauth:vertical-ads');
    assert.deepEqual(connection.safe_metadata, {
      customer_id: '1234567890',
      authorization_state: 'AUTHORIZED',
    });
    assert.deepEqual(harness.safeStates, [{
      source_id: 'google-ads-search-terms',
      credential_status: 'AVAILABLE',
      readiness_status: 'READY',
    }]);
    assert.equal(
      JSON.stringify({ result, safeStates: harness.safeStates })
        .includes('sentinel-'),
      false,
      'The renderer-safe result and refresh state must contain no secret material.',
    );
  }

  {
    const previous = record(
      'ws_vertical_rebind_failure',
      'google-ads-search-terms',
      'google-oauth:previous-ads',
      {
        customer_id: '1111111111',
        authorization_state: 'AUTHORIZED',
      },
    );
    const harness = createVerticalGoogleAdsHarness({
      records: [previous],
      credentialRef: 'google-oauth:replacement-ads',
    });
    harness.credentialStore.values.set(
      previous.credential_ref,
      JSON.stringify({
        refresh_token: 'sentinel-previous-refresh-secret',
        granted_scopes: ['https://www.googleapis.com/auth/adwords'],
      }),
    );
    harness.repository.failRebind = true;
    const result = await harness.service.reconnectGoogle({
      workspace_id: previous.workspace_id,
      source_id: previous.source_id,
      metadata: { customer_id: '2222222222' },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'CONNECTION_REBIND_FAILED');
    assert.deepEqual(
      harness.repository.getSourceConnection(
        previous.workspace_id,
        previous.source_id,
      ),
      previous,
      'A failed repository rebind must preserve the prior valid connection.',
    );
    assert.equal(
      await harness.credentialStore.hasCredential(previous.credential_ref),
      true,
    );
    assert.equal(
      await harness.credentialStore.hasCredential(
        'google-oauth:replacement-ads',
      ),
      false,
    );
    assert.deepEqual(harness.credentialStore.deletes, [
      'google-oauth:replacement-ads',
    ]);
  }

  {
    const existing = record(
      'ws_existing',
      'google-search-console-query-page',
      'cred:existing-secret',
      { site_url: 'sc-domain:example.com' },
    );
    const harness = createHarness([existing]);
    assert.deepEqual(
      await harness.service.connectGoogle({
        workspace_id: existing.workspace_id,
        source_id: existing.source_id,
        metadata: existing.safe_metadata,
      }),
      {
        ok: false,
        error: {
          code: 'CONNECTION_ALREADY_EXISTS',
          source_id: existing.source_id,
          retryable: false,
        },
      },
    );
    assert.deepEqual(harness.acquirer.calls, []);
  }

  {
    const harness = createHarness();
    harness.acquirer.defaultConfiguration = null;
    assert.deepEqual(
      await harness.service.connectGoogle({
        workspace_id: 'ws_missing_config',
        source_id: 'google-search-console-query-page',
        metadata: { site_url: 'sc-domain:example.com' },
      }),
      {
        ok: false,
        error: {
          code: 'CONNECTION_CONFIGURATION_UNAVAILABLE',
          source_id: 'google-search-console-query-page',
          retryable: false,
        },
      },
    );
    assert.equal(
      harness.acquirer.calls.some(([kind]) => kind === 'acquire'),
      false,
    );
    assert.deepEqual(harness.repository.upserts, []);
  }

  for (const [code, retryable] of [
    ['OAUTH_TOKEN_EXCHANGE_REJECTED', false],
    ['OAUTH_TOKEN_EXCHANGE_UNAVAILABLE', true],
    ['OAUTH_REFRESH_TOKEN_UNAVAILABLE', false],
    ['OAUTH_CLIENT_REJECTED', false],
    ['OAUTH_AUTHORIZATION_GRANT_REJECTED', false],
  ]) {
    const harness = createHarness();
    harness.acquirer.acquisitionError = { code };
    const result = await harness.service.connectGoogle({
      workspace_id: `ws_${code.toLowerCase()}`,
      source_id: 'google-ads-search-terms',
      metadata: { customer_id: '1234567890' },
    });
    assert.deepEqual(result, {
      ok: false,
      error: {
        code,
        source_id: 'google-ads-search-terms',
        retryable,
      },
    });
    assert.deepEqual(harness.repository.upserts, []);
    assert.deepEqual(harness.refreshes, []);
  }

  for (const {
    sourceId,
    configuration,
    expectedCode,
    shouldAcquire,
  } of [
    {
      sourceId: 'google-search-console-query-page',
      configuration: { client_id: 'provider-client-without-required-secret' },
      expectedCode: 'CONNECTION_CONFIGURATION_UNAVAILABLE',
      shouldAcquire: false,
    },
    {
      sourceId: 'google-ads-search-terms',
      configuration: {
        client_id: 'provider-client',
        client_secret: 'sentinel-client-secret',
      },
      expectedCode: 'OAUTH_ACQUISITION_FAILED',
      shouldAcquire: true,
    },
    {
      sourceId: 'google-keyword-planner',
      configuration: {
        client_id: 'provider-client',
        client_secret: 'sentinel-client-secret',
      },
      expectedCode: 'OAUTH_ACQUISITION_FAILED',
      shouldAcquire: true,
    },
  ]) {
    const harness = createHarness();
    harness.acquirer.defaultConfiguration = configuration;
    const result = await harness.service.connectGoogle({
      workspace_id: `ws_provider_required_${sourceId}`,
      source_id: sourceId,
      metadata: sourceId === 'google-search-console-query-page'
        ? { site_url: 'sc-domain:example.com' }
        : { customer_id: '123' },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, expectedCode);
    assert.equal(
      harness.acquirer.calls.some(([kind]) => kind === 'acquire'),
      shouldAcquire,
      `${sourceId} OAuth acquisition must follow the active OAuth-only provider requirements.`,
    );
  }

  {
    const harness = createHarness();
    harness.acquirer.acquiredReferences.push('cred:new-gsc-secret');
    const result = await harness.service.connectGoogle({
      workspace_id: 'ws_gsc',
      source_id: 'google-search-console-query-page',
      metadata: { site_url: ' sc-domain:new.example ' },
    });
    assert.deepEqual(result, {
      ok: true,
      result: {
        source_id: 'google-search-console-query-page',
        action: 'CONNECT_GOOGLE',
        outcome: 'SUCCEEDED',
      },
    });
    assert.equal(
      harness.repository.getSourceConnection(
        'ws_gsc',
        'google-search-console-query-page',
      ).credential_ref,
      'cred:new-gsc-secret',
    );
    assert.deepEqual(harness.refreshes, ['ws_gsc']);
  }

  {
    const sibling = record(
      'ws_ads_reuse',
      'google-keyword-planner',
      'cred:compatible-secret',
      { customer_id: '222' },
    );
    const harness = createHarness([sibling]);
    harness.compatible.set('cred:compatible-secret', true);
    const result = await harness.service.connectGoogle({
      workspace_id: sibling.workspace_id,
      source_id: 'google-ads-search-terms',
      metadata: { customer_id: '111' },
    });
    assert.equal(result.ok, true);
    assert.equal(
      harness.repository.getSourceConnection(
        sibling.workspace_id,
        'google-ads-search-terms',
      ).credential_ref,
      'cred:compatible-secret',
    );
    assert.equal(
      harness.acquirer.calls.some(([kind]) => kind === 'acquire'),
      false,
    );
  }

  {
    const harness = createHarness();
    harness.repository.failGetFor.add(
      keyOf('ws_ads_lookup_fail', 'google-keyword-planner'),
    );
    const result = await harness.service.connectGoogle({
      workspace_id: 'ws_ads_lookup_fail',
      source_id: 'google-ads-search-terms',
      metadata: { customer_id: '111' },
    });
    assert.equal(result.error.code, 'CONNECTION_PERSISTENCE_FAILED');
    assert.equal(
      harness.acquirer.calls.some(([kind]) => kind === 'acquire'),
      false,
      'A failed sibling lookup must fail closed before OAuth acquisition.',
    );
  }

  {
    const sibling = record(
      'ws_ads_incompatible',
      'google-keyword-planner',
      'cred:legacy-secret',
      { customer_id: '222' },
    );
    const harness = createHarness([sibling]);
    harness.acquirer.acquiredReferences.push('cred:new-ads-secret');
    const result = await harness.service.connectGoogle({
      workspace_id: sibling.workspace_id,
      source_id: 'google-ads-search-terms',
      metadata: { customer_id: '111' },
    });
    assert.equal(result.ok, true);
    assert.equal(
      harness.repository.getSourceConnection(
        sibling.workspace_id,
        'google-ads-search-terms',
      ).credential_ref,
      'cred:new-ads-secret',
    );
  }

  {
    const harness = createHarness();
    harness.acquirer.acquiredReferences.push('cred:publication-fail-secret');
    harness.repository.failUpsert = true;
    const result = await harness.service.connectGoogle({
      workspace_id: 'ws_publication_fail',
      source_id: 'google-search-console-query-page',
      metadata: { site_url: 'sc-domain:example.com' },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'CONNECTION_PERSISTENCE_FAILED');
    assert.deepEqual(
      harness.deletedCredentials,
      ['cred:publication-fail-secret'],
    );
    assert.deepEqual(harness.refreshes, ['ws_publication_fail']);
  }

  {
    const harness = createHarness();
    harness.acquirer.acquiredReferences.push('cred:cleanup-fail-secret');
    harness.repository.failUpsert = true;
    harness.deleteFailures.add('cred:cleanup-fail-secret');
    const result = await harness.service.connectGoogle({
      workspace_id: 'ws_cleanup_fail',
      source_id: 'google-search-console-query-page',
      metadata: { site_url: 'sc-domain:example.com' },
    });
    assert.equal(result.error.code, 'CONNECTION_PERSISTENCE_FAILED');
    assert.deepEqual(harness.diagnostics, [{
      code: 'NEW_CREDENTIAL_COMPENSATION_FAILED',
      workspace_id: 'ws_cleanup_fail',
      source_id: 'google-search-console-query-page',
    }]);
  }

  {
    const current = record(
      'ws_reconnect_gsc',
      'google-search-console-query-page',
      'cred:old-gsc-secret',
      { site_url: 'sc-domain:old.example' },
    );
    const harness = createHarness([current]);
    harness.acquirer.acquiredReferences.push('cred:new-gsc-secret');
    const result = await harness.service.reconnectGoogle({
      workspace_id: current.workspace_id,
      source_id: current.source_id,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(harness.repository.rebinds[0].source_ids, [
      'google-search-console-query-page',
    ]);
    assert.deepEqual(
      harness.repository.getSourceConnection(
        current.workspace_id,
        current.source_id,
      ).safe_metadata,
      {
        ...current.safe_metadata,
        authorization_state: 'AUTHORIZED',
      },
    );
    assert.deepEqual(harness.deletedCredentials, ['cred:old-gsc-secret']);
  }

  {
    const ads = record(
      'ws_shared_rebind',
      'google-ads-search-terms',
      'cred:old-shared-secret',
      { customer_id: '111' },
    );
    const planner = record(
      'ws_shared_rebind',
      'google-keyword-planner',
      'cred:old-shared-secret',
      { customer_id: '222' },
    );
    const otherWorkspace = record(
      'ws_other',
      'google-ads-search-terms',
      'cred:old-shared-secret',
      { customer_id: '333' },
    );
    const harness = createHarness([ads, planner, otherWorkspace]);
    harness.acquirer.acquiredReferences.push('cred:new-shared-secret');
    const result = await harness.service.reconnectGoogle({
      workspace_id: ads.workspace_id,
      source_id: ads.source_id,
      metadata: { customer_id: '999' },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(harness.repository.rebinds[0].source_ids, [
      'google-ads-search-terms',
      'google-keyword-planner',
    ]);
    assert.deepEqual(
      harness.repository.getSourceConnection(
        ads.workspace_id,
        ads.source_id,
      ).safe_metadata,
      {
        customer_id: '999',
        authorization_state: 'AUTHORIZED',
      },
    );
    assert.deepEqual(
      harness.repository.getSourceConnection(
        planner.workspace_id,
        planner.source_id,
      ),
      {
        ...planner,
        credential_ref: 'cred:new-shared-secret',
        safe_metadata: {
          ...planner.safe_metadata,
          authorization_state: 'AUTHORIZED',
        },
        updated_at: '2026-09-23T02:00:00.000Z',
      },
    );
    assert.equal(
      harness.repository.getSourceConnection(
        otherWorkspace.workspace_id,
        otherWorkspace.source_id,
      ).credential_ref,
      'cred:old-shared-secret',
    );
    assert.deepEqual(harness.deletedCredentials, []);
  }

  {
    const ads = record(
      'ws_rebind_lookup_fail',
      'google-ads-search-terms',
      'cred:old-shared-secret',
      { customer_id: '111' },
    );
    const harness = createHarness([ads]);
    harness.repository.failGetFor.add(
      keyOf(ads.workspace_id, 'google-keyword-planner'),
    );
    harness.acquirer.acquiredReferences.push('cred:must-not-be-acquired');
    const result = await harness.service.reconnectGoogle({
      workspace_id: ads.workspace_id,
      source_id: ads.source_id,
    });
    assert.equal(result.error.code, 'CONNECTION_PERSISTENCE_FAILED');
    assert.equal(
      harness.acquirer.calls.some(([kind]) => kind === 'acquire'),
      false,
      'Shared rebind membership must be resolved before OAuth acquisition.',
    );
    assert.equal(
      harness.repository.getSourceConnection(
        ads.workspace_id,
        ads.source_id,
      ).credential_ref,
      'cred:old-shared-secret',
    );
  }

  {
    const current = record(
      'ws_rebind_fail',
      'google-search-console-query-page',
      'cred:old-rebind-secret',
      { site_url: 'sc-domain:old.example' },
    );
    const harness = createHarness([current]);
    harness.acquirer.acquiredReferences.push('cred:new-rebind-secret');
    harness.repository.failRebind = true;
    const result = await harness.service.reconnectGoogle({
      workspace_id: current.workspace_id,
      source_id: current.source_id,
    });
    assert.equal(result.error.code, 'CONNECTION_REBIND_FAILED');
    assert.deepEqual(harness.deletedCredentials, ['cred:new-rebind-secret']);
    assert.equal(
      harness.repository.getSourceConnection(
        current.workspace_id,
        current.source_id,
      ).credential_ref,
      'cred:old-rebind-secret',
    );
  }

  {
    const current = record(
      'ws_old_cleanup_fail',
      'google-search-console-query-page',
      'cred:old-cleanup-secret',
      { site_url: 'sc-domain:old.example' },
    );
    const harness = createHarness([current]);
    harness.acquirer.acquiredReferences.push('cred:new-cleanup-secret');
    harness.deleteFailures.add('cred:old-cleanup-secret');
    const result = await harness.service.reconnectGoogle({
      workspace_id: current.workspace_id,
      source_id: current.source_id,
    });
    assert.deepEqual(result, {
      ok: true,
      result: {
        source_id: current.source_id,
        action: 'RECONNECT_GOOGLE',
        outcome: 'SUCCEEDED_WITH_CLEANUP_WARNING',
      },
    });
    assert.deepEqual(harness.diagnostics, [{
      code: 'OBSOLETE_CREDENTIAL_CLEANUP_FAILED',
      workspace_id: current.workspace_id,
      source_id: current.source_id,
    }]);
  }

  const leakHarness = createHarness();
  leakHarness.acquirer.defaultConfiguration = null;
  const leakResult = await leakHarness.service.connectGoogle({
    workspace_id: 'ws_leak',
    source_id: 'google-search-console-query-page',
    metadata: { site_url: 'sc-domain:example.com' },
  });
  const serialized = JSON.stringify({
    result: leakResult,
    diagnostics: leakHarness.diagnostics,
  });
  assert.equal(serialized.includes('sentinel-secret'), false);
  assert.equal(serialized.includes('credential_ref'), false);

  console.log(
    'PASS GOOGLE-WORKSPACE-CONNECTION-MANAGEMENT-001: Google Connect and Reconnect preserve shared references, compensate split persistence, and return only safe outcomes',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
