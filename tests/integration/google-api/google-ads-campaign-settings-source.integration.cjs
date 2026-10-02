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
  GOOGLE_ADS_CONFIGURATION_DATASET_TYPES,
  GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET,
} = require(path.join(
  buildRoot,
  'shared/google-ads-configuration.js',
));

const campaignSettingsDescriptors =
  GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS.filter(
    (entry) => [
      'CAMPAIGN_SETTINGS',
      'CAMPAIGN_BUDGETS',
      'CAMPAIGN_TARGETING_CRITERIA',
    ].includes(entry.dataset_type),
  );

assert.deepEqual(
  campaignSettingsDescriptors.map((entry) => ({
    dataset_type: entry.dataset_type,
    resource_mode: entry.resource_mode,
  })),
  [
    {
      dataset_type: 'CAMPAIGN_SETTINGS',
      resource_mode: 'CAMPAIGN',
    },
    {
      dataset_type: 'CAMPAIGN_BUDGETS',
      resource_mode: 'CAMPAIGN_BUDGET',
    },
    {
      dataset_type: 'CAMPAIGN_TARGETING_CRITERIA',
      resource_mode: 'CAMPAIGN_CRITERION',
    },
  ],
  'Configuration source must register the three Campaign Settings datasets.',
);

assert.equal(
  GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS.length,
  14,
  'Configuration source must expose exactly fourteen dataset descriptors.',
);

assert.equal(
  new Set(
    GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS
      .map((entry) => entry.dataset_type),
  ).size,
  14,
  'Configuration descriptor registry must contain fourteen unique datasets.',
);

assert.deepEqual(
  GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS
    .map((entry) => entry.dataset_type),
  [...GOOGLE_ADS_CONFIGURATION_DATASET_TYPES],
  'Descriptor order must match the shared approved dataset order.',
);

(async () => {
  for (const datasetType of [
    'CAMPAIGN_SETTINGS',
    'CAMPAIGN_BUDGETS',
  ]) {
    const context = createGoogleAdsConfigurationJobContext({
      dataset_type: datasetType,
      customer_id: '1234567890',
    });

    assert.equal(
      context.resource_mode,
      GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET[datasetType],
    );

    const requests = [];
    const rawBytes = new TextEncoder().encode(
      `[{"results":[{"dataset":"${datasetType}"}]}]`,
    );

    const source = new GoogleAdsConfigurationSource(
      '1234567890',
      async (request) => {
        requests.push(request);

        return {
          status: 200,
          body: [{
            results: [{
              dataset: datasetType,
            }],
          }],
          raw_body: rawBytes,
        };
      },
    );

    const result = await source.collect({
      source_id: 'google-ads-configuration',
      job_key: datasetType,
      source_context: context,
    });

    assert.equal(
      result.result_type,
      'ARTIFACT_PRODUCED',
      `${datasetType} must produce raw evidence.`,
    );

    assert.equal(
      requests.length,
      1,
      `${datasetType} must remain a single SearchStream request.`,
    );

    assert.equal(
      requests[0].url,
      'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream',
    );
    assert.equal(requests[0].method, 'POST');
    assert.equal(typeof requests[0].body.query, 'string');
    assert.equal(requests[0].body.query.length > 0, true);

    assert.deepEqual(
      Buffer.from(result.bytes),
      Buffer.from(rawBytes),
      `${datasetType} must preserve response.raw_body exactly.`,
    );

    assert.equal(
      result.preferred_filename,
      `google-ads-${datasetType
        .toLowerCase()
        .replace(/_/gu, '-')}.json`,
    );

    assert.equal(
      Object.hasOwn(result, 'rows'),
      false,
      'Acquisition must preserve raw evidence rather than return normalized rows.',
    );
  }

  const targetingContext = createGoogleAdsConfigurationJobContext({
    dataset_type: 'CAMPAIGN_TARGETING_CRITERIA',
    customer_id: '1234567890',
  });

  const targetingSearchBody = [{
    results: [
      {
        campaignCriterion: {
          type: 'LOCATION',
          location: {
            geoTargetConstant: 'geoTargetConstants/2392',
          },
        },
      },
      {
        campaignCriterion: {
          type: 'DEVICE',
          device: {
            type: 'MOBILE',
          },
        },
      },
      {
        campaignCriterion: {
          type: 'LOCATION',
          location: {
            geoTargetConstant: 'geoTargetConstants/2392',
          },
        },
      },
      {
        campaignCriterion: {
          type: 'LOCATION',
          location: {
            geoTargetConstant: 'geoTargetConstants/2124',
          },
        },
      },
    ],
  }];

  const targetingSearchRaw = new TextEncoder().encode(
    '[{"results":[{"campaignCriterion":{"type":"LOCATION","location":{"geoTargetConstant":"geoTargetConstants/2392"}}},{"campaignCriterion":{"type":"DEVICE","device":{"type":"MOBILE"}}},{"campaignCriterion":{"type":"LOCATION","location":{"geoTargetConstant":"geoTargetConstants/2392"}}},{"campaignCriterion":{"type":"LOCATION","location":{"geoTargetConstant":"geoTargetConstants/2124"}}}]}]',
  );

  const geoBody = {
    geoTargetConstantSuggestions: [
      {
        geoTargetConstant: {
          resourceName: 'geoTargetConstants/2392',
          id: '2392',
          name: 'Turkey',
        },
      },
      {
        geoTargetConstant: {
          resourceName: 'geoTargetConstants/2124',
          id: '2124',
          name: 'Canada',
        },
      },
    ],
  };

  const geoRaw = new TextEncoder().encode(
    '{"geoTargetConstantSuggestions":[{"geoTargetConstant":{"resourceName":"geoTargetConstants/2392","id":"2392","name":"Turkey"}},{"geoTargetConstant":{"resourceName":"geoTargetConstants/2124","id":"2124","name":"Canada"}}]}',
  );

  const targetingRequests = [];

  const targetingSource = new GoogleAdsConfigurationSource(
    '1234567890',
    async (request) => {
      targetingRequests.push(request);

      if (request.url.endsWith('/googleAds:searchStream')) {
        return {
          status: 200,
          body: targetingSearchBody,
          raw_body: targetingSearchRaw,
        };
      }

      if (request.url.endsWith('/geoTargetConstants:suggest')) {
        return {
          status: 200,
          body: geoBody,
          raw_body: geoRaw,
        };
      }

      throw new Error(`Unexpected provider URL: ${request.url}`);
    },
  );

  const targetingResult = await targetingSource.collect({
    source_id: 'google-ads-configuration',
    job_key: 'CAMPAIGN_TARGETING_CRITERIA',
    source_context: targetingContext,
  });

  assert.equal(targetingResult.result_type, 'ARTIFACT_PRODUCED');

  assert.equal(
    targetingRequests.length,
    2,
    'Targeting with LOCATION evidence must make SearchStream plus one geo resolver request.',
  );

  assert.equal(
    targetingRequests[0].url,
    'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream',
  );

  assert.equal(
    targetingRequests[1].url,
    'https://googleads.googleapis.com/v25/geoTargetConstants:suggest',
  );

  assert.deepEqual(
    targetingRequests[1].body,
    {
      geoTargets: {
        geoTargetConstants: [
          'geoTargetConstants/2392',
          'geoTargetConstants/2124',
        ],
      },
    },
    'Resolver request must use unique observed LOCATION refs in first-seen order.',
  );

  const targetingBundle = JSON.parse(
    Buffer.from(targetingResult.bytes).toString('utf8'),
  );

  assert.equal(targetingBundle.bundle_schema_version, 1);

  assert.deepEqual(targetingBundle.parts, [
    {
      kind: 'CAMPAIGN_CRITERIA_SEARCH_STREAM',
      raw_body_base64:
        Buffer.from(targetingSearchRaw).toString('base64'),
    },
    {
      kind: 'GEO_TARGET_CONSTANT_SUGGESTIONS',
      requested_resource_names: [
        'geoTargetConstants/2392',
        'geoTargetConstants/2124',
      ],
      raw_body_base64: Buffer.from(geoRaw).toString('base64'),
    },
  ]);

  const noLocationRequests = [];
  const noLocationRaw = new TextEncoder().encode(
    '[{"results":[{"campaignCriterion":{"type":"DEVICE","device":{"type":"DESKTOP"}}}]}]',
  );

  const noLocationSource = new GoogleAdsConfigurationSource(
    '1234567890',
    async (request) => {
      noLocationRequests.push(request);

      if (!request.url.endsWith('/googleAds:searchStream')) {
        throw new Error(
          'Geo resolver must not run when no LOCATION refs are observed.',
        );
      }

      return {
        status: 200,
        body: [{
          results: [{
            campaignCriterion: {
              type: 'DEVICE',
              device: {
                type: 'DESKTOP',
              },
            },
          }],
        }],
        raw_body: noLocationRaw,
      };
    },
  );

  const noLocationResult = await noLocationSource.collect({
    source_id: 'google-ads-configuration',
    job_key: 'CAMPAIGN_TARGETING_CRITERIA',
    source_context: targetingContext,
  });

  assert.equal(noLocationResult.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(noLocationRequests.length, 1);

  const noLocationBundle = JSON.parse(
    Buffer.from(noLocationResult.bytes).toString('utf8'),
  );

  assert.deepEqual(noLocationBundle.parts, [
    {
      kind: 'CAMPAIGN_CRITERIA_SEARCH_STREAM',
      raw_body_base64: Buffer.from(noLocationRaw).toString('base64'),
    },
  ]);

  let missingRawRequestCount = 0;

  const missingRawSource = new GoogleAdsConfigurationSource(
    '1234567890',
    async () => {
      missingRawRequestCount += 1;

      return {
        status: 200,
        body: targetingSearchBody,
      };
    },
  );

  const missingRawResult = await missingRawSource.collect({
    source_id: 'google-ads-configuration',
    job_key: 'CAMPAIGN_TARGETING_CRITERIA',
    source_context: targetingContext,
  });

  assert.equal(
    missingRawResult.result_type,
    'FAILED',
    'Targeting SearchStream must fail when exact provider raw bytes are unavailable.',
  );

  assert.equal(
    missingRawRequestCount,
    1,
    'Missing SearchStream raw bytes must fail before geo resolver invocation.',
  );

  const resolverHttpRequests = [];

  const resolverHttpFailureSource = new GoogleAdsConfigurationSource(
    '1234567890',
    async (request) => {
      resolverHttpRequests.push(request);

      if (request.url.endsWith('/googleAds:searchStream')) {
        return {
          status: 200,
          body: targetingSearchBody,
          raw_body: targetingSearchRaw,
        };
      }

      return {
        status: 429,
        body: {
          error: {
            status: 'RESOURCE_EXHAUSTED',
          },
        },
        raw_body: new TextEncoder().encode(
          '{"error":{"status":"RESOURCE_EXHAUSTED"}}',
        ),
      };
    },
  );

  const resolverHttpFailureResult =
    await resolverHttpFailureSource.collect({
      source_id: 'google-ads-configuration',
      job_key: 'CAMPAIGN_TARGETING_CRITERIA',
      source_context: targetingContext,
    });

  assert.equal(
    resolverHttpFailureResult.result_type,
    'FAILED',
    'Geo resolver HTTP failure must fail the targeting Attempt.',
  );

  assert.equal(
    resolverHttpRequests.length,
    2,
    'Geo resolver HTTP failure occurs only after successful SearchStream evidence.',
  );

  assert.equal(
    Object.hasOwn(resolverHttpFailureResult, 'bytes'),
    false,
    'Resolver failure must not expose a partial candidate artifact.',
  );

  const resolverMissingRawRequests = [];

  const resolverMissingRawSource = new GoogleAdsConfigurationSource(
    '1234567890',
    async (request) => {
      resolverMissingRawRequests.push(request);

      if (request.url.endsWith('/googleAds:searchStream')) {
        return {
          status: 200,
          body: targetingSearchBody,
          raw_body: targetingSearchRaw,
        };
      }

      return {
        status: 200,
        body: geoBody,
      };
    },
  );

  const resolverMissingRawResult =
    await resolverMissingRawSource.collect({
      source_id: 'google-ads-configuration',
      job_key: 'CAMPAIGN_TARGETING_CRITERIA',
      source_context: targetingContext,
    });

  assert.equal(
    resolverMissingRawResult.result_type,
    'FAILED',
    'Geo resolver evidence without exact raw bytes must fail the targeting Attempt.',
  );

  assert.equal(
    resolverMissingRawRequests.length,
    2,
  );

  assert.equal(
    Object.hasOwn(resolverMissingRawResult, 'bytes'),
    false,
    'Missing resolver raw bytes must not expose a partial candidate artifact.',
  );

  console.log(
    'PASS GOOGLE-ADS-CAMPAIGN-SETTINGS-SOURCE-001: fourteen descriptors, direct Campaign/Budget raw acquisition, and lossless conditional targeting multi-request acquisition are registered',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
