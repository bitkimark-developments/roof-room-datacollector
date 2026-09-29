export type SecretIngressPurpose =
  | 'SERPAPI_API_KEY'
  | 'GOOGLE_OAUTH_CLIENT_ID'
  | 'GOOGLE_OAUTH_CLIENT_SECRET';

export type SecretIngressFailureCode =
  | 'PROCESS_UNAVAILABLE'
  | 'PROCESS_FAILED'
  | 'TIMED_OUT'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'INVALID_OUTPUT';

export type SecretIngressResult =
  | { status: 'SUBMITTED'; secret: string }
  | { status: 'CANCELLED' }
  | { status: 'FAILED'; code: SecretIngressFailureCode };

export interface SecretIngressPort {
  requestSecret(input: {
    purpose: SecretIngressPurpose;
  }): Promise<SecretIngressResult>;
}
