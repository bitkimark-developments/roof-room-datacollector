import type { JsonObject } from './run-job';
import type { DesktopCredentialManagedSourceId } from './desktop-multisource';

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

export interface RebindWorkspaceSourceConnectionsInput {
  workspace_id: string;
  source_ids: readonly DesktopCredentialManagedSourceId[];
  expected_credential_ref: string;
  replacement_credential_ref: string;
  safe_metadata_updates?: readonly {
    source_id: DesktopCredentialManagedSourceId;
    safe_metadata: JsonObject;
  }[];
}

export interface WorkspaceConnectionMutationRepository {
  deleteSourceConnection(
    workspace_id: string,
    source_id: DesktopCredentialManagedSourceId,
  ): WorkspaceSourceConnectionRecord | null;
  restoreSourceConnection(
    record: WorkspaceSourceConnectionRecord,
  ): WorkspaceSourceConnectionRecord;
  getSourceConnection(
    workspace_id: string,
    source_id: DesktopCredentialManagedSourceId,
  ): WorkspaceSourceConnectionRecord | null;
  upsertSourceConnection(
    input: UpsertWorkspaceSourceConnectionInput,
  ): WorkspaceSourceConnectionRecord;
  countSourceConnectionsByCredentialRef(credential_ref: string): number;
  rebindSourceConnections(
    input: RebindWorkspaceSourceConnectionsInput,
  ): readonly WorkspaceSourceConnectionRecord[];
}
