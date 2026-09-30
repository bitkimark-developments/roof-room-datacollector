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

const makeAssembler = (resolutions) => {
  let publishCalls = 0;
  const resolver = { resolveCurrent: async () => clone(resolutions) };
  const store = {
    scanManifests: async () => ({ manifests: [], rejected: [] }),
    readDatasetTable: async () => { throw new Error('No prior package table expected.'); },
    publishPackage: async () => { publishCalls += 1; throw new Error('Assembler must not publish.'); },
  };
  return {
    assembler: new TaskPackageAssembler(resolver, store),
    publishCalls: () => publishCalls,
  };
};

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

  console.log('PASS TASK-PACKAGE-ASSEMBLER-001: six-dataset CURRENT baseline assembly is complete, immutable, provenance-preserving, and visibly not ready when evidence is missing');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
