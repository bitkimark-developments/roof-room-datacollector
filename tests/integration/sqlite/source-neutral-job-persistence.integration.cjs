const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error(
    'Expected compiled build root and temporary work root.',
  );
}

const {
  getDatabasePath,
  initializeDatabase,
} = require(
  path.join(buildRoot, 'main', 'storage', 'database.js'),
);
const {
  StateRepository,
} = require(
  path.join(
    buildRoot,
    'main',
    'storage',
    'state-repository.js',
  ),
);

const root = path.join(workRoot, 'source-neutral-job');
const directories = {
  app_data_root: root,
  config: path.join(root, 'config'),
  data: path.join(root, 'data'),
  runs: path.join(root, 'data', 'runs'),
  database: path.join(root, 'database'),
  browser_profiles: path.join(root, 'browser-profiles'),
  logs: path.join(root, 'logs'),
};

fs.mkdirSync(directories.database, { recursive: true });

const bootstrap = initializeDatabase(directories);

assert.equal(bootstrap.status, 'READY');

if (bootstrap.status !== 'READY') {
  throw new Error(bootstrap.error);
}

const databasePath = getDatabasePath(directories);
const sourceContext = {
  dataset_type: 'DETERMINISTIC_JSON',
  acquisition_mode: 'FILE_IMPORT',
  request: {
    input_name: 'fixture.json',
    preserve_nulls: true,
  },
};
const configurationSnapshot = {
  schema_version: 1,
  source_id: 'fake-json',
  requested_context: {
    batch_label: 'source-neutral-persistence',
  },
};

const repositoryA = new StateRepository(databasePath);
const createWorkspace = (name) =>
  repositoryA.createWorkspace({ workspace_name: name });
const primaryWorkspace = createWorkspace('Primary Fixture');
const created = repositoryA.createRunFromJobPlans({
  workspace_id: primaryWorkspace.workspace_id,
  application_version: '1.0.0',
  configuration_snapshot: configurationSnapshot,
  job_plans: [
    {
      source_id: 'fake-json',
      job_key: 'fixture-import-001',
      query_group_id: null,
      source_context: sourceContext,
    },
  ],
});

assert.deepEqual(created.run.selected_sources, ['fake-json']);
assert.deepEqual(
  created.run.configuration_snapshot,
  configurationSnapshot,
);
assert.equal(created.jobs.length, 1);
assert.equal(created.jobs[0].job_key, 'fixture-import-001');
assert.equal(created.jobs[0].query_group_id, null);
assert.deepEqual(created.jobs[0].source_context, sourceContext);

assert.throws(
  () =>
    repositoryA.createRunFromJobPlans({
      workspace_id: createWorkspace('Duplicate Fixture').workspace_id,
      application_version: '1.0.0',
      configuration_snapshot: configurationSnapshot,
      job_plans: [
        {
          source_id: 'fake-json',
          job_key: 'duplicate',
          query_group_id: null,
          source_context: {},
        },
        {
          source_id: 'fake-json',
          job_key: 'duplicate',
          query_group_id: null,
          source_context: {},
        },
      ],
    }),
  /duplicate source_id\/job_key/u,
);

assert.throws(
  () =>
    repositoryA.createRunFromJobPlans({
      workspace_id: createWorkspace('Unsafe Fixture').workspace_id,
      application_version: '1.0.0',
      configuration_snapshot: configurationSnapshot,
      job_plans: [
        {
          source_id: 'fake-json',
          job_key: 'unsafe/key',
          query_group_id: null,
          source_context: {},
        },
      ],
    }),
  /filesystem-safe/u,
);

const multiSourceSnapshot = {
  schema_version: 1,
  sources: [
    {
      source_id: 'fake-source-a',
      requested_context: {
        batch_label: 'primary',
      },
    },
    {
      source_id: 'fake-source-b',
      requested_context: {
        batch_label: 'secondary',
      },
    },
  ],
};

const mixedSourceRun =
  repositoryA.createRunFromJobPlans({
    workspace_id: createWorkspace('Mixed Sources').workspace_id,
    application_version: '1.0.0',
    configuration_snapshot:
      multiSourceSnapshot,
    job_plans: [
      {
        source_id: 'fake-source-a',
        job_key: 'same-key',
        query_group_id: null,
        source_context: {
          fixture_id: 'alpha',
        },
      },
      {
        source_id: 'fake-source-b',
        job_key: 'same-key',
        query_group_id: null,
        source_context: {
          fixture_id: 'gamma',
        },
      },
    ],
  });

assert.deepEqual(
  mixedSourceRun.run.selected_sources,
  ['fake-source-a', 'fake-source-b'],
);
assert.deepEqual(
  mixedSourceRun.run.configuration_snapshot,
  multiSourceSnapshot,
);
assert.equal(mixedSourceRun.jobs.length, 2);
assert.notEqual(
  mixedSourceRun.jobs[0].job_id,
  mixedSourceRun.jobs[1].job_id,
);
assert.deepEqual(
  mixedSourceRun.jobs.map((job) => ({
    source_id: job.source_id,
    job_key: job.job_key,
    source_context: job.source_context,
  })),
  [
    {
      source_id: 'fake-source-a',
      job_key: 'same-key',
      source_context: {
        fixture_id: 'alpha',
      },
    },
    {
      source_id: 'fake-source-b',
      job_key: 'same-key',
      source_context: {
        fixture_id: 'gamma',
      },
    },
  ],
);

const arbitrarySnapshotWithLegacyKey = {
  ...configurationSnapshot,
  selected_query_groups: 'generic-source-field',
};

const genericSnapshotRun = repositoryA.createRunFromJobPlans({
  workspace_id: createWorkspace('Generic Snapshot').workspace_id,
  application_version: '1.0.0',
  configuration_snapshot: arbitrarySnapshotWithLegacyKey,
  job_plans: [
    {
      source_id: 'fake-json',
      job_key: 'generic-snapshot',
      query_group_id: null,
      source_context: {},
    },
  ],
});

assert.deepEqual(
  genericSnapshotRun.run.configuration_snapshot,
  arbitrarySnapshotWithLegacyKey,
);

const runId = created.run.run_id;
const jobId = created.jobs[0].job_id;
const mixedRunId = mixedSourceRun.run.run_id;
const mixedJobIds = mixedSourceRun.jobs.map(
  (job) => job.job_id,
);

repositoryA.close();

const repositoryB = new StateRepository(databasePath);
const reopenedRun = repositoryB.getRun(runId);
const reopenedJob = repositoryB.getJob(jobId);
const reopenedMixedRun =
  repositoryB.getRun(mixedRunId);
const reopenedMixedJobs = mixedJobIds.map(
  (mixedJobId) =>
    repositoryB.getJob(mixedJobId),
);

assert.ok(reopenedRun);
assert.deepEqual(
  reopenedRun.configuration_snapshot,
  configurationSnapshot,
);
assert.ok(reopenedJob);
assert.equal(reopenedJob.query_group_id, null);
assert.equal(reopenedJob.job_key, 'fixture-import-001');
assert.deepEqual(reopenedJob.source_context, sourceContext);
assert.ok(reopenedMixedRun);
assert.deepEqual(
  reopenedMixedRun.selected_sources,
  ['fake-source-a', 'fake-source-b'],
);
assert.deepEqual(
  reopenedMixedRun.configuration_snapshot,
  multiSourceSnapshot,
);
assert.equal(
  reopenedMixedJobs.every(
    (job) => job !== null,
  ),
  true,
);
assert.deepEqual(
  reopenedMixedJobs.map((job) => ({
    source_id: job.source_id,
    job_key: job.job_key,
    source_context: job.source_context,
  })),
  [
    {
      source_id: 'fake-source-a',
      job_key: 'same-key',
      source_context: {
        fixture_id: 'alpha',
      },
    },
    {
      source_id: 'fake-source-b',
      job_key: 'same-key',
      source_context: {
        fixture_id: 'gamma',
      },
    },
  ],
);

repositoryB.close();

console.log(
  'PASS DB-011: source-neutral job context and NULL query_group_id survive repository restart',
);
