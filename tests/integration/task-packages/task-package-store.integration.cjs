const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const { parseTaskPackageManifest } = require(path.join(
  buildRoot,
  'main/task-packages/task-package-manifest.js',
));
const { TaskPackageStore } = require(path.join(
  buildRoot,
  'main/task-packages/task-package-store.js',
));

const DATASETS = [
  'CAMPAIGN_PERFORMANCE',
  'AD_GROUP_PERFORMANCE',
  'KEYWORD_PERFORMANCE',
  'SEARCH_TERMS',
  'AD_PERFORMANCE',
  'RSA_ASSET_PERFORMANCE',
];
const MODES = {
  CAMPAIGN_PERFORMANCE: 'campaign',
  AD_GROUP_PERFORMANCE: 'ad_group',
  KEYWORD_PERFORMANCE: 'keyword_view',
  SEARCH_TERMS: 'search_term_view',
  AD_PERFORMANCE: 'ad_group_ad',
  RSA_ASSET_PERFORMANCE: 'ad_group_ad_asset_view',
};

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const tableFilename = (role, dataset) => `datasets/${role.toLowerCase()}-${dataset.toLowerCase().replaceAll('_', '-')}.json`;

const evidenceFor = (role, dataset, packageId, overrides = {}) => ({
  requirement_id: dataset,
  role,
  disposition: dataset === 'RSA_ASSET_PERFORMANCE' ? 'NO_DATA' : 'REUSED_EXACT',
  window: role === 'CURRENT'
    ? { start: '2026-09-23', end: '2026-09-29' }
    : { start: '2026-09-08', end: '2026-09-14' },
  origin: {
    run_id: `run_${role.toLowerCase()}_${dataset}`,
    job_id: `job_${role.toLowerCase()}_${dataset}`,
    attempt_number: 1,
    artifact_id: `artifact_${role.toLowerCase()}_${dataset}`,
    artifact_sha256: 'a'.repeat(64),
    acquired_at: '2026-09-30T08:00:00.000Z',
    validation_status: dataset === 'RSA_ASSET_PERFORMANCE' ? 'NO_DATA' : 'VALID',
    source_id: 'google-ads-search-reporting',
    dataset_type: dataset,
    resource_mode: MODES[dataset],
    acquisition_mode: 'OFFICIAL_API',
    campaign_scope: 'SEARCH',
    dataset_schema_version: 1,
    account_identity: { field: 'customer_id', value: '1234567890' },
    snapshot_observed_at: '2026-09-30T08:00:00.000Z',
  },
  transformation: { kind: 'NONE' },
  row_count: dataset === 'RSA_ASSET_PERFORMANCE' ? 0 : 1,
  ...(role === 'PREVIOUS' ? { source_package_id: 'pkg_previous' } : {}),
  table: {
    filename: tableFilename(role, dataset),
    sha256: 'b'.repeat(64),
    row_count: dataset === 'RSA_ASSET_PERFORMANCE' ? 0 : 1,
    role,
    dataset_type: dataset,
  },
  ...overrides,
});

const manifestFor = ({ comparison = false, packageId = 'pkg_valid', withTables = true } = {}) => {
  const evidence = [
    ...DATASETS.map((dataset) => evidenceFor('CURRENT', dataset, packageId)),
    ...(comparison ? DATASETS.map((dataset) => evidenceFor('PREVIOUS', dataset, packageId)) : []),
  ];
  if (!withTables) {
    for (const entry of evidence) delete entry.table;
  }
  return {
    manifest_version: 1,
    package_id: packageId,
    recipe_id: 'ADS_OPTIMIZATION_PACK',
    recipe_version: 1,
    recipe_label: 'Kampanya Gelişim',
    package_kind: comparison ? 'COMPARISON' : 'INITIAL_BASELINE',
    workspace_id: 'ws_a',
    account_identity: { field: 'customer_id', value: '1234567890' },
    customer_id: '1234567890',
    created_at: '2026-09-30T10:00:00.000Z',
    application_version: '1.0.0',
    campaign_scope: 'SEARCH',
    current_window: { start: '2026-09-23', end: '2026-09-29' },
    ...(comparison ? {
      previous_package_id: 'pkg_previous',
      previous_window: { start: '2026-09-08', end: '2026-09-14' },
      gap_days: 8,
    } : {}),
    dataset_schema_version: 1,
    required_datasets: [...DATASETS],
    evidence,
    excluded_coverage: { PERFORMANCE_MAX: 'NOT_IN_RECIPE' },
    workbook_filename: comparison
      ? 'kampanya-gelisim-2026-09-30-2026-09-15.xlsx'
      : 'kampanya-gelisim-2026-09-30-baseline.xlsx',
  };
};

const clone = (value) => JSON.parse(JSON.stringify(value));

async function main() {
  assert.equal(parseTaskPackageManifest(manifestFor()).package_kind, 'INITIAL_BASELINE');
  assert.equal(parseTaskPackageManifest(manifestFor({ comparison: true })).gap_days, 8);
  const validFiltered = clone(manifestFor());
  validFiltered.evidence[0].disposition = 'REUSED_FILTERED';
  validFiltered.evidence[0].transformation = {
    kind: 'DATE_FILTER',
    row_date_field: 'performance_date',
    input_window: { start: '2026-09-20', end: '2026-09-30' },
    output_window: { start: '2026-09-23', end: '2026-09-29' },
    input_row_count: 3,
    output_row_count: 1,
  };
  assert.equal(parseTaskPackageManifest(validFiltered).evidence[0].transformation.kind, 'DATE_FILTER');

  const invalidCases = [];
  const unsupportedVersion = clone(manifestFor());
  unsupportedVersion.manifest_version = 2;
  invalidCases.push(unsupportedVersion);
  const duplicateRequired = clone(manifestFor());
  duplicateRequired.required_datasets[5] = duplicateRequired.required_datasets[0];
  invalidCases.push(duplicateRequired);
  const shortWindow = clone(manifestFor());
  shortWindow.current_window.start = '2026-09-24';
  invalidCases.push(shortWindow);
  const initialWithPrevious = clone(manifestFor());
  initialWithPrevious.previous_package_id = 'pkg_previous';
  invalidCases.push(initialWithPrevious);
  const comparisonMissingPrevious = clone(manifestFor({ comparison: true }));
  delete comparisonMissingPrevious.previous_window;
  invalidCases.push(comparisonMissingPrevious);
  const traversal = clone(manifestFor());
  traversal.evidence[0].table.filename = '../escape.json';
  invalidCases.push(traversal);
  const secret = clone(manifestFor());
  secret.oauth_token = 'forbidden';
  invalidCases.push(secret);
  const analysis = clone(manifestFor());
  analysis.recommendation_score = 10;
  invalidCases.push(analysis);
  const inconsistentOrigin = clone(manifestFor());
  inconsistentOrigin.evidence[0].origin.dataset_type = 'SEARCH_TERMS';
  invalidCases.push(inconsistentOrigin);
  const filteredWithoutTransformation = clone(manifestFor());
  filteredWithoutTransformation.evidence[0].disposition = 'REUSED_FILTERED';
  invalidCases.push(filteredWithoutTransformation);
  const exactWithTransformation = clone(validFiltered);
  exactWithTransformation.evidence[0].disposition = 'REUSED_EXACT';
  invalidCases.push(exactWithTransformation);
  const mismatchedFilterOutput = clone(validFiltered);
  mismatchedFilterOutput.evidence[0].transformation.output_window = { start: '2026-09-22', end: '2026-09-28' };
  invalidCases.push(mismatchedFilterOutput);
  const nonContainingFilterInput = clone(validFiltered);
  nonContainingFilterInput.evidence[0].transformation.input_window = { start: '2026-09-24', end: '2026-09-30' };
  invalidCases.push(nonContainingFilterInput);
  const inventedFilterRows = clone(validFiltered);
  inventedFilterRows.evidence[0].transformation.input_row_count = 0;
  invalidCases.push(inventedFilterRows);
  for (const invalid of invalidCases) {
    assert.throws(() => parseTaskPackageManifest(invalid), /manifest|package|field|window|dataset|forbidden|path/i);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roofroom-task-package-store-'));
  const packagesRoot = path.join(tempRoot, 'data', 'packages');
  const store = new TaskPackageStore(packagesRoot);
  const manifest = manifestFor({ withTables: false });
  const datasets = DATASETS.map((dataset) => ({
    role: 'CURRENT',
    dataset_type: dataset,
    rows: dataset === 'RSA_ASSET_PERFORMANCE'
      ? []
      : [{ performance_date: '2026-09-23', clicks: 0, conversions: null }],
  }));
  const workbookBytes = Buffer.from('synthetic deterministic workbook');
  const published = await store.publishPackage({
    manifest,
    datasets,
    files: [{ filename: manifest.workbook_filename, bytes: workbookBytes }],
  });
  assert.equal(published.package_id, 'pkg_valid');
  assert.equal(fs.existsSync(path.join(packagesRoot, 'pkg_valid', 'MANIFEST.json')), true);
  assert.equal(fs.readFileSync(path.join(packagesRoot, 'pkg_valid', manifest.workbook_filename)).equals(workbookBytes), true);
  await assert.rejects(
    () => store.publishPackage({ manifest, datasets, files: [{ filename: manifest.workbook_filename, bytes: workbookBytes }] }),
    /exists|overwrite/i,
  );

  const firstTable = published.manifest.evidence[0].table;
  const firstRows = await store.readDatasetTable('pkg_valid', firstTable);
  assert.deepEqual(firstRows, datasets[0].rows);
  const serializedFirstRows = `${JSON.stringify(datasets[0].rows, null, 2)}\n`;
  assert.equal(firstTable.sha256, sha(serializedFirstRows));
  assert.equal(firstTable.row_count, 1);

  const copyPackage = (name) => {
    const target = path.join(packagesRoot, name);
    fs.cpSync(path.join(packagesRoot, 'pkg_valid'), target, { recursive: true });
    const copied = JSON.parse(fs.readFileSync(path.join(target, 'MANIFEST.json'), 'utf8'));
    copied.package_id = name;
    fs.writeFileSync(path.join(target, 'MANIFEST.json'), `${JSON.stringify(copied, null, 2)}\n`);
    return { target, manifest: copied };
  };

  fs.mkdirSync(path.join(packagesRoot, 'pkg_malformed'));
  fs.writeFileSync(path.join(packagesRoot, 'pkg_malformed', 'MANIFEST.json'), '{');

  const invalidSchema = copyPackage('pkg_invalid_schema');
  invalidSchema.manifest.recipe_version = 2;
  fs.writeFileSync(path.join(invalidSchema.target, 'MANIFEST.json'), `${JSON.stringify(invalidSchema.manifest, null, 2)}\n`);

  const wrongCount = copyPackage('pkg_wrong_count');
  wrongCount.manifest.evidence[0].table.row_count = 99;
  fs.writeFileSync(path.join(wrongCount.target, 'MANIFEST.json'), `${JSON.stringify(wrongCount.manifest, null, 2)}\n`);

  const wrongChecksum = copyPackage('pkg_wrong_checksum');
  wrongChecksum.manifest.evidence[0].table.sha256 = 'f'.repeat(64);
  fs.writeFileSync(path.join(wrongChecksum.target, 'MANIFEST.json'), `${JSON.stringify(wrongChecksum.manifest, null, 2)}\n`);

  const changedBytes = copyPackage('pkg_changed_bytes');
  fs.appendFileSync(path.join(changedBytes.target, changedBytes.manifest.evidence[0].table.filename), 'tamper');

  const traversalPackage = copyPackage('pkg_traversal');
  traversalPackage.manifest.evidence[0].table.filename = '../escape.json';
  fs.writeFileSync(path.join(traversalPackage.target, 'MANIFEST.json'), `${JSON.stringify(traversalPackage.manifest, null, 2)}\n`);

  const symlinkTable = copyPackage('pkg_symlink_table');
  const symlinkTablePath = path.join(symlinkTable.target, symlinkTable.manifest.evidence[0].table.filename);
  fs.unlinkSync(symlinkTablePath);
  fs.symlinkSync(path.join(packagesRoot, 'pkg_valid', firstTable.filename), symlinkTablePath);

  const symlinkManifestDir = path.join(packagesRoot, 'pkg_symlink_manifest');
  fs.mkdirSync(symlinkManifestDir);
  fs.symlinkSync(path.join(packagesRoot, 'pkg_valid', 'MANIFEST.json'), path.join(symlinkManifestDir, 'MANIFEST.json'));

  fs.writeFileSync(path.join(packagesRoot, 'generic-data-package.json'), '{}');

  const scan = await store.scanManifests();
  assert.deepEqual(scan.manifests.map(({ package_id }) => package_id), ['pkg_valid']);
  assert.deepEqual(
    new Set(scan.rejected.map(({ package_id }) => package_id)),
    new Set([
      'pkg_malformed', 'pkg_invalid_schema', 'pkg_wrong_count', 'pkg_wrong_checksum',
      'pkg_changed_bytes', 'pkg_traversal', 'pkg_symlink_table', 'pkg_symlink_manifest',
    ]),
  );
  assert.equal(scan.rejected.every(({ code }) => typeof code === 'string' && code.length > 0), true);

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log('PASS TASK-PACKAGE-STORE-001: manifests, tables, checksums, paths, scanning, and atomic non-overwriting publication fail closed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
