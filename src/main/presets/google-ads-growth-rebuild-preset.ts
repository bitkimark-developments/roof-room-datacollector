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
      dataset_type: 'CHANGE_EVENT',
    },
  },
});
