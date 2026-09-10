export const BITKIMARK_SITEMAP_SOURCE_ID = 'bitkimark-sitemap';
export interface BitkimarkUrlEntry { url: string; lastmod: string | null; annotations: string[]; }
export interface BitkimarkSitemapDocument { source_url: string; retrieved_at: string; entries: BitkimarkUrlEntry[]; }
