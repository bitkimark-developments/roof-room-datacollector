export interface WorkspaceRecord {
  workspace_id: string;
  workspace_name: string;
  created_at: string;
}

export interface CreateWorkspaceInput {
  workspace_name: string;
}
