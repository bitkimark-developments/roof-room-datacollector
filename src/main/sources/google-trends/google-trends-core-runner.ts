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

export interface RunGoogleTrendsThroughCoreInput {
  directories:
    ApplicationDirectories;
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

class ObservedCollectingSource
  implements CollectingDataSourceModule
{
  latest_result:
    SourceCollectionResult | null =
    null;

  constructor(
    private readonly source:
      CollectingDataSourceModule,
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
    const result =
      await this.source.collect(
        context,
      );

    this.latest_result =
      result;

    return result;
  }
}

const requireSingleGt01Config = (
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

  if (
    queryConfig.groups.length !== 1 ||
    queryConfig.groups[0]
      .query_group_id !== 'GT01'
  ) {
    throw new Error(
      'Google Trends Core runner is currently restricted to exactly one GT01 group.',
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

export const runGoogleTrendsThroughCore =
  async (
    input:
      RunGoogleTrendsThroughCoreInput,
  ): Promise<GoogleTrendsCoreRunResult> => {
    requireSingleGt01Config(
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
        );

      const registry =
        new SourceRegistry();

      registry.register(
        observedSource,
      );

      const created =
        repository.createRunFromQueryConfig({
          query_config:
            input.query_config,
          application_version:
            applicationVersion,
          requested_configuration:
            input.requested_configuration,
        });

      if (created.jobs.length !== 1) {
        throw new Error(
          `Google Trends Core run created ${created.jobs.length} jobs; expected exactly one.`,
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
          input.validator ??
            new GoogleTrendsCollectionValidator(),
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
        jobs.length !== 1
      ) {
        throw new Error(
          'Google Trends Core run state disappeared after orchestration.',
        );
      }

      const job =
        jobs[0];

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
        run,
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
        orchestration,
        source_result:
          observedSource.latest_result,
      };
    } finally {
      repository.close();
    }
  };
