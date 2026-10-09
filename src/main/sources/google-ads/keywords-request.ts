import type { GoogleAdsSearchReportingJobContext } from '../../../shared/google-ads-search-reporting';
import type { GoogleAdsSearchReportingDatasetDescriptor } from './search-reporting-source';

const KEYWORD_FIELDS = [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'ad_group_criterion.criterion_id',
  'ad_group_criterion.keyword.text',
  'ad_group_criterion.keyword.match_type',
  'ad_group_criterion.status',
  'ad_group_criterion.primary_status',
  'ad_group_criterion.system_serving_status',
  'ad_group_criterion.negative',
  'ad_group_criterion.cpc_bid_micros',
  'ad_group_criterion.effective_cpc_bid_micros',
  'ad_group_criterion.quality_info.quality_score',
  'ad_group_criterion.quality_info.creative_quality_score',
  'ad_group_criterion.quality_info.post_click_quality_score',
  'ad_group_criterion.quality_info.search_predicted_ctr',
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
  'metrics.search_exact_match_impression_share',
  'metrics.search_budget_lost_impression_share',
  'metrics.search_rank_lost_impression_share',
  'metrics.search_click_share',
  'metrics.search_top_impression_share',
  'metrics.search_absolute_top_impression_share',
  'metrics.top_impression_percentage',
  'metrics.absolute_top_impression_percentage',
] as const;

export const buildKeywordPerformanceQuery = (
  context: GoogleAdsSearchReportingJobContext,
): string => {
  if (
    context.dataset_type !== 'KEYWORD_PERFORMANCE'
    || context.resource_mode !== 'keyword_view'
    || context.campaign_type !== 'SEARCH'
  ) {
    throw new Error('Keyword reporting requires the SEARCH keyword_view dataset contract.');
  }
  return [
    `SELECT ${[...KEYWORD_FIELDS, ...(context.dataset_schema_version === 3 ? [
      'metrics.conversions_by_conversion_date',
      'metrics.conversions_value_by_conversion_date',
      'metrics.all_conversions_by_conversion_date',
      'metrics.all_conversions_value_by_conversion_date',
    ] : [])].join(', ')}`,
    'FROM keyword_view',
    "WHERE campaign.advertising_channel_type = 'SEARCH'",
    `AND segments.date BETWEEN '${context.requested_date_start}' AND '${context.requested_date_end}'`,
  ].join(' ');
};

export const KEYWORD_PERFORMANCE_DESCRIPTOR: GoogleAdsSearchReportingDatasetDescriptor = {
  dataset_type: 'KEYWORD_PERFORMANCE',
  resource_mode: 'keyword_view',
  buildQuery: buildKeywordPerformanceQuery,
};
