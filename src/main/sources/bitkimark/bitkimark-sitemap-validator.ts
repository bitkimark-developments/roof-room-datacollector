import { readFile } from 'node:fs/promises';
import type { CollectionValidator, CollectionValidationContext, CollectionValidationDecision } from '../../../shared/collection';
import { BITKIMARK_SITEMAP_SOURCE_ID } from '../../../shared/bitkimark-sitemap';
import { parseBitkimarkSitemap } from './bitkimark-sitemap-parser';
import { createBitkimarkSitemapJobContext, requireBitkimarkHttpsUrl } from './bitkimark-sitemap-request';

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Bitkimark ${field} metadata is missing.`);
  return value;
};

export class BitkimarkSitemapValidator implements CollectionValidator {
  async validate(context: CollectionValidationContext): Promise<CollectionValidationDecision> {
    try {
      if (context.job.source_id !== BITKIMARK_SITEMAP_SOURCE_ID
        || context.artifact.source_id !== BITKIMARK_SITEMAP_SOURCE_ID) {
        throw new Error('Bitkimark sitemap source identity is invalid.');
      }
      const jobContext = createBitkimarkSitemapJobContext(context.source_context);
      const acquisition = context.acquisition_metadata;
      if (!acquisition) throw new Error('Bitkimark HTTP acquisition metadata is missing.');
      if (acquisition.requested_url !== jobContext.requested_url) {
        throw new Error('Bitkimark requested URL metadata does not match the reviewed Job.');
      }
      if (typeof acquisition.response_status !== 'number' || !Number.isInteger(acquisition.response_status)
        || acquisition.response_status < 200 || acquisition.response_status > 299) {
        throw new Error('Bitkimark response status metadata is not a successful HTTP status.');
      }
      const contentType = requireString(acquisition.content_type, 'content_type').toLocaleLowerCase('en-US');
      if (!/^(?:application|text)\/(?:[a-z0-9.+-]*\+)?xml(?:\s*;|$)/.test(contentType)) {
        throw new Error('Bitkimark response content type is not XML.');
      }
      const finalUrl = requireBitkimarkHttpsUrl(
        acquisition.final_url,
        jobContext.expected_host,
        'final_url',
      );
      const parsed = parseBitkimarkSitemap(
        new Uint8Array(await readFile(context.absolute_path)),
        {
          source_url: jobContext.requested_url,
          expected_host: jobContext.expected_host,
          parent_sitemap_url: jobContext.parent_sitemap_url,
          retrieved_at: context.artifact.created_at,
        },
      );
      if (new URL(finalUrl).hostname !== jobContext.expected_host) {
        throw new Error('Bitkimark final URL escaped the expected host.');
      }
      return {
        validation_status: parsed.entries.length > 0 ? 'VALID' : 'NO_DATA',
        checks_total: 8,
        checks_passed: 8,
        checks_warning: 0,
        checks_failed: 0,
        findings: [],
      };
    } catch (error) {
      return {
        validation_status: 'ERROR_NOT_DATA',
        checks_total: 1,
        checks_passed: 0,
        checks_warning: 0,
        checks_failed: 1,
        findings: [{
          check_id: 'BITKIMARK_XML',
          severity: 'ERROR',
          passed: false,
          message: error instanceof Error ? error.message : 'Invalid sitemap XML.',
          expected: 'Reviewed Bitkimark HTTP/XML evidence with valid acquisition provenance',
          actual: 'Invalid, unrelated, or non-data content',
        }],
      };
    }
  }
}
