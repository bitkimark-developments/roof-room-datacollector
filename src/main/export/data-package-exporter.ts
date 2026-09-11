import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { DataPackage, DataPackageDataset, DataPackageMode } from '../../shared/data-package';

interface PackageRun {
  run_id: string;
  workspace_id: string;
  run_status: string;
  selected_sources: string[];
}

interface PackageJob {
  source_id: string;
  job_key: string;
  execution_status: string;
  validation_status: string;
  accepted_artifact_id: string | null;
}

interface InputDataset {
  source_id: string;
  dataset_type: string;
  rows: Array<Record<string, unknown>> | null;
  provenance?: Record<string, unknown>;
  failure?: { code: string };
}

export const buildDataPackage = (input: {
  run: PackageRun;
  jobs: readonly PackageJob[];
  datasets: readonly InputDataset[];
  mode: DataPackageMode;
}): DataPackage => {
  const successfulJobs = input.jobs.filter((job) => job.execution_status === 'COMPLETED' && job.accepted_artifact_id !== null);
  const failedJobs = input.jobs.filter((job) => job.execution_status === 'FAILED' || job.validation_status === 'ERROR_NOT_DATA' || job.validation_status === 'INVALID_SCHEMA');
  const successfulSourceKeys = new Set(successfulJobs.map((job) => `${job.source_id}`));
  const datasets = input.datasets
    .filter((dataset) => Array.isArray(dataset.rows) && successfulSourceKeys.has(dataset.source_id))
    .map((dataset): DataPackageDataset => ({
      source_id: dataset.source_id,
      dataset_type: dataset.dataset_type,
      rows: JSON.parse(JSON.stringify(dataset.rows)) as Array<Record<string, unknown>>,
      provenance: dataset.provenance ? JSON.parse(JSON.stringify(dataset.provenance)) as Record<string, unknown> : undefined,
    }));
  const failures = input.mode === 'ALL'
    ? input.jobs.filter((job) => failedJobs.includes(job)).map((job) => ({ source_id: job.source_id, job_key: job.job_key, code: job.validation_status }))
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

export const writeDataPackage = async (directory: string, dataPackage: DataPackage): Promise<string> => {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'MANIFEST.json'), `${JSON.stringify(dataPackage.manifest, null, 2)}\n`, 'utf8');
  await writeFile(path.join(directory, 'FAILURES.json'), `${JSON.stringify(dataPackage.failures, null, 2)}\n`, 'utf8');
  for (const dataset of dataPackage.datasets) {
    await writeFile(path.join(directory, `${safeName(dataset.source_id)}_${safeName(dataset.dataset_type)}.json`), `${JSON.stringify(dataset.rows, null, 2)}\n`, 'utf8');
  }
  return directory;
};
