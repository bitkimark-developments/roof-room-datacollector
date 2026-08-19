const assert = require(
  'node:assert/strict',
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
  GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS,
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
  constructor() {
    this.bytes =
      Buffer.alloc(
        2467,
        1,
      );
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
      'download capture must not write a public copy',
    );
  }

  async failure() {
    return null;
  }
}

class FakeLocator {
  constructor({
    name,
    count = 1,
    readyAfterInnerText = false,
    trace,
  }) {
    this.name = name;
    this.countValue = count;
    this.readyAfterInnerText =
      readyAfterInnerText;
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

  async innerText(options) {
    this.trace.push({
      op:
        'innerText',
      locator:
        this.name,
      options,
    });

    if (this.readyAfterInnerText) {
      this.countValue = 1;
    }

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
    headingReadyAfterInnerText = false,
    downloadButtonReadyAfterInnerText = false,
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
        readyAfterInnerText:
          headingReadyAfterInnerText,
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
        readyAfterInnerText:
          downloadButtonReadyAfterInnerText,
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

const main = async () => {
  const page =
    new FakePage();

  const persisted =
    await downloadGoogleTrendsInterestOverTime({
      page,
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
    page.download.readCalls,
    1,
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
    'PASS GT-DOWNLOAD-004: exact provider bytes are captured directly without creating a pre-Core Downloads copy',
  );

  const missingHeadingPage =
    new FakePage({
      headingCount: 0,
    });

  await assert.rejects(
    () =>
      downloadGoogleTrendsInterestOverTime({
        page:
          missingHeadingPage,
      }),
    (error) =>
      error instanceof
        GoogleTrendsUiContractError &&
      error.diagnostic_context
        .control ===
        GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS
          .INTEREST_OVER_TIME_HEADING &&
      error.diagnostic_context
        .observed_count === 0 &&
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
    missingHeadingPage
      .download.readCalls,
    0,
  );

  console.log(
    'PASS GT-DOWNLOAD-005: missing Interest over time heading fails closed before any download event wait or byte capture',
  );

  const ambiguousDownloadPage =
    new FakePage({
      downloadButtonCount: 2,
    });

  await assert.rejects(
    () =>
      downloadGoogleTrendsInterestOverTime({
        page:
          ambiguousDownloadPage,
      }),
    (error) =>
      error instanceof
        GoogleTrendsUiContractError &&
      error.diagnostic_context
        .control ===
        GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS
          .DOWNLOAD_BUTTON &&
      error.diagnostic_context
        .observed_count === 2 &&
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
    ambiguousDownloadPage
      .download.readCalls,
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

  const asyncHeadingPage =
    new FakePage({
      headingCount:
        0,
      headingReadyAfterInnerText:
        true,
    });

  await downloadGoogleTrendsInterestOverTime({
    page:
      asyncHeadingPage,
    ui_action_timeout_ms:
      7_000,
  });

  assert.deepEqual(
    asyncHeadingPage.trace.find(
      (entry) =>
        entry.op ===
          'innerText' &&
        entry.locator ===
          'interest-heading',
    ),
    {
      op:
        'innerText',
      locator:
        'interest-heading',
      options: {
        timeout:
          7_000,
      },
    },
  );

  console.log(
    'PASS GT-DOWNLOAD-008: an asynchronously rendered Interest over time heading uses the existing bounded UI timeout instead of failing on an immediate zero count',
  );

  const asyncButtonPage =
    new FakePage({
      downloadButtonCount:
        0,
      downloadButtonReadyAfterInnerText:
        true,
    });

  await downloadGoogleTrendsInterestOverTime({
    page:
      asyncButtonPage,
    ui_action_timeout_ms:
      8_000,
  });

  assert.deepEqual(
    asyncButtonPage.trace.find(
      (entry) =>
        entry.op ===
          'innerText' &&
        entry.locator ===
          'interest-download-button',
    ),
    {
      op:
        'innerText',
      locator:
        'interest-download-button',
      options: {
        timeout:
          8_000,
      },
    },
  );

  console.log(
    'PASS GT-DOWNLOAD-009: an asynchronously rendered card-local download button uses the existing bounded UI timeout without changing selector scope',
  );

  const defaultReadinessPage =
    new FakePage({
      headingCount:
        0,
      headingReadyAfterInnerText:
        true,
    });

  await downloadGoogleTrendsInterestOverTime({
    page:
      defaultReadinessPage,
  });

  assert.equal(
    defaultReadinessPage.trace.find(
      (entry) =>
        entry.op ===
          'innerText' &&
        entry.locator ===
          'interest-heading',
    ).options.timeout,
    30_000,
  );

  console.log(
    'PASS GT-DOWNLOAD-010: default card readiness is bounded to the same 30-second window as provider download capture',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
