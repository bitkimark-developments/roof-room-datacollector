import type { ReusableCollectionConfiguration } from '../../shared/collection-configuration';

export const BLOG_AGENTIC_CONTENT_PRESET_NAME =
  'Blog Agentic Content Research';

export const createBlogAgenticContentPreset =
(): ReusableCollectionConfiguration => ({
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
});
