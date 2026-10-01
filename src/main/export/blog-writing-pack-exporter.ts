import writeXlsxFile, { type SheetData } from 'write-excel-file/node';
import {
  BLOG_WRITING_PACK_WORKBOOK_FILENAME,
  type BlogWritingPackAssembly,
} from '../../shared/blog-writing-pack';
import type { DataPackageDataset } from '../../shared/data-package';

type Row = Record<string, unknown>;

export interface BlogWritingPackWorkbookDefinition {
  filename: typeof BLOG_WRITING_PACK_WORKBOOK_FILENAME;
  sheets: Array<{ name: string; data: SheetData }>;
}

const HEADERS = {
  README: ['section', 'value'],
  RUN_METADATA: ['package_id', 'recipe_id', 'recipe_version', 'run_id', 'workspace_id', 'created_at', 'application_version', 'coverage_status', 'expected_datasets', 'present_datasets', 'no_data_datasets', 'incomplete_datasets', 'missing_datasets', 'coverage_by_dataset'],
  GT_INTEREST: ['source_id', 'job_id', 'job_key', 'validation_status', 'query_group_id', 'period_start', 'temporal_dimension', 'category_label', 'query', 'geography_label', 'relative_interest'],
  GSC_QUERY_PAGE: ['source_id', 'job_id', 'job_key', 'validation_status', 'query', 'page', 'clicks', 'impressions', 'ctr', 'position'],
  ADS_SEARCH_TERMS: ['source_id', 'job_id', 'job_key', 'validation_status', 'search_term', 'keyword', 'match_type', 'campaign', 'ad_group', 'impressions', 'clicks', 'ctr', 'average_cpc', 'cost', 'conversions', 'conversion_value'],
  KWP_METRICS: ['source_id', 'job_id', 'job_key', 'validation_status', 'group_id', 'requested_keyword', 'returned_keyword', 'close_variants', 'matched_requested_keywords', 'currency', 'avg_monthly_searches', 'competition', 'competition_index', 'top_of_page_bid_low', 'top_of_page_bid_high', 'change_3_month', 'change_yoy'],
  KWP_MONTHLY: ['source_id', 'job_id', 'job_key', 'validation_status', 'group_id', 'requested_keyword', 'returned_keyword', 'currency', 'year', 'month', 'searches'],
  PRODUCTS: ['source_id', 'job_id', 'job_key', 'validation_status', 'product_title', 'product_id', 'variant_id', 'url', 'categories_product_type', 'categories', 'product_type', 'availability', 'price', 'sale_price', 'description', 'slug', 'image_url', 'plant_height', 'pot_type', 'stock', 'deleted', 'variant_active', 'continue_selling', 'sales_channel_lower', 'sales_channel_upper'],
  SITEMAP_URLS: ['source_id', 'job_id', 'job_key', 'validation_status', 'loc', 'lastmod', 'document_kind', 'source_url', 'parent_sitemap_url', 'retrieved_at'],
  SERP_RESULTS: ['source_id', 'job_id', 'job_key', 'validation_status', 'query', 'position', 'title', 'url', 'domain', 'snippet', 'paa', 'result_type'],
  FAILURES: ['source_id', 'job_key', 'code'],
  PROVENANCE: ['source_id', 'dataset_type', 'job_id', 'job_key', 'run_id', 'workspace_id', 'attempt_number', 'validation_status', 'raw_artifact_id', 'raw_artifact_filename', 'raw_artifact_media_type', 'raw_artifact_byte_size', 'raw_artifact_sha256', 'acquired_at', 'requested_context'],
} as const;

const asObject = (value: unknown): Row | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Row
    : null
);

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  const object = asObject(value);
  if (object === null) return value;
  return Object.fromEntries(
    Object.keys(object).sort().map((key) => [key, stableValue(object[key])]),
  );
};

const cellValue = (value: unknown): string | number | boolean | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return JSON.stringify(stableValue(value));
};

const sheetData = (
  headers: readonly string[],
  rows: readonly Row[],
): SheetData => [
  headers.map((value) => ({ value, fontWeight: 'bold' as const })),
  ...rows.map((row) => headers.map((header) => ({ value: cellValue(row[header]) }))),
];

const provenanceOf = (dataset: DataPackageDataset): Row =>
  asObject(dataset.provenance) ?? {};

const identityOf = (dataset: DataPackageDataset): Row => ({
  source_id: dataset.source_id,
  job_id: dataset.job_id,
  job_key: dataset.job_key,
  validation_status: provenanceOf(dataset).validation_status,
});

const rowsFor = (
  datasets: readonly DataPackageDataset[],
  predicate: (dataset: DataPackageDataset) => boolean,
): Row[] => datasets
  .filter(predicate)
  .flatMap((dataset) => dataset.rows.map((row) => ({
    ...identityOf(dataset),
    ...row,
  })));

const queryGroupId = (dataset: DataPackageDataset): string => {
  const requestedContext = asObject(provenanceOf(dataset).requested_context);
  const queryGroup = asObject(requestedContext?.query_group);
  const value = queryGroup?.query_group_id;
  if (typeof value !== 'string' || value.length === 0 || value !== dataset.job_key) {
    throw new Error(`Google Trends query_group_id does not match Job ${dataset.job_id}.`);
  }
  return value;
};

export const buildBlogWritingPackWorkbook = (
  assembly: BlogWritingPackAssembly,
): BlogWritingPackWorkbookDefinition => {
  const { manifest, data_package: dataPackage } = assembly;
  const datasets = dataPackage.datasets;

  const gtRows = datasets
    .filter((dataset) => dataset.source_id === 'google-trends' && dataset.dataset_type === 'INTEREST_OVER_TIME')
    .flatMap((dataset) => {
      const query_group_id = queryGroupId(dataset);
      return dataset.rows.map((row) => ({ ...identityOf(dataset), query_group_id, ...row }));
    });

  const kwpDatasets = datasets.filter((dataset) => (
    (dataset.source_id === 'google-keyword-planner' || dataset.source_id === 'google-keyword-planner-csv')
    && dataset.dataset_type === 'KEYWORD_HISTORICAL_METRICS'
  ));
  const kwpRows = rowsFor(kwpDatasets, () => true);
  const kwpMonthlyRows = kwpDatasets.flatMap((dataset) => dataset.rows.flatMap((row) => {
    const monthlyHistory = Array.isArray(row.monthly_history) ? row.monthly_history : [];
    return monthlyHistory.flatMap((value) => {
      const month = asObject(value);
      return month === null ? [] : [{
        ...identityOf(dataset),
        group_id: row.group_id,
        requested_keyword: row.requested_keyword,
        returned_keyword: row.returned_keyword,
        currency: row.currency,
        year: month.year,
        month: month.month,
        searches: month.searches,
      }];
    });
  }));

  const provenanceRows = datasets.map((dataset) => ({
    source_id: dataset.source_id,
    dataset_type: dataset.dataset_type,
    job_id: dataset.job_id,
    job_key: dataset.job_key,
    ...provenanceOf(dataset),
  }));

  const rowsBySheet: Record<keyof typeof HEADERS, Row[]> = {
    README: [
      { section: 'purpose', value: 'Accepted source evidence for downstream writing or analysis.' },
      { section: 'boundary', value: 'RoofRoom collects, preserves, validates, documents, and exports; downstream systems analyze and decide.' },
      { section: 'evidence', value: 'Source-separated evidence is not an analytical conclusion.' },
      { section: 'coverage', value: 'COMPLETE covers every logical dataset; PARTIAL makes unavailable evidence explicit.' },
      { section: 'no_data', value: 'NO_DATA is a verified provider-empty outcome and creates no fabricated rows.' },
    ],
    RUN_METADATA: [{
      package_id: manifest.package_id,
      recipe_id: manifest.recipe_id,
      recipe_version: manifest.recipe_version,
      run_id: manifest.run_id,
      workspace_id: manifest.workspace_id,
      created_at: manifest.created_at,
      application_version: manifest.application_version,
      coverage_status: manifest.coverage_status,
      expected_datasets: manifest.expected_datasets,
      present_datasets: manifest.present_datasets,
      no_data_datasets: manifest.no_data_datasets,
      incomplete_datasets: manifest.incomplete_datasets,
      missing_datasets: manifest.missing_datasets,
      coverage_by_dataset: manifest.coverage_by_dataset,
    }],
    GT_INTEREST: gtRows,
    GSC_QUERY_PAGE: rowsFor(datasets, (dataset) => dataset.source_id === 'google-search-console-query-page' && dataset.dataset_type === 'QUERY_PAGE'),
    ADS_SEARCH_TERMS: rowsFor(datasets, (dataset) => dataset.source_id === 'google-ads-search-terms' && dataset.dataset_type === 'SEARCH_TERMS'),
    KWP_METRICS: kwpRows,
    KWP_MONTHLY: kwpMonthlyRows,
    PRODUCTS: rowsFor(datasets, (dataset) => dataset.source_id === 'ikas-products' && dataset.dataset_type === 'PRODUCTS'),
    SITEMAP_URLS: rowsFor(datasets, (dataset) => dataset.source_id === 'bitkimark-sitemap' && dataset.dataset_type === 'SITEMAP_URLS'),
    SERP_RESULTS: rowsFor(datasets, (dataset) => dataset.source_id === 'serpapi' && dataset.dataset_type === 'GOOGLE_SERP'),
    FAILURES: dataPackage.failures.map((failure) => ({ ...failure })),
    PROVENANCE: provenanceRows,
  };

  return {
    filename: BLOG_WRITING_PACK_WORKBOOK_FILENAME,
    sheets: Object.entries(HEADERS).map(([name, headers]) => ({
      name,
      data: sheetData(headers, rowsBySheet[name as keyof typeof HEADERS]),
    })),
  };
};

export const renderBlogWritingPackWorkbook = async (
  assembly: BlogWritingPackAssembly,
): Promise<Uint8Array> => {
  const workbook = buildBlogWritingPackWorkbook(assembly);
  const buffer = await writeXlsxFile(
    workbook.sheets.map(({ name, data }) => ({ sheet: name, data })),
  ).toBuffer();
  return new Uint8Array(buffer);
};
