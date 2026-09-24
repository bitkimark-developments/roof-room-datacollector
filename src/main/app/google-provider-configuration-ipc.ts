import type {
  ConfigureGoogleProviderIntent,
  GoogleProviderConfigurationErrorCode,
  GoogleProviderConfigurationResponse,
  GoogleProviderConfigurationStatus,
} from '../../shared/google-provider-configuration';

type GoogleProviderConfigurationIpcService = {
  getStatus: () => Promise<GoogleProviderConfigurationStatus>;
  configure: (
    intent: ConfigureGoogleProviderIntent,
  ) => Promise<GoogleProviderConfigurationResponse>;
};

const availability = (
  value: unknown,
): value is 'NOT_CONFIGURED' | 'AVAILABLE' => (
  value === 'NOT_CONFIGURED' || value === 'AVAILABLE'
);

const safeStatus = (value: unknown): GoogleProviderConfigurationStatus => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Google provider configuration service returned an invalid status.');
  }
  const candidate = value as Record<string, unknown>;
  if (
    !availability(candidate.oauth_application_status)
    || !availability(candidate.ads_developer_token_status)
  ) {
    throw new Error('Google provider configuration service returned an invalid status.');
  }
  return {
    oauth_application_status: candidate.oauth_application_status,
    ads_developer_token_status: candidate.ads_developer_token_status,
  };
};

const normalizeIntent = (
  value: unknown,
): ConfigureGoogleProviderIntent | null => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.keys(value).length !== 1
  ) return null;
  const component = (value as { component?: unknown }).component;
  return component === 'OAUTH_APPLICATION'
    || component === 'ADS_DEVELOPER_TOKEN'
    ? { component }
    : null;
};

const errorCodes: readonly GoogleProviderConfigurationErrorCode[] = [
  'INVALID_PROVIDER_CONFIGURATION_INTENT',
  'SECRET_INGRESS_CANCELLED',
  'SECRET_INGRESS_FAILED',
  'SECRET_INPUT_INVALID',
  'CREDENTIAL_PERSISTENCE_FAILED',
];

const safeResponse = (
  value: unknown,
  intent: ConfigureGoogleProviderIntent,
): GoogleProviderConfigurationResponse => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Google provider configuration service returned an invalid response.');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.ok === true) {
    const result = candidate.result;
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      throw new Error('Google provider configuration service returned an invalid response.');
    }
    const resultRecord = result as Record<string, unknown>;
    if (resultRecord.component !== intent.component) {
      throw new Error('Google provider configuration service returned an invalid response.');
    }
    return {
      ok: true,
      result: {
        component: intent.component,
        status: safeStatus(resultRecord.status),
      },
    };
  }
  if (candidate.ok === false) {
    const error = candidate.error;
    if (typeof error !== 'object' || error === null || Array.isArray(error)) {
      throw new Error('Google provider configuration service returned an invalid response.');
    }
    const errorRecord = error as Record<string, unknown>;
    if (
      typeof errorRecord.code !== 'string'
      || !errorCodes.includes(
        errorRecord.code as GoogleProviderConfigurationErrorCode,
      )
      || typeof errorRecord.retryable !== 'boolean'
    ) {
      throw new Error('Google provider configuration service returned an invalid response.');
    }
    return {
      ok: false,
      error: {
        code: errorRecord.code as GoogleProviderConfigurationErrorCode,
        retryable: errorRecord.retryable,
      },
    };
  }
  throw new Error('Google provider configuration service returned an invalid response.');
};

export const createGoogleProviderConfigurationHandlers = <Event>(
  dependencies: {
    assertTrustedSender: (event: Event) => void;
    service: GoogleProviderConfigurationIpcService;
  },
) => ({
  getStatus: async (event: Event): Promise<GoogleProviderConfigurationStatus> => {
    dependencies.assertTrustedSender(event);
    return safeStatus(await dependencies.service.getStatus());
  },
  configure: async (
    event: Event,
    value: unknown,
  ): Promise<GoogleProviderConfigurationResponse> => {
    dependencies.assertTrustedSender(event);
    const intent = normalizeIntent(value);
    if (intent === null) {
      return {
        ok: false,
        error: {
          code: 'INVALID_PROVIDER_CONFIGURATION_INTENT',
          retryable: false,
        },
      };
    }
    return safeResponse(await dependencies.service.configure(intent), intent);
  },
});
