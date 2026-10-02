const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const {
  WorkspaceConnectionManagementService,
} = require(path.join(
  buildRoot,
  'main',
  'app',
  'workspace-connection-management-service.js',
));

const clone = (value) => structuredClone(value);
const keyOf = (workspaceId, sourceId) => `${workspaceId}::${sourceId}`;

const record = (
  workspaceId,
  sourceId,
  credentialRef,
  safeMetadata,
) => ({
  connection_id: `conn_${sourceId}`,
  workspace_id: workspaceId,
  source_id: sourceId,
  credential_ref: credentialRef,
  safe_metadata: clone(safeMetadata),
  created_at: '2026-10-03T00:00:00.000Z',
  updated_at: '2026-10-03T00:00:00.000Z',
});

class FakeRepository {
  constructor(records = []) {
    this.records = new Map(
      records.map((item) => [
        keyOf(item.workspace_id, item.source_id),
        clone(item),
      ]),
    );
    this.calls = [];
  }

  getSourceConnection(workspaceId, sourceId) {
    this.calls.push(['get', workspaceId, sourceId]);
    const value = this.records.get(keyOf(workspaceId, sourceId));
    return value ? clone(value) : null;
  }

  upsertSourceConnection(input) {
    this.calls.push(['upsert', clone(input)]);
    const key = keyOf(input.workspace_id, input.source_id);
    const existing = this.records.get(key);
    const value = {
      connection_id: existing?.connection_id ?? `conn_${input.source_id}`,
      workspace_id: input.workspace_id,
      source_id: input.source_id,
      credential_ref: input.credential_ref,
      safe_metadata: clone(input.safe_metadata),
      created_at: existing?.created_at ?? '2026-10-03T00:00:00.000Z',
      updated_at: '2026-10-03T01:00:00.000Z',
    };
    this.records.set(key, value);
    return clone(value);
  }

  deleteSourceConnection(workspaceId, sourceId) {
    const key = keyOf(workspaceId, sourceId);
    const value = this.records.get(key);
    if (!value) return null;
    this.records.delete(key);
    return clone(value);
  }

  restoreSourceConnection(value) {
    this.records.set(
      keyOf(value.workspace_id, value.source_id),
      clone(value),
    );
    return clone(value);
  }

  countSourceConnectionsByCredentialRef(credentialRef) {
    return [...this.records.values()].filter(
      (item) => item.credential_ref === credentialRef,
    ).length;
  }

  rebindSourceConnections(input) {
    this.calls.push(['rebind', clone(input)]);

    for (const sourceId of input.source_ids) {
      const key = keyOf(input.workspace_id, sourceId);
      const existing = this.records.get(key);

      if (
        !existing
        || existing.credential_ref !== input.expected_credential_ref
      ) {
        throw new Error('exact rebind mismatch');
      }

      const metadataUpdate = input.safe_metadata_updates?.find(
        (candidate) => candidate.source_id === sourceId,
      );

      this.records.set(key, {
        ...existing,
        credential_ref: input.replacement_credential_ref,
        safe_metadata: metadataUpdate
          ? clone(metadataUpdate.safe_metadata)
          : clone(existing.safe_metadata),
        updated_at: '2026-10-03T02:00:00.000Z',
      });
    }

    return input.source_ids.map((sourceId) => clone(
      this.records.get(keyOf(input.workspace_id, sourceId)),
    ));
  }
}

const createHarness = (records = []) => {
  const repository = new FakeRepository(records);
  const googleCalls = {
    acquire: [],
    compatible: [],
    configuration: [],
  };
  const credentialDeletes = [];

  const service = new WorkspaceConnectionManagementService({
    repository,
    credential_store: {
      hasCredential: async () => true,
      readCredential: async () => 'sentinel-secret',
      writeCredential: async () => undefined,
      deleteCredential: async (reference) => {
        credentialDeletes.push(reference);
      },
    },
    google_credential_acquirer: {
      acquire: async (input) => {
        googleCalls.acquire.push(clone(input));
        return {
          credential_ref: 'google-oauth:ga4-fresh',
          granted_scopes: [
            'https://www.googleapis.com/auth/analytics.readonly',
          ],
        };
      },
      readApplicationConfiguration: async (existingCredentialRef) => {
        googleCalls.configuration.push(existingCredentialRef ?? null);
        return {
          client_id: 'main-owned-client-id',
          client_secret: 'sentinel-client-secret',
        };
      },
      isCompatible: async (credentialRef, scopes) => {
        googleCalls.compatible.push([
          credentialRef,
          [...scopes],
        ]);
        return true;
      },
    },
    serpapi_credential_acquirer: {
      acquire: async () => {
        throw new Error('SerpApi must not be used by GA4 tests');
      },
    },
    refresh_safe_state: async () => undefined,
    record_diagnostic: () => undefined,
  });

  return {
    repository,
    googleCalls,
    credentialDeletes,
    service,
  };
};

async function main() {
  {
    const ads = record(
      'ws_ga4_connect',
      'google-ads-search-terms',
      'google-oauth:ads-existing',
      { customer_id: '1112223333' },
    );

    const harness = createHarness([ads]);

    const result = await harness.service.connectGoogle({
      workspace_id: 'ws_ga4_connect',
      source_id: 'google-analytics-4',
      metadata: {
        property_id: '123456789',
      },
    });

    assert.deepEqual(result, {
      ok: true,
      result: {
        source_id: 'google-analytics-4',
        action: 'CONNECT_GOOGLE',
        outcome: 'SUCCEEDED',
      },
    });

    const ga4 = harness.repository.getSourceConnection(
      'ws_ga4_connect',
      'google-analytics-4',
    );

    assert.equal(
      ga4.credential_ref,
      'google-oauth:ga4-fresh',
      'GA4 must acquire its own credential instead of reusing Ads',
    );

    assert.deepEqual(
      ga4.safe_metadata,
      {
        property_id: '123456789',
        authorization_state: 'AUTHORIZED',
      },
    );

    assert.equal(
      harness.googleCalls.acquire.length,
      1,
      'GA4 connect must perform its own OAuth acquisition',
    );

    assert.deepEqual(
      harness.googleCalls.compatible,
      [],
      'GA4 connect must not probe an Ads credential for compatibility',
    );

    assert.equal(
      harness.repository.getSourceConnection(
        'ws_ga4_connect',
        'google-ads-search-terms',
      ).credential_ref,
      'google-oauth:ads-existing',
    );
  }

  {
    const oldSharedRef = 'google-oauth:legacy-shared';

    const ga4 = record(
      'ws_ga4_reconnect',
      'google-analytics-4',
      oldSharedRef,
      {
        property_id: '123456789',
        authorization_state: 'AUTHORIZED',
      },
    );

    const ads = record(
      'ws_ga4_reconnect',
      'google-ads-search-terms',
      oldSharedRef,
      {
        customer_id: '1112223333',
        authorization_state: 'AUTHORIZED',
      },
    );

    const harness = createHarness([ga4, ads]);

    const result = await harness.service.reconnectGoogle({
      workspace_id: 'ws_ga4_reconnect',
      source_id: 'google-analytics-4',
      metadata: {
        property_id: '987654321',
      },
    });

    assert.deepEqual(result, {
      ok: true,
      result: {
        source_id: 'google-analytics-4',
        action: 'RECONNECT_GOOGLE',
        outcome: 'SUCCEEDED',
      },
    });

    assert.equal(
      harness.repository.getSourceConnection(
        'ws_ga4_reconnect',
        'google-analytics-4',
      ).credential_ref,
      'google-oauth:ga4-fresh',
    );

    assert.deepEqual(
      harness.repository.getSourceConnection(
        'ws_ga4_reconnect',
        'google-analytics-4',
      ).safe_metadata,
      {
        property_id: '987654321',
        authorization_state: 'AUTHORIZED',
      },
    );

    assert.equal(
      harness.repository.getSourceConnection(
        'ws_ga4_reconnect',
        'google-ads-search-terms',
      ).credential_ref,
      oldSharedRef,
      'GA4 reconnect must not rebind an Ads connection',
    );

    const rebindCall = harness.repository.calls.find(
      ([operation]) => operation === 'rebind',
    );

    assert.deepEqual(
      rebindCall[1].source_ids,
      ['google-analytics-4'],
      'GA4 reconnect must rebind only the GA4 source',
    );

    assert.deepEqual(
      harness.credentialDeletes,
      [],
      'legacy shared credential remains while Ads still references it',
    );
  }

  console.log(
    'PASS GA4-CONNECTION-SERVICE-001: GA4 OAuth credentials stay isolated from Ads/KWP reuse and rebind',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
