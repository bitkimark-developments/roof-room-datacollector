import type { SourceReadinessEvaluator } from '../../core/readiness-registry';

export const googleApiReadinessEvaluator: SourceReadinessEvaluator = ({ connection, credential_available }) => {
  if (!connection) return 'CONFIGURATION_REQUIRED';
  if (!credential_available) return 'CONNECTION_REQUIRED';
  return 'READY';
};

export const googleSearchConsoleReadiness = googleApiReadinessEvaluator;
export const googleAdsSearchTermsReadiness = googleApiReadinessEvaluator;
export const googleKeywordPlannerReadiness = googleApiReadinessEvaluator;
