const assert = require(
  'node:assert/strict',
);
const {
  mkdir,
  writeFile,
} = require(
  'node:fs/promises',
);
const path = require(
  'node:path',
);

const [buildRoot, fixtureRoot] =
  process.argv.slice(2);

if (!buildRoot || !fixtureRoot) {
  throw new Error(
    'Expected build and fixture roots.',
  );
}

const {
  findLatestExportWorkbook,
} = require(
  path.join(
    buildRoot,
    'src/main/app/application-file-access.js',
  ),
);

const directories = {
  app_data_root:
    fixtureRoot,
  config:
    path.join(
      fixtureRoot,
      'config',
    ),
  data:
    path.join(
      fixtureRoot,
      'data',
    ),
  runs:
    path.join(
      fixtureRoot,
      'data',
      'runs',
    ),
  database:
    path.join(
      fixtureRoot,
      'database',
    ),
  browser_profiles:
    path.join(
      fixtureRoot,
      'browser-profiles',
    ),
  logs:
    path.join(
      fixtureRoot,
      'logs',
    ),
  public_downloads:
    path.join(
      fixtureRoot,
      'downloads',
    ),
};

const makeWorkbook = async (
  runId,
  filename,
) => {
  const exportDirectory =
    path.join(
      directories.runs,
      runId,
      'exports',
    );

  await mkdir(
    exportDirectory,
    {
      recursive: true,
    },
  );

  const workbookPath =
    path.join(
      exportDirectory,
      filename,
    );

  await writeFile(
    workbookPath,
    'fixture workbook',
    'utf8',
  );

  return workbookPath;
};

const main = async () => {
  await mkdir(
    directories.runs,
    {
      recursive: true,
    },
  );

  assert.equal(
    await findLatestExportWorkbook(
      directories,
    ),
    null,
  );

  const olderWorkbook =
    await makeWorkbook(
      'rr_20260819T100000000Z_older',
      'ROOFROOM_SEARCH_DEMAND_RAW_2026-08-19.xlsx',
    );

  await makeWorkbook(
    'rr_20260819T110000000Z_invalid',
    'unexpected.xlsx',
  );
  await mkdir(
    path.join(
      directories.runs,
      'rr_20260819T120000000Z_failed',
      'logs',
    ),
    {
      recursive: true,
    },
  );

  assert.equal(
    await findLatestExportWorkbook(
      directories,
    ),
    olderWorkbook,
  );

  const latestWorkbook =
    await makeWorkbook(
      'rr_20260819T130000000Z_latest',
      'ROOFROOM_SEARCH_DEMAND_RAW_2026-08-20.xlsx',
    );

  assert.equal(
    await findLatestExportWorkbook(
      directories,
    ),
    latestWorkbook,
  );

  console.log(
    'PASS DESKTOP-FILES-001..003: output discovery avoids technical run-ID navigation, skips runs without a valid workbook, and selects the latest canonical export',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
