import { shell } from 'electron';
import * as path from 'node:path';

import type { ApplicationDirectories } from '../../shared/bootstrap-status';
import type { JsonObject } from '../../shared/run-job';
import type { DesktopGoogleConnectionSourceId } from '../../shared/workspace-connection-management';
import type { WorkspaceSourceConnectionRecord } from '../../shared/workspace-connection';
import { ElectronSafeStorageCredentialStore } from '../core/electron-safe-storage-credential-store';
import type { CredentialStore } from '../core/credential-store';
import type { StateRepository } from '../storage/state-repository';
import { createFetchApiRequester } from '../sources/google-api/api-helpers';
import { GoogleApiRuntimeFactory } from '../sources/google-api/google-api-runtime';
import { bootstrapGoogleOAuth } from '../sources/google-api/google-auth';
import {
  MainProcessGoogleOAuthCredentialAcquirer,
} from '../sources/google-api/google-oauth-credential-acquirer';
import {
  GoogleProviderConfigurationService,
  readGoogleProviderConfiguration,
} from '../sources/google-api/google-provider-configuration';
import { MacOsascriptSecretIngress } from './macos-osascript-secret-ingress';

const credentialDirectory = (
  directories: ApplicationDirectories,
): string => path.join(directories.app_data_root, 'credentials');

export const createElectronGoogleApiRuntimeFactory = (
  directories: ApplicationDirectories,
  repository: StateRepository,
): GoogleApiRuntimeFactory => new GoogleApiRuntimeFactory(
  repository,
  new ElectronSafeStorageCredentialStore(credentialDirectory(directories)),
  createFetchApiRequester(),
);

export const createElectronGoogleOAuthCredentialAcquirer = (
  credentialStore: CredentialStore,
): MainProcessGoogleOAuthCredentialAcquirer => (
  new MainProcessGoogleOAuthCredentialAcquirer({
    store: credentialStore,
    requester: createFetchApiRequester(),
    openExternal: async (url) => shell.openExternal(url),
    application_configuration_provider: async () => {
      const configuration = await readGoogleProviderConfiguration(
        credentialStore,
      );
      return configuration?.client_id !== undefined
        && configuration.client_secret !== undefined
        ? {
          client_id: configuration.client_id,
          client_secret: configuration.client_secret,
          ...(configuration.developer_token === undefined
            ? {}
            : { developer_token: configuration.developer_token }),
        }
        : null;
    },
    record_diagnostic: (event) => {
      console.warn('Google OAuth diagnostic.', event);
    },
  })
);

export const createElectronGoogleProviderConfigurationService = (
  credentialStore: CredentialStore,
): GoogleProviderConfigurationService => (
  new GoogleProviderConfigurationService({
    credential_store: credentialStore,
    secret_ingress: new MacOsascriptSecretIngress(),
  })
);

/**
 * Main-process-only explicit OAuth entry point. It intentionally exposes no
 * renderer IPC and never returns credential material.
 */
export const bootstrapGoogleOAuthInElectron = async (
  input: {
    workspace_id: string;
    source_id: DesktopGoogleConnectionSourceId;
    confirmation: string | undefined;
    client_id: string;
    client_secret?: string;
    developer_token?: string;
    scopes: string[];
    safe_metadata: JsonObject;
  },
  directories: ApplicationDirectories,
  repository: StateRepository,
): Promise<WorkspaceSourceConnectionRecord> => bootstrapGoogleOAuth(
  input,
  {
    store: new ElectronSafeStorageCredentialStore(
      credentialDirectory(directories),
    ),
    repository,
    requester: createFetchApiRequester(),
    openExternal: async (url) => shell.openExternal(url),
  },
);
