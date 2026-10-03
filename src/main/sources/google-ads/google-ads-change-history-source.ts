import type {
  CollectingDataSourceModule,
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../../shared/collection';
import type {
  SourceCapabilities,
  SourceReadinessResult,
} from '../../../shared/source';
import type { ApiRequester } from '../google-api/api-helpers';
import {
  GOOGLE_ADS_CHANGE_HISTORY_DATASET_TYPES,
  GOOGLE_ADS_CHANGE_HISTORY_SOURCE_ID,
} from '../../../shared/google-ads-change-history';
import {
  requestGoogleAdsChangeHistoryRaw,
  createGoogleAdsChangeHistoryJobContext,
  buildGoogleAdsChangeHistoryQuery,
} from './google-ads-change-history-request';
import { mapGoogleApiCollectionError } from '../google-api/google-api-error';

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

export class GoogleAdsChangeHistorySource implements CollectingDataSourceModule {
  readonly id = GOOGLE_ADS_CHANGE_HISTORY_SOURCE_ID;
  readonly name = 'Google Ads Change History';
  readonly sourceMode = 'OFFICIAL_API';
  readonly datasetTypes = GOOGLE_ADS_CHANGE_HISTORY_DATASET_TYPES;

  constructor(
    private readonly customerId: string | null,
    private readonly requester: ApiRequester,
  ) {}

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

    try {
      const jobContext =
        createGoogleAdsChangeHistoryJobContext(
          context.source_context,
        );

      const raw =
        await requestGoogleAdsChangeHistoryRaw(
          {
            customer_id: this.customerId,
            query:
              buildGoogleAdsChangeHistoryQuery({
                requested_date_start:
                  jobContext.requested_date_start,
                requested_date_end:
                  jobContext.requested_date_end,
              }),
          },
          this.requester,
        );

      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename: 'google-ads-change-history.json',
        media_type: 'application/json',
        bytes: raw.raw_bytes,
      };
    } catch (error) {
      return mapGoogleApiCollectionError(
        error,
        'GOOGLE_ADS_CHANGE_HISTORY_FAILED',
        'Google Ads Change History request failed.',
      );
    }
  }
}
