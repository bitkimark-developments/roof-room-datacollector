const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const [buildRoot, workRoot] = process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error('Expected compiled build root and temporary work root.');
}

const {
  getDatabasePath,
  initializeDatabase,
} = require(path.join(buildRoot, 'main', 'storage', 'database.js'));
const {
  StateRepository,
} = require(path.join(buildRoot, 'main', 'storage', 'state-repository.js'));

const databaseDirectory = path.join(workRoot, 'database');
fs.mkdirSync(databaseDirectory, { recursive: true });

const directories = {
  app_data_root: workRoot,
  config: path.join(workRoot, 'config'),
  data: path.join(workRoot, 'data'),
  runs: path.join(workRoot, 'data', 'runs'),
  database: databaseDirectory,
  browser_profiles: path.join(workRoot, 'browser-profiles'),
  logs: path.join(workRoot, 'logs'),
  public_downloads: path.join(workRoot, 'downloads'),
};

const bootstrap = initializeDatabase(directories);
assert.equal(bootstrap.status, 'READY');

const databasePath = getDatabasePath(directories);
const repositoryA = new StateRepository(databasePath);
const repositoryB = new StateRepository(databasePath);

const workspaceA = repositoryA.createWorkspace({
  workspace_name: 'Brand A',
});
const workspaceB = repositoryA.createWorkspace({
  workspace_name: 'Brand B',
});

const createRunInput = (workspaceId, fixtureId) => ({
  workspace_id: workspaceId,
  application_version: '1.0.0',
  configuration_snapshot: {
    schema_version: 1,
    fixture_id: fixtureId,
  },
  job_plans: [
    {
      source_id: 'fake-source',
      job_key: fixtureId,
      query_group_id: null,
      source_context: { fixture_id: fixtureId },
    },
  ],
});

const runA1 = repositoryA.createRunFromJobPlans(
  createRunInput(workspaceA.workspace_id, 'a1'),
);

assert.throws(
  () => repositoryB.createRunFromJobPlans(
    createRunInput(workspaceA.workspace_id, 'a2'),
  ),
  (error) =>
    error.code === 'WORKSPACE_ACTIVE_RUN_EXISTS' &&
    error.workspace_id === workspaceA.workspace_id &&
    error.active_run_id === runA1.run.run_id,
);

const runB1 = repositoryB.createRunFromJobPlans(
  createRunInput(workspaceB.workspace_id, 'b1'),
);

assert.equal(runB1.run.workspace_id, workspaceB.workspace_id);
assert.deepEqual(repositoryA.getCounts(), {
  runs: 2,
  jobs: 2,
});

repositoryA.close();
repositoryB.close();

const direct = new DatabaseSync(databasePath);
direct.exec('PRAGMA foreign_keys = ON');

assert.throws(
  () => direct.prepare(`
    INSERT INTO runs (
      run_id,
      workspace_id,
      run_status,
      created_at,
      started_at,
      completed_at,
      application_version,
      selected_sources_json,
      configuration_snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'rr_direct_duplicate',
    workspaceA.workspace_id,
    'PENDING',
    '2026-09-10T00:00:00.000Z',
    null,
    null,
    '1.0.0',
    '["fake-source"]',
    '{"schema_version":1}',
  ),
  (error) => error.code === 'ERR_SQLITE_ERROR' ||
    error.code === 'SQLITE_CONSTRAINT_UNIQUE',
);

direct.close();

const reopened = new StateRepository(databasePath);

assert.throws(
  () => reopened.createRunFromJobPlans(
    createRunInput(workspaceA.workspace_id, 'a3'),
  ),
  (error) =>
    error.code === 'WORKSPACE_ACTIVE_RUN_EXISTS' &&
    error.active_run_id === runA1.run.run_id,
);

reopened.close();

console.log(
  'PASS WORKSPACE-RUN-001: one active Run per Workspace is transactionally and database enforced',
);
