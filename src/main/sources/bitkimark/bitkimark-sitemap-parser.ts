import { DOMParser } from '@xmldom/xmldom';
import type { Element as XmlElement } from '@xmldom/xmldom';
import type {
  BitkimarkSitemapDocument,
  BitkimarkSitemapDocumentKind,
  BitkimarkSitemapEntryType,
  BitkimarkUrlEntry,
} from '../../../shared/bitkimark-sitemap';
import { BITKIMARK_VERIFIED_SITEMAP_URLS } from '../../../shared/bitkimark-sitemap';
import { requireBitkimarkHttpsUrl } from './bitkimark-sitemap-request';

const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const ANNOTATIONS = ['ficus', 'benjamin', 'kaucuk', 'lyrata', 'elastica', 'pasa-kilici', 'sansevieria', 'sanseverya', 'ofis', 'masa', 'zeze', 'zamia', 'zamioculcas'];

export interface BitkimarkSitemapParseContext {
  source_url: string;
  expected_host: string;
  parent_sitemap_url: string | null;
  retrieved_at: string;
}

const elementName = (element: XmlElement): string => element.localName || element.tagName.replace(/^.*:/, '');

const directChildren = (element: XmlElement, name: string): XmlElement[] => Array.from(element.childNodes)
  .filter((node): node is XmlElement => node.nodeType === 1 && elementName(node as XmlElement) === name) as XmlElement[];

const directText = (element: XmlElement, name: string): string | null => {
  const matches = directChildren(element, name);
  if (matches.length > 1) throw new Error(`Sitemap entry contains duplicate ${name} elements.`);
  const value = matches[0]?.textContent?.trim();
  return value ? value : null;
};

const requireValidCalendarDate = (value: string): void => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Sitemap lastmod date is not ISO 8601.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error('Sitemap lastmod contains an invalid calendar date.');
  }
};

const requireLastmod = (value: string | null): string | null => {
  if (value === null) return null;
  requireValidCalendarDate(value.slice(0, 10));
  if (value.length > 10 && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value)))) {
    throw new Error('Sitemap lastmod datetime is not supported ISO 8601.');
  }
  return value;
};

export const parseBitkimarkSitemap = (
  bytes: Uint8Array,
  context: BitkimarkSitemapParseContext,
): BitkimarkSitemapDocument => {
  const sourceUrl = requireBitkimarkHttpsUrl(context.source_url, context.expected_host, 'source_url');
  const parentSitemapUrl = context.parent_sitemap_url === null
    ? null
    : requireBitkimarkHttpsUrl(context.parent_sitemap_url, context.expected_host, 'parent_sitemap_url');
  if (typeof context.retrieved_at !== 'string' || !Number.isFinite(Date.parse(context.retrieved_at))) {
    throw new Error('Sitemap retrieved_at must be an ISO timestamp.');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text.trim() || /<html|<!doctype/iu.test(text)) throw new Error('Sitemap response is not supported XML data.');

  const document = new DOMParser({
    onError: (_level, message) => { throw new Error(`Malformed sitemap XML: ${message}`); },
  }).parseFromString(text, 'application/xml');
  const root = document.documentElement;
  if (root === null) throw new Error('Sitemap XML contains no document element.');
  const rootName = elementName(root);
  let documentKind: BitkimarkSitemapDocumentKind;
  let entryElementName: 'sitemap' | 'url';
  let entryType: BitkimarkSitemapEntryType;
  if (rootName === 'sitemapindex') {
    documentKind = 'SITEMAP_INDEX';
    entryElementName = 'sitemap';
    entryType = 'SITEMAP';
  } else if (rootName === 'urlset') {
    documentKind = 'URL_SET';
    entryElementName = 'url';
    entryType = 'URL';
  } else {
    throw new Error(`Unsupported sitemap root element: ${rootName}`);
  }
  if (root.namespaceURI !== SITEMAP_NAMESPACE) {
    throw new Error('Sitemap XML namespace does not match the standard sitemap contract.');
  }

  const seen = new Set<string>();
  const entries: BitkimarkUrlEntry[] = directChildren(root, entryElementName).map((node) => {
    const rawUrl = directText(node, 'loc');
    if (rawUrl === null) throw new Error('Sitemap entry contains no loc.');
    const parsedUrl = requireBitkimarkHttpsUrl(rawUrl, context.expected_host, 'loc');
    if (seen.has(parsedUrl)) throw new Error(`Sitemap contains duplicate loc: ${rawUrl}`);
    seen.add(parsedUrl);
    return {
      entry_type: entryType,
      url: rawUrl,
      lastmod: requireLastmod(directText(node, 'lastmod')),
      annotations: entryType === 'URL'
        ? ANNOTATIONS.filter((term) => rawUrl.toLocaleLowerCase('en-US').includes(term))
        : [],
    };
  });

  if (documentKind === 'SITEMAP_INDEX') {
    const verifiedSitemaps = new Set<string>(BITKIMARK_VERIFIED_SITEMAP_URLS.slice(1));
    if (entries.some((entry) => !verifiedSitemaps.has(new URL(entry.url).toString()))) {
      throw new Error('Sitemap index contains an unverified child sitemap URL.');
    }
  }

  return {
    source_url: sourceUrl,
    parent_sitemap_url: parentSitemapUrl,
    retrieved_at: context.retrieved_at,
    document_kind: documentKind,
    entries,
  };
};
