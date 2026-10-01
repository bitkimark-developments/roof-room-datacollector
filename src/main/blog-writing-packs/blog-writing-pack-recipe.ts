import type { BlogWritingPackDatasetType } from '../../shared/blog-writing-pack';

export const BLOG_WRITING_PACK_RECIPE = {
  'google-trends': 'INTEREST_OVER_TIME',
  'google-search-console-query-page': 'QUERY_PAGE',
  'google-ads-search-terms': 'SEARCH_TERMS',
  'google-keyword-planner': 'KEYWORD_HISTORICAL_METRICS',
  'google-keyword-planner-csv': 'KEYWORD_HISTORICAL_METRICS',
  'ikas-products': 'PRODUCTS',
  'bitkimark-sitemap': 'SITEMAP_URLS',
  serpapi: 'GOOGLE_SERP',
} as const satisfies Record<string, BlogWritingPackDatasetType>;

export type BlogWritingPackSourceId =
  keyof typeof BLOG_WRITING_PACK_RECIPE;

export const isBlogWritingPackSource = (
  sourceId: string,
): sourceId is BlogWritingPackSourceId =>
  Object.prototype.hasOwnProperty.call(
    BLOG_WRITING_PACK_RECIPE,
    sourceId,
  );
