export const GSC_QUERY_PAGE_SOURCE_ID = 'google-search-console-query-page';
export const GSC_QUERY_SOURCE_ID = 'google-search-console-query';
export const GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID = 'google-ads-search-terms';
export const GOOGLE_KEYWORD_PLANNER_SOURCE_ID = 'google-keyword-planner';
export const GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID = 'google-keyword-planner-csv';

export interface GscQueryRow { query: string; clicks: number | null; impressions: number | null; ctr: number | null; position: number | null; }
export interface GscQueryPageRow { query: string; page: string; clicks: number | null; impressions: number | null; ctr: number | null; position: number | null; }
export interface AdsSearchTermRow { search_term: string; keyword: string | null; match_type: string | null; campaign: string | null; ad_group: string | null; impressions: number | null; clicks: number | null; ctr: number | null; average_cpc: number | null; cost: number | null; conversions: number | null; conversion_value: number | null; }
export interface KeywordPlannerRow { requested_keyword: string; returned_keyword: string | null; close_variants?: string[]; matched_requested_keywords?: string[]; group_id: string; avg_monthly_searches: number | null; competition: string | null; competition_index: number | null; top_of_page_bid_low: number | null; top_of_page_bid_high: number | null; change_3_month: number | null; change_yoy: number | null; monthly_history: Array<{ year: number; month: number; searches: number | null }>; }
