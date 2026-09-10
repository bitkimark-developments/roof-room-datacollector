const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build root and temporary work root.');

const { InMemoryCredentialStore } = require(path.join(buildRoot, 'main/core/credential-store.js'));
const { SerpApiClient, SERPAPI_TIMEOUT_MS } = require(path.join(buildRoot, 'main/sources/serpapi/serpapi-client.js'));
const { SerpApiSource } = require(path.join(buildRoot, 'main/sources/serpapi/serpapi-source.js'));
const { SerpApiValidator } = require(path.join(buildRoot, 'main/sources/serpapi/serpapi-validator.js'));
const { parseSerpApiResponse } = require(path.join(buildRoot, 'main/sources/serpapi/serpapi-parser.js'));
const { SerpApiRuntimeFactory } = require(path.join(buildRoot, 'main/sources/serpapi/serpapi-runtime.js'));
const { createSerpApiJobPlans } = require(path.join(buildRoot, 'main/sources/serpapi/serpapi-job-plans.js'));
const { serpApiReadinessEvaluator } = require(path.join(buildRoot, 'main/sources/serpapi/serpapi-readiness.js'));
const { SERPAPI_SOURCE_ID } = require(path.join(buildRoot, 'shared/serpapi.js'));
const { GoogleApiTransportError } = require(path.join(buildRoot, 'main/sources/google-api/api-helpers.js'));

const context = {
  query: 'ficus çeşitleri',
  country_code: 'TR',
  language_code: 'tr',
  device: 'desktop',
  engine: 'google',
  organic_limit: 10,
  snapshot_date: '2026-09-10',
};

const providerBody = {
  search_metadata: { status: 'Success', id: 'safe-id' },
  search_parameters: {
    engine: 'google', q: context.query, gl: 'tr', hl: 'tr', device: 'desktop', start: 0,
  },
  organic_results: Array.from({ length: 12 }, (_, index) => ({
    position: index + 1,
    title: index === 1 ? undefined : `Result ${index + 1}`,
    link: `https://example${index + 1}.com/page`,
    snippet: index === 1 ? undefined : `Snippet ${index + 1}`,
  })),
  related_questions: [
    { question: 'Ficus nasıl bakılır?', snippet: 'Provider answer.' },
    { question: 'Ficus ne kadar büyür?' },
  ],
};

const makeRecord = (overrides = {}) => ({
  run: {
    run_id: 'rr_test', workspace_id: 'workspace-a', application_version: 'test',
    configuration_snapshot: {}, requested_configuration: null,
  },
  job: {
    job_id: 'job-serp', run_id: 'rr_test', source_id: SERPAPI_SOURCE_ID,
    job_key: 'SERP-FICUS-001', query_group_id: null, source_context: context,
  },
  attempt: { attempt_id: 'attempt-serp', job_id: 'job-serp', attempt_number: 1 },
  artifact: {
    artifact_id: 'artifact-serp', run_id: 'rr_test', job_id: 'job-serp',
    attempt_number: 1, source_id: SERPAPI_SOURCE_ID,
  },
  ...overrides,
});

(async () => {
  const store = new InMemoryCredentialStore();
  store.put('serpapi:workspace-a', 'serpapi-secret');
  const connections = new Map([
    ['workspace-a', {
      connection_id: 'connection-a', workspace_id: 'workspace-a', source_id: SERPAPI_SOURCE_ID,
      credential_ref: 'serpapi:workspace-a', safe_metadata: {},
    }],
  ]);
  const repository = {
    getSourceConnection: (workspaceId, sourceId) =>
      sourceId === SERPAPI_SOURCE_ID ? connections.get(workspaceId) ?? null : null,
  };
  const requests = [];
  const requester = async (request) => {
    requests.push(request);
    return { status: 200, body: providerBody };
  };

  assert.equal(SERPAPI_TIMEOUT_MS, 300_000);
  const runtime = new SerpApiRuntimeFactory(repository, store, requester);
  assert.throws(() => runtime.createLiveSmokeSource({ workspace_id: 'workspace-a', confirmation: 'no' }), /explicit confirmation/u);
  assert.equal(requests.length, 0);
  assert.equal(runtime.createSource({ workspace_id: 'workspace-b' }), null);

  const source = runtime.createSource({ workspace_id: 'workspace-a' });
  assert.equal(source.id, SERPAPI_SOURCE_ID);
  const collected = await source.collect({ source_context: context, job_key: 'SERP-FICUS-001' });
  assert.equal(collected.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(collected.media_type, 'application/json');
  assert.equal(JSON.stringify(requests[0]).includes('serpapi-secret'), true);
  assert.equal(requests[0].url.includes('api_key=serpapi-secret'), true);
  const parsedRaw = JSON.parse(Buffer.from(collected.bytes).toString());
  assert.deepEqual(parsedRaw, JSON.parse(JSON.stringify(providerBody)));
  assert.equal(requests[0].url.includes('engine=google'), true);
  assert.equal(requests[0].url.includes('q=ficus+%C3%A7e%C5%9Fitleri'), true);
  assert.equal(requests[0].url.includes('gl=tr'), true);
  assert.equal(requests[0].url.includes('hl=tr'), true);
  assert.equal(requests[0].url.includes('device=desktop'), true);
  assert.equal(requests[0].url.includes('start=0'), true);

  const parsed = parseSerpApiResponse(providerBody, context);
  assert.equal(parsed.rows.filter((row) => row.result_type === 'ORGANIC').length, 10);
  assert.equal(parsed.rows.filter((row) => row.result_type === 'PAA').length, 2);
  assert.equal(parsed.rows[1].title, null);
  assert.equal(parsed.rows[0].domain, 'example1.com');
  assert.equal(parsed.rows[10].paa, 'Ficus nasıl bakılır?');
  assert.equal(parsed.rows[10].snippet, 'Provider answer.');
  assert.equal(parsed.rows[11].snippet, null);

  const rawPath = path.join(workRoot, 'serpapi.json');
  fs.mkdirSync(workRoot, { recursive: true });
  fs.writeFileSync(rawPath, JSON.stringify(providerBody));
  const validation = await new SerpApiValidator().validate({
    ...makeRecord(), absolute_path: rawPath, source_context: context,
  });
  assert.equal(validation.validation_status, 'VALID');
  assert.equal(validation.findings.length, 0);

  const plans = createSerpApiJobPlans([
    { job_key: 'SERP-FICUS-001', query: 'ficus çeşitleri' },
    { job_key: 'SERP-PASA-001', query: 'paşa kılıcı' },
    { job_key: 'SERP-OFFICE-001', query: 'ofis bitkileri' },
  ], context);
  assert.equal(plans.length, 3);
  assert.deepEqual(plans.map((plan) => plan.query_group_id), [null, null, null]);
  assert.equal(plans[0].source_context.query, 'ficus çeşitleri');
  assert.equal(JSON.stringify(plans).includes('serpapi-secret'), false);

  assert.equal(serpApiReadinessEvaluator({ connection: null, credential_available: false }), 'CONFIGURATION_REQUIRED');
  assert.equal(serpApiReadinessEvaluator({ connection: connections.get('workspace-a'), credential_available: false }), 'CONNECTION_REQUIRED');
  assert.equal(serpApiReadinessEvaluator({ connection: connections.get('workspace-a'), credential_available: true }), 'READY');

  const quotaSource = new SerpApiSource(new SerpApiClient(store, 'serpapi:workspace-a', async () => ({ status: 429, body: { error: 'quota' } })));
  const quota = await quotaSource.collect({ source_context: context, job_key: 'SERP-FICUS-001' });
  assert.equal(quota.result_type, 'FAILED');
  assert.equal(quota.error_code, 'QUOTA_EXCEEDED');
  const timeoutSource = new SerpApiSource(new SerpApiClient(store, 'serpapi:workspace-a', async () => {
    throw new GoogleApiTransportError('REQUEST_TIMEOUT', 'timeout');
  }));
  const timeout = await timeoutSource.collect({ source_context: context, job_key: 'SERP-FICUS-001' });
  assert.equal(timeout.result_type, 'FAILED');
  assert.equal(timeout.error_code, 'REQUEST_TIMEOUT');

  await store.deleteCredential('serpapi:workspace-a');
  const missing = await runtime.createSource({ workspace_id: 'workspace-a' }).collect({ source_context: context, job_key: 'SERP-FICUS-001' });
  assert.equal(missing.result_type, 'FAILED');
  assert.equal(missing.error_code, 'CONNECTION_REQUIRED');
  console.log('PASS SERPAPI-001: Workspace-scoped credentialed SerpApi source preserves raw JSON, first-ten organic/PAA normalization, readiness, quota stop, and query-level Job plans');
})();
