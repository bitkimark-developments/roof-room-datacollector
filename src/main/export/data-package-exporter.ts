import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { DataPackage, DataPackageDataset, DataPackageMode } from '../../shared/data-package';
import { writeKeywordPlannerUserExport } from './keyword-planner-user-export';

interface PackageRun {
  run_id: string;
  workspace_id: string;
  run_status: string;
  selected_sources: string[];
}

interface PackageJob {
  job_id: string;
  source_id: string;
  job_key: string;
  execution_status: string;
  validation_status: string;
  accepted_artifact_id: string | null;
}

export interface DataPackageInputDataset {
  source_id: string;
  dataset_type: string;
  job_id: string;
  job_key: string;
  rows: Array<Record<string, unknown>> | null;
  provenance?: Record<string, unknown>;
  failure?: { code: string };
}

export const buildDataPackage = (input: {
  run: PackageRun;
  jobs: readonly PackageJob[];
  datasets: readonly DataPackageInputDataset[];
  mode: DataPackageMode;
}): DataPackage => {
  const acceptedValidationStatuses = new Set(['VALID', 'LOW_DATA', 'NO_DATA']);
  const successfulJobs = input.jobs.filter((job) => (
    job.execution_status === 'COMPLETED'
    && job.accepted_artifact_id !== null
    && acceptedValidationStatuses.has(job.validation_status)
  ));
  const failedJobs = input.jobs.filter((job) => (
    !successfulJobs.includes(job)
    && (
      job.execution_status === 'FAILED'
      || job.execution_status === 'CANCELLED'
      || (
        job.validation_status !== 'NOT_RUN'
        && !acceptedValidationStatuses.has(job.validation_status)
      )
    )
  ));
  const successfulSourceKeys = new Set(successfulJobs.map((job) => `${job.source_id}`));
  const successfulJobIds = new Set(successfulJobs.map((job) => job.job_id));
  const jobsById = new Map(input.jobs.map((job) => [job.job_id, job]));
  for (const dataset of input.datasets) {
    const job = jobsById.get(dataset.job_id);
    if (
      job === undefined
      || job.source_id !== dataset.source_id
      || job.job_key !== dataset.job_key
    ) {
      throw new Error(`Data Package dataset identity does not match Job ${dataset.job_id}.`);
    }
  }
  const datasets = input.datasets
    .filter((dataset) => Array.isArray(dataset.rows) && successfulJobIds.has(dataset.job_id) && successfulSourceKeys.has(dataset.source_id))
    .map((dataset): DataPackageDataset => ({
      source_id: dataset.source_id,
      dataset_type: dataset.dataset_type,
      job_id: dataset.job_id,
      job_key: dataset.job_key,
      rows: JSON.parse(JSON.stringify(dataset.rows)) as Array<Record<string, unknown>>,
      provenance: dataset.provenance ? JSON.parse(JSON.stringify(dataset.provenance)) as Record<string, unknown> : undefined,
    }));
  const failures = input.mode === 'ALL'
    ? failedJobs.map((job) => ({
        source_id: job.source_id,
        job_key: job.job_key,
        code: job.validation_status === 'NOT_RUN'
          ? job.execution_status
          : job.validation_status,
      }))
    : [];
  return {
    manifest: {
      package_version: 1,
      run_id: input.run.run_id,
      workspace_id: input.run.workspace_id,
      run_status: input.run.run_status,
      selected_sources: [...input.run.selected_sources],
      successful_jobs: successfulJobs.length,
      failed_jobs: failedJobs.length,
      mode: input.mode,
    },
    datasets,
    failures,
  };
};

const safeName = (value: string): string => value.replace(/[^a-z0-9_-]+/giu, '_').toLowerCase();

export const writeDataPackageEvidence = async (
  directory: string,
  dataPackage: DataPackage,
): Promise<string> => {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'MANIFEST.json'), `${JSON.stringify(dataPackage.manifest, null, 2)}\n`, 'utf8');
  await writeFile(path.join(directory, 'FAILURES.json'), `${JSON.stringify(dataPackage.failures, null, 2)}\n`, 'utf8');
  const datasetIndex: Array<Record<string, unknown>> = [];
  const filenames = new Set<string>();
  for (const dataset of dataPackage.datasets) {
    const identity = `_${safeName(dataset.job_key)}_${safeName(dataset.job_id)}`;
    const filename = `${safeName(dataset.source_id)}_${safeName(dataset.dataset_type)}${identity}.json`;
    if (filenames.has(filename)) throw new Error(`Data Package dataset filename collision: ${filename}`);
    filenames.add(filename);
    await writeFile(path.join(directory, filename), `${JSON.stringify(dataset.rows, null, 2)}\n`, 'utf8');
    datasetIndex.push({
      filename,
      source_id: dataset.source_id,
      dataset_type: dataset.dataset_type,
      job_id: dataset.job_id,
      job_key: dataset.job_key,
      row_count: dataset.rows.length,
      provenance: dataset.provenance ?? {},
    });
  }
  await writeFile(path.join(directory, 'DATASETS.json'), `${JSON.stringify(datasetIndex, null, 2)}\n`, 'utf8');

  return directory;
};

export const writeDataPackage = async (
  directory: string,
  dataPackage: DataPackage,
): Promise<string> => {
  await writeDataPackageEvidence(directory, dataPackage);
  await writeKeywordPlannerUserExport(directory, dataPackage);

  return directory;
};
