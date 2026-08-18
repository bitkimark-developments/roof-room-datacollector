import type {
  ValidationStatus,
} from './run-job';

export interface DatasetMetadataDocument {
  schema_version: 1;
  run_id: string;
  job_id: string;
  attempt_number: number;

  source_id: string;
  source_name: string;
  source_mode: string;

  dataset_type: string;

  query_group_id: string;
  query_group_name: string;
  queries: string[];

  country_code: string;
  country_name: string | null;
  language_code: string | null;

  category_id: string | null;
  category_name: string;
  search_type: string;
  selection_type: string;

  requested_date_start: string;
  requested_date_end: string;
  actual_date_start: string | null;
  actual_date_end: string | null;

  retrieved_at: string;
  application_version: string;

  raw_artifact_id: string;
  raw_relative_path: string;

  validation_status: Exclude<
    ValidationStatus,
    'NOT_RUN'
  >;
}
