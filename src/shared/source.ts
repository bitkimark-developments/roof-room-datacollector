export type SourceReadinessStatus =
  | 'READY'
  | 'NOT_CONFIGURED'
  | 'AUTHENTICATION_REQUIRED'
  | 'MANUAL_ACTION_REQUIRED'
  | 'UNAVAILABLE'
  | 'ERROR';

export interface SourceCapabilities {
  requires_browser: boolean;
  requires_oauth: boolean;
  may_require_manual_login: boolean;
  supports_custom_date_range: boolean;
  supports_direct_export: boolean;
  supports_api: boolean;
  supports_resume: boolean;
  max_concurrency: number;
}

export interface SourceReadinessContext {
  query_config_ready: boolean;
}

export interface SourceReadinessResult {
  source_id: string;
  readiness_status: SourceReadinessStatus;
  checked_at: string;
  message: string | null;
}

export interface SourceSummary {
  source_id: string;
  source_name: string;
  source_mode: string;
  dataset_types: string[];
  capabilities: SourceCapabilities;
  readiness: SourceReadinessResult;
}

export interface DataSourceModule {
  readonly id: string;
  readonly name: string;
  readonly sourceMode: string;
  readonly datasetTypes: readonly string[];

  getCapabilities(): SourceCapabilities;

  checkReadiness(
    context: SourceReadinessContext,
  ): Promise<SourceReadinessResult>;
}
