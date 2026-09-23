const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = process.argv[2];
if (!buildRoot) throw new Error('Expected compiled build root argument.');

const {
  MainProcessSerpApiCredentialAcquirer,
  SerpApiCredentialAcquisitionError,
} = require(path.join(
  buildRoot,
  'main',
  'sources',
  'serpapi',
  'serpapi-credential-acquirer.js',
));

const syntheticKey = 'rr_test_only_key_0123456789';

class FakeCredentialStore {
  constructor() {
    this.values = new Map();
    this.writes = [];
    this.deletes = [];
    this.failWrite = false;
    this.failDelete = false;
  }

  async hasCredential(reference) {
    return this.values.has(reference);
  }

  async readCredential(reference) {
    if (!this.values.has(reference)) throw new Error('credential missing');
    return this.values.get(reference);
  }

  async writeCredential(reference, secret) {
    this.writes.push([reference, secret]);
    if (this.failWrite) throw new Error(`write-${syntheticKey}`);
    this.values.set(reference, secret);
  }

  async deleteCredential(reference) {
    this.deletes.push(reference);
    if (this.failDelete) throw new Error(`delete-${syntheticKey}`);
    this.values.delete(reference);
  }
}

const createHarness = ({
  ingressResult = { status: 'SUBMITTED', secret: syntheticKey },
  ingressError = null,
  credentialRef = 'serpapi:test-ref',
  refFactoryError = null,
} = {}) => {
  const store = new FakeCredentialStore();
  const ingressCalls = [];
  const refFactoryCalls = [];
  const acquirer = new MainProcessSerpApiCredentialAcquirer({
    secret_ingress: {
      async requestSecret(input) {
        ingressCalls.push(input);
        if (ingressError) throw ingressError;
        return ingressResult;
      },
    },
    credential_store: store,
    credential_ref_factory: () => {
      refFactoryCalls.push(true);
      if (refFactoryError) throw refFactoryError;
      return credentialRef;
    },
  });
  return { acquirer, ingressCalls, refFactoryCalls, store };
};

const expectSafeError = async (operation, expectedCode, marker = syntheticKey) => {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof SerpApiCredentialAcquisitionError);
    assert.equal(error.code, expectedCode);
    assert.equal(error.message, 'SerpApi credential acquisition failed.');
    assert.equal(error.message.includes(marker), false);
    assert.equal(JSON.stringify(error).includes(marker), false);
    assert.equal(JSON.stringify(error).includes('credential_ref'), false);
    return true;
  });
};

const capturedConsoleCalls = [];
const originalConsole = {};
for (const method of ['log', 'error', 'warn', 'debug']) {
  originalConsole[method] = console[method];
  console[method] = (...values) => capturedConsoleCalls.push([method, values]);
}

const main = async () => {
  {
    const harness = createHarness();
    const result = await harness.acquirer.acquire();
    assert.deepEqual(result, {
      status: 'ACQUIRED',
      credential_ref: 'serpapi:test-ref',
    });
    assert.deepEqual(harness.ingressCalls, [{ purpose: 'SERPAPI_API_KEY' }]);
    assert.deepEqual(harness.refFactoryCalls, [true]);
    assert.deepEqual(harness.store.writes, [
      ['serpapi:test-ref', syntheticKey],
    ]);
    assert.deepEqual(harness.store.deletes, []);
    assert.equal(JSON.stringify(result).includes(syntheticKey), false);
  }

  {
    const harness = createHarness({ ingressResult: { status: 'CANCELLED' } });
    assert.deepEqual(await harness.acquirer.acquire(), { status: 'CANCELLED' });
    assert.deepEqual(harness.refFactoryCalls, []);
    assert.deepEqual(harness.store.writes, []);
    assert.deepEqual(harness.store.deletes, []);
  }

  for (const ingressCode of [
    'PROCESS_UNAVAILABLE',
    'PROCESS_FAILED',
    'TIMED_OUT',
    'OUTPUT_LIMIT_EXCEEDED',
    'INVALID_OUTPUT',
  ]) {
    const harness = createHarness({
      ingressResult: { status: 'FAILED', code: ingressCode },
    });
    await expectSafeError(
      () => harness.acquirer.acquire(),
      'SECRET_INGRESS_FAILED',
    );
    assert.deepEqual(harness.refFactoryCalls, [], ingressCode);
    assert.deepEqual(harness.store.writes, [], ingressCode);
    assert.deepEqual(harness.store.deletes, [], ingressCode);
  }

  {
    const harness = createHarness({
      ingressError: new Error(`ingress-${syntheticKey}`),
    });
    await expectSafeError(
      () => harness.acquirer.acquire(),
      'SECRET_INGRESS_FAILED',
    );
    assert.deepEqual(harness.refFactoryCalls, []);
    assert.deepEqual(harness.store.writes, []);
    assert.deepEqual(harness.store.deletes, []);
  }

  const invalidSecrets = [
    '',
    ' ',
    ` ${syntheticKey}`,
    `${syntheticKey} `,
    `${syntheticKey}\n`,
    `${syntheticKey}\t`,
    `${syntheticKey}é`,
    'a'.repeat(513),
  ];
  for (const invalidSecret of invalidSecrets) {
    const harness = createHarness({
      ingressResult: { status: 'SUBMITTED', secret: invalidSecret },
    });
    await expectSafeError(
      () => harness.acquirer.acquire(),
      'SECRET_INPUT_INVALID',
    );
    assert.deepEqual(harness.refFactoryCalls, []);
    assert.deepEqual(harness.store.writes, []);
    assert.deepEqual(harness.store.deletes, []);
  }

  for (const [label, validSecret] of [
    ['one byte', 'a'],
    ['512 bytes', 'a'.repeat(512)],
  ]) {
    const harness = createHarness({
      ingressResult: { status: 'SUBMITTED', secret: validSecret },
      credentialRef: `serpapi:${label.replace(' ', '-')}`,
    });
    assert.equal((await harness.acquirer.acquire()).status, 'ACQUIRED', label);
    assert.deepEqual(harness.store.writes, [
      [`serpapi:${label.replace(' ', '-')}`, validSecret],
    ]);
  }

  {
    const harness = createHarness({
      refFactoryError: new Error(`ref-${syntheticKey}`),
    });
    await expectSafeError(
      () => harness.acquirer.acquire(),
      'CREDENTIAL_PERSISTENCE_FAILED',
    );
    assert.deepEqual(harness.store.writes, []);
    assert.deepEqual(harness.store.deletes, []);
  }

  {
    const harness = createHarness({ credentialRef: 'serpapi:write-fail' });
    harness.store.failWrite = true;
    await expectSafeError(
      () => harness.acquirer.acquire(),
      'CREDENTIAL_PERSISTENCE_FAILED',
    );
    assert.deepEqual(harness.store.writes, [
      ['serpapi:write-fail', syntheticKey],
    ]);
    assert.deepEqual(harness.store.deletes, ['serpapi:write-fail']);
  }

  {
    const harness = createHarness({ credentialRef: 'serpapi:cleanup-fail' });
    harness.store.failWrite = true;
    harness.store.failDelete = true;
    await expectSafeError(
      () => harness.acquirer.acquire(),
      'CREDENTIAL_PERSISTENCE_FAILED',
    );
    assert.deepEqual(harness.store.deletes, ['serpapi:cleanup-fail']);
  }

  const serializedConsole = JSON.stringify(capturedConsoleCalls);
  assert.equal(serializedConsole.includes(syntheticKey), false);
  assert.equal(capturedConsoleCalls.length, 0);
};

main()
  .then(() => {
    for (const method of Object.keys(originalConsole)) {
      console[method] = originalConsole[method];
    }
    console.log(
      'PASS SERPAPI-CREDENTIAL-ACQUIRER-001: main-only acquisition validates structure, persists a fresh reference, and returns fixed secret-free outcomes',
    );
  })
  .catch((error) => {
    for (const method of Object.keys(originalConsole)) {
      console[method] = originalConsole[method];
    }
    throw error;
  });
