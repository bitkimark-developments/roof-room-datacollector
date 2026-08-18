export interface QueryGroup {
  query_group_id: string;
  query_group_name: string;
  queries: string[];
}

export interface QueryConfig {
  config_version: number;
  source_id: string;
  groups: QueryGroup[];
}
