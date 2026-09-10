import { DOMParser } from '@xmldom/xmldom';
import type { BitkimarkUrlEntry, BitkimarkSitemapDocument } from '../../../shared/bitkimark-sitemap';

const ANNOTATIONS = ['ficus', 'benjamin', 'kaucuk', 'lyrata', 'elastica', 'pasa-kilici', 'sansevieria', 'sanseverya', 'ofis', 'masa', 'zeze', 'zamia', 'zamioculcas'];
export const parseBitkimarkSitemap = (bytes: Uint8Array, sourceUrl: string, retrievedAt: string): BitkimarkSitemapDocument => {
  const text = new TextDecoder().decode(bytes);
  if (!text.trim() || /<html|<!doctype/iu.test(text)) throw new Error('Sitemap response is not XML data.');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  const urls = Array.from(document.getElementsByTagName('url'));
  if (urls.length === 0) throw new Error('Sitemap XML contains no URL entries.');
  const entries: BitkimarkUrlEntry[] = urls.map((node) => {
    const url = node.getElementsByTagName('loc')[0]?.textContent?.trim() ?? '';
    if (!/^https?:\/\/[^\s]+$/u.test(url)) throw new Error('Sitemap contains an invalid URL.');
    const lastmod = node.getElementsByTagName('lastmod')[0]?.textContent?.trim() || null;
    return { url, lastmod, annotations: ANNOTATIONS.filter((term) => url.toLocaleLowerCase('en-US').includes(term)) };
  });
  return { source_url: sourceUrl, retrieved_at: retrievedAt, entries };
};
