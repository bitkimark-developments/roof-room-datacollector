export const SERPAPI_SOURCE_ID = 'serpapi';
export const SERPAPI_DATASET_TYPE = 'GOOGLE_SERP';
export const SERPAPI_ACQUISITION_MODE = 'THIRD_PARTY_API';
export const SERPAPI_TIMEOUT_MS = 300_000;

export interface SerpApiRequestContext {
  query: string;
  country_code: 'TR';
  language_code: 'tr';
  device: 'desktop';
  engine: 'google';
  organic_limit: 10;
  snapshot_date: string;
}

export type SerpApiResultType = 'ORGANIC' | 'PAA';

export interface SerpApiNormalizedRow {
  query: string;
  position: number | null;
  title: string | null;
  url: string | null;
  domain: string | null;
  snippet: string | null;
  paa: string | null;
  result_type: SerpApiResultType;
}

export interface SerpApiParsedResponse {
  rows: SerpApiNormalizedRow[];
  organic_count: number;
  paa_count: number;
  observed_context: {
    query: string | null;
    country_code: string | null;
    language_code: string | null;
    device: string | null;
    engine: string | null;
  };
}
