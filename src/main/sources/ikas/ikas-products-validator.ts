import { readFile } from 'node:fs/promises';
import type { CollectionValidator, CollectionValidationContext, CollectionValidationDecision } from '../../../shared/collection';
import { parseIkasProductsXlsx } from './ikas-products-parser';
export class IkasProductsValidator implements CollectionValidator {
  async validate(context: CollectionValidationContext): Promise<CollectionValidationDecision> { try { const parsed = parseIkasProductsXlsx(new Uint8Array(await readFile(context.absolute_path))); const fields = Object.keys(parsed.rows[0] ?? {}); return { validation_status: 'VALID', checks_total: 3, checks_passed: fields.length > 0 ? 3 : 2, checks_warning: fields.length > 0 ? 0 : 1, checks_failed: 0, findings: [] }; } catch (error) { return { validation_status: 'INVALID_SCHEMA', checks_total: 1, checks_passed: 0, checks_warning: 0, checks_failed: 1, findings: [{ check_id: 'IKAS_XLSX_SCHEMA', severity: 'ERROR', passed: false, message: error instanceof Error ? error.message : 'Invalid İkas workbook.', expected: 'Supported XLSX workbook', actual: 'Unsupported workbook' }] }; } }
}
