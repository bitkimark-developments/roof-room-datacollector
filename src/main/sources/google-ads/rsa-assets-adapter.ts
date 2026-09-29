import type { GoogleAdsRsaAssetPerformanceRow } from '../../../shared/google-ads-search-reporting';
import {
  normalizeCommonPerformanceMetrics,
  optionalReportingRecord,
  requirePerformanceDate,
  requireReportingBoolean,
  requireReportingRecord,
  requireReportingText,
} from './reporting-row-helpers';

const reportingTextOrNull = (value: unknown, field: string): string | null => (
  value === null || value === undefined
    ? null
    : requireReportingText(value, field)
);

export const normalizeRsaAssetPerformanceRows = (
  value: unknown,
): GoogleAdsRsaAssetPerformanceRow[] => {
  if (!Array.isArray(value)) {
    throw new Error('Google Ads RSA asset rows must be an array.');
  }
  return value.map((candidate, index) => {
    const row = requireReportingRecord(candidate, `RSA asset rows[${String(index)}]`);
    const campaign = requireReportingRecord(row.campaign, 'campaign');
    const adGroup = requireReportingRecord(row.adGroup, 'adGroup');
    const adGroupAd = requireReportingRecord(row.adGroupAd, 'adGroupAd');
    const ad = requireReportingRecord(adGroupAd.ad, 'adGroupAd.ad');
    const view = requireReportingRecord(row.adGroupAdAssetView, 'adGroupAdAssetView');
    const asset = optionalReportingRecord(row.asset, 'asset');
    const textAsset = optionalReportingRecord(asset.textAsset, 'asset.textAsset');
    const segments = requireReportingRecord(row.segments, 'segments');
    const metrics = optionalReportingRecord(row.metrics, 'metrics');
    return {
      campaign_id: requireReportingText(campaign.id, 'campaign.id'),
      campaign_name: requireReportingText(campaign.name, 'campaign.name'),
      campaign_advertising_channel_type: requireReportingText(
        campaign.advertisingChannelType,
        'campaign.advertisingChannelType',
      ),
      ad_group_id: requireReportingText(adGroup.id, 'adGroup.id'),
      ad_group_name: requireReportingText(adGroup.name, 'adGroup.name'),
      ad_id: requireReportingText(ad.id, 'adGroupAd.ad.id'),
      ad_type: requireReportingText(ad.type, 'adGroupAd.ad.type'),
      asset_view_resource_name: requireReportingText(
        view.resourceName,
        'adGroupAdAssetView.resourceName',
      ),
      field_type: requireReportingText(view.fieldType, 'adGroupAdAssetView.fieldType'),
      performance_label: requireReportingText(
        view.performanceLabel,
        'adGroupAdAssetView.performanceLabel',
      ),
      pinned_field: reportingTextOrNull(
        view.pinnedField,
        'adGroupAdAssetView.pinnedField',
      ),
      enabled: requireReportingBoolean(view.enabled, 'adGroupAdAssetView.enabled'),
      source: requireReportingText(view.source, 'adGroupAdAssetView.source'),
      asset_resource_name: reportingTextOrNull(
        asset.resourceName ?? view.asset,
        'asset.resourceName',
      ),
      asset_id: reportingTextOrNull(asset.id, 'asset.id'),
      asset_name: reportingTextOrNull(asset.name, 'asset.name'),
      asset_text: reportingTextOrNull(textAsset.text, 'asset.textAsset.text'),
      performance_date: requirePerformanceDate(segments.date),
      ...normalizeCommonPerformanceMetrics(metrics),
    };
  });
};
