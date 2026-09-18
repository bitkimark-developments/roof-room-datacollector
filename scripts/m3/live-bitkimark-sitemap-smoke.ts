import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { BitkimarkSitemapSource } from '../../src/main/sources/bitkimark/bitkimark-sitemap-source';
import { BitkimarkSitemapValidator } from '../../src/main/sources/bitkimark/bitkimark-sitemap-validator';
import { parseBitkimarkSitemap } from '../../src/main/sources/bitkimark/bitkimark-sitemap-parser';
import { BITKIMARK_SITEMAP_SOURCE_ID } from '../../src/shared/bitkimark-sitemap';
import {
  BITKIMARK_EXPECTED_HOST,
  BITKIMARK_SITEMAP_SOURCE_MODE,
  BITKIMARK_SITEMAP_TASK_ID,
  bitkimarkSitemapContextAsJson,
  createBitkimarkSitemapJobContext,
} from '../../src/main/sources/bitkimark/bitkimark-sitemap-request';

export const CONFIRMATION_FLAG = '--confirm-live-collection';
export const SITEMAP_URL_FLAG = '--sitemap-url';

export interface BitkimarkLiveSmokeArguments { help: boolean; confirmed: boolean; sitemap_url: string | null; }

const validateUrl = (value: string): string => {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Bitkimark sitemap URL must be a valid URL.'); }
  if (parsed.protocol !== 'https:') throw new Error('Bitkimark sitemap URL must use HTTPS.');
  if (!parsed.hostname || parsed.username || parsed.password || parsed.hash) throw new Error('Bitkimark sitemap URL must not contain credentials or a fragment.');
  return parsed.toString();
};

export const parseBitkimarkLiveSmokeArguments = (args: readonly string[]): BitkimarkLiveSmokeArguments => {
  const result: BitkimarkLiveSmokeArguments = { help: false, confirmed: false, sitemap_url: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') { result.help = true; continue; }
    if (argument === CONFIRMATION_FLAG) { if (result.confirmed) throw new Error('Duplicate confirmation flag.'); result.confirmed = true; continue; }
    if (argument === SITEMAP_URL_FLAG) { if (result.sitemap_url !== null) throw new Error('Duplicate sitemap URL.'); const value = args[index + 1]; if (!value || value.startsWith('--')) throw new Error('--sitemap-url requires a value.'); result.sitemap_url = validateUrl(value); index += 1; continue; }
    if (argument.startsWith(`${SITEMAP_URL_FLAG}=`)) { if (result.sitemap_url !== null) throw new Error('Duplicate sitemap URL.'); result.sitemap_url = validateUrl(argument.slice(`${SITEMAP_URL_FLAG}=`.length)); continue; }
    throw new Error(`Unsupported argument: ${argument}`);
  }
  return result;
};

export const requireBitkimarkLiveSmokeConfirmation = (args: readonly string[]): BitkimarkLiveSmokeArguments => {
  const parsed = parseBitkimarkLiveSmokeArguments(args);
  if (parsed.help) return parsed;
  if (!parsed.confirmed) throw new Error(`Refusing live Bitkimark request without ${CONFIRMATION_FLAG}.`);
  if (!parsed.sitemap_url) throw new Error(`Bitkimark live smoke requires ${SITEMAP_URL_FLAG} <https-url>.`);
  return parsed;
};

export interface BitkimarkLiveSmokeSummary { source_id: string; request_status: string; byte_size: number; sha256: string; validation_status: string; url_count: number; annotation_counts: Record<string, number>; raw_artifact_persisted: boolean; }

export const executeBitkimarkLiveSmoke = async (
  args: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<BitkimarkLiveSmokeSummary> => {
  const parsed = requireBitkimarkLiveSmokeConfirmation(args);
  if (parsed.help) throw new Error('HELP_REQUESTED');
  const jobContext = createBitkimarkSitemapJobContext({
    task_id: BITKIMARK_SITEMAP_TASK_ID,
    source_id: BITKIMARK_SITEMAP_SOURCE_ID,
    source_mode: BITKIMARK_SITEMAP_SOURCE_MODE,
    requested_url: parsed.sitemap_url,
    expected_host: BITKIMARK_EXPECTED_HOST,
    parent_sitemap_url: null,
  });
  const sourceContext = bitkimarkSitemapContextAsJson(jobContext);
  const source = new BitkimarkSitemapSource(fetcher);
  const result = await source.collect({ source_id: BITKIMARK_SITEMAP_SOURCE_ID, source_context: sourceContext } as never);
  if (result.result_type !== 'ARTIFACT_PRODUCED') throw new Error(`${'error_code' in result ? result.error_code : result.result_type}: ${result.message ?? 'Bitkimark sitemap request failed.'}`);
  const bytes = result.bytes;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'roofroom-bitkimark-smoke-'));
  const artifactPath = path.join(temporaryDirectory, 'bitkimark-sitemap.xml');
  try {
    await writeFile(artifactPath, bytes);
    const retrievedAt = new Date().toISOString();
    const validation = await new BitkimarkSitemapValidator().validate({
      absolute_path: artifactPath,
      source_context: sourceContext,
      acquisition_metadata: result.acquisition_metadata,
      job: { source_id: BITKIMARK_SITEMAP_SOURCE_ID },
      artifact: { source_id: BITKIMARK_SITEMAP_SOURCE_ID, created_at: retrievedAt },
    } as never);
    const document = parseBitkimarkSitemap(bytes, {
      source_url: jobContext.requested_url,
      expected_host: jobContext.expected_host,
      parent_sitemap_url: jobContext.parent_sitemap_url,
      retrieved_at: retrievedAt,
    });
    const annotationCounts: Record<string, number> = {};
    for (const entry of document.entries) for (const annotation of entry.annotations) annotationCounts[annotation] = (annotationCounts[annotation] ?? 0) + 1;
    return { source_id: BITKIMARK_SITEMAP_SOURCE_ID, request_status: 'HTTP_SUCCESS', byte_size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), validation_status: validation.validation_status, url_count: document.entries.length, annotation_counts: annotationCounts, raw_artifact_persisted: false };
  } finally { await rm(temporaryDirectory, { recursive: true, force: true }); }
};

const usage = (): string => `Usage: npm run m3:live-bitkimark-sitemap-smoke -- ${CONFIRMATION_FLAG} ${SITEMAP_URL_FLAG} <https-url>\n\nOne HTTPS sitemap request; no retry or refresh. Raw XML is never printed.`;

if (require.main === module) {
  executeBitkimarkLiveSmoke(process.argv.slice(2)).then((summary) => console.log(JSON.stringify(summary))).catch((error: unknown) => { if (error instanceof Error && error.message === 'HELP_REQUESTED') { console.log(usage()); return; } console.error(error instanceof Error ? error.message : 'Bitkimark live smoke failed.'); process.exitCode = 1; });
}
