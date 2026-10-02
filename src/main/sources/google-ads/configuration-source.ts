import type {
  CollectingDataSourceModule,
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../../shared/collection';
import {
  GOOGLE_ADS_CONFIGURATION_DATASET_TYPES,
  GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET,
  GOOGLE_ADS_CONFIGURATION_SOURCE_ID,
  type GoogleAdsConfigurationDatasetType,
  type GoogleAdsConfigurationJobContext,
  type GoogleAdsConfigurationResourceMode,
} from '../../../shared/google-ads-configuration';
import type {
  SourceCapabilities,
  SourceReadinessResult,
} from '../../../shared/source';
import type { ApiRequester } from '../google-api/api-helpers';
import { mapGoogleApiCollectionError } from '../google-api/google-api-error';
import {
  requestGoogleAdsConfigurationRaw,
  requireGoogleAdsConfigurationJobContext,
} from './configuration-request';
import { buildCampaignNegativeKeywordsQuery } from './negatives-request';
import {
  buildAdGroupNegativeKeywordsQuery,
  buildSharedNegativeKeywordsQuery,
  buildCampaignNegativeKeywordListsQuery,
  buildAccountNegativeKeywordListsQuery,
} from './negatives-request';
import {
  buildConversionActionsQuery,
  buildCustomerConversionGoalsQuery,
  buildConversionGoalCampaignConfigsQuery,
  buildCampaignConversionGoalsQuery,
  buildCustomConversionGoalsQuery,
  buildCustomerConversionTrackingSettingsQuery,
} from './conversion-configuration-request';

export interface GoogleAdsConfigurationDatasetDescriptor {
  readonly dataset_type: GoogleAdsConfigurationDatasetType;
  readonly resource_mode: GoogleAdsConfigurationResourceMode;
  buildQuery(context: GoogleAdsConfigurationJobContext): string;
}

export const GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS:
readonly GoogleAdsConfigurationDatasetDescriptor[] = [
  {
    dataset_type: 'CAMPAIGN_NEGATIVE_KEYWORDS',
    resource_mode: 'CAMPAIGN_CRITERION',
    buildQuery: buildCampaignNegativeKeywordsQuery,
  },
  {
    dataset_type: 'AD_GROUP_NEGATIVE_KEYWORDS',
    resource_mode: 'AD_GROUP_CRITERION',
    buildQuery: buildAdGroupNegativeKeywordsQuery,
  },
  {
    dataset_type: 'SHARED_NEGATIVE_KEYWORDS',
    resource_mode: 'SHARED_CRITERION',
    buildQuery: buildSharedNegativeKeywordsQuery,
  },
  {
    dataset_type: 'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
    resource_mode: 'CAMPAIGN_SHARED_SET',
    buildQuery: buildCampaignNegativeKeywordListsQuery,
  },
  {
    dataset_type: 'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
    resource_mode: 'CUSTOMER_NEGATIVE_CRITERION',
    buildQuery: buildAccountNegativeKeywordListsQuery,
  },
  {
    dataset_type: 'CONVERSION_ACTIONS',
    resource_mode: 'CONVERSION_ACTION',
    buildQuery: buildConversionActionsQuery,
  },
  {
    dataset_type: 'CUSTOMER_CONVERSION_GOALS',
    resource_mode: 'CUSTOMER_CONVERSION_GOAL',
    buildQuery: buildCustomerConversionGoalsQuery,
  },
  {
    dataset_type: 'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
    resource_mode: 'CONVERSION_GOAL_CAMPAIGN_CONFIG',
    buildQuery: buildConversionGoalCampaignConfigsQuery,
  },
  {
    dataset_type: 'CAMPAIGN_CONVERSION_GOALS',
    resource_mode: 'CAMPAIGN_CONVERSION_GOAL',
    buildQuery: buildCampaignConversionGoalsQuery,
  },
  {
    dataset_type: 'CUSTOM_CONVERSION_GOALS',
    resource_mode: 'CUSTOM_CONVERSION_GOAL',
    buildQuery: buildCustomConversionGoalsQuery,
  },
  {
    dataset_type: 'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
    resource_mode: 'CUSTOMER',
    buildQuery: buildCustomerConversionTrackingSettingsQuery,
  },
];

const capabilities = (): SourceCapabilities => ({
  requires_browser: false,
  requires_oauth: true,
  may_require_manual_login: true,
  supports_custom_date_range: false,
  supports_direct_export: false,
  supports_api: true,
  supports_resume: true,
  max_concurrency: 1,
});

export class GoogleAdsConfigurationSource
implements CollectingDataSourceModule {
  readonly id = GOOGLE_ADS_CONFIGURATION_SOURCE_ID;
  readonly name = 'Google Ads Configuration';
  readonly sourceMode = 'OFFICIAL_API';
  readonly datasetTypes = GOOGLE_ADS_CONFIGURATION_DATASET_TYPES;

  private readonly descriptors: ReadonlyMap<
    GoogleAdsConfigurationDatasetType,
    GoogleAdsConfigurationDatasetDescriptor
  >;

  constructor(
    private readonly customerId: string | null,
    private readonly requester: ApiRequester,
    descriptors: readonly GoogleAdsConfigurationDatasetDescriptor[] =
      GOOGLE_ADS_CONFIGURATION_DATASET_DESCRIPTORS,
  ) {
    const descriptorMap = new Map<
      GoogleAdsConfigurationDatasetType,
      GoogleAdsConfigurationDatasetDescriptor
    >();

    descriptors.forEach((descriptor) => {
      if (
        descriptor.resource_mode
        !== GOOGLE_ADS_CONFIGURATION_RESOURCE_MODE_BY_DATASET[
          descriptor.dataset_type
        ]
      ) {
        throw new Error(
          'Google Ads configuration descriptor resource mode is invalid.',
        );
      }

      if (descriptorMap.has(descriptor.dataset_type)) {
        throw new Error(
          `Duplicate Google Ads configuration descriptor: ${descriptor.dataset_type}`,
        );
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
      message: this.customerId
        ? null
        : 'Google Ads customer is required.',
    };
  }

  async collect(
    context: SourceCollectionContext,
  ): Promise<SourceCollectionResult> {
    if (!this.customerId) {
      return {
        result_type: 'FAILED',
        error_code: 'CONFIGURATION_REQUIRED',
        message: 'Google Ads customer is required.',
      };
    }

    let jobContext: GoogleAdsConfigurationJobContext;
    let descriptor:
      | GoogleAdsConfigurationDatasetDescriptor
      | undefined;

    try {
      if (context.source_id !== this.id) {
        throw new Error(
          'Google Ads configuration Job source identity is invalid.',
        );
      }

      jobContext = requireGoogleAdsConfigurationJobContext(
        context.source_context,
        this.customerId,
      );

      if (jobContext.dataset_schema_version !== 1) {
        throw new Error(
          'Google Ads configuration acquisition requires dataset schema version 1.',
        );
      }

      if (context.job_key !== jobContext.dataset_type) {
        throw new Error(
          'Google Ads configuration Job key does not match the dataset.',
        );
      }

      descriptor = this.descriptors.get(jobContext.dataset_type);

      if (
        !descriptor
        || descriptor.resource_mode !== jobContext.resource_mode
      ) {
        throw new Error(
          'Google Ads configuration dataset adapter is not registered.',
        );
      }
    } catch {
      return {
        result_type: 'FAILED',
        error_code: 'SOURCE_CONFIGURATION_INVALID',
        message:
          'Google Ads configuration requires a registered dataset and valid immutable context.',
      };
    }

    try {
      const query = descriptor.buildQuery(jobContext);

      if (typeof query !== 'string' || !query.trim()) {
        throw new Error(
          'Google Ads configuration query builder returned an empty query.',
        );
      }

      const raw = await requestGoogleAdsConfigurationRaw(
        {
          customer_id: jobContext.customer_id,
          query,
        },
        this.requester,
      );

      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename:
          `google-ads-${jobContext.dataset_type
            .toLowerCase()
            .replace(/_/gu, '-')}.json`,
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
