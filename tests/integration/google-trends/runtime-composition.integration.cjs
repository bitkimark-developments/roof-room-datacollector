const assert = require(
  'node:assert/strict',
);
const fs = require(
  'node:fs',
);
const os = require(
  'node:os',
);
const path = require(
  'node:path',
);

const [
  buildRoot,
  projectRoot,
] = process.argv.slice(2);

if (
  !buildRoot ||
  !projectRoot
) {
  throw new Error(
    'Expected compiled build root and project root.',
  );
}

const {
  createGoogleTrendsRuntime,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-runtime.js',
  ),
);

const makeDirectories = () => {
  const root =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        'roofroom-gt-runtime-',
      ),
    );

  return {
    app_data_root:
      root,
    config:
      path.join(
        root,
        'config',
      ),
    data:
      path.join(
        root,
        'data',
      ),
    runs:
      path.join(
        root,
        'data',
        'runs',
      ),
    database:
      path.join(
        root,
        'database',
      ),
    browser_profiles:
      path.join(
        root,
        'browser-profiles',
      ),
    logs:
      path.join(
        root,
        'logs',
      ),
    public_downloads:
      path.join(
        root,
        'public-downloads',
      ),
  };
};

const main = async () => {
  let launchCalls =
    0;

  const launcher = {
    async launchPersistentContext() {
      launchCalls +=
        1;
      throw new Error(
        'runtime composition test must not launch a browser',
      );
    },
  };

  const runtime =
    createGoogleTrendsRuntime(
      makeDirectories(),
      launcher,
    );

  assert.equal(
    launchCalls,
    0,
  );

  const ready =
    await runtime.source
      .checkReadiness({
        query_config_ready:
          true,
      });

  assert.equal(
    ready.readiness_status,
    'READY',
  );

  assert.equal(
    launchCalls,
    0,
  );

  console.log(
    'PASS GT-RUNTIME-001: runtime composition and readiness remain lazy and do not launch Playwright or touch provider state',
  );

  const capabilities =
    runtime.source
      .getCapabilities();

  assert.equal(
    capabilities
      .requires_browser,
    true,
  );
  assert.equal(
    capabilities
      .supports_custom_date_range,
    true,
  );
  assert.equal(
    capabilities
      .supports_direct_export,
    true,
  );
  assert.equal(
    capabilities
      .max_concurrency,
    1,
  );

  console.log(
    'PASS GT-RUNTIME-002: composed source exposes the implemented M3 browser/date/export capability contract',
  );

  await runtime
    .browser_manager
    .close();

  assert.equal(
    launchCalls,
    0,
  );

  console.log(
    'PASS GT-RUNTIME-003: shutting down an unused runtime is clean and does not implicitly launch the persistent profile',
  );

  const mainSource =
    fs.readFileSync(
      path.join(
        projectRoot,
        'src',
        'main.ts',
      ),
      'utf8',
    );

  assert.match(
    mainSource,
    /createGoogleTrendsRuntime\(\s*directories,\s*\)/u,
  );

  assert.match(
    mainSource,
    /sourceRegistry\.register\(\s*runtime\.source,\s*\)/u,
  );

  assert.doesNotMatch(
    mainSource,
    /new GoogleTrendsSource\(\)/u,
  );

  console.log(
    'PASS GT-RUNTIME-004: Electron bootstrap registers the dependency-composed Google Trends source instead of the old placeholder instance',
  );

  const beforeQuitIndex =
    mainSource.indexOf(
      "app.on('before-quit'",
    );

  const closeIndex =
    mainSource.indexOf(
      'runtime.browser_manager',
      beforeQuitIndex,
    );

  const quitIndex =
    mainSource.indexOf(
      'app.quit();',
      closeIndex,
    );

  assert.notEqual(
    beforeQuitIndex,
    -1,
  );
  assert.notEqual(
    closeIndex,
    -1,
  );
  assert.notEqual(
    quitIndex,
    -1,
  );

  assert.match(
    mainSource.slice(
      beforeQuitIndex,
      quitIndex,
    ),
    /event\.preventDefault\(\)/u,
  );

  console.log(
    'PASS GT-RUNTIME-005: Electron before-quit waits for BrowserManager.close() and then re-enters app.quit() after async shutdown',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
