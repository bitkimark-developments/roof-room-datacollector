import type { CollectingDataSourceModule, SourceCollectionContext, SourceCollectionResult } from '../../../shared/collection';
import type { SourceCapabilities, SourceReadinessResult } from '../../../shared/source';
import { IKAS_PRODUCTS_SOURCE_ID } from '../../../shared/ikas-products';
import { readFileImportEvidence } from '../file-import/file-import-evidence';
import { ikasProductsContextFromCollection } from './ikas-products-request';

export class IkasProductsSource implements CollectingDataSourceModule {
  readonly id = IKAS_PRODUCTS_SOURCE_ID;
  readonly name = 'İkas Products';
  readonly sourceMode = 'FILE_IMPORT';
  readonly datasetTypes = ['PRODUCTS'];
  getCapabilities(): SourceCapabilities { return { requires_browser: false, requires_oauth: false, may_require_manual_login: false, supports_custom_date_range: false, supports_direct_export: false, supports_api: false, supports_resume: true, max_concurrency: 1 }; }
  async checkReadiness(): Promise<SourceReadinessResult> { return { source_id: this.id, readiness_status: 'READY', checked_at: new Date().toISOString(), message: null }; }
  async collect(context: SourceCollectionContext): Promise<SourceCollectionResult> {
    let jobContext;
    try {
      jobContext = ikasProductsContextFromCollection(context);
    } catch {
      return { result_type: 'FAILED', error_code: 'SOURCE_CONFIGURATION_INVALID', message: 'İkas Products requires a valid reviewed FILE_IMPORT path.' };
    }
    try {
      const evidence = await readFileImportEvidence(jobContext.file_path);
      return { result_type: 'ARTIFACT_PRODUCED', preferred_filename: 'ikas-products.xlsx', media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: evidence.bytes };
    } catch (error) { return { result_type: 'FAILED', error_code: 'FILE_READ_FAILED', message: error instanceof Error ? error.message : 'Unable to read İkas Products file.' }; }
  }
}
