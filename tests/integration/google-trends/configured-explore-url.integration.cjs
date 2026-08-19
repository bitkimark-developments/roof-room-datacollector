const assert = require(
  'node:assert/strict',
);
const path = require(
  'node:path',
);

const [buildRoot] =
  process.argv.slice(2);

if (!buildRoot) {
  throw new Error(
    'Expected compiled build root.',
  );
}

const {
  assessGoogleTrendsConfiguredExploreUrl,
  buildGoogleTrendsConfiguredExploreUrl,
  configuredExploreUrlAssessmentPasses,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-configured-explore-url.js',
  ),
);

const expected = {
  queries: [
    'ilk sorgu',
    'ikinci sorgu',
    'üçüncü sorgu',
    'dördüncü sorgu',
    'beşinci sorgu',
  ],
  requested_date_start:
    '2024-08-18',
  requested_date_end:
    '2026-08-17',
  country_code:
    'TR',
};

const configuredUrl =
  buildGoogleTrendsConfiguredExploreUrl(
    expected,
  );

const parsed =
  new URL(
    configuredUrl,
  );

assert.equal(
  parsed.origin,
  'https://trends.google.com',
);
assert.equal(
  parsed.pathname,
  '/trends/explore',
);
assert.deepEqual(
  [
    ...parsed.searchParams.keys(),
  ].sort(),
  [
    'date',
    'geo',
    'q',
  ],
);
assert.equal(
  parsed.searchParams.get(
    'date',
  ),
  '2024-08-18 2026-08-17',
);
assert.equal(
  parsed.searchParams.get(
    'geo',
  ),
  'TR',
);
assert.equal(
  parsed.searchParams.get(
    'q',
  ),
  expected.queries.join(','),
);

console.log(
  'PASS GT-CONFIG-URL-001: provider Explore URL contains only exact date, geo, and ordered query parameters',
);

const exactAssessment =
  assessGoogleTrendsConfiguredExploreUrl(
    configuredUrl,
    expected,
  );

assert.deepEqual(
  exactAssessment,
  {
    parameter_keys: [
      'date',
      'geo',
      'q',
    ],
    parameter_count:
      3,
    query_count:
      5,
    queries_match_exact_order:
      true,
    geography_matches:
      true,
    date_range_matches:
      true,
    origin_matches:
      true,
    path_matches:
      true,
    credentials_absent:
      true,
    fragment_absent:
      true,
  },
);
assert.equal(
  configuredExploreUrlAssessmentPasses(
    exactAssessment,
  ),
  true,
);

const reverseQueryUrl =
  new URL(
    configuredUrl,
  );

reverseQueryUrl.searchParams.set(
  'q',
  [...expected.queries]
    .reverse()
    .join(','),
);

for (const mutation of [
  'https://example.test/trends/explore?date=2024-08-18+2026-08-17&geo=TR&q=ilk+sorgu%2Cikinci+sorgu%2C%C3%BC%C3%A7%C3%BCnc%C3%BC+sorgu%2Cd%C3%B6rd%C3%BCnc%C3%BC+sorgu%2Cbe%C5%9Finci+sorgu',
  'https://trends.google.com/trends/other?date=2024-08-18+2026-08-17&geo=TR&q=ilk+sorgu%2Cikinci+sorgu%2C%C3%BC%C3%A7%C3%BCnc%C3%BC+sorgu%2Cd%C3%B6rd%C3%BCnc%C3%BC+sorgu%2Cbe%C5%9Finci+sorgu',
  `${configuredUrl}&extra=1`,
  `${configuredUrl}&geo=TR`,
  `${configuredUrl}#fragment`,
  configuredUrl.replace(
    'https://',
    'https://user:password@',
  ),
  configuredUrl.replace(
    'geo=TR',
    'geo=US',
  ),
  configuredUrl.replace(
    '2024-08-18',
    '2024-08-19',
  ),
  reverseQueryUrl.toString(),
]) {
  assert.equal(
    configuredExploreUrlAssessmentPasses(
      assessGoogleTrendsConfiguredExploreUrl(
        mutation,
        expected,
      ),
    ),
    false,
  );
}

console.log(
  'PASS GT-CONFIG-URL-002: final URL verification fails closed on origin, path, parameter, query-order, geography, or date drift',
);

for (const invalid of [
  {
    ...expected,
    queries: [],
  },
  {
    ...expected,
    queries: [
      ...expected.queries,
      'altıncı sorgu',
    ],
  },
  {
    ...expected,
    queries: [
      ' virgüllü,sorgu ',
    ],
  },
  {
    ...expected,
    requested_date_start:
      '2024-02-31',
  },
  {
    ...expected,
    requested_date_start:
      '2027-01-01',
  },
  {
    ...expected,
    country_code:
      'tr',
  },
]) {
  assert.throws(
    () =>
      buildGoogleTrendsConfiguredExploreUrl(
        invalid,
      ),
  );
}

console.log(
  'PASS GT-CONFIG-URL-003: invalid query cardinality/content, calendar dates, range order, and country fail before navigation',
);

assert.equal(
  JSON.stringify(
    exactAssessment,
  ).includes(
    expected.queries[0],
  ),
  false,
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    exactAssessment,
    'url',
  ),
  false,
);

console.log(
  'PASS GT-CONFIG-URL-004: safe assessment exposes only counts, keys, and booleans without URLs or query text',
);
