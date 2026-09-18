const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build and work roots.');

const load = (file) => require(path.join(buildRoot, file));
const { parseBitkimarkSitemap } = load('main/sources/bitkimark/bitkimark-sitemap-parser.js');
const { BitkimarkSitemapSource } = load('main/sources/bitkimark/bitkimark-sitemap-source.js');
const { BitkimarkSitemapValidator } = load('main/sources/bitkimark/bitkimark-sitemap-validator.js');
const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
const { createProductionCollectionRuntime } = load('main/app/production-collection-runtime.js');
const { initializeDatabase, getDatabasePath } = load('main/storage/database.js');
const { StateRepository } = load('main/storage/state-repository.js');

const SOURCE = 'bitkimark-sitemap';
const TASK = 'bitkimark-sitemap';
const ROOT_URL = 'https://bitkimark.com/sitemap.xml';
const BLOGS_URL = 'https://bitkimark.com/blogs.xml';

const contextFor = (requestedUrl, parentSitemapUrl = null) => ({
  task_id: TASK,
  source_id: SOURCE,
  source_mode: 'HTTP_XML',
  requested_url: requestedUrl,
  expected_host: 'bitkimark.com',
  parent_sitemap_url: parentSitemapUrl,
});

const collectionContextFor = (sourceContext) => ({
  source_id: SOURCE,
  source_context: sourceContext,
});

const bytes = (value) => new TextEncoder().encode(value);

const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${BLOGS_URL}</loc><lastmod>2026-09-17T10:15:30+00:00</lastmod></sitemap>
  <sitemap><loc>https://bitkimark.com/pages.xml</loc></sitemap>
</sitemapindex>`;

const urlSet = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://bitkimark.com/blog/ficus-care</loc><lastmod>2026-09-17</lastmod></url>
  <url><loc>https://bitkimark.com/blog/other</loc></url>
</urlset>`;

test('BITKIMARK-PARSER-001: sitemap index and child URL set preserve kind, loc, nullable lastmod, and relationship', () => {
  const index = parseBitkimarkSitemap(bytes(sitemapIndex), {
    source_url: ROOT_URL,
    expected_host: 'bitkimark.com',
    parent_sitemap_url: null,
    retrieved_at: '2026-09-18T10:00:00.000Z',
  });
  assert.equal(index.document_kind, 'SITEMAP_INDEX');
  assert.equal(index.parent_sitemap_url, null);
  assert.deepEqual(index.entries, [
    {
      entry_type: 'SITEMAP',
      url: BLOGS_URL,
      lastmod: '2026-09-17T10:15:30+00:00',
      annotations: [],
    },
    {
      entry_type: 'SITEMAP',
      url: 'https://bitkimark.com/pages.xml',
      lastmod: null,
      annotations: [],
    },
  ]);

  const child = parseBitkimarkSitemap(bytes(urlSet), {
    source_url: BLOGS_URL,
    expected_host: 'bitkimark.com',
    parent_sitemap_url: ROOT_URL,
    retrieved_at: '2026-09-18T10:00:01.000Z',
  });
  assert.equal(child.document_kind, 'URL_SET');
  assert.equal(child.parent_sitemap_url, ROOT_URL);
  assert.deepEqual(child.entries[0], {
    entry_type: 'URL',
    url: 'https://bitkimark.com/blog/ficus-care',
    lastmod: '2026-09-17',
    annotations: ['ficus'],
  });
  assert.equal(child.entries[1].lastmod, null);
});

test('BITKIMARK-PARSER-002: malformed, non-sitemap, duplicate, foreign, insecure, and invalid-date XML fails closed', () => {
  const parse = (xml) => parseBitkimarkSitemap(bytes(xml), {
    source_url: ROOT_URL,
    expected_host: 'bitkimark.com',
    parent_sitemap_url: null,
    retrieved_at: '2026-09-18T10:00:00.000Z',
  });

  for (const [label, xml] of [
    ['HTML', '<html><body>error</body></html>'],
    ['malformed XML', '<urlset><url><loc>https://bitkimark.com/a</loc></urlset>'],
    ['unexpected root', '<?xml version="1.0"?><feed><loc>https://bitkimark.com/a</loc></feed>'],
    ['missing loc', '<?xml version="1.0"?><urlset><url><lastmod>2026-09-17</lastmod></url></urlset>'],
    ['foreign host', '<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url></urlset>'],
    ['insecure URL', '<?xml version="1.0"?><urlset><url><loc>http://bitkimark.com/a</loc></url></urlset>'],
    ['invalid lastmod', '<?xml version="1.0"?><urlset><url><loc>https://bitkimark.com/a</loc><lastmod>2026-02-31</lastmod></url></urlset>'],
    ['duplicate loc', '<?xml version="1.0"?><urlset><url><loc>https://bitkimark.com/a</loc></url><url><loc>https://bitkimark.com/a</loc></url></urlset>'],
    ['unverified child', '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://bitkimark.com/other.xml</loc></sitemap></sitemapindex>'],
    ['doctype', '<?xml version="1.0"?><!DOCTYPE urlset><urlset><url><loc>https://bitkimark.com/a</loc></url></urlset>'],
  ]) {
    assert.throws(() => parse(xml), undefined, label);
  }
});

test('BITKIMARK-SOURCE-CONTEXT-001: each collect binds one explicit Job URL and captures response metadata without stale URL reuse', async () => {
  const requests = [];
  const responseFor = (requestedUrl) => ({
    ok: true,
    status: 200,
    url: requestedUrl,
    headers: {
      get: (name) => name.toLowerCase() === 'content-type' ? 'application/xml; charset=utf-8' : null,
    },
    arrayBuffer: async () => bytes(requestedUrl === ROOT_URL ? sitemapIndex : urlSet),
  });
  const source = new BitkimarkSitemapSource(async (requestedUrl) => {
    requests.push(requestedUrl);
    return responseFor(requestedUrl);
  });

  const root = await source.collect(collectionContextFor(contextFor(ROOT_URL)));
  const child = await source.collect(collectionContextFor(contextFor(BLOGS_URL, ROOT_URL)));
  assert.deepEqual(requests, [ROOT_URL, BLOGS_URL]);
  assert.equal(root.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(child.result_type, 'ARTIFACT_PRODUCED');
  assert.deepEqual(root.acquisition_metadata, {
    requested_url: ROOT_URL,
    final_url: ROOT_URL,
    response_status: 200,
    content_type: 'application/xml; charset=utf-8',
  });
  assert.deepEqual([...root.bytes], [...bytes(sitemapIndex)]);
  assert.deepEqual([...child.bytes], [...bytes(urlSet)]);

  for (const invalid of [
    { ...contextFor(ROOT_URL), task_id: 'other-task' },
    { ...contextFor(ROOT_URL), source_id: 'other-source' },
    { ...contextFor(ROOT_URL), source_mode: 'FILE_IMPORT' },
    { ...contextFor(ROOT_URL), requested_url: 'http://bitkimark.com/sitemap.xml' },
    { ...contextFor(ROOT_URL), requested_url: 'https://example.com/sitemap.xml' },
    { ...contextFor(ROOT_URL), requested_url: 'https://bitkimark.com/other.xml' },
    { ...contextFor(ROOT_URL), parent_sitemap_url: 'https://example.com/sitemap.xml' },
    {},
  ]) {
    const before = requests.length;
    const result = await source.collect(collectionContextFor(invalid));
    assert.equal(result.result_type, 'FAILED');
    assert.equal(requests.length, before, 'Invalid context must fail before fetch.');
  }
});

test('BITKIMARK-VALIDATOR-001: missing or mismatched HTTP provenance rejects otherwise parseable XML', async () => {
  const root = path.join(workRoot, 'validator');
  fs.mkdirSync(root, { recursive: true });
  const artifactPath = path.join(root, 'sitemap.xml');
  fs.writeFileSync(artifactPath, bytes(urlSet));
  const sourceContext = contextFor(BLOGS_URL, ROOT_URL);
  const base = {
    absolute_path: artifactPath,
    source_context: sourceContext,
    job: { source_id: SOURCE },
    artifact: { source_id: SOURCE, created_at: '2026-09-18T10:00:00.000Z' },
  };
  const cases = [
    undefined,
    { requested_url: BLOGS_URL, final_url: BLOGS_URL, response_status: 200, content_type: 'text/html' },
    { requested_url: BLOGS_URL, final_url: 'https://example.com/blogs.xml', response_status: 200, content_type: 'application/xml' },
    { requested_url: ROOT_URL, final_url: BLOGS_URL, response_status: 200, content_type: 'application/xml' },
    { requested_url: BLOGS_URL, final_url: BLOGS_URL, response_status: 304, content_type: 'application/xml' },
  ];
  for (const acquisition_metadata of cases) {
    const decision = await new BitkimarkSitemapValidator().validate({
      ...base,
      acquisition_metadata,
    });
    assert.equal(decision.validation_status, 'ERROR_NOT_DATA');
  }
});

test('BITKIMARK-REVIEW-CORE-001: reviewed root and child contexts persist through Core with raw and HTTP provenance', async (t) => {
  const root = path.join(workRoot, 'review-core');
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(root, key)]),
  );
  directories.app_data_root = root;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');

  let repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'Bitkimark test' });
  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    now: () => new Date('2026-09-18T10:00:00.000Z'),
    readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) },
  });
  const draft = controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  draft.reusable_configuration = {
    sources: {
      [SOURCE]: {
        included: true,
        task_id: TASK,
        sitemaps: [
          contextFor(ROOT_URL),
          contextFor(BLOGS_URL, ROOT_URL),
        ],
      },
    },
  };

  const duplicateDraft = structuredClone(draft);
  duplicateDraft.reusable_configuration.sources[SOURCE].sitemaps[1] = contextFor(ROOT_URL);
  const duplicateReview = await controller.reviewDraft(duplicateDraft);
  assert.equal(duplicateReview.reviewed_draft, null);
  assert.equal(duplicateReview.job_count, 0);
  assert.equal(duplicateReview.can_start, false);

  const review = await controller.reviewDraft(draft);
  assert.ok(review.reviewed_draft);
  assert.equal(review.job_count, 2);
  assert.equal(review.can_start, true);
  assert.deepEqual(review.reviewed_draft.resolved_configuration.sources[SOURCE].sitemaps, [
    contextFor(ROOT_URL),
    contextFor(BLOGS_URL, ROOT_URL),
  ]);
  const started = await controller.startDraft(review.reviewed_draft);
  assert.deepEqual(started.jobs.map((job) => job.source_context), [
    contextFor(ROOT_URL),
    contextFor(BLOGS_URL, ROOT_URL),
  ]);

  repository.close();
  repository = new StateRepository(getDatabasePath(directories));
  const requests = [];
  const runtime = createProductionCollectionRuntime({
    repository,
    directories,
    credentialStore: { readCredential: async () => '' },
    bitkimarkFetcher: async (requestedUrl) => {
      requests.push(requestedUrl);
      return {
        ok: true,
        status: 200,
        url: requestedUrl,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/xml' : null },
        arrayBuffer: async () => bytes(requestedUrl === ROOT_URL ? sitemapIndex : urlSet),
      };
    },
    googleTrendsSource: {
      id: 'google-trends', name: 'Google Trends', sourceMode: 'GOOGLE_TRENDS_UI', datasetTypes: ['INTEREST_OVER_TIME'],
      getCapabilities: () => ({ requires_browser: true, requires_oauth: false, may_require_manual_login: true, supports_custom_date_range: true, supports_direct_export: true, supports_api: false, supports_resume: true, max_concurrency: 1 }),
      checkReadiness: async () => ({ source_id: 'google-trends', readiness_status: 'READY', checked_at: new Date().toISOString(), message: null }),
      collect: async () => ({ result_type: 'FAILED', error_code: 'UNUSED', message: null }),
    },
  });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);

  assert.deepEqual(requests, [ROOT_URL, BLOGS_URL]);
  const completed = repository.listJobs(started.run.run_id);
  assert.deepEqual(completed.map((job) => job.execution_status), ['COMPLETED', 'COMPLETED']);
  assert.deepEqual(completed.map((job) => job.validation_status), ['VALID', 'VALID']);
  const artifacts = completed.map((job) => repository.getArtifact(job.accepted_artifact_id));
  assert.ok(artifacts.every(Boolean));
  assert.notEqual(artifacts[0].relative_path, artifacts[1].relative_path);
  assert.deepEqual([...fs.readFileSync(path.join(directories.runs, started.run.run_id, artifacts[0].relative_path))], [...bytes(sitemapIndex)]);
  assert.deepEqual([...fs.readFileSync(path.join(directories.runs, started.run.run_id, artifacts[1].relative_path))], [...bytes(urlSet)]);

  for (const job of completed) {
    const metadataPath = path.join(
      directories.runs,
      started.run.run_id,
      SOURCE,
      'metadata',
      `${job.job_key}.metadata.json`,
    );
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    assert.deepEqual(metadata.acquisition_metadata, {
      requested_url: job.source_context.requested_url,
      final_url: job.source_context.requested_url,
      response_status: 200,
      content_type: 'application/xml',
    });
    assert.equal(metadata.source_mode, 'HTTP_XML');
  }
});
