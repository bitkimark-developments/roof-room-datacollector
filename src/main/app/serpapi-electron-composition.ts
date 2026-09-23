import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ApplicationDirectories } from '../../shared/bootstrap-status';
import type { StateRepository } from '../storage/state-repository';
import { ElectronSafeStorageCredentialStore } from '../core/electron-safe-storage-credential-store';
import type { CredentialStore } from '../core/credential-store';
import { SerpApiRuntimeFactory } from '../sources/serpapi/serpapi-runtime';
import { MacOsascriptSecretIngress } from './macos-osascript-secret-ingress';
import {
  MainProcessSerpApiCredentialAcquirer,
  type SerpApiCredentialAcquirer,
} from '../sources/serpapi/serpapi-credential-acquirer';

export const createElectronSerpApiCredentialAcquirer = (
  credentialStore: CredentialStore,
): SerpApiCredentialAcquirer => new MainProcessSerpApiCredentialAcquirer({
  secret_ingress: new MacOsascriptSecretIngress(),
  credential_store: credentialStore,
  credential_ref_factory: () => (
    `serpapi:${randomBytes(24).toString('base64url')}`
  ),
});

export const createElectronSerpApiRuntimeFactory = (
  directories: ApplicationDirectories,
  repository: StateRepository,
): SerpApiRuntimeFactory => new SerpApiRuntimeFactory(
  repository,
  new ElectronSafeStorageCredentialStore(
    path.join(directories.app_data_root, 'credentials'),
  ),
);
