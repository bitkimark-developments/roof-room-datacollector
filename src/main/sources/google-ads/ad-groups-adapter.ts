import type { GoogleAdsAdGroupPerformanceRow } from '../../../shared/google-ads-search-reporting';
import {
  normalizeCommonPerformanceMetrics,
  normalizeConversionDateMetrics,
  normalizeConversionEfficiencyMetrics,
  normalizeSearchShareMetrics,
  optionalReportingRecord,
  reportingNumberOrNull,
  requirePerformanceDate,
  requireReportingRecord,
  requireReportingText,
} from './reporting-row-helpers';

export const normalizeAdGroupPerformanceRows = (
  value: unknown,
  datasetSchemaVersion: 1 | 2 | 3 = 2,
): GoogleAdsAdGroupPerformanceRow[] => {
  if (!Array.isArray(value)) {
    throw new Error('Google Ads ad group rows must be an array.');
  }
  return value.map((candidate, index) => {
    const row = requireReportingRecord(candidate, `ad group rows[${String(index)}]`);
    const campaign = requireReportingRecord(row.campaign, 'campaign');
    const adGroup = requireReportingRecord(row.adGroup, 'adGroup');
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
      ad_group_status: requireReportingText(adGroup.status, 'adGroup.status'),
      ad_group_primary_status: requireReportingText(
        adGroup.primaryStatus,
        'adGroup.primaryStatus',
      ),
      ad_group_type: requireReportingText(adGroup.type, 'adGroup.type'),
      cpc_bid_micros: reportingNumberOrNull(adGroup.cpcBidMicros, 'adGroup.cpcBidMicros'),
      effective_cpc_bid_micros: reportingNumberOrNull(
        adGroup.effectiveCpcBidMicros,
        'adGroup.effectiveCpcBidMicros',
      ),
      effective_target_cpa_micros: reportingNumberOrNull(
        adGroup.effectiveTargetCpaMicros,
        'adGroup.effectiveTargetCpaMicros',
      ),
      effective_target_roas: reportingNumberOrNull(
        adGroup.effectiveTargetRoas,
        'adGroup.effectiveTargetRoas',
      ),
      performance_date: requirePerformanceDate(segments.date),
      ...normalizeCommonPerformanceMetrics(metrics),
      ...(datasetSchemaVersion === 3 ? normalizeConversionDateMetrics(metrics) : {}),
      ...normalizeConversionEfficiencyMetrics(metrics),
      ...normalizeSearchShareMetrics(metrics),
    };
  });
};
