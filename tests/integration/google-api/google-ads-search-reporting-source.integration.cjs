const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const {
  GoogleAdsSearchReportingSource,
} = require(path.join(buildRoot, 'main/sources/google-ads/search-reporting-source.js'));
const {
  createGoogleAdsReportingJobContext,
  requireGoogleAdsReportingJobContext,
} = require(path.join(buildRoot, 'main/sources/google-ads/search-reporting-request.js'));
const {
  GoogleApiRuntimeFactory,
} = require(path.join(buildRoot, 'main/sources/google-api/google-api-runtime.js'));

const baseContext = createGoogleAdsReportingJobContext({
  dataset_type: 'CAMPAIGN_PERFORMANCE',
  customer_id: '1234567890',
  requested_date_start: '2026-09-01',
  requested_date_end: '2026-09-07',
});

assert.equal(Object.isFrozen(baseContext), true, 'created Job context must be immutable');
assert.deepEqual(baseContext, {
  source_id: 'google-ads-search-reporting',
  dataset_type: 'CAMPAIGN_PERFORMANCE',
  resource_mode: 'campaign',
  campaign_type: 'SEARCH',
  customer_id: '1234567890',
  requested_date_start: '2026-09-01',
  requested_date_end: '2026-09-07',
  dataset_schema_version: 2,
});

const historicalV1Context = requireGoogleAdsReportingJobContext({
  ...baseContext,
  dataset_schema_version: 1,
});
assert.equal(historicalV1Context.dataset_schema_version, 1);
assert.equal(Object.isFrozen(historicalV1Context), true);

assert.deepEqual(
  Object.keys(baseContext).sort(),
  [
    'campaign_type',
    'customer_id',
    'dataset_schema_version',
    'dataset_type',
    'requested_date_end',
    'requested_date_start',
    'resource_mode',
    'source_id',
  ],
  'Job context must not introduce package or analysis fields',
);

const descriptor = {
  dataset_type: 'CAMPAIGN_PERFORMANCE',
  resource_mode: 'campaign',
  buildQuery: (context) => {
    assert.deepEqual(context, baseContext);
    return "SELECT campaign.id FROM campaign WHERE campaign.advertising_channel_type = 'SEARCH' AND segments.date BETWEEN '2026-09-01' AND '2026-09-07'";
  },
};
const rawText = '[ { "results": [ { "campaign": { "id": "11" }, "metrics": { "costMicros": "0" } } ] } ]';
const rawBytes = new TextEncoder().encode(rawText);
const providerRequests = [];
const source = new GoogleAdsSearchReportingSource(
  '1234567890',
  async (request) => {
    providerRequests.push(request);
    return {
      status: 200,
      body: [{ results: [{ campaign: { id: '11' }, metrics: { costMicros: '0' } }] }],
      raw_body: rawBytes,
    };
  },
  [descriptor],
);
const collectionContext = {
  source_id: 'google-ads-search-reporting',
  job_key: 'CAMPAIGN_PERFORMANCE',
  source_context: baseContext,
};

(async () => {
  const result = await source.collect(collectionContext);
  assert.equal(result.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(new TextDecoder().decode(result.bytes), rawText);
  assert.equal(result.media_type, 'application/json');
  assert.equal(providerRequests.length, 1);
  assert.equal(
    providerRequests[0].url,
    'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream',
  );
  assert.equal(providerRequests[0].method, 'POST');
  assert.equal(providerRequests[0].body.query, descriptor.buildQuery(baseContext));
  assert.equal(Object.hasOwn(result, 'rows'), false, 'raw artifacts must not be replaced by normalized rows');
  assert.equal(Object.hasOwn(result, 'score'), false, 'source results must not contain analysis fields');

  const invalidContexts = [
    { ...baseContext, requested_date_start: '2026-09-08' },
    { ...baseContext, requested_date_start: '2026-02-30' },
    { ...baseContext, campaign_type: 'PERFORMANCE_MAX' },
    { ...baseContext, resource_mode: 'keyword_view' },
    { ...baseContext, dataset_type: 'SHOPPING_PERFORMANCE' },
    { ...baseContext, customer_id: '9999999999' },
    { ...baseContext, dataset_schema_version: 1 },
    { ...baseContext, dataset_schema_version: 3 },
    { ...baseContext, recommendation_score: 0.7 },
  ];
  for (const invalidContext of invalidContexts) {
    const invalidResult = await source.collect({
      ...collectionContext,
      source_context: invalidContext,
    });
    assert.equal(invalidResult.result_type, 'FAILED');
    assert.equal(invalidResult.error_code, 'SOURCE_CONFIGURATION_INVALID');
  }
  assert.equal(providerRequests.length, 1, 'invalid contexts must fail before requester invocation');

  assert.throws(
    () => createGoogleAdsReportingJobContext({
      dataset_type: 'CAMPAIGN_PERFORMANCE',
      customer_id: '1234567890',
      requested_date_start: '2026-09-08',
      requested_date_end: '2026-09-07',
    }),
    /reversed/u,
  );

  const requestedConnectionSourceIds = [];
  const runtimeFactory = new GoogleApiRuntimeFactory(
    {
      getSourceConnection: (workspaceId, sourceId) => {
        assert.equal(workspaceId, 'workspace-a');
        requestedConnectionSourceIds.push(sourceId);
        return {
          connection_id: 'connection-a',
          workspace_id: workspaceId,
          source_id: sourceId,
          credential_ref: 'credential-a',
          safe_metadata: { customer_id: '123-456-7890' },
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
        };
      },
      upsertSourceConnection: () => {
        throw new Error('not expected');
      },
    },
    {
      readCredential: async () => JSON.stringify({ client_id: 'fixture', refresh_token: 'fixture' }),
    },
    async () => ({ status: 200, body: {} }),
  );
  const runtimeSource = runtimeFactory.createSearchReportingSource({ workspace_id: 'workspace-a' });
  assert.equal(runtimeSource.id, 'google-ads-search-reporting');
  assert.deepEqual(requestedConnectionSourceIds, ['google-ads-search-terms']);

  console.log(
    'PASS GOOGLE-ADS-SEARCH-REPORTING-SOURCE-001: immutable SEARCH contexts dispatch raw evidence through the existing Ads connection boundary and reject unsupported scope before requests',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
