import type { GoogleAdsKeywordPerformanceRow } from '../../../shared/google-ads-search-reporting';
import {
  normalizeCommonPerformanceMetrics,
  normalizeConversionDateMetrics,
  normalizeConversionEfficiencyMetrics,
  normalizeSearchShareMetrics,
  optionalReportingRecord,
  reportingNumberOrNull,
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

export const normalizeKeywordPerformanceRows = (
  value: unknown,
  datasetSchemaVersion: 1 | 2 | 3 = 2,
): GoogleAdsKeywordPerformanceRow[] => {
  if (!Array.isArray(value)) {
    throw new Error('Google Ads keyword rows must be an array.');
  }
  return value.map((candidate, index) => {
    const row = requireReportingRecord(candidate, `keyword rows[${String(index)}]`);
    const campaign = requireReportingRecord(row.campaign, 'campaign');
    const adGroup = requireReportingRecord(row.adGroup, 'adGroup');
    const criterion = requireReportingRecord(row.adGroupCriterion, 'adGroupCriterion');
    const keyword = requireReportingRecord(criterion.keyword, 'adGroupCriterion.keyword');
    const qualityInfo = optionalReportingRecord(
      criterion.qualityInfo,
      'adGroupCriterion.qualityInfo',
    );
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
      criterion_id: requireReportingText(criterion.criterionId, 'adGroupCriterion.criterionId'),
      keyword_text: requireReportingText(keyword.text, 'adGroupCriterion.keyword.text'),
      keyword_match_type: requireReportingText(
        keyword.matchType,
        'adGroupCriterion.keyword.matchType',
      ),
      criterion_status: requireReportingText(criterion.status, 'adGroupCriterion.status'),
      criterion_primary_status: requireReportingText(
        criterion.primaryStatus,
        'adGroupCriterion.primaryStatus',
      ),
      system_serving_status: requireReportingText(
        criterion.systemServingStatus,
        'adGroupCriterion.systemServingStatus',
      ),
      negative: requireReportingBoolean(criterion.negative, 'adGroupCriterion.negative'),
      cpc_bid_micros: reportingNumberOrNull(
        criterion.cpcBidMicros,
        'adGroupCriterion.cpcBidMicros',
      ),
      effective_cpc_bid_micros: reportingNumberOrNull(
        criterion.effectiveCpcBidMicros,
        'adGroupCriterion.effectiveCpcBidMicros',
      ),
      quality_score: reportingNumberOrNull(
        qualityInfo.qualityScore,
        'adGroupCriterion.qualityInfo.qualityScore',
      ),
      creative_quality_score: reportingTextOrNull(
        qualityInfo.creativeQualityScore,
        'adGroupCriterion.qualityInfo.creativeQualityScore',
      ),
      post_click_quality_score: reportingTextOrNull(
        qualityInfo.postClickQualityScore,
        'adGroupCriterion.qualityInfo.postClickQualityScore',
      ),
      search_predicted_ctr: reportingTextOrNull(
        qualityInfo.searchPredictedCtr,
        'adGroupCriterion.qualityInfo.searchPredictedCtr',
      ),
      search_exact_match_impression_share: reportingNumberOrNull(
        metrics.searchExactMatchImpressionShare,
        'metrics.searchExactMatchImpressionShare',
      ),
      performance_date: requirePerformanceDate(segments.date),
      ...normalizeCommonPerformanceMetrics(metrics),
      ...(datasetSchemaVersion === 3 ? normalizeConversionDateMetrics(metrics) : {}),
      ...normalizeConversionEfficiencyMetrics(metrics),
      ...normalizeSearchShareMetrics(metrics),
    };
  });
};
