import type { CollectingDataSourceModule, SourceCollectionContext, SourceCollectionResult } from '../../../shared/collection';
import type { SourceCapabilities, SourceReadinessResult } from '../../../shared/source';
import { GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID, GOOGLE_KEYWORD_PLANNER_SOURCE_ID } from '../../../shared/google-api';
import { fetchSearchTerms } from './search-terms-adapter'; import { requestKeywordPlannerRaw } from './keyword-planner-adapter'; import type { ApiRequester } from '../google-api/api-helpers';
import { mapGoogleApiCollectionError } from '../google-api/google-api-error';
import { buildSearchTermsQuery } from './search-terms-request';
import {
  keywordPlannerJobContextFromCollection,
} from './keyword-planner-request';
const capabilities = (): SourceCapabilities => ({ requires_browser: false, requires_oauth: true, may_require_manual_login: true, supports_custom_date_range: true, supports_direct_export: false, supports_api: true, supports_resume: true, max_concurrency: 1 });
export class GoogleAdsSearchTermsSource implements CollectingDataSourceModule {
  readonly id = GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID;
  readonly name = 'Google Ads Search Terms';
  readonly sourceMode = 'OFFICIAL_API';
  readonly datasetTypes = ['SEARCH_TERMS'];

  constructor(
    private readonly customerId: string | null,
    private readonly requester: ApiRequester,
  ) {}

  getCapabilities() { return capabilities(); }

  async checkReadiness(): Promise<SourceReadinessResult> {
    return { source_id: this.id, readiness_status: this.customerId ? 'READY' : 'NOT_CONFIGURED', checked_at: new Date().toISOString(), message: this.customerId ? null : 'Google Ads customer is required.' };
  }

  async collect(context: SourceCollectionContext): Promise<SourceCollectionResult> {
    if (!this.customerId) return { result_type: 'FAILED', error_code: 'CONFIGURATION_REQUIRED', message: 'Google Ads customer is required.' };
    let query: string;
    try {
      query = buildSearchTermsQuery(context);
    } catch {
      return { result_type: 'FAILED', error_code: 'SOURCE_CONFIGURATION_INVALID', message: 'Ads Search Terms requires valid absolute dates and the reviewed SEARCH source contract.' };
    }
    try {
      const result = await fetchSearchTerms({ customer_id: this.customerId, query }, this.requester);
      return { result_type: 'ARTIFACT_PRODUCED', preferred_filename: 'google-ads-search-terms.json', media_type: 'application/json', bytes: new TextEncoder().encode(JSON.stringify(result.raw)) };
    } catch (error) {
      return mapGoogleApiCollectionError(error, 'GOOGLE_ADS_API_FAILED', 'Google Ads request failed.');
    }
  }
}
export class GoogleKeywordPlannerSource implements CollectingDataSourceModule {
  readonly id = GOOGLE_KEYWORD_PLANNER_SOURCE_ID;
  readonly name = 'Google Keyword Planner';
  readonly sourceMode = 'OFFICIAL_API';
  readonly datasetTypes = ['KEYWORD_HISTORICAL_METRICS'];

  constructor(
    private readonly customerId: string | null,
    private readonly requester: ApiRequester,
  ) {}

  getCapabilities() { return capabilities(); }

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

    let jobContext;

    try {
      jobContext =
        keywordPlannerJobContextFromCollection(
          context,
        );
    } catch {
      return {
        result_type: 'FAILED',
        error_code: 'SOURCE_CONFIGURATION_INVALID',
        message: 'Keyword Planner requires a valid reviewed official-API keyword group.',
      };
    }

    try {
      const result =
        await requestKeywordPlannerRaw(
          {
            customer_id:
              this.customerId,
            group_id:
              jobContext.group_id,
            keywords:
              jobContext.keywords,
            requested_date_start:
              jobContext.requested_date_start,
            requested_date_end:
              jobContext.requested_date_end,
            country_code:
              jobContext.country_code,
            language_code:
              jobContext.language_code,
            keyword_plan_network:
              jobContext.keyword_plan_network,
          },
          this.requester,
        );

      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename:
          `google-keyword-planner-${jobContext.group_id}.json`,
        media_type: 'application/json',
        bytes:
          new TextEncoder().encode(
            JSON.stringify(result.raw),
          ),
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
