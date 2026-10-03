import type { ReusableCollectionConfiguration } from '../../shared/collection-configuration';

export const GOOGLE_ADS_GROWTH_REBUILD_PRESET_NAME =
  'Google Ads Growth Rebuild';

export const createGoogleAdsGrowthRebuildPreset =
(): ReusableCollectionConfiguration => ({
  sources: {
    'google-ads-search-reporting': {
      included: true,
      customer_id: null,
      requested_date_start: null,
      requested_date_end: null,
      datasets: [
        'CAMPAIGN_PERFORMANCE',
        'AD_GROUP_PERFORMANCE',
        'KEYWORD_PERFORMANCE',
        'SEARCH_TERMS',
        'AD_PERFORMANCE',
        'RSA_ASSET_PERFORMANCE',
      ],
    },
    'google-ads-change-history': {
      included: true,
      customer_id: null,
      requested_date_start: null,
      requested_date_end: null,
      dataset_type: 'CHANGE_HISTORY',
    },
    'google-ads-configuration': {
      included: true,
      customer_id: null,
      datasets: [
        'CAMPAIGN_NEGATIVE_KEYWORDS',
        'AD_GROUP_NEGATIVE_KEYWORDS',
        'SHARED_NEGATIVE_KEYWORDS',
        'CAMPAIGN_NEGATIVE_KEYWORD_LISTS',
        'ACCOUNT_NEGATIVE_KEYWORD_LISTS',
        'CONVERSION_ACTIONS',
        'CUSTOMER_CONVERSION_GOALS',
        'CONVERSION_GOAL_CAMPAIGN_CONFIGS',
        'CAMPAIGN_CONVERSION_GOALS',
        'CUSTOM_CONVERSION_GOALS',
        'CUSTOMER_CONVERSION_TRACKING_SETTINGS',
        'CAMPAIGN_SETTINGS',
        'CAMPAIGN_BUDGETS',
        'CAMPAIGN_TARGETING_CRITERIA',
      ],
    },
    'google-analytics-4': {
      included: true,
      requested_date_start: null,
      requested_date_end: null,
      datasets: [
        'GA4_PAID_FUNNEL',
      ],
    },
  },
});
