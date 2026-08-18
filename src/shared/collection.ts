import type { AttemptRecord } from './attempt';
import type { ArtifactRecord } from './artifact';
import type { QueryGroup } from './query-config';
import type {
  DataSourceModule,
} from './source';
import type {
  JobRecord,
  RequestedCollectionConfiguration,
  ValidationStatus,
} from './run-job';
import type {
  ValidationFinding,
} from './validation-detail';

export interface SourceCollectionContext {
  run_id: string;
  job_id: string;
  attempt_id: string;
  attempt_number: number;
  source_id: string;
  job_key: string;
  requested_configuration: RequestedCollectionConfiguration;
  query_group: QueryGroup;
}

export type SourceCollectionResult =
  | {
      result_type: 'ARTIFACT_PRODUCED';
      preferred_filename: string;
      media_type: string;
      bytes: Uint8Array;
    }
  | {
      result_type: 'FAILED';
      error_code: string;
      message: string | null;
    }
  | {
      result_type: 'NO_ARTIFACT';
      error_code: string;
      message: string | null;
    }
  | {
      result_type: 'MANUAL_ACTION_REQUIRED';
      message: string | null;
    };

export interface CollectingDataSourceModule
  extends DataSourceModule {
  collect(
    context: SourceCollectionContext,
  ): Promise<SourceCollectionResult>;
}

export const isCollectingDataSourceModule = (
  source: DataSourceModule,
): source is CollectingDataSourceModule =>
  typeof (
    source as DataSourceModule & {
      collect?: unknown;
    }
  ).collect === 'function';

export interface CollectionValidationContext {
  job: JobRecord;
  attempt: AttemptRecord;
  artifact: ArtifactRecord;
  absolute_path: string;
}

export interface CollectionValidationDecision {
  validation_status: Exclude<
    ValidationStatus,
    'NOT_RUN'
  >;
  checks_total: number;
  checks_passed: number;
  checks_warning: number;
  checks_failed: number;
  findings: ValidationFinding[];
}

export interface CollectionValidator {
  validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision>;
}
