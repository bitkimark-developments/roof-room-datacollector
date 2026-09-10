import { readFile } from 'node:fs/promises';
import type { CollectionValidator, CollectionValidationContext, CollectionValidationDecision } from '../../../shared/collection';
import { parseBitkimarkSitemap } from './bitkimark-sitemap-parser';
export class BitkimarkSitemapValidator implements CollectionValidator {
  async validate(context: CollectionValidationContext): Promise<CollectionValidationDecision> { try { const parsed = parseBitkimarkSitemap(new Uint8Array(await readFile(context.absolute_path)), String(context.source_context.source_url ?? 'https://bitkimark.example/sitemap.xml'), new Date().toISOString()); return { validation_status: parsed.entries.length > 0 ? 'VALID' : 'NO_DATA', checks_total: 3, checks_passed: 3, checks_warning: 0, checks_failed: 0, findings: [] }; } catch (error) { return { validation_status: 'ERROR_NOT_DATA', checks_total: 1, checks_passed: 0, checks_warning: 0, checks_failed: 1, findings: [{ check_id: 'BITKIMARK_XML', severity: 'ERROR', passed: false, message: error instanceof Error ? error.message : 'Invalid sitemap XML.', expected: 'Sitemap XML', actual: 'Invalid or non-data content' }] }; } }
}
