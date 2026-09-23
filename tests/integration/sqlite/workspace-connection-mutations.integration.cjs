const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) {
  throw new Error('Expected compiled build root and temporary work root.');
}

const { getDatabasePath, initializeDatabase } = require(
  path.join(buildRoot, 'main', 'storage', 'database.js'),
);
const { StateRepository } = require(
  path.join(buildRoot, 'main', 'storage', 'state-repository.js'),
);

const directories = {
  app_data_root: workRoot,
  config: path.join(workRoot, 'config'),
  data: path.join(workRoot, 'data'),
  runs: path.join(workRoot, 'data', 'runs'),
  database: path.join(workRoot, 'database'),
  browser_profiles: path.join(workRoot, 'browser-profiles'),
  logs: path.join(workRoot, 'logs'),
};
fs.mkdirSync(directories.database, { recursive: true });
assert.equal(initializeDatabase(directories).status, 'READY');

const databasePath = getDatabasePath(directories);
const repository = new StateRepository(databasePath);
const workspaceA = repository.createWorkspace({ workspace_name: 'Workspace A' });
const workspaceB = repository.createWorkspace({ workspace_name: 'Workspace B' });

const ads = repository.upsertSourceConnection({
  workspace_id: workspaceA.workspace_id,
  source_id: 'google-ads-search-terms',
  credential_ref: 'cred:shared-old',
  safe_metadata: { customer_id: '111' },
});
const planner = repository.upsertSourceConnection({
  workspace_id: workspaceA.workspace_id,
  source_id: 'google-keyword-planner',
  credential_ref: 'cred:shared-old',
  safe_metadata: { customer_id: '222', login_customer_id: '333' },
});
repository.upsertSourceConnection({
  workspace_id: workspaceA.workspace_id,
  source_id: 'google-search-console-query-page',
  credential_ref: 'cred:gsc',
  safe_metadata: { site_url: 'sc-domain:example.com' },
});
const serpApi = repository.upsertSourceConnection({
  workspace_id: workspaceB.workspace_id,
  source_id: 'serpapi',
  credential_ref: 'cred:shared-old',
  safe_metadata: {},
});

assert.equal(
  repository.countSourceConnectionsByCredentialRef('cred:shared-old'),
  3,
  'reference count must include every Workspace',
);

const removedSerpApi = repository.deleteSourceConnection(
  workspaceB.workspace_id,
  'serpapi',
);
assert.deepEqual(removedSerpApi, serpApi);
assert.equal(repository.getSourceConnection(workspaceB.workspace_id, 'serpapi'), null);
assert.equal(
  repository.deleteSourceConnection(workspaceB.workspace_id, 'serpapi'),
  null,
  'deleting an absent row must be a no-op',
);
assert.equal(repository.countSourceConnectionsByCredentialRef('cred:shared-old'), 2);

const restoredSerpApi = repository.restoreSourceConnection(removedSerpApi);
assert.deepEqual(restoredSerpApi, removedSerpApi);
assert.equal(repository.countSourceConnectionsByCredentialRef('cred:shared-old'), 3);

const conflict = repository.upsertSourceConnection({
  workspace_id: workspaceB.workspace_id,
  source_id: 'google-search-console-query-page',
  credential_ref: 'cred:conflict-old',
  safe_metadata: { site_url: 'sc-domain:old.example' },
});
const removedConflict = repository.deleteSourceConnection(
  workspaceB.workspace_id,
  'google-search-console-query-page',
);
assert.deepEqual(removedConflict, conflict);
const recreatedConflict = repository.upsertSourceConnection({
  workspace_id: workspaceB.workspace_id,
  source_id: 'google-search-console-query-page',
  credential_ref: 'cred:conflict-new',
  safe_metadata: { site_url: 'sc-domain:new.example' },
});
assert.throws(
  () => repository.restoreSourceConnection(removedConflict),
  /already exists|restore/iu,
);
assert.deepEqual(
  repository.getSourceConnection(
    workspaceB.workspace_id,
    'google-search-console-query-page',
  ),
  recreatedConflict,
  'failed compensation must not overwrite a recreated row',
);

const direct = new DatabaseSync(databasePath);
direct.prepare(
  'UPDATE workspace_source_connections SET updated_at = ? WHERE workspace_id = ?',
).run('2026-09-22T00:00:00.000Z', workspaceA.workspace_id);

const beforeRebindGsc = repository.getSourceConnection(
  workspaceA.workspace_id,
  'google-search-console-query-page',
);
const rebound = repository.rebindSourceConnections({
  workspace_id: workspaceA.workspace_id,
  source_ids: ['google-ads-search-terms', 'google-keyword-planner'],
  expected_credential_ref: 'cred:shared-old',
  replacement_credential_ref: 'cred:shared-new',
});
assert.deepEqual(
  rebound.map((row) => row.source_id),
  ['google-ads-search-terms', 'google-keyword-planner'],
  'rebind result must preserve requested source order',
);
assert.equal(rebound[0].credential_ref, 'cred:shared-new');
assert.equal(rebound[1].credential_ref, 'cred:shared-new');
assert.deepEqual(rebound[0].safe_metadata, ads.safe_metadata);
assert.deepEqual(rebound[1].safe_metadata, planner.safe_metadata);
assert.equal(rebound[0].connection_id, ads.connection_id);
assert.equal(rebound[1].connection_id, planner.connection_id);
assert.equal(rebound[0].created_at, ads.created_at);
assert.equal(rebound[1].created_at, planner.created_at);
assert.notEqual(rebound[0].updated_at, '2026-09-22T00:00:00.000Z');
assert.notEqual(rebound[1].updated_at, '2026-09-22T00:00:00.000Z');
assert.deepEqual(
  repository.getSourceConnection(
    workspaceA.workspace_id,
    'google-search-console-query-page',
  ),
  beforeRebindGsc,
  'unrequested rows must remain unchanged',
);
assert.equal(
  repository.getSourceConnection(workspaceB.workspace_id, 'serpapi').credential_ref,
  'cred:shared-old',
  'same-provider references in another Workspace must not be rebound',
);
assert.equal(repository.countSourceConnectionsByCredentialRef('cred:shared-old'), 1);
assert.equal(repository.countSourceConnectionsByCredentialRef('cred:shared-new'), 2);

assert.throws(
  () => repository.rebindSourceConnections({
    workspace_id: workspaceB.workspace_id,
    source_ids: ['google-ads-search-terms'],
    expected_credential_ref: 'cred:shared-old',
    replacement_credential_ref: 'cred:unused',
  }),
  /missing|not found|expected/iu,
);

const escapedWorkspaceId = workspaceA.workspace_id.replaceAll("'", "''");
direct.exec(
  "CREATE TRIGGER abort_planner_rebind " +
  "BEFORE UPDATE OF credential_ref ON workspace_source_connections " +
  "WHEN OLD.workspace_id = '" + escapedWorkspaceId + "' " +
  "AND OLD.source_id = 'google-keyword-planner' " +
  "BEGIN SELECT RAISE(ABORT, 'forced planner rebind failure'); END;",
);
assert.throws(
  () => repository.rebindSourceConnections({
    workspace_id: workspaceA.workspace_id,
    source_ids: ['google-ads-search-terms', 'google-keyword-planner'],
    expected_credential_ref: 'cred:shared-new',
    replacement_credential_ref: 'cred:shared-final',
  }),
  /forced planner rebind failure/iu,
);
assert.equal(
  repository.getSourceConnection(
    workspaceA.workspace_id,
    'google-ads-search-terms',
  ).credential_ref,
  'cred:shared-new',
  'transaction rollback must undo the first row update',
);
assert.equal(
  repository.getSourceConnection(
    workspaceA.workspace_id,
    'google-keyword-planner',
  ).credential_ref,
  'cred:shared-new',
);
direct.exec('DROP TRIGGER abort_planner_rebind');

direct.prepare(
  'UPDATE workspace_source_connections SET credential_ref = ? WHERE workspace_id = ? AND source_id = ?',
).run(
  'cred:diverged',
  workspaceA.workspace_id,
  'google-keyword-planner',
);
assert.throws(
  () => repository.rebindSourceConnections({
    workspace_id: workspaceA.workspace_id,
    source_ids: ['google-ads-search-terms', 'google-keyword-planner'],
    expected_credential_ref: 'cred:shared-new',
    replacement_credential_ref: 'cred:should-not-commit',
  }),
  /expected|reference/iu,
);
assert.equal(
  repository.getSourceConnection(
    workspaceA.workspace_id,
    'google-ads-search-terms',
  ).credential_ref,
  'cred:shared-new',
);
assert.equal(
  repository.getSourceConnection(
    workspaceA.workspace_id,
    'google-keyword-planner',
  ).credential_ref,
  'cred:diverged',
);

direct.close();
repository.close();

console.log(
  'PASS WORKSPACE-CONNECTION-MUTATIONS-001: schema-v8 delete, restore, global reference count, and atomic exact rebind are deterministic',
);
