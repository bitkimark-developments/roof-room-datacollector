const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = process.argv[3];
if (!projectRoot) throw new Error('Expected project root argument.');

const {
  createDesktopBlogWritingPackHandlers,
} = require(`${process.argv[2]}/main/app/desktop-blog-writing-pack-ipc.js`);
const {
  DesktopBlogWritingPackControllerError,
} = require(`${process.argv[2]}/main/app/desktop-blog-writing-pack-controller.js`);
const { IPC_CHANNELS } = require(`${process.argv[2]}/shared/application-info.js`);

const coverage = {
  INTEREST_OVER_TIME: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
  QUERY_PAGE: { status: 'COVERED', total_jobs: 1, accepted_jobs: 1, no_data_jobs: 0, incomplete_jobs: 0 },
  SEARCH_TERMS: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
  KEYWORD_HISTORICAL_METRICS: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
  PRODUCTS: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
  SITEMAP_URLS: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
  GOOGLE_SERP: { status: 'MISSING', total_jobs: 0, accepted_jobs: 0, no_data_jobs: 0, incomplete_jobs: 0 },
};
const published = {
  status: 'PACKAGE_PUBLISHED',
  package: {
    package_id: 'blog_pkg_1', run_id: 'run_blog_1', coverage_status: 'PARTIAL',
    present_datasets: ['QUERY_PAGE'], no_data_datasets: [], incomplete_datasets: [],
    missing_datasets: ['INTEREST_OVER_TIME', 'SEARCH_TERMS', 'KEYWORD_HISTORICAL_METRICS', 'PRODUCTS', 'SITEMAP_URLS', 'GOOGLE_SERP'],
  },
};

const createHarness = ({ buildResult = published, buildError = null } = {}) => {
  const calls = { trust: 0, build: [], open: [], reveal: [] };
  const handlers = createDesktopBlogWritingPackHandlers({
    assertTrustedSender: (event) => { calls.trust += 1; if (event !== 'trusted') throw new Error('UNTRUSTED'); },
    controller: {
      build: async (runId) => {
        calls.build.push(runId);
        if (buildError) throw buildError;
        return structuredClone(buildResult);
      },
    },
    open_package: async (packageId) => { calls.open.push(packageId); },
    reveal_package: async (packageId) => { calls.reveal.push(packageId); },
  });
  return { handlers, calls };
};

const assertFailure = (value, code) => assert.deepEqual(value, { ok: false, error: { code, retryable: false } });

(async () => {
  const mainSource = fs.readFileSync(path.join(projectRoot, 'src', 'main.ts'), 'utf8');
  const guardedResolver = mainSource.match(
    /const requireBlogWritingPackHandlers\s*=\s*\([\s\S]*?\n\s*\};/u,
  )?.[0];
  assert.equal(typeof guardedResolver, 'string');
  assert.notEqual(
    guardedResolver.indexOf('assertTrustedIpcSender'),
    -1,
    'Blog IPC composition resolver must authenticate the sender.',
  );
  assert.equal(
    guardedResolver.indexOf('assertTrustedIpcSender') < guardedResolver.indexOf('desktopBlogWritingPackHandlers === null'),
    true,
    'Blog IPC must authenticate the sender before reporting unavailable composition.',
  );

  globalThis.__ipcInvocations = [];
  require(`${process.argv[2]}/preload.js`);
  assert.equal(globalThis.__exposedApi.name, 'roofroom');
  const api = globalThis.__exposedApi.api;
  await api.buildBlogWritingPack('run_blog_1');
  await api.openBlogWritingPack('blog_pkg_1');
  await api.revealBlogWritingPack('blog_pkg_1');
  assert.deepEqual(globalThis.__ipcInvocations.slice(-3), [
    [IPC_CHANNELS.DESKTOP_BLOG_WRITING_PACK_BUILD, { run_id: 'run_blog_1' }],
    [IPC_CHANNELS.DESKTOP_BLOG_WRITING_PACK_OPEN, { package_id: 'blog_pkg_1' }],
    [IPC_CHANNELS.DESKTOP_BLOG_WRITING_PACK_REVEAL, { package_id: 'blog_pkg_1' }],
  ]);

  for (const operation of ['build', 'open', 'reveal']) {
    const harness = createHarness();
    await assert.rejects(
      harness.handlers[operation]('untrusted', operation === 'build' ? { run_id: 'run_blog_1' } : { package_id: 'blog_pkg_1' }),
      /UNTRUSTED/,
    );
    assert.equal(harness.calls.build.length + harness.calls.open.length + harness.calls.reveal.length, 0);
  }

  for (const value of [null, {}, { run_id: '' }, { run_id: '../x' }, { run_id: 'run_1', path: '/tmp/x' }]) {
    const harness = createHarness();
    assertFailure(await harness.handlers.build('trusted', value), 'INVALID_INTENT');
    assert.equal(harness.calls.build.length, 0);
  }
  for (const operation of ['open', 'reveal']) {
    for (const value of [null, {}, { package_id: '' }, { package_id: '../x' }, { package_id: 'pkg', path: '/tmp/x' }]) {
      const harness = createHarness();
      assertFailure(await harness.handlers[operation]('trusted', value), 'INVALID_INTENT');
      assert.equal(harness.calls[operation].length, 0);
    }
  }

  const valid = createHarness();
  assert.deepEqual(await valid.handlers.build('trusted', { run_id: 'run_blog_1' }), { ok: true, result: published });
  assert.deepEqual(await valid.handlers.open('trusted', { package_id: 'blog_pkg_1' }), { ok: true, result: { package_id: 'blog_pkg_1' } });
  assert.deepEqual(await valid.handlers.reveal('trusted', { package_id: 'blog_pkg_1' }), { ok: true, result: { package_id: 'blog_pkg_1' } });
  assert.deepEqual(valid.calls.build, ['run_blog_1']);
  assert.deepEqual(valid.calls.open, ['blog_pkg_1']);
  assert.deepEqual(valid.calls.reveal, ['blog_pkg_1']);

  const notReady = { status: 'NOT_READY', run_id: 'run_blog_1', missing_datasets: Object.keys(coverage), coverage_by_dataset: coverage };
  assert.deepEqual(
    await createHarness({ buildResult: notReady }).handlers.build('trusted', { run_id: 'run_blog_1' }),
    { ok: true, result: notReady },
  );
  const unsafe = structuredClone(published);
  unsafe.package.absolute_path = '/Users/private/package';
  assertFailure(await createHarness({ buildResult: unsafe }).handlers.build('trusted', { run_id: 'run_blog_1' }), 'LOCAL_RESULT_INVALID');

  assertFailure(
    await createHarness({ buildError: new DesktopBlogWritingPackControllerError('UNKNOWN_RUN') }).handlers.build('trusted', { run_id: 'run_blog_1' }),
    'UNKNOWN_RUN',
  );
  assertFailure(
    await createHarness({ buildError: new Error('secret token /Users/private/provider-body') }).handlers.build('trusted', { run_id: 'run_blog_1' }),
    'BUILD_FAILED',
  );

  console.log('PASS DESKTOP-BLOG-IPC-001: trusted exact IDs and safe local results bound Build, Open, and Reveal without renderer paths');
})().catch((error) => { console.error(error); process.exitCode = 1; });
