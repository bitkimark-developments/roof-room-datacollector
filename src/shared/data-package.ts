export type DataPackageMode = 'ALL' | 'SUCCESSFUL_ONLY';

export interface DataPackageDataset {
  source_id: string;
  dataset_type: string;
  rows: Array<Record<string, unknown>>;
  provenance?: Record<string, unknown>;
}

export interface DataPackageFailure {
  source_id: string;
  job_key: string;
  code: string;
}

export interface DataPackageManifest {
  package_version: 1;
  run_id: string;
  workspace_id: string;
  run_status: string;
  selected_sources: string[];
  successful_jobs: number;
  failed_jobs: number;
  mode: DataPackageMode;
}

export interface DataPackage {
  manifest: DataPackageManifest;
  datasets: DataPackageDataset[];
  failures: DataPackageFailure[];
}

