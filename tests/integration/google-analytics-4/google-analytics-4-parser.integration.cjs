const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const parserModulePath = path.join(
  buildRoot,
  'main',
  'sources',
  'google-analytics-4',
  'google-analytics-4-parser.js',
);

assert.ok(
  fs.existsSync(parserModulePath),
  'GA4 parser module must exist',
);

const {
  normalizeGoogleAnalytics4Rows,
} = require(parserModulePath);

assert.equal(
  typeof normalizeGoogleAnalytics4Rows,
  'function',
  'GA4 normalizer must be exported',
);

const bundle = (datasetType, bodies) => ({
  bundle_schema_version: 1,
  dataset_type: datasetType,
  request: {
    property_id: '123456789',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    limit: 250000,
  },
  pages: bodies.map((body, index) => ({
    offset: index * 250000,
    raw_body_text: JSON.stringify(body),
  })),
});

async function main() {
  {
    const result = normalizeGoogleAnalytics4Rows(
      'GA4_CONTENT_PERFORMANCE',
      bundle('GA4_CONTENT_PERFORMANCE', [{
        dimensionHeaders: [
          { name: 'landingPage' },
        ],
        metricHeaders: [
          { name: 'sessions', type: 'TYPE_INTEGER' },
          { name: 'purchaseRevenue', type: 'TYPE_CURRENCY' },
          { name: 'activeUsers', type: 'TYPE_INTEGER' },
          { name: 'engagedSessions', type: 'TYPE_INTEGER' },
          { name: 'engagementRate', type: 'TYPE_FLOAT' },
          { name: 'keyEvents', type: 'TYPE_FLOAT' },
          { name: 'itemViewEvents', type: 'TYPE_INTEGER' },
          { name: 'addToCarts', type: 'TYPE_INTEGER' },
          { name: 'checkouts', type: 'TYPE_INTEGER' },
          { name: 'ecommercePurchases', type: 'TYPE_INTEGER' },
          { name: 'transactions', type: 'TYPE_INTEGER' },
        ],
        rows: [{
          dimensionValues: [
            { value: '(not set)' },
          ],
          metricValues: [
            { value: '0' },
            { value: '1234.56' },
            { value: '9' },
            { value: '5' },
            { value: '0.625' },
            { value: '2' },
            { value: '8' },
            { value: '' },
            { value: '3' },
            { value: '1' },
            { value: '1' },
          ],
        }],
        rowCount: 1,
        metadata: {
          currencyCode: 'TRY',
          timeZone: 'Europe/Istanbul',
        },
      }]),
    );

    assert.deepEqual(result, {
      rows: [{
        landing_page: '(not set)',
        active_users: 9,
        sessions: 0,
        engaged_sessions: 5,
        engagement_rate: 0.625,
        key_events: 2,
        item_view_events: 8,
        add_to_carts: null,
        checkouts: 3,
        ecommerce_purchases: 1,
        transactions: 1,
        purchase_revenue: 1234.56,
      }],
      provider_metadata: {
        currency_code: 'TRY',
        time_zone: 'Europe/Istanbul',
      },
    });

    assert.equal(
      result.rows[0].sessions,
      0,
      'provider numeric zero must remain numeric zero',
    );

    assert.equal(
      result.rows[0].add_to_carts,
      null,
      'missing metric value must remain missing rather than becoming zero',
    );

    assert.equal(
      result.rows[0].landing_page,
      '(not set)',
      'provider-native dimension values must be preserved exactly',
    );
  }

  {
    const result = normalizeGoogleAnalytics4Rows(
      'GA4_CONTENT_PERFORMANCE',
      bundle('GA4_CONTENT_PERFORMANCE', [{
        dimensionHeaders: [
          { name: 'landingPage' },
        ],
        metricHeaders: [
          { name: 'activeUsers', type: 'TYPE_INTEGER' },
          { name: 'sessions', type: 'TYPE_INTEGER' },
          { name: 'engagedSessions', type: 'TYPE_INTEGER' },
          { name: 'engagementRate', type: 'TYPE_FLOAT' },
          { name: 'keyEvents', type: 'TYPE_FLOAT' },
          { name: 'itemViewEvents', type: 'TYPE_INTEGER' },
          { name: 'addToCarts', type: 'TYPE_INTEGER' },
          { name: 'checkouts', type: 'TYPE_INTEGER' },
          { name: 'ecommercePurchases', type: 'TYPE_INTEGER' },
          { name: 'transactions', type: 'TYPE_INTEGER' },
          { name: 'purchaseRevenue', type: 'TYPE_CURRENCY' },
        ],
        rows: [],
        rowCount: 0,
      }]),
    );

    assert.deepEqual(result, {
      rows: [],
      provider_metadata: {
        currency_code: null,
        time_zone: null,
      },
    });
  }

  {
    const result = normalizeGoogleAnalytics4Rows(
      'GA4_PAID_FUNNEL',
      bundle('GA4_PAID_FUNNEL', [{
        dimensionHeaders: [
          { name: 'sessionCampaignName' },
          { name: 'date' },
          { name: 'landingPage' },
          { name: 'sessionSource' },
          { name: 'deviceCategory' },
          { name: 'sessionCampaignId' },
          { name: 'sessionMedium' },
        ],
        metricHeaders: [
          { name: 'purchaseRevenue', type: 'TYPE_CURRENCY' },
          { name: 'sessions', type: 'TYPE_INTEGER' },
          { name: 'engagedSessions', type: 'TYPE_INTEGER' },
          { name: 'itemViewEvents', type: 'TYPE_INTEGER' },
          { name: 'addToCarts', type: 'TYPE_INTEGER' },
          { name: 'checkouts', type: 'TYPE_INTEGER' },
          { name: 'ecommercePurchases', type: 'TYPE_INTEGER' },
          { name: 'transactions', type: 'TYPE_INTEGER' },
          { name: 'totalPurchasers', type: 'TYPE_INTEGER' },
        ],
        rows: [{
          dimensionValues: [
            { value: '(not set)' },
            { value: '20261003' },
            { value: '/products/example' },
            { value: 'google' },
            { value: 'mobile' },
            { value: '(not set)' },
            { value: 'cpc' },
          ],
          metricValues: [
            { value: '99.95' },
            { value: '10' },
            { value: '7' },
            { value: '6' },
            { value: '4' },
            { value: '3' },
            { value: '2' },
            { value: '2' },
            { value: '' },
          ],
        }],
        rowCount: 1,
        metadata: {
          currencyCode: 'TRY',
          timeZone: 'Europe/Istanbul',
        },
      }]),
    );

    assert.deepEqual(result, {
      rows: [{
        performance_date: '2026-10-03',
        session_source: 'google',
        session_medium: 'cpc',
        session_campaign_id: '(not set)',
        session_campaign_name: '(not set)',
        landing_page: '/products/example',
        device_category: 'mobile',
        sessions: 10,
        engaged_sessions: 7,
        item_view_events: 6,
        add_to_carts: 4,
        checkouts: 3,
        ecommerce_purchases: 2,
        transactions: 2,
        total_purchasers: null,
        purchase_revenue: 99.95,
      }],
      provider_metadata: {
        currency_code: 'TRY',
        time_zone: 'Europe/Istanbul',
      },
    });

    assert.equal(result.rows[0].session_source, 'google');
    assert.equal(result.rows[0].session_medium, 'cpc');
    assert.equal(result.rows[0].session_campaign_id, '(not set)');
    assert.equal(result.rows[0].session_campaign_name, '(not set)');

    assert.equal(
      Object.hasOwn(result.rows[0], 'customer_id'),
      false,
      'GA4 normalization must not enrich rows with Google Ads identity',
    );
  }

  {
    assert.throws(
      () => normalizeGoogleAnalytics4Rows(
        'GA4_PAID_FUNNEL',
        bundle('GA4_PAID_FUNNEL', [{
          dimensionHeaders: [
            { name: 'date' },
            { name: 'sessionSource' },
            { name: 'sessionMedium' },
            { name: 'sessionCampaignId' },
            { name: 'sessionCampaignName' },
            { name: 'landingPage' },
            { name: 'deviceCategory' },
          ],
          metricHeaders: [
            { name: 'sessions', type: 'TYPE_INTEGER' },
          ],
          rows: [{
            dimensionValues: [
              { value: '20260230' },
              { value: 'google' },
              { value: 'cpc' },
              { value: '(not set)' },
              { value: '(not set)' },
              { value: '/' },
              { value: 'desktop' },
            ],
            metricValues: [
              { value: '1' },
            ],
          }],
          rowCount: 1,
        }]),
      ),
      /date/i,
      'invalid GA4 calendar dates must be rejected',
    );
  }

  {
    assert.throws(
      () => normalizeGoogleAnalytics4Rows(
        'GA4_CONTENT_PERFORMANCE',
        bundle('GA4_CONTENT_PERFORMANCE', [{
          dimensionHeaders: [
            { name: 'landingPage' },
          ],
          metricHeaders: [
            { name: 'activeUsers', type: 'TYPE_INTEGER' },
          ],
          rows: [{
            dimensionValues: [
              { value: '/' },
            ],
            metricValues: [
              { value: 'not-a-number' },
            ],
          }],
          rowCount: 1,
        }]),
      ),
      /numeric/i,
      'unparseable provider metric values must not silently become zero or null',
    );
  }

  console.log(
    'PASS GA4-PARSER-001: header-driven normalization preserves provider meaning, zero/missing distinction, metadata, and deterministic dates',
  );
}

main();
