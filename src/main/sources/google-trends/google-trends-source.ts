import type {
  CollectingDataSourceModule,
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../../shared/collection';
import type {
  SourceCapabilities,
  SourceReadinessContext,
  SourceReadinessResult,
} from '../../../shared/source';

import {
  GOOGLE_TRENDS_COLLECTION_ERROR_CODES,
  type GoogleTrendsCollector,
} from './google-trends-collector';
import {
  adaptGoogleTrendsCollectionContext,
  GoogleTrendsSourceContextError,
} from './google-trends-source-context';

const GOOGLE_TRENDS_SOURCE_ID =
  'google-trends';

export class GoogleTrendsSource
  implements CollectingDataSourceModule
{
  readonly id =
    GOOGLE_TRENDS_SOURCE_ID;

  readonly name =
    'Google Trends';

  readonly sourceMode =
    'GOOGLE_TRENDS_UI';

  readonly datasetTypes =
    [
      'INTEREST_OVER_TIME',
    ] as const;

  constructor(
    private readonly collector:
      GoogleTrendsCollector | null =
        null,
  ) {}

  getCapabilities(): SourceCapabilities {
    return {
      requires_browser:
        true,
      requires_oauth:
        false,
      may_require_manual_login:
        true,

      // M3 now has an implemented exact custom-date UI path
      // and supported provider CSV export path.
      supports_custom_date_range:
        true,
      supports_direct_export:
        true,

      supports_api:
        false,

      // Resume/retry remains a shared Core responsibility.
      // The source does not maintain an independent internal
      // resume protocol.
      supports_resume:
        false,

      max_concurrency:
        1,
    };
  }

  async checkReadiness(
    context: SourceReadinessContext,
  ): Promise<SourceReadinessResult> {
    const checkedAt =
      new Date().toISOString();

    if (
      !context.query_config_ready
    ) {
      return {
        source_id:
          this.id,
        readiness_status:
          'NOT_CONFIGURED',
        checked_at:
          checkedAt,
        message:
          'A valid Google Trends QueryConfig is required before collection can be eligible.',
      };
    }

    if (
      this.collector ===
      null
    ) {
      return {
        source_id:
          this.id,
        readiness_status:
          'UNAVAILABLE',
        checked_at:
          checkedAt,
        message:
          'Google Trends collection runtime is not yet composed into this SourceRegistry instance.',
      };
    }

    return {
      source_id:
        this.id,
      readiness_status:
        'READY',
      checked_at:
        checkedAt,
      message:
        null,
    };
  }

  async collect(
    context: SourceCollectionContext,
  ): Promise<SourceCollectionResult> {
    if (
      this.collector ===
      null
    ) {
      return {
        result_type:
          'FAILED',
        error_code:
          GOOGLE_TRENDS_COLLECTION_ERROR_CODES
            .COLLECTION_FAILED,
        message:
          'Google Trends collection runtime is not configured.',
      };
    }

    try {
      return this.collector.collect(
        adaptGoogleTrendsCollectionContext(
          context,
        ),
      );
    } catch (error: unknown) {
      if (
        error instanceof
          GoogleTrendsSourceContextError
      ) {
        return {
          result_type: 'FAILED',
          error_code:
            GOOGLE_TRENDS_COLLECTION_ERROR_CODES
              .UNSUPPORTED_CONFIGURATION,
          message: error.message,
        };
      }

      throw error;
    }
  }
}
