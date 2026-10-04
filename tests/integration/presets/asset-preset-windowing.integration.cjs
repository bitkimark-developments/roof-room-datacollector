const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);

if (!buildRoot) {
  throw new Error('Expected compiled build root.');
}

const {
  resolveDesktopDatePolicy,
} = require(path.join(
  buildRoot,
  'shared',
  'desktop-run-resolution.js',
));

const {
  DESKTOP_TASK_CATALOG,
} = require(path.join(
  buildRoot,
  'desktop-task-catalog.js',
));

const expectedRanges = new Map([
  [
    7,
    {
      requested_date_start:
        '2026-09-27',
      requested_date_end:
        '2026-10-03',
    },
  ],
  [
    14,
    {
      requested_date_start:
        '2026-09-20',
      requested_date_end:
        '2026-10-03',
    },
  ],
  [
    30,
    {
      requested_date_start:
        '2026-09-04',
      requested_date_end:
        '2026-10-03',
    },
  ],
]);

for (
  const [windowDays, expected]
  of expectedRanges
) {
  const policy =
    `TODAY_MINUS_${windowDays}_TO_YESTERDAY`;

  assert.deepEqual(
    resolveDesktopDatePolicy(
      policy,
      '2026-10-04',
    ),
    {
      reference_date:
        '2026-10-04',
      date_policy:
        policy,
      ...expected,
    },
  );

  const gscTaskId =
    `gsc-query-page-current-${windowDays}-days`;

  const gscTask =
    DESKTOP_TASK_CATALOG.find(
      (task) =>
        task.task_id === gscTaskId,
    );

  assert.ok(
    gscTask,
    `Missing ${gscTaskId}`,
  );

  assert.equal(
    gscTask.source_id,
    'google-search-console-query-page',
  );

  assert.equal(
    gscTask.date_policy,
    policy,
  );

  const searchTermsTaskId =
    `google-ads-search-terms-${windowDays}-days`;

  const searchTermsTask =
    DESKTOP_TASK_CATALOG.find(
      (task) =>
        task.task_id
          === searchTermsTaskId,
    );

  assert.ok(
    searchTermsTask,
    `Missing ${searchTermsTaskId}`,
  );

  assert.equal(
    searchTermsTask.source_id,
    'google-ads-search-terms',
  );

  assert.equal(
    searchTermsTask.date_policy,
    policy,
  );
}

console.log(
  'PASS ASSET-PRESET-WINDOW-001: Blog 7/14/30 task identities resolve exact complete-day windows',
);
