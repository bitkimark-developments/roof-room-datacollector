const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const requestModulePath = path.join(
  buildRoot,
  'main',
  'sources',
  'google-analytics-4',
  'google-analytics-4-request.js',
);

assert.ok(
  fs.existsSync(requestModulePath),
  'GA4 request module must exist',
);

const {
  collectGoogleAnalytics4Raw,
} = require(requestModulePath);

assert.equal(
  typeof collectGoogleAnalytics4Raw,
  'function',
  'GA4 raw collector must be exported',
);

const enc = new TextEncoder();

const pageResponse = ({
  raw,
  rowCount,
  rows,
}) => ({
  status: 200,
  body: {
    dimensionHeaders: [],
    metricHeaders: [],
    rows,
    rowCount,
  },
  raw_body: enc.encode(raw),
});

const assertDateRange = (body) => {
  assert.deepEqual(body.dateRanges, [{
    startDate: '2026-07-01',
    endDate: '2026-07-31',
  }]);
};

async function main() {
  {
    const calls = [];

    const raw1 =
      '{ "rowCount":250001, "rows":[{"dimensionValues":[{"value":"/a"}]}] }';
    const raw2 =
      '{"rowCount":250001,"rows":[{"dimensionValues":[{"value":"/b"}]}]}';

    const responses = [
      pageResponse({
        raw: raw1,
        rowCount: 250001,
        rows: [{ dimensionValues: [{ value: '/a' }] }],
      }),
      pageResponse({
        raw: raw2,
        rowCount: 250001,
        rows: [{ dimensionValues: [{ value: '/b' }] }],
      }),
    ];

    const requester = async (request) => {
      calls.push(structuredClone(request));
      const response = responses.shift();
      if (!response) throw new Error('unexpected extra request');
      return response;
    };

    const result = await collectGoogleAnalytics4Raw({
      property_id: '123456789',
      dataset_type: 'GA4_CONTENT_PERFORMANCE',
      start_date: '2026-07-01',
      end_date: '2026-07-31',
    }, requester);

    assert.equal(calls.length, 2);

    assert.equal(
      calls[0].url,
      'https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport',
    );
    assert.equal(calls[0].method, 'POST');

    assertDateRange(calls[0].body);

    assert.deepEqual(calls[0].body.dimensions, [
      { name: 'landingPage' },
    ]);

    assert.deepEqual(calls[0].body.metrics, [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'engagementRate' },
      { name: 'keyEvents' },
      { name: 'itemViewEvents' },
      { name: 'addToCarts' },
      { name: 'checkouts' },
      { name: 'ecommercePurchases' },
      { name: 'transactions' },
      { name: 'purchaseRevenue' },
    ]);

    assert.equal(calls[0].body.limit, 250000);
    assert.equal(calls[0].body.offset, 0);

    assert.deepEqual(
      calls[1].body,
      {
        ...calls[0].body,
        offset: 250000,
      },
      'pagination must preserve the exact report shape and advance only offset',
    );

    assert.deepEqual(result, {
      bundle_schema_version: 1,
      dataset_type: 'GA4_CONTENT_PERFORMANCE',
      request: {
        property_id: '123456789',
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        limit: 250000,
      },
      pages: [
        {
          offset: 0,
          raw_body_text: raw1,
        },
        {
          offset: 250000,
          raw_body_text: raw2,
        },
      ],
    });

    assert.notEqual(
      result.pages[0].raw_body_text,
      JSON.stringify({
        dimensionHeaders: [],
        metricHeaders: [],
        rows: [{ dimensionValues: [{ value: '/a' }] }],
        rowCount: 250001,
      }),
      'raw evidence must not be reconstructed from parsed JSON',
    );
  }

  {
    const calls = [];

    const requester = async (request) => {
      calls.push(structuredClone(request));
      return pageResponse({
        raw: '{"rowCount":1,"rows":[{}]}',
        rowCount: 1,
        rows: [{}],
      });
    };

    await collectGoogleAnalytics4Raw({
      property_id: '987654321',
      dataset_type: 'GA4_PAID_FUNNEL',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    }, requester);

    assert.equal(calls.length, 1);

    assert.deepEqual(calls[0].body.dimensions, [
      { name: 'date' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
      { name: 'sessionCampaignId' },
      { name: 'sessionCampaignName' },
      { name: 'landingPage' },
      { name: 'deviceCategory' },
    ]);

    assert.deepEqual(calls[0].body.metrics, [
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'itemViewEvents' },
      { name: 'addToCarts' },
      { name: 'checkouts' },
      { name: 'ecommercePurchases' },
      { name: 'transactions' },
      { name: 'totalPurchasers' },
      { name: 'purchaseRevenue' },
    ]);

    assert.deepEqual(calls[0].body.dimensionFilter, {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: {
                matchType: 'EXACT',
                value: 'google',
              },
            },
          },
          {
            filter: {
              fieldName: 'sessionMedium',
              stringFilter: {
                matchType: 'EXACT',
                value: 'cpc',
              },
            },
          },
        ],
      },
    });

    assert.equal(calls[0].body.limit, 250000);
    assert.equal(calls[0].body.offset, 0);
  }

  {
    let calls = 0;

    await assert.rejects(
      () => collectGoogleAnalytics4Raw({
        property_id: '123456789',
        dataset_type: 'GA4_CONTENT_PERFORMANCE',
        start_date: '2026-07-01',
        end_date: '2026-07-31',
      }, async () => {
        calls += 1;
        return {
          status: 200,
          body: {
            rowCount: 1,
            rows: [],
          },
        };
      }),
      /raw/i,
      'successful GA4 acquisition must fail closed when exact raw bytes are absent',
    );

    assert.equal(
      calls,
      1,
      'missing raw evidence must not trigger a hidden retry',
    );
  }

  {
    let calls = 0;

    await assert.rejects(
      () => collectGoogleAnalytics4Raw({
        property_id: '123456789',
        dataset_type: 'GA4_PAID_FUNNEL',
        start_date: '2026-07-01',
        end_date: '2026-07-31',
      }, async () => {
        calls += 1;
        throw new Error('sentinel provider failure');
      }),
      /sentinel provider failure/,
    );

    assert.equal(
      calls,
      1,
      'GA4 request layer must not retry provider failures implicitly',
    );
  }

  console.log(
    'PASS GA4-REQUEST-001: exact runReport shapes, rowCount pagination, raw evidence preservation, and no hidden retry are locked',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
