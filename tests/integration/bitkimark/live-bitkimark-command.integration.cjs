const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');
const command = require(path.join(buildRoot, 'scripts/m3/live-bitkimark-sitemap-smoke.js'));

(async () => {
  let requests = 0;
  const neverFetch = async () => { requests += 1; throw new Error('fetch must not run'); };
  assert.throws(() => command.requireBitkimarkLiveSmokeConfirmation(['--sitemap-url', 'https://bitkimark.com/sitemap.xml']), /without --confirm-live-collection/);
  assert.throws(() => command.parseBitkimarkLiveSmokeArguments(['--confirm-live-collection', '--unknown']), /Unsupported argument/);
  await assert.rejects(() => command.executeBitkimarkLiveSmoke(['--confirm-live-collection', '--sitemap-url', 'http://bitkimark.com/sitemap.xml'], neverFetch), /must use HTTPS/);
  assert.equal(requests, 0);

  const xml = Buffer.from('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://bitkimark.com/ficus-benjamin</loc></url><url><loc>https://bitkimark.com/sansevieria-ofis</loc></url></urlset>');
  const fakeFetch = async (requestedUrl) => { requests += 1; return { ok: true, status: 200, url: requestedUrl, headers: { get: () => 'application/xml' }, arrayBuffer: async () => xml }; };
  const summary = await command.executeBitkimarkLiveSmoke(['--confirm-live-collection', '--sitemap-url', 'https://bitkimark.com/sitemap.xml'], fakeFetch);
  assert.equal(requests, 1);
  assert.equal(summary.byte_size, xml.length);
  assert.equal(summary.sha256, crypto.createHash('sha256').update(xml).digest('hex'));
  assert.equal(summary.validation_status, 'VALID');
  assert.equal(summary.url_count, 2);
  assert.deepEqual(summary.annotation_counts, { ficus: 1, benjamin: 1, sansevieria: 1, ofis: 1 });
  assert.equal(summary.raw_artifact_persisted, false);

  let failedRequests = 0;
  await assert.rejects(() => command.executeBitkimarkLiveSmoke(['--confirm-live-collection', '--sitemap-url=https://bitkimark.com/sitemap.xml'], async (requestedUrl) => { failedRequests += 1; return { ok: false, status: 503, url: requestedUrl, headers: { get: () => 'text/plain' }, arrayBuffer: async () => Buffer.from('upstream') }; }), /HTTP_503/);
  assert.equal(failedRequests, 1);
  console.log('PASS BITKIMARK-LIVE-CMD-001');
})().catch((error) => { console.error(error); process.exitCode = 1; });
