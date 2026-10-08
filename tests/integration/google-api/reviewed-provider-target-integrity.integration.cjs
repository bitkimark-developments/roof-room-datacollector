const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (buildRoot === undefined) {
  throw new Error('Expected compiled build root.');
}

const load = (file) =>
  require(path.join(buildRoot, file));

const {
  GoogleAdsSearchTermsSource,
  GoogleKeywordPlannerSource,
} = load('main/sources/google-ads/google-ads-sources.js');

const {
  GoogleAnalytics4Source,
} = load('main/sources/google-analytics-4/google-analytics-4-source.js');

const {
  GoogleSearchConsoleSource,
  GoogleSearchConsoleQuerySource,
} = load('main/sources/google-search-console/google-search-console-source.js');

const {
  GoogleAdsChangeHistorySource,
} = load('main/sources/google-ads/google-ads-change-history-source.js');

const encoder = new TextEncoder();

const cases = [
  {
    name: 'search terms',
    Source: GoogleAdsSearchTermsSource,
    target: '1234567890',
    changed: '9999999999',
    context: {
      source_id: 'google-ads-search-terms',
      job_key: 'search-terms-1',
      source_context: {
        task_id: 'google-ads-search-terms',
        source_id: 'google-ads-search-terms',
        source_mode: 'search_term_view',
        campaign_type: 'SEARCH',
        customer_id: '1234567890',
        requested_date_start: '2026-09-01',
        requested_date_end: '2026-09-30',
      },
    },
    response: { status: 200, body: [] },
  },
  {
    name: 'keyword planner',
    Source: GoogleKeywordPlannerSource,
    target: '1234567890',
    changed: '9999999999',
    context: {
      source_id: 'google-keyword-planner',
      source_context: {
        task_id: 'keyword-planner-historical-metrics',
        source_id: 'google-keyword-planner',
        source_mode: 'OFFICIAL_API',
        customer_id: '1234567890',
        group_id: 'growth-core',
        group_name: 'Growth Core',
        keywords: ['growth keyword'],
        requested_date_start: '2025-10-01',
        requested_date_end: '2026-09-30',
        country_code: 'TR',
        language_code: 'tr',
        keyword_plan_network: 'GOOGLE_SEARCH',
      },
    },
    response: {
      status: 200,
      body: {
        results: [{
          text: 'growth keyword',
          keywordMetrics: null,
        }],
      },
    },
  },
  {
    name: 'GA4',
    Source: GoogleAnalytics4Source,
    target: '987654321',
    changed: '111111111',
    context: {
      source_id: 'google-analytics-4',
      job_key: 'GA4_CONTENT_PERFORMANCE',
      source_context: {
        dataset_type: 'GA4_CONTENT_PERFORMANCE',
        property_id: '987654321',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
      },
    },
    response: {
      status: 200,
      body: { rowCount: 0, rows: [] },
      raw_body: encoder.encode('{"rowCount":0,"rows":[]}'),
    },
  },
  {
    name: 'GSC query',
    Source: GoogleSearchConsoleQuerySource,
    target: 'sc-domain:example.com',
    changed: 'sc-domain:changed.example',
    context: {
      source_id: 'google-search-console-query',
      source_context: {
        site_url: 'sc-domain:example.com',
        requested_date_start: '2026-09-01',
        requested_date_end: '2026-09-30',
      },
    },
    response: { status: 200, body: { rows: [] } },
  },
  {
    name: 'GSC query page',
    Source: GoogleSearchConsoleSource,
    target: 'sc-domain:example.com',
    changed: 'sc-domain:changed.example',
    context: {
      source_id: 'google-search-console-query-page',
      source_context: {
        site_url: 'sc-domain:example.com',
        requested_date_start: '2026-09-01',
        requested_date_end: '2026-09-30',
      },
    },
    response: { status: 200, body: { rows: [] } },
  },
  {
    name: 'change history',
    Source: GoogleAdsChangeHistorySource,
    target: '1234567890',
    changed: '9999999999',
    context: {
      source_id: 'google-ads-change-history',
      job_key: 'CHANGE_HISTORY',
      source_context: {
        source_id: 'google-ads-change-history',
        dataset_type: 'CHANGE_HISTORY',
        customer_id: '1234567890',
        requested_date_start: '2026-09-01',
        requested_date_end: '2026-09-30',
        dataset_schema_version: 1,
      },
    },
    response: {
      status: 200,
      body: { results: [] },
      raw_body: encoder.encode('{"results":[]}'),
    },
  },
];

(async () => {
  for (const spec of cases) {
    const matchingRequests = [];
    const matching =
      await new spec.Source(
        spec.target,
        async (request) => {
          matchingRequests.push(request);
          return spec.response;
        },
      ).collect(spec.context);

    assert.equal(
      matching.result_type,
      'ARTIFACT_PRODUCED',
      spec.name,
    );
    assert.equal(
      matchingRequests.length,
      1,
      spec.name,
    );

    const mismatchRequests = [];
    const mismatch =
      await new spec.Source(
        spec.changed,
        async (request) => {
          mismatchRequests.push(request);
          return spec.response;
        },
      ).collect(spec.context);

    assert.equal(
      mismatch.result_type,
      'FAILED',
      spec.name,
    );
    assert.equal(
      mismatch.error_code,
      'SOURCE_CONFIGURATION_INVALID',
      spec.name,
    );
    assert.equal(
      mismatchRequests.length,
      0,
      spec.name,
    );
  }

  console.log(
    'PASS REVIEWED-PROVIDER-TARGET-001: reviewed provider identity survives execution and Workspace drift fails closed before provider interaction',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
