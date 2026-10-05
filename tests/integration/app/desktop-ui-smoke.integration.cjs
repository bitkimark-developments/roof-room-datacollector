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
    freshness_status: 'FRESH', last_successful_at: '2026-09-18T10:00:00.000Z', next_due_at: null,
    configuration_summary: '6 query groups',
  },
  {
    source_id: 'google-search-console-query-page',
    source_name: 'Google Search Console',
    included: false,
    readiness_status: 'READY',
    freshness_status: 'DUE', last_successful_at: '2026-09-16T10:00:00.000Z', next_due_at: '2026-09-17T10:00:00.000Z',
    configuration_summary: 'Query × Page',
  },
  {
    source_id: 'google-ads-search-terms',
    source_name: 'Google Ads Search Terms',
    included: false,
    readiness_status: 'CONNECTION_REQUIRED',
    readiness_reason: 'A Workspace connection is required before this task can be reviewed.',
    readiness_remediation: {
      kind: 'CONNECT_SOURCE',
      label: 'Manage Connection',
    },
    freshness_status: 'DUE', last_successful_at: null, next_due_at: null,
    configuration_summary: 'Search Terms',
  },
  {
    source_id: 'google-keyword-planner',
    source_name: 'Keyword Planner',
    included: false,
    readiness_status: 'CONNECTION_REQUIRED',
    freshness_status: 'UNKNOWN', last_successful_at: null, next_due_at: null,
    configuration_summary: 'Historical Metrics',
  },
  {
    source_id: 'google-analytics-4',
    source_name: 'Google Analytics 4',
    included: false,
    readiness_status: 'READY',
    freshness_status: 'UNKNOWN',
    last_successful_at: null,
    next_due_at: null,
    configuration_summary:
      'Content Performance + Paid Funnel',
  },
  {
    source_id: 'google-keyword-planner-csv',
    source_name: 'Keyword Planner Manual CSV',
    included: false,
    readiness_status: 'FILE_REQUIRED',
    freshness_status: 'IMPORT_NEEDED', last_successful_at: null, next_due_at: null,
    configuration_summary: 'Manual UTF-16 CSV',
  },
  {
    source_id: 'ikas-products',
    source_name: 'İkas Products',
    included: false,
    readiness_status: 'FILE_REQUIRED',
    freshness_status: 'IMPORT_NEEDED', last_successful_at: null, next_due_at: null,
    configuration_summary: 'Products XLSX',
  },
  {
    source_id: 'bitkimark-sitemap',
    source_name: 'Bitkimark Sitemap',
    included: false,
    readiness_status: 'READY',
    freshness_status: 'UNKNOWN', last_successful_at: null, next_due_at: null,
    configuration_summary: 'Sitemap/XML',
  },
  {
    source_id: 'serpapi',
    source_name: 'SerpApi',
    included: false,
    readiness_status: 'CONFIGURATION_REQUIRED',
    freshness_status: 'ON_DEMAND', last_successful_at: null, next_due_at: null,
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
    const capturedRendererOutput = [];
    page.on('console', (message) => {
      capturedRendererOutput.push(message.text());
    });
    page.on('pageerror', (error) => {
      capturedRendererOutput.push(String(error.stack ?? error));
    });

    await page.addInitScript(
      ({
        applicationInfo: info,
        bootstrapStatus: bootstrap,
        legacyCollectionState: collection,
        sourceCards: cards,
        draft: blankDraft,
      }) => {
        window.__workspaceConnectionReadCount = 0;
        window.__workspaceConnectionMutationSerial = 0;
        window.__workspaceConnectionReadsAfterMutation = [];
        window.__workspaceConnectionMutationCalls = [];
        window.__googleProviderConfigurationCalls = [];
        window.__googleProviderConfigurationStatus = {
          oauth_application_status: 'NOT_CONFIGURED',
          ads_developer_token_status: 'NOT_CONFIGURED',
        };
        window.__taskPackageReviewMode = 'NOT_READY';
        window.__taskPackageReviewCalls = [];
        window.__taskPackageStartCalls = [];
        window.__taskPackageOpenCalls = [];
        window.__blogWritingPackBuildCalls = [];
        window.__blogWritingPackOpenCalls = [];
        window.__blogWritingPackRevealCalls = [];
        window.__blogWritingPackMode = 'PACKAGE_PUBLISHED';
        window.__createDesktopDraftCalls = 0;
        const taskPackageRequirements = [
          'CAMPAIGN_PERFORMANCE', 'AD_GROUP_PERFORMANCE', 'KEYWORD_PERFORMANCE',
          'SEARCH_TERMS', 'AD_PERFORMANCE', 'RSA_ASSET_PERFORMANCE',
        ];
        const taskPackageReview = () => {
          const mode = window.__taskPackageReviewMode;
          const statuses = mode === 'NOT_READY'
            ? ['REUSE_EXACT', 'REUSE_FILTERED', 'NO_DATA', 'COLLECT_REQUIRED', 'COLLECT_REQUIRED', 'REUSE_EXACT']
            : mode === 'BLOCKED'
              ? taskPackageRequirements.map(() => 'BLOCKED')
              : taskPackageRequirements.map(() => 'REUSE_EXACT');
          return {
            recipe_id: 'ADS_OPTIMIZATION_PACK', recipe_version: 1,
            recipe_label: 'Kampanya Gelişim', workspace_id: 'ws_fixture',
            account_identity: { field: 'customer_id', value: '1234567890' },
            customer_id: '1234567890', reference_date: '2026-09-30',
            current_window: { start: '2026-09-23', end: '2026-09-29' },
            status: mode === 'BLOCKED' || mode === 'NOT_READY' || mode === 'ACTIVE' ? 'NOT_READY' : mode,
            can_start: mode !== 'BLOCKED' && mode !== 'EXISTING_PACKAGE' && mode !== 'ACTIVE',
            can_open: mode === 'EXISTING_PACKAGE', collection_run_id: null,
            requirements: taskPackageRequirements.map((dataset_type, index) => ({
              requirement_id: dataset_type, dataset_type, status: statuses[index],
              reason_codes: statuses[index] === 'BLOCKED'
                ? ['CONNECTION_REQUIRED']
                : statuses[index] === 'COLLECT_REQUIRED'
                  ? ['NO_COMPATIBLE_EVIDENCE']
                  : [],
            })),
            ...(mode === 'COMPARISON' ? {
              previous_package_id: 'pkg_previous',
              previous_window: { start: '2026-09-08', end: '2026-09-14' },
              gap_days: 8,
            } : {}),
            ...(mode === 'EXISTING_PACKAGE' ? { existing_package_id: 'pkg_existing' } : {}),
            ...(mode === 'ACTIVE' ? { collection_run_id: 'rr_fixture_package_001' } : {}),
          };
        };
        const taskPackageRunState = (terminal = false) => ({
          run: {
            run_id: 'rr_fixture_package_001', workspace_id: 'ws_fixture',
            run_status: terminal ? 'COMPLETED' : 'RETRY_REQUIRED',
            created_at: '2026-09-30T10:00:00.000Z', started_at: '2026-09-30T10:00:01.000Z',
            completed_at: terminal ? '2026-09-30T10:01:00.000Z' : null,
            application_version: '1.0.0', selected_sources: ['google-ads-search-reporting'],
            requested_configuration: null, configuration_snapshot: { task_package: { recipe_id: 'ADS_OPTIMIZATION_PACK' } },
          },
          jobs: [
            {
              job_id: 'job_package_accepted', run_id: 'rr_fixture_package_001',
              source_id: 'google-ads-search-reporting', job_key: 'AD_PERFORMANCE', query_group_id: null,
              source_context: {}, job_order: 0, execution_status: 'COMPLETED', validation_status: 'VALID',
              attempt_count: 1, accepted_artifact_id: 'artifact_package_accepted',
              created_at: '2026-09-30T10:00:00.000Z', started_at: '2026-09-30T10:00:01.000Z', completed_at: '2026-09-30T10:00:20.000Z',
            },
            {
              job_id: 'job_package_retry', run_id: 'rr_fixture_package_001',
              source_id: 'google-ads-search-reporting', job_key: 'RSA_ASSET_PERFORMANCE', query_group_id: null,
              source_context: {}, job_order: 1, execution_status: terminal ? 'COMPLETED' : 'FAILED',
              validation_status: terminal ? 'NO_DATA' : 'ERROR_NOT_DATA', attempt_count: terminal ? 2 : 1,
              accepted_artifact_id: terminal ? 'artifact_package_retry' : null,
              created_at: '2026-09-30T10:00:00.000Z', started_at: '2026-09-30T10:00:21.000Z', completed_at: '2026-09-30T10:00:30.000Z',
            },
          ],
          completed_jobs: terminal ? 2 : 1, failed_jobs: terminal ? 0 : 1,
          can_resume: false, can_retry: !terminal, can_cancel: !terminal,
        });
        window.__presetState = [
          {
            preset_id: 'sp_fixture',
            workspace_id: 'ws_fixture',
            preset_name: 'Blog-Agentic-Beklentisi',
            reusable_configuration: {
              sources: {
                'google-search-console-query-page': {
                  included: true,
                  task_id: 'gsc-current-90-days',
                  date_policy: 'TODAY_MINUS_90_TO_YESTERDAY',
                },
              },
            },
            created_at: '2026-09-14T00:00:00.000Z',
            updated_at: '2026-09-14T00:00:00.000Z',
          },
        ];
        window.__workspaceConnectionState = [
          {
            source_id: 'google-search-console-query-page',
            credential_status: 'AVAILABLE',
            readiness_status: 'MANUAL_ACTION_REQUIRED',
            credential_ref: 'cred:do-not-render',
            secret: 'do-not-leak',
          },
          {
            source_id: 'google-ads-search-terms',
            credential_status: 'MISSING',
            readiness_status: 'CONNECTION_REQUIRED',
          },
          {
            source_id: 'google-keyword-planner',
            credential_status: 'NOT_CONFIGURED',
            readiness_status: 'CONFIGURATION_REQUIRED',
          },
          {
            source_id: 'google-analytics-4',
            credential_status: 'NOT_CONFIGURED',
            readiness_status: 'CONFIGURATION_REQUIRED',
          },
          {
            source_id: 'serpapi',
            credential_status: 'AVAILABLE',
            readiness_status: 'READY',
          },
        ];
        const completeWorkspaceMutation = async (sourceId, action) => {
          if (window.__holdWorkspaceMutation) {
            await new Promise((resolve) => {
              window.__releaseWorkspaceMutation = resolve;
            });
            window.__holdWorkspaceMutation = false;
          }
          if (window.__workspaceMutationThrow) {
            const message = window.__workspaceMutationThrow;
            window.__workspaceMutationThrow = null;
            throw new Error(message);
          }
          const next = window.__workspaceMutationResult;
          window.__workspaceMutationResult = null;
          return next ?? {
            ok: true,
            result: {
              source_id: sourceId,
              action,
              outcome: 'SUCCEEDED',
            },
          };
        };
        window.roofroom = {
          // Legacy bridge methods remain available during renderer migration.
          getApplicationInfo: async () => info,
          getBootstrapStatus: async () => {
            if (
              window.localStorage.getItem(
                '__roofroomBootstrapThrow',
              ) === '1'
            ) {
              throw new Error(
                'Fixture bootstrap read failed.',
              );
            }

            return window.localStorage.getItem(
              '__roofroomBootstrapError',
            ) === '1'
              ? {
                  ...bootstrap,
                  database: {
                    status: 'ERROR',
                    database_path:
                      bootstrap.database.database_path,
                    error:
                      'Fixture bootstrap database error.',
                  },
                }
              : bootstrap;
          },
          getCollectionState: async () => collection,
          startCollection: async () => collection,
          resumeCollection: async () => collection,
          retryFailedCollection: async () => collection,
          cancelCollection: async () => collection,
          openDataFolder: async () => {},
          openLatestExport: async () => {},
          openConfigFolder: async () => {},
          openDesktopAcceptedEvidence: async (input) => {
            window.__openedAcceptedEvidence = input;
          },

          getDesktopWorkspaces: async () => ({
            workspaces: [
              {
                workspace_id: 'ws_fixture',
                workspace_name: 'Acceptance Workspace',
                created_at: '2026-09-11T00:00:00.000Z',
              },
              {
                workspace_id: 'ws_other',
                workspace_name: 'Other Workspace',
                created_at: '2026-09-12T00:00:00.000Z',
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

          getDesktopWorkspaceConnections: async (workspaceId) => {
            window.__desktopWorkspaceConnectionsWorkspaceId =
              workspaceId;
            window.__workspaceConnectionReadCount += 1;
            window.__workspaceConnectionReadsAfterMutation.push(
              window.__workspaceConnectionMutationSerial,
            );
            if (window.__workspaceConnectionReadError) {
              const message = window.__workspaceConnectionReadError;
              window.__workspaceConnectionReadError = null;
              throw new Error(message);
            }
            if (window.__nextWorkspaceConnectionState) {
              window.__workspaceConnectionState =
                window.__nextWorkspaceConnectionState;
              window.__nextWorkspaceConnectionState = null;
            }
            return structuredClone(window.__workspaceConnectionState);
          },

          manageDesktopWorkspaceConnection: async (intent) => {
            window.__workspaceConnectionMutationSerial += 1;
            window.__workspaceConnectionMutationCalls.push([
              'manageDesktopWorkspaceConnection',
              structuredClone(intent),
            ]);
            return completeWorkspaceMutation(intent.source_id, 'MANAGE_METADATA');
          },
          disconnectDesktopWorkspaceConnection: async (intent) => {
            window.__workspaceConnectionMutationSerial += 1;
            window.__workspaceConnectionMutationCalls.push([
              'disconnectDesktopWorkspaceConnection',
              structuredClone(intent),
            ]);
            return completeWorkspaceMutation(intent.source_id, 'DISCONNECT');
          },
          connectGoogleDesktopWorkspaceConnection: async (intent) => {
            window.__workspaceConnectionMutationSerial += 1;
            window.__workspaceConnectionMutationCalls.push([
              'connectGoogleDesktopWorkspaceConnection',
              structuredClone(intent),
            ]);
            return completeWorkspaceMutation(intent.source_id, 'CONNECT_GOOGLE');
          },
          reconnectGoogleDesktopWorkspaceConnection: async (intent) => {
            window.__workspaceConnectionMutationSerial += 1;
            window.__workspaceConnectionMutationCalls.push([
              'reconnectGoogleDesktopWorkspaceConnection',
              structuredClone(intent),
            ]);
            return completeWorkspaceMutation(intent.source_id, 'RECONNECT_GOOGLE');
          },
          provisionSerpApiDesktopWorkspaceConnection: async (intent) => {
            window.__workspaceConnectionMutationSerial += 1;
            window.__workspaceConnectionMutationCalls.push([
              'provisionSerpApiDesktopWorkspaceConnection',
              structuredClone(intent),
            ]);
            return completeWorkspaceMutation(intent.source_id, 'PROVISION_SERPAPI');
          },
          getGoogleProviderConfigurationStatus: async () => structuredClone(
            window.__googleProviderConfigurationStatus,
          ),
          configureGoogleProvider: async (intent) => {
            window.__googleProviderConfigurationCalls.push(
              structuredClone(intent),
            );
            if (intent.component === 'OAUTH_APPLICATION') {
              window.__googleProviderConfigurationStatus = {
                ...window.__googleProviderConfigurationStatus,
                oauth_application_status: 'AVAILABLE',
              };
            } else {
              window.__googleProviderConfigurationStatus = {
                ...window.__googleProviderConfigurationStatus,
                ads_developer_token_status: 'AVAILABLE',
              };
            }
            return {
              ok: true,
              result: {
                component: intent.component,
                status: structuredClone(
                  window.__googleProviderConfigurationStatus,
                ),
              },
            };
          },

          getDesktopPresets: async (workspaceId) => structuredClone(
            window.__presetState.filter((preset) => preset.workspace_id === workspaceId),
          ),

          createDesktopDraft: async (input) => {
            window.__createDesktopDraftCalls += 1;
            const preset = input.origin.kind === 'SAVED_PRESET'
              ? window.__presetState.find((candidate) => candidate.preset_id === input.origin.preset_id)
              : null;
            const reusableConfiguration = preset?.reusable_configuration ?? blankDraft.reusable_configuration;
            return {
            ...blankDraft,
            origin: structuredClone(input.origin),
            reusable_configuration: structuredClone(reusableConfiguration),
            source_cards: cards.map(
              (card) =>
                (
                  card.source_id
                    === 'google-search-console-query-page'
                  || card.source_id
                    === 'google-trends'
                  || (card.source_id === 'google-ads-search-terms' && window.__adsReady)
                  || (card.source_id === 'google-keyword-planner' && window.__keywordPlannerReady)
                  || (card.source_id === 'serpapi' && window.__serpApiReady)
                )
                  ? {
                      ...card,
                      readiness_status:
                        'READY',
                    }
                  : card,
            ),
          };
          },

          reviewDesktopTaskPackage: async (reviewIntent) => {
            window.__taskPackageReviewCalls.push(structuredClone(reviewIntent));
            return { ok: true, result: taskPackageReview() };
          },
          startDesktopTaskPackage: async (startIntent) => {
            window.__taskPackageStartCalls.push(structuredClone(startIntent));
            if (window.__taskPackageReviewMode === 'NOT_READY') {
              return { ok: true, result: { status: 'COLLECTION_STARTED', run_state: taskPackageRunState(false) } };
            }
            return {
              ok: true,
              result: {
                status: window.__taskPackageReviewMode === 'EXISTING_PACKAGE'
                  ? 'EXISTING_PACKAGE'
                  : 'PACKAGE_PUBLISHED',
                package: {
                  package_id: window.__taskPackageReviewMode === 'EXISTING_PACKAGE' ? 'pkg_existing' : 'pkg_published',
                  package_kind: window.__taskPackageReviewMode === 'COMPARISON' ? 'COMPARISON' : 'INITIAL_BASELINE',
                  current_window: { start: '2026-09-23', end: '2026-09-29' },
                  ...(window.__taskPackageReviewMode === 'COMPARISON' ? {
                    previous_package_id: 'pkg_previous',
                    previous_window: { start: '2026-09-08', end: '2026-09-14' },
                    gap_days: 8,
                  } : {}),
                },
              },
            };
          },
          openDesktopTaskPackage: async (input) => {
            window.__taskPackageOpenCalls.push(structuredClone(input));
            return { ok: true, result: { package_id: input.package_id } };
          },
          buildBlogWritingPack: async (runId) => {
            window.__blogWritingPackBuildCalls.push(runId);
            if (window.__blogWritingPackMode === 'THROW') {
              throw new Error('Fixture Blog build failed.');
            }
            if (window.__blogWritingPackMode === 'NOT_READY') {
              return {
                ok: true,
                result: {
                  status: 'NOT_READY',
                  run_id: runId,
                  missing_datasets: ['INTEREST_OVER_TIME'],
                  coverage_by_dataset: {
                    INTEREST_OVER_TIME: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
                  },
                },
              };
            }
            return {
              ok: true,
              result: {
                status: 'PACKAGE_PUBLISHED',
                package: {
                  package_id: `blog_pkg_${window.__blogWritingPackBuildCalls.length}`,
                  run_id: runId,
                  coverage_status: 'PARTIAL',
                  present_datasets: ['QUERY_PAGE'],
                  no_data_datasets: [],
                  incomplete_datasets: ['PRODUCTS'],
                  missing_datasets: ['INTEREST_OVER_TIME'],
                },
              },
            };
          },
          openBlogWritingPack: async (packageId) => {
            window.__blogWritingPackOpenCalls.push(packageId);
            return { ok: true, result: { package_id: packageId } };
          },
          revealBlogWritingPack: async (packageId) => {
            window.__blogWritingPackRevealCalls.push(packageId);
            return { ok: true, result: { package_id: packageId } };
          },

          createDesktopPreset: async (input) => {
            window.__createdDesktopPresetInput = structuredClone(input);
            const created = {
              preset_id: `sp_created_${window.__presetState.length}`,
              workspace_id: input.workspace_id,
              preset_name: input.preset_name,
              reusable_configuration: structuredClone(input.reusable_configuration),
              created_at: '2026-09-23T10:00:00.000Z',
              updated_at: '2026-09-23T10:00:00.000Z',
            };
            window.__presetState.push(created);
            return structuredClone(created);
          },

          updateDesktopPreset: async (input) => {
            window.__updatedDesktopPresetInput = structuredClone(input);
            const index = window.__presetState.findIndex((preset) => preset.preset_id === input.preset_id);
            window.__presetState[index] = {
              ...window.__presetState[index],
              preset_name: input.preset_name,
              reusable_configuration: structuredClone(input.reusable_configuration),
              updated_at: '2026-09-23T10:01:00.000Z',
            };
            return structuredClone(window.__presetState[index]);
          },

          deleteDesktopPreset: async (input) => {
            window.__deletedDesktopPresetInput = structuredClone(input);
            window.__presetState = window.__presetState.filter((preset) => preset.preset_id !== input.preset_id);
          },

          reviewDesktopDraft: async (reviewDraft) => {
            window.__reviewedDesktopDraft =
              reviewDraft;

            const ga4Config =
              reviewDraft
                ?.reusable_configuration
                ?.sources
                ?.['google-analytics-4'];

            if (ga4Config?.task_id === 'google-analytics-4') {
              const reviewedArtifact = {
                workspace_id: 'ws_fixture',
                task_id: 'google-analytics-4',
                source_id: 'google-analytics-4',
                reference_date: ga4Config.end_date,
                resolved_at: '2026-09-30T12:00:00.000Z',
                reusable_configuration:
                  reviewDraft.reusable_configuration,
                resolved_configuration: {
                  sources: {
                    'google-analytics-4': {
                      ...ga4Config,
                      requested_date_start:
                        ga4Config.start_date,
                      requested_date_end:
                        ga4Config.end_date,
                    },
                  },
                },
              };

              window.__reviewedDesktopArtifact =
                reviewedArtifact;

              return {
                workspace: {
                  workspace_id: 'ws_fixture',
                  workspace_name: 'Acceptance Workspace',
                },
                origin: reviewDraft.origin,
                included_sources: ['google-analytics-4'],
                source_cards: [{
                  source_id: 'google-analytics-4',
                  included: true,
                  readiness_status: 'READY',
                }],
                job_count: 2,
                can_start: true,
                blocking_sources: [],
                reviewed_draft: reviewedArtifact,
              };
            }

            const adsConfig = reviewDraft?.reusable_configuration?.sources?.['google-ads-search-terms'];
            if (adsConfig?.included) {
              const reviewedArtifact = {
                workspace_id: 'ws_fixture', task_id: 'google-ads-search-terms', source_id: 'google-ads-search-terms',
                reference_date: '2026-09-17', resolved_at: '2026-09-17T12:00:00.000Z',
                reusable_configuration: reviewDraft.reusable_configuration,
                resolved_configuration: { sources: { 'google-ads-search-terms': {
                  ...adsConfig, source_mode: 'search_term_view', campaign_type: 'SEARCH',
                  requested_date_start: '2026-08-31', requested_date_end: '2026-09-16',
                } } },
              };
              window.__reviewedDesktopArtifact = reviewedArtifact;
              return {
                workspace: { workspace_id: 'ws_fixture', workspace_name: 'Acceptance Workspace' },
                origin: reviewDraft.origin, included_sources: ['google-ads-search-terms'],
                source_cards: [{ source_id: 'google-ads-search-terms', included: true, readiness_status: 'READY' }],
                job_count: 1, can_start: true, blocking_sources: [], reviewed_draft: reviewedArtifact,
              };
            }

            const googleTrendsConfig =
              reviewDraft
                ?.reusable_configuration
                ?.sources
                ?.['google-trends'];

            const gscConfig =
              reviewDraft
                ?.reusable_configuration
                ?.sources
                ?.['google-search-console-query-page'];

            const keywordPlannerConfig =
              reviewDraft
                ?.reusable_configuration
                ?.sources
                ?.['google-keyword-planner'];

            const keywordPlannerCsvConfig =
              reviewDraft
                ?.reusable_configuration
                ?.sources
                ?.['google-keyword-planner-csv'];

            const bitkimarkConfig =
              reviewDraft
                ?.reusable_configuration
                ?.sources
                ?.['bitkimark-sitemap'];

            const serpApiConfig =
              reviewDraft
                ?.reusable_configuration
                ?.sources
                ?.serpapi;

            if (serpApiConfig?.task_id === 'serpapi-serp-snapshot') {
              const resolvedQueries = serpApiConfig.queries.map((query) => ({
                task_id: 'serpapi-serp-snapshot',
                source_id: 'serpapi',
                source_mode: 'THIRD_PARTY_API',
                dataset_type: 'GOOGLE_SERP',
                ...query,
                country_code: 'TR',
                language_code: 'tr',
                device: 'desktop',
                engine: 'google',
                organic_limit: 10,
                snapshot_date: '2026-09-18',
              }));
              const reviewedArtifact = {
                workspace_id: 'ws_fixture',
                task_id: 'serpapi-serp-snapshot',
                source_id: 'serpapi',
                reference_date: '2026-09-18',
                resolved_at: '2026-09-18T09:30:00.000Z',
                reusable_configuration: reviewDraft.reusable_configuration,
                resolved_configuration: {
                  sources: {
                    serpapi: { ...serpApiConfig, queries: resolvedQueries },
                  },
                },
              };
              window.__reviewedDesktopArtifact = reviewedArtifact;
              return {
                workspace: { workspace_id: 'ws_fixture', workspace_name: 'Acceptance Workspace' },
                origin: reviewDraft.origin,
                included_sources: ['serpapi'],
                source_cards: [{ source_id: 'serpapi', included: true, readiness_status: 'READY' }],
                job_count: resolvedQueries.length,
                can_start: true,
                blocking_sources: [],
                reviewed_draft: reviewedArtifact,
              };
            }

            if (
              bitkimarkConfig
                ?.task_id
              === 'bitkimark-sitemap'
            ) {
              const resolvedSitemaps =
                bitkimarkConfig.sitemaps.map(
                  (sitemap) => ({
                    task_id:
                      'bitkimark-sitemap',
                    source_id:
                      'bitkimark-sitemap',
                    source_mode:
                      'HTTP_XML',
                    ...sitemap,
                  }),
                );
              const reviewedArtifact = {
                workspace_id:
                  'ws_fixture',
                task_id:
                  'bitkimark-sitemap',
                source_id:
                  'bitkimark-sitemap',
                reference_date:
                  '2026-09-18',
                resolved_at:
                  '2026-09-18T09:30:00.000Z',
                reusable_configuration:
                  reviewDraft.reusable_configuration,
                resolved_configuration: {
                  sources: {
                    'bitkimark-sitemap': {
                      ...bitkimarkConfig,
                      source_id:
                        'bitkimark-sitemap',
                      source_mode:
                        'HTTP_XML',
                      sitemaps:
                        resolvedSitemaps,
                    },
                  },
                },
              };
              window.__reviewedDesktopArtifact =
                reviewedArtifact;
              return {
                workspace: {
                  workspace_id:
                    'ws_fixture',
                  workspace_name:
                    'Acceptance Workspace',
                },
                origin:
                  reviewDraft.origin,
                included_sources: [
                  'bitkimark-sitemap',
                ],
                source_cards: [{
                  source_id:
                    'bitkimark-sitemap',
                  included:
                    true,
                  readiness_status:
                    'READY',
                }],
                job_count:
                  resolvedSitemaps.length,
                can_start:
                  true,
                blocking_sources:
                  [],
                reviewed_draft:
                  reviewedArtifact,
              };
            }

            if (
              keywordPlannerCsvConfig
                ?.task_id
              === 'keyword-planner-manual-csv-import'
            ) {
              const reviewedArtifact = {
                workspace_id:
                  'ws_fixture',
                task_id:
                  'keyword-planner-manual-csv-import',
                source_id:
                  'google-keyword-planner-csv',
                reference_date:
                  '2026-09-18',
                resolved_at:
                  '2026-09-18T09:30:00.000Z',
                reusable_configuration:
                  reviewDraft.reusable_configuration,
                resolved_configuration: {
                  sources: {
                    'google-keyword-planner-csv': {
                      ...keywordPlannerCsvConfig,
                      source_id:
                        'google-keyword-planner-csv',
                      source_mode:
                        'FILE_IMPORT',
                    },
                  },
                },
              };

              window.__reviewedDesktopArtifact =
                reviewedArtifact;

              return {
                workspace: {
                  workspace_id:
                    'ws_fixture',
                  workspace_name:
                    'Acceptance Workspace',
                },
                origin:
                  reviewDraft.origin,
                included_sources: [
                  'google-keyword-planner-csv',
                ],
                source_cards: [{
                  source_id:
                    'google-keyword-planner-csv',
                  included:
                    true,
                  readiness_status:
                    'READY',
                }],
                job_count:
                  1,
                can_start:
                  true,
                blocking_sources:
                  [],
                reviewed_draft:
                  reviewedArtifact,
              };
            }

            if (
              keywordPlannerConfig
                ?.task_id
              === 'keyword-planner-historical-metrics'
            ) {
              const resolvedGroups =
                keywordPlannerConfig.groups.map(
                  (group) => ({
                    task_id:
                      'keyword-planner-historical-metrics',
                    source_id:
                      'google-keyword-planner',
                    source_mode:
                      'OFFICIAL_API',
                    ...group,
                  }),
                );

              const reviewedArtifact = {
                workspace_id:
                  'ws_fixture',
                task_id:
                  'keyword-planner-historical-metrics',
                source_id:
                  'google-keyword-planner',
                reference_date:
                  '2026-09-18',
                resolved_at:
                  '2026-09-18T09:30:00.000Z',
                reusable_configuration:
                  reviewDraft.reusable_configuration,
                resolved_configuration: {
                  sources: {
                    'google-keyword-planner': {
                      ...keywordPlannerConfig,
                      groups:
                        resolvedGroups,
                    },
                  },
                },
              };

              window.__reviewedDesktopArtifact =
                reviewedArtifact;

              return {
                workspace: {
                  workspace_id:
                    'ws_fixture',
                  workspace_name:
                    'Acceptance Workspace',
                },
                origin:
                  reviewDraft.origin,
                included_sources: [
                  'google-keyword-planner',
                ],
                source_cards: [{
                  source_id:
                    'google-keyword-planner',
                  included:
                    true,
                  readiness_status:
                    'READY',
                }],
                job_count:
                  resolvedGroups.length,
                can_start:
                  true,
                blocking_sources:
                  [],
                reviewed_draft:
                  reviewedArtifact,
              };
            }

            if (
              googleTrendsConfig
              ?.task_id
              === 'google-trends-interest-over-time'
            ) {
              const selectedGroups = [
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
              ];

              const reviewedArtifact = {
                workspace_id:
                  'ws_fixture',
                task_id:
                  'google-trends-interest-over-time',
                source_id:
                  'google-trends',
                reference_date:
                  '2026-09-14',
                resolved_at:
                  '2026-09-14T09:30:00.000Z',
                reusable_configuration: {
                  sources: {
                    'google-trends': {
                      included:
                        true,
                      task_id:
                        'google-trends-interest-over-time',
                      date_policy:
                        'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
                    },
                  },
                },
                resolved_configuration: {
                  config_version:
                    1,
                  source_id:
                    'google-trends',
                  source_mode:
                    'GOOGLE_TRENDS_UI',
                  country_code:
                    'TR',
                  language_code:
                    null,
                  requested_date_start:
                    '2024-09-14',
                  requested_date_end:
                    '2026-09-13',
                  category_id:
                    null,
                  category_name:
                    'All Categories',
                  search_type:
                    'WEB_SEARCH',
                  selection_type:
                    'SEARCH_TERM',
                  dataset_type:
                    'INTEREST_OVER_TIME',
                  selected_query_groups:
                    selectedGroups,
                  sources: {
                    'google-trends': {
                      included:
                        true,
                      task_id:
                        'google-trends-interest-over-time',
                      date_policy:
                        'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
                      requested_date_start:
                        '2024-09-14',
                      requested_date_end:
                        '2026-09-13',
                      query_groups:
                        selectedGroups,
                    },
                  },
                },
              };

              window.__reviewedDesktopArtifact =
                reviewedArtifact;

              return {
                workspace: {
                  workspace_id:
                    'ws_fixture',
                  workspace_name:
                    'Acceptance Workspace',
                  created_at:
                    '2026-09-11T00:00:00.000Z',
                },
                origin:
                  reviewDraft.origin,
                included_sources: [
                  'google-trends',
                ],
                source_cards: [
                  {
                    source_id:
                      'google-trends',
                    source_name:
                      'Google Trends',
                    included:
                      true,
                    readiness_status:
                      'READY',
                    configuration_summary:
                      'GT01, GT02 · 24 months',
                  },
                ],
                job_count:
                  2,
                can_start:
                  true,
                blocking_sources:
                  [],
                reviewed_draft:
                  window.__forceMissingReviewedDraft
                    ? null
                    : reviewedArtifact,
              };
            }

            if (
              gscConfig
              ?.task_id
              === 'gsc-long-16-months'
            ) {
              const reviewedArtifact = {
                workspace_id:
                  'ws_fixture',
                task_id:
                  'gsc-long-16-months',
                source_id:
                  'google-search-console-query-page',
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
                        'gsc-long-16-months',
                      date_policy:
                        'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
                    },
                  },
                },
                resolved_configuration: {
                  sources: {
                    'google-search-console-query-page': {
                      included:
                        true,
                      task_id:
                        'gsc-long-16-months',
                      date_policy:
                        'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
                      date_ranges: [
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
                    },
                  },
                },
              };

              window.__reviewedDesktopArtifact =
                reviewedArtifact;

              return {
                workspace: {
                  workspace_id:
                    'ws_fixture',
                  workspace_name:
                    'Acceptance Workspace',
                  created_at:
                    '2026-09-11T00:00:00.000Z',
                },
                origin:
                  reviewDraft.origin,
                included_sources: [
                  'google-search-console-query-page',
                ],
                source_cards: [
                  {
                    source_id:
                      'google-search-console-query-page',
                    source_name:
                      'Google Search Console',
                    included:
                      true,
                    readiness_status:
                      'READY',
                    configuration_summary:
                      'GSC Long 16 Months',
                  },
                ],
                job_count:
                  1,
                can_start:
                  true,
                blocking_sources:
                  [],
                reviewed_draft:
                  reviewedArtifact,
              };
            }

            if (
              gscConfig
              && gscConfig.included === true
            ) {
              const reviewedArtifact = {
                workspace_id:
                  'ws_fixture',
                task_id:
                  'gsc-current-90-days',
                source_id:
                  'google-search-console-query-page',
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
              };

              window.__reviewedDesktopArtifact =
                reviewedArtifact;

              return {
                workspace: {
                  workspace_id:
                    'ws_fixture',
                  workspace_name:
                    'Acceptance Workspace',
                  created_at:
                    '2026-09-11T00:00:00.000Z',
                },
                origin:
                  reviewDraft.origin,
                included_sources: [
                  'google-search-console-query-page',
                ],
                source_cards: [
                  {
                    source_id:
                      'google-search-console-query-page',
                    source_name:
                      'Google Search Console',
                    included:
                      true,
                    readiness_status:
                      'READY',
                    configuration_summary:
                      'GSC Current 90 Days',
                  },
                ],
                job_count:
                  1,
                can_start:
                  true,
                blocking_sources:
                  [],
                reviewed_draft:
                  window.__forceMissingReviewedDraft
                    ? null
                    : reviewedArtifact,
              };
            }

            const ikasConfig =
              reviewDraft
                ?.reusable_configuration
                ?.sources
                ?.['ikas-products'];

            const reviewedArtifact = {
              workspace_id:
                'ws_fixture',
              task_id:
                'ikas-products-import',
              source_id:
                'ikas-products',
              reference_date:
                '2026-09-14',
              resolved_at:
                '2026-09-14T09:30:00.000Z',
              reusable_configuration:
                reviewDraft.reusable_configuration,
              resolved_configuration: {
                sources: {
                  'ikas-products': {
                    ...ikasConfig,
                    source_id:
                      'ikas-products',
                    source_mode:
                      'FILE_IMPORT',
                  },
                },
              },
            };

            window.__reviewedDesktopArtifact =
              reviewedArtifact;

            return {
              workspace: {
                workspace_id:
                  'ws_fixture',
                workspace_name:
                  'Acceptance Workspace',
                created_at:
                  '2026-09-11T00:00:00.000Z',
              },
              origin:
                reviewDraft.origin,
              included_sources: [
                'ikas-products',
              ],
              source_cards: [
                {
                  source_id:
                    'ikas-products',
                  source_name:
                    'İkas Products',
                  included:
                    true,
                  readiness_status:
                    'READY',
                  configuration_summary:
                    'Products XLSX',
                },
              ],
              job_count:
                1,
              can_start:
                true,
              blocking_sources:
                [],
              reviewed_draft:
                reviewedArtifact,
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
                configuration_snapshot: {
                  sources: {
                    'ikas-products': {
                      included: true,
                      task_id: 'ikas-products-import',
                    },
                  },
                },
              },
              jobs: [
                {
                  job_id: 'job_fixture_ikas_001',
                  run_id: 'rr_fixture_ikas_001',
                  source_id: 'ikas-products',
                  job_key: 'ikas-products-current',
                  query_group_id: null,
                  source_context: {
                    task_id:
                      'ikas-products-import',
                    source_id:
                      'ikas-products',
                    source_mode:
                      'FILE_IMPORT',
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
              can_resume: false,
              can_retry: false,
              can_cancel: false,
            };
          },

          listDesktopRuns: async (workspaceId) => {
            window.__listDesktopRunsWorkspaceId =
              workspaceId;


            return [
              {
                run_id: 'rr_fixture_cancel_001',
                workspace_id: 'ws_fixture',
                run_status: 'RUNNING',
                created_at: '2026-09-13T14:00:00.000Z',
                started_at: '2026-09-13T14:00:01.000Z',
                completed_at: null,
                application_version: '1.0.0',
                selected_sources: [
                  'google-trends',
                ],
                requested_configuration: null,
                configuration_snapshot: {},
              },
              {
                run_id: 'rr_fixture_resume_001',
                workspace_id: 'ws_fixture',
                run_status: 'RUNNING',
                created_at: '2026-09-13T13:00:00.000Z',
                started_at: '2026-09-13T13:00:01.000Z',
                completed_at: null,
                application_version: '1.0.0',
                selected_sources: [
                  'google-trends',
                ],
                requested_configuration: null,
                configuration_snapshot: {},
              },
              {
                run_id: 'rr_fixture_history_001',
                workspace_id: 'ws_fixture',
                run_status: 'COMPLETED_WITH_WARNINGS',
                created_at: '2026-09-13T12:00:00.000Z',
                started_at: '2026-09-13T12:00:01.000Z',
                completed_at: '2026-09-13T12:00:05.000Z',
                application_version: '1.0.0',
                selected_sources: [
                  'ikas-products',
                ],
                requested_configuration: null,
                configuration_snapshot: {
                  sources: {
                    'ikas-products': {
                      included: true,
                      task_id: 'ikas-products-import',
                    },
                  },
                },
              },
            ];
          },


          getDesktopRunState: async (runId) => {
            if (runId === 'rr_fixture_package_001') {
              return taskPackageRunState(false);
            }
            if (runId === 'rr_fixture_cancel_001') {
              window.__openedCancelRunId =
                runId;

              return {
                run: {
                  run_id: 'rr_fixture_cancel_001',
                  workspace_id: 'ws_fixture',
                  run_status: 'RUNNING',
                  created_at: '2026-09-13T14:00:00.000Z',
                  started_at: '2026-09-13T14:00:01.000Z',
                  completed_at: null,
                  application_version: '1.0.0',
                  selected_sources: [
                    'google-trends',
                  ],
                  requested_configuration: null,
                  configuration_snapshot: {},
                },
                jobs: [
                  {
                    job_id: 'job_fixture_cancel_gt01',
                    run_id: 'rr_fixture_cancel_001',
                    source_id: 'google-trends',
                    job_key: 'GT01',
                    query_group_id: 'GT01',
                    source_context: {},
                    job_order: 1,
                    execution_status: 'COMPLETED',
                    validation_status: 'VALID',
                    attempt_count: 1,
                    accepted_artifact_id:
                      'artifact_fixture_cancel_gt01',
                    created_at: '2026-09-13T14:00:00.000Z',
                    started_at: '2026-09-13T14:00:01.000Z',
                    completed_at: '2026-09-13T14:00:03.000Z',
                  },
                  {
                    job_id: 'job_fixture_cancel_gt02',
                    run_id: 'rr_fixture_cancel_001',
                    source_id: 'google-trends',
                    job_key: 'GT02',
                    query_group_id: 'GT02',
                    source_context: {},
                    job_order: 2,
                    execution_status: 'RUNNING',
                    validation_status: 'NOT_RUN',
                    attempt_count: 1,
                    accepted_artifact_id: null,
                    created_at: '2026-09-13T14:00:00.000Z',
                    started_at: '2026-09-13T14:00:04.000Z',
                    completed_at: null,
                  },
                ],
                completed_jobs: 1,
                failed_jobs: 0,
                can_resume: false,
                can_retry: false,
                can_cancel: true,
              };
            }

            if (runId === 'rr_fixture_resume_001') {
              window.__openedResumeRunId =
                runId;

              return {
                run: {
                  run_id: 'rr_fixture_resume_001',
                  workspace_id: 'ws_fixture',
                  run_status: 'RUNNING',
                  created_at: '2026-09-13T13:00:00.000Z',
                  started_at: '2026-09-13T13:00:01.000Z',
                  completed_at: null,
                  application_version: '1.0.0',
                  selected_sources: [
                    'google-trends',
                  ],
                  requested_configuration: null,
                  configuration_snapshot: {},
                },
                jobs: [
                  {
                    job_id: 'job_fixture_resume_gt01',
                    run_id: 'rr_fixture_resume_001',
                    source_id: 'google-trends',
                    job_key: 'GT01',
                    query_group_id: 'GT01',
                    source_context: {},
                    job_order: 1,
                    execution_status: 'COMPLETED',
                    validation_status: 'VALID',
                    attempt_count: 1,
                    accepted_artifact_id:
                      'artifact_fixture_resume_gt01',
                    created_at: '2026-09-13T13:00:00.000Z',
                    started_at: '2026-09-13T13:00:01.000Z',
                    completed_at: '2026-09-13T13:00:03.000Z',
                  },
                  {
                    job_id: 'job_fixture_resume_gt02',
                    run_id: 'rr_fixture_resume_001',
                    source_id: 'google-trends',
                    job_key: 'GT02',
                    query_group_id: 'GT02',
                    source_context: {},
                    job_order: 2,
                    execution_status: 'RUNNING',
                    validation_status: 'NOT_RUN',
                    attempt_count: 1,
                    accepted_artifact_id: null,
                    created_at: '2026-09-13T13:00:00.000Z',
                    started_at: '2026-09-13T13:00:04.000Z',
                    completed_at: null,
                  },
                ],
                completed_jobs: 1,
                failed_jobs: 0,
                can_resume: true,
                can_retry: false,
                can_cancel: true,
              };
            }

            if (runId === 'rr_fixture_history_001') {
              window.__openedHistoryRunId =
                runId;

              return {
                run: {
                  run_id: 'rr_fixture_history_001',
                  workspace_id: 'ws_fixture',
                  run_status: 'COMPLETED_WITH_WARNINGS',
                  created_at: '2026-09-13T12:00:00.000Z',
                  started_at: '2026-09-13T12:00:01.000Z',
                  completed_at: '2026-09-13T12:00:05.000Z',
                  application_version: '1.0.0',
                  selected_sources: [
                    'ikas-products',
                  ],
                  requested_configuration: null,
                  configuration_snapshot: {
                    sources: {
                      'ikas-products': {
                        included: true,
                        task_id: 'ikas-products-import',
                      },
                    },
                  },
                },
                jobs: [
                  {
                    job_id: 'job_fixture_history_001',
                    run_id: 'rr_fixture_history_001',
                    source_id: 'ikas-products',
                    job_key: 'ikas-products-history',
                    query_group_id: null,
                    source_context: {
                      task_id: 'ikas-products-import',
                    },
                    job_order: 1,
                    execution_status: 'COMPLETED',
                    validation_status: 'LOW_DATA',
                    attempt_count: 1,
                    accepted_artifact_id:
                      'artifact_fixture_history_001',
                    created_at: '2026-09-13T12:00:00.000Z',
                    started_at: '2026-09-13T12:00:01.000Z',
                    completed_at: '2026-09-13T12:00:05.000Z',
                  },
                  {
                    job_id: 'job_fixture_history_002',
                    run_id: 'rr_fixture_history_001',
                    source_id: 'ikas-products',
                    job_key: 'ikas-products-invalid',
                    query_group_id: null,
                    source_context: {
                      task_id: 'ikas-products-import',
                    },
                    job_order: 2,
                    execution_status: 'FAILED',
                    validation_status: 'INVALID_SCHEMA',
                    attempt_count: 2,
                    accepted_artifact_id: null,
                    created_at: '2026-09-13T12:00:00.000Z',
                    started_at: '2026-09-13T12:00:02.000Z',
                    completed_at: '2026-09-13T12:00:04.000Z',
                  },
                ],
                job_attempts: [
                  {
                    job_id: 'job_fixture_history_002',
                    attempt_number: 2,
                    execution_status: 'FAILED',
                    error_code: 'INVALID_SCHEMA',
                    started_at: '2026-09-13T12:00:02.000Z',
                    completed_at: '2026-09-13T12:00:04.000Z',
                  },
                ],
                completed_jobs: 1,
                failed_jobs: 1,
                can_resume: false,
                can_retry: false,
                can_cancel: false,
              };
            }

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
                can_resume: false,
                can_retry: false,
                can_cancel: true,
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
              can_resume: false,
              can_retry: true,
              can_cancel: true,
            };
          },


          retryDesktopFailed: async (runId) => {
            if (runId === 'rr_fixture_package_001') {
              window.__retriedTaskPackageRunId = runId;
              return taskPackageRunState(true);
            }
            if (runId === 'rr_fixture_resume_001') {
              window.__retriedResumeRunId =
                runId;

              return {
                run: {
                  run_id: 'rr_fixture_resume_001',
                  workspace_id: 'ws_fixture',
                  run_status: 'COMPLETED',
                  created_at: '2026-09-13T13:00:00.000Z',
                  started_at: '2026-09-13T13:00:01.000Z',
                  completed_at: '2026-09-13T13:00:08.000Z',
                  application_version: '1.0.0',
                  selected_sources: [
                    'google-trends',
                  ],
                  requested_configuration: null,
                  configuration_snapshot: {},
                },
                jobs: [
                  {
                    job_id: 'job_fixture_resume_gt01',
                    run_id: 'rr_fixture_resume_001',
                    source_id: 'google-trends',
                    job_key: 'GT01',
                    query_group_id: 'GT01',
                    source_context: {},
                    job_order: 1,
                    execution_status: 'COMPLETED',
                    validation_status: 'VALID',
                    attempt_count: 1,
                    accepted_artifact_id:
                      'artifact_fixture_resume_gt01',
                    created_at: '2026-09-13T13:00:00.000Z',
                    started_at: '2026-09-13T13:00:01.000Z',
                    completed_at: '2026-09-13T13:00:03.000Z',
                  },
                  {
                    job_id: 'job_fixture_resume_gt02',
                    run_id: 'rr_fixture_resume_001',
                    source_id: 'google-trends',
                    job_key: 'GT02',
                    query_group_id: 'GT02',
                    source_context: {},
                    job_order: 2,
                    execution_status: 'COMPLETED',
                    validation_status: 'VALID',
                    attempt_count: 2,
                    accepted_artifact_id:
                      'artifact_fixture_resume_gt02',
                    created_at: '2026-09-13T13:00:00.000Z',
                    started_at: '2026-09-13T13:00:04.000Z',
                    completed_at: '2026-09-13T13:00:08.000Z',
                  },
                ],
                completed_jobs: 2,
                failed_jobs: 0,
                can_resume: false,
                can_retry: false,
                can_cancel: false,
              };
            }

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
              can_resume: false,
              can_retry: false,
              can_cancel: false,
            };
          },


          resumeDesktopInterrupted:
            async (runId) => {
              window.__resumedDesktopRunId =
                runId;

              return {
                run: {
                  run_id: 'rr_fixture_resume_001',
                  workspace_id: 'ws_fixture',
                  run_status: 'RETRY_REQUIRED',
                  created_at: '2026-09-13T13:00:00.000Z',
                  started_at: '2026-09-13T13:00:01.000Z',
                  completed_at: null,
                  application_version: '1.0.0',
                  selected_sources: [
                    'google-trends',
                  ],
                  requested_configuration: null,
                  configuration_snapshot: {},
                },
                jobs: [
                  {
                    job_id: 'job_fixture_resume_gt01',
                    run_id: 'rr_fixture_resume_001',
                    source_id: 'google-trends',
                    job_key: 'GT01',
                    query_group_id: 'GT01',
                    source_context: {},
                    job_order: 1,
                    execution_status: 'COMPLETED',
                    validation_status: 'VALID',
                    attempt_count: 1,
                    accepted_artifact_id:
                      'artifact_fixture_resume_gt01',
                    created_at: '2026-09-13T13:00:00.000Z',
                    started_at: '2026-09-13T13:00:01.000Z',
                    completed_at: '2026-09-13T13:00:03.000Z',
                  },
                  {
                    job_id: 'job_fixture_resume_gt02',
                    run_id: 'rr_fixture_resume_001',
                    source_id: 'google-trends',
                    job_key: 'GT02',
                    query_group_id: 'GT02',
                    source_context: {},
                    job_order: 2,
                    execution_status: 'RETRY_PENDING',
                    validation_status: 'NOT_RUN',
                    attempt_count: 1,
                    accepted_artifact_id: null,
                    created_at: '2026-09-13T13:00:00.000Z',
                    started_at: '2026-09-13T13:00:04.000Z',
                    completed_at: null,
                  },
                ],
                completed_jobs: 1,
                failed_jobs: 0,
                can_resume: false,
                can_retry: true,
                can_cancel: true,
              };
            },

          continueDesktopManual:
            async (runId) => {
              window.__continueDesktopManualRunId =
                runId;

              return {
                run: {
                  run_id:
                    'rr_fixture_ikas_001',
                  workspace_id:
                    'ws_fixture',
                  run_status:
                    'MANUAL_ACTION_REQUIRED',
                  created_at:
                    '2026-09-14T17:00:00.000Z',
                  started_at:
                    '2026-09-14T17:00:01.000Z',
                  completed_at:
                    null,
                  application_version:
                    '1.0.0',
                  selected_sources: [
                    'ikas-products',
                  ],
                  requested_configuration:
                    null,
                  configuration_snapshot:
                    {},
                },
                jobs: [
                  {
                    job_id:
                      'job_fixture_ikas_001',
                    run_id:
                      'rr_fixture_ikas_001',
                    source_id:
                      'ikas-products',
                    job_key:
                      'ikas-products-current',
                    query_group_id:
                      null,
                    source_context:
                      {},
                    job_order:
                      1,
                    execution_status:
                      'MANUAL_ACTION_REQUIRED',
                    validation_status:
                      'NOT_RUN',
                    attempt_count:
                      1,
                    accepted_artifact_id:
                      null,
                    created_at:
                      '2026-09-14T17:00:00.000Z',
                    started_at:
                      '2026-09-14T17:00:01.000Z',
                    completed_at:
                      null,
                  },
                ],
                completed_jobs:
                  0,
                failed_jobs:
                  0,
                can_resume:
                  false,
                can_retry:
                  false,
                can_cancel:
                  false,
              };
            },

          cancelDesktopRun:
            async (runId) => {
              window.__cancelDesktopRunId =
                runId;

              return {
                run: {
                  run_id:
                    'rr_fixture_cancel_001',
                  workspace_id:
                    'ws_fixture',
                  run_status:
                    'CANCELLED',
                  created_at:
                    '2026-09-13T14:00:00.000Z',
                  started_at:
                    '2026-09-13T14:00:01.000Z',
                  completed_at:
                    '2026-09-13T14:00:05.000Z',
                  application_version:
                    '1.0.0',
                  selected_sources: [
                    'google-trends',
                  ],
                  requested_configuration:
                    null,
                  configuration_snapshot:
                    {},
                },
                jobs: [
                  {
                    job_id:
                      'job_fixture_cancel_gt01',
                    run_id:
                      'rr_fixture_cancel_001',
                    source_id:
                      'google-trends',
                    job_key:
                      'GT01',
                    query_group_id:
                      'GT01',
                    source_context:
                      {},
                    job_order:
                      1,
                    execution_status:
                      'COMPLETED',
                    validation_status:
                      'VALID',
                    attempt_count:
                      1,
                    accepted_artifact_id:
                      'artifact_fixture_cancel_gt01',
                    created_at:
                      '2026-09-13T14:00:00.000Z',
                    started_at:
                      '2026-09-13T14:00:01.000Z',
                    completed_at:
                      '2026-09-13T14:00:03.000Z',
                  },
                  {
                    job_id:
                      'job_fixture_cancel_gt02',
                    run_id:
                      'rr_fixture_cancel_001',
                    source_id:
                      'google-trends',
                    job_key:
                      'GT02',
                    query_group_id:
                      'GT02',
                    source_context:
                      {},
                    job_order:
                      2,
                    execution_status:
                      'CANCELLED',
                    validation_status:
                      'NOT_RUN',
                    attempt_count:
                      1,
                    accepted_artifact_id:
                      null,
                    created_at:
                      '2026-09-13T14:00:00.000Z',
                    started_at:
                      '2026-09-13T14:00:04.000Z',
                    completed_at:
                      '2026-09-13T14:00:05.000Z',
                  },
                ],
                completed_jobs:
                  1,
                failed_jobs:
                  0,
                can_resume:
                  false,
                can_retry:
                  false,
                can_cancel:
                  false,
              };
            },

          exportDesktopRun: async (input) => {
            window.__exportDesktopRunInputs =
              [
                ...(
                  window.__exportDesktopRunInputs
                  ?? []
                ),
                input,
              ];

            return {
              export_directory:
                input.mode === 'ALL'
                  ? '/fixture/exports/all'
                  : '/fixture/exports/successful-only',
              dataset_count:
                input.mode === 'ALL'
                  ? 1
                  : 1,
              failed_count:
                input.mode === 'ALL'
                  ? 1
                  : 0,
            };
          },

          selectDesktopInputFile: async (input) => {
            window.__selectedDesktopInputRequest = input;

            if (
              input.input_kind
                === 'KEYWORD_PLANNER_CSV'
            ) {
              return {
                canceled: false,
                file_path: '/fixture/imports/keyword-stats.csv',
                file_name: 'keyword-stats.csv',
                file_size_bytes: 2048,
                file_type: 'CSV',
              };
            }

            return {
              canceled: false,
              file_path: '/fixture/imports/ikas-products.xlsx',
              file_name: 'ikas-products.xlsx',
              file_size_bytes: 4096,
              file_type: 'XLSX',
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

    const dashboard = page.getByTestId('operations-dashboard');
    assert.equal(await dashboard.getByText('4 ready', { exact: true }).count(), 1);
    assert.equal(await dashboard.getByText('2 need connection', { exact: true }).count(), 1);
    assert.equal(await dashboard.getByText('2 need import', { exact: true }).count(), 1);
    assert.equal(await dashboard.getByText('1 needs attention', { exact: true }).count(), 1);
    assert.equal(await dashboard.getByText('Recent completed work', { exact: true }).count(), 1);

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
          exact: true,
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

    await page.getByRole(
      'button',
      {
        name: 'WORKSPACE',
        exact: true,
      },
    ).click();

    await page.getByRole(
      'heading',
      {
        name: 'Workspace',
        exact: true,
      },
    ).waitFor();

    assert.equal(
      await page.evaluate(
        () => window.__desktopWorkspaceConnectionsWorkspaceId,
      ),
      'ws_fixture',
      'Workspace view must load safe connection state for the selected Workspace.',
    );

    for (const sourceId of [
      'google-search-console-query-page',
      'google-ads-search-terms',
      'google-keyword-planner',
      'google-analytics-4',
      'serpapi',
    ]) {
      assert.equal(
        await page.getByText(sourceId, {
          exact: true,
        }).count(),
        1,
        `Workspace must expose connection state for ${sourceId}.`,
      );
    }

    assert.equal(
      await page.getByText('Credential: AVAILABLE', {
        exact: true,
      }).count(),
      2,
      'Credential status must be rendered separately from readiness.',
    );

    assert.equal(
      await page.getByText('Readiness: READY', {
        exact: true,
      }).count(),
      1,
      'Readiness status must remain a separate safe state.',
    );

    assert.equal(
      await page.getByText('cred:do-not-render', {
        exact: false,
      }).count(),
      0,
      'Credential references must never be rendered.',
    );

    assert.equal(
      await page.getByText('do-not-leak', {
        exact: false,
      }).count(),
      0,
      'Secret material must never be rendered.',
    );

    const gscConnection = page.getByTestId(
      'workspace-connection-google-search-console-query-page',
    );
    const adsConnection = page.getByTestId(
      'workspace-connection-google-ads-search-terms',
    );
    const plannerConnection = page.getByTestId(
      'workspace-connection-google-keyword-planner',
    );
    const ga4Connection = page.getByTestId(
      'workspace-connection-google-analytics-4',
    );
    const serpApiConnection = page.getByTestId(
      'workspace-connection-serpapi',
    );

    const googleProviderConfiguration = page.getByTestId(
      'google-provider-configuration',
    );
    await googleProviderConfiguration.getByRole('heading', {
      name: 'Application / Provider Credentials',
      exact: true,
    }).waitFor();
    await googleProviderConfiguration.getByText(
      'OAuth application: NOT_CONFIGURED',
      { exact: true },
    ).waitFor();
    assert.equal(
      await googleProviderConfiguration.locator('input').count(),
      0,
      'Provider credentials must never enter renderer inputs.',
    );
    assert.equal(
      await plannerConnection.getByRole('button', { name: 'Connect' }).isDisabled(),
      true,
      'Ads-backed Connect must wait for shared provider setup.',
    );
    await googleProviderConfiguration.getByRole('button', {
      name: 'Configure OAuth application',
      exact: true,
    }).click();
    await googleProviderConfiguration.getByText(
      'OAuth application: AVAILABLE',
      { exact: true },
    ).waitFor();
    assert.deepEqual(
      await page.evaluate(() => window.__googleProviderConfigurationCalls),
      [
        { component: 'OAUTH_APPLICATION' },
      ],
      'Renderer sends only the active OAuth application intent; native prompts own all submitted values.',
    );
    assert.equal(
      await googleProviderConfiguration.getByRole('button', {
        name: 'Replace OAuth application',
        exact: true,
      }).count(),
      1,
    );
    assert.equal(
      await googleProviderConfiguration.getByText(
        /Google Ads developer token/i,
      ).count(),
      0,
    );
    assert.equal(
      await googleProviderConfiguration.getByRole('button', {
        name: /Google Ads developer token/i,
      }).count(),
      0,
    );
    assert.equal(
      await plannerConnection.getByRole('button', { name: 'Connect' }).isEnabled(),
      false,
      'Workspace metadata is still required after provider setup.',
    );

    assert.equal(await gscConnection.getByRole('button', { name: 'Manage' }).count(), 1);
    assert.equal(await gscConnection.getByRole('button', { name: 'Disconnect' }).count(), 1);
    assert.equal(await adsConnection.getByRole('button', { name: 'Reconnect' }).count(), 1);
    assert.equal(await adsConnection.getByRole('button', { name: 'Disconnect' }).count(), 1);
    assert.equal(await plannerConnection.getByRole('button', { name: 'Connect' }).count(), 1);
    assert.equal(await ga4Connection.getByRole('button', { name: 'Connect' }).count(), 1);
    assert.equal(await serpApiConnection.getByRole('button', { name: 'Replace API key' }).count(), 1);
    assert.equal(await serpApiConnection.getByRole('button', { name: 'Disconnect' }).count(), 1);
    assert.equal(await serpApiConnection.locator('input[type="text"], input[type="password"]').count(), 0);
    await serpApiConnection.getByText(
      'API-key entry opens in a native masked prompt and never enters this renderer.',
      { exact: true },
    ).waitFor();
    assert.equal(await page.getByText(/clipboard/i).count(), 0);
    assert.equal(await page.getByLabel('Site URL for google-search-console-query-page').inputValue(), '');
    assert.equal(await page.getByLabel('Customer ID for google-ads-search-terms', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('Login customer ID for google-ads-search-terms').inputValue(), '');
    assert.equal(await page.getByLabel('Customer ID for google-keyword-planner', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('Login customer ID for google-keyword-planner').inputValue(), '');

    assert.equal(
      await page.getByLabel(
        'Property ID for google-analytics-4',
        { exact: true },
      ).inputValue(),
      '',
    );

    assert.equal(
      await ga4Connection.getByText(/Measurement ID/i).count(),
      0,
      'GA4 Workspace connection must not request a Measurement ID.',
    );

    assert.equal(
      await ga4Connection.getByText(/API Key/i).count(),
      0,
      'GA4 Workspace connection must not request an API key.',
    );

    await page.getByLabel('Site URL for google-search-console-query-page').fill(
      ' sc-domain:managed.example ',
    );
    await page.evaluate(() => {
      window.__holdWorkspaceMutation = true;
      window.__nextWorkspaceConnectionState = window.__workspaceConnectionState.map(
        (connection) => connection.source_id === 'google-search-console-query-page'
          ? { ...connection, readiness_status: 'READY' }
          : connection,
      );
    });
    await gscConnection.getByRole('button', { name: 'Manage' }).click();
    await gscConnection.getByRole('button', { name: 'Manage' }).waitFor({ state: 'attached' });
    await page.waitForFunction(() => {
      const row = document.querySelector(
        '[data-testid="workspace-connection-google-search-console-query-page"]',
      );
      return [...(row?.querySelectorAll('button') ?? [])].some(
        (button) => button.textContent?.trim() === 'Manage' && button.disabled,
      );
    });
    await gscConnection.getByRole('button', { name: 'Manage' }).evaluate((button) => button.click());
    assert.equal(
      await page.evaluate(() => window.__workspaceConnectionMutationCalls.length),
      1,
      'A pending row mutation must not double-submit.',
    );
    await page.evaluate(() => window.__releaseWorkspaceMutation());
    await gscConnection.getByText('Readiness: READY', { exact: true }).waitFor();

    await page.getByLabel('Customer ID for google-ads-search-terms', { exact: true }).fill(' 123 ');
    await page.getByLabel('Login customer ID for google-ads-search-terms').fill(' 456 ');
    await page.evaluate(() => {
      window.__workspaceMutationResult = {
        ok: false,
        error: {
          code: 'OAUTH_MANUAL_ACTION_REQUIRED',
          source_id: 'google-ads-search-terms',
          retryable: false,
          raw_error: 'do-not-render-provider-error',
        },
      };
      window.__nextWorkspaceConnectionState = window.__workspaceConnectionState.map(
        (connection) => connection.source_id === 'google-ads-search-terms'
          ? { ...connection, readiness_status: 'MANUAL_ACTION_REQUIRED' }
          : connection,
      );
    });
    await adsConnection.getByRole('button', { name: 'Reconnect' }).click();
    await page.getByText('Google authorization needs your attention.', { exact: true }).waitFor();
    assert.equal(await page.getByText('do-not-render-provider-error', { exact: false }).count(), 0);

    await page.getByLabel('Customer ID for google-keyword-planner', { exact: true }).fill(' 789 ');
    await page.evaluate(() => {
      window.__workspaceMutationResult = {
        ok: true,
        result: {
          source_id: 'google-keyword-planner',
          action: 'CONNECT_GOOGLE',
          outcome: 'SUCCEEDED_WITH_CLEANUP_WARNING',
        },
      };
      window.__nextWorkspaceConnectionState = window.__workspaceConnectionState.map(
        (connection) => connection.source_id === 'google-keyword-planner'
          ? { ...connection, credential_status: 'AVAILABLE', readiness_status: 'READY' }
          : connection,
      );
    });
    await plannerConnection.getByRole('button', { name: 'Connect' }).click();
    await page.getByText(
      'Connection updated, but obsolete credential cleanup needs attention.',
      { exact: true },
    ).waitFor();


    await page.getByLabel(
      'Property ID for google-analytics-4',
      { exact: true },
    ).fill(' 123456789 ');

    const ga4ReadCountBefore =
      await page.evaluate(
        () => window.__workspaceConnectionReadCount,
      );

    await ga4Connection.getByRole(
      'button',
      { name: 'Connect' },
    ).click();

    await page.waitForFunction(
      (before) =>
        window.__workspaceConnectionReadCount > before,
      ga4ReadCountBefore,
    );

    assert.deepEqual(
      await page.evaluate(
        () =>
          window.__workspaceConnectionMutationCalls.at(-1),
      ),
      [
        'connectGoogleDesktopWorkspaceConnection',
        {
          workspace_id: 'ws_fixture',
          source_id: 'google-analytics-4',
          metadata: {
            property_id: '123456789',
          },
        },
      ],
      'GA4 Connect must send only trimmed Property ID through the typed Google connection method.',
    );

    await page.evaluate(() => {
      window.__holdWorkspaceMutation = true;
      window.__nextWorkspaceConnectionState = window.__workspaceConnectionState.map(
        (connection) => connection.source_id === 'serpapi'
          ? { ...connection, credential_status: 'AVAILABLE', readiness_status: 'READY' }
          : connection,
      );
    });
    await serpApiConnection.getByRole('button', { name: 'Replace API key' }).click();
    await page.waitForFunction(() => {
      const row = document.querySelector('[data-testid="workspace-connection-serpapi"]');
      return [...(row?.querySelectorAll('button') ?? [])].some(
        (button) => button.textContent?.trim() === 'Replace API key' && button.disabled,
      );
    });
    await serpApiConnection.getByRole('button', { name: 'Replace API key' })
      .evaluate((button) => button.click());
    assert.equal(
      await page.evaluate(() => window.__workspaceConnectionMutationCalls.length),
      5,
      'A pending SerpApi provisioning action must not double-submit.',
    );
    await page.evaluate(() => window.__releaseWorkspaceMutation());
    await serpApiConnection.getByText('Readiness: READY', { exact: true }).waitFor();

    await page.evaluate(() => {
      window.__workspaceMutationResult = {
        ok: false,
        error: {
          code: 'SECRET_INGRESS_CANCELLED',
          source_id: 'serpapi',
          retryable: false,
          native_stdout: 'sentinel-native-stdout',
        },
      };
      window.__nextWorkspaceConnectionState = window.__workspaceConnectionState.map(
        (connection) => connection.source_id === 'serpapi'
          ? { ...connection, credential_status: 'MISSING', readiness_status: 'CONNECTION_REQUIRED' }
          : connection,
      );
    });
    await serpApiConnection.getByRole('button', { name: 'Replace API key' }).click();
    await page.getByText('SerpApi API-key entry was cancelled.', { exact: true }).waitFor();
    await serpApiConnection.getByRole('button', { name: 'Re-provision API key' }).waitFor();
    assert.equal(await serpApiConnection.getByRole('button', { name: 'Disconnect' }).count(), 1);

    const serpApiSafeErrors = [
      ['SECRET_INGRESS_FAILED', 'SerpApi API-key entry could not be completed.'],
      ['SECRET_INPUT_INVALID', 'The SerpApi API key is invalid.'],
      ['CREDENTIAL_PERSISTENCE_FAILED', 'The protected credential could not be saved.'],
      ['CONNECTION_PERSISTENCE_FAILED', 'The Workspace connection could not be saved.'],
      ['CONNECTION_REBIND_FAILED', 'The Workspace connection could not be replaced safely.'],
    ];
    for (let index = 0; index < serpApiSafeErrors.length; index += 1) {
      const [code, copy] = serpApiSafeErrors[index];
      await page.evaluate(
        ({ errorCode, moveToNotConfigured }) => {
          window.__workspaceMutationResult = {
            ok: false,
            error: {
              code: errorCode,
              source_id: 'serpapi',
              retryable: errorCode === 'SECRET_INGRESS_FAILED',
              raw_error: 'sentinel-raw-error',
              credential_ref: 'cred:sentinel-reference',
            },
          };
          if (moveToNotConfigured) {
            window.__nextWorkspaceConnectionState = window.__workspaceConnectionState.map(
              (connection) => connection.source_id === 'serpapi'
                ? {
                    ...connection,
                    credential_status: 'NOT_CONFIGURED',
                    readiness_status: 'CONFIGURATION_REQUIRED',
                  }
                : connection,
            );
          }
        },
        {
          errorCode: code,
          moveToNotConfigured: index === serpApiSafeErrors.length - 1,
        },
      );
      await serpApiConnection.getByRole('button', { name: 'Re-provision API key' }).click();
      await page.getByText(copy, { exact: true }).waitFor();
    }

    await serpApiConnection.getByRole('button', { name: 'Provision API key' }).waitFor();
    assert.equal(await serpApiConnection.getByRole('button', { name: 'Disconnect' }).count(), 0);

    await page.evaluate(() => {
      window.__workspaceMutationThrow = 'sentinel-api-key sentinel-native-stdout sentinel-raw-error';
    });
    await serpApiConnection.getByRole('button', { name: 'Provision API key' }).click();
    await page.getByText('The Workspace connection could not be updated.', { exact: true }).waitFor();

    await page.evaluate(() => {
      window.__nextWorkspaceConnectionState = window.__workspaceConnectionState.map(
        (connection) => connection.source_id === 'serpapi'
          ? { ...connection, credential_status: 'AVAILABLE', readiness_status: 'READY' }
          : connection,
      );
    });
    await serpApiConnection.getByRole('button', { name: 'Provision API key' }).click();
    await serpApiConnection.getByText('Credential: AVAILABLE', { exact: true }).waitFor();
    await serpApiConnection.getByText('Readiness: READY', { exact: true }).waitFor();

    await page.evaluate(() => {
      window.__workspaceMutationResult = {
        ok: true,
        result: {
          source_id: 'serpapi',
          action: 'PROVISION_SERPAPI',
          outcome: 'SUCCEEDED_WITH_CLEANUP_WARNING',
        },
      };
    });
    await serpApiConnection.getByRole('button', { name: 'Replace API key' }).click();
    await page.getByText(
      'Connection updated, but obsolete credential cleanup needs attention.',
      { exact: true },
    ).waitFor();

    await page.evaluate(() => {
      window.__workspaceConnectionReadError = 'sentinel-read-error';
    });
    await serpApiConnection.getByRole('button', { name: 'Replace API key' }).click();
    await page.getByText(
      'Workspace connection state could not be refreshed.',
      { exact: true },
    ).waitFor();
    assert.equal(
      await page.getByText('Workspace connection updated.', { exact: true }).count(),
      0,
      'A failed reread after committed success must show only the safe refresh message.',
    );

    await page.evaluate(() => {
      window.__nextWorkspaceConnectionState = window.__workspaceConnectionState.map(
        (connection) => connection.source_id === 'serpapi'
          ? { ...connection, credential_status: 'NOT_CONFIGURED', readiness_status: 'CONFIGURATION_REQUIRED' }
          : connection,
      );
    });
    await serpApiConnection.getByRole('button', { name: 'Disconnect' }).click();
    await serpApiConnection.getByText('Credential: NOT_CONFIGURED', { exact: true }).waitFor();

    assert.equal(
      await page.evaluate(() => window.__workspaceConnectionReadCount),
      18,
      'Initial read, the OAuth provider update, and every connection mutation must reread exactly once.',
    );
    assert.deepEqual(
      await page.evaluate(() => window.__workspaceConnectionReadsAfterMutation),
      [0, 0, ...Array.from({ length: 16 }, (_, index) => index + 1)],
      'The OAuth provider update and every connection mutation branch must perform exactly one final reread.',
    );
    assert.deepEqual(
      await page.evaluate(() => window.__workspaceConnectionMutationCalls),
      [
        ['manageDesktopWorkspaceConnection', {
          workspace_id: 'ws_fixture',
          source_id: 'google-search-console-query-page',
          metadata: { site_url: 'sc-domain:managed.example' },
        }],
        ['reconnectGoogleDesktopWorkspaceConnection', {
          workspace_id: 'ws_fixture',
          source_id: 'google-ads-search-terms',
          metadata: { customer_id: '123', login_customer_id: '456' },
        }],
        ['connectGoogleDesktopWorkspaceConnection', {
          workspace_id: 'ws_fixture',
          source_id: 'google-keyword-planner',
          metadata: { customer_id: '789' },
        }],
        ['connectGoogleDesktopWorkspaceConnection', {
          workspace_id: 'ws_fixture',
          source_id: 'google-analytics-4',
          metadata: { property_id: '123456789' },
        }],
        ...Array.from({ length: 11 }, () => [
          'provisionSerpApiDesktopWorkspaceConnection',
          {
            workspace_id: 'ws_fixture',
            source_id: 'serpapi',
          },
        ]),
        ['disconnectDesktopWorkspaceConnection', {
          workspace_id: 'ws_fixture',
          source_id: 'serpapi',
        }],
      ],
      'Each action must invoke only its dedicated typed preload method with renderer-safe metadata.',
    );
    assert.equal(
      [
        await page.locator('body').innerText(),
        JSON.stringify(await page.evaluate(() => window.__workspaceConnectionMutationCalls)),
        capturedRendererOutput.join('\n'),
      ].some((value) => /sentinel-api-key|credential_ref|sentinel-native-stdout|sentinel-raw-error/.test(value)),
      false,
      'DOM, typed invocation records, visible messages, and captured renderer output must contain no secret or native-process details.',
    );

    await page.getByRole(
      'button',
      {
        name: 'RUNS',
        exact: true,
      },
    ).click();

    await page.getByRole(
      'heading',
      {
        name: 'Runs',
        exact: true,
      },
    ).waitFor();

    assert.equal(
      await page.evaluate(
        () => window.__listDesktopRunsWorkspaceId,
      ),
      'ws_fixture',
      'Run History must load persisted Runs for the selected Workspace.',
    );

    assert.equal(
      await page.getByText(
        'rr_fixture_history_001',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run History must expose persisted Run identity.',
    );

    assert.equal(
      await page.getByText(
        'COMPLETED WITH WARNINGS',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run History must expose persisted Run status.',
    );


    // RUN-CANCEL-UI-001
    const cancellableHistoryRunButton =
      page.getByRole(
        'button',
        {
          name:
            /rr_fixture_cancel_001/,
        },
      );

    assert.equal(
      await cancellableHistoryRunButton.count(),
      1,
      'Run History must expose the persisted cancellable Run.',
    );

    await cancellableHistoryRunButton.click();

    await page.getByRole(
      'heading',
      {
        name: 'Run Detail',
        exact: true,
      },
    ).waitFor();

    assert.equal(
      await page.evaluate(
        () => window.__openedCancelRunId,
      ),
      'rr_fixture_cancel_001',
      'Cancellable Run Detail must load the exact persisted run_id.',
    );

    const cancelRunButton =
      page.getByRole(
        'button',
        {
          name: 'Cancel Run',
          exact: true,
        },
      );

    assert.equal(
      await cancelRunButton.count(),
      1,
      'Authoritative can_cancel=true must expose Cancel Run.',
    );

    await cancelRunButton.click();

    assert.equal(
      await page.evaluate(
        () => window.__cancelDesktopRunId,
      ),
      'rr_fixture_cancel_001',
      'Cancel Run must invoke the desktop API with the exact persisted run_id.',
    );

    assert.equal(
      await page.getByText(
        'Run Status: CANCELLED',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must apply the terminal CANCELLED state returned by cancellation.',
    );

    for (
      const actionName of [
        'Cancel Run',
        'Resume Run',
        'Retry Failed',
        'Continue Run',
      ]
    ) {
      assert.equal(
        await page.getByRole(
          'button',
          {
            name: actionName,
            exact: true,
          },
        ).count(),
        0,
        `Terminal CANCELLED state must not expose ${actionName}.`,
      );
    }

    await page.reload();

    await page.getByRole(
      'button',
      {
        name: 'RUNS',
        exact: true,
      },
    ).click();

    await page.getByRole(
      'heading',
      {
        name: 'Runs',
        exact: true,
      },
    ).waitFor();

    // RESTART-RESUME-UI-001
    const interruptedHistoryRunButton =
      page.getByRole(
        'button',
        {
          name:
            /rr_fixture_resume_001/,
        },
      );

    assert.equal(
      await interruptedHistoryRunButton.count(),
      1,
      'Run History must expose the persisted interrupted Run.',
    );

    await interruptedHistoryRunButton.click();

    await page.getByRole(
      'heading',
      {
        name: 'Run Detail',
        exact: true,
      },
    ).waitFor();

    assert.equal(
      await page.evaluate(
        () => window.__openedResumeRunId,
      ),
      'rr_fixture_resume_001',
      'Interrupted Run Detail must load the exact persisted run_id.',
    );

    const resumeRunButton =
      page.getByRole(
        'button',
        {
          name: 'Resume Run',
          exact: true,
        },
      );

    assert.equal(
      await resumeRunButton.count(),
      1,
      'Persisted interrupted Run Detail must expose an explicit Resume Run action.',
    );

    await resumeRunButton.click();

    assert.equal(
      await page.evaluate(
        () => window.__resumedDesktopRunId,
      ),
      'rr_fixture_resume_001',
      'Resume Run must use the exact persisted run_id.',
    );

    const resumedRetryButton =
      page.getByRole(
        'button',
        {
          name: 'Retry Failed',
          exact: true,
        },
      );

    assert.equal(
      await resumedRetryButton.count(),
      1,
      'Reconciled RETRY_PENDING work must expose explicit Retry Failed.',
    );

    await resumedRetryButton.click();

    assert.equal(
      await page.evaluate(
        () => window.__retriedResumeRunId,
      ),
      'rr_fixture_resume_001',
      'Explicit retry after resume must keep the same persisted run_id.',
    );

    assert.equal(
      await page.getByText(
        'Run Status: COMPLETED',
        {
          exact: true,
        },
      ).count(),
      1,
      'Restart Resume then explicit Retry must complete the same Run.',
    );

    await page.reload();

    await page.getByRole(
      'button',
      {
        name: 'RUNS',
        exact: true,
      },
    ).click();

    await page.getByRole(
      'heading',
      {
        name: 'Runs',
        exact: true,
      },
    ).waitFor();

    const historyRunButton =
      page.getByRole(
        'button',
        {
          name: /rr_fixture_history_001/,
        },
      );

    assert.equal(
      await historyRunButton.count(),
      1,
      'Persisted Run History rows must be selectable.',
    );

    assert.equal(
      await page.getByText('İkas — Products Import', { exact: true }).count(),
      1,
      'Run History must lead with the human task identity.',
    );
    assert.equal(
      await page.getByText('2026-09-13T12:00:00.000Z', { exact: true }).count(),
      0,
      'Run History must not lead with a raw machine timestamp.',
    );

    await historyRunButton.click();

    await page.getByRole(
      'heading',
      {
        name: 'Run Detail',
        exact: true,
      },
    ).waitFor();

    assert.equal(
      await page.evaluate(
        () => window.__openedHistoryRunId,
      ),
      'rr_fixture_history_001',
      'Selecting history must load persisted state for the exact Run identity.',
    );

    assert.equal(
      await page.getByText(
        'ikas-products-history',
        {
          exact: true,
        },
      ).count(),
      1,
      'History selection must reuse the existing Run Detail Job surface.',
    );

    assert.equal(await page.getByRole('heading', { level: 2, name: 'İkas — Products Import', exact: true }).count(), 1);
    assert.equal(await page.getByText('Execution: COMPLETED', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Validation: LOW DATA', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Execution: FAILED', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Validation: INVALID SCHEMA', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Error: INVALID_SCHEMA', { exact: true }).count(), 1);

    const openAcceptedEvidenceButton = page.getByRole(
      'button',
      {
        name: 'Open Accepted Evidence',
        exact: true,
      },
    );

    assert.equal(
      await openAcceptedEvidenceButton.count(),
      1,
      'A completed Job with accepted evidence must expose the bounded open action.',
    );

    await openAcceptedEvidenceButton.click();

    assert.deepEqual(
      await page.evaluate(() => window.__openedAcceptedEvidence),
      {
        run_id: 'rr_fixture_history_001',
        job_id: 'job_fixture_history_001',
      },
      'The evidence action must send only the exact persisted Run/Job identity.',
    );

    assert.equal(
      await page.getByRole(
        'button',
        {
          name: 'Export All',
          exact: true,
        },
      ).count(),
      1,
      'Terminal Run Detail must expose Export All.',
    );

    assert.equal(
      await page.getByRole(
        'button',
        {
          name: 'Export Successful Only',
          exact: true,
        },
      ).count(),
      1,
      'Terminal Run Detail must expose Export Successful Only.',
    );

    const buildBlogWritingPackButton = page.getByRole(
      'button',
      { name: 'Build Blog Writing Pack', exact: true },
    );
    assert.equal(await buildBlogWritingPackButton.count(), 1);
    await buildBlogWritingPackButton.click();
    assert.deepEqual(await page.evaluate(() => window.__blogWritingPackBuildCalls), ['rr_fixture_history_001']);
    assert.equal(await page.getByText('Blog Writing Pack: PARTIAL', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Package: blog_pkg_1', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Present: QUERY_PAGE', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Incomplete: PRODUCTS', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Missing: INTEREST_OVER_TIME', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Open Blog Writing Pack', exact: true }).click();
    await page.getByRole('button', { name: 'Reveal Blog Writing Pack', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__blogWritingPackOpenCalls), ['blog_pkg_1']);
    assert.deepEqual(await page.evaluate(() => window.__blogWritingPackRevealCalls), ['blog_pkg_1']);
    await buildBlogWritingPackButton.click();
    assert.deepEqual(await page.evaluate(() => window.__blogWritingPackBuildCalls), [
      'rr_fixture_history_001', 'rr_fixture_history_001',
    ]);
    assert.equal(await page.getByText('Package: blog_pkg_2', { exact: true }).count(), 1);
    await page.evaluate(() => { window.__blogWritingPackMode = 'THROW'; });
    await buildBlogWritingPackButton.click();
    assert.equal(await page.getByText('Package: blog_pkg_2', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Open Blog Writing Pack', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Reveal Blog Writing Pack', exact: true }).count(), 0);
    await page.evaluate(() => { window.__blogWritingPackMode = 'NOT_READY'; });
    await buildBlogWritingPackButton.click();
    assert.equal(await page.getByText('Blog Writing Pack: NOT READY', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Missing: INTEREST_OVER_TIME', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Open Blog Writing Pack', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Reveal Blog Writing Pack', exact: true }).count(), 0);
    assert.equal(
      (await page.locator('body').innerText()).includes('/fixture/blog-writing-packs'),
      false,
      'Blog package UI must not expose an absolute package path.',
    );
    await page.getByLabel('Active Workspace').selectOption('ws_other');
    await page.getByLabel('Active Workspace').selectOption('ws_fixture');
    await page.getByRole('button', { name: 'RUNS', exact: true }).click();
    await page.getByRole('button', { name: /rr_fixture_history_001/ }).click();
    assert.equal(
      await page.getByText('Blog Writing Pack: NOT READY', { exact: true }).count(),
      0,
      'Switching away from a Run must clear its stale Blog package result.',
    );

    await page.getByRole(
      'button',
      {
        name: 'Export All',
        exact: true,
      },
    ).click();

    assert.deepEqual(
      await page.evaluate(
        () =>
          window.__exportDesktopRunInputs
          ?? [],
      ),
      [
        {
          run_id: 'rr_fixture_history_001',
          mode: 'ALL',
        },
      ],
      'Export All must use the exact persisted Run identity and ALL mode.',
    );

    assert.equal(
      await page.getByText(
        '/fixture/exports/all',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must expose the completed export directory.',
    );

    assert.equal(
      await page.getByText(
        'Datasets: 1 · Failures: 1',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must expose export result counts.',
    );

    await page.getByRole(
      'button',
      {
        name: 'Export Successful Only',
        exact: true,
      },
    ).click();

    assert.deepEqual(
      await page.evaluate(
        () =>
          window.__exportDesktopRunInputs
          ?? [],
      ),
      [
        {
          run_id: 'rr_fixture_history_001',
          mode: 'ALL',
        },
        {
          run_id: 'rr_fixture_history_001',
          mode: 'SUCCESSFUL_ONLY',
        },
      ],
      'Successful-only export must use the exact persisted Run identity and mode.',
    );

    await page.getByRole(
      'button',
      {
        name: 'HOME',
        exact: true,
      },
    ).click();

    const releaseOneTasks = [
      'Google Trends — Interest Over Time',
      'GSC — Queries Current + Previous 28 Days',
      'GSC — Query × Page Current 28 Days',
      'GSC — Current 90 Days',
      'GSC — Long 16 Months',
      'Google Ads — Search Terms',
      'Keyword Planner — Historical Metrics',
      'Keyword Planner — Manual CSV Import',
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
      19,
    );

    const homeGscCard = page.getByTestId('task-card').filter({ hasText: 'GSC — Current 90 Days' });
    assert.equal(await homeGscCard.getByText('DUE', { exact: true }).count(), 1);
    const homeAdsCard = page.getByTestId('task-card').filter({
      has: page.getByText('Google Ads — Search Terms', {
        exact: true,
      }),
    });
    assert.equal(await homeAdsCard.getByText('CONNECTION REQUIRED', { exact: true }).count(), 1);
    assert.equal(await homeAdsCard.getByText('DUE', { exact: true }).count(), 1, 'Freshness DUE remains visible while readiness is blocked.');
    const homeIkasCard = page.getByTestId('task-card').filter({ hasText: 'İkas — Products Import' });
    assert.equal(await homeIkasCard.getByText('IMPORT NEEDED', { exact: true }).count(), 1);
    const homeSerpCard = page.getByTestId('task-card').filter({ hasText: 'SerpApi — SERP Snapshot' });
    assert.equal(await homeSerpCard.getByText('ON DEMAND', { exact: true }).count(), 1);
    console.log('PASS FRESHNESS-UI-001: readiness and freshness remain separately visible across due, import-needed, and on-demand tasks');

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
      19,
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

    const recentIkasRuns = page.getByTestId('task-recent-runs');
    assert.equal(await recentIkasRuns.count(), 1, 'Task Detail must expose persisted recent runs.');
    assert.equal(await recentIkasRuns.getByText('COMPLETED WITH WARNINGS', { exact: true }).count(), 1);
    assert.equal(await recentIkasRuns.getByText('Validation: 1 valid · 1 needs attention', { exact: true }).count(), 1);

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
        task_id:
          'ikas-products-import',
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
        () => window.__reviewedDesktopArtifact,
      ),
      'Start Run must execute the exact reviewed FILE_IMPORT artifact.',
    );

    console.log(
      'PASS IKAS-FILE-REVIEW-UI-001: selected XLSX path is reviewed and started through the locked FILE_IMPORT artifact',
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
        'Validation: NOT RUN',
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
        'Run Status: MANUAL ACTION REQUIRED',
        {
          exact: true,
        },
      ).count(),
      1,
      'Run Detail must render the refreshed persisted Run status.',
    );

    // MANUAL-CONTINUE-UI-001
    const continueRunButton =
      page.getByRole(
        'button',
        {
          name:
            'Continue Run',
          exact:
            true,
        },
      );

    assert.equal(
      await continueRunButton.count(),
      1,
      'MANUAL_ACTION_REQUIRED Run Detail must expose an explicit Continue Run action.',
    );

    await continueRunButton.click();

    assert.equal(
      await page.evaluate(
        () =>
          window
            .__continueDesktopManualRunId,
      ),
      'rr_fixture_ikas_001',
      'Continue Run must use the exact persisted run_id through the desktop API boundary.',
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
        'Run Status: RETRY REQUIRED',
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

    await page.reload();

    await page.getByRole(
      'heading',
      {
        name:
          'Collection Operations',
        exact:
          true,
      },
    ).waitFor();

    const gscCurrentTaskCard =
      page
        .getByTestId(
          'task-card',
        )
        .filter({
          hasText:
            'GSC — Current 90 Days',
        });

    await gscCurrentTaskCard
      .getByText(
        'READY',
        {
          exact:
            true,
        },
      )
      .waitFor();

    await gscCurrentTaskCard.click();

    const gscReviewButton =
      page.getByRole(
        'button',
        {
          name:
            'Review Quick Run',
          exact:
            true,
        },
      );

    assert.equal(
      await gscReviewButton.isEnabled(),
      true,
      'GSC Current Quick Run must be reviewable without a file input.',
    );

    await gscReviewButton.click();

    await page.getByRole(
      'heading',
      {
        name:
          'Review Quick Run',
        exact:
          true,
      },
    ).waitFor();

    assert.deepEqual(
      await page.evaluate(
        () =>
          window
            .__reviewedDesktopDraft
            ?.reusable_configuration
            ?.sources
            ?.['google-search-console-query-page'],
      ),
      {
        included:
          true,
        task_id:
          'gsc-current-90-days',
        date_policy:
          'TODAY_MINUS_90_TO_YESTERDAY',
      },
      'GSC Current Review must receive machine-readable task identity and relative date policy.',
    );

    assert.equal(
      await page.getByText(
        'Reference date: 2026-09-14',
        {
          exact:
            true,
        },
      ).count(),
      1,
      'Review must show the exact resolved reference date.',
    );

    assert.equal(
      await page.getByText(
        'Resolved range: 2026-06-16 → 2026-09-13',
        {
          exact:
            true,
        },
      ).count(),
      1,
      'Review must show the exact resolved GSC Current date range.',
    );

    const gscStartButton =
      page.getByRole(
        'button',
        {
          name:
            'Start Run',
          exact:
            true,
        },
      );

    assert.equal(
      await gscStartButton.isEnabled(),
      true,
      'Reviewed GSC Current Run must expose Start Run.',
    );

    await gscStartButton.click();

    assert.deepEqual(
      await page.evaluate(
        () =>
          window
            .__startedDesktopDraft,
      ),
      await page.evaluate(
        () =>
          window
            .__reviewedDesktopArtifact,
      ),
      'Start Run must send the exact reviewed artifact rather than rebuilding the GSC dates.',
    );

    await page.reload();

    await page.getByRole(
      'heading',
      {
        name:
          'Collection Operations',
        exact:
          true,
      },
    ).waitFor();

    const gscLongTaskCard =
      page
        .getByTestId(
          'task-card',
        )
        .filter({
          hasText:
            'GSC — Long 16 Months',
        });

    await gscLongTaskCard
      .getByText(
        'READY',
        {
          exact:
            true,
        },
      )
      .waitFor();

    await gscLongTaskCard.click();

    const gscLongReviewButton =
      page.getByRole(
        'button',
        {
          name:
            'Review Quick Run',
          exact:
            true,
        },
      );

    assert.equal(
      await gscLongReviewButton.isEnabled(),
      true,
      'GSC Long Quick Run must be reviewable without a file input.',
    );

    await gscLongReviewButton.click();

    await page.getByRole(
      'heading',
      {
        name:
          'Review Quick Run',
        exact:
          true,
      },
    ).waitFor();

    assert.deepEqual(
      await page.evaluate(
        () =>
          window
            .__reviewedDesktopDraft
            ?.reusable_configuration
            ?.sources
            ?.['google-search-console-query-page'],
      ),
      {
        included:
          true,
        task_id:
          'gsc-long-16-months',
        date_policy:
          'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
      },
      'GSC Long Review must receive task identity and relative date policy.',
    );

    assert.equal(
      await page.getByText(
        'Reference date: 2026-09-14',
        {
          exact:
            true,
        },
      ).count(),
      1,
      'GSC Long Review must show the resolved reference date.',
    );

    assert.equal(
      await page.getByText(
        'Resolved range: 2025-05-14 → 2026-09-13',
        {
          exact:
            true,
        },
      ).count(),
      1,
      'GSC Long Review must show the exact resolved date range.',
    );

    const gscLongStartButton =
      page.getByRole(
        'button',
        {
          name:
            'Start Run',
          exact:
            true,
        },
      );

    assert.equal(
      await gscLongStartButton.isEnabled(),
      true,
      'Reviewed GSC Long Run must expose Start Run.',
    );

    await gscLongStartButton.click();

    assert.deepEqual(
      await page.evaluate(
        () =>
          window
            .__startedDesktopDraft,
      ),
      await page.evaluate(
        () =>
          window
            .__reviewedDesktopArtifact,
      ),
      'GSC Long Start must send the exact reviewed artifact.',
    );

    await page.reload();

    await page.getByRole(
      'heading',
      {
        name:
          'Collection Operations',
        exact:
          true,
      },
    ).waitFor();

    const googleTrendsTaskCard =
      page
        .getByTestId(
          'task-card',
        )
        .filter({
          hasText:
            'Google Trends — Interest Over Time',
        });

    await googleTrendsTaskCard
      .getByText(
        'READY',
        {
          exact:
            true,
        },
      )
      .waitFor();

    await googleTrendsTaskCard.click();

    const googleTrendsReviewButton =
      page.getByRole(
        'button',
        {
          name:
            'Review Quick Run',
          exact:
            true,
        },
      );

    assert.equal(
      await googleTrendsReviewButton.isEnabled(),
      true,
      'Google Trends Quick Run must be reviewable from the configured external groups.',
    );

    await page.evaluate(
      () => {
        window.__forceMissingReviewedDraft =
          true;
      },
    );

    const startCallsBeforeMissingReviewedQuickRun =
      await page.evaluate(
        () =>
          window.__startDesktopDraftCalls
          ?? 0,
      );

    await googleTrendsReviewButton.click();

    await page.getByRole(
      'heading',
      {
        name:
          'Review Quick Run',
        exact:
          true,
      },
    ).waitFor();

    const missingReviewedQuickRunStartButton =
      page.getByRole(
        'button',
        {
          name:
            'Start Run',
          exact:
            true,
        },
      );

    assert.equal(
      await missingReviewedQuickRunStartButton.isDisabled(),
      true,
      'Quick Run Start must fail closed when Review did not produce a reviewed artifact.',
    );

    assert.equal(
      await page.evaluate(
        () =>
          window.__startDesktopDraftCalls
          ?? 0,
      ),
      startCallsBeforeMissingReviewedQuickRun,
      'Missing reviewed artifact must not start a Quick Run.',
    );

    await page.getByRole(
      'button',
      {
        name:
          'Back to Task',
        exact:
          true,
      },
    ).click();

    await page.evaluate(
      () => {
        window.__forceMissingReviewedDraft =
          false;
      },
    );

    await googleTrendsReviewButton.click();

    await page.getByRole(
      'heading',
      {
        name:
          'Review Quick Run',
        exact:
          true,
      },
    ).waitFor();

    assert.deepEqual(
      await page.evaluate(
        () =>
          window
            .__reviewedDesktopDraft
            ?.reusable_configuration
            ?.sources
            ?.['google-trends'],
      ),
      {
        included:
          true,
        task_id:
          'google-trends-interest-over-time',
        date_policy:
          'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
      },
      'Renderer must send task identity and relative date policy, not rebuild GT groups.',
    );

    assert.equal(
      await page.getByText(
        'Reference date: 2026-09-14',
        {
          exact:
            true,
        },
      ).count(),
      1,
    );

    assert.equal(
      await page.getByText(
        'Resolved range: 2024-09-14 → 2026-09-13',
        {
          exact:
            true,
        },
      ).count(),
      1,
      'Google Trends Review must expose the exact resolved 24-month window.',
    );

    assert.equal(
      await page.getByText(
        'Configured groups: 2',
        {
          exact:
            true,
        },
      ).count(),
      1,
      'Google Trends Review must expose configured comparison-group count.',
    );

    assert.equal(
      await page.getByText(
        'Query groups: GT01, GT02',
        {
          exact:
            true,
        },
      ).count(),
      1,
      'Google Trends Review must preserve comparison-group identities.',
    );

    assert.equal(
      await page.getByText(
        'Fixed scope: Turkey · All Categories · Web Search · Search Term',
        {
          exact:
            true,
        },
      ).count(),
      1,
      'Google Trends Review must expose fixed provider semantics before Start.',
    );

    const googleTrendsStartButton =
      page.getByRole(
        'button',
        {
          name:
            'Start Run',
          exact:
            true,
        },
      );

    assert.equal(
      await googleTrendsStartButton.isEnabled(),
      true,
    );

    await googleTrendsStartButton.click();

    assert.deepEqual(
      await page.evaluate(
        () =>
          window
            .__startedDesktopDraft,
      ),
      await page.evaluate(
        () =>
          window
            .__reviewedDesktopArtifact,
      ),
      'Google Trends Start must send the exact reviewed artifact without rebuilding dates or groups.',
    );

    await page.evaluate(
      () =>
        window.localStorage.setItem(
          '__roofroomBootstrapError',
          '1',
        ),
    );
    await page.reload();

    assert.equal(
      await page.getByText(
        '● SYSTEM NOT READY',
        { exact: true },
      ).count(),
      1,
      'System status must reflect a non-ready bootstrap instead of always claiming SYSTEM READY.',
    );

    await page.evaluate(
      () => {
        window.localStorage.removeItem(
          '__roofroomBootstrapError',
        );
        window.localStorage.setItem(
          '__roofroomBootstrapThrow',
          '1',
        );
      },
    );
    await page.reload();

    assert.equal(
      await page.getByText(
        '● SYSTEM NOT READY',
        { exact: true },
      ).count(),
      1,
      'A failed bootstrap read must fail closed instead of leaving the system status checking indefinitely.',
    );

    await page.evaluate(
      () =>
        window.localStorage.removeItem(
          '__roofroomBootstrapThrow',
        ),
    );
    await page.reload();

    const blockedAdsCard = page.getByTestId('task-card').filter({
      has: page.getByText('Google Ads — Search Terms', {
        exact: true,
      }),
    });
    await blockedAdsCard.getByText('CONNECTION REQUIRED', { exact: true }).waitFor();
    await blockedAdsCard.click();

    assert.equal(
      await page.getByText(
        'A Workspace connection is required before this task can be reviewed.',
        { exact: true },
      ).count(),
      1,
      'Blocked Ads Task Detail must show the source readiness reason instead of the generic blocker.',
    );

    assert.equal(
      await page.getByRole(
        'button',
        { name: 'Manage Connection', exact: true },
      ).count(),
      1,
      'Blocked Ads Task Detail must expose an actionable safe remediation.',
    );

    await page.getByRole('button', { name: 'Manage Connection', exact: true }).click();
    await page.getByRole('heading', { name: 'Workspace', exact: true }).waitFor();
    assert.equal(await page.getByTestId('workspace-connections').count(), 1);

    await page.addInitScript(() => { window.__adsReady = true; });
    await page.reload();
    const adsCard = page.getByTestId('task-card').filter({
      has: page.getByText('Google Ads — Search Terms', {
        exact: true,
      }),
    });
    await adsCard.getByText('READY', { exact: true }).waitFor();
    await adsCard.click();
    assert.equal(await page.getByText('Scope: SEARCH campaigns · search_term_view', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Date policy: 17-day reporting lag through yesterday', { exact: true }).count(), 1);
    const adsReviewButton = page.getByRole('button', { name: 'Review Quick Run', exact: true });
    assert.equal(await adsReviewButton.isEnabled(), true, 'Configured Ads task must be reviewable');
    await adsReviewButton.click();
    await page.getByRole('heading', { name: 'Review Quick Run', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__reviewedDesktopDraft.reusable_configuration.sources['google-ads-search-terms']), {
      included: true, task_id: 'google-ads-search-terms', date_policy: 'TODAY_MINUS_17_TO_YESTERDAY',
    }, 'Ads renderer must send task identity and date policy to Review');
    assert.equal(await page.getByText('Reference date: 2026-09-17', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Resolved range: 2026-08-31 → 2026-09-16', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Start Run', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__startedDesktopDraft), await page.evaluate(() => window.__reviewedDesktopArtifact), 'Ads Start must forward the exact reviewed artifact');
    console.log('PASS ADS-REVIEW-UI-001: Ads task sends date policy and starts the exact reviewed artifact');

    await page.reload();

    const ga4TaskCard =
      page.getByTestId('task-card')
        .filter({ hasText: 'Google Analytics 4' });

    assert.equal(
      await ga4TaskCard.count(),
      1,
      'Desktop task catalog must expose one Google Analytics 4 collection task.',
    );

    await ga4TaskCard.getByText(
      'READY',
      { exact: true },
    ).waitFor();

    await ga4TaskCard.click();

    assert.equal(
      await page.getByText(
        'First-party GA4 Content Performance and Paid Funnel evidence.',
        { exact: true },
      ).count(),
      1,
      'GA4 task detail must identify both approved datasets.',
    );

    const ga4ReviewButton =
      page.getByRole(
        'button',
        {
          name: 'Review Quick Run',
          exact: true,
        },
      );

    assert.equal(
      await ga4ReviewButton.isEnabled(),
      false,
      'GA4 Review requires an explicit absolute date range.',
    );

    await page.getByLabel(
      'GA4 start date',
      { exact: true },
    ).fill('2026-09-30');

    await page.getByLabel(
      'GA4 end date',
      { exact: true },
    ).fill('2026-09-01');

    assert.equal(
      await ga4ReviewButton.isEnabled(),
      false,
      'A reversed GA4 date range must fail closed.',
    );

    await page.getByLabel(
      'GA4 start date',
      { exact: true },
    ).fill('2026-09-01');

    await page.getByLabel(
      'GA4 end date',
      { exact: true },
    ).fill('2026-09-30');

    assert.equal(
      await ga4ReviewButton.isEnabled(),
      true,
      'A valid explicit GA4 date range must be reviewable.',
    );

    await ga4ReviewButton.click();

    await page.getByRole(
      'heading',
      {
        name: 'Review Quick Run',
        exact: true,
      },
    ).waitFor();

    assert.deepEqual(
      await page.evaluate(
        () => window
          .__reviewedDesktopDraft
          .reusable_configuration
          .sources['google-analytics-4'],
      ),
      {
        included: true,
        task_id: 'google-analytics-4',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
      },
      'GA4 renderer must send only task identity and explicit absolute dates to Review.',
    );

    await page.getByRole(
      'button',
      {
        name: 'Start Run',
        exact: true,
      },
    ).click();

    assert.deepEqual(
      await page.evaluate(
        () => window.__startedDesktopDraft,
      ),
      await page.evaluate(
        () => window.__reviewedDesktopArtifact,
      ),
      'GA4 Start must forward the exact reviewed artifact.',
    );

    console.log(
      'PASS GA4-REVIEW-UI-001: explicit absolute dates review two GA4 jobs and start the exact reviewed artifact',
    );

    await page.reload();

    const unreadyPlannerCard = page.getByTestId('task-card').filter({ hasText: 'Keyword Planner — Historical Metrics' });
    await unreadyPlannerCard.getByText('CONNECTION REQUIRED', { exact: true }).waitFor();
    await unreadyPlannerCard.click();
    const unreadyPlannerReviewButton = page.getByRole('button', { name: 'Review Quick Run', exact: true });
    await page.getByLabel('Keyword group 1 ID').fill('KWP-FICUS');
    await page.getByLabel('Keyword group 1 name').fill('Indoor plants');
    await page.getByLabel('Keyword group 1 keywords').fill('ficus');
    assert.equal(
      await unreadyPlannerReviewButton.isEnabled(),
      false,
      'Valid Keyword Planner input must not override provider connection readiness.',
    );
    assert.equal(
      await page.locator('.rr-task-detail-head .rr-status').getByText(
        'CONNECTION REQUIRED',
        { exact: true },
      ).count(),
      1,
      'Keyword Planner task detail must preserve provider readiness after valid input.',
    );
    console.log('PASS KEYWORD-PLANNER-READINESS-UI-001: valid input does not override provider connection readiness');

    await page.addInitScript(() => { window.__keywordPlannerReady = true; });
    await page.reload();
    const plannerCard = page.getByTestId('task-card').filter({ hasText: 'Keyword Planner — Historical Metrics' });
    await plannerCard.getByText('READY', { exact: true }).waitFor();
    await plannerCard.click();
    const plannerReviewButton = page.getByRole('button', { name: 'Review Quick Run', exact: true });
    assert.equal(await plannerReviewButton.isEnabled(), false, 'Keyword Planner Review requires explicit groups.');
    assert.equal(await page.getByLabel('Keyword groups').count(), 0, 'Keyword Planner must not require a mini-DSL textarea.');
    await page.getByLabel('Keyword group 1 ID').fill('KWP-FICUS');
    await page.getByLabel('Keyword group 1 name').fill('Indoor plants');
    await page.getByLabel('Keyword group 1 keywords').fill('ficus, monstera deliciosa');
    await page.getByRole('button', { name: 'Add keyword group', exact: true }).click();
    await page.getByLabel('Keyword group 2 ID').fill('KWP-FICUS');
    await page.getByLabel('Keyword group 2 name').fill('Care topics');
    await page.getByLabel('Keyword group 2 keywords').fill('ficus bakımı, monstera bakımı');
    assert.equal(await page.getByText('Group IDs must be unique.', { exact: true }).count(), 1);
    assert.equal(await plannerReviewButton.isEnabled(), false, 'Duplicate group IDs must fail closed inline.');
    await page.getByLabel('Keyword group 2 ID').fill('KWP-PASA');
    assert.equal(await page.getByText('Prepared input: 2 groups · 4 keywords', { exact: true }).count(), 1);
    assert.equal(await plannerReviewButton.isEnabled(), true, 'Valid explicit keyword groups make Review available.');
    await plannerReviewButton.click();
    await page.getByRole('heading', { name: 'Review Quick Run', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__reviewedDesktopDraft.reusable_configuration.sources['google-keyword-planner']), {
      included: true,
      task_id: 'keyword-planner-historical-metrics',
      groups: [
        { group_id: 'KWP-FICUS', group_name: 'Indoor plants', keywords: ['ficus', 'monstera deliciosa'] },
        { group_id: 'KWP-PASA', group_name: 'Care topics', keywords: ['ficus bakımı', 'monstera bakımı'] },
      ],
    }, 'Renderer must send exact named keyword groups to Review.');
    assert.equal(await page.getByText('Keyword groups: 2', { exact: true }).count(), 1);
    assert.equal(await page.getByText('KWP-FICUS: ficus, monstera deliciosa', { exact: true }).count(), 1);
    assert.equal(await page.getByText('KWP-PASA: ficus bakımı, monstera bakımı', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Start Run', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__startedDesktopDraft), await page.evaluate(() => window.__reviewedDesktopArtifact), 'Keyword Planner Start must forward the exact reviewed groups.');
    console.log('PASS KEYWORD-PLANNER-REVIEW-UI-001: explicit groups are reviewed and started unchanged');

    await page.reload();
    const plannerCsvCard = page.getByTestId('task-card').filter({ hasText: 'Keyword Planner — Manual CSV Import' });
    await plannerCsvCard.getByText('FILE REQUIRED', { exact: true }).waitFor();
    await plannerCsvCard.click();
    const plannerCsvReviewButton = page.getByRole('button', { name: 'Review Quick Run', exact: true });
    assert.equal(await plannerCsvReviewButton.isEnabled(), false, 'Manual CSV Review requires an explicit selected file.');
    await page.getByRole('button', { name: 'Select Keyword Stats CSV', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__selectedDesktopInputRequest), {
      input_kind: 'KEYWORD_PLANNER_CSV',
    });
    assert.equal(await page.getByText('keyword-stats.csv', { exact: true }).count(), 1);
    assert.equal(await page.getByText('CSV · 2.0 KB', { exact: true }).count(), 1, 'Selected file preview must expose safe type and size metadata.');
    assert.equal(await page.getByRole('button', { name: 'Replace Keyword Stats CSV', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Remove Keyword Stats CSV', exact: true }).click();
    assert.equal(await plannerCsvReviewButton.isEnabled(), false, 'Removing the selected file must fail closed.');
    await page.getByRole('button', { name: 'Select Keyword Stats CSV', exact: true }).click();
    assert.equal(await plannerCsvReviewButton.isEnabled(), true, 'Selecting a manual export makes Review available.');
    await plannerCsvReviewButton.click();
    await page.getByRole('heading', { name: 'Review Quick Run', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__reviewedDesktopDraft.reusable_configuration.sources['google-keyword-planner-csv']), {
      included: true,
      task_id: 'keyword-planner-manual-csv-import',
      file_path: '/fixture/imports/keyword-stats.csv',
    }, 'Renderer must send the exact selected manual export to Review.');
    assert.equal(await page.getByText('keyword-stats.csv', { exact: true }).count(), 1, 'Review must expose the exact selected manual export.');
    await page.getByRole('button', { name: 'Start Run', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__startedDesktopDraft), await page.evaluate(() => window.__reviewedDesktopArtifact), 'Manual CSV Start must forward the exact reviewed artifact.');
    console.log('PASS KEYWORD-PLANNER-CSV-UI-001: selected manual export is reviewed and started unchanged');

    await page.reload();
    const bitkimarkCard = page.getByTestId('task-card').filter({ hasText: 'Bitkimark — Sitemap/XML' });
    await bitkimarkCard.getByText('READY', { exact: true }).waitFor();
    await bitkimarkCard.click();
    assert.equal(await page.getByLabel('Sitemap URLs').count(), 0, 'Bitkimark must not expose an arbitrary URL textarea.');
    const rootSitemap = page.getByLabel('https://bitkimark.com/sitemap.xml', { exact: true });
    assert.equal(await rootSitemap.isChecked(), true);
    assert.equal(await rootSitemap.isDisabled(), true, 'The evidence root must remain selected.');
    assert.equal(await page.getByText('5 of 5 sitemap URLs selected', { exact: true }).count(), 1);
    const bitkimarkReviewButton = page.getByRole('button', { name: 'Review Quick Run', exact: true });
    assert.equal(await bitkimarkReviewButton.isEnabled(), true);
    await page.getByLabel('https://bitkimark.com/pages.xml', { exact: true }).uncheck();
    await page.getByLabel('https://bitkimark.com/products.xml', { exact: true }).uncheck();
    await page.getByLabel('https://bitkimark.com/collections.xml', { exact: true }).uncheck();
    assert.equal(await page.getByText('2 of 5 sitemap URLs selected', { exact: true }).count(), 1);
    assert.equal(await bitkimarkReviewButton.isEnabled(), true);
    await bitkimarkReviewButton.click();
    await page.getByRole('heading', { name: 'Review Quick Run', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__reviewedDesktopDraft.reusable_configuration.sources['bitkimark-sitemap']), {
      included: true,
      task_id: 'bitkimark-sitemap',
      sitemaps: [
        { requested_url: 'https://bitkimark.com/sitemap.xml', expected_host: 'bitkimark.com', parent_sitemap_url: null },
        { requested_url: 'https://bitkimark.com/blogs.xml', expected_host: 'bitkimark.com', parent_sitemap_url: 'https://bitkimark.com/sitemap.xml' },
      ],
    });
    assert.equal(await page.getByText('Sitemap URLs: 2', { exact: true }).count(), 1);
    assert.equal(await page.getByText('https://bitkimark.com/blogs.xml', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Start Run', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__startedDesktopDraft), await page.evaluate(() => window.__reviewedDesktopArtifact), 'Bitkimark Start must forward the exact reviewed HTTP_XML artifact.');
    console.log('PASS BITKIMARK-REVIEW-UI-001: bounded sitemap URLs are reviewed and started unchanged');

    await page.addInitScript(() => { window.__serpApiReady = true; });
    await page.reload();
    const serpApiCard = page.getByTestId('task-card').filter({ hasText: 'SerpApi — SERP Snapshot' });
    await serpApiCard.getByText('READY', { exact: true }).waitFor();
    await serpApiCard.click();
    const serpApiReviewButton = page.getByRole('button', { name: 'Review Quick Run', exact: true });
    assert.equal(await serpApiReviewButton.isEnabled(), false, 'SerpApi Review requires an explicit on-demand batch.');
    assert.equal(await page.getByLabel('SERP queries').count(), 0, 'SerpApi must not require a mini-DSL textarea.');
    await page.getByLabel('SERP query 1 ID').fill('SERP-FICUS-001');
    await page.getByLabel('SERP query 1 text').fill('ficus çeşitleri');
    await page.getByRole('button', { name: 'Add SERP query', exact: true }).click();
    await page.getByLabel('SERP query 2 ID').fill('SERP-FICUS-001');
    await page.getByLabel('SERP query 2 text').fill('ofis bitkileri');
    assert.equal(await page.getByText('Query IDs must be unique.', { exact: true }).count(), 1);
    assert.equal(await serpApiReviewButton.isEnabled(), false, 'Duplicate query IDs must fail closed inline.');
    await page.getByLabel('SERP query 2 ID').fill('SERP-OFFICE-001');
    assert.equal(await page.getByText('Requests prepared: 2 · 1 provider request per query', { exact: true }).count(), 1);
    assert.equal(await serpApiReviewButton.isEnabled(), true);
    await serpApiReviewButton.click();
    await page.getByRole('heading', { name: 'Review Quick Run', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__reviewedDesktopDraft.reusable_configuration.sources.serpapi), {
      included: true,
      task_id: 'serpapi-serp-snapshot',
      queries: [
        { job_key: 'SERP-FICUS-001', query: 'ficus çeşitleri' },
        { job_key: 'SERP-OFFICE-001', query: 'ofis bitkileri' },
      ],
    });
    assert.equal(await page.getByText('SERP queries: 2', { exact: true }).count(), 1);
    assert.equal(await page.getByText('SERP-FICUS-001: ficus çeşitleri', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Fixed scope: Google · Turkey · Turkish · Desktop · First page · 10 organic', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Start Run', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__startedDesktopDraft), await page.evaluate(() => window.__reviewedDesktopArtifact), 'SerpApi Start must forward the exact reviewed on-demand batch.');
    console.log('PASS SERPAPI-REVIEW-UI-001: explicit on-demand queries are reviewed and started unchanged');

    await page.getByRole('button', { name: 'TASKS', exact: true }).click();
    const packageCard = page.getByTestId('task-card').filter({ hasText: 'Kampanya Gelişim' });
    assert.equal(await packageCard.count(), 1);
    const draftCallsBeforePackage = await page.evaluate(() => window.__createDesktopDraftCalls);
    await packageCard.click();
    await page.getByRole('heading', { name: 'Kampanya Gelişim', exact: true }).waitFor();
    assert.equal(await page.getByText('SEARCH only · last 7 complete local calendar days', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Review Package', exact: true }).click();
    await page.getByRole('heading', { name: 'Kampanya Gelişim Review', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__createDesktopDraftCalls), draftCallsBeforePackage);
    assert.deepEqual(await page.evaluate(() => window.__taskPackageReviewCalls.at(-1)), {
      workspace_id: 'ws_fixture', recipe_id: 'ADS_OPTIMIZATION_PACK',
    });
    assert.equal(await page.getByText('Current window: 2026-09-23 → 2026-09-29', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Google Ads readiness: READY', { exact: true }).count(), 1);
    for (const status of ['REUSE EXACT', 'REUSE FILTERED', 'NO DATA', 'COLLECT REQUIRED']) {
      assert.equal(await page.getByText(status, { exact: true }).count() > 0, true);
    }
    assert.equal(await page.getByText('Provider-accepted no data for the exact window.', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/0 rows/iu).count(), 0);
    const packageReviewText = (await page.getByTestId('task-package-review').innerText()).toLowerCase();
    for (const forbidden of ['recommendation', 'winner', 'loser', 'cpa', 'roas', 'go/pause', 'budget action', 'bid action']) {
      assert.equal(packageReviewText.includes(forbidden), false, `Task Package UI leaked forbidden judgment ${forbidden}`);
    }

    await page.getByRole('button', { name: 'Start Collection', exact: true }).click();
    await page.getByRole('heading', { name: 'Run Detail', exact: true }).waitFor();
    assert.equal(await page.getByText('AD_PERFORMANCE', { exact: true }).count(), 1);
    assert.equal(await page.getByText('RSA_ASSET_PERFORMANCE', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Open Accepted Evidence', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Retry Failed', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__retriedTaskPackageRunId), 'rr_fixture_package_001');
    await page.evaluate(() => { window.__taskPackageReviewMode = 'INITIAL_BASELINE'; });
    await page.getByRole('button', { name: 'Review Kampanya Gelişim Again', exact: true }).click();
    await page.getByRole('heading', { name: 'Kampanya Gelişim Review', exact: true }).waitFor();
    assert.equal(await page.getByText('No prior comparison exists; this package contains CURRENT evidence only.', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/^Previous window:/u).count(), 0);

    await page.getByRole('button', { name: 'Back to Task', exact: true }).click();
    await page.evaluate(() => { window.__taskPackageReviewMode = 'COMPARISON'; });
    await page.getByRole('button', { name: 'Review Package', exact: true }).click();
    assert.equal(await page.getByText('Previous window: 2026-09-08 → 2026-09-14', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Gap days: 8', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/better|worse|winner|loser/iu).count(), 0);

    await page.getByRole('button', { name: 'Back to Task', exact: true }).click();
    await page.evaluate(() => { window.__taskPackageReviewMode = 'EXISTING_PACKAGE'; });
    await page.getByRole('button', { name: 'Review Package', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Assemble Package', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Open Workbook', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__taskPackageOpenCalls.at(-1)), { package_id: 'pkg_existing' });

    await page.getByRole('button', { name: 'Back to Task', exact: true }).click();
    await page.evaluate(() => { window.__taskPackageReviewMode = 'ACTIVE'; });
    await page.getByRole('button', { name: 'Review Package', exact: true }).click();
    await page.getByRole('button', { name: 'Open Collection Run', exact: true }).click();
    await page.getByRole('heading', { name: 'Run Detail', exact: true }).waitFor();
    assert.equal(await page.getByText('AD_PERFORMANCE', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'TASKS', exact: true }).click();
    await packageCard.click();

    await page.evaluate(() => { window.__taskPackageReviewMode = 'BLOCKED'; });
    await page.getByRole('button', { name: 'Review Package', exact: true }).click();
    assert.equal(await page.getByText('Google Ads readiness: CONNECTION REQUIRED', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Start Collection', exact: true }).count(), 0);

    await page.getByRole('button', { name: 'Back to Task', exact: true }).click();
    await page.evaluate(() => { window.__taskPackageReviewMode = 'INITIAL_BASELINE'; });
    await page.getByRole('button', { name: 'Review Package', exact: true }).click();
    await page.getByRole('button', { name: 'Assemble Package', exact: true }).click();
    await page.getByRole('heading', { name: 'Package Published', exact: true }).waitFor();
    assert.equal(await page.getByText('Package ID: pkg_published', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Open Workbook', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__taskPackageOpenCalls.at(-1)), { package_id: 'pkg_published' });
    assert.equal(await page.evaluate(() => window.__taskPackageStartCalls.length >= 2), true);

    await page.getByRole('button', { name: 'PRESETS', exact: true }).click();
    await page.getByRole('heading', { name: 'Presets', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Open', exact: true }).first().click();
    const presetEditor = page.getByTestId('preset-editor');
    const gscPresetTask = presetEditor.locator('label').filter({ hasText: 'GSC — Current 90 Days' });
    assert.equal(await gscPresetTask.getByRole('checkbox').isChecked(), true);
    assert.equal(await gscPresetTask.getByText('Readiness: READY', { exact: true }).count(), 1);
    await presetEditor.getByLabel('Edit preset name').fill('Current GSC Daily');
    assert.equal(await presetEditor.getByText('Unsaved preset changes.', { exact: true }).count(), 1);
    assert.equal(await presetEditor.getByRole('button', { name: 'Review Preset', exact: true }).isDisabled(), true);
    await presetEditor.getByRole('button', { name: 'Save Changes', exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.__updatedDesktopPresetInput.preset_name),
      'Current GSC Daily',
      'Preset rename must preserve and update the selected reusable configuration.',
    );
    await presetEditor.getByRole('button', { name: 'Duplicate', exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.__createdDesktopPresetInput.preset_name),
      'Current GSC Daily copy',
      'Duplicate must create a distinct named preset from the editor configuration.',
    );
    await page.evaluate(
      () => {
        window.__forceMissingReviewedDraft =
          true;
      },
    );

    await presetEditor.getByRole(
      'button',
      {
        name:
          'Review Preset',
        exact:
          true,
      },
    ).click();

    const presetReview =
      page.getByTestId(
        'preset-review',
      );

    assert.equal(
      await presetReview
        .getByRole(
          'button',
          {
            name:
              'Start Preset Run',
            exact:
              true,
          },
        )
        .isDisabled(),
      true,
      'Preset Start must fail closed when Review did not produce a reviewed artifact.',
    );

    await page.evaluate(
      () => {
        window.__forceMissingReviewedDraft =
          false;
      },
    );

    await presetEditor.getByRole(
      'button',
      {
        name:
          'Review Preset',
        exact:
          true,
      },
    ).click();
    assert.equal(await presetReview.getByText('1 sources · 1 jobs', { exact: true }).count(), 1);
    assert.equal(await presetReview.getByText('Google Search Console: READY', { exact: true }).count(), 1);
    await presetReview.getByRole('button', { name: 'Start Preset Run', exact: true }).click();
    await page.getByRole('heading', { name: 'Run Detail', exact: true }).waitFor();

    await page.getByRole('button', { name: 'PRESETS', exact: true }).click();
    const newPreset = page.getByTestId('new-preset');
    await newPreset.getByLabel('New preset name').fill('Fresh GSC Preset');
    await newPreset.getByLabel('GSC — Current 90 Days', { exact: true }).check();
    await newPreset.getByRole('button', { name: 'Create Preset', exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.__createdDesktopPresetInput.preset_name),
      'Fresh GSC Preset',
      'New preset creation must include explicit selected task configuration.',
    );
    assert.equal(
      await page.evaluate(() => window.__createdDesktopPresetInput.reusable_configuration.sources['google-search-console-query-page'].task_id),
      'gsc-current-90-days',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    assert.equal(
      await page.evaluate(() => window.__deletedDesktopPresetInput.workspace_id),
      'ws_fixture',
      'Preset deletion must remain confirmed and Workspace-scoped.',
    );

    await page.getByTestId('preset-editor').getByLabel('Edit preset name').fill('Unsaved rename');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'HOME', exact: true }).click();
    assert.equal(
      await page.getByRole('heading', { name: 'Presets', exact: true }).count(),
      1,
      'Dismissed unsaved-edit warning must keep the user in the preset editor.',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'HOME', exact: true }).click();
    await page.getByRole('heading', { name: 'Collection Operations', exact: true }).waitFor();

    await page.getByRole('button', { name: 'PRESETS', exact: true }).click();
    const isolatedNewPreset = page.getByTestId('new-preset');
    await isolatedNewPreset.getByLabel('New preset name').fill('Workspace A draft');
    await isolatedNewPreset.getByLabel('GSC — Current 90 Days', { exact: true }).check();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByLabel('Active Workspace').selectOption('ws_other');
    await page.getByRole('heading', { name: 'Collection Operations', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Active Workspace').inputValue(), 'ws_other');
    await page.getByRole('button', { name: 'PRESETS', exact: true }).click();
    assert.equal(
      await page.getByTestId('new-preset').getByLabel('New preset name').inputValue(),
      '',
      'Workspace changes must clear transient preset drafts instead of leaking them across Workspaces.',
    );
    console.log('PASS PRESET-LIFECYCLE-UI-001: create, open, edit, rename, duplicate, review, run, and confirmed delete are usable');

    console.log(
      'PASS DESKTOP-UI-001: source-neutral operations shell and reviewed GSC + Google Trends Quick Run flows are verified',
    );
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
