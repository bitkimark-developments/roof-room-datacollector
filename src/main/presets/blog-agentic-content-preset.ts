import type { ReusableCollectionConfiguration } from '../../shared/collection-configuration';

export const BLOG_AGENTIC_CONTENT_PRESET_WINDOWS =
  [7, 14, 30] as const;

export type BlogAgenticContentPresetWindow =
  (typeof BLOG_AGENTIC_CONTENT_PRESET_WINDOWS)[number];

export const BLOG_AGENTIC_CONTENT_PRESET_NAME =
  'Blog - 30 Day';

export const getBlogAgenticContentPresetName = (
  windowDays: BlogAgenticContentPresetWindow,
): string =>
  `Blog - ${windowDays} Day`;

export const createBlogAgenticContentPreset = (
  windowDays: BlogAgenticContentPresetWindow = 30,
): ReusableCollectionConfiguration => {
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
