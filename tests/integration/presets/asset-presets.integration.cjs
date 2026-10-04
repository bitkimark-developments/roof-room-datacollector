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
  createBlogAgenticContentPreset,
} = require(path.join(
  buildRoot,
  'main',
  'presets',
  'blog-agentic-content-preset.js',
));

assert.equal(
  GOOGLE_ADS_GROWTH_REBUILD_PRESET_NAME,
  'Google Ads Growth Rebuild',
);

assert.deepEqual(
  createGoogleAdsGrowthRebuildPreset(),
  {
    sources: {
      'google-ads-search-reporting': {
        included: true,
        customer_id: null,
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
        requested_date_start: null,
        requested_date_end: null,
        datasets: [
          'GA4_PAID_FUNNEL',
        ],
      },
    },
  },
);

console.log(
  'PASS ASSET-PRESET-001: Google Ads Growth Rebuild pins the complete approved Growth evidence set',
);

assert.equal(
  BLOG_AGENTIC_CONTENT_PRESET_NAME,
  'Blog Agentic Content Research',
);

assert.deepEqual(
  createBlogAgenticContentPreset(),
  {
    sources: {
      'google-trends': {
        included: true,
        dataset_type: 'INTEREST_OVER_TIME',
        date_ranges: [],
        query_groups: [],
      },
      'google-search-console-query-page': {
        included: true,
        date_ranges: [],
      },
      'google-ads-search-terms': {
        included: true,
        task_id: 'google-ads-search-terms',
        date_policy: 'TODAY_MINUS_17_TO_YESTERDAY',
      },
      'google-keyword-planner': {
        included: true,
        groups: [],
      },
      'ikas-products': {
        included: true,
        file_path: null,
      },
      serpapi: {
        included: true,
        queries: [],
      },
      'bitkimark-sitemap': {
        included: true,
        sitemaps: [],
      },
    },
  },
);

console.log(
  'PASS ASSET-PRESET-002: Blog Agentic Content Research selects the full seven-family Blog Writing Pack evidence set',
);
