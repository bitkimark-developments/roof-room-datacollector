const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build root and temporary work root.');

const { getDatabasePath, initializeDatabase } = require(path.join(buildRoot, 'main', 'storage', 'database.js'));
const { StateRepository, WorkspaceActiveRunError } = require(path.join(buildRoot, 'main', 'storage', 'state-repository.js'));

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
assert.equal(initializeDatabase(directories).status, 'READY');
const databasePath = getDatabasePath(directories);
const repository = new StateRepository(databasePath);
const workspaceA = repository.createWorkspace({ workspace_name: 'Brand A' });
const workspaceB = repository.createWorkspace({ workspace_name: 'Brand B' });
const reusablePreset = {
  source_id: 'fake-source',
  query_group_ids: ['group-a'],
  period: { period_preset: '24M' },
};
const preset = repository.createSavedCollectionPreset({
  workspace_id: workspaceA.workspace_id,
  preset_name: 'Twenty Four Months',
  reusable_configuration: reusablePreset,
});
assert.equal(repository.getSavedCollectionPreset(workspaceB.workspace_id, preset.preset_id), null);
assert.deepEqual(repository.listSavedCollectionPresets(workspaceB.workspace_id), []);
assert.throws(
  () => repository.updateSavedCollectionPreset({
    workspace_id: workspaceB.workspace_id,
    preset_id: preset.preset_id,
    preset_name: 'Hijacked',
    reusable_configuration: { source_id: 'other' },
  }),
);
assert.deepEqual(repository.getSavedCollectionPreset(workspaceA.workspace_id, preset.preset_id), preset);

const effectiveConfiguration = {
  source_id: 'fake-source',
  query_group_ids: ['group-a', 'override-group'],
  period: { period_preset: '24M' },
};
const resolvedSnapshot = {
  schema_version: 1,
  source_id: 'fake-source',
  reference_date: '2026-08-17',
  requested_date_start: '2024-08-18',
  requested_date_end: '2026-08-17',
  query_group_ids: ['group-a', 'override-group'],
};
const reserved = repository.reserveRunFromJobPlans({
  workspace_id: workspaceA.workspace_id,
  application_version: '1.0.0',
  reusable_configuration: effectiveConfiguration,
  configuration_snapshot: resolvedSnapshot,
  job_plans: [{
    source_id: 'fake-source',
    job_key: 'group-a',
    query_group_id: 'group-a',
    source_context: { query_group_id: 'group-a' },
  }],
});
assert.deepEqual(repository.getSavedCollectionPreset(workspaceA.workspace_id, preset.preset_id), preset);
assert.deepEqual(repository.getLastRunSettings(workspaceA.workspace_id).reusable_configuration, effectiveConfiguration);
assert.deepEqual(repository.getRun(reserved.run.run_id).configuration_snapshot, resolvedSnapshot);
assert.throws(
  () => repository.reserveRunFromJobPlans({
    workspace_id: workspaceA.workspace_id,
    application_version: '1.0.0',
    reusable_configuration: { source_id: 'failed' },
    configuration_snapshot: { schema_version: 1, source_id: 'failed' },
    job_plans: [{ source_id: 'fake-source', job_key: 'other', query_group_id: null, source_context: {} }],
  }),
  (error) => error instanceof WorkspaceActiveRunError,
);
assert.deepEqual(repository.getLastRunSettings(workspaceA.workspace_id).reusable_configuration, effectiveConfiguration);

repository.reserveRunFromJobPlans({
  workspace_id: workspaceB.workspace_id,
  application_version: '1.0.0',
  reusable_configuration: { source_id: 'blank' },
  configuration_snapshot: { schema_version: 1, source_id: 'blank' },
  job_plans: [{ source_id: 'fake-source', job_key: 'b', query_group_id: null, source_context: {} }],
});
assert.equal(repository.getLastRunSettings(workspaceA.workspace_id).reusable_configuration.source_id, 'fake-source');
assert.equal(repository.getLastRunSettings(workspaceB.workspace_id).reusable_configuration.source_id, 'blank');
repository.close();

const reopened = new StateRepository(databasePath);
assert.deepEqual(reopened.getSavedCollectionPreset(workspaceA.workspace_id, preset.preset_id), preset);
assert.deepEqual(reopened.getRun(reserved.run.run_id).configuration_snapshot, resolvedSnapshot);
assert.deepEqual(reopened.getLastRunSettings(workspaceA.workspace_id).reusable_configuration, effectiveConfiguration);
reopened.close();
console.log('PASS PRESET-RUN-001: Workspace presets, Last Run Settings, and atomic immutable reservation persist correctly');
