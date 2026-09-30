const assert = require('node:assert/strict');
const { lstat, realpath } = require('node:fs/promises');
const path = require('node:path');

const [buildRoot, fixtureRoot] = process.argv.slice(2);
if (!buildRoot || !fixtureRoot) throw new Error('Expected compiled build and fixture roots.');

const {
  createAdsOptimizationPackDesktopComposition,
} = require(path.join(buildRoot, 'main/app/ads-optimization-pack-desktop-composition.js'));
const {
  ADS_OPTIMIZATION_PACK_V1_RECIPE,
} = require(path.join(buildRoot, 'main/task-packages/ads-optimization-pack-recipe.js'));

const CURRENT_WINDOW = { start: '2026-09-23', end: '2026-09-29' };
const clone = (value) => JSON.parse(JSON.stringify(value));

const state = {
  runs: [],
  jobsByRun: new Map(),
  artifacts: new Map(),
  datasets: new Map(),
};
const calls = { reserve: 0, execute: 0, open: 0, provider: 0, openedPath: null, reserved: null };

const repository = {
  getWorkspace: (workspaceId) => workspaceId === 'ws_a'
    ? { workspace_id: 'ws_a', workspace_name: 'A', created_at: '2026-09-01T00:00:00.000Z' }
    : null,
  getSourceConnection: () => ({
    connection_id: 'conn_a', workspace_id: 'ws_a', source_id: 'google-ads-search-terms',
    credential_ref: 'cred_a', safe_metadata: { customer_id: '123-456-7890' },
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
  }),
  listRuns: () => clone(state.runs),
  listJobs: (runId) => clone(state.jobsByRun.get(runId) || []),
  getArtifact: (artifactId) => clone(state.artifacts.get(artifactId) || null),
  reserveRunFromJobPlans: (input) => {
    calls.reserve += 1;
    calls.reserved = clone(input);
    const run = {
      run_id: `run_reserved_${calls.reserve}`,
      workspace_id: input.workspace_id,
      run_status: 'PENDING',
      created_at: '2026-09-30T10:00:00.000Z',
      started_at: null,
      completed_at: null,
      application_version: input.application_version,
      selected_sources: [...new Set(input.job_plans.map(({ source_id }) => source_id))],
      requested_configuration: null,
      configuration_snapshot: clone(input.configuration_snapshot),
    };
    const jobs = input.job_plans.map((plan, index) => ({
      job_id: `job_reserved_${calls.reserve}_${index}`,
      run_id: run.run_id,
      ...clone(plan),
      job_order: index,
      execution_status: 'PENDING',
      validation_status: 'NOT_RUN',
      attempt_count: 0,
      accepted_artifact_id: null,
      created_at: run.created_at,
      started_at: null,
      completed_at: null,
    }));
    state.runs.unshift(run);
    state.jobsByRun.set(run.run_id, jobs);
    return { run: clone(run), jobs: clone(jobs) };
  },
};

const runState = (runId) => {
  const run = state.runs.find(({ run_id }) => run_id === runId);
  if (!run) throw new Error('Unknown run.');
  const jobs = state.jobsByRun.get(runId) || [];
  return {
    run: clone(run), jobs: clone(jobs),
    completed_jobs: jobs.filter(({ execution_status }) => execution_status === 'COMPLETED').length,
    failed_jobs: jobs.filter(({ execution_status }) => execution_status === 'FAILED').length,
    can_resume: false, can_retry: false, can_cancel: run.run_status !== 'COMPLETED',
  };
};

const installAcceptedEvidence = () => {
  state.runs = [];
  state.jobsByRun.clear();
  state.artifacts.clear();
  state.datasets.clear();
  const run = {
    run_id: 'run_accepted', workspace_id: 'ws_a', run_status: 'COMPLETED',
    created_at: '2026-09-30T09:00:00.000Z', started_at: '2026-09-30T09:00:01.000Z',
    completed_at: '2026-09-30T09:01:00.000Z', application_version: '1.0.0',
    selected_sources: ['google-ads-search-reporting'], requested_configuration: null,
    configuration_snapshot: {},
  };
  const jobs = ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.map((requirement, index) => {
    const jobId = `job_accepted_${index}`;
    const artifactId = `artifact_accepted_${index}`;
    state.artifacts.set(artifactId, {
      artifact_id: artifactId, run_id: run.run_id, job_id: jobId, attempt_number: 1,
      source_id: requirement.source_id, artifact_kind: 'RAW_SOURCE_FILE', artifact_state: 'ACCEPTED',
      filename: `${artifactId}.json`, relative_path: `runs/${run.run_id}/${artifactId}.json`,
      media_type: 'application/json', byte_size: 2, sha256: String(index + 1).repeat(64),
      created_at: '2026-09-30T09:01:00.000Z',
    });
    state.datasets.set(jobId, {
      source_id: requirement.source_id,
      dataset_type: requirement.dataset_type,
      job_id: jobId,
      job_key: requirement.dataset_type,
      rows: [],
    });
    return {
      job_id: jobId, run_id: run.run_id, source_id: requirement.source_id,
      job_key: requirement.dataset_type, query_group_id: null,
      source_context: {
        source_id: requirement.source_id,
        dataset_type: requirement.dataset_type,
        resource_mode: requirement.resource_mode,
        campaign_type: 'SEARCH', customer_id: '1234567890',
        requested_date_start: CURRENT_WINDOW.start, requested_date_end: CURRENT_WINDOW.end,
        dataset_schema_version: 1,
      },
      job_order: index, execution_status: 'COMPLETED', validation_status: 'NO_DATA',
      attempt_count: 1, accepted_artifact_id: artifactId,
      created_at: run.created_at, started_at: run.started_at, completed_at: run.completed_at,
    };
  });
  state.runs.push(run);
  state.jobsByRun.set(run.run_id, jobs);
};

async function main() {
  const packagesRoot = path.join(fixtureRoot, 'data', 'packages');
  let packageSequence = 0;
  const composition = createAdsOptimizationPackDesktopComposition({
    repository,
    dataset_loader: {
      loadAcceptedJobDataset: async (_runId, jobId) => clone(state.datasets.get(jobId)),
    },
    packages_root: packagesRoot,
    get_connection_readiness: async () => 'READY',
    execution_service: {
      execute: async () => { calls.execute += 1; },
    },
    get_run_state: runState,
    open_workbook: async (workbookPath) => {
      calls.open += 1;
      calls.openedPath = workbookPath;
    },
    reference_date: () => '2026-09-30',
    now: () => '2026-09-30T10:00:00.000Z',
    create_package_id: () => `pkg_composition_${++packageSequence}`,
    application_version: '1.0.0',
  });

  const review = await composition.controller.review({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' });
  assert.equal(review.status, 'NOT_READY');
  assert.equal(review.requirements.every(({ status }) => status === 'COLLECT_REQUIRED'), true);
  const collection = await composition.controller.start({
    workspace_id: review.workspace_id,
    recipe_id: review.recipe_id,
    recipe_version: review.recipe_version,
    reference_date: review.reference_date,
    current_window: review.current_window,
    account_identity: review.account_identity,
  });
  assert.equal(collection.status, 'COLLECTION_STARTED');
  assert.equal(calls.reserve, 1);
  assert.equal(calls.reserved.job_plans.length, 6);
  assert.equal(calls.execute, 1);

  installAcceptedEvidence();
  const ready = await composition.controller.review({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' });
  assert.equal(ready.status, 'INITIAL_BASELINE');
  const published = await composition.controller.start({
    workspace_id: ready.workspace_id,
    recipe_id: ready.recipe_id,
    recipe_version: ready.recipe_version,
    reference_date: ready.reference_date,
    current_window: ready.current_window,
    account_identity: ready.account_identity,
  });
  assert.equal(published.status, 'PACKAGE_PUBLISHED');
  const packageId = published.package.package_id;
  const workbookPath = await composition.open_package(packageId);
  assert.equal(calls.open, 1);
  assert.equal(calls.openedPath, workbookPath);
  assert.equal(path.isAbsolute(workbookPath), true);
  assert.equal((await lstat(workbookPath)).isFile(), true);
  assert.equal(workbookPath.startsWith(await realpath(packagesRoot) + path.sep), true);
  assert.equal(calls.provider, 0);

  console.log('PASS ADS-OPTIMIZATION-PACK-DESKTOP-COMPOSITION-001: production seams review, reserve, execute, publish, and open locally with zero provider calls');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
