import type {
  GoogleAdsCommonPerformanceMetrics,
  GoogleAdsConversionEfficiencyMetrics,
  GoogleAdsSearchShareMetrics,
} from '../../../shared/google-ads-search-reporting';

export const requireReportingRecord = (
  value: unknown,
  field: string,
): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Google Ads reporting ${field} must be an object.`);
  }
  return value as Record<string, unknown>;
};

export const optionalReportingRecord = (
  value: unknown,
  field: string,
): Record<string, unknown> => (
  value === null || value === undefined
    ? {}
    : requireReportingRecord(value, field)
);

export const requireReportingText = (
  value: unknown,
  field: string,
): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Google Ads reporting ${field} must be a non-empty string.`);
  }
  return value;
};

export const requireReportingBoolean = (
  value: unknown,
  field: string,
): boolean => {
  if (typeof value !== 'boolean') {
    throw new Error(`Google Ads reporting ${field} must be boolean.`);
  }
  return value;
};

export const reportingNumberOrNull = (
  value: unknown,
  field: string,
): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Google Ads reporting ${field} must be numeric or null.`);
};

export const requirePerformanceDate = (
  value: unknown,
  field = 'segments.date',
): string => {
  const date = requireReportingText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new Error(`Google Ads reporting ${field} must be an ISO calendar date.`);
  }
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`Google Ads reporting ${field} must be a valid calendar date.`);
  }
  return date;
};

export const normalizeCommonPerformanceMetrics = (
  metrics: Record<string, unknown>,
): GoogleAdsCommonPerformanceMetrics => ({
  impressions: reportingNumberOrNull(metrics.impressions, 'metrics.impressions'),
  clicks: reportingNumberOrNull(metrics.clicks, 'metrics.clicks'),
  ctr: reportingNumberOrNull(metrics.ctr, 'metrics.ctr'),
  average_cpc_micros: reportingNumberOrNull(metrics.averageCpc, 'metrics.averageCpc'),
  cost_micros: reportingNumberOrNull(metrics.costMicros, 'metrics.costMicros'),
  conversions: reportingNumberOrNull(metrics.conversions, 'metrics.conversions'),
  conversions_value: reportingNumberOrNull(
    metrics.conversionsValue,
    'metrics.conversionsValue',
  ),
  all_conversions: reportingNumberOrNull(
    metrics.allConversions,
    'metrics.allConversions',
  ),
  all_conversions_value: reportingNumberOrNull(
    metrics.allConversionsValue,
    'metrics.allConversionsValue',
  ),
});

export const normalizeConversionEfficiencyMetrics = (
  metrics: Record<string, unknown>,
): GoogleAdsConversionEfficiencyMetrics => ({
  conversions_from_interactions_rate: reportingNumberOrNull(
    metrics.conversionsFromInteractionsRate,
    'metrics.conversionsFromInteractionsRate',
  ),
  cost_per_conversion: reportingNumberOrNull(
    metrics.costPerConversion,
    'metrics.costPerConversion',
  ),
  conversions_value_per_cost: reportingNumberOrNull(
    metrics.conversionsValuePerCost,
    'metrics.conversionsValuePerCost',
  ),
});

export const normalizeSearchShareMetrics = (
  metrics: Record<string, unknown>,
): GoogleAdsSearchShareMetrics => ({
  search_impression_share: reportingNumberOrNull(
    metrics.searchImpressionShare,
    'metrics.searchImpressionShare',
  ),
  search_budget_lost_impression_share: reportingNumberOrNull(
    metrics.searchBudgetLostImpressionShare,
    'metrics.searchBudgetLostImpressionShare',
  ),
  search_rank_lost_impression_share: reportingNumberOrNull(
    metrics.searchRankLostImpressionShare,
    'metrics.searchRankLostImpressionShare',
  ),
  search_click_share: reportingNumberOrNull(
    metrics.searchClickShare,
    'metrics.searchClickShare',
  ),
  search_top_impression_share: reportingNumberOrNull(
    metrics.searchTopImpressionShare,
    'metrics.searchTopImpressionShare',
  ),
  search_absolute_top_impression_share: reportingNumberOrNull(
    metrics.searchAbsoluteTopImpressionShare,
    'metrics.searchAbsoluteTopImpressionShare',
  ),
  top_impression_percentage: reportingNumberOrNull(
    metrics.topImpressionPercentage,
    'metrics.topImpressionPercentage',
  ),
  absolute_top_impression_percentage: reportingNumberOrNull(
    metrics.absoluteTopImpressionPercentage,
    'metrics.absoluteTopImpressionPercentage',
  ),
});
