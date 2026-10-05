import type {
  ReusableCollectionConfiguration,
  RunDraftOrigin,
} from '../../shared/collection-configuration';
import type {
  JobPlan,
  JsonObject,
  JsonValue,
} from '../../shared/run-job';
import type { AttemptRecord } from '../../shared/attempt';
import type {
  DesktopMultiSourceRepository,
  DesktopReadinessStatus,
  DesktopReview,
  DesktopReviewedRunDraft,
  DesktopRunDraft,
  DesktopRunState,
  DesktopSourceCard,
  DesktopWorkspaceConnectionView,
  DesktopWorkspaceView,
} from '../../shared/desktop-multisource';
import {
  DESKTOP_CREDENTIAL_MANAGED_SOURCE_IDS,
  SUPPORTED_DESKTOP_SOURCE_IDS,
} from '../../shared/desktop-multisource';
import {
  formatLocalReferenceDate,
  resolveDesktopDatePolicy,
} from '../../shared/desktop-run-resolution';
import { buildDataPackage, writeDataPackage } from '../export/data-package-exporter';
import type { DataPackage, DataPackageMode } from '../../shared/data-package';
import type { WorkspaceFreshnessResult } from '../../shared/freshness';
import type { ArtifactRecord } from '../../shared/artifact';
import { ResumePlanner } from '../core/resume-planner';
import { ReconciliationCoordinator } from '../core/reconciliation-coordinator';
import { RetryPolicy } from '../core/retry-policy';
import { RunManager } from '../core/run-manager';
import { createSearchTermsJobContext } from '../sources/google-ads/search-terms-request';
import {
  createGoogleAdsReportingJobContext,
  googleAdsReportingContextAsJson,
} from '../sources/google-ads/search-reporting-request';
import {
  createGoogleAdsChangeHistoryJobContext,
} from '../sources/google-ads/google-ads-change-history-request';
import {
  createGoogleAdsConfigurationJobContext,
  googleAdsConfigurationContextAsJson,
} from '../sources/google-ads/configuration-request';
import {
  createKeywordPlannerJobContext,
  keywordPlannerContextAsJson,
  resolveKeywordPlannerHistoricalScope,
  KEYWORD_PLANNER_SOURCE_MODE,
  KEYWORD_PLANNER_TASK_ID,
} from '../sources/google-ads/keyword-planner-request';
import {
  createIkasProductsJobContext,
  ikasProductsContextAsJson,
  IKAS_PRODUCTS_SOURCE_MODE,
  IKAS_PRODUCTS_TASK_ID,
} from '../sources/ikas/ikas-products-request';
import {
  createKeywordPlannerCsvJobContext,
  keywordPlannerCsvContextAsJson,
  KEYWORD_PLANNER_CSV_SOURCE_MODE,
  KEYWORD_PLANNER_CSV_TASK_ID,
} from '../sources/google-ads/keyword-planner-csv-request';
import {
  BITKIMARK_EXPECTED_HOST,
  BITKIMARK_SITEMAP_SOURCE_MODE,
  BITKIMARK_SITEMAP_TASK_ID,
  bitkimarkSitemapContextAsJson,
  createBitkimarkSitemapJobContext,
} from '../sources/bitkimark/bitkimark-sitemap-request';
import {
  isTerminalRunStatus,
} from '../core/run-execution-state-machine';
import {
  requireSerpApiJobContext,
  serpApiContextAsJson,
  SERPAPI_TASK_ID,
} from '../sources/serpapi/serpapi-request';
import { createSerpApiJobPlans } from '../sources/serpapi/serpapi-job-plans';
import {
  createGoogleAnalytics4JobPlans,
} from '../sources/google-analytics-4/google-analytics-4-job-plans';

export interface DesktopReadinessReader {
  getReadiness(
    workspace_id: string,
    source_id: string,
    source_config?: Record<string, unknown>,
  ): Promise<{ readiness_status: DesktopReadinessStatus }>;
}

export interface DesktopFreshnessReader {
  getFreshness(
    workspace_id: string,
    source_id: string,
    source_config?: Record<string, unknown>,
  ): WorkspaceFreshnessResult;
}

export interface DesktopCredentialAvailabilityReader {
  hasCredential(
    credential_ref: string,
  ): Promise<boolean>;
}

export interface DesktopMultiSourceControllerDependencies {
  repository: DesktopMultiSourceRepository;
  readiness: DesktopReadinessReader;
  freshness?: DesktopFreshnessReader;
  credential_availability?: DesktopCredentialAvailabilityReader;
  application_version: string;
  google_trends_query_groups?:
    readonly {
      query_group_id: string;
      query_group_name: string;
      queries: readonly string[];
    }[];
  source_order?: readonly string[];
  source_names?: Record<string, string>;
  job_planner?: (source_id: string, source_config: Record<string, unknown>) => JobPlan[];
  now?: () => Date;
  execute_run?: (run_id: string) => Promise<void>;
  execute_retry?: (
    run_id: string,
    job_id: string,
    attempt: AttemptRecord,
  ) => Promise<void>;
  execute_continue?: (
    run_id: string,
    job_id: string,
    attempt: AttemptRecord,
  ) => Promise<void>;
  is_run_active?: (run_id: string) => boolean;
  can_cancel_run?: (
  run_id: string,
) => boolean;

cancel_active_run?: (
  run_id: string,
) => Promise<void>;
  package_directory?: string;
  load_datasets?: (run_id: string) => Promise<Parameters<typeof buildDataPackage>[0]['datasets']>;
  open_accepted_artifact?: (artifact: ArtifactRecord) => Promise<void>;
}

const asObject = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const asJsonObjectValue = (
  value: JsonValue | undefined,
): JsonObject => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
    ? value
    : {}
);

const sanitizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(credential|secret|token|api[_-]?key|password)/iu.test(key))
    .map(([key, nested]) => [key, sanitizeValue(nested)]));
};

const cloneConfiguration = (value: ReusableCollectionConfiguration): ReusableCollectionConfiguration =>
  sanitizeValue(JSON.parse(JSON.stringify(value))) as ReusableCollectionConfiguration;

const sourceConfig = (configuration: ReusableCollectionConfiguration, sourceId: string): Record<string, unknown> => {
  const sources = asObject(configuration.sources);
  return asObject(sources[sourceId]);
};

const included = (configuration: ReusableCollectionConfiguration, sourceId: string): boolean =>
  sourceConfig(configuration, sourceId).included === true;

const resolveBitkimarkSitemapContexts = (
  config: Record<string, unknown>,
): JsonObject[] => {
  if (
    config.task_id !== undefined
    && config.task_id !== BITKIMARK_SITEMAP_TASK_ID
  ) {
    throw new Error('Bitkimark task identity is invalid.');
  }

  const rawContexts = Array.isArray(config.sitemaps)
    ? config.sitemaps
    : typeof config.sitemap_url === 'string'
      ? [{ requested_url: config.sitemap_url, parent_sitemap_url: null }]
      : [];

  if (rawContexts.length === 0) throw new Error('At least one Bitkimark sitemap URL is required.');

  const contexts = rawContexts.map((rawContext) => {
    const value = asObject(rawContext);
    return bitkimarkSitemapContextAsJson(createBitkimarkSitemapJobContext({
      task_id: value.task_id ?? BITKIMARK_SITEMAP_TASK_ID,
      source_id: value.source_id ?? 'bitkimark-sitemap',
      source_mode: value.source_mode ?? BITKIMARK_SITEMAP_SOURCE_MODE,
      requested_url: value.requested_url,
      expected_host: value.expected_host ?? BITKIMARK_EXPECTED_HOST,
      parent_sitemap_url: value.parent_sitemap_url ?? null,
    }));
  });

  const requestedUrls = contexts.map((context) => context.requested_url as string);
  if (new Set(requestedUrls).size !== requestedUrls.length) {
    throw new Error('Bitkimark sitemap URLs must be unique.');
  }
  return contexts;
};

const productionPlanner = (sourceId: string, config: Record<string, unknown>): JobPlan[] => {
  const plans = (items: unknown[], key: (item: Record<string, unknown>, index: number) => string): JobPlan[] => items.map((item, index) => {
    const value = asObject(item);
    return { source_id: sourceId, job_key: key(value, index), query_group_id: sourceId === 'google-trends' ? key(value, index) : null, source_context: value as JsonObject };
  });
  if (sourceId === 'google-analytics-4') {
    if (
      typeof config.start_date !== 'string'
      || typeof config.end_date !== 'string'
    ) {
      return [];
    }

    try {
      return createGoogleAnalytics4JobPlans({
        start_date: config.start_date,
        end_date: config.end_date,
      });
    } catch {
      return [];
    }
  }

  if (sourceId === 'google-trends') {
    const groups =
      Array.isArray(config.query_groups)
        ? config.query_groups
        : [];

    return groups.map(
      (item, index) => {
        const value =
          asObject(item);

        const jobKey =
          typeof value.query_group_id
            === 'string'
            ? value.query_group_id
            : 'group-' + String(index + 1);

        return {
          source_id:
            sourceId,
          job_key:
            jobKey,
          query_group_id:
            jobKey,
          source_context: {
            query_group:
              value as JsonObject,
          },
        };
      },
    );
  }
  if (
    sourceId === 'google-search-console-query-page'
    || sourceId === 'google-search-console-query'
  ) {
    return plans(
      Array.isArray(config.date_ranges)
        ? config.date_ranges
        : [],
      (item, index) =>
        typeof item.job_key === 'string'
          ? item.job_key
          : `gsc-${index + 1}`,
    );
  }
  if (sourceId === 'serpapi') {
    if (!Array.isArray(config.queries)) return [];
    try {
      const contexts = config.queries.map((query) => {
        const value = asObject(query);
        return serpApiContextAsJson(
          requireSerpApiJobContext(value, typeof value.job_key === 'string' ? value.job_key : undefined),
        );
      });
      const jobKeys = contexts.map((context) => context.job_key as string);
      if (new Set(jobKeys).size !== jobKeys.length) return [];
      return contexts.map((context) => ({
        source_id: sourceId,
        job_key: context.job_key as string,
        query_group_id: null as string | null,
        source_context: context,
      }));
    } catch {
      return [];
    }
  }
  if (sourceId === 'google-keyword-planner') {
    if (!Array.isArray(config.groups)) {
      return [];
    }

    try {
      const contexts =
        config.groups.map(
          (group) =>
            keywordPlannerContextAsJson(
              createKeywordPlannerJobContext(
                group,
              ),
            ),
        );

      const groupIds =
        contexts.map(
          (context) =>
            context.group_id as string,
        );

      if (
        new Set(groupIds).size
          !== groupIds.length
      ) {
        return [];
      }

      return contexts.map(
        (context) => ({
          source_id:
            sourceId,
          job_key:
            context.group_id as string,
          query_group_id:
            null as string | null,
          source_context:
            context,
        }),
      );
    } catch {
      return [];
    }
  }

  if (sourceId === 'google-ads-search-reporting') {
    if (
      !Array.isArray(config.datasets)
      || typeof config.customer_id !== 'string'
      || typeof config.requested_date_start !== 'string'
      || typeof config.requested_date_end !== 'string'
    ) {
      return [];
    }

    const customerId =
      config.customer_id;

    const requestedDateStart =
      config.requested_date_start;

    const requestedDateEnd =
      config.requested_date_end;

    try {
      return config.datasets.map((dataset) => {
        const context =
          googleAdsReportingContextAsJson(
            createGoogleAdsReportingJobContext({
              dataset_type:
                dataset as never,
              customer_id:
                customerId as string,
              requested_date_start:
                requestedDateStart as string,
              requested_date_end:
                requestedDateEnd as string,
            }),
          );

        return {
          source_id:
            sourceId,
          job_key:
            context.dataset_type as string,
          query_group_id:
            null as string | null,
          source_context:
            context,
        };
      });
    } catch {
      return [];
    }
  }

  if (sourceId === 'google-ads-change-history') {
    if (
      typeof config.customer_id !== 'string'
      || typeof config.requested_date_start !== 'string'
      || typeof config.requested_date_end !== 'string'
      || typeof config.dataset_type !== 'string'
    ) {
      return [];
    }

    try {
      const context =
        createGoogleAdsChangeHistoryJobContext({
          source_id:
            sourceId,
          dataset_type:
            config.dataset_type as never,
          customer_id:
            config.customer_id,
          requested_date_start:
            config.requested_date_start,
          requested_date_end:
            config.requested_date_end,
          dataset_schema_version:
            1,
        });

      return [{
        source_id:
          sourceId,
        job_key:
          context.dataset_type,
        query_group_id:
          null as string | null,
        source_context:
          { ...context },
      }];
    } catch {
      return [];
    }
  }

  if (sourceId === 'google-ads-configuration') {
    if (
      !Array.isArray(config.datasets)
      || typeof config.customer_id !== 'string'
    ) {
      return [];
    }

    try {
      return config.datasets.map((dataset) => {
        const context =
          googleAdsConfigurationContextAsJson(
            createGoogleAdsConfigurationJobContext({
              dataset_type:
                dataset as never,
              customer_id:
                config.customer_id as string,
            }),
          );

        return {
          source_id:
            sourceId,
          job_key:
            context.dataset_type as string,
          query_group_id:
            null as string | null,
          source_context:
            context,
        };
      });
    } catch {
      return [];
    }
  }

  if (sourceId === 'google-ads-search-terms') return plans(Array.isArray(config.jobs) ? config.jobs : [{}], (_item, index) => `search-terms-${index + 1}`);
  if (sourceId === 'ikas-products') {
    try {
      const context =
        ikasProductsContextAsJson(
          createIkasProductsJobContext(
            {
              ...config,
              task_id:
                config.task_id
                ?? IKAS_PRODUCTS_TASK_ID,
              source_id:
                config.source_id
                ?? sourceId,
              source_mode:
                config.source_mode
                ?? IKAS_PRODUCTS_SOURCE_MODE,
            },
          ),
        );

      return [{
        source_id:
          sourceId,
        job_key:
          'ikas-products-current',
        query_group_id:
          null as string | null,
        source_context:
          { ...context },
      }];
    } catch {
      return [];
    }
  }
  if (sourceId === 'google-keyword-planner-csv') {
    try {
      const context =
        keywordPlannerCsvContextAsJson(
          createKeywordPlannerCsvJobContext({
            ...config,
            task_id:
              config.task_id
              ?? KEYWORD_PLANNER_CSV_TASK_ID,
            source_id:
              config.source_id
              ?? sourceId,
            source_mode:
              config.source_mode
              ?? KEYWORD_PLANNER_CSV_SOURCE_MODE,
          }),
        );

      return [{
        source_id:
          sourceId,
        job_key:
          'keyword-planner-manual-current',
        query_group_id:
          null,
        source_context:
          context,
      }];
    } catch {
      return [];
    }
  }
  if (sourceId === 'bitkimark-sitemap') {
    try {
      return resolveBitkimarkSitemapContexts(config).map((context, index) => {
        const pathname = new URL(context.requested_url as string).pathname;
        const name = pathname.split('/').filter(Boolean).at(-1)?.replace(/\.xml$/i, '') ?? 'root';
        const safeName = name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'root';
        return {
          source_id: sourceId,
          job_key: `bitkimark-${index + 1}-${safeName}`,
          query_group_id: null as string | null,
          source_context: context,
        };
      });
    } catch {
      return [];
    }
  }
  return [];
};

export class DesktopMultiSourceController {
  private readonly sourceOrder: readonly string[];
  private readonly sourceNames: Record<string, string>;
  private readonly planner: (source_id: string, source_config: Record<string, unknown>) => JobPlan[];
  private readonly now: () => Date;
  private readinessEvaluator: DesktopReadinessReader;

  constructor(private readonly dependencies: DesktopMultiSourceControllerDependencies) {
    this.sourceOrder = dependencies.source_order ?? SUPPORTED_DESKTOP_SOURCE_IDS;
    this.sourceNames = dependencies.source_names ?? {};
    this.planner = dependencies.job_planner ?? productionPlanner;
    this.now = dependencies.now ?? (() => new Date());
    this.readinessEvaluator = dependencies.readiness;
  }

  setReadinessEvaluator(
    evaluator: (
      workspace_id: string,
      source_id: string,
      source_config?: Record<string, unknown>,
    ) => Promise<{ readiness_status: DesktopReadinessStatus }>,
  ): void {
    this.readinessEvaluator = {
      getReadiness: evaluator,
    };
  }

  listWorkspaces() {
    return this.dependencies.repository.listWorkspaces();
  }

  getWorkspaceView(selected_workspace_id: string | null = null): DesktopWorkspaceView {
    const workspaces =
      this.listWorkspaces();

    const defaultWorkspace =
      workspaces.find(
        (workspace) =>
          workspace.workspace_id !==
          'ws_development_migration',
      )
      ?? workspaces[0]
      ?? null;

    const selected =
      selected_workspace_id
      ?? defaultWorkspace?.workspace_id
      ?? null;

    return {
      workspaces,
      selected_workspace_id: selected,
      connections: selected
        ? this.dependencies.repository.listSourceConnections(selected).map((connection) => ({ source_id: connection.source_id, configured: connection.credential_ref !== null }))
        : [],
    };
  }

  async getWorkspaceConnections(
    workspace_id: string,
  ): Promise<DesktopWorkspaceConnectionView[]> {
    const workspace =
      this.dependencies.repository.getWorkspace(
        workspace_id,
      );

    if (!workspace) {
      throw new Error(
        `Unknown Workspace: ${workspace_id}`,
      );
    }

    const connectionBySource =
      new Map(
        this.dependencies.repository
          .listSourceConnections(
            workspace_id,
          )
          .map(
            (connection) => [
              connection.source_id,
              connection,
            ],
          ),
      );

    return Promise.all(
      DESKTOP_CREDENTIAL_MANAGED_SOURCE_IDS.map(
        async (source_id) => {
          const connection =
            connectionBySource.get(
              source_id,
            );

          let credential_status:
            DesktopWorkspaceConnectionView['credential_status'] =
              'NOT_CONFIGURED';

          if (connection?.credential_ref) {
            const credentialAvailability =
              this.dependencies
                .credential_availability;

            if (!credentialAvailability) {
              throw new Error(
                'Credential availability reader is not configured.',
              );
            }

            credential_status =
              await credentialAvailability
                .hasCredential(
                  connection.credential_ref,
                )
                ? 'AVAILABLE'
                : 'MISSING';
          }

          const readiness =
            await this.readinessEvaluator
              .getReadiness(
                workspace_id,
                source_id,
              );

          return {
            source_id,
            credential_status,
            readiness_status:
              readiness.readiness_status,
          };
        },
      ),
    );
  }

  listPresets(workspace_id: string) {
    return this.dependencies.repository.listSavedCollectionPresets(workspace_id);
  }

  createPreset(input: {
    workspace_id: string;
    preset_name: string;
    reusable_configuration: ReusableCollectionConfiguration;
  }) {
    const workspace =
      this.dependencies.repository.getWorkspace(
        input.workspace_id,
      );

    if (!workspace) {
      throw new Error(
        `Unknown Workspace: ${input.workspace_id}`,
      );
    }

    return this.dependencies.repository.createSavedCollectionPreset({
      workspace_id: input.workspace_id,
      preset_name: input.preset_name,
      reusable_configuration:
        cloneConfiguration(
          input.reusable_configuration,
        ),
    });
  }

  updatePreset(input: {
    workspace_id: string;
    preset_id: string;
    preset_name: string;
    reusable_configuration: ReusableCollectionConfiguration;
  }) {
    const workspace = this.dependencies.repository.getWorkspace(
      input.workspace_id,
    );

    if (!workspace) {
      throw new Error(
        `Unknown Workspace: ${input.workspace_id}`,
      );
    }

    return this.dependencies.repository.updateSavedCollectionPreset({
      workspace_id: input.workspace_id,
      preset_id: input.preset_id,
      preset_name: input.preset_name,
      reusable_configuration: cloneConfiguration(
        input.reusable_configuration,
      ),
    });
  }

  deletePreset(
    workspace_id: string,
    preset_id: string,
  ): void {
    const workspace =
      this.dependencies.repository.getWorkspace(
        workspace_id,
      );

    if (!workspace) {
      throw new Error(
        `Unknown Workspace: ${workspace_id}`,
      );
    }

    this.dependencies.repository
      .deleteSavedCollectionPreset(
        workspace_id,
        preset_id,
      );
  }


  getLastRunSettings(workspace_id: string) {
    return this.dependencies.repository.getLastRunSettings(workspace_id);
  }

  listRuns(workspace_id: string) {
    return this.dependencies.repository.listRuns?.(workspace_id) ?? [];
  }

  createDraft(input: { workspace_id: string; origin: RunDraftOrigin }): DesktopRunDraft {
    const workspace = this.dependencies.repository.getWorkspace(input.workspace_id);
    if (!workspace) throw new Error(`Unknown Workspace: ${input.workspace_id}`);
    let configuration: ReusableCollectionConfiguration = {};
    if (input.origin.kind === 'SAVED_PRESET') {
      const preset = this.dependencies.repository.getSavedCollectionPreset(input.workspace_id, input.origin.preset_id);
      if (!preset) throw new Error(`Saved Preset ${input.origin.preset_id} is not available in Workspace ${input.workspace_id}.`);
      configuration = cloneConfiguration(preset.reusable_configuration);
    } else if (input.origin.kind === 'LAST_RUN_SETTINGS') {
      const lastRunSettings =
        this.dependencies.repository.getLastRunSettings(
          input.workspace_id,
        );

      if (!lastRunSettings) {
        throw new Error(
          `Last Run Settings are not available in Workspace ${input.workspace_id}.`,
        );
      }

      configuration =
        cloneConfiguration(
          lastRunSettings.reusable_configuration,
        );
    }
    return {
      workspace_id: input.workspace_id,
      origin: input.origin,
      reusable_configuration: configuration,
      source_cards: this.buildCards(
        input.workspace_id,
        configuration,
        this.sourceOrder.map((source_id) => ({ source_id, readiness_status: 'CONFIGURATION_REQUIRED' })) as never,
      ),
    };
  }

  async reviewDraft(draft: DesktopRunDraft): Promise<DesktopReview> {
    const workspace = this.dependencies.repository.getWorkspace(draft.workspace_id);
    if (!workspace) throw new Error(`Unknown Workspace: ${draft.workspace_id}`);
    const statuses = await Promise.all(this.sourceOrder.map(async (source_id) => ({
      source_id,
      readiness_status: included(draft.reusable_configuration, source_id)
        ? (
          await this.readinessEvaluator.getReadiness(
            draft.workspace_id,
            source_id,
            sourceConfig(
              draft.reusable_configuration,
              source_id,
            ),
          )
        ).readiness_status
        : 'READY' as DesktopReadinessStatus,
    })));
    const cards = this.buildCards(draft.workspace_id, draft.reusable_configuration, statuses);
    const includedSources = cards.filter((card) => card.included).map((card) => card.source_id);
    const blockingSources = cards.filter((card) => card.included && card.readiness_status !== 'READY').map((card) => card.source_id);
    const resolvedAt =
      this.now();

    const referenceDate =
      formatLocalReferenceDate(
        resolvedAt,
      );

    const reviewedDraft =
      this.resolveReviewedDraft(
        draft,
        resolvedAt,
      );

    const executionConfiguration =
      reviewedDraft
        ?.resolved_configuration
      ?? this
        .resolveMultiSourceExecutionConfiguration(
          draft,
          resolvedAt,
        );

    const plans =
      this.buildPlans(
        executionConfiguration,
        includedSources,
      );

    const plannedSourceIds =
      new Set(
        plans.map(
          (plan) =>
            plan.source_id,
        ),
      );

    const planningBlockingSources =
      includedSources.filter(
        (sourceId) =>
          !plannedSourceIds.has(
            sourceId,
          ),
      );

    const canStart =
      blockingSources.length === 0
      && planningBlockingSources.length === 0
      && plans.length > 0;

    const multiSourceReviewedDraft:
      DesktopReviewedRunDraft | null =
        includedSources.length > 1
        && canStart
          ? {
              workspace_id:
                draft.workspace_id,
              task_id:
                null,
              source_id:
                null,
              included_sources: [
                ...includedSources,
              ],
              reference_date:
                referenceDate,
              resolved_at:
                resolvedAt.toISOString(),
              reusable_configuration:
                cloneConfiguration(
                  draft.reusable_configuration,
                ),
              resolved_configuration:
                cloneConfiguration(
                  executionConfiguration,
                ),
            }
          : null;

    return {
      workspace,
      origin:
        draft.origin,
      included_sources:
        includedSources,
      source_cards:
        cards,
      job_count:
        plans.length,
      can_start:
        canStart,
      blocking_sources:
        blockingSources,
      planning_blocking_sources:
        planningBlockingSources,
      reviewed_draft:
        includedSources.length > 1
          ? multiSourceReviewedDraft
          : reviewedDraft,
    };
  }

  async startDraft(
    draft:
      DesktopRunDraft
      | DesktopReviewedRunDraft,
  ): Promise<DesktopRunState> {
    if (
      'resolved_configuration'
      in draft
    ) {
      return this.startReviewedDraft(
        draft,
      );
    }

    const review = await this.reviewDraft(draft);
    if (!review.can_start) throw new Error(`Run cannot start; included sources are not ready: ${review.blocking_sources.join(', ') || 'no source selected'}.`);

    const executionConfiguration =
      this.resolveMultiSourceExecutionConfiguration(
        draft,
        this.now(),
      );

    const plans =
      this.buildPlans(
        executionConfiguration,
        review.included_sources,
      );

    const configurationSnapshot = {
      ...cloneConfiguration(
        executionConfiguration,
      ),
      resolved_at:
        this.now().toISOString(),
      workspace_id:
        draft.workspace_id,
    };
    const reserved = this.dependencies.repository.reserveRunFromJobPlans({
      workspace_id: draft.workspace_id,
      application_version: this.dependencies.application_version,
      configuration_snapshot: configurationSnapshot,
      reusable_configuration: cloneConfiguration(draft.reusable_configuration),
      job_plans: plans,
    });
    if (this.dependencies.execute_run) {
      void this.dependencies.execute_run(reserved.run.run_id).catch(() => {
        // Core persistence remains authoritative; renderer reads persisted state.
      });
    }
    return {
      run: reserved.run,
      jobs: reserved.jobs,
      completed_jobs: 0,
      failed_jobs: 0,
      can_resume: false,
      can_retry: false,
      can_cancel: false,
    };
  }

  private async startReviewedDraft(
    reviewedDraft:
      DesktopReviewedRunDraft,
  ): Promise<DesktopRunState> {
    const workspace =
      this.dependencies.repository
        .getWorkspace(
          reviewedDraft.workspace_id,
        );

    if (!workspace) {
      throw new Error(
        `Unknown Workspace: ${reviewedDraft.workspace_id}`,
      );
    }

    const statuses =
      await Promise.all(
        this.sourceOrder.map(
          async (sourceId) => ({
            source_id:
              sourceId,
            readiness_status:
              included(
                reviewedDraft
                  .resolved_configuration,
                sourceId,
              )
                ? (
                    await this
                      .readinessEvaluator
                      .getReadiness(
                        reviewedDraft.workspace_id,
                        sourceId,
                        sourceConfig(
                          reviewedDraft
                            .resolved_configuration,
                          sourceId,
                        ),
                      )
                  ).readiness_status
                : 'READY' as DesktopReadinessStatus,
          }),
        ),
      );

    const cards =
      this.buildCards(
        reviewedDraft.workspace_id,
        reviewedDraft
          .resolved_configuration,
        statuses,
      );

    const resolvedIncludedSources =
      cards
        .filter(
          (card) =>
            card.included,
        )
        .map(
          (card) =>
            card.source_id,
        );

    const includedSources = [
      ...reviewedDraft
        .included_sources,
    ];

    const includedSourceSet =
      new Set(
        includedSources,
      );

    const missingResolvedSources =
      includedSources.filter(
        (sourceId) =>
          !resolvedIncludedSources
            .includes(
              sourceId,
            ),
      );

    const unexpectedResolvedSources =
      resolvedIncludedSources.filter(
        (sourceId) =>
          !includedSourceSet.has(
            sourceId,
          ),
      );

    if (
      missingResolvedSources.length > 0
      || unexpectedResolvedSources.length > 0
    ) {
      throw new Error(
        'Reviewed Run source set does not match resolved configuration.',
      );
    }

    const blockingSources =
      cards
        .filter(
          (card) =>
            includedSourceSet.has(
              card.source_id,
            )
            && card.readiness_status
              !== 'READY',
        )
        .map(
          (card) =>
            card.source_id,
        );

    const plans =
      this.buildPlans(
        reviewedDraft
          .resolved_configuration,
        includedSources,
      );

    const plannedSourceIds =
      new Set(
        plans.map(
          (plan) =>
            plan.source_id,
        ),
      );

    const planningBlockingSources =
      includedSources.filter(
        (sourceId) =>
          !plannedSourceIds.has(
            sourceId,
          ),
      );

    const startBlockingSources = [
      ...new Set([
        ...blockingSources,
        ...planningBlockingSources,
      ]),
    ];

    if (
      startBlockingSources.length > 0
      || plans.length === 0
    ) {
      throw new Error(
        `Run cannot start; included sources are not ready: ${startBlockingSources.join(', ') || 'no source selected'}.`,
      );
    }

    let configurationSnapshot:
      JsonObject;

    if (
      reviewedDraft.source_id === null
      || reviewedDraft.task_id === null
    ) {
      if (
        reviewedDraft.source_id !== null
        || reviewedDraft.task_id !== null
      ) {
        throw new Error(
          'Reviewed Run root task/source identity is inconsistent.',
        );
      }

      if (includedSources.length <= 1) {
        throw new Error(
          'Multi-source reviewed Run must contain more than one included source.',
        );
      }

      configurationSnapshot = {
        ...cloneConfiguration(
          reviewedDraft
            .resolved_configuration,
        ),
        workspace_id:
          reviewedDraft.workspace_id,
        task_id:
          null,
        source_id:
          null,
        reference_date:
          reviewedDraft.reference_date,
        resolved_at:
          reviewedDraft.resolved_at,
      };
    } else {
      const reusableSource =
        sourceConfig(
          reviewedDraft
            .reusable_configuration,
          reviewedDraft.source_id,
        );

      const resolvedSource =
        sourceConfig(
          reviewedDraft
            .resolved_configuration,
          reviewedDraft.source_id,
        );

      const dateRanges =
        Array.isArray(
          resolvedSource.date_ranges,
        )
          ? resolvedSource.date_ranges
          : [];

      const firstDateRange =
        asObject(
          dateRanges[0],
        );

      const requestedDateStart =
        typeof resolvedSource
          .requested_date_start === 'string'
          ? resolvedSource
              .requested_date_start
          : typeof firstDateRange
              .requested_date_start === 'string'
            ? firstDateRange
                .requested_date_start
            : null;

      const requestedDateEnd =
        typeof resolvedSource
          .requested_date_end === 'string'
          ? resolvedSource
              .requested_date_end
          : typeof firstDateRange
              .requested_date_end === 'string'
            ? firstDateRange
                .requested_date_end
            : null;

      configurationSnapshot = {
        ...cloneConfiguration(
          reviewedDraft
            .resolved_configuration,
        ),
        workspace_id:
          reviewedDraft.workspace_id,
        task_id:
          reviewedDraft.task_id,
        source_id:
          reviewedDraft.source_id,
        reference_date:
          reviewedDraft.reference_date,
        resolved_at:
          reviewedDraft.resolved_at,
        date_policy:
          typeof reusableSource
            .date_policy === 'string'
            ? reusableSource.date_policy
            : null,
        requested_date_start:
          requestedDateStart,
        requested_date_end:
          requestedDateEnd,
      };
    }

    if (
      reviewedDraft.source_id
        === 'google-trends'
      && configurationSnapshot.search_type
        === 'WEB_SEARCH'
      && configurationSnapshot.selection_type
        === 'SEARCH_TERM'
    ) {
      configurationSnapshot.search_type =
        'Web Search';

      configurationSnapshot.selection_type =
        'Search Term';
    }

    const reserved =
      this.dependencies.repository
        .reserveRunFromJobPlans({
          workspace_id:
            reviewedDraft.workspace_id,
          application_version:
            this.dependencies
              .application_version,
          configuration_snapshot:
            configurationSnapshot,
          reusable_configuration:
            cloneConfiguration(
              reviewedDraft
                .reusable_configuration,
            ),
          job_plans:
            plans,
        });

    if (
      this.dependencies.execute_run
    ) {
      void this.dependencies
        .execute_run(
          reserved.run.run_id,
        )
        .catch(() => {
          // Core persistence remains authoritative;
          // renderer reads persisted state.
        });
    }

    return {
  run: reserved.run,
  jobs: reserved.jobs,
  completed_jobs: 0,
  failed_jobs: 0,
  can_resume: false,
  can_retry: false,
  can_cancel: false,
};
  }
  getRunState(run_id: string): DesktopRunState {
    const run =
      this.dependencies.repository
        .getRun(
          run_id,
        );

    if (!run) {
      throw new Error(
        'Unknown Run: ' + run_id,
      );
    }

    const jobs =
      this.dependencies.repository
        .listJobs(
          run_id,
        );

    const job_attempts =
      jobs.flatMap((job) => (
        this.dependencies.repository.listAttempts?.(job.job_id) ?? []
      )).map((attempt) => ({
        job_id: attempt.job_id,
        attempt_number: attempt.attempt_number,
        execution_status: attempt.execution_status,
        error_code: attempt.error_code,
        started_at: attempt.started_at,
        completed_at: attempt.completed_at,
      }));

    const plan =
      new ResumePlanner(
        this.dependencies.repository as never,
      ).planRun(
        run.workspace_id,
        run_id,
      );

    const isActive =
      this.dependencies
        .is_run_active?.(
          run_id,
        ) === true;

    const retryPolicy =
      new RetryPolicy({
        max_attempts: 2,
      });

    const can_resume =
      isActive === false
      && (
        plan?.jobs.some(
          (jobPlan) =>
            jobPlan.action
              === 'RECONCILE_REQUIRED'
            && jobPlan.candidate_artifact
              === null
            && (
              jobPlan.job.execution_status
                === 'RUNNING'
              || jobPlan.job.execution_status
                === 'VALIDATING'
            ),
        ) ?? false
      );

    const can_retry =
      isActive === false
      && (
        plan?.jobs.some(
          (jobPlan) =>
            jobPlan.action
              === 'RETRY_CANDIDATE'
            && retryPolicy
              .canStartAnotherAttempt(
                jobPlan.job,
              ),
        ) ?? false
      );

      const can_cancel =
  !isTerminalRunStatus(
    run.run_status,
  )
  && (
    isActive
      ? this.dependencies
          .can_cancel_run?.(
            run_id,
          ) === true
      : true
  );

    return {
      run,
      jobs,
      job_attempts,
      completed_jobs:
        jobs.filter(
          (job) =>
            job.execution_status
              === 'COMPLETED',
        ).length,
      failed_jobs:
        jobs.filter(
          (job) =>
            job.execution_status
              === 'FAILED',
        ).length,
      can_resume,
      can_retry,
      can_cancel,
    };
  }

  async cancelRun(
  run_id: string,
): Promise<DesktopRunState> {
  const run =
    this.dependencies.repository
      .getRun(
        run_id,
      );

  if (!run) {
    throw new Error(
      `Unknown Run: ${run_id}`,
    );
  }

  if (
    isTerminalRunStatus(
      run.run_status,
    )
  ) {
    throw new Error(
      `Run ${run_id} cannot be cancelled from ${run.run_status}.`,
    );
  }

  const isActive =
    this.dependencies
      .is_run_active?.(
        run_id,
      ) === true;

  if (
    isActive
    && this.dependencies
      .can_cancel_run?.(
        run_id,
      ) !== true
  ) {
    throw new Error(
      `Run ${run_id} is active but has no safe physical cancellation capability.`,
    );
  }

  if (
    isActive
    && !this.dependencies
      .cancel_active_run
  ) {
    throw new Error(
      'Active Run cancellation is unavailable.',
    );
  }

  const repository =
    this.dependencies.repository as
      DesktopMultiSourceRepository & {
        transitionJobExecution(
          job_id: string,
          next_status:
            'CANCELLED',
          options?: {
            error_code?:
              string;
            error_message?:
              string;
          },
        ): unknown;
      };

  const cancellableStatuses =
    new Set([
      'PENDING',
      'RUNNING',
      'VALIDATING',
      'MANUAL_ACTION_REQUIRED',
      'RETRY_PENDING',
    ]);

  for (
    const job
    of repository.listJobs(
      run_id,
    )
  ) {
    if (
      !cancellableStatuses.has(
        job.execution_status,
      )
    ) {
      continue;
    }

    repository
      .transitionJobExecution(
        job.job_id,
        'CANCELLED',
        {
          error_code:
            'USER_CANCELLED',
          error_message:
            'Run cancelled by user.',
        },
      );
  }

  new RunManager(
  this.dependencies.repository as never,
).cancelRun(
  run_id,
);

  if (
    isActive
    && this.dependencies
      .cancel_active_run
  ) {
    await this.dependencies
      .cancel_active_run(
        run_id,
      );
  }

  return this.getRunState(
    run_id,
  );
}
  async openAcceptedArtifact(
    run_id: string,
    job_id: string,
  ): Promise<void> {
    const run = this.dependencies.repository.getRun(run_id);
    if (!run) throw new Error(`Unknown Run: ${run_id}`);

    const job = this.dependencies.repository
      .listJobs(run_id)
      .find((candidate) => candidate.job_id === job_id);
    if (!job) throw new Error(`Unknown Job ${job_id} in Run ${run_id}.`);
    if (job.accepted_artifact_id === null) {
      throw new Error(`Job ${job_id} has no accepted artifact.`);
    }

    const artifact = this.dependencies.repository
      .getArtifact(job.accepted_artifact_id);
    if (
      artifact === null
      || artifact.run_id !== run_id
      || artifact.job_id !== job_id
      || artifact.source_id !== job.source_id
      || artifact.artifact_kind !== 'RAW_SOURCE_FILE'
      || (
        artifact.artifact_state !== 'ACCEPTED'
        && artifact.artifact_state !== 'ACCEPTED_WITH_WARNING'
      )
    ) {
      throw new Error(`Job ${job_id} accepted artifact is invalid.`);
    }

    if (!this.dependencies.open_accepted_artifact) {
      throw new Error('Accepted evidence opening is unavailable.');
    }

    await this.dependencies.open_accepted_artifact(artifact);
  }
  async retryFailed(run_id: string): Promise<DesktopRunState> {
    const run = this.dependencies.repository.getRun(run_id);
    if (!run) throw new Error(`Unknown Run: ${run_id}`);

    const plan = new ResumePlanner(
      this.dependencies.repository as never,
    ).planRun(
      run.workspace_id,
      run_id,
    );

    if (!plan) {
      throw new Error(
        `Run ${run_id} is not retryable in its Workspace.`,
      );
    }

    if (!this.dependencies.execute_retry) {
      throw new Error(
        'Core retry execution is unavailable.',
      );
    }

    const retryCandidate = plan.jobs.find(
      (jobPlan) =>
        jobPlan.action === 'RETRY_CANDIDATE',
    );

    if (!retryCandidate) {
      throw new Error(
        `Run ${run_id} has no retry candidate.`,
      );
    }

    const coordinator =
      new ReconciliationCoordinator(
        this.dependencies.repository as never,
        new RetryPolicy({
          max_attempts: 2,
        }),
      );

    const retry =
      coordinator.apply(
        retryCandidate,
      );

    if (
      retry.outcome !== 'RETRY_STARTED' ||
      retry.attempt === null
    ) {
      throw new Error(
        `Run ${run_id} retry could not start: ${retry.outcome}.`,
      );
    }

    void this.dependencies.execute_retry(
      run_id,
      retryCandidate.job.job_id,
      retry.attempt,
    ).catch(() => {
      // Core persistence remains authoritative;
      // renderer reads persisted state.
    });

    return this.getRunState(run_id);
  }

  async resumeInterrupted(
    run_id: string,
  ): Promise<DesktopRunState> {
    const run =
      this.dependencies.repository
        .getRun(
          run_id,
        );

    if (!run) {
      throw new Error(
        'Unknown Run: ' + run_id,
      );
    }

    if (
      this.dependencies
        .is_run_active?.(
          run_id,
        ) === true
    ) {
      throw new Error(
        'Run '
        + run_id
        + ' is still owned by active in-process execution.',
      );
    }

    const plan =
      new ResumePlanner(
        this.dependencies.repository as never,
      ).planRun(
        run.workspace_id,
        run_id,
      );

    if (!plan) {
      throw new Error(
        'Run '
        + run_id
        + ' is not resumable in its Workspace.',
      );
    }

    const interruptedPlans =
      plan.jobs.filter(
        (jobPlan) =>
          jobPlan.action ===
            'RECONCILE_REQUIRED',
      );

    if (
      interruptedPlans.length === 0
    ) {
      throw new Error(
        'Run '
        + run_id
        + ' has no interrupted work to reconcile.',
      );
    }

    const unsafePlan =
      interruptedPlans.find(
        (jobPlan) =>
          jobPlan.candidate_artifact
            !== null
          || (
            jobPlan.job
              .execution_status
              !== 'RUNNING'
            && jobPlan.job
              .execution_status
              !== 'VALIDATING'
          ),
      );

    if (unsafePlan) {
      throw new Error(
        'Run '
        + run_id
        + ' has interrupted work requiring manual reconciliation.',
      );
    }

    const coordinator =
      new ReconciliationCoordinator(
        this.dependencies.repository as never,
        new RetryPolicy({
          max_attempts: 2,
        }),
      );

    for (
      const jobPlan
      of interruptedPlans
    ) {
      const reconciliation =
        coordinator.apply(
          jobPlan,
        );

      if (
        reconciliation.outcome
          !== 'RETRY_PENDING'
        && reconciliation.outcome
          !== 'RETRY_EXHAUSTED'
      ) {
        throw new Error(
          'Run '
          + run_id
          + ' could not reconcile interrupted Job '
          + jobPlan.job.job_id
          + ': '
          + reconciliation.outcome
          + '.',
        );
      }
    }

    new RunManager(
      this.dependencies.repository as never,
    ).refreshRunStatus(
      run_id,
    );

    return this.getRunState(
      run_id,
    );
  }

  async continueManual(
    run_id: string,
  ): Promise<DesktopRunState> {
    const run =
      this.dependencies.repository
        .getRun(
          run_id,
        );

    if (!run) {
      throw new Error(
        `Unknown Run: ${run_id}`,
      );
    }

    const plan =
      new ResumePlanner(
        this.dependencies.repository as never,
      ).planRun(
        run.workspace_id,
        run_id,
      );

    if (!plan) {
      throw new Error(
        `Run ${run_id} is not resumable in its Workspace.`,
      );
    }

    if (!this.dependencies.execute_continue) {
      throw new Error(
        'Core continuation execution is unavailable.',
      );
    }

    const manualJob =
      plan.jobs.find(
        (jobPlan) =>
          jobPlan.action ===
            'BLOCKED_MANUAL_ACTION',
      );

    if (!manualJob) {
      throw new Error(
        `Run ${run_id} has no manual-action Job to continue.`,
      );
    }

    const continuationRepository =
      this.dependencies.repository as
        DesktopMultiSourceRepository & {
          transitionJobExecution(
            job_id: string,
            next_status: 'RUNNING',
          ): unknown;
          listAttempts(
            job_id: string,
          ): AttemptRecord[];
        };

    continuationRepository
      .transitionJobExecution(
        manualJob.job.job_id,
        'RUNNING',
      );

    new RunManager(
      this.dependencies.repository as never,
    ).refreshRunStatus(
      run_id,
    );

    const continuedAttempt =
      continuationRepository
        .listAttempts(
          manualJob.job.job_id,
        )
        .at(-1);

    if (
      continuedAttempt === undefined
      || continuedAttempt
        .execution_status !==
          'RUNNING'
    ) {
      throw new Error(
        `Run ${run_id} manual continuation has no active attempt for Job ${manualJob.job.job_id}.`,
      );
    }

    void this.dependencies
      .execute_continue(
        run_id,
        manualJob.job.job_id,
        continuedAttempt,
      )
      .catch(() => {
        // Core persistence remains authoritative;
        // renderer reads persisted state.
      });

    return this.getRunState(
      run_id,
    );
  }

  buildPackage(run_id: string, mode: DataPackageMode, datasets: Parameters<typeof buildDataPackage>[0]['datasets']): DataPackage {
    const state = this.getRunState(run_id);
    return buildDataPackage({ run: state.run, jobs: state.jobs, datasets, mode });
  }

  async exportRun(run_id: string, mode: DataPackageMode): Promise<{ export_directory: string; dataset_count: number; failed_count: number }> {
    if (!this.dependencies.package_directory) throw new Error('Data Package export is unavailable.');
    const run = this.dependencies.repository.getRun(run_id);
    if (run === null) throw new Error(`Unknown Run: ${run_id}`);
    if (!isTerminalRunStatus(run.run_status)) throw new Error(`Run ${run_id} is not terminal and cannot be exported.`);
    if (!this.dependencies.load_datasets) throw new Error('Data Package dataset loading is unavailable.');
    const datasets = await this.dependencies.load_datasets(run_id);
    const dataPackage = this.buildPackage(run_id, mode, datasets);
    const directory = `${this.dependencies.package_directory}/${run_id}/exports/${mode.toLowerCase()}`;
    await writeDataPackage(directory, dataPackage);
    return { export_directory: directory, dataset_count: dataPackage.datasets.length, failed_count: dataPackage.failures.length };
  }

  private resolveMultiSourceExecutionConfiguration(
    draft: DesktopRunDraft,
    resolvedAt: Date,
  ): ReusableCollectionConfiguration {
    const reusableConfiguration =
      cloneConfiguration(
        draft.reusable_configuration,
      );

    const includedSourceIds =
      this.sourceOrder.filter(
        (sourceId) =>
          included(
            reusableConfiguration,
            sourceId,
          ),
      );

    if (includedSourceIds.length <= 1) {
      return reusableConfiguration;
    }

    const resolvedConfiguration =
      cloneConfiguration(
        reusableConfiguration,
      );

    const resolvedSources =
      asJsonObjectValue(
        resolvedConfiguration.sources,
      );

    for (
      const sourceId
      of includedSourceIds
    ) {
      if (
        sourceId
          !== 'google-search-console-query-page'
        && sourceId
          !== 'google-ads-search-terms'
      ) {
        continue;
      }

      const reusableSources =
        asJsonObjectValue(
          reusableConfiguration.sources,
        );

      const singleSourceConfiguration:
        ReusableCollectionConfiguration = {
          sources: {
            [sourceId]:
              asJsonObjectValue(
                reusableSources[sourceId],
              ),
          },
        };

      const reviewedSource =
        this.resolveReviewedDraft(
          {
            ...draft,
            reusable_configuration:
              singleSourceConfiguration,
          },
          resolvedAt,
        );

      if (reviewedSource === null) {
        continue;
      }

      const reviewedSources =
        asJsonObjectValue(
          reviewedSource
            .resolved_configuration
            .sources,
        );

      resolvedSources[sourceId] =
        asJsonObjectValue(
          reviewedSources[sourceId],
        );
    }

    resolvedConfiguration.sources =
      resolvedSources;

    return resolvedConfiguration;
  }

  private resolveReviewedDraft(
    draft: DesktopRunDraft,
    resolvedAt: Date,
  ): DesktopReviewedRunDraft | null {
    const includedSourceIds =
      this.sourceOrder.filter(
        (sourceId) =>
          included(
            draft.reusable_configuration,
            sourceId,
          ),
      );

    if (
      includedSourceIds.length !== 1
    ) {
      return null;
    }

    const sourceId =
      includedSourceIds[0];

    const config =
      sourceConfig(
        draft.reusable_configuration,
        sourceId,
      );

    if (sourceId === 'serpapi') {
      if (
        config.task_id !== SERPAPI_TASK_ID
        || !Array.isArray(config.queries)
        || config.queries.length === 0
      ) {
        return null;
      }
      const entries = config.queries.map((query) => {
        const value = asObject(query);
        return {
          job_key: value.job_key,
          query: value.query,
        };
      });
      if (entries.some((entry) => typeof entry.job_key !== 'string' || typeof entry.query !== 'string')) {
        return null;
      }
      const referenceDate = formatLocalReferenceDate(resolvedAt);
      let contexts: JsonObject[];
      try {
        contexts = createSerpApiJobPlans(
          entries as { job_key: string; query: string }[],
          referenceDate,
        ).map((plan) => plan.source_context);
      } catch {
        return null;
      }
      const reusableConfiguration = cloneConfiguration(draft.reusable_configuration);
      const resolvedConfiguration = cloneConfiguration(draft.reusable_configuration);
      const sources = asJsonObjectValue(resolvedConfiguration.sources);
      sources[sourceId] = {
        ...asJsonObjectValue(sources[sourceId]),
        task_id: SERPAPI_TASK_ID,
        queries: contexts,
      };
      resolvedConfiguration.sources = sources;
      return {
        workspace_id: draft.workspace_id,
        task_id: SERPAPI_TASK_ID,
        source_id: sourceId,
        included_sources: [
          sourceId,
        ],
        reference_date: referenceDate,
        resolved_at: resolvedAt.toISOString(),
        reusable_configuration: reusableConfiguration,
        resolved_configuration: resolvedConfiguration,
      };
    }

    if (sourceId === 'google-ads-search-terms') {
      const taskId =
        typeof config.task_id === 'string'
          ? config.task_id
          : null;

      const expectedDatePolicy =
        taskId === 'google-ads-search-terms'
          ? 'TODAY_MINUS_17_TO_YESTERDAY'
          : taskId === 'google-ads-search-terms-7-days'
            ? 'TODAY_MINUS_7_TO_YESTERDAY'
            : taskId === 'google-ads-search-terms-14-days'
              ? 'TODAY_MINUS_14_TO_YESTERDAY'
              : taskId === 'google-ads-search-terms-30-days'
                ? 'TODAY_MINUS_30_TO_YESTERDAY'
                : null;

      if (
        taskId === null
        || expectedDatePolicy === null
        || config.date_policy !== expectedDatePolicy
      ) {
        return null;
      }

      const range = resolveDesktopDatePolicy(
        expectedDatePolicy,
        formatLocalReferenceDate(resolvedAt),
      );
      const reusableConfiguration = cloneConfiguration(draft.reusable_configuration);
      const resolvedConfiguration = cloneConfiguration(draft.reusable_configuration);
      const sources = asJsonObjectValue(resolvedConfiguration.sources);
      const jobContext = createSearchTermsJobContext(range);
      sources[sourceId] = { ...asJsonObjectValue(sources[sourceId]), ...jobContext, jobs: [jobContext] };
      resolvedConfiguration.sources = sources;
      return {
        workspace_id: draft.workspace_id,
        task_id: taskId,
        source_id: sourceId,
        included_sources: [
          sourceId,
        ],
        reference_date: range.reference_date,
        resolved_at: resolvedAt.toISOString(),
        reusable_configuration: reusableConfiguration,
        resolved_configuration: resolvedConfiguration,
      };
    }

    if (sourceId === 'google-ads-search-reporting') {
      if (
        !Array.isArray(config.datasets)
        || typeof config.customer_id !== 'string'
        || typeof config.requested_date_start !== 'string'
        || typeof config.requested_date_end !== 'string'
      ) {
        return null;
      }

      try {
        const jobs = config.datasets.map(
          (dataset) =>
            googleAdsReportingContextAsJson(
              createGoogleAdsReportingJobContext({
                dataset_type:
                  dataset as never,
                customer_id:
                  config.customer_id as string,
                requested_date_start:
                  config.requested_date_start as string,
                requested_date_end:
                  config.requested_date_end as string,
              }),
            ),
        );

        const reusableConfiguration =
          cloneConfiguration(
            draft.reusable_configuration,
          );

        const resolvedConfiguration =
          cloneConfiguration(
            draft.reusable_configuration,
          );

        const sources =
          asJsonObjectValue(
            resolvedConfiguration.sources,
          );

        sources[sourceId] = {
          ...asJsonObjectValue(
            sources[sourceId],
          ),
          jobs,
        };

        resolvedConfiguration.sources =
          sources;

        return {
          workspace_id:
            draft.workspace_id,
          task_id:
            sourceId,
          source_id:
            sourceId,
          included_sources: [
            sourceId,
          ],
          reference_date:
            formatLocalReferenceDate(
              resolvedAt,
            ),
          resolved_at:
            resolvedAt.toISOString(),
          reusable_configuration:
            reusableConfiguration,
          resolved_configuration:
            resolvedConfiguration,
        };
      } catch {
        return null;
      }
    }

    if (sourceId === 'google-ads-change-history') {
      if (
        typeof config.dataset_type !== 'string'
        || typeof config.customer_id !== 'string'
        || typeof config.requested_date_start !== 'string'
        || typeof config.requested_date_end !== 'string'
      ) {
        return null;
      }

      try {
        const jobContext =
          createGoogleAdsChangeHistoryJobContext({
            dataset_type:
              config.dataset_type as never,
            customer_id:
              config.customer_id as string,
            requested_date_start:
              config.requested_date_start as string,
            requested_date_end:
              config.requested_date_end as string,
          });

        const reusableConfiguration =
          cloneConfiguration(
            draft.reusable_configuration,
          );

        const resolvedConfiguration =
          cloneConfiguration(
            draft.reusable_configuration,
          );

        const sources =
          asJsonObjectValue(
            resolvedConfiguration.sources,
          );

        sources[sourceId] = {
          ...asJsonObjectValue(
            sources[sourceId],
          ),
          jobs: [
            { ...jobContext },
          ],
        };

        resolvedConfiguration.sources =
          sources;

        return {
          workspace_id:
            draft.workspace_id,
          task_id:
            sourceId,
          source_id:
            sourceId,
          included_sources: [
            sourceId,
          ],
          reference_date:
            formatLocalReferenceDate(
              resolvedAt,
            ),
          resolved_at:
            resolvedAt.toISOString(),
          reusable_configuration:
            reusableConfiguration,
          resolved_configuration:
            resolvedConfiguration,
        };
      } catch {
        return null;
      }
    }

    if (sourceId === 'google-ads-configuration') {
      if (
        typeof config.dataset_type !== 'string'
        || typeof config.customer_id !== 'string'
      ) {
        return null;
      }

      try {
        const jobContext =
          googleAdsConfigurationContextAsJson(
            createGoogleAdsConfigurationJobContext({
              dataset_type:
                config.dataset_type as never,
              customer_id:
                config.customer_id as string,
            }),
          );

        const reusableConfiguration =
          cloneConfiguration(
            draft.reusable_configuration,
          );

        const resolvedConfiguration =
          cloneConfiguration(
            draft.reusable_configuration,
          );

        const sources =
          asJsonObjectValue(
            resolvedConfiguration.sources,
          );

        sources[sourceId] = {
          ...asJsonObjectValue(
            sources[sourceId],
          ),
          jobs: [
            jobContext,
          ],
        };

        resolvedConfiguration.sources =
          sources;

        return {
          workspace_id:
            draft.workspace_id,
          task_id:
            sourceId,
          source_id:
            sourceId,
          included_sources: [
            sourceId,
          ],
          reference_date:
            formatLocalReferenceDate(
              resolvedAt,
            ),
          resolved_at:
            resolvedAt.toISOString(),
          reusable_configuration:
            reusableConfiguration,
          resolved_configuration:
            resolvedConfiguration,
        };
      } catch {
        return null;
      }
    }


    if (
      sourceId === 'google-analytics-4'
    ) {
      if (
        typeof config.start_date !== 'string'
        || typeof config.end_date !== 'string'
      ) {
        return null;
      }

      try {
        createGoogleAnalytics4JobPlans({
          start_date: config.start_date,
          end_date: config.end_date,
        });


        return {
          workspace_id:
            draft.workspace_id,
          task_id:
            sourceId,
          source_id:
            sourceId,
          included_sources: [
            sourceId,
          ],
          reference_date:
            formatLocalReferenceDate(
              resolvedAt,
            ),
          resolved_at:
            resolvedAt.toISOString(),
          reusable_configuration:
            cloneConfiguration(
              draft.reusable_configuration,
            ),
          resolved_configuration:
            cloneConfiguration(
              draft.reusable_configuration,
            ),
        };
      } catch {
        return null;
      }
    }

    if (
      sourceId === 'google-keyword-planner'
    ) {
      if (
        config.task_id
          !== KEYWORD_PLANNER_TASK_ID
        || !Array.isArray(
          config.groups,
        )
        || config.groups.length === 0
      ) {
        return null;
      }


      const keywordPlannerScope =
        resolveKeywordPlannerHistoricalScope(
          resolvedAt,
        );

      let resolvedGroups:
        JsonObject[];

      try {
        resolvedGroups =
          config.groups.map(
            (group) => {
              const value =
                asObject(group);

              return keywordPlannerContextAsJson(
                createKeywordPlannerJobContext({
                  task_id:
                    KEYWORD_PLANNER_TASK_ID,
                  source_id:
                    sourceId,
                  source_mode:
                    KEYWORD_PLANNER_SOURCE_MODE,
                  group_id:
                    value.group_id,
                  group_name:
                    value.group_name,
                  keywords:
                    value.keywords,
                  ...keywordPlannerScope,
                }),
              );
            },
          );
      } catch {
        return null;
      }

      const groupIds =
        resolvedGroups.map(
          (group) => group.group_id,
        );

      if (
        new Set(groupIds).size
          !== groupIds.length
      ) {
        return null;
      }

      const reusableConfiguration =
        cloneConfiguration(
          draft.reusable_configuration,
        );

      const resolvedConfiguration =
        cloneConfiguration(
          draft.reusable_configuration,
        );

      const sources =
        asJsonObjectValue(
          resolvedConfiguration.sources,
        );

      sources[sourceId] = {
        ...asJsonObjectValue(
          sources[sourceId],
        ),
        groups:
          resolvedGroups,
      };

      resolvedConfiguration.sources =
        sources;

      return {
        workspace_id:
          draft.workspace_id,
        task_id:
          KEYWORD_PLANNER_TASK_ID,
        source_id:
          sourceId,
        included_sources: [
          sourceId,
        ],
        reference_date:
          formatLocalReferenceDate(
            resolvedAt,
          ),
        resolved_at:
          resolvedAt.toISOString(),
        reusable_configuration:
          reusableConfiguration,
        resolved_configuration:
          resolvedConfiguration,
      };
    }

    if (
      sourceId === 'ikas-products'
    ) {
      if (
        config.task_id !== undefined
        && config.task_id
          !== IKAS_PRODUCTS_TASK_ID
      ) {
        return null;
      }

      let jobContext;

      try {
        jobContext =
          ikasProductsContextAsJson(
            createIkasProductsJobContext({
              task_id:
                IKAS_PRODUCTS_TASK_ID,
              source_id:
                sourceId,
              source_mode:
                IKAS_PRODUCTS_SOURCE_MODE,
              file_path:
                config.file_path,
            }),
          );
      } catch {
        return null;
      }


      const reusableConfiguration =
        cloneConfiguration(
          draft.reusable_configuration,
        );

      const resolvedConfiguration =
        cloneConfiguration(
          draft.reusable_configuration,
        );

      const sources =
        asJsonObjectValue(
          resolvedConfiguration.sources,
        );

      sources[sourceId] = {
        ...asJsonObjectValue(
          sources[sourceId],
        ),
        ...jobContext,
      };

      resolvedConfiguration.sources =
        sources;

      return {
        workspace_id:
          draft.workspace_id,
        task_id:
          IKAS_PRODUCTS_TASK_ID,
        source_id:
          sourceId,
        included_sources: [
          sourceId,
        ],
        reference_date:
          formatLocalReferenceDate(
            resolvedAt,
          ),
        resolved_at:
          resolvedAt.toISOString(),
        reusable_configuration:
          reusableConfiguration,
        resolved_configuration:
          resolvedConfiguration,
      };
    }

    if (
      sourceId === 'google-keyword-planner-csv'
    ) {
      if (
        config.task_id !== undefined
        && config.task_id
          !== KEYWORD_PLANNER_CSV_TASK_ID
      ) {
        return null;
      }

      let jobContext;

      try {
        jobContext =
          keywordPlannerCsvContextAsJson(
            createKeywordPlannerCsvJobContext({
              task_id:
                KEYWORD_PLANNER_CSV_TASK_ID,
              source_id:
                sourceId,
              source_mode:
                KEYWORD_PLANNER_CSV_SOURCE_MODE,
              file_path:
                config.file_path,
            }),
          );
      } catch {
        return null;
      }

      const reusableConfiguration =
        cloneConfiguration(
          draft.reusable_configuration,
        );
      const resolvedConfiguration =
        cloneConfiguration(
          draft.reusable_configuration,
        );
      const sources =
        asJsonObjectValue(
          resolvedConfiguration.sources,
        );

      sources[sourceId] = {
        ...asJsonObjectValue(
          sources[sourceId],
        ),
        ...jobContext,
      };
      resolvedConfiguration.sources =
        sources;

      return {
        workspace_id:
          draft.workspace_id,
        task_id:
          KEYWORD_PLANNER_CSV_TASK_ID,
        source_id:
          sourceId,
        included_sources: [
          sourceId,
        ],
        reference_date:
          formatLocalReferenceDate(
            resolvedAt,
          ),
        resolved_at:
          resolvedAt.toISOString(),
        reusable_configuration:
          reusableConfiguration,
        resolved_configuration:
          resolvedConfiguration,
      };
    }

    if (sourceId === 'bitkimark-sitemap') {
      let sitemapContexts: JsonObject[];
      try {
        sitemapContexts = resolveBitkimarkSitemapContexts(config);
      } catch {
        return null;
      }
      const reusableConfiguration = cloneConfiguration(draft.reusable_configuration);
      const resolvedConfiguration = cloneConfiguration(draft.reusable_configuration);
      const sources = asJsonObjectValue(resolvedConfiguration.sources);
      sources[sourceId] = {
        ...asJsonObjectValue(sources[sourceId]),
        task_id: BITKIMARK_SITEMAP_TASK_ID,
        source_id: sourceId,
        source_mode: BITKIMARK_SITEMAP_SOURCE_MODE,
        sitemaps: sitemapContexts,
      };
      delete sources[sourceId].sitemap_url;
      resolvedConfiguration.sources = sources;
      return {
        workspace_id: draft.workspace_id,
        task_id: BITKIMARK_SITEMAP_TASK_ID,
        source_id: sourceId,
        included_sources: [
          sourceId,
        ],
        reference_date: formatLocalReferenceDate(resolvedAt),
        resolved_at: resolvedAt.toISOString(),
        reusable_configuration: reusableConfiguration,
        resolved_configuration: resolvedConfiguration,
      };
    }

    if (
      sourceId === 'google-trends'
    ) {
      if (
        config.task_id
          !== 'google-trends-interest-over-time'
        || config.date_policy
          !== 'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY'
      ) {
        return null;
      }

      const selectedQueryGroups =
        (
          this.dependencies
            .google_trends_query_groups
          ?? []
        ).map(
          (group) => ({
            query_group_id:
              group.query_group_id,
            query_group_name:
              group.query_group_name,
            queries: [
              ...group.queries,
            ],
          }),
        );

      if (
        selectedQueryGroups.length === 0
      ) {
        return null;
      }


      const referenceDate =
        formatLocalReferenceDate(
          resolvedAt,
        );

      const range =
        resolveDesktopDatePolicy(
          'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
          referenceDate,
        );

      const reusableConfiguration =
        cloneConfiguration(
          draft.reusable_configuration,
        );

      const resolvedConfiguration =
        cloneConfiguration(
          draft.reusable_configuration,
        );

      const resolvedSources =
        asJsonObjectValue(
          resolvedConfiguration.sources,
        );

      const resolvedSource =
        asJsonObjectValue(
          resolvedSources[sourceId],
        );

      resolvedSources[sourceId] = {
        ...resolvedSource,
        requested_date_start:
          range.requested_date_start,
        requested_date_end:
          range.requested_date_end,
        query_groups:
          selectedQueryGroups,
      };

      Object.assign(
        resolvedConfiguration,
        {
          config_version:
            1,
          source_id:
            sourceId,
          source_mode:
            'GOOGLE_TRENDS_UI',
          country_code:
            'TR',
          language_code:
            null,
          requested_date_start:
            range.requested_date_start,
          requested_date_end:
            range.requested_date_end,
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
            selectedQueryGroups,
          sources:
            resolvedSources,
        },
      );

      return {
        workspace_id:
          draft.workspace_id,
        task_id:
          'google-trends-interest-over-time',
        source_id:
          sourceId,
        included_sources: [
          sourceId,
        ],
        reference_date:
          range.reference_date,
        resolved_at:
          resolvedAt.toISOString(),
        reusable_configuration:
          reusableConfiguration,
        resolved_configuration:
          resolvedConfiguration,
      };
    }

    if (
      sourceId
        === 'google-search-console-query'
    ) {
      const taskId =
        config.task_id
          === 'gsc-query-current-previous-28-days'
          ? config.task_id
          : null;

      if (taskId === null) {
        return null;
      }


      const referenceDate =
        formatLocalReferenceDate(
          resolvedAt,
        );

      const currentRange =
        resolveDesktopDatePolicy(
          'TODAY_MINUS_28_TO_YESTERDAY',
          referenceDate,
        );

      const previousRange =
        resolveDesktopDatePolicy(
          'TODAY_MINUS_56_TO_TODAY_MINUS_29',
          referenceDate,
        );

      const reusableConfiguration =
        cloneConfiguration(
          draft.reusable_configuration,
        );

      const resolvedConfiguration =
        cloneConfiguration(
          draft.reusable_configuration,
        );

      const resolvedSources =
        asJsonObjectValue(
          resolvedConfiguration.sources,
        );

      const resolvedSource =
        asJsonObjectValue(
          resolvedSources[sourceId],
        );

      resolvedSources[sourceId] = {
        ...resolvedSource,
        date_ranges: [
          {
            job_key:
              'gsc-query-current-28',
            task_id:
              taskId,
            period:
              'CURRENT_28_DAYS',
            requested_date_start:
              currentRange.requested_date_start,
            requested_date_end:
              currentRange.requested_date_end,
          },
          {
            job_key:
              'gsc-query-previous-28',
            task_id:
              taskId,
            period:
              'PREVIOUS_28_DAYS',
            requested_date_start:
              previousRange.requested_date_start,
            requested_date_end:
              previousRange.requested_date_end,
          },
        ],
      };

      resolvedConfiguration.sources =
        resolvedSources;

      return {
        workspace_id:
          draft.workspace_id,
        task_id:
          taskId,
        source_id:
          sourceId,
        included_sources: [
          sourceId,
        ],
        reference_date:
          referenceDate,
        resolved_at:
          resolvedAt.toISOString(),
        reusable_configuration:
          reusableConfiguration,
        resolved_configuration:
          resolvedConfiguration,
      };
    }

    if (
      sourceId
        !== 'google-search-console-query-page'
    ) {
      return null;
    }

    const taskId =
      (
        config.task_id
          === 'gsc-current-90-days'
        || config.task_id
          === 'gsc-long-16-months'
        || config.task_id
          === 'gsc-query-page-current-7-days'
        || config.task_id
          === 'gsc-query-page-current-14-days'
        || config.task_id
          === 'gsc-query-page-current-28-days'
        || config.task_id
          === 'gsc-query-page-current-30-days'
      )
        ? config.task_id
        : null;

    const datePolicy =
      (
        config.date_policy
          === 'TODAY_MINUS_90_TO_YESTERDAY'
        || config.date_policy
          === 'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY'
        || config.date_policy
          === 'TODAY_MINUS_7_TO_YESTERDAY'
        || config.date_policy
          === 'TODAY_MINUS_14_TO_YESTERDAY'
        || config.date_policy
          === 'TODAY_MINUS_28_TO_YESTERDAY'
        || config.date_policy
          === 'TODAY_MINUS_30_TO_YESTERDAY'
      )
        ? config.date_policy
        : null;

    if (
      taskId === null
      || datePolicy === null
    ) {
      return null;
    }

    const taskMatchesPolicy =
      (
        taskId
          === 'gsc-current-90-days'
        && datePolicy
          === 'TODAY_MINUS_90_TO_YESTERDAY'
      )
      || (
        taskId
          === 'gsc-long-16-months'
        && datePolicy
          === 'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY'
      )
      || (
        taskId
          === 'gsc-query-page-current-7-days'
        && datePolicy
          === 'TODAY_MINUS_7_TO_YESTERDAY'
      )
      || (
        taskId
          === 'gsc-query-page-current-14-days'
        && datePolicy
          === 'TODAY_MINUS_14_TO_YESTERDAY'
      )
      || (
        taskId
          === 'gsc-query-page-current-28-days'
        && datePolicy
          === 'TODAY_MINUS_28_TO_YESTERDAY'
      )
      || (
        taskId
          === 'gsc-query-page-current-30-days'
        && datePolicy
          === 'TODAY_MINUS_30_TO_YESTERDAY'
      );

    if (!taskMatchesPolicy) {
      return null;
    }


    const referenceDate =
      formatLocalReferenceDate(
        resolvedAt,
      );

    const range =
      resolveDesktopDatePolicy(
        datePolicy,
        referenceDate,
      );

    const reusableConfiguration =
      cloneConfiguration(
        draft.reusable_configuration,
      );

    const resolvedConfiguration =
      cloneConfiguration(
        draft.reusable_configuration,
      );

    const resolvedSources =
      asJsonObjectValue(
        resolvedConfiguration.sources,
      );

    const resolvedSource =
      asJsonObjectValue(
        resolvedSources[sourceId],
      );

    resolvedSources[sourceId] = {
      ...resolvedSource,
      date_ranges: [
        {
          job_key:
            taskId,
          task_id:
            taskId,
          requested_date_start:
            range.requested_date_start,
          requested_date_end:
            range.requested_date_end,
        },
      ],
    };

    resolvedConfiguration.sources =
      resolvedSources;

    return {
      workspace_id:
        draft.workspace_id,
      task_id:
        taskId,
      source_id:
        sourceId,
      included_sources: [
        sourceId,
      ],
      reference_date:
        range.reference_date,
      resolved_at:
        resolvedAt.toISOString(),
      reusable_configuration:
        reusableConfiguration,
      resolved_configuration:
        resolvedConfiguration,
    };
  }

  private buildPlans(configuration: ReusableCollectionConfiguration, sourceIds: readonly string[]): JobPlan[] {
    return sourceIds.flatMap((sourceId) => this.planner(sourceId, sourceConfig(configuration, sourceId)));
  }

  private readinessPresentation(
    sourceId: string,
    readinessStatus: DesktopReadinessStatus,
  ): Pick<
    DesktopSourceCard,
    'readiness_reason' | 'readiness_remediation'
  > {
    if (
      sourceId === 'ikas-products'
      && readinessStatus === 'FILE_REQUIRED'
    ) {
      return {
        readiness_reason:
          'A Products XLSX file is required before this task can be reviewed.',
        readiness_remediation: {
          kind: 'SELECT_FILE',
          label: 'Select Products XLSX',
        },
      };
    }

    if (
      sourceId === 'google-keyword-planner-csv'
      && readinessStatus === 'FILE_REQUIRED'
    ) {
      return {
        readiness_reason:
          'A Keyword Stats CSV file is required before this task can be reviewed.',
        readiness_remediation: {
          kind: 'SELECT_FILE',
          label: 'Select Keyword Stats CSV',
        },
      };
    }

    if (readinessStatus === 'CONNECTION_REQUIRED') {
      return {
        readiness_reason:
          'A Workspace connection is required before this task can be reviewed.',
        readiness_remediation: {
          kind: 'CONNECT_SOURCE',
          label: 'Manage Connection',
        },
      };
    }

    if (readinessStatus === 'CONFIGURATION_REQUIRED') {
      return {
        readiness_reason:
          'Source configuration is required before this task can be reviewed.',
        readiness_remediation: {
          kind: 'CONFIGURE_SOURCE',
          label: 'Configure Source',
        },
      };
    }

    if (readinessStatus === 'MANUAL_ACTION_REQUIRED') {
      return {
        readiness_reason:
          'Manual action is required before this task can be reviewed.',
        readiness_remediation: {
          kind: 'MANUAL_ACTION',
          label: 'Review Required Action',
        },
      };
    }

    return {
      readiness_reason: null,
      readiness_remediation: null,
    };
  }
  private buildCards(
    workspaceId: string,
    configuration: ReusableCollectionConfiguration,
    statuses: readonly { source_id: string; readiness_status: DesktopReadinessStatus }[],
  ): DesktopSourceCard[] {
    const statusBySource = new Map(statuses.map((status) => [status.source_id, status.readiness_status]));
    return this.sourceOrder.map((sourceId) => {
      const config = sourceConfig(configuration, sourceId);
      const readinessStatus =
        statusBySource.get(sourceId)
        ?? 'CONFIGURATION_REQUIRED';
      const freshness = this.dependencies.freshness?.getFreshness(
        workspaceId,
        sourceId,
        config,
      ) ?? {
        freshness_status:
          sourceId === 'serpapi'
            ? 'ON_DEMAND' as const
            : sourceId === 'ikas-products' || sourceId === 'google-keyword-planner-csv'
              ? 'IMPORT_NEEDED' as const
              : 'UNKNOWN' as const,
        last_successful_at: null as string | null,
        next_due_at: null as string | null,
      };
      return {
        source_id: sourceId,
        source_name: this.sourceNames[sourceId] ?? sourceId,
        included: included(configuration, sourceId),
        readiness_status: readinessStatus,
        ...this.readinessPresentation(
          sourceId,
          readinessStatus,
        ),
        freshness_status: freshness.freshness_status,
        last_successful_at: freshness.last_successful_at,
        next_due_at: freshness.next_due_at,
        configuration_summary: this.summary(config),
      };
    });
  }

  private summary(config: Record<string, unknown>): string {
    const keys = Object.keys(config).filter((key) => key !== 'included').slice(0, 3);
    return keys.length === 0 ? 'Yapılandırılmadı' : keys.map((key) => `${key}: ${String(config[key])}`).join(' · ');
  }
}
