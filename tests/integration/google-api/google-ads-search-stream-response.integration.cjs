const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const { flattenGoogleAdsSearchStream } = require(path.join(
  buildRoot,
  'main/sources/google-ads/search-stream-response.js',
));

// Official-schema-shaped development mocks. These are not live-provider fixtures.
const oneEnvelope = [
  {
    results: [
      {
        campaign: { id: '101', name: 'Search One' },
        metrics: { impressions: '0', costMicros: '0' },
        segments: { date: '2026-09-01' },
      },
      {
        campaign: { id: '102', name: 'Search Two' },
        metrics: { impressions: '12', costMicros: '2500000' },
        segments: { date: '2026-09-02' },
      },
    ],
    fieldMask: 'campaign.id,campaign.name,metrics.impressions,metrics.cost_micros,segments.date',
    requestId: 'sanitized-request-1',
  },
];
const oneEnvelopeSnapshot = structuredClone(oneEnvelope);
Object.freeze(oneEnvelope);
Object.freeze(oneEnvelope[0]);
Object.freeze(oneEnvelope[0].results);
Object.freeze(oneEnvelope[0].results[0]);
Object.freeze(oneEnvelope[0].results[0].campaign);
Object.freeze(oneEnvelope[0].results[0].metrics);
Object.freeze(oneEnvelope[0].results[0].segments);

const flattenedOne = flattenGoogleAdsSearchStream(oneEnvelope);
assert.deepEqual(flattenedOne, oneEnvelopeSnapshot[0].results);
assert.notStrictEqual(flattenedOne, oneEnvelope[0].results, 'the flattened result array must be fresh');
assert.deepEqual(oneEnvelope, oneEnvelopeSnapshot, 'flattening must not mutate canonical raw JSON');

const multiEnvelope = [
  { results: [{ adGroup: { id: '201' }, segments: { date: '2026-09-03' } }] },
  { results: [{ adGroup: { id: '202' }, segments: { date: '2026-09-04' } }] },
];
assert.deepEqual(flattenGoogleAdsSearchStream(multiEnvelope), [
  { adGroup: { id: '201' }, segments: { date: '2026-09-03' } },
  { adGroup: { id: '202' }, segments: { date: '2026-09-04' } },
]);

assert.deepEqual(flattenGoogleAdsSearchStream([]), []);
assert.deepEqual(flattenGoogleAdsSearchStream([{}]), []);
assert.deepEqual(flattenGoogleAdsSearchStream([{ results: [] }, {}]), []);

assert.throws(
  () => flattenGoogleAdsSearchStream({ results: [] }),
  /top-level array/u,
  'a non-stream top-level object must fail closed',
);
assert.throws(
  () => flattenGoogleAdsSearchStream([{ results: {} }]),
  /results must be an array/u,
  'a present non-array results field must fail closed',
);
assert.throws(
  () => flattenGoogleAdsSearchStream([{ results: [null] }]),
  /result row must be an object/u,
  'non-row values inside results must fail closed',
);

console.log(
  'PASS GOOGLE-ADS-SEARCH-STREAM-001: canonical envelopes flatten without mutating nested camelCase provider rows and malformed shapes fail closed',
);
