import {
  GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES,
  GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET,
  GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
} from '../../shared/google-ads-search-reporting';
import type { TaskPackageRecipe } from '../../shared/task-package';

export const ADS_OPTIMIZATION_PACK_V1_RECIPE = {
  recipe_id: 'ADS_OPTIMIZATION_PACK',
  recipe_version: 1,
  label: 'Kampanya Gelişim',
  account_identity_field: 'customer_id',
  current_window_days: 7,
  required_evidence: GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES.map((dataset_type) => ({
    requirement_id: dataset_type,
    source_id: GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
    dataset_type,
    resource_mode: GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET[dataset_type],
    acquisition_mode: 'OFFICIAL_API',
    campaign_scope: 'SEARCH',
    dataset_schema_version: 1,
    row_date_field: 'performance_date',
  })),
} as const satisfies TaskPackageRecipe;

export const ADS_OPTIMIZATION_PACK_V2_RECIPE = {
  recipe_id: 'ADS_OPTIMIZATION_PACK',
  recipe_version: 2,
  label: 'Kampanya Gelişim',
  account_identity_field: 'customer_id',
  current_window_days: 7,
  required_evidence: GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES.map((dataset_type) => ({
    requirement_id: dataset_type,
    source_id: GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
    dataset_type,
    resource_mode: GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET[dataset_type],
    acquisition_mode: 'OFFICIAL_API',
    campaign_scope: 'SEARCH',
    dataset_schema_version: 2,
    row_date_field: 'performance_date',
  })),
} as const satisfies TaskPackageRecipe;
