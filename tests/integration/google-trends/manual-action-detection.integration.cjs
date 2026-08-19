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
  detectGoogleTrendsProviderState,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-provider-state.js',
  ),
);

const {
  probeGoogleTrendsExplore,
} = require(
  path.join(
    buildRoot,
    'main',
    'sources',
    'google-trends',
    'google-trends-provider-probe.js',
  ),
);

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

const baseSnapshot = {
  url:
    'https://trends.google.com/trends/explore',
  response_status:
    200,
  response_headers:
    null,
  page_title:
    'Google Trends',
  page_text:
    'Explore what the world is searching for. Sign in',
};

const main = async () => {
const accounts =
  detectGoogleTrendsProviderState({
    ...baseSnapshot,
    url:
      'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Ftrends.google.com',
    page_title:
      'Sign in - Google Accounts',
  });

assert.equal(
  accounts.provider_state,
  'MANUAL_ACTION_REQUIRED',
);
assert.equal(
  accounts.error_code,
  'MANUAL_ACTION_REQUIRED',
);
assert.deepEqual(
  accounts.signals,
  [
    'AUTH_URL_ACCOUNTS_GOOGLE',
  ],
);

console.log(
  'PASS GT-MANUAL-001: redirect to accounts.google.com maps to MANUAL_ACTION_REQUIRED without attempting authentication',
);

const ordinarySignIn =
  detectGoogleTrendsProviderState(
    baseSnapshot,
  );

assert.equal(
  ordinarySignIn.provider_state,
  'NO_RATE_LIMIT_SIGNAL',
);
assert.deepEqual(
  ordinarySignIn.signals,
  [],
);

console.log(
  'PASS GT-MANUAL-002: ordinary non-blocking "Sign in" text on the Trends page is not falsely treated as an authentication blocker',
);

const challenge =
  detectGoogleTrendsProviderState({
    ...baseSnapshot,
    page_title:
      "Verify it's you",
    page_text:
      '2-Step Verification',
  });

assert.equal(
  challenge.provider_state,
  'MANUAL_ACTION_REQUIRED',
);
assert.deepEqual(
  challenge.signals,
  [
    'PAGE_TITLE_SECURITY_CHALLENGE',
    'PAGE_TEXT_SECURITY_CHALLENGE',
  ],
);

console.log(
  'PASS GT-MANUAL-003: explicit security/2FA challenge signals map to MANUAL_ACTION_REQUIRED',
);

const rateLimited =
  detectGoogleTrendsProviderState({
    ...baseSnapshot,
    url:
      'https://accounts.google.com/v3/signin/identifier',
    response_status:
      429,
  });

assert.equal(
  rateLimited.provider_state,
  'RATE_LIMITED',
);

console.log(
  'PASS GT-MANUAL-004: rate limiting retains priority over manual-action classification so no refresh/retry path can be inferred',
);

const probePage = {
  async goto() {
    return {
      status() {
        return 200;
      },
      async headerValue() {
        return null;
      },
    };
  },

  async title() {
    return 'Sign in - Google Accounts';
  },

  url() {
    return 'https://accounts.google.com/v3/signin/identifier';
  },

  locator() {
    return {
      async innerText() {
        return 'Sign in with your Google Account';
      },
    };
  },
};

const probed =
  await probeGoogleTrendsExplore(
    probePage,
  );

assert.equal(
  probed.provider_state,
  'MANUAL_ACTION_REQUIRED',
);
assert.equal(
  probed.final_url,
  'https://accounts.google.com/v3/signin/identifier',
);

console.log(
  'PASS GT-MANUAL-005: provider probe records the actual final page URL and classifies a Google Accounts redirect before UI automation begins',
);

const trace = [];

const managedPage = {
  async close() {
    trace.push(
      'page.close',
    );
  },
};

const browserManager = {
  async openProfile() {
    trace.push(
      'browser.openProfile',
    );

    return {
      profile_id:
        'google',
      user_data_dir:
        '/app/browser-profiles/google',
      context: {
        async newPage() {
          trace.push(
            'context.newPage',
          );
          return managedPage;
        },
      },
    };
  },
};

let exportCalls =
  0;

const collector =
  new GoogleTrendsCollector({
    browser_manager:
      browserManager,
    probe_provider:
      async () => {
        trace.push(
          'provider.probe',
        );

        return {
          provider_state:
            'MANUAL_ACTION_REQUIRED',
          error_code:
            'MANUAL_ACTION_REQUIRED',
          retry_after:
            null,
          signals: [
            'AUTH_URL_ACCOUNTS_GOOGLE',
          ],
          requested_url:
            'https://trends.google.com/trends/explore',
          final_url:
            'https://accounts.google.com/v3/signin/identifier',
          response_status:
            200,
        };
      },
    export_configured_page:
      async () => {
        exportCalls +=
          1;
        throw new Error(
          'must not export',
        );
      },
  });

const result =
  await collector.collect({
    run_id:
      'rr_manual',
    job_id:
      'rr_manual__google-trends__GT01',
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
  });

assert.equal(
  result.result_type,
  'MANUAL_ACTION_REQUIRED',
);
assert.equal(
  exportCalls,
  0,
);
assert.equal(
  trace.includes(
    'page.close',
  ),
  false,
);

console.log(
  'PASS GT-MANUAL-006: collector returns MANUAL_ACTION_REQUIRED, skips export, and leaves the headed provider page open for direct user intervention',
);

};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
