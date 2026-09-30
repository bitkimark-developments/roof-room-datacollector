import type { JsonObject, JobPlan } from '../../shared/run-job';
import type { DesktopTaskPackageDefinition } from '../../shared/desktop-task-package';
import type { AssembledTaskPackage } from '../../shared/task-package';
import {
  GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES,
  type GoogleAdsSearchReportingDatasetType,
} from '../../shared/google-ads-search-reporting';
import { createGoogleAdsReportingJobContext } from '../sources/google-ads/search-reporting-request';
import { ADS_OPTIMIZATION_PACK_V1_RECIPE } from '../task-packages/ads-optimization-pack-recipe';

const normalizeCustomerId = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Google Ads customer_id is missing.');
  const normalized = value.trim().replace(/-/gu, '');
  if (!/^\d+$/u.test(normalized)) {
    throw new Error('Google Ads customer_id must contain only digits or hyphens.');
  }
  return normalized;
};

const isDatasetType = (value: string): value is GoogleAdsSearchReportingDatasetType => (
  (GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES as readonly string[]).includes(value)
);

export const createAdsOptimizationPackDesktopDefinition = (dependencies: {
  publish_package: (taskPackage: AssembledTaskPackage) => Promise<{ package_id: string }>;
}): DesktopTaskPackageDefinition => ({
  recipe: ADS_OPTIMIZATION_PACK_V1_RECIPE,
  connection_source_id: 'google-ads-search-terms',
  normalize_account_identity: (safeMetadata) => ({
    field: 'customer_id',
    value: normalizeCustomerId(safeMetadata.customer_id),
  }),
  build_job_plan: ({ requirement, account_identity, current_window }): JobPlan => {
    if (!isDatasetType(requirement.dataset_type)) {
      throw new Error('ADS_OPTIMIZATION_PACK contains an unsupported dataset type.');
    }
    return {
      source_id: 'google-ads-search-reporting',
      job_key: requirement.dataset_type,
      query_group_id: null,
      source_context: {
        ...createGoogleAdsReportingJobContext({
          dataset_type: requirement.dataset_type,
          customer_id: account_identity.value,
          requested_date_start: current_window.start,
          requested_date_end: current_window.end,
        }),
      } as JsonObject,
    };
  },
  publish_package: dependencies.publish_package,
});
