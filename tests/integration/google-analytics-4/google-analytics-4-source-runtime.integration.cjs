const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) {
  throw new Error('Expected compiled build root.');
}

const load = (modulePath) => require(
  path.join(buildRoot, modulePath),
);

const sourceModulePath = path.join(
  buildRoot,
  'main',
  'sources',
  'google-analytics-4',
  'google-analytics-4-source.js',
);

assert.ok(
  fs.existsSync(sourceModulePath),
  'GA4 source module must exist',
);

const {
  GoogleAnalytics4Source,
} = require(sourceModulePath);

assert.equal(
  typeof GoogleAnalytics4Source,
  'function',
  'GoogleAnalytics4Source must be exported',
);

const {
  GoogleApiRuntimeFactory,
} = load(
  'main/sources/google-api/google-api-runtime.js',
);

const {
  createProductionCollectionRuntime,
} = load(
  'main/app/production-collection-runtime.js',
);

const enc = new TextEncoder();

const context = ({
  datasetType = 'GA4_CONTENT_PERFORMANCE',
  jobKey = datasetType,
  sourceId = 'google-analytics-4',
  startDate = '2026-10-01',
  endDate = '2026-10-07',
  includeSessionFilter =
    datasetType === 'GA4_PAID_FUNNEL',
  sessionFilter = {
    session_source: 'google',
    session_medium: 'cpc',
  },
} = {}) => ({
  run_id: 'run-ga4',
  job_id: 'job-ga4',
  attempt_id: 'attempt-ga4',
  attempt_number: 1,
  source_id: sourceId,
  job_key: jobKey,
  query_group_id: null,
  requested_configuration: null,
  source_context: {
    dataset_type: datasetType,
    start_date: startDate,
    end_date: endDate,
    ...(includeSessionFilter
      ? { session_filter: sessionFilter }
      : {}),
  },
});

const responseFor = ({
  raw,
  rowCount = 0,
}) => ({
  status: 200,
  body: {
    rowCount,
    rows: [],
  },
  raw_body: enc.encode(raw),
});

(async () => {
  {
    const calls = [];
    const rawBodies = [
      '{ "rowCount":0, "rows":[] }',
      '{"rowCount":0,"rows":[]}',
    ];

    const source = new GoogleAnalytics4Source(
      '123456789',
      async (request) => {
        calls.push(structuredClone(request));
        const raw = rawBodies.shift();
        if (raw === undefined) {
          throw new Error('unexpected extra GA4 request');
        }
        return responseFor({ raw });
      },
    );

    assert.equal(source.id, 'google-analytics-4');
    assert.equal(source.name, 'Google Analytics 4');
    assert.equal(source.sourceMode, 'OFFICIAL_API');

    assert.deepEqual(
      [...source.datasetTypes],
      [
        'GA4_CONTENT_PERFORMANCE',
        'GA4_PAID_FUNNEL',
      ],
    );

    assert.deepEqual(source.getCapabilities(), {
      requires_browser: false,
      requires_oauth: true,
      may_require_manual_login: true,
      supports_custom_date_range: true,
      supports_direct_export: false,
      supports_api: true,
      supports_resume: true,
      max_concurrency: 1,
    });

    const readiness = await source.checkReadiness();

    assert.equal(readiness.source_id, 'google-analytics-4');
    assert.equal(readiness.readiness_status, 'READY');

    const contentResult = await source.collect(context({
      datasetType: 'GA4_CONTENT_PERFORMANCE',
    }));

    assert.equal(
      contentResult.result_type,
      'ARTIFACT_PRODUCED',
    );
    assert.equal(
      contentResult.media_type,
      'application/json',
    );

    const contentArtifact = JSON.parse(
      new TextDecoder().decode(contentResult.bytes),
    );

    assert.deepEqual(contentArtifact, {
      bundle_schema_version: 1,
      dataset_type: 'GA4_CONTENT_PERFORMANCE',
      request: {
        property_id: '123456789',
        start_date: '2026-10-01',
        end_date: '2026-10-07',
        limit: 250000,
      },
      pages: [{
        offset: 0,
        raw_body_text:
          '{ "rowCount":0, "rows":[] }',
      }],
    });

    assert.equal(
      Object.hasOwn(contentArtifact, 'normalized_rows'),
      false,
      'raw artifact must not be replaced by normalized GA4 output',
    );

    const paidResult = await source.collect(context({
      datasetType: 'GA4_PAID_FUNNEL',
    }));

    assert.equal(
      paidResult.result_type,
      'ARTIFACT_PRODUCED',
    );

    const paidArtifact = JSON.parse(
      new TextDecoder().decode(paidResult.bytes),
    );

    assert.equal(
      paidArtifact.dataset_type,
      'GA4_PAID_FUNNEL',
    );

    assert.equal(calls.length, 2);

    assert.equal(
      calls[0].url,
      'https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport',
    );

    assert.equal(
      calls[1].body.dimensionFilter
        .andGroup.expressions[0]
        .filter.stringFilter.value,
      'google',
    );

    assert.equal(
      calls[1].body.dimensionFilter
        .andGroup.expressions[1]
        .filter.stringFilter.value,
      'cpc',
    );

    const callsBeforeInvalidFilter = calls.length;

    const missingPaidFilter = await source.collect(context({
      datasetType: 'GA4_PAID_FUNNEL',
      includeSessionFilter: false,
    }));

    assert.equal(
      missingPaidFilter.result_type,
      'FAILED',
    );
    assert.equal(
      missingPaidFilter.error_code,
      'SOURCE_CONFIGURATION_INVALID',
    );

    const wrongPaidFilter = await source.collect(context({
      datasetType: 'GA4_PAID_FUNNEL',
      sessionFilter: {
        session_source: 'bing',
        session_medium: 'cpc',
      },
    }));

    assert.equal(
      wrongPaidFilter.result_type,
      'FAILED',
    );
    assert.equal(
      wrongPaidFilter.error_code,
      'SOURCE_CONFIGURATION_INVALID',
    );

    const contentWithPaidFilter = await source.collect(context({
      datasetType: 'GA4_CONTENT_PERFORMANCE',
      includeSessionFilter: true,
    }));

    assert.equal(
      contentWithPaidFilter.result_type,
      'FAILED',
    );
    assert.equal(
      contentWithPaidFilter.error_code,
      'SOURCE_CONFIGURATION_INVALID',
    );

    assert.equal(
      calls.length,
      callsBeforeInvalidFilter,
      'invalid immutable GA4 filter context must fail before provider interaction',
    );

    const callsBeforeInvalid = calls.length;

    const unknownDataset = await source.collect(context({
      datasetType: 'GA4_UNKNOWN_DATASET',
    }));

    assert.equal(
      unknownDataset.result_type,
      'FAILED',
    );
    assert.equal(
      unknownDataset.error_code,
      'SOURCE_CONFIGURATION_INVALID',
    );

    const wrongJobKey = await source.collect(context({
      datasetType: 'GA4_CONTENT_PERFORMANCE',
      jobKey: 'GA4_PAID_FUNNEL',
    }));

    assert.equal(
      wrongJobKey.result_type,
      'FAILED',
    );
    assert.equal(
      wrongJobKey.error_code,
      'SOURCE_CONFIGURATION_INVALID',
    );

    const wrongSource = await source.collect(context({
      sourceId: 'other-source',
    }));

    assert.equal(
      wrongSource.result_type,
      'FAILED',
    );
    assert.equal(
      wrongSource.error_code,
      'SOURCE_CONFIGURATION_INVALID',
    );

    assert.equal(
      calls.length,
      callsBeforeInvalid,
      'invalid immutable context must fail before provider interaction',
    );
  }

  {
    const unconfigured = new GoogleAnalytics4Source(
      null,
      async () => {
        throw new Error(
          'unconfigured GA4 source must not call provider',
        );
      },
    );

    const readiness = await unconfigured.checkReadiness();

    assert.equal(
      readiness.readiness_status,
      'NOT_CONFIGURED',
    );

    const result = await unconfigured.collect(context());

    assert.equal(result.result_type, 'FAILED');
    assert.equal(
      result.error_code,
      'CONFIGURATION_REQUIRED',
    );
  }

  {
    const requestedSourceIds = [];

    const repository = {
      getSourceConnection: (workspaceId, sourceId) => {
        assert.equal(workspaceId, 'ws-ga4');
        requestedSourceIds.push(sourceId);

        if (sourceId !== 'google-analytics-4') {
          return null;
        }

        return {
          connection_id: 'ga4-connection',
          workspace_id: workspaceId,
          source_id: 'google-analytics-4',
          credential_ref: 'ga4-credential',
          safe_metadata: {
            property_id: '123456789',
          },
          created_at: '2026-10-03T00:00:00.000Z',
          updated_at: '2026-10-03T00:00:00.000Z',
        };
      },
      upsertSourceConnection: () => {
        throw new Error(
          'reauthorization update not expected in factory construction test',
        );
      },
    };

    const credentialStore = {
      hasCredential: async () => false,
      readCredential: async () => {
        throw new Error(
          'credential must remain lazy until collection',
        );
      },
      writeCredential: async () => {},
      deleteCredential: async () => {},
    };

    const factory = new GoogleApiRuntimeFactory(
      repository,
      credentialStore,
      async () => {
        throw new Error(
          'provider requester must remain lazy until collection',
        );
      },
    );

    assert.equal(
      typeof factory.createGoogleAnalytics4Source,
      'function',
      'GoogleApiRuntimeFactory must expose createGoogleAnalytics4Source',
    );

    const source = factory.createGoogleAnalytics4Source({
      workspace_id: 'ws-ga4',
    });

    assert.equal(source.id, 'google-analytics-4');

    assert.deepEqual(
      requestedSourceIds,
      ['google-analytics-4'],
      'GA4 factory must resolve only the dedicated GA4 Workspace connection',
    );
  }

  {
    const credentialStore = {
      hasCredential: async () => false,
      readCredential: async () => '',
      writeCredential: async () => {},
      deleteCredential: async () => {},
    };

    const missingConnectionFactory =
      new GoogleApiRuntimeFactory(
        {
          getSourceConnection: () => null,
          upsertSourceConnection: () => {
            throw new Error('not expected');
          },
        },
        credentialStore,
      );

    assert.throws(
      () => missingConnectionFactory
        .createGoogleAnalytics4Source({
          workspace_id: 'ws-ga4',
        }),
      /connection/i,
      'GA4 factory must require its dedicated Workspace connection',
    );

    const missingCredentialFactory =
      new GoogleApiRuntimeFactory(
        {
          getSourceConnection: (
            workspaceId,
            sourceId,
          ) => ({
            connection_id: 'ga4-connection',
            workspace_id: workspaceId,
            source_id: sourceId,
            credential_ref: null,
            safe_metadata: {
              property_id: '123456789',
            },
            created_at: '2026-10-03T00:00:00.000Z',
            updated_at: '2026-10-03T00:00:00.000Z',
          }),
          upsertSourceConnection: () => {
            throw new Error('not expected');
          },
        },
        credentialStore,
      );

    assert.throws(
      () => missingCredentialFactory
        .createGoogleAnalytics4Source({
          workspace_id: 'ws-ga4',
        }),
      /credential/i,
      'GA4 factory must require an OAuth credential ref',
    );

    const invalidPropertyFactory =
      new GoogleApiRuntimeFactory(
        {
          getSourceConnection: (
            workspaceId,
            sourceId,
          ) => ({
            connection_id: 'ga4-connection',
            workspace_id: workspaceId,
            source_id: sourceId,
            credential_ref: 'ga4-credential',
            safe_metadata: {
              property_id: 'properties/123456789',
            },
            created_at: '2026-10-03T00:00:00.000Z',
            updated_at: '2026-10-03T00:00:00.000Z',
          }),
          upsertSourceConnection: () => {
            throw new Error('not expected');
          },
        },
        credentialStore,
      );

    assert.throws(
      () => invalidPropertyFactory
        .createGoogleAnalytics4Source({
          workspace_id: 'ws-ga4',
        }),
      /property/i,
      'GA4 runtime must reject non-canonical Property ID metadata',
    );
  }

  {
    const requestedSourceIds = [];

    const repository = {
      getRun: () => ({
        workspace_id: 'ws-ga4-runtime',
      }),
      getSourceConnection: (
        workspaceId,
        sourceId,
      ) => {
        assert.equal(
          workspaceId,
          'ws-ga4-runtime',
        );

        requestedSourceIds.push(sourceId);

        if (sourceId !== 'google-analytics-4') {
          return null;
        }

        return {
          connection_id: 'ga4-runtime-connection',
          workspace_id: workspaceId,
          source_id: 'google-analytics-4',
          credential_ref: 'ga4-runtime-credential',
          safe_metadata: {
            property_id: '123456789',
          },
          created_at: '2026-10-03T00:00:00.000Z',
          updated_at: '2026-10-03T00:00:00.000Z',
        };
      },
      upsertSourceConnection: () => {
        throw new Error(
          'reauthorization not expected',
        );
      },
    };

    const runtime = createProductionCollectionRuntime({
      repository,
      credentialStore: {
        hasCredential: async () => false,
        readCredential: async () => {
          throw new Error(
            'invalid context must fail before credential read',
          );
        },
        writeCredential: async () => {},
        deleteCredential: async () => {},
      },
      directories: {
        app_data_root: '/tmp',
        config: '/tmp',
        data: '/tmp',
        runs: '/tmp',
        database: '/tmp',
        browser_profiles: '/tmp',
        logs: '/tmp',
        public_downloads: '/tmp',
      },
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
          supports_resume: false,
          max_concurrency: 1,
        }),
        checkReadiness: async () => ({
          source_id: 'google-trends',
          readiness_status: 'READY',
          checked_at: new Date().toISOString(),
          message: null,
        }),
        collect: async () => ({
          result_type: 'FAILED',
          error_code: 'TEST_ONLY',
          message: null,
        }),
      },
    });

    const ga4Sources = runtime.source_registry
      .list()
      .filter(
        (source) =>
          source.id === 'google-analytics-4',
      );

    assert.equal(
      ga4Sources.length,
      1,
      'GA4 source must be registered exactly once',
    );

    const ga4RuntimeSource = ga4Sources[0];

    assert.equal(
      ga4RuntimeSource.sourceMode,
      'OFFICIAL_API',
    );

    assert.deepEqual(
      [...ga4RuntimeSource.datasetTypes],
      [
        'GA4_CONTENT_PERFORMANCE',
        'GA4_PAID_FUNNEL',
      ],
    );

    assert.equal(
      runtime.validator_registry
        .get('google-analytics-4')
        .constructor.name,
      'GoogleAnalytics4Validator',
      'GA4 validator must be registered exactly once',
    );

    const invalidResolution =
      await ga4RuntimeSource.collect({
        run_id: 'run-ga4-runtime',
        job_id: 'job-ga4-runtime',
        attempt_id: 'attempt-ga4-runtime',
        attempt_number: 1,
        source_id: 'google-analytics-4',
        job_key: 'GA4_UNKNOWN_DATASET',
        query_group_id: null,
        requested_configuration: null,
        source_context: {
          dataset_type: 'GA4_UNKNOWN_DATASET',
          start_date: '2026-10-01',
          end_date: '2026-10-07',
        },
      });

    assert.equal(
      invalidResolution.result_type,
      'FAILED',
    );

    assert.equal(
      invalidResolution.error_code,
      'SOURCE_CONFIGURATION_INVALID',
    );

    assert.deepEqual(
      requestedSourceIds,
      ['google-analytics-4'],
      'production GA4 lazy source must resolve only its dedicated connection',
    );
  }

  console.log(
    'PASS GA4-SOURCE-RUNTIME-001: source dispatch, dedicated Workspace resolution, raw bundle artifact ownership, and single runtime registration are locked',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
