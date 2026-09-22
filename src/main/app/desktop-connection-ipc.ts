import type {
  DesktopWorkspaceConnectionView,
} from '../../shared/desktop-multisource';

export interface DesktopWorkspaceConnectionsHandlerDependencies<Event> {
  assertTrustedSender: (event: Event) => void;
  getWorkspaceConnections: (
    workspace_id: string,
  ) => Promise<DesktopWorkspaceConnectionView[]>;
}

export const createDesktopWorkspaceConnectionsHandler = <Event>(
  dependencies: DesktopWorkspaceConnectionsHandlerDependencies<Event>,
) => {
  return async (
    event: Event,
    workspaceId: unknown,
  ): Promise<DesktopWorkspaceConnectionView[]> => {
    dependencies.assertTrustedSender(event);

    if (
      typeof workspaceId !== 'string'
      || workspaceId.trim().length === 0
    ) {
      throw new Error(
        'workspace_id must be a non-empty string.',
      );
    }

    return dependencies.getWorkspaceConnections(workspaceId);
  };
};
