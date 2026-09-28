import type { DesktopGoogleConnectionSourceId } from '../../../shared/workspace-connection-management';
import type {
  ConfigureGoogleProviderIntent,
  GoogleProviderConfigurationComponent,
  GoogleProviderConfigurationResponse,
  GoogleProviderConfigurationStatus,
} from '../../../shared/google-provider-configuration';
import type { CredentialStore } from '../../core/credential-store';
import type {
  SecretIngressPort,
  SecretIngressPurpose,
  SecretIngressResult,
} from '../../core/secret-ingress';

export const GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF =
  'provider:google:configuration:v1';

export interface GoogleProviderConfiguration {
  client_id?: string;
  client_secret?: string;
  developer_token?: string;
}

const validValue = (value: unknown): value is string => (
  typeof value === 'string'
  && /^[\x21-\x7e]{1,512}$/u.test(value)
);

const parseConfiguration = (value: string): GoogleProviderConfiguration => {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (
    typeof parsed !== 'object'
    || parsed === null
    || Array.isArray(parsed)
  ) {
    throw new Error('Stored Google provider configuration is invalid.');
  }

  const result: GoogleProviderConfiguration = {};
  for (const key of [
    'client_id',
    'client_secret',
    'developer_token',
  ] as const) {
    const candidate = parsed[key];
    if (candidate === undefined) continue;
    if (typeof candidate !== 'string') {
      throw new Error('Stored Google provider configuration is invalid.');
    }
    const normalizedCandidate = candidate.trim();
    if (!validValue(normalizedCandidate)) {
      throw new Error('Stored Google provider configuration is invalid.');
    }
    result[key] = normalizedCandidate;
  }
  return result;
};

export const readGoogleProviderConfiguration = async (
  store: CredentialStore,
): Promise<GoogleProviderConfiguration | null> => {
  try {
    return parseConfiguration(await store.readCredential(
      GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF,
    ));
  } catch {
    return null;
  }
};

const statusFor = (
  configuration: GoogleProviderConfiguration | null,
): GoogleProviderConfigurationStatus => ({
  oauth_application_status:
    configuration?.client_id !== undefined
    && configuration.client_secret !== undefined
      ? 'AVAILABLE'
      : 'NOT_CONFIGURED',
  ads_developer_token_status:
    configuration?.developer_token !== undefined
      ? 'AVAILABLE'
      : 'NOT_CONFIGURED',
});

const failure = (
  code: GoogleProviderConfigurationResponse extends { ok: false }
    ? never
    : 'INVALID_PROVIDER_CONFIGURATION_INTENT'
      | 'SECRET_INGRESS_CANCELLED'
      | 'SECRET_INGRESS_FAILED'
      | 'SECRET_INPUT_INVALID'
      | 'CREDENTIAL_PERSISTENCE_FAILED',
  retryable: boolean,
): GoogleProviderConfigurationResponse => ({
  ok: false,
  error: { code, retryable },
});

const isIntent = (
  value: unknown,
): value is ConfigureGoogleProviderIntent => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && Object.keys(value).length === 1
  && (
    (value as { component?: unknown }).component === 'OAUTH_APPLICATION'
    || (value as { component?: unknown }).component === 'ADS_DEVELOPER_TOKEN'
  )
);

export class GoogleProviderConfigurationService {
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: {
    credential_store: CredentialStore;
    secret_ingress: SecretIngressPort;
  }) {}

  async getStatus(): Promise<GoogleProviderConfigurationStatus> {
    return statusFor(await readGoogleProviderConfiguration(
      this.dependencies.credential_store,
    ));
  }

  async isReadyForSource(
    sourceId: DesktopGoogleConnectionSourceId,
  ): Promise<boolean> {
    const status = await this.getStatus();
    return status.oauth_application_status === 'AVAILABLE'
      && (
        sourceId === 'google-search-console-query-page'
        || status.ads_developer_token_status === 'AVAILABLE'
      );
  }

  configure(value: unknown): Promise<GoogleProviderConfigurationResponse> {
    if (!isIntent(value)) {
      return Promise.resolve(failure(
        'INVALID_PROVIDER_CONFIGURATION_INTENT',
        false,
      ));
    }
    return this.serialize(() => this.configureNormalized(value.component));
  }

  private async configureNormalized(
    component: GoogleProviderConfigurationComponent,
  ): Promise<GoogleProviderConfigurationResponse> {
    const purposes: SecretIngressPurpose[] = component === 'OAUTH_APPLICATION'
      ? ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']
      : ['GOOGLE_ADS_DEVELOPER_TOKEN'];
    const submitted: string[] = [];
    for (const purpose of purposes) {
      let ingress: SecretIngressResult;
      try {
        ingress = await this.dependencies.secret_ingress.requestSecret({
          purpose,
        });
      } catch {
        return failure('SECRET_INGRESS_FAILED', true);
      }
      if (ingress.status === 'CANCELLED') {
        return failure('SECRET_INGRESS_CANCELLED', false);
      }
      if (ingress.status === 'FAILED') {
        return failure('SECRET_INGRESS_FAILED', true);
      }
      const normalizedSecret = ingress.secret.trim();
      if (!validValue(normalizedSecret)) {
        return failure('SECRET_INPUT_INVALID', false);
      }
      submitted.push(normalizedSecret);
    }

    const previous = await readGoogleProviderConfiguration(
      this.dependencies.credential_store,
    );
    const next: GoogleProviderConfiguration = component === 'OAUTH_APPLICATION'
      ? {
        ...(previous ?? {}),
        client_id: submitted[0],
        client_secret: submitted[1],
      }
      : {
        ...(previous ?? {}),
        developer_token: submitted[0],
      };

    try {
      await this.dependencies.credential_store.writeCredential(
        GOOGLE_PROVIDER_CONFIGURATION_CREDENTIAL_REF,
        JSON.stringify(next),
      );
    } catch {
      return failure('CREDENTIAL_PERSISTENCE_FAILED', true);
    }

    return {
      ok: true,
      result: {
        component,
        status: statusFor(next),
      },
    };
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      (): void => undefined,
      (): void => undefined,
    );
    return result;
  }
}
