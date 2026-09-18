import type { SourceCollectionContext } from '../../../shared/collection';
import {
  BITKIMARK_EXPECTED_HOST,
  BITKIMARK_SITEMAP_SOURCE_ID,
  BITKIMARK_VERIFIED_SITEMAP_URLS,
} from '../../../shared/bitkimark-sitemap';
import type { JsonObject } from '../../../shared/run-job';

export const BITKIMARK_SITEMAP_TASK_ID = 'bitkimark-sitemap';
export const BITKIMARK_SITEMAP_SOURCE_MODE = 'HTTP_XML';
export { BITKIMARK_EXPECTED_HOST };

export interface BitkimarkSitemapJobContext {
  task_id: typeof BITKIMARK_SITEMAP_TASK_ID;
  source_id: typeof BITKIMARK_SITEMAP_SOURCE_ID;
  source_mode: typeof BITKIMARK_SITEMAP_SOURCE_MODE;
  requested_url: string;
  expected_host: string;
  parent_sitemap_url: string | null;
}

const requireExpectedHost = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()
    || value !== value.toLocaleLowerCase('en-US') || !/^[a-z0-9.-]+$/.test(value)) {
    throw new Error('Bitkimark expected_host must be a lowercase hostname.');
  }
  if (value !== BITKIMARK_EXPECTED_HOST) {
    throw new Error(`Bitkimark expected_host must be ${BITKIMARK_EXPECTED_HOST}.`);
  }
  return value;
};

export const requireBitkimarkHttpsUrl = (
  value: unknown,
  expectedHost: string,
  field: string,
): string => {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`Bitkimark ${field} must be a non-empty URL.`);
  }
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`Bitkimark ${field} must be a valid URL.`); }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLocaleLowerCase('en-US') !== expectedHost
    || parsed.port !== '' || parsed.username !== '' || parsed.password !== '' || parsed.hash !== '' || parsed.search !== '') {
    throw new Error(`Bitkimark ${field} must be an HTTPS URL on ${expectedHost} without credentials, a port, query, or fragment.`);
  }
  return parsed.toString();
};

export const createBitkimarkSitemapJobContext = (value: unknown): BitkimarkSitemapJobContext => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Bitkimark sitemap Job context must be an object.');
  }
  const context = value as Record<string, unknown>;
  if (context.task_id !== BITKIMARK_SITEMAP_TASK_ID
    || context.source_id !== BITKIMARK_SITEMAP_SOURCE_ID
    || context.source_mode !== BITKIMARK_SITEMAP_SOURCE_MODE) {
    throw new Error('Bitkimark sitemap Job context must match the reviewed HTTP_XML contract.');
  }
  const expectedHost = requireExpectedHost(context.expected_host);
  const requestedUrl = requireBitkimarkHttpsUrl(context.requested_url, expectedHost, 'requested_url');
  const parentSitemapUrl = context.parent_sitemap_url === null
    ? null
    : requireBitkimarkHttpsUrl(context.parent_sitemap_url, expectedHost, 'parent_sitemap_url');
  if (parentSitemapUrl === requestedUrl) throw new Error('Bitkimark parent sitemap URL must differ from the requested URL.');
  const verifiedUrls = new Set<string>(BITKIMARK_VERIFIED_SITEMAP_URLS);
  if (!verifiedUrls.has(requestedUrl)
    || (parentSitemapUrl !== null && parentSitemapUrl !== BITKIMARK_VERIFIED_SITEMAP_URLS[0])) {
    throw new Error('Bitkimark Job context is outside the verified sitemap URL scope.');
  }
  return {
    task_id: BITKIMARK_SITEMAP_TASK_ID,
    source_id: BITKIMARK_SITEMAP_SOURCE_ID,
    source_mode: BITKIMARK_SITEMAP_SOURCE_MODE,
    requested_url: requestedUrl,
    expected_host: expectedHost,
    parent_sitemap_url: parentSitemapUrl,
  };
};

export const bitkimarkSitemapContextFromCollection = (
  context: SourceCollectionContext,
): BitkimarkSitemapJobContext => {
  if (context.source_id && context.source_id !== BITKIMARK_SITEMAP_SOURCE_ID) {
    throw new Error('Bitkimark sitemap collection source identity does not match the Job context.');
  }
  return createBitkimarkSitemapJobContext(context.source_context);
};

export const bitkimarkSitemapContextAsJson = (
  context: BitkimarkSitemapJobContext,
): JsonObject => ({
  task_id: context.task_id,
  source_id: context.source_id,
  source_mode: context.source_mode,
  requested_url: context.requested_url,
  expected_host: context.expected_host,
  parent_sitemap_url: context.parent_sitemap_url,
});
