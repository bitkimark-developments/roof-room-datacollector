const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const requestModule = require(
  path.join(
    buildRoot,
    'main/sources/google-ads/google-ads-change-history-request.js',
  ),
);

const {
  requestGoogleAdsChangeHistoryRaw,
} = requestModule;

const calls = [];

const requester = async (request) => {
  calls.push(request);

  return {
    status: 200,
    body: {
      results: [
        {
          change_event: {
            change_date_time: '2026-01-01T10:00:00Z',
          },
        },
      ],
    },
    raw_body: new TextEncoder().encode(
      '{"results":[{"change_event":{}}]}',
    ),
  };
};

(async () => {
const result =
  await requestGoogleAdsChangeHistoryRaw(
    {
      customer_id: '1234567890',
      query: 'SELECT change_event.change_date_time FROM change_event',
    },
    requester,
  );

assert.equal(
  calls.length,
  1,
);

assert.equal(
  calls[0].method,
  'POST',
);

assert.equal(
  calls[0].url,
  'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream',
);

assert.deepEqual(
  calls[0].body,
  {
    query:
      'SELECT change_event.change_date_time FROM change_event',
  },
);

assert.ok(
  result.body,
);

assert.ok(
  result.raw_bytes instanceof Uint8Array,
);

console.log(
  'PASS GOOGLE-ADS-CHANGE-HISTORY-RAW-REQUEST-001: searchStream request and raw evidence preservation are locked',
);
})();
