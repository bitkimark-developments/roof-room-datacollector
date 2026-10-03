import type {
  WorkspaceReadinessStatus,
} from '../../../shared/readiness';
import type {
  WorkspaceSourceConnectionRecord,
} from '../../../shared/workspace-connection';
import {
  GOOGLE_ANALYTICS_READONLY_SCOPE,
} from '../google-api/google-oauth-credential-acquirer';

export interface GoogleAnalytics4ReadinessInput {
  base_status: WorkspaceReadinessStatus;
  connection: WorkspaceSourceConnectionRecord | null;
  is_credential_compatible: (
    credential_ref: string,
    required_scopes: readonly string[],
  ) => Promise<boolean>;
}

export const evaluateGoogleAnalytics4Readiness = async (
  input: GoogleAnalytics4ReadinessInput,
): Promise<WorkspaceReadinessStatus> => {
  if (input.base_status !== 'READY') {
    return input.base_status;
  }

  const propertyId =
    input.connection?.safe_metadata.property_id;

  if (
    typeof propertyId !== 'string'
    || !/^\d+$/u.test(propertyId)
  ) {
    return 'CONFIGURATION_REQUIRED';
  }

  const credentialRef =
    input.connection?.credential_ref;

  if (
    typeof credentialRef !== 'string'
    || credentialRef.length === 0
  ) {
    return 'CONNECTION_REQUIRED';
  }

  try {
    const compatible =
      await input.is_credential_compatible(
        credentialRef,
        [GOOGLE_ANALYTICS_READONLY_SCOPE],
      );

    return compatible
      ? 'READY'
      : 'CONNECTION_REQUIRED';
  } catch {
    return 'CONNECTION_REQUIRED';
  }
};
