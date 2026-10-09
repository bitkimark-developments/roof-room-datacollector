import type { GoogleAdsCampaignPerformanceRow } from '../../../shared/google-ads-search-reporting';
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

export const normalizeCampaignPerformanceRows = (
  value: unknown,
  datasetSchemaVersion: 1 | 2 | 3 = 2,
): GoogleAdsCampaignPerformanceRow[] => {
  if (!Array.isArray(value)) {
    throw new Error('Google Ads campaign rows must be an array.');
  }
  return value.map((candidate, index) => {
    const row = requireReportingRecord(candidate, `campaign rows[${String(index)}]`);
    const customer = requireReportingRecord(row.customer, 'customer');
    const campaign = requireReportingRecord(row.campaign, 'campaign');
    const budget = requireReportingRecord(row.campaignBudget, 'campaignBudget');
    const segments = requireReportingRecord(row.segments, 'segments');
    const metrics = optionalReportingRecord(row.metrics, 'metrics');
    return {
      currency_code: requireReportingText(customer.currencyCode, 'customer.currencyCode'),
      time_zone: requireReportingText(customer.timeZone, 'customer.timeZone'),
      campaign_id: requireReportingText(campaign.id, 'campaign.id'),
      campaign_name: requireReportingText(campaign.name, 'campaign.name'),
      campaign_status: requireReportingText(campaign.status, 'campaign.status'),
      campaign_primary_status: requireReportingText(
        campaign.primaryStatus,
        'campaign.primaryStatus',
      ),
      campaign_advertising_channel_type: requireReportingText(
        campaign.advertisingChannelType,
        'campaign.advertisingChannelType',
      ),
      campaign_bidding_strategy_type: requireReportingText(
        campaign.biddingStrategyType,
        'campaign.biddingStrategyType',
      ),
      campaign_budget_id: requireReportingText(budget.id, 'campaignBudget.id'),
      campaign_budget_amount_micros: reportingNumberOrNull(
        budget.amountMicros,
        'campaignBudget.amountMicros',
      ),
      campaign_budget_period: requireReportingText(budget.period, 'campaignBudget.period'),
      campaign_budget_explicitly_shared: requireReportingBoolean(
        budget.explicitlyShared,
        'campaignBudget.explicitlyShared',
      ),
      performance_date: requirePerformanceDate(segments.date),
      ...normalizeCommonPerformanceMetrics(metrics),
      ...(datasetSchemaVersion === 3 ? normalizeConversionDateMetrics(metrics) : {}),
      ...normalizeConversionEfficiencyMetrics(metrics),
      ...normalizeSearchShareMetrics(metrics),
    };
  });
};
