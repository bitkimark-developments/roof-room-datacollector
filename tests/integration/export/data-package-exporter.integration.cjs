const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { strFromU8, unzipSync } = require('fflate');
const { buildDataPackage, writeDataPackage, writeDataPackageEvidence } = require(`${process.argv[2]}/main/export/data-package-exporter.js`);

const decodeXmlText = (value) => value
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&apos;', "'")
  .replaceAll('&amp;', '&');

const parseWorkbook = (filename) => {
  const files = unzipSync(new Uint8Array(fs.readFileSync(filename)));
  const readXml = (entry) => {
    assert.ok(files[entry], `Expected XLSX entry: ${entry}`);
    return strFromU8(files[entry]);
  };
  const workbookXml = readXml('xl/workbook.xml');
  const sharedStringsXml = readXml('xl/sharedStrings.xml');
  const sharedStrings = [...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/gu)]
    .map((match) => decodeXmlText(
      [...match[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/gu)]
        .map((textMatch) => textMatch[1])
        .join(''),
    ));
  const sheetNames = [...workbookXml.matchAll(/<sheet [^>]*name="([^"]+)"/gu)]
    .map((match) => match[1]);
  const sheets = sheetNames.map((name, index) => {
    const sheetXml = readXml(`xl/worksheets/sheet${index + 1}.xml`);
    const cells = new Map();
    for (const match of sheetXml.matchAll(/<c ([^>]*)>(?:<v>([\s\S]*?)<\/v>)?<\/c>/gu)) {
      const reference = /(?:^| )r="([^"]+)"/u.exec(match[1])?.[1];
      if (reference === undefined) continue;
      const type = /(?:^| )t="([^"]+)"/u.exec(match[1])?.[1] ?? 'n';
      const serialized = match[2];
      cells.set(reference, {
        type,
        value: serialized === undefined
          ? null
          : type === 's'
            ? sharedStrings[Number(serialized)]
            : Number(serialized),
      });
    }
    return { name, cells };
  });
  return { sheetNames, sheets };
};

const run = { run_id: 'rr_test', workspace_id: 'ws_a', run_status: 'COMPLETED_WITH_WARNINGS', selected_sources: ['google-trends', 'serpapi'] };
const jobs = [
  { job_id: 'job_gt', source_id: 'google-trends', job_key: 'GT-01', execution_status: 'COMPLETED', validation_status: 'VALID', accepted_artifact_id: 'art_gt' },
  { job_id: 'job_serp', source_id: 'serpapi', job_key: 'q-1', execution_status: 'FAILED', validation_status: 'ERROR_NOT_DATA', accepted_artifact_id: null },
];
const datasets = [
  { source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', job_id: 'job_gt', job_key: 'GT-01', rows: [{ query: 'ficus', relative_interest: null }] },
  { source_id: 'serpapi', dataset_type: 'GOOGLE_SERP', job_id: 'job_serp', job_key: 'q-1', rows: null, failure: { code: 'ERROR_NOT_DATA' } },
];

const all = buildDataPackage({ run, jobs, datasets, mode: 'ALL' });
assert.deepEqual(all.datasets.map((dataset) => dataset.source_id), ['google-trends']);
assert.equal(all.manifest.run_id, 'rr_test');
assert.equal(all.manifest.failed_jobs, 1);
assert.equal(all.datasets[0].rows[0].relative_interest, null);
assert.deepEqual(all.failures, [{ source_id: 'serpapi', job_key: 'q-1', code: 'ERROR_NOT_DATA' }]);

const successful = buildDataPackage({ run, jobs, datasets, mode: 'SUCCESSFUL_ONLY' });
assert.deepEqual(successful.datasets.map((dataset) => dataset.source_id), ['google-trends']);
assert.equal(successful.failures.length, 0);
assert.notEqual(successful.datasets, all.datasets);

const failureMatrix = buildDataPackage({
  run: { ...run, run_status: 'FAILED' },
  jobs: [
    { job_id: 'job_date', source_id: 'google-trends', job_key: 'GT-DATE', execution_status: 'COMPLETED', validation_status: 'DATE_MISMATCH', accepted_artifact_id: null },
    { job_id: 'job_cancelled', source_id: 'ikas-products', job_key: 'ikas-cancelled', execution_status: 'CANCELLED', validation_status: 'NOT_RUN', accepted_artifact_id: null },
  ],
  datasets: [],
  mode: 'ALL',
});
assert.deepEqual(failureMatrix.failures, [
  { source_id: 'google-trends', job_key: 'GT-DATE', code: 'DATE_MISMATCH' },
  { source_id: 'ikas-products', job_key: 'ikas-cancelled', code: 'CANCELLED' },
]);
assert.throws(
  () => buildDataPackage({
    run,
    jobs,
    datasets: [{ source_id: 'serpapi', dataset_type: 'GOOGLE_SERP', job_id: 'job_gt', job_key: 'GT-01', rows: [] }],
    mode: 'ALL',
  }),
  /identity does not match/i,
  'A dataset must not borrow another Job identity or source.',
);

console.log('PASS DATA-PACKAGE-001: separate source datasets, provenance manifest, failed-source omission, and NULL preservation are deterministic');

const repeatedJobs = [
  { job_id: 'job_gt_01', source_id: 'google-trends', job_key: 'GT-01', execution_status: 'COMPLETED', validation_status: 'VALID', accepted_artifact_id: 'art_gt_01' },
  { job_id: 'job_gt_02', source_id: 'google-trends', job_key: 'GT-02', execution_status: 'COMPLETED', validation_status: 'LOW_DATA', accepted_artifact_id: 'art_gt_02' },
];
const repeated = buildDataPackage({
  run: { ...run, run_status: 'COMPLETED', selected_sources: ['google-trends'] },
  jobs: repeatedJobs,
  datasets: [
    { source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', job_id: 'job_gt_01', job_key: 'GT-01', rows: [{ query: 'ficus', relative_interest: 42 }], provenance: { raw_artifact_id: 'art_gt_01', sha256: 'a'.repeat(64) } },
    { source_id: 'google-trends', dataset_type: 'INTEREST_OVER_TIME', job_id: 'job_gt_02', job_key: 'GT-02', rows: [{ query: 'saksı', relative_interest: null }], provenance: { raw_artifact_id: 'art_gt_02', sha256: 'b'.repeat(64) } },
  ],
  mode: 'ALL',
});

assert.deepEqual(repeated.datasets.map((dataset) => dataset.job_key), ['GT-01', 'GT-02']);
const outputRoot = process.argv[3];
writeDataPackage(outputRoot, repeated).then(() => {
  const firstName = 'google-trends_interest_over_time_gt-01_job_gt_01.json';
  const secondName = 'google-trends_interest_over_time_gt-02_job_gt_02.json';
  assert.equal(fs.existsSync(path.join(outputRoot, firstName)), true);
  assert.equal(fs.existsSync(path.join(outputRoot, secondName)), true);
  const index = JSON.parse(fs.readFileSync(path.join(outputRoot, 'DATASETS.json'), 'utf8'));
  assert.deepEqual(index.map(({ filename, job_id, job_key, row_count, provenance }) => ({ filename, job_id, job_key, row_count, provenance })), [
    { filename: firstName, job_id: 'job_gt_01', job_key: 'GT-01', row_count: 1, provenance: { raw_artifact_id: 'art_gt_01', sha256: 'a'.repeat(64) } },
    { filename: secondName, job_id: 'job_gt_02', job_key: 'GT-02', row_count: 1, provenance: { raw_artifact_id: 'art_gt_02', sha256: 'b'.repeat(64) } },
  ]);
  console.log('PASS DATA-PACKAGE-IDENTITY-001: repeated source datasets use collision-safe Job filenames and persist provenance');
}).catch((error) => { console.error(error); process.exitCode = 1; });


(async () => {
  const kwpOutputRoot = path.join(outputRoot, 'kwp-user-facing');

  const kwpRun = {
    run_id: 'rr_kwp_export_test',
    workspace_id: 'ws_kwp',
    run_status: 'COMPLETED',
    selected_sources: ['google-keyword-planner'],
  };

  const kwpJobs = [
    {
      job_id: 'job_kwp_ficus',
      source_id: 'google-keyword-planner',
      job_key: 'KWP-FICUS',
      execution_status: 'COMPLETED',
      validation_status: 'VALID',
      accepted_artifact_id: 'art_kwp_ficus',
    },
  ];

  const kwpDatasets = [
    {
      source_id: 'google-keyword-planner',
      dataset_type: 'KEYWORD_HISTORICAL_METRICS',
      job_id: 'job_kwp_ficus',
      job_key: 'KWP-FICUS',
      rows: [
        {
          requested_keyword: 'ficus benjamin',
          returned_keyword: 'ficus benjamin',
          close_variants: ['ficus benjamina'],
          matched_requested_keywords: [
            'ficus benjamin',
            'ficus benjamina',
          ],
          avg_monthly_searches: 100,
          competition: 'LOW',
          competition_index: 20,
          top_of_page_bid_low: null,
          top_of_page_bid_high: 2,
          change_3_month: 50,
          change_yoy: -25,
          monthly_history: [
            { year: 2025, month: 9, searches: 0 },
            { year: 2025, month: 10, searches: null },
          ],
        },
        {
          requested_keyword: 'ficus lyrata fiyat',
          returned_keyword: 'ficus lyrata',
          avg_monthly_searches: 50,
          competition: null,
          competition_index: null,
          top_of_page_bid_low: null,
          top_of_page_bid_high: null,
          change_3_month: null,
          change_yoy: null,
          monthly_history: [],
        },
        {
          requested_keyword: 'monstera deliciosa',
          returned_keyword: 'monstera deliciosa',
          close_variants: [],
          matched_requested_keywords: [
            'monstera deliciosa',
          ],
          avg_monthly_searches: 0,
          competition: 'MEDIUM',
          competition_index: 0,
          top_of_page_bid_low: null,
          top_of_page_bid_high: null,
          change_3_month: null,
          change_yoy: null,
        },
      ],
      provenance: {
        run_id: 'rr_kwp_export_test',
        workspace_id: 'ws_kwp',
        job_id: 'job_kwp_ficus',
        job_key: 'KWP-FICUS',
        source_id: 'google-keyword-planner',
        validation_status: 'VALID',
        raw_artifact_id: 'art_kwp_ficus',
        raw_artifact_filename: 'KWP-FICUS.json',
        raw_artifact_sha256: 'c'.repeat(64),
        acquired_at: '2026-09-25T17:05:08.000Z',
        requested_context: {
          group_id: 'KWP-FICUS',
          group_name: 'Ficus, indoor "plants"',
          keywords: [
            'ficus benjamin',
            'ficus benjamina',
            'ficus lyrata fiyat',
            'monstera deliciosa',
          ],
          source_mode: 'OFFICIAL_API',
          requested_date_start: '2025-09-01',
          requested_date_end: '2026-08-31',
          country_code: 'TR',
          language_code: 'tr',
          keyword_plan_network: 'GOOGLE_SEARCH',
        },
      },
    },
  ];

  const kwpPackage = buildDataPackage({
    run: kwpRun,
    jobs: kwpJobs,
    datasets: kwpDatasets,
    mode: 'SUCCESSFUL_ONLY',
  });

  const evidenceOnlyRoot = path.join(outputRoot, 'kwp-evidence-only');
  await writeDataPackageEvidence(evidenceOnlyRoot, kwpPackage);

  for (const filename of ['MANIFEST.json', 'FAILURES.json', 'DATASETS.json']) {
    assert.equal(
      fs.existsSync(path.join(evidenceOnlyRoot, filename)),
      true,
      `Expected base Data Package evidence file: ${filename}`,
    );
  }

  const evidenceIndex = JSON.parse(fs.readFileSync(path.join(evidenceOnlyRoot, 'DATASETS.json'), 'utf8'));
  assert.equal(evidenceIndex.length, 1);
  assert.equal(
    fs.existsSync(path.join(evidenceOnlyRoot, evidenceIndex[0].filename)),
    true,
    'Expected source dataset JSON in base evidence output.',
  );

  const expectedUserExports = [
    'keyword-planner_metrics.csv',
    'keyword-planner_monthly.csv',
    'keyword-planner_request-map.csv',
    'keyword-planner_run-metadata.csv',
    'keyword-planner-historical-metrics_rr_kwp_export_test.xlsx',
  ];

  for (const filename of expectedUserExports) {
    assert.equal(
      fs.existsSync(path.join(evidenceOnlyRoot, filename)),
      false,
      `Base evidence writer must not emit Keyword Planner user export: ${filename}`,
    );
  }

  await writeDataPackage(kwpOutputRoot, kwpPackage);

  for (const filename of expectedUserExports) {
    assert.equal(
      fs.existsSync(path.join(kwpOutputRoot, filename)),
      true,
      `Expected Keyword Planner user-facing export: ${filename}`,
    );
  }

  const readUserExport = (filename) => fs.readFileSync(
    path.join(kwpOutputRoot, filename),
    'utf8',
  );
  const metricsCsv = readUserExport('keyword-planner_metrics.csv');
  const monthlyCsv = readUserExport('keyword-planner_monthly.csv');
  const requestMapCsv = readUserExport('keyword-planner_request-map.csv');
  const metadataCsv = readUserExport('keyword-planner_run-metadata.csv');
  const csvFiles = [metricsCsv, monthlyCsv, requestMapCsv, metadataCsv];

  assert.equal(
    metricsCsv.split('\n')[0],
    'Group ID,Requested Keyword(s),Provider Keyword,Mapping,Avg monthly searches,Competition,Competition index,Top of page bid low,Top of page bid high,3 month change,YoY change',
  );
  assert.equal(
    monthlyCsv.split('\n')[0],
    'Group ID,Requested Keyword(s),Provider Keyword,Year,Month,Monthly searches',
  );
  assert.equal(
    requestMapCsv.split('\n')[0],
    'Group ID,Requested Keyword,Provider Keyword,Mapping',
  );
  assert.equal(
    metadataCsv.split('\n')[0],
    'run_id,job_id,group_id,group_name,source_id,source_mode,requested_date_start,requested_date_end,country_code,language_code,keyword_plan_network,acquired_at,validation_status,raw_artifact_id,raw_artifact_filename,raw_artifact_sha256',
  );
  for (const csv of csvFiles) {
    assert.equal(csv.endsWith('\n'), true, 'CSV files must end deterministically with a newline.');
    assert.equal(csv.includes(',null'), false, 'CSV files must not serialize null as text.');
    assert.equal(csv.includes(',undefined'), false, 'CSV files must not serialize undefined as text.');
  }

  const metricsLines = metricsCsv.trimEnd().split('\n');
  const monthlyLines = monthlyCsv.trimEnd().split('\n');
  const requestMapLines = requestMapCsv.trimEnd().split('\n');
  const metadataLines = metadataCsv.trimEnd().split('\n');
  assert.equal(metricsLines.length, 4, 'KWP_METRICS must contain one row per provider result.');
  assert.equal(monthlyLines.length, 3, 'KWP_MONTHLY must contain only provider-supplied monthly rows.');
  assert.equal(requestMapLines.length, 5, 'KWP_REQUEST_MAP must contain one row per reviewed keyword.');
  assert.equal(metadataLines.length, 2, 'RUN_METADATA must contain one row per KWP group.');

  assert.equal(
    metricsLines.includes(
      'KWP-FICUS,ficus benjamin | ficus benjamina,ficus benjamin,CLOSE_VARIANT,100,LOW,20,,2,50,-25',
    ),
    true,
    'Provider-proven close variants must produce one contextual provider-result row.',
  );
  assert.equal(
    metricsLines.includes(
      'KWP-FICUS,ficus lyrata fiyat,ficus lyrata,,50,,,,,,',
    ),
    true,
    'An unproven provider-result relation must keep its Mapping and null metrics blank.',
  );
  assert.equal(
    metricsLines.includes(
      'KWP-FICUS,monstera deliciosa,monstera deliciosa,EXACT,0,MEDIUM,0,,,,',
    ),
    true,
    'An exact-only provider result must be EXACT and preserve numeric zero.',
  );

  assert.equal(
    monthlyLines.includes(
      'KWP-FICUS,ficus benjamin | ficus benjamina,ficus benjamin,2025,9,0',
    ),
    true,
    'A true monthly search value of 0 must remain numeric 0.',
  );
  assert.equal(
    monthlyLines.includes(
      'KWP-FICUS,ficus benjamin | ficus benjamina,ficus benjamin,2025,10,',
    ),
    true,
    'A missing monthly search value must remain a blank CSV cell.',
  );
  assert.equal(
    monthlyLines.some((line) => line.includes('monstera deliciosa')),
    false,
    'A provider result without monthly history must not gain fabricated monthly rows.',
  );

  assert.equal(
    requestMapLines.includes(
      'KWP-FICUS,ficus benjamin,ficus benjamin,EXACT',
    ),
    true,
  );
  assert.equal(
    requestMapLines.includes(
      'KWP-FICUS,ficus benjamina,ficus benjamin,CLOSE_VARIANT',
    ),
    true,
  );
  assert.equal(
    requestMapLines.includes(
      'KWP-FICUS,ficus lyrata fiyat,ficus lyrata,',
    ),
    true,
    'A requested/provider mismatch without closeVariants evidence must have a blank Mapping.',
  );
  assert.equal(
    requestMapLines.includes(
      'KWP-FICUS,monstera deliciosa,monstera deliciosa,EXACT',
    ),
    true,
  );

  assert.equal(
    metadataLines[1],
    `rr_kwp_export_test,job_kwp_ficus,KWP-FICUS,"Ficus, indoor ""plants""",google-keyword-planner,OFFICIAL_API,2025-09-01,2026-08-31,TR,tr,GOOGLE_SEARCH,2026-09-25T17:05:08.000Z,VALID,art_kwp_ficus,KWP-FICUS.json,${'c'.repeat(64)}`,
    'RUN_METADATA must preserve canonical requested context and raw-artifact provenance with safe CSV quoting.',
  );

  console.log(
    'PASS KWP-CSV-CONTRACT-001: headers, provider/request cardinality, provenance, mappings, and null/zero semantics are deterministic',
  );

  const workbook = parseWorkbook(path.join(
    kwpOutputRoot,
    'keyword-planner-historical-metrics_rr_kwp_export_test.xlsx',
  ));
  assert.deepEqual(workbook.sheetNames, [
    'KWP_METRICS',
    'KWP_MONTHLY',
    'KWP_REQUEST_MAP',
    'RUN_METADATA',
  ]);
  const [metricsSheet, monthlySheet, requestMapSheet, metadataSheet] = workbook.sheets;
  assert.deepEqual(metricsSheet.cells.get('C2'), { type: 's', value: 'ficus benjamin' });
  assert.deepEqual(metricsSheet.cells.get('E2'), { type: 'n', value: 100 });
  assert.deepEqual(metricsSheet.cells.get('J2'), { type: 'n', value: 50 });
  assert.deepEqual(metricsSheet.cells.get('K2'), { type: 'n', value: -25 });
  assert.equal(metricsSheet.cells.has('H2'), false, 'A null numeric metric must be an empty XLSX cell.');
  assert.equal(metricsSheet.cells.has('D3'), false, 'An unproven XLSX Mapping must be empty.');
  assert.deepEqual(metricsSheet.cells.get('D4'), { type: 's', value: 'EXACT' });
  assert.deepEqual(metricsSheet.cells.get('E4'), { type: 'n', value: 0 });
  assert.equal(metricsSheet.cells.has('J4'), false, '3 month change must remain empty.');
  assert.equal(metricsSheet.cells.has('K4'), false, 'YoY change must remain empty.');
  assert.deepEqual(monthlySheet.cells.get('F2'), { type: 'n', value: 0 });
  assert.equal(monthlySheet.cells.has('F3'), false, 'A null monthly value must be an empty XLSX cell.');
  assert.deepEqual(requestMapSheet.cells.get('D3'), { type: 's', value: 'CLOSE_VARIANT' });
  assert.equal(requestMapSheet.cells.has('D4'), false, 'An unproven request-map Mapping must be empty.');
  assert.deepEqual(metadataSheet.cells.get('F2'), { type: 's', value: 'OFFICIAL_API' });

  console.log(
    'PASS KWP-XLSX-CONTRACT-001: workbook sheets, representative text, numeric, zero, null, mapping, and provenance cells are deterministic',
  );

  const orderPriorityOutputRoot = path.join(
    outputRoot,
    'kwp-request-map-exact-priority',
  );

  const orderPriorityPackage = buildDataPackage({
    run: {
      run_id: 'rr_kwp_exact_priority',
      workspace_id: 'ws_kwp',
      run_status: 'COMPLETED',
      selected_sources: ['google-keyword-planner'],
    },
    jobs: [{
      job_id: 'job_kwp_exact_priority',
      source_id: 'google-keyword-planner',
      job_key: 'KWP-EXACT-PRIORITY',
      execution_status: 'COMPLETED',
      validation_status: 'VALID',
      accepted_artifact_id: 'art_kwp_exact_priority',
    }],
    datasets: [{
      source_id: 'google-keyword-planner',
      dataset_type: 'KEYWORD_HISTORICAL_METRICS',
      job_id: 'job_kwp_exact_priority',
      job_key: 'KWP-EXACT-PRIORITY',
      rows: [
        {
          requested_keyword: 'ficus benjamin',
          returned_keyword: 'ficus benjamin',
          close_variants: ['ficus benjamina'],
          matched_requested_keywords: ['ficus benjamina'],
          monthly_history: [],
        },
        {
          requested_keyword: 'ficus benjamina',
          returned_keyword: 'ficus benjamina',
          close_variants: [],
          matched_requested_keywords: ['ficus benjamina'],
          monthly_history: [],
        },
      ],
      provenance: {
        run_id: 'rr_kwp_exact_priority',
        job_id: 'job_kwp_exact_priority',
        source_id: 'google-keyword-planner',
        validation_status: 'VALID',
        requested_context: {
          group_id: 'KWP-EXACT-PRIORITY',
          group_name: 'Exact priority',
          keywords: ['ficus benjamina'],
          source_mode: 'OFFICIAL_API',
          requested_date_start: '2025-09-01',
          requested_date_end: '2026-08-31',
          country_code: 'TR',
          language_code: 'tr',
          keyword_plan_network: 'GOOGLE_SEARCH',
        },
      },
    }],
    mode: 'SUCCESSFUL_ONLY',
  });

  await writeDataPackage(
    orderPriorityOutputRoot,
    orderPriorityPackage,
  );

  const exactPriorityRequestMap = fs.readFileSync(
    path.join(
      orderPriorityOutputRoot,
      'keyword-planner_request-map.csv',
    ),
    'utf8',
  );

  assert.equal(
    exactPriorityRequestMap.includes(
      'KWP-EXACT-PRIORITY,ficus benjamina,ficus benjamina,EXACT',
    ),
    true,
    'Strict exact provider evidence must win over an earlier close-variant match in KWP_REQUEST_MAP.',
  );

  console.log(
    'PASS KWP-REQUEST-MAP-EXACT-PRIORITY-001: exact mapping is independent of provider row order',
  );

  const csvSafetyOutputRoot = path.join(
    outputRoot,
    'kwp-csv-formula-safety',
  );

  const csvSafetyPackage = buildDataPackage({
    run: {
      run_id: 'rr_kwp_csv_safety',
      workspace_id: 'ws_kwp',
      run_status: 'COMPLETED',
      selected_sources: ['google-keyword-planner'],
    },
    jobs: [{
      job_id: 'job_kwp_csv_safety',
      source_id: 'google-keyword-planner',
      job_key: 'KWP-CSV-SAFETY',
      execution_status: 'COMPLETED',
      validation_status: 'VALID',
      accepted_artifact_id: 'art_kwp_csv_safety',
    }],
    datasets: [{
      source_id: 'google-keyword-planner',
      dataset_type: 'KEYWORD_HISTORICAL_METRICS',
      job_id: 'job_kwp_csv_safety',
      job_key: 'KWP-CSV-SAFETY',
      rows: [{
        requested_keyword: '=1+1',
        returned_keyword: '=1+1',
        close_variants: [],
        matched_requested_keywords: ['=1+1'],
        avg_monthly_searches: 0,
        monthly_history: [],
      }],
      provenance: {
        run_id: 'rr_kwp_csv_safety',
        job_id: 'job_kwp_csv_safety',
        source_id: 'google-keyword-planner',
        validation_status: 'VALID',
        requested_context: {
          group_id: 'KWP-CSV-SAFETY',
          group_name: 'CSV safety',
          keywords: ['=1+1'],
          source_mode: 'OFFICIAL_API',
          requested_date_start: '2025-09-01',
          requested_date_end: '2026-08-31',
          country_code: 'TR',
          language_code: 'tr',
          keyword_plan_network: 'GOOGLE_SEARCH',
        },
      },
    }],
    mode: 'SUCCESSFUL_ONLY',
  });

  await writeDataPackage(
    csvSafetyOutputRoot,
    csvSafetyPackage,
  );

  const csvSafetyRequestMap = fs.readFileSync(
    path.join(
      csvSafetyOutputRoot,
      'keyword-planner_request-map.csv',
    ),
    'utf8',
  );

  assert.equal(
    csvSafetyRequestMap.includes(
      'KWP-CSV-SAFETY,"\'=1+1","\'=1+1",EXACT',
    ),
    true,
    'Formula-leading CSV text must be neutralized only at the CSV serialization boundary.',
  );

  const csvSafetyWorkbook = parseWorkbook(
    path.join(
      csvSafetyOutputRoot,
      'keyword-planner-historical-metrics_rr_kwp_csv_safety.xlsx',
    ),
  );

  const csvSafetyRequestMapSheet =
    csvSafetyWorkbook.sheets[2];

  assert.deepEqual(
    csvSafetyRequestMapSheet.cells.get('B2'),
    { type: 's', value: '=1+1' },
    'XLSX must preserve the exact requested keyword as a string cell.',
  );

  assert.deepEqual(
    csvSafetyRequestMapSheet.cells.get('C2'),
    { type: 's', value: '=1+1' },
    'XLSX must preserve the exact provider keyword as a string cell.',
  );

  console.log(
    'PASS KWP-CSV-FORMULA-SAFETY-001: CSV neutralizes formula-leading text while XLSX preserves source-faithful string cells',
  );

  console.log(
    'PASS KWP-MAPPING-EVIDENCE-001: CLOSE_VARIANT labels require explicit provider evidence',
  );
  console.log(
    'PASS KWP-USER-EXPORT-001: accepted Keyword Planner data emits verified CSV and XLSX user-facing exports',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
