import type {
  GoogleAdsAdPerformanceRow,
  GoogleAdsResponsiveSearchAdTextAsset,
} from '../../../shared/google-ads-search-reporting';
import {
  normalizeCommonPerformanceMetrics,
  optionalReportingRecord,
  reportingNumberOrNull,
  requirePerformanceDate,
  requireReportingRecord,
  requireReportingText,
} from './reporting-row-helpers';

const reportingTextOrNull = (value: unknown, field: string): string | null => (
  value === null || value === undefined
    ? null
    : requireReportingText(value, field)
);

const requireTextArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Google Ads reporting ${field} must be an array.`);
  }
  return value.map((candidate, index) => (
    requireReportingText(candidate, `${field}[${String(index)}]`)
  ));
};

const requireAdTextAssets = (
  value: unknown,
  field: string,
): GoogleAdsResponsiveSearchAdTextAsset[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Google Ads reporting ${field} must be an array.`);
  }
  return value.map((candidate, index) => {
    const asset = requireReportingRecord(candidate, `${field}[${String(index)}]`);
    return {
      text: requireReportingText(asset.text, `${field}[${String(index)}].text`),
      pinned_field: reportingTextOrNull(
        asset.pinnedField,
        `${field}[${String(index)}].pinnedField`,
      ),
      asset_performance_label: reportingTextOrNull(
        asset.assetPerformanceLabel,
        `${field}[${String(index)}].assetPerformanceLabel`,
      ),
    };
  });
};

export const normalizeAdPerformanceRows = (
  value: unknown,
): GoogleAdsAdPerformanceRow[] => {
  if (!Array.isArray(value)) {
    throw new Error('Google Ads ad rows must be an array.');
  }
  return value.map((candidate, index) => {
    const row = requireReportingRecord(candidate, `ad rows[${String(index)}]`);
    const campaign = requireReportingRecord(row.campaign, 'campaign');
    const adGroup = requireReportingRecord(row.adGroup, 'adGroup');
    const adGroupAd = requireReportingRecord(row.adGroupAd, 'adGroupAd');
    const ad = requireReportingRecord(adGroupAd.ad, 'adGroupAd.ad');
    const rsa = requireReportingRecord(
      ad.responsiveSearchAd,
      'adGroupAd.ad.responsiveSearchAd',
    );
    const policy = requireReportingRecord(adGroupAd.policySummary, 'adGroupAd.policySummary');
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
      ad_group_ad_status: requireReportingText(adGroupAd.status, 'adGroupAd.status'),
      ad_group_ad_primary_status: requireReportingText(
        adGroupAd.primaryStatus,
        'adGroupAd.primaryStatus',
      ),
      ad_strength: requireReportingText(adGroupAd.adStrength, 'adGroupAd.adStrength'),
      policy_approval_status: requireReportingText(
        policy.approvalStatus,
        'adGroupAd.policySummary.approvalStatus',
      ),
      policy_review_status: requireReportingText(
        policy.reviewStatus,
        'adGroupAd.policySummary.reviewStatus',
      ),
      final_urls: requireTextArray(ad.finalUrls, 'adGroupAd.ad.finalUrls'),
      headlines: requireAdTextAssets(
        rsa.headlines,
        'adGroupAd.ad.responsiveSearchAd.headlines',
      ),
      descriptions: requireAdTextAssets(
        rsa.descriptions,
        'adGroupAd.ad.responsiveSearchAd.descriptions',
      ),
      path1: reportingTextOrNull(rsa.path1, 'adGroupAd.ad.responsiveSearchAd.path1'),
      path2: reportingTextOrNull(rsa.path2, 'adGroupAd.ad.responsiveSearchAd.path2'),
      performance_date: requirePerformanceDate(segments.date),
      ...normalizeCommonPerformanceMetrics(metrics),
      top_impression_percentage: reportingNumberOrNull(
        metrics.topImpressionPercentage,
        'metrics.topImpressionPercentage',
      ),
      absolute_top_impression_percentage: reportingNumberOrNull(
        metrics.absoluteTopImpressionPercentage,
        'metrics.absoluteTopImpressionPercentage',
      ),
    };
  });
};
