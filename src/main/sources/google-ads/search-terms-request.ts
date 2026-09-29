import type { DesktopResolvedDateRange } from '../../../shared/desktop-run-resolution';
import { GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID } from '../../../shared/google-api';
import type { JsonObject } from '../../../shared/run-job';
import type { SourceCollectionContext } from '../../../shared/collection';
import type { GoogleAdsSearchReportingJobContext } from '../../../shared/google-ads-search-reporting';
import type { GoogleAdsSearchReportingDatasetDescriptor } from './search-reporting-source';

const SEARCH_TERM_FIELDS = [
  'search_term_view.search_term',
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'segments.keyword.ad_group_criterion',
  'segments.keyword.info.text',
  'segments.keyword.info.match_type',
  'segments.search_term_match_type',
  'segments.search_term_targeting_status',
  'segments.date',
  'metrics.impressions',
  'metrics.clicks',
  'metrics.ctr',
  'metrics.average_cpc',
  'metrics.cost_micros',
  'metrics.conversions',
  'metrics.conversions_value',
  'metrics.all_conversions',
  'metrics.all_conversions_value',
  'metrics.top_impression_percentage',
  'metrics.absolute_top_impression_percentage',
] as const;

// This source owns the supported resource/campaign contract; Core only carries it.
export const createSearchTermsJobContext = (range: DesktopResolvedDateRange): JsonObject => ({
  task_id: GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
  source_id: GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
  source_mode: 'search_term_view',
  campaign_type: 'SEARCH',
  ...range,
});

const requireDate = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error('Ads Search Terms requires absolute calendar dates.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Ads Search Terms requires valid calendar dates.');
  }
  return value;
};

export const buildSearchTermsQuery = (context: SourceCollectionContext): string => {
  const request = context.source_context;
  if (context.source_id !== GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID
    || request?.source_id !== GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID
    || request.task_id !== GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID
    || request.source_mode !== 'search_term_view'
    || request.campaign_type !== 'SEARCH') {
    throw new Error('Ads Search Terms supports only the reviewed SEARCH search_term_view contract.');
  }
  const start = requireDate(request.requested_date_start);
  const end = requireDate(request.requested_date_end);
  if (start > end) throw new Error('Ads Search Terms date range is reversed.');

  return buildSearchTermQueryForDates(start, end);
};

const buildSearchTermQueryForDates = (start: string, end: string): string => (
  [
    `SELECT ${SEARCH_TERM_FIELDS.join(', ')}`,
    'FROM search_term_view',
    "WHERE campaign.advertising_channel_type = 'SEARCH'",
    `AND segments.date BETWEEN '${start}' AND '${end}'`,
  ].join(' ')
);

export const buildSearchTermPerformanceQuery = (
  context: GoogleAdsSearchReportingJobContext,
): string => {
  if (
    context.dataset_type !== 'SEARCH_TERMS'
    || context.resource_mode !== 'search_term_view'
    || context.campaign_type !== 'SEARCH'
  ) {
    throw new Error('Search Term reporting requires the SEARCH search_term_view dataset contract.');
  }
  return buildSearchTermQueryForDates(
    context.requested_date_start,
    context.requested_date_end,
  );
};

export const SEARCH_TERMS_DESCRIPTOR: GoogleAdsSearchReportingDatasetDescriptor = {
  dataset_type: 'SEARCH_TERMS',
  resource_mode: 'search_term_view',
  buildQuery: buildSearchTermPerformanceQuery,
};
