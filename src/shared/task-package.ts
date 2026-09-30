export type TaskPackageRole = 'CURRENT' | 'PREVIOUS';

export type TaskPackageKind = 'INITIAL_BASELINE' | 'COMPARISON';

export type TaskPackageEvidenceDisposition =
  | 'COLLECTED'
  | 'REUSED_EXACT'
  | 'REUSED_FILTERED'
  | 'NO_DATA';

export interface TaskPackageWindow {
  start: string;
  end: string;
}

export interface TaskPackageAccountIdentity {
  field: string;
  value: string;
}

export interface TaskEvidenceRequirement {
  requirement_id: string;
  source_id: string;
  dataset_type: string;
  resource_mode: string;
  acquisition_mode: string;
  campaign_scope: string;
  dataset_schema_version: number;
  row_date_field: string;
}

export interface TaskPackageRecipe {
  recipe_id: string;
  recipe_version: number;
  label: string;
  account_identity_field: string;
  current_window_days: number;
  required_evidence: readonly TaskEvidenceRequirement[];
}

export interface TaskPackageEvidenceOrigin {
  run_id: string;
  job_id: string;
  attempt_number: number;
  artifact_id: string;
  artifact_sha256: string;
  acquired_at: string;
  validation_status: string;
  source_id: string;
  dataset_type: string;
  resource_mode: string;
  acquisition_mode: string;
  campaign_scope: string;
  dataset_schema_version: number;
  account_identity: TaskPackageAccountIdentity;
  snapshot_observed_at: string;
}

export type TaskPackageEvidenceTransformation =
  | {
      kind: 'NONE';
    }
  | {
      kind: 'DATE_FILTER';
      row_date_field: string;
      input_window: TaskPackageWindow;
      output_window: TaskPackageWindow;
      input_row_count: number;
      output_row_count: number;
    };

export interface TaskPackageDatasetTableReference {
  filename: string;
  sha256: string;
  row_count: number;
  role: TaskPackageRole;
  dataset_type: string;
}

export interface TaskPackageEvidenceEntry {
  requirement_id: string;
  role: TaskPackageRole;
  disposition: TaskPackageEvidenceDisposition;
  window: TaskPackageWindow;
  origin: TaskPackageEvidenceOrigin;
  transformation: TaskPackageEvidenceTransformation;
  row_count: number;
  source_package_id?: string;
  table?: TaskPackageDatasetTableReference;
}

export interface TaskPackageManifestV1 {
  manifest_version: 1;
  package_id: string;
  recipe_id: string;
  recipe_version: number;
  recipe_label: string;
  package_kind: TaskPackageKind;
  workspace_id: string;
  account_identity: TaskPackageAccountIdentity;
  customer_id: string;
  created_at: string;
  application_version: string;
  campaign_scope: string;
  current_window: TaskPackageWindow;
  previous_package_id?: string;
  previous_window?: TaskPackageWindow;
  gap_days?: number;
  dataset_schema_version: number;
  required_datasets: string[];
  evidence: TaskPackageEvidenceEntry[];
  excluded_coverage: Record<string, string>;
  workbook_filename: string;
}

export interface AssembledTaskPackageDataset {
  requirement_id: string;
  dataset_type: string;
  role: TaskPackageRole;
  rows: Array<Record<string, unknown>>;
  evidence: TaskPackageEvidenceEntry;
}

export interface AssembledTaskPackage {
  manifest: TaskPackageManifestV1;
  datasets: AssembledTaskPackageDataset[];
}

export type TaskPackageRequirementResolution =
  | {
      status: 'READY';
      requirement: TaskEvidenceRequirement;
      rows: Array<Record<string, unknown>>;
      evidence: TaskPackageEvidenceEntry;
      rejected_candidates: Array<{ code: string; identity: string }>;
    }
  | {
      status: 'MISSING';
      requirement: TaskEvidenceRequirement;
      reason_codes: string[];
      rejected_candidates: Array<{ code: string; identity: string }>;
    };

export type TaskPackageAssemblyResult =
  | {
      status: 'READY';
      package: AssembledTaskPackage;
      requirements: TaskPackageRequirementResolution[];
    }
  | {
      status: 'NOT_READY';
      current_window: TaskPackageWindow;
      requirements: TaskPackageRequirementResolution[];
    };
