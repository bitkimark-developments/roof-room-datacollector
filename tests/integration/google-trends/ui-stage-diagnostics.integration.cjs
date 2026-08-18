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
      async read_public_download() {
        throw new Error(
          'must not reread after injected stage failure',
        );
      },
    };

    await assert.rejects(
      () =>
        exportConfiguredGoogleTrendsPage(
          {
            page: {},
            store: {},
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
        download_store: {},
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
    'PASS GT-DIAG-003: live GT01 output exposes only the controlled UI-stage diagnostic and continues suppressing arbitrary failure messages',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
