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

  console.log(
    'PASS GT-PACKAGE-001: Playwright remains an explicit external Node runtime dependency in the Electron main-process Vite build',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
