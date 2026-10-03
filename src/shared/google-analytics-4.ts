export const GOOGLE_ANALYTICS_4_SOURCE_ID =
  'google-analytics-4' as const;

export const GA4_DATASET_TYPES = [
  'GA4_CONTENT_PERFORMANCE',
  'GA4_PAID_FUNNEL',
] as const;

export type GoogleAnalytics4DatasetType =
  (typeof GA4_DATASET_TYPES)[number];

export interface GoogleAnalytics4ConnectionMetadata {
  property_id: string;
}

export const GA4_PAID_FUNNEL_SESSION_FILTER = {
  session_source: 'google',
  session_medium: 'cpc',
} as const;

export type GoogleAnalytics4RequestContext =
  | {
      dataset_type: 'GA4_CONTENT_PERFORMANCE';
      start_date: string;
      end_date: string;
    }
  | {
      dataset_type: 'GA4_PAID_FUNNEL';
      start_date: string;
      end_date: string;
      session_filter: typeof GA4_PAID_FUNNEL_SESSION_FILTER;
    };

export interface GoogleAnalytics4ProviderMetadata {
  currency_code: string | null;
  time_zone: string | null;
}

export interface GoogleAnalytics4ContentPerformanceRow {
  landing_page: string;
  active_users: number | null;
  sessions: number | null;
  engaged_sessions: number | null;
  engagement_rate: number | null;
  key_events: number | null;
  item_view_events: number | null;
  add_to_carts: number | null;
  checkouts: number | null;
  ecommerce_purchases: number | null;
  transactions: number | null;
  purchase_revenue: number | null;
}

export interface GoogleAnalytics4PaidFunnelRow {
  performance_date: string;
  session_source: string;
  session_medium: string;
  session_campaign_id: string;
  session_campaign_name: string;
  landing_page: string;
  device_category: string;
  sessions: number | null;
  engaged_sessions: number | null;
  item_view_events: number | null;
  add_to_carts: number | null;
  checkouts: number | null;
  ecommerce_purchases: number | null;
  transactions: number | null;
  total_purchasers: number | null;
  purchase_revenue: number | null;
}

export interface GoogleAnalytics4RawPage {
  offset: number;
  raw_body_text: string;
}

export interface GoogleAnalytics4RawBundle {
  bundle_schema_version: 1;
  dataset_type: GoogleAnalytics4DatasetType;
  request: {
    property_id: string;
    start_date: string;
    end_date: string;
    limit: 250000;
  };
  pages: GoogleAnalytics4RawPage[];
}
