import type {
  CollectingDataSourceModule,
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../../shared/collection';
import {
  GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES,
  GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET,
  GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID,
  type GoogleAdsSearchReportingDatasetType,
  type GoogleAdsSearchReportingJobContext,
  type GoogleAdsSearchReportingResourceMode,
} from '../../../shared/google-ads-search-reporting';
import type { SourceCapabilities, SourceReadinessResult } from '../../../shared/source';
import type { ApiRequester } from '../google-api/api-helpers';
import { mapGoogleApiCollectionError } from '../google-api/google-api-error';
import {
  requestGoogleAdsSearchReportingRaw,
  requireGoogleAdsReportingJobContext,
} from './search-reporting-request';
import { CAMPAIGN_PERFORMANCE_DESCRIPTOR } from './campaigns-request';
import { AD_GROUP_PERFORMANCE_DESCRIPTOR } from './ad-groups-request';
import { KEYWORD_PERFORMANCE_DESCRIPTOR } from './keywords-request';
import { SEARCH_TERMS_DESCRIPTOR } from './search-terms-request';
import { AD_PERFORMANCE_DESCRIPTOR } from './ads-request';
import { RSA_ASSET_PERFORMANCE_DESCRIPTOR } from './rsa-assets-request';

export interface GoogleAdsSearchReportingDatasetDescriptor {
  readonly dataset_type: GoogleAdsSearchReportingDatasetType;
  readonly resource_mode: GoogleAdsSearchReportingResourceMode;
  buildQuery(context: GoogleAdsSearchReportingJobContext): string;
}

export const GOOGLE_ADS_SEARCH_REPORTING_DATASET_DESCRIPTORS = [
  CAMPAIGN_PERFORMANCE_DESCRIPTOR,
  AD_GROUP_PERFORMANCE_DESCRIPTOR,
  KEYWORD_PERFORMANCE_DESCRIPTOR,
  SEARCH_TERMS_DESCRIPTOR,
  AD_PERFORMANCE_DESCRIPTOR,
  RSA_ASSET_PERFORMANCE_DESCRIPTOR,
] as const;

const capabilities = (): SourceCapabilities => ({
  requires_browser: false,
  requires_oauth: true,
  may_require_manual_login: true,
  supports_custom_date_range: true,
  supports_direct_export: false,
  supports_api: true,
  supports_resume: true,
  max_concurrency: 1,
});

export class GoogleAdsSearchReportingSource implements CollectingDataSourceModule {
  readonly id = GOOGLE_ADS_SEARCH_REPORTING_SOURCE_ID;
  readonly name = 'Google Ads SEARCH Reporting';
  readonly sourceMode = 'OFFICIAL_API';
  readonly datasetTypes = GOOGLE_ADS_SEARCH_REPORTING_DATASET_TYPES;
  private readonly descriptors: ReadonlyMap<
    GoogleAdsSearchReportingDatasetType,
    GoogleAdsSearchReportingDatasetDescriptor
  >;

  constructor(
    private readonly customerId: string | null,
    private readonly requester: ApiRequester,
    descriptors: readonly GoogleAdsSearchReportingDatasetDescriptor[] =
      GOOGLE_ADS_SEARCH_REPORTING_DATASET_DESCRIPTORS,
  ) {
    const descriptorMap = new Map<
      GoogleAdsSearchReportingDatasetType,
      GoogleAdsSearchReportingDatasetDescriptor
    >();
    descriptors.forEach((descriptor) => {
      if (
        descriptor.resource_mode
        !== GOOGLE_ADS_SEARCH_REPORTING_RESOURCE_MODE_BY_DATASET[descriptor.dataset_type]
      ) {
        throw new Error('Google Ads reporting descriptor resource mode is invalid.');
      }
      if (descriptorMap.has(descriptor.dataset_type)) {
        throw new Error(`Duplicate Google Ads reporting descriptor: ${descriptor.dataset_type}`);
      }
      descriptorMap.set(descriptor.dataset_type, descriptor);
    });
    this.descriptors = descriptorMap;
  }

  getCapabilities(): SourceCapabilities {
    return capabilities();
  }

  async checkReadiness(): Promise<SourceReadinessResult> {
    return {
      source_id: this.id,
      readiness_status: this.customerId ? 'READY' : 'NOT_CONFIGURED',
      checked_at: new Date().toISOString(),
      message: this.customerId ? null : 'Google Ads customer is required.',
    };
  }

  async collect(context: SourceCollectionContext): Promise<SourceCollectionResult> {
    if (!this.customerId) {
      return {
        result_type: 'FAILED',
        error_code: 'CONFIGURATION_REQUIRED',
        message: 'Google Ads customer is required.',
      };
    }

    let jobContext: GoogleAdsSearchReportingJobContext;
    let descriptor: GoogleAdsSearchReportingDatasetDescriptor | undefined;
    try {
      if (context.source_id !== this.id) {
        throw new Error('Google Ads reporting Job source identity is invalid.');
      }
      jobContext = requireGoogleAdsReportingJobContext(
        context.source_context,
        this.customerId,
      );
      if (jobContext.dataset_schema_version !== 2 && jobContext.dataset_schema_version !== 3) {
        throw new Error('Google Ads reporting acquisition requires dataset schema version 2 or 3.');
      }
      if (context.job_key !== jobContext.dataset_type) {
        throw new Error('Google Ads reporting Job key does not match the dataset.');
      }
      descriptor = this.descriptors.get(jobContext.dataset_type);
      if (!descriptor || descriptor.resource_mode !== jobContext.resource_mode) {
        throw new Error('Google Ads reporting dataset adapter is not registered.');
      }
    } catch {
      return {
        result_type: 'FAILED',
        error_code: 'SOURCE_CONFIGURATION_INVALID',
        message: 'Google Ads reporting requires a registered SEARCH dataset and valid immutable context.',
      };
    }

    try {
      const query = descriptor.buildQuery(jobContext);
      if (typeof query !== 'string' || !query.trim()) {
        throw new Error('Google Ads reporting query builder returned an empty query.');
      }
      const raw = await requestGoogleAdsSearchReportingRaw(
        { customer_id: jobContext.customer_id, query },
        this.requester,
      );
      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename: `google-ads-${jobContext.dataset_type.toLowerCase().replace(/_/gu, '-')}.json`,
        media_type: 'application/json',
        bytes: raw.raw_bytes,
      };
    } catch (error) {
      return mapGoogleApiCollectionError(
        error,
        'GOOGLE_ADS_API_FAILED',
        'Google Ads request failed.',
      );
    }
  }
}
