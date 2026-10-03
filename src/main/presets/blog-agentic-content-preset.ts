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
    'google-keyword-planner': {
      included: true,
      groups: [],
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
