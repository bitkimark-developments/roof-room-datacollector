const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { BlogWritingPackStore } = require(`${process.argv[2]}/main/blog-writing-packs/blog-writing-pack-store.js`);
const { publishBlogWritingPack } = require(`${process.argv[2]}/main/blog-writing-packs/blog-writing-pack-publisher.js`);
const { renderBlogWritingPackWorkbook } = require(`${process.argv[2]}/main/export/blog-writing-pack-exporter.js`);

const coverage = {
  INTEREST_OVER_TIME: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
  QUERY_PAGE: { status: 'COVERED', total_jobs: 1, accepted_jobs: 1, no_data_jobs: 0, incomplete_jobs: 0 },
  SEARCH_TERMS: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
  KEYWORD_HISTORICAL_METRICS: { status: 'COVERED', total_jobs: 1, accepted_jobs: 1, no_data_jobs: 0, incomplete_jobs: 0 },
  PRODUCTS: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
  SITEMAP_URLS: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
  GOOGLE_SERP: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
};

const assemblyFor = (packageId) => ({
  manifest: {
    manifest_version: 1,
    package_id: packageId,
    recipe_id: 'BLOG_WRITING_PACK',
    recipe_version: 1,
    run_id: 'run_blog_store',
    workspace_id: 'ws_blog',
    created_at: '2026-10-01T13:00:00.000Z',
    application_version: '1.0.0',
    coverage_status: 'PARTIAL',
    expected_datasets: Object.keys(coverage),
    present_datasets: ['QUERY_PAGE', 'KEYWORD_HISTORICAL_METRICS'],
    no_data_datasets: [],
    incomplete_datasets: [],
    missing_datasets: ['INTEREST_OVER_TIME', 'SEARCH_TERMS', 'PRODUCTS', 'SITEMAP_URLS', 'GOOGLE_SERP'],
    coverage_by_dataset: coverage,
    workbook_filename: 'BLOG_WRITING_PACK.xlsx',
    generic_manifest_filename: 'MANIFEST.json',
    datasets_index_filename: 'DATASETS.json',
    failures_filename: 'FAILURES.json',
  },
  data_package: {
    manifest: {
      package_version: 1,
      run_id: 'run_blog_store',
      workspace_id: 'ws_blog',
      run_status: 'COMPLETED',
      selected_sources: ['google-search-console-query-page', 'google-keyword-planner'],
      successful_jobs: 2,
      failed_jobs: 0,
      mode: 'ALL',
    },
    datasets: [
      {
        source_id: 'google-search-console-query-page', dataset_type: 'QUERY_PAGE', job_id: 'job_gsc', job_key: 'GSC01',
        rows: [{ query: 'ficus', page: '/ficus', clicks: 0, impressions: 10, ctr: 0, position: 1 }],
        provenance: { run_id: 'run_blog_store', workspace_id: 'ws_blog', job_id: 'job_gsc', job_key: 'GSC01', source_id: 'google-search-console-query-page', validation_status: 'VALID' },
      },
      {
        source_id: 'google-keyword-planner', dataset_type: 'KEYWORD_HISTORICAL_METRICS', job_id: 'job_kwp', job_key: 'KWP01',
        rows: [{ group_id: 'KWP01', requested_keyword: 'ficus', returned_keyword: 'ficus', avg_monthly_searches: 0, monthly_history: [] }],
        provenance: { run_id: 'run_blog_store', workspace_id: 'ws_blog', job_id: 'job_kwp', job_key: 'KWP01', source_id: 'google-keyword-planner', validation_status: 'VALID' },
      },
    ],
    failures: [],
  },
});

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roofroom-blog-pack-store-'));
  const packagesRoot = path.join(tempRoot, 'data', 'blog-writing-packs');
  const store = new BlogWritingPackStore(packagesRoot);

  const firstAssembly = assemblyFor('blog_pkg_1');
  const firstWorkbook = await renderBlogWritingPackWorkbook(firstAssembly);
  const published = await store.publish({
    manifest: firstAssembly.manifest,
    data_package: firstAssembly.data_package,
    workbook_bytes: firstWorkbook,
  });
  assert.equal(published.package_id, 'blog_pkg_1');
  assert.deepEqual(await store.readManifest('blog_pkg_1'), firstAssembly.manifest);

  const firstDirectory = path.join(packagesRoot, 'blog_pkg_1');
  const index = JSON.parse(fs.readFileSync(path.join(firstDirectory, 'DATASETS.json'), 'utf8'));
  assert.equal(index.length, 2);
  assert.deepEqual(
    fs.readdirSync(firstDirectory).sort(),
    [
      'BLOG_PACKAGE.json', 'BLOG_WRITING_PACK.xlsx', 'DATASETS.json', 'FAILURES.json', 'MANIFEST.json',
      ...index.map(({ filename }) => filename),
    ].sort(),
  );
  assert.equal(fs.readdirSync(firstDirectory).some((name) => name.endsWith('.csv')), false);
  assert.equal(fs.readdirSync(firstDirectory).some((name) => name.startsWith('keyword-planner-historical-metrics_')), false);
  assert.equal(fs.readdirSync(firstDirectory).some((name) => /raw|artifact/iu.test(name)), false);

  const firstSnapshotHash = sha(Buffer.concat(
    fs.readdirSync(firstDirectory).sort().map((name) => fs.readFileSync(path.join(firstDirectory, name))),
  ));
  await assert.rejects(
    () => store.publish({ manifest: firstAssembly.manifest, data_package: firstAssembly.data_package, workbook_bytes: firstWorkbook }),
    /exists|overwrite/i,
  );

  const secondAssembly = assemblyFor('blog_pkg_2');
  const secondPublished = await publishBlogWritingPack(store, secondAssembly);
  assert.equal(secondPublished.package_id, 'blog_pkg_2');
  assert.equal(fs.existsSync(path.join(packagesRoot, 'blog_pkg_2')), true);
  assert.equal(
    sha(Buffer.concat(fs.readdirSync(firstDirectory).sort().map((name) => fs.readFileSync(path.join(firstDirectory, name))))),
    firstSnapshotHash,
    'Publishing another snapshot for the same Run must not mutate the first.',
  );

  const corruptAssembly = assemblyFor('blog_pkg_corrupt');
  await assert.rejects(
    () => store.publish({ manifest: corruptAssembly.manifest, data_package: corruptAssembly.data_package, workbook_bytes: new Uint8Array([0x50, 0x4b, 0x03]) }),
    /workbook|xlsx/i,
  );
  assert.equal(fs.existsSync(path.join(packagesRoot, 'blog_pkg_corrupt')), false);
  assert.equal(fs.readdirSync(packagesRoot).some((name) => name.startsWith('.blog_pkg_corrupt.tmp-')), false);

  const mismatchedAssembly = assemblyFor('blog_pkg_mismatch');
  mismatchedAssembly.data_package.manifest.run_id = 'other_run';
  await assert.rejects(
    () => store.publish({ manifest: mismatchedAssembly.manifest, data_package: mismatchedAssembly.data_package, workbook_bytes: firstWorkbook }),
    /run_id|identity/i,
  );
  assert.equal(fs.existsSync(path.join(packagesRoot, 'blog_pkg_mismatch')), false);

  const tamperedIndexDirectory = path.join(packagesRoot, 'blog_pkg_2');
  const tamperedIndexPath = path.join(tamperedIndexDirectory, 'DATASETS.json');
  const tamperedIndex = JSON.parse(fs.readFileSync(tamperedIndexPath, 'utf8'));
  tamperedIndex[0].filename = '../escape.json';
  fs.writeFileSync(tamperedIndexPath, `${JSON.stringify(tamperedIndex, null, 2)}\n`);
  await assert.rejects(() => store.readManifest('blog_pkg_2'), /dataset|path|escape|unsafe/i);

  const symlinkAssembly = assemblyFor('blog_pkg_symlink');
  await publishBlogWritingPack(store, symlinkAssembly);
  const symlinkWorkbook = path.join(packagesRoot, 'blog_pkg_symlink', 'BLOG_WRITING_PACK.xlsx');
  fs.unlinkSync(symlinkWorkbook);
  fs.symlinkSync(path.join(firstDirectory, 'BLOG_WRITING_PACK.xlsx'), symlinkWorkbook);
  await assert.rejects(() => store.readManifest('blog_pkg_symlink'), /workbook|regular|symlink/i);

  const truncatedAssembly = assemblyFor('blog_pkg_truncated');
  await publishBlogWritingPack(store, truncatedAssembly);
  fs.writeFileSync(path.join(packagesRoot, 'blog_pkg_truncated', 'BLOG_WRITING_PACK.xlsx'), Buffer.from('PK'));
  await assert.rejects(() => store.readManifest('blog_pkg_truncated'), /workbook|xlsx/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log('PASS BLOG-PACKAGE-STORE-001: approved layout, immutable snapshots, atomic cleanup, identity, containment, and XLSX integrity fail closed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
