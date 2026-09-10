import type { JobPlan } from '../../../shared/run-job';
import {
  SERPAPI_DATASET_TYPE,
  SERPAPI_SOURCE_ID,
  type SerpApiRequestContext,
} from '../../../shared/serpapi';

export interface SerpApiJobPlanInput {
  job_key: string;
  query: string;
}

export const createSerpApiJobPlans = (
  entries: readonly SerpApiJobPlanInput[],
  defaults: Omit<SerpApiRequestContext, 'query'>,
): JobPlan[] => entries.map((entry) => ({
  source_id: SERPAPI_SOURCE_ID,
  job_key: entry.job_key,
  query_group_id: null as null,
  source_context: {
    ...defaults,
    query: entry.query,
    dataset_type: SERPAPI_DATASET_TYPE,
  },
}));
