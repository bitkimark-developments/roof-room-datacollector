import type {
  ReusableCollectionConfiguration,
  RunDraftOrigin,
} from '../../shared/collection-configuration';
import type {
  JobPlan,
  JsonObject,
} from '../../shared/run-job';
import type {
  DesktopMultiSourceRepository,
  DesktopReadinessStatus,
  DesktopReview,
  DesktopRunDraft,
  DesktopRunState,
  DesktopSourceCard,
  DesktopWorkspaceView,
} from '../../shared/desktop-multisource';
import {
  SUPPORTED_DESKTOP_SOURCE_IDS,
} from '../../shared/desktop-multisource';
import { buildDataPackage, writeDataPackage } from '../export/data-package-exporter';
import type { DataPackage, DataPackageMode } from '../../shared/data-package';
import { ResumePlanner } from '../core/resume-planner';
import { ReconciliationCoordinator } from '../core/reconciliation-coordinator';
import { RetryPolicy } from '../core/retry-policy';

export interface DesktopReadinessReader {
  getReadiness(workspace_id: string, source_id: string): Promise<{ readiness_status: DesktopReadinessStatus }>;
}

export interface DesktopMultiSourceControllerDependencies {
  repository: DesktopMultiSourceRepository;
  readiness: DesktopReadinessReader;
  application_version: string;
  source_order?: readonly string[];
  source_names?: Record<string, string>;
  job_planner?: (source_id: string, source_config: Record<string, unknown>) => JobPlan[];
  now?: () => Date;
  execute_run?: (run_id: string) => Promise<void>;
  package_directory?: string;
  load_datasets?: (run_id: string) => Promise<Parameters<typeof buildDataPackage>[0]['datasets']>;
}

const asObject = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
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

const productionPlanner = (sourceId: string, config: Record<string, unknown>): JobPlan[] => {
  const plans = (items: unknown[], key: (item: Record<string, unknown>, index: number) => string): JobPlan[] => items.map((item, index) => {
    const value = asObject(item);
    return { source_id: sourceId, job_key: key(value, index), query_group_id: sourceId === 'google-trends' ? key(value, index) : null, source_context: value as JsonObject };
  });
  if (sourceId === 'google-trends') return plans(Array.isArray(config.query_groups) ? config.query_groups : [], (item, index) => typeof item.query_group_id === 'string' ? item.query_group_id : `group-${index + 1}`);
  if (sourceId === 'google-search-console-query-page') return plans(Array.isArray(config.date_ranges) ? config.date_ranges : [], (item, index) => typeof item.job_key === 'string' ? item.job_key : `gsc-${index + 1}`);
  if (sourceId === 'serpapi') return plans(Array.isArray(config.queries) ? config.queries : [], (item, index) => typeof item.query === 'string' ? item.query : `query-${index + 1}`);
  if (sourceId === 'google-keyword-planner') return plans(Array.isArray(config.groups) ? config.groups : [], (item, index) => typeof item.group_id === 'string' ? item.group_id : `keyword-group-${index + 1}`);
  if (sourceId === 'google-ads-search-terms') return plans(Array.isArray(config.jobs) ? config.jobs : [{}], (_item, index) => `search-terms-${index + 1}`);
  if (sourceId === 'ikas-products') return config.file_path ? plans([config], () => 'ikas-products-current') : [];
  if (sourceId === 'bitkimark-sitemap') return config.sitemap_url ? plans([config], () => 'bitkimark-sitemap-current') : [];
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

  setReadinessEvaluator(evaluator: (workspace_id: string, source_id: string) => Promise<{ readiness_status: DesktopReadinessStatus }>): void {
    this.readinessEvaluator = { getReadiness: evaluator };
  }

  listWorkspaces() {
    return this.dependencies.repository.listWorkspaces();
  }

  getWorkspaceView(selected_workspace_id: string | null = null): DesktopWorkspaceView {
    const selected = selected_workspace_id ?? this.listWorkspaces()[0]?.workspace_id ?? null;
    return {
      workspaces: this.listWorkspaces(),
      selected_workspace_id: selected,
      connections: selected
        ? this.dependencies.repository.listSourceConnections(selected).map((connection) => ({ source_id: connection.source_id, configured: connection.credential_ref !== null }))
        : [],
    };
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
      source_cards: this.buildCards(configuration, this.sourceOrder.map((source_id) => ({ source_id, readiness_status: 'CONFIGURATION_REQUIRED' })) as never),
    };
  }

  async reviewDraft(draft: DesktopRunDraft): Promise<DesktopReview> {
    const workspace = this.dependencies.repository.getWorkspace(draft.workspace_id);
    if (!workspace) throw new Error(`Unknown Workspace: ${draft.workspace_id}`);
    const statuses = await Promise.all(this.sourceOrder.map(async (source_id) => ({
      source_id,
      readiness_status: included(draft.reusable_configuration, source_id)
        ? (await this.readinessEvaluator.getReadiness(draft.workspace_id, source_id)).readiness_status
        : 'READY' as DesktopReadinessStatus,
    })));
    const cards = this.buildCards(draft.reusable_configuration, statuses);
    const includedSources = cards.filter((card) => card.included).map((card) => card.source_id);
    const blockingSources = cards.filter((card) => card.included && card.readiness_status !== 'READY').map((card) => card.source_id);
    const plans = this.buildPlans(draft.reusable_configuration, includedSources);
    return { workspace, origin: draft.origin, included_sources: includedSources, source_cards: cards, job_count: plans.length, can_start: blockingSources.length === 0 && plans.length > 0, blocking_sources: blockingSources };
  }

  async startDraft(draft: DesktopRunDraft): Promise<DesktopRunState> {
    const review = await this.reviewDraft(draft);
    if (!review.can_start) throw new Error(`Run cannot start; included sources are not ready: ${review.blocking_sources.join(', ') || 'no source selected'}.`);
    const plans = this.buildPlans(draft.reusable_configuration, review.included_sources);
    const configurationSnapshot = { ...cloneConfiguration(draft.reusable_configuration), resolved_at: this.now().toISOString(), workspace_id: draft.workspace_id };
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
    };
  }

  getRunState(run_id: string): DesktopRunState {
    const run = this.dependencies.repository.getRun(run_id);
    if (!run) throw new Error(`Unknown Run: ${run_id}`);
    const jobs = this.dependencies.repository.listJobs(run_id);
    return { run, jobs, completed_jobs: jobs.filter((job) => job.execution_status === 'COMPLETED').length, failed_jobs: jobs.filter((job) => job.execution_status === 'FAILED').length };
  }

  async retryFailed(run_id: string): Promise<DesktopRunState> {
    const run = this.dependencies.repository.getRun(run_id);
    if (!run) throw new Error(`Unknown Run: ${run_id}`);
    const plan = new ResumePlanner(this.dependencies.repository as never).planRun(run.workspace_id, run_id);
    if (!plan) throw new Error(`Run ${run_id} is not retryable in its Workspace.`);
    const coordinator = new ReconciliationCoordinator(this.dependencies.repository as never, new RetryPolicy({ max_attempts: 2 }));
    for (const jobPlan of plan.jobs) {
      if (jobPlan.action === 'RETRY_CANDIDATE') coordinator.apply(jobPlan);
    }
    if (this.dependencies.execute_run) {
      void this.dependencies.execute_run(run_id).catch(() => {
        // Core persistence remains authoritative; renderer reads persisted state.
      });
    }
    return this.getRunState(run_id);
  }

  buildPackage(run_id: string, mode: DataPackageMode, datasets: Parameters<typeof buildDataPackage>[0]['datasets']): DataPackage {
    const state = this.getRunState(run_id);
    return buildDataPackage({ run: state.run, jobs: state.jobs, datasets, mode });
  }

  async exportRun(run_id: string, mode: DataPackageMode): Promise<{ export_directory: string; dataset_count: number; failed_count: number }> {
    if (!this.dependencies.package_directory) throw new Error('Data Package export is unavailable.');
    const datasets = this.dependencies.load_datasets ? await this.dependencies.load_datasets(run_id) : [];
    const dataPackage = this.buildPackage(run_id, mode, datasets);
    const directory = `${this.dependencies.package_directory}/${run_id}/exports/${mode.toLowerCase()}`;
    await writeDataPackage(directory, dataPackage);
    return { export_directory: directory, dataset_count: dataPackage.datasets.length, failed_count: dataPackage.failures.length };
  }

  private buildPlans(configuration: ReusableCollectionConfiguration, sourceIds: readonly string[]): JobPlan[] {
    return sourceIds.flatMap((sourceId) => this.planner(sourceId, sourceConfig(configuration, sourceId)));
  }

  private buildCards(configuration: ReusableCollectionConfiguration, statuses: readonly { source_id: string; readiness_status: DesktopReadinessStatus }[]): DesktopSourceCard[] {
    const statusBySource = new Map(statuses.map((status) => [status.source_id, status.readiness_status]));
    return this.sourceOrder.map((sourceId) => ({ source_id: sourceId, source_name: this.sourceNames[sourceId] ?? sourceId, included: included(configuration, sourceId), readiness_status: statusBySource.get(sourceId) ?? 'CONFIGURATION_REQUIRED', configuration_summary: this.summary(sourceConfig(configuration, sourceId)) }));
  }

  private summary(config: Record<string, unknown>): string {
    const keys = Object.keys(config).filter((key) => key !== 'included').slice(0, 3);
    return keys.length === 0 ? 'Yapılandırılmadı' : keys.map((key) => `${key}: ${String(config[key])}`).join(' · ');
  }
}
