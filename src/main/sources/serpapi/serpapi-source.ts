import type {
  CollectingDataSourceModule,
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../../shared/collection';
import type {
  SourceCapabilities,
  SourceReadinessResult,
} from '../../../shared/source';
import {
  SERPAPI_DATASET_TYPE,
  SERPAPI_SOURCE_ID,
  type SerpApiRequestContext,
} from '../../../shared/serpapi';
import { SerpApiClient, SerpApiError } from './serpapi-client';

const isRequestContext = (
  value: unknown,
): value is SerpApiRequestContext => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const context = value as Partial<SerpApiRequestContext>;
  return typeof context.query === 'string' && context.query.trim().length > 0 &&
    context.country_code === 'TR' && context.language_code === 'tr' &&
    context.device === 'desktop' && context.engine === 'google' &&
    context.organic_limit === 10 && typeof context.snapshot_date === 'string';
};

export class SerpApiSource implements CollectingDataSourceModule {
  readonly id = SERPAPI_SOURCE_ID;
  readonly name = 'SerpApi Google SERP';
  readonly sourceMode = 'THIRD_PARTY_API';
  readonly datasetTypes = [SERPAPI_DATASET_TYPE] as const;

  constructor(private readonly client: SerpApiClient | null) {}

  getCapabilities(): SourceCapabilities {
    return {
      requires_browser: false,
      requires_oauth: false,
      may_require_manual_login: false,
      supports_custom_date_range: false,
      supports_direct_export: false,
      supports_api: true,
      supports_resume: true,
      max_concurrency: 1,
    };
  }

  async checkReadiness(): Promise<SourceReadinessResult> {
    const checkedAt = new Date().toISOString();
    if (!this.client) {
      return {
        source_id: this.id,
        readiness_status: 'NOT_CONFIGURED',
        checked_at: checkedAt,
        message: 'A SerpApi Workspace connection is required.',
      };
    }
    if (!(await this.client.hasCredential())) {
      return {
        source_id: this.id,
        readiness_status: 'AUTHENTICATION_REQUIRED',
        checked_at: checkedAt,
        message: 'A SerpApi API key is required.',
      };
    }
    return {
      source_id: this.id,
      readiness_status: 'READY',
      checked_at: checkedAt,
      message: null,
    };
  }

  async collect(
    context: SourceCollectionContext,
  ): Promise<SourceCollectionResult> {
    if (!this.client) {
      return {
        result_type: 'FAILED',
        error_code: 'CONFIGURATION_REQUIRED',
        message: 'A SerpApi Workspace connection is required.',
      };
    }
    if (!isRequestContext(context.source_context)) {
      return {
        result_type: 'FAILED',
        error_code: 'CONFIGURATION_REQUIRED',
        message: 'SerpApi source_context does not match the locked request contract.',
      };
    }
    try {
      const result = await this.client.search(context.source_context);
      const bytes = result.raw_bytes ?? new TextEncoder().encode(
        JSON.stringify(result.raw),
      );
      const safeJobKey = context.job_key.replace(/[^A-Za-z0-9._-]/gu, '_');
      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename: `serpapi-${safeJobKey || 'query'}.json`,
        media_type: 'application/json',
        bytes,
      };
    } catch (error) {
      if (error instanceof SerpApiError) {
        return {
          result_type: 'FAILED',
          error_code: error.code,
          message: error.message,
        };
      }
      return {
        result_type: 'FAILED',
        error_code: 'PROVIDER_ERROR',
        message: error instanceof Error ? error.message : 'SerpApi request failed.',
      };
    }
  }
}
