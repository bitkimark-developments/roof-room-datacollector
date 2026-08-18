const assert = require('node:assert/strict');
const {
  EventEmitter,
} = require('node:events');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const [buildRoot, workRoot] =
  process.argv.slice(2);

if (!buildRoot || !workRoot) {
  throw new Error(
    'Expected compiled build root and temporary work root.',
  );
}

const {
  BrowserManager,
  BrowserManagerError,
} = require(
  path.join(
    buildRoot,
    'main',
    'browser',
    'browser-manager.js',
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

class FakePersistentContext
  extends EventEmitter
{
  constructor() {
    super();
    this.closeCalls = 0;
  }

  async close() {
    this.closeCalls += 1;
    this.emit('close');
  }

  simulateUnexpectedClose() {
    this.emit('close');
  }
}

class FakeLauncher {
  constructor() {
    this.calls = [];
    this.delayMs = 5;
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

    await new Promise((resolve) =>
      setTimeout(
        resolve,
        this.delayMs,
      ),
    );

    return new FakePersistentContext();
  }
}

class FailingLauncher {
  async launchPersistentContext() {
    throw new Error(
      'browser executable unavailable',
    );
  }
}

const main = async () => {
  const unexpectedCloses = [];
  const launcher =
    new FakeLauncher();

  const manager =
    new BrowserManager(
      directories,
      launcher,
      {
        now: () =>
          new Date(
            '2026-08-18T12:30:00.000Z',
          ),
        onUnexpectedClose: (
          event,
        ) => {
          unexpectedCloses.push(
            event,
          );
        },
      },
    );

  assert.deepEqual(
    manager.getState(),
    {
      status: 'IDLE',
      profile_id: null,
      user_data_dir: null,
    },
  );

  const expectedProfilePath =
    path.join(
      directories.browser_profiles,
      'google',
    );

  // Concurrent requests for the same profile must
  // share one persistent context launch.
  const firstOpen =
    manager.openProfile('google');
  const secondOpen =
    manager.openProfile('google');

  assert.equal(
    manager.getState().status,
    'OPENING',
  );

  const [
    sessionA,
    sessionB,
  ] = await Promise.all([
    firstOpen,
    secondOpen,
  ]);

  assert.strictEqual(
    sessionA,
    sessionB,
  );

  assert.equal(
    launcher.calls.length,
    1,
  );

  assert.equal(
    launcher.calls[0]
      .userDataDir,
    expectedProfilePath,
  );

  assert.deepEqual(
    launcher.calls[0].options,
    {
      headless: false,
      acceptDownloads: true,
    },
  );

  assert.equal(
    fs.statSync(
      expectedProfilePath,
    ).isDirectory(),
    true,
  );

  assert.deepEqual(
    manager.getState(),
    {
      status: 'OPEN',
      profile_id: 'google',
      user_data_dir:
        expectedProfilePath,
    },
  );

  // A different persistent profile cannot be opened
  // while one is already active.
  await assert.rejects(
    () =>
      manager.openProfile(
        'semrush',
      ),
    (error) =>
      error instanceof
        BrowserManagerError &&
      error.code ===
        'ACTIVE_PROFILE_CONFLICT',
  );

  // Persist a harmless marker to prove the app-owned
  // profile directory survives close/reopen.
  const markerPath = path.join(
    expectedProfilePath,
    'profile-persistence.marker',
  );

  await fsp.writeFile(
    markerPath,
    'manual-session-state-placeholder',
    'utf8',
  );

  const firstContext =
    sessionA.context;

  await manager.close();

  assert.equal(
    firstContext.closeCalls,
    1,
  );

  assert.equal(
    unexpectedCloses.length,
    0,
  );

  assert.equal(
    manager.getState().status,
    'IDLE',
  );

  // Close is idempotent.
  await manager.close();

  assert.equal(
    firstContext.closeCalls,
    1,
  );

  const reopened =
    await manager.openProfile(
      'google',
      {
        headless: true,
        accept_downloads: false,
      },
    );

  assert.equal(
    launcher.calls.length,
    2,
  );

  assert.equal(
    reopened.user_data_dir,
    expectedProfilePath,
  );

  assert.deepEqual(
    launcher.calls[1].options,
    {
      headless: true,
      acceptDownloads: false,
    },
  );

  assert.equal(
    await fsp.readFile(
      markerPath,
      'utf8',
    ),
    'manual-session-state-placeholder',
  );

  // External context closure is surfaced rather than
  // silently re-launched.
  reopened.context
    .simulateUnexpectedClose();

  assert.equal(
    manager.getState().status,
    'IDLE',
  );

  assert.deepEqual(
    unexpectedCloses,
    [
      {
        profile_id: 'google',
        user_data_dir:
          expectedProfilePath,
        occurred_at:
          '2026-08-18T12:30:00.000Z',
      },
    ],
  );

  // Unsafe profile identifiers fail closed.
  for (const unsafe of [
    '../google',
    '/tmp/google',
    'Google',
    'google/default',
    '',
  ]) {
    await assert.rejects(
      () =>
        manager.openProfile(
          unsafe,
        ),
      (error) =>
        error instanceof
          BrowserManagerError &&
        error.code ===
          'INVALID_PROFILE_ID',
    );
  }

  // Launch errors are surfaced as controlled manager errors.
  const failingManager =
    new BrowserManager(
      directories,
      new FailingLauncher(),
    );

  await assert.rejects(
    () =>
      failingManager.openProfile(
        'google',
      ),
    (error) =>
      error instanceof
        BrowserManagerError &&
      error.code ===
        'LAUNCH_FAILED' &&
      /browser executable unavailable/
        .test(error.message),
  );

  assert.equal(
    failingManager
      .getState()
      .status,
    'IDLE',
  );

  console.log(
    'PASS BROWSER-001: app-owned persistent profile path is created under browser-profiles',
  );
  console.log(
    'PASS BROWSER-002: concurrent same-profile opens share exactly one managed context',
  );
  console.log(
    'PASS BROWSER-003: different profile cannot open while another context is active',
  );
  console.log(
    'PASS BROWSER-004: close is clean and idempotent',
  );
  console.log(
    'PASS BROWSER-005: profile directory survives close/reopen for manual session persistence',
  );
  console.log(
    'PASS BROWSER-006: headed mode and accepted downloads are safe defaults',
  );
  console.log(
    'PASS BROWSER-007: unsafe profile IDs fail closed and cannot escape the app profile root',
  );
  console.log(
    'PASS BROWSER-008: unexpected browser/context closure is surfaced without auto-restart',
  );
  console.log(
    'PASS BROWSER-009: browser launch failures surface as controlled errors',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
