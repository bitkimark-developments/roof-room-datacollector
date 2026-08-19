import type {
  CollectingDataSourceModule,
} from '../../shared/collection';
import type {
  DesktopRecoveryState,
} from '../../shared/collection-control';
import type {
  QueryConfig,
} from '../../shared/query-config';
import type {
  RequestedCollectionConfiguration,
} from '../../shared/run-job';
import type {
  ApplicationDirectories,
} from '../../shared/bootstrap-status';

import {
  ResumePlanner,
} from '../core/resume-planner';
import {
  RunManager,
} from '../core/run-manager';
import {
  getDatabasePath,
} from '../storage/database';
import {
  StateRepository,
} from '../storage/state-repository';
import {
  generateGoogleTrendsExport,
} from '../export/google-trends-export-manager';
import {
  resumeGoogleTrendsThroughCore,
  runGoogleTrendsBatchThroughCore,
} from '../sources/google-trends/google-trends-core-runner';

import {
  GoogleTrendsDesktopController,
} from './google-trends-desktop-controller';

const REQUESTED_DATE_START =
  '2024-08-18';

const REQUESTED_DATE_END =
  '2026-08-17';

export interface CreateGoogleTrendsDesktopControllerInput {
  directories:
    ApplicationDirectories;
  query_config:
    QueryConfig;
  source:
    CollectingDataSourceModule;
  application_version: string;
  close_browser: () =>
    Promise<void>;
}

const makeRequestedConfiguration =
  (): RequestedCollectionConfiguration => ({
    source_mode:
      'GOOGLE_TRENDS_UI',
    country_code:
      'TR',
    language_code:
      null,
    requested_date_start:
      REQUESTED_DATE_START,
    requested_date_end:
      REQUESTED_DATE_END,
    category_id:
      null,
    category_name:
      'All Categories',
    search_type:
      'Web Search',
    selection_type:
      'Search Term',
    dataset_type:
      'INTEREST_OVER_TIME',
  });

const selectQueryGroups = (
  queryConfig: QueryConfig,
  selectedGroupIds:
    readonly string[],
): QueryConfig => {
  const selected =
    new Set(
      selectedGroupIds,
    );
  const groups =
    queryConfig.groups.filter(
      (group) =>
        selected.has(
          group.query_group_id,
        ),
    );

  if (
    groups.length !==
    selected.size
  ) {
    const known =
      new Set(
        queryConfig.groups.map(
          (group) =>
            group.query_group_id,
        ),
      );
    const unknown =
      selectedGroupIds.filter(
        (groupId) =>
          !known.has(
            groupId,
          ),
      );

    throw new Error(
      `Unknown selected query group(s): ${unknown.join(', ')}`,
    );
  }

  if (groups.length < 1) {
    throw new Error(
      'At least one query group must be selected.',
    );
  }

  return {
    ...queryConfig,
    groups:
      groups.map(
        (group) => ({
          ...group,
          queries: [
            ...group.queries,
          ],
        }),
      ),
  };
};

const discoverRecovery = (
  directories:
    ApplicationDirectories,
): DesktopRecoveryState => {
  const repository =
    new StateRepository(
      getDatabasePath(
        directories,
      ),
    );

  try {
    const plans =
      new ResumePlanner(
        repository,
      ).discoverIncompleteRuns();

    const latest =
      plans.at(-1);

    if (latest === undefined) {
      return {
        run_id:
          null,
        can_resume:
          false,
        can_retry:
          false,
        manual_action_required:
          false,
      };
    }

    return {
      run_id:
        latest.run.run_id,
      can_resume:
        latest.jobs.some(
          (job) =>
            job.action ===
              'PENDING' ||
            job.action ===
              'RECONCILE_REQUIRED' ||
            job.action ===
              'BLOCKED_MANUAL_ACTION',
        ),
      can_retry:
        latest.jobs.some(
          (job) =>
            job.action ===
            'RETRY_CANDIDATE',
        ),
      manual_action_required:
        latest.jobs.some(
          (job) =>
            job.action ===
            'BLOCKED_MANUAL_ACTION',
        ),
    };
  } finally {
    repository.close();
  }
};

const cancelRun = async (
  directories:
    ApplicationDirectories,
  runId: string,
): Promise<void> => {
  const repository =
    new StateRepository(
      getDatabasePath(
        directories,
      ),
    );

  try {
    new RunManager(
      repository,
    ).cancelRun(
      runId,
    );
  } finally {
    repository.close();
  }
};

export const createGoogleTrendsDesktopController = (
  input:
    CreateGoogleTrendsDesktopControllerInput,
): GoogleTrendsDesktopController =>
  new GoogleTrendsDesktopController({
    total_groups:
      input.query_config
        .groups.length,
    query_group_ids:
      input.query_config
        .groups.map(
          (group) =>
            group.query_group_id,
        ),
    start_batch:
      (
        selectedGroupIds,
        hooks,
      ) =>
        runGoogleTrendsBatchThroughCore({
          directories:
            input.directories,
          query_config:
            selectQueryGroups(
              input.query_config,
              selectedGroupIds,
            ),
          requested_configuration:
            makeRequestedConfiguration(),
          application_version:
            input.application_version,
          source:
            input.source,
          hooks,
        }),
    resume_run:
      (
        runId,
        retryFailed,
        hooks,
      ) =>
        resumeGoogleTrendsThroughCore({
          directories:
            input.directories,
          run_id:
            runId,
          source:
            input.source,
          retry_failed:
            retryFailed,
          max_attempts:
            2,
          hooks,
        }),
    discover_recovery:
      () =>
        discoverRecovery(
          input.directories,
        ),
    cancel_run:
      (runId) =>
        cancelRun(
          input.directories,
          runId,
        ),
    close_browser:
      input.close_browser,
    export_run:
      (runId) =>
        generateGoogleTrendsExport({
          directories:
            input.directories,
          run_id:
            runId,
        }),
  });
