import type { CollectingDataSourceModule, SourceCollectionResult } from '../../../shared/collection';
import type { SourceCapabilities, SourceReadinessResult } from '../../../shared/source';
import { GSC_QUERY_PAGE_SOURCE_ID } from '../../../shared/google-api';
import { fetchGscQueryPage, type GscQueryPageRequest } from './query-page-adapter';
import type { ApiRequester } from '../google-api/api-helpers';
export class GoogleSearchConsoleSource implements CollectingDataSourceModule {
  readonly id = GSC_QUERY_PAGE_SOURCE_ID; readonly name = 'Google Search Console Query × Page'; readonly sourceMode = 'OFFICIAL_API'; readonly datasetTypes = ['QUERY_PAGE'];
  constructor(private readonly request: GscQueryPageRequest | null, private readonly requester: ApiRequester) {}
  getCapabilities(): SourceCapabilities { return { requires_browser: false, requires_oauth: true, may_require_manual_login: true, supports_custom_date_range: true, supports_direct_export: false, supports_api: true, supports_resume: true, max_concurrency: 1 }; }
  async checkReadiness(): Promise<SourceReadinessResult> { return { source_id: this.id, readiness_status: this.request ? 'READY' : 'NOT_CONFIGURED', checked_at: new Date().toISOString(), message: this.request ? null : 'Search Console property and date range are required.' }; }
  async collect(): Promise<SourceCollectionResult> { if (!this.request) return { result_type: 'FAILED', error_code: 'CONFIGURATION_REQUIRED', message: 'Search Console request is not configured.' }; try { const result = await fetchGscQueryPage(this.request, this.requester); return { result_type: 'ARTIFACT_PRODUCED', preferred_filename: 'gsc-query-page.json', media_type: 'application/json', bytes: new TextEncoder().encode(JSON.stringify(result.raw_pages)) }; } catch (error) { return { result_type: 'FAILED', error_code: 'GSC_API_FAILED', message: error instanceof Error ? error.message : 'Search Console request failed.' }; } }
}
