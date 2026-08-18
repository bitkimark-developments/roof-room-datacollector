const assert = require(
  'node:assert/strict',
);
const path = require(
  'node:path',
);

const [buildRoot] =
  process.argv.slice(2);

if (!buildRoot) {
  throw new Error(
    'Expected compiled build root.',
  );
}

const {
  captureAndPersistBrowserDownload,
} = require(
  path.join(
    buildRoot,
    'main',
    'browser',
    'browser-download-capture.js',
  ),
);

class FakeDownload {
  suggestedFilename() {
    return 'multiTimeline.csv';
  }

  async saveAs() {}

  async failure() {
    return null;
  }
}

class FakePage {
  constructor() {
    this.waitCalls = [];
    this.waitArmed = false;
    this.download =
      new FakeDownload();
  }

  async goto() {
    return null;
  }

  async title() {
    return 'Google Trends';
  }

  locator() {
    throw new Error(
      'not used in this test',
    );
  }

  getByRole() {
    throw new Error(
      'not used in this test',
    );
  }

  waitForEvent(
    event,
    options,
  ) {
    this.waitCalls.push({
      event,
      options,
    });
    this.waitArmed = true;

    return Promise.resolve(
      this.download,
    );
  }

  async close() {}
}

class FakeStore {
  constructor() {
    this.calls = [];
  }

  async save(input) {
    this.calls.push(input);

    return {
      filename:
        input.preferred_filename ??
        input.download
          .suggestedFilename(),
      absolute_path:
        '/tmp/public-download.csv',
      byte_size: 2467,
      sha256:
        'sha256-placeholder',
    };
  }
}

const main = async () => {
  const page =
    new FakePage();

  const store =
    new FakeStore();

  let triggerCalls = 0;

  const persisted =
    await captureAndPersistBrowserDownload({
      page,
      store,
      source_id:
        'google-trends',
      preferred_filename:
        'GT01_TR_2024-08-18_2026-08-17_interest_over_time.csv',
      timeout_ms: 12_345,
      trigger_download:
        async () => {
          triggerCalls += 1;

          assert.equal(
            page.waitArmed,
            true,
            'download listener must be armed before the UI action',
          );
        },
    });

  assert.equal(
    triggerCalls,
    1,
  );

  assert.deepEqual(
    page.waitCalls,
    [
      {
        event: 'download',
        options: {
          timeout: 12_345,
        },
      },
    ],
  );

  assert.equal(
    store.calls.length,
    1,
  );

  assert.equal(
    store.calls[0]
      .source_id,
    'google-trends',
  );

  assert.strictEqual(
    store.calls[0]
      .download,
    page.download,
  );

  assert.equal(
    store.calls[0]
      .preferred_filename,
    'GT01_TR_2024-08-18_2026-08-17_interest_over_time.csv',
  );

  assert.equal(
    persisted.byte_size,
    2467,
  );

  console.log(
    'PASS BROWSER-DOWNLOAD-001: the page download listener is armed before the triggering UI action',
  );

  console.log(
    'PASS BROWSER-DOWNLOAD-002: exactly one captured download is delegated to persistent public storage',
  );

  console.log(
    'PASS BROWSER-DOWNLOAD-003: caller-controlled source ID, preferred filename, and bounded timeout cross the capture boundary',
  );

  const defaultTimeoutPage =
    new FakePage();

  await captureAndPersistBrowserDownload({
    page:
      defaultTimeoutPage,
    store:
      new FakeStore(),
    source_id:
      'google-trends',
    trigger_download:
      async () => {},
  });

  assert.equal(
    defaultTimeoutPage
      .waitCalls[0]
      .options.timeout,
    30_000,
  );

  console.log(
    'PASS BROWSER-DOWNLOAD-004: capture uses a deterministic 30-second default timeout',
  );

  for (const invalid of [
    0,
    -1,
    1.5,
  ]) {
    const invalidPage =
      new FakePage();

    await assert.rejects(
      () =>
        captureAndPersistBrowserDownload({
          page:
            invalidPage,
          store:
            new FakeStore(),
          source_id:
            'google-trends',
          timeout_ms:
            invalid,
          trigger_download:
            async () => {},
        }),
      /positive integer/u,
    );

    assert.equal(
      invalidPage.waitCalls
        .length,
      0,
    );
  }

  console.log(
    'PASS BROWSER-DOWNLOAD-005: invalid timeout configuration fails before any browser event wait or provider action',
  );

  const failingTriggerPage =
    new FakePage();

  const failingStore =
    new FakeStore();

  await assert.rejects(
    () =>
      captureAndPersistBrowserDownload({
        page:
          failingTriggerPage,
        store:
          failingStore,
        source_id:
          'google-trends',
        trigger_download:
          async () => {
            throw new Error(
              'download button unavailable',
            );
          },
      }),
    /download button unavailable/u,
  );

  assert.equal(
    failingTriggerPage
      .waitCalls.length,
    1,
  );

  assert.equal(
    failingStore.calls.length,
    0,
  );

  console.log(
    'PASS BROWSER-DOWNLOAD-006: trigger failures are surfaced without persisting a phantom download or retrying',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
