const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const {
  WorkspaceConnectionManagementService,
} = require(
  path.join(buildRoot, 'main', 'app', 'workspace-connection-management-service.js'),
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

  for (const [sourceId, configuration] of [
    [
      'google-search-console-query-page',
      { client_id: 'provider-client-without-required-secret' },
    ],
    [
      'google-ads-search-terms',
      {
        client_id: 'provider-client',
        client_secret: 'sentinel-client-secret',
      },
    ],
    [
      'google-keyword-planner',
      {
        client_id: 'provider-client',
        client_secret: 'sentinel-client-secret',
      },
    ],
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
    assert.equal(result.error.code, 'CONNECTION_CONFIGURATION_UNAVAILABLE');
    assert.equal(
      harness.acquirer.calls.some(([kind]) => kind === 'acquire'),
      false,
      `${sourceId} must not start OAuth before all provider-level requirements exist.`,
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
      current.safe_metadata,
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
      { customer_id: '999' },
    );
    assert.equal(
      harness.repository.getSourceConnection(
        planner.workspace_id,
        planner.source_id,
      ).credential_ref,
      'cred:new-shared-secret',
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
