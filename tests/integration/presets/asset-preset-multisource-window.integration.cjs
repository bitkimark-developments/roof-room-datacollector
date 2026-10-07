const assert = require('node:assert/strict');

const {
  DesktopMultiSourceController,
} = require(
  `${process.argv[2]}/main/app/desktop-multisource-controller.js`,
);

const {
  createBlogAgenticContentPreset,
} = require(
  `${process.argv[2]}/main/presets/blog-agentic-content-preset.js`,
);

const {
  createGoogleAdsGrowthRebuildPreset,
} = require(
  `${process.argv[2]}/main/presets/google-ads-growth-rebuild-preset.js`,
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

let suppressSearchTermsPlan =
  false;

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

        if (
          suppressSearchTermsPlan
          && sourceId
            === 'google-ads-search-terms'
        ) {
          return [];
        }

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
  await controller.createDraft({
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

reviewClock =
  new Date(
    2026,
    9,
    5,
    12,
    0,
    0,
  );

await controller.startDraft(
  review.reviewed_draft,
);

const startedGsc =
  plannerInputs.find(
    (entry) =>
      entry.source_id
        === 'google-search-console-query-page',
  )?.source_config;

assert.deepEqual(
  startedGsc.date_ranges,
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
  'Start must plan GSC from the frozen reviewed configuration after clock drift.',
);

const startedSearchTerms =
  plannerInputs.find(
    (entry) =>
      entry.source_id
        === 'google-ads-search-terms',
  )?.source_config;

assert.equal(
  startedSearchTerms
    .jobs[0]
    .requested_date_start,
  '2026-09-27',
  'Start must not drift the reviewed Search Terms start date.',
);

assert.equal(
  startedSearchTerms
    .jobs[0]
    .requested_date_end,
  '2026-10-03',
  'Start must not drift the reviewed Search Terms end date.',
);

assert.equal(
  reservations.length,
  1,
);

const reservation =
  reservations[0];

assert.equal(
  reservation
    .configuration_snapshot
    .reference_date,
  '2026-10-04',
  'Run snapshot must preserve the Review reference date after clock drift.',
);

assert.equal(
  reservation
    .configuration_snapshot
    .resolved_at,
  review.reviewed_draft.resolved_at,
  'Run snapshot must preserve the exact Review instant.',
);

assert.equal(
  reservation
    .configuration_snapshot
    .source_id,
  null,
  'Multi-source Run snapshot must not invent a root source identity.',
);

assert.equal(
  reservation
    .configuration_snapshot
    .task_id,
  null,
  'Multi-source Run snapshot must not invent a root task identity.',
);

assert.deepEqual(
  reservation
    .configuration_snapshot
    .sources,
  review.reviewed_draft
    .resolved_configuration
    .sources,
  'Run snapshot source configuration must equal the reviewed resolved configuration.',
);

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

suppressSearchTermsPlan =
  true;

const reservationsBeforeBlockedStart =
  reservations.length;

await assert.rejects(
  () =>
    controller.startDraft(
      review.reviewed_draft,
    ),
  /google-ads-search-terms/,
  'Reviewed Start must fail closed if any included source loses JobPlan coverage.',
);

assert.equal(
  reservations.length,
  reservationsBeforeBlockedStart,
  'Planning-incomplete reviewed Start must not reserve another Run.',
);


const sourceNeutralCompositionPreset = {
  preset_id:
    'sp_blog_trends_gsc',
  workspace_id:
    workspace.workspace_id,
  preset_name:
    'Blog - Trends + GSC composition',
  reusable_configuration: {
    sources: {
      'google-trends': {
        included: true,
        task_id:
          'google-trends-interest-over-time',
        date_policy:
          'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
        dataset_type:
          'INTEREST_OVER_TIME',
        date_ranges: [],
        query_groups: [],
      },
      'google-search-console-query-page': {
        included: true,
        task_id:
          'gsc-query-page-current-7-days',
        date_policy:
          'TODAY_MINUS_7_TO_YESTERDAY',
        date_ranges: [],
      },
    },
  },
  created_at:
    '2026-10-04T00:00:00.000Z',
  updated_at:
    '2026-10-04T00:00:00.000Z',
};

const sourceNeutralCompositionController =
  new DesktopMultiSourceController({
    repository: {
      ...repository,

      listSavedCollectionPresets:
        () => [
          sourceNeutralCompositionPreset,
        ],

      getSavedCollectionPreset:
        (
          workspaceId,
          presetId,
        ) =>
          workspaceId
            === workspace.workspace_id
          && presetId
            === sourceNeutralCompositionPreset
              .preset_id
            ? sourceNeutralCompositionPreset
            : null,
    },

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
          message:
            null,
        }),
    },

    application_version:
      'test',

    source_order: [
      'google-trends',
      'google-search-console-query-page',
    ],

    google_trends_query_groups: [
      {
        query_group_id:
          'GT-BLOG-01',
        query_group_name:
          'Blog Topics',
        queries: [
          'ficus',
          'monstera',
        ],
      },
    ],

    now:
      () =>
        new Date(
          2026,
          9,
          4,
          12,
          0,
          0,
        ),
  });

const sourceNeutralCompositionDraft =
  await sourceNeutralCompositionController
    .createDraft({
      workspace_id:
        workspace.workspace_id,
      origin: {
        kind:
          'SAVED_PRESET',
        preset_id:
          sourceNeutralCompositionPreset
            .preset_id,
      },
    });

const sourceNeutralCompositionReview =
  await sourceNeutralCompositionController
    .reviewDraft(
      sourceNeutralCompositionDraft,
    );

assert.deepEqual(
  sourceNeutralCompositionReview
    .included_sources,
  [
    'google-trends',
    'google-search-console-query-page',
  ],
);

assert.deepEqual(
  sourceNeutralCompositionReview
    .planning_blocking_sources,
  [],
  'Multi-source Review must compose every included source through its existing source-local resolver before planning.',
);

assert.equal(
  sourceNeutralCompositionReview
    .can_start,
  true,
  'A planning-complete Trends + GSC reviewed preset must be startable.',
);

assert.ok(
  sourceNeutralCompositionReview
    .reviewed_draft,
  'Planning-complete Trends + GSC Review must produce one immutable reviewed artifact.',
);

assert.deepEqual(
  sourceNeutralCompositionReview
    .reviewed_draft
    .reusable_configuration
    .sources['google-trends']
    .query_groups,
  [],
  'Reusable Blog configuration must remain free of run-resolved Google Trends query groups.',
);

assert.deepEqual(
  sourceNeutralCompositionReview
    .reviewed_draft
    .resolved_configuration
    .sources['google-trends']
    .query_groups
    .map(
      (group) =>
        group.query_group_id,
    ),
  [
    'GT-BLOG-01',
  ],
  'Multi-source Review must freeze configured Google Trends query groups into the resolved execution artifact.',
);


const sevenSourceConfiguration =
  createBlogAgenticContentPreset(7);

sevenSourceConfiguration
  .sources['google-keyword-planner']
  .groups = [
    {
      group_id:
        'blog-core',
      group_name:
        'Blog Core',
      keywords: [
        'ficus',
        'monstera',
      ],
    },
  ];

sevenSourceConfiguration
  .sources.serpapi
  .queries = [
    {
      job_key:
        'blog-ficus',
      query:
        'ficus',
    },
  ];

sevenSourceConfiguration
  .sources['bitkimark-sitemap']
  .sitemaps = [
    {
      requested_url:
        'https://bitkimark.com/sitemap.xml',
      parent_sitemap_url:
        null,
    },
  ];

const sevenSourcePreset = {
  preset_id:
    'sp_blog_7_full',
  workspace_id:
    workspace.workspace_id,
  preset_name:
    'Blog - 7 Day',
  reusable_configuration:
    sevenSourceConfiguration,
  created_at:
    '2026-10-04T00:00:00.000Z',
  updated_at:
    '2026-10-04T00:00:00.000Z',
};

const sevenSourceController =
  new DesktopMultiSourceController({
    repository: {
      ...repository,

      listSavedCollectionPresets:
        () => [
          sevenSourcePreset,
        ],

      getSavedCollectionPreset:
        (
          workspaceId,
          presetId,
        ) =>
          workspaceId
            === workspace.workspace_id
          && presetId
            === sevenSourcePreset.preset_id
            ? sevenSourcePreset
            : null,
    },

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
          message:
            null,
        }),
    },

    application_version:
      'test',

    source_order: [
      'google-trends',
      'google-search-console-query-page',
      'google-ads-search-terms',
      'google-keyword-planner',
      'ikas-products',
      'serpapi',
      'bitkimark-sitemap',
    ],

    google_trends_query_groups: [
      {
        query_group_id:
          'GT-BLOG-01',
        query_group_name:
          'Blog Topics',
        queries: [
          'ficus',
          'monstera',
        ],
      },
    ],

    now:
      () =>
        new Date(
          2026,
          9,
          4,
          12,
          0,
          0,
        ),
  });

const sevenSourceDraft =
  await sevenSourceController
    .createDraft({
      workspace_id:
        workspace.workspace_id,
      origin: {
        kind:
          'SAVED_PRESET',
        preset_id:
          sevenSourcePreset.preset_id,
      },
    });

const sevenSourceReview =
  await sevenSourceController
    .reviewDraft(
      sevenSourceDraft,
    );

assert.deepEqual(
  sevenSourceReview.included_sources,
  [
    'google-trends',
    'google-search-console-query-page',
    'google-ads-search-terms',
    'google-keyword-planner',
    'ikas-products',
    'serpapi',
    'bitkimark-sitemap',
  ],
  'Blog 7 Review must preserve all seven included evidence families.',
);

assert.equal(
  sevenSourceReview.job_count,
  6,
  'All configured Blog families except the unresolved İkas FILE_IMPORT input must produce JobPlans.',
);

assert.deepEqual(
  sevenSourceReview
    .planning_blocking_sources,
  [
    'ikas-products',
  ],
  'İkas must be the only remaining Blog planning blocker before run-scoped XLSX binding.',
);

assert.equal(
  sevenSourceReview.can_start,
  false,
  'Blog Review must fail closed while the included İkas family has no reviewed file input.',
);

assert.equal(
  sevenSourceReview.reviewed_draft,
  null,
  'Planning-incomplete seven-family Blog Review must not freeze a startable reviewed artifact.',
);


const growthPreset = {
  preset_id: 'sp_google_ads_growth',
  workspace_id: workspace.workspace_id,
  preset_name: 'Google Ads Growth',
  reusable_configuration: createGoogleAdsGrowthRebuildPreset(),
  created_at: '2026-10-04T00:00:00.000Z',
  updated_at: '2026-10-04T00:00:00.000Z',
};

const growthConnections = [
  {
    connection_id: 'conn_growth_ads',
    workspace_id: workspace.workspace_id,
    source_id: 'google-ads-search-terms',
    credential_ref: 'cred:google-ads',
    safe_metadata: {
      customer_id: '1234567890',
    },
    created_at: '2026-10-04T00:00:00.000Z',
    updated_at: '2026-10-04T00:00:00.000Z',
  },
  {
    connection_id: 'conn_growth_ga4',
    workspace_id: workspace.workspace_id,
    source_id: 'google-analytics-4',
    credential_ref: 'cred:ga4',
    safe_metadata: {
      property_id: '987654321',
    },
    created_at: '2026-10-04T00:00:00.000Z',
    updated_at: '2026-10-04T00:00:00.000Z',
  },
];

const growthController = new DesktopMultiSourceController({
  repository: {
    ...repository,
    listSavedCollectionPresets: () => [growthPreset],
    getSavedCollectionPreset: (workspaceId, presetId) => (
      workspaceId === workspace.workspace_id
      && presetId === growthPreset.preset_id
        ? growthPreset
        : null
    ),
    listSourceConnections: () => growthConnections,
  },
  readiness: {
    getReadiness: async (workspaceId, sourceId) => ({
      workspace_id: workspaceId,
      source_id: sourceId,
      readiness_status: 'READY',
      checked_at: '2026-10-04T00:00:00.000Z',
      message: null,
    }),
  },
  application_version: 'test',
  source_order: [
    'google-ads-search-reporting',
    'google-ads-change-history',
    'google-ads-configuration',
    'google-analytics-4',
  ],
  now: () => new Date(2026, 9, 4, 12, 0, 0),
});

const growthDraft = await growthController.createDraft({
  workspace_id: workspace.workspace_id,
  origin: {
    kind: 'SAVED_PRESET',
    preset_id: growthPreset.preset_id,
  },
});

const growthReview = await growthController.reviewDraft(growthDraft);

assert.deepEqual(growthReview.included_sources, [
  'google-ads-search-reporting',
  'google-ads-change-history',
  'google-ads-configuration',
  'google-analytics-4',
]);

assert.equal(
  growthReview.job_count,
  22,
  'Google Ads Growth Review must plan the complete preset evidence set.',
);

assert.deepEqual(
  growthReview.planning_blocking_sources,
  [],
  'READY Growth sources must receive reviewed execution context before planning.',
);

assert.equal(growthReview.can_start, true);
assert.ok(growthReview.reviewed_draft);

assert.deepEqual(
  growthReview.reviewed_draft.reusable_configuration,
  growthPreset.reusable_configuration,
  'Review must preserve the reusable Growth intent unchanged.',
);

const growthReusableSources =
  growthReview.reviewed_draft.reusable_configuration.sources;

assert.equal(
  growthReusableSources['google-ads-search-reporting'].customer_id,
  null,
  'Workspace customer identity must not be persisted into reusable Growth intent.',
);

assert.equal(
  growthReusableSources['google-ads-search-reporting'].requested_date_start,
  null,
  'Reusable Growth intent must not persist one Run absolute dates.',
);

assert.equal(
  growthReusableSources['google-ads-search-reporting'].requested_date_end,
  null,
  'Reusable Growth intent must not persist one Run absolute dates.',
);

const growthResolvedSources =
  growthReview.reviewed_draft.resolved_configuration.sources;

assert.equal(
  growthResolvedSources['google-ads-search-reporting'].customer_id,
  '1234567890',
);

assert.equal(
  growthResolvedSources['google-ads-search-reporting'].requested_date_start,
  '2026-09-04',
);

assert.equal(
  growthResolvedSources['google-ads-search-reporting'].requested_date_end,
  '2026-10-03',
);

assert.equal(
  growthResolvedSources['google-ads-change-history'].customer_id,
  '1234567890',
);

assert.equal(
  growthResolvedSources['google-ads-change-history'].requested_date_start,
  '2026-09-04',
);

assert.equal(
  growthResolvedSources['google-ads-change-history'].requested_date_end,
  '2026-10-03',
);

assert.equal(
  growthResolvedSources['google-ads-configuration'].customer_id,
  '1234567890',
);

assert.equal(
  growthResolvedSources['google-analytics-4'].start_date,
  '2026-09-04',
);

assert.equal(
  growthResolvedSources['google-analytics-4'].end_date,
  '2026-10-03',
);

const growthReservationsBeforeStart = reservations.length;

await growthController.startDraft(
  growthReview.reviewed_draft,
);

assert.equal(
  reservations.length,
  growthReservationsBeforeStart + 1,
);

const growthReservation = reservations.at(-1);

assert.equal(
  growthReservation.job_plans.length,
  22,
);

assert.deepEqual(
  growthReservation.job_plans
    .filter(
      (plan) =>
        plan.source_id === 'google-analytics-4',
    )
    .map(
      (plan) =>
        plan.job_key,
    ),
  [
    'GA4_PAID_FUNNEL',
  ],
  'Growth must collect only the GA4 dataset explicitly selected by the preset.',
);

const growthMissingMetadataController = new DesktopMultiSourceController({
  repository: {
    ...repository,
    listSavedCollectionPresets: () => [growthPreset],
    getSavedCollectionPreset: (workspaceId, presetId) => (
      workspaceId === workspace.workspace_id
      && presetId === growthPreset.preset_id
        ? growthPreset
        : null
    ),
    listSourceConnections: () => (
      growthConnections.filter(
        (connection) =>
          connection.source_id !== 'google-ads-search-terms',
      )
    ),
  },
  readiness: {
    getReadiness: async (workspaceId, sourceId) => ({
      workspace_id: workspaceId,
      source_id: sourceId,
      readiness_status: 'READY',
      checked_at: '2026-10-04T00:00:00.000Z',
      message: null,
    }),
  },
  application_version: 'test',
  source_order: [
    'google-ads-search-reporting',
    'google-ads-change-history',
    'google-ads-configuration',
    'google-analytics-4',
  ],
  now: () => new Date(2026, 9, 4, 12, 0, 0),
});

const growthMissingMetadataDraft =
  await growthMissingMetadataController.createDraft({
    workspace_id: workspace.workspace_id,
    origin: {
      kind: 'SAVED_PRESET',
      preset_id: growthPreset.preset_id,
    },
  });

const growthMissingMetadataReview =
  await growthMissingMetadataController.reviewDraft(
    growthMissingMetadataDraft,
  );

assert.deepEqual(
  growthMissingMetadataReview.blocking_sources,
  [],
  'Provider readiness must remain separate from missing planning metadata.',
);

assert.deepEqual(
  growthMissingMetadataReview.planning_blocking_sources,
  [
    'google-ads-search-reporting',
    'google-ads-change-history',
    'google-ads-configuration',
  ],
  'Missing canonical Ads Workspace customer metadata must fail Growth planning closed.',
);

assert.equal(
  growthMissingMetadataReview.can_start,
  false,
);

assert.equal(
  growthMissingMetadataReview.reviewed_draft,
  null,
  'Planning-incomplete Growth Review must not freeze a startable reviewed artifact.',
);


console.log(
  'PASS ASSET-PRESET-MULTISOURCE-001: multi-source preset review/start resolves relative Blog windows only into execution and snapshot context',
);

}

void main();
