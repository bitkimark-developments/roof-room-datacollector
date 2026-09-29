const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const {
  createGoogleProviderConfigurationHandlers,
} = require(path.join(
  buildRoot,
  'main',
  'app',
  'google-provider-configuration-ipc.js',
));

const calls = [];
const handlers = createGoogleProviderConfigurationHandlers({
  assertTrustedSender: (event) => {
    calls.push(['trusted', event.marker]);
    if (event.marker !== 'trusted') throw new Error('Untrusted IPC sender.');
  },
  service: {
    getStatus: async () => ({
      oauth_application_status: 'AVAILABLE',
      ads_developer_token_status: 'NOT_CONFIGURED',
      secret: 'must-not-cross',
    }),
    configure: async (intent) => {
      calls.push(['configure', structuredClone(intent)]);
      return {
        ok: true,
        result: {
          component: intent.component,
          status: {
            oauth_application_status: 'AVAILABLE',
            ads_developer_token_status: 'AVAILABLE',
          },
          credential_ref: 'must-not-cross',
        },
      };
    },
  },
});

const main = async () => {
  await assert.rejects(
    () => handlers.getStatus({ marker: 'untrusted' }),
    /untrusted ipc sender/i,
  );
  await assert.rejects(
    () => handlers.configure(
      { marker: 'untrusted' },
      { component: 'OAUTH_APPLICATION', secret: 'must-not-cross' },
    ),
    /untrusted ipc sender/i,
  );

  assert.deepEqual(await handlers.getStatus({ marker: 'trusted' }), {
    oauth_application_status: 'AVAILABLE',
  });

  for (const invalid of [
    null,
    {},
    { component: 'UNKNOWN' },
    { component: 'OAUTH_APPLICATION', value: 'must-not-cross' },
    { component: 'ADS_DEVELOPER_TOKEN', credential_ref: 'must-not-cross' },
  ]) {
    assert.deepEqual(
      await handlers.configure({ marker: 'trusted' }, invalid),
      {
        ok: false,
        error: {
          code: 'INVALID_PROVIDER_CONFIGURATION_INTENT',
          retryable: false,
        },
      },
    );
  }

  const configured = await handlers.configure(
    { marker: 'trusted' },
    { component: 'OAUTH_APPLICATION' },
  );
  assert.deepEqual(configured, {
    ok: true,
    result: {
      component: 'OAUTH_APPLICATION',
      status: {
        oauth_application_status: 'AVAILABLE',
      },
    },
  });
  assert.deepEqual(
    calls.filter(([kind]) => kind === 'configure'),
    [['configure', { component: 'OAUTH_APPLICATION' }]],
  );
  assert.equal(
    /must-not-cross/.test(JSON.stringify(configured)),
    false,
  );

  console.log(
    'PASS GOOGLE-PROVIDER-CONFIGURATION-MAIN-IPC-001: trusted main IPC accepts only secret-free provider intents and returns exact safe status',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
