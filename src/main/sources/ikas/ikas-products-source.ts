import { readFile } from 'node:fs/promises';
import type { CollectingDataSourceModule, SourceCollectionResult } from '../../../shared/collection';
import type { SourceCapabilities, SourceReadinessResult } from '../../../shared/source';
import { IKAS_PRODUCTS_SOURCE_ID } from '../../../shared/ikas-products';

export class IkasProductsSource implements CollectingDataSourceModule {
  readonly id = IKAS_PRODUCTS_SOURCE_ID;
  readonly name = 'İkas Products';
  readonly sourceMode = 'FILE_IMPORT';
  readonly datasetTypes = ['PRODUCTS'];
  constructor(private readonly filePath: string | null) {}
  getCapabilities(): SourceCapabilities { return { requires_browser: false, requires_oauth: false, may_require_manual_login: false, supports_custom_date_range: false, supports_direct_export: false, supports_api: false, supports_resume: true, max_concurrency: 1 }; }
  async checkReadiness(): Promise<SourceReadinessResult> { const ready = this.filePath !== null; return { source_id: this.id, readiness_status: ready ? 'READY' : 'NOT_CONFIGURED', checked_at: new Date().toISOString(), message: ready ? null : 'A current İkas Products XLSX file is required.' }; }
  async collect(): Promise<SourceCollectionResult> {
    if (!this.filePath) return { result_type: 'FAILED', error_code: 'FILE_CONFIGURATION_REQUIRED', message: 'A current İkas Products XLSX file is required.' };
    try { return { result_type: 'ARTIFACT_PRODUCED', preferred_filename: 'ikas-products.xlsx', media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: new Uint8Array(await readFile(this.filePath)) }; } catch (error) { return { result_type: 'FAILED', error_code: 'FILE_READ_FAILED', message: error instanceof Error ? error.message : 'Unable to read İkas Products file.' }; }
  }
}
