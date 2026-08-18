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
  applyGoogleTrendsCustomDateFields,
  GoogleTrendsDateDialogContractError,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-custom-date-dialog.js',
  ),
);

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
    selector,
    locator,
  ) {
    this.children.set(
      selector,
      locator,
    );
  }

  async innerText() {
    return this.name;
  }

  async click() {
    throw new Error(
      'click is deliberately not used by this slice',
    );
  }

  async fill(
    value,
    options,
  ) {
    this.trace.push({
      op: 'fill',
      locator: this.name,
      value,
      options,
    });
  }

  async press() {
    throw new Error(
      'press is deliberately not used by this slice',
    );
  }

  locator(selector) {
    this.trace.push({
      op: 'locator',
      locator: this.name,
      selector,
    });

    const child =
      this.children.get(
        selector,
      );

    if (!child) {
      throw new Error(
        `Missing fake child for selector: ${selector}`,
      );
    }

    return child;
  }

  getByRole() {
    throw new Error(
      'getByRole is not used here',
    );
  }

  async count() {
    this.trace.push({
      op: 'count',
      locator: this.name,
    });

    return this.countValue;
  }
}

class FakePage {
  constructor({
    dialogCount = 1,
    startCount = 1,
    endCount = 1,
  } = {}) {
    this.trace = [];

    this.dialog =
      new FakeLocator({
        name: 'archive-dialog',
        count: dialogCount,
        trace: this.trace,
      });

    this.startInput =
      new FakeLocator({
        name: 'from-input',
        count: startCount,
        trace: this.trace,
      });

    this.endInput =
      new FakeLocator({
        name: 'to-input',
        count: endCount,
        trace: this.trace,
      });

    this.dialog.setChild(
      '.custom-date-picker-dialog-range-from input',
      this.startInput,
    );

    this.dialog.setChild(
      '.custom-date-picker-dialog-range-to input',
      this.endInput,
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
      'page-global locator is not used',
    );
  }

  getByRole() {
    throw new Error(
      'getByRole is not used',
    );
  }

  getByText() {
    throw new Error(
      'getByText is not used',
    );
  }

  getByLabel(
    text,
    options,
  ) {
    this.trace.push({
      op: 'getByLabel',
      text,
      options,
    });

    assert.equal(
      text,
      'ARCHIVE',
    );

    assert.deepEqual(
      options,
      {
        exact: true,
      },
    );

    return this.dialog;
  }

  async waitForEvent() {
    throw new Error(
      'download wait is not used',
    );
  }

  async close() {}
}

const main = async () => {
  const page =
    new FakePage();

  await applyGoogleTrendsCustomDateFields({
    page,
    requested_date_start:
      '2024-08-18',
    requested_date_end:
      '2026-08-17',
    ui_action_timeout_ms:
      4_000,
  });

  assert.deepEqual(
    page.trace.filter(
      (entry) =>
        entry.op === 'fill',
    ),
    [
      {
        op: 'fill',
        locator:
          'from-input',
        value:
          '8/18/2024',
        options: {
          timeout: 4_000,
        },
      },
      {
        op: 'fill',
        locator:
          'to-input',
        value:
          '8/17/2026',
        options: {
          timeout: 4_000,
        },
      },
    ],
  );

  console.log(
    'PASS GT-DATE-DIALOG-001: ISO requested dates are deterministically formatted for the observed Google Trends date inputs',
  );

  assert.equal(
    page.trace.some(
      (entry) =>
        entry.op ===
          'locator' &&
        entry.selector ===
          '.custom-date-picker-dialog-range-from input',
    ),
    true,
  );

  assert.equal(
    page.trace.some(
      (entry) =>
        entry.op ===
          'locator' &&
        entry.selector ===
          '.custom-date-picker-dialog-range-to input',
    ),
    true,
  );

  console.log(
    'PASS GT-DATE-DIALOG-002: From and To inputs are scoped through the verified ARCHIVE dialog selectors rather than .first()/.nth()',
  );

  const missingDialog =
    new FakePage({
      dialogCount: 0,
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateFields({
        page:
          missingDialog,
        requested_date_start:
          '2024-08-18',
        requested_date_end:
          '2026-08-17',
      }),
    (error) =>
      error instanceof
        GoogleTrendsDateDialogContractError &&
      /ARCHIVE/u.test(
        error.message,
      ),
  );

  assert.equal(
    missingDialog.trace.some(
      (entry) =>
        entry.op === 'fill',
    ),
    false,
  );

  console.log(
    'PASS GT-DATE-DIALOG-003: missing custom-date dialog fails closed before any field mutation',
  );

  const ambiguousStart =
    new FakePage({
      startCount: 2,
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateFields({
        page:
          ambiguousStart,
        requested_date_start:
          '2024-08-18',
        requested_date_end:
          '2026-08-17',
      }),
    /From input/u,
  );

  assert.equal(
    ambiguousStart.trace.some(
      (entry) =>
        entry.op === 'fill',
    ),
    false,
  );

  console.log(
    'PASS GT-DATE-DIALOG-004: ambiguous From input fails closed instead of choosing by DOM position',
  );

  const invalidCalendarDate =
    new FakePage();

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateFields({
        page:
          invalidCalendarDate,
        requested_date_start:
          '2024-02-30',
        requested_date_end:
          '2026-08-17',
      }),
    /valid calendar date/u,
  );

  assert.equal(
    invalidCalendarDate
      .trace.length,
    0,
  );

  console.log(
    'PASS GT-DATE-DIALOG-005: invalid calendar dates fail before provider UI inspection',
  );

  const reversedDates =
    new FakePage();

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateFields({
        page:
          reversedDates,
        requested_date_start:
          '2026-08-18',
        requested_date_end:
          '2024-08-17',
      }),
    /must not be after/u,
  );

  assert.equal(
    reversedDates.trace.length,
    0,
  );

  console.log(
    'PASS GT-DATE-DIALOG-006: reversed requested dates fail before provider UI inspection',
  );

  const invalidTimeout =
    new FakePage();

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateFields({
        page:
          invalidTimeout,
        requested_date_start:
          '2024-08-18',
        requested_date_end:
          '2026-08-17',
        ui_action_timeout_ms:
          0,
      }),
    /positive integer/u,
  );

  assert.equal(
    invalidTimeout.trace.length,
    0,
  );

  console.log(
    'PASS GT-DATE-DIALOG-007: invalid UI timeout fails before provider UI inspection',
  );

  console.log(
    'PASS GT-DATE-DIALOG-008: this slice fills fields only and does not guess or click an unverified dialog submit control',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
