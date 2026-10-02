import type { GoogleAdsSearchReportingJobContext } from '../../../shared/google-ads-search-reporting';
import type { GoogleAdsSearchReportingDatasetDescriptor } from './search-reporting-source';

const AD_GROUP_FIELDS = [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'ad_group.status',
  'ad_group.primary_status',
  'ad_group.type',
  'ad_group.cpc_bid_micros',
  'ad_group.effective_cpc_bid_micros',
  'ad_group.effective_target_cpa_micros',
  'ad_group.effective_target_roas',
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

export const buildAdGroupPerformanceQuery = (
  context: GoogleAdsSearchReportingJobContext,
): string => {
  if (
    context.dataset_type !== 'AD_GROUP_PERFORMANCE'
    || context.resource_mode !== 'ad_group'
    || context.campaign_type !== 'SEARCH'
  ) {
    throw new Error('Ad group reporting requires the SEARCH ad_group dataset contract.');
  }
  return [
    `SELECT ${AD_GROUP_FIELDS.join(', ')}`,
    'FROM ad_group',
    "WHERE campaign.advertising_channel_type = 'SEARCH'",
    `AND segments.date BETWEEN '${context.requested_date_start}' AND '${context.requested_date_end}'`,
  ].join(' ');
};

export const AD_GROUP_PERFORMANCE_DESCRIPTOR: GoogleAdsSearchReportingDatasetDescriptor = {
  dataset_type: 'AD_GROUP_PERFORMANCE',
  resource_mode: 'ad_group',
  buildQuery: buildAdGroupPerformanceQuery,
};
