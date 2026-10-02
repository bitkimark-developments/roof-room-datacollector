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
  normalizeGoogleAdsConfigurationRows,
} = require(path.join(
  buildRoot,
  'main/sources/google-ads/configuration-normalizer.js',
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
  GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET,
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
    normalizeGoogleAdsConfigurationRows(
      'CAMPAIGN_NEGATIVE_KEYWORDS',
      [{
        campaign: {
          id: '1001',
          name: 'Search Campaign',
          advertisingChannelType: 'SEARCH',
        },
        campaignCriterion: {
          resourceName: 'customers/123/campaignCriteria/1001~2001',
          criterionId: '2001',
          status: 'REMOVED',
          type: 'KEYWORD',
          negative: true,
          keyword: {
            text: 'free',
            matchType: 'BROAD',
          },
        },
      }],
    ),
    [{
      campaign_id: '1001',
      campaign_name: 'Search Campaign',
      campaign_advertising_channel_type: 'SEARCH',
      campaign_criterion_resource_name:
        'customers/123/campaignCriteria/1001~2001',
      campaign_criterion_id: '2001',
      campaign_criterion_status: 'REMOVED',
      campaign_criterion_type: 'KEYWORD',
      campaign_criterion_negative: true,
      keyword_text: 'free',
      keyword_match_type: 'BROAD',
    }],
    'Family dispatcher must delegate Negatives datasets to the existing adapter.',
  );

  assert.deepEqual(
    normalizeGoogleAdsConfigurationRows(
      'CUSTOMER_CONVERSION_GOALS',
      [{
        customerConversionGoal: {
          resourceName:
            'customers/123/customerConversionGoals/PURCHASE~WEBSITE',
          category: 'PURCHASE',
          origin: 'WEBSITE',
          biddable: false,
        },
      }],
    ),
    [{
      resource_name:
        'customers/123/customerConversionGoals/PURCHASE~WEBSITE',
      category: 'PURCHASE',
      origin: 'WEBSITE',
      biddable: false,
    }],
    'Family dispatcher must delegate conversion datasets to the conversion adapter.',
  );

  assert.throws(
    () => normalizeGoogleAdsConfigurationRows(
      'UNSUPPORTED_CONFIGURATION_DATASET',
      [],
    ),
    /unsupported/iu,
    'Family dispatcher must fail closed for an unsupported dataset.',
  );

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
      {
        dataset_type: 'CONVERSION_ACTIONS',
        resource_mode: 'CONVERSION_ACTION',
      },
      {
        dataset_type: 'CUSTOMER_CONVERSION_GOALS',
        resource_mode: 'CUSTOMER_CONVERSION_GOAL',
      },
      {
        dataset_type: 'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
        resource_mode: 'CONVERSION_GOAL_CAMPAIGN_CONFIG',
      },
      {
        dataset_type: 'CAMPAIGN_CONVERSION_GOALS',
        resource_mode: 'CAMPAIGN_CONVERSION_GOAL',
      },
      {
        dataset_type: 'CUSTOM_CONVERSION_GOALS',
        resource_mode: 'CUSTOM_CONVERSION_GOAL',
      },
      {
        dataset_type: 'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
        resource_mode: 'CUSTOMER',
      },
    ],
    'Configuration source must register exactly the eleven approved dataset descriptors.',
  );

  assert.equal(
    GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS.length,
    11,
  );

  assert.equal(
    new Set(
      GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS
        .map((entry) => entry.dataset_type),
    ).size,
    11,
    'Configuration descriptor registry must contain eleven unique datasets.',
  );

  const conversionCases = [
    {
      dataset_type: 'CONVERSION_ACTIONS',
      query:
        'SELECT conversion_action.resource_name, conversion_action.id, '
        + 'conversion_action.name, conversion_action.status, '
        + 'conversion_action.type, conversion_action.category, '
        + 'conversion_action.origin, conversion_action.owner_customer, '
        + 'conversion_action.counting_type, conversion_action.primary_for_goal, '
        + 'conversion_action.include_in_conversions_metric, '
        + 'conversion_action.click_through_lookback_window_days, '
        + 'conversion_action.view_through_lookback_window_days, '
        + 'conversion_action.attribution_model_settings.attribution_model, '
        + 'conversion_action.attribution_model_settings.data_driven_model_status, '
        + 'conversion_action.value_settings.default_value, '
        + 'conversion_action.value_settings.default_currency_code, '
        + 'conversion_action.value_settings.always_use_default_value, '
        + 'conversion_action.google_analytics_4_settings.property_id, '
        + 'conversion_action.google_analytics_4_settings.event_name '
        + 'FROM conversion_action',
    },
    {
      dataset_type: 'CUSTOMER_CONVERSION_GOALS',
      query:
        'SELECT customer_conversion_goal.resource_name, '
        + 'customer_conversion_goal.category, '
        + 'customer_conversion_goal.origin, '
        + 'customer_conversion_goal.biddable '
        + 'FROM customer_conversion_goal',
    },
    {
      dataset_type: 'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
      query:
        'SELECT conversion_goal_campaign_config.resource_name, '
        + 'conversion_goal_campaign_config.campaign, '
        + 'conversion_goal_campaign_config.goal_config_level, '
        + 'conversion_goal_campaign_config.custom_conversion_goal, '
        + 'campaign.id, campaign.name, campaign.status '
        + 'FROM conversion_goal_campaign_config',
    },
    {
      dataset_type: 'CAMPAIGN_CONVERSION_GOALS',
      query:
        'SELECT campaign_conversion_goal.resource_name, '
        + 'campaign_conversion_goal.campaign, '
        + 'campaign_conversion_goal.category, '
        + 'campaign_conversion_goal.origin, '
        + 'campaign_conversion_goal.biddable, '
        + 'campaign.id, campaign.name, campaign.status '
        + 'FROM campaign_conversion_goal',
    },
    {
      dataset_type: 'CUSTOM_CONVERSION_GOALS',
      query:
        'SELECT custom_conversion_goal.resource_name, '
        + 'custom_conversion_goal.id, '
        + 'custom_conversion_goal.name, '
        + 'custom_conversion_goal.status, '
        + 'custom_conversion_goal.conversion_actions '
        + 'FROM custom_conversion_goal',
    },
    {
      dataset_type: 'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
      query:
        'SELECT customer.resource_name, customer.id, '
        + 'customer.conversion_tracking_setting.conversion_tracking_status, '
        + 'customer.conversion_tracking_setting.conversion_tracking_id, '
        + 'customer.conversion_tracking_setting.cross_account_conversion_tracking_id, '
        + 'customer.conversion_tracking_setting.google_ads_conversion_customer '
        + 'FROM customer',
    },
  ];

  for (const conversionCase of conversionCases) {
    const matchingDescriptors =
      GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS.filter(
        (entry) => entry.dataset_type === conversionCase.dataset_type,
      );

    assert.equal(
      matchingDescriptors.length,
      1,
      `${conversionCase.dataset_type} must have exactly one descriptor.`,
    );

    assert.equal(
      matchingDescriptors[0].resource_mode,
      GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET[
        conversionCase.dataset_type
      ],
    );

    const conversionContext =
      createGoogleAdsConfigurationJobContext({
        dataset_type: conversionCase.dataset_type,
        customer_id: '1234567890',
      });

    const conversionRequests = [];
    const conversionRawText =
      `[{"results":[{"dataset":"${conversionCase.dataset_type}"}]}]`;
    const conversionRawBytes =
      new TextEncoder().encode(conversionRawText);

    const conversionSource =
      new GoogleAdsConfigurationSource(
        '1234567890',
        async (request) => {
          conversionRequests.push(request);

          return {
            status: 200,
            body: [{
              results: [{
                dataset: conversionCase.dataset_type,
              }],
            }],
            raw_body: conversionRawBytes,
          };
        },
      );

    const conversionResult =
      await conversionSource.collect({
        source_id: 'google-ads-configuration',
        job_key: conversionCase.dataset_type,
        source_context: conversionContext,
      });

    assert.equal(
      conversionResult.result_type,
      'ARTIFACT_PRODUCED',
      `${conversionCase.dataset_type} must produce raw evidence.`,
    );

    assert.equal(
      conversionRequests.length,
      1,
      `${conversionCase.dataset_type} must make exactly one provider request.`,
    );

    assert.equal(
      conversionRequests[0].url,
      'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream',
      `${conversionCase.dataset_type} must use the immutable configured customer.`,
    );

    assert.equal(conversionRequests[0].method, 'POST');

    assert.deepEqual(
      conversionRequests[0].body,
      { query: conversionCase.query },
      `${conversionCase.dataset_type} must send the exact approved GAQL.`,
    );

    assert.deepEqual(
      Buffer.from(conversionResult.bytes),
      Buffer.from(conversionRawBytes),
      `${conversionCase.dataset_type} must preserve response.raw_body exactly.`,
    );

    assert.equal(
      conversionResult.preferred_filename,
      `google-ads-${conversionCase.dataset_type
        .toLowerCase()
        .replace(/_/gu, '-')}.json`,
    );

    assert.equal(
      Object.hasOwn(conversionResult, 'rows'),
      false,
      'Acquisition must preserve raw evidence rather than return normalized rows.',
    );
  }

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
