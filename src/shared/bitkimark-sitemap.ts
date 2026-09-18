export const BITKIMARK_SITEMAP_SOURCE_ID = 'bitkimark-sitemap';
export const BITKIMARK_EXPECTED_HOST = 'bitkimark.com';
export const BITKIMARK_VERIFIED_SITEMAP_URLS = [
  'https://bitkimark.com/sitemap.xml',
  'https://bitkimark.com/blogs.xml',
  'https://bitkimark.com/pages.xml',
  'https://bitkimark.com/products.xml',
  'https://bitkimark.com/collections.xml',
] as const;
export type BitkimarkSitemapDocumentKind = 'SITEMAP_INDEX' | 'URL_SET';
export type BitkimarkSitemapEntryType = 'SITEMAP' | 'URL';
export interface BitkimarkUrlEntry {
  entry_type: BitkimarkSitemapEntryType;
  url: string;
  lastmod: string | null;
  annotations: string[];
}
export interface BitkimarkSitemapDocument {
  source_url: string;
  parent_sitemap_url: string | null;
  retrieved_at: string;
  document_kind: BitkimarkSitemapDocumentKind;
  entries: BitkimarkUrlEntry[];
}
