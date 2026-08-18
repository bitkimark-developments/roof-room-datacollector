import type { QueryConfig } from './query-config';
import type { SourceSummary } from './source';

export interface ApplicationDirectories {
  app_data_root: string;
  config: string;
  data: string;
  runs: string;
  database: string;
  browser_profiles: string;
  logs: string;
}

export type QueryConfigLoadStatus =
  | {
      status: 'READY';
      config_path: string;
      config: QueryConfig;
    }
  | {
      status: 'ERROR';
      config_path: string;
      error: string;
    };

export interface SourceRegistryStatus {
  status: 'READY';
  sources: SourceSummary[];
}

export interface BootstrapStatus {
  directories: ApplicationDirectories;
  query_config: QueryConfigLoadStatus;
  source_registry: SourceRegistryStatus;
}
