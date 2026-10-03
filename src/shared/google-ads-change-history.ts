export const GOOGLE_ADS_CHANGE_HISTORY_SOURCE_ID =
  'google-ads-change-history';

export const GOOGLE_ADS_CHANGE_HISTORY_DATASET_TYPES = [
  'CHANGE_HISTORY',
] as const;

export type GoogleAdsChangeHistoryDatasetType =
  (typeof GOOGLE_ADS_CHANGE_HISTORY_DATASET_TYPES)[number];
