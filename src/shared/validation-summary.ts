import type { ValidationStatus } from './run-job';

export interface ValidationSummaryRecord {
  validation_id: string;
  run_id: string;
  job_id: string;
  artifact_id: string;
  validation_status: Exclude<
    ValidationStatus,
    'NOT_RUN'
  >;
  checks_total: number;
  checks_passed: number;
  checks_warning: number;
  checks_failed: number;
  validated_at: string;
  validation_json_path: string | null;
}
