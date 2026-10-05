const assert = require('node:assert/strict');

const {
  DesktopMultiSourceController,
} = require(
  `${process.argv[2]}/main/app/desktop-multisource-controller.js`,
);

async function main() {

const workspace = {
  workspace_id: 'ws_blog',
  workspace_name: 'Blog',
  created_at:
    '2026-10-04T00:00:00.000Z',
};

const preset = {
  preset_id: 'sp_blog_7',
  workspace_id:
    workspace.workspace_id,
  preset_name:
    'Blog - 7 Day',
  reusable_configuration: {
    sources: {
      'google-search-console-query-page': {
        included: true,
        task_id:
          'gsc-query-page-current-7-days',
        date_policy:
          'TODAY_MINUS_7_TO_YESTERDAY',
        date_ranges: [],
      },
      'google-ads-search-terms': {
        included: true,
        task_id:
          'google-ads-search-terms-7-days',
        date_policy:
          'TODAY_MINUS_7_TO_YESTERDAY',
      },
    },
  },
  created_at:
    '2026-10-04T00:00:00.000Z',
  updated_at:
    '2026-10-04T00:00:00.000Z',
};

const reservations = [];
const plannerInputs = [];

const repository = {
  listWorkspaces:
    () => [workspace],

  getWorkspace:
    (workspaceId) =>
      workspaceId === workspace.workspace_id
        ? workspace
        : null,

  listSavedCollectionPresets:
    () => [preset],

  getSavedCollectionPreset:
    (workspaceId, presetId) =>
      workspaceId === workspace.workspace_id
      && presetId === preset.preset_id
        ? preset
        : null,

  getLastRunSettings:
    () => null,

  listSourceConnections:
    () => [],

  reserveRunFromJobPlans:
    (input) => {
      reservations.push(input);

      return {
        run: {
          run_id: 'rr_blog_7',
          workspace_id:
            input.workspace_id,
          run_status: 'PENDING',
        },
        jobs:
          input.job_plans.map(
            (plan, index) => ({
              job_id:
                `job_${index + 1}`,
              ...plan,
              execution_status:
                'PENDING',
            }),
          ),
      };
    },
};

let reviewClock =
  new Date(
    2026,
    9,
    4,
    12,
    0,
    0,
  );

const controller =
  new DesktopMultiSourceController({
    repository,

    readiness: {
      getReadiness:
        async (
          workspaceId,
          sourceId,
        ) => ({
          workspace_id:
            workspaceId,
          source_id:
            sourceId,
          readiness_status:
            'READY',
          checked_at:
            '2026-10-04T00:00:00.000Z',
          message: null,
        }),
    },

    application_version:
      'test',

    source_order: [
      'google-search-console-query-page',
      'google-ads-search-terms',
    ],

    job_planner:
      (
        sourceId,
        sourceConfig,
      ) => {
        plannerInputs.push({
          source_id:
            sourceId,
          source_config:
            structuredClone(
              sourceConfig,
            ),
        });

        return [{
          source_id:
            sourceId,
          job_key:
            `${sourceId}-job`,
          query_group_id:
            null,
          source_context:
            structuredClone(
              sourceConfig,
            ),
        }];
      },

    now:
      () =>
        new Date(
          reviewClock.getTime(),
        ),
  });

const draft =
  controller.createDraft({
    workspace_id:
      workspace.workspace_id,
    origin: {
      kind:
        'SAVED_PRESET',
      preset_id:
        preset.preset_id,
    },
  });

const review =
  await controller.reviewDraft(
    draft,
  );

assert.ok(
  review.reviewed_draft,
  'Planning-complete multi-source Review must produce an exact reviewed artifact.',
);

assert.equal(
  review.reviewed_draft.task_id,
  null,
  'Multi-source reviewed artifact must not invent a root task identity.',
);

assert.equal(
  review.reviewed_draft.source_id,
  null,
  'Multi-source reviewed artifact must not invent a root source identity.',
);

assert.deepEqual(
  review.reviewed_draft.included_sources,
  [
    'google-search-console-query-page',
    'google-ads-search-terms',
  ],
  'Reviewed artifact must preserve ordered real source identities.',
);

assert.equal(
  review.reviewed_draft.reference_date,
  '2026-10-04',
  'Multi-source Review must capture one local reference date.',
);

assert.equal(
  review.reviewed_draft.resolved_at,
  reviewClock.toISOString(),
  'Multi-source Review must capture one Review instant.',
);

assert.deepEqual(
  review.reviewed_draft
    .resolved_configuration
    .sources[
      'google-search-console-query-page'
    ]
    .date_ranges,
  [{
    job_key:
      'gsc-query-page-current-7-days',
    task_id:
      'gsc-query-page-current-7-days',
    requested_date_start:
      '2026-09-27',
    requested_date_end:
      '2026-10-03',
  }],
  'Reviewed artifact must freeze the exact GSC request window.',
);

assert.equal(
  review.reviewed_draft
    .resolved_configuration
    .sources[
      'google-ads-search-terms'
    ]
    .jobs[0]
    .requested_date_start,
  '2026-09-27',
  'Reviewed artifact must freeze Search Terms start date.',
);

assert.equal(
  review.reviewed_draft
    .resolved_configuration
    .sources[
      'google-ads-search-terms'
    ]
    .jobs[0]
    .requested_date_end,
  '2026-10-03',
  'Reviewed artifact must freeze Search Terms end date.',
);

assert.deepEqual(
  review.reviewed_draft
    .reusable_configuration,
  preset.reusable_configuration,
  'Review must preserve the reusable relative configuration unchanged.',
);

assert.equal(
  review.can_start,
  true,
);

const reviewedGsc =
  plannerInputs.find(
    (entry) =>
      entry.source_id
        === 'google-search-console-query-page',
  )?.source_config;

assert.deepEqual(
  reviewedGsc.date_ranges,
  [{
    job_key:
      'gsc-query-page-current-7-days',
    task_id:
      'gsc-query-page-current-7-days',
    requested_date_start:
      '2026-09-27',
    requested_date_end:
      '2026-10-03',
  }],
  'Review planning must receive the resolved 7-day GSC request window.',
);

const reviewedSearchTerms =
  plannerInputs.find(
    (entry) =>
      entry.source_id
        === 'google-ads-search-terms',
  )?.source_config;

assert.equal(
  reviewedSearchTerms.jobs.length,
  1,
);

assert.equal(
  reviewedSearchTerms
    .jobs[0]
    .requested_date_start,
  '2026-09-27',
);

assert.equal(
  reviewedSearchTerms
    .jobs[0]
    .requested_date_end,
  '2026-10-03',
);

plannerInputs.length = 0;

await controller.startDraft(
  draft,
);

assert.equal(
  reservations.length,
  1,
);

const reservation =
  reservations[0];

const snapshotSources =
  reservation
    .configuration_snapshot
    .sources;

assert.deepEqual(
  snapshotSources[
    'google-search-console-query-page'
  ].date_ranges,
  [{
    job_key:
      'gsc-query-page-current-7-days',
    task_id:
      'gsc-query-page-current-7-days',
    requested_date_start:
      '2026-09-27',
    requested_date_end:
      '2026-10-03',
  }],
  'Run snapshot must preserve the exact resolved GSC request window.',
);

assert.equal(
  snapshotSources[
    'google-ads-search-terms'
  ].jobs[0]
    .requested_date_start,
  '2026-09-27',
);

assert.equal(
  snapshotSources[
    'google-ads-search-terms'
  ].jobs[0]
    .requested_date_end,
  '2026-10-03',
);

assert.equal(
  reservation
    .reusable_configuration
    .sources[
      'google-search-console-query-page'
    ]
    .date_policy,
  'TODAY_MINUS_7_TO_YESTERDAY',
  'Reusable preset configuration must remain relative.',
);

assert.deepEqual(
  reservation
    .reusable_configuration
    .sources[
      'google-search-console-query-page'
    ]
    .date_ranges,
  [],
  'Reusable preset must not be mutated with one run’s absolute dates.',
);

console.log(
  'PASS ASSET-PRESET-MULTISOURCE-001: multi-source preset review/start resolves relative Blog windows only into execution and snapshot context',
);

}

void main();
