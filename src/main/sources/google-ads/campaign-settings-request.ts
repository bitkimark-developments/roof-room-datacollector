import type {
  GoogleAdsConfigurationJobContext,
} from '../../../shared/google-ads-configuration';
import type { ApiRequester } from '../google-api/api-helpers';

export const buildCampaignSettingsQuery = (
  _context: GoogleAdsConfigurationJobContext,
): string => {
  void _context;

  return `SELECT
  campaign.resource_name,
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.advertising_channel_sub_type,
  campaign.start_date_time,
  campaign.end_date_time,
  campaign.campaign_budget,
  campaign.keyword_match_type,
  campaign.bidding_strategy_type,
  campaign.bidding_strategy,
  campaign.manual_cpc.enhanced_cpc_enabled,
  campaign.target_spend.cpc_bid_ceiling_micros,
  campaign.target_spend.target_spend_micros,
  campaign.maximize_conversions.target_cpa_micros,
  campaign.maximize_conversion_value.target_roas,
  campaign.target_cpa.target_cpa_micros,
  campaign.target_roas.target_roas,
  campaign.target_impression_share.location,
  campaign.target_impression_share.location_fraction_micros,
  campaign.target_impression_share.cpc_bid_ceiling_micros,
  campaign.network_settings.target_google_search,
  campaign.network_settings.target_search_network,
  campaign.network_settings.target_content_network,
  campaign.network_settings.target_partner_search_network,
  campaign.geo_target_type_setting.positive_geo_target_type,
  campaign.geo_target_type_setting.negative_geo_target_type,
  campaign.tracking_setting.tracking_url,
  campaign.tracking_url_template,
  campaign.final_url_suffix,
  campaign.ai_max_setting.enable_ai_max,
  campaign.ai_max_setting.bundling_required,
  campaign.asset_automation_settings
FROM campaign
WHERE campaign.advertising_channel_type = 'SEARCH'`;
};

export const buildCampaignBudgetsQuery = (
  _context: GoogleAdsConfigurationJobContext,
): string => {
  void _context;

  return `SELECT
  campaign_budget.resource_name,
  campaign_budget.id,
  campaign_budget.name,
  campaign_budget.status,
  campaign_budget.amount_micros,
  campaign_budget.delivery_method,
  campaign_budget.explicitly_shared,
  campaign_budget.reference_count,
  campaign_budget.total_amount_micros,
  campaign_budget.period,
  campaign_budget.type
FROM campaign_budget`;
};

export const buildCampaignTargetingCriteriaQuery = (
  _context: GoogleAdsConfigurationJobContext,
): string => {
  void _context;

  return `SELECT
  campaign_criterion.resource_name,
  campaign_criterion.campaign,
  campaign_criterion.criterion_id,
  campaign_criterion.type,
  campaign_criterion.negative,
  campaign_criterion.status,
  campaign_criterion.location.geo_target_constant,
  campaign_criterion.language.language_constant,
  language_constant.resource_name,
  language_constant.id,
  language_constant.code,
  language_constant.name,
  language_constant.targetable,
  campaign_criterion.device.type,
  campaign_criterion.ad_schedule.day_of_week,
  campaign_criterion.ad_schedule.start_hour,
  campaign_criterion.ad_schedule.start_minute,
  campaign_criterion.ad_schedule.end_hour,
  campaign_criterion.ad_schedule.end_minute,
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type
FROM campaign_criterion
WHERE campaign.advertising_channel_type = 'SEARCH'
  AND campaign_criterion.type IN (
    'LOCATION',
    'LANGUAGE',
    'DEVICE',
    'AD_SCHEDULE'
  )`;
};

export const requestGoogleAdsGeoTargetConstantsRaw = async (
  input: { resource_names: readonly string[] },
  requester: ApiRequester,
): Promise<{ body: unknown; raw_bytes: Uint8Array }> => {
  if (input.resource_names.length === 0) {
    throw new Error(
      'Google Ads geo target resolver requires at least one resource name.',
    );
  }

  if (
    input.resource_names.some(
      (resourceName) => !/^geoTargetConstants\/\d+$/u.test(resourceName),
    )
  ) {
    throw new Error(
      'Google Ads geo target resolver requires geoTargetConstants resource names.',
    );
  }

  const response = await requester({
    url: 'https://googleads.googleapis.com/v25/geoTargetConstants:suggest',
    method: 'POST',
    body: {
      geoTargets: {
        geoTargetConstants: [...input.resource_names],
      },
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Google Ads geo target resolver provider error HTTP ${response.status}.`,
    );
  }

  if (!response.raw_body) {
    throw new Error(
      'Google Ads geo target resolver requires exact provider raw response bytes.',
    );
  }

  return {
    body: response.body,
    raw_bytes: response.raw_body,
  };
};
