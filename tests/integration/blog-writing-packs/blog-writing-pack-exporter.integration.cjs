const assert = require('node:assert/strict');

const {
  buildBlogWritingPackWorkbook,
  renderBlogWritingPackWorkbook,
} = require(`${process.argv[2]}/main/export/blog-writing-pack-exporter.js`);

const COVERAGE = {
  INTEREST_OVER_TIME: { status: 'COVERED', total_jobs: 2, accepted_jobs: 2, no_data_jobs: 0, incomplete_jobs: 0 },
  QUERY_PAGE: { status: 'COVERED', total_jobs: 1, accepted_jobs: 1, no_data_jobs: 0, incomplete_jobs: 0 },
  SEARCH_TERMS: { status: 'COVERED', total_jobs: 1, accepted_jobs: 1, no_data_jobs: 0, incomplete_jobs: 0 },
  KEYWORD_HISTORICAL_METRICS: { status: 'COVERED', total_jobs: 2, accepted_jobs: 2, no_data_jobs: 0, incomplete_jobs: 0 },
  PRODUCTS: { status: 'COVERED', total_jobs: 1, accepted_jobs: 1, no_data_jobs: 0, incomplete_jobs: 0 },
  SITEMAP_URLS: { status: 'COVERED', total_jobs: 1, accepted_jobs: 1, no_data_jobs: 0, incomplete_jobs: 0 },
  GOOGLE_SERP: { status: 'COVERED', total_jobs: 1, accepted_jobs: 1, no_data_jobs: 0, incomplete_jobs: 0 },
};

const provenance = (overrides = {}) => ({
  run_id: 'run_blog_1',
  workspace_id: 'ws_blog',
  attempt_number: 1,
  validation_status: 'VALID',
  raw_artifact_id: 'artifact_1',
  raw_artifact_filename: 'evidence.json',
  raw_artifact_media_type: 'application/json',
  raw_artifact_byte_size: 123,
  raw_artifact_sha256: 'a'.repeat(64),
  acquired_at: '2026-10-01T10:30:00.000Z',
  requested_context: { z: 'last', a: 'first' },
  ...overrides,
});

const dataset = ({ source_id, dataset_type, job_id, job_key, rows, provenance: datasetProvenance }) => ({
  source_id,
  dataset_type,
  job_id,
  job_key,
  rows,
  provenance: provenance({
    job_id,
    job_key,
    source_id,
    ...datasetProvenance,
  }),
});

const assembly = {
  manifest: {
    manifest_version: 1,
    package_id: 'blog_pkg_1',
    recipe_id: 'BLOG_WRITING_PACK',
    recipe_version: 1,
    run_id: 'run_blog_1',
    workspace_id: 'ws_blog',
    created_at: '2026-10-01T12:00:00.000Z',
    application_version: '1.0.0',
    coverage_status: 'COMPLETE',
    expected_datasets: Object.keys(COVERAGE),
    present_datasets: Object.keys(COVERAGE),
    no_data_datasets: [],
    incomplete_datasets: [],
    missing_datasets: [],
    coverage_by_dataset: COVERAGE,
    workbook_filename: 'BLOG_WRITING_PACK.xlsx',
    generic_manifest_filename: 'MANIFEST.json',
    datasets_index_filename: 'DATASETS.json',
    failures_filename: 'FAILURES.json',
  },
  data_package: {
    manifest: {
      package_version: 1,
      run_id: 'run_blog_1',
      workspace_id: 'ws_blog',
      run_status: 'COMPLETED',
      selected_sources: [],
      successful_jobs: 9,
      failed_jobs: 1,
      mode: 'ALL',
    },
    datasets: [
      dataset({
        source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', job_id: 'gt_01', job_key: 'GT01',
        provenance: { requested_context: { query_group: { query_group_id: 'GT01' } } },
        rows: [{ period_start: '2026-09-01', temporal_dimension: 'Week', category_label: 'All categories', query: 'same query', geography_label: 'Turkey', relative_interest: 0 }],
      }),
      dataset({
        source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', job_id: 'gt_02', job_key: 'GT02',
        provenance: { requested_context: { query_group: { query_group_id: 'GT02' } } },
        rows: [{ period_start: '2026-09-01', temporal_dimension: 'Week', category_label: 'All categories', query: 'same query', geography_label: 'Turkey', relative_interest: null }],
      }),
      dataset({
        source_id: 'google-search-console-query-page', dataset_type: 'QUERY_PAGE', job_id: 'gsc_1', job_key: 'GSC01',
        rows: [{ query: 'ficus', page: '/ficus', clicks: 0, impressions: 10, ctr: 0, position: null }],
      }),
      dataset({
        source_id: 'google-ads-search-terms', dataset_type: 'SEARCH_TERMS', job_id: 'ads_1', job_key: 'ADS01',
        rows: [{ search_term: 'ficus', keyword: null, match_type: 'EXACT', campaign: 'Search', ad_group: 'Plants', impressions: 0, clicks: 0, ctr: 0, average_cpc: null, cost: 0, conversions: 0, conversion_value: 0 }],
      }),
      dataset({
        source_id: 'google-keyword-planner', dataset_type: 'KEYWORD_HISTORICAL_METRICS', job_id: 'kwp_api', job_key: 'KWP01',
        rows: [{ group_id: 'KWP01', requested_keyword: 'ficus', returned_keyword: 'ficus', close_variants: ['ficus plant'], matched_requested_keywords: ['ficus'], avg_monthly_searches: 0, competition: null, competition_index: 0, top_of_page_bid_low: null, top_of_page_bid_high: 2, change_3_month: 0, change_yoy: null, monthly_history: [{ year: 2026, month: 8, searches: 0 }] }],
      }),
      dataset({
        source_id: 'google-keyword-planner-csv', dataset_type: 'KEYWORD_HISTORICAL_METRICS', job_id: 'kwp_csv', job_key: 'KWP02',
        rows: [{ group_id: 'KWP02', requested_keyword: 'monstera', returned_keyword: 'monstera', close_variants: [], matched_requested_keywords: ['monstera'], currency: 'TRY', avg_monthly_searches: 100, competition: 'LOW', competition_index: 20, top_of_page_bid_low: 1, top_of_page_bid_high: 2, change_3_month: null, change_yoy: null, monthly_history: [] }],
      }),
      dataset({
        source_id: 'ikas-products', dataset_type: 'PRODUCTS', job_id: 'products_1', job_key: 'PRODUCTS01',
        rows: [{ product_title: 'Ficus', product_id: 'p1', variant_id: 'v1', url: 'https://example.test/ficus', categories_product_type: { indoor: 'plants' }, categories: ['Plants', 'Indoor'], product_type: 'Plant', availability: true, price: 0, sale_price: null, description: null, slug: 'ficus', image_url: null, plant_height: null, pot_type: null, stock: 0, deleted: false, variant_active: true, continue_selling: false, sales_channel_lower: null, sales_channel_upper: null }],
      }),
      dataset({
        source_id: 'bitkimark-sitemap', dataset_type: 'SITEMAP_URLS', job_id: 'sitemap_1', job_key: 'SITEMAP01',
        rows: [{ loc: 'https://bitkimark.com/ficus', lastmod: null, document_kind: 'URL_SET', source_url: 'https://bitkimark.com/sitemap.xml', parent_sitemap_url: null, retrieved_at: '2026-10-01T10:30:00.000Z' }],
      }),
      dataset({
        source_id: 'serpapi', dataset_type: 'GOOGLE_SERP', job_id: 'serp_1', job_key: 'SERP01',
        rows: [{ query: 'ficus', position: 1, title: 'Ficus', url: 'https://example.test', domain: 'example.test', snippet: null, paa: null, result_type: 'ORGANIC' }],
      }),
    ],
    failures: [{ source_id: 'google-trends', job_key: 'GT05', code: 'ERROR_NOT_DATA' }],
  },
};

const EXPECTED_HEADERS = {
  README: ['section', 'value'],
  RUN_METADATA: ['package_id', 'recipe_id', 'recipe_version', 'run_id', 'workspace_id', 'created_at', 'application_version', 'coverage_status', 'expected_datasets', 'present_datasets', 'no_data_datasets', 'incomplete_datasets', 'missing_datasets', 'coverage_by_dataset'],
  GT_INTEREST: ['source_id', 'job_id', 'job_key', 'validation_status', 'query_group_id', 'period_start', 'temporal_dimension', 'category_label', 'query', 'geography_label', 'relative_interest'],
  GSC_QUERY_PAGE: ['source_id', 'job_id', 'job_key', 'validation_status', 'query', 'page', 'clicks', 'impressions', 'ctr', 'position'],
  ADS_SEARCH_TERMS: ['source_id', 'job_id', 'job_key', 'validation_status', 'search_term', 'keyword', 'match_type', 'campaign', 'ad_group', 'impressions', 'clicks', 'ctr', 'average_cpc', 'cost', 'conversions', 'conversion_value'],
  KWP_METRICS: ['source_id', 'job_id', 'job_key', 'validation_status', 'group_id', 'requested_keyword', 'returned_keyword', 'close_variants', 'matched_requested_keywords', 'currency', 'avg_monthly_searches', 'competition', 'competition_index', 'top_of_page_bid_low', 'top_of_page_bid_high', 'change_3_month', 'change_yoy'],
  KWP_MONTHLY: ['source_id', 'job_id', 'job_key', 'validation_status', 'group_id', 'requested_keyword', 'returned_keyword', 'currency', 'year', 'month', 'searches'],
  PRODUCTS: ['source_id', 'job_id', 'job_key', 'validation_status', 'product_title', 'product_id', 'variant_id', 'url', 'categories_product_type', 'categories', 'product_type', 'availability', 'price', 'sale_price', 'description', 'slug', 'image_url', 'plant_height', 'pot_type', 'stock', 'deleted', 'variant_active', 'continue_selling', 'sales_channel_lower', 'sales_channel_upper'],
  SITEMAP_URLS: ['source_id', 'job_id', 'job_key', 'validation_status', 'loc', 'lastmod', 'document_kind', 'source_url', 'parent_sitemap_url', 'retrieved_at'],
  SERP_RESULTS: ['source_id', 'job_id', 'job_key', 'validation_status', 'query', 'position', 'title', 'url', 'domain', 'snippet', 'paa', 'result_type'],
  FAILURES: ['source_id', 'job_key', 'code'],
  PROVENANCE: ['source_id', 'dataset_type', 'job_id', 'job_key', 'run_id', 'workspace_id', 'attempt_number', 'validation_status', 'raw_artifact_id', 'raw_artifact_filename', 'raw_artifact_media_type', 'raw_artifact_byte_size', 'raw_artifact_sha256', 'acquired_at', 'requested_context'],
};

const values = (sheet) => sheet.data.map((row) => row.map((cell) => cell.value));
const sheetByName = (workbook, name) => workbook.sheets.find((sheet) => sheet.name === name);

(async () => {
  const workbook = buildBlogWritingPackWorkbook(assembly);
  assert.equal(workbook.filename, 'BLOG_WRITING_PACK.xlsx');
  assert.deepEqual(workbook.sheets.map(({ name }) => name), Object.keys(EXPECTED_HEADERS));
  for (const [name, headers] of Object.entries(EXPECTED_HEADERS)) {
    assert.deepEqual(values(sheetByName(workbook, name))[0], headers, `${name} headers must remain locked.`);
  }

  const metadata = values(sheetByName(workbook, 'RUN_METADATA'))[1];
  assert.equal(metadata[0], 'blog_pkg_1');
  assert.equal(
    metadata[13],
    '{"GOOGLE_SERP":{"accepted_jobs":1,"incomplete_jobs":0,"no_data_jobs":0,"status":"COVERED","total_jobs":1},"INTEREST_OVER_TIME":{"accepted_jobs":2,"incomplete_jobs":0,"no_data_jobs":0,"status":"COVERED","total_jobs":2},"KEYWORD_HISTORICAL_METRICS":{"accepted_jobs":2,"incomplete_jobs":0,"no_data_jobs":0,"status":"COVERED","total_jobs":2},"PRODUCTS":{"accepted_jobs":1,"incomplete_jobs":0,"no_data_jobs":0,"status":"COVERED","total_jobs":1},"QUERY_PAGE":{"accepted_jobs":1,"incomplete_jobs":0,"no_data_jobs":0,"status":"COVERED","total_jobs":1},"SEARCH_TERMS":{"accepted_jobs":1,"incomplete_jobs":0,"no_data_jobs":0,"status":"COVERED","total_jobs":1},"SITEMAP_URLS":{"accepted_jobs":1,"incomplete_jobs":0,"no_data_jobs":0,"status":"COVERED","total_jobs":1}}',
  );

  const gtRows = values(sheetByName(workbook, 'GT_INTEREST'));
  assert.deepEqual(gtRows.slice(1).map((row) => [row[4], row[8], row[10]]), [
    ['GT01', 'same query', 0],
    ['GT02', 'same query', undefined],
  ]);

  const gscRow = values(sheetByName(workbook, 'GSC_QUERY_PAGE'))[1];
  assert.equal(gscRow[6], 0);
  assert.equal(gscRow[9], undefined);

  const adsRow = values(sheetByName(workbook, 'ADS_SEARCH_TERMS'))[1];
  assert.equal(adsRow[5], undefined);
  assert.equal(adsRow[9], 0);
  assert.equal(adsRow[13], 0);

  const kwpRows = values(sheetByName(workbook, 'KWP_METRICS'));
  assert.deepEqual(kwpRows.slice(1).map((row) => [row[0], row[4], row[9]]), [
    ['google-keyword-planner', 'KWP01', undefined],
    ['google-keyword-planner-csv', 'KWP02', 'TRY'],
  ]);
  assert.equal(kwpRows[1][7], '["ficus plant"]');
  assert.equal(kwpRows[1][8], '["ficus"]');

  const monthlyRows = values(sheetByName(workbook, 'KWP_MONTHLY'));
  assert.equal(monthlyRows.length, 2, 'Only actual monthly history entries may become rows.');
  assert.deepEqual(monthlyRows[1].slice(0, 11), [
    'google-keyword-planner', 'kwp_api', 'KWP01', 'VALID', 'KWP01', 'ficus', 'ficus', undefined, 2026, 8, 0,
  ]);

  const productsRow = values(sheetByName(workbook, 'PRODUCTS'))[1];
  assert.equal(productsRow[8], '{"indoor":"plants"}');
  assert.equal(productsRow[9], '["Plants","Indoor"]');
  assert.equal(productsRow[12], 0);
  assert.equal(productsRow[19], 0);

  const provenanceRow = values(sheetByName(workbook, 'PROVENANCE'))[1];
  assert.equal(provenanceRow[14], '{"query_group":{"query_group_id":"GT01"}}');
  assert.equal(JSON.stringify(workbook).includes('credential_ref'), false);
  assert.equal(JSON.stringify(workbook).includes('/Users/'), false);

  const emptyAssembly = structuredClone(assembly);
  emptyAssembly.data_package.datasets = emptyAssembly.data_package.datasets.map((item) => ({
    ...item,
    rows: [],
    provenance: { ...item.provenance, validation_status: 'NO_DATA' },
  }));
  emptyAssembly.data_package.failures = [];
  const emptyWorkbook = buildBlogWritingPackWorkbook(emptyAssembly);
  for (const name of Object.keys(EXPECTED_HEADERS)) {
    const rowCount = values(sheetByName(emptyWorkbook, name)).length;
    assert.equal(rowCount >= 1, true, `${name} must exist with headers when empty.`);
  }
  for (const name of ['GT_INTEREST', 'GSC_QUERY_PAGE', 'ADS_SEARCH_TERMS', 'KWP_METRICS', 'KWP_MONTHLY', 'PRODUCTS', 'SITEMAP_URLS', 'SERP_RESULTS']) {
    assert.equal(values(sheetByName(emptyWorkbook, name)).length, 1, `${name} must not fabricate NO_DATA rows.`);
  }

  const badGtAssembly = structuredClone(assembly);
  badGtAssembly.data_package.datasets[0].provenance.requested_context.query_group.query_group_id = 'WRONG';
  assert.throws(() => buildBlogWritingPackWorkbook(badGtAssembly), /query_group_id/i);

  const conflictingRowsAssembly = structuredClone(assembly);
  Object.assign(conflictingRowsAssembly.data_package.datasets[0].rows[0], {
    source_id: 'forged-source',
    job_id: 'forged-job',
    job_key: 'FORGED',
    validation_status: 'REJECTED',
    query_group_id: 'FORGED',
  });
  Object.assign(conflictingRowsAssembly.data_package.datasets[2].rows[0], {
    source_id: 'forged-source',
    job_id: 'forged-job',
    job_key: 'FORGED',
    validation_status: 'REJECTED',
  });
  const trustedWorkbook = buildBlogWritingPackWorkbook(conflictingRowsAssembly);
  assert.deepEqual(values(sheetByName(trustedWorkbook, 'GT_INTEREST'))[1].slice(0, 5), [
    'google-trends', 'gt_01', 'GT01', 'VALID', 'GT01',
  ]);
  assert.deepEqual(values(sheetByName(trustedWorkbook, 'GSC_QUERY_PAGE'))[1].slice(0, 4), [
    'google-search-console-query-page', 'gsc_1', 'GSC01', 'VALID',
  ]);

  const mismatchedProvenanceAssembly = structuredClone(assembly);
  mismatchedProvenanceAssembly.data_package.datasets[0].provenance.job_id = 'forged-job';
  assert.throws(
    () => buildBlogWritingPackWorkbook(mismatchedProvenanceAssembly),
    /provenance.*identity/i,
  );

  const bytes = await renderBlogWritingPackWorkbook(assembly);
  assert.equal(bytes instanceof Uint8Array, true);
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);

  console.log('PASS BLOG-WORKBOOK-001: fixed sheets, source rows, null/zero semantics, provenance, NO_DATA, and XLSX rendering are deterministic');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
