import type { JsonObject } from './run-job';

export interface WorkspaceSourceConnectionRecord {
  connection_id: string;
  workspace_id: string;
  source_id: string;
  credential_ref: string | null;
  safe_metadata: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface UpsertWorkspaceSourceConnectionInput {
  workspace_id: string;
  source_id: string;
  credential_ref: string | null;
  safe_metadata: JsonObject;
}
