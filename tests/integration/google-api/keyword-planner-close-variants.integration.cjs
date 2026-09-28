const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);

if (!buildRoot) {
  throw new Error('Expected compiled build root.');
}

const {
  normalizeKeywordPlanner,
} = require(
  path.join(
    buildRoot,
    'main/sources/google-ads/keyword-planner-adapter.js',
  ),
);

const rows = normalizeKeywordPlanner(
  {
    results: [
      {
        text: 'ficus benjamin',
        closeVariants: ['ficus benjamina'],
        keywordMetrics: {
          avgMonthlySearches: '100',
          competition: 'LOW',
          competitionIndex: '20',
          lowTopOfPageBidMicros: null,
          highTopOfPageBidMicros: null,
          monthlySearchVolumes: [],
        },
      },
    ],
  },
  'KWP-FICUS',
  [
    'ficus benjamin',
    'ficus benjamina',
  ],
);

assert.equal(rows.length, 1);

assert.equal(
  rows[0].requested_keyword,
  'ficus benjamin',
  'Existing singular compatibility field must remain stable.',
);

assert.equal(
  rows[0].returned_keyword,
  'ficus benjamin',
);

assert.deepEqual(
  rows[0].close_variants,
  ['ficus benjamina'],
  'Provider closeVariants evidence must survive normalization.',
);

assert.deepEqual(
  rows[0].matched_requested_keywords,
  [
    'ficus benjamin',
    'ficus benjamina',
  ],
  'Every reviewed requested keyword represented by the provider result must remain traceable.',
);

console.log(
  'PASS KWP-CLOSE-VARIANT-001: provider close variants preserve all requested-to-returned keyword mappings',
);
