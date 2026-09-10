import type { WorkspaceSourceConnectionRecord } from '../../../shared/workspace-connection';
import type { CredentialStore } from '../../core/credential-store';
import type { StateRepository } from '../../storage/state-repository';
import { SerpApiClient } from './serpapi-client';
import { SerpApiSource } from './serpapi-source';

export class SerpApiRuntimeFactory {
  constructor(
    private readonly repository: Pick<StateRepository, 'getSourceConnection'>,
    private readonly credentialStore: CredentialStore,
    private readonly requester?: ConstructorParameters<typeof SerpApiClient>[2],
  ) {}

  createSource(input: { workspace_id: string }): SerpApiSource | null {
    const connection = this.repository.getSourceConnection(
      input.workspace_id,
      'serpapi',
    ) as WorkspaceSourceConnectionRecord | null;
    if (!connection || !connection.credential_ref) return null;
    return new SerpApiSource(new SerpApiClient(
      this.credentialStore,
      connection.credential_ref,
      this.requester,
    ));
  }

  createLiveSmokeSource(input: {
    workspace_id: string;
    confirmation: string | undefined;
  }): SerpApiSource {
    if (input.confirmation !== 'I UNDERSTAND THIS WILL CALL SERPAPI') {
      throw new Error(
        'SerpApi live smoke requires explicit confirmation: I UNDERSTAND THIS WILL CALL SERPAPI',
      );
    }
    const source = this.createSource(input);
    if (!source) {
      throw new Error('SerpApi Workspace connection is not configured.');
    }
    return source;
  }
}

export const SERPAPI_LIVE_SMOKE_CONFIRMATION =
  'I UNDERSTAND THIS WILL CALL SERPAPI';
