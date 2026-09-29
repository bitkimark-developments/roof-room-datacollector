const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const buildRoot = process.argv[2];
const projectRoot = process.argv[3];
if (!buildRoot || !projectRoot) {
  throw new Error('Expected compiled build root and project root arguments.');
}

const {
  createElectronGoogleOAuthCredentialAcquirer,
  createElectronGoogleProviderConfigurationService,
} = require(
  path.join(buildRoot, 'main', 'app', 'google-api-electron-composition.js'),
);
const {
  createElectronSerpApiCredentialAcquirer,
} = require(
  path.join(buildRoot, 'main', 'app', 'serpapi-electron-composition.js'),
);

assert.equal(
  typeof createElectronGoogleOAuthCredentialAcquirer,
  'function',
  'Production must expose a main-owned Google OAuth acquirer composition.',
);
assert.equal(
  typeof createElectronGoogleProviderConfigurationService,
  'function',
  'Production must expose a main-owned Google provider provisioning composition.',
);
assert.equal(
  typeof createElectronSerpApiCredentialAcquirer,
  'function',
  'Production must expose a main-owned SerpApi credential acquirer composition.',
);

const existingBundle = JSON.stringify({
  client_id: 'existing-main-client',
  client_secret: 'sentinel-client-secret',
  refresh_token: 'sentinel-refresh-token',
  developer_token: 'sentinel-developer-token',
  granted_scopes: ['https://www.googleapis.com/auth/adwords'],
});
const store = {
  async hasCredential() { return true; },
  async readCredential(reference) {
    if (reference === 'provider:google:configuration:v1') {
      return JSON.stringify({
        client_id: 'provider-client',
        client_secret: 'sentinel-provider-secret',
        developer_token: 'sentinel-provider-developer-token',
      });
    }
    if (reference === 'cred:existing') return existingBundle;
    throw new Error('missing');
  },
  async writeCredential() { throw new Error('not expected'); },
  async deleteCredential() { throw new Error('not expected'); },
};

async function main() {
  const acquirer = createElectronGoogleOAuthCredentialAcquirer(store);
  const providerService = createElectronGoogleProviderConfigurationService(store);
  const serpApiAcquirer = createElectronSerpApiCredentialAcquirer(store);
  assert.equal(typeof serpApiAcquirer.acquire, 'function');
  assert.deepEqual(
    await acquirer.readApplicationConfiguration(),
    {
      client_id: 'provider-client',
      client_secret: 'sentinel-provider-secret',
    },
    'Normal application Connect must read only the active OAuth application configuration.',
  );
  assert.deepEqual(
    await acquirer.readApplicationConfiguration('cred:existing'),
    {
      client_id: 'provider-client',
      client_secret: 'sentinel-provider-secret',
    },
    'Provider configuration must take precedence over copied legacy bundle values without republishing the legacy Developer Token.',
  );
  assert.deepEqual(await providerService.getStatus(), {
    oauth_application_status: 'AVAILABLE',
  });

  const mainSource = fs.readFileSync(path.join(projectRoot, 'src', 'main.ts'), 'utf8');
  const googleCompositionSource = fs.readFileSync(
    path.join(projectRoot, 'src', 'main', 'app', 'google-api-electron-composition.ts'),
    'utf8',
  );
  const serpApiCompositionSource = fs.readFileSync(
    path.join(projectRoot, 'src', 'main', 'app', 'serpapi-electron-composition.ts'),
    'utf8',
  );
  const osascriptAdapterSource = fs.readFileSync(
    path.join(projectRoot, 'src', 'main', 'app', 'macos-osascript-secret-ingress.ts'),
    'utf8',
  );
  const preloadSource = fs.readFileSync(path.join(projectRoot, 'src', 'preload.ts'), 'utf8');
  const sharedIntentSource = fs.readFileSync(
    path.join(projectRoot, 'src', 'shared', 'workspace-connection-management.ts'),
    'utf8',
  );
  const serviceSource = fs.readFileSync(
    path.join(projectRoot, 'src', 'main', 'app', 'workspace-connection-management-service.ts'),
    'utf8',
  );

  assert.match(mainSource, /new WorkspaceConnectionManagementService\s*\(/);
  assert.match(mainSource, /repository:\s*desktopRepository/);
  assert.match(mainSource, /credential_store:\s*credentialStore/);
  assert.match(mainSource, /createElectronGoogleOAuthCredentialAcquirer\s*\(\s*credentialStore\s*,?\s*\)/);
  assert.match(mainSource, /createElectronGoogleProviderConfigurationService\s*\(\s*credentialStore\s*,?\s*\)/);
  assert.match(
    mainSource,
    /serpapi_credential_acquirer:\s*createElectronSerpApiCredentialAcquirer\s*\(\s*credentialStore\s*,?\s*\)/,
  );
  assert.match(
    mainSource,
    /refresh_safe_state:[\s\S]{0,250}getWorkspaceConnections\s*\(\s*workspaceId\s*,?\s*\)/,
  );
  assert.match(mainSource, /record_diagnostic:[\s\S]{0,180}recordWorkspaceConnectionDiagnostic/);

  for (const channelName of [
    'DESKTOP_CONNECTION_MANAGE',
    'DESKTOP_CONNECTION_DISCONNECT',
    'DESKTOP_CONNECTION_CONNECT_GOOGLE',
    'DESKTOP_CONNECTION_RECONNECT_GOOGLE',
    'GOOGLE_PROVIDER_CONFIGURATION',
    'GOOGLE_PROVIDER_CONFIGURE',
  ]) {
    assert.match(mainSource, new RegExp('ipcMain\\.handle\\(\\s*IPC_CHANNELS\\.' + channelName));
  }
  assert.match(
    mainSource,
    /IPC_CHANNELS\.DESKTOP_CONNECTIONS,\s*createDesktopWorkspaceConnectionsHandler/,
    'The existing read registration must remain intact.',
  );

  const rendererBoundary = preloadSource + sharedIntentSource;
  assert.equal(/ElectronSafeStorageCredentialStore|safeStorage/.test(rendererBoundary), false);
  assert.equal(/SecretIngressPort|MacOsascriptSecretIngress/.test(rendererBoundary), false);
  assert.equal(
    /clipboard/i.test(
      mainSource
      + googleCompositionSource
      + serpApiCompositionSource
      + serviceSource,
    ),
    false,
  );
  assert.equal(/process\.env[\s\S]{0,80}(GOOGLE|CLIENT_SECRET|DEVELOPER_TOKEN)/i.test(
    mainSource + googleCompositionSource,
  ), false);
  assert.match(serpApiCompositionSource, /new MacOsascriptSecretIngress\s*\(\s*\)/);
  assert.equal(/MacOsascriptSecretIngress/.test(mainSource + preloadSource), false);
  assert.match(osascriptAdapterSource, /'\/usr\/bin\/osascript'/);
  assert.equal(/\/usr\/bin\/osascript/.test(
    mainSource + googleCompositionSource + serpApiCompositionSource + preloadSource,
  ), false);
  assert.equal(/process\.env[\s\S]{0,80}(SERPAPI|API[_ -]?KEY|SECRET)/i.test(
    mainSource + serpApiCompositionSource,
  ), false);

  const serialized = JSON.stringify(await providerService.getStatus());
  assert.equal(serialized.includes('sentinel-'), false);

  console.log(
    'PASS DESKTOP-CONNECTION-WRITE-COMPOSITION-001: Electron main composes shared repository/store boundaries, main-owned OAuth and SerpApi acquisition, safe refresh, fixed diagnostics, and all trusted write handlers',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
