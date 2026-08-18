import type {
  ValidationSummaryRecord,
} from './validation-summary';

export type JsonScalar =
  | string
  | number
  | boolean
  | null;

export type JsonValue =
  | JsonScalar
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export const VALIDATION_SEVERITIES = [
  'INFO',
  'WARNING',
  'ERROR',
] as const;

export type ValidationSeverity =
  (typeof VALIDATION_SEVERITIES)[number];

export interface ValidationFinding {
  check_id: string;
  severity: ValidationSeverity;
  passed: boolean;
  message: string;
  expected: JsonValue;
  actual: JsonValue;
}

export interface ValidationDetailDocument {
  schema_version: 1;
  validation_id: string;
  run_id: string;
  job_id: string;
  artifact_id: string;
  validation_status:
    ValidationSummaryRecord['validation_status'];
  validated_at: string;
  checks_total: number;
  checks_passed: number;
  checks_warning: number;
  checks_failed: number;
  findings: ValidationFinding[];
}

export const createValidationDetailDocument = (
  summary: ValidationSummaryRecord,
  findings: readonly ValidationFinding[],
): ValidationDetailDocument => ({
  schema_version: 1,
  validation_id: summary.validation_id,
  run_id: summary.run_id,
  job_id: summary.job_id,
  artifact_id: summary.artifact_id,
  validation_status:
    summary.validation_status,
  validated_at: summary.validated_at,
  checks_total: summary.checks_total,
  checks_passed: summary.checks_passed,
  checks_warning: summary.checks_warning,
  checks_failed: summary.checks_failed,
  findings: findings.map((finding) => ({
    ...finding,
  })),
});
