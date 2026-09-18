const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build and work roots.');

const { parseKeywordPlannerManualCsv } = require(path.join(
  buildRoot,
  'main/sources/google-ads/keyword-planner-csv-parser.js',
));
const { KeywordPlannerManualCsvSource } = require(path.join(
  buildRoot,
  'main/sources/google-ads/keyword-planner-csv-source.js',
));
const { DesktopMultiSourceController } = require(path.join(
  buildRoot,
  'main/app/desktop-multisource-controller.js',
));
const { createProductionCollectionRuntime } = require(path.join(
  buildRoot,
  'main/app/production-collection-runtime.js',
));
const { initializeDatabase, getDatabasePath } = require(path.join(
  buildRoot,
  'main/storage/database.js',
));
const { StateRepository } = require(path.join(
  buildRoot,
  'main/storage/state-repository.js',
));

const SOURCE = 'google-keyword-planner-csv';
const API_SOURCE = 'google-keyword-planner';
const TASK = 'keyword-planner-manual-csv-import';

const headers = [
  'Keyword',
  'Currency',
  'Segmentation',
  'Avg. monthly searches',
  'Three month change',
  'YoY change',
  'Competition',
  'Competition (indexed value)',
  'Top of page bid (low range)',
  'Top of page bid (high range)',
  'Ad impression share',
  'Organic average position',
  'Organic impression share',
  'In Account',
  'Searches: Aug 2025',
  'Searches: Sep 2025',
  'Searches: Oct 2025',
  'Searches: Nov 2025',
  'Searches: Dec 2025',
  'Searches: Jan 2026',
  'Searches: Feb 2026',
  'Searches: Mar 2026',
  'Searches: Apr 2026',
  'Searches: May 2026',
  'Searches: Jun 2026',
  'Searches: Jul 2026',
];

const row = (cells) => Array.from({ length: headers.length }, (_, index) => cells[index] ?? '').join('\t');

const observedShape = [
  'Keyword Stats 2026-09-08 at 16_21_37',
  '1 August 2025 - 31 July 2026',
  headers.join('\t'),
  row({ 2: 'All', 3: '220.0' }),
  row({ 2: 'Türkiye', 3: '220.0' }),
  row({
    0: 'sample plant',
    1: 'TRY',
    3: '100.0',
    4: '-17%',
    5: '26%',
    6: 'Orta',
    7: '62',
    8: '"5,16"',
    9: '"23,53"',
    13: 'Y',
    14: '10',
    15: '20',
    16: '30',
    17: '40',
    18: '50',
    19: '60',
    20: '70',
    21: '80',
    22: '90',
    23: '100',
    24: '110',
    25: '120',
  }),
  row({ 0: 'blank metrics plant', 1: 'TRY' }),
].join('\r\n');

const utf16le = (text) => new Uint8Array(Buffer.concat([
  Buffer.from([0xff, 0xfe]),
  Buffer.from(text, 'utf16le'),
]));

test('KEYWORD-PLANNER-CSV-PARSER-001: observed UTF-16 tab export normalizes rows and preserves blank metrics as null', () => {
  const parsed = parseKeywordPlannerManualCsv(utf16le(observedShape));

  assert.equal(parsed.metadata.title, 'Keyword Stats 2026-09-08 at 16_21_37');
  assert.equal(parsed.metadata.date_range_label, '1 August 2025 - 31 July 2026');
  assert.equal(parsed.metadata.segmentation_rows, 2);
  assert.equal(parsed.rows.length, 2);

  assert.deepEqual(parsed.rows[0], {
    requested_keyword: 'sample plant',
    returned_keyword: 'sample plant',
    group_id: 'manual-import',
    currency: 'TRY',
    avg_monthly_searches: 100,
    competition: 'Orta',
    competition_index: 62,
    top_of_page_bid_low: 5.16,
    top_of_page_bid_high: 23.53,
    change_3_month: -17,
    change_yoy: 26,
    monthly_history: [
      { year: 2025, month: 8, searches: 10 },
      { year: 2025, month: 9, searches: 20 },
      { year: 2025, month: 10, searches: 30 },
      { year: 2025, month: 11, searches: 40 },
      { year: 2025, month: 12, searches: 50 },
      { year: 2026, month: 1, searches: 60 },
      { year: 2026, month: 2, searches: 70 },
      { year: 2026, month: 3, searches: 80 },
      { year: 2026, month: 4, searches: 90 },
      { year: 2026, month: 5, searches: 100 },
      { year: 2026, month: 6, searches: 110 },
      { year: 2026, month: 7, searches: 120 },
    ],
  });

  assert.equal(parsed.rows[1].avg_monthly_searches, null);
  assert.equal(parsed.rows[1].competition, null);
  assert.equal(parsed.rows[1].competition_index, null);
  assert.equal(parsed.rows[1].top_of_page_bid_low, null);
  assert.equal(parsed.rows[1].top_of_page_bid_high, null);
  assert.equal(parsed.rows[1].change_3_month, null);
  assert.equal(parsed.rows[1].change_yoy, null);
  assert.deepEqual(
    parsed.rows[1].monthly_history.map((month) => month.searches),
    Array(12).fill(null),
  );
});

test('KEYWORD-PLANNER-CSV-PARSER-002: unrelated, wrongly encoded, malformed, or partial inputs fail closed', () => {
  const cases = [
    ['UTF-8 without BOM', new Uint8Array(Buffer.from(observedShape, 'utf8'))],
    ['unrelated UTF-16', utf16le('unrelated\tcontent')],
    ['wrong keyword header', utf16le(observedShape.replace('Keyword\tCurrency', 'Query\tCurrency'))],
    ['malformed number', utf16le(observedShape.replace('100.0\t-17%', 'not-a-number\t-17%'))],
    ['unclosed quote', utf16le(observedShape.replace('"5,16"', '"5,16'))],
    ['partial row', utf16le(observedShape.replace('\t120\r\nblank metrics plant', '\r\nblank metrics plant'))],
  ];

  for (const [label, bytes] of cases) {
    assert.throws(
      () => parseKeywordPlannerManualCsv(bytes),
      undefined,
      label,
    );
  }
});

const contextFor = (filePath) => ({
  task_id: TASK,
  source_id: SOURCE,
  source_mode: 'FILE_IMPORT',
  file_path: filePath,
});

test('KEYWORD-PLANNER-CSV-SOURCE-001: source binds each explicit reviewed path and preserves exact bytes', async () => {
  const root = path.join(workRoot, 'source-context');
  fs.mkdirSync(root, { recursive: true });
  const firstPath = path.join(root, 'first.csv');
  const secondPath = path.join(root, 'second.csv');
  const firstBytes = utf16le(observedShape);
  const secondBytes = utf16le(observedShape.replace('sample plant', 'second sample'));
  fs.writeFileSync(firstPath, firstBytes);
  fs.writeFileSync(secondPath, secondBytes);

  const source = new KeywordPlannerManualCsvSource();
  const first = await source.collect({ source_id: SOURCE, source_context: contextFor(firstPath) });
  const second = await source.collect({ source_id: SOURCE, source_context: contextFor(secondPath) });
  assert.equal(first.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(second.result_type, 'ARTIFACT_PRODUCED');
  assert.deepEqual([...first.bytes], [...firstBytes]);
  assert.deepEqual([...second.bytes], [...secondBytes]);

  for (const invalid of [
    { ...contextFor(firstPath), task_id: 'other-task' },
    { ...contextFor(firstPath), source_id: API_SOURCE },
    { ...contextFor(firstPath), source_mode: 'OFFICIAL_API' },
    { ...contextFor(firstPath), file_path: 'relative.csv' },
    { ...contextFor(firstPath), file_path: root },
    {},
  ]) {
    const result = await source.collect({ source_id: SOURCE, source_context: invalid });
    assert.equal(result.result_type, 'FAILED');
  }
});

test('KEYWORD-PLANNER-CSV-CORE-001: Review locks FILE_IMPORT provenance and Core validates stored raw evidence', async (t) => {
  const root = path.join(workRoot, 'review-core');
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(root, key)]),
  );
  directories.app_data_root = root;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');

  const selectedPath = path.join(root, 'keyword-stats.csv');
  const selectedBytes = utf16le(observedShape);
  fs.writeFileSync(selectedPath, selectedBytes);

  let repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'Keyword CSV test' });
  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    now: () => new Date('2026-09-18T10:00:00.000Z'),
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
  invalidDraft.reusable_configuration.sources[SOURCE].file_path = 'relative.csv';
  const invalidReview = await controller.reviewDraft(invalidDraft);
  assert.equal(invalidReview.reviewed_draft, null);
  assert.equal(invalidReview.job_count, 0);
  assert.equal(invalidReview.can_start, false);

  const review = await controller.reviewDraft(draft);
  assert.ok(review.reviewed_draft);
  assert.equal(review.can_start, true);
  assert.equal(review.job_count, 1);
  assert.deepEqual(review.reviewed_draft.resolved_configuration.sources[SOURCE], {
    included: true,
    task_id: TASK,
    source_id: SOURCE,
    source_mode: 'FILE_IMPORT',
    file_path: selectedPath,
  });

  const started = await controller.startDraft(review.reviewed_draft);
  assert.equal(started.jobs[0].source_id, SOURCE);
  assert.notEqual(started.jobs[0].source_id, API_SOURCE);
  assert.deepEqual(started.jobs[0].source_context, contextFor(selectedPath));

  repository.close();
  repository = new StateRepository(getDatabasePath(directories));
  const runtime = createProductionCollectionRuntime({
    repository,
    directories,
    credentialStore: { readCredential: async () => '' },
    googleTrendsSource: {
      id: 'google-trends',
      name: 'Google Trends',
      sourceMode: 'GOOGLE_TRENDS_UI',
      datasetTypes: ['INTEREST_OVER_TIME'],
      getCapabilities: () => ({
        requires_browser: true,
        requires_oauth: false,
        may_require_manual_login: true,
        supports_custom_date_range: true,
        supports_direct_export: true,
        supports_api: false,
        supports_resume: true,
        max_concurrency: 1,
      }),
      checkReadiness: async () => ({ source_id: 'google-trends', readiness_status: 'READY', checked_at: new Date().toISOString(), message: null }),
      collect: async () => ({ result_type: 'FAILED', error_code: 'UNUSED', message: null }),
    },
  });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);

  const completedJob = repository.listJobs(started.run.run_id)[0];
  assert.equal(completedJob.execution_status, 'COMPLETED');
  assert.equal(completedJob.validation_status, 'VALID');
  const artifact = repository.getArtifact(completedJob.accepted_artifact_id);
  assert.ok(artifact);
  const storedBytes = fs.readFileSync(path.join(directories.runs, started.run.run_id, artifact.relative_path));
  assert.deepEqual([...storedBytes], [...selectedBytes]);
  assert.deepEqual([...fs.readFileSync(selectedPath)], [...selectedBytes]);
});
