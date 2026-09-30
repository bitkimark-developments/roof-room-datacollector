const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { unzipSync } = require('fflate');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const { StorageManager } = require(path.join(buildRoot, 'main/storage/storage-manager.js'));
const { ProductionDataPackageLoader } = require(path.join(buildRoot, 'main/export/production-data-package-loader.js'));
const { ADS_OPTIMIZATION_PACK_V1_RECIPE } = require(path.join(buildRoot, 'main/task-packages/ads-optimization-pack-recipe.js'));
const { TaskPackageEvidenceResolver } = require(path.join(buildRoot, 'main/task-packages/task-package-evidence-resolver.js'));
const { TaskPackageAssembler } = require(path.join(buildRoot, 'main/task-packages/task-package-assembler.js'));
const { TaskPackageStore } = require(path.join(buildRoot, 'main/task-packages/task-package-store.js'));
const { writeAdsOptimizationPackage } = require(path.join(buildRoot, 'main/export/ads-optimization-pack-exporter.js'));

const DATASETS = [
  'CAMPAIGN_PERFORMANCE', 'AD_GROUP_PERFORMANCE', 'KEYWORD_PERFORMANCE',
  'SEARCH_TERMS', 'AD_PERFORMANCE', 'RSA_ASSET_PERFORMANCE',
];
const MODES = {
  CAMPAIGN_PERFORMANCE: 'campaign', AD_GROUP_PERFORMANCE: 'ad_group',
  KEYWORD_PERFORMANCE: 'keyword_view', SEARCH_TERMS: 'search_term_view',
  AD_PERFORMANCE: 'ad_group_ad', RSA_ASSET_PERFORMANCE: 'ad_group_ad_asset_view',
};
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value));

const providerRow = (dataset, date, marker) => {
  const metrics = { impressions: '10', clicks: '0', costMicros: '0', conversions: null };
  if (dataset === 'CAMPAIGN_PERFORMANCE') return {
    customer: { currencyCode: 'TRY', timeZone: 'Europe/Istanbul' },
    campaign: { id: '101', name: marker, status: marker.includes('previous') ? 'PAUSED' : 'ENABLED', primaryStatus: 'ELIGIBLE', advertisingChannelType: 'SEARCH', biddingStrategyType: 'MANUAL_CPC' },
    campaignBudget: { id: '501', amountMicros: marker.includes('previous') ? '50' : '100', period: 'DAILY', explicitlyShared: false },
    segments: { date }, metrics,
  };
  if (dataset === 'AD_GROUP_PERFORMANCE') return {
    campaign: { id: '101', name: marker, advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Group', status: 'ENABLED', primaryStatus: 'ELIGIBLE', type: 'SEARCH_STANDARD' },
    segments: { date }, metrics,
  };
  if (dataset === 'KEYWORD_PERFORMANCE') return {
    campaign: { id: '101', name: marker, advertisingChannelType: 'SEARCH' }, adGroup: { id: '201', name: 'Group' },
    adGroupCriterion: { criterionId: '301', keyword: { text: '=ficus', matchType: 'EXACT' }, status: 'ENABLED', primaryStatus: 'ELIGIBLE', systemServingStatus: 'ELIGIBLE', negative: false },
    segments: { date }, metrics,
  };
  if (dataset === 'SEARCH_TERMS') return {
    searchTermView: { searchTerm: '=buy ficus' }, campaign: { id: '101', name: marker, advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Group' }, segments: { keyword: null, searchTermMatchType: 'BROAD', searchTermTargetingStatus: 'NONE', date }, metrics,
  };
  if (dataset === 'AD_PERFORMANCE') return {
    campaign: { id: '101', name: marker, advertisingChannelType: 'SEARCH' }, adGroup: { id: '201', name: 'Group' },
    adGroupAd: {
      ad: { id: '401', type: 'RESPONSIVE_SEARCH_AD', finalUrls: ['https://example.com'], responsiveSearchAd: { headlines: [{ text: '=literal' }], descriptions: [{ text: 'Plants' }] } },
      status: 'ENABLED', primaryStatus: 'ELIGIBLE', adStrength: 'GOOD', policySummary: { approvalStatus: 'APPROVED', reviewStatus: 'REVIEWED' },
    },
    segments: { date }, metrics,
  };
  return {
    campaign: { id: '101', name: marker, advertisingChannelType: 'SEARCH' }, adGroup: { id: '201', name: 'Group' },
    adGroupAd: { ad: { id: '401', type: 'RESPONSIVE_SEARCH_AD' } },
    adGroupAdAssetView: { resourceName: 'customers/123/views/1', fieldType: 'HEADLINE', performanceLabel: 'GOOD', enabled: true, source: 'ADVERTISER', asset: 'customers/123/assets/501' },
    asset: { resourceName: 'customers/123/assets/501', id: '501', textAsset: { text: '=literal' } },
    segments: { date }, metrics,
  };
};

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roofroom-slice-b-'));
  const dataRoot = path.join(tempRoot, 'data');
  const directories = {
    app_data_root: tempRoot, config: path.join(tempRoot, 'config'), data: dataRoot,
    runs: path.join(dataRoot, 'runs'), database: path.join(dataRoot, 'database'),
    browser_profiles: path.join(dataRoot, 'browser-profiles'), logs: path.join(dataRoot, 'logs'),
    public_downloads: path.join(tempRoot, 'downloads'),
  };
  const storage = new StorageManager(directories);
  const run = {
    run_id: 'rr_20261008T120000000Z_abc123', workspace_id: 'ws_a', run_status: 'COMPLETED',
    created_at: '2026-08-01T08:00:00.000Z', started_at: '2026-08-01T08:00:00.000Z',
    completed_at: '2026-08-01T08:01:00.000Z', application_version: '1.0.0',
    selected_sources: ['google-ads-search-reporting'], requested_configuration: null, configuration_snapshot: {},
  };
  const jobs = [];
  const artifacts = new Map();
  const rawFiles = [];
  let sequence = 0;
  const addFixture = async ({ dataset, start, end, dates, validation = 'VALID', marker }) => {
    sequence += 1;
    const jobId = `job_${sequence}`;
    const artifactId = `artifact_${sequence}`;
    const rows = validation === 'NO_DATA' ? [] : dates.map((date) => providerRow(dataset, date, marker));
    const bytes = jsonBytes([{ results: rows }]);
    const persisted = await storage.persistRawArtifact({
      run_id: run.run_id, source_id: 'google-ads-search-reporting', attempt_number: sequence,
      preferred_filename: `${String(sequence).padStart(2, '0')}-${dataset.toLowerCase()}.json`,
      media_type: 'application/json', bytes,
    });
    const acquiredAt = `2026-08-${String(Math.min(sequence, 28)).padStart(2, '0')}T08:00:00.000Z`;
    jobs.push({
      job_id: jobId, run_id: run.run_id, source_id: 'google-ads-search-reporting', job_key: dataset,
      query_group_id: null, source_context: {
        source_id: 'google-ads-search-reporting', dataset_type: dataset, resource_mode: MODES[dataset],
        campaign_type: 'SEARCH', customer_id: '1234567890', requested_date_start: start,
        requested_date_end: end, dataset_schema_version: 1,
      },
      job_order: sequence, execution_status: 'COMPLETED', validation_status: validation,
      attempt_count: sequence, accepted_artifact_id: artifactId, created_at: acquiredAt,
      started_at: acquiredAt, completed_at: acquiredAt,
    });
    artifacts.set(artifactId, {
      artifact_id: artifactId, run_id: run.run_id, job_id: jobId, attempt_number: sequence,
      source_id: 'google-ads-search-reporting', artifact_kind: 'RAW_SOURCE_FILE', artifact_state: 'ACCEPTED',
      filename: persisted.filename, relative_path: persisted.relative_path, media_type: persisted.media_type,
      byte_size: persisted.byte_size, sha256: persisted.sha256, created_at: acquiredAt,
    });
    rawFiles.push({ path: persisted.absolute_path, hash: sha(fs.readFileSync(persisted.absolute_path)) });
  };

  for (const [index, dataset] of DATASETS.entries()) {
    if (dataset === 'CAMPAIGN_PERFORMANCE') {
      await addFixture({ dataset, start: '2026-09-20', end: '2026-09-30', dates: ['2026-09-22', '2026-09-23', '2026-09-29', '2026-09-30'], marker: 'previous-broad' });
    } else if (dataset === 'RSA_ASSET_PERFORMANCE') {
      await addFixture({ dataset, start: '2026-09-23', end: '2026-09-29', dates: [], validation: 'NO_DATA', marker: 'previous-no-data' });
      await addFixture({ dataset, start: '2026-09-20', end: '2026-09-30', dates: [], validation: 'NO_DATA', marker: 'broader-no-data-rejected' });
    } else {
      await addFixture({ dataset, start: '2026-09-23', end: '2026-09-29', dates: ['2026-09-23'], marker: `previous-${index}` });
    }
  }
  for (const [index, dataset] of DATASETS.entries()) {
    if (dataset === 'CAMPAIGN_PERFORMANCE') {
      await addFixture({ dataset, start: '2026-09-28', end: '2026-10-08', dates: ['2026-09-29', '2026-10-01', '2026-10-07', '2026-10-08'], marker: 'current-broad' });
    } else if (dataset === 'RSA_ASSET_PERFORMANCE') {
      await addFixture({ dataset, start: '2026-10-01', end: '2026-10-07', dates: [], validation: 'NO_DATA', marker: 'current-no-data' });
      await addFixture({ dataset, start: '2026-09-28', end: '2026-10-08', dates: [], validation: 'NO_DATA', marker: 'current-broader-no-data-rejected' });
    } else {
      await addFixture({ dataset, start: '2026-10-01', end: '2026-10-07', dates: ['2026-10-01'], marker: `current-${index}` });
    }
  }

  const repository = {
    getRun: (runId) => runId === run.run_id ? run : null,
    listRuns: (workspaceId) => workspaceId === run.workspace_id ? [run] : [],
    listJobs: (runId) => runId === run.run_id ? jobs : [],
    getArtifact: (artifactId) => artifacts.get(artifactId) ?? null,
  };
  const loader = new ProductionDataPackageLoader(repository, storage);
  const resolver = new TaskPackageEvidenceResolver(repository, loader);
  const packagesRoot = path.join(dataRoot, 'packages');
  const store = new TaskPackageStore(packagesRoot);
  const assembler = new TaskPackageAssembler(resolver, store);
  assert.equal(TaskPackageAssembler.length, 2, 'Assembler construction must require only resolver and package storage, never an acquirer/requester.');

  const common = {
    recipe: ADS_OPTIMIZATION_PACK_V1_RECIPE, workspace_id: 'ws_a',
    account_identity: { field: 'customer_id', value: '1234567890' }, application_version: '1.0.0',
  };
  const initial = await assembler.assemble({
    ...common, package_id: 'pkg_initial', reference_date: '2026-09-30', created_at: '2026-09-30T10:00:00+03:00',
  });
  assert.equal(initial.status, 'READY');
  assert.equal(initial.package.manifest.package_kind, 'INITIAL_BASELINE');
  assert.equal(initial.package.datasets.length, 6);
  const initialCampaign = initial.package.datasets.find(({ dataset_type }) => dataset_type === 'CAMPAIGN_PERFORMANCE');
  assert.equal(initialCampaign.evidence.disposition, 'REUSED_FILTERED');
  assert.deepEqual(initialCampaign.rows.map(({ performance_date }) => performance_date), ['2026-09-23', '2026-09-29']);
  const initialRsa = initial.requirements.find(({ requirement }) => requirement.dataset_type === 'RSA_ASSET_PERFORMANCE');
  assert.equal(initialRsa.status, 'READY');
  assert.equal(initialRsa.evidence.disposition, 'NO_DATA');
  assert.ok(initialRsa.rejected_candidates.some(({ code }) => code === 'NO_DATA_REQUIRES_EXACT_WINDOW'));
  await writeAdsOptimizationPackage(store, initial.package);

  const comparison = await assembler.assemble({
    ...common, package_id: 'pkg_comparison', reference_date: '2026-10-08', created_at: '2026-10-08T10:00:00+03:00',
  });
  assert.equal(comparison.status, 'READY');
  assert.equal(comparison.package.manifest.package_kind, 'COMPARISON');
  assert.equal(comparison.package.manifest.previous_package_id, 'pkg_initial');
  assert.deepEqual(comparison.package.manifest.previous_window, { start: '2026-09-23', end: '2026-09-29' });
  assert.equal(comparison.package.manifest.gap_days, 1);
  assert.equal(comparison.package.datasets.length, 12);
  const currentCampaign = comparison.package.datasets.find(({ role, dataset_type }) => role === 'CURRENT' && dataset_type === 'CAMPAIGN_PERFORMANCE');
  assert.equal(currentCampaign.evidence.transformation.kind, 'DATE_FILTER');
  assert.deepEqual(currentCampaign.rows.map(({ performance_date }) => performance_date), ['2026-10-01', '2026-10-07']);
  assert.equal(currentCampaign.rows[0].clicks, 0);
  assert.equal(currentCampaign.rows[0].conversions, null);
  const previousCampaign = comparison.package.datasets.find(({ role, dataset_type }) => role === 'PREVIOUS' && dataset_type === 'CAMPAIGN_PERFORMANCE');
  assert.equal(previousCampaign.rows[0].campaign_status, 'PAUSED');
  assert.equal(previousCampaign.evidence.source_package_id, 'pkg_initial');
  const currentRsa = comparison.requirements.find(({ requirement }) => requirement.dataset_type === 'RSA_ASSET_PERFORMANCE');
  assert.equal(currentRsa.status, 'READY');
  assert.equal(currentRsa.evidence.disposition, 'NO_DATA');
  assert.ok(currentRsa.rejected_candidates.some(({ code }) => code === 'NO_DATA_REQUIRES_EXACT_WINDOW'));

  const published = await writeAdsOptimizationPackage(store, comparison.package);
  const finalManifest = JSON.parse(fs.readFileSync(published.manifest_path, 'utf8'));
  assert.equal(finalManifest.evidence.length, 12);
  assert.equal(finalManifest.evidence.every(({ origin }) => origin.run_id && origin.job_id && origin.attempt_number && origin.artifact_id && origin.artifact_sha256 && origin.acquired_at && origin.snapshot_observed_at), true);
  assert.equal(JSON.stringify(finalManifest).includes(tempRoot), false);
  assert.equal(/recommendation_score|"action"|"delta"|go_pause/iu.test(JSON.stringify(finalManifest)), false);
  const workbookFiles = unzipSync(new Uint8Array(fs.readFileSync(path.join(published.package_directory, finalManifest.workbook_filename))));
  assert.ok(workbookFiles['xl/workbook.xml']);
  for (const raw of rawFiles) assert.equal(sha(fs.readFileSync(raw.path)), raw.hash, 'Raw evidence must remain byte-for-byte unchanged.');

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log('PASS ADS-OPTIMIZATION-PACK-SLICE-B-001: local six-dataset evidence resolves, filters, rejects broader NO_DATA, baselines, exports, and preserves raw provenance without provider calls');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
