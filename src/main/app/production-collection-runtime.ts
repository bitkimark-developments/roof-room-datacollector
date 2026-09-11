import type { ApplicationDirectories } from '../../shared/bootstrap-status';
import type { CollectingDataSourceModule, SourceCollectionContext, SourceCollectionResult, CollectionValidator, CollectionValidationContext, CollectionValidationDecision } from '../../shared/collection';
import type { SourceCapabilities, SourceReadinessResult } from '../../shared/source';
import type { StructuredLogSink } from '../../shared/logging';
import type { StateRepository } from '../storage/state-repository';
import type { CredentialStore } from '../core/credential-store';
import { SourceRegistry } from '../core/source-registry';
import { CollectionValidatorRegistry } from '../core/collection-validator-registry';
import { CollectionOrchestrator } from '../core/collection-orchestrator';
import { RunManager } from '../core/run-manager';
import { StorageManager } from '../storage/storage-manager';
import { GoogleApiRuntimeFactory } from '../sources/google-api/google-api-runtime';
import { SerpApiRuntimeFactory } from '../sources/serpapi/serpapi-runtime';
import { GoogleTrendsCollectionValidator } from '../sources/google-trends/google-trends-collection-validator';
import { SerpApiValidator } from '../sources/serpapi/serpapi-validator';
import { IkasProductsValidator } from '../sources/ikas/ikas-products-validator';
import { BitkimarkSitemapValidator } from '../sources/bitkimark/bitkimark-sitemap-validator';
import { IkasProductsSource } from '../sources/ikas/ikas-products-source';
import { BitkimarkSitemapSource } from '../sources/bitkimark/bitkimark-sitemap-source';
import { normalizeGscRows } from '../sources/google-search-console/query-page-adapter';
import { normalizeSearchTerms } from '../sources/google-ads/search-terms-adapter';
import { normalizeKeywordPlanner } from '../sources/google-ads/keyword-planner-adapter';
import { GSC_QUERY_PAGE_SOURCE_ID, GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID, GOOGLE_KEYWORD_PLANNER_SOURCE_ID } from '../../shared/google-api';
import { IKAS_PRODUCTS_SOURCE_ID } from '../../shared/ikas-products';
import { BITKIMARK_SITEMAP_SOURCE_ID } from '../../shared/bitkimark-sitemap';
import { SERPAPI_SOURCE_ID, SERPAPI_DATASET_TYPE } from '../../shared/serpapi';

type Repository = StateRepository;

const capabilities = (mode: string): SourceCapabilities => ({
  requires_browser: mode === 'GOOGLE_TRENDS_UI', requires_oauth: mode === 'OFFICIAL_API',
  may_require_manual_login: mode === 'GOOGLE_TRENDS_UI' || mode === 'OFFICIAL_API',
  supports_custom_date_range: mode === 'OFFICIAL_API' || mode === 'GOOGLE_TRENDS_UI',
  supports_direct_export: mode === 'GOOGLE_TRENDS_UI', supports_api: mode !== 'FILE_IMPORT' && mode !== 'HTTP_XML' && mode !== 'GOOGLE_TRENDS_UI',
  supports_resume: true, max_concurrency: 1,
});

class LazyWorkspaceSource implements CollectingDataSourceModule {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly sourceMode: string,
    readonly datasetTypes: readonly string[],
    private readonly repository: Pick<StateRepository, 'getRun'>,
    private readonly resolve: (workspaceId: string, context: SourceCollectionContext) => CollectingDataSourceModule | null,
  ) {}
  getCapabilities(): SourceCapabilities { return capabilities(this.sourceMode); }
  async checkReadiness(): Promise<SourceReadinessResult> {
    return { source_id: this.id, readiness_status: 'READY', checked_at: new Date().toISOString(), message: null };
  }
  async collect(context: SourceCollectionContext): Promise<SourceCollectionResult> {
    const run = this.repository.getRun(context.run_id);
    if (!run || run.workspace_id.length === 0) return { result_type: 'FAILED', error_code: 'WORKSPACE_REQUIRED', message: 'Run Workspace ownership is unavailable.' };
    try {
      const source = this.resolve(run.workspace_id, context);
      if (!source) return { result_type: 'FAILED', error_code: 'CONFIGURATION_REQUIRED', message: `Source ${this.id} is not configured for this Workspace.` };
      return await source.collect(context);
    } catch (error) {
      return { result_type: 'FAILED', error_code: 'SOURCE_CONFIGURATION_INVALID', message: error instanceof Error ? error.message : 'Source configuration is invalid.' };
    }
  }
}

class GoogleApiCollectionValidator implements CollectionValidator {
  constructor(private readonly sourceId: string) {}
  async validate(context: CollectionValidationContext): Promise<CollectionValidationDecision> {
    if (context.job.source_id !== this.sourceId || context.artifact.source_id !== this.sourceId) return { validation_status: 'INVALID_SCHEMA', checks_total: 1, checks_passed: 0, checks_warning: 0, checks_failed: 1, findings: [] };
    try {
      const fs = await import('node:fs/promises');
      const body = JSON.parse(new TextDecoder().decode(await fs.readFile(context.absolute_path))) as unknown;
      let count = 0;
      if (this.sourceId === GSC_QUERY_PAGE_SOURCE_ID) {
        if (!Array.isArray(body)) throw new Error('GSC artifact must contain the raw pages array.');
        for (const page of body) count += normalizeGscRows(page).length;
      } else if (this.sourceId === GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID) count = normalizeSearchTerms(body).length;
      else count = normalizeKeywordPlanner(body, 'production', Array.isArray((context.source_context as { keywords?: unknown }).keywords) ? ((context.source_context as { keywords: unknown[] }).keywords.filter((v): v is string => typeof v === 'string')) : []).length;
      return { validation_status: count > 0 ? 'VALID' as const : 'NO_DATA' as const, checks_total: 1, checks_passed: 1, checks_warning: 0, checks_failed: 0, findings: [] };
    } catch (error) {
      return { validation_status: 'INVALID_SCHEMA' as const, checks_total: 1, checks_passed: 0, checks_warning: 0, checks_failed: 1, findings: [{ check_id: 'GOOGLE_API_SCHEMA', severity: 'ERROR' as const, passed: false, message: error instanceof Error ? error.message : 'Invalid Google API artifact.', expected: 'Provider response matching source contract', actual: 'Invalid schema' }] };
    }
  }
}

const field = (context: SourceCollectionContext, key: string): unknown => context.source_context[key];
const stringField = (context: SourceCollectionContext, key: string): string | null => { const value = field(context, key); return typeof value === 'string' && value.trim() ? value : null; };

export interface ProductionCollectionRuntime {
  source_registry: SourceRegistry;
  validator_registry: CollectionValidatorRegistry;
  orchestrator: CollectionOrchestrator;
}

export interface ProductionCollectionRuntimeInput {
  repository: Repository;
  credentialStore: CredentialStore;
  directories: ApplicationDirectories;
  googleTrendsSource: CollectingDataSourceModule;
  logger?: StructuredLogSink | null;
}

export const createProductionCollectionRuntime = (input: ProductionCollectionRuntimeInput): ProductionCollectionRuntime => {
  const sourceRegistry = new SourceRegistry();
  sourceRegistry.register(input.googleTrendsSource);
  const googleApi = new GoogleApiRuntimeFactory(input.repository, input.credentialStore);
  const serpApi = new SerpApiRuntimeFactory(input.repository, input.credentialStore);

  sourceRegistry.register(new LazyWorkspaceSource(GSC_QUERY_PAGE_SOURCE_ID, 'Google Search Console Query × Page', 'OFFICIAL_API', ['QUERY_PAGE'], input.repository, (workspaceId, context) => {
    const start = stringField(context, 'start_date') ?? stringField(context, 'date_start'); const end = stringField(context, 'end_date') ?? stringField(context, 'date_end');
    return start && end ? googleApi.createSearchConsoleSource({ workspace_id: workspaceId, start_date: start, end_date: end }) : null;
  }));
  sourceRegistry.register(new LazyWorkspaceSource(GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID, 'Google Ads Search Terms', 'OFFICIAL_API', ['SEARCH_TERMS'], input.repository, (workspaceId, context) => {
    const query = stringField(context, 'query') ?? stringField(context, 'gaql_query');
    return query ? googleApi.createSearchTermsSource({ workspace_id: workspaceId, query }) : null;
  }));
  sourceRegistry.register(new LazyWorkspaceSource(GOOGLE_KEYWORD_PLANNER_SOURCE_ID, 'Google Keyword Planner', 'OFFICIAL_API', ['KEYWORD_HISTORICAL_METRICS'], input.repository, (workspaceId, context) => {
    const values = field(context, 'keywords'); const keywords = Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
    return keywords.length ? googleApi.createKeywordPlannerSource({ workspace_id: workspaceId, keywords }) : null;
  }));
  sourceRegistry.register(new LazyWorkspaceSource(IKAS_PRODUCTS_SOURCE_ID, 'İkas Products', 'FILE_IMPORT', ['PRODUCTS'], input.repository, (workspaceId, context) => {
    const connection = input.repository.getSourceConnection(workspaceId, IKAS_PRODUCTS_SOURCE_ID); const path = stringField(context, 'file_path') ?? (typeof connection?.safe_metadata.file_path === 'string' ? connection.safe_metadata.file_path : null);
    return new IkasProductsSource(path);
  }));
  sourceRegistry.register(new LazyWorkspaceSource(BITKIMARK_SITEMAP_SOURCE_ID, 'Bitkimark Sitemap', 'HTTP_XML', ['SITEMAP_URLS'], input.repository, (workspaceId, context) => {
    const connection = input.repository.getSourceConnection(workspaceId, BITKIMARK_SITEMAP_SOURCE_ID); const url = stringField(context, 'sitemap_url') ?? (typeof connection?.safe_metadata.sitemap_url === 'string' ? connection.safe_metadata.sitemap_url : null);
    return url ? new BitkimarkSitemapSource(url) : null;
  }));
  sourceRegistry.register(new LazyWorkspaceSource(SERPAPI_SOURCE_ID, 'SerpApi Google SERP', 'THIRD_PARTY_API', [SERPAPI_DATASET_TYPE], input.repository, (workspaceId) => serpApi.createSource({ workspace_id: workspaceId })));

  const validators = new CollectionValidatorRegistry();
  validators.register('google-trends', new GoogleTrendsCollectionValidator());
  validators.register(GSC_QUERY_PAGE_SOURCE_ID, new GoogleApiCollectionValidator(GSC_QUERY_PAGE_SOURCE_ID));
  validators.register(GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID, new GoogleApiCollectionValidator(GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID));
  validators.register(GOOGLE_KEYWORD_PLANNER_SOURCE_ID, new GoogleApiCollectionValidator(GOOGLE_KEYWORD_PLANNER_SOURCE_ID));
  validators.register(IKAS_PRODUCTS_SOURCE_ID, new IkasProductsValidator());
  validators.register(BITKIMARK_SITEMAP_SOURCE_ID, new BitkimarkSitemapValidator());
  validators.register(SERPAPI_SOURCE_ID, new SerpApiValidator());
  const storage = new StorageManager(input.directories);
  return { source_registry: sourceRegistry, validator_registry: validators, orchestrator: new CollectionOrchestrator(input.repository, storage, sourceRegistry, validators, new RunManager(input.repository), undefined, input.logger ?? null) };
};
