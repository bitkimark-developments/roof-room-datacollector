import type { SourceReadinessEvaluator } from '../../core/readiness-registry';

export const googleApiReadinessEvaluator: SourceReadinessEvaluator = ({ connection, credential_available }) => {
  if (!connection) return 'CONFIGURATION_REQUIRED';
  if (connection.safe_metadata.authorization_state === 'REAUTHORIZATION_REQUIRED') return 'MANUAL_ACTION_REQUIRED';
  if (!credential_available) return 'CONNECTION_REQUIRED';
  return 'READY';
};

const withRequiredMetadata = (
  requiredKey: string,
): SourceReadinessEvaluator => (context) => {
  if (!context.connection) return 'CONFIGURATION_REQUIRED';
  if (
    context.connection.safe_metadata.authorization_state ===
    'REAUTHORIZATION_REQUIRED'
  ) return 'MANUAL_ACTION_REQUIRED';
  const value = context.connection.safe_metadata[requiredKey];
  if (typeof value !== 'string' || !value.trim()) {
    return 'CONFIGURATION_REQUIRED';
  }
  return context.credential_available ? 'READY' : 'CONNECTION_REQUIRED';
};

export const googleSearchConsoleReadiness =
  withRequiredMetadata('site_url');
export const googleAdsSearchTermsReadiness =
  withRequiredMetadata('customer_id');
export const googleKeywordPlannerReadiness =
  withRequiredMetadata('customer_id');
