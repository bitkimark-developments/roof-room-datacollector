import * as os from 'node:os';
import * as path from 'node:path';
import { mkdir } from 'node:fs/promises';

import {
  bootstrapGoogleOAuthInElectron,
} from '../../src/main/app/google-api-electron-composition';
import {
  initializeDatabase,
  getDatabasePath,
} from '../../src/main/storage/database';
import {
  StateRepository,
} from '../../src/main/storage/state-repository';
import {
  GSC_QUERY_PAGE_SOURCE_ID,
} from '../../src/shared/google-api';
import {
  GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
  GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
} from '../../src/main/sources/google-api/google-auth';
import type {
  ApplicationDirectories,
} from '../../src/shared/bootstrap-status';

const CONFIRMATION_FLAG = '--confirm-live-google-oauth';
const WORKSPACE_NAME_PREFIX = '--workspace-name=';
const SITE_URL_PREFIX = '--site-url=';

const usage = (): string => [
  'Usage:',
  '  bash scripts/m3/run-live-google-gsc-oauth-bootstrap.sh \\',
  `    ${CONFIRMATION_FLAG} \\`,
  '    --workspace-name="Bitkimark Production" \\',
  '    --site-url="sc-domain:bitkimark.com"',
  '',
  'Required environment:',
  '  ROOFROOM_GOOGLE_CLIENT_ID',
  '',
  'Optional environment:',
  '  ROOFROOM_GOOGLE_CLIENT_SECRET',
  '',
  'Safety:',
  '  - opens Google OAuth in the system browser',
  '  - requests Search Console read-only scope only',
  '  - stores refresh credential through Electron safeStorage',
  '  - never prints client secret, refresh token, access token, or credential contents',
  '  - performs no Search Console data collection',
].join('\n');

const valueFor = (
  args: readonly string[],
  prefix: string,
): string | null => {
  const matches = args.filter((arg) => arg.startsWith(prefix));
  if (matches.length > 1) {
    throw new Error(`Duplicate argument: ${prefix}`);
  }

  if (matches.length === 0) return null;

  const value = matches[0].slice(prefix.length).trim();
  if (!value) throw new Error(`${prefix} requires a non-empty value.`);
  return value;
};

const createDirectories = (
  appDataRoot: string,
): ApplicationDirectories => ({
  app_data_root: appDataRoot,
  config: path.join(appDataRoot, 'config'),
  data: path.join(appDataRoot, 'data'),
  runs: path.join(appDataRoot, 'data', 'runs'),
  database: path.join(appDataRoot, 'database'),
  browser_profiles: path.join(appDataRoot, 'browser-profiles'),
  logs: path.join(appDataRoot, 'logs'),
  public_downloads: path.join(
    os.homedir(),
    'Downloads',
    'RoofRoom Data Collector',
  ),
});

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(usage());
    process.exit(0);
  }

  const allowed = args.every(
    (arg) =>
      arg === CONFIRMATION_FLAG ||
      arg.startsWith(WORKSPACE_NAME_PREFIX) ||
      arg.startsWith(SITE_URL_PREFIX),
  );

  if (!allowed) {
    throw new Error('Unsupported argument.');
  }

  if (!args.includes(CONFIRMATION_FLAG)) {
    throw new Error(
      `Refusing live Google OAuth without ${CONFIRMATION_FLAG}.`,
    );
  }

  const workspaceName = valueFor(
    args,
    WORKSPACE_NAME_PREFIX,
  );

  const siteUrl = valueFor(
    args,
    SITE_URL_PREFIX,
  );

  if (!workspaceName) {
    throw new Error('A Workspace name is required.');
  }

  if (!siteUrl) {
    throw new Error('A Search Console property is required.');
  }

  const clientId =
    process.env.ROOFROOM_GOOGLE_CLIENT_ID?.trim();

  if (!clientId) {
    throw new Error(
      'ROOFROOM_GOOGLE_CLIENT_ID is required.',
    );
  }

  const clientSecret =
    process.env.ROOFROOM_GOOGLE_CLIENT_SECRET?.trim() ||
    undefined;

  const { app } = await import('electron');

  app.setPath(
    'userData',
    path.join(
      app.getPath('appData'),
      'RoofRoom Data Collector',
    ),
  );

  await app.whenReady();

  const directories = createDirectories(
    path.join(app.getPath('userData'), 'app-data'),
  );

  await Promise.all([
    directories.database,
    directories.data,
    directories.runs,
    directories.logs,
    path.join(directories.app_data_root, 'credentials'),
  ].map((directory) =>
    mkdir(directory, { recursive: true }),
  ));

  const bootstrap = initializeDatabase(directories);

  if (bootstrap.status !== 'READY') {
    throw new Error(bootstrap.error);
  }

  const repository = new StateRepository(
    getDatabasePath(directories),
  );

  try {
    const matches = repository
      .listWorkspaces()
      .filter(
        (workspace) =>
          workspace.workspace_name === workspaceName,
      );

    if (matches.length > 1) {
      throw new Error(
        `Multiple Workspaces share the name: ${workspaceName}`,
      );
    }

    const workspace =
      matches[0] ??
      repository.createWorkspace({
        workspace_name: workspaceName,
      });

    const connection =
      await bootstrapGoogleOAuthInElectron(
        {
          workspace_id: workspace.workspace_id,
          source_id: GSC_QUERY_PAGE_SOURCE_ID,
          confirmation:
            GOOGLE_LIVE_ACCEPTANCE_CONFIRMATION,
          client_id: clientId,
          client_secret: clientSecret,
          scopes: [
            GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
          ],
          safe_metadata: {
            site_url: siteUrl,
          },
        },
        directories,
        repository,
      );

    console.log(JSON.stringify({
      workspace_id: workspace.workspace_id,
      workspace_name: workspace.workspace_name,
      source_id: connection.source_id,
      site_url: connection.safe_metadata.site_url,
      authorization_state:
        connection.safe_metadata.authorization_state,
      credential_present:
        connection.credential_ref !== null,
    }, null, 2));
  } finally {
    repository.close();
    app.quit();
  }
};

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Google GSC OAuth bootstrap failed.',
  );
  process.exitCode = 1;
});
