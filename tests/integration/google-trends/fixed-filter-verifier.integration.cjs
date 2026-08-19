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
  GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS,
  verifyGoogleTrendsFixedFilters,
  GoogleTrendsFixedFilterContractError,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-fixed-filter-verifier.js',
  ),
);

class FakeLocator {
  constructor({
    name,
    count = 1,
    text = '',
    trace,
    becomesAvailableOnInnerText =
      false,
  }) {
    this.name = name;
    this.countValue = count;
    this.text = text;
    this.trace = trace;
    this.becomesAvailableOnInnerText =
      becomesAvailableOnInnerText;
    this.children =
      new Map();
    this.roleChildren =
      new Map();
  }

  setLocatorChild(
    selector,
    locator,
  ) {
    this.children.set(
      selector,
      locator,
    );
  }

  setRoleChild(
    role,
    name,
    locator,
  ) {
    this.roleChildren.set(
      `${role}:${name ?? ''}`,
      locator,
    );
  }

  async innerText(options) {
    this.trace.push({
      op: 'innerText',
      locator:
        this.name,
      options,
    });

    if (
      this.becomesAvailableOnInnerText
    ) {
      this.countValue =
        1;
    }

    return this.text;
  }

  async click() {
    throw new Error(
      'fixed-filter verifier must not mutate provider UI',
    );
  }

  async fill() {
    throw new Error(
      'fixed-filter verifier must not mutate provider UI',
    );
  }

  async press() {
    throw new Error(
      'fixed-filter verifier must not mutate provider UI',
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
        `Missing locator child: ${this.name} -> ${selector}`,
      );
    }

    return child;
  }

  getByRole(
    role,
    options,
  ) {
    this.trace.push({
      op:
        'locator.getByRole',
      locator:
        this.name,
      role,
      options,
    });

    const child =
      this.roleChildren.get(
        `${role}:${options?.name ?? ''}`,
      );

    if (!child) {
      throw new Error(
        `Missing role child: ${this.name} -> ${role}:${options?.name ?? ''}`,
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
    categoryPickerCount = 1,
    categoryButtonCount = 1,
    categoryText = 'All categories',
    searchPickerCount = 1,
    selectedValueCount = 1,
    searchPropertyText = 'Web Search',
    categoryPickerBecomesAvailable =
      false,
    categoryButtonBecomesAvailable =
      false,
    searchPickerBecomesAvailable =
      false,
    selectedValueBecomesAvailable =
      false,
  } = {}) {
    this.trace = [];

    this.categoryButton =
      new FakeLocator({
        name:
          'category-button',
        count:
          categoryButtonCount,
        text:
          categoryText,
        trace:
          this.trace,
        becomesAvailableOnInnerText:
          categoryButtonBecomesAvailable,
      });

    this.categoryPicker =
      new FakeLocator({
        name:
          'category-picker',
        count:
          categoryPickerCount,
        trace:
          this.trace,
        becomesAvailableOnInnerText:
          categoryPickerBecomesAvailable,
      });

    this.categoryPicker.setRoleChild(
      'button',
      undefined,
      this.categoryButton,
    );

    this.selectedValue =
      new FakeLocator({
        name:
          'search-property-value',
        count:
          selectedValueCount,
        text:
          searchPropertyText,
        trace:
          this.trace,
        becomesAvailableOnInnerText:
          selectedValueBecomesAvailable,
      });

    this.searchPicker =
      new FakeLocator({
        name:
          'search-property-picker',
        count:
          searchPickerCount,
        trace:
          this.trace,
        becomesAvailableOnInnerText:
          searchPickerBecomesAvailable,
      });

    this.searchPicker.setLocatorChild(
      'md-select-value',
      this.selectedValue,
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

    if (
      selector ===
      'hierarchy-picker[track-name="CategoryPicker"]'
    ) {
      return this.categoryPicker;
    }

    if (
      selector ===
      'md-select[track*="Search property picker"]'
    ) {
      return this.searchPicker;
    }

    throw new Error(
      `Unexpected page selector: ${selector}`,
    );
  }

  getByRole() {
    throw new Error(
      'page.getByRole is not used',
    );
  }

  getByText() {
    throw new Error(
      'page.getByText is not used',
    );
  }

  getByLabel() {
    throw new Error(
      'page.getByLabel is not used',
    );
  }

  async waitForEvent() {
    throw new Error(
      'waitForEvent is not used',
    );
  }

  async close() {}
}

const hasMutation = (
  trace,
) =>
  trace.some(
    (entry) =>
      entry.op === 'click' ||
      entry.op === 'fill' ||
      entry.op === 'press',
  );

const main = async () => {
  const validPage =
    new FakePage({
      categoryText:
        '  All   categories ',
      searchPropertyText:
        '\n Web Search \n',
    });

  await verifyGoogleTrendsFixedFilters({
    page:
      validPage,
    ui_read_timeout_ms:
      4_000,
  });

  assert.equal(
    hasMutation(
      validPage.trace,
    ),
    false,
  );

  console.log(
    'PASS GT-FILTER-001: All categories + Web Search are accepted from the verified classic Explore controls without mutating provider UI',
  );

  assert.equal(
    validPage.trace.some(
      (entry) =>
        entry.op ===
          'page.locator' &&
        entry.selector ===
          'hierarchy-picker[track-name="CategoryPicker"]',
    ),
    true,
  );

  console.log(
    'PASS GT-FILTER-002: category verification is structurally scoped to CategoryPicker and cannot silently reuse geoPicker',
  );

  assert.equal(
    validPage.trace.some(
      (entry) =>
        entry.op ===
          'page.locator' &&
        entry.selector ===
          'md-select[track*="Search property picker"]',
    ),
    true,
  );

  console.log(
    'PASS GT-FILTER-003: Web Search verification is scoped to the provider search-property picker rather than dynamic select IDs',
  );

  const wrongCategory =
    new FakePage({
      categoryText:
        'Shopping',
    });

  await assert.rejects(
    () =>
      verifyGoogleTrendsFixedFilters({
        page:
          wrongCategory,
      }),
    (error) =>
      error instanceof
        GoogleTrendsFixedFilterContractError &&
      /All categories/u.test(
        error.message,
      ),
  );

  assert.equal(
    hasMutation(
      wrongCategory.trace,
    ),
    false,
  );

  console.log(
    'PASS GT-FILTER-004: non-MVP category fails closed and is never silently exported or auto-corrected through an unverified path',
  );

  const wrongSearchProperty =
    new FakePage({
      searchPropertyText:
        'Image Search',
    });

  await assert.rejects(
    () =>
      verifyGoogleTrendsFixedFilters({
        page:
          wrongSearchProperty,
      }),
    (error) =>
      error instanceof
        GoogleTrendsFixedFilterContractError &&
      /Web Search/u.test(
        error.message,
      ),
  );

  assert.equal(
    hasMutation(
      wrongSearchProperty.trace,
    ),
    false,
  );

  console.log(
    'PASS GT-FILTER-005: non-Web Search state fails closed before export',
  );

  const ambiguousCategory =
    new FakePage({
      categoryPickerCount:
        2,
    });

  await assert.rejects(
    () =>
      verifyGoogleTrendsFixedFilters({
        page:
          ambiguousCategory,
      }),
    /(?:at most|exactly) one/u,
  );

  assert.equal(
    hasMutation(
      ambiguousCategory.trace,
    ),
    false,
  );

  console.log(
    'PASS GT-FILTER-006: ambiguous category controls fail closed rather than choosing by DOM position',
  );

  const invalidTimeout =
    new FakePage();

  await assert.rejects(
    () =>
      verifyGoogleTrendsFixedFilters({
        page:
          invalidTimeout,
        ui_read_timeout_ms:
          0,
      }),
    /positive integer/u,
  );

  assert.equal(
    invalidTimeout
      .trace.length,
    0,
  );

  console.log(
    'PASS GT-FILTER-007: invalid read timeout fails before provider UI inspection',
  );

  const diagnosticCases = [
    {
      page: new FakePage({
        categoryPickerCount:
          0,
      }),
      control:
        GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
          .CATEGORY_PICKER,
      observedCount:
        0,
    },
    {
      page: new FakePage({
        categoryButtonCount:
          2,
      }),
      control:
        GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
          .CATEGORY_PICKER_BUTTON,
      observedCount:
        2,
    },
    {
      page: new FakePage({
        categoryText:
          'SENSITIVE_CATEGORY',
      }),
      control:
        GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
          .CATEGORY_LABEL,
      observedCount:
        0,
    },
    {
      page: new FakePage({
        searchPickerCount:
          0,
      }),
      control:
        GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
          .SEARCH_PROPERTY_PICKER,
      observedCount:
        0,
    },
    {
      page: new FakePage({
        selectedValueCount:
          2,
      }),
      control:
        GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
          .SEARCH_PROPERTY_SELECTED_VALUE,
      observedCount:
        2,
    },
    {
      page: new FakePage({
        searchPropertyText:
          'SENSITIVE_SEARCH_PROPERTY',
      }),
      control:
        GOOGLE_TRENDS_FIXED_FILTER_DIAGNOSTIC_CONTROLS
          .SEARCH_PROPERTY_LABEL,
      observedCount:
        0,
    },
  ];

  for (const diagnosticCase of
    diagnosticCases) {
    let observedError =
      null;

    try {
      await verifyGoogleTrendsFixedFilters({
        page:
          diagnosticCase.page,
      });
    } catch (error) {
      observedError =
        error;
    }

    assert.equal(
      observedError instanceof
        GoogleTrendsFixedFilterContractError,
      true,
    );
    assert.deepEqual(
      observedError.diagnostic_context,
      {
        control:
          diagnosticCase.control,
        observed_count:
          diagnosticCase.observedCount,
      },
    );
    assert.equal(
      JSON.stringify(
        observedError
          .diagnostic_context,
      ).includes(
        'SENSITIVE',
      ),
      false,
    );
  }

  console.log(
    'PASS GT-FILTER-008: every fixed-filter failure exposes only an allowlisted control and safe cardinality without provider labels',
  );

  const asynchronousPage =
    new FakePage({
      categoryPickerCount:
        0,
      categoryButtonCount:
        0,
      searchPickerCount:
        0,
      selectedValueCount:
        0,
      categoryPickerBecomesAvailable:
        true,
      categoryButtonBecomesAvailable:
        true,
      searchPickerBecomesAvailable:
        true,
      selectedValueBecomesAvailable:
        true,
    });

  await verifyGoogleTrendsFixedFilters({
    page:
      asynchronousPage,
    ui_read_timeout_ms:
      8_000,
  });

  const readinessReads =
    asynchronousPage.trace.filter(
      (entry) =>
        entry.op ===
          'innerText' &&
        [
          'category-picker',
          'category-button',
          'search-property-picker',
          'search-property-value',
        ].includes(
          entry.locator,
        ),
    );

  assert.equal(
    readinessReads.length >= 4,
    true,
  );
  assert.equal(
    readinessReads.every(
      (entry) =>
        entry.options.timeout ===
        8_000,
    ),
    true,
  );
  assert.equal(
    hasMutation(
      asynchronousPage.trace,
    ),
    false,
  );

  console.log(
    'PASS GT-FILTER-009: every exact fixed-filter control may become available through the existing bounded read timeout without sleep or UI mutation',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
