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
  GOOGLE_TRENDS_DATE_DIALOG_DIAGNOSTIC_CONTROLS,
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
    beforeInnerText,
  }) {
    this.name = name;
    this.countValue = count;
    this.trace = trace;
    this.beforeInnerText =
      beforeInnerText;
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

  async innerText(options) {
    this.trace.push({
      op: 'innerText',
      locator: this.name,
      options,
    });

    this.beforeInnerText?.();

    if (this.countValue !== 1) {
      throw new Error(
        `strict mode violation for ${this.name}: ${this.countValue} matches`,
      );
    }

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
      observedCount:
        this.countValue,
    });

    return this.countValue;
  }
}

class FakePage {
  constructor({
    dialogCount = 1,
    dialogBecomesAvailableOnRead = false,
    startCount = 1,
    endCount = 1,
  } = {}) {
    this.trace = [];

    this.dialog =
      new FakeLocator({
        name: 'archive-dialog',
        count: dialogCount,
        trace: this.trace,
        beforeInnerText:
          dialogBecomesAvailableOnRead
            ? () => {
                this.dialog.countValue =
                  1;
              }
            : undefined,
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
      error.diagnostic_context
        ?.control ===
        GOOGLE_TRENDS_DATE_DIALOG_DIAGNOSTIC_CONTROLS
          .ARCHIVE_DIALOG &&
      error.diagnostic_context
        ?.observed_count ===
        0,
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
    (error) =>
      error instanceof
        GoogleTrendsDateDialogContractError &&
      error.diagnostic_context
        ?.control ===
        GOOGLE_TRENDS_DATE_DIALOG_DIAGNOSTIC_CONTROLS
          .START_DATE_INPUT &&
      error.diagnostic_context
        ?.observed_count ===
        2,
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

  const missingEnd =
    new FakePage({
      endCount:
        0,
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateFields({
        page:
          missingEnd,
        requested_date_start:
          '2024-08-18',
        requested_date_end:
          '2026-08-17',
      }),
    (error) =>
      error instanceof
        GoogleTrendsDateDialogContractError &&
      error.diagnostic_context
        ?.control ===
        GOOGLE_TRENDS_DATE_DIALOG_DIAGNOSTIC_CONTROLS
          .END_DATE_INPUT &&
      error.diagnostic_context
        ?.observed_count ===
        0,
  );

  console.log(
    'PASS GT-DATE-DIALOG-009: missing To input reports structured allowlisted control cardinality evidence',
  );

  const delayedDialog =
    new FakePage({
      dialogCount:
        0,
      dialogBecomesAvailableOnRead:
        true,
    });

  await applyGoogleTrendsCustomDateFields({
    page:
      delayedDialog,
    requested_date_start:
      '2024-08-18',
    requested_date_end:
      '2026-08-17',
    ui_action_timeout_ms:
      4_000,
  });

  const initialDialogCount =
    delayedDialog.trace.find(
      (entry) =>
        entry.op === 'count' &&
        entry.locator ===
          'archive-dialog' &&
        entry.observedCount ===
          0,
    );

  const dialogReadiness =
    delayedDialog.trace.find(
      (entry) =>
        entry.op === 'innerText' &&
        entry.locator ===
          'archive-dialog',
    );

  assert.ok(
    initialDialogCount,
  );
  assert.deepEqual(
    dialogReadiness?.options,
    {
      timeout:
        4_000,
    },
  );
  assert.equal(
    delayedDialog.trace.filter(
      (entry) =>
        entry.op === 'fill',
    ).length,
    2,
  );

  console.log(
    'PASS GT-DATE-DIALOG-010: the existing bounded locator read waits for the asynchronously exposed ARCHIVE dialog before field inspection',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
