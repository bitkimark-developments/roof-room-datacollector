const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');

const {
  GoogleAdsChangeHistorySource,
} = require(
  path.join(
    buildRoot,
    'main/sources/google-ads/google-ads-change-history-source.js',
  ),
);

const calls = [];

const requester = async (request) => {
  calls.push(request);

  return {
    status: 200,
    body: {
      results: [],
    },
    raw_body: new TextEncoder().encode(
      '{"results":[]}',
    ),
  };
};

(async () => {
  const source =
    new GoogleAdsChangeHistorySource(
      '1234567890',
      requester,
    );

  const result =
    await source.collect({
      source_id: 'google-ads-change-history',
      job_key: 'CHANGE_HISTORY',
      source_context: {
        source_id: 'google-ads-change-history',
        dataset_type: 'CHANGE_HISTORY',
        customer_id: '1234567890',
        requested_date_start: '2026-01-01',
        requested_date_end: '2026-01-31',
        dataset_schema_version: 1,
      },
    });

  assert.equal(
    result.result_type,
    'ARTIFACT_PRODUCED',
  );

  assert.equal(
    calls.length,
    1,
  );

  assert.match(
    calls[0].body.query,
    /change_date_time >= '2026-01-01'/u,
  );

  assert.match(
    calls[0].body.query,
    /change_date_time <= '2026-01-31'/u,
  );

  console.log(
    'PASS GOOGLE-ADS-CHANGE-HISTORY-SOURCE-COLLECT-001: source collection produces raw artifact',
  );
})();
