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
  applyGoogleTrendsSearchTermQueryGroup,
  GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS,
  GoogleTrendsQueryGroupUiContractError,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-query-group-ui.js',
  ),
);

const {
  applyGoogleTrendsTurkeyGeography,
  GoogleTrendsGeographyUiContractError,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-geography-ui.js',
  ),
);

class FakeLocator {
  constructor({
    name,
    count = 1,
    trace,
    text = '',
    beforeFill,
    onClick,
  }) {
    this.name = name;
    this.countValue = count;
    this.trace = trace;
    this.text = text;
    this.beforeFill =
      beforeFill;
    this.onClick = onClick;
    this.roleChildren =
      new Map();
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

    return typeof this.text ===
      'function'
      ? this.text()
      : this.text;
  }

  async click(options) {
    this.trace.push({
      op: 'click',
      locator:
        this.name,
      options,
    });

    if (this.countValue !== 1) {
      throw new Error(
        `strict mode violation for ${this.name}: ${this.countValue} matches`,
      );
    }

    if (this.onClick) {
      this.onClick();
    }
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

    if (this.beforeFill) {
      this.beforeFill();
    }

    if (this.countValue !== 1) {
      throw new Error(
        `strict mode violation for ${this.name}: ${this.countValue} matches`,
      );
    }
  }

  async press() {
    throw new Error(
      'press is not used',
    );
  }

  locator(selector) {
    throw new Error(
      `nested locator not expected: ${selector}`,
    );
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

    const key =
      `${role}:${options?.name ?? ''}`;

    const child =
      this.roleChildren.get(
        key,
      );

    if (!child) {
      throw new Error(
        `Missing role child ${key} under ${this.name}`,
      );
    }

    return child;
  }

  async count() {
    this.trace.push({
      op: 'count',
      locator:
        this.name,
      observedCount:
        this.countValue,
    });

    return this.countValue;
  }
}

class FakeQueryPage {
  constructor({
    resultCounts = {},
    firstInputCount = 1,
    emptySlotCount = 1,
    emptySlotBecomesAvailableOnFill = false,
    emptyInputCount = 1,
  } = {}) {
    this.trace = [];

    this.firstInput =
      new FakeLocator({
        name:
          'initial-query-input',
        count:
          firstInputCount,
        trace:
          this.trace,
      });

    this.emptyInput =
      new FakeLocator({
        name:
          'empty-slot-query-input',
        count:
          emptySlotCount === 1
            ? emptyInputCount
            : emptySlotCount,
        trace:
          this.trace,
        beforeFill:
          emptySlotBecomesAvailableOnFill
            ? () => {
                this.emptySlot.countValue =
                  1;
                this.emptyInput.countValue =
                  1;
              }
            : undefined,
      });

    this.emptySlot =
      new FakeLocator({
        name:
          'empty-query-slot',
        count:
          emptySlotCount,
        trace:
          this.trace,
      });

    this.emptySlot.setRoleChild(
      'searchbox',
      'Add a search term',
      this.emptyInput,
    );

    this.resultCounts =
      resultCounts;
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
      '.compare-term-container .search-term-wrapper.term-not-selected',
    );

    return this.emptySlot;
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
      role === 'searchbox' &&
      options?.name ===
        'Add a search term'
    ) {
      return this.firstInput;
    }

    if (
      role === 'button' &&
      typeof options?.name ===
        'string' &&
      options.name.endsWith(
        ' Search term',
      )
    ) {
      return new FakeLocator({
        name:
          `suggestion:${options.name}`,
        count:
          this.resultCounts[
            options.name
          ] ?? 1,
        trace:
          this.trace,
      });
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

  getByLabel() {
    throw new Error(
      'getByLabel is not used',
    );
  }

  async waitForEvent() {
    throw new Error(
      'waitForEvent is not used',
    );
  }

  async close() {}
}

class FakeGeographyPage {
  constructor({
    pickerCount = 1,
    openerCount = 1,
    searchCount = 1,
    resultCount = 1,
    initialLabel = 'Worldwide',
    updateLabelOnResult = true,
  } = {}) {
    this.trace = [];
    this.currentLabel =
      initialLabel;

    this.searchbox =
      new FakeLocator({
        name:
          'geo-searchbox',
        count:
          searchCount,
        trace:
          this.trace,
      });

    this.opener =
      new FakeLocator({
        name:
          'geo-opener',
        count:
          openerCount,
        trace:
          this.trace,
        text:
          () =>
            this.currentLabel,
      });

    this.picker =
      new FakeLocator({
        name:
          'geo-picker',
        count:
          pickerCount,
        trace:
          this.trace,
      });

    this.picker.setRoleChild(
      'button',
      undefined,
      this.opener,
    );

    this.picker.setRoleChild(
      'searchbox',
      undefined,
      this.searchbox,
    );

    this.result =
      new FakeLocator({
        name:
          'turkey-result',
        count:
          resultCount,
        trace:
          this.trace,
        onClick:
          () => {
            if (
              updateLabelOnResult
            ) {
              this.currentLabel =
                'Türkiye';
            }
          },
      });
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
      'hierarchy-picker[track-name="geoPicker"]',
    );

    return this.picker;
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

    assert.equal(
      role,
      'button',
    );

    assert.equal(
      options?.name,
      'Türkiye',
    );

    return this.result;
  }

  getByText() {
    throw new Error(
      'getByText is not used',
    );
  }

  getByLabel() {
    throw new Error(
      'getByLabel is not used',
    );
  }

  async waitForEvent() {
    throw new Error(
      'waitForEvent is not used',
    );
  }

  async close() {}
}

const actionTrace = (
  trace,
) =>
  trace.filter(
    (entry) =>
      entry.op ===
        'fill' ||
      entry.op ===
        'click',
  );

const main = async () => {
  const gt01 = [
    'canlı bitki',
    'online bitki',
    'bitki satın al',
    'bitki siparişi',
    'saksılı bitki',
  ];

  const queryPage =
    new FakeQueryPage();

  await applyGoogleTrendsSearchTermQueryGroup({
    page:
      queryPage,
    queries:
      gt01,
    ui_action_timeout_ms:
      4_000,
  });

  const queryActions =
    actionTrace(
      queryPage.trace,
    );

  assert.deepEqual(
    queryActions,
    [
      {
        op: 'fill',
        locator:
          'initial-query-input',
        value:
          'canlı bitki',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op: 'click',
        locator:
          'suggestion:canlı bitki Search term',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op: 'fill',
        locator:
          'empty-slot-query-input',
        value:
          'online bitki',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op: 'click',
        locator:
          'suggestion:online bitki Search term',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op: 'fill',
        locator:
          'empty-slot-query-input',
        value:
          'bitki satın al',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op: 'click',
        locator:
          'suggestion:bitki satın al Search term',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op: 'fill',
        locator:
          'empty-slot-query-input',
        value:
          'bitki siparişi',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op: 'click',
        locator:
          'suggestion:bitki siparişi Search term',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op: 'fill',
        locator:
          'empty-slot-query-input',
        value:
          'saksılı bitki',
        options: {
          timeout:
            4_000,
        },
      },
      {
        op: 'click',
        locator:
          'suggestion:saksılı bitki Search term',
        options: {
          timeout:
            4_000,
        },
      },
    ],
  );

  console.log(
    'PASS GT-QUERY-001: GT01 query order is preserved while each value is selected explicitly as Search term',
  );

  assert.equal(
    queryPage.trace.some(
      (entry) =>
        JSON.stringify(
          entry,
        ).includes(
          '#input-',
        ) ||
        JSON.stringify(
          entry,
        ).includes(
          'ul-',
        ),
    ),
    false,
  );

  console.log(
    'PASS GT-QUERY-002: dynamic Angular Material input/list IDs are not part of the query-selection contract',
  );

  assert.equal(
    queryPage.trace.filter(
      (entry) =>
        entry.op ===
          'page.locator' &&
        entry.selector ===
          '.compare-term-container .search-term-wrapper.term-not-selected',
    ).length,
    4,
  );

  console.log(
    'PASS GT-QUERY-003: added comparisons resolve through the provider term-not-selected state instead of positional .first()/.nth() selection',
  );

  const invalidQueryPage =
    new FakeQueryPage();

  await assert.rejects(
    () =>
      applyGoogleTrendsSearchTermQueryGroup({
        page:
          invalidQueryPage,
        queries: [
          ' canlı bitki',
        ],
      }),
    (error) =>
      error instanceof
        GoogleTrendsQueryGroupUiContractError &&
      /already-normalized/u.test(
        error.message,
      ),
  );

  assert.equal(
    invalidQueryPage
      .trace.length,
    0,
  );

  console.log(
    'PASS GT-QUERY-004: invalid query input fails before provider UI inspection',
  );

  const tooManyQueryPage =
    new FakeQueryPage();

  await assert.rejects(
    () =>
      applyGoogleTrendsSearchTermQueryGroup({
        page:
          tooManyQueryPage,
        queries: [
          'q1',
          'q2',
          'q3',
          'q4',
          'q5',
          'q6',
        ],
      }),
    /between 1 and 5/u,
  );

  assert.equal(
    tooManyQueryPage
      .trace.length,
    0,
  );

  console.log(
    'PASS GT-QUERY-005: groups outside the observed five-comparison UI limit fail before provider interaction',
  );

  const ambiguousInitialPage =
    new FakeQueryPage({
      firstInputCount:
        2,
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsSearchTermQueryGroup({
        page:
          ambiguousInitialPage,
        queries: [
          'canlı bitki',
        ],
      }),
    (error) =>
      error instanceof
        GoogleTrendsQueryGroupUiContractError &&
      error.diagnostic_context
        ?.control ===
        GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
          .INITIAL_QUERY_INPUT &&
      error.diagnostic_context
        ?.observed_count ===
        2 &&
      error.diagnostic_context
        ?.query_index ===
        0,
  );

  assert.equal(
    actionTrace(
      ambiguousInitialPage
        .trace,
    ).length,
    0,
  );

  console.log(
    'PASS GT-QUERY-006: ambiguous initial query input fails closed rather than selecting by DOM position',
  );

  const missingInitialPage =
    new FakeQueryPage({
      firstInputCount:
        0,
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsSearchTermQueryGroup({
        page:
          missingInitialPage,
        queries: [
          'canlı bitki',
        ],
      }),
    (error) =>
      error instanceof
        GoogleTrendsQueryGroupUiContractError &&
      error.diagnostic_context
        ?.control ===
        GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
          .INITIAL_QUERY_INPUT &&
      error.diagnostic_context
        ?.observed_count ===
        0 &&
      error.diagnostic_context
        ?.query_index ===
        0,
  );

  console.log(
    'PASS GT-QUERY-007: missing initial query input reports structured INITIAL_QUERY_INPUT cardinality evidence',
  );

  const providerCreatedSlotPage =
    new FakeQueryPage();

  await applyGoogleTrendsSearchTermQueryGroup({
    page:
      providerCreatedSlotPage,
    queries: [
      'canlı bitki',
      'online bitki',
    ],
  });

  assert.equal(
    providerCreatedSlotPage
      .trace.some(
        (entry) =>
          entry.op ===
            'page.getByRole' &&
          entry.role ===
            'button' &&
          entry.options?.name ===
            'Add a search term for comparison',
      ),
    false,
  );

  console.log(
    'PASS GT-QUERY-008: query comparison uses the provider-created unselected slot without requesting the absent comparison-add control',
  );

  for (
    const observedCount of
      [0, 2]
  ) {
    const emptySlotPage =
      new FakeQueryPage({
        emptySlotCount:
          observedCount,
      });

    await assert.rejects(
      () =>
        applyGoogleTrendsSearchTermQueryGroup({
          page:
            emptySlotPage,
          queries: [
            'canlı bitki',
            'online bitki',
          ],
        }),
      (error) =>
        error instanceof
          GoogleTrendsQueryGroupUiContractError &&
        error.diagnostic_context
          ?.control ===
          GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
            .EMPTY_COMPARISON_SLOT &&
        error.diagnostic_context
          ?.observed_count ===
          observedCount &&
        error.diagnostic_context
          ?.query_index ===
          1,
    );
  }

  console.log(
    'PASS GT-QUERY-009: missing or ambiguous unselected slot reports structured EMPTY_COMPARISON_SLOT cardinality evidence',
  );

  for (
    const observedCount of
      [0, 2]
  ) {
    const comparisonInputPage =
      new FakeQueryPage({
        emptyInputCount:
          observedCount,
      });

    await assert.rejects(
      () =>
        applyGoogleTrendsSearchTermQueryGroup({
          page:
            comparisonInputPage,
          queries: [
            'canlı bitki',
            'online bitki',
          ],
        }),
      (error) =>
        error instanceof
          GoogleTrendsQueryGroupUiContractError &&
        error.diagnostic_context
          ?.control ===
          GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
            .COMPARISON_QUERY_INPUT &&
        error.diagnostic_context
          ?.observed_count ===
          observedCount &&
        error.diagnostic_context
          ?.query_index ===
          1,
    );
  }

  console.log(
    'PASS GT-QUERY-010: missing or ambiguous nested comparison input reports structured COMPARISON_QUERY_INPUT cardinality evidence',
  );

  const dynamicProviderSlotPage =
    new FakeQueryPage({
      emptySlotCount:
        0,
      emptySlotBecomesAvailableOnFill:
        true,
    });

  await applyGoogleTrendsSearchTermQueryGroup({
    page:
      dynamicProviderSlotPage,
    queries: [
      'canlı bitki',
      'online bitki',
    ],
    ui_action_timeout_ms:
      4_000,
  });

  const initialSlotCount =
    dynamicProviderSlotPage
      .trace.find(
        (entry) =>
          entry.op ===
            'count' &&
          entry.locator ===
            'empty-query-slot',
      );

  const comparisonFill =
    dynamicProviderSlotPage
      .trace.find(
        (entry) =>
          entry.op ===
            'fill' &&
          entry.locator ===
            'empty-slot-query-input',
      );

  assert.equal(
    initialSlotCount
      ?.observedCount,
    0,
  );

  assert.deepEqual(
    comparisonFill
      ?.options,
    {
      timeout:
        4_000,
    },
  );

  console.log(
    'PASS GT-QUERY-011: the existing bounded strict nested fill action waits for an asynchronously created comparison slot/input pair',
  );

  for (
    const observedCount of
      [0, 2]
  ) {
    const suggestionPage =
      new FakeQueryPage({
        resultCounts: {
          'canlı bitki Search term':
            observedCount,
        },
      });

    await assert.rejects(
      () =>
        applyGoogleTrendsSearchTermQueryGroup({
          page:
            suggestionPage,
          queries: [
            'canlı bitki',
          ],
        }),
      (error) =>
        error instanceof
          GoogleTrendsQueryGroupUiContractError &&
        error.diagnostic_context
          ?.control ===
          GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
            .SEARCH_TERM_SUGGESTION &&
        error.diagnostic_context
          ?.observed_count ===
          observedCount &&
        error.diagnostic_context
          ?.query_index ===
          0,
    );
  }

  const comparisonSuggestionPage =
    new FakeQueryPage({
      resultCounts: {
        'online bitki Search term':
          0,
      },
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsSearchTermQueryGroup({
        page:
          comparisonSuggestionPage,
        queries: [
          'canlı bitki',
          'online bitki',
        ],
      }),
    (error) =>
      error instanceof
        GoogleTrendsQueryGroupUiContractError &&
      error.diagnostic_context
        ?.control ===
        GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
          .SEARCH_TERM_SUGGESTION &&
      error.diagnostic_context
        ?.observed_count ===
        0 &&
      error.diagnostic_context
        ?.query_index ===
        1,
  );

  console.log(
    'PASS GT-QUERY-012: missing or ambiguous Search Term suggestions report structured control/count/index evidence for initial and comparison queries',
  );

  const defaultTimeoutPage =
    new FakeQueryPage();

  await applyGoogleTrendsSearchTermQueryGroup({
    page:
      defaultTimeoutPage,
    queries: [
      'canlı bitki',
    ],
  });

  const defaultSuggestionClick =
    defaultTimeoutPage.trace.find(
      (entry) =>
        entry.op ===
          'click' &&
        entry.locator ===
          'suggestion:canlı bitki Search term',
    );

  assert.deepEqual(
    defaultSuggestionClick
      ?.options,
    {
      timeout:
        30_000,
    },
  );

  console.log(
    'PASS GT-QUERY-013: query-group actions use the evidence-based bounded 30-second default while explicit timeout overrides remain supported',
  );

  const alreadyTurkeyPage =
    new FakeGeographyPage({
      initialLabel:
        'Türkiye',
    });

  await applyGoogleTrendsTurkeyGeography({
    page:
      alreadyTurkeyPage,
  });

  assert.deepEqual(
    actionTrace(
      alreadyTurkeyPage.trace,
    ),
    [],
  );

  console.log(
    'PASS GT-GEO-001: an already-applied Türkiye geography is accepted idempotently without another provider mutation',
  );

  const geographyPage =
    new FakeGeographyPage();

  await applyGoogleTrendsTurkeyGeography({
    page:
      geographyPage,
    ui_action_timeout_ms:
      5_000,
  });

  assert.deepEqual(
    actionTrace(
      geographyPage.trace,
    ),
    [
      {
        op:
          'click',
        locator:
          'geo-opener',
        options: {
          timeout:
            5_000,
        },
      },
      {
        op:
          'fill',
        locator:
          'geo-searchbox',
        value:
          'Türkiye',
        options: {
          timeout:
            5_000,
        },
      },
      {
        op:
          'click',
        locator:
          'turkey-result',
        options: {
          timeout:
            5_000,
        },
      },
    ],
  );

  console.log(
    'PASS GT-GEO-002: Turkey geography is applied through geoPicker → searchbox → Türkiye result',
  );

  assert.equal(
    geographyPage.trace.some(
      (entry) =>
        entry.op ===
          'page.locator' &&
        entry.selector ===
          'hierarchy-picker[track-name="geoPicker"]',
    ),
    true,
  );

  console.log(
    'PASS GT-GEO-003: geography is structurally scoped to track-name=geoPicker and cannot silently target CategoryPicker',
  );

  assert.equal(
    geographyPage.trace.some(
      (entry) =>
        JSON.stringify(
          entry,
        ).includes(
          '#input-10',
        ) ||
        JSON.stringify(
          entry,
        ).includes(
          'There are 251 matches',
        ),
    ),
    false,
  );

  console.log(
    'PASS GT-GEO-004: dynamic geography input IDs and provider result-count text are excluded from the contract',
  );

  const missingPickerPage =
    new FakeGeographyPage({
      pickerCount:
        0,
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsTurkeyGeography({
        page:
          missingPickerPage,
      }),
    (error) =>
      error instanceof
        GoogleTrendsGeographyUiContractError &&
      /geography picker/u.test(
        error.message,
      ),
  );

  assert.equal(
    actionTrace(
      missingPickerPage.trace,
    ).length,
    0,
  );

  console.log(
    'PASS GT-GEO-005: missing geography picker fails closed before provider mutation',
  );

  const driftPage =
    new FakeGeographyPage({
      updateLabelOnResult:
        false,
    });

  await assert.rejects(
    () =>
      applyGoogleTrendsTurkeyGeography({
        page:
          driftPage,
      }),
    /did not resolve/u,
  );

  console.log(
    'PASS GT-GEO-006: post-selection provider state is verified and visible UI drift fails closed',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
