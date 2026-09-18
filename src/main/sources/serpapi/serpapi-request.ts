import type { JsonObject } from '../../../shared/run-job';
import {
  SERPAPI_ACQUISITION_MODE,
  SERPAPI_DATASET_TYPE,
  SERPAPI_SOURCE_ID,
  type SerpApiRequestContext,
} from '../../../shared/serpapi';

export const SERPAPI_TASK_ID = 'serpapi-serp-snapshot';

export interface SerpApiJobContext extends SerpApiRequestContext {
  task_id: typeof SERPAPI_TASK_ID;
  source_id: typeof SERPAPI_SOURCE_ID;
  source_mode: typeof SERPAPI_ACQUISITION_MODE;
  dataset_type: typeof SERPAPI_DATASET_TYPE;
  job_key: string;
}

const CONTEXT_KEYS = new Set([
  'task_id',
  'source_id',
  'source_mode',
  'dataset_type',
  'job_key',
  'query',
  'country_code',
  'language_code',
  'device',
  'engine',
  'organic_limit',
  'snapshot_date',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};

export const requireSerpApiJobContext = (
  value: unknown,
  expectedJobKey?: string,
): SerpApiJobContext => {
  if (!isRecord(value)) throw new Error('SerpApi source_context is required.');
  if (Object.keys(value).some((key) => !CONTEXT_KEYS.has(key))) {
    throw new Error('SerpApi source_context contains unsupported fields.');
  }
  if (value.task_id !== SERPAPI_TASK_ID) throw new Error('SerpApi task identity is invalid.');
  if (value.source_id !== SERPAPI_SOURCE_ID) throw new Error('SerpApi source identity is invalid.');
  if (value.source_mode !== SERPAPI_ACQUISITION_MODE) throw new Error('SerpApi acquisition mode is invalid.');
  if (value.dataset_type !== SERPAPI_DATASET_TYPE) throw new Error('SerpApi dataset identity is invalid.');
  if (typeof value.job_key !== 'string' || !/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/u.test(value.job_key)) {
    throw new Error('SerpApi Job key is invalid.');
  }
  if (expectedJobKey !== undefined && value.job_key !== expectedJobKey) {
    throw new Error('SerpApi Job key does not match persisted Job identity.');
  }
  if (
    typeof value.query !== 'string'
    || value.query.length === 0
    || value.query.length > 512
    || value.query !== value.query.trim()
  ) {
    throw new Error('SerpApi query is invalid.');
  }
  if (
    value.country_code !== 'TR'
    || value.language_code !== 'tr'
    || value.device !== 'desktop'
    || value.engine !== 'google'
    || value.organic_limit !== 10
  ) {
    throw new Error('SerpApi request scope does not match the locked contract.');
  }
  if (!isIsoDate(value.snapshot_date)) throw new Error('SerpApi snapshot date is invalid.');
  return value as unknown as SerpApiJobContext;
};

export const createSerpApiJobContext = (
  input: unknown,
): SerpApiJobContext => requireSerpApiJobContext(input);

export const serpApiContextAsJson = (
  context: SerpApiJobContext,
): JsonObject => ({ ...context });
