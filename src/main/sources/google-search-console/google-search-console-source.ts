import type { CollectingDataSourceModule, SourceCollectionContext, SourceCollectionResult } from '../../../shared/collection';
import type { SourceCapabilities, SourceReadinessResult } from '../../../shared/source';
import {
  GSC_QUERY_PAGE_SOURCE_ID,
  GSC_QUERY_SOURCE_ID,
} from '../../../shared/google-api';
import {
  fetchGscQuery,
  fetchGscQueryPage,
  type GscQueryPageRequest,
  type GscQueryRequest,
} from './query-page-adapter';
import type { ApiRequester } from '../google-api/api-helpers';
import { mapGoogleApiCollectionError } from '../google-api/google-api-error';

const requireDate = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error('Requires absolute calendar dates.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Requires valid calendar dates.');
  }
  return value;
};

export class GoogleSearchConsoleSource implements CollectingDataSourceModule {
  readonly id = GSC_QUERY_PAGE_SOURCE_ID;
  readonly name = 'Google Search Console Query × Page';
  readonly sourceMode = 'OFFICIAL_API';
  readonly datasetTypes = ['QUERY_PAGE'];

  constructor(
    private readonly siteUrl: string | null,
    private readonly requester: ApiRequester
  ) {}

  getCapabilities(): SourceCapabilities {
    return {
      requires_browser: false,
      requires_oauth: true,
      may_require_manual_login: true,
      supports_custom_date_range: true,
      supports_direct_export: false,
      supports_api: true,
      supports_resume: true,
      max_concurrency: 1
    };
  }

  async checkReadiness(): Promise<SourceReadinessResult> {
    return {
      source_id: this.id,
      readiness_status: this.siteUrl ? 'READY' : 'NOT_CONFIGURED',
      checked_at: new Date().toISOString(),
      message: this.siteUrl ? null : 'Search Console property is required.'
    };
  }

  async collect(context: SourceCollectionContext): Promise<SourceCollectionResult> {
    if (!this.siteUrl) {
      return { result_type: 'FAILED', error_code: 'CONFIGURATION_REQUIRED', message: 'Search Console property is not configured.' };
    }
    const sourceContext = context.source_context as Record<string, unknown> | undefined;
    if (!sourceContext) {
      return { result_type: 'FAILED', error_code: 'SOURCE_CONFIGURATION_INVALID', message: 'Source context is missing.' };
    }

    let start: string;
    let end: string;
    try {
      start = requireDate(sourceContext.requested_date_start);
      end = requireDate(sourceContext.requested_date_end);
      if (start > end) {
        throw new Error('Requested start date cannot be after end date.');
      }
    } catch (e) {
      return { result_type: 'FAILED', error_code: 'SOURCE_CONFIGURATION_INVALID', message: e instanceof Error ? e.message : 'Invalid dates in job context.' };
    }

    const request: GscQueryPageRequest = {
      site_url: this.siteUrl,
      start_date: start,
      end_date: end,
    };
    try {
      const result = await fetchGscQueryPage(request, this.requester);
      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename: 'gsc-query-page.json',
        media_type: 'application/json',
        bytes: new TextEncoder().encode(JSON.stringify(result.raw_pages))
      };
    } catch (error) {
      return mapGoogleApiCollectionError(error, 'GSC_API_FAILED', 'Search Console request failed.');
    }
  }
}

export class GoogleSearchConsoleQuerySource
  implements CollectingDataSourceModule {
  readonly id = GSC_QUERY_SOURCE_ID;
  readonly name = 'Google Search Console Query';
  readonly sourceMode = 'OFFICIAL_API';
  readonly datasetTypes = ['QUERY'];

  constructor(
    private readonly siteUrl: string | null,
    private readonly requester: ApiRequester,
  ) {}

  getCapabilities(): SourceCapabilities {
    return {
      requires_browser: false,
      requires_oauth: true,
      may_require_manual_login: true,
      supports_custom_date_range: true,
      supports_direct_export: false,
      supports_api: true,
      supports_resume: true,
      max_concurrency: 1,
    };
  }

  async checkReadiness(): Promise<SourceReadinessResult> {
    return {
      source_id: this.id,
      readiness_status:
        this.siteUrl ? 'READY' : 'NOT_CONFIGURED',
      checked_at: new Date().toISOString(),
      message:
        this.siteUrl
          ? null
          : 'Search Console property is required.',
    };
  }

  async collect(
    context: SourceCollectionContext,
  ): Promise<SourceCollectionResult> {
    if (!this.siteUrl) {
      return {
        result_type: 'FAILED',
        error_code: 'CONFIGURATION_REQUIRED',
        message:
          'Search Console property is not configured.',
      };
    }

    const sourceContext =
      context.source_context as
        | Record<string, unknown>
        | undefined;

    if (!sourceContext) {
      return {
        result_type: 'FAILED',
        error_code: 'SOURCE_CONFIGURATION_INVALID',
        message: 'Source context is missing.',
      };
    }

    let start: string;
    let end: string;

    try {
      start = requireDate(
        sourceContext.requested_date_start,
      );
      end = requireDate(
        sourceContext.requested_date_end,
      );

      if (start > end) {
        throw new Error(
          'Requested start date cannot be after end date.',
        );
      }
    } catch (e) {
      return {
        result_type: 'FAILED',
        error_code: 'SOURCE_CONFIGURATION_INVALID',
        message:
          e instanceof Error
            ? e.message
            : 'Invalid dates in job context.',
      };
    }

    const request: GscQueryRequest = {
      site_url: this.siteUrl,
      start_date: start,
      end_date: end,
    };

    try {
      const result = await fetchGscQuery(
        request,
        this.requester,
      );

      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename: 'gsc-query.json',
        media_type: 'application/json',
        bytes: new TextEncoder().encode(
          JSON.stringify(result.raw_pages),
        ),
      };
    } catch (error) {
      return mapGoogleApiCollectionError(
        error,
        'GSC_API_FAILED',
        'Search Console request failed.',
      );
    }
  }
}
