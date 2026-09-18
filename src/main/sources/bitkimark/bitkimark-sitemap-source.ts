import { createHash } from 'node:crypto';
import type { CollectingDataSourceModule, SourceCollectionContext, SourceCollectionResult } from '../../../shared/collection';
import { BITKIMARK_SITEMAP_SOURCE_ID } from '../../../shared/bitkimark-sitemap';
import type { SourceCapabilities, SourceReadinessResult } from '../../../shared/source';
import { bitkimarkSitemapContextFromCollection } from './bitkimark-sitemap-request';

export class BitkimarkSitemapSource implements CollectingDataSourceModule {
  readonly id = BITKIMARK_SITEMAP_SOURCE_ID;
  readonly name = 'Bitkimark Sitemap';
  readonly sourceMode = 'HTTP_XML';
  readonly datasetTypes = ['SITEMAP_URLS'];

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  getCapabilities(): SourceCapabilities {
    return {
      requires_browser: false,
      requires_oauth: false,
      may_require_manual_login: false,
      supports_custom_date_range: false,
      supports_direct_export: false,
      supports_api: false,
      supports_resume: true,
      max_concurrency: 1,
    };
  }

  async checkReadiness(): Promise<SourceReadinessResult> {
    return {
      source_id: this.id,
      readiness_status: 'READY',
      checked_at: new Date().toISOString(),
      message: null,
    };
  }

  async collect(context: SourceCollectionContext): Promise<SourceCollectionResult> {
    let jobContext;
    try {
      jobContext = bitkimarkSitemapContextFromCollection(context);
    } catch {
      return {
        result_type: 'FAILED',
        error_code: 'SOURCE_CONFIGURATION_INVALID',
        message: 'Bitkimark sitemap requires a valid reviewed HTTP_XML context.',
      };
    }

    try {
      const response = await this.fetcher(jobContext.requested_url, {
        method: 'GET',
        redirect: 'follow',
        headers: { accept: 'application/xml, text/xml;q=0.9' },
      });
      const responseBytes = new Uint8Array(await response.arrayBuffer());
      if (!response.ok) {
        return {
          result_type: 'FAILED',
          error_code: `HTTP_${response.status}`,
          message: `Sitemap request failed with HTTP ${response.status}.`,
        };
      }
      const requestHash = createHash('sha256')
        .update(jobContext.requested_url)
        .digest('hex')
        .slice(0, 12);
      return {
        result_type: 'ARTIFACT_PRODUCED',
        preferred_filename: `bitkimark-sitemap-${requestHash}.xml`,
        media_type: 'application/xml',
        bytes: responseBytes,
        acquisition_metadata: {
          requested_url: jobContext.requested_url,
          final_url: response.url || jobContext.requested_url,
          response_status: response.status,
          content_type: response.headers.get('content-type'),
        },
      };
    } catch (error) {
      return {
        result_type: 'FAILED',
        error_code: 'HTTP_XML_FAILED',
        message: error instanceof Error ? error.message : 'Sitemap request failed.',
      };
    }
  }
}
