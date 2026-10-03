const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const buildRoot = process.argv[2];

if (!buildRoot) {
  throw new Error('Expected compiled build root.');
}

const plannerModulePath = path.join(
  buildRoot,
  'main',
  'sources',
  'google-analytics-4',
  'google-analytics-4-job-plans.js',
);

assert.ok(
  fs.existsSync(plannerModulePath),
  'GA4 source-local Job planner module must exist',
);

const {
  createGoogleAnalytics4JobPlans,
} = require(plannerModulePath);

assert.equal(
  typeof createGoogleAnalytics4JobPlans,
  'function',
  'GA4 Job planner must be exported',
);

const plans = createGoogleAnalytics4JobPlans({
  start_date: '2026-09-01',
  end_date: '2026-09-30',
});

assert.deepEqual(
  plans,
  [
    {
      source_id: 'google-analytics-4',
      job_key: 'GA4_CONTENT_PERFORMANCE',
      query_group_id: null,
      source_context: {
        dataset_type: 'GA4_CONTENT_PERFORMANCE',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
      },
    },
    {
      source_id: 'google-analytics-4',
      job_key: 'GA4_PAID_FUNNEL',
      query_group_id: null,
      source_context: {
        dataset_type: 'GA4_PAID_FUNNEL',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        session_filter: {
          session_source: 'google',
          session_medium: 'cpc',
        },
      },
    },
  ],
  'GA4 planner must produce exactly two source-owned dataset Jobs',
);

assert.equal(
  plans.every(
    (plan) => plan.query_group_id === null,
  ),
  true,
);

assert.equal(
  plans.every(
    (plan) =>
      /^\d{4}-\d{2}-\d{2}$/u.test(
        plan.source_context.start_date,
      )
      && /^\d{4}-\d{2}-\d{2}$/u.test(
        plan.source_context.end_date,
      ),
  ),
  true,
  'persisted GA4 Job context must contain resolved absolute dates',
);

const contentPlan = plans.find(
  (plan) =>
    plan.job_key === 'GA4_CONTENT_PERFORMANCE',
);

const paidPlan = plans.find(
  (plan) =>
    plan.job_key === 'GA4_PAID_FUNNEL',
);

assert.ok(contentPlan);
assert.ok(paidPlan);

assert.deepEqual(
  Object.keys(contentPlan.source_context).sort(),
  [
    'dataset_type',
    'end_date',
    'start_date',
  ],
  'content Job context must stay minimal',
);

assert.deepEqual(
  Object.keys(paidPlan.source_context).sort(),
  [
    'dataset_type',
    'end_date',
    'session_filter',
    'start_date',
  ],
  'paid Job context must persist only the locked semantic filter, not provider request syntax',
);

assert.deepEqual(
  paidPlan.source_context.session_filter,
  {
    session_source: 'google',
    session_medium: 'cpc',
  },
);

for (const plan of plans) {
  assert.equal(
    Object.hasOwn(plan.source_context, 'property_id'),
    false,
    'Property ID belongs to Workspace connection metadata',
  );

  assert.equal(
    Object.hasOwn(plan.source_context, 'dimensionFilter'),
    false,
    'GA4 Data API FilterExpression syntax belongs to the source request layer',
  );
}

assert.throws(
  () => createGoogleAnalytics4JobPlans({
    start_date: 'TODAY_MINUS_28_TO_YESTERDAY',
    end_date: '2026-09-30',
  }),
  /date/i,
  'relative date policy strings must never enter persisted GA4 Job context',
);

assert.throws(
  () => createGoogleAnalytics4JobPlans({
    start_date: '2026-02-30',
    end_date: '2026-03-01',
  }),
  /date/i,
  'invalid calendar dates must fail before Job planning',
);

assert.throws(
  () => createGoogleAnalytics4JobPlans({
    start_date: '2026-10-01',
    end_date: '2026-09-01',
  }),
  /date/i,
  'reversed GA4 date ranges must fail before Job planning',
);


(async () => {
const {
  DesktopMultiSourceController,
} = require(
  `${buildRoot}/main/app/desktop-multisource-controller.js`,
);

const workspace = {
  workspace_id: 'ws-ga4',
  workspace_name: 'GA4 Workspace',
  created_at: '2026-10-03T00:00:00.000Z',
};

const reservations = [];

const controller = new DesktopMultiSourceController({
  repository: {
    listWorkspaces: () => [workspace],
    getWorkspace: (workspaceId) =>
      workspaceId === workspace.workspace_id
        ? workspace
        : null,
    listSavedCollectionPresets: () => [],
    getSavedCollectionPreset: () => null,
    createSavedCollectionPreset: () => {
      throw new Error('unused');
    },
    updateSavedCollectionPreset: () => {
      throw new Error('unused');
    },
    deleteSavedCollectionPreset: () => {
      throw new Error('unused');
    },
    getLastRunSettings: () => null,
    listSourceConnections: () => [],
    reserveRunFromJobPlans: (input) => {
      reservations.push(input);

      return {
        run: {
          run_id: 'run-ga4-desktop',
          workspace_id: input.workspace_id,
          run_status: 'PENDING',
          created_at: '2026-10-03T00:00:00.000Z',
          started_at: null,
          completed_at: null,
          application_version: 'test',
          selected_sources: input.job_plans
            .map((plan) => plan.source_id)
            .filter(
              (sourceId, index, values) =>
                values.indexOf(sourceId) === index,
            ),
          requested_configuration: null,
          configuration_snapshot:
            input.configuration_snapshot,
        },
        jobs: input.job_plans.map(
          (plan, index) => ({
            job_id: `job-ga4-${index + 1}`,
            run_id: 'run-ga4-desktop',
            ...plan,
            job_order: index,
            execution_status: 'PENDING',
            validation_status: 'NOT_RUN',
            attempt_count: 0,
            accepted_artifact_id: null,
            created_at: '2026-10-03T00:00:00.000Z',
            started_at: null,
            completed_at: null,
          }),
        ),
      };
    },
    listJobs: () => [],
    getRun: () => null,
    getArtifact: () => null,
  },
  readiness: {
    getReadiness: async () => ({
      readiness_status: 'READY',
    }),
  },
  application_version: 'test',
  source_order: ['google-analytics-4'],
  now: () =>
    new Date('2026-10-03T12:00:00.000Z'),
});

const draft = {
  workspace_id: 'ws-ga4',
  origin: {
    kind: 'LAST_RUN_SETTINGS',
  },
  reusable_configuration: {
    sources: {
      'google-analytics-4': {
        included: true,
        start_date: '2026-09-01',
        end_date: '2026-09-30',
      },
    },
  },
  source_cards: [],
};

const review = await controller.reviewDraft(draft);

assert.equal(
  review.job_count,
  2,
  'desktop controller must delegate GA4 planning to the source-local planner',
);

assert.equal(
  review.can_start,
  true,
  'READY GA4 with explicit absolute dates must be startable',
);

await controller.startDraft(draft);

assert.equal(
  reservations.length,
  1,
);

assert.deepEqual(
  reservations[0].job_plans,
  plans,
  'desktop controller must persist the source-local GA4 Job plans without rebuilding provider semantics',
);

const controllerSource = fs.readFileSync(
  path.join(
    process.cwd(),
    'src',
    'main',
    'app',
    'desktop-multisource-controller.ts',
  ),
  'utf8',
);

for (const forbiddenProviderSemantic of [
  'GA4_CONTENT_PERFORMANCE',
  'GA4_PAID_FUNNEL',
  'session_source',
  'session_medium',
  "'cpc'",
  '"cpc"',
]) {
  assert.equal(
    controllerSource.includes(
      forbiddenProviderSemantic,
    ),
    false,
    `desktop controller must not own GA4 provider semantic: ${forbiddenProviderSemantic}`,
  );
}

console.log(
  'PASS GA4-DESKTOP-002: controller delegates GA4 planning without owning dataset/filter semantics',
);

})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

console.log(
  'PASS GA4-DESKTOP-001: source-local GA4 Job planning owns dataset semantics and persists only exact absolute request context',
);
