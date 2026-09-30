import writeXlsxFile, { type Cell, type SheetData } from 'write-excel-file/node';
import type {
  AssembledTaskPackage,
  AssembledTaskPackageDataset,
  TaskPackageRole,
} from '../../shared/task-package';
import type { PublishedTaskPackage, TaskPackageStore } from '../task-packages/task-package-store';

export interface AdsOptimizationWorkbookSheet {
  name: string;
  data: SheetData;
}

export interface WorkbookDefinition {
  filename: string;
  sheets: AdsOptimizationWorkbookSheet[];
}

const COMMON_METRICS = [
  'impressions', 'clicks', 'ctr', 'average_cpc_micros', 'cost_micros', 'conversions',
  'conversions_value', 'all_conversions', 'all_conversions_value',
] as const;
const TOP_METRICS = ['top_impression_percentage', 'absolute_top_impression_percentage'] as const;
const SEARCH_SHARE_METRICS = [
  'search_impression_share', 'search_budget_lost_impression_share',
  'search_rank_lost_impression_share', 'search_click_share', ...TOP_METRICS,
] as const;

const DATASET_COLUMNS: Record<string, readonly string[]> = {
  CAMPAIGN_PERFORMANCE: [
    'currency_code', 'time_zone', 'campaign_id', 'campaign_name', 'campaign_status',
    'campaign_primary_status', 'campaign_advertising_channel_type',
    'campaign_bidding_strategy_type', 'campaign_budget_id', 'campaign_budget_amount_micros',
    'campaign_budget_period', 'campaign_budget_explicitly_shared', 'performance_date',
    'snapshot_observed_at', ...COMMON_METRICS, ...SEARCH_SHARE_METRICS,
  ],
  AD_GROUP_PERFORMANCE: [
    'campaign_id', 'campaign_name', 'campaign_advertising_channel_type', 'ad_group_id',
    'ad_group_name', 'ad_group_status', 'ad_group_primary_status', 'ad_group_type',
    'cpc_bid_micros', 'effective_cpc_bid_micros', 'effective_target_cpa_micros',
    'effective_target_roas', 'performance_date', 'snapshot_observed_at',
    ...COMMON_METRICS, ...SEARCH_SHARE_METRICS,
  ],
  KEYWORD_PERFORMANCE: [
    'campaign_id', 'campaign_name', 'campaign_advertising_channel_type', 'ad_group_id',
    'ad_group_name', 'criterion_id', 'keyword_text', 'keyword_match_type', 'criterion_status',
    'criterion_primary_status', 'system_serving_status', 'negative', 'cpc_bid_micros',
    'effective_cpc_bid_micros', 'quality_score', 'creative_quality_score',
    'post_click_quality_score', 'search_predicted_ctr', 'search_exact_match_impression_share',
    'performance_date', 'snapshot_observed_at', ...COMMON_METRICS, ...SEARCH_SHARE_METRICS,
  ],
  SEARCH_TERMS: [
    'search_term', 'campaign_id', 'campaign_name', 'campaign_advertising_channel_type',
    'ad_group_id', 'ad_group_name', 'keyword_resource_name', 'keyword_text',
    'keyword_match_type', 'search_term_match_type', 'search_term_targeting_status',
    'performance_date', 'snapshot_observed_at', ...COMMON_METRICS, ...TOP_METRICS,
  ],
  AD_PERFORMANCE: [
    'campaign_id', 'campaign_name', 'campaign_advertising_channel_type', 'ad_group_id',
    'ad_group_name', 'ad_id', 'ad_type', 'ad_group_ad_status', 'ad_group_ad_primary_status',
    'ad_strength', 'policy_approval_status', 'policy_review_status', 'final_urls', 'headlines',
    'descriptions', 'path1', 'path2', 'performance_date', 'snapshot_observed_at',
    ...COMMON_METRICS, ...TOP_METRICS,
  ],
  RSA_ASSET_PERFORMANCE: [
    'campaign_id', 'campaign_name', 'campaign_advertising_channel_type', 'ad_group_id',
    'ad_group_name', 'ad_id', 'ad_type', 'asset_view_resource_name', 'field_type',
    'performance_label', 'pinned_field', 'enabled', 'source', 'asset_resource_name',
    'asset_id', 'asset_name', 'asset_text', 'performance_date', 'snapshot_observed_at',
    ...COMMON_METRICS,
  ],
};

const SHEETS = [
  { dataset: 'CAMPAIGN_PERFORMANCE', current: '01_CURRENT_CAMPAIGNS', previous: '02_PREVIOUS_CAMPAIGNS' },
  { dataset: 'AD_GROUP_PERFORMANCE', current: '03_CURRENT_AD_GROUPS', previous: '04_PREVIOUS_AD_GROUPS' },
  { dataset: 'KEYWORD_PERFORMANCE', current: '05_CURRENT_KEYWORDS', previous: '06_PREVIOUS_KEYWORDS' },
  { dataset: 'SEARCH_TERMS', current: '07_CURRENT_SEARCH_TERMS', previous: '08_PREVIOUS_SEARCH_TERMS' },
  { dataset: 'AD_PERFORMANCE', current: '09_CURRENT_ADS', previous: '10_PREVIOUS_ADS' },
  { dataset: 'RSA_ASSET_PERFORMANCE', current: '11_CURRENT_RSA_ASSETS', previous: '12_PREVIOUS_RSA_ASSETS' },
] as const;

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const cell = (value: unknown): Cell => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return { value, type: Number };
  if (typeof value === 'boolean') return { value, type: Boolean };
  if (typeof value === 'string') return { value, type: String };
  return { value: stableJson(value), type: String };
};

const manifestRows = (package_: AssembledTaskPackage): SheetData => {
  const { manifest } = package_;
  const rows: SheetData = [[cell('field'), cell('value')]];
  const fields: Array<[string, unknown]> = [
    ['package_id', manifest.package_id], ['recipe_id', manifest.recipe_id],
    ['recipe_version', manifest.recipe_version], ['recipe_label', manifest.recipe_label],
    ['package_kind', manifest.package_kind], ['workspace_id', manifest.workspace_id],
    ['customer_id', manifest.customer_id], ['created_at', manifest.created_at],
    ['application_version', manifest.application_version], ['campaign_scope', manifest.campaign_scope],
    ['current_window_start', manifest.current_window.start], ['current_window_end', manifest.current_window.end],
    ['previous_package_id', manifest.previous_package_id],
    ['previous_window_start', manifest.previous_window?.start],
    ['previous_window_end', manifest.previous_window?.end], ['gap_days', manifest.gap_days],
    ['dataset_schema_version', manifest.dataset_schema_version],
    ['required_datasets', manifest.required_datasets], ['excluded_coverage', manifest.excluded_coverage],
    ['workbook_filename', manifest.workbook_filename],
  ];
  for (const [field, value] of fields) rows.push([cell(field), cell(value)]);
  for (const entry of manifest.evidence) {
    const prefix = `evidence.${entry.role}.${entry.requirement_id}`;
    const evidenceFields: Array<[string, unknown]> = [
      ['disposition', entry.disposition], ['window', entry.window], ['row_count', entry.row_count],
      ['source_package_id', entry.source_package_id], ['run_id', entry.origin.run_id],
      ['job_id', entry.origin.job_id], ['attempt_number', entry.origin.attempt_number],
      ['artifact_id', entry.origin.artifact_id], ['artifact_sha256', entry.origin.artifact_sha256],
      ['acquired_at', entry.origin.acquired_at], ['validation_status', entry.origin.validation_status],
      ['source_id', entry.origin.source_id], ['dataset_type', entry.origin.dataset_type],
      ['resource_mode', entry.origin.resource_mode], ['acquisition_mode', entry.origin.acquisition_mode],
      ['campaign_scope', entry.origin.campaign_scope],
      ['dataset_schema_version', entry.origin.dataset_schema_version],
      ['account_identity', entry.origin.account_identity],
      ['snapshot_observed_at', entry.origin.snapshot_observed_at],
      ['transformation', entry.transformation],
    ];
    for (const [field, value] of evidenceFields) rows.push([cell(`${prefix}.${field}`), cell(value)]);
  }
  return rows;
};

const datasetSheet = (
  dataset: AssembledTaskPackageDataset,
  columns: readonly string[],
): SheetData => [
  columns.map(cell),
  ...dataset.rows.map((row) => columns.map((column) => cell(
    column === 'snapshot_observed_at' && row[column] === undefined
      ? dataset.evidence.origin.snapshot_observed_at
      : row[column],
  ))),
];

const findDataset = (
  package_: AssembledTaskPackage,
  datasetType: string,
  role: TaskPackageRole,
): AssembledTaskPackageDataset => {
  const matches = package_.datasets.filter((dataset) => (
    dataset.dataset_type === datasetType && dataset.role === role
  ));
  if (matches.length !== 1) {
    throw new Error(`Task Package workbook requires exactly one ${role} ${datasetType} dataset.`);
  }
  return matches[0];
};

export const buildAdsOptimizationWorkbook = (
  package_: AssembledTaskPackage,
): WorkbookDefinition => {
  const comparison = package_.manifest.package_kind === 'COMPARISON';
  const sheets: AdsOptimizationWorkbookSheet[] = [
    { name: '00_MANIFEST', data: manifestRows(package_) },
  ];
  for (const definition of SHEETS) {
    const columns = DATASET_COLUMNS[definition.dataset];
    const current = findDataset(package_, definition.dataset, 'CURRENT');
    sheets.push({ name: definition.current, data: datasetSheet(current, columns) });
    if (comparison) {
      const previous = findDataset(package_, definition.dataset, 'PREVIOUS');
      sheets.push({ name: definition.previous, data: datasetSheet(previous, columns) });
    }
  }
  return { filename: package_.manifest.workbook_filename, sheets };
};

export const writeAdsOptimizationPackage = async (
  store: TaskPackageStore,
  package_: AssembledTaskPackage,
): Promise<PublishedTaskPackage> => {
  const workbook = buildAdsOptimizationWorkbook(package_);
  const workbookBytes = new Uint8Array(await writeXlsxFile(
    workbook.sheets.map(({ name, data }) => ({ sheet: name, data })),
  ).toBuffer());
  const published = await store.publishPackage({
    manifest: package_.manifest,
    datasets: package_.datasets.map(({ role, dataset_type, rows }) => ({
      role,
      dataset_type,
      rows,
    })),
    files: [{ filename: workbook.filename, bytes: workbookBytes }],
  });
  const scanned = await store.scanManifests();
  const manifest = scanned.manifests.find(({ package_id }) => package_id === published.package_id);
  if (manifest === undefined) throw new Error('Published Task Package failed manifest verification.');
  for (const evidence of manifest.evidence) {
    if (evidence.table === undefined) throw new Error('Published Task Package has no dataset table reference.');
    await store.readDatasetTable(manifest.package_id, evidence.table);
  }
  return { ...published, manifest };
};
