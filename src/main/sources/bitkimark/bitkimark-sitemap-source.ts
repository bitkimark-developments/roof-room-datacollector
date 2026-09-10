import type { CollectingDataSourceModule, SourceCollectionResult } from '../../../shared/collection';
import type { SourceCapabilities, SourceReadinessResult } from '../../../shared/source';
import { BITKIMARK_SITEMAP_SOURCE_ID } from '../../../shared/bitkimark-sitemap';

export class BitkimarkSitemapSource implements CollectingDataSourceModule {
  readonly id = BITKIMARK_SITEMAP_SOURCE_ID;
  readonly name = 'Bitkimark Sitemap';
  readonly sourceMode = 'HTTP_XML';
  readonly datasetTypes = ['SITEMAP_URLS'];
  constructor(private readonly sitemapUrl: string, private readonly fetcher: typeof fetch = fetch) {}
  getCapabilities(): SourceCapabilities { return { requires_browser: false, requires_oauth: false, may_require_manual_login: false, supports_custom_date_range: false, supports_direct_export: false, supports_api: false, supports_resume: true, max_concurrency: 1 }; }
  async checkReadiness(): Promise<SourceReadinessResult> { return { source_id: this.id, readiness_status: this.sitemapUrl ? 'READY' : 'NOT_CONFIGURED', checked_at: new Date().toISOString(), message: this.sitemapUrl ? null : 'A sitemap URL is required.' }; }
  async collect(): Promise<SourceCollectionResult> { try { const response = await this.fetcher(this.sitemapUrl); const bytes = new Uint8Array(await response.arrayBuffer()); if (!response.ok) return { result_type: 'FAILED', error_code: `HTTP_${response.status}`, message: `Sitemap request failed with HTTP ${response.status}.` }; return { result_type: 'ARTIFACT_PRODUCED', preferred_filename: 'bitkimark-sitemap.xml', media_type: 'application/xml', bytes }; } catch (error) { return { result_type: 'FAILED', error_code: 'HTTP_XML_FAILED', message: error instanceof Error ? error.message : 'Sitemap request failed.' }; } }
}
