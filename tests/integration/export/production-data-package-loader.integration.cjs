const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build and work roots.');

const { StorageManager } = require(path.join(buildRoot, 'main/storage/storage-manager.js'));
const { ProductionDataPackageLoader } = require(path.join(buildRoot, 'main/export/production-data-package-loader.js'));

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
const sheet = (rows) => `<?xml version="1.0"?><worksheet><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${columnName(c)}${r + 1}" t="str"><v>${value}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
const ikasBytes = new Uint8Array(zipSync({
  'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Ikas Excel File"/></sheets></workbook>'),
  'xl/worksheets/sheet1.xml': strToU8(sheet([
    ['Product ID', 'Variant ID', 'Product title', 'Price', 'Sale price'],
    ['p1', 'v1', 'Ficus', '129.90', ''],
  ])),
}));

const csvHeaders = [
  'Keyword', 'Currency', 'Segmentation', 'Avg. monthly searches', 'Three month change', 'YoY change',
  'Competition', 'Competition (indexed value)', 'Top of page bid (low range)', 'Top of page bid (high range)',
  'Ad impression share', 'Organic average position', 'Organic impression share', 'In Account',
  'Searches: Aug 2025', 'Searches: Sep 2025', 'Searches: Oct 2025', 'Searches: Nov 2025',
  'Searches: Dec 2025', 'Searches: Jan 2026', 'Searches: Feb 2026', 'Searches: Mar 2026',
  'Searches: Apr 2026', 'Searches: May 2026', 'Searches: Jun 2026', 'Searches: Jul 2026',
];
const csvRow = (values) => Array.from({ length: csvHeaders.length }, (_, index) => values[index] ?? '').join('\t');
const csvText = [
  'Keyword Stats 2026-09-08 at 16_21_37',
  '1 August 2025 - 31 July 2026',
  csvHeaders.join('\t'),
  csvRow({ 2: 'All', 3: '220' }),
  csvRow({ 0: 'sample plant', 1: 'TRY', 3: '100', 4: '-17%', 5: '26%', 6: 'Orta', 7: '62', 8: '5,16', 9: '23,53', 14: '10' }),
].join('\r\n');
const keywordCsvBytes = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csvText, 'utf16le')]));

const jsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value));

async function main() {
  const dataRoot = path.join(workRoot, 'data');
  const directories = {
    app_data_root: workRoot,
    config: path.join(workRoot, 'config'),
    data: dataRoot,
    runs: path.join(dataRoot, 'runs'),
    database: path.join(dataRoot, 'database'),
    browser_profiles: path.join(dataRoot, 'browser-profiles'),
    logs: path.join(dataRoot, 'logs'),
    public_downloads: path.join(workRoot, 'downloads'),
  };
  const storage = new StorageManager(directories);
  const run = {
    run_id: 'rr_20260919T120000000Z_abcdef',
    workspace_id: 'ws_export',
    run_status: 'COMPLETED',
    selected_sources: [
      'google-trends', 'google-search-console-query-page', 'google-search-console-query', 'google-ads-search-terms', 'google-keyword-planner',
      'google-keyword-planner-csv', 'ikas-products', 'bitkimark-sitemap', 'serpapi',
    ],
  };

  const fixtures = [
    {
      source_id: 'google-trends', job_key: 'GT-01', filename: 'timeline.csv', media_type: 'text/csv',
      bytes: fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/google-trends/interest-over-time/gt01-valid-1w-5-queries-day.csv')),
      source_context: { query_group: { query_group_id: 'GT-01' } }, validation_status: 'VALID',
    },
    {
      source_id: 'google-search-console-query-page', job_key: 'gsc-current', filename: 'gsc.json', media_type: 'application/json',
      bytes: jsonBytes([{ rows: [{ keys: ['ficus', 'https://bitkimark.com/ficus'], clicks: 2, impressions: 10, ctr: 0.2, position: 3.5 }] }]),
      source_context: { requested_date_start: '2026-06-01', requested_date_end: '2026-09-18' }, validation_status: 'VALID',
    },
    {
      source_id: 'google-search-console-query', job_key: 'gsc-query-current-28', filename: 'gsc-query.json', media_type: 'application/json',
      bytes: jsonBytes([{ rows: [{ keys: ['monstera'], clicks: 3, impressions: 12, ctr: 0.25, position: 4.5 }] }]),
      source_context: {
        task_id: 'gsc-query-current-previous-28-days', period: 'CURRENT_28_DAYS',
        requested_date_start: '2026-08-22', requested_date_end: '2026-09-18',
      },
      validation_status: 'VALID',
    },
    {
      source_id: 'google-ads-search-terms', job_key: 'ads-current', filename: 'ads.json', media_type: 'application/json',
      bytes: jsonBytes([{ search_term: 'ficus', keyword: 'ficus', match_type: 'EXACT', campaign: 'Search', ad_group: 'Plants', impressions: 10, clicks: 1, ctr: 0.1, average_cpc_micros: 1500000, cost_micros: 1500000, conversions: null, conversion_value: null }]),
      source_context: { requested_date_start: '2026-06-01', requested_date_end: '2026-09-18' }, validation_status: 'VALID',
    },
    {
      source_id: 'google-keyword-planner', job_key: 'plants', filename: 'planner.json', media_type: 'application/json',
      bytes: jsonBytes({ results: [{ text: 'ficus', closeVariants: [], keywordMetrics: { avgMonthlySearches: '100', competition: 'MEDIUM', competitionIndex: '50', lowTopOfPageBidMicros: null, highTopOfPageBidMicros: '2000000', monthlySearchVolumes: [{ year: '2026', month: 'AUGUST', monthlySearches: null }] } }] }),
      source_context: {
        task_id: 'keyword-planner-historical-metrics', source_id: 'google-keyword-planner', source_mode: 'OFFICIAL_API',
        group_id: 'plants', group_name: 'Plants', keywords: ['ficus'],
        requested_date_start: '2025-09-01', requested_date_end: '2026-08-31',
        country_code: 'TR', language_code: 'tr', keyword_plan_network: 'GOOGLE_SEARCH',
      }, validation_status: 'VALID',
    },
    {
      source_id: 'google-keyword-planner-csv', job_key: 'manual-current', filename: 'planner.csv', media_type: 'text/csv',
      bytes: keywordCsvBytes, source_context: {}, validation_status: 'VALID',
    },
    {
      source_id: 'ikas-products', job_key: 'ikas-current', filename: 'products.xlsx', media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: ikasBytes, source_context: {}, validation_status: 'VALID',
    },
    {
      source_id: 'bitkimark-sitemap', job_key: 'sitemap-root', filename: 'sitemap.xml', media_type: 'application/xml',
      bytes: new TextEncoder().encode('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://bitkimark.com/ficus</loc><lastmod>2026-09-18</lastmod></url></urlset>'),
      source_context: { requested_url: 'https://bitkimark.com/products.xml', expected_host: 'bitkimark.com', parent_sitemap_url: 'https://bitkimark.com/sitemap.xml' }, validation_status: 'VALID',
    },
    {
      source_id: 'serpapi', job_key: 'q-1', filename: 'serp.json', media_type: 'application/json',
      bytes: jsonBytes({ search_metadata: { status: 'Success' }, search_parameters: { q: 'ficus', gl: 'tr', hl: 'tr', device: 'desktop', engine: 'google', start: 0 }, organic_results: [{ position: 1, title: 'Ficus', link: 'https://example.com/ficus' }], related_questions: [] }),
      source_context: { task_id: 'serpapi-serp-snapshot', source_id: 'serpapi', source_mode: 'THIRD_PARTY_API', dataset_type: 'GOOGLE_SERP', job_key: 'q-1', query: 'ficus', country_code: 'TR', language_code: 'tr', device: 'desktop', engine: 'google', organic_limit: 10, snapshot_date: '2026-09-19' }, validation_status: 'VALID',
    },
  ];

  const jobs = [];
  const artifacts = new Map();
  for (const [index, fixture] of fixtures.entries()) {
    const persisted = await storage.persistRawArtifact({
      run_id: run.run_id,
      source_id: fixture.source_id,
      attempt_number: 1,
      preferred_filename: fixture.filename,
      media_type: fixture.media_type,
      bytes: fixture.bytes,
    });
    const job_id = `job_${index + 1}`;
    const artifact_id = `artifact_${index + 1}`;
    jobs.push({
      job_id, run_id: run.run_id, source_id: fixture.source_id, job_key: fixture.job_key, query_group_id: null,
      source_context: fixture.source_context, job_order: index + 1, execution_status: 'COMPLETED', validation_status: fixture.validation_status,
      attempt_count: 1, accepted_artifact_id: artifact_id, created_at: '2026-09-19T12:00:00.000Z', started_at: '2026-09-19T12:00:00.000Z', completed_at: '2026-09-19T12:00:01.000Z',
    });
    artifacts.set(artifact_id, {
      artifact_id, run_id: run.run_id, job_id, attempt_number: 1, source_id: fixture.source_id,
      artifact_kind: 'RAW_SOURCE_FILE', artifact_state: 'ACCEPTED', filename: persisted.filename,
      relative_path: persisted.relative_path, media_type: persisted.media_type, byte_size: persisted.byte_size,
      sha256: persisted.sha256, created_at: '2026-09-19T12:00:01.000Z',
    });
  }

  const repository = {
    getRun: (runId) => runId === run.run_id ? run : null,
    listJobs: (runId) => runId === run.run_id ? jobs : [],
    getArtifact: (artifactId) => artifacts.get(artifactId) ?? null,
  };
  const loader = new ProductionDataPackageLoader(repository, storage);
  const datasets = await loader.loadRunDatasets(run.run_id);
  assert.deepEqual(datasets.map((dataset) => dataset.source_id), run.selected_sources);
  assert.deepEqual(datasets.map((dataset) => dataset.dataset_type), [
    'INTEREST_OVER_TIME', 'QUERY_PAGE', 'QUERY', 'SEARCH_TERMS', 'KEYWORD_HISTORICAL_METRICS',
    'KEYWORD_HISTORICAL_METRICS', 'PRODUCTS', 'SITEMAP_URLS', 'GOOGLE_SERP',
  ]);
  assert.equal(datasets.every((dataset) => dataset.rows.length > 0), true);

  const gscQuery = datasets.find((dataset) => dataset.source_id === 'google-search-console-query');
  assert.equal(gscQuery.dataset_type, 'QUERY');
  assert.equal(gscQuery.rows[0].query, 'monstera');
  assert.equal(gscQuery.rows[0].page, undefined);
  assert.equal(gscQuery.rows[0].clicks, 3);
  assert.equal(datasets.find((dataset) => dataset.source_id === 'google-keyword-planner').rows[0].monthly_history[0].searches, null);
  assert.equal(datasets.find((dataset) => dataset.source_id === 'ikas-products').rows[0].sale_price, null);
  assert.equal(datasets.find((dataset) => dataset.source_id === 'bitkimark-sitemap').rows[0].parent_sitemap_url, 'https://bitkimark.com/sitemap.xml');
  assert.equal(datasets.find((dataset) => dataset.source_id === 'serpapi').rows[0].result_type, 'ORGANIC');
  assert.equal(datasets.every((dataset) => dataset.provenance.raw_artifact_id && dataset.provenance.raw_artifact_sha256), true);
  assert.equal(JSON.stringify(datasets).includes(workRoot), false, 'Export provenance must not leak unrestricted local paths.');

  const serpArtifact = artifacts.get('artifact_9');
  const serpPath = storage.resolveRunRelativePath(run.run_id, serpArtifact.relative_path);
  const tampered = fs.readFileSync(serpPath);
  tampered[0] ^= 1;
  fs.writeFileSync(serpPath, tampered);
  await assert.rejects(() => loader.loadRunDatasets(run.run_id), /checksum|integrity/i);

  console.log('PASS PRODUCTION-DATA-PACKAGE-001: all nine accepted source artifacts load through verified native normalization with provenance and integrity checks');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
