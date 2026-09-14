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

          reviewDesktopDraft: async () => {
            throw new Error('Not exercised by shell smoke test.');
          },

          startDesktopDraft: async () => {
            throw new Error('Not exercised by shell smoke test.');
          },

          getDesktopRunState: async () => {
            throw new Error('Not exercised by shell smoke test.');
          },

          retryDesktopFailed: async () => {
            throw new Error('Not exercised by shell smoke test.');
          },

          exportDesktopRun: async () => {
            throw new Error('Not exercised by shell smoke test.');
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
