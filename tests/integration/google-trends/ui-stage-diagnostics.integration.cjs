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
  GOOGLE_TRENDS_CONFIGURED_PAGE_STAGES,
  exportConfiguredGoogleTrendsPage,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-configured-page-export.js',
  ),
);

const {
  GoogleTrendsCollector,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-collector.js',
  ),
);

const {
  GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS,
  GoogleTrendsUiContractError,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-interest-over-time-download.js',
  ),
);

const {
  GoogleTrendsQueryGroupUiContractError,
  GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-query-group-ui.js',
  ),
);

const {
  GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS,
  GoogleTrendsGeographyUiContractError,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-geography-ui.js',
  ),
);

const {
  GOOGLE_TRENDS_DATE_DIALOG_DIAGNOSTIC_CONTROLS,
  GoogleTrendsDateDialogContractError,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-custom-date-dialog.js',
  ),
);

const {
  GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS,
  GoogleTrendsDateRangeUiContractError,
} = require(
  path.join(
    buildRoot,
    'src',
    'main',
    'sources',
    'google-trends',
    'google-trends-custom-date-range.js',
  ),
);

const {
  safeResultSummary,
} = require(
  path.join(
    buildRoot,
    'scripts',
    'm3',
    'live-google-trends-gt01-collection.js',
  ),
);

const context = {
  run_id:
    'rr_diag',
  job_id:
    'rr_diag__google-trends__GT01',
  attempt_id:
    'rr_diag__attempt_1',
  attempt_number:
    1,
  source_id:
    'google-trends',
  job_key:
    'GT01',
  requested_configuration: {
    source_mode:
      'GOOGLE_TRENDS_UI',
    country_code:
      'TR',
    language_code:
      null,
    requested_date_start:
      '2024-08-18',
    requested_date_end:
      '2026-08-17',
    category_id:
      null,
    category_name:
      'All Categories',
    search_type:
      'Web Search',
    selection_type:
      'Search Term',
    dataset_type:
      'INTEREST_OVER_TIME',
  },
  query_group: {
    query_group_id:
      'GT01',
    query_group_name:
      'generic_commercial',
    queries: [
      'canlı bitki',
      'online bitki',
      'bitki satın al',
      'bitki siparişi',
      'saksılı bitki',
    ],
  },
};

const main = async () => {
  for (
    const targetStage of
    GOOGLE_TRENDS_CONFIGURED_PAGE_STAGES
  ) {
    const observed =
      [];

    const failAt =
      (stage) =>
        async () => {
          if (
            stage ===
            targetStage
          ) {
            throw new Error(
              `stop at ${stage}`,
            );
          }
        };

    const dependencies = {
      apply_query_group:
        failAt(
          'QUERY_GROUP',
        ),
      apply_turkey_geography:
        failAt(
          'GEOGRAPHY',
        ),
      apply_custom_date_range:
        failAt(
          'DATE_RANGE',
        ),
      verify_fixed_filters:
        failAt(
          'FIXED_FILTERS',
        ),
      download_interest_over_time:
        failAt(
          'DOWNLOAD',
        ),
    };

    await assert.rejects(
      () =>
        exportConfiguredGoogleTrendsPage(
          {
            page: {},
            queries:
              context.query_group
                .queries,
            requested_date_start:
              context.requested_configuration
                .requested_date_start,
            requested_date_end:
              context.requested_configuration
                .requested_date_end,
            on_stage:
              (stage) => {
                observed.push(
                  stage,
                );
              },
          },
          dependencies,
        ),
      new RegExp(
        `stop at ${targetStage}`,
      ),
    );

    assert.equal(
      observed.at(-1),
      targetStage,
    );
  }

  console.log(
    'PASS GT-DIAG-001: configured-page export emits only fixed stage identifiers before each query/geography/date/filter/download step',
  );

  const managedPage = {
    async close() {},
  };

  const browserManager = {
    async openProfile() {
      return {
        context: {
          async newPage() {
            return managedPage;
          },
        },
      };
    },
  };

  for (
    const stage of
    GOOGLE_TRENDS_CONFIGURED_PAGE_STAGES
  ) {
    const collector =
      new GoogleTrendsCollector({
        browser_manager:
          browserManager,
        probe_provider:
          async () => ({
            provider_state:
              'NO_RATE_LIMIT_SIGNAL',
            error_code:
              null,
            retry_after:
              null,
            signals: [],
            requested_url:
              'https://trends.google.com/trends/explore',
            final_url:
              'https://trends.google.com/trends/explore',
            response_status:
              200,
          }),
        export_configured_page:
          async (input) => {
            input.on_stage?.(
              stage,
            );

            throw new GoogleTrendsUiContractError(
              'SENSITIVE_PROVIDER_DETAIL_MUST_NOT_ESCAPE',
            );
          },
      });

    const result =
      await collector.collect(
        context,
      );

    assert.equal(
      result.result_type,
      'FAILED',
    );

    assert.equal(
      result.error_code,
      'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
    );

    assert.match(
      result.message,
      new RegExp(
        `during ${stage} \\(GoogleTrendsUiContractError\\)`,
      ),
    );

    assert.doesNotMatch(
      result.message,
      /SENSITIVE_PROVIDER_DETAIL_MUST_NOT_ESCAPE/u,
    );
  }

  console.log(
    'PASS GT-DIAG-002: collector converts UI failures into bounded stage+error-class diagnostics without leaking underlying provider/error text',
  );

  const nestedDateDialogCollector =
    new GoogleTrendsCollector({
      browser_manager:
        browserManager,
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals: [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async (input) => {
          input.on_stage?.(
            'DATE_RANGE',
          );

          throw new GoogleTrendsDateDialogContractError(
            'SENSITIVE_NESTED_DATE_DIALOG_DETAIL_MUST_NOT_ESCAPE',
          );
        },
    });

  const nestedDateDialogResult =
    await nestedDateDialogCollector.collect(
      context,
    );

  assert.equal(
    nestedDateDialogResult.result_type,
    'FAILED',
  );

  assert.equal(
    nestedDateDialogResult.error_code,
    'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
  );

  assert.equal(
    nestedDateDialogResult.message,
    'Google Trends UI contract failed during DATE_RANGE (GoogleTrendsDateDialogContractError).',
  );

  assert.doesNotMatch(
    nestedDateDialogResult.message,
    /SENSITIVE_NESTED_DATE_DIALOG_DETAIL_MUST_NOT_ESCAPE/u,
  );

  console.log(
    'PASS GT-DIAG-003: nested custom-date dialog failures stay inside the DATE_RANGE UI-contract diagnostic boundary instead of falling through as generic collection failures',
  );

  const queryGroupCollector =
    new GoogleTrendsCollector({
      browser_manager:
        browserManager,
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals: [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async (input) => {
          input.on_stage?.(
            'QUERY_GROUP',
          );

          throw new GoogleTrendsQueryGroupUiContractError(
            'SENSITIVE_QUERY_GROUP_DETAIL_MUST_NOT_ESCAPE',
            {
              control:
                GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
                  .INITIAL_QUERY_INPUT,
              observed_count:
                0,
              query_index:
                0,
            },
          );
        },
    });

  const queryGroupResult =
    await queryGroupCollector.collect(
      context,
    );

  assert.equal(
    queryGroupResult.result_type,
    'FAILED',
  );

  assert.equal(
    queryGroupResult.error_code,
    'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
  );

  assert.equal(
    queryGroupResult.message,
    'Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError; control=INITIAL_QUERY_INPUT; observed_count=0; query_index=0).',
  );

  assert.doesNotMatch(
    queryGroupResult.message,
    /SENSITIVE_QUERY_GROUP_DETAIL_MUST_NOT_ESCAPE/u,
  );

  console.log(
    'PASS GT-DIAG-004: collector exposes only structured allowlisted QUERY_GROUP cardinality evidence and never the underlying provider/error message',
  );

  const wrongStageQueryGroupCollector =
    new GoogleTrendsCollector({
      browser_manager:
        browserManager,
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals: [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async (input) => {
          input.on_stage?.(
            'GEOGRAPHY',
          );

          throw new GoogleTrendsQueryGroupUiContractError(
            'SENSITIVE_WRONG_STAGE_DETAIL_MUST_NOT_ESCAPE',
            {
              control:
                GOOGLE_TRENDS_QUERY_GROUP_DIAGNOSTIC_CONTROLS
                  .INITIAL_QUERY_INPUT,
              observed_count:
                0,
              query_index:
                0,
            },
          );
        },
    });

  const wrongStageQueryGroupResult =
    await wrongStageQueryGroupCollector.collect(
      context,
    );

  assert.equal(
    wrongStageQueryGroupResult.message,
    'Google Trends UI contract failed during GEOGRAPHY (GoogleTrendsQueryGroupUiContractError).',
  );

  assert.doesNotMatch(
    wrongStageQueryGroupResult.message,
    /SENSITIVE_WRONG_STAGE_DETAIL_MUST_NOT_ESCAPE|control=|observed_count=|query_index=/u,
  );

  const forgedControlCollector =
    new GoogleTrendsCollector({
      browser_manager:
        browserManager,
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals: [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async (input) => {
          input.on_stage?.(
            'QUERY_GROUP',
          );

          throw new GoogleTrendsQueryGroupUiContractError(
            'SENSITIVE_FORGED_CONTROL_DETAIL_MUST_NOT_ESCAPE',
            {
              control:
                'FORGED_CONTROL',
              observed_count:
                0,
              query_index:
                0,
            },
          );
        },
    });

  const forgedControlResult =
    await forgedControlCollector.collect(
      context,
    );

  assert.equal(
    forgedControlResult.message,
    'Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError).',
  );

  assert.doesNotMatch(
    forgedControlResult.message,
    /SENSITIVE_FORGED_CONTROL_DETAIL_MUST_NOT_ESCAPE|FORGED_CONTROL|observed_count=|query_index=/u,
  );

  console.log(
    'PASS GT-DIAG-005: structured QUERY_GROUP evidence is emitted only for the actual QUERY_GROUP stage and an allowlisted control value',
  );

  const geographyCollector =
    new GoogleTrendsCollector({
      browser_manager:
        browserManager,
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals: [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async (input) => {
          input.on_stage?.(
            'GEOGRAPHY',
          );

          throw new GoogleTrendsGeographyUiContractError(
            'SENSITIVE_GEOGRAPHY_DETAIL_MUST_NOT_ESCAPE',
            {
              control:
                GOOGLE_TRENDS_GEOGRAPHY_DIAGNOSTIC_CONTROLS
                  .GEOGRAPHY_PICKER,
              observed_count:
                0,
            },
          );
        },
    });

  const geographyResult =
    await geographyCollector.collect(
      context,
    );

  assert.equal(
    geographyResult.message,
    'Google Trends UI contract failed during GEOGRAPHY (GoogleTrendsGeographyUiContractError; control=GEOGRAPHY_PICKER; observed_count=0).',
  );

  assert.doesNotMatch(
    geographyResult.message,
    /SENSITIVE_GEOGRAPHY_DETAIL_MUST_NOT_ESCAPE/u,
  );

  assert.deepEqual(
    safeResultSummary(
      geographyResult,
    ),
    {
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      diagnostic:
        'Google Trends UI contract failed during GEOGRAPHY (GoogleTrendsGeographyUiContractError; control=GEOGRAPHY_PICKER; observed_count=0).',
    },
  );

  console.log(
    'PASS GT-DIAG-007: geography failures expose only allowlisted control cardinality evidence through collector and live output boundaries',
  );

  for (
    const testCase of
      [
        {
          ErrorClass:
            GoogleTrendsDateRangeUiContractError,
          control:
            GOOGLE_TRENDS_DATE_RANGE_DIAGNOSTIC_CONTROLS
              .CUSTOM_TIME_RANGE_OPTION,
          expectedName:
            'GoogleTrendsDateRangeUiContractError',
        },
        {
          ErrorClass:
            GoogleTrendsDateDialogContractError,
          control:
            GOOGLE_TRENDS_DATE_DIALOG_DIAGNOSTIC_CONTROLS
              .ARCHIVE_DIALOG,
          expectedName:
            'GoogleTrendsDateDialogContractError',
        },
      ]
  ) {
    const dateRangeCollector =
      new GoogleTrendsCollector({
        browser_manager:
          browserManager,
        probe_provider:
          async () => ({
            provider_state:
              'NO_RATE_LIMIT_SIGNAL',
            error_code:
              null,
            retry_after:
              null,
            signals: [],
            requested_url:
              'https://trends.google.com/trends/explore',
            final_url:
              'https://trends.google.com/trends/explore',
            response_status:
              200,
          }),
        export_configured_page:
          async (input) => {
            input.on_stage?.(
              'DATE_RANGE',
            );

            throw new testCase.ErrorClass(
              'SENSITIVE_DATE_DETAIL_MUST_NOT_ESCAPE',
              {
                control:
                  testCase.control,
                observed_count:
                  0,
              },
            );
          },
      });

    const dateRangeResult =
      await dateRangeCollector.collect(
        context,
      );

    const expectedDiagnostic =
      `Google Trends UI contract failed during DATE_RANGE (${testCase.expectedName}; control=${testCase.control}; observed_count=0).`;

    assert.equal(
      dateRangeResult.message,
      expectedDiagnostic,
    );

    assert.doesNotMatch(
      dateRangeResult.message,
      /SENSITIVE_DATE_DETAIL_MUST_NOT_ESCAPE/u,
    );

    assert.deepEqual(
      safeResultSummary(
        dateRangeResult,
      ),
      {
        result_type:
          'FAILED',
        error_code:
          'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
        diagnostic:
          expectedDiagnostic,
      },
    );
  }

  console.log(
    'PASS GT-DIAG-008: date-range and nested dialog failures expose only allowlisted control cardinality through collector and live output boundaries',
  );

  const downloadCollector =
    new GoogleTrendsCollector({
      browser_manager:
        browserManager,
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals: [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async (input) => {
          input.on_stage?.(
            'DOWNLOAD',
          );

          throw new GoogleTrendsUiContractError(
            'SENSITIVE_DOWNLOAD_DETAIL_MUST_NOT_ESCAPE',
            {
              control:
                GOOGLE_TRENDS_DOWNLOAD_DIAGNOSTIC_CONTROLS
                  .INTEREST_OVER_TIME_HEADING,
              observed_count:
                0,
            },
          );
        },
    });

  const downloadResult =
    await downloadCollector.collect(
      context,
    );

  const expectedDownloadDiagnostic =
    'Google Trends UI contract failed during DOWNLOAD (GoogleTrendsUiContractError; control=INTEREST_OVER_TIME_HEADING; observed_count=0).';

  assert.equal(
    downloadResult.message,
    expectedDownloadDiagnostic,
  );

  assert.doesNotMatch(
    downloadResult.message,
    /SENSITIVE_DOWNLOAD_DETAIL_MUST_NOT_ESCAPE/u,
  );

  assert.deepEqual(
    safeResultSummary(
      downloadResult,
    ),
    {
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      diagnostic:
        expectedDownloadDiagnostic,
    },
  );

  console.log(
    'PASS GT-DIAG-009: download failures expose only allowlisted heading/button cardinality through collector and live output boundaries',
  );

  const safeQueryGroupSummary =
    safeResultSummary(
      queryGroupResult,
    );

  assert.deepEqual(
    safeQueryGroupSummary,
    {
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      diagnostic:
        'Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError; control=INITIAL_QUERY_INPUT; observed_count=0; query_index=0).',
    },
  );

  const safeSuggestionSummary =
    safeResultSummary({
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      message:
        'Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError; control=SEARCH_TERM_SUGGESTION; observed_count=0; query_index=1).',
    });

  assert.deepEqual(
    safeSuggestionSummary,
    {
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      diagnostic:
        'Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError; control=SEARCH_TERM_SUGGESTION; observed_count=0; query_index=1).',
    },
  );

  const safeAddComparisonSummary =
    safeResultSummary({
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      message:
        'Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError; control=ADD_COMPARISON; observed_count=0; query_index=2).',
    });

  assert.deepEqual(
    safeAddComparisonSummary,
    {
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      diagnostic:
        'Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError; control=ADD_COMPARISON; observed_count=0; query_index=2).',
    },
  );

  const forgedQueryGroupSummary =
    safeResultSummary({
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      message:
        'Google Trends UI contract failed during QUERY_GROUP (GoogleTrendsQueryGroupUiContractError; control=INITIAL_QUERY_INPUT; observed_count=0; query_index=0; secret=LEAK).',
    });

  assert.deepEqual(
    forgedQueryGroupSummary,
    {
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
    },
  );

  const summary =
    safeResultSummary({
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      message:
        'Google Trends UI contract failed during DATE_RANGE (GoogleTrendsUiContractError).',
    });

  assert.deepEqual(
    summary,
    {
      result_type:
        'FAILED',
      error_code:
        'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
      diagnostic:
        'Google Trends UI contract failed during DATE_RANGE (GoogleTrendsUiContractError).',
    },
  );

  const unrelated =
    safeResultSummary({
      result_type:
        'FAILED',
      error_code:
        'BROWSER_SESSION_FAILED',
      message:
        '/Users/example/private/provider/session/detail',
    });

  assert.deepEqual(
    unrelated,
    {
      result_type:
        'FAILED',
      error_code:
        'BROWSER_SESSION_FAILED',
    },
  );

  console.log(
    'PASS GT-DIAG-006: live GT01 output allowlists structured QUERY_GROUP diagnostics while continuing to suppress malformed or unrelated failure detail',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
