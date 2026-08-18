const assert = require(
  'node:assert/strict',
);
const {
  EventEmitter,
} = require(
  'node:events',
);
const path = require(
  'node:path',
);

const [buildRoot, workRoot] =
  process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error(
    'Expected compiled build root and temporary work root.',
  );
}

const {
  BrowserManager,
} = require(
  path.join(
    buildRoot,
    'main',
    'browser',
    'browser-manager.js',
  ),
);

const {
  GoogleTrendsBrowserProbeService,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-browser-probe-service.js',
  ),
);

const appDataRoot = path.join(
  workRoot,
  'app-data',
);

const directories = {
  app_data_root: appDataRoot,
  config: path.join(
    appDataRoot,
    'config',
  ),
  data: path.join(
    appDataRoot,
    'data',
  ),
  runs: path.join(
    appDataRoot,
    'data',
    'runs',
  ),
  database: path.join(
    appDataRoot,
    'database',
  ),
  browser_profiles: path.join(
    appDataRoot,
    'browser-profiles',
  ),
  logs: path.join(
    appDataRoot,
    'logs',
  ),
};

class FakeResponse {
  constructor(
    status,
    retryAfter = null,
  ) {
    this.statusCode = status;
    this.retryAfter =
      retryAfter;
    this.headerRequests = [];
  }

  status() {
    return this.statusCode;
  }

  async headerValue(name) {
    this.headerRequests.push(
      name,
    );

    return (
      name.toLowerCase() ===
        'retry-after'
        ? this.retryAfter
        : null
    );
  }
}

class FakePage {
  constructor({
    response,
    title,
    body,
  }) {
    this.response = response;
    this.titleValue = title;
    this.body = body;
    this.gotoCalls = [];
    this.closeCalls = 0;
  }

  async goto(url, options) {
    this.gotoCalls.push({
      url,
      options,
    });

    return this.response;
  }

  async title() {
    return this.titleValue;
  }

  locator(selector) {
    assert.equal(
      selector,
      'body',
    );

    return {
      innerText: async () =>
        this.body,
    };
  }

  async close() {
    this.closeCalls += 1;
  }
}

class FakeContext
  extends EventEmitter
{
  constructor(page) {
    super();
    this.page = page;
    this.newPageCalls = 0;
    this.closeCalls = 0;
  }

  pages() {
    return [];
  }

  async newPage() {
    this.newPageCalls += 1;
    return this.page;
  }

  async close() {
    this.closeCalls += 1;
    this.emit('close');
  }
}

class FakeLauncher {
  constructor(context) {
    this.context = context;
    this.calls = [];
  }

  async launchPersistentContext(
    userDataDir,
    options,
  ) {
    this.calls.push({
      userDataDir,
      options: {
        ...options,
      },
    });

    return this.context;
  }
}

const main = async () => {
  const rateLimitedResponse =
    new FakeResponse(
      429,
      '180',
    );

  const rateLimitedPage =
    new FakePage({
      response:
        rateLimitedResponse,
      title:
        'Error 429 (Too Many Requests)',
      body: [
        "429. That's an error.",
        'You have sent too many requests to us recently.',
        'Please try again later.',
      ].join(' '),
    });

  const context =
    new FakeContext(
      rateLimitedPage,
    );

  const launcher =
    new FakeLauncher(
      context,
    );

  const browserManager =
    new BrowserManager(
      directories,
      launcher,
    );

  const service =
    new GoogleTrendsBrowserProbeService(
      browserManager,
    );

  const result =
    await service.probe();

  assert.equal(
    result.provider_state,
    'RATE_LIMITED',
  );

  assert.equal(
    result.error_code,
    'RATE_LIMITED',
  );

  assert.equal(
    result.retry_after,
    '180',
  );

  assert.equal(
    launcher.calls.length,
    1,
  );

  assert.equal(
    launcher.calls[0]
      .userDataDir,
    path.join(
      directories.browser_profiles,
      'google',
    ),
  );

  assert.deepEqual(
    launcher.calls[0].options,
    {
      headless: false,
      acceptDownloads: true,
    },
  );

  assert.equal(
    context.newPageCalls,
    1,
  );

  assert.equal(
    rateLimitedPage
      .gotoCalls.length,
    1,
  );

  assert.equal(
    rateLimitedPage.closeCalls,
    1,
  );

  assert.deepEqual(
    rateLimitedResponse
      .headerRequests,
    [
      'retry-after',
    ],
  );

  // Probe service owns only its dedicated page.
  // BrowserManager lifecycle remains caller-owned.
  assert.equal(
    browserManager
      .getState()
      .status,
    'OPEN',
  );

  assert.equal(
    context.closeCalls,
    0,
  );

  await browserManager.close();

  assert.equal(
    context.closeCalls,
    1,
  );

  // A normal Explore-like response remains a
  // non-rate-limit signal without any retry loop.
  const normalPage =
    new FakePage({
      response:
        new FakeResponse(
          200,
        ),
      title:
        'Google Trends',
      body:
        'Explore Interest over time',
    });

  const normalContext =
    new FakeContext(
      normalPage,
    );

  const normalManager =
    new BrowserManager(
      directories,
      new FakeLauncher(
        normalContext,
      ),
    );

  const normalService =
    new GoogleTrendsBrowserProbeService(
      normalManager,
    );

  const normalResult =
    await normalService.probe();

  assert.equal(
    normalResult.provider_state,
    'NO_RATE_LIMIT_SIGNAL',
  );

  assert.equal(
    normalPage.gotoCalls.length,
    1,
  );

  assert.equal(
    normalPage.closeCalls,
    1,
  );

  await normalManager.close();

  console.log(
    'PASS GT-BROWSER-PROBE-001: provider probe uses the app-owned google browser profile',
  );
  console.log(
    'PASS GT-BROWSER-PROBE-002: probe uses one dedicated managed page and exactly one navigation attempt',
  );
  console.log(
    'PASS GT-BROWSER-PROBE-003: HTTP 429 maps through BrowserManager to RATE_LIMITED with Retry-After evidence',
  );
  console.log(
    'PASS GT-BROWSER-PROBE-004: probe page closes after classification without auto-refresh or retry',
  );
  console.log(
    'PASS GT-BROWSER-PROBE-005: BrowserManager lifecycle remains caller-owned after the probe',
  );
  console.log(
    'PASS GT-BROWSER-PROBE-006: normal Explore-like response remains NO_RATE_LIMIT_SIGNAL',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
