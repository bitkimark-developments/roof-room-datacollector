import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';

import type { ArtifactRecord } from '../../shared/artifact';
import type { JobRecord, RunRecord } from '../../shared/run-job';
import type { DataPackageInputDataset } from './data-package-exporter';
import type { StorageManager } from '../storage/storage-manager';
import { parseGoogleTrendsInterestOverTimeCsv } from '../sources/google-trends/google-trends-interest-over-time-parser';
import { normalizeGscRows } from '../sources/google-search-console/query-page-adapter';
import { normalizeSearchTerms } from '../sources/google-ads/search-terms-adapter';
import { normalizeKeywordPlanner } from '../sources/google-ads/keyword-planner-adapter';
import { createKeywordPlannerJobContext } from '../sources/google-ads/keyword-planner-request';
import { parseKeywordPlannerManualCsv } from '../sources/google-ads/keyword-planner-csv-parser';
import { parseIkasProductsXlsx } from '../sources/ikas/ikas-products-parser';
import { parseBitkimarkSitemap } from '../sources/bitkimark/bitkimark-sitemap-parser';
import { parseSerpApiResponse } from '../sources/serpapi/serpapi-parser';
import { requireSerpApiJobContext } from '../sources/serpapi/serpapi-request';

const ACCEPTED_VALIDATION = new Set(['VALID', 'LOW_DATA', 'NO_DATA']);

export interface ProductionDataPackageRepository {
  getRun(run_id: string): RunRecord | null;
  listJobs(run_id: string): JobRecord[];
  getArtifact(artifact_id: string): ArtifactRecord | null;
}

const asObject = (value: unknown, context: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const decodeJson = (bytes: Uint8Array, context: string): unknown => {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${context} is not valid UTF-8 JSON.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context} is not valid JSON.`);
  }
};

const safeContext = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(safeContext);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(credential|secret|token|api[_-]?key|password|file[_-]?path)/iu.test(key))
      .map(([key, nested]) => [key, safeContext(nested)]),
  );
};

const jsonRows = (rows: readonly unknown[]): Array<Record<string, unknown>> =>
  JSON.parse(JSON.stringify(rows)) as Array<Record<string, unknown>>;

const requireString = (value: unknown, context: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value;
};

export class ProductionDataPackageLoader {
  constructor(
    private readonly repository: ProductionDataPackageRepository,
    private readonly storage: Pick<StorageManager, 'resolveRunRelativePath'>,
  ) {}

  async loadRunDatasets(run_id: string): Promise<DataPackageInputDataset[]> {
    const run = this.repository.getRun(run_id);
    if (run === null) throw new Error(`Unknown Run: ${run_id}`);

    const datasets: DataPackageInputDataset[] = [];
    for (const job of this.repository.listJobs(run_id)) {
      if (
        job.execution_status !== 'COMPLETED'
        || !ACCEPTED_VALIDATION.has(job.validation_status)
        || job.accepted_artifact_id === null
      ) {
        continue;
      }
      const artifact = this.requireAcceptedArtifact(run, job);
      const bytes = await this.readVerifiedArtifact(artifact);
      const parsed = this.parseDataset(job, artifact, bytes);
      datasets.push({
        source_id: job.source_id,
        dataset_type: parsed.dataset_type,
        job_id: job.job_id,
        job_key: job.job_key,
        rows: parsed.rows,
        provenance: {
          run_id: run.run_id,
          workspace_id: run.workspace_id,
          job_id: job.job_id,
          job_key: job.job_key,
          source_id: job.source_id,
          validation_status: job.validation_status,
          raw_artifact_id: artifact.artifact_id,
          raw_artifact_filename: artifact.filename,
          raw_artifact_media_type: artifact.media_type,
          raw_artifact_byte_size: artifact.byte_size,
          raw_artifact_sha256: artifact.sha256,
          acquired_at: artifact.created_at,
          requested_context: safeContext(job.source_context),
        },
      });
    }
    return datasets;
  }

  private requireAcceptedArtifact(run: RunRecord, job: JobRecord): ArtifactRecord {
    const artifact = this.repository.getArtifact(job.accepted_artifact_id as string);
    if (
      artifact === null
      || artifact.run_id !== run.run_id
      || artifact.job_id !== job.job_id
      || artifact.source_id !== job.source_id
      || artifact.artifact_kind !== 'RAW_SOURCE_FILE'
      || (artifact.artifact_state !== 'ACCEPTED' && artifact.artifact_state !== 'ACCEPTED_WITH_WARNING')
      || artifact.sha256 === null
    ) {
      throw new Error(`Job ${job.job_id} has no valid accepted raw artifact for export.`);
    }
    return artifact;
  }

  private async readVerifiedArtifact(artifact: ArtifactRecord): Promise<Uint8Array> {
    const absolutePath = this.storage.resolveRunRelativePath(artifact.run_id, artifact.relative_path);
    const fileStat = await lstat(absolutePath);
    if (!fileStat.isFile()) throw new Error(`Accepted artifact ${artifact.artifact_id} is not a regular file.`);
    const bytes = new Uint8Array(await readFile(absolutePath));
    if (bytes.byteLength !== artifact.byte_size) {
      throw new Error(`Accepted artifact ${artifact.artifact_id} byte size failed integrity verification.`);
    }
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (checksum !== artifact.sha256) {
      throw new Error(`Accepted artifact ${artifact.artifact_id} checksum failed integrity verification.`);
    }
    return bytes;
  }

  private parseDataset(
    job: JobRecord,
    artifact: ArtifactRecord,
    bytes: Uint8Array,
  ): { dataset_type: string; rows: Array<Record<string, unknown>> } {
    switch (job.source_id) {
      case 'google-trends': {
        const parsed = parseGoogleTrendsInterestOverTimeCsv(bytes);
        return {
          dataset_type: 'INTEREST_OVER_TIME',
          rows: parsed.rows.flatMap((row) => row.values.map((value) => ({
            period_start: row.period_start,
            temporal_dimension: parsed.temporal_dimension,
            category_label: parsed.category_label,
            query: value.query,
            geography_label: value.geography_label,
            relative_interest: value.relative_interest,
          }))),
        };
      }
      case 'google-search-console-query-page': {
        const pages = decodeJson(bytes, 'GSC accepted artifact');
        if (!Array.isArray(pages)) throw new Error('GSC accepted artifact must contain a pages array.');
        return { dataset_type: 'QUERY_PAGE', rows: jsonRows(pages.flatMap(normalizeGscRows)) };
      }
      case 'google-ads-search-terms':
        return { dataset_type: 'SEARCH_TERMS', rows: jsonRows(normalizeSearchTerms(decodeJson(bytes, 'Google Ads Search Terms accepted artifact'))) };
      case 'google-keyword-planner': {
        const context = createKeywordPlannerJobContext(job.source_context);
        return {
          dataset_type: 'KEYWORD_HISTORICAL_METRICS',
          rows: jsonRows(normalizeKeywordPlanner(decodeJson(bytes, 'Keyword Planner accepted artifact'), context.group_id, context.keywords)),
        };
      }
      case 'google-keyword-planner-csv':
        return { dataset_type: 'KEYWORD_HISTORICAL_METRICS', rows: jsonRows(parseKeywordPlannerManualCsv(bytes).rows) };
      case 'ikas-products':
        return { dataset_type: 'PRODUCTS', rows: jsonRows(parseIkasProductsXlsx(bytes).rows) };
      case 'bitkimark-sitemap': {
        const context = asObject(job.source_context, 'Bitkimark source context');
        const document = parseBitkimarkSitemap(bytes, {
          source_url: requireString(context.requested_url, 'Bitkimark requested_url'),
          expected_host: requireString(context.expected_host, 'Bitkimark expected_host'),
          parent_sitemap_url: context.parent_sitemap_url === null ? null : requireString(context.parent_sitemap_url, 'Bitkimark parent_sitemap_url'),
          retrieved_at: artifact.created_at,
        });
        return {
          dataset_type: 'SITEMAP_URLS',
          rows: jsonRows(document.entries.map((entry) => ({
            ...entry,
            document_kind: document.document_kind,
            source_url: document.source_url,
            parent_sitemap_url: document.parent_sitemap_url,
            retrieved_at: document.retrieved_at,
          }))),
        };
      }
      case 'serpapi': {
        const context = requireSerpApiJobContext(job.source_context, job.job_key);
        const parsed = parseSerpApiResponse(decodeJson(bytes, 'SerpApi accepted artifact'), context);
        return { dataset_type: 'GOOGLE_SERP', rows: jsonRows(parsed.rows) };
      }
      default:
        throw new Error(`No production Data Package loader is registered for source ${job.source_id}.`);
    }
  }
}
