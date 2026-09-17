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
  DesktopWorkspaceView,
} from '../../shared/desktop-multisource';
import {
  SUPPORTED_DESKTOP_SOURCE_IDS,
} from '../../shared/desktop-multisource';
import {
  formatLocalReferenceDate,
  resolveDesktopDatePolicy,
} from '../../shared/desktop-run-resolution';
import { buildDataPackage, writeDataPackage } from '../export/data-package-exporter';
import type { DataPackage, DataPackageMode } from '../../shared/data-package';
import { ResumePlanner } from '../core/resume-planner';
import { ReconciliationCoordinator } from '../core/reconciliation-coordinator';
import { RetryPolicy } from '../core/retry-policy';
import { RunManager } from '../core/run-manager';
import {
  isTerminalRunStatus,
} from '../core/run-execution-state-machine';

export interface DesktopReadinessReader {
  getReadiness(
    workspace_id: string,
    source_id: string,
    source_config?: Record<string, unknown>,
  ): Promise<{ readiness_status: DesktopReadinessStatus }>;
}

export interface DesktopMultiSourceControllerDependencies {
  repository: DesktopMultiSourceRepository;
  readiness: DesktopReadinessReader;
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

const productionPlanner = (sourceId: string, config: Record<string, unknown>): JobPlan[] => {
  const plans = (items: unknown[], key: (item: Record<string, unknown>, index: number) => string): JobPlan[] => items.map((item, index) => {
    const value = asObject(item);
    return { source_id: sourceId, job_key: key(value, index), query_group_id: sourceId === 'google-trends' ? key(value, index) : null, source_context: value as JsonObject };
  });
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
    const cards = this.buildCards(draft.reusable_configuration, statuses);
    const includedSources = cards.filter((card) => card.included).map((card) => card.source_id);
    const blockingSources = cards.filter((card) => card.included && card.readiness_status !== 'READY').map((card) => card.source_id);
    const reviewedDraft =
      this.resolveReviewedDraft(
        draft,
      );

    const executionConfiguration =
      reviewedDraft
        ?.resolved_configuration
      ?? draft.reusable_configuration;

    const plans =
      this.buildPlans(
        executionConfiguration,
        includedSources,
      );

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
        blockingSources.length === 0
        && plans.length > 0,
      blocking_sources:
        blockingSources,
      reviewed_draft:
        reviewedDraft,
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
        reviewedDraft
          .resolved_configuration,
        statuses,
      );

    const includedSources =
      cards
        .filter(
          (card) =>
            card.included,
        )
        .map(
          (card) =>
            card.source_id,
        );

    const blockingSources =
      cards
        .filter(
          (card) =>
            card.included
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

    if (
      blockingSources.length > 0
      || plans.length === 0
    ) {
      throw new Error(
        `Run cannot start; included sources are not ready: ${blockingSources.join(', ') || 'no source selected'}.`,
      );
    }

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

    const configurationSnapshot:
      JsonObject = {
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
    const datasets = this.dependencies.load_datasets ? await this.dependencies.load_datasets(run_id) : [];
    const dataPackage = this.buildPackage(run_id, mode, datasets);
    const directory = `${this.dependencies.package_directory}/${run_id}/exports/${mode.toLowerCase()}`;
    await writeDataPackage(directory, dataPackage);
    return { export_directory: directory, dataset_count: dataPackage.datasets.length, failed_count: dataPackage.failures.length };
  }

  private resolveReviewedDraft(
    draft: DesktopRunDraft,
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

      const resolvedAt =
        this.now();

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
      )
        ? config.task_id
        : null;

    const datePolicy =
      (
        config.date_policy
          === 'TODAY_MINUS_90_TO_YESTERDAY'
        || config.date_policy
          === 'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY'
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
      );

    if (!taskMatchesPolicy) {
      return null;
    }

    const resolvedAt =
      this.now();

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

  private buildCards(configuration: ReusableCollectionConfiguration, statuses: readonly { source_id: string; readiness_status: DesktopReadinessStatus }[]): DesktopSourceCard[] {
    const statusBySource = new Map(statuses.map((status) => [status.source_id, status.readiness_status]));
    return this.sourceOrder.map((sourceId) => ({ source_id: sourceId, source_name: this.sourceNames[sourceId] ?? sourceId, included: included(configuration, sourceId), readiness_status: statusBySource.get(sourceId) ?? 'CONFIGURATION_REQUIRED', configuration_summary: this.summary(sourceConfig(configuration, sourceId)) }));
  }

  private summary(config: Record<string, unknown>): string {
    const keys = Object.keys(config).filter((key) => key !== 'included').slice(0, 3);
    return keys.length === 0 ? 'Yapılandırılmadı' : keys.map((key) => `${key}: ${String(config[key])}`).join(' · ');
  }
}
