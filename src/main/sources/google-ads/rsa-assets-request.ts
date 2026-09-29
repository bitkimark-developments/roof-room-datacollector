import type { GoogleAdsSearchReportingJobContext } from '../../../shared/google-ads-search-reporting';
import type { GoogleAdsSearchReportingDatasetDescriptor } from './search-reporting-source';

const RSA_ASSET_FIELDS = [
  'campaign.id',
  'campaign.name',
  'campaign.advertising_channel_type',
  'ad_group.id',
  'ad_group.name',
  'ad_group_ad.ad.id',
  'ad_group_ad.ad.type',
  'ad_group_ad_asset_view.resource_name',
  'ad_group_ad_asset_view.field_type',
  'ad_group_ad_asset_view.performance_label',
  'ad_group_ad_asset_view.pinned_field',
  'ad_group_ad_asset_view.enabled',
  'ad_group_ad_asset_view.source',
  'ad_group_ad_asset_view.asset',
  'asset.resource_name',
  'asset.id',
  'asset.name',
  'asset.text_asset.text',
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
] as const;

export const buildRsaAssetPerformanceQuery = (
  context: GoogleAdsSearchReportingJobContext,
): string => {
  if (
    context.dataset_type !== 'RSA_ASSET_PERFORMANCE'
    || context.resource_mode !== 'ad_group_ad_asset_view'
    || context.campaign_type !== 'SEARCH'
  ) {
    throw new Error(
      'RSA asset reporting requires the SEARCH ad_group_ad_asset_view dataset contract.',
    );
  }
  return [
    `SELECT ${RSA_ASSET_FIELDS.join(', ')}`,
    'FROM ad_group_ad_asset_view',
    "WHERE campaign.advertising_channel_type = 'SEARCH'",
    "AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'",
    `AND segments.date BETWEEN '${context.requested_date_start}' AND '${context.requested_date_end}'`,
  ].join(' ');
};

export const RSA_ASSET_PERFORMANCE_DESCRIPTOR: GoogleAdsSearchReportingDatasetDescriptor = {
  dataset_type: 'RSA_ASSET_PERFORMANCE',
  resource_mode: 'ad_group_ad_asset_view',
  buildQuery: buildRsaAssetPerformanceQuery,
};
