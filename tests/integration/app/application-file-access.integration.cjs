const assert = require(
  'node:assert/strict',
);
const {
  mkdir,
  symlink,
  writeFile,
} = require(
  'node:fs/promises',
);
const crypto = require('node:crypto');
const { strToU8, zipSync } = require('fflate');
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
  resolveBlogWritingPackDirectory,
  resolveBlogWritingPackWorkbook,
  resolveTaskPackageWorkbook,
} = require(
  path.join(
    buildRoot,
    'src/main/app/application-file-access.js',
  ),
);

const DATASETS = [
  'CAMPAIGN_PERFORMANCE', 'AD_GROUP_PERFORMANCE', 'KEYWORD_PERFORMANCE',
  'SEARCH_TERMS', 'AD_PERFORMANCE', 'RSA_ASSET_PERFORMANCE',
];
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const validWorkbookBytes = Buffer.from(zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
  'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>'),
  'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'),
}));

const makeTaskPackage = async (packageId, {
  packageKind = 'INITIAL_BASELINE',
  manifestPackageId = packageId,
  workbookFilename = 'kampanya-gelisim.xlsx',
  workbookKind = 'file',
  workbookBytes = validWorkbookBytes,
  omitManifest = false,
} = {}) => {
  const packageDirectory = path.join(directories.data, 'packages', packageId);
  await mkdir(path.join(packageDirectory, 'datasets'), { recursive: true });
  const roles = packageKind === 'COMPARISON' ? ['CURRENT', 'PREVIOUS'] : ['CURRENT'];
  const evidence = [];
  for (const role of roles) {
    for (const dataset of DATASETS) {
      const rows = [{ performance_date: role === 'CURRENT' ? '2026-09-23' : '2026-09-08', clicks: 0 }];
      const bytes = Buffer.from(`${JSON.stringify(rows, null, 2)}\n`);
      const filename = `datasets/${role.toLowerCase()}-${dataset.toLowerCase()}.json`;
      await writeFile(path.join(packageDirectory, filename), bytes);
      evidence.push({
        requirement_id: dataset,
        role,
        disposition: 'REUSED_EXACT',
        window: role === 'CURRENT'
          ? { start: '2026-09-23', end: '2026-09-29' }
          : { start: '2026-09-08', end: '2026-09-14' },
        origin: {
          run_id: `run_${role}_${dataset}`,
          job_id: `job_${role}_${dataset}`,
          attempt_number: 1,
          artifact_id: `artifact_${role}_${dataset}`,
          artifact_sha256: 'a'.repeat(64),
          acquired_at: '2026-09-30T08:00:00.000Z',
          validation_status: 'VALID',
          source_id: 'google-ads-search-reporting',
          dataset_type: dataset,
          resource_mode: 'fixture',
          acquisition_mode: 'OFFICIAL_API',
          campaign_scope: 'SEARCH',
          dataset_schema_version: 1,
          account_identity: { field: 'customer_id', value: '1234567890' },
          snapshot_observed_at: '2026-09-30T08:00:00.000Z',
        },
        transformation: { kind: 'NONE' },
        row_count: 1,
        ...(role === 'PREVIOUS' ? { source_package_id: 'pkg_previous' } : {}),
        table: { filename, sha256: sha256(bytes), row_count: 1, role, dataset_type: dataset },
      });
    }
  }
  const workbookPath = path.join(packageDirectory, workbookFilename);
  if (workbookKind === 'file') await writeFile(workbookPath, workbookBytes);
  if (workbookKind === 'directory') await mkdir(workbookPath, { recursive: true });
  if (workbookKind === 'symlink') {
    const external = path.join(fixtureRoot, `${packageId}-external.xlsx`);
    await writeFile(external, workbookBytes);
    await symlink(external, workbookPath);
  }
  const manifest = {
    manifest_version: 1,
    package_id: manifestPackageId,
    recipe_id: 'ADS_OPTIMIZATION_PACK',
    recipe_version: 1,
    recipe_label: 'Kampanya Gelişim',
    package_kind: packageKind,
    workspace_id: 'ws_a',
    account_identity: { field: 'customer_id', value: '1234567890' },
    customer_id: '1234567890',
    created_at: '2026-09-30T08:00:00.000Z',
    application_version: '1.0.0',
    campaign_scope: 'SEARCH',
    current_window: { start: '2026-09-23', end: '2026-09-29' },
    ...(packageKind === 'COMPARISON' ? {
      previous_package_id: 'pkg_previous',
      previous_window: { start: '2026-09-08', end: '2026-09-14' },
      gap_days: 8,
    } : {}),
    dataset_schema_version: 1,
    required_datasets: DATASETS,
    evidence,
    excluded_coverage: {},
    workbook_filename: workbookFilename,
  };
  if (!omitManifest) {
    await writeFile(path.join(packageDirectory, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return workbookPath;
};

const BLOG_DATASETS = [
  'INTEREST_OVER_TIME', 'QUERY_PAGE', 'SEARCH_TERMS',
  'KEYWORD_HISTORICAL_METRICS', 'PRODUCTS', 'SITEMAP_URLS', 'GOOGLE_SERP',
];

const makeBlogPackage = async (packageId, {
  root = path.join(directories.data, 'blog-writing-packs'),
  manifestPackageId = packageId,
  recipeId = 'BLOG_WRITING_PACK',
  recipeVersion = 1,
  workbookFilename = 'BLOG_WRITING_PACK.xlsx',
  workbookKind = 'file',
  workbookBytes = validWorkbookBytes,
  omitManifest = false,
} = {}) => {
  const packageDirectory = path.join(root, packageId);
  await mkdir(packageDirectory, { recursive: true });
  if (workbookKind === 'file') await writeFile(path.join(packageDirectory, workbookFilename), workbookBytes);
  if (workbookKind === 'directory') await mkdir(path.join(packageDirectory, workbookFilename), { recursive: true });
  if (workbookKind === 'symlink') {
    const external = path.join(fixtureRoot, `${packageId}-blog-external.xlsx`);
    await writeFile(external, workbookBytes);
    await symlink(external, path.join(packageDirectory, workbookFilename));
  }
  await writeFile(path.join(packageDirectory, 'MANIFEST.json'), `${JSON.stringify({
    package_version: 1,
    run_id: 'run_blog',
    workspace_id: 'ws_blog',
    run_status: 'COMPLETED',
    selected_sources: [],
    successful_jobs: 1,
    failed_jobs: 0,
    mode: 'ALL',
  }, null, 2)}\n`);
  await writeFile(path.join(packageDirectory, 'DATASETS.json'), '[]\n');
  await writeFile(path.join(packageDirectory, 'FAILURES.json'), '[]\n');
  const missing = BLOG_DATASETS.slice(1);
  const coverage = Object.fromEntries(BLOG_DATASETS.map((dataset, index) => [dataset, {
    status: index === 0 ? 'COVERED' : 'MISSING',
    total_jobs: index === 0 ? 1 : 0,
    accepted_jobs: index === 0 ? 1 : 0,
    no_data_jobs: 0,
    incomplete_jobs: 0,
  }]));
  const manifest = {
    manifest_version: 1,
    package_id: manifestPackageId,
    recipe_id: recipeId,
    recipe_version: recipeVersion,
    run_id: 'run_blog',
    workspace_id: 'ws_blog',
    created_at: '2026-10-01T13:00:00.000Z',
    application_version: '1.0.0',
    coverage_status: 'PARTIAL',
    expected_datasets: BLOG_DATASETS,
    present_datasets: ['INTEREST_OVER_TIME'],
    no_data_datasets: [],
    incomplete_datasets: [],
    missing_datasets: missing,
    coverage_by_dataset: coverage,
    workbook_filename: workbookFilename,
    generic_manifest_filename: 'MANIFEST.json',
    datasets_index_filename: 'DATASETS.json',
    failures_filename: 'FAILURES.json',
  };
  if (!omitManifest) {
    await writeFile(path.join(packageDirectory, 'BLOG_PACKAGE.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return { packageDirectory, workbookPath: path.join(packageDirectory, workbookFilename) };
};

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

  const initialWorkbook = await makeTaskPackage('pkg_initial');
  assert.equal(
    await resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_initial'),
    initialWorkbook,
  );
  const comparisonWorkbook = await makeTaskPackage('pkg_comparison', { packageKind: 'COMPARISON' });
  assert.equal(
    await resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_comparison'),
    comparisonWorkbook,
  );

  for (const packageId of ['', '.', '..', '../escape', '/tmp/escape', 'bad/id']) {
    await assert.rejects(resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), packageId));
  }
  await assert.rejects(resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_unknown'));

  await makeTaskPackage('pkg_missing_manifest', { omitManifest: true });
  await assert.rejects(resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_missing_manifest'));
  await makeTaskPackage('pkg_mismatch', { manifestPackageId: 'pkg_other' });
  await assert.rejects(resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_mismatch'));
  await makeTaskPackage('pkg_missing_workbook', { workbookKind: 'missing' });
  await assert.rejects(resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_missing_workbook'));
  await makeTaskPackage('pkg_symlink_workbook', { workbookKind: 'symlink' });
  await assert.rejects(resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_symlink_workbook'));
  await makeTaskPackage('pkg_directory_workbook', { workbookKind: 'directory' });
  await assert.rejects(resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_directory_workbook'));
  await makeTaskPackage('pkg_traversal_workbook', { workbookFilename: '../escape.xlsx', workbookKind: 'missing' });
  await assert.rejects(resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_traversal_workbook'));
  await makeTaskPackage('pkg_absolute_workbook', { workbookFilename: '/tmp/escape.xlsx', workbookKind: 'missing' });
  await assert.rejects(resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_absolute_workbook'));
  await makeTaskPackage('pkg_corrupt_workbook', { workbookBytes: Buffer.from('not an xlsx') });
  await assert.rejects(resolveTaskPackageWorkbook(path.join(directories.data, 'packages'), 'pkg_corrupt_workbook'));
  await makeTaskPackage('pkg_truncated_zip_workbook', {
    workbookBytes: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]),
  });
  await assert.rejects(resolveTaskPackageWorkbook(
    path.join(directories.data, 'packages'),
    'pkg_truncated_zip_workbook',
  ));

  const blogRoot = path.join(directories.data, 'blog-writing-packs');
  const validBlog = await makeBlogPackage('blog_valid');
  assert.equal(await resolveBlogWritingPackDirectory(blogRoot, 'blog_valid'), validBlog.packageDirectory);
  assert.equal(await resolveBlogWritingPackWorkbook(blogRoot, 'blog_valid'), validBlog.workbookPath);

  for (const packageId of ['', '.', '..', '../escape', '/tmp/escape', 'bad/id']) {
    await assert.rejects(resolveBlogWritingPackDirectory(blogRoot, packageId));
    await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, packageId));
  }
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_unknown'));
  await makeBlogPackage('blog_missing_manifest', { omitManifest: true });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_missing_manifest'));
  await makeBlogPackage('blog_mismatch', { manifestPackageId: 'blog_other' });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_mismatch'));
  await makeBlogPackage('blog_wrong_recipe', { recipeId: 'ADS_OPTIMIZATION_PACK' });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_wrong_recipe'));
  await makeBlogPackage('blog_wrong_version', { recipeVersion: 2 });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_wrong_version'));
  await makeBlogPackage('blog_traversal_workbook', { workbookFilename: '../escape.xlsx', workbookKind: 'missing' });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_traversal_workbook'));
  await makeBlogPackage('blog_absolute_workbook', { workbookFilename: '/tmp/escape.xlsx', workbookKind: 'missing' });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_absolute_workbook'));
  await makeBlogPackage('blog_missing_workbook', { workbookKind: 'missing' });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_missing_workbook'));
  await makeBlogPackage('blog_symlink_workbook', { workbookKind: 'symlink' });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_symlink_workbook'));
  await makeBlogPackage('blog_directory_workbook', { workbookKind: 'directory' });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_directory_workbook'));
  await makeBlogPackage('blog_corrupt_workbook', { workbookBytes: Buffer.from('not an xlsx') });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_corrupt_workbook'));
  await makeBlogPackage('blog_truncated_workbook', { workbookBytes: Buffer.from([0x50, 0x4b, 0x03]) });
  await assert.rejects(resolveBlogWritingPackWorkbook(blogRoot, 'blog_truncated_workbook'));

  const externalBlogRoot = path.join(fixtureRoot, 'external-blog');
  await makeBlogPackage('target', { root: externalBlogRoot });
  await symlink(path.join(externalBlogRoot, 'target'), path.join(blogRoot, 'blog_symlink_directory'));
  await assert.rejects(resolveBlogWritingPackDirectory(blogRoot, 'blog_symlink_directory'));

  console.log(
    'PASS DESKTOP-FILES-001..005: exports, Task Packages, and Blog Writing Packs resolve only by verified local identity',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
