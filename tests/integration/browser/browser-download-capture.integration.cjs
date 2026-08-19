const assert = require(
  'node:assert/strict',
);
const {
  createHash,
} = require(
  'node:crypto',
);
const path = require(
  'node:path',
);
const {
  Readable,
} = require(
  'node:stream',
);

const [buildRoot] =
  process.argv.slice(2);

if (!buildRoot) {
  throw new Error(
    'Expected compiled build root.',
  );
}

const {
  BrowserDownloadCaptureError,
  captureBrowserDownload,
} = require(
  path.join(
    buildRoot,
    'main',
    'browser',
    'browser-download-capture.js',
  ),
);

class FakeDownload {
  constructor({
    bytes = Buffer.from(
      'provider csv bytes',
      'utf8',
    ),
    failure = null,
  } = {}) {
    this.bytes = bytes;
    this.failureValue = failure;
    this.readCalls = 0;
  }

  suggestedFilename() {
    return 'multiTimeline.csv';
  }

  async createReadStream() {
    this.readCalls += 1;

    return Readable.from(
      this.bytes,
    );
  }

  async saveAs() {
    throw new Error(
      'capture must not persist through saveAs',
    );
  }

  async failure() {
    return this.failureValue;
  }
}

class FakePage {
  constructor(download = new FakeDownload()) {
    this.waitCalls = [];
    this.waitArmed = false;
    this.download = download;
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
}

const main = async () => {
  const bytes =
    Buffer.from(
      'exact provider csv bytes',
      'utf8',
    );

  const page =
    new FakePage(
      new FakeDownload({
        bytes,
      }),
    );

  let triggerCalls = 0;

  const captured =
    await captureBrowserDownload({
      page,
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

  console.log(
    'PASS BROWSER-DOWNLOAD-001: the page download listener is armed before the triggering UI action',
  );

  assert.deepEqual(
    Buffer.from(
      captured.bytes,
    ),
    bytes,
  );
  assert.equal(
    captured.byte_size,
    bytes.byteLength,
  );
  assert.equal(
    captured.sha256,
    createHash('sha256')
      .update(bytes)
      .digest('hex'),
  );
  assert.equal(
    page.download.readCalls,
    1,
  );

  console.log(
    'PASS BROWSER-DOWNLOAD-002: exact provider bytes, byte size, and SHA-256 are captured without writing a public copy',
  );

  assert.equal(
    captured.suggested_filename,
    'multiTimeline.csv',
  );
  assert.equal(
    page.waitCalls[0]
      .options.timeout,
    12_345,
  );

  console.log(
    'PASS BROWSER-DOWNLOAD-003: provider filename evidence and caller-controlled bounded timeout cross the capture boundary',
  );

  const defaultTimeoutPage =
    new FakePage();

  await captureBrowserDownload({
    page:
      defaultTimeoutPage,
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
        captureBrowserDownload({
          page:
            invalidPage,
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

  await assert.rejects(
    () =>
      captureBrowserDownload({
        page:
          failingTriggerPage,
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
    failingTriggerPage
      .download.readCalls,
    0,
  );

  console.log(
    'PASS BROWSER-DOWNLOAD-006: trigger failures are surfaced without reading phantom bytes or retrying',
  );

  const failedDownloadPage =
    new FakePage(
      new FakeDownload({
        failure:
          'download canceled',
      }),
    );

  await assert.rejects(
    () =>
      captureBrowserDownload({
        page:
          failedDownloadPage,
        trigger_download:
          async () => {},
      }),
    (error) =>
      error instanceof
        BrowserDownloadCaptureError &&
      /download canceled/u.test(
        error.message,
      ),
  );

  assert.equal(
    failedDownloadPage
      .download.readCalls,
    0,
  );

  console.log(
    'PASS BROWSER-DOWNLOAD-007: provider-reported download failure blocks byte capture and remains a typed failure',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
