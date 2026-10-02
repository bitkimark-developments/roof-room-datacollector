import type {
  GoogleAdsConfigurationDatasetType,
  GoogleAdsConfigurationNormalizedRow,
} from '../../../shared/google-ads-configuration';
import {
  normalizeGoogleAdsConfigurationRows as normalizeGoogleAdsNegativeConfigurationRows,
} from './negatives-adapter';
import {
  normalizeGoogleAdsConversionConfigurationRows,
} from './conversion-configuration-adapter';
import {
  normalizeGoogleAdsCampaignSettingsRows,
  type GoogleAdsCampaignSettingsNormalizationOptions,
} from './campaign-settings-adapter';

export const normalizeGoogleAdsConfigurationRows = (
  datasetType: GoogleAdsConfigurationDatasetType,
  rows: Record<string, unknown>[],
  options: GoogleAdsCampaignSettingsNormalizationOptions = {},
): GoogleAdsConfigurationNormalizedRow[] => {
  switch (datasetType) {
    case 'CAMPAIGN_NEGATIVE_KEYWORDS':
    case 'AD_GROUP_NEGATIVE_KEYWORDS':
    case 'SHARED_NEGATIVE_KEYWORDS':
    case 'CAMPAIGN_NEGATIVE_KEYWORD_LISTS':
    case 'ACCOUNT_NEGATIVE_KEYWORD_LISTS':
      return normalizeGoogleAdsNegativeConfigurationRows(datasetType, rows);

    case 'CONVERSION_ACTIONS':
    case 'CUSTOMER_CONVERSION_GOALS':
    case 'CONVERSION_GOAL_CAMPAIGN_CONFIGS':
    case 'CAMPAIGN_CONVERSION_GOALS':
    case 'CUSTOM_CONVERSION_GOALS':
    case 'CUSTOMER_CONVERSION_TRACKING_SETTINGS':
      return normalizeGoogleAdsConversionConfigurationRows(datasetType, rows);

    case 'CAMPAIGN_SETTINGS':
    case 'CAMPAIGN_BUDGETS':
    case 'CAMPAIGN_TARGETING_CRITERIA':
      return normalizeGoogleAdsCampaignSettingsRows(
        datasetType,
        rows,
        options,
      );

    default:
      throw new Error(
        `Unsupported Google Ads configuration dataset: ${String(datasetType)}.`,
      );
  }
};
