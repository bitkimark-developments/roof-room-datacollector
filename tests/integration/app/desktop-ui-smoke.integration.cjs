const assert = require(
  'node:assert/strict',
);
const {
  chromium,
} = require(
  'playwright',
);

const [baseUrl] =
  process.argv.slice(2);

if (!baseUrl) {
  throw new Error(
    'Expected renderer base URL.',
  );
}

const applicationInfo = {
  name:
    'RoofRoom Data Collector',
  version:
    '1.0.0-test',
  platform:
    'darwin',
  architecture:
    'arm64',
  electronVersion:
    '43.4.0-test',
};

const directories = {
  app_data_root:
    '/fixture/app-data',
  config:
    '/fixture/app-data/config',
  data:
    '/fixture/app-data/data',
  runs:
    '/fixture/app-data/data/runs',
  database:
    '/fixture/app-data/database',
  browser_profiles:
    '/fixture/app-data/browser-profiles',
  logs:
    '/fixture/app-data/logs',
  public_downloads:
    '/fixture/downloads',
};

const bootstrapStatus = {
  directories,
  query_config: {
    status:
      'READY',
    config_path:
      '/fixture/app-data/config/query-groups.yaml',
    config: {
      config_version:
        1,
      source_id:
        'google-trends',
      groups: [
        {
          query_group_id:
            'GT01',
          query_group_name:
            'first-group',
          queries: [
            'first',
            'second',
          ],
        },
        {
          query_group_id:
            'GT02',
          query_group_name:
            'second-group',
          queries: [
            'third',
            'fourth',
          ],
        },
      ],
    },
  },
  source_registry: {
    status:
      'READY',
    sources: [],
  },
  database: {
    status:
      'READY',
    database_path:
      '/fixture/app-data/database/roofroom.sqlite',
    schema_version:
      4,
    sqlite_version:
      '3-test',
    journal_mode:
      'wal',
    foreign_keys:
      true,
    migrations_applied:
      4,
    quick_check:
      'ok',
  },
};

const collectionState = {
  phase:
    'COMPLETED_WITH_WARNINGS',
  operation:
    'START',
  run_id:
    'rr_20260819T000000000Z_fixture',
  run_status:
    'COMPLETED_WITH_WARNINGS',
  total_groups:
    2,
  groups_started:
    2,
  groups_collected:
    2,
  current_group_id:
    null,
  jobs: [
    {
      query_group_id:
        'GT01',
      execution_status:
        'COMPLETED',
      validation_status:
        'VALID',
      attempt_number:
        1,
      artifact_state:
        'ACCEPTED',
      error_code:
        null,
    },
    {
      query_group_id:
        'GT02',
      execution_status:
        'COMPLETED',
      validation_status:
        'LOW_DATA',
      attempt_number:
        1,
      artifact_state:
        'ACCEPTED_WITH_WARNING',
      error_code:
        null,
    },
  ],
  recovery: {
    run_id:
      null,
    can_resume:
      false,
    can_retry:
      false,
    manual_action_required:
    false,
  },
  export: {
    status:
      'COMPLETED',
    export_directory:
      '/fixture/app-data/data/runs/fixture/exports/package',
    workbook_path:
      '/fixture/app-data/data/runs/fixture/exports/package.xlsx',
    normalized_row_count:
      8,
    error:
      null,
  },
  message:
    'The run completed with validation warnings.',
  updated_at:
    '2026-08-19T00:00:00.000Z',
};

const openRenderer = async (
  page,
) => {
  let lastError;

  for (
    let attempt = 0;
    attempt < 30;
    attempt += 1
  ) {
    try {
      await page.goto(
        baseUrl,
        {
          waitUntil:
            'networkidle',
          timeout:
            2000,
        },
      );
      return;
    } catch (error) {
      lastError =
        error;
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            100,
          ),
      );
    }
  }

  throw lastError;
};

const main = async () => {
  const browser =
    await chromium.launch({
      headless:
        true,
    });

  try {
    const page =
      await browser.newPage({
        viewport: {
          width:
            1180,
          height:
            920,
        },
        deviceScaleFactor:
          1,
      });

    await page.addInitScript(
      ({
        applicationInfo: info,
        bootstrapStatus: bootstrap,
        collectionState: collection,
      }) => {
        window.roofroom = {
          getApplicationInfo:
            async () => info,
          getBootstrapStatus:
            async () => bootstrap,
          getCollectionState:
            async () => collection,
          startCollection:
            async (groupIds) => {
              window.__selectedGroupIds =
                groupIds;
              return collection;
            },
          resumeCollection:
            async () => collection,
          retryFailedCollection:
            async () => collection,
          cancelCollection:
            async () => collection,
          openDataFolder:
            async () => {},
          openConfigFolder:
            async () => {},
        };
      },
      {
        applicationInfo,
        bootstrapStatus,
        collectionState,
      },
    );

    await openRenderer(
      page,
    );

    await page.getByRole(
      'heading',
      {
        name:
          /Güvenilir veriyi topla/,
      },
    ).waitFor();

    assert.equal(
      await page.getByText(
        'Uyarıyla tamamlandı',
      ).count(),
      1,
    );
    assert.equal(
      await page.getByText(
        'GT01',
        {
          exact:
            true,
        },
      ).count(),
      2,
    );
    assert.equal(
      await page.getByText(
        'LOW_DATA',
        {
          exact:
            true,
        },
      ).count(),
      1,
    );
    assert.equal(
      await page.getByRole(
        'button',
        {
          name:
            'Toplamayı Başlat',
        },
      ).isEnabled(),
      true,
    );

    const groupCheckboxes =
      page.getByRole(
        'checkbox',
      );

    assert.equal(
      await groupCheckboxes.count(),
      2,
    );
    await groupCheckboxes.nth(1)
      .uncheck();
    await page.getByRole(
      'button',
      {
        name:
          'Toplamayı Başlat',
      },
    ).click();

    assert.deepEqual(
      await page.evaluate(
        () =>
          window.__selectedGroupIds,
      ),
      [
        'GT01',
      ],
    );

    const screenshotPath =
      process.env
        .ROOFROOM_UI_SCREENSHOT;

    if (screenshotPath) {
      await page.screenshot({
        path:
          screenshotPath,
        fullPage:
          true,
      });
    }

    console.log(
      'PASS DESKTOP-UI-001: production renderer exposes selectable groups, collection controls, progress, VALID, and LOW_DATA states through the typed bridge contract',
    );
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
