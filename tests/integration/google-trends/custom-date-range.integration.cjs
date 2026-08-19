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
  applyGoogleTrendsCustomDateRange,
  GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS,
  GoogleTrendsDateRangeUiContractError,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-custom-date-range.js',
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

  async click(options) {
    this.trace.push({
      op: 'click',
      locator:
        this.name,
      options,
    });
  }

  async fill(
    value,
    options,
  ) {
    this.trace.push({
      op: 'fill',
      locator:
        this.name,
      value,
      options,
    });
  }

  async press() {
    throw new Error(
      'press is not used',
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
        selector,
      );

    if (!child) {
      throw new Error(
        `Missing child locator: ${this.name} -> ${selector}`,
      );
    }

    return child;
  }

  getByRole() {
    throw new Error(
      'locator.getByRole is not used in this workflow',
    );
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
    dateFilterCount = 1,
    optionCount = 1,
    dialogCount = 1,
    startCount = 1,
    endCount = 1,
    okCount = 1,
  } = {}) {
    this.trace = [];

    this.dateFilter =
      new FakeLocator({
        name:
          'date-filter',
        count:
          dateFilterCount,
        trace:
          this.trace,
      });

    this.customOption =
      new FakeLocator({
        name:
          'custom-range-option',
        count:
          optionCount,
        trace:
          this.trace,
      });

    this.dialog =
      new FakeLocator({
        name:
          'archive-dialog',
        count:
          dialogCount,
        trace:
          this.trace,
      });

    this.startInput =
      new FakeLocator({
        name:
          'from-input',
        count:
          startCount,
        trace:
          this.trace,
      });

    this.endInput =
      new FakeLocator({
        name:
          'to-input',
        count:
          endCount,
        trace:
          this.trace,
      });

    this.okButton =
      new FakeLocator({
        name:
          'ok-button',
        count:
          okCount,
        trace:
          this.trace,
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

  locator(selector) {
    this.trace.push({
      op:
        'page.locator',
      selector,
    });

    assert.equal(
      selector,
      'custom-date-picker',
    );

    return this.dateFilter;
  }

  getByRole(
    role,
    options,
  ) {
    this.trace.push({
      op:
        'page.getByRole',
      role,
      options,
    });

    if (
      role === 'option' &&
      options?.name ===
        'Custom time range...'
    ) {
      return this.customOption;
    }

    if (
      role === 'button' &&
      options?.name === 'OK'
    ) {
      return this.okButton;
    }

    throw new Error(
      `Unexpected role locator: ${role} ${options?.name ?? ''}`,
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
      op:
        'page.getByLabel',
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

const operations = (
  trace,
) =>
  trace.filter(
    (entry) =>
      entry.op ===
        'click' ||
      entry.op ===
        'fill',
  );

const main = async () => {
  const page =
    new FakePage();

  await applyGoogleTrendsCustomDateRange({
    page,
    requested_date_start:
      '2024-08-18',
    requested_date_end:
      '2026-08-17',
    ui_action_timeout_ms:
      4_000,
  });

  assert.deepEqual(
    operations(
      page.trace,
    ),
    [
      {
        op:
          'click',
        locator:
          'date-filter',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op:
          'click',
        locator:
          'custom-range-option',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op:
          'fill',
        locator:
          'from-input',
        value:
          '8/18/2024',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op:
          'fill',
        locator:
          'to-input',
        value:
          '8/17/2026',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op:
          'click',
        locator:
          'ok-button',
        options: {
          timeout:
            4_000,
        },
      },
    ],
  );

  console.log(
    'PASS GT-DATE-RANGE-001: verified date-filter, custom-option, From, To, and OK controls execute in deterministic order',
  );

  console.log(
    'PASS GT-DATE-RANGE-002: full date workflow uses no positional .first()/.nth() selectors',
  );

  const invalidDatePage =
    new FakePage();

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateRange({
        page:
          invalidDatePage,
        requested_date_start:
          '2024-02-30',
        requested_date_end:
          '2026-08-17',
      }),
    /valid calendar date/u,
  );

  assert.equal(
    invalidDatePage
      .trace.length,
    0,
  );

  console.log(
    'PASS GT-DATE-RANGE-003: invalid requested dates fail before any provider UI inspection or mutation',
  );

  const missingFilterPage =
    new FakePage({
      dateFilterCount: 0,
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateRange({
        page:
          missingFilterPage,
        requested_date_start:
          '2024-08-18',
        requested_date_end:
          '2026-08-17',
      }),
    (error) =>
      error instanceof
        GoogleTrendsDateRangeUiContractError &&
      error.diagnostic_context
        ?.control ===
        GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
          .DATE_FILTER &&
      error.diagnostic_context
        ?.observed_count ===
        0,
  );

  assert.equal(
    missingFilterPage
      .trace.some(
        (entry) =>
          entry.op ===
            'click',
      ),
    false,
  );

  console.log(
    'PASS GT-DATE-RANGE-004: missing date-filter control fails closed before clicking provider UI',
  );

  const ambiguousOptionPage =
    new FakePage({
      optionCount: 2,
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateRange({
        page:
          ambiguousOptionPage,
        requested_date_start:
          '2024-08-18',
        requested_date_end:
          '2026-08-17',
      }),
    (error) =>
      error instanceof
        GoogleTrendsDateRangeUiContractError &&
      error.diagnostic_context
        ?.control ===
        GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
          .CUSTOM_TIME_RANGE_OPTION &&
      error.diagnostic_context
        ?.observed_count ===
        2,
  );

  assert.deepEqual(
    operations(
      ambiguousOptionPage
        .trace,
    ),
    [
      {
        op:
          'click',
        locator:
          'date-filter',
        options: {
          timeout:
            10_000,
        },
      },
    ],
  );

  console.log(
    'PASS GT-DATE-RANGE-005: ambiguous Custom time range option fails closed instead of choosing by DOM position',
  );

  const ambiguousOkPage =
    new FakePage({
      okCount: 2,
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateRange({
        page:
          ambiguousOkPage,
        requested_date_start:
          '2024-08-18',
        requested_date_end:
          '2026-08-17',
      }),
    (error) =>
      error instanceof
        GoogleTrendsDateRangeUiContractError &&
      error.diagnostic_context
        ?.control ===
        GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
          .OK_BUTTON &&
      error.diagnostic_context
        ?.observed_count ===
        2,
  );

  assert.equal(
    ambiguousOkPage
      .trace.some(
        (entry) =>
          entry.op ===
            'click' &&
          entry.locator ===
            'ok-button',
      ),
    false,
  );

  console.log(
    'PASS GT-DATE-RANGE-006: ambiguous OK control is never clicked; the workflow fails visibly',
  );

  const invalidTimeoutPage =
    new FakePage();

  await assert.rejects(
    () =>
      applyGoogleTrendsCustomDateRange({
        page:
          invalidTimeoutPage,
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
    invalidTimeoutPage
      .trace.length,
    0,
  );

  console.log(
    'PASS GT-DATE-RANGE-007: invalid UI timeout fails before provider UI inspection',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
