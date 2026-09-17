import type { WorkspaceSourceConnectionRecord } from '../../../shared/workspace-connection';
import {
  GSC_QUERY_PAGE_SOURCE_ID,
  GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
  GOOGLE_KEYWORD_PLANNER_SOURCE_ID,
} from '../../../shared/google-api';
import type { CredentialStore } from '../../core/credential-store';
import type { StateRepository } from '../../storage/state-repository';
import { GoogleAdsSearchTermsSource, GoogleKeywordPlannerSource } from '../google-ads/google-ads-sources';
import { GoogleSearchConsoleSource } from '../google-search-console/google-search-console-source';
import { createFetchApiRequester, type ApiRequester } from './api-helpers';
import {
  assertGoogleLiveAcceptanceConfirmation,
  createAuthenticatedRequester,
  GoogleOAuthClient,
  GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
} from './google-auth';

export {
  assertGoogleLiveAcceptanceConfirmation,
  GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
};

const requireMetadataString = (
  connection: WorkspaceSourceConnectionRecord,
  key: string,
): string => {
  const value = connection.safe_metadata[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(
      `Google connection ${connection.source_id} requires safe metadata ${key}.`,
    );
  }
  return value;
};

const optionalMetadataString = (
  connection: WorkspaceSourceConnectionRecord,
  key: string,
): string | null => {
  const value = connection.safe_metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
};

const normalizeGoogleAdsCustomerId = (value: string): string => {
  const normalized = value.replace(/-/gu, '');
  if (!/^\d+$/u.test(normalized)) {
    throw new Error('Google Ads customer IDs must contain only digits or hyphens.');
  }
  return normalized;
};

export class GoogleApiRuntimeFactory {
  constructor(
    private readonly repository: Pick<
      StateRepository,
      'getSourceConnection' | 'upsertSourceConnection'
    >,
    private readonly credentialStore: CredentialStore,
    private readonly requester: ApiRequester = createFetchApiRequester(),
  ) {}

  private requireConnection(
    workspaceId: string,
    sourceId: string,
  ): WorkspaceSourceConnectionRecord {
    const connection = this.repository.getSourceConnection(workspaceId, sourceId);
    if (!connection) {
      throw new Error(`Google source connection is not configured: ${sourceId}`);
    }
    if (!connection.credential_ref) {
      throw new Error(`Google source credential is not configured: ${sourceId}`);
    }
    return connection;
  }

  createSearchConsoleSource(input: {
    workspace_id: string;
    start_date: string;
    end_date: string;
  }): GoogleSearchConsoleSource {
    const connection = this.requireConnection(
      input.workspace_id,
      GSC_QUERY_PAGE_SOURCE_ID,
    );
    const oauth = new GoogleOAuthClient(
      this.credentialStore,
      connection.credential_ref as string,
      this.requester,
      () => this.markReauthorizationRequired(connection),
    );
    return new GoogleSearchConsoleSource({
      site_url: requireMetadataString(connection, 'site_url'),
      start_date: input.start_date,
      end_date: input.end_date,
    }, createAuthenticatedRequester(oauth, this.requester));
  }

  createLiveSearchConsoleSmokeSource(input: {
    workspace_id: string;
    start_date: string;
    end_date: string;
    confirmation: string | undefined;
  }): GoogleSearchConsoleSource {
    assertGoogleLiveAcceptanceConfirmation(input.confirmation);
    return this.createSearchConsoleSource(input);
  }

  createSearchTermsSource(input: {
    workspace_id: string;
  }): GoogleAdsSearchTermsSource {
    const connection = this.requireConnection(
      input.workspace_id,
      GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
    );
    return new GoogleAdsSearchTermsSource(
      normalizeGoogleAdsCustomerId(
        requireMetadataString(connection, 'customer_id'),
      ),
      this.createGoogleAdsRequester(connection),
    );
  }

  createLiveSearchTermsSmokeSource(input: {
    workspace_id: string;
    confirmation: string | undefined;
  }): GoogleAdsSearchTermsSource {
    assertGoogleLiveAcceptanceConfirmation(input.confirmation);
    return this.createSearchTermsSource(input);
  }

  createKeywordPlannerSource(input: {
    workspace_id: string;
    keywords: string[];
  }): GoogleKeywordPlannerSource {
    const connection = this.requireConnection(
      input.workspace_id,
      GOOGLE_KEYWORD_PLANNER_SOURCE_ID,
    );
    return new GoogleKeywordPlannerSource(
      normalizeGoogleAdsCustomerId(
        requireMetadataString(connection, 'customer_id'),
      ),
      [...input.keywords],
      this.createGoogleAdsRequester(connection),
    );
  }

  createLiveKeywordPlannerSmokeSource(input: {
    workspace_id: string;
    keywords: string[];
    confirmation: string | undefined;
  }): GoogleKeywordPlannerSource {
    assertGoogleLiveAcceptanceConfirmation(input.confirmation);
    return this.createKeywordPlannerSource(input);
  }

  private createGoogleAdsRequester(
    connection: WorkspaceSourceConnectionRecord,
  ): ApiRequester {
    const oauth = new GoogleOAuthClient(
      this.credentialStore,
      connection.credential_ref as string,
      this.requester,
      () => this.markReauthorizationRequired(connection),
    );
    const loginCustomerId = optionalMetadataString(
      connection,
      'login_customer_id',
    );
    return createAuthenticatedRequester(oauth, this.requester, {
      google_ads: true,
      login_customer_id: loginCustomerId === null
        ? null
        : normalizeGoogleAdsCustomerId(loginCustomerId),
    });
  }

  private markReauthorizationRequired(
    connection: WorkspaceSourceConnectionRecord,
  ): void {
    this.repository.upsertSourceConnection({
      workspace_id: connection.workspace_id,
      source_id: connection.source_id,
      credential_ref: connection.credential_ref,
      safe_metadata: {
        ...connection.safe_metadata,
        authorization_state: 'REAUTHORIZATION_REQUIRED',
      },
    });
  }
}
