import type {
  DataSourceModule,
  SourceCapabilities,
  SourceReadinessContext,
  SourceReadinessResult,
} from '../../../shared/source';

const GOOGLE_TRENDS_SOURCE_ID = 'google-trends';

export class GoogleTrendsSource implements DataSourceModule {
  readonly id = GOOGLE_TRENDS_SOURCE_ID;
  readonly name = 'Google Trends';
  readonly sourceMode = 'GOOGLE_TRENDS_UI';
  readonly datasetTypes = ['INTEREST_OVER_TIME'] as const;

  getCapabilities(): SourceCapabilities {
    return {
      requires_browser: true,
      requires_oauth: false,
      may_require_manual_login: true,

      // Collection behavior is intentionally not claimed before M3.
      supports_custom_date_range: false,
      supports_direct_export: false,
      supports_api: false,
      supports_resume: false,

      // Google Trends MVP collection remains sequential.
      max_concurrency: 1,
    };
  }

  async checkReadiness(
    context: SourceReadinessContext,
  ): Promise<SourceReadinessResult> {
    const checkedAt = new Date().toISOString();

    if (!context.query_config_ready) {
      return {
        source_id: this.id,
        readiness_status: 'NOT_CONFIGURED',
        checked_at: checkedAt,
        message:
          'A valid Google Trends QueryConfig is required before collection can be eligible.',
      };
    }

    return {
      source_id: this.id,
      readiness_status: 'UNAVAILABLE',
      checked_at: checkedAt,
      message:
        'Google Trends collection is not implemented in M1. Source registration is available for architecture verification only.',
    };
  }
}
