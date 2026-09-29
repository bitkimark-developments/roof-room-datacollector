import type {
  AdsSearchTermRow,
  GoogleAdsSearchTermPerformanceRow,
} from '../../../shared/google-api';
import {
  requireApiObject,
  requireArray,
  requireNumberOrNull,
  type ApiRequester,
} from '../google-api/api-helpers';
import {
  normalizeCommonPerformanceMetrics,
  optionalReportingRecord,
  reportingNumberOrNull,
  requirePerformanceDate,
  requireReportingRecord,
  requireReportingText,
} from './reporting-row-helpers';
import { flattenGoogleAdsSearchStream } from './search-stream-response';

const reportingTextOrNull = (value: unknown, field: string): string | null => (
  value === null || value === undefined
    ? null
    : requireReportingText(value, field)
);

export const normalizeSearchTermPerformanceRows = (
  value: unknown,
): GoogleAdsSearchTermPerformanceRow[] => {
  if (!Array.isArray(value)) {
    throw new Error('Google Ads search term rows must be an array.');
  }
  return value.map((candidate, index) => {
    const row = requireReportingRecord(candidate, `search term rows[${String(index)}]`);
    const searchTermView = requireReportingRecord(row.searchTermView, 'searchTermView');
    const campaign = requireReportingRecord(row.campaign, 'campaign');
    const adGroup = requireReportingRecord(row.adGroup, 'adGroup');
    const segments = requireReportingRecord(row.segments, 'segments');
    const keyword = optionalReportingRecord(segments.keyword, 'segments.keyword');
    const keywordInfo = optionalReportingRecord(keyword.info, 'segments.keyword.info');
    const metrics = optionalReportingRecord(row.metrics, 'metrics');
    return {
      search_term: requireReportingText(searchTermView.searchTerm, 'searchTermView.searchTerm'),
      campaign_id: requireReportingText(campaign.id, 'campaign.id'),
      campaign_name: requireReportingText(campaign.name, 'campaign.name'),
      campaign_advertising_channel_type: requireReportingText(
        campaign.advertisingChannelType,
        'campaign.advertisingChannelType',
      ),
      ad_group_id: requireReportingText(adGroup.id, 'adGroup.id'),
      ad_group_name: requireReportingText(adGroup.name, 'adGroup.name'),
      keyword_resource_name: reportingTextOrNull(
        keyword.adGroupCriterion,
        'segments.keyword.adGroupCriterion',
      ),
      keyword_text: reportingTextOrNull(keywordInfo.text, 'segments.keyword.info.text'),
      keyword_match_type: reportingTextOrNull(
        keywordInfo.matchType,
        'segments.keyword.info.matchType',
      ),
      search_term_match_type: requireReportingText(
        segments.searchTermMatchType,
        'segments.searchTermMatchType',
      ),
      search_term_targeting_status: requireReportingText(
        segments.searchTermTargetingStatus,
        'segments.searchTermTargetingStatus',
      ),
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

const normalizeLegacySearchTerms = (body: unknown[]): AdsSearchTermRow[] => (
  body.map((entry, index) => {
    const row = requireApiObject(entry, `Search Terms rows[${index}]`);
    const averageCpcMicros = requireNumberOrNull(
      row.average_cpc_micros,
      'average_cpc_micros',
    );
    const costMicros = requireNumberOrNull(row.cost_micros, 'cost_micros');
    return {
      search_term: String(row.search_term ?? ''),
      keyword: row.keyword == null ? null : String(row.keyword),
      match_type: row.match_type == null ? null : String(row.match_type),
      campaign: row.campaign == null ? null : String(row.campaign),
      ad_group: row.ad_group == null ? null : String(row.ad_group),
      impressions: requireNumberOrNull(row.impressions, 'impressions'),
      clicks: requireNumberOrNull(row.clicks, 'clicks'),
      ctr: requireNumberOrNull(row.ctr, 'ctr'),
      average_cpc: averageCpcMicros === null ? null : averageCpcMicros / 1_000_000,
      cost: costMicros === null ? null : costMicros / 1_000_000,
      conversions: requireNumberOrNull(row.conversions, 'conversions'),
      conversion_value: requireNumberOrNull(row.conversion_value, 'conversion_value'),
    };
  })
);

export const normalizeSearchTerms = (body: unknown): AdsSearchTermRow[] => {
  const topLevel = requireArray(body, 'Search Terms response');
  if (topLevel.length === 0) return [];
  const first = requireApiObject(topLevel[0], 'Search Terms response[0]');
  if (Object.hasOwn(first, 'search_term')) {
    return normalizeLegacySearchTerms(topLevel);
  }
  return normalizeSearchTermPerformanceRows(flattenGoogleAdsSearchStream(topLevel)).map((row) => ({
    search_term: row.search_term,
    keyword: row.keyword_text,
    match_type: row.search_term_match_type,
    campaign: row.campaign_name,
    ad_group: row.ad_group_name,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    average_cpc: row.average_cpc_micros === null
      ? null
      : row.average_cpc_micros / 1_000_000,
    cost: row.cost_micros === null ? null : row.cost_micros / 1_000_000,
    conversions: row.conversions,
    conversion_value: row.conversions_value,
  }));
};

export const fetchSearchTerms = async (
  request: { customer_id: string; query: string },
  requester: ApiRequester,
): Promise<{ raw: unknown; rows: AdsSearchTermRow[] }> => {
  const response = await requester({
    url: `https://googleads.googleapis.com/v25/customers/${request.customer_id}/googleAds:searchStream`,
    method: 'POST',
    body: { query: request.query },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Google Ads provider error HTTP ${response.status}.`);
  }
  return { raw: response.body, rows: normalizeSearchTerms(response.body) };
};
