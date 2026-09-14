const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const [baseUrl] = process.argv.slice(2);

if (!baseUrl) {
  throw new Error('Expected renderer base URL.');
}

const applicationInfo = {
  name: 'RoofRoom Data Collector',
  version: '1.0.0-test',
  platform: 'darwin',
  architecture: 'arm64',
  electronVersion: '43.4.0-test',
};

const bootstrapStatus = {
  directories: {
    app_data_root: '/fixture/app-data',
    config: '/fixture/app-data/config',
    data: '/fixture/app-data/data',
    runs: '/fixture/app-data/data/runs',
    database: '/fixture/app-data/database',
    browser_profiles: '/fixture/app-data/browser-profiles',
    logs: '/fixture/app-data/logs',
    public_downloads: '/fixture/downloads',
  },
  query_config: {
    status: 'READY',
    config_path: '/fixture/query-groups.yaml',
    config: {
      config_version: 1,
      source_id: 'google-trends',
      groups: [],
    },
  },
  source_registry: {
    status: 'READY',
    sources: [],
  },
  database: {
    status: 'READY',
    database_path: '/fixture/roofroom.sqlite',
    schema_version: 4,
    sqlite_version: '3-test',
    journal_mode: 'wal',
    foreign_keys: true,
    migrations_applied: 4,
    quick_check: 'ok',
  },
};

const legacyCollectionState = {
  phase: 'IDLE',
  operation: null,
  run_id: null,
  run_status: null,
  total_groups: 0,
  groups_started: 0,
  groups_collected: 0,
  current_group_id: null,
  jobs: [],
  recovery: {
    run_id: null,
    can_resume: false,
    can_retry: false,
    manual_action_required: false,
  },
  export: {
    status: 'NOT_STARTED',
    export_directory: null,
    workbook_path: null,
    normalized_row_count: 0,
    error: null,
  },
  message: null,
  updated_at: '2026-09-14T12:00:00.000Z',
};

const sourceCards = [
  {
    source_id: 'google-trends',
    source_name: 'Google Trends',
    included: false,
    readiness_status: 'READY',
    configuration_summary: '6 query groups',
  },
  {
    source_id: 'google-search-console-query-page',
    source_name: 'Google Search Console',
    included: false,
    readiness_status: 'READY',
    configuration_summary: 'Query × Page',
  },
  {
    source_id: 'google-ads-search-terms',
    source_name: 'Google Ads Search Terms',
    included: false,
    readiness_status: 'CONNECTION_REQUIRED',
    configuration_summary: 'Search Terms',
  },
  {
    source_id: 'google-keyword-planner',
    source_name: 'Keyword Planner',
    included: false,
    readiness_status: 'CONNECTION_REQUIRED',
    configuration_summary: 'Historical Metrics',
  },
  {
    source_id: 'ikas-products',
    source_name: 'İkas Products',
    included: false,
    readiness_status: 'FILE_REQUIRED',
    configuration_summary: 'Products XLSX',
  },
  {
    source_id: 'bitkimark-sitemap',
    source_name: 'Bitkimark Sitemap',
    included: false,
    readiness_status: 'READY',
    configuration_summary: 'Sitemap/XML',
  },
  {
    source_id: 'serpapi',
    source_name: 'SerpApi',
    included: false,
    readiness_status: 'CONFIGURATION_REQUIRED',
    configuration_summary: 'SERP Snapshot',
  },
];

const draft = {
  workspace_id: 'ws_fixture',
  origin: {
    kind: 'BLANK',
  },
  reusable_configuration: {
    sources: {},
  },
  source_cards: sourceCards,
};

const openRenderer = async (page) => {
  let lastError;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(baseUrl, {
        waitUntil: 'networkidle',
        timeout: 2000,
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw lastError;
};

const main = async () => {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1180,
        height: 920,
      },
      deviceScaleFactor: 1,
    });

    await page.addInitScript(
      ({
        applicationInfo: info,
        bootstrapStatus: bootstrap,
        legacyCollectionState: collection,
        sourceCards: cards,
        draft: blankDraft,
      }) => {
        window.roofroom = {
          // Legacy bridge methods remain available during renderer migration.
          getApplicationInfo: async () => info,
          getBootstrapStatus: async () => bootstrap,
          getCollectionState: async () => collection,
          startCollection: async () => collection,
          resumeCollection: async () => collection,
          retryFailedCollection: async () => collection,
          cancelCollection: async () => collection,
          openDataFolder: async () => {},
          openLatestExport: async () => {},
          openConfigFolder: async () => {},

          getDesktopWorkspaces: async () => ({
            workspaces: [
              {
                workspace_id: 'ws_fixture',
                workspace_name: 'Acceptance Workspace',
                created_at: '2026-09-11T00:00:00.000Z',
              },
            ],
            selected_workspace_id: 'ws_fixture',
            connections: [
              {
                source_id: 'google-search-console-query-page',
                configured: true,
              },
            ],
          }),

          getDesktopPresets: async () => [
            {
              preset_id: 'sp_fixture',
              workspace_id: 'ws_fixture',
              preset_name: 'Blog-Agentic-Beklentisi',
              reusable_configuration: {
                sources: {},
              },
              created_at: '2026-09-14T00:00:00.000Z',
              updated_at: '2026-09-14T00:00:00.000Z',
            },
          ],

          createDesktopDraft: async () => ({
            ...blankDraft,
            source_cards: cards,
          }),

          createDesktopPreset: async () => {
            throw new Error('Not exercised by shell smoke test.');
          },

          deleteDesktopPreset: async () => {
            throw new Error('Not exercised by shell smoke test.');
          },

          reviewDesktopDraft: async (reviewDraft) => {
            window.__reviewedDesktopDraft =
              reviewDraft;

            return {
              workspace: {
                workspace_id: 'ws_fixture',
                workspace_name: 'Acceptance Workspace',
                created_at: '2026-09-11T00:00:00.000Z',
              },
              origin:
                reviewDraft.origin,
              included_sources: [
                'ikas-products',
              ],
              source_cards: [
                {
                  source_id: 'ikas-products',
                  source_name: 'İkas Products',
                  included: true,
                  readiness_status: 'READY',
                  configuration_summary: 'Products XLSX',
                },
              ],
              job_count: 1,
              can_start: true,
              blocking_sources: [],
            };
          },

          startDesktopDraft: async (startedDraft) => {
            window.__startDesktopDraftCalls =
              (
                window.__startDesktopDraftCalls
                ?? 0
              ) + 1;

            window.__startedDesktopDraft =
              startedDraft;

            return {
              run: {
                run_id: 'rr_fixture_ikas_001',
                workspace_id: 'ws_fixture',
                run_status: 'PENDING',
                created_at: '2026-09-14T17:00:00.000Z',
                started_at: null,
                completed_at: null,
                application_version: '1.0.0',
                selected_sources: [
                  'ikas-products',
                ],
                requested_configuration: null,
                configuration_snapshot: {},
              },
              jobs: [
                {
                  job_id: 'job_fixture_ikas_001',
                  run_id: 'rr_fixture_ikas_001',
                  source_id: 'ikas-products',
                  job_key: 'ikas-products-current',
                  query_group_id: null,
                  source_context: {
                    file_path:
                      '/fixture/imports/ikas-products.xlsx',
                  },
                  job_order: 1,
                  execution_status: 'PENDING',
                  validation_status: 'NOT_RUN',
                  attempt_count: 0,
                  accepted_artifact_id: null,
                  created_at: '2026-09-14T17:00:00.000Z',
                  started_at: null,
                  completed_at: null,
                },
              ],
              completed_jobs: 0,
              failed_jobs: 0,
            };
          },

          getDesktopRunState: async (runId) => {
            window.__getDesktopRunStateCalls =
              (
                window.__getDesktopRunStateCalls
                ?? 0
              ) + 1;

            const callNumber =
              window.__getDesktopRunStateCalls;

            window.__lastDesktopRunStateId =
              runId;

            if (callNumber === 1) {
              return {
                run: {
                  run_id: 'rr_fixture_ikas_001',
                  workspace_id: 'ws_fixture',
                  run_status: 'MANUAL_ACTION_REQUIRED',
                  created_at: '2026-09-14T17:00:00.000Z',
                  started_at: '2026-09-14T17:00:01.000Z',
                  completed_at: null,
                  application_version: '1.0.0',
                  selected_sources: [
                    'ikas-products',
                  ],
                  requested_configuration: null,
                  configuration_snapshot: {},
                },
                jobs: [
                  {
                    job_id: 'job_fixture_ikas_001',
                    run_id: 'rr_fixture_ikas_001',
                    source_id: 'ikas-products',
                    job_key: 'ikas-products-current',
                    query_group_id: null,
                    source_context: {},
                    job_order: 1,
                    execution_status: 'MANUAL_ACTION_REQUIRED',
                    validation_status: 'NOT_RUN',
                    attempt_count: 1,
                    accepted_artifact_id: null,
                    created_at: '2026-09-14T17:00:00.000Z',
                    started_at: '2026-09-14T17:00:01.000Z',
                    completed_at: null,
                  },
                ],
                completed_jobs: 0,
                failed_jobs: 0,
              };
            }

            return {
              run: {
                run_id: 'rr_fixture_ikas_001',
                workspace_id: 'ws_fixture',
                run_status: 'RETRY_REQUIRED',
                created_at: '2026-09-14T17:00:00.000Z',
                started_at: '2026-09-14T17:00:01.000Z',
                completed_at: null,
                application_version: '1.0.0',
                selected_sources: [
                  'ikas-products',
                ],
                requested_configuration: null,
                configuration_snapshot: {},
              },
              jobs: [
                {
                  job_id: 'job_fixture_ikas_001',
                  run_id: 'rr_fixture_ikas_001',
                  source_id: 'ikas-products',
                  job_key: 'ikas-products-current',
                  query_group_id: null,
                  source_context: {},
                  job_order: 1,
                  execution_status: 'FAILED',
                  validation_status: 'ERROR_NOT_DATA',
                  attempt_count: 1,
                  accepted_artifact_id: null,
                  created_at: '2026-09-14T17:00:00.000Z',
                  started_at: '2026-09-14T17:00:01.000Z',
                  completed_at: '2026-09-14T17:00:02.000Z',
                },
              ],
              completed_jobs: 0,
              failed_jobs: 1,
            };
          },

          retryDesktopFailed: async (runId) => {
            window.__retryDesktopFailedCalls =
              (
                window.__retryDesktopFailedCalls
                ?? 0
              ) + 1;

            window.__retriedDesktopRunId =
              runId;

            return {
              run: {
                run_id: 'rr_fixture_ikas_001',
                workspace_id: 'ws_fixture',
                run_status: 'RUNNING',
                created_at: '2026-09-14T17:00:00.000Z',
                started_at: '2026-09-14T17:00:01.000Z',
                completed_at: null,
                application_version: '1.0.0',
                selected_sources: [
                  'ikas-products',
                ],
                requested_configuration: null,
                configuration_snapshot: {},
              },
              jobs: [
                {
                  job_id: 'job_fixture_ikas_001',
                  run_id: 'rr_fixture_ikas_001',
                  source_id: 'ikas-products',
                  job_key: 'ikas-products-current',
                  query_group_id: null,
                  source_context: {},
                  job_order: 1,
                  execution_status: 'RETRY_PENDING',
                  validation_status: 'ERROR_NOT_DATA',
                  attempt_count: 2,
                  accepted_artifact_id: null,
                  created_at: '2026-09-14T17:00:00.000Z',
                  started_at: '2026-09-14T17:00:01.000Z',
                  completed_at: null,
                },
              ],
              completed_jobs: 0,
              failed_jobs: 0,
            };
          },

          exportDesktopRun: async () => {
            throw new Error('Not exercised by shell smoke test.');
          },

          selectDesktopInputFile: async (input) => {
            window.__selectedDesktopInputRequest = input;

            return {
              canceled: false,
              file_path: '/fixture/imports/ikas-products.xlsx',
              file_name: 'ikas-products.xlsx',
            };
          },
        };
      },
      {
        applicationInfo,
        bootstrapStatus,
        legacyCollectionState,
        sourceCards,
        draft,
      },
    );

    await openRenderer(page);

    await page.getByRole('heading', {
      name: 'Collection Operations',
    }).waitFor();

    for (const navigationItem of [
      'HOME',
      'TASKS',
      'RUNS',
      'PRESETS',
      'WORKSPACE',
    ]) {
      assert.equal(
        await page.getByRole('button', {
          name: navigationItem,
        }).count(),
        1,
        `Expected navigation item ${navigationItem}`,
      );
    }

    assert.equal(
      await page.getByText('Acceptance Workspace', {
        exact: true,
      }).count(),
      1,
    );

    const releaseOneTasks = [
      'Google Trends — Interest Over Time',
      'GSC — Current 90 Days',
      'GSC — Long 16 Months',
      'Google Ads — Search Terms',
      'Keyword Planner — Historical Metrics',
      'İkas — Products Import',
      'Bitkimark — Sitemap/XML',
      'SerpApi — SERP Snapshot',
    ];

    for (const taskName of releaseOneTasks) {
      assert.equal(
        await page.getByText(taskName, {
          exact: true,
        }).count(),
        1,
        `Expected HOME task card: ${taskName}`,
      );
    }

    assert.equal(
      await page.locator('[data-testid="task-card"]').count(),
      8,
    );

    assert.equal(
      await page.getByText('Blog-Agentic-Beklentisi', {
        exact: true,
      }).count(),
      1,
    );

    assert.equal(
      await page.getByText('GOOGLE TRENDS MVP', {
        exact: true,
      }).count(),
      0,
    );

    assert.equal(
      await page.getByText('Google Trends · Interest Over Time', {
        exact: true,
      }).count(),
      0,
    );

    await page.getByRole('button', {
      name: 'TASKS',
    }).click();

    await page.getByRole('heading', {
      name: 'Tasks',
      exact: true,
    }).waitFor();

    assert.equal(
      await page.locator('[data-testid="task-card"]').count(),
      8,
    );

    await page.getByText(
      'İkas — Products Import',
      {
        exact: true,
      },
    ).click();

    await page.getByRole(
      'heading',
      {
        name: 'İkas — Products Import',
        exact: true,
      },
    ).waitFor();

    assert.equal(
      await page.getByText(
        'Readiness',
        {
          exact: true,
        },
      ).count(),
      1,
      'Expected dedicated İkas Task Detail Readiness section.',
    );

    assert.equal(
      await page.getByText(
        'Default Configuration',
        {
          exact: true,
        },
      ).count(),
      1,
    );

    assert.equal(
      await page.getByText(
        'Input / Connection',
        {
          exact: true,
        },
      ).count(),
      1,
    );

    assert.equal(
      await page.getByText(
        'Recent Runs',
        {
          exact: true,
        },
      ).count(),
      1,
    );

    assert.ok(
      await page.getByText(
        'FILE REQUIRED',
        {
          exact: true,
        },
      ).count() >= 1,
      'Expected İkas Task Detail to expose FILE REQUIRED readiness.',
    );

    assert.equal(
      await page.getByRole(
        'button',
        {
          name: 'Review Quick Run',
        },
      ).count(),
      1,
    );

    const selectProductsFileButton =
      page.getByRole(
        'button',
        {
          name: 'Select Products XLSX',
        },
      );

    assert.equal(
      await selectProductsFileButton.count(),
      1,
      'Expected İkas Task Detail to expose native Products XLSX selection.',
    );

    await selectProductsFileButton.click();

    assert.deepEqual(
      await page.evaluate(
        () => window.__selectedDesktopInputRequest,
      ),
      {
        input_kind: 'IKAS_PRODUCTS_XLSX',
      },
    );

    assert.equal(
      await page.getByText(
        'ikas-products.xlsx',
        {
          exact: true,
        },
      ).count(),
      1,
      'Expected selected Products XLSX filename to be visible.',
    );

    const reviewQuickRunButton =
      page.getByRole(
        'button',
        {
          name: 'Review Quick Run',
        },
      );

    assert.equal(
      await reviewQuickRunButton.isEnabled(),
      true,
      'Selecting a current Products XLSX must make the İkas Quick Run reviewable.',
    );

    await reviewQuickRunButton.click();

    await page.getByRole(
      'heading',
      {
        name: 'Review Quick Run',
        exact: true,
      },
    ).waitFor();

    assert.deepEqual(
      await page.evaluate(
        () => {
          const reviewed =
            window.__reviewedDesktopDraft;

          return reviewed
            ?.reusable_configuration
            ?.sources
            ?.['ikas-products'];
        },
      ),
      {
        included: true,
        file_path:
          '/fixture/imports/ikas-products.xlsx',
      },
      'Review must receive the exact selected İkas file as Run-specific configuration.',
    );

    assert.equal(
      await page.getByText(
        'ikas-products.xlsx',
        {
          exact: true,
        },
      ).count(),
      1,
      'Review must expose the exact selected input file.',
    );

    assert.equal(
      await page.evaluate(
        () =>
          window.__startDesktopDraftCalls
          ?? 0,
      ),
      0,
      'Opening Review must not start a provider Run.',
    );

    const backToTaskButton =
      page.getByRole(
        'button',
        {
          name: 'Back to Task',
          exact: true,
        },
      );

    assert.equal(
      await backToTaskButton.count(),
      1,
      'Quick Run Review must provide a return path to Task Detail.',
    );

    await backToTaskButton.click();

    assert.equal(
      await page.getByRole(
        'button',
        {
          name: 'Back to Tasks',
          exact: true,
        },
      ).count(),
      1,
      'Returning from Review must restore the Task Detail page.',
    );

    await page.getByRole(
      'button',
      {
        name: 'Review Quick Run',
        exact: true,
      },
    ).click();

    await page.getByRole(
      'heading',
      {
        name: 'Review Quick Run',
        exact: true,
      },
    ).waitFor();

    const startRunButton =
      page.getByRole(
        'button',
        {
          name: 'Start Run',
          exact: true,
        },
      );

    assert.equal(
      await startRunButton.isEnabled(),
      true,
      'A startable Review must expose an explicit enabled Start Run action.',
    );

    await startRunButton.click();

    assert.deepEqual(
      await page.evaluate(
        () => window.__startedDesktopDraft,
      ),
      await page.evaluate(
        () => window.__reviewedDesktopDraft,
      ),
      'Start Run must execute the exact draft that was reviewed.',
    );

    await page.getByRole(
      'heading',
      {
        name: 'Run Detail',
        exact: true,
      },
    ).waitFor();

    assert.equal(
      await page.getByText(
        'rr_fixture_ikas_001',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must expose the persisted Run identity returned by Start.',
    );

    assert.equal(
      await page.getByRole(
        'heading',
        {
          name: 'Jobs',
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must expose persisted Job progress.',
    );

    assert.equal(
      await page.getByText(
        'ikas-products-current',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must expose the persisted Job key.',
    );

    assert.equal(
      await page.getByText(
        'NOT_RUN',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must expose each Job validation status.',
    );

    assert.equal(
      await page.getByText(
        'Attempts: 0',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must expose each Job attempt count.',
    );

    assert.equal(
      await page.evaluate(
        () =>
          window.__getDesktopRunStateCalls
          ?? 0,
      ),
      0,
      'Run Detail must not immediately hammer persisted state after Start.',
    );

    await page.waitForFunction(
      () =>
        (
          window.__getDesktopRunStateCalls
          ?? 0
        ) >= 1,
      null,
      {
        timeout: 3500,
      },
    );

    assert.equal(
      await page.evaluate(
        () => window.__lastDesktopRunStateId,
      ),
      'rr_fixture_ikas_001',
      'Heartbeat must refresh the persisted state for the active Run identity.',
    );

    assert.equal(
      await page.getByText(
        'Run Status: MANUAL_ACTION_REQUIRED',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must render the refreshed persisted Run status.',
    );

    await page.waitForTimeout(
      3800,
    );

    assert.equal(
      await page.evaluate(
        () =>
          window.__getDesktopRunStateCalls
          ?? 0,
      ),
      1,
      'MANUAL_ACTION_REQUIRED must not use the 2 second active heartbeat.',
    );

    await page.waitForFunction(
      () =>
        (
          window.__getDesktopRunStateCalls
          ?? 0
        ) >= 2,
      null,
      {
        timeout: 2500,
      },
    );

    assert.equal(
      await page.getByText(
        'Run Status: RETRY_REQUIRED',
        {
          exact: true,
        },
      ).count(),
      1,
      'The 5 second manual heartbeat must refresh persisted Run state.',
    );

    await page.waitForTimeout(
      2300,
    );

    assert.equal(
      await page.evaluate(
        () =>
          window.__getDesktopRunStateCalls
          ?? 0,
      ),
      2,
      'RETRY_REQUIRED must stop Run state heartbeat polling.',
    );

    const retryFailedButton =
      page.getByRole(
        'button',
        {
          name: 'Retry Failed',
          exact: true,
        },
      );

    assert.equal(
      await retryFailedButton.count(),
      1,
      'RETRY_REQUIRED with failed Jobs must expose explicit Retry Failed.',
    );

    await retryFailedButton.click();

    assert.equal(
      await page.evaluate(
        () => window.__retriedDesktopRunId,
      ),
      'rr_fixture_ikas_001',
      'Retry Failed must execute against the persisted Run identity.',
    );

    assert.equal(
      await page.getByText(
        'Run Status: RUNNING',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must apply the persisted state returned by Retry Failed.',
    );

    console.log(
      'PASS DESKTOP-UI-001: source-neutral operations shell exposes all Release 1.0 tasks and removes the global Google Trends MVP surface',
    );
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
