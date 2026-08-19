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
  GoogleTrendsCollector,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-collector.js',
  ),
);

const {
  GoogleTrendsSource,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-source.js',
  ),
);

const {
  BrowserDownloadCaptureError,
} = require(
  path.join(
    buildRoot,
    'main',
    'browser',
    'browser-download-capture.js',
  ),
);

const {
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

const makeContext = (
  overrides = {},
) => ({
  run_id:
    'rr_20260818T005912345Z_a7f3c9',
  job_id:
    'rr_20260818T005912345Z_a7f3c9__google-trends__GT01',
  attempt_id:
    'attempt-1',
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
  ...overrides,
});

class FakePage {
  constructor(trace) {
    this.trace =
      trace;
    this.responseListeners =
      new Set();
  }

  on(event, listener) {
    assert.equal(
      event,
      'response',
    );

    this.responseListeners
      .add(listener);
  }

  off(event, listener) {
    assert.equal(
      event,
      'response',
    );

    this.responseListeners
      .delete(listener);
  }

  emitResponse({
    status,
    url,
  }) {
    for (
      const listener of
        this.responseListeners
    ) {
      listener({
        status: () =>
          status,
        url: () =>
          url,
        headerValue: async () =>
          null,
      });
    }
  }

  async close() {
    this.trace.push(
      'page.close',
    );
  }
}

class FakeContext {
  constructor(
    page,
    trace,
  ) {
    this.page =
      page;
    this.trace =
      trace;
  }

  async newPage() {
    this.trace.push(
      'context.newPage',
    );

    return this.page;
  }
}

class FakeBrowserManager {
  constructor(
    page,
    trace,
  ) {
    this.page =
      page;
    this.trace =
      trace;
    this.context =
      new FakeContext(
        page,
        trace,
      );
  }

  async openProfile(
    profileId,
    options,
  ) {
    this.trace.push({
      step:
        'browser.openProfile',
      profileId,
      options,
    });

    return {
      profile_id:
        profileId,
      user_data_dir:
        '/app/browser-profiles/google',
      context:
        this.context,
    };
  }
}

const main = async () => {
  const unconfigured =
    new GoogleTrendsSource();

  const capabilities =
    unconfigured
      .getCapabilities();

  assert.equal(
    capabilities
      .supports_custom_date_range,
    true,
  );
  assert.equal(
    capabilities
      .supports_direct_export,
    true,
  );
  assert.equal(
    capabilities
      .supports_resume,
    false,
  );
  assert.equal(
    capabilities
      .max_concurrency,
    1,
  );

  console.log(
    'PASS GT-SOURCE-001: capabilities now describe the implemented exact-date/provider-export behavior while resume remains Core-owned',
  );

  const noRuntimeReady =
    await unconfigured
      .checkReadiness({
        query_config_ready:
          true,
      });

  assert.equal(
    noRuntimeReady
      .readiness_status,
    'UNAVAILABLE',
  );
  assert.match(
    noRuntimeReady
      .message,
    /runtime is not yet composed/u,
  );

  const noConfig =
    await unconfigured
      .checkReadiness({
        query_config_ready:
          false,
      });

  assert.equal(
    noConfig
      .readiness_status,
    'NOT_CONFIGURED',
  );

  console.log(
    'PASS GT-SOURCE-002: readiness stays side-effect-free and distinguishes missing query config from an uncomposed collection runtime',
  );

  const noRuntimeCollection =
    await unconfigured
      .collect(
        makeContext(),
      );

  assert.equal(
    noRuntimeCollection
      .result_type,
    'FAILED',
  );

  console.log(
    'PASS GT-SOURCE-003: a registry instance without runtime dependencies cannot accidentally start browser collection',
  );

  const trace = [];
  const page =
    new FakePage(
      trace,
    );
  const browserManager =
    new FakeBrowserManager(
      page,
      trace,
    );
  const bytes =
    new Uint8Array(
      [
        1,
        2,
        3,
        4,
      ],
    );

  const collector =
    new GoogleTrendsCollector({
      browser_manager:
        browserManager,

      probe_provider:
        async (
          receivedPage,
        ) => {
          assert.equal(
            receivedPage,
            page,
          );
          trace.push(
            'provider.probe',
          );

          return {
            provider_state:
              'NO_RATE_LIMIT_SIGNAL',
            error_code:
              null,
            retry_after:
              null,
            signals:
              [],
            requested_url:
              'https://trends.google.com/trends/explore',
            final_url:
              'https://trends.google.com/trends/explore',
            response_status:
              200,
          };
        },

      export_configured_page:
        async (
          input,
        ) => {
          trace.push({
            step:
              'configured.export',
            input,
          });

          return {
            media_type:
              'text/csv',
            bytes,
            provider_filename:
              'multiTimeline.csv',
            byte_size:
              bytes.byteLength,
            sha256:
              'a'.repeat(
                64,
              ),
          };
        },
    });

  const source =
    new GoogleTrendsSource(
      collector,
    );

  const ready =
    await source
      .checkReadiness({
        query_config_ready:
          true,
      });

  assert.equal(
    ready.readiness_status,
    'READY',
  );

  const produced =
    await source.collect(
      makeContext(),
    );

  assert.equal(
    produced.result_type,
    'ARTIFACT_PRODUCED',
  );
  assert.equal(
    produced.preferred_filename,
    'GT01_TR_24M_interest_over_time.csv',
  );
  assert.equal(
    produced.media_type,
    'text/csv',
  );
  assert.deepEqual(
    Array.from(
      produced.bytes,
    ),
    [
      1,
      2,
      3,
      4,
    ],
  );

  assert.deepEqual(
    trace.map(
      (entry) =>
        typeof entry ===
        'string'
          ? entry
          : entry.step,
    ),
    [
      'browser.openProfile',
      'context.newPage',
      'provider.probe',
      'configured.export',
      'page.close',
    ],
  );

  const openCall =
    trace[0];

  assert.equal(
    openCall.profileId,
    'google',
  );
  assert.deepEqual(
    openCall.options,
    {
      headless:
        false,
      accept_downloads:
        true,
    },
  );

  const exportCall =
    trace[3].input;

  assert.equal(
    exportCall.page,
    page,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      exportCall,
      'store',
    ),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      exportCall,
      'public_preferred_filename',
    ),
    false,
  );
  assert.deepEqual(
    exportCall.queries,
    makeContext()
      .query_group
      .queries,
  );
  assert.equal(
    exportCall
      .requested_date_start,
    '2024-08-18',
  );
  assert.equal(
    exportCall
      .requested_date_end,
    '2026-08-17',
  );

  console.log(
    'PASS GT-COLLECTOR-001: configured source opens the app-owned google profile, probes once, exports GT01, returns canonical raw bytes, and closes only its page',
  );

  const rateTrace = [];
  const ratePage =
    new FakePage(
      rateTrace,
    );

  let rateExportCalls =
    0;

  const rateCollector =
    new GoogleTrendsCollector({
      browser_manager:
        new FakeBrowserManager(
          ratePage,
          rateTrace,
        ),
      probe_provider:
        async () => {
          rateTrace.push(
            'provider.probe',
          );

          return {
            provider_state:
              'RATE_LIMITED',
            error_code:
              'RATE_LIMITED',
            retry_after:
              '180',
            signals: [
              'HTTP_STATUS_429',
            ],
            requested_url:
              'https://trends.google.com/trends/explore',
            final_url:
              'https://trends.google.com/trends/explore',
            response_status:
              429,
          };
        },
      export_configured_page:
        async () => {
          rateExportCalls +=
            1;
          throw new Error(
            'must not export',
          );
        },
    });

  const rateResult =
    await rateCollector
      .collect(
        makeContext(),
      );

  assert.equal(
    rateResult.result_type,
    'FAILED',
  );
  assert.equal(
    rateResult.error_code,
    'RATE_LIMITED',
  );
  assert.equal(
    rateExportCalls,
    0,
  );
  assert.equal(
    rateTrace.filter(
      (entry) =>
        entry ===
        'provider.probe',
    ).length,
    1,
  );
  assert.equal(
    rateTrace.filter(
      (entry) =>
        entry ===
        'page.close',
    ).length,
    1,
  );

  console.log(
    'PASS GT-COLLECTOR-002: RATE_LIMITED stops after the single provider probe with no refresh, retry, or export attempt',
  );

  const invalidTrace = [];
  const invalidPage =
    new FakePage(
      invalidTrace,
    );

  const invalidCollector =
    new GoogleTrendsCollector({
      browser_manager:
        new FakeBrowserManager(
          invalidPage,
          invalidTrace,
        ),
      probe_provider:
        async () => {
          throw new Error(
            'must not probe',
          );
        },
      export_configured_page:
        async () => {
          throw new Error(
            'must not export',
          );
        },
    });

  const invalidContext =
    makeContext({
      requested_configuration: {
        ...makeContext()
          .requested_configuration,
        country_code:
          'US',
      },
    });

  const invalidResult =
    await invalidCollector
      .collect(
        invalidContext,
      );

  assert.equal(
    invalidResult.result_type,
    'FAILED',
  );
  assert.equal(
    invalidResult.error_code,
    'UNSUPPORTED_CONFIGURATION',
  );
  assert.equal(
    invalidTrace.length,
    0,
  );

  console.log(
    'PASS GT-COLLECTOR-003: unsupported MVP context fails before opening browser or touching provider state',
  );

  const probeFailTrace =
    [];
  const probeFailPage =
    new FakePage(
      probeFailTrace,
    );

  const probeFailCollector =
    new GoogleTrendsCollector({
      browser_manager:
        new FakeBrowserManager(
          probeFailPage,
          probeFailTrace,
        ),
      probe_provider:
        async () => {
          probeFailTrace.push(
            'provider.probe',
          );
          throw new Error(
            'navigation failed',
          );
        },
      export_configured_page:
        async () => {
          throw new Error(
            'must not export',
          );
        },
    });

  const probeFailResult =
    await probeFailCollector
      .collect(
        makeContext(),
      );

  assert.equal(
    probeFailResult.result_type,
    'FAILED',
  );
  assert.equal(
    probeFailResult.error_code,
    'GOOGLE_TRENDS_PROVIDER_PROBE_FAILED',
  );
  assert.equal(
    probeFailTrace.filter(
      (entry) =>
        entry ===
        'page.close',
    ).length,
    1,
  );

  console.log(
    'PASS GT-COLLECTOR-004: provider probe exceptions become controlled source failures and the dedicated page is still closed',
  );

  const exportFailTrace =
    [];
  const exportFailPage =
    new FakePage(
      exportFailTrace,
    );

  const exportFailCollector =
    new GoogleTrendsCollector({
      browser_manager:
        new FakeBrowserManager(
          exportFailPage,
          exportFailTrace,
        ),
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals:
            [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async () => {
          throw new Error(
            'unexpected export failure',
          );
        },
    });

  const exportFailResult =
    await exportFailCollector
      .collect(
        makeContext(),
      );

  assert.equal(
    exportFailResult.result_type,
    'FAILED',
  );
  assert.equal(
    exportFailResult.error_code,
    'GOOGLE_TRENDS_COLLECTION_FAILED',
  );
  assert.equal(
    exportFailTrace.filter(
      (entry) =>
        entry ===
        'page.close',
    ).length,
    1,
  );

  console.log(
    'PASS GT-COLLECTOR-005: unexpected export exceptions become controlled FAILED results instead of escaping and leaving a RUNNING job',
  );

  const downloadFailTrace =
    [];
  const downloadFailPage =
    new FakePage(
      downloadFailTrace,
    );

  const downloadFailCollector =
    new GoogleTrendsCollector({
      browser_manager:
        new FakeBrowserManager(
          downloadFailPage,
          downloadFailTrace,
        ),
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals:
            [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async () => {
          throw new BrowserDownloadCaptureError(
            'provider download stream failed',
          );
        },
    });

  const downloadFailResult =
    await downloadFailCollector
      .collect(
        makeContext(),
      );

  assert.equal(
    downloadFailResult.result_type,
    'FAILED',
  );
  assert.equal(
    downloadFailResult.error_code,
    'DOWNLOAD_FAILED',
  );
  assert.equal(
    downloadFailTrace.filter(
      (entry) =>
        entry ===
        'page.close',
    ).length,
    1,
  );

  console.log(
    'PASS GT-COLLECTOR-009: provider download-stream failures map to DOWNLOAD_FAILED and close the dedicated page',
  );

  const interactionRateTrace =
    [];
  const interactionRatePage =
    new FakePage(
      interactionRateTrace,
    );
  let interactionExportCalls =
    0;
  let interactionNextStageBlocked =
    false;

  const interactionRateCollector =
    new GoogleTrendsCollector({
      browser_manager:
        new FakeBrowserManager(
          interactionRatePage,
          interactionRateTrace,
        ),
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals:
            [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async (input) => {
          interactionExportCalls +=
            1;

          input.on_stage(
            'QUERY_GROUP',
          );

          interactionRatePage
            .emitResponse({
              status:
                429,
              url:
                'https://example.com/optional-resource',
            });

          interactionRatePage
            .emitResponse({
              status:
                429,
              url:
                'https://trends.google.com/trends/api/provider-resource',
            });

          try {
            input.on_stage(
              'GEOGRAPHY',
            );
          } catch {
            interactionNextStageBlocked =
              true;
          }

          throw new GoogleTrendsQueryGroupUiContractError(
            'Provider suggestion did not become actionable.',
            {
              control:
                'SEARCH_TERM_SUGGESTION',
              observed_count:
                0,
              query_index:
                0,
            },
          );
        },
    });

  const interactionRateResult =
    await interactionRateCollector
      .collect(
        makeContext(),
      );

  assert.equal(
    interactionRateResult
      .result_type,
    'FAILED',
  );
  assert.equal(
    interactionRateResult
      .error_code,
    'RATE_LIMITED',
  );
  assert.equal(
    interactionExportCalls,
    1,
  );
  assert.equal(
    interactionNextStageBlocked,
    true,
  );
  assert.equal(
    interactionRatePage
      .responseListeners
      .size,
    0,
  );
  assert.equal(
    interactionRateTrace.filter(
      (entry) =>
        entry ===
        'page.close',
    ).length,
    1,
  );

  console.log(
    'PASS GT-COLLECTOR-006: a same-origin HTTP 429 observed during UI interaction takes priority over a later UI timeout and stops without refresh or retry',
  );

  const unrelatedRatePage =
    new FakePage([]);

  const unrelatedRateCollector =
    new GoogleTrendsCollector({
      browser_manager:
        new FakeBrowserManager(
          unrelatedRatePage,
          unrelatedRatePage
            .trace,
        ),
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals:
            [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async (input) => {
          input.on_stage(
            'QUERY_GROUP',
          );

          unrelatedRatePage
            .emitResponse({
              status:
                429,
              url:
                'https://example.com/optional-resource',
            });

          throw new GoogleTrendsQueryGroupUiContractError(
            'Provider suggestion did not become actionable.',
            {
              control:
                'SEARCH_TERM_SUGGESTION',
              observed_count:
                0,
              query_index:
                2,
            },
          );
        },
    });

  const unrelatedRateResult =
    await unrelatedRateCollector
      .collect(
        makeContext(),
      );

  assert.equal(
    unrelatedRateResult
      .error_code,
    'GOOGLE_TRENDS_UI_CONTRACT_ERROR',
  );
  assert.match(
    unrelatedRateResult
      .message,
    /control=SEARCH_TERM_SUGGESTION; observed_count=0; query_index=2/u,
  );

  console.log(
    'PASS GT-COLLECTOR-007: cross-origin HTTP 429 responses do not overwrite the bounded Google Trends UI diagnostic',
  );

  const completedRatePage =
    new FakePage([]);

  const completedRateCollector =
    new GoogleTrendsCollector({
      browser_manager:
        new FakeBrowserManager(
          completedRatePage,
          completedRatePage
            .trace,
        ),
      probe_provider:
        async () => ({
          provider_state:
            'NO_RATE_LIMIT_SIGNAL',
          error_code:
            null,
          retry_after:
            null,
          signals:
            [],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://trends.google.com/trends/explore',
          response_status:
            200,
        }),
      export_configured_page:
        async (input) => {
          input.on_stage(
            'DOWNLOAD',
          );

          completedRatePage
            .emitResponse({
              status:
                429,
              url:
                'https://trends.google.com/trends/api/provider-resource',
            });

          return {
            media_type:
              'text/csv',
            bytes,
            provider_filename:
              'multiTimeline.csv',
            byte_size:
              bytes.byteLength,
            sha256:
              'a'.repeat(
                64,
              ),
          };
        },
    });

  const completedRateResult =
    await completedRateCollector
      .collect(
        makeContext(),
      );

  assert.equal(
    completedRateResult
      .error_code,
    'RATE_LIMITED',
  );
  assert.equal(
    completedRateResult
      .result_type,
    'FAILED',
  );

  console.log(
    'PASS GT-COLLECTOR-008: an export cannot become an artifact when a same-origin HTTP 429 was observed before source completion',
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
