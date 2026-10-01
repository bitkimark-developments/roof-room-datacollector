import type {
  JobRecord,
  RunRecord,
} from '../../shared/run-job';
import {
  BLOG_WRITING_PACK_DATASETS,
  BLOG_WRITING_PACK_RECIPE_ID,
  BLOG_WRITING_PACK_RECIPE_VERSION,
  BLOG_WRITING_PACK_WORKBOOK_FILENAME,
  type BlogWritingPackAssemblyResult,
  type BlogWritingPackCoverageByDataset,
  type BlogWritingPackDatasetType,
} from '../../shared/blog-writing-pack';
import {
  buildDataPackage,
  type DataPackageInputDataset,
} from '../export/data-package-exporter';
import {
  BLOG_WRITING_PACK_RECIPE,
  isBlogWritingPackSource,
} from './blog-writing-pack-recipe';

const ACCEPTED_VALIDATION_STATUSES = new Set([
  'VALID',
  'LOW_DATA',
  'NO_DATA',
]);

const isAcceptedJob = (job: JobRecord): boolean =>
  job.execution_status === 'COMPLETED'
  && job.accepted_artifact_id !== null
  && ACCEPTED_VALIDATION_STATUSES.has(job.validation_status);

const expectedDatasetForSource = (
  sourceId: string,
): BlogWritingPackDatasetType | null =>
  isBlogWritingPackSource(sourceId)
    ? BLOG_WRITING_PACK_RECIPE[sourceId]
    : null;

const kwpIncompleteJobs = (
  jobs: readonly JobRecord[],
  acceptedJobs: readonly JobRecord[],
): number => {
  if (acceptedJobs.length === 0) {
    return jobs.length;
  }

  const acceptedSources = new Set(
    acceptedJobs.map((job) => job.source_id),
  );

  return jobs.filter(
    (job) =>
      acceptedSources.has(job.source_id)
      && !isAcceptedJob(job),
  ).length;
};

export const assembleBlogWritingPack = (input: {
  package_id: string;
  created_at: string;
  application_version: string;
  run: RunRecord;
  jobs: readonly JobRecord[];
  datasets: readonly DataPackageInputDataset[];
}): BlogWritingPackAssemblyResult => {
  const recipeJobs = input.jobs.filter(
    (job) => isBlogWritingPackSource(job.source_id),
  );

  const recipeJobsById = new Map(
    recipeJobs.map((job) => [job.job_id, job]),
  );

  const recipeDatasets = input.datasets.filter(
    (dataset) => isBlogWritingPackSource(dataset.source_id),
  );

  const datasetsByJobId = new Map<string, DataPackageInputDataset[]>();

  for (const dataset of recipeDatasets) {
    const owner = recipeJobsById.get(dataset.job_id);

    if (
      owner === undefined
      || owner.source_id !== dataset.source_id
      || owner.job_key !== dataset.job_key
    ) {
      throw new Error(
        `Blog Writing Pack dataset identity does not match Job ${dataset.job_id}.`,
      );
    }

    const expectedDatasetType =
      expectedDatasetForSource(dataset.source_id);

    if (dataset.dataset_type !== expectedDatasetType) {
      throw new Error(
        `Blog Writing Pack dataset type does not match recipe mapping for ${dataset.source_id}.`,
      );
    }

    const existing = datasetsByJobId.get(dataset.job_id) ?? [];
    existing.push(dataset);
    datasetsByJobId.set(dataset.job_id, existing);
  }

  for (const job of recipeJobs) {
    if (!isAcceptedJob(job)) continue;

    const matches = datasetsByJobId.get(job.job_id) ?? [];

    if (matches.length === 0 || !Array.isArray(matches[0].rows)) {
      throw new Error(
        `Accepted Blog Writing Pack Job ${job.job_id} has no matching dataset.`,
      );
    }

    if (matches.length > 1) {
      throw new Error(
        `Accepted Blog Writing Pack Job ${job.job_id} has multiple datasets.`,
      );
    }
  }

  const coverageByDataset =
    {} as BlogWritingPackCoverageByDataset;

  for (const datasetType of BLOG_WRITING_PACK_DATASETS) {
    const familyJobs = recipeJobs.filter(
      (job) =>
        expectedDatasetForSource(job.source_id) === datasetType,
    );
    const acceptedJobs = familyJobs.filter(isAcceptedJob);
    const noDataJobs = acceptedJobs.filter(
      (job) => job.validation_status === 'NO_DATA',
    );

    const incompleteJobs =
      datasetType === 'KEYWORD_HISTORICAL_METRICS'
        ? kwpIncompleteJobs(familyJobs, acceptedJobs)
        : familyJobs.length - acceptedJobs.length;

    coverageByDataset[datasetType] = {
      status:
        acceptedJobs.length === 0
          ? 'MISSING'
          : incompleteJobs > 0
            ? 'PARTIAL'
            : 'COVERED',
      total_jobs: familyJobs.length,
      accepted_jobs: acceptedJobs.length,
      no_data_jobs: noDataJobs.length,
      incomplete_jobs: incompleteJobs,
    };
  }

  const missingDatasets = BLOG_WRITING_PACK_DATASETS.filter(
    (datasetType) =>
      coverageByDataset[datasetType].status === 'MISSING',
  );

  const incompleteDatasets = BLOG_WRITING_PACK_DATASETS.filter(
    (datasetType) =>
      coverageByDataset[datasetType].status === 'PARTIAL',
  );

  const acceptedJobs = recipeJobs.filter(isAcceptedJob);

  if (acceptedJobs.length === 0) {
    return {
      status: 'NOT_READY',
      run_id: input.run.run_id,
      coverage_by_dataset: coverageByDataset,
      missing_datasets: [...missingDatasets],
      incomplete_datasets: [...incompleteDatasets],
    };
  }

  const selectedSources = input.run.selected_sources.filter(
    isBlogWritingPackSource,
  );

  const dataPackage = buildDataPackage({
    run: {
      run_id: input.run.run_id,
      workspace_id: input.run.workspace_id,
      run_status: input.run.run_status,
      selected_sources: selectedSources,
    },
    jobs: recipeJobs,
    datasets: recipeDatasets,
    mode: 'ALL',
  });

  const presentDatasets = BLOG_WRITING_PACK_DATASETS.filter(
    (datasetType) =>
      recipeJobs.some(
        (job) =>
          expectedDatasetForSource(job.source_id) === datasetType
          && isAcceptedJob(job)
          && job.validation_status !== 'NO_DATA',
      ),
  );

  const noDataDatasets = BLOG_WRITING_PACK_DATASETS.filter(
    (datasetType) =>
      recipeJobs.some(
        (job) =>
          expectedDatasetForSource(job.source_id) === datasetType
          && isAcceptedJob(job)
          && job.validation_status === 'NO_DATA',
      ),
  );

  const coverageStatus =
    BLOG_WRITING_PACK_DATASETS.every(
      (datasetType) =>
        coverageByDataset[datasetType].status === 'COVERED',
    )
      ? 'COMPLETE'
      : 'PARTIAL';

  return {
    status: 'READY',
    assembly: {
      data_package: dataPackage,
      manifest: {
        manifest_version: 1,
        package_id: input.package_id,
        recipe_id: BLOG_WRITING_PACK_RECIPE_ID,
        recipe_version: BLOG_WRITING_PACK_RECIPE_VERSION,
        run_id: input.run.run_id,
        workspace_id: input.run.workspace_id,
        created_at: input.created_at,
        application_version: input.application_version,
        coverage_status: coverageStatus,
        expected_datasets: [...BLOG_WRITING_PACK_DATASETS],
        present_datasets: [...presentDatasets],
        no_data_datasets: [...noDataDatasets],
        incomplete_datasets: [...incompleteDatasets],
        missing_datasets: [...missingDatasets],
        coverage_by_dataset: coverageByDataset,
        workbook_filename: BLOG_WRITING_PACK_WORKBOOK_FILENAME,
        generic_manifest_filename: 'MANIFEST.json',
        datasets_index_filename: 'DATASETS.json',
        failures_filename: 'FAILURES.json',
      },
    },
  };
};
