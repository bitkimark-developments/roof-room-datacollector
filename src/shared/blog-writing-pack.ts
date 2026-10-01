import type { DataPackage } from './data-package';

export const BLOG_WRITING_PACK_RECIPE_ID = 'BLOG_WRITING_PACK' as const;
export const BLOG_WRITING_PACK_RECIPE_VERSION = 1 as const;
export const BLOG_WRITING_PACK_WORKBOOK_FILENAME = 'BLOG_WRITING_PACK.xlsx' as const;

export const BLOG_WRITING_PACK_DATASETS = [
  'INTEREST_OVER_TIME',
  'QUERY_PAGE',
  'SEARCH_TERMS',
  'KEYWORD_HISTORICAL_METRICS',
  'PRODUCTS',
  'SITEMAP_URLS',
  'GOOGLE_SERP',
] as const;

export type BlogWritingPackDatasetType =
  (typeof BLOG_WRITING_PACK_DATASETS)[number];

export interface BlogWritingPackDatasetCoverage {
  status: 'COVERED' | 'PARTIAL' | 'MISSING';
  total_jobs: number;
  accepted_jobs: number;
  no_data_jobs: number;
  incomplete_jobs: number;
}

export type BlogWritingPackCoverageByDataset = Record<
  BlogWritingPackDatasetType,
  BlogWritingPackDatasetCoverage
>;

export interface BlogWritingPackManifest {
  manifest_version: 1;
  package_id: string;
  recipe_id: typeof BLOG_WRITING_PACK_RECIPE_ID;
  recipe_version: typeof BLOG_WRITING_PACK_RECIPE_VERSION;
  run_id: string;
  workspace_id: string;
  created_at: string;
  application_version: string;
  coverage_status: 'COMPLETE' | 'PARTIAL';
  expected_datasets: BlogWritingPackDatasetType[];
  present_datasets: BlogWritingPackDatasetType[];
  no_data_datasets: BlogWritingPackDatasetType[];
  incomplete_datasets: BlogWritingPackDatasetType[];
  missing_datasets: BlogWritingPackDatasetType[];
  coverage_by_dataset: BlogWritingPackCoverageByDataset;
  workbook_filename: typeof BLOG_WRITING_PACK_WORKBOOK_FILENAME;
  generic_manifest_filename: 'MANIFEST.json';
  datasets_index_filename: 'DATASETS.json';
  failures_filename: 'FAILURES.json';
}

export interface BlogWritingPackAssembly {
  manifest: BlogWritingPackManifest;
  data_package: DataPackage;
}

export type BlogWritingPackAssemblyResult =
  | {
      status: 'NOT_READY';
      run_id: string;
      coverage_by_dataset: BlogWritingPackCoverageByDataset;
      missing_datasets: BlogWritingPackDatasetType[];
      incomplete_datasets: BlogWritingPackDatasetType[];
    }
  | {
      status: 'READY';
      assembly: BlogWritingPackAssembly;
    };
