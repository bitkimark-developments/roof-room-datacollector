import type { CredentialStore } from '../../core/credential-store';
import type { SecretIngressPort } from '../../core/secret-ingress';

export type SerpApiCredentialAcquisition =
  | { status: 'ACQUIRED'; credential_ref: string }
  | { status: 'CANCELLED' };

export type SerpApiCredentialAcquisitionErrorCode =
  | 'SECRET_INGRESS_FAILED'
  | 'SECRET_INPUT_INVALID'
  | 'CREDENTIAL_PERSISTENCE_FAILED';

export class SerpApiCredentialAcquisitionError extends Error {
  constructor(
    public readonly code: SerpApiCredentialAcquisitionErrorCode,
  ) {
    super('SerpApi credential acquisition failed.');
    this.name = 'SerpApiCredentialAcquisitionError';
  }
}

export interface SerpApiCredentialAcquirer {
  acquire(): Promise<SerpApiCredentialAcquisition>;
}

export interface SerpApiCredentialAcquirerDependencies {
  secret_ingress: SecretIngressPort;
  credential_store: CredentialStore;
  credential_ref_factory: () => string;
}

export class MainProcessSerpApiCredentialAcquirer
implements SerpApiCredentialAcquirer {
  constructor(
    private readonly dependencies: SerpApiCredentialAcquirerDependencies,
  ) {}

  async acquire(): Promise<SerpApiCredentialAcquisition> {
    let ingress;
    try {
      ingress = await this.dependencies.secret_ingress.requestSecret({
        purpose: 'SERPAPI_API_KEY',
      });
    } catch {
      throw new SerpApiCredentialAcquisitionError('SECRET_INGRESS_FAILED');
    }
    if (ingress.status === 'CANCELLED') return { status: 'CANCELLED' };
    if (ingress.status === 'FAILED') {
      throw new SerpApiCredentialAcquisitionError('SECRET_INGRESS_FAILED');
    }
    if (!/^[\x21-\x7e]{1,512}$/.test(ingress.secret)) {
      throw new SerpApiCredentialAcquisitionError('SECRET_INPUT_INVALID');
    }

    let credentialRef: string;
    try {
      credentialRef = this.dependencies.credential_ref_factory();
    } catch {
      throw new SerpApiCredentialAcquisitionError(
        'CREDENTIAL_PERSISTENCE_FAILED',
      );
    }

    try {
      await this.dependencies.credential_store.writeCredential(
        credentialRef,
        ingress.secret,
      );
      return { status: 'ACQUIRED', credential_ref: credentialRef };
    } catch {
      try {
        await this.dependencies.credential_store.deleteCredential(
          credentialRef,
        );
      } catch {
        // Cleanup is best-effort; raw errors and references stay private.
      }
      throw new SerpApiCredentialAcquisitionError(
        'CREDENTIAL_PERSISTENCE_FAILED',
      );
    }
  }
}
