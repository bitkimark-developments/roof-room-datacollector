const assert = require('node:assert/strict');
const path = require('node:path');

const [buildRoot] = process.argv.slice(2);

if (!buildRoot) {
  throw new Error('Expected compiled build root.');
}

const {
  GOOGLE_ADS_GROWTH_REBUILD_PRESET_NAME,
  createGoogleAdsGrowthRebuildPreset,
} = require(path.join(
  buildRoot,
  'main',
  'presets',
  'google-ads-growth-rebuild-preset.js',
));

const {
  BLOG_AGENTIC_CONTENT_PRESET_NAME,
  BLOG_AGENTIC_CONTENT_PRESET_WINDOWS,
  getBlogAgenticContentPresetName,
  createBlogAgenticContentPreset,
} = require(path.join(
  buildRoot,
  'main',
  'presets',
  'blog-agentic-content-preset.js',
));

assert.equal(
  GOOGLE_ADS_GROWTH_REBUILD_PRESET_NAME,
  'Google Ads Growth',
);

assert.deepEqual(
  createGoogleAdsGrowthRebuildPreset(),
  {
    sources: {
      'google-ads-search-reporting': {
        included: true,
        customer_id: null,
        date_policy: 'TODAY_MINUS_30_TO_YESTERDAY',
        requested_date_start: null,
        requested_date_end: null,
        datasets: [
          'CAMPAIGN_PERFORMANCE',
          'AD_GROUP_PERFORMANCE',
          'KEYWORD_PERFORMANCE',
          'SEARCH_TERMS',
          'AD_PERFORMANCE',
          'RSA_ASSET_PERFORMANCE',
        ],
      },
      'google-ads-change-history': {
        included: true,
        customer_id: null,
        date_policy: 'TODAY_MINUS_30_TO_YESTERDAY',
        requested_date_start: null,
        requested_date_end: null,
        dataset_type: 'CHANGE_HISTORY',
      },
      'google-ads-configuration': {
        included: true,
        customer_id: null,
        datasets: [
          'CAMPAIGN_NEGATIVE_KEYWORDS',
          'AD_GROUP_NEGATIVE_KEYWORDS',
          'SHARED_NEGATIVE_KEYWORDS',
          'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
          'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
          'CONVERSION_ACTIONS',
          'CUSTOMER_CONVERSION_GOALS',
          'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
          'CAMPAIGN_CONVERSION_GOALS',
          'CUSTOM_CONVERSION_GOALS',
          'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
          'CAMPAIGN_SETTINGS',
          'CAMPAIGN_BUDGETS',
          'CAMPAIGN_TARGETING_CRITERIA',
        ],
      },
      'google-analytics-4': {
        included: true,
        date_policy: 'TODAY_MINUS_30_TO_YESTERDAY',
        requested_date_start: null,
        requested_date_end: null,
        datasets: [
          'GA4_PAID_FUNNEL',
        ],
      },
      'google-ads-search-terms': {
        included: true,
        task_id: 'google-ads-search-terms-30-days',
        date_policy: 'TODAY_MINUS_30_TO_YESTERDAY',
      },
      'google-search-console-query': {
        included: true,
        task_id: 'gsc-query-current-previous-28-days',
        date_ranges: [],
      },
      'google-search-console-query-page': {
        included: true,
        tasks: [
          {
            task_id: 'gsc-query-page-current-28-days',
            date_policy: 'TODAY_MINUS_28_TO_YESTERDAY',
          },
          {
            task_id: 'gsc-current-90-days',
            date_policy: 'TODAY_MINUS_90_TO_YESTERDAY',
          },
          {
            task_id: 'gsc-long-16-months',
            date_policy: 'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
          },
        ],
        date_ranges: [],
      },
      'google-trends': {
        included: true,
        task_id: 'google-trends-interest-over-time',
        date_policy: 'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
        dataset_type: 'INTEREST_OVER_TIME',
        date_ranges: [],
        query_groups: [],
      },
      'google-keyword-planner': {
        included: true,
        task_id: 'keyword-planner-historical-metrics',
        groups: [],
      },
    },
  },
);

console.log(
  'PASS ASSET-PRESET-001: Google Ads Growth pins the complete approved Growth evidence set',
);

const growthScope =
  createGoogleAdsGrowthRebuildPreset().sources;

assert.deepEqual(
  Object.keys(growthScope).sort(),
  [
    'google-ads-change-history',
    'google-ads-configuration',
    'google-ads-search-reporting',
    'google-ads-search-terms',
    'google-analytics-4',
    'google-keyword-planner',
    'google-search-console-query',
    'google-search-console-query-page',
    'google-trends',
  ].sort(),
  'Growth preset must declare the complete approved A-scope source set.',
);

assert.deepEqual(
  growthScope['google-ads-search-terms'],
  {
    included: true,
    task_id: 'google-ads-search-terms-30-days',
    date_policy: 'TODAY_MINUS_30_TO_YESTERDAY',
  },
);

assert.deepEqual(
  growthScope['google-search-console-query'],
  {
    included: true,
    task_id: 'gsc-query-current-previous-28-days',
    date_ranges: [],
  },
);

assert.deepEqual(
  growthScope['google-search-console-query-page'],
  {
    included: true,
    tasks: [
      {
        task_id: 'gsc-query-page-current-28-days',
        date_policy: 'TODAY_MINUS_28_TO_YESTERDAY',
      },
      {
        task_id: 'gsc-current-90-days',
        date_policy: 'TODAY_MINUS_90_TO_YESTERDAY',
      },
      {
        task_id: 'gsc-long-16-months',
        date_policy: 'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
      },
    ],
    date_ranges: [],
  },
);

assert.deepEqual(
  growthScope['google-trends'],
  {
    included: true,
    task_id: 'google-trends-interest-over-time',
    date_policy: 'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
    dataset_type: 'INTEREST_OVER_TIME',
    date_ranges: [],
    query_groups: [],
  },
);

assert.deepEqual(
  growthScope['google-keyword-planner'],
  {
    included: true,
    task_id: 'keyword-planner-historical-metrics',
    groups: [],
  },
);


assert.equal(
  BLOG_AGENTIC_CONTENT_PRESET_NAME,
  'Blog - 30 Day',
);

assert.deepEqual(
  BLOG_AGENTIC_CONTENT_PRESET_WINDOWS,
  [7, 14, 30],
);

const expectedBlogPreset = (
  windowDays,
) => {
  const datePolicy =
    `TODAY_MINUS_${windowDays}_TO_YESTERDAY`;

  return {
    sources: {
      'google-trends': {
        included: true,
        task_id:
          'google-trends-interest-over-time',
        date_policy:
          'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
        dataset_type:
          'INTEREST_OVER_TIME',
        date_ranges: [],
        query_groups: [],
      },
      'google-search-console-query-page': {
        included: true,
        task_id:
          `gsc-query-page-current-${windowDays}-days`,
        date_policy:
          datePolicy,
        date_ranges: [],
      },
      'google-ads-search-terms': {
        included: true,
        task_id:
          `google-ads-search-terms-${windowDays}-days`,
        date_policy:
          datePolicy,
      },
      'google-keyword-planner': {
        included: true,
        task_id:
          'keyword-planner-historical-metrics',
        groups: [],
      },
      'ikas-products': {
        included: true,
        task_id:
          'ikas-products-import',
        file_path: null,
      },
      serpapi: {
        included: true,
        task_id:
          'serpapi-serp-snapshot',
        queries: [],
      },
      'bitkimark-sitemap': {
        included: true,
        task_id:
          'bitkimark-sitemap',
        sitemaps: [],
      },
    },
  };
};

for (
  const windowDays
  of [7, 14, 30]
) {
  assert.equal(
    getBlogAgenticContentPresetName(
      windowDays,
    ),
    `Blog - ${windowDays} Day`,
  );

  assert.deepEqual(
    createBlogAgenticContentPreset(
      windowDays,
    ),
    expectedBlogPreset(
      windowDays,
    ),
  );
}

assert.deepEqual(
  createBlogAgenticContentPreset(),
  expectedBlogPreset(30),
  'Default Blog preset factory must remain the 30-day variant.',
);

console.log(
  'PASS ASSET-PRESET-002: Blog 7/14/30 presets select the full seven-family evidence set with exact reusable window policies',
);
