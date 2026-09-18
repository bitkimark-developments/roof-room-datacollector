const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build and work roots.');

const load = (file) => require(path.join(buildRoot, file));
const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
const { createProductionCollectionRuntime } = load('main/app/production-collection-runtime.js');
const { IkasProductsSource } = load('main/sources/ikas/ikas-products-source.js');
const { initializeDatabase, getDatabasePath } = load('main/storage/database.js');
const { StateRepository } = load('main/storage/state-repository.js');

const SOURCE = 'ikas-products';
const TASK = 'ikas-products-import';

const columnName = (index) => {
  let value = index + 1;
  let output = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
};

const sheet = (rows) => `<?xml version="1.0"?><worksheet><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="str"><v>${value}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;

const createWorkbook = (productId, variantId, title) => new Uint8Array(zipSync({
  'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Ikas Excel File"/></sheets></workbook>'),
  'xl/worksheets/sheet1.xml': strToU8(sheet([
    ['Ürün Grup ID', 'Varyant ID', 'İsim', 'Satış Fiyatı', 'İndirimli Fiyatı'],
    [productId, variantId, title, '129.90', ''],
  ])),
}));

const contextFor = (filePath) => ({
  task_id: TASK,
  source_id: SOURCE,
  source_mode: 'FILE_IMPORT',
  file_path: filePath,
});

test('IKAS-FILE-CONTEXT-001: source reads each explicit Job path and rejects invalid context before file access', async () => {
  const root = path.join(workRoot, 'source-context');
  fs.mkdirSync(root, { recursive: true });
  const firstPath = path.join(root, 'first.xlsx');
  const secondPath = path.join(root, 'second.xlsx');
  const firstBytes = createWorkbook('p1', 'v1', 'Ficus');
  const secondBytes = createWorkbook('p2', 'v2', 'Monstera');
  fs.writeFileSync(firstPath, firstBytes);
  fs.writeFileSync(secondPath, secondBytes);

  const source = new IkasProductsSource();
  const first = await source.collect({ source_id: SOURCE, source_context: contextFor(firstPath) });
  const second = await source.collect({ source_id: SOURCE, source_context: contextFor(secondPath) });
  assert.equal(first.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(second.result_type, 'ARTIFACT_PRODUCED');
  assert.deepEqual([...first.bytes], [...firstBytes]);
  assert.deepEqual([...second.bytes], [...secondBytes]);

  for (const invalid of [
    { ...contextFor(firstPath), task_id: 'other-task' },
    { ...contextFor(firstPath), source_id: 'other-source' },
    { ...contextFor(firstPath), source_mode: 'OFFICIAL_API' },
    { ...contextFor(firstPath), file_path: 'relative.xlsx' },
    { ...contextFor(firstPath), file_path: root },
    {},
  ]) {
    const result = await source.collect({ source_id: SOURCE, source_context: invalid });
    assert.equal(result.result_type, 'FAILED');
  }
});

test('IKAS-REVIEW-CORE-001: reviewed file path persists through Start and Core preserves exact XLSX bytes before validation', async (t) => {
  const root = path.join(workRoot, 'review-core');
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(root, key)]),
  );
  directories.app_data_root = root;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');

  const selectedPath = path.join(root, 'selected-products.xlsx');
  const selectedBytes = createWorkbook('p1', 'v1', 'Ficus');
  fs.writeFileSync(selectedPath, selectedBytes);

  let repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'İkas test' });
  let clock = new Date('2026-09-18T10:00:00.000Z');
  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    now: () => clock,
    readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) },
  });
  const draft = controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  draft.reusable_configuration = {
    sources: {
      [SOURCE]: {
        included: true,
        task_id: TASK,
        file_path: selectedPath,
      },
    },
  };

  const invalidDraft = structuredClone(draft);
  invalidDraft.reusable_configuration.sources[SOURCE].file_path = 'relative.xlsx';
  const invalidReview = await controller.reviewDraft(invalidDraft);
  assert.equal(invalidReview.reviewed_draft, null);
  assert.equal(invalidReview.job_count, 0);
  assert.equal(invalidReview.can_start, false);

  const legacyDraft = structuredClone(draft);
  delete legacyDraft.reusable_configuration.sources[SOURCE].task_id;
  const legacyReview = await controller.reviewDraft(legacyDraft);
  assert.ok(legacyReview.reviewed_draft, 'A saved pre-task İkas path must be enriched into the current reviewed contract.');
  assert.deepEqual(
    legacyReview.reviewed_draft.resolved_configuration.sources[SOURCE],
    {
      included: true,
      task_id: TASK,
      source_id: SOURCE,
      source_mode: 'FILE_IMPORT',
      file_path: selectedPath,
    },
  );

  const review = await controller.reviewDraft(draft);
  assert.ok(review.reviewed_draft, 'İkas Review must lock an exact FILE_IMPORT artifact.');
  assert.equal(review.can_start, true);
  assert.equal(review.job_count, 1);
  assert.deepEqual(review.reviewed_draft.resolved_configuration.sources[SOURCE], {
    included: true,
    task_id: TASK,
    source_id: SOURCE,
    source_mode: 'FILE_IMPORT',
    file_path: selectedPath,
  });
  const reviewed = structuredClone(review.reviewed_draft);

  clock = new Date('2026-09-19T10:00:00.000Z');
  const started = await controller.startDraft(review.reviewed_draft);
  assert.deepEqual(review.reviewed_draft, reviewed);
  assert.deepEqual(started.jobs[0].source_context, contextFor(selectedPath));
  assert.equal(started.run.configuration_snapshot.reference_date, '2026-09-18');

  repository.close();
  repository = new StateRepository(getDatabasePath(directories));
  assert.deepEqual(repository.listJobs(started.run.run_id)[0].source_context, contextFor(selectedPath));

  const runtime = createProductionCollectionRuntime({
    repository,
    directories,
    credentialStore: { readCredential: async () => '' },
    googleTrendsSource: { id: 'google-trends' },
  });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);
  const completedJob = repository.listJobs(started.run.run_id)[0];
  assert.equal(completedJob.execution_status, 'COMPLETED');
  assert.equal(completedJob.validation_status, 'VALID');
  const artifact = repository.getArtifact(completedJob.accepted_artifact_id);
  assert.ok(artifact);
  assert.deepEqual([...fs.readFileSync(path.join(directories.runs, started.run.run_id, artifact.relative_path))], [...selectedBytes]);
  assert.deepEqual([...fs.readFileSync(selectedPath)], [...selectedBytes], 'Collection must not mutate the selected workbook.');
});
