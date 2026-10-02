const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { strFromU8, unzipSync } = require('fflate');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const {
  buildAdsOptimizationWorkbook,
  writeAdsOptimizationPackage,
} = require(path.join(buildRoot, 'main/export/ads-optimization-pack-exporter.js'));
const { TaskPackageStore } = require(path.join(
  buildRoot,
  'main/task-packages/task-package-store.js',
));

const DATASETS = [
  'CAMPAIGN_PERFORMANCE', 'AD_GROUP_PERFORMANCE', 'KEYWORD_PERFORMANCE',
  'SEARCH_TERMS', 'AD_PERFORMANCE', 'RSA_ASSET_PERFORMANCE',
];
const MODES = {
  CAMPAIGN_PERFORMANCE: 'campaign', AD_GROUP_PERFORMANCE: 'ad_group',
  KEYWORD_PERFORMANCE: 'keyword_view', SEARCH_TERMS: 'search_term_view',
  AD_PERFORMANCE: 'ad_group_ad', RSA_ASSET_PERFORMANCE: 'ad_group_ad_asset_view',
};
const CURRENT_WINDOW = { start: '2026-09-23', end: '2026-09-29' };
const PREVIOUS_WINDOW = { start: '2026-09-08', end: '2026-09-14' };
const clone = (value) => JSON.parse(JSON.stringify(value));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const decodeXmlText = (value) => value
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
  .replaceAll('&apos;', "'").replaceAll('&amp;', '&');

const parseWorkbook = (filename) => {
  const files = unzipSync(new Uint8Array(fs.readFileSync(filename)));
  const readXml = (name) => strFromU8(files[name]);
  const workbookXml = readXml('xl/workbook.xml');
  const sharedStringsXml = readXml('xl/sharedStrings.xml');
  const sharedStrings = [...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/gu)].map((match) => decodeXmlText(
    [...match[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/gu)].map((entry) => entry[1]).join(''),
  ));
  const sheetNames = [...workbookXml.matchAll(/<sheet [^>]*name="([^"]+)"/gu)].map((match) => match[1]);
  const sheets = sheetNames.map((name, index) => {
    const xml = readXml(`xl/worksheets/sheet${index + 1}.xml`);
    const cells = new Map();
    for (const match of xml.matchAll(/<c ([^>]*)(?:\/>|>(?:<v>([\s\S]*?)<\/v>)?<\/c>)/gu)) {
      const reference = /(?:^| )r="([^"]+)"/u.exec(match[1])?.[1];
      if (!reference) continue;
      const type = /(?:^| )t="([^"]+)"/u.exec(match[1])?.[1] ?? 'n';
      const serialized = match[2];
      cells.set(reference, {
        type,
        value: serialized === undefined ? null : type === 's' ? sharedStrings[Number(serialized)] : Number(serialized),
      });
    }
    return { name, cells, xml };
  });
  return { sheetNames, sheets };
};

const rowFor = (dataset, role) => {
  const common = {
    campaign_id: `${role}-campaign`,
    campaign_name: '=SUM(1,2)',
    campaign_advertising_channel_type: 'SEARCH',
    performance_date: role === 'CURRENT' ? CURRENT_WINDOW.start : PREVIOUS_WINDOW.start,
    snapshot_observed_at: role === 'CURRENT' ? '2026-08-01T08:00:00.000Z' : '2026-09-15T08:00:00.000Z',
    impressions: 10,
    clicks: 0,
    ctr: 0,
    average_cpc_micros: null,
    cost_micros: 0,
    conversions: null,
    conversions_value: 0,
    all_conversions: 0,
    all_conversions_value: null,
    recommendation_score: 99,
    action: 'PAUSE',
  };
  if (dataset === 'CAMPAIGN_PERFORMANCE') return {
    ...common, currency_code: 'TRY', time_zone: 'Europe/Istanbul', campaign_status: 'ENABLED',
    campaign_primary_status: 'ELIGIBLE', campaign_bidding_strategy_type: 'MANUAL_CPC',
    campaign_budget_id: 'budget-1', campaign_budget_amount_micros: 1000000,
    campaign_budget_period: 'DAILY', campaign_budget_explicitly_shared: false,
    conversions_from_interactions_rate: 0.25,
    cost_per_conversion: 125.5,
    conversions_value_per_cost: 3.2,
    search_impression_share: null, search_budget_lost_impression_share: 0,
    search_rank_lost_impression_share: null, search_click_share: 0,
    search_top_impression_share: 0.6,
    search_absolute_top_impression_share: 0.35,
    top_impression_percentage: 0, absolute_top_impression_percentage: null,
  };
  if (dataset === 'AD_GROUP_PERFORMANCE') return {
    ...common, ad_group_id: 'ag-1', ad_group_name: 'Group', ad_group_status: 'ENABLED',
    ad_group_primary_status: 'ELIGIBLE', ad_group_type: 'SEARCH_STANDARD', cpc_bid_micros: null,
    effective_cpc_bid_micros: 0, effective_target_cpa_micros: null, effective_target_roas: 0,
    search_impression_share: null, search_budget_lost_impression_share: 0,
    search_rank_lost_impression_share: null, search_click_share: 0,
    top_impression_percentage: 0, absolute_top_impression_percentage: null,
  };
  if (dataset === 'KEYWORD_PERFORMANCE') return {
    ...common, ad_group_id: 'ag-1', ad_group_name: 'Group', criterion_id: 'criterion-1',
    keyword_text: '+ficus', keyword_match_type: 'BROAD', criterion_status: 'ENABLED',
    criterion_primary_status: 'ELIGIBLE', system_serving_status: 'ELIGIBLE', negative: false,
    cpc_bid_micros: null, effective_cpc_bid_micros: 0, quality_score: null,
    creative_quality_score: null, post_click_quality_score: null, search_predicted_ctr: null,
    search_exact_match_impression_share: 0, search_impression_share: null,
    search_budget_lost_impression_share: 0, search_rank_lost_impression_share: null,
    search_click_share: 0, top_impression_percentage: 0, absolute_top_impression_percentage: null,
  };
  if (dataset === 'SEARCH_TERMS') return {
    ...common, search_term: '+ficus', ad_group_id: 'ag-1', ad_group_name: 'Group',
    keyword_resource_name: null, keyword_text: null, keyword_match_type: null,
    search_term_match_type: 'BROAD', search_term_targeting_status: 'ADDED',
    top_impression_percentage: 0, absolute_top_impression_percentage: null,
  };
  if (dataset === 'AD_PERFORMANCE') return {
    ...common, ad_group_id: 'ag-1', ad_group_name: 'Group', ad_id: 'ad-1', ad_type: 'RESPONSIVE_SEARCH_AD',
    ad_group_ad_status: 'ENABLED', ad_group_ad_primary_status: 'ELIGIBLE', ad_strength: 'GOOD',
    policy_approval_status: 'APPROVED', policy_review_status: 'REVIEWED',
    final_urls: ['https://example.com/?a=1'],
    headlines: [{ text: '=literal', pinned_field: null, asset_performance_label: 'GOOD' }],
    descriptions: [{ text: 'Description', pinned_field: null, asset_performance_label: null }],
    path1: null, path2: 'plants', top_impression_percentage: 0, absolute_top_impression_percentage: null,
  };
  return {
    ...common, ad_group_id: 'ag-1', ad_group_name: 'Group', ad_id: 'ad-1', ad_type: 'RESPONSIVE_SEARCH_AD',
    asset_view_resource_name: 'customers/1/views/1', field_type: 'HEADLINE', performance_label: 'GOOD',
    pinned_field: null, enabled: true, source: 'ADVERTISER', asset_resource_name: 'customers/1/assets/1',
    asset_id: 'asset-1', asset_name: null, asset_text: '=literal',
  };
};

const packageFor = ({ comparison = false, packageId = 'pkg_export' } = {}) => {
  const roles = comparison ? ['CURRENT', 'PREVIOUS'] : ['CURRENT'];
  const evidence = roles.flatMap((role) => DATASETS.map((dataset, index) => ({
    requirement_id: dataset,
    role,
    disposition: 'REUSED_EXACT',
    window: clone(role === 'CURRENT' ? CURRENT_WINDOW : PREVIOUS_WINDOW),
    origin: {
      run_id: `run_${role}_${index}`, job_id: `job_${role}_${index}`, attempt_number: 1,
      artifact_id: `artifact_${role}_${index}`, artifact_sha256: String(index + 1).repeat(64),
      acquired_at: role === 'CURRENT' ? '2026-08-01T08:00:00.000Z' : '2026-09-15T08:00:00.000Z',
      validation_status: 'VALID', source_id: 'google-ads-search-reporting', dataset_type: dataset,
      resource_mode: MODES[dataset], acquisition_mode: 'OFFICIAL_API', campaign_scope: 'SEARCH',
      dataset_schema_version: 1, account_identity: { field: 'customer_id', value: '1234567890' },
      snapshot_observed_at: role === 'CURRENT' ? '2026-08-01T08:00:00.000Z' : '2026-09-15T08:00:00.000Z',
    },
    transformation: { kind: 'NONE' }, row_count: 1,
    ...(role === 'PREVIOUS' ? { source_package_id: 'pkg_previous' } : {}),
  })));
  return {
    manifest: {
      manifest_version: 1, package_id: packageId, recipe_id: 'ADS_OPTIMIZATION_PACK', recipe_version: 1,
      recipe_label: 'Kampanya Gelişim', package_kind: comparison ? 'COMPARISON' : 'INITIAL_BASELINE',
      workspace_id: 'ws_a', account_identity: { field: 'customer_id', value: '1234567890' },
      customer_id: '1234567890', created_at: '2026-09-30T10:00:00+03:00', application_version: '1.0.0',
      campaign_scope: 'SEARCH', current_window: clone(CURRENT_WINDOW),
      ...(comparison ? { previous_package_id: 'pkg_previous', previous_window: clone(PREVIOUS_WINDOW), gap_days: 8 } : {}),
      dataset_schema_version: 1, required_datasets: [...DATASETS], evidence,
      excluded_coverage: { PERFORMANCE_MAX: 'NOT_IN_RECIPE' },
      workbook_filename: comparison ? 'kampanya-gelisim-2026-09-30-2026-09-15.xlsx' : 'kampanya-gelisim-2026-09-30-baseline.xlsx',
    },
    datasets: roles.flatMap((role) => DATASETS.map((dataset, index) => ({
      requirement_id: dataset, dataset_type: dataset, role,
      rows: [rowFor(dataset, role)], evidence: clone(evidence[(role === 'CURRENT' ? 0 : 6) + index]),
    }))),
  };
};

const expectedInitialSheets = [
  '00_MANIFEST', '01_CURRENT_CAMPAIGNS', '03_CURRENT_AD_GROUPS', '05_CURRENT_KEYWORDS',
  '07_CURRENT_SEARCH_TERMS', '09_CURRENT_ADS', '11_CURRENT_RSA_ASSETS',
];
const expectedComparisonSheets = [
  '00_MANIFEST', '01_CURRENT_CAMPAIGNS', '02_PREVIOUS_CAMPAIGNS',
  '03_CURRENT_AD_GROUPS', '04_PREVIOUS_AD_GROUPS', '05_CURRENT_KEYWORDS',
  '06_PREVIOUS_KEYWORDS', '07_CURRENT_SEARCH_TERMS', '08_PREVIOUS_SEARCH_TERMS',
  '09_CURRENT_ADS', '10_PREVIOUS_ADS', '11_CURRENT_RSA_ASSETS', '12_PREVIOUS_RSA_ASSETS',
];

async function main() {
  const initial = packageFor();
  const comparison = packageFor({ comparison: true, packageId: 'pkg_comparison' });
  assert.deepEqual(buildAdsOptimizationWorkbook(initial).sheets.map(({ name }) => name), expectedInitialSheets);
  assert.deepEqual(buildAdsOptimizationWorkbook(comparison).sheets.map(({ name }) => name), expectedComparisonSheets);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roofroom-ads-pack-export-'));
  const rootA = path.join(tempRoot, 'a');
  const rootB = path.join(tempRoot, 'b');
  const publishedA = await writeAdsOptimizationPackage(new TaskPackageStore(rootA), comparison);
  const publishedB = await writeAdsOptimizationPackage(new TaskPackageStore(rootB), comparison);
  const workbookA = parseWorkbook(path.join(publishedA.package_directory, comparison.manifest.workbook_filename));
  const workbookB = parseWorkbook(path.join(publishedB.package_directory, comparison.manifest.workbook_filename));
  assert.deepEqual(workbookA.sheetNames, expectedComparisonSheets);
  assert.deepEqual(workbookB.sheetNames, workbookA.sheetNames);

  const campaignSheet = workbookA.sheets.find(({ name }) => name === '01_CURRENT_CAMPAIGNS');
  const headers = [...campaignSheet.cells.entries()]
    .filter(([reference]) => reference.endsWith('1'))
    .map(([, cell]) => cell.value);
  assert.ok(headers.includes('campaign_id'));
  assert.ok(headers.includes('performance_date'));
  assert.ok(headers.includes('snapshot_observed_at'));
  for (const header of [
    'conversions_from_interactions_rate',
    'cost_per_conversion',
    'conversions_value_per_cost',
    'search_top_impression_share',
    'search_absolute_top_impression_share',
  ]) {
    assert.ok(headers.includes(header), `Campaign workbook must preserve ${header}`);
  }
  assert.equal(headers.includes('recommendation_score'), false);
  assert.equal(headers.includes('action'), false);

  for (const sheetName of ['03_CURRENT_AD_GROUPS', '05_CURRENT_KEYWORDS']) {
    const sheet = workbookA.sheets.find(({ name }) => name === sheetName);
    const sheetHeaders = [...sheet.cells.entries()]
      .filter(([reference]) => reference.endsWith('1'))
      .map(([, cell]) => cell.value);

    for (const header of [
      'conversions_from_interactions_rate',
      'cost_per_conversion',
      'conversions_value_per_cost',
      'search_top_impression_share',
      'search_absolute_top_impression_share',
    ]) {
      assert.ok(sheetHeaders.includes(header), `${sheetName} must preserve ${header}`);
    }
  }
  const columnFor = (name) => [...campaignSheet.cells.entries()].find(([reference, cell]) => reference.endsWith('1') && cell.value === name)?.[0].replace(/1$/u, '');
  assert.deepEqual(campaignSheet.cells.get(`${columnFor('campaign_name')}2`), { type: 's', value: '=SUM(1,2)' });
  assert.deepEqual(campaignSheet.cells.get(`${columnFor('clicks')}2`), { type: 'n', value: 0 });
  assert.equal(campaignSheet.cells.get(`${columnFor('average_cpc_micros')}2`)?.value ?? null, null);
  assert.deepEqual(
    campaignSheet.cells.get(`${columnFor('conversions_from_interactions_rate')}2`),
    { type: 'n', value: 0.25 },
  );
  assert.deepEqual(
    campaignSheet.cells.get(`${columnFor('cost_per_conversion')}2`),
    { type: 'n', value: 125.5 },
  );
  assert.deepEqual(
    campaignSheet.cells.get(`${columnFor('conversions_value_per_cost')}2`),
    { type: 'n', value: 3.2 },
  );
  assert.deepEqual(
    campaignSheet.cells.get(`${columnFor('search_top_impression_share')}2`),
    { type: 'n', value: 0.6 },
  );
  assert.deepEqual(
    campaignSheet.cells.get(`${columnFor('search_absolute_top_impression_share')}2`),
    { type: 'n', value: 0.35 },
  );

  const adsSheet = workbookA.sheets.find(({ name }) => name === '09_CURRENT_ADS');
  const adsColumn = (name) => [...adsSheet.cells.entries()].find(([reference, cell]) => reference.endsWith('1') && cell.value === name)?.[0].replace(/1$/u, '');
  assert.deepEqual(adsSheet.cells.get(`${adsColumn('headlines')}2`), {
    type: 's', value: '[{"asset_performance_label":"GOOD","pinned_field":null,"text":"=literal"}]',
  });
  assert.deepEqual(adsSheet.cells.get(`${adsColumn('final_urls')}2`), { type: 's', value: '["https://example.com/?a=1"]' });

  const manifestText = JSON.stringify(publishedA.manifest);
  assert.equal(manifestText.includes(tempRoot), false);
  assert.equal(/oauth_token|access_token|refresh_token|client_secret|developer_token/iu.test(manifestText), false);
  for (const entry of publishedA.manifest.evidence) {
    const tablePath = path.join(publishedA.package_directory, entry.table.filename);
    const bytes = fs.readFileSync(tablePath);
    assert.equal(entry.table.sha256, sha(bytes));
    assert.equal(entry.table.row_count, JSON.parse(bytes).length);
  }
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(publishedA.package_directory, 'MANIFEST.json'), 'utf8')),
    JSON.parse(fs.readFileSync(path.join(publishedB.package_directory, 'MANIFEST.json'), 'utf8')),
  );
  for (const entry of publishedA.manifest.evidence) {
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(publishedA.package_directory, entry.table.filename), 'utf8')),
      JSON.parse(fs.readFileSync(path.join(publishedB.package_directory, entry.table.filename), 'utf8')),
    );
  }
  await assert.rejects(
    () => writeAdsOptimizationPackage(new TaskPackageStore(rootA), comparison),
    /exists|overwrite/i,
  );

  const failureRoot = path.join(tempRoot, 'failure');
  const failureStore = new TaskPackageStore(failureRoot);
  const failurePackage = packageFor({ packageId: 'pkg_write_failure' });
  await assert.rejects(() => failureStore.publishPackage({
    manifest: failurePackage.manifest,
    datasets: failurePackage.datasets.map(({ role, dataset_type, rows }) => ({ role, dataset_type, rows })),
    files: [
      { filename: failurePackage.manifest.workbook_filename, bytes: Buffer.from('first') },
      { filename: failurePackage.manifest.workbook_filename, bytes: Buffer.from('duplicate') },
    ],
  }));
  assert.equal(fs.existsSync(path.join(failureRoot, 'pkg_write_failure')), false);
  assert.deepEqual(fs.existsSync(failureRoot) ? fs.readdirSync(failureRoot) : [], []);

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log('PASS ADS-OPTIMIZATION-PACK-EXPORT-001: explicit evidence sheets, literal cells, deterministic package files, checksums, and atomic publication are enforced');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
