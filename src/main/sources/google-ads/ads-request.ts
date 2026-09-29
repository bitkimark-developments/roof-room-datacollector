import type { GoogleAdsSearchReportingJobContext } from '../../../shared/google-ads-search-reporting';
import type { GoogleAdsSearchReportingDatasetDescriptor } from './search-reporting-source';

const AD_FIELDS = [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'ad_group_ad.ad.id',
  'ad_group_ad.ad.type',
  'ad_group_ad.status',
  'ad_group_ad.primary_status',
  'ad_group_ad.ad_strength',
  'ad_group_ad.policy_summary.approval_status',
  'ad_group_ad.policy_summary.review_status',
  'ad_group_ad.ad.final_urls',
  'ad_group_ad.ad.responsive_search_ad.headlines',
  'ad_group_ad.ad.responsive_search_ad.descriptions',
  'ad_group_ad.ad.responsive_search_ad.path1',
  'ad_group_ad.ad.responsive_search_ad.path2',
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

export const buildAdPerformanceQuery = (
  context: GoogleAdsSearchReportingJobContext,
): string => {
  if (
    context.dataset_type !== 'AD_PERFORMANCE'
    || context.resource_mode !== 'ad_group_ad'
    || context.campaign_type !== 'SEARCH'
  ) {
    throw new Error('Ad reporting requires the SEARCH ad_group_ad dataset contract.');
  }
  return [
    `SELECT ${AD_FIELDS.join(', ')}`,
    'FROM ad_group_ad',
    "WHERE campaign.advertising_channel_type = 'SEARCH'",
    "AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'",
    `AND segments.date BETWEEN '${context.requested_date_start}' AND '${context.requested_date_end}'`,
  ].join(' ');
};

export const AD_PERFORMANCE_DESCRIPTOR: GoogleAdsSearchReportingDatasetDescriptor = {
  dataset_type: 'AD_PERFORMANCE',
  resource_mode: 'ad_group_ad',
  buildQuery: buildAdPerformanceQuery,
};
