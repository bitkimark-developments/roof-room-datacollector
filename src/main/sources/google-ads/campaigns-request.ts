import type { GoogleAdsSearchReportingJobContext } from '../../../shared/google-ads-search-reporting';
import type { GoogleAdsSearchReportingDatasetDescriptor } from './search-reporting-source';

const CAMPAIGN_FIELDS = [
  'customer.currency_code',
  'customer.time_zone',
  'campaign.id',
  'campaign.name',
  'campaign.status',
  'campaign.primary_status',
  'campaign.advertising_channel_type',
  'campaign.bidding_strategy_type',
  'campaign_budget.id',
  'campaign_budget.amount_micros',
  'campaign_budget.period',
  'campaign_budget.explicitly_shared',
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
  'metrics.conversions_from_interactions_rate',
  'metrics.cost_per_conversion',
  'metrics.conversions_value_per_cost',
  'metrics.search_impression_share',
  'metrics.search_budget_lost_impression_share',
  'metrics.search_rank_lost_impression_share',
  'metrics.search_click_share',
  'metrics.search_top_impression_share',
  'metrics.search_absolute_top_impression_share',
  'metrics.top_impression_percentage',
  'metrics.absolute_top_impression_percentage',
] as const;

export const buildCampaignPerformanceQuery = (
  context: GoogleAdsSearchReportingJobContext,
): string => {
  if (
    context.dataset_type !== 'CAMPAIGN_PERFORMANCE'
    || context.resource_mode !== 'campaign'
    || context.campaign_type !== 'SEARCH'
  ) {
    throw new Error('Campaign reporting requires the SEARCH campaign dataset contract.');
  }
  return [
    `SELECT ${CAMPAIGN_FIELDS.join(', ')}`,
    'FROM campaign',
    "WHERE campaign.advertising_channel_type = 'SEARCH'",
    `AND segments.date BETWEEN '${context.requested_date_start}' AND '${context.requested_date_end}'`,
  ].join(' ');
};

export const CAMPAIGN_PERFORMANCE_DESCRIPTOR: GoogleAdsSearchReportingDatasetDescriptor = {
  dataset_type: 'CAMPAIGN_PERFORMANCE',
  resource_mode: 'campaign',
  buildQuery: buildCampaignPerformanceQuery,
};
