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
  public_downloads: string;
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

export type DatabaseBootstrapStatus =
  | {
      status: 'READY';
      database_path: string;
      schema_version: number;
      sqlite_version: string;
      journal_mode: string;
      foreign_keys: boolean;
      migrations_applied: number;
      quick_check: 'ok';
    }
  | {
      status: 'ERROR';
      database_path: string;
      error: string;
    };

export interface BootstrapStatus {
  directories: ApplicationDirectories;
  query_config: QueryConfigLoadStatus;
  source_registry: SourceRegistryStatus;
  database: DatabaseBootstrapStatus;
}
