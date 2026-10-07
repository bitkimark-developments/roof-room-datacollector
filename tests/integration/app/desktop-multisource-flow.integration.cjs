const assert = require('node:assert/strict');

const {
  DesktopMultiSourceController,
} = require(`${process.argv[2]}/main/app/desktop-multisource-controller.js`);
const { DesktopExecutionService } = require(`${process.argv[2]}/main/app/desktop-execution-service.js`);

const {
  isDesktopReviewedRunDraft,
} = require(
  `${process.argv[2]}/shared/desktop-multisource.js`,
);

let resolveDesktopDatePolicy =
  () => null;

let formatLocalReferenceDate =
  null;

try {
  ({
    resolveDesktopDatePolicy,
    formatLocalReferenceDate,
  } = require(
    `${process.argv[2]}/shared/desktop-run-resolution.js`,
  ));
} catch (error) {
  if (
    !error
    || error.code !== 'MODULE_NOT_FOUND'
  ) {
    throw error;
  }
}

const READY = (workspace_id, source_id) => ({ workspace_id, source_id, readiness_status: 'READY', checked_at: '2026-09-11T00:00:00.000Z', message: null });

const createFixture = (
  now = () =>
    new Date(
      '2026-09-14T09:30:00.000Z',
    ),
  sourceOrder = [
    'google-trends',
    'google-search-console-query-page',
    'serpapi',
    'ikas-products',
  ],
  connectionRecords = [],
  availableCredentialRefs = new Set(),
) => {
  const workspaces = [
    { workspace_id: 'ws_a', workspace_name: 'A', created_at: '2026-09-11T00:00:00.000Z' },
    { workspace_id: 'ws_b', workspace_name: 'B', created_at: '2026-09-11T00:00:01.000Z' },
  ];
  const presets = new Map([
    ['ws_a', [{ preset_id: 'sp_a', workspace_id: 'ws_a', preset_name: 'Blog', reusable_configuration: { api_key: 'do-not-leak', sources: { 'google-trends': { included: true, query_groups: [{ query_group_id: 'GT-01' }] }, serpapi: { included: true, queries: [{ query: 'ficus' }] }, 'ikas-products': { included: true, file_path: '/tmp/products.xlsx' } } }, created_at: '2026-09-11T00:00:00.000Z', updated_at: '2026-09-11T00:00:00.000Z' }]],
    ['ws_b', []],
  ]);
  const reservations = [];
  const executions = [];
  const repository = {
    listWorkspaces: () => workspaces,
    getWorkspace: (workspace_id) => workspaces.find((w) => w.workspace_id === workspace_id) || null,
    listSavedCollectionPresets: (workspace_id) => presets.get(workspace_id) || [],
    getSavedCollectionPreset: (workspace_id, preset_id) => (presets.get(workspace_id) || []).find((p) => p.preset_id === preset_id) || null,
    getLastRunSettings: () => null,
    listSourceConnections: (workspace_id) =>
      connectionRecords.filter(
        (connection) =>
          connection.workspace_id === workspace_id,
      ),
    createSavedCollectionPreset: (input) => {
      const collection = presets.get(input.workspace_id) || [];
      const preset = {
        preset_id: `sp_${collection.length + 1}`,
        workspace_id: input.workspace_id,
        preset_name: input.preset_name,
        reusable_configuration: input.reusable_configuration,
        created_at: '2026-09-11T00:00:02.000Z',
        updated_at: '2026-09-11T00:00:02.000Z',
      };
      collection.push(preset);
      presets.set(input.workspace_id, collection);
      return preset;
    },
    updateSavedCollectionPreset: (input) => {
      const collection = presets.get(input.workspace_id) || [];
      const index = collection.findIndex((preset) => preset.preset_id === input.preset_id);
      if (index < 0) throw new Error(`Preset ${input.preset_id} not found`);
      const updated = {
        ...collection[index],
        preset_name: input.preset_name,
        reusable_configuration: input.reusable_configuration,
        updated_at: '2026-09-11T00:00:03.000Z',
      };
      collection[index] = updated;
      return updated;
    },
    deleteSavedCollectionPreset: (workspace_id, preset_id) => {
      const collection = presets.get(workspace_id) || [];
      const next = collection.filter((preset) => preset.preset_id !== preset_id);
      if (next.length === collection.length) {
        throw new Error(`Preset ${preset_id} not found`);
      }
      presets.set(workspace_id, next);
    },
    reserveRunFromJobPlans: (input) => {
      reservations.push(input);
      return { run: { run_id: 'rr_1', workspace_id: input.workspace_id, run_status: 'PENDING' }, jobs: input.job_plans.map((plan, i) => ({ job_id: `job_${i}`, ...plan, execution_status: 'PENDING' })) };
    },
  };
  const readiness = {
    getReadiness: async (workspace_id, source_id) => READY(workspace_id, source_id),
  };
  const controller = new DesktopMultiSourceController({
    repository,
    readiness,
    credential_availability: {
      hasCredential:
        async (credential_ref) =>
          availableCredentialRefs.has(
            credential_ref,
          ),
    },
    application_version: 'test',
    source_order: sourceOrder,
    job_planner: (source_id, source_config) => [{ source_id, job_key: `${source_id}-job`, query_group_id: null, source_context: { source_config } }],
    execute_run: async (run_id) => executions.push(run_id),
    now,
  });
  return { controller, repository, reservations, executions };
};

async function main() {
  const multiSourceReviewedArtifact = {
    workspace_id:
      'ws_reviewed_contract',
    task_id:
      null,
    source_id:
      null,
    included_sources: [
      'google-trends',
      'serpapi',
    ],
    reference_date:
      '2026-10-05',
    resolved_at:
      '2026-10-05T09:00:00.000Z',
    reusable_configuration: {
      sources: {
        'google-trends': {
          included: true,
        },
        serpapi: {
          included: true,
        },
      },
    },
    resolved_configuration: {
      sources: {
        'google-trends': {
          included: true,
        },
        serpapi: {
          included: true,
        },
      },
    },
  };

  assert.equal(
    isDesktopReviewedRunDraft(
      multiSourceReviewedArtifact,
    ),
    true,
    'Reviewed artifact contract must accept nullable root task/source identity for a real multi-source Run.',
  );

  assert.equal(
    isDesktopReviewedRunDraft({
      ...multiSourceReviewedArtifact,
      task_id:
        'google-trends-quick-run',
      source_id:
        'google-trends',
      included_sources: [
        'google-trends',
      ],
    }),
    true,
    'Reviewed artifact contract must remain compatible with real single-source task/source identity.',
  );

  const {
    included_sources:
      _missingIncludedSources,
    ...withoutIncludedSources
  } = {
    ...multiSourceReviewedArtifact,
    task_id:
      'google-trends-quick-run',
    source_id:
      'google-trends',
  };

  assert.equal(
    isDesktopReviewedRunDraft(
      withoutIncludedSources,
    ),
    false,
    'Reviewed artifact contract must reject a missing included_sources collection.',
  );

  assert.equal(
    isDesktopReviewedRunDraft({
      ...multiSourceReviewedArtifact,
      task_id:
        'google-trends-quick-run',
      source_id:
        'google-trends',
      included_sources: [],
    }),
    false,
    'Reviewed artifact contract must reject an empty included_sources collection.',
  );

  assert.equal(
    isDesktopReviewedRunDraft({
      ...multiSourceReviewedArtifact,
      task_id:
        'google-trends-quick-run',
      source_id:
        'google-trends',
      included_sources:
        'google-trends',
    }),
    false,
    'Reviewed artifact contract must reject non-array included_sources.',
  );

  const defaultWorkspaceController =
    new DesktopMultiSourceController({
      repository: {
        listWorkspaces: () => [
          {
            workspace_id:
              'ws_development_migration',
            workspace_name:
              'Development migration workspace',
            created_at:
              '1970-01-01T00:00:00.000Z',
          },
          {
            workspace_id:
              'ws_production',
            workspace_name:
              'Bitkimark Production',
            created_at:
              '2026-09-11T15:55:31.153Z',
          },
        ],
        listSourceConnections:
          () => [],
      },
      readiness: {
        getReadiness:
          async (
            workspace_id,
            source_id,
          ) =>
            READY(
              workspace_id,
              source_id,
            ),
      },
      application_version:
        'test',
    });

  assert.equal(
    defaultWorkspaceController
      .getWorkspaceView()
      .selected_workspace_id,
    'ws_production',
    'Default desktop Workspace must prefer a real Workspace over the migration-compatibility Workspace.',
  );


  const {
    controller:
      initialReadinessController,
  } = createFixture();

  const initialReadinessDraft =
    await initialReadinessController
      .createDraft({
        workspace_id:
          'ws_a',
        origin: {
          kind:
            'BLANK',
        },
      });

  assert.equal(
    initialReadinessDraft
      .source_cards
      .find(
        (card) =>
          card.source_id ===
          'google-trends',
      )
      ?.readiness_status,
    'READY',
    'Blank draft source cards must use current source readiness instead of placeholder CONFIGURATION_REQUIRED.',
  );

  const planningCoverageWorkspace = {
    workspace_id:
      'ws_planning_coverage',
    workspace_name:
      'Planning Coverage',
    created_at:
      '2026-10-04T00:00:00.000Z',
  };

  const planningCoverageController =
    new DesktopMultiSourceController({
      repository: {
        getWorkspace:
          (workspaceId) =>
            workspaceId
              === planningCoverageWorkspace.workspace_id
              ? planningCoverageWorkspace
              : null,
        listWorkspaces:
          () => [planningCoverageWorkspace],
        listSourceConnections:
          () => [],
      },
      readiness: {
        getReadiness:
          async (
            workspaceId,
            sourceId,
          ) =>
            READY(
              workspaceId,
              sourceId,
            ),
      },
      application_version:
        'test',
      source_order: [
        'google-trends',
        'serpapi',
      ],
      job_planner:
        (
          sourceId,
          sourceConfig,
        ) =>
          sourceId === 'google-trends'
            ? [{
                source_id:
                  sourceId,
                job_key:
                  'google-trends-job',
                query_group_id:
                  null,
                source_context:
                  structuredClone(
                    sourceConfig,
                  ),
              }]
            : [],
    });

  const planningCoverageReview =
    await planningCoverageController
      .reviewDraft({
        workspace_id:
          planningCoverageWorkspace
            .workspace_id,
        origin: {
          kind:
            'SAVED_PRESET',
          preset_id:
            'sp_planning_coverage',
        },
        reusable_configuration: {
          sources: {
            'google-trends': {
              included: true,
            },
            serpapi: {
              included: true,
            },
          },
        },
        source_cards: [],
      });

  assert.equal(
    planningCoverageReview.job_count,
    1,
    'Fixture must prove that one included source planned work while the other silently produced zero Jobs.',
  );

  assert.equal(
    planningCoverageReview.can_start,
    false,
    'Preset Review must fail closed when any included source produces zero Jobs.',
  );

  assert.deepEqual(
    planningCoverageReview
      .planning_blocking_sources,
    ['serpapi'],
    'Review must identify the included source that produced zero Jobs without misclassifying it as a readiness blocker.',
  );

  let releaseCancellationExecution;
  let physicalCancelCalls = 0;
  let cancelFinished = false;

  const cancellableExecutionService =
    new DesktopExecutionService({
      runUntilBlocked:
        async (runId) => {
          assert.equal(
            runId,
            'rr_execution_cancel',
          );

          await new Promise(
            (resolve) => {
              releaseCancellationExecution =
                resolve;
            },
          );

          return {
            steps: [],
            stopped_because:
              'RUN_COMPLETED',
          };
        },

      executeStartedAttempt:
        async () => {
          throw new Error(
            'unused',
          );
        },
    });

  const ownedExecution =
    cancellableExecutionService
      .execute(
        'rr_execution_cancel',
        async () => {
          physicalCancelCalls += 1;
        },
      );

  assert.equal(
    cancellableExecutionService
      .isActive(
        'rr_execution_cancel',
      ),
    true,
    'ExecutionService must own the active Run.',
  );

  assert.equal(
    cancellableExecutionService
      .canCancel(
        'rr_execution_cancel',
      ),
    true,
    'ExecutionService must expose cancellation only when an active handle exists.',
  );

  const cancellationPromise =
    cancellableExecutionService
      .cancelActive(
        'rr_execution_cancel',
      )
      .then(() => {
        cancelFinished = true;
      });

  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        0,
      ),
  );

  assert.equal(
    physicalCancelCalls,
    1,
    'Physical cancellation handle must run exactly once.',
  );

  assert.equal(
    cancelFinished,
    false,
    'cancelActive must not resolve while the owned execution is still active.',
  );

  releaseCancellationExecution();

  await Promise.all([
    ownedExecution,
    cancellationPromise,
  ]);

  assert.equal(
    cancellableExecutionService
      .isActive(
        'rr_execution_cancel',
      ),
    false,
    'Execution ownership must be released before cancellation completes.',
  );

  assert.equal(
    cancellableExecutionService
      .canCancel(
        'rr_execution_cancel',
      ),
    false,
    'Released execution must no longer advertise cancellation.',
  );

  console.log(
    'PASS DESKTOP-EXECUTION-CANCEL-001: cancellation invokes the physical handle and waits for execution ownership release',
  );


  let releaseCancellationDomainOwner;

  const domainExecutionService =
    new DesktopExecutionService({
      runUntilBlocked:
        async (runId) => {
          if (
            runId ===
              'rr_domain_owner'
          ) {
            await new Promise(
              (resolve) => {
                releaseCancellationDomainOwner =
                  resolve;
              },
            );
          }

          return {
            steps: [],
            stopped_because:
              'RUN_COMPLETED',
          };
        },

      executeStartedAttempt:
        async () => {
          throw new Error(
            'unused',
          );
        },
    });

  const domainOwnerExecution =
    domainExecutionService
      .execute(
        'rr_domain_owner',
        async () => {},
        'google-trends-browser',
      );

  assert.throws(
    () =>
      domainExecutionService
        .execute(
          'rr_domain_other',
          async () => {},
          'google-trends-browser',
        ),
    /cancellation domain|already owned|google-trends-browser/i,
    'Two Runs must not share one physical cancellation domain at the same time.',
  );

  releaseCancellationDomainOwner();

  await domainOwnerExecution;

  const reusedDomainExecution =
    domainExecutionService
      .execute(
        'rr_domain_other',
        async () => {},
        'google-trends-browser',
      );

  await reusedDomainExecution;

  console.log(
    'PASS DESKTOP-EXECUTION-DOMAIN-001: one physical cancellation domain has one active Run owner and releases ownership after completion',
  );

  const resolvedGscCurrent =
    resolveDesktopDatePolicy(
      'TODAY_MINUS_90_TO_YESTERDAY',
      '2026-09-14',
    );

  assert.deepEqual(
    resolvedGscCurrent,
    {
      reference_date:
        '2026-09-14',
      date_policy:
        'TODAY_MINUS_90_TO_YESTERDAY',
      requested_date_start:
        '2026-06-16',
      requested_date_end:
        '2026-09-13',
    },
    'TODAY_MINUS_90_TO_YESTERDAY must resolve the exact GSC Current calendar range.',
  );

  const resolvedGscLong =
    resolveDesktopDatePolicy(
      'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
      '2026-09-14',
    );

  assert.deepEqual(
    resolvedGscLong,
    {
      reference_date:
        '2026-09-14',
      date_policy:
        'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
      requested_date_start:
        '2025-05-14',
      requested_date_end:
        '2026-09-13',
    },
    'GSC Long must resolve the exact 16-calendar-month range.',
  );

  assert.deepEqual(
    resolveDesktopDatePolicy(
      'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
      '2026-10-31',
    ),
    {
      reference_date:
        '2026-10-31',
      date_policy:
        'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
      requested_date_start:
        '2025-06-30',
      requested_date_end:
        '2026-10-30',
    },
    'GSC Long calendar-month policy must clamp month-end dates.',
  );

  const resolvedGoogleTrends =
    resolveDesktopDatePolicy(
      'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
      '2026-09-14',
    );

  assert.deepEqual(
    resolvedGoogleTrends,
    {
      reference_date:
        '2026-09-14',
      date_policy:
        'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
      requested_date_start:
        '2024-09-14',
      requested_date_end:
        '2026-09-13',
    },
    'Google Trends must resolve local today minus 24 calendar months through yesterday.',
  );

  assert.deepEqual(
    resolveDesktopDatePolicy(
      'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
      '2024-02-29',
    ),
    {
      reference_date:
        '2024-02-29',
      date_policy:
        'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
      requested_date_start:
        '2022-02-28',
      requested_date_end:
        '2024-02-28',
    },
    'Google Trends 24-calendar-month policy must clamp leap-day month arithmetic.',
  );

  assert.equal(
    typeof formatLocalReferenceDate,
    'function',
    'Local reference-date formatter must be exported.',
  );

  const previousTimezone =
    process.env.TZ;

  process.env.TZ =
    'Europe/Istanbul';

  try {
    assert.equal(
      formatLocalReferenceDate(
        new Date(
          '2026-09-13T22:30:00.000Z',
        ),
      ),
      '2026-09-14',
      'Local reference date must use local calendar fields instead of UTC date truncation.',
    );
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ =
        previousTimezone;
    }
  }

  const gscReviewController =
    createFixture().controller;

  const gscCurrentDraft =
    await gscReviewController.createDraft({
      workspace_id:
        'ws_a',
      origin: {
        kind:
          'BLANK',
      },
    });

  gscCurrentDraft
    .reusable_configuration
    .sources = {
      'google-search-console-query-page': {
        included:
          true,
        task_id:
          'gsc-current-90-days',
        date_policy:
          'TODAY_MINUS_90_TO_YESTERDAY',
      },
    };

  const gscCurrentReview =
    await gscReviewController
      .reviewDraft(
        gscCurrentDraft,
      );

  assert.deepEqual(
    gscCurrentReview.reviewed_draft,
    {
      workspace_id:
        'ws_a',
      task_id:
        'gsc-current-90-days',
      source_id:
        'google-search-console-query-page',
      included_sources: [
        'google-search-console-query-page',
      ],
      reference_date:
        '2026-09-14',
      resolved_at:
        '2026-09-14T09:30:00.000Z',
      reusable_configuration: {
        sources: {
          'google-search-console-query-page': {
            included:
              true,
            task_id:
              'gsc-current-90-days',
            date_policy:
              'TODAY_MINUS_90_TO_YESTERDAY',
          },
        },
      },
      resolved_configuration: {
        sources: {
          'google-search-console-query-page': {
            included:
              true,
            task_id:
              'gsc-current-90-days',
            date_policy:
              'TODAY_MINUS_90_TO_YESTERDAY',
            date_ranges: [
              {
                job_key:
                  'gsc-current-90-days',
                task_id:
                  'gsc-current-90-days',
                requested_date_start:
                  '2026-06-16',
                requested_date_end:
                  '2026-09-13',
              },
            ],
          },
        },
      },
    },
    'GSC Current Review must produce an exact reviewed artifact.',
  );

  let driftClock =
    new Date(
      '2026-09-14T09:30:00.000Z',
    );

  const driftFixture =
    createFixture(
      () => driftClock,
    );

  const driftDraft =
    await driftFixture.controller.createDraft({
      workspace_id:
        'ws_a',
      origin: {
        kind:
          'BLANK',
      },
    });

  driftDraft
    .reusable_configuration
    .sources = {
      'google-search-console-query-page': {
        included:
          true,
        task_id:
          'gsc-current-90-days',
        date_policy:
          'TODAY_MINUS_90_TO_YESTERDAY',
      },
    };

  const driftReview =
    await driftFixture.controller
      .reviewDraft(
        driftDraft,
      );

  assert.ok(
    driftReview.reviewed_draft,
    'GSC Current Review must return a reviewed artifact before Start.',
  );

  assert.equal(
    typeof isDesktopReviewedRunDraft,
    'function',
    'Reviewed desktop Run payload guard must be exported.',
  );

  assert.equal(
    isDesktopReviewedRunDraft(
      driftReview.reviewed_draft,
    ),
    true,
    'Reviewed desktop Run payload guard must accept the Review artifact.',
  );

  driftClock =
    new Date(
      '2026-09-15T09:30:00.000Z',
    );

  await driftFixture.controller
    .startDraft(
      driftReview.reviewed_draft,
    );

  assert.equal(
    driftFixture.reservations.length,
    1,
    'Starting a reviewed artifact must reserve exactly one Run.',
  );

  assert.equal(
    driftFixture
      .reservations[0]
      .configuration_snapshot
      .reference_date,
    '2026-09-14',
    'Start must preserve the exact reviewed GSC Current dates.',
  );

  assert.deepEqual(
    driftFixture
      .reservations[0]
      .job_plans[0]
      .source_context
      .source_config
      .date_ranges,
    [
      {
        job_key:
          'gsc-current-90-days',
        task_id:
          'gsc-current-90-days',
        requested_date_start:
          '2026-06-16',
        requested_date_end:
          '2026-09-13',
      },
    ],
    'Start must build Jobs from the reviewed resolved configuration.',
  );

  let longClock =
    new Date(
      '2026-09-14T09:30:00.000Z',
    );

  const longFixture =
    createFixture(
      () => longClock,
    );

  const gscLongDraft =
    await longFixture.controller
      .createDraft({
        workspace_id:
          'ws_a',
        origin: {
          kind:
            'BLANK',
        },
      });

  gscLongDraft
    .reusable_configuration
    .sources = {
      'google-search-console-query-page': {
        included:
          true,
        task_id:
          'gsc-long-16-months',
        date_policy:
          'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
      },
    };

  const gscLongReview =
    await longFixture.controller
      .reviewDraft(
        gscLongDraft,
      );

  assert.ok(
    gscLongReview.reviewed_draft,
    'GSC Long Review must return a reviewed artifact.',
  );

  assert.equal(
    gscLongReview
      .reviewed_draft
      .task_id,
    'gsc-long-16-months',
    'GSC Long reviewed artifact must preserve task identity.',
  );

  assert.equal(
    gscLongReview
      .reviewed_draft
      .reference_date,
    '2026-09-14',
    'GSC Long Review must capture the local reference date once.',
  );

  assert.deepEqual(
    gscLongReview
      .reviewed_draft
      .resolved_configuration
      .sources[
        'google-search-console-query-page'
      ]
      .date_ranges,
    [
      {
        job_key:
          'gsc-long-16-months',
        task_id:
          'gsc-long-16-months',
        requested_date_start:
          '2025-05-14',
        requested_date_end:
          '2026-09-13',
      },
    ],
    'GSC Long Review must resolve the exact absolute date range.',
  );

  longClock =
    new Date(
      '2026-09-15T09:30:00.000Z',
    );

  await longFixture.controller
    .startDraft(
      gscLongReview.reviewed_draft,
    );

  assert.equal(
    longFixture
      .reservations[0]
      .configuration_snapshot
      .reference_date,
    '2026-09-14',
    'GSC Long Start must not re-resolve dates after midnight.',
  );

  assert.deepEqual(
    longFixture
      .reservations[0]
      .job_plans[0]
      .source_context
      .source_config
      .date_ranges,
    [
      {
        job_key:
          'gsc-long-16-months',
        task_id:
          'gsc-long-16-months',
        requested_date_start:
          '2025-05-14',
        requested_date_end:
          '2026-09-13',
      },
    ],
    'GSC Long Start must build Jobs from the exact reviewed configuration.',
  );

  let googleTrendsClock =
    new Date(
      '2026-09-14T09:30:00.000Z',
    );

  const googleTrendsBase =
    createFixture(
      () => googleTrendsClock,
    );

  const googleTrendsController =
    new DesktopMultiSourceController({
      repository:
        googleTrendsBase.repository,
      readiness: {
        getReadiness:
          async (
            workspace_id,
            source_id,
          ) =>
            READY(
              workspace_id,
              source_id,
            ),
      },
      application_version:
        'test',
      source_order: [
        'google-trends',
      ],
      google_trends_query_groups: [
        {
          query_group_id:
            'GT01',
          query_group_name:
            'indoor_plants',
          queries: [
            'ficus',
            'monstera',
          ],
        },
        {
          query_group_id:
            'GT02',
          query_group_name:
            'plant_types',
          queries: [
            'ficus',
            'sukulent',
          ],
        },
      ],
      execute_run:
        async (run_id) =>
          googleTrendsBase
            .executions
            .push(run_id),
      now:
        () => googleTrendsClock,
    });

  const googleTrendsDraft =
    await googleTrendsController
      .createDraft({
        workspace_id:
          'ws_a',
        origin: {
          kind:
            'BLANK',
        },
      });

  googleTrendsDraft
    .reusable_configuration
    .sources = {
      'google-trends': {
        included:
          true,
        task_id:
          'google-trends-interest-over-time',
        date_policy:
          'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
      },
    };

  const googleTrendsReview =
    await googleTrendsController
      .reviewDraft(
        googleTrendsDraft,
      );

  assert.ok(
    googleTrendsReview.reviewed_draft,
    'Google Trends Review must produce an exact reviewed artifact.',
  );

  assert.equal(
    googleTrendsReview
      .reviewed_draft
      .task_id,
    'google-trends-interest-over-time',
  );

  assert.equal(
    googleTrendsReview
      .reviewed_draft
      .source_id,
    'google-trends',
  );

  assert.equal(
    googleTrendsReview
      .reviewed_draft
      .reference_date,
    '2026-09-14',
  );

  const googleTrendsResolved =
    googleTrendsReview
      .reviewed_draft
      .resolved_configuration;

  assert.equal(
    googleTrendsResolved
      .source_mode,
    'GOOGLE_TRENDS_UI',
    'Reviewed configuration must retain Google Trends UI source mode.',
  );

  assert.equal(
    googleTrendsResolved
      .country_code,
    'TR',
  );

  assert.equal(
    googleTrendsResolved
      .category_name,
    'All Categories',
  );

  assert.equal(
    googleTrendsResolved
      .search_type,
    'WEB_SEARCH',
  );

  assert.equal(
    googleTrendsResolved
      .selection_type,
    'SEARCH_TERM',
  );

  assert.equal(
    googleTrendsResolved
      .dataset_type,
    'INTEREST_OVER_TIME',
  );

  assert.equal(
    googleTrendsResolved
      .requested_date_start,
    '2024-09-14',
  );

  assert.equal(
    googleTrendsResolved
      .requested_date_end,
    '2026-09-13',
  );

  assert.deepEqual(
    googleTrendsResolved
      .selected_query_groups,
    [
      {
        query_group_id:
          'GT01',
        query_group_name:
          'indoor_plants',
        queries: [
          'ficus',
          'monstera',
        ],
      },
      {
        query_group_id:
          'GT02',
        query_group_name:
          'plant_types',
        queries: [
          'ficus',
          'sukulent',
        ],
      },
    ],
    'Google Trends Review must materialize every configured comparison group.',
  );

  const resolvedGoogleTrendsSource =
    googleTrendsResolved
      .sources['google-trends'];

  assert.equal(
    resolvedGoogleTrendsSource
      .requested_date_start,
    '2024-09-14',
  );

  assert.equal(
    resolvedGoogleTrendsSource
      .requested_date_end,
    '2026-09-13',
  );

  assert.deepEqual(
    resolvedGoogleTrendsSource
      .query_groups
      .map(
        (group) => ({
          query_group_id:
            group.query_group_id,
          queries:
            group.queries,
        }),
      ),
    [
      {
        query_group_id:
          'GT01',
        queries: [
          'ficus',
          'monstera',
        ],
      },
      {
        query_group_id:
          'GT02',
        queries: [
          'ficus',
          'sukulent',
        ],
      },
    ],
    'Duplicate query text across comparison groups must remain in separate group contexts.',
  );

  assert.equal(
    googleTrendsReview.job_count,
    2,
    'Google Trends Review must plan one independent Job per comparison group.',
  );

  assert.equal(
    googleTrendsReview.can_start,
    true,
  );

  googleTrendsClock =
    new Date(
      '2026-09-15T09:30:00.000Z',
    );

  await googleTrendsController
    .startDraft(
      googleTrendsReview
        .reviewed_draft,
    );

  assert.equal(
    googleTrendsBase
      .reservations.length,
    1,
  );

  const googleTrendsReservation =
    googleTrendsBase
      .reservations[0];

  assert.equal(
    googleTrendsReservation
      .configuration_snapshot
      .reference_date,
    '2026-09-14',
    'Google Trends Start must preserve the reviewed reference date after clock drift.',
  );

  assert.equal(
    googleTrendsReservation
      .configuration_snapshot
      .requested_date_start,
    '2024-09-14',
  );

  assert.equal(
    googleTrendsReservation
      .configuration_snapshot
      .requested_date_end,
    '2026-09-13',
  );

  assert.deepEqual(
    googleTrendsReservation
      .job_plans
      .map(
        (plan) =>
          plan.query_group_id,
      ),
    [
      'GT01',
      'GT02',
    ],
    'Google Trends Start must persist one Job per configured comparison group.',
  );

  assert.deepEqual(
    googleTrendsReservation
      .job_plans
      .map(
        (plan) =>
          plan.source_context
            .query_group
            .queries,
      ),
    [
      [
        'ficus',
        'monstera',
      ],
      [
        'ficus',
        'sukulent',
      ],
    ],
    'Google Trends Job context must preserve comparison-group query membership.',
  );

  const { controller, reservations, executions } = createFixture();
  const createdPreset = controller.createPreset({
    workspace_id: 'ws_b',
    preset_name: 'Blog-Agentic-Beklentisi',
    reusable_configuration: {
      sources: {},
    },
  });
  assert.equal(createdPreset.workspace_id, 'ws_b');
  assert.equal(createdPreset.preset_name, 'Blog-Agentic-Beklentisi');
  assert.equal(controller.listPresets('ws_b').length, 1);

  const updatedPreset = controller.updatePreset({
    workspace_id: 'ws_b',
    preset_id: createdPreset.preset_id,
    preset_name: 'Renamed preset',
    reusable_configuration: {
      sources: {
        'google-trends': { included: true },
      },
    },
  });
  assert.equal(updatedPreset.preset_name, 'Renamed preset');
  assert.deepEqual(updatedPreset.reusable_configuration, {
    sources: {
      'google-trends': { included: true },
    },
  });

  controller.deletePreset('ws_b', createdPreset.preset_id);
  assert.equal(controller.listPresets('ws_b').length, 0);

  const draft = await controller.createDraft({ workspace_id: 'ws_a', origin: { kind: 'SAVED_PRESET', preset_id: 'sp_a' } });
  assert.equal(draft.workspace_id, 'ws_a');
  draft.reusable_configuration.sources.serpapi = { included: false };
  const review = await controller.reviewDraft(draft);
  assert.deepEqual(review.included_sources, ['google-trends', 'ikas-products']);
  assert.equal(review.can_start, true);
  const started = await controller.startDraft(draft);
  assert.equal(started.run.workspace_id, 'ws_a');
  assert.equal(JSON.stringify(draft).includes('do-not-leak'), false);
  assert.equal(reservations.length, 1);
  assert.deepEqual(executions, ['rr_1']);
  assert.deepEqual(reservations[0].job_plans.map((p) => p.source_id), ['google-trends', 'ikas-products']);

  await assert.rejects(
    () => controller.createDraft({
      workspace_id: 'ws_a',
      origin: { kind: 'LAST_RUN_SETTINGS' },
    }),
    /Last Run Settings.*not available/i,
  );

  const connectionFixture = createFixture(
    undefined,
    [
      'google-trends',
      'google-search-console-query-page',
      'google-ads-search-terms',
      'google-keyword-planner',
      'google-keyword-planner-csv',
      'ikas-products',
      'bitkimark-sitemap',
      'serpapi',
    ],
    [
      {
        workspace_id: 'ws_a',
        source_id:
          'google-search-console-query-page',
        credential_ref: 'cred:google',
      },
      {
        workspace_id: 'ws_a',
        source_id:
          'google-ads-search-terms',
        credential_ref: 'cred:missing',
      },
      {
        workspace_id: 'ws_a',
        source_id: 'serpapi',
        credential_ref: 'cred:serpapi',
      },
    ],
    new Set([
      'cred:google',
      'cred:serpapi',
    ]),
  );

  connectionFixture.controller
    .setReadinessEvaluator(
      async (
        _workspace_id,
        source_id,
      ) => {
        const statuses = {
          'google-search-console-query-page':
            'MANUAL_ACTION_REQUIRED',
          'google-ads-search-terms':
            'CONNECTION_REQUIRED',
          'google-keyword-planner':
            'CONFIGURATION_REQUIRED',
          'google-analytics-4':
            'CONFIGURATION_REQUIRED',
          serpapi: 'READY',
        };

        return {
          ...READY(
            'ws_a',
            source_id,
          ),
          readiness_status:
            statuses[source_id]
            ?? 'READY',
        };
      },
    );

  const safeConnections =
    typeof connectionFixture
      .controller
      .getWorkspaceConnections
      === 'function'
      ? await connectionFixture
        .controller
        .getWorkspaceConnections(
          'ws_a',
        )
      : null;

  assert.deepEqual(
    safeConnections,
    [
      {
        source_id:
          'google-search-console-query-page',
        credential_status: 'AVAILABLE',
        readiness_status:
          'MANUAL_ACTION_REQUIRED',
      },
      {
        source_id:
          'google-ads-search-terms',
        credential_status: 'MISSING',
        readiness_status:
          'CONNECTION_REQUIRED',
      },
      {
        source_id:
          'google-keyword-planner',
        credential_status:
          'NOT_CONFIGURED',
        readiness_status:
          'CONFIGURATION_REQUIRED',
      },
      {
        source_id:
          'google-ads-search-reporting',
        credential_status:
          'NOT_CONFIGURED',
        readiness_status:
          'READY',
      },
      {
        source_id:
          'google-ads-change-history',
        credential_status:
          'NOT_CONFIGURED',
        readiness_status:
          'READY',
      },
      {
        source_id:
          'google-ads-configuration',
        credential_status:
          'NOT_CONFIGURED',
        readiness_status:
          'READY',
      },
      {
        source_id:
          'google-analytics-4',
        credential_status:
          'NOT_CONFIGURED',
        readiness_status:
          'CONFIGURATION_REQUIRED',
      },
      {
        source_id: 'serpapi',
        credential_status: 'AVAILABLE',
        readiness_status: 'READY',
      },
    ],
    'Desktop connection read model must separate credential availability from readiness and include only credential-managed sources.',
  );

  const serializedConnections =
    JSON.stringify(
      safeConnections,
    );

  assert.equal(
    serializedConnections.includes(
      'credential_ref',
    ),
    false,
    'Desktop connection read model must not expose credential_ref.',
  );

  assert.equal(
    serializedConnections.includes(
      'cred:',
    ),
    false,
    'Desktop connection read model must not expose credential references.',
  );

  assert.equal(
    serializedConnections.includes(
      'do-not-leak',
    ),
    false,
    'Desktop connection read model must not expose secret-like configuration values.',
  );

  const blockedController = createFixture(
    undefined,
    [
      'google-trends',
      'google-search-console-query-page',
      'serpapi',
      'ikas-products',
      'google-keyword-planner-csv',
    ],
  ).controller;
  blockedController.setReadinessEvaluator(
    async (_workspace_id, source_id) => {
      if (source_id === 'ikas-products') {
        return {
          ...READY('ws_a', source_id),
          readiness_status: 'FILE_REQUIRED',
        };
      }

      if (source_id === 'google-keyword-planner-csv') {
        return {
          ...READY('ws_a', source_id),
          readiness_status: 'FILE_REQUIRED',
        };
      }

      if (source_id === 'serpapi') {
        return {
          ...READY('ws_a', source_id),
          readiness_status: 'CONNECTION_REQUIRED',
        };
      }

      if (source_id === 'google-trends') {
        return {
          ...READY('ws_a', source_id),
          readiness_status: 'CONFIGURATION_REQUIRED',
        };
      }

      if (source_id === 'google-search-console-query-page') {
        return {
          ...READY('ws_a', source_id),
          readiness_status: 'MANUAL_ACTION_REQUIRED',
        };
      }

      return READY('ws_a', source_id);
    },
  );
  const blockedDraft = await blockedController.createDraft({ workspace_id: 'ws_a', origin: { kind: 'SAVED_PRESET', preset_id: 'sp_a' } });
  blockedDraft.reusable_configuration.sources['google-search-console-query-page'] = { included: true };
  blockedDraft.reusable_configuration.sources['google-keyword-planner-csv'] = { included: true };
  const blockedReview = await blockedController.reviewDraft(blockedDraft);
  assert.equal(blockedReview.can_start, false);
  const blockedIkasCard =
    blockedReview.source_cards.find(
      (card) => card.source_id === 'ikas-products',
    );

  assert.ok(blockedIkasCard);

  assert.equal(
    blockedIkasCard.readiness_status,
    'FILE_REQUIRED',
  );

  assert.equal(
    blockedIkasCard.readiness_reason,
    'A Products XLSX file is required before this task can be reviewed.',
  );

  assert.deepEqual(
    blockedIkasCard.readiness_remediation,
    {
      kind: 'SELECT_FILE',
      label: 'Select Products XLSX',
    },
  );

  assert.equal(
    blockedIkasCard.freshness_status,
    'IMPORT_NEEDED',
    'Readiness remediation must not replace or alter freshness.',
  );

  const blockedKeywordPlannerCsvCard =
    blockedReview.source_cards.find(
      (card) => card.source_id === 'google-keyword-planner-csv',
    );

  assert.ok(blockedKeywordPlannerCsvCard);
  assert.equal(
    blockedKeywordPlannerCsvCard.readiness_status,
    'FILE_REQUIRED',
  );
  assert.equal(
    blockedKeywordPlannerCsvCard.readiness_reason,
    'A Keyword Stats CSV file is required before this task can be reviewed.',
  );
  assert.deepEqual(
    blockedKeywordPlannerCsvCard.readiness_remediation,
    {
      kind: 'SELECT_FILE',
      label: 'Select Keyword Stats CSV',
    },
  );
  assert.equal(
    blockedKeywordPlannerCsvCard.freshness_status,
    'IMPORT_NEEDED',
    'File readiness remediation must remain independent from import freshness.',
  );

  const blockedSerpApiCard =
    blockedReview.source_cards.find(
      (card) => card.source_id === 'serpapi',
    );

  assert.ok(blockedSerpApiCard);

  assert.equal(
    blockedSerpApiCard.readiness_status,
    'CONNECTION_REQUIRED',
  );

  assert.equal(
    blockedSerpApiCard.readiness_reason,
    'A Workspace connection is required before this task can be reviewed.',
  );

  assert.deepEqual(
    blockedSerpApiCard.readiness_remediation,
    {
      kind: 'CONNECT_SOURCE',
      label: 'Manage Connection',
    },
  );

  assert.equal(
    blockedSerpApiCard.freshness_status,
    'ON_DEMAND',
    'Connection readiness must remain independent from on-demand freshness.',
  );

  const blockedGoogleTrendsCard =
    blockedReview.source_cards.find(
      (card) => card.source_id === 'google-trends',
    );

  assert.ok(blockedGoogleTrendsCard);

  assert.equal(
    blockedGoogleTrendsCard.readiness_status,
    'CONFIGURATION_REQUIRED',
  );

  assert.equal(
    blockedGoogleTrendsCard.readiness_reason,
    'Source configuration is required before this task can be reviewed.',
  );

  assert.deepEqual(
    blockedGoogleTrendsCard.readiness_remediation,
    {
      kind: 'CONFIGURE_SOURCE',
      label: 'Configure Source',
    },
  );

  assert.equal(
    blockedGoogleTrendsCard.freshness_status,
    'UNKNOWN',
    'Configuration readiness must remain independent from freshness.',
  );

  const blockedGscCard =
    blockedReview.source_cards.find(
      (card) => card.source_id === 'google-search-console-query-page',
    );

  assert.ok(blockedGscCard);

  assert.equal(
    blockedGscCard.readiness_status,
    'MANUAL_ACTION_REQUIRED',
  );

  assert.equal(
    blockedGscCard.readiness_reason,
    'Manual action is required before this task can be reviewed.',
  );

  assert.deepEqual(
    blockedGscCard.readiness_remediation,
    {
      kind: 'MANUAL_ACTION',
      label: 'Review Required Action',
    },
  );

  assert.equal(
    blockedGscCard.freshness_status,
    'UNKNOWN',
    'Manual-action readiness must remain independent from freshness.',
  );
  await assert.rejects(() => blockedController.startDraft(blockedDraft), /not ready/i);

  const runInputFixture =
    createFixture();

  const runInputController =
    runInputFixture.controller;

  runInputController.setReadinessEvaluator(
    async (
      workspace_id,
      source_id,
      source_config,
    ) => {
      if (source_id !== 'ikas-products') {
        return READY(
          workspace_id,
          source_id,
        );
      }

      return {
        ...READY(
          workspace_id,
          source_id,
        ),
        readiness_status:
          source_config
          && typeof source_config.file_path === 'string'
          && source_config.file_path.length > 0
            ? 'READY'
            : 'FILE_REQUIRED',
      };
    },
  );

  const runInputPreset =
    runInputFixture.repository
      .createSavedCollectionPreset({
        workspace_id:
          'ws_a',
        preset_name:
          'Ikas without persisted file',
        reusable_configuration: {
          sources: {
            'ikas-products': {
              included:
                true,
            },
          },
        },
      });

  const runInputDraft =
    await runInputController.createDraft({
      workspace_id:
        'ws_a',
      origin: {
        kind:
          'SAVED_PRESET',
        preset_id:
          runInputPreset.preset_id,
      },
    });

  runInputDraft.run_scoped_inputs = {
    sources: {
      'ikas-products': {
        file_path:
          '/tmp/current-products.xlsx',
      },
    },
  };

  const runInputReview =
    await runInputController.reviewDraft(
      runInputDraft,
    );

  assert.deepEqual(
    runInputReview.included_sources,
    [
      'ikas-products',
    ],
  );

  assert.equal(
    runInputReview.can_start,
    true,
    'Run-scoped İkas file_path must participate in Preset Review readiness without becoming reusable configuration.',
  );

  assert.ok(
    runInputReview.reviewed_draft,
    'Run-scoped İkas input must produce an exact reviewed artifact.',
  );

  assert.equal(
    runInputReview.reviewed_draft
      .reusable_configuration
      .sources['ikas-products']
      .file_path,
    undefined,
    'Saved Preset reusable configuration must not persist the selected run-scoped file.',
  );

  assert.equal(
    runInputReview.reviewed_draft
      .resolved_configuration
      .sources['ikas-products']
      .file_path,
    '/tmp/current-products.xlsx',
    'Reviewed resolved configuration must bind the exact selected İkas file path.',
  );

  await runInputController.startDraft(
    runInputReview.reviewed_draft,
  );

  assert.equal(
    runInputFixture.reservations.at(-1)
      .job_plans[0]
      .source_context
      .source_config
      .file_path,
    '/tmp/current-products.xlsx',
    'Reviewed Start must plan the exact frozen İkas file path.',
  );

  assert.equal(
    runInputPreset
      .reusable_configuration
      .sources['ikas-products']
      .file_path,
    undefined,
    'Starting the reviewed Run must not mutate the Saved Preset with run-scoped evidence.',
  );

  console.log('PASS DESKTOP-MULTISOURCE-001: Workspace-scoped draft/review/start plans heterogeneous sources and blocks non-ready included sources');
  let dispatched = null;
  let dispatchCount = 0;
  const executionService = new DesktopExecutionService({ runUntilBlocked: async (run_id) => { dispatchCount += 1; dispatched = run_id; await new Promise((resolve) => setTimeout(resolve, 5)); return { steps: [], stopped_because: 'RUN_COMPLETED' }; } });
  await Promise.all([executionService.execute('rr_dispatch'), executionService.execute('rr_dispatch')]);
  assert.equal(dispatched, 'rr_dispatch');
  assert.equal(dispatchCount, 1);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
