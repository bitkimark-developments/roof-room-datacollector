const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

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

const clone = (value) => structuredClone(value);
const keyOf = (workspaceId, sourceId) => workspaceId + '::' + sourceId;

class FakeRepository {
  constructor(records = []) {
    this.records = new Map(
      records.map((record) => [
        keyOf(record.workspace_id, record.source_id),
        clone(record),
      ]),
    );
    this.calls = [];
    this.failRestore = false;
    this.failCount = false;
  }

  getSourceConnection(workspaceId, sourceId) {
    this.calls.push(['get', workspaceId, sourceId]);
    const record = this.records.get(keyOf(workspaceId, sourceId));
    return record ? clone(record) : null;
  }

  upsertSourceConnection(input) {
    this.calls.push(['upsert', clone(input)]);
    const key = keyOf(input.workspace_id, input.source_id);
    const existing = this.records.get(key);
    const record = {
      connection_id: existing?.connection_id ?? 'conn_created',
      workspace_id: input.workspace_id,
      source_id: input.source_id,
      credential_ref: input.credential_ref,
      safe_metadata: clone(input.safe_metadata),
      created_at: existing?.created_at ?? '2026-09-23T00:00:00.000Z',
      updated_at: '2026-09-23T01:00:00.000Z',
    };
    this.records.set(key, record);
    return clone(record);
  }

  deleteSourceConnection(workspaceId, sourceId) {
    this.calls.push(['delete', workspaceId, sourceId]);
    const key = keyOf(workspaceId, sourceId);
    const record = this.records.get(key);
    if (!record) return null;
    this.records.delete(key);
    return clone(record);
  }

  restoreSourceConnection(record) {
    this.calls.push(['restore', clone(record)]);
    if (this.failRestore) throw new Error('sentinel-secret restore failure');
    const key = keyOf(record.workspace_id, record.source_id);
    if (this.records.has(key)) throw new Error('restore conflict');
    this.records.set(key, clone(record));
    return clone(record);
  }

  countSourceConnectionsByCredentialRef(credentialRef) {
    this.calls.push(['count', credentialRef]);
    if (this.failCount) throw new Error('sentinel-secret count failure');
    return [...this.records.values()].filter(
      (record) => record.credential_ref === credentialRef,
    ).length;
  }

  rebindSourceConnections() {
    throw new Error('not used in foundation tests');
  }
}

const record = (
  workspaceId,
  sourceId,
  credentialRef,
  safeMetadata,
  connectionId = 'conn_' + sourceId,
) => ({
  connection_id: connectionId,
  workspace_id: workspaceId,
  source_id: sourceId,
  credential_ref: credentialRef,
  safe_metadata: safeMetadata,
  created_at: '2026-09-22T10:00:00.000Z',
  updated_at: '2026-09-22T11:00:00.000Z',
});

const createHarness = (
  records = [],
  {
    deleteCredential,
    refreshSafeState,
  } = {},
) => {
  const repository = new FakeRepository(records);
  const credentialCalls = [];
  const diagnostics = [];
  const refreshes = [];
  const credentialStore = {
    hasCredential: async () => true,
    readCredential: async () => 'sentinel-secret',
    writeCredential: async () => {
      throw new Error('not used in foundation tests');
    },
    deleteCredential: async (credentialRef) => {
      credentialCalls.push(['delete', credentialRef]);
      if (deleteCredential) await deleteCredential(credentialRef, repository);
    },
  };
  const service = new WorkspaceConnectionManagementService({
    repository,
    credential_store: credentialStore,
    refresh_safe_state: async (workspaceId) => {
      refreshes.push(workspaceId);
      if (refreshSafeState) await refreshSafeState(workspaceId);
    },
    record_diagnostic: (event) => diagnostics.push(clone(event)),
  });
  return {
    credentialCalls,
    diagnostics,
    refreshes,
    repository,
    service,
  };
};

async function main() {
  {
    const existing = record(
      'ws_manage',
      'google-search-console-query-page',
      'cred:sentinel-secret',
      { site_url: 'sc-domain:old.example' },
    );
    const harness = createHarness([existing]);
    const result = await harness.service.manage({
      workspace_id: 'ws_manage',
      source_id: 'google-search-console-query-page',
      metadata: { site_url: ' sc-domain:new.example ' },
    });
    assert.deepEqual(result, {
      ok: true,
      result: {
        source_id: 'google-search-console-query-page',
        action: 'MANAGE_METADATA',
        outcome: 'SUCCEEDED',
      },
    });
    const updated = harness.repository.getSourceConnection(
      'ws_manage',
      'google-search-console-query-page',
    );
    assert.equal(updated.connection_id, existing.connection_id);
    assert.equal(updated.credential_ref, existing.credential_ref);
    assert.equal(updated.created_at, existing.created_at);
    assert.deepEqual(updated.safe_metadata, {
      site_url: 'sc-domain:new.example',
    });
    assert.deepEqual(harness.credentialCalls, []);
    assert.deepEqual(harness.refreshes, ['ws_manage']);
  }

  {
    const harness = createHarness();
    assert.deepEqual(
      await harness.service.manage({
        workspace_id: 'ws_missing',
        source_id: 'google-search-console-query-page',
        metadata: { site_url: 'sc-domain:example.com' },
      }),
      {
        ok: false,
        error: {
          code: 'CONNECTION_NOT_FOUND',
          source_id: 'google-search-console-query-page',
          retryable: false,
        },
      },
    );
    assert.equal(
      harness.repository.calls.some(([operation]) => operation === 'upsert'),
      false,
    );
    assert.deepEqual(harness.refreshes, []);
  }

  for (const invalidIntent of [
    {
      workspace_id: 'ws_invalid',
      source_id: 'google-search-console-query-page',
      metadata: {
        site_url: 'sc-domain:example.com',
        refresh_token: 'sentinel-secret',
      },
    },
    {
      workspace_id: 'ws_invalid',
      source_id: 'serpapi',
      metadata: {},
    },
  ]) {
    const harness = createHarness();
    assert.deepEqual(await harness.service.manage(invalidIntent), {
      ok: false,
      error: {
        code: 'INVALID_CONNECTION_INTENT',
        retryable: false,
      },
    });
    assert.deepEqual(harness.repository.calls, []);
    assert.deepEqual(harness.credentialCalls, []);
  }

  {
    const selected = record(
      'ws_shared_a',
      'google-ads-search-terms',
      'cred:shared-sentinel-secret',
      { customer_id: '111' },
    );
    const sibling = record(
      'ws_shared_b',
      'google-keyword-planner',
      'cred:shared-sentinel-secret',
      { customer_id: '222' },
    );
    const harness = createHarness([selected, sibling]);
    assert.deepEqual(
      await harness.service.disconnect({
        workspace_id: selected.workspace_id,
        source_id: selected.source_id,
      }),
      {
        ok: true,
        result: {
          source_id: 'google-ads-search-terms',
          action: 'DISCONNECT',
          outcome: 'SUCCEEDED',
        },
      },
    );
    assert.equal(
      harness.repository.getSourceConnection(
        selected.workspace_id,
        selected.source_id,
      ),
      null,
    );
    assert.ok(
      harness.repository.getSourceConnection(
        sibling.workspace_id,
        sibling.source_id,
      ),
    );
    assert.deepEqual(harness.credentialCalls, []);
    assert.deepEqual(harness.refreshes, ['ws_shared_a']);
  }

  {
    const selected = record(
      'ws_last',
      'serpapi',
      'cred:last-sentinel-secret',
      {},
    );
    const events = [];
    const harness = createHarness([selected], {
      deleteCredential: async (credentialRef, repository) => {
        events.push(['credential-delete', credentialRef]);
        assert.equal(
          repository.getSourceConnection(selected.workspace_id, selected.source_id),
          null,
          'credential deletion must happen after row deletion',
        );
      },
    });
    const originalDelete = harness.repository.deleteSourceConnection.bind(
      harness.repository,
    );
    harness.repository.deleteSourceConnection = (...args) => {
      events.push(['row-delete', ...args]);
      return originalDelete(...args);
    };
    assert.equal((await harness.service.disconnect({
      workspace_id: selected.workspace_id,
      source_id: selected.source_id,
    })).ok, true);
    assert.equal(events[0][0], 'row-delete');
    assert.equal(events[1][0], 'credential-delete');
  }

  {
    const selected = record(
      'ws_null',
      'serpapi',
      null,
      {},
    );
    const harness = createHarness([selected]);
    assert.equal((await harness.service.disconnect({
      workspace_id: selected.workspace_id,
      source_id: selected.source_id,
    })).ok, true);
    assert.deepEqual(harness.credentialCalls, []);
    assert.equal(
      harness.repository.calls.some(([operation]) => operation === 'count'),
      false,
    );
  }

  {
    const selected = record(
      'ws_delete_failure',
      'serpapi',
      'cred:delete-failure-sentinel-secret',
      {},
    );
    const harness = createHarness([selected], {
      deleteCredential: async () => {
        throw new Error('sentinel-secret credential delete failure');
      },
    });
    const result = await harness.service.disconnect({
      workspace_id: selected.workspace_id,
      source_id: selected.source_id,
    });
    assert.deepEqual(result, {
      ok: false,
      error: {
        code: 'DISCONNECT_CREDENTIAL_DELETE_FAILED',
        source_id: 'serpapi',
        retryable: true,
      },
    });
    assert.deepEqual(
      harness.repository.getSourceConnection(
        selected.workspace_id,
        selected.source_id,
      ),
      selected,
    );
    assert.deepEqual(harness.refreshes, ['ws_delete_failure']);
  }

  {
    const selected = record(
      'ws_compensation_failure',
      'serpapi',
      'cred:compensation-sentinel-secret',
      {},
    );
    const harness = createHarness([selected], {
      deleteCredential: async () => {
        throw new Error('sentinel-secret credential delete failure');
      },
    });
    harness.repository.failRestore = true;
    const result = await harness.service.disconnect({
      workspace_id: selected.workspace_id,
      source_id: selected.source_id,
    });
    assert.deepEqual(result, {
      ok: false,
      error: {
        code: 'DISCONNECT_COMPENSATION_FAILED',
        source_id: 'serpapi',
        retryable: false,
      },
    });
    assert.deepEqual(harness.diagnostics, [{
      code: 'DISCONNECT_COMPENSATION_FAILED',
      workspace_id: 'ws_compensation_failure',
      source_id: 'serpapi',
    }]);
    assert.deepEqual(harness.refreshes, ['ws_compensation_failure']);
  }

  {
    const selected = record(
      'ws_count_failure',
      'serpapi',
      'cred:count-sentinel-secret',
      {},
    );
    const harness = createHarness([selected]);
    harness.repository.failCount = true;
    assert.deepEqual(
      await harness.service.disconnect({
        workspace_id: selected.workspace_id,
        source_id: selected.source_id,
      }),
      {
        ok: false,
        error: {
          code: 'CONNECTION_PERSISTENCE_FAILED',
          source_id: 'serpapi',
          retryable: true,
        },
      },
    );
    assert.deepEqual(
      harness.repository.getSourceConnection(
        selected.workspace_id,
        selected.source_id,
      ),
      selected,
    );
  }

  {
    const harness = createHarness();
    assert.deepEqual(
      await harness.service.disconnect({
        workspace_id: 'ws_missing',
        source_id: 'serpapi',
      }),
      {
        ok: false,
        error: {
          code: 'CONNECTION_NOT_FOUND',
          source_id: 'serpapi',
          retryable: false,
        },
      },
    );
    assert.deepEqual(harness.credentialCalls, []);
    assert.deepEqual(harness.refreshes, []);
  }

  {
    const selected = record(
      'ws_refresh',
      'serpapi',
      null,
      {},
    );
    const harness = createHarness([selected], {
      refreshSafeState: async () => {
        throw new Error('sentinel-secret refresh failure');
      },
    });
    const result = await harness.service.disconnect({
      workspace_id: selected.workspace_id,
      source_id: selected.source_id,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(harness.diagnostics, [{
      code: 'SAFE_STATE_REFRESH_FAILED',
      workspace_id: 'ws_refresh',
      source_id: 'serpapi',
    }]);
  }

  {
    const disconnectRecord = record(
      'ws_serial_a',
      'serpapi',
      'cred:serial-sentinel-secret',
      {},
    );
    const manageRecord = record(
      'ws_serial_b',
      'google-search-console-query-page',
      'cred:manage-sentinel-secret',
      { site_url: 'sc-domain:before.example' },
    );
    let releaseDelete;
    let deleteStartedResolve;
    const deleteStarted = new Promise((resolve) => {
      deleteStartedResolve = resolve;
    });
    const harness = createHarness([disconnectRecord, manageRecord], {
      deleteCredential: async () => {
        deleteStartedResolve();
        await new Promise((resolve) => {
          releaseDelete = resolve;
        });
      },
    });
    const disconnectPromise = harness.service.disconnect({
      workspace_id: disconnectRecord.workspace_id,
      source_id: disconnectRecord.source_id,
    });
    await deleteStarted;
    const managePromise = harness.service.manage({
      workspace_id: manageRecord.workspace_id,
      source_id: manageRecord.source_id,
      metadata: { site_url: 'sc-domain:after.example' },
    });
    await Promise.resolve();
    assert.equal(
      harness.repository.calls.some(
        ([operation, input]) => (
          operation === 'upsert'
          && input.workspace_id === manageRecord.workspace_id
        ),
      ),
      false,
      'a second mutation must wait even when it targets another Workspace',
    );
    releaseDelete();
    await Promise.all([disconnectPromise, managePromise]);
    assert.deepEqual(
      harness.repository.getSourceConnection(
        manageRecord.workspace_id,
        manageRecord.source_id,
      ).safe_metadata,
      { site_url: 'sc-domain:after.example' },
    );
  }

  const leakHarness = createHarness();
  const leakResult = await leakHarness.service.manage({
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
    'PASS WORKSPACE-CONNECTION-MANAGEMENT-SERVICE-001: Manage and Disconnect serialize mutations, compensate failures, refresh safe state, and return secret-free results',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
