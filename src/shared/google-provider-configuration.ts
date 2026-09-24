export type GoogleProviderConfigurationAvailability =
  | 'NOT_CONFIGURED'
  | 'AVAILABLE';

export interface GoogleProviderConfigurationStatus {
  oauth_application_status: GoogleProviderConfigurationAvailability;
  ads_developer_token_status: GoogleProviderConfigurationAvailability;
}

export type GoogleProviderConfigurationComponent =
  | 'OAUTH_APPLICATION'
  | 'ADS_DEVELOPER_TOKEN';

export interface ConfigureGoogleProviderIntent {
  component: GoogleProviderConfigurationComponent;
}

export type GoogleProviderConfigurationErrorCode =
  | 'INVALID_PROVIDER_CONFIGURATION_INTENT'
  | 'SECRET_INGRESS_CANCELLED'
  | 'SECRET_INGRESS_FAILED'
  | 'SECRET_INPUT_INVALID'
  | 'CREDENTIAL_PERSISTENCE_FAILED';

export type GoogleProviderConfigurationResponse =
  | {
    ok: true;
    result: {
      component: GoogleProviderConfigurationComponent;
      status: GoogleProviderConfigurationStatus;
    };
  }
  | {
    ok: false;
    error: {
      code: GoogleProviderConfigurationErrorCode;
      retryable: boolean;
    };
  };
