const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build root and work root.');

const load = (modulePath) => require(path.join(buildRoot, modulePath));
const {
  GoogleAdsSearchReportingValidator,
} = load('main/sources/google-ads/search-reporting-validator.js');
const {
  createGoogleAdsReportingJobContext,
} = load('main/sources/google-ads/search-reporting-request.js');
const {
  createProductionCollectionRuntime,
} = load('main/app/production-collection-runtime.js');

fs.mkdirSync(workRoot, { recursive: true });
const validator = new GoogleAdsSearchReportingValidator();
let artifactSequence = 0;

const baseMetrics = {
  impressions: '0', clicks: '0', ctr: '0', averageCpc: '0', costMicros: '0',
  conversions: '0', conversionsValue: '0', allConversions: '0', allConversionsValue: '0',
};

const rowsByDataset = {
  CAMPAIGN_PERFORMANCE: {
    customer: { currencyCode: 'TRY', timeZone: 'Europe/Istanbul' },
    campaign: {
      id: '101', name: 'Search', status: 'ENABLED', primaryStatus: 'ELIGIBLE',
      advertisingChannelType: 'SEARCH', biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
    },
    campaignBudget: { id: '501', amountMicros: '0', period: 'DAILY', explicitlyShared: false },
    segments: { date: '2026-09-02' }, metrics: baseMetrics,
  },
  AD_GROUP_PERFORMANCE: {
    campaign: { id: '101', name: 'Search', advertisingChannelType: 'SEARCH' },
    adGroup: {
      id: '201', name: 'Ficus', status: 'ENABLED', primaryStatus: 'ELIGIBLE',
      type: 'SEARCH_STANDARD', cpcBidMicros: '0', effectiveCpcBidMicros: null,
    },
    segments: { date: '2026-09-02' }, metrics: baseMetrics,
  },
  KEYWORD_PERFORMANCE: {
    campaign: { id: '101', name: 'Search', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Ficus' },
    adGroupCriterion: {
      criterionId: '301', keyword: { text: 'ficus plant', matchType: 'PHRASE' },
      status: 'ENABLED', primaryStatus: 'ELIGIBLE', systemServingStatus: 'ELIGIBLE',
      negative: false, cpcBidMicros: '0', effectiveCpcBidMicros: null, qualityInfo: {},
    },
    segments: { date: '2026-09-02' }, metrics: baseMetrics,
  },
  SEARCH_TERMS: {
    searchTermView: { searchTerm: 'buy ficus' },
    campaign: { id: '101', name: 'Search', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Ficus' },
    segments: {
      keyword: null, searchTermMatchType: 'BROAD', searchTermTargetingStatus: 'NONE',
      date: '2026-09-02',
    },
    metrics: baseMetrics,
  },
  AD_PERFORMANCE: {
    campaign: { id: '101', name: 'Search', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Ficus' },
    adGroupAd: {
      ad: {
        id: '401', type: 'RESPONSIVE_SEARCH_AD', finalUrls: ['https://example.com'],
        responsiveSearchAd: { headlines: [{ text: 'Ficus' }], descriptions: [{ text: 'Plants' }] },
      },
      status: 'ENABLED', primaryStatus: 'ELIGIBLE', adStrength: 'GOOD',
      policySummary: { approvalStatus: 'APPROVED', reviewStatus: 'REVIEWED' },
    },
    segments: { date: '2026-09-02' }, metrics: baseMetrics,
  },
  RSA_ASSET_PERFORMANCE: {
    campaign: { id: '101', name: 'Search', advertisingChannelType: 'SEARCH' },
    adGroup: { id: '201', name: 'Ficus' },
    adGroupAd: { ad: { id: '401', type: 'RESPONSIVE_SEARCH_AD' } },
    adGroupAdAssetView: {
      resourceName: 'customers/123/adGroupAdAssetViews/201~401~501~HEADLINE',
      fieldType: 'HEADLINE', performanceLabel: 'GOOD', pinnedField: null,
      enabled: true, source: 'ADVERTISER', asset: 'customers/123/assets/501',
    },
    asset: { resourceName: 'customers/123/assets/501', id: '501', textAsset: { text: 'Ficus' } },
    segments: { date: '2026-09-02' }, metrics: baseMetrics,
  },
};

const validationContext = (datasetType, body, overrides = {}) => {
  artifactSequence += 1;
  const sourceContext = createGoogleAdsReportingJobContext({
    dataset_type: datasetType,
    customer_id: '1234567890',
    requested_date_start: '2026-09-01',
    requested_date_end: '2026-09-07',
  });
  const absolutePath = path.join(workRoot, `artifact-${artifactSequence}.json`);
  fs.writeFileSync(absolutePath, typeof body === 'string' ? body : JSON.stringify(body));
  const run = {
    run_id: 'run-1', workspace_id: 'workspace-1', run_status: 'RUNNING',
    created_at: '2026-09-08T00:00:00.000Z', started_at: '2026-09-08T00:00:00.000Z',
    completed_at: null, application_version: 'test',
    selected_sources: ['google-ads-search-reporting'], requested_configuration: null,
    configuration_snapshot: {},
  };
  const job = {
    job_id: 'job-1', run_id: 'run-1', source_id: 'google-ads-search-reporting',
    job_key: datasetType, query_group_id: null, source_context: sourceContext,
    job_order: 1, execution_status: 'VALIDATING', validation_status: 'NOT_RUN',
    attempt_count: 1, accepted_artifact_id: null, created_at: run.created_at,
    started_at: run.started_at, completed_at: null,
  };
  const attempt = {
    attempt_id: 'attempt-1', job_id: 'job-1', attempt_number: 1,
    execution_status: 'VALIDATING', candidate_artifact_id: 'artifact-1', validation_id: null,
    error_code: null, started_at: run.started_at, completed_at: null,
  };
  const artifact = {
    artifact_id: 'artifact-1', run_id: 'run-1', job_id: 'job-1', attempt_number: 1,
    source_id: 'google-ads-search-reporting', artifact_kind: 'RAW_SOURCE_FILE',
    artifact_state: 'CANDIDATE', filename: path.basename(absolutePath),
    relative_path: path.basename(absolutePath), media_type: 'application/json',
    byte_size: fs.statSync(absolutePath).size, sha256: null, created_at: run.created_at,
  };
  return {
    run, job, attempt, artifact, source_context: sourceContext, absolute_path: absolutePath,
    ...overrides,
  };
};

(async () => {
  for (const [datasetType, row] of Object.entries(rowsByDataset)) {
    const decision = await validator.validate(validationContext(datasetType, [{ results: [row] }]));
    assert.equal(decision.validation_status, 'VALID', `${datasetType} must validate`);
    assert.deepEqual(decision.validated_metadata, {
      actual_date_start: '2026-09-02', actual_date_end: '2026-09-02', country_name: null,
    });
  }

  for (const datasetType of ['CAMPAIGN_PERFORMANCE', 'AD_GROUP_PERFORMANCE', 'KEYWORD_PERFORMANCE']) {
    const row = structuredClone(rowsByDataset[datasetType]);
    Object.assign(row.metrics, {
      conversionsByConversionDate: '0',
      conversionsValueByConversionDate: null,
      allConversionsByConversionDate: '1.5',
      allConversionsValueByConversionDate: '10',
    });
    const base = validationContext(datasetType, [{ results: [row] }]);
    const v3Context = { ...base.source_context, dataset_schema_version: 3 };
    const valid = await validator.validate({ ...base, source_context: v3Context });
    assert.equal(valid.validation_status, 'VALID', `${datasetType} v3 metrics must validate`);
    delete row.metrics.conversionsByConversionDate;
    const missingBase = validationContext(datasetType, [{ results: [row] }]);
    const missing = await validator.validate({ ...missingBase, source_context: v3Context });
    assert.equal(missing.validation_status, 'INVALID_SCHEMA', `${datasetType} missing v3 field must fail`);
  }

  const noData = await validator.validate(validationContext(
    'CAMPAIGN_PERFORMANCE',
    [{ results: [] }, {}],
  ));
  assert.equal(noData.validation_status, 'NO_DATA');

  const wrongSourceBase = validationContext(
    'CAMPAIGN_PERFORMANCE',
    [{ results: [rowsByDataset.CAMPAIGN_PERFORMANCE] }],
  );
  const wrongSource = await validator.validate({
    ...wrongSourceBase,
    job: { ...wrongSourceBase.job, source_id: 'other-source' },
  });
  assert.equal(wrongSource.validation_status, 'INVALID_SCHEMA');

  const wrongDatasetBase = validationContext(
    'CAMPAIGN_PERFORMANCE',
    [{ results: [rowsByDataset.CAMPAIGN_PERFORMANCE] }],
  );
  const wrongDataset = await validator.validate({
    ...wrongDatasetBase,
    job: { ...wrongDatasetBase.job, job_key: 'AD_GROUP_PERFORMANCE' },
  });
  assert.equal(wrongDataset.validation_status, 'QUERY_MISMATCH');

  const wrongModeBase = validationContext(
    'CAMPAIGN_PERFORMANCE',
    [{ results: [rowsByDataset.CAMPAIGN_PERFORMANCE] }],
  );
  const wrongMode = await validator.validate({
    ...wrongModeBase,
    source_context: { ...wrongModeBase.source_context, resource_mode: 'ad_group' },
  });
  assert.equal(wrongMode.validation_status, 'QUERY_MISMATCH');

  const nonSearchRow = structuredClone(rowsByDataset.CAMPAIGN_PERFORMANCE);
  nonSearchRow.campaign.advertisingChannelType = 'PERFORMANCE_MAX';
  const nonSearch = await validator.validate(validationContext(
    'CAMPAIGN_PERFORMANCE',
    [{ results: [nonSearchRow] }],
  ));
  assert.equal(nonSearch.validation_status, 'QUERY_MISMATCH');

  const malformedEnvelope = await validator.validate(validationContext(
    'CAMPAIGN_PERFORMANCE',
    [{ results: 'not-an-array' }],
  ));
  assert.equal(malformedEnvelope.validation_status, 'INVALID_SCHEMA');

  const missingIdentityRow = structuredClone(rowsByDataset.AD_GROUP_PERFORMANCE);
  delete missingIdentityRow.adGroup.id;
  const missingIdentity = await validator.validate(validationContext(
    'AD_GROUP_PERFORMANCE',
    [{ results: [missingIdentityRow] }],
  ));
  assert.equal(missingIdentity.validation_status, 'INVALID_SCHEMA');

  const invalidNumericRow = structuredClone(rowsByDataset.KEYWORD_PERFORMANCE);
  invalidNumericRow.metrics.clicks = 'not-a-number';
  const invalidNumeric = await validator.validate(validationContext(
    'KEYWORD_PERFORMANCE',
    [{ results: [invalidNumericRow] }],
  ));
  assert.equal(invalidNumeric.validation_status, 'INVALID_SCHEMA');

  const outOfRangeRow = structuredClone(rowsByDataset.SEARCH_TERMS);
  outOfRangeRow.segments.date = '2026-08-31';
  const outOfRange = await validator.validate(validationContext(
    'SEARCH_TERMS',
    [{ results: [outOfRangeRow] }],
  ));
  assert.equal(outOfRange.validation_status, 'DATE_MISMATCH');

  const missingDateRow = structuredClone(rowsByDataset.AD_PERFORMANCE);
  delete missingDateRow.segments.date;
  const missingDate = await validator.validate(validationContext(
    'AD_PERFORMANCE',
    [{ results: [missingDateRow] }],
  ));
  assert.equal(missingDate.validation_status, 'INVALID_SCHEMA');

  const wrongAdTypeRow = structuredClone(rowsByDataset.RSA_ASSET_PERFORMANCE);
  wrongAdTypeRow.adGroupAd.ad.type = 'RESPONSIVE_DISPLAY_AD';
  const wrongAdType = await validator.validate(validationContext(
    'RSA_ASSET_PERFORMANCE',
    [{ results: [wrongAdTypeRow] }],
  ));
  assert.equal(wrongAdType.validation_status, 'QUERY_MISMATCH');

  const notJson = await validator.validate(validationContext(
    'CAMPAIGN_PERFORMANCE',
    '<html>login</html>',
  ));
  assert.equal(notJson.validation_status, 'ERROR_NOT_DATA');

  const runtime = createProductionCollectionRuntime({
    repository: { getRun: () => ({ workspace_id: 'workspace-1' }), getSourceConnection: () => null },
    credentialStore: {
      hasCredential: async () => false, readCredential: async () => '',
      writeCredential: async () => {}, deleteCredential: async () => {},
    },
    directories: {
      app_data_root: workRoot, config: workRoot, data: workRoot, runs: workRoot,
      database: workRoot, browser_profiles: workRoot, logs: workRoot, public_downloads: workRoot,
    },
    googleTrendsSource: {
      id: 'google-trends', name: 'Google Trends', sourceMode: 'GOOGLE_TRENDS_UI',
      datasetTypes: ['INTEREST_OVER_TIME'], getCapabilities: () => ({}),
      checkReadiness: async () => ({ source_id: 'google-trends', readiness_status: 'READY', checked_at: new Date().toISOString(), message: null }),
      collect: async () => ({ result_type: 'FAILED', error_code: 'TEST_ONLY', message: null }),
    },
  });
  const reportingSource = runtime.source_registry.get('google-ads-search-reporting');
  assert.deepEqual([...reportingSource.datasetTypes], Object.keys(rowsByDataset));
  assert.equal(
    runtime.validator_registry.get('google-ads-search-reporting').constructor.name,
    'GoogleAdsSearchReportingValidator',
  );

  console.log(
    'PASS GOOGLE-ADS-SEARCH-REPORTING-VALIDATION-001: all six canonical datasets fail closed on identity, schema, mode, numeric, and date mismatches while empty results remain NO_DATA',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
