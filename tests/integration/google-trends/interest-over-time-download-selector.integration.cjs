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
  downloadGoogleTrendsInterestOverTime,
  GoogleTrendsUiContractError,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-interest-over-time-download.js',
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

class FakeLocator {
  constructor({
    name,
    count = 1,
    trace,
  }) {
    this.name = name;
    this.countValue = count;
    this.trace = trace;
    this.children =
      new Map();
  }

  setChild(
    key,
    locator,
  ) {
    this.children.set(
      key,
      locator,
    );
  }

  async innerText() {
    return this.name;
  }

  async click(options) {
    this.trace.push({
      op: 'click',
      locator:
        this.name,
      options,
    });
  }

  async fill() {
    throw new Error(
      'not used',
    );
  }

  async press() {
    throw new Error(
      'not used',
    );
  }

  locator(selector) {
    this.trace.push({
      op: 'locator',
      locator:
        this.name,
      selector,
    });

    const child =
      this.children.get(
        `locator:${selector}`,
      );

    if (!child) {
      throw new Error(
        `Missing fake locator child: ${this.name} -> ${selector}`,
      );
    }

    return child;
  }

  getByRole(
    role,
    options,
  ) {
    this.trace.push({
      op: 'getByRole',
      locator:
        this.name,
      role,
      options,
    });

    const key =
      `role:${role}:${options?.name ?? ''}`;

    const child =
      this.children.get(
        key,
      );

    if (!child) {
      throw new Error(
        `Missing fake role child: ${this.name} -> ${key}`,
      );
    }

    return child;
  }

  async count() {
    this.trace.push({
      op: 'count',
      locator:
        this.name,
    });

    return this.countValue;
  }
}

class FakePage {
  constructor({
    headingCount = 1,
    downloadButtonCount = 1,
  } = {}) {
    this.trace = [];
    this.download =
      new FakeDownload();

    this.heading =
      new FakeLocator({
        name:
          'interest-heading',
        count:
          headingCount,
        trace:
          this.trace,
      });

    this.cardHeader =
      new FakeLocator({
        name:
          'interest-card-header',
        trace:
          this.trace,
      });

    this.downloadButton =
      new FakeLocator({
        name:
          'interest-download-button',
        count:
          downloadButtonCount,
        trace:
          this.trace,
      });

    this.heading.setChild(
      'locator:..',
      this.cardHeader,
    );

    this.cardHeader.setChild(
      'role:button:file_download',
      this.downloadButton,
    );
  }

  async goto() {
    return null;
  }

  async title() {
    return 'Google Trends';
  }

  locator() {
    throw new Error(
      'page.locator must not be used by this selector contract',
    );
  }

  getByRole() {
    throw new Error(
      'page-global getByRole must not select the download button',
    );
  }

  getByText(
    text,
    options,
  ) {
    this.trace.push({
      op:
        'getByText',
      text,
      options,
    });

    assert.equal(
      text,
      'Interest over time',
    );

    assert.deepEqual(
      options,
      {
        exact: true,
      },
    );

    return this.heading;
  }

  async waitForEvent(
    event,
    options,
  ) {
    this.trace.push({
      op:
        'waitForEvent',
      event,
      options,
    });

    return this.download;
  }

  async close() {}
}

class FakeStore {
  constructor() {
    this.calls = [];
  }

  async save(input) {
    this.calls.push(
      input,
    );

    return {
      filename:
        input.preferred_filename ??
        'multiTimeline.csv',
      absolute_path:
        '/Users/test/Downloads/RoofRoom Data Collector/google-trends/multiTimeline.csv',
      byte_size:
        2467,
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

  const persisted =
    await downloadGoogleTrendsInterestOverTime({
      page,
      store,
      preferred_filename:
        'GT01_TR_2024-08-18_2026-08-17_interest_over_time.csv',
      download_timeout_ms:
        20_000,
      ui_action_timeout_ms:
        5_000,
    });

  assert.equal(
    persisted.byte_size,
    2467,
  );

  const scopedRoleCall =
    page.trace.find(
      (entry) =>
        entry.op ===
          'getByRole' &&
        entry.locator ===
          'interest-card-header',
    );

  assert.deepEqual(
    scopedRoleCall,
    {
      op:
        'getByRole',
      locator:
        'interest-card-header',
      role:
        'button',
      options: {
        name:
          'file_download',
      },
    },
  );

  assert.equal(
    page.trace.some(
      (entry) =>
        entry.op ===
          'click' &&
        entry.locator ===
          'interest-download-button',
    ),
    true,
  );

  const waitIndex =
    page.trace.findIndex(
      (entry) =>
        entry.op ===
          'waitForEvent',
    );

  const clickIndex =
    page.trace.findIndex(
      (entry) =>
        entry.op ===
          'click',
    );

  assert.ok(
    waitIndex >= 0 &&
      clickIndex >= 0 &&
      waitIndex < clickIndex,
    'download wait must be armed before the scoped button click',
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

  console.log(
    'PASS GT-DOWNLOAD-001: Interest over time export is scoped from its semantic heading to the card-local file_download button',
  );

  console.log(
    'PASS GT-DOWNLOAD-002: no page-global .first() download selector is required, preventing accidental Related queries export',
  );

  console.log(
    'PASS GT-DOWNLOAD-003: page-scoped download wait is armed before the verified Interest over time button is clicked',
  );

  console.log(
    'PASS GT-DOWNLOAD-004: the captured provider download is delegated to persistent public storage with google-trends source identity',
  );

  const missingHeadingPage =
    new FakePage({
      headingCount: 0,
    });

  const missingHeadingStore =
    new FakeStore();

  await assert.rejects(
    () =>
      downloadGoogleTrendsInterestOverTime({
        page:
          missingHeadingPage,
        store:
          missingHeadingStore,
      }),
    (error) =>
      error instanceof
        GoogleTrendsUiContractError &&
      /heading/u.test(
        error.message,
      ),
  );

  assert.equal(
    missingHeadingPage
      .trace.some(
        (entry) =>
          entry.op ===
          'waitForEvent',
      ),
    false,
  );

  assert.equal(
    missingHeadingStore
      .calls.length,
    0,
  );

  console.log(
    'PASS GT-DOWNLOAD-005: missing Interest over time heading fails closed before any download event wait or storage action',
  );

  const ambiguousDownloadPage =
    new FakePage({
      downloadButtonCount: 2,
    });

  const ambiguousDownloadStore =
    new FakeStore();

  await assert.rejects(
    () =>
      downloadGoogleTrendsInterestOverTime({
        page:
          ambiguousDownloadPage,
        store:
          ambiguousDownloadStore,
      }),
    (error) =>
      error instanceof
        GoogleTrendsUiContractError &&
      /download button/u.test(
        error.message,
      ),
  );

  assert.equal(
    ambiguousDownloadPage
      .trace.some(
        (entry) =>
          entry.op ===
          'waitForEvent',
      ),
    false,
  );

  assert.equal(
    ambiguousDownloadStore
      .calls.length,
    0,
  );

  console.log(
    'PASS GT-DOWNLOAD-006: ambiguous scoped download controls fail closed rather than choosing one by DOM position',
  );

  const invalidTimeoutPage =
    new FakePage();

  await assert.rejects(
    () =>
      downloadGoogleTrendsInterestOverTime({
        page:
          invalidTimeoutPage,
        store:
          new FakeStore(),
        ui_action_timeout_ms:
          0,
      }),
    /positive integer/u,
  );

  assert.equal(
    invalidTimeoutPage
      .trace.length,
    0,
  );

  console.log(
    'PASS GT-DOWNLOAD-007: invalid UI timeout configuration fails before inspecting or interacting with provider UI',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
