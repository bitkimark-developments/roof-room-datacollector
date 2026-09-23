const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const {
  WorkspaceConnectionIntentValidationError,
  normalizeConnectGoogleWorkspaceConnectionIntent,
  normalizeDisconnectWorkspaceConnectionIntent,
  normalizeManageWorkspaceConnectionIntent,
  normalizeReconnectGoogleWorkspaceConnectionIntent,
} = require(
  path.join(buildRoot, 'main', 'app', 'workspace-connection-metadata.js'),
);

const expectInvalid = (operation, label) => {
  assert.throws(
    operation,
    (error) => {
      assert.ok(error instanceof WorkspaceConnectionIntentValidationError, label);
      assert.equal(error.code, 'INVALID_CONNECTION_INTENT', label);
      assert.equal(error.message, 'Workspace connection intent is invalid.', label);
      const serialized = JSON.stringify(error);
      assert.equal(serialized.includes('sentinel-secret'), false, label);
      assert.equal(serialized.includes('credential_ref'), false, label);
      return true;
    },
  );
};

assert.deepEqual(
  normalizeManageWorkspaceConnectionIntent({
    workspace_id: '  ws_fixture  ',
    source_id: 'google-search-console-query-page',
    metadata: { site_url: '  sc-domain:example.com  ' },
  }),
  {
    workspace_id: 'ws_fixture',
    source_id: 'google-search-console-query-page',
    metadata: { site_url: 'sc-domain:example.com' },
  },
);

assert.deepEqual(
  normalizeConnectGoogleWorkspaceConnectionIntent({
    workspace_id: 'ws_fixture',
    source_id: 'google-ads-search-terms',
    metadata: {
      customer_id: ' 123-456-7890 ',
      login_customer_id: ' 987-654-3210 ',
    },
  }),
  {
    workspace_id: 'ws_fixture',
    source_id: 'google-ads-search-terms',
    metadata: {
      customer_id: '123-456-7890',
      login_customer_id: '987-654-3210',
    },
  },
);

assert.deepEqual(
  normalizeManageWorkspaceConnectionIntent({
    workspace_id: 'ws_fixture',
    source_id: 'google-keyword-planner',
    metadata: {
      customer_id: '123',
      login_customer_id: '   ',
    },
  }),
  {
    workspace_id: 'ws_fixture',
    source_id: 'google-keyword-planner',
    metadata: { customer_id: '123' },
  },
);

assert.deepEqual(
  normalizeReconnectGoogleWorkspaceConnectionIntent({
    workspace_id: 'ws_fixture',
    source_id: 'google-keyword-planner',
  }),
  {
    workspace_id: 'ws_fixture',
    source_id: 'google-keyword-planner',
  },
);

assert.deepEqual(
  normalizeDisconnectWorkspaceConnectionIntent({
    workspace_id: ' ws_fixture ',
    source_id: 'serpapi',
  }),
  {
    workspace_id: 'ws_fixture',
    source_id: 'serpapi',
  },
);

const invalidCases = [
  [
    'unknown top-level key',
    () => normalizeManageWorkspaceConnectionIntent({
      workspace_id: 'ws_fixture',
      source_id: 'google-search-console-query-page',
      metadata: { site_url: 'sc-domain:example.com' },
      credential_ref: 'sentinel-secret',
    }),
  ],
  [
    'unknown Search Console metadata key',
    () => normalizeConnectGoogleWorkspaceConnectionIntent({
      workspace_id: 'ws_fixture',
      source_id: 'google-search-console-query-page',
      metadata: {
        site_url: 'sc-domain:example.com',
        refresh_token: 'sentinel-secret',
      },
    }),
  ],
  [
    'unknown Ads metadata key',
    () => normalizeManageWorkspaceConnectionIntent({
      workspace_id: 'ws_fixture',
      source_id: 'google-ads-search-terms',
      metadata: {
        customer_id: '123',
        developer_token: 'sentinel-secret',
      },
    }),
  ],
  [
    'blank required metadata',
    () => normalizeManageWorkspaceConnectionIntent({
      workspace_id: 'ws_fixture',
      source_id: 'google-keyword-planner',
      metadata: { customer_id: '   ' },
    }),
  ],
  [
    'SerpApi Manage',
    () => normalizeManageWorkspaceConnectionIntent({
      workspace_id: 'ws_fixture',
      source_id: 'serpapi',
      metadata: {},
    }),
  ],
  [
    'SerpApi Google Connect',
    () => normalizeConnectGoogleWorkspaceConnectionIntent({
      workspace_id: 'ws_fixture',
      source_id: 'serpapi',
      metadata: {},
    }),
  ],
  [
    'SerpApi Google Reconnect',
    () => normalizeReconnectGoogleWorkspaceConnectionIntent({
      workspace_id: 'ws_fixture',
      source_id: 'serpapi',
    }),
  ],
  [
    'unsupported Disconnect source',
    () => normalizeDisconnectWorkspaceConnectionIntent({
      workspace_id: 'ws_fixture',
      source_id: 'google-trends',
    }),
  ],
  [
    'non-object input',
    () => normalizeDisconnectWorkspaceConnectionIntent('sentinel-secret'),
  ],
];

for (const [label, operation] of invalidCases) {
  expectInvalid(operation, label);
}

console.log(
  'PASS WORKSPACE-CONNECTION-METADATA-001: action-specific intents accept only normalized safe metadata and reject secret-shaped input',
);
