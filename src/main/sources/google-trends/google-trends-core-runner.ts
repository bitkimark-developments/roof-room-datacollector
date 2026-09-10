import type {
  ArtifactRecord,
} from '../../../shared/artifact';
import type {
  AttemptRecord,
} from '../../../shared/attempt';
import type {
  CollectingDataSourceModule,
  CollectionValidator,
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../../shared/collection';
import type {
  OrchestrationRunResult,
} from '../../../shared/orchestration';
import type {
  QueryConfig,
} from '../../../shared/query-config';
import type {
  JobRecord,
  RequestedCollectionConfiguration,
  RunRecord,
} from '../../../shared/run-job';
import type {
  SourceCapabilities,
  SourceReadinessContext,
  SourceReadinessResult,
} from '../../../shared/source';
import type {
  ApplicationDirectories,
} from '../../../shared/bootstrap-status';
import type {
  StructuredLogSink,
} from '../../../shared/logging';
import type {
  ValidationSummaryRecord,
} from '../../../shared/validation-summary';

import {
  CollectionOrchestrator,
} from '../../core/collection-orchestrator';
import {
  CollectionValidatorRegistry,
} from '../../core/collection-validator-registry';
import {
  ReconciliationCoordinator,
} from '../../core/reconciliation-coordinator';
import {
  ResumePlanner,
} from '../../core/resume-planner';
import {
  RetryPolicy,
} from '../../core/retry-policy';
import {
  RunManager,
} from '../../core/run-manager';
import {
  SourceRegistry,
} from '../../core/source-registry';
import {
  StructuredLogger,
} from '../../logging/structured-logger';
import {
  getDatabasePath,
  initializeDatabase,
} from '../../storage/database';
import {
  StateRepository,
} from '../../storage/state-repository';
import {
  StorageManager,
} from '../../storage/storage-manager';

import {
  GoogleTrendsCollectionValidator,
} from './google-trends-collection-validator';

const GOOGLE_TRENDS_SOURCE_ID =
  'google-trends';

const createGoogleTrendsValidatorRegistry = (
  validator: CollectionValidator,
): CollectionValidatorRegistry => {
  const validators =
    new CollectionValidatorRegistry();

  validators.register(
    GOOGLE_TRENDS_SOURCE_ID,
    validator,
  );

  return validators;
};

export interface RunGoogleTrendsThroughCoreInput {
  directories:
    ApplicationDirectories;
  workspace_id: string;
  query_config:
    QueryConfig;
  requested_configuration:
    RequestedCollectionConfiguration;
  application_version: string;
  source:
    CollectingDataSourceModule;
  validator?:
    CollectionValidator;
  logger?:
    StructuredLogSink | null;
  hooks?:
    GoogleTrendsCoreRunHooks;
}

export interface GoogleTrendsCoreRunHooks {
  on_run_available?: (
    run: RunRecord,
  ) => void;
  on_collection_started?: (
    context:
      SourceCollectionContext,
  ) => void;
  on_collection_result?: (
    context:
      SourceCollectionContext,
    result:
      SourceCollectionResult,
  ) => void;
}

export interface ResumeGoogleTrendsThroughCoreInput {
  directories:
    ApplicationDirectories;
  run_id: string;
  source:
    CollectingDataSourceModule;
  retry_failed: boolean;
  max_attempts?: number;
  validator?:
    CollectionValidator;
  logger?:
    StructuredLogSink | null;
  hooks?:
    GoogleTrendsCoreRunHooks;
}

export interface GoogleTrendsCoreRunResult {
  run: RunRecord;
  job: JobRecord;
  attempt:
    AttemptRecord | null;
  artifact:
    ArtifactRecord | null;
  validation:
    ValidationSummaryRecord | null;
  orchestration:
    OrchestrationRunResult;
  source_result:
    SourceCollectionResult | null;
}

export interface GoogleTrendsCoreJobResult {
  job: JobRecord;
  attempt:
    AttemptRecord | null;
  artifact:
    ArtifactRecord | null;
  validation:
    ValidationSummaryRecord | null;
  source_result:
    SourceCollectionResult | null;
}

export interface GoogleTrendsCoreBatchRunResult {
  run: RunRecord;
  jobs:
    GoogleTrendsCoreJobResult[];
  orchestration:
    OrchestrationRunResult;
}

class ObservedCollectingSource
  implements CollectingDataSourceModule
{
  private readonly resultsByJobId =
    new Map<
      string,
      SourceCollectionResult
    >();

  constructor(
    private readonly source:
      CollectingDataSourceModule,
    private readonly hooks:
      GoogleTrendsCoreRunHooks = {},
  ) {}

  get id(): string {
    return this.source.id;
  }

  get name(): string {
    return this.source.name;
  }

  get sourceMode(): string {
    return this.source.sourceMode;
  }

  get datasetTypes(): readonly string[] {
    return this.source.datasetTypes;
  }

  getCapabilities(): SourceCapabilities {
    return this.source.getCapabilities();
  }

  checkReadiness(
    context: SourceReadinessContext,
  ): Promise<SourceReadinessResult> {
    return this.source.checkReadiness(
      context,
    );
  }

  async collect(
    context: SourceCollectionContext,
  ): Promise<SourceCollectionResult> {
    this.notify(
      () =>
        this.hooks
          .on_collection_started?.(
            context,
          ),
    );

    const result =
      await this.source.collect(
        context,
      );

    this.resultsByJobId.set(
      context.job_id,
      result,
    );

    this.notify(
      () =>
        this.hooks
          .on_collection_result?.(
            context,
            result,
          ),
    );

    return result;
  }

  resultForJob(
    jobId: string,
  ): SourceCollectionResult | null {
    return (
      this.resultsByJobId.get(
        jobId,
      ) ?? null
    );
  }

  private notify(
    callback: () => void,
  ): void {
    try {
      callback();
    } catch {
      // Desktop progress observers must never alter collection state.
    }
  }
}

const requireGoogleTrendsIdentity = (
  queryConfig: QueryConfig,
  source:
    CollectingDataSourceModule,
): void => {
  if (
    queryConfig.source_id !==
      GOOGLE_TRENDS_SOURCE_ID ||
    source.id !==
      GOOGLE_TRENDS_SOURCE_ID
  ) {
    throw new Error(
      'Google Trends Core runner requires matching google-trends source identity.',
    );
  }

  if (queryConfig.groups.length < 1) {
    throw new Error(
      'Google Trends Core runner requires at least one query group.',
    );
  }
};

const requireSingleGt01Config = (
  queryConfig: QueryConfig,
  source:
    CollectingDataSourceModule,
): void => {
  requireGoogleTrendsIdentity(
    queryConfig,
    source,
  );

  if (
    queryConfig.groups.length !== 1 ||
    queryConfig.groups[0]
      .query_group_id !== 'GT01'
  ) {
    throw new Error(
      'Single Google Trends Core runner requires exactly one GT01 group.',
    );
  }
};

const requireApplicationVersion = (
  value: string,
): string => {
  if (value.trim().length === 0) {
    throw new Error(
      'application_version must be non-empty.',
    );
  }

  return value;
};

const notifyRunAvailable = (
  hooks:
    GoogleTrendsCoreRunHooks | undefined,
  run: RunRecord,
): void => {
  try {
    hooks?.on_run_available?.(
      run,
    );
  } catch {
    // Desktop progress observers must never alter persisted run state.
  }
};

const snapshotJobs = (
  repository:
    StateRepository,
  jobs:
    readonly JobRecord[],
  observedSource:
    ObservedCollectingSource,
): GoogleTrendsCoreJobResult[] =>
  jobs.map(
    (job) => {
      const attempts =
        repository.listAttempts(
          job.job_id,
        );

      const artifacts =
        repository.listArtifacts(
          job.job_id,
        );

      const validations =
        repository.listValidationSummaries(
          job.job_id,
        );

      return {
        job,
        attempt:
          attempts.at(-1) ??
          null,
        artifact:
          artifacts.at(-1) ??
          null,
        validation:
          validations.at(-1) ??
          null,
        source_result:
          observedSource
            .resultForJob(
              job.job_id,
            ),
      };
    },
  );

export const runGoogleTrendsBatchThroughCore =
  async (
    input:
      RunGoogleTrendsThroughCoreInput,
  ): Promise<GoogleTrendsCoreBatchRunResult> => {
    requireGoogleTrendsIdentity(
      input.query_config,
      input.source,
    );

    const applicationVersion =
      requireApplicationVersion(
        input.application_version,
      );

    const bootstrap =
      initializeDatabase(
        input.directories,
      );

    if (
      bootstrap.status !==
        'READY'
    ) {
      throw new Error(
        `Google Trends Core database initialization failed: ${bootstrap.error}`,
      );
    }

    const repository =
      new StateRepository(
        getDatabasePath(
          input.directories,
        ),
      );

    try {
      const observedSource =
        new ObservedCollectingSource(
          input.source,
          input.hooks,
        );

      const registry =
        new SourceRegistry();

      registry.register(
        observedSource,
      );

      const created =
        repository.createRunFromQueryConfig({
          workspace_id:
            input.workspace_id,
          query_config:
            input.query_config,
          application_version:
            applicationVersion,
          requested_configuration:
            input.requested_configuration,
        });

      notifyRunAvailable(
        input.hooks,
        created.run,
      );

      if (
        created.jobs.length !==
        input.query_config.groups.length
      ) {
        throw new Error(
          `Google Trends Core run created ${created.jobs.length} jobs; expected ${input.query_config.groups.length}.`,
        );
      }

      const runManager =
        new RunManager(
          repository,
        );

      const orchestrator =
        new CollectionOrchestrator(
          repository,
          new StorageManager(
            input.directories,
          ),
          registry,
          createGoogleTrendsValidatorRegistry(
            input.validator ??
              new GoogleTrendsCollectionValidator(),
          ),
          runManager,
          undefined,
          input.logger === undefined
            ? new StructuredLogger(
                input.directories,
              )
            : input.logger,
        );

      const orchestration =
        await orchestrator.runUntilBlocked(
          created.run.run_id,
        );

      const run =
        repository.getRun(
          created.run.run_id,
        );

      const jobs =
        repository.listJobs(
          created.run.run_id,
        );

      if (
        run === null ||
        jobs.length !==
          input.query_config.groups.length
      ) {
        throw new Error(
          'Google Trends Core run state disappeared after orchestration.',
        );
      }

      return {
        run,
        jobs:
          snapshotJobs(
            repository,
            jobs,
            observedSource,
          ),
        orchestration,
      };
    } finally {
      repository.close();
    }
  };

export const resumeGoogleTrendsThroughCore =
  async (
    input:
      ResumeGoogleTrendsThroughCoreInput,
  ): Promise<GoogleTrendsCoreBatchRunResult> => {
    if (
      input.source.id !==
      GOOGLE_TRENDS_SOURCE_ID
    ) {
      throw new Error(
        'Google Trends resume runner requires google-trends source identity.',
      );
    }

    const bootstrap =
      initializeDatabase(
        input.directories,
      );

    if (
      bootstrap.status !==
      'READY'
    ) {
      throw new Error(
        `Google Trends Core database initialization failed: ${bootstrap.error}`,
      );
    }

    const repository =
      new StateRepository(
        getDatabasePath(
          input.directories,
        ),
      );

    try {
      const planner =
        new ResumePlanner(
          repository,
        );

      const persistedRun = repository.getRun(
        input.run_id,
      );

      if (persistedRun === null) {
        throw new Error(
          `Google Trends run is not available for resume: ${input.run_id}`,
        );
      }

      const plan =
        planner.planRun(
          persistedRun.workspace_id,
          input.run_id,
        );

      if (plan === null) {
        throw new Error(
          `Google Trends run is not available for resume: ${input.run_id}`,
        );
      }

      notifyRunAvailable(
        input.hooks,
        plan.run,
      );

      const observedSource =
        new ObservedCollectingSource(
          input.source,
          input.hooks,
        );

      const registry =
        new SourceRegistry();

      registry.register(
        observedSource,
      );

      const runManager =
        new RunManager(
          repository,
        );

      const orchestrator =
        new CollectionOrchestrator(
          repository,
          new StorageManager(
            input.directories,
          ),
          registry,
          createGoogleTrendsValidatorRegistry(
            input.validator ??
              new GoogleTrendsCollectionValidator(),
          ),
          runManager,
          undefined,
          input.logger === undefined
            ? new StructuredLogger(
                input.directories,
              )
            : input.logger,
        );

      const reconciliation =
        new ReconciliationCoordinator(
          repository,
          new RetryPolicy({
            max_attempts:
              input.max_attempts ??
              2,
          }),
        );

      const prefixSteps:
        OrchestrationRunResult['steps'] =
        [];

      if (input.retry_failed) {
        const retryCandidate =
          plan.jobs.find(
            (jobPlan) =>
              jobPlan.action ===
              'RETRY_CANDIDATE',
          );

        if (retryCandidate === undefined) {
          throw new Error(
            `Google Trends run has no retry candidate: ${input.run_id}`,
          );
        }

        const retry =
          reconciliation.apply(
            retryCandidate,
          );

        if (
          retry.outcome !==
            'RETRY_STARTED' ||
          retry.attempt === null
        ) {
          throw new Error(
            `Google Trends retry could not start: ${retry.outcome}`,
          );
        }

        prefixSteps.push(
          await orchestrator
            .executeStartedAttempt(
              input.run_id,
              retryCandidate
                .job.job_id,
              retry.attempt,
            ),
        );
      } else {
        for (const jobPlan of
          plan.jobs) {
          if (
            jobPlan.action ===
            'RECONCILE_REQUIRED'
          ) {
            reconciliation.apply(
              jobPlan,
            );
          }
        }

        const manualJob =
          plan.jobs.find(
            (jobPlan) =>
              jobPlan.action ===
              'BLOCKED_MANUAL_ACTION',
          );

        if (manualJob !== undefined) {
          repository.transitionJobExecution(
            manualJob.job.job_id,
            'RUNNING',
          );

          runManager.refreshRunStatus(
            input.run_id,
          );

          const continuedAttempt =
            repository
              .listAttempts(
                manualJob.job.job_id,
              )
              .at(-1);

          if (
            continuedAttempt ===
              undefined ||
            continuedAttempt
              .execution_status !==
              'RUNNING'
          ) {
            throw new Error(
              `Google Trends manual-action continuation has no active attempt: ${manualJob.job.job_id}`,
            );
          }

          prefixSteps.push(
            await orchestrator
              .executeStartedAttempt(
                input.run_id,
                manualJob.job
                  .job_id,
                continuedAttempt,
              ),
          );
        }
      }

      const resumed =
        await orchestrator
          .runUntilBlocked(
            input.run_id,
          );

      const run =
        repository.getRun(
          input.run_id,
        );
      const jobs =
        repository.listJobs(
          input.run_id,
        );

      if (
        run === null ||
        jobs.length === 0
      ) {
        throw new Error(
          'Google Trends resumed Core state disappeared after orchestration.',
        );
      }

      return {
        run,
        jobs:
          snapshotJobs(
            repository,
            jobs,
            observedSource,
          ),
        orchestration: {
          steps: [
            ...prefixSteps,
            ...resumed.steps,
          ],
          stopped_because:
            resumed.stopped_because,
        },
      };
    } finally {
      repository.close();
    }
  };

export const runGoogleTrendsThroughCore =
  async (
    input:
      RunGoogleTrendsThroughCoreInput,
  ): Promise<GoogleTrendsCoreRunResult> => {
    requireSingleGt01Config(
      input.query_config,
      input.source,
    );

    const batch =
      await runGoogleTrendsBatchThroughCore(
        input,
      );

    const onlyJob =
      batch.jobs[0];

    if (
      onlyJob === undefined ||
      batch.jobs.length !== 1
    ) {
      throw new Error(
        'Single Google Trends Core run did not return exactly one job result.',
      );
    }

    return {
      run:
        batch.run,
      job:
        onlyJob.job,
      attempt:
        onlyJob.attempt,
      artifact:
        onlyJob.artifact,
      validation:
        onlyJob.validation,
      orchestration:
        batch.orchestration,
      source_result:
        onlyJob.source_result,
    };
  };
