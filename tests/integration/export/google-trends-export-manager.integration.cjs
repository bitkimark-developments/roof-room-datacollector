const assert = require(
  'node:assert/strict',
);
const fs = require(
  'node:fs',
);
const path = require(
  'node:path',
);
const {
  strFromU8,
  unzipSync,
} = require(
  'fflate',
);

const [
  buildRoot,
  tempRoot,
] = process.argv.slice(2);

if (
  !buildRoot ||
  !tempRoot
) {
  throw new Error(
    'Expected compiled build root and temp root.',
  );
}

const {
  generateGoogleTrendsExport,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'export',
    'google-trends-export-manager.js',
  ),
);
const {
  runGoogleTrendsBatchThroughCore,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-core-runner.js',
  ),
);

const appDataRoot =
  path.join(
    tempRoot,
    'app-data',
  );
const directories = {
  app_data_root:
    appDataRoot,
  config:
    path.join(
      appDataRoot,
      'config',
    ),
  data:
    path.join(
      appDataRoot,
      'data',
    ),
  runs:
    path.join(
      appDataRoot,
      'data',
      'runs',
    ),
  database:
    path.join(
      appDataRoot,
      'database',
    ),
  browser_profiles:
    path.join(
      appDataRoot,
      'browser-profiles',
    ),
  logs:
    path.join(
      appDataRoot,
      'logs',
    ),
  public_downloads:
    path.join(
      tempRoot,
      'public-downloads',
    ),
};

const groups = [
  {
    query_group_id:
      'GT01',
    query_group_name:
      'first-group',
    queries: [
      'shared query',
      'alpha query',
    ],
  },
  {
    query_group_id:
      'GT02',
    query_group_name:
      'second-group',
    queries: [
      'shared query',
      'beta query',
    ],
  },
];

const queryConfig = {
  config_version:
    1,
  source_id:
    'google-trends',
  groups,
};

const requestedConfiguration = {
  source_mode:
    'GOOGLE_TRENDS_UI',
  country_code:
    'TR',
  language_code:
    null,
  requested_date_start:
    '2024-08-18',
  requested_date_end:
    '2026-08-17',
  category_id:
    null,
  category_name:
    'All Categories',
  search_type:
    'Web Search',
  selection_type:
    'Search Term',
  dataset_type:
    'INTEREST_OVER_TIME',
};

const providerCsv = (
  group,
) => Buffer.from(
  [
    'Category: All categories',
    '',
    `Week,${group.queries[0]}: (Turkey),${group.queries[1]}: (Turkey)`,
    '2026-08-09,0,',
    '2026-08-16,12,100',
    '',
  ].join('\n'),
  'utf8',
);

class ExportFixtureSource {
  id =
    'google-trends';
  name =
    'Google Trends Export Fixture';
  sourceMode =
    'GOOGLE_TRENDS_UI';
  datasetTypes = [
    'INTEREST_OVER_TIME',
  ];

  getCapabilities() {
    return {
      requires_browser:
        false,
      requires_oauth:
        false,
      may_require_manual_login:
        false,
      supports_custom_date_range:
        true,
      supports_direct_export:
        true,
      supports_api:
        false,
      supports_resume:
        false,
      max_concurrency:
        1,
    };
  }

  async checkReadiness() {
    return {
      source_id:
        this.id,
      readiness_status:
        'READY',
      checked_at:
        '2026-08-19T00:00:00.000Z',
      message:
        null,
    };
  }

  async collect(context) {
    return {
      result_type:
        'ARTIFACT_PRODUCED',
      preferred_filename:
        `${context.query_group.query_group_id}.csv`,
      media_type:
        'text/csv',
      bytes:
        providerCsv(
          context.query_group,
        ),
    };
  }
}

const validator = {
  async validate() {
    return {
      validation_status:
        'VALID',
      checks_total:
        1,
      checks_passed:
        1,
      checks_warning:
        0,
      checks_failed:
        0,
      findings: [
        {
          check_id:
            'EXPORT_FIXTURE_VALID',
          severity:
            'INFO',
          passed:
            true,
          message:
            'Deterministic accepted export fixture.',
          expected:
            'accepted fixture',
          actual:
            'accepted fixture',
        },
      ],
      validated_metadata: {
        actual_date_start:
          '2026-08-09',
        actual_date_end:
          '2026-08-16',
        country_name:
          'Turkey',
      },
    };
  },
};

const main = async () => {
  for (const directory of
    Object.values(
      directories,
    )) {
    fs.mkdirSync(
      directory,
      {
        recursive:
          true,
      },
    );
  }

  const collected =
    await runGoogleTrendsBatchThroughCore({
      directories,
      query_config:
        queryConfig,
      requested_configuration:
        requestedConfiguration,
      application_version:
        '1.0.0-test',
      source:
        new ExportFixtureSource(),
      validator,
      logger:
        null,
    });

  assert.equal(
    collected.run.run_status,
    'COMPLETED',
  );

  const exported =
    await generateGoogleTrendsExport({
      directories,
      run_id:
        collected.run.run_id,
      now:
        () =>
          new Date(
            '2026-08-19T12:00:00.000Z',
          ),
    });

  assert.equal(
    exported.normalized_row_count,
    8,
  );
  assert.equal(
    path.basename(
      exported.workbook_path,
    ),
    'ROOFROOM_SEARCH_DEMAND_RAW_2026-08-19.xlsx',
  );
  assert.deepEqual(
    fs.readdirSync(
      exported.export_directory,
    ).sort(),
    [
      'ERROR_LOG.csv',
      'GT_24M_RAW.csv',
      'QUERY_UNIVERSE.csv',
      'README.txt',
      'RUN_METADATA.csv',
      'VALIDATION_LOG.csv',
    ],
  );

  console.log(
    'PASS EXPORT-001: one completed run produces a run-scoped CSV package and the contracted workbook filename without touching raw evidence',
  );

  const rawCsvPath =
    exported.csv_paths.find(
      (candidate) =>
        path.basename(
          candidate,
        ) ===
        'GT_24M_RAW.csv',
    );
  const csvLines =
    fs.readFileSync(
      rawCsvPath,
      'utf8',
    )
      .trimEnd()
      .split('\n');
  const headers =
    csvLines[0].split(',');
  const relativeInterestIndex =
    headers.indexOf(
      'relative_interest',
    );
  const periodIndex =
    headers.indexOf(
      'period_start',
    );
  const queryIndex =
    headers.indexOf(
      'query',
    );
  const groupIndex =
    headers.indexOf(
      'query_group_id',
    );
  const rows =
    csvLines
      .slice(1)
      .map(
        (line) =>
          line.split(','),
      );
  const missing =
    rows.find(
      (row) =>
        row[periodIndex] ===
          '2026-08-09' &&
        row[queryIndex] ===
          'alpha query',
    );

  assert.ok(
    missing,
  );
  assert.equal(
    missing[relativeInterestIndex],
    '',
  );

  const sharedGroups =
    new Set(
      rows
        .filter(
          (row) =>
            row[queryIndex] ===
            'shared query',
        )
        .map(
          (row) =>
            row[groupIndex],
        ),
    );

  assert.deepEqual(
    [...sharedGroups].sort(),
    [
      'GT01',
      'GT02',
    ],
  );

  console.log(
    'PASS EXPORT-002..003: normalized CSV keeps missing numeric values blank and preserves duplicate queries in both independent comparison groups',
  );

  const archive =
    unzipSync(
      fs.readFileSync(
        exported.workbook_path,
      ),
    );
  const workbookXml =
    strFromU8(
      archive[
        'xl/workbook.xml'
      ],
    );
  const sheetNames =
    [...workbookXml.matchAll(
      /<sheet\b[^>]*name="([^"]+)"/gu,
    )].map(
      (match) =>
        match[1],
    );

  assert.deepEqual(
    sheetNames,
    [
      'README',
      'RUN_METADATA',
      'QUERY_UNIVERSE',
      'GT_24M_RAW',
      'VALIDATION_LOG',
      'ERROR_LOG',
    ],
  );

  const rawSheetXml =
    strFromU8(
      archive[
        'xl/worksheets/sheet4.xml'
      ],
    );

  assert.equal(
    (
      rawSheetXml.match(
        /<row\b/gu,
      ) ?? []
    ).length,
    9,
  );
  assert.equal(
    /<c\b[^>]*r="Q3"/u.test(
      rawSheetXml,
    ),
    false,
  );

  console.log(
    'PASS EXPORT-004..005: XLSX contains all six contracted sheets and preserves numeric null as an empty cell',
  );

  await assert.rejects(
    generateGoogleTrendsExport({
      directories,
      run_id:
        collected.run.run_id,
      now:
        () =>
          new Date(
            '2026-08-19T12:00:00.000Z',
          ),
    }),
    /EEXIST/,
  );

  console.log(
    'PASS EXPORT-006: repeated export refuses to overwrite an existing derived package or workbook',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
