import type { SourceReadinessEvaluator } from '../../core/readiness-registry';

export const serpApiReadinessEvaluator: SourceReadinessEvaluator = ({
  connection,
  credential_available,
}) => {
  if (!connection) return 'CONFIGURATION_REQUIRED';
  if (!credential_available) return 'CONNECTION_REQUIRED';
  return 'READY';
};
