import { readFile } from 'node:fs/promises';
import type { CollectionValidator, CollectionValidationContext, CollectionValidationDecision } from '../../../shared/collection';
import { parseIkasProductsXlsx } from './ikas-products-parser';

const requiredHeaders = [
  ['ürün grup id', 'ürün id', 'product id'],
  ['varyant id', 'variant id'],
  ['isim', 'ürün adı', 'product title', 'title'],
  ['satış fiyatı', 'price', 'fiyat'],
  ['indirimli fiyatı', 'indirimli fiyat', 'sale price'],
];
const normalizeHeader = (value: string): string => value.trim().normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US');

export class IkasProductsValidator implements CollectionValidator {
  async validate(context: CollectionValidationContext): Promise<CollectionValidationDecision> {
    try {
      const parsed = parseIkasProductsXlsx(new Uint8Array(await readFile(context.absolute_path)));
      const normalized = new Set(parsed.headers.map(normalizeHeader));
      const missing = requiredHeaders.filter((aliases) => !aliases.some((header) => normalized.has(normalizeHeader(header)))).map((aliases) => aliases[0]);
      const invalidRows = parsed.rows.filter((row) => typeof row.product_id !== 'string' || !row.product_id || typeof row.variant_id !== 'string' || !row.variant_id);
      if (missing.length || invalidRows.length || parsed.issues.length) {
        const message = missing.length ? `Missing required İkas headers: ${missing.join(', ')}.` : invalidRows.length ? 'Product and Variant IDs must be non-empty source identifiers.' : parsed.issues[0];
        return { validation_status: 'INVALID_SCHEMA', checks_total: 5, checks_passed: 5 - (missing.length ? 1 : 0) - (invalidRows.length ? 1 : 0) - (parsed.issues.length ? 1 : 0), checks_warning: 0, checks_failed: 1, findings: [{ check_id: 'IKAS_XLSX_SCHEMA', severity: 'ERROR', passed: false, message, expected: 'Production İkas Products XLSX schema', actual: 'Required fields or values are invalid' }] };
      }
      return { validation_status: 'VALID', checks_total: 5, checks_passed: 5, checks_warning: 0, checks_failed: 0, findings: [] };
    } catch (error) {
      return { validation_status: 'INVALID_SCHEMA', checks_total: 1, checks_passed: 0, checks_warning: 0, checks_failed: 1, findings: [{ check_id: 'IKAS_XLSX_SCHEMA', severity: 'ERROR', passed: false, message: error instanceof Error ? error.message : 'Invalid İkas workbook.', expected: 'Supported XLSX workbook', actual: 'Unsupported workbook' }] };
    }
  }
}
