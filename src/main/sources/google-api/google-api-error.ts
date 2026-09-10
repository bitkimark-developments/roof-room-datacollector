import type { SourceCollectionResult } from '../../../shared/collection';
import { GoogleApiTransportError } from './api-helpers';
import { GoogleCredentialError } from './google-auth';

export const mapGoogleApiCollectionError = (
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): SourceCollectionResult => {
  if (error instanceof GoogleCredentialError) {
    if (error.code === 'INTERACTIVE_AUTHORIZATION_REQUIRED') {
      return {
        result_type: 'MANUAL_ACTION_REQUIRED',
        message: error.message,
      };
    }
    return {
      result_type: 'FAILED',
      error_code: error.code === 'MISSING_SECURE_CREDENTIAL'
        ? 'CONNECTION_REQUIRED'
        : error.code,
      message: error.message,
    };
  }
  if (error instanceof GoogleApiTransportError) {
    return {
      result_type: 'FAILED',
      error_code: error.code,
      message: error.message,
    };
  }
  return {
    result_type: 'FAILED',
    error_code: fallbackCode,
    message: error instanceof Error ? error.message : fallbackMessage,
  };
};
