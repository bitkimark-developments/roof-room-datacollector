import * as path from 'node:path';
import type { ApplicationDirectories } from '../../shared/bootstrap-status';
import type { StateRepository } from '../storage/state-repository';
import { ElectronSafeStorageCredentialStore } from '../core/electron-safe-storage-credential-store';
import { SerpApiRuntimeFactory } from '../sources/serpapi/serpapi-runtime';

export const createElectronSerpApiRuntimeFactory = (
  directories: ApplicationDirectories,
  repository: StateRepository,
): SerpApiRuntimeFactory => new SerpApiRuntimeFactory(
  repository,
  new ElectronSafeStorageCredentialStore(
    path.join(directories.app_data_root, 'credentials'),
  ),
);
