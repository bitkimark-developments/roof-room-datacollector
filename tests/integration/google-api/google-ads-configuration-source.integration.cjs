const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const {
  GoogleAdsConfigurationSource,
  GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS,
} = require(path.join(
  buildRoot,
  'main/sources/google-ads/configuration-source.js',
));

const {
  createGoogleAdsConfigurationJobContext,
} = require(path.join(
  buildRoot,
  'main/sources/google-ads/configuration-request.js',
));

const {
  GoogleApiRuntimeFactory,
} = require(path.join(
  buildRoot,
  'main/sources/google-api/google-api-runtime.js',
));

const {
  GOOGLE_ADS_CONFIGURATION_DATASET_TYPES,
} = require(path.join(
  buildRoot,
  'shared/google-ads-configuration.js',
));

const {
  GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
} = require(path.join(
  buildRoot,
  'shared/google-api.js',
));

const baseContext = createGoogleAdsConfigurationJobContext({
  dataset_type: 'CAMPAIGN_NEGATIVE_KEYWORDS',
  customer_id: '1234567890',
});

const query =
  "SELECT campaign.id, campaign_criterion.resource_name "
  + "FROM campaign_criterion "
  + "WHERE campaign.advertising_channel_type = 'SEARCH' "
  + "AND campaign_criterion.type = 'KEYWORD' "
  + 'AND campaign_criterion.negative = TRUE';

const descriptor = {
  dataset_type: 'CAMPAIGN_NEGATIVE_KEYWORDS',
  resource_mode: 'CAMPAIGN_CRITERION',
  buildQuery: (context) => {
    assert.deepEqual(context, baseContext);
    return query;
  },
};

const collectionContext = {
  source_id: 'google-ads-configuration',
  job_key: 'CAMPAIGN_NEGATIVE_KEYWORDS',
  source_context: baseContext,
};

(async () => {
  assert.equal(Object.isFrozen(baseContext), true);

  assert.deepEqual(
    GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS.map((entry) => ({
      dataset_type: entry.dataset_type,
      resource_mode: entry.resource_mode,
    })),
    [
      {
        dataset_type: 'CAMPAIGN_NEGATIVE_KEYWORDS',
        resource_mode: 'CAMPAIGN_CRITERION',
      },
      {
        dataset_type: 'AD_GROUP_NEGATIVE_KEYWORDS',
        resource_mode: 'AD_GROUP_CRITERION',
      },
      {
        dataset_type: 'SHARED_NEGATIVE_KEYWORDS',
        resource_mode: 'SHARED_CRITERION',
      },
      {
        dataset_type: 'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
        resource_mode: 'CAMPAIGN_SHARED_SET',
      },
      {
        dataset_type: 'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
        resource_mode: 'CUSTOMER_NEGATIVE_CRITERION',
      },
    ],
    'Configuration source must register exactly the five approved dataset descriptors.',
  );

  const providerRequests = [];
  const rawText =
    '[ { "results": [ { "campaign": { "id": "1001" }, '
    + '"campaignCriterion": { "criterionId": "2001" } } ] } ]';
  const rawBytes = new TextEncoder().encode(rawText);

  const source = new GoogleAdsConfigurationSource(
    '1234567890',
    async (request) => {
      providerRequests.push(request);
      return {
        status: 200,
        body: [{
          results: [{
            campaign: { id: '1001' },
            campaignCriterion: { criterionId: '2001' },
          }],
        }],
        raw_body: rawBytes,
      };
    },
    [descriptor],
  );

  assert.equal(source.id, 'google-ads-configuration');
  assert.equal(source.name, 'Google Ads Configuration');
  assert.equal(source.sourceMode, 'OFFICIAL_API');
  assert.deepEqual(
    [...source.datasetTypes],
    [...GOOGLE_ADS_CONFIGURATION_DATASET_TYPES],
  );

  const ready = await source.checkReadiness();
  assert.equal(ready.source_id, 'google-ads-configuration');
  assert.equal(ready.readiness_status, 'READY');

  const notConfigured = await new GoogleAdsConfigurationSource(
    null,
    async () => {
      throw new Error('Requester must not run for readiness.');
    },
    [descriptor],
  ).checkReadiness();

  assert.equal(notConfigured.readiness_status, 'NOT_CONFIGURED');

  const invalidContexts = [
    {
      label: 'wrong source identity',
      context: {
        ...collectionContext,
        source_id: 'google-ads-search-reporting',
      },
    },
    {
      label: 'wrong Job key',
      context: {
        ...collectionContext,
        job_key: 'AD_GROUP_NEGATIVE_KEYWORDS',
      },
    },
    {
      label: 'customer mismatch',
      context: {
        ...collectionContext,
        source_context: {
          ...baseContext,
          customer_id: '9999999999',
        },
      },
    },
    {
      label: 'unsupported schema',
      context: {
        ...collectionContext,
        source_context: {
          ...baseContext,
          dataset_schema_version: 2,
        },
      },
    },
    {
      label: 'resource mode mismatch',
      context: {
        ...collectionContext,
        source_context: {
          ...baseContext,
          resource_mode: 'AD_GROUP_CRITERION',
        },
      },
    },
  ];

  for (const invalid of invalidContexts) {
    const result = await source.collect(invalid.context);

    assert.equal(
      result.result_type,
      'FAILED',
      `${invalid.label} must fail.`,
    );
    assert.equal(
      result.error_code,
      'SOURCE_CONFIGURATION_INVALID',
      `${invalid.label} must be a source-configuration failure.`,
    );
  }

  assert.equal(
    providerRequests.length,
    0,
    'Invalid immutable context must fail before requester invocation.',
  );

  assert.throws(
    () => new GoogleAdsConfigurationSource(
      '1234567890',
      async () => {
        throw new Error('Requester must not run.');
      },
      [{
        dataset_type: 'CAMPAIGN_NEGATIVE_KEYWORDS',
        resource_mode: 'AD_GROUP_CRITERION',
        buildQuery: () => query,
      }],
    ),
    /resource mode/iu,
    'Descriptor resource-mode mismatch must fail before collection.',
  );

  const missingDescriptorRequests = [];
  const missingDescriptorSource = new GoogleAdsConfigurationSource(
    '1234567890',
    async (request) => {
      missingDescriptorRequests.push(request);
      throw new Error('Requester must not run.');
    },
    [descriptor],
  );

  const missingDescriptorContext =
    createGoogleAdsConfigurationJobContext({
      dataset_type: 'AD_GROUP_NEGATIVE_KEYWORDS',
      customer_id: '1234567890',
    });

  const missingDescriptorResult =
    await missingDescriptorSource.collect({
      source_id: 'google-ads-configuration',
      job_key: 'AD_GROUP_NEGATIVE_KEYWORDS',
      source_context: missingDescriptorContext,
    });

  assert.equal(missingDescriptorResult.result_type, 'FAILED');
  assert.equal(
    missingDescriptorResult.error_code,
    'SOURCE_CONFIGURATION_INVALID',
  );
  assert.equal(
    missingDescriptorRequests.length,
    0,
    'Missing descriptor must fail before requester invocation.',
  );

  const emptyQueryRequests = [];
  const emptyQuerySource = new GoogleAdsConfigurationSource(
    '1234567890',
    async (request) => {
      emptyQueryRequests.push(request);
      throw new Error('Requester must not run.');
    },
    [{
      ...descriptor,
      buildQuery: () => '   ',
    }],
  );

  const emptyQueryResult =
    await emptyQuerySource.collect(collectionContext);

  assert.equal(emptyQueryResult.result_type, 'FAILED');
  assert.equal(
    emptyQueryRequests.length,
    0,
    'Empty query builder output must fail before requester invocation.',
  );

  const result = await source.collect(collectionContext);

  assert.equal(result.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(result.media_type, 'application/json');
  assert.equal(
    result.preferred_filename,
    'google-ads-campaign-negative-keywords.json',
  );

  assert.deepEqual(
    Buffer.from(result.bytes),
    Buffer.from(rawBytes),
    'Artifact must preserve the exact raw provider response bytes.',
  );

  assert.equal(
    new TextDecoder().decode(result.bytes),
    rawText,
  );

  assert.equal(providerRequests.length, 1);
  assert.equal(
    providerRequests[0].url,
    'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream',
  );
  assert.equal(providerRequests[0].method, 'POST');
  assert.deepEqual(providerRequests[0].body, { query });

  assert.equal(
    Object.hasOwn(result, 'rows'),
    false,
    'Acquisition result must remain raw evidence, not normalized rows.',
  );

  const failedSource = new GoogleAdsConfigurationSource(
    '1234567890',
    async () => {
      throw new Error('sentinel provider failure');
    },
    [descriptor],
  );

  const failedResult = await failedSource.collect(collectionContext);

  assert.equal(failedResult.result_type, 'FAILED');
  assert.equal(failedResult.error_code, 'GOOGLE_ADS_API_FAILED');
  assert.match(failedResult.message, /sentinel provider failure/u);

  /*
   * Runtime factory:
   * - only existing google-ads-search-terms connection is available;
   * - no google-ads-configuration connection exists;
   * - authenticated Ads requester keeps OAuth/login-customer-id behavior.
   */
  const requestedConnectionSourceIds = [];
  const runtimeProviderRequests = [];
  const tokenRequests = [];

  const runtimeFactory = new GoogleApiRuntimeFactory(
    {
      getSourceConnection: (workspaceId, sourceId) => {
        assert.equal(workspaceId, 'workspace-a');
        requestedConnectionSourceIds.push(sourceId);

        if (sourceId !== GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID) {
          return null;
        }

        return {
          connection_id: 'connection-a',
          workspace_id: workspaceId,
          source_id: GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
          credential_ref: 'credential-a',
          safe_metadata: {
            customer_id: '123-456-7890',
            login_customer_id: '987-654-3210',
          },
          created_at: '2026-10-02T00:00:00.000Z',
          updated_at: '2026-10-02T00:00:00.000Z',
        };
      },

      upsertSourceConnection: () => {
        throw new Error('Connection mutation is not expected.');
      },
    },

    {
      readCredential: async (reference) => {
        assert.equal(reference, 'credential-a');
        return JSON.stringify({
          client_id: 'fixture-client',
          refresh_token: 'fixture-refresh',
        });
      },
    },

    async (request) => {
      if (request.url === 'https://oauth2.googleapis.com/token') {
        tokenRequests.push(request);

        return {
          status: 200,
          body: {
            access_token: 'runtime-access',
            expires_in: 3600,
            token_type: 'Bearer',
          },
        };
      }

      runtimeProviderRequests.push(request);

      return {
        status: 200,
        body: [{ results: [] }],
        raw_body: new TextEncoder().encode('[{"results":[]}]'),
      };
    },
  );

  const runtimeSource =
    runtimeFactory.createConfigurationSource({
      workspace_id: 'workspace-a',
    });

  assert.equal(runtimeSource.id, 'google-ads-configuration');

  assert.deepEqual(
    requestedConnectionSourceIds,
    [GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID],
    'Configuration source must reuse only the existing Google Ads Workspace connection.',
  );

  const runtimeResult =
    await runtimeSource.collect(collectionContext);

  assert.equal(runtimeResult.result_type, 'ARTIFACT_PRODUCED');

  assert.equal(tokenRequests.length, 1);
  assert.equal(runtimeProviderRequests.length, 1);

  assert.equal(
    runtimeProviderRequests[0].url,
    'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream',
  );
  assert.equal(
    runtimeProviderRequests[0].headers.Authorization,
    'Bearer runtime-access',
  );
  assert.equal(
    runtimeProviderRequests[0].headers['login-customer-id'],
    '9876543210',
  );
  assert.equal(
    runtimeProviderRequests[0].headers['developer-token'],
    undefined,
    'Retired Developer Token must not be restored.',
  );

  console.log(
    'PASS GOOGLE-ADS-CONFIGURATION-SOURCE-001: configuration Jobs fail closed before provider access, preserve exact raw SearchStream bytes, and reuse the existing authenticated Ads connection',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
