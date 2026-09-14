const assert = require('node:assert/strict');

const {
  DesktopMultiSourceController,
} = require(`${process.argv[2]}/main/app/desktop-multisource-controller.js`);
const { DesktopExecutionService } = require(`${process.argv[2]}/main/app/desktop-execution-service.js`);

const READY = (workspace_id, source_id) => ({ workspace_id, source_id, readiness_status: 'READY', checked_at: '2026-09-11T00:00:00.000Z', message: null });

const createFixture = () => {
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
    application_version: 'test',
    source_order: ['google-trends', 'google-search-console-query-page', 'serpapi', 'ikas-products'],
    job_planner: (source_id, source_config) => [{ source_id, job_key: `${source_id}-job`, query_group_id: null, source_context: { source_config } }],
    execute_run: async (run_id) => executions.push(run_id),
  });
  return { controller, repository, reservations, executions };
};

async function main() {
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

  controller.deletePreset('ws_b', createdPreset.preset_id);
  assert.equal(controller.listPresets('ws_b').length, 0);

  const draft = controller.createDraft({ workspace_id: 'ws_a', origin: { kind: 'SAVED_PRESET', preset_id: 'sp_a' } });
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

  assert.throws(
    () => controller.createDraft({
      workspace_id: 'ws_a',
      origin: { kind: 'LAST_RUN_SETTINGS' },
    }),
    /Last Run Settings.*not available/i,
  );

  const blockedController = createFixture().controller;
  blockedController.setReadinessEvaluator(async (_workspace_id, source_id) => source_id === 'ikas-products' ? { ...READY('ws_a', source_id), readiness_status: 'FILE_REQUIRED' } : READY('ws_a', source_id));
  const blockedDraft = blockedController.createDraft({ workspace_id: 'ws_a', origin: { kind: 'SAVED_PRESET', preset_id: 'sp_a' } });
  const blockedReview = await blockedController.reviewDraft(blockedDraft);
  assert.equal(blockedReview.can_start, false);
  await assert.rejects(() => blockedController.startDraft(blockedDraft), /not ready/i);

  console.log('PASS DESKTOP-MULTISOURCE-001: Workspace-scoped draft/review/start plans heterogeneous sources and blocks non-ready included sources');
  let dispatched = null;
  let dispatchCount = 0;
  const executionService = new DesktopExecutionService({ runUntilBlocked: async (run_id) => { dispatchCount += 1; dispatched = run_id; await new Promise((resolve) => setTimeout(resolve, 5)); return { steps: [], stopped_because: 'RUN_COMPLETED' }; } });
  await Promise.all([executionService.execute('rr_dispatch'), executionService.execute('rr_dispatch')]);
  assert.equal(dispatched, 'rr_dispatch');
  assert.equal(dispatchCount, 1);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
