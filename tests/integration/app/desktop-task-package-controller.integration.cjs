const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const {
  DesktopTaskPackageController,
  DesktopTaskPackageControllerError,
} = require(path.join(buildRoot, 'main/app/desktop-task-package-controller.js'));
const {
  createAdsOptimizationPackDesktopDefinition,
} = require(path.join(buildRoot, 'main/app/ads-optimization-pack-desktop-composition.js'));
const {
  ADS_OPTIMIZATION_PACK_V1_RECIPE,
} = require(path.join(buildRoot, 'main/task-packages/ads-optimization-pack-recipe.js'));
const {
  TaskPackageAssembler,
} = require(path.join(buildRoot, 'main/task-packages/task-package-assembler.js'));
const {
  TaskPackageEvidenceResolver,
} = require(path.join(buildRoot, 'main/task-packages/task-package-evidence-resolver.js'));
const {
  isDesktopTaskPackageReviewIntent,
} = require(path.join(buildRoot, 'shared/desktop-task-package.js'));

const REFERENCE_DATE = '2026-09-30';
const CURRENT_WINDOW = { start: '2026-09-23', end: '2026-09-29' };
const ACCOUNT = { field: 'customer_id', value: '1234567890' };
const clone = (value) => JSON.parse(JSON.stringify(value));

const readyResolution = (requirement, disposition = 'REUSED_EXACT') => ({
  status: 'READY',
  requirement,
  rows: disposition === 'NO_DATA' ? [] : [{ performance_date: CURRENT_WINDOW.start, clicks: 0 }],
  evidence: {
    requirement_id: requirement.requirement_id,
    role: 'CURRENT',
    disposition,
    window: clone(CURRENT_WINDOW),
    origin: {
      run_id: `run_${requirement.requirement_id}`,
      job_id: `job_${requirement.requirement_id}`,
      attempt_number: 1,
      artifact_id: `artifact_${requirement.requirement_id}`,
      artifact_sha256: 'a'.repeat(64),
      acquired_at: '2026-09-01T08:00:00.000Z',
      validation_status: disposition === 'NO_DATA' ? 'NO_DATA' : 'VALID',
      source_id: requirement.source_id,
      dataset_type: requirement.dataset_type,
      resource_mode: requirement.resource_mode,
      acquisition_mode: requirement.acquisition_mode,
      campaign_scope: requirement.campaign_scope,
      dataset_schema_version: requirement.dataset_schema_version,
      account_identity: clone(ACCOUNT),
      snapshot_observed_at: '2026-09-01T08:00:00.000Z',
    },
    transformation: disposition === 'REUSED_FILTERED' ? {
      kind: 'DATE_FILTER',
      row_date_field: 'performance_date',
      input_window: { start: '2026-09-20', end: '2026-09-30' },
      output_window: clone(CURRENT_WINDOW),
      input_row_count: 2,
      output_row_count: 1,
    } : { kind: 'NONE' },
    row_count: disposition === 'NO_DATA' ? 0 : 1,
  },
  rejected_candidates: [],
});

const missingResolution = (requirement, reason = 'NO_COMPATIBLE_EVIDENCE') => ({
  status: 'MISSING',
  requirement,
  reason_codes: [reason],
  rejected_candidates: [],
});

const priorManifest = (packageId = 'pkg_previous') => ({
  manifest_version: 1,
  package_id: packageId,
  recipe_id: 'ADS_OPTIMIZATION_PACK',
  recipe_version: 1,
  recipe_label: 'Kampanya Gelişim',
  package_kind: 'INITIAL_BASELINE',
  workspace_id: 'ws_a',
  account_identity: clone(ACCOUNT),
  customer_id: ACCOUNT.value,
  created_at: '2026-09-15T08:00:00.000Z',
  application_version: '1.0.0',
  campaign_scope: 'SEARCH',
  current_window: { start: '2026-09-08', end: '2026-09-14' },
  dataset_schema_version: 1,
  required_datasets: ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.map(({ requirement_id }) => requirement_id),
  evidence: ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.map((requirement) => ({
    ...readyResolution(requirement).evidence,
    window: { start: '2026-09-08', end: '2026-09-14' },
    table: {
      filename: `datasets/current-${requirement.dataset_type.toLowerCase()}.json`,
      sha256: 'b'.repeat(64),
      row_count: 1,
      role: 'CURRENT',
      dataset_type: requirement.dataset_type,
    },
  })),
  excluded_coverage: {},
  workbook_filename: 'kampanya-gelisim-2026-09-15-baseline.xlsx',
});

const activeRun = {
  run_id: 'run_active_package',
  workspace_id: 'ws_a',
  run_status: 'RUNNING',
  created_at: '2026-09-30T08:00:00.000Z',
  started_at: '2026-09-30T08:00:01.000Z',
  completed_at: null,
  application_version: '1.0.0',
  selected_sources: ['google-ads-search-reporting'],
  requested_configuration: null,
  configuration_snapshot: {
    task_package: {
      recipe_id: 'ADS_OPTIMIZATION_PACK',
      recipe_version: 1,
      workspace_id: 'ws_a',
      account_identity: clone(ACCOUNT),
      current_window: clone(CURRENT_WINDOW),
    },
  },
};

const realTemporalResolutions = async () => {
  const fixtures = [
    { index: 0, start: CURRENT_WINDOW.start, end: CURRENT_WINDOW.end, validation: 'VALID', rows: [{ performance_date: CURRENT_WINDOW.start, clicks: 0 }] },
    { index: 1, start: '2026-09-20', end: '2026-09-30', validation: 'VALID', rows: [
      { performance_date: '2026-09-20', clicks: 4 },
      { performance_date: CURRENT_WINDOW.start, clicks: 0 },
    ] },
    { index: 2, start: CURRENT_WINDOW.start, end: CURRENT_WINDOW.end, validation: 'NO_DATA', rows: [] },
    { index: 3, start: '2026-09-20', end: '2026-09-30', validation: 'NO_DATA', rows: [] },
  ];
  const runs = fixtures.map(({ index }) => ({
    ...activeRun,
    run_id: `run_evidence_${index}`,
    run_status: 'COMPLETED',
    completed_at: '2026-09-30T09:00:00.000Z',
    configuration_snapshot: {},
  }));
  const jobs = new Map();
  const artifacts = new Map();
  const datasets = new Map();
  for (const fixture of fixtures) {
    const requirement = ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence[fixture.index];
    const run = runs[fixture.index];
    const jobId = `job_evidence_${fixture.index}`;
    const artifactId = `artifact_evidence_${fixture.index}`;
    jobs.set(run.run_id, [{
      job_id: jobId,
      run_id: run.run_id,
      source_id: requirement.source_id,
      job_key: requirement.dataset_type,
      query_group_id: null,
      source_context: {
        source_id: requirement.source_id,
        dataset_type: requirement.dataset_type,
        resource_mode: requirement.resource_mode,
        campaign_type: requirement.campaign_scope,
        customer_id: ACCOUNT.value,
        requested_date_start: fixture.start,
        requested_date_end: fixture.end,
        dataset_schema_version: 1,
      },
      job_order: 0,
      execution_status: 'COMPLETED',
      validation_status: fixture.validation,
      attempt_count: 1,
      accepted_artifact_id: artifactId,
      created_at: '2026-09-30T08:00:00.000Z',
      started_at: '2026-09-30T08:00:01.000Z',
      completed_at: '2026-09-30T08:01:00.000Z',
    }]);
    artifacts.set(artifactId, {
      artifact_id: artifactId,
      run_id: run.run_id,
      job_id: jobId,
      attempt_number: 1,
      source_id: requirement.source_id,
      artifact_kind: 'RAW_SOURCE_FILE',
      artifact_state: 'ACCEPTED',
      filename: `${artifactId}.json`,
      relative_path: `runs/${run.run_id}/${artifactId}.json`,
      media_type: 'application/json',
      byte_size: 2,
      sha256: String(fixture.index + 1).repeat(64),
      created_at: '2026-09-30T08:01:00.000Z',
    });
    datasets.set(jobId, {
      source_id: requirement.source_id,
      dataset_type: requirement.dataset_type,
      job_id: jobId,
      job_key: requirement.dataset_type,
      rows: clone(fixture.rows),
    });
  }
  const resolver = new TaskPackageEvidenceResolver({
    listRuns: () => clone(runs),
    listJobs: (runId) => clone(jobs.get(runId) || []),
    getArtifact: (artifactId) => clone(artifacts.get(artifactId) || null),
  }, {
    loadAcceptedJobDataset: async (_runId, jobId) => clone(datasets.get(jobId)),
  });
  return resolver.resolveCurrent({
    recipe: ADS_OPTIMIZATION_PACK_V1_RECIPE,
    workspace_id: 'ws_a',
    account_identity: ACCOUNT,
    current_window: CURRENT_WINDOW,
  });
};

const createHarness = ({
  readiness = 'READY',
  resolutions,
  manifests = [],
  activeRuns = [],
  customerId = '123-456-7890',
  connection = true,
  publishPackage,
} = {}) => {
  const calls = {
    readiness: 0, assemble: 0, scan: 0, publish: 0, reserve: 0, execute: 0, getState: 0,
    reservedInput: null, publishedPackage: null,
  };
  const resolved = resolutions || ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.map(readyResolution);
  const tables = new Map();
  for (const manifest of manifests) {
    for (const requirement of ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence) {
      tables.set(`${manifest.package_id}:${requirement.dataset_type}`, [{
        performance_date: manifest.current_window.start,
        clicks: 0,
      }]);
    }
  }
  const store = {
    scanManifests: async () => { calls.scan += 1; return { manifests: clone(manifests), rejected: [] }; },
    readDatasetTable: async (packageId, reference) => clone(tables.get(`${packageId}:${reference.dataset_type}`) || []),
  };
  const realAssembler = new TaskPackageAssembler({ resolveCurrent: async () => clone(resolved) }, store);
  const assembler = {
    assemble: async (input) => { calls.assemble += 1; return realAssembler.assemble(input); },
  };
  const definition = createAdsOptimizationPackDesktopDefinition({
    publish_package: async (taskPackage) => {
      calls.publish += 1;
      calls.publishedPackage = clone(taskPackage);
      if (publishPackage) return publishPackage(taskPackage);
      return { package_id: taskPackage.manifest.package_id };
    },
  });
  let packageSequence = 0;
  const repository = {
    getWorkspace: (workspaceId) => workspaceId === 'ws_a'
      ? { workspace_id: 'ws_a', workspace_name: 'A', created_at: '2026-09-01T00:00:00.000Z' }
      : null,
    getSourceConnection: () => connection ? {
      connection_id: 'conn_a', workspace_id: 'ws_a', source_id: 'google-ads-search-terms',
      credential_ref: 'cred_google', safe_metadata: { customer_id: customerId, access_token: undefined },
      created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
    } : null,
    listRuns: () => clone(activeRuns),
    reserveRunFromJobPlans: (input) => {
      calls.reserve += 1;
      calls.reservedInput = clone(input);
      const run = {
        ...activeRun,
        run_id: 'run_reserved_package',
        run_status: 'PENDING',
        started_at: null,
        configuration_snapshot: clone(input.configuration_snapshot),
      };
      const jobs = input.job_plans.map((plan, index) => ({
        job_id: `job_reserved_${index}`,
        run_id: run.run_id,
        ...clone(plan),
        job_order: index,
        execution_status: 'PENDING',
        validation_status: 'NOT_RUN',
        attempt_count: 0,
        accepted_artifact_id: null,
        created_at: '2026-09-30T10:00:00.000Z',
        started_at: null,
        completed_at: null,
      }));
      return { run, jobs };
    },
  };
  const stateFor = (runId) => {
    const run = activeRuns.find(({ run_id }) => run_id === runId) || {
      ...activeRun,
      run_id: runId,
      run_status: 'PENDING',
      started_at: null,
    };
    return {
      run: clone(run), jobs: [], completed_jobs: 0, failed_jobs: 0,
      can_resume: false, can_retry: false, can_cancel: true,
    };
  };
  const controller = new DesktopTaskPackageController({
    definitions: [definition],
    repository,
    assembler,
    store,
    get_connection_readiness: async () => { calls.readiness += 1; return readiness; },
    reference_date: () => REFERENCE_DATE,
    now: () => '2026-09-30T10:00:00.000Z',
    application_version: '1.0.0',
    create_package_id: () => `pkg_20260930_${++packageSequence}`,
    execute_run: async () => { calls.execute += 1; },
    get_run_state: (runId) => { calls.getState += 1; return stateFor(runId); },
  });
  return { controller, calls };
};

const startIntent = (overrides = {}) => ({
  workspace_id: 'ws_a',
  recipe_id: 'ADS_OPTIMIZATION_PACK',
  recipe_version: 1,
  reference_date: REFERENCE_DATE,
  current_window: clone(CURRENT_WINDOW),
  account_identity: clone(ACCOUNT),
  ...overrides,
});

const assertSafe = (value) => {
  const serialized = JSON.stringify(value);
  for (const forbidden of ['rows', 'artifact_sha256', 'credential_ref', 'access_token', 'raw_body', '/Users/']) {
    assert.equal(serialized.includes(forbidden), false, `Review leaked ${forbidden}`);
  }
};

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof DesktopTaskPackageControllerError, true);
    assert.equal(error.code, code);
    return true;
  });
}

async function main() {
  assert.equal(isDesktopTaskPackageReviewIntent({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' }), true);
  assert.equal(isDesktopTaskPackageReviewIntent({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK', path: '/tmp/x' }), false);
  assert.equal(isDesktopTaskPackageReviewIntent({ workspace_id: '', recipe_id: 'ADS_OPTIMIZATION_PACK' }), false);
  await expectCode(createHarness().controller.review({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK', extra: true }), 'INVALID_INTENT');
  await expectCode(createHarness().controller.review({ workspace_id: 'missing', recipe_id: 'ADS_OPTIMIZATION_PACK' }), 'UNKNOWN_WORKSPACE');
  await expectCode(createHarness().controller.review({ workspace_id: 'ws_a', recipe_id: 'UNKNOWN' }), 'UNKNOWN_RECIPE');

  const mixed = await realTemporalResolutions();
  const mixedHarness = createHarness({ resolutions: mixed });
  const review = await mixedHarness.controller.review({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' });
  assert.deepEqual(Object.keys(review).sort(), [
    'account_identity', 'can_open', 'can_start', 'collection_run_id', 'current_window', 'customer_id',
    'recipe_id', 'recipe_label', 'recipe_version', 'reference_date', 'requirements', 'status', 'workspace_id',
  ].sort());
  assert.equal(review.customer_id, ACCOUNT.value);
  assert.deepEqual(review.account_identity, ACCOUNT);
  assert.deepEqual(review.current_window, CURRENT_WINDOW);
  assert.equal(review.status, 'NOT_READY');
  assert.equal(review.can_start, true);
  assert.equal(review.requirements.length, 6);
  assert.equal(new Set(review.requirements.map(({ requirement_id }) => requirement_id)).size, 6);
  assert.deepEqual(review.requirements.map(({ status }) => status), [
    'REUSE_EXACT', 'REUSE_FILTERED', 'NO_DATA', 'COLLECT_REQUIRED', 'COLLECT_REQUIRED', 'COLLECT_REQUIRED',
  ]);
  assert.equal(review.requirements[3].reason_codes.includes('NO_DATA_REQUIRES_EXACT_WINDOW'), true);
  assert.equal(mixedHarness.calls.readiness, 1);
  assert.equal(mixedHarness.calls.assemble, 1);
  assert.equal(mixedHarness.calls.scan, 1);
  assert.equal(mixedHarness.calls.publish, 0);
  assert.equal(mixedHarness.calls.reserve, 0);
  assertSafe(review);

  for (const readiness of ['CONFIGURATION_REQUIRED', 'CONNECTION_REQUIRED', 'MANUAL_ACTION_REQUIRED']) {
    const blockedHarness = createHarness({ readiness });
    const blocked = await blockedHarness.controller.review({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' });
    assert.equal(blocked.status, 'NOT_READY');
    assert.equal(blocked.can_start, false);
    assert.equal(blocked.requirements.every(({ status }) => status === 'BLOCKED'), true);
    assert.equal(blocked.requirements.every(({ reason_codes }) => reason_codes[0] === readiness), true);
    assert.equal(blockedHarness.calls.assemble, 0);
    assert.equal(blockedHarness.calls.scan, 0);
  }

  const noConnection = createHarness({ connection: false });
  const noConnectionReview = await noConnection.controller.review({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' });
  assert.equal(noConnectionReview.can_start, false);
  assert.equal(noConnectionReview.requirements.every(({ reason_codes }) => reason_codes[0] === 'CONFIGURATION_REQUIRED'), true);

  const activeHarness = createHarness({ resolutions: mixed, activeRuns: [activeRun] });
  const active = await activeHarness.controller.review({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' });
  assert.equal(active.collection_run_id, activeRun.run_id);
  assert.equal(active.status, 'NOT_READY');
  assert.equal(active.can_start, false);

  const initialHarness = createHarness();
  const initial = await initialHarness.controller.review({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' });
  assert.equal(initial.status, 'INITIAL_BASELINE');
  assert.equal(initial.can_start, true);
  assert.equal(initial.can_open, false);
  assert.equal('previous_window' in initial, false);

  const previous = priorManifest();
  const comparisonHarness = createHarness({ manifests: [previous] });
  const comparison = await comparisonHarness.controller.review({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' });
  assert.equal(comparison.status, 'COMPARISON');
  assert.equal(comparison.previous_package_id, previous.package_id);
  assert.deepEqual(comparison.previous_window, previous.current_window);
  assert.equal(comparison.gap_days, 8);

  const identical = {
    ...priorManifest('pkg_existing'),
    created_at: '2026-09-30T09:00:00.000Z',
    current_window: clone(CURRENT_WINDOW),
  };
  const duplicateHarness = createHarness({ manifests: [identical] });
  const duplicate = await duplicateHarness.controller.review({ workspace_id: 'ws_a', recipe_id: 'ADS_OPTIMIZATION_PACK' });
  assert.equal(duplicate.status, 'EXISTING_PACKAGE');
  assert.equal(duplicate.existing_package_id, identical.package_id);
  assert.equal(duplicate.can_start, false);
  assert.equal(duplicate.can_open, true);
  assert.equal(duplicateHarness.calls.publish, 0);
  assertSafe(duplicate);

  const publishHarness = createHarness();
  const published = await publishHarness.controller.start(startIntent());
  assert.equal(published.status, 'PACKAGE_PUBLISHED');
  assert.equal(published.package.package_id, 'pkg_20260930_1');
  assert.equal(published.package.package_kind, 'INITIAL_BASELINE');
  assert.deepEqual(published.package.current_window, CURRENT_WINDOW);
  assert.equal(publishHarness.calls.assemble, 1, 'Start must re-resolve and assemble once.');
  assert.equal(publishHarness.calls.publish, 1);
  assert.equal(publishHarness.calls.reserve, 0);
  assert.equal(publishHarness.calls.execute, 0);
  assert.equal(publishHarness.calls.publishedPackage.manifest.package_id, 'pkg_20260930_1');
  assert.equal(publishHarness.calls.publishedPackage.datasets[0].rows[0].clicks, 0);
  assert.equal(publishHarness.calls.publishedPackage.manifest.evidence[0].origin.artifact_sha256, 'a'.repeat(64));
  assertSafe(published);

  const comparisonStartHarness = createHarness({ manifests: [previous] });
  const comparisonPublished = await comparisonStartHarness.controller.start(startIntent());
  assert.equal(comparisonPublished.status, 'PACKAGE_PUBLISHED');
  assert.equal(comparisonPublished.package.package_kind, 'COMPARISON');
  assert.equal(comparisonPublished.package.previous_package_id, previous.package_id);
  assert.deepEqual(comparisonPublished.package.previous_window, previous.current_window);
  assert.equal(comparisonPublished.package.gap_days, 8);

  const duplicateStartHarness = createHarness({ manifests: [identical] });
  const existing = await duplicateStartHarness.controller.start(startIntent());
  assert.equal(existing.status, 'EXISTING_PACKAGE');
  assert.equal(existing.package.package_id, identical.package_id);
  assert.equal(duplicateStartHarness.calls.publish, 0);
  assert.equal(duplicateStartHarness.calls.reserve, 0);

  for (const stale of [
    startIntent({ recipe_version: 2 }),
    startIntent({ reference_date: '2026-09-29' }),
    startIntent({ current_window: { start: '2026-09-22', end: '2026-09-28' } }),
    startIntent({ account_identity: { field: 'customer_id', value: '9999999999' } }),
  ]) {
    const staleHarness = createHarness();
    await expectCode(staleHarness.controller.start(stale), 'STALE_REVIEW');
    assert.equal(staleHarness.calls.publish, 0);
    assert.equal(staleHarness.calls.reserve, 0);
    assert.equal(staleHarness.calls.execute, 0);
  }
  await expectCode(createHarness().controller.start({ ...startIntent(), path: '/tmp/attacker.xlsx' }), 'INVALID_INTENT');

  const activeStartHarness = createHarness({ resolutions: mixed, activeRuns: [activeRun] });
  const activeStart = await activeStartHarness.controller.start(startIntent());
  assert.equal(activeStart.status, 'COLLECTION_STARTED');
  assert.equal(activeStart.run_state.run.run_id, activeRun.run_id);
  assert.equal(activeStartHarness.calls.reserve, 0);
  assert.equal(activeStartHarness.calls.execute, 0);

  let releasePublish;
  const raceHarness = createHarness({
    publishPackage: (taskPackage) => new Promise((resolve) => {
      releasePublish = () => resolve({ package_id: taskPackage.manifest.package_id });
    }),
  });
  const firstStart = raceHarness.controller.start(startIntent());
  await new Promise((resolve) => setImmediate(resolve));
  await expectCode(raceHarness.controller.start(startIntent()), 'ACTIVE_MATCHING_COLLECTION');
  releasePublish();
  await firstStart;
  assert.equal(raceHarness.calls.publish, 1);

  const twoMissing = ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.map((requirement, index) => (
    index < 4 ? readyResolution(requirement) : missingResolution(requirement)
  ));
  const collectionHarness = createHarness({ resolutions: twoMissing });
  const collection = await collectionHarness.controller.start(startIntent());
  assert.equal(collection.status, 'COLLECTION_STARTED');
  assert.equal(collection.run_state.run.run_id, 'run_reserved_package');
  assert.equal(collectionHarness.calls.reserve, 1);
  assert.equal(collectionHarness.calls.execute, 1);
  assert.equal(collectionHarness.calls.publish, 0);
  assert.equal(collectionHarness.calls.reservedInput.job_plans.length, 2);
  assert.deepEqual(collectionHarness.calls.reservedInput.job_plans.map(({ job_key }) => job_key), [
    'AD_PERFORMANCE', 'RSA_ASSET_PERFORMANCE',
  ]);
  for (const plan of collectionHarness.calls.reservedInput.job_plans) {
    assert.equal(plan.source_id, 'google-ads-search-reporting');
    assert.equal(plan.source_context.source_id, 'google-ads-search-reporting');
    assert.equal(plan.source_context.campaign_type, 'SEARCH');
    assert.equal(plan.source_context.customer_id, ACCOUNT.value);
    assert.equal(plan.source_context.requested_date_start, CURRENT_WINDOW.start);
    assert.equal(plan.source_context.requested_date_end, CURRENT_WINDOW.end);
    assert.equal(plan.source_context.dataset_schema_version, 1);
  }
  assert.equal(typeof collectionHarness.controller.retry, 'undefined');

  const blockedStartHarness = createHarness({ readiness: 'CONNECTION_REQUIRED' });
  await expectCode(blockedStartHarness.controller.start(startIntent()), 'CONNECTION_REQUIRED');
  assert.equal(blockedStartHarness.calls.reserve, 0);
  assert.equal(blockedStartHarness.calls.execute, 0);
  assert.equal(blockedStartHarness.calls.publish, 0);

  console.log('PASS ADS-OPTIMIZATION-PACK-DESKTOP-CONTROLLER-001: local review is safe, exact, assembler-authoritative, duplicate-aware, and acquisition-free');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
