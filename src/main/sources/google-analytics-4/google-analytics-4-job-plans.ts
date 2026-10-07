import type { JobPlan } from '../../../shared/run-job';
import {
  GA4_DATASET_TYPES,
  GA4_PAID_FUNNEL_SESSION_FILTER,
  GOOGLE_ANALYTICS_4_SOURCE_ID,
  type GoogleAnalytics4DatasetType,
  type GoogleAnalytics4RequestContext,
} from '../../../shared/google-analytics-4';

export interface GoogleAnalytics4JobPlanInput {
  start_date: string;
  end_date: string;
  datasets?: readonly GoogleAnalytics4DatasetType[];
}

const requireDate = (
  value: string,
  field: string,
): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`${field} must be an absolute date.`);
  }

  const [year, month, day] = value
    .split('-')
    .map(Number);

  const parsed = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`${field} must be a valid calendar date.`);
  }

  return value;
};

export const createGoogleAnalytics4JobPlans = (
  input: GoogleAnalytics4JobPlanInput,
): JobPlan[] => {
  const startDate = requireDate(
    input.start_date,
    'GA4 start_date',
  );

  const endDate = requireDate(
    input.end_date,
    'GA4 end_date',
  );

  if (startDate > endDate) {
    throw new Error(
      'GA4 date range is reversed.',
    );
  }

  const datasetTypes =
    input.datasets
    ?? GA4_DATASET_TYPES;

  if (
    datasetTypes.length === 0
    || new Set(datasetTypes).size !== datasetTypes.length
    || datasetTypes.some(
      (datasetType) =>
        !(GA4_DATASET_TYPES as readonly string[]).includes(datasetType),
    )
  ) {
    throw new Error(
      'GA4 datasets must be a non-empty unique supported selection.',
    );
  }

  return datasetTypes.map<JobPlan>((datasetType) => {
    if (datasetType === 'GA4_PAID_FUNNEL') {
      const sourceContext = {
        dataset_type: datasetType,
        start_date: startDate,
        end_date: endDate,
        session_filter: GA4_PAID_FUNNEL_SESSION_FILTER,
      } satisfies GoogleAnalytics4RequestContext;

      return {
        source_id: GOOGLE_ANALYTICS_4_SOURCE_ID,
        job_key: datasetType,
        query_group_id: null,
        source_context: sourceContext,
      };
    }

    const sourceContext = {
      dataset_type: datasetType,
      start_date: startDate,
      end_date: endDate,
    } satisfies GoogleAnalytics4RequestContext;

    return {
      source_id: GOOGLE_ANALYTICS_4_SOURCE_ID,
      job_key: datasetType,
      query_group_id: null,
      source_context: sourceContext,
    };
  });
};
