const assert = require(
  'node:assert/strict',
);
const path = require(
  'node:path',
);
const {
  loadConfigFromFile,
} = require(
  'vite',
);

const [projectRoot] =
  process.argv.slice(2);

if (!projectRoot) {
  throw new Error(
    'Expected project root.',
  );
}

const main = async () => {
  const loaded =
    await loadConfigFromFile(
      {
        command:
          'build',
        mode:
          'production',
      },
      path.join(
        projectRoot,
        'vite.main.config.ts',
      ),
      projectRoot,
    );

  assert.ok(
    loaded,
    'Expected Vite main config to load.',
  );

  const external =
    loaded.config
      .build
      ?.rollupOptions
      ?.external;

  assert.deepEqual(
    external,
    [
      'playwright',
    ],
  );

  const forgeConfig =
    await loadConfigFromFile(
      {
        command:
          'build',
        mode:
          'production',
      },
      path.join(
        projectRoot,
        'forge.config.ts',
      ),
      projectRoot,
    );

  assert.ok(
    forgeConfig,
    'Expected Electron Forge config to load.',
  );

  const ignore =
    forgeConfig.config
      .packagerConfig
      ?.ignore;

  assert.equal(
    typeof ignore,
    'function',
    'Packaging must define an allowlist that keeps external runtime dependencies.',
  );
  assert.equal(
    ignore('/.vite/build/main.js'),
    false,
  );
  assert.equal(
    ignore('/node_modules'),
    false,
  );
  assert.equal(
    ignore('/node_modules/playwright/index.js'),
    false,
  );
  assert.equal(
    ignore('/node_modules/playwright-core/index.js'),
    false,
  );
  assert.equal(
    ignore('/src/main.ts'),
    true,
  );

  const osxSign =
    forgeConfig.config
      .packagerConfig
      ?.osxSign;
  assert.equal(
    typeof osxSign,
    'object',
  );

  const {
    optionsForFile,
    ...baseOsxSign
  } = osxSign;

  assert.deepEqual(
    baseOsxSign,
    {
      identity:
        '-',
      identityValidation:
        false,
      continueOnError:
        false,
    },
    'Local macOS packages must receive a valid ad-hoc signature without requiring Apple credentials.',
  );
  assert.equal(
    typeof optionsForFile,
    'function',
  );
  assert.deepEqual(
    optionsForFile('/tmp/RoofRoom Data Collector.app'),
    {
      hardenedRuntime:
        false,
      signatureFlags:
        '0',
    },
    'Every nested binary must clear inherited hardened-runtime flags for certificate-free local signing.',
  );

  console.log(
    'PASS GT-PACKAGE-001: Playwright remains an explicit external Node runtime dependency in the Electron main-process Vite build',
  );
  console.log(
    'PASS GT-PACKAGE-002: production packaging keeps external runtime dependencies and applies fail-closed local ad-hoc signing',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
