import type { JobPlan } from '../../../shared/run-job';
import {
  SERPAPI_SOURCE_ID,
} from '../../../shared/serpapi';
import {
  createSerpApiJobContext,
  serpApiContextAsJson,
  SERPAPI_TASK_ID,
} from './serpapi-request';

export interface SerpApiJobPlanInput {
  job_key: string;
  query: string;
}

export const createSerpApiJobPlans = (
  entries: readonly SerpApiJobPlanInput[],
  snapshotDate: string,
): JobPlan[] => {
  const jobKeys = entries.map((entry) => entry.job_key);
  if (new Set(jobKeys).size !== jobKeys.length) {
    throw new Error('SerpApi Job keys must be unique.');
  }
  return entries.map((entry) => ({
    source_id: SERPAPI_SOURCE_ID,
    job_key: entry.job_key,
    query_group_id: null as null,
    source_context: serpApiContextAsJson(createSerpApiJobContext({
      task_id: SERPAPI_TASK_ID,
      source_id: SERPAPI_SOURCE_ID,
      source_mode: 'THIRD_PARTY_API',
      dataset_type: 'GOOGLE_SERP',
      job_key: entry.job_key,
      query: entry.query,
      country_code: 'TR',
      language_code: 'tr',
      device: 'desktop',
      engine: 'google',
      organic_limit: 10,
      snapshot_date: snapshotDate,
    })),
  }));
};
