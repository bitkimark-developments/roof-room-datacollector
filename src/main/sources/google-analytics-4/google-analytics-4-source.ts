import type {
  CollectingDataSourceModule,
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../../shared/collection';
import {
  GA4_DATASET_TYPES,
  GA4_PAID_FUNNEL_SESSION_FILTER,
  GOOGLE_ANALYTICS_4_SOURCE_ID,
  type GoogleAnalytics4DatasetType,
  type GoogleAnalytics4RequestContext,
} from '../../../shared/google-analytics-4';
import type {
  SourceCapabilities,
  SourceReadinessResult,
} from '../../../shared/source';
import type {
  ApiRequester,
} from '../google-api/api-helpers';
import {
  mapGoogleApiCollectionError,
} from '../google-api/google-api-error';
import {
  collectGoogleAnalytics4Raw,
} from './google-analytics-4-request';

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

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
);

const isDatasetType = (
  value: unknown,
): value is GoogleAnalytics4DatasetType => (
  typeof value === 'string'
  && (GA4_DATASET_TYPES as readonly string[]).includes(value)
);

const requireDate = (
  value: unknown,
): string => {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
  ) {
    throw new Error(
      'GA4 Job context requires absolute calendar dates.',
    );
  }

  const [year, month, day] =
    value.split('-').map(Number);

  const parsed = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(
      'GA4 Job context requires valid calendar dates.',
    );
  }

  return value;
};

const requireJobContext = (
  context: SourceCollectionContext,
): GoogleAnalytics4RequestContext => {
  if (context.source_id !== GOOGLE_ANALYTICS_4_SOURCE_ID) {
    throw new Error(
      'GA4 Job source identity is invalid.',
    );
  }

  if (!isRecord(context.source_context)) {
    throw new Error(
      'GA4 source context is required.',
    );
  }

  if (!isDatasetType(context.source_context.dataset_type)) {
    throw new Error(
      'GA4 source context dataset type is unsupported.',
    );
  }

  const datasetType =
    context.source_context.dataset_type;

  const allowedKeys = new Set(
    datasetType === 'GA4_PAID_FUNNEL'
      ? [
          'dataset_type',
          'start_date',
          'end_date',
          'session_filter',
        ]
      : [
          'dataset_type',
          'start_date',
          'end_date',
        ],
  );

  if (
    Object.keys(context.source_context).some(
      (key) => !allowedKeys.has(key),
    )
  ) {
    throw new Error(
      'GA4 source context contains unsupported fields.',
    );
  }

  const startDate = requireDate(
    context.source_context.start_date,
  );

  const endDate = requireDate(
    context.source_context.end_date,
  );

  if (startDate > endDate) {
    throw new Error(
      'GA4 Job date range is reversed.',
    );
  }

  if (context.job_key !== datasetType) {
    throw new Error(
      'GA4 Job key does not match the dataset.',
    );
  }

  if (datasetType === 'GA4_PAID_FUNNEL') {
    const sessionFilter =
      context.source_context.session_filter;

    if (
      !isRecord(sessionFilter)
      || Object.keys(sessionFilter).length !== 2
      || sessionFilter.session_source
        !== GA4_PAID_FUNNEL_SESSION_FILTER.session_source
      || sessionFilter.session_medium
        !== GA4_PAID_FUNNEL_SESSION_FILTER.session_medium
    ) {
      throw new Error(
        'GA4 Paid Funnel requires the locked google / cpc session filter.',
      );
    }

    return {
      dataset_type: datasetType,
      start_date: startDate,
      end_date: endDate,
      session_filter:
        GA4_PAID_FUNNEL_SESSION_FILTER,
    };
  }

  return {
    dataset_type: datasetType,
    start_date: startDate,
    end_date: endDate,
  };
};

export class GoogleAnalytics4Source
implements CollectingDataSourceModule {
  readonly id = GOOGLE_ANALYTICS_4_SOURCE_ID;
  readonly name = 'Google Analytics 4';
  readonly sourceMode = 'OFFICIAL_API';
  readonly datasetTypes = GA4_DATASET_TYPES;

  constructor(
    private readonly propertyId: string | null,
    private readonly requester: ApiRequester,
  ) {}

  getCapabilities(): SourceCapabilities {
    return capabilities();
  }

  async checkReadiness(): Promise<SourceReadinessResult> {
    return {
      source_id: this.id,
      readiness_status:
        this.propertyId === null
          ? 'NOT_CONFIGURED'
          : 'READY',
      checked_at: new Date().toISOString(),
      message:
        this.propertyId === null
          ? 'Google Analytics 4 Property ID is required.'
          : null,
    };
  }

  async collect(
    context: SourceCollectionContext,
  ): Promise<SourceCollectionResult> {
    if (this.propertyId === null) {
      return {
        result_type: 'FAILED',
        error_code: 'CONFIGURATION_REQUIRED',
        message:
          'Google Analytics 4 Property ID is required.',
      };
    }

    let jobContext: GoogleAnalytics4RequestContext;

    try {
      jobContext = requireJobContext(context);
    } catch (error) {
      return {
        result_type: 'FAILED',
        error_code: 'SOURCE_CONFIGURATION_INVALID',
        message:
          error instanceof Error
            ? error.message
            : 'GA4 immutable Job context is invalid.',
      };
    }

    try {
      const rawBundle =
        await collectGoogleAnalytics4Raw(
          {
            property_id: this.propertyId,
            dataset_type: jobContext.dataset_type,
            start_date: jobContext.start_date,
            end_date: jobContext.end_date,
          },
          this.requester,
        );

      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename:
          `google-analytics-4-${jobContext.dataset_type
            .toLowerCase()
            .replace(/_/gu, '-')}.json`,
        media_type: 'application/json',
        bytes: new TextEncoder().encode(
          JSON.stringify(rawBundle),
        ),
      };
    } catch (error) {
      return mapGoogleApiCollectionError(
        error,
        'GA4_API_FAILED',
        'Google Analytics 4 request failed.',
      );
    }
  }
}
