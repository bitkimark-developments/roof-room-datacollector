const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const { ADS_OPTIMIZATION_PACK_V1_RECIPE } = require(path.join(
  buildRoot,
  'main/task-packages/ads-optimization-pack-recipe.js',
));
const { TaskPackageAssembler } = require(path.join(
  buildRoot,
  'main/task-packages/task-package-assembler.js',
));

const CURRENT_WINDOW = { start: '2026-09-23', end: '2026-09-29' };
const ACCOUNT = { field: 'customer_id', value: '1234567890' };
const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const readyResolution = (requirement, index) => {
  const noData = index === 5;
  const filtered = index >= 2 && index <= 4;
  const rows = noData ? [] : [{
    performance_date: CURRENT_WINDOW.start,
    clicks: 0,
    conversions: null,
    campaign_status: 'ENABLED',
    daily_budget_micros: 100,
    snapshot_observed_at: `2026-09-${String(10 + index).padStart(2, '0')}T08:00:00.000Z`,
  }];
  return {
    status: 'READY',
    requirement,
    rows,
    evidence: {
      requirement_id: requirement.requirement_id,
      role: 'CURRENT',
      disposition: noData ? 'NO_DATA' : filtered ? 'REUSED_FILTERED' : 'REUSED_EXACT',
      window: clone(CURRENT_WINDOW),
      origin: {
        run_id: `run_${index}`,
        job_id: `job_${index}`,
        attempt_number: index + 1,
        artifact_id: `artifact_${index}`,
        artifact_sha256: String(index + 1).repeat(64),
        acquired_at: `2026-08-${String(10 + index).padStart(2, '0')}T08:00:00.000Z`,
        validation_status: noData ? 'NO_DATA' : 'VALID',
        source_id: requirement.source_id,
        dataset_type: requirement.dataset_type,
        resource_mode: requirement.resource_mode,
        acquisition_mode: requirement.acquisition_mode,
        campaign_scope: requirement.campaign_scope,
        dataset_schema_version: requirement.dataset_schema_version,
        account_identity: clone(ACCOUNT),
        snapshot_observed_at: `2026-09-${String(10 + index).padStart(2, '0')}T08:00:00.000Z`,
      },
      transformation: filtered ? {
        kind: 'DATE_FILTER',
        row_date_field: requirement.row_date_field,
        input_window: { start: '2026-09-20', end: '2026-09-30' },
        output_window: clone(CURRENT_WINDOW),
        input_row_count: 3,
        output_row_count: rows.length,
      } : { kind: 'NONE' },
      row_count: rows.length,
    },
    rejected_candidates: [],
  };
};

const makeAssembler = (resolutions, { manifests = [], tables = new Map(), rejected = [] } = {}) => {
  let publishCalls = 0;
  const resolver = { resolveCurrent: async () => clone(resolutions) };
  const store = {
    scanManifests: async () => ({ manifests: clone(manifests), rejected: clone(rejected) }),
    readDatasetTable: async (packageId, reference) => {
      const value = tables.get(`${packageId}:${reference.dataset_type}`);
      if (value instanceof Error) throw value;
      if (value === undefined) throw new Error(`Missing prior table fixture ${packageId}:${reference.dataset_type}`);
      return clone(value);
    },
    publishPackage: async () => { publishCalls += 1; throw new Error('Assembler must not publish.'); },
  };
  return {
    assembler: new TaskPackageAssembler(resolver, store),
    publishCalls: () => publishCalls,
  };
};

const priorManifest = ({
  packageId,
  start = '2026-09-08',
  end = '2026-09-14',
  createdAt = '2026-09-15T10:00:00+03:00',
  overrides = {},
  evidenceCount = 6,
}) => {
  const evidence = ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.slice(0, evidenceCount).map((requirement, index) => ({
    ...readyResolution(requirement, index).evidence,
    window: { start, end },
    origin: {
      ...readyResolution(requirement, index).evidence.origin,
      snapshot_observed_at: `2026-09-${String(1 + index).padStart(2, '0')}T07:00:00.000Z`,
    },
    table: {
      filename: `datasets/current-${requirement.dataset_type.toLowerCase()}.json`,
      sha256: 'a'.repeat(64),
      row_count: index === 5 ? 0 : 1,
      role: 'CURRENT',
      dataset_type: requirement.dataset_type,
    },
  }));
  return {
    manifest_version: 1,
    package_id: packageId,
    recipe_id: 'ADS_OPTIMIZATION_PACK',
    recipe_version: 1,
    recipe_label: 'Kampanya Gelişim',
    package_kind: 'INITIAL_BASELINE',
    workspace_id: 'ws_a',
    account_identity: clone(ACCOUNT),
    customer_id: ACCOUNT.value,
    created_at: createdAt,
    application_version: '1.0.0',
    campaign_scope: 'SEARCH',
    current_window: { start, end },
    dataset_schema_version: 1,
    required_datasets: ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.map(({ requirement_id }) => requirement_id),
    evidence,
    excluded_coverage: {},
    workbook_filename: `kampanya-gelisim-${createdAt.slice(0, 10)}-baseline.xlsx`,
    ...overrides,
  };
};

const priorTables = (manifest, marker = manifest.package_id) => new Map(
  ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.map((requirement, index) => [
    `${manifest.package_id}:${requirement.dataset_type}`,
    index === 5 ? [] : [{
      performance_date: manifest.current_window.start,
      clicks: index,
      snapshot_observed_at: manifest.evidence[index].origin.snapshot_observed_at,
      prior_marker: marker,
      ...(index === 0 ? { campaign_status: 'PAUSED', daily_budget_micros: 50 } : {}),
    }],
  ]),
);

const input = {
  recipe: ADS_OPTIMIZATION_PACK_V1_RECIPE,
  package_id: 'pkg_initial',
  workspace_id: 'ws_a',
  account_identity: ACCOUNT,
  reference_date: '2026-09-30',
  created_at: '2026-09-30T10:15:00+03:00',
  application_version: '1.0.0',
};

const forbiddenKey = /^(?:recommendation|recommendation_score|score|delta|action|cpa|roas|winner|loser|go_pause)$/iu;
const assertNoAnalysis = (value) => {
  if (Array.isArray(value)) return value.forEach(assertNoAnalysis);
  if (typeof value !== 'object' || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(forbiddenKey.test(key), false, `Unexpected analysis field ${key}`);
    assertNoAnalysis(nested);
  }
};

async function main() {
  const ready = ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.map(readyResolution);
  const rawFixtures = ready.map((resolution) => Buffer.from(JSON.stringify(resolution.rows)));
  const rawHashesBefore = rawFixtures.map(hash);
  const originalReady = clone(ready);
  const { assembler, publishCalls } = makeAssembler(ready);
  const result = await assembler.assemble(input);

  assert.equal(result.status, 'READY');
  assert.equal(publishCalls(), 0);
  assert.deepEqual(result.package.manifest.current_window, CURRENT_WINDOW);
  assert.equal(result.package.manifest.package_kind, 'INITIAL_BASELINE');
  assert.equal(result.package.manifest.customer_id, ACCOUNT.value);
  assert.equal(result.package.manifest.previous_package_id, undefined);
  assert.equal(result.package.manifest.previous_window, undefined);
  assert.equal(result.package.manifest.gap_days, undefined);
  assert.equal(result.package.manifest.workbook_filename, 'kampanya-gelisim-2026-09-30-baseline.xlsx');
  assert.deepEqual(result.package.manifest.required_datasets, ADS_OPTIMIZATION_PACK_V1_RECIPE.required_evidence.map(({ requirement_id }) => requirement_id));
  assert.equal(result.package.datasets.length, 6);
  assert.equal(new Set(result.package.datasets.map(({ requirement_id }) => requirement_id)).size, 6);
  assert.equal(result.package.datasets.every(({ role }) => role === 'CURRENT'), true);
  assert.deepEqual(result.package.datasets.map(({ evidence }) => evidence.disposition), [
    'REUSED_EXACT', 'REUSED_EXACT', 'REUSED_FILTERED', 'REUSED_FILTERED', 'REUSED_FILTERED', 'NO_DATA',
  ]);
  assert.equal(result.package.datasets[0].rows[0].clicks, 0);
  assert.equal(result.package.datasets[0].rows[0].conversions, null);
  assert.equal(
    result.package.datasets[0].evidence.origin.snapshot_observed_at,
    originalReady[0].evidence.origin.snapshot_observed_at,
  );
  assert.deepEqual(rawFixtures.map(hash), rawHashesBefore, 'Assembly must not mutate raw fixture bytes.');
  assert.deepEqual(ready, originalReady, 'Assembly must not mutate resolver results.');
  result.package.datasets[0].rows[0].clicks = 999;
  assert.equal(ready[0].rows[0].clicks, 0, 'Assembled rows must be independent copies.');
  assertNoAnalysis(result.package);

  for (let missingIndex = 0; missingIndex < ready.length; missingIndex += 1) {
    const missing = ready.map((resolution, index) => index === missingIndex ? {
      status: 'MISSING',
      requirement: resolution.requirement,
      reason_codes: ['NO_COMPATIBLE_EVIDENCE'],
      rejected_candidates: [],
    } : resolution);
    const fixture = makeAssembler(missing);
    const notReady = await fixture.assembler.assemble({ ...input, package_id: `pkg_missing_${missingIndex}` });
    assert.equal(notReady.status, 'NOT_READY');
    assert.deepEqual(notReady.current_window, CURRENT_WINDOW);
    assert.equal(notReady.requirements.length, 6);
    assert.equal(notReady.requirements.filter(({ status }) => status === 'READY').length, 5);
    assert.equal(notReady.requirements[missingIndex].status, 'MISSING');
    assert.ok(notReady.requirements[missingIndex].reason_codes.includes('NO_COMPATIBLE_EVIDENCE'));
    assert.equal('package' in notReady, false, 'Missing evidence must not become an empty packaged dataset.');
    assert.equal(fixture.publishCalls(), 0);
  }

  for (const reason of [
    'AUTHENTICATION_UNAVAILABLE', 'API_UNAVAILABLE', 'INCOMPATIBLE_SCHEMA',
    'INCOMPATIBLE_WINDOW', 'INCOMPATIBLE_CONTEXT', 'INELIGIBLE_VALIDATION',
  ]) {
    const unavailable = clone(ready);
    unavailable[0] = {
      status: 'MISSING',
      requirement: ready[0].requirement,
      reason_codes: [reason],
      rejected_candidates: [{ code: reason, identity: 'fixture' }],
    };
    const notReady = await makeAssembler(unavailable).assembler.assemble(input);
    assert.equal(notReady.status, 'NOT_READY');
    assert.deepEqual(notReady.requirements[0].reason_codes, [reason]);
  }

  const selectedPrior = priorManifest({ packageId: 'pkg_previous' });
  const olderPrior = priorManifest({
    packageId: 'pkg_older', start: '2026-09-01', end: '2026-09-07', createdAt: '2026-09-08T09:00:00+03:00',
  });
  const corruptNewer = priorManifest({
    packageId: 'pkg_corrupt', start: '2026-09-15', end: '2026-09-21', createdAt: '2026-09-22T09:00:00+03:00',
  });
  const incompatible = [
    priorManifest({ packageId: 'wrong_recipe', overrides: { recipe_id: 'OTHER' } }),
    priorManifest({ packageId: 'wrong_version', overrides: { recipe_version: 2 } }),
    priorManifest({ packageId: 'wrong_workspace', overrides: { workspace_id: 'ws_b' } }),
    priorManifest({ packageId: 'wrong_customer', overrides: { customer_id: '999', account_identity: { field: 'customer_id', value: '999' } } }),
    priorManifest({ packageId: 'wrong_scope', overrides: { campaign_scope: 'PERFORMANCE_MAX' } }),
    priorManifest({ packageId: 'wrong_schema', overrides: { dataset_schema_version: 2 } }),
    priorManifest({ packageId: 'incomplete', evidenceCount: 5 }),
    priorManifest({ packageId: 'overlap', start: '2026-09-23', end: '2026-09-29' }),
    priorManifest({ packageId: 'future', start: '2026-10-01', end: '2026-10-07' }),
  ];
  const comparisonTables = new Map([
    ...priorTables(selectedPrior),
    ...priorTables(olderPrior),
    ...priorTables(corruptNewer),
  ]);
  comparisonTables.set('pkg_corrupt:CAMPAIGN_PERFORMANCE', new Error('checksum mismatch'));
  const comparisonFixture = makeAssembler(ready, {
    manifests: [...incompatible, olderPrior, selectedPrior, corruptNewer],
    tables: comparisonTables,
    rejected: [
      { package_id: 'pkg_malformed', code: 'Unexpected end of JSON input' },
      { package_id: 'generic-data-package', code: 'No Task Package manifest' },
    ],
  });
  const comparison = await comparisonFixture.assembler.assemble({ ...input, package_id: 'pkg_comparison' });
  assert.equal(comparison.status, 'READY');
  assert.equal(comparison.package.manifest.package_kind, 'COMPARISON');
  assert.equal(comparison.package.manifest.previous_package_id, 'pkg_previous');
  assert.deepEqual(comparison.package.manifest.previous_window, { start: '2026-09-08', end: '2026-09-14' });
  assert.equal(comparison.package.manifest.gap_days, 8);
  assert.equal(comparison.package.manifest.workbook_filename, 'kampanya-gelisim-2026-09-30-2026-09-15.xlsx');
  assert.equal(comparison.package.datasets.length, 12);
  const previous = comparison.package.datasets.filter(({ role }) => role === 'PREVIOUS');
  assert.equal(previous.length, 6);
  assert.equal(previous.every(({ evidence }) => evidence.source_package_id === 'pkg_previous'), true);
  assert.equal(previous.every(({ evidence }) => evidence.role === 'PREVIOUS'), true);
  assert.equal(previous[0].rows[0].campaign_status, 'PAUSED');
  assert.equal(previous[0].rows[0].daily_budget_micros, 50);
  assert.equal(previous[0].rows[0].snapshot_observed_at, selectedPrior.evidence[0].origin.snapshot_observed_at);
  assert.equal(previous[1].rows[0].campaign_status, undefined, 'Historical fields must not be copied from CURRENT.');
  assert.equal(previous[1].rows[0].daily_budget_micros, undefined, 'Missing historical configuration must stay missing.');
  assert.equal(comparison.package.datasets[0].rows[0].campaign_status, 'ENABLED');

  const adjacentPrior = priorManifest({
    packageId: 'pkg_adjacent', start: '2026-09-16', end: '2026-09-22', createdAt: '2026-09-23T09:00:00+03:00',
  });
  const adjacent = await makeAssembler(ready, {
    manifests: [adjacentPrior], tables: priorTables(adjacentPrior),
  }).assembler.assemble({ ...input, package_id: 'pkg_adjacent_comparison' });
  assert.equal(adjacent.status, 'READY');
  assert.equal(adjacent.package.manifest.gap_days, 0);

  const tieOlderCreated = priorManifest({ packageId: 'pkg_tie_old', createdAt: '2026-09-15T09:00:00+03:00' });
  const tieLexicalA = priorManifest({ packageId: 'pkg_tie_a', createdAt: '2026-09-15T11:00:00+03:00' });
  const tieLexicalB = priorManifest({ packageId: 'pkg_tie_b', createdAt: '2026-09-15T11:00:00+03:00' });
  const tieTables = new Map([
    ...priorTables(tieOlderCreated), ...priorTables(tieLexicalA), ...priorTables(tieLexicalB),
  ]);
  const tied = await makeAssembler(ready, {
    manifests: [tieLexicalB, tieOlderCreated, tieLexicalA], tables: tieTables,
  }).assembler.assemble({ ...input, package_id: 'pkg_tied' });
  assert.equal(tied.status, 'READY');
  assert.equal(tied.package.manifest.previous_package_id, 'pkg_tie_a');

  console.log('PASS TASK-PACKAGE-ASSEMBLER-001: CURRENT baseline and immutable PREVIOUS selection are complete, compatible, deterministic, and provenance-preserving');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
