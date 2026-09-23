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
    this.failGet = false;
    this.failUpsert = false;
    this.failRestore = false;
    this.failCount = false;
    this.failRebind = false;
  }

  getSourceConnection(workspaceId, sourceId) {
    this.calls.push(['get', workspaceId, sourceId]);
    if (this.failGet) throw new Error('sentinel-secret get failure');
    const record = this.records.get(keyOf(workspaceId, sourceId));
    return record ? clone(record) : null;
  }

  upsertSourceConnection(input) {
    this.calls.push(['upsert', clone(input)]);
    if (this.failUpsert) throw new Error('sentinel-secret upsert failure');
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

  rebindSourceConnections(input) {
    this.calls.push(['rebind', clone(input)]);
    if (this.failRebind) throw new Error('sentinel-secret rebind failure');
    const records = input.source_ids.map((sourceId) => {
      const key = keyOf(input.workspace_id, sourceId);
      const existing = this.records.get(key);
      if (
        !existing
        || existing.credential_ref !== input.expected_credential_ref
      ) {
        throw new Error('exact rebind mismatch');
      }
      return [key, existing];
    });
    for (const [key, existing] of records) {
      const safeMetadataUpdate = input.safe_metadata_updates?.find(
        (candidate) => candidate.source_id === existing.source_id,
      );
      this.records.set(key, {
        ...existing,
        credential_ref: input.replacement_credential_ref,
        safe_metadata: safeMetadataUpdate
          ? clone(safeMetadataUpdate.safe_metadata)
          : clone(existing.safe_metadata),
        updated_at: '2026-09-23T02:00:00.000Z',
      });
    }
    return records.map(([key]) => clone(this.records.get(key)));
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
    serpApiAcquire,
  } = {},
) => {
  const repository = new FakeRepository(records);
  const credentialCalls = [];
  const diagnostics = [];
  const refreshes = [];
  const serpApiAcquirerCalls = [];
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
    serpapi_credential_acquirer: {
      acquire: async () => {
        serpApiAcquirerCalls.push(true);
        if (serpApiAcquire) return serpApiAcquire();
        return {
          status: 'ACQUIRED',
          credential_ref: 'serpapi:fresh-default',
        };
      },
    },
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
    serpApiAcquirerCalls,
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

  {
    const events = [];
    const harness = createHarness([], {
      serpApiAcquire: async () => {
        events.push('acquire');
        return { status: 'ACQUIRED', credential_ref: 'serpapi:fresh-new' };
      },
    });
    const originalUpsert = harness.repository.upsertSourceConnection.bind(
      harness.repository,
    );
    harness.repository.upsertSourceConnection = (input) => {
      events.push('upsert');
      return originalUpsert(input);
    };
    assert.deepEqual(
      await harness.service.provisionSerpApi({
        workspace_id: 'ws_serpapi_new',
        source_id: 'serpapi',
      }),
      {
        ok: true,
        result: {
          source_id: 'serpapi',
          action: 'PROVISION_SERPAPI',
          outcome: 'SUCCEEDED',
        },
      },
    );
    assert.deepEqual(events, ['acquire', 'upsert']);
    assert.deepEqual(
      harness.repository.getSourceConnection('ws_serpapi_new', 'serpapi'),
      {
        connection_id: 'conn_created',
        workspace_id: 'ws_serpapi_new',
        source_id: 'serpapi',
        credential_ref: 'serpapi:fresh-new',
        safe_metadata: {},
        created_at: '2026-09-23T00:00:00.000Z',
        updated_at: '2026-09-23T01:00:00.000Z',
      },
    );
    assert.deepEqual(harness.refreshes, ['ws_serpapi_new']);
  }

  {
    const existing = record('ws_serpapi_null', 'serpapi', null, {});
    const harness = createHarness([existing], {
      serpApiAcquire: async () => ({
        status: 'ACQUIRED',
        credential_ref: 'serpapi:fresh-null',
      }),
    });
    assert.equal((await harness.service.provisionSerpApi({
      workspace_id: existing.workspace_id,
      source_id: 'serpapi',
    })).ok, true);
    const updated = harness.repository.getSourceConnection(
      existing.workspace_id,
      'serpapi',
    );
    assert.equal(updated.connection_id, existing.connection_id);
    assert.equal(updated.credential_ref, 'serpapi:fresh-null');
    assert.deepEqual(updated.safe_metadata, {});
    assert.equal(
      harness.repository.calls.some(([operation]) => operation === 'rebind'),
      false,
    );
  }

  for (const [workspaceId, oldRef, freshRef] of [
    ['ws_serpapi_available', 'serpapi:old-available', 'serpapi:fresh-available'],
    ['ws_serpapi_missing', 'serpapi:old-missing', 'serpapi:fresh-missing'],
  ]) {
    const existing = record(workspaceId, 'serpapi', oldRef, {});
    const events = [];
    const harness = createHarness([existing], {
      serpApiAcquire: async () => {
        events.push('acquire');
        return { status: 'ACQUIRED', credential_ref: freshRef };
      },
      deleteCredential: async (credentialRef, repository) => {
        events.push(['delete', credentialRef]);
        assert.equal(
          repository.getSourceConnection(workspaceId, 'serpapi').credential_ref,
          freshRef,
          'old credential cleanup happens only after exact rebind commits',
        );
      },
    });
    const originalRebind = harness.repository.rebindSourceConnections.bind(
      harness.repository,
    );
    harness.repository.rebindSourceConnections = (input) => {
      events.push(['rebind', clone(input)]);
      return originalRebind(input);
    };
    assert.deepEqual(
      await harness.service.provisionSerpApi({
        workspace_id: workspaceId,
        source_id: 'serpapi',
      }),
      {
        ok: true,
        result: {
          source_id: 'serpapi',
          action: 'PROVISION_SERPAPI',
          outcome: 'SUCCEEDED',
        },
      },
    );
    assert.equal(events[0], 'acquire');
    assert.deepEqual(events[1], ['rebind', {
      workspace_id: workspaceId,
      source_ids: ['serpapi'],
      expected_credential_ref: oldRef,
      replacement_credential_ref: freshRef,
    }]);
    assert.deepEqual(events[2], ['delete', oldRef]);
    assert.equal(
      harness.repository.getSourceConnection(workspaceId, 'serpapi').credential_ref,
      freshRef,
    );
    assert.equal(
      harness.credentialCalls.some(([, reference]) => reference === freshRef),
      false,
      'the newly acquired reference is never deleted after committed rebind',
    );
  }

  {
    const harness = createHarness([], {
      serpApiAcquire: async () => ({ status: 'CANCELLED' }),
    });
    assert.deepEqual(
      await harness.service.provisionSerpApi({
        workspace_id: 'ws_serpapi_cancel',
        source_id: 'serpapi',
      }),
      {
        ok: false,
        error: {
          code: 'SECRET_INGRESS_CANCELLED',
          source_id: 'serpapi',
          retryable: false,
        },
      },
    );
    assert.equal(
      harness.repository.calls.some(([operation]) => (
        operation === 'upsert' || operation === 'rebind'
      )),
      false,
    );
    assert.deepEqual(harness.credentialCalls, []);
    assert.deepEqual(harness.refreshes, []);
  }

  for (const [acquirerCode, retryable, diagnostic] of [
    ['SECRET_INGRESS_FAILED', true, 'SERPAPI_SECRET_INGRESS_FAILED'],
    ['SECRET_INPUT_INVALID', false, null],
    ['CREDENTIAL_PERSISTENCE_FAILED', true, null],
  ]) {
    const harness = createHarness([], {
      serpApiAcquire: async () => {
        const error = new Error('rr_test_only_provisioning_key');
        error.code = acquirerCode;
        throw error;
      },
    });
    assert.deepEqual(
      await harness.service.provisionSerpApi({
        workspace_id: `ws_${acquirerCode.toLowerCase()}`,
        source_id: 'serpapi',
      }),
      {
        ok: false,
        error: {
          code: acquirerCode,
          source_id: 'serpapi',
          retryable,
        },
      },
    );
    assert.equal(
      harness.repository.calls.some(([operation]) => (
        operation === 'upsert' || operation === 'rebind'
      )),
      false,
    );
    assert.deepEqual(
      harness.diagnostics,
      diagnostic === null
        ? []
        : [{
          code: diagnostic,
          workspace_id: `ws_${acquirerCode.toLowerCase()}`,
          source_id: 'serpapi',
        }],
    );
  }

  {
    const harness = createHarness();
    harness.repository.failGet = true;
    assert.deepEqual(
      await harness.service.provisionSerpApi({
        workspace_id: 'ws_serpapi_lookup_failure',
        source_id: 'serpapi',
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
    assert.deepEqual(harness.serpApiAcquirerCalls, []);
  }

  {
    const harness = createHarness([], {
      serpApiAcquire: async () => ({
        status: 'ACQUIRED',
        credential_ref: 'serpapi:fresh-upsert-fail',
      }),
    });
    harness.repository.failUpsert = true;
    assert.deepEqual(
      await harness.service.provisionSerpApi({
        workspace_id: 'ws_serpapi_upsert_failure',
        source_id: 'serpapi',
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
    assert.deepEqual(harness.credentialCalls, [
      ['delete', 'serpapi:fresh-upsert-fail'],
    ]);
    assert.deepEqual(harness.refreshes, ['ws_serpapi_upsert_failure']);
  }

  {
    const existing = record(
      'ws_serpapi_rebind_failure',
      'serpapi',
      'serpapi:old-rebind-failure',
      {},
    );
    const harness = createHarness([existing], {
      serpApiAcquire: async () => ({
        status: 'ACQUIRED',
        credential_ref: 'serpapi:fresh-rebind-fail',
      }),
    });
    harness.repository.failRebind = true;
    assert.deepEqual(
      await harness.service.provisionSerpApi({
        workspace_id: existing.workspace_id,
        source_id: 'serpapi',
      }),
      {
        ok: false,
        error: {
          code: 'CONNECTION_REBIND_FAILED',
          source_id: 'serpapi',
          retryable: true,
        },
      },
    );
    assert.equal(
      harness.repository.getSourceConnection(
        existing.workspace_id,
        'serpapi',
      ).credential_ref,
      existing.credential_ref,
    );
    assert.deepEqual(harness.credentialCalls, [
      ['delete', 'serpapi:fresh-rebind-fail'],
    ]);
  }

  {
    const harness = createHarness([], {
      serpApiAcquire: async () => ({
        status: 'ACQUIRED',
        credential_ref: 'serpapi:fresh-compensation-fail',
      }),
    });
    harness.repository.failUpsert = true;
    harness.repository.failCount = true;
    const result = await harness.service.provisionSerpApi({
      workspace_id: 'ws_serpapi_compensation_failure',
      source_id: 'serpapi',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'CONNECTION_PERSISTENCE_FAILED');
    assert.deepEqual(harness.diagnostics, [{
      code: 'NEW_CREDENTIAL_COMPENSATION_FAILED',
      workspace_id: 'ws_serpapi_compensation_failure',
      source_id: 'serpapi',
    }]);
  }

  {
    const selected = record(
      'ws_serpapi_shared_a',
      'serpapi',
      'serpapi:old-shared',
      {},
    );
    const sibling = record(
      'ws_serpapi_shared_b',
      'serpapi',
      'serpapi:old-shared',
      {},
    );
    const harness = createHarness([selected, sibling], {
      serpApiAcquire: async () => ({
        status: 'ACQUIRED',
        credential_ref: 'serpapi:fresh-shared',
      }),
    });
    assert.equal((await harness.service.provisionSerpApi({
      workspace_id: selected.workspace_id,
      source_id: 'serpapi',
    })).ok, true);
    assert.equal(
      harness.credentialCalls.some(([, reference]) => (
        reference === 'serpapi:old-shared'
      )),
      false,
    );
  }

  for (const failureKind of ['count', 'delete']) {
    const existing = record(
      `ws_serpapi_cleanup_${failureKind}`,
      'serpapi',
      `serpapi:old-cleanup-${failureKind}`,
      {},
    );
    const harness = createHarness([existing], {
      serpApiAcquire: async () => ({
        status: 'ACQUIRED',
        credential_ref: `serpapi:fresh-cleanup-${failureKind}`,
      }),
      deleteCredential: failureKind === 'delete'
        ? async () => { throw new Error('rr_test_only_provisioning_key'); }
        : undefined,
    });
    if (failureKind === 'count') harness.repository.failCount = true;
    const result = await harness.service.provisionSerpApi({
      workspace_id: existing.workspace_id,
      source_id: 'serpapi',
    });
    assert.deepEqual(result, {
      ok: true,
      result: {
        source_id: 'serpapi',
        action: 'PROVISION_SERPAPI',
        outcome: 'SUCCEEDED_WITH_CLEANUP_WARNING',
      },
    });
    assert.equal(
      harness.repository.getSourceConnection(
        existing.workspace_id,
        'serpapi',
      ).credential_ref,
      `serpapi:fresh-cleanup-${failureKind}`,
    );
    assert.deepEqual(harness.diagnostics, [{
      code: 'OBSOLETE_CREDENTIAL_CLEANUP_FAILED',
      workspace_id: existing.workspace_id,
      source_id: 'serpapi',
    }]);
  }

  {
    const harness = createHarness([], {
      serpApiAcquire: async () => ({
        status: 'ACQUIRED',
        credential_ref: 'serpapi:fresh-refresh-fail',
      }),
      refreshSafeState: async () => {
        throw new Error('rr_test_only_provisioning_key');
      },
    });
    const result = await harness.service.provisionSerpApi({
      workspace_id: 'ws_serpapi_refresh_failure',
      source_id: 'serpapi',
    });
    assert.equal(result.ok, true);
    assert.equal(
      harness.repository.getSourceConnection(
        'ws_serpapi_refresh_failure',
        'serpapi',
      ).credential_ref,
      'serpapi:fresh-refresh-fail',
    );
    assert.deepEqual(harness.diagnostics, [{
      code: 'SAFE_STATE_REFRESH_FAILED',
      workspace_id: 'ws_serpapi_refresh_failure',
      source_id: 'serpapi',
    }]);
  }

  {
    const disconnectRecord = record(
      'ws_serpapi_serial_disconnect',
      'serpapi',
      'serpapi:serial-old',
      {},
    );
    let releaseDelete;
    let deleteStartedResolve;
    const deleteStarted = new Promise((resolve) => {
      deleteStartedResolve = resolve;
    });
    const harness = createHarness([disconnectRecord], {
      deleteCredential: async () => {
        deleteStartedResolve();
        await new Promise((resolve) => {
          releaseDelete = resolve;
        });
      },
      serpApiAcquire: async () => ({
        status: 'ACQUIRED',
        credential_ref: 'serpapi:serial-fresh',
      }),
    });
    const disconnectPromise = harness.service.disconnect({
      workspace_id: disconnectRecord.workspace_id,
      source_id: 'serpapi',
    });
    await deleteStarted;
    const provisionPromise = harness.service.provisionSerpApi({
      workspace_id: 'ws_serpapi_serial_provision',
      source_id: 'serpapi',
    });
    await Promise.resolve();
    assert.deepEqual(
      harness.serpApiAcquirerCalls,
      [],
      'provisioning must wait behind the blocked Disconnect mutation',
    );
    releaseDelete();
    await Promise.all([disconnectPromise, provisionPromise]);
    assert.deepEqual(harness.serpApiAcquirerCalls, [true]);
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
  assert.equal(serialized.includes('rr_test_only_provisioning_key'), false);
  assert.equal(serialized.includes('credential_ref'), false);

  console.log(
    'PASS WORKSPACE-CONNECTION-MANAGEMENT-SERVICE-001: Manage, Disconnect, and SerpApi provisioning serialize mutations, compensate failures, refresh safe state, and return secret-free results',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
