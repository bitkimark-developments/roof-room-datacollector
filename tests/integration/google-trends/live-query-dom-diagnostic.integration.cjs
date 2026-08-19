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
  LIVE_QUERY_DOM_DIAGNOSTIC_CONFIRMATION_FLAG,
  classifyQueryInputState,
  parseLiveQueryDomDiagnosticArguments,
  requireLiveQueryDomDiagnosticConfirmation,
  sanitizeQueryDomDiagnosticRows,
} = require(
  path.join(
    buildRoot,
    'scripts',
    'm3',
    'live-google-trends-query-dom-diagnostic.js',
  ),
);

assert.deepEqual(
  parseLiveQueryDomDiagnosticArguments([]),
  {
    help:
      false,
    confirmed:
      false,
  },
);

assert.deepEqual(
  parseLiveQueryDomDiagnosticArguments([
    '--help',
  ]),
  {
    help:
      true,
    confirmed:
      false,
  },
);

assert.deepEqual(
  requireLiveQueryDomDiagnosticConfirmation([
    LIVE_QUERY_DOM_DIAGNOSTIC_CONFIRMATION_FLAG,
  ]),
  {
    help:
      false,
    confirmed:
      true,
  },
);

assert.throws(
  () =>
    requireLiveQueryDomDiagnosticConfirmation(
      [],
    ),
  /Refusing live Google Trends query DOM diagnostic/u,
);

for (
  const forbidden of [
    '--retry',
    '--refresh',
    '--download',
    '--all-groups',
  ]
) {
  assert.throws(
    () =>
      parseLiveQueryDomDiagnosticArguments([
        forbidden,
      ]),
    /Unsupported argument/u,
  );
}

console.log(
  'PASS GT-LIVE-QUERY-DIAG-CMD-001: live structural diagnostic requires an explicit confirmation and rejects broader provider behavior',
);

const safeRows =
  sanitizeQueryDomDiagnosticRows(
    [
      {
        tag:
          'button',
        role:
          'button',
        aria_label:
          'Remove CANLI BİTKİ',
        class_name:
          'compare-term canlı bitki',
        track_name:
          null,
      },
      {
        tag:
          'div',
        role:
          'button',
        aria_label:
          'Add a search term for comparison',
        class_name:
          'add-comparison',
        track_name:
          'compare',
      },
    ],
    [
      'canlı bitki',
    ],
  );

assert.equal(
  JSON.stringify(
    safeRows,
  ).toLocaleLowerCase(
    'tr-TR',
  ).includes(
    'canlı bitki',
  ),
  false,
);

assert.deepEqual(
  safeRows[0],
  {
    tag:
      'button',
    role:
      'button',
    aria_label:
      'Remove <QUERY>',
    class_name:
      'compare-term <QUERY>',
    track_name:
      null,
  },
);

console.log(
  'PASS GT-LIVE-QUERY-DIAG-CMD-002: structural evidence redacts configured query strings without emitting page text, values, or HTML',
);

assert.deepEqual(
  classifyQueryInputState(
    'online bitki',
    'online bitki',
  ),
  {
    is_empty:
      false,
    matches_expected_query:
      true,
  },
);

assert.deepEqual(
  classifyQueryInputState(
    '',
    'online bitki',
  ),
  {
    is_empty:
      true,
    matches_expected_query:
      false,
  },
);

console.log(
  'PASS GT-LIVE-QUERY-DIAG-CMD-004: query input persistence is reported only as safe boolean state without exposing configured query text',
);
